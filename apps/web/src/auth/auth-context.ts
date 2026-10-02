import { createContext, useContext } from 'react';
import type {
  AuthSession,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserProfile,
} from '../shared/types';

/**
 * `loading` means a silent refresh is still in flight on first paint — the UI
 * must not bounce a real session through the login page just because the
 * access token from the previous visit expired.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  login(input: LoginInput): Promise<AuthSession>;
  register(input: RegisterInput): Promise<AuthSession>;
  /** Consume the reset OTP, set the new password, start a fresh session. */
  resetPassword(input: ResetPasswordInput): Promise<AuthSession>;
  logout(): Promise<void>;
  /** Swap in an updated profile after a settings save. */
  setUser(user: UserProfile): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
