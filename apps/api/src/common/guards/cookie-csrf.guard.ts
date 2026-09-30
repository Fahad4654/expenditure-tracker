import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { COOKIE_NAMES } from '@exp/config';
import type { Request } from 'express';
import { errors } from '../http/api-error';

type CookieJar = Request & { cookies?: Record<string, string | undefined> };

/**
 * Double-submit CSRF check for endpoints authenticated by the refresh cookie.
 *
 * Only applies when the refresh token actually arrived in a cookie — a client
 * that sends `refreshToken` in the body (mobile) is not cookie-exposed, and
 * bearer-authenticated requests are not CSRF-exposed either.
 */
@Injectable()
export class CookieCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CookieJar>();
    const cookies = request.cookies ?? {};

    const refreshFromCookie = cookies[COOKIE_NAMES.refreshToken];
    if (!refreshFromCookie) return true;

    const expected = cookies[COOKIE_NAMES.csrfToken];
    const received = request.headers['x-csrf-token'];

    if (!expected || typeof received !== 'string' || !constantTimeEqual(expected, received)) {
      throw errors.csrfInvalid();
    }
    return true;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
