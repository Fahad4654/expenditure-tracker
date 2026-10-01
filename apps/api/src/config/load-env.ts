import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the monorepo `.env` file exactly once, before any config validation
 * runs.
 *
 * Precedence (highest first):
 *   1. Variables already present in `process.env` (shell/CI) — never
 *      overwritten, because `process.loadEnvFile` skips existing keys.
 *   2. `apps/api/.env` (workspace-local overrides, optional).
 *   3. Repo-root `.env` (the single source of truth for local development).
 *
 * Uses Node's built-in loader, so no dotenv dependency is required.
 */
let loaded = false;

export function loadRepoEnv(): void {
  if (loaded) return;
  loaded = true;

  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
    } catch {
      // Unreadable/invalid env files must not crash the process; validation
      // below will report the missing variables with a clear message.
    }
  }
}
