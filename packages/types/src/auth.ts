import type { IsoDateTime } from './common';

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

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
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
