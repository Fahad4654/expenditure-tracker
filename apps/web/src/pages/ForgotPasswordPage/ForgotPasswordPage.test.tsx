import { STORAGE_KEYS } from '../../shared/config';
import type { AuthSession, UserProfile } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthProvider from '../../auth/AuthProvider';
import ForgotPasswordPage from './ForgotPasswordPage';

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
  role: 'USER',
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

function apiRoute(url: string): Response {
  if (url.endsWith('/auth/refresh')) {
    return jsonResponse({
      ok: false,
      error: { code: 'REFRESH_TOKEN_INVALID', message: 'no session' },
    });
  }
  if (url.endsWith('/auth/forgot-password')) {
    return jsonResponse({
      ok: true,
      data: {
        email: 'ada@example.com',
        expiresAt: '2026-01-01T00:10:00Z',
        resendAfterSeconds: 60,
        devCode: '135790',
      },
    });
  }
  if (url.endsWith('/auth/reset-password')) return jsonResponse({ ok: true, data: session });
  return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'unexpected ' + url } }, 404);
}

function renderForgot() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <AuthProvider>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/dashboard" element={<div>dashboard-content</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('ForgotPasswordPage', () => {
  it('issues an OTP challenge with the dev code', async () => {
    stubFetch(apiRoute);

    renderForgot();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(screen.getByText(/Dev code: 135790/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /resend code in/i })).toBeTruthy();
  });

  it('requires client-side validity before calling reset-password', async () => {
    const mock = stubFetch(apiRoute);

    renderForgot();
    await waitFor(() => expect(screen.getByLabelText('New password')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    const resetCalls = mock.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/reset-password'),
    );
    expect(resetCalls).toHaveLength(0);
  });

  it('resets the password with the code and lands on the dashboard', async () => {
    stubFetch(apiRoute);

    renderForgot();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '135790' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'BrandNew-456' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(screen.getByText('dashboard-content')).toBeTruthy());
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBe('access-1');
  });
});
