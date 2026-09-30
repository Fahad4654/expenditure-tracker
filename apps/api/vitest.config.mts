import { defineConfig } from 'vitest/config';

// Tests run with the same environment as the app. The repo-root `.env` is
// optional — tests must not depend on secrets.
try {
  process.loadEnvFile('../../.env');
} catch {
  // no .env available (CI) — fine
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
});
