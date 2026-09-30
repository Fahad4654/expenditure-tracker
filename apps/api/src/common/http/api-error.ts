import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@exp/types';

/**
 * Builds an `HttpException` that carries a stable machine-readable `code`
 * instead of the HTTP-status-derived default.
 *
 * `docs/api.md` promises clients can switch on `code`, so 401 alone is not
 * enough to distinguish "no token" (`UNAUTHORIZED`) from "wrong password"
 * (`INVALID_CREDENTIALS`).
 */
export function apiError(
  status: HttpStatus,
  code: ApiErrorCode,
  message: string,
  details?: ReadonlyArray<{ path: string; message: string }>,
): HttpException {
  return new HttpException(
    {
      code,
      message,
      ...(details && details.length > 0 ? { details: [...details] } : {}),
    },
    status,
  );
}

export const errors = {
  unauthorized: (message = 'Authentication required') =>
    apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message),

  invalidCredentials: () =>
    apiError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password'),

  refreshInvalid: (message = 'Refresh token is invalid or expired') =>
    apiError(HttpStatus.UNAUTHORIZED, 'REFRESH_TOKEN_INVALID', message),

  csrfInvalid: () =>
    apiError(HttpStatus.FORBIDDEN, 'CSRF_INVALID', 'CSRF token missing or invalid'),

  forbidden: (message = 'You do not have access to this resource') =>
    apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message),

  notFound: (message = 'Resource not found') =>
    apiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message),

  conflict: (message: string) => apiError(HttpStatus.CONFLICT, 'CONFLICT', message),

  accountLocked: (message = 'Account temporarily locked') =>
    apiError(HttpStatus.TOO_MANY_REQUESTS, 'ACCOUNT_LOCKED', message),

  rateLimited: (message = 'Too many requests') =>
    apiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message),
} as const;
