import { API_PREFIX, optionalEnv } from '../shared/config';

/**
 * Typed application configuration assembled from `process.env` after
 * `validateEnv` has run. Access through `ConfigService<Env, true>` in injectables.
 */
export const configuration = () => ({
  env: process.env.NODE_ENV ?? 'development',
  apiPrefix: API_PREFIX,
  app: {
    port: Number(process.env.API_PORT ?? 4000),
    host: process.env.API_HOST ?? '0.0.0.0',
    publicApiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:4000',
    publicWebUrl: process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    maxRequestBodySize: process.env.MAX_REQUEST_BODY_SIZE ?? '100kb',
    logLevel: process.env.LOG_LEVEL ?? 'debug',
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
    issuer: process.env.JWT_ISSUER ?? 'expenditure-tracker',
    audience: process.env.JWT_AUDIENCE ?? 'expenditure-tracker-clients',
    cookieDomain: process.env.COOKIE_DOMAIN ?? 'localhost',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    argon2: {
      memoryCost: Number(process.env.ARGON2_MEMORY_COST ?? 65536),
      timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
      parallelism: Number(process.env.ARGON2_PARALLELISM ?? 1),
    },
    login: {
      maxFailedAttempts: Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS ?? 10),
      lockoutSeconds: Number(process.env.LOGIN_LOCKOUT_SECONDS ?? 900),
    },
    google: {
      clientId: optionalEnv('GOOGLE_CLIENT_ID', ''),
      clientSecret: optionalEnv('GOOGLE_CLIENT_SECRET', ''),
      callbackUrl: optionalEnv(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:4000/api/v1/auth/google/callback',
      ),
    },
  },
  finance: {
    defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'BDT',
    defaultTimezone: process.env.DEFAULT_TIMEZONE ?? 'Asia/Dhaka',
  },
  mail: {
    // MAIL_SEND=false suppresses delivery (dev/test); responses then carry a
    // `devCode` outside production so flows stay completable.
    send: ['1', 'true', 'yes', 'on'].includes(
      (process.env.MAIL_SEND ?? 'false').trim().toLowerCase(),
    ),
    host: optionalEnv('SMTP_HOST', 'smtp.gmail.com'),
    port: Number(optionalEnv('SMTP_PORT', '587')),
    appPassword: optionalEnv('SMTP_APP_PASSWORD', ''),
    fromEmail: optionalEnv('SMTP_FROM_EMAIL', ''),
  },
  firebase: {
    projectId: optionalEnv('FIREBASE_PROJECT_ID', 'expenditure-tracker-9ff14'),
    jwksUrl: optionalEnv(
      'FIREBASE_JWKS_URL',
      'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    ),
  },
});

export type AppConfig = ReturnType<typeof configuration>;
