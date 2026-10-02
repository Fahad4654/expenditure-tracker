import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export type MailPurpose = 'REGISTER' | 'PASSWORD_RESET';

const SUBJECTS: Record<MailPurpose, string> = {
  REGISTER: 'Your registration verification code',
  PASSWORD_RESET: 'Your password reset code',
};

const ACTIONS: Record<MailPurpose, string> = {
  REGISTER: 'complete your registration',
  PASSWORD_RESET: 'reset your password',
};

/**
 * SMTP delivery for email OTPs (Gmail app password in dev).
 *
 * `MAIL_SEND=false` suppresses delivery entirely — the API then hands the
 * code back as `devCode` (non-production only) so dev and tests can finish
 * the flow without a mail server.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;
  private readonly appPassword: string;
  private readonly fromEmail: string;
  private transport?: Transporter;

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('mail.send') ?? false;
    this.host = config.get<string>('mail.host') ?? 'smtp.gmail.com';
    this.port = config.get<number>('mail.port') ?? 587;
    this.appPassword = config.get<string>('mail.appPassword') ?? '';
    this.fromEmail = config.get<string>('mail.fromEmail') ?? '';
  }

  get deliveryEnabled(): boolean {
    return this.enabled;
  }

  async sendOtpCode(email: string, code: string, purpose: MailPurpose): Promise<void> {
    if (!this.enabled) {
      this.logger.log(`MAIL_SEND=false — suppressed OTP email to ${email} (${purpose})`);
      return;
    }
    const action = ACTIONS[purpose];
    await this.transporter().sendMail({
      from: `"Expenditure Tracker" <${this.fromEmail}>`,
      to: email,
      subject: SUBJECTS[purpose],
      text:
        `Your code is ${code}. It expires in 10 minutes and can be used once ` +
        `to ${action}. If you didn't request it, you can ignore this email.`,
      html: `
        <p>Your verification code:</p>
        <p style="font-size:24px;letter-spacing:6px;font-weight:bold">${code}</p>
        <p>It expires in 10 minutes and can be used once to ${action}.</p>
        <p>If you didn't request it, you can ignore this email.</p>`,
    });
  }

  private transporter(): Transporter {
    this.transport ??= createTransport({
      host: this.host,
      port: this.port,
      secure: this.port === 465,
      auth: { user: this.fromEmail, pass: this.appPassword },
    });
    return this.transport;
  }
}
