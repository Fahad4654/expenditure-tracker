import { API_ROUTES, COOKIE_NAMES, STORAGE_KEYS } from '../shared/config';
import type { ApiErrorCode, ApiResponse, AuthSession, UserProfile } from '../shared/types';
import { queryString, type QueryValue } from './query';

/**
 * Base URL of the API as seen by the browser (`VITE_API_URL`), with a
 * localhost default for unconfigured dev. Prefer a **same-site** URL (same
 * host — ports may differ): the refresh cookie is SameSite=Lax, so a
 * cross-site URL drops it. Sessions do not depend on it — the refresh token
 * is also kept in local storage and sent in the refresh request body.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/** Error codes that mean "the access token is no longer usable". */
const AUTH_FAILURE_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'UNAUTHORIZED',
  'REFRESH_TOKEN_INVALID',
]);

/**
 * Paths that must never trigger a silent refresh: retrying them is pointless
 * (they are what failed in the first place) and would loop.
 */
const NO_RETRY_PATHS: ReadonlySet<string> = new Set<string>([
  API_ROUTES.auth.login,
  API_ROUTES.auth.register,
  API_ROUTES.auth.refresh,
  API_ROUTES.auth.logout,
  API_ROUTES.auth.otpSend,
  API_ROUTES.auth.forgotPassword,
  API_ROUTES.auth.resetPassword,
]);

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: ReadonlyArray<{ path: string; message: string }>;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: ReadonlyArray<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details ?? [];
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  /** Bearer token; falls back to the token kept in browser storage. */
  accessToken?: string | null;
  /** Set by the auth layer to avoid refreshing a session that just died. */
  skipAuthRetry?: boolean;
  /** Appended to `path`; empty values are dropped so filters stay tidy. */
  query?: Record<string, QueryValue>;
}

/**
 * Registered by `AuthProvider`. Resolves `true` when a fresh access token was
 * obtained (the request is then replayed once) and `false` when the session is
 * gone for good (the original 401 propagates).
 */
type UnauthorizedHandler = () => Promise<boolean>;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/**
 * Single entry point for talking to the API. Understands the shared
 * `{ ok, data }` / `{ ok, error }` envelope and throws `ApiError` on failure.
 *
 * Two things happen here that every call site benefits from:
 *  - mutating requests carry the `X-CSRF-Token` double-submit header whenever
 *    the readable CSRF cookie is present (the server ignores it otherwise);
 *  - a 401 on a non-auth path triggers exactly one silent refresh + retry, so
 *    an expired 15-minute access token never surfaces as a user-visible error.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { headers = {}, accessToken, skipAuthRetry = false, query, ...rest } = options;
  const token = accessToken ?? readStoredAccessToken();

  const response = await fetch(`${API_BASE_URL}${path}${query ? queryString(query) : ''}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...csrfHeaders(rest.method),
      ...headers,
    },
  });

  let body: ApiResponse<T>;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError('INTERNAL_ERROR', `Unexpected non-JSON response (${response.status})`);
  }

  if (!body.ok) {
    const canRetry =
      !skipAuthRetry &&
      !NO_RETRY_PATHS.has(path) &&
      AUTH_FAILURE_CODES.has(body.error.code) &&
      unauthorizedHandler !== null;

    if (canRetry) {
      const refreshed = await unauthorizedHandler!();
      if (refreshed) {
        // One shot only — a second 401 after a successful refresh means the
        // session really is dead and retrying would loop.
        return apiFetch<T>(path, { ...options, skipAuthRetry: true, accessToken: null });
      }
    }

    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }
  return body.data;
}

/** `POST`/`PATCH`/`DELETE` (and explicit `PUT`) must echo the CSRF cookie. */
function csrfHeaders(method?: string): Record<string, string> {
  if (!method) return {};
  const upper = method.toUpperCase();
  if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return {};
  const csrf = readCookie(COOKIE_NAMES.csrfToken);
  return csrf ? { 'X-CSRF-Token': csrf } : {};
}

function readStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEYS.accessToken);
}

/** `document.cookie` is readable by design for the double-submit token only. */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

/**
 * Writes the access half of a session to browser storage, plus its expiry so
 * a reload can tell "still signed in" without a round-trip.
 */
export function storeAccessToken(
  session: Pick<AuthSession, 'accessToken'> & Partial<Pick<AuthSession, 'expiresIn'>>,
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEYS.accessToken, session.accessToken);
  if (typeof session.expiresIn === 'number') {
    window.localStorage.setItem(
      STORAGE_KEYS.accessExpiresAt,
      String(Date.now() + session.expiresIn * 1000),
    );
  }
}

/**
 * Stores the refresh token so `POST /auth/refresh` can re-establish a session
 * from the request body alone — the same transport the mobile app uses. The
 * HTTP-only cookie remains set as a fallback for cookie-only clients, but a
 * blocked or dropped cookie no longer logs the user out. Pass `null` to clear.
 */
export function storeRefreshToken(refreshToken: string | null): void {
  if (typeof window === 'undefined') return;
  if (refreshToken) window.localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
  else window.localStorage.removeItem(STORAGE_KEYS.refreshToken);
}

export function readRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEYS.refreshToken);
}

/** Keeps the last known profile so a reload renders the name immediately. */
export function storeUser(user: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  if (user) window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  else window.localStorage.removeItem(STORAGE_KEYS.user);
}

export function readStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.user);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

/** True while a stored access token exists and has not reached its expiry. */
export function hasValidAccessToken(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage.getItem(STORAGE_KEYS.accessToken)) return false;
  const raw = window.localStorage.getItem(STORAGE_KEYS.accessExpiresAt);
  return raw !== null && Number(raw) > Date.now();
}

/** Writes every client-visible half of a session in one place. */
export function persistSession(session: AuthSession): void {
  storeAccessToken(session);
  storeRefreshToken(session.refreshToken);
  storeUser(session.user);
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEYS.accessToken);
  window.localStorage.removeItem(STORAGE_KEYS.accessExpiresAt);
}

export { API_ROUTES };
