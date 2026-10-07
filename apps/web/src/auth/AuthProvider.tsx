import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  API_ROUTES,
  ApiError,
  apiFetch,
  clearAccessToken,
  hasValidAccessToken,
  persistSession,
  readRefreshToken,
  readStoredUser,
  setUnauthorizedHandler,
  storeRefreshToken,
  storeUser,
} from '../lib/api';
import type {
  AuthSession,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserProfile,
} from '../shared/types';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

interface State {
  status: AuthStatus;
  user: UserProfile | null;
}

/**
 * Owns the browser session.
 *
 * Every auth response carries the refresh token in its body, so the client
 * keeps it in local storage and re-establishes the session with
 * `POST /auth/refresh` alone — the HTTP-only cookie stays set as a fallback,
 * but a dropped or blocked cookie never logs the user out. A reload with a
 * still-valid access token starts out authenticated immediately; the silent
 * rotation below runs in the background and only ends the session when the
 * access token itself is gone for good. The same rotation is reused as the
 * 401 handler for every other request, which is why `apiFetch` can replay a
 * call whose 15-minute access token expired.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  // Restored during render (not an effect): a still-valid access token means
  // the session is already authenticated before any network round-trip.
  const [state, setState] = useState<State>(() =>
    hasValidAccessToken()
      ? { status: 'authenticated', user: readStoredUser() }
      : { status: 'loading', user: null },
  );

  // Memoised so parallel 401s share one refresh round-trip instead of racing.
  // `fatal` records whether any caller needs a failed rotation to end the
  // session (the 401 handler does; a best-effort mount refresh does not).
  const refreshInFlight = useRef<{ fatal: boolean; promise: Promise<boolean> } | null>(null);

  const refresh = useCallback((fatal = true): Promise<boolean> => {
    if (!refreshInFlight.current) {
      const entry = { fatal, promise: Promise.resolve(false) };
      entry.promise = (async () => {
        try {
          const refreshToken = readRefreshToken();
          const session = await apiFetch<AuthSession>(API_ROUTES.auth.refresh, {
            method: 'POST',
            skipAuthRetry: true,
            ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
          });
          persistSession(session);
          setState({ status: 'authenticated', user: session.user });
          return true;
        } catch (error) {
          if (entry.fatal) {
            clearAccessToken();
            if (error instanceof ApiError && error.code === 'REFRESH_TOKEN_INVALID') {
              storeRefreshToken(null);
              storeUser(null);
            }
            setState({ status: 'anonymous', user: null });
          }
          return false;
        } finally {
          refreshInFlight.current = null;
        }
      })();
      refreshInFlight.current = entry;
    } else if (fatal) {
      refreshInFlight.current.fatal = true;
    }
    return refreshInFlight.current.promise;
  }, []);

  const login = useCallback(async (input: LoginInput): Promise<AuthSession> => {
    const session = await apiFetch<AuthSession>(API_ROUTES.auth.login, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    persistSession(session);
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<AuthSession> => {
    const session = await apiFetch<AuthSession>(API_ROUTES.auth.register, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    persistSession(session);
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const googleSignIn = useCallback(async (idToken: string): Promise<AuthSession> => {
    const session = await apiFetch<AuthSession>(API_ROUTES.auth.google, {
      method: 'POST',
      body: JSON.stringify({ idToken }),
      skipAuthRetry: true,
    });
    persistSession(session);
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const resetPassword = useCallback(async (input: ResetPasswordInput): Promise<AuthSession> => {
    const session = await apiFetch<AuthSession>(API_ROUTES.auth.resetPassword, {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuthRetry: true,
    });
    persistSession(session);
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = readRefreshToken();
      await apiFetch(API_ROUTES.auth.logout, {
        method: 'POST',
        skipAuthRetry: true,
        ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
      });
    } catch {
      // Swallowed on purpose: the user asked to be signed out, and rethrowing
      // would only surface an error at a call site that cannot act on it. The
      // cookie stays live server-side until it expires — an acceptable trade
      // for a session that is already meaningless to this client.
    } finally {
      clearAccessToken();
      storeRefreshToken(null);
      storeUser(null);
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  const setUser = useCallback((user: UserProfile) => {
    storeUser(user);
    setState({ status: 'authenticated', user });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(refresh);
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  useEffect(() => {
    if (hasValidAccessToken()) {
      // The session already rendered as authenticated; rotate in the
      // background, best-effort — a blocked cookie must not log you out.
      void refresh(false);
    } else {
      void refresh();
    }
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      login,
      register,
      googleSignIn,
      resetPassword,
      logout,
      setUser,
    }),
    [state.status, state.user, login, register, googleSignIn, resetPassword, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
