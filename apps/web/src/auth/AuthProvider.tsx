import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  API_ROUTES,
  apiFetch,
  clearAccessToken,
  setUnauthorizedHandler,
  storeAccessToken,
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
 * The refresh token lives in an HTTP-only cookie, so "am I signed in?" cannot
 * be answered from storage alone: on mount we ask the API to rotate it. The
 * same rotation is reused as the 401 handler for every other request, which is
 * why `apiFetch` can replay a call whose 15-minute access token expired.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading', user: null });

  // Memoised so parallel 401s share one refresh round-trip instead of racing.
  const refreshInFlight = useRef<Promise<boolean> | null>(null);

  const refresh = useCallback((): Promise<boolean> => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = (async () => {
        try {
          const session = await apiFetch<AuthSession>(API_ROUTES.auth.refresh, {
            method: 'POST',
            skipAuthRetry: true,
          });
          storeAccessToken(session);
          setState({ status: 'authenticated', user: session.user });
          return true;
        } catch {
          clearAccessToken();
          setState({ status: 'anonymous', user: null });
          return false;
        } finally {
          refreshInFlight.current = null;
        }
      })();
    }
    return refreshInFlight.current;
  }, []);

  const login = useCallback(async (input: LoginInput): Promise<AuthSession> => {
    const session = await apiFetch<AuthSession>(API_ROUTES.auth.login, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    storeAccessToken(session);
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<AuthSession> => {
    const session = await apiFetch<AuthSession>(API_ROUTES.auth.register, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    storeAccessToken(session);
    setState({ status: 'authenticated', user: session.user });
    return session;
  }, []);

  const resetPassword = useCallback(
    async (input: ResetPasswordInput): Promise<AuthSession> => {
      const session = await apiFetch<AuthSession>(API_ROUTES.auth.resetPassword, {
        method: 'POST',
        body: JSON.stringify(input),
        skipAuthRetry: true,
      });
      storeAccessToken(session);
      setState({ status: 'authenticated', user: session.user });
      return session;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch(API_ROUTES.auth.logout, { method: 'POST', skipAuthRetry: true });
    } catch {
      // Swallowed on purpose: the user asked to be signed out, and rethrowing
      // would only surface an error at a call site that cannot act on it. The
      // cookie stays live server-side until it expires — an acceptable trade
      // for a session that is already meaningless to this client.
    } finally {
      clearAccessToken();
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  const setUser = useCallback((user: UserProfile) => {
    setState({ status: 'authenticated', user });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(refresh);
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      login,
      register,
      resetPassword,
      logout,
      setUser,
    }),
    [state.status, state.user, login, register, resetPassword, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
