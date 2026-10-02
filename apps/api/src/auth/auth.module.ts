import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleTokenService } from './google-token.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { MailerService } from '../mail/mailer.service';

/**
 * Authentication + the application-wide auth guard.
 *
 * Registering `JwtAuthGuard` through `APP_GUARD` here makes it global for the
 * whole app — routes opt *out* with `@Public()` rather than each module opting
 * in, so a new controller cannot accidentally ship unauthenticated.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    OtpService,
    MailerService,
    GoogleTokenService,
    JwtAuthGuard,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
