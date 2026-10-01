/**
 * Uniform API envelope.
 *
 * Success: `{ ok: true, data, meta? }`
 * Failure: `{ ok: false, error: { code, message, details? } }`
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** Field-level validation problems. Never contains sensitive values. */
  details?: Array<{ path: string; message: string }>;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Stable machine-readable error codes. Clients switch on these, never on
 * human-readable messages.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'EMAIL_NOT_VERIFIED',
  'PHONE_NOT_VERIFIED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_TOO_MANY_ATTEMPTS',
  'REFRESH_TOKEN_INVALID',
  'CSRF_INVALID',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
