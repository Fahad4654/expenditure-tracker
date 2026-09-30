/**
 * Small, dependency-free environment helpers for Node processes (the NestJS
 * API, Prisma seeding, Docker entrypoints). Not safe to import from browser
 * code — `process` is not defined there. Fails fast with a clear message
 * instead of letting `undefined` propagate into production.
 */

function readRaw(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

export function requireEnv(name: string): string {
  const value = readRaw(name);
  if (value === undefined) {
    throw new Error(
      `Missing required environment variable "${name}". Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return readRaw(name) ?? fallback;
}

export function optionalIntEnv(name: string, fallback: number): number {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable "${name}" must be an integer, got "${raw}".`);
  }
  return parsed;
}

export function optionalBoolEnv(name: string, fallback: boolean): boolean {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/** Splits `CORS_ORIGINS=http://a,http://b` into a trimmed array. */
export function optionalListEnv(name: string, fallback: string[] = []): string[] {
  const raw = readRaw(name);
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
