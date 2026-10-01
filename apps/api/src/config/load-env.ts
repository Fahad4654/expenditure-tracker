import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the backend's `apps/api/.env` exactly once, before any config
 * validation runs.
 *
 * Precedence (highest first):
 *   1. Variables already present in `process.env` (shell/CI) — never
 *      overwritten, because `process.loadEnvFile` skips existing keys.
 *   2. `apps/api/.env` — resolved relative to this module, so the file is
 *      found no matter which directory the process was started from. The web
 *      client keeps its own `apps/web/.env`, loaded by Vite.
 *
 * Uses Node's built-in loader, so no dotenv dependency is required.
 */
let loaded = false;

export function loadApiEnv(): void {
  if (loaded) return;
  loaded = true;

  const file = resolve(__dirname, '../../.env');
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch {
    // Unreadable/invalid env files must not crash the process; validation
    // below will report the missing variables with a clear message.
  }
}
