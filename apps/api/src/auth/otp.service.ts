import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { EmailOtpChallenge } from '../shared/types';
import { errors } from '../common/http/api-error';
import { PrismaService } from '../prisma/prisma.module';
import { MailerService } from '../mail/mailer.service';
import { PasswordService } from './password.service';

export type EmailOtpPurpose = 'REGISTER' | 'PASSWORD_RESET';

const TTL_SECONDS = 600;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

/**
 * Email OTPs for registration and password reset (verify-first flows).
 *
 * Codes are 6 digits, Argon2-hashed at rest, single-use, expire after 10
 * minutes and allow 5 attempts. A resend is rate-limited to one per minute
 * and invalidates any earlier unconsumed code for the same email + purpose.
 *
 * Verification happens inside the caller's transaction so a code is only
 * consumed when the operation it authorises actually commits.
 */
@Injectable()
export class OtpService {
  private readonly allowDevCode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    // The dev escape hatch must never exist in production, even if MAIL_SEND
    // was misconfigured there.
    this.allowDevCode =
      !mailer.deliveryEnabled && (config.get<string>('env') ?? '') !== 'production';
  }

  async sendEmailOtp(email: string, purpose: EmailOtpPurpose): Promise<EmailOtpChallenge> {
    const last = await this.prisma.otpCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last) {
      const elapsed = Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
      const wait = RESEND_COOLDOWN_SECONDS - elapsed;
      if (wait > 0) {
        throw errors.rateLimited(`Please wait ${wait} seconds before requesting another code`);
      }
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await this.passwords.hash(code);

    await this.prisma.otpCode.deleteMany({ where: { email, purpose, consumedAt: null } });
    const row = await this.prisma.otpCode.create({
      data: {
        email,
        codeHash,
        purpose,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
        maxAttempts: MAX_ATTEMPTS,
      },
    });
    await this.mailer.sendOtpCode(email, code, purpose);

    return {
      email,
      expiresAt: row.expiresAt.toISOString(),
      resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
      ...(this.allowDevCode ? { devCode: code } : {}),
    };
  }

  /** Verifies the newest valid code and marks it consumed. */
  async consumeEmailOtp(
    tx: Prisma.TransactionClient,
    email: string,
    purpose: EmailOtpPurpose,
    code: string,
  ): Promise<void> {
    const row = await tx.otpCode.findFirst({
      where: { email, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw errors.otpInvalid();
    if (row.expiresAt.getTime() <= Date.now()) throw errors.otpExpired();
    if (row.attempts >= row.maxAttempts) {
      await tx.otpCode.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      });
      throw errors.otpTooManyAttempts();
    }

    const ok = await this.passwords.verify(row.codeHash, code);
    if (!ok) {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= row.maxAttempts;
      await tx.otpCode.update({
        where: { id: row.id },
        data: { attempts, ...(exhausted ? { consumedAt: new Date() } : {}) },
      });
      throw exhausted ? errors.otpTooManyAttempts() : errors.otpInvalid();
    }

    await tx.otpCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
  }
}
