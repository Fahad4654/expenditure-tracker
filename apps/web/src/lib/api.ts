import { API_ROUTES, COOKIE_NAMES, STORAGE_KEYS } from '@exp/config';
import type { ApiErrorCode, ApiResponse, AuthSession } from '@exp/types';
import { queryString, type QueryValue } from './query';

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
 * Writes the token half of a session to browser storage. The refresh token
 * stays in its HTTP-only cookie and is never written to JS-visible storage.
 */
export function storeAccessToken(session: Pick<AuthSession, 'accessToken'>): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEYS.accessToken, session.accessToken);
}

export function clearAccessToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEYS.accessToken);
}

export { API_ROUTES };
