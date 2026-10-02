import { API_ROUTES, apiFetch } from '../lib/api';
import type { EmailOtpChallenge } from '../shared/types';

export interface SendOtpInput {
  email: string;
  purpose: 'REGISTER' | 'PASSWORD_RESET';
}

/** Requests a 6-digit email OTP challenge (`devCode` while mail is off). */
export function sendEmailOtp(input: SendOtpInput): Promise<EmailOtpChallenge> {
  return apiFetch<EmailOtpChallenge>(API_ROUTES.auth.otpSend, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Starts password reset. The server answers with the same challenge shape
 * whether or not the email exists, so this never confirms account existence.
 */
export function requestPasswordReset(email: string): Promise<EmailOtpChallenge> {
  return apiFetch<EmailOtpChallenge>(API_ROUTES.auth.forgotPassword, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}
