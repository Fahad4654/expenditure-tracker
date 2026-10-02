import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { COOKIE_NAMES } from '../shared/config';
import type { AuthSession, EmailOtpChallenge, UserProfile } from '../shared/types';
import {
  forgotPasswordSchema,
  googleSignInSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  sendEmailOtpSchema,
  type GoogleSignInInputDto,
  type LoginInputDto,
  type RegisterInputDto,
  type ResetPasswordInputDto,
  type SendEmailOtpInputDto,
} from '../shared/validation';
import type { Request, Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CookieCsrfGuard } from '../common/guards/cookie-csrf.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService, AuthResult } from './auth.service';
import { clearAuthCookies, cookieDomainOrUndefined, setAuthCookies } from './cookies';
import { ClientContext, ttlToSeconds } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly refreshTtlSeconds: number;
  private readonly cookieSecure: boolean;
  private readonly cookieDomain?: string;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.refreshTtlSeconds = ttlToSeconds(config.get<string>('auth.refreshTtl') ?? '30d');
    this.cookieSecure = config.get<boolean>('auth.cookieSecure') ?? false;
    this.cookieDomain = cookieDomainOrUndefined(config.get<string>('auth.cookieDomain'));
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiOkResponse({ description: 'Session issued' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInputDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const result = await this.auth.register(body, contextOf(req));
    this.writeCookies(res, result);
    return result.session;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({ description: 'Session issued' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInputDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const result = await this.auth.login(body, contextOf(req));
    this.writeCookies(res, result);
    return result.session;
  }

  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a 6-digit email OTP (registration or password reset)',
    description:
      'Delivers the code by email. With `MAIL_SEND=false` outside production ' +
      'the response carries `devCode` so dev/test flows can complete.',
  })
  @ApiOkResponse({ description: 'Challenge issued (expires in 10 minutes)' })
  sendOtp(
    @Body(new ZodValidationPipe(sendEmailOtpSchema)) body: SendEmailOtpInputDto,
  ): Promise<EmailOtpChallenge> {
    return this.auth.sendEmailOtp(body);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start password reset — emails an OTP to the account' })
  @ApiOkResponse({ description: 'Challenge issued (same shape even for unknown emails)' })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string },
  ): Promise<EmailOtpChallenge> {
    return this.auth.forgotPassword(body);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consume the reset OTP, set a new password, start a session',
    description: 'Revokes every existing refresh token before issuing the new one.',
  })
  @ApiOkResponse({ description: 'Session issued' })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInputDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const result = await this.auth.resetPassword(body, contextOf(req));
    this.writeCookies(res, result);
    return result.session;
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with Google (Firebase ID token)',
    description:
      'Verifies the Firebase Authentication ID token, links the local account ' +
      'by email, and issues the usual session.',
  })
  @ApiOkResponse({ description: 'Session issued' })
  async google(
    @Body(new ZodValidationPipe(googleSignInSchema)) body: GoogleSignInInputDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const result = await this.auth.googleSignIn(body, contextOf(req));
    this.writeCookies(res, result);
    return result.session;
  }

  @Public()
  @UseGuards(CookieCsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token and mint a new access token',
    description:
      'Accepts the refresh token from the HTTP-only cookie (browser) or the ' +
      '`refreshToken` body field (mobile). Cookie-authenticated calls must also ' +
      'send `X-CSRF-Token`. Reusing a rotated token revokes the whole family.',
  })
  @ApiOkResponse({ description: 'Session issued' })
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSession> {
    const cookieToken = req.cookies?.[COOKIE_NAMES.refreshToken] as string | undefined;
    const result = await this.auth.refresh(body.refreshToken ?? cookieToken, contextOf(req));
    this.writeCookies(res, result);
    return result.session;
  }

  @Public()
  @UseGuards(CookieCsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the refresh token family and clear cookies' })
  @ApiOkResponse({ description: 'Always succeeds' })
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<null> {
    const cookieToken = req.cookies?.[COOKIE_NAMES.refreshToken] as string | undefined;
    const result = await this.auth.logout(body.refreshToken ?? cookieToken);
    clearAuthCookies(res, { secure: this.cookieSecure, domain: this.cookieDomain });
    return result;
  }

  @Get('me')
  @ApiOperation({ summary: 'Profile for the authenticated user' })
  @ApiOkResponse({ type: Object, description: 'User profile' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.auth.me(user.sub);
  }

  private writeCookies(res: Response, result: AuthResult): void {
    setAuthCookies(res, result.session.refreshToken, result.csrfToken, {
      refreshTtlSeconds: this.refreshTtlSeconds,
      secure: this.cookieSecure,
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    });
  }
}

function contextOf(req: Request): ClientContext {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip ?? null,
  };
}
