/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the NestJS API, e.g. `http://localhost:4000`. */
  readonly VITE_API_URL?: string;

  /** Firebase web config (public; Google sign-in hides itself when absent). */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
