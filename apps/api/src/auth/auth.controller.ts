import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import {
  GOOGLE_STATE_COOKIE,
  clearAuthCookies,
  clearGoogleStateCookie,
  cookieDomainOrUndefined,
  setAuthCookies,
  setGoogleStateCookie,
} from './cookies';
import { GOOGLE_STATE_TTL_SECONDS, GoogleOauthService } from './google-oauth.service';
import { ClientContext, ttlToSeconds } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly refreshTtlSeconds: number;
  private readonly cookieSecure: boolean;
  private readonly cookieDomain?: string;

  constructor(
    private readonly auth: AuthService,
    private readonly googleOauth: GoogleOauthService,
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
  @Get('google')
  @ApiOperation({
    summary: 'Start a Google sign-in (server-side OAuth redirect)',
    description:
      'Redirects the browser to the Google consent screen. The callback ' +
      'exchanges the code, issues the session cookie and redirects back to ' +
      '`redirect` (same-origin path only). Web only — the mobile app posts ' +
      'an ID token to POST /auth/google instead.',
  })
  @ApiResponse({ status: 302, description: 'To Google, or back with ?google=unavailable' })
  async googleStart(
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const dest = this.googleOauth.resolveRedirectTarget(redirect);
    if (!this.googleOauth.configured) {
      res.redirect(this.googleOauth.withGoogleParam(dest, 'unavailable'));
      return;
    }
    const nonce = this.googleOauth.newNonce();
    const state = await this.googleOauth.signState(nonce, dest);
    setGoogleStateCookie(res, nonce, {
      ttlSeconds: GOOGLE_STATE_TTL_SECONDS,
      secure: this.cookieSecure,
    });
    res.redirect(this.googleOauth.buildAuthorizeUrl(state, nonce));
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth callback — issues a session and redirects back',
    description:
      'Validates the signed state against its one-shot cookie, exchanges the ' +
      'code for the Google identity, links the account and sets the session ' +
      'cookie. Failures come back as ?google=denied (user cancelled) or ' +
      '?google=failed instead of a raw error page.',
  })
  @ApiResponse({ status: 302, description: 'Back to the app; ?google=denied|failed on error' })
  async googleCallback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const claims = await this.googleOauth.verifyState(query.state);
    // The destination is only trusted when the signed state verifies; a
    // tampered state always lands on the login page.
    const dest = claims?.dest ?? this.googleOauth.resolveRedirectTarget(undefined);
    clearGoogleStateCookie(res, { secure: this.cookieSecure });

    const cookieNonce = req.cookies?.[GOOGLE_STATE_COOKIE];
    if (!claims || !this.googleOauth.stateNonceMatches(cookieNonce, claims.nonce)) {
      res.redirect(this.googleOauth.withGoogleParam(dest, 'failed'));
      return;
    }
    // Google sends error=access_denied when the user hits "Cancel".
    if (query.error) {
      res.redirect(this.googleOauth.withGoogleParam(dest, 'denied'));
      return;
    }
    if (!query.code) {
      res.redirect(this.googleOauth.withGoogleParam(dest, 'failed'));
      return;
    }
    const identity = await this.googleOauth.exchange(query.code);
    if (!identity) {
      res.redirect(this.googleOauth.withGoogleParam(dest, 'failed'));
      return;
    }

    const result = await this.auth.signInWithGoogleIdentity(identity, contextOf(req));
    this.writeCookies(res, result);
    res.redirect(dest);
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
