import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The monorepo keeps a single `.env` at the repo root. Vite only reads `.env`
// files from `envDir`, so point it at the root. Only `VITE_*` keys are ever
// exposed to the browser (`DATABASE_URL`, JWT secrets, … stay private), and
// variables already present in `process.env` — CI — take precedence.
//
// Gotcha: the root `.env` sets `NODE_ENV=development` for the API, and Vite
// treats `NODE_ENV` specially (it is loaded regardless of the `VITE_` prefix).
// Left alone, a local `vite build` would ship React's development build. The
// `build` script therefore pins `NODE_ENV=production`.
const repoRootEnvDir = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  envDir: repoRootEnvDir,
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 3000,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    // Hashed asset filenames → safe to serve with a 1-year immutable cache.
    assetsDir: 'assets',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
