import { STORAGE_KEYS } from '@exp/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL, ApiError, apiFetch } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(response: Response) {
  const mock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('targets the configured API base URL with the shared prefix', async () => {
    const mock = stubFetch(jsonResponse({ ok: true, data: null }));

    await apiFetch('/api/v1/health/live');

    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[0]).toBe(`${API_BASE_URL}/api/v1/health/live`);
  });

  it('sends JSON content type and includes credentials', async () => {
    const mock = stubFetch(jsonResponse({ ok: true, data: null }));

    await apiFetch('/api/v1/health/live');

    const init = mock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('unwraps a success envelope into its data payload', async () => {
    stubFetch(jsonResponse({ ok: true, data: { id: 'tx_1', amount: '12.50' } }));

    await expect(apiFetch<{ id: string; amount: string }>('/api/v1/transactions')).resolves.toEqual(
      { id: 'tx_1', amount: '12.50' },
    );
  });

  it('throws ApiError carrying the server error code and details', async () => {
    stubFetch(
      jsonResponse(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: [{ path: 'amount', message: 'Expected a decimal string' }],
          },
        },
        400,
      ),
    );

    const error = await apiFetch('/api/v1/transactions').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.code).toBe('VALIDATION_ERROR');
    expect(apiError.message).toBe('Invalid request body');
    expect(apiError.details).toEqual([{ path: 'amount', message: 'Expected a decimal string' }]);
  });

  it('maps a non-JSON response onto INTERNAL_ERROR', async () => {
    stubFetch({
      ok: false,
      status: 502,
      json: async () => Promise.reject(new Error('bad')),
    } as unknown as Response);

    const error = await apiFetch('/api/v1/health/live').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INTERNAL_ERROR');
    expect((error as ApiError).message).toContain('502');
  });

  it('reads the bearer token from browser storage', async () => {
    const mock = stubFetch(jsonResponse({ ok: true, data: null }));
    window.localStorage.setItem(STORAGE_KEYS.accessToken, 'stored-token');

    await apiFetch('/api/v1/auth/me');

    const headers = (mock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer stored-token');
  });

  it('lets an explicit accessToken win over stored state', async () => {
    const mock = stubFetch(jsonResponse({ ok: true, data: null }));
    window.localStorage.setItem(STORAGE_KEYS.accessToken, 'stored-token');

    await apiFetch('/api/v1/auth/me', { accessToken: 'fresh-token' });

    const headers = (mock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fresh-token');
  });

  it('omits Authorization when no token exists', async () => {
    const mock = stubFetch(jsonResponse({ ok: true, data: null }));

    await apiFetch('/api/v1/health/live');

    const headers = (mock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
