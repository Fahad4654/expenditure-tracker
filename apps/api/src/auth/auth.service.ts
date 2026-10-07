import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSession, EmailOtpChallenge, UserProfile } from '../shared/types';
import type {
  GoogleSignInInputDto,
  LoginInputDto,
  RegisterInputDto,
  ResetPasswordInputDto,
} from '../shared/validation';
import { errors } from '../common/http/api-error';
import { PrismaService } from '../prisma/prisma.module';
import { toUserProfile } from '../users/user.mapper';
import { newCsrfToken } from './cookies';
import { GoogleTokenService } from './google-token.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { ClientContext, TokenService } from './token.service';

export interface AuthResult {
  session: AuthSession;
  /** Fresh double-submit token; the controller writes it to a cookie. */
  csrfToken: string;
}

/**
 * Email + password authentication.
 *
 * The contract lives in `docs/authentication.md`. The two rules that matter
 * most: a failed login looks identical whether the email or the password was
 * wrong, and a replayed refresh token burns the whole token family.
 */
@Injectable()
export class AuthService {
  private readonly maxFailedAttempts: number;
  private readonly lockoutSeconds: number;
  private readonly defaultCurrency: string;
  private readonly defaultTimezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly otps: OtpService,
    private readonly googleTokens: GoogleTokenService,
    config: ConfigService,
  ) {
    this.maxFailedAttempts = config.get<number>('auth.login.maxFailedAttempts') ?? 10;
    this.lockoutSeconds = config.get<number>('auth.login.lockoutSeconds') ?? 900;
    this.defaultCurrency = config.get<string>('finance.defaultCurrency') ?? 'BDT';
    this.defaultTimezone = config.get<string>('finance.defaultTimezone') ?? 'Asia/Dhaka';
  }

  async register(input: RegisterInputDto, context: ClientContext): Promise<AuthResult> {
    // Hash first: the expensive step runs on every request, so a taken email
    // and a free one take comparable time and timing cannot disclose existence.
    const passwordHash = await this.passwords.hash(input.password);

    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw errors.conflict('An account with this email already exists');

    // The 6-digit code (purpose REGISTER) is consumed atomically with the
    // insert — a failed registration never burns the code.
    const user = await this.prisma.$transaction(async (tx) => {
      await this.otps.consumeEmailOtp(tx, input.email, 'REGISTER', input.code);
      return tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          emailVerified: true,
          defaultCurrency: this.defaultCurrency,
          timezone: this.defaultTimezone,
        },
      });
    });

    return this.issueSession(user.id, context, toUserProfile(user));
  }

  /** Sends (or re-sends) the 6-digit email OTP for registration/reset. */
  async sendEmailOtp(input: {
    email: string;
    purpose: 'REGISTER' | 'PASSWORD_RESET';
  }): Promise<EmailOtpChallenge> {
    return this.otps.sendEmailOtp(input.email, input.purpose);
  }

  /**
   * Starts password reset. Always answers with the same challenge shape, so
   * probing for an account is impossible; only a real account gets a code.
   */
  async forgotPassword(input: { email: string }): Promise<EmailOtpChallenge> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      return {
        email: input.email,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        resendAfterSeconds: 60,
      };
    }
    return this.otps.sendEmailOtp(input.email, 'PASSWORD_RESET');
  }

  /** Consumes the reset OTP, sets the new password and starts a fresh session. */
  async resetPassword(input: ResetPasswordInputDto, context: ClientContext): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const found = await tx.user.findFirst({
        where: { email: input.email, deletedAt: null },
      });
      if (!found) throw errors.otpInvalid();
      await this.otps.consumeEmailOtp(tx, input.email, 'PASSWORD_RESET', input.code);
      return tx.user.update({
        where: { id: found.id },
        data: { passwordHash, failedLogins: 0, lockedUntil: null },
      });
    });

    // A password change invalidates every existing session on every device.
    await this.tokens.revokeAllFamiliesForUser(user.id);
    return this.issueSession(user.id, context, toUserProfile(user));
  }

  /**
   * Google sign-in: verifies the Firebase ID token, then links (or creates)
   * the local account. An existing email + password account simply gains the
   * `googleId` — no duplicate row.
   */
  async googleSignIn(input: GoogleSignInInputDto, context: ClientContext): Promise<AuthResult> {
    const identity = await this.googleTokens.verify(input.idToken);

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: identity.sub }, { email: identity.email }], deletedAt: null },
    });

    if (user && user.googleId === identity.sub) {
      // Returning Google user — refresh profile bits that may have changed.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(identity.picture ? { avatarUrl: identity.picture } : {}),
          ...(identity.name ? { name: identity.name } : {}),
          emailVerified: user.emailVerified || identity.emailVerified,
        },
      });
    } else if (user) {
      // Email/password account linking its first Google identity.
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: identity.sub, emailVerified: true },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          name: identity.name ?? identity.email.split('@')[0] ?? 'User',
          email: identity.email,
          googleId: identity.sub,
          avatarUrl: identity.picture,
          emailVerified: identity.emailVerified,
          defaultCurrency: this.defaultCurrency,
          timezone: this.defaultTimezone,
        },
      });
    }

    return this.issueSession(user.id, context, toUserProfile(user));
  }

  async login(input: LoginInputDto, context: ClientContext): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    // Always verify something so a missing account and a wrong password cost
    // the same amount of time.
    const passwordOk = user?.passwordHash
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);

    if (!user || user.deletedAt) throw errors.invalidCredentials();

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw errors.accountLocked('Too many failed sign-in attempts. Try again later.');
    }

    if (!passwordOk || !user.passwordHash) {
      const failedLogins = user.failedLogins + 1;
      const shouldLock = failedLogins >= this.maxFailedAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: shouldLock ? 0 : failedLogins,
          lockedUntil: shouldLock
            ? new Date(Date.now() + this.lockoutSeconds * 1000)
            : user.lockedUntil,
        },
      });
      throw errors.invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issueSession(user.id, context, toUserProfile(user));
  }

  /**
   * Rotates the refresh token and mints a new access token.
   *
   * Reuse of an already-rotated token is the signal that it leaked: every
   * token in the family is revoked and the caller must sign in again.
   */
  async refresh(rawToken: string | undefined, context: ClientContext): Promise<AuthResult> {
    if (!rawToken) throw errors.refreshInvalid('Refresh token missing');

    const payload = await this.tokens.verifyRefreshToken(rawToken).catch(() => null);
    if (!payload) throw errors.refreshInvalid();

    const row = await this.tokens.findRefreshRow(rawToken);
    if (!row) throw errors.refreshInvalid();

    if (row.revokedAt) {
      await this.tokens.revokeFamily(row.familyId);
      throw errors.refreshInvalid('Refresh token reuse detected — all sessions revoked');
    }
    if (row.expiresAt.getTime() <= Date.now()) throw errors.refreshInvalid();
    if (row.rotationIndex !== payload.rot) {
      await this.tokens.revokeFamily(row.familyId);
      throw errors.refreshInvalid('Refresh token rotation mismatch — all sessions revoked');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: row.userId, deletedAt: null },
    });
    if (!user) {
      await this.tokens.revokeFamily(row.familyId);
      throw errors.refreshInvalid();
    }

    const rotated = await this.tokens.rotateRefreshToken(
      { id: row.id, familyId: row.familyId, userId: row.userId, rotationIndex: row.rotationIndex },
      context,
    );
    const accessToken = await this.tokens.signAccessToken(user.id, rotated.familyId);

    return {
      session: {
        user: toUserProfile(user),
        accessToken,
        expiresIn: this.tokens.accessTokenTtlSeconds,
        refreshToken: rotated.token,
      },
      csrfToken: newCsrfToken(),
    };
  }

  /**
   * Revokes the refresh family and clears the cookies. Idempotent: a missing
   * or already-revoked token still succeeds.
   */
  async logout(rawToken: string | undefined): Promise<null> {
    if (rawToken) {
      const payload = await this.tokens.verifyRefreshToken(rawToken).catch(() => null);
      if (payload) {
        const row = await this.tokens.findRefreshRow(rawToken);
        await this.tokens.revokeFamily(row?.familyId ?? payload.fid);
      }
    }
    return null;
  }

  async me(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw errors.notFound('User not found');
    return toUserProfile(user);
  }

  private async issueSession(
    userId: string,
    context: ClientContext,
    user: UserProfile,
  ): Promise<AuthResult> {
    const refresh = await this.tokens.issueRefreshToken(userId, context);
    const accessToken = await this.tokens.signAccessToken(userId, refresh.familyId);

    return {
      session: {
        user,
        accessToken,
        expiresIn: this.tokens.accessTokenTtlSeconds,
        refreshToken: refresh.token,
      },
      csrfToken: newCsrfToken(),
    };
  }
}
