import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';

/**
 * Firebase web SDK bootstrap for Google sign-in.
 *
 * Config comes from `VITE_FIREBASE_*` env vars — public by design, anything
 * shipped in the browser bundle is readable. When the vars are missing the
 * Google button hides itself instead of failing at runtime.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const googleAuthConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

let auth: Auth | null = null;

function authInstance(): Auth {
  if (!auth) auth = getAuth(initializeApp(firebaseConfig));
  return auth;
}

/** Opens the Google popup and resolves with the Firebase ID token. */
export async function signInWithGoogle(): Promise<string> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(authInstance(), provider);
  return credential.user.getIdToken();
}

/** The user closing or blocking the popup is a cancel, not an error. */
export function isPopupDismissal(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? '';
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}

/** Human-readable reason for a popup or API failure during Google sign-in. */
export function googleAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  if (code === 'auth/popup-blocked') {
    return 'The sign-in popup was blocked — allow popups for this site and try again.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account with this email already exists. Sign in with your password first.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Google sign-in failed — please try again.';
}
