import { STORAGE_KEYS } from '../shared/config';
import type { AuthSession, UserProfile } from '../shared/types';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeAccessToken, storeRefreshToken, storeUser } from '../lib/api';
import AuthProvider from './AuthProvider';
import { useAuth } from './auth-context';
import { GuestOnlyRoute, ProtectedRoute } from './ProtectedRoute';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeUser(name: string): UserProfile {
  return {
    id: 'user-1',
    name,
    email: 'ada@example.com',
    phone: null,
    avatarUrl: null,
    emailVerified: true,
    phoneVerified: false,
    role: 'USER',
    providers: ['email'],
    defaultCurrency: 'USD',
    timezone: 'UTC',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeSession(name = 'Ada'): AuthSession {
  return {
    accessToken: 'access-1',
    expiresIn: 900,
    refreshToken: 'refresh-1',
    user: makeUser(name),
  };
}

type Router = (url: string, init?: RequestInit) => Response;

function stubFetch(route: Router) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(route(String(input), init)),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

const okBody = (data: unknown) => jsonResponse({ ok: true, data });
const failBody = (code: string, status = 401) =>
  jsonResponse({ ok: false, error: { code, message: `${code} failed` } }, status);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function Probe() {
  const { status, user, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.name ?? 'anonymous'}</p>
      <button type="button" onClick={() => void login({ email: 'a@b.co', password: 'password1' })}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('resumes an existing session through a silent refresh on mount', async () => {
    stubFetch((url) =>
      url.endsWith('/auth/refresh')
        ? okBody(makeSession('Grace'))
        : failBody('NOT_IMPLEMENTED', 500),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('Grace');
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBe('access-1');
  });

  it('lands on anonymous when the refresh token is gone', async () => {
    stubFetch(() => failBody('REFRESH_TOKEN_INVALID'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(screen.getByTestId('user').textContent).toBe('anonymous');
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
  });

  it('keeps a valid session alive when the background rotation fails', async () => {
    storeAccessToken({ accessToken: 'access-1', expiresIn: 900 });
    storeRefreshToken('refresh-1');
    storeUser(makeUser('Ada'));
    const mock = stubFetch(() => failBody('REFRESH_TOKEN_INVALID'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(screen.getByTestId('user').textContent).toBe('Ada');

    await waitFor(() => expect(mock).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBe('access-1');
  });

  it('re-establishes the session from the stored refresh token body', async () => {
    storeAccessToken({ accessToken: 'access-1', expiresIn: 900 });
    storeRefreshToken('refresh-1');
    const mock = stubFetch((url) =>
      url.endsWith('/auth/refresh') ? okBody(makeSession('Grace')) : failBody('NOT_FOUND', 404),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('Grace'));

    const call = mock.mock.calls.find(([url]) => String(url).endsWith('/auth/refresh'));
    expect(call).toBeDefined();
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({
      refreshToken: 'refresh-1',
    });
    expect(window.localStorage.getItem(STORAGE_KEYS.refreshToken)).toBe('refresh-1');
  });

  it('login stores the token and flips the session to authenticated', async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failBody('REFRESH_TOKEN_INVALID');
      if (url.endsWith('/auth/login')) return okBody(makeSession('Lin'));
      return failBody('NOT_FOUND', 404);
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));

    fireEvent.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('Lin');
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBe('access-1');

    const loginCall = mock.mock.calls.find(([url]) => String(url).endsWith('/auth/login'));
    expect(loginCall).toBeDefined();
    expect((loginCall![1] as RequestInit).method).toBe('POST');
  });

  it('logout clears local state even when the server call fails', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return okBody(makeSession());
      if (url.endsWith('/auth/logout')) return failBody('INTERNAL_ERROR', 500);
      return failBody('NOT_FOUND', 404);
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
  });
});

describe('route guards', () => {
  it('sends an anonymous visitor to the login page instead of the app', async () => {
    stubFetch(() => failBody('REFRESH_TOKEN_INVALID'));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<div>dashboard-content</div>} />
            </Route>
            <Route path="/login" element={<div>login-content</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Wait for the destination, not for the absence of the first view: the
    // guard holds a spinner for a beat while the silent refresh settles.
    expect(await screen.findByText('login-content')).toBeTruthy();
  });

  it('bounces an authenticated visitor away from the sign-in screen', async () => {
    stubFetch((url) =>
      url.endsWith('/auth/refresh') ? okBody(makeSession()) : failBody('NOT_FOUND', 404),
    );

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnlyRoute />}>
              <Route path="/login" element={<div>login-content</div>} />
            </Route>
            <Route path="/dashboard" element={<div>dashboard-content</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('dashboard-content')).toBeTruthy();
  });

  it('keeps the destination on the redirect state so login can return to it', async () => {
    stubFetch(() => failBody('REFRESH_TOKEN_INVALID'));

    render(
      <MemoryRouter initialEntries={['/reports?tab=summary']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/reports" element={<div>reports-content</div>} />
            </Route>
            <Route path="/login" element={<DestinationProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect((await screen.findByTestId('destination')).textContent).toBe('/reports?tab=summary');
  });
});

function DestinationProbe() {
  const location = useLocation();
  return (
    <div data-testid="destination">{String((location.state as { from?: string })?.from ?? '')}</div>
  );
}
