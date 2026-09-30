import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthSession, UserProfile } from '@exp/types';
import type { LoginInputDto, RegisterInputDto } from '@exp/validation';
import { errors } from '../common/http/api-error';
import { PrismaService } from '../prisma/prisma.module';
import { toUserProfile } from '../users/user.mapper';
import { newCsrfToken } from './cookies';
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

    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        defaultCurrency: this.defaultCurrency,
        timezone: this.defaultTimezone,
      },
    });

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
