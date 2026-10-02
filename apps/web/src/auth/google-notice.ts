import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL, API_ROUTES } from '../lib/api';

/** The API entry point that starts the backend-owned Google OAuth flow. */
export function googleOauthStartUrl(pathname: string, search = ''): string {
  return `${API_BASE_URL}${API_ROUTES.auth.google}?redirect=${encodeURIComponent(
    `${pathname}${search}`,
  )}`;
}

/**
 * Folds the `?google=` outcome the backend appends when it sends the browser
 * back (`unavailable`, `denied`, `failed`) into the page's error banner, then
 * clears the parameter so a refresh doesn't repeat it.
 */
export function useGoogleAuthNotice(show: (message: string | null) => void) {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const reason = searchParams.get('google');
    if (!reason) return;
    show(
      reason === 'unavailable'
        ? "Google sign-in isn't enabled on the server yet."
        : reason === 'denied'
          ? 'Google sign-in was cancelled.'
          : reason === 'failed'
            ? 'Google sign-in failed \u2014 please try again.'
            : null,
    );
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, show]);
}

