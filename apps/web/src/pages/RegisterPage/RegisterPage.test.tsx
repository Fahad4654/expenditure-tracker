import { STORAGE_KEYS } from '../../shared/config';
import type { AuthSession, UserProfile } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthProvider from '../../auth/AuthProvider';
import RegisterPage from './RegisterPage';

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

const challenge = {
  email: 'ada@example.com',
  expiresAt: '2026-01-01T00:10:00Z',
  resendAfterSeconds: 60,
  devCode: '483920',
};

type Router = (url: string, init?: RequestInit) => Response;

function stubFetch(route: Router) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(route(String(input), init)),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** Default API surface: session gone, OTP + register succeed. */
function apiRoute(url: string): Response {
  if (url.endsWith('/auth/refresh')) {
    return jsonResponse({
      ok: false,
      error: { code: 'REFRESH_TOKEN_INVALID', message: 'no session' },
    });
  }
  if (url.endsWith('/auth/otp/send')) return jsonResponse({ ok: true, data: challenge });
  if (url.endsWith('/auth/register')) return jsonResponse({ ok: true, data: session });
  return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'unexpected ' + url } }, 404);
}

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<div>dashboard-content</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Passw0rd-123' } });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('RegisterPage', () => {
  it('refuses to submit without a verification code and never hits the API', async () => {
    const mock = stubFetch(apiRoute);

    renderRegister();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeTruthy());

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/verification code/i),
    );
    const registerCalls = mock.mock.calls.filter(([url]) => String(url).endsWith('/auth/register'));
    expect(registerCalls).toHaveLength(0);
  });

  it('sends the OTP and surfaces the dev code while mail delivery is off', async () => {
    stubFetch(apiRoute);

    renderRegister();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));

    await waitFor(() => expect(screen.getByText(/Dev code: 483920/)).toBeTruthy());
    expect(screen.getByText(/Code sent to ada@example\.com/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /resend code in/i })).toBeTruthy();
  });

  it('registers with the code and lands on the dashboard', async () => {
    stubFetch(apiRoute);

    renderRegister();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeTruthy());

    fillForm();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '483920' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText('dashboard-content')).toBeTruthy());
    expect(window.localStorage.getItem(STORAGE_KEYS.accessToken)).toBe('access-1');
  });

  it('maps a wrong code to a banner instead of a crash', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse({
          ok: false,
          error: { code: 'REFRESH_TOKEN_INVALID', message: 'no session' },
        });
      }
      if (url.endsWith('/auth/register')) {
        return jsonResponse(
          { ok: false, error: { code: 'OTP_INVALID', message: 'Verification code is invalid' } },
          400,
        );
      }
      return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'unexpected' } }, 404);
    });

    renderRegister();
    await waitFor(() => expect(screen.getByLabelText('Name')).toBeTruthy());

    fillForm();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/Verification code is invalid/),
    );
  });
});
