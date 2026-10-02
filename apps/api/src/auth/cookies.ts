import { randomBytes } from 'node:crypto';
import { API_PREFIX, COOKIE_NAMES } from '../shared/config';
import type { Response } from 'express';

/** Path the refresh cookie is scoped to — nothing outside auth can see it. */
const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

/**
 * The CSRF half must be readable from any page (`document.cookie` hides
 * cookies whose path is not a prefix of the document path), so it lives at
 * the root while the refresh cookie stays scoped to the auth routes.
 */
const CSRF_COOKIE_PATH = '/';

export interface AuthCookieOptions {
  refreshTtlSeconds: number;
  secure: boolean;
  /** Omitted for `localhost`/loopback: browsers reject `Domain=localhost`. */
  domain?: string;
}

export function newCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Sets the refresh (HTTP-only) and CSRF (JS-readable) cookies.
 *
 * The refresh token is *also* returned in the response body — mobile clients
 * persist it in secure storage and send it back in the `refreshToken` field.
 */
export function setAuthCookies(
  res: Response,
  refreshToken: string,
  csrfToken: string,
  options: AuthCookieOptions,
): void {
  const base = {
    sameSite: 'lax' as const,
    secure: options.secure,
    path: REFRESH_COOKIE_PATH,
    ...(options.domain ? { domain: options.domain } : {}),
  };

  res.cookie(COOKIE_NAMES.refreshToken, refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: options.refreshTtlSeconds * 1000,
  });

  res.cookie(COOKIE_NAMES.csrfToken, csrfToken, {
    ...base,
    path: CSRF_COOKIE_PATH,
    // Readable by the client so it can echo the value in `X-CSRF-Token`.
    httpOnly: false,
    maxAge: options.refreshTtlSeconds * 1000,
  });
}

export function clearAuthCookies(
  res: Response,
  options: { secure: boolean; domain?: string },
): void {
  const base = {
    sameSite: 'lax' as const,
    secure: options.secure,
    path: REFRESH_COOKIE_PATH,
    ...(options.domain ? { domain: options.domain } : {}),
  };

  res.clearCookie(COOKIE_NAMES.refreshToken, { ...base, httpOnly: true });
  res.clearCookie(COOKIE_NAMES.csrfToken, {
    ...base,
    path: CSRF_COOKIE_PATH,
    httpOnly: false,
  });
}

/** `COOKIE_DOMAIN` is unusable as a cookie attribute when it is a loopback host. */
export function cookieDomainOrUndefined(domain: string | undefined): string | undefined {
  if (!domain) return undefined;
  const host = domain.replace(/^\./, '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined;
  return domain;
}
