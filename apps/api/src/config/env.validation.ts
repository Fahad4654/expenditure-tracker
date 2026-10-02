import { z } from 'zod';

/**
 * Environment contract. Validated once at boot so the process fails fast with
 * a readable message instead of crashing later inside a request handler.
 */

/** Zod's `z.coerce.boolean()` is `Boolean(value)`, so `"false"` becomes `true`. */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean'
      ? value
      : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().min(1).default('0.0.0.0'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().min(1).default('15m'),
  JWT_REFRESH_TTL: z.string().min(1).default('30d'),
  JWT_ISSUER: z.string().min(1).default('expenditure-tracker'),
  JWT_AUDIENCE: z.string().min(1).default('expenditure-tracker-clients'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: booleanish.default(false),

  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),

  DEFAULT_CURRENCY: z.string().length(3).default('BDT'),
  DEFAULT_TIMEZONE: z.string().min(1).default('Asia/Dhaka'),

  // --- Argon2id password hashing (KiB of memory / iterations / lanes) -------
  ARGON2_MEMORY_COST: z.coerce.number().int().min(8192).max(1048576).default(65536),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).max(16).default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(1),

  // --- Login brute-force lockout --------------------------------------------
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(10),
  LOGIN_LOCKOUT_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),

  MAX_REQUEST_BODY_SIZE: z.string().min(1).default('100kb'),
  LOG_LEVEL: z.string().default('debug'),

  // --- Mail (OTP delivery) ---------------------------------------------------
  MAIL_SEND: booleanish.default(false),
  SMTP_HOST: z.string().min(1).default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_APP_PASSWORD: z.string().default(''),
  SMTP_FROM_EMAIL: z.string().default(''),

  // --- Firebase (Google sign-in via ID-token verification) -------------------
  FIREBASE_PROJECT_ID: z.string().min(1).default('expenditure-tracker-9ff14'),
  FIREBASE_JWKS_URL: z
    .string()
    .url()
    .default('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(env: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
