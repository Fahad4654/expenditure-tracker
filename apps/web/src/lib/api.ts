import { API_ROUTES, STORAGE_KEYS } from '@exp/config';
import type { ApiErrorCode, ApiResponse } from '@exp/types';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

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
}

/**
 * Single entry point for talking to the API. Understands the shared
 * `{ ok, data }` / `{ ok, error }` envelope and throws `ApiError` on failure.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { headers = {}, accessToken, ...rest } = options;
  const token = accessToken ?? readStoredAccessToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    throw new ApiError(body.error.code, body.error.message, body.error.details);
  }
  return body.data;
}

function readStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEYS.accessToken);
}

export { API_ROUTES };
