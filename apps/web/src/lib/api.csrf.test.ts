import { COOKIE_NAMES } from '../shared/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL, apiFetch, setUnauthorizedHandler, storeAccessToken } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const ok = (data: unknown = null) => jsonResponse({ ok: true, data });
const fail = (code: string) =>
  jsonResponse({ ok: false, error: { code, message: `${code} happened` } }, 401);

function stubFetch(...responses: Response[]) {
  const mock = vi.fn();
  for (const response of responses) mock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

function headersOf(call: unknown[]): Record<string, string> {
  return (call[1] as RequestInit).headers as Record<string, string>;
}

function urlOf(call: unknown[]): string {
  return call[0] as string;
}

afterEach(() => {
  document.cookie = `${COOKIE_NAMES.csrfToken}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  window.localStorage.clear();
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe('CSRF double-submit', () => {
  it('echoes the readable CSRF cookie on mutating requests', async () => {
    document.cookie = `${COOKIE_NAMES.csrfToken}=csrf-token-value`;
    const mock = stubFetch(ok());

    await apiFetch('/api/v1/transactions', { method: 'POST', body: '{}' });

    expect(headersOf(mock.mock.calls[0]!)['X-CSRF-Token']).toBe('csrf-token-value');
  });

  it('omits the header on GETs — it would just widen the CORS surface', async () => {
    document.cookie = `${COOKIE_NAMES.csrfToken}=csrf-token-value`;
    const mock = stubFetch(ok());

    await apiFetch('/api/v1/transactions');

    expect(headersOf(mock.mock.calls[0]!)['X-CSRF-Token']).toBeUndefined();
  });

  it('sends nothing when the cookie is absent (mobile / first visit)', async () => {
    const mock = stubFetch(ok());

    await apiFetch('/api/v1/transactions', { method: 'DELETE' });

    expect(headersOf(mock.mock.calls[0]!)['X-CSRF-Token']).toBeUndefined();
  });
});

describe('query serialization', () => {
  it('appends parameters and drops empty values', async () => {
    const mock = stubFetch(ok());

    await apiFetch('/api/v1/transactions', {
      query: { page: 1, search: '', type: undefined, order: 'desc' },
    });

    expect(urlOf(mock.mock.calls[0]!)).toBe(
      `${API_BASE_URL}/api/v1/transactions?page=1&order=desc`,
    );
  });
});

describe('silent refresh and replay', () => {
  it('refreshes once and replays the original request with the new token', async () => {
    const mock = stubFetch(fail('UNAUTHORIZED'), ok({ id: 'tx_1' }));
    storeAccessToken({ accessToken: 'stale-token' });

    const handler = vi.fn().mockImplementation(() => {
      storeAccessToken({ accessToken: 'fresh-token' });
      return Promise.resolve(true);
    });
    setUnauthorizedHandler(handler);

    await expect(apiFetch<{ id: string }>('/api/v1/transactions')).resolves.toEqual({
      id: 'tx_1',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(headersOf(mock.mock.calls[0]!)['Authorization']).toBe('Bearer stale-token');
    expect(headersOf(mock.mock.calls[1]!)['Authorization']).toBe('Bearer fresh-token');
  });

  it('does not retry when the refresh itself reports the session is gone', async () => {
    const mock = stubFetch(fail('REFRESH_TOKEN_INVALID'));
    const handler = vi.fn().mockResolvedValue(false);
    setUnauthorizedHandler(handler);

    await expect(apiFetch('/api/v1/transactions')).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('gives up after a single replay so a dead token cannot loop', async () => {
    const mock = stubFetch(fail('UNAUTHORIZED'), fail('UNAUTHORIZED'));
    const handler = vi.fn().mockResolvedValue(true);
    setUnauthorizedHandler(handler);

    await expect(apiFetch('/api/v1/transactions')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('never retries the auth endpoints themselves', async () => {
    const mock = stubFetch(fail('INVALID_CREDENTIALS'));
    const handler = vi.fn().mockResolvedValue(true);
    setUnauthorizedHandler(handler);

    await expect(
      apiFetch('/api/v1/auth/login', { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(handler).not.toHaveBeenCalled();
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
