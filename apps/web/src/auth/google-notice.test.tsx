import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { API_ROUTES } from '../shared/config';
import { API_BASE_URL } from '../lib/api';
import { googleOauthStartUrl, useGoogleAuthNotice } from './google-notice';
import GoogleButton from '../components/GoogleButton/GoogleButton';

function Probe() {
  const [banner, setBanner] = useState<string | null>(null);
  useGoogleAuthNotice(setBanner);
  return <div data-testid="banner">{banner ?? 'none'}</div>;
}

function bannerAt(url: string): string {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId('banner').textContent ?? '';
}

afterEach(cleanup);

describe('googleOauthStartUrl', () => {
  it('points at the API start route with the current page as redirect', () => {
    expect(googleOauthStartUrl('/login')).toBe(
      `${API_BASE_URL}${API_ROUTES.auth.google}?redirect=%2Flogin`,
    );
    expect(googleOauthStartUrl('/register', '?tab=1')).toBe(
      `${API_BASE_URL}${API_ROUTES.auth.google}?redirect=%2Fregister%3Ftab%3D1`,
    );
  });
});

describe('useGoogleAuthNotice', () => {
  it('explains a server that has no Google credentials configured', () => {
    expect(bannerAt('/login?google=unavailable')).toBe(
      "Google sign-in isn't enabled on the server yet.",
    );
  });

  it('treats a cancelled consent screen as a quiet notice', () => {
    expect(bannerAt('/login?google=denied')).toBe('Google sign-in was cancelled.');
  });

  it('reports a failed exchange', () => {
    expect(bannerAt('/register?google=failed')).toBe('Google sign-in failed — please try again.');
  });

  it('stays silent without the parameter', () => {
    expect(bannerAt('/login')).toBe('none');
  });
});

describe('GoogleButton', () => {
  it('renders the default label', () => {
    render(
      <MemoryRouter>
        <GoogleButton />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy();
  });

  it('renders a custom label', () => {
    render(
      <MemoryRouter>
        <GoogleButton label="Sign up with Google" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeTruthy();
  });
});
