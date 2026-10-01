import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// The web client keeps its own `apps/web/.env` (Vite's default `envDir` — the
// directory this config lives in). Only `VITE_*` keys are ever inlined into
// the browser bundle; the backend's secrets live in `apps/api/.env` and are
// never exposed here. `WEB_PORT` is read from the same file (a value already
// in `process.env` wins), which is what the `dev`/`preview` scripts use to
// pick their port.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '');
  const webPort = Number(process.env.WEB_PORT ?? env.WEB_PORT) || 3000;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: webPort,
    },
    preview: {
      host: true,
      // Preview keeps its own default; an exported WEB_PORT still overrides.
      port: Number(process.env.WEB_PORT) || 4173,
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
  };
});
