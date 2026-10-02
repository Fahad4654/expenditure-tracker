import type { IsoDateTime } from './common';
import type { UserProfile } from './user';

export const AUTH_PROVIDERS = ['email', 'phone', 'google'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface AccessTokenPayload {
  sub: string;
  /** Token type discriminator. */
  typ: 'access';
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  /** Refresh token family id — used for rotation/revocation. */
  fid: string;
}

export interface RefreshTokenPayload {
  sub: string;
  typ: 'refresh';
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  fid: string;
  /** Rotated-token counter inside the family. */
  rot: number;
}

export interface AuthTokens {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  refreshToken: string;
}

/**
 * Payload returned by every token-issuing auth endpoint (register, login,
 * refresh, verify-otp, OAuth callback). The refresh token is *also* set as an
 * HTTP-only cookie for browser clients; mobile clients persist the string.
 */
export interface AuthSession extends AuthTokens {
  user: UserProfile;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  /** Pre-verified 6-digit email OTP (purpose `REGISTER`). */
  code: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SendOtpInput {
  /** E.164 phone number, e.g. `+8801712345678`. */
  phone: string;
}

export interface VerifyOtpInput {
  phone: string;
  code: string;
}

export interface OtpChallenge {
  phone: string;
  expiresAt: IsoDateTime;
  /** Seconds remaining until the code can be resent. */
  resendAfterSeconds: number;
}

/**
 * Challenge returned by `POST /auth/otp/send` and `POST /auth/forgot-password`.
 * `devCode` only appears outside production while `MAIL_SEND=false`.
 */
export interface EmailOtpChallenge {
  email: string;
  expiresAt: IsoDateTime;
  resendAfterSeconds: number;
  devCode?: string;
}

export interface GoogleSignInInput {
  /** Firebase Authentication ID token from the client SDK. */
  idToken: string;
}

export interface ResetPasswordInput {
  email: string;
  /** Pre-issued `PASSWORD_RESET` email OTP. */
  code: string;
  password: string;
}
