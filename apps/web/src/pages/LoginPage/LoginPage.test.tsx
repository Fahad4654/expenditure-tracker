import { STORAGE_KEYS } from '../../shared/config';
import type { AuthSession, UserProfile } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthProvider from '../../auth/AuthProvider';
import LoginPage from './LoginPage';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const user: UserProfile = {
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  phone: null,
  avatarUrl: null,
  emailVerified: true,
  phoneVerified: false,
  providers: ['email'],
  defaultCurrency: 'USD',
  timezone: 'UTC',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const session: AuthSession = {
  accessToken: 'access-1',
  expiresIn: 900,
  refreshToken: 'refresh-1',
  user,
};

type Router = (url: string, init?: RequestInit) => Response;

function stubFetch(route: Router) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(route(String(input), init)),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>dashboard-content</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('validates on the client and never calls the API with a bad form', async () => {
    const mock = stubFetch(() =>
      jsonResponse({ ok: false, error: { code: 'UNAUTHORIZED', message: 'no' } }, 401),
    );

    renderLogin();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    // Only the AuthProvider's silent refresh ran — no login attempt was made.
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('shows the server message when credentials are rejected', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(
          { ok: false, error: { code: 'REFRESH_TOKEN_INVALID', message: 'gone' } },
          401,
        );
      }
      return jsonResponse(
        { ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        401,
      );
    });

    renderLogin();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

    await fillAndSubmit('ada@example.com', 'wrong-password');

    expect(await screen.findByText('Invalid email or password')).toBeTruthy();
    expect(screen.queryByText('dashboard-content')).toBeNull();
  });

  it('signs in and lands on the dashboard', async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(
          { ok: false, error: { code: 'REFRESH_TOKEN_INVALID', message: 'gone' } },
          401,
        );
      }
      if (url.endsWith('/auth/login')) return jsonResponse({ ok: true, data: session });
      return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'no' } }, 404);
    });

    renderLogin();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

    await fillAndSubmit('ada@example.com', 'correct-horse1');

    expect(await screen.findByText('dashboard-content')).toBeTruthy();
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBe('access-1');
    expect(mock.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'))).toHaveLength(1);
  });

  it('returns to the destination that triggered the login redirect', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(
          { ok: false, error: { code: 'REFRESH_TOKEN_INVALID', message: 'gone' } },
          401,
        );
      }
      return jsonResponse({ ok: true, data: session });
    });

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/login', state: { from: '/transactions?preset=month' } }]}
      >
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/transactions" element={<div>transactions-content</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    await fillAndSubmit('ada@example.com', 'correct-horse1');

    expect(await screen.findByText('transactions-content')).toBeTruthy();
  });
});
