import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { AccessTokenPayload, RefreshTokenPayload } from '@exp/types';
import { PrismaService } from '../prisma/prisma.module';

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** `"15m"` -> `900`. Falls back to 15 minutes on anything unrecognised. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  return value * (UNIT_SECONDS[match[2] ?? 's'] ?? 1);
}

export interface IssuedRefreshToken {
  token: string;
  familyId: string;
  rotationIndex: number;
  expiresAt: Date;
}

export interface ClientContext {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Owns everything token-shaped: signing, verification and the rotating
 * refresh-token store.
 *
 * The refresh token is a JWT (so its claims travel with it) *and* has a
 * database row keyed by `sha256(token)`. The row is what makes rotation and
 * family revocation possible: a raw token is never persisted.
 */
@Injectable()
export class TokenService {
  private readonly accessJwt: JwtService;
  private readonly refreshJwt: JwtService;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.issuer = config.get<string>('auth.issuer') ?? 'expenditure-tracker';
    this.audience = config.get<string>('auth.audience') ?? 'expenditure-tracker-clients';
    this.refreshSecret = config.get<string>('auth.refreshSecret') ?? '';
    this.accessTtlSeconds = ttlToSeconds(config.get<string>('auth.accessTtl') ?? '15m');
    this.refreshTtlSeconds = ttlToSeconds(config.get<string>('auth.refreshTtl') ?? '30d');

    const asTtl = (value: string | undefined, fallback: string) =>
      (value ?? fallback) as JwtSignOptions['expiresIn'];

    this.accessJwt = new JwtService({
      secret: config.get<string>('auth.accessSecret') ?? '',
      signOptions: {
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: asTtl(config.get<string>('auth.accessTtl'), '15m'),
      },
    });

    this.refreshJwt = new JwtService({
      secret: this.refreshSecret,
      signOptions: {
        issuer: this.issuer,
        audience: this.audience,
        expiresIn: asTtl(config.get<string>('auth.refreshTtl'), '30d'),
      },
    });
  }

  get accessTokenTtlSeconds(): number {
    return this.accessTtlSeconds;
  }

  async signAccessToken(userId: string, familyId: string): Promise<string> {
    // `sub` lives in the payload; passing `subject` here too makes jsonwebtoken throw.
    return this.accessJwt.signAsync({ sub: userId, typ: 'access', fid: familyId });
  }

  /**
   * Verifies signature, issuer, audience, expiry and the `typ` discriminator.
   * Throws — callers translate into a 401.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const payload = await this.accessJwt.verifyAsync<Partial<AccessTokenPayload>>(token);
    if (payload.typ !== 'access' || !payload.sub || !payload.fid) {
      throw new Error('Malformed access token');
    }
    return payload as AccessTokenPayload;
  }

  /**
   * Signs a refresh JWT and persists its hash as rotation 0 of a new family.
   */
  async issueRefreshToken(userId: string, context: ClientContext): Promise<IssuedRefreshToken> {
    return this.rotate(null, userId, randomUUID(), 0, context);
  }

  /**
   * Rotates an existing refresh token: revokes the old row and issues the next
   * one in the same family.
   *
   * Passing a revoked row means the token was replayed — the caller must revoke
   * the whole family, which is exactly what `revokeFamily` is for.
   */
  async rotateRefreshToken(
    current: { id: string; familyId: string; userId: string; rotationIndex: number },
    context: ClientContext,
  ): Promise<IssuedRefreshToken & { previousId: string }> {
    const issued = await this.rotate(
      current,
      current.userId,
      current.familyId,
      current.rotationIndex + 1,
      context,
    );
    return { ...issued, previousId: current.id };
  }

  private async rotate(
    previous: { id: string } | null,
    userId: string,
    familyId: string,
    rotationIndex: number,
    context: ClientContext,
  ): Promise<IssuedRefreshToken> {
    const token = await this.refreshJwt.signAsync({
      sub: userId,
      typ: 'refresh',
      fid: familyId,
      rot: rotationIndex,
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId,
          familyId,
          rotationIndex,
          tokenHash: hashToken(token),
          userAgent: context.userAgent?.slice(0, 256) ?? null,
          ipHash: context.ip ? hashIp(context.ip, this.refreshSecret) : null,
          expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
        },
      });
      if (previous) {
        await tx.refreshToken.update({
          where: { id: previous.id },
          data: { revokedAt: new Date(), replacedById: created.id },
        });
      }
      return created;
    });

    return {
      token,
      familyId,
      rotationIndex,
      expiresAt: row.expiresAt,
    };
  }

  /** Parses the refresh JWT and returns its database row. */
  async findRefreshRow(token: string): Promise<{
    id: string;
    userId: string;
    familyId: string;
    rotationIndex: number;
    expiresAt: Date;
    revokedAt: Date | null;
  } | null> {
    const payload = await this.verifyRefreshToken(token).catch(() => null);
    if (!payload) return null;

    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        familyId: true,
        rotationIndex: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (!row) return null;
    if (row.userId !== payload.sub || row.familyId !== payload.fid) return null;
    return row;
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const payload = await this.refreshJwt.verifyAsync<Partial<RefreshTokenPayload>>(token, {
      secret: this.refreshSecret,
    });
    if (payload.typ !== 'refresh' || !payload.sub || !payload.fid) {
      throw new Error('Malformed refresh token');
    }
    return payload as RefreshTokenPayload;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeById(id: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Never store raw IPs — HMAC keeps them audit-usable but not reversible. */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}
