import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { GoogleOauthService } from '../src/auth/google-oauth.service';
import { GoogleTokenService } from '../src/auth/google-token.service';
import { OtpService } from '../src/auth/otp.service';
import { PasswordService } from '../src/auth/password.service';
import { TokenService } from '../src/auth/token.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { MailerService } from '../src/mail/mailer.service';
import { PrismaService } from '../src/prisma/prisma.module';
import { API_PREFIX, COOKIE_NAMES } from '../src/shared/config';
import { GOOGLE_STATE_COOKIE } from '../src/auth/cookies';
import { errors } from '../src/common/http/api-error';

/**
 * Endpoint tests for the email-OTP and Google auth flows. DB-free: Prisma,
 * the mailer and the Google verifier are mocked; passwords are real Argon2
 * with cheap params. `MAIL_SEND=false` + `env=test` makes `devCode` visible,
 * which is exactly how dev machines complete these flows.
 */
describe('auth endpoints: email OTP + Google', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof prismaMock>;
  let tokens: ReturnType<typeof tokensMock>;
  let mailer: { deliveryEnabled: boolean; sendOtpCode: ReturnType<typeof vi.fn> };
  let google: { verify: ReturnType<typeof vi.fn> };

  const CONFIG: Record<string, unknown> = {
    env: 'test',
    'auth.refreshTtl': '30d',
    'auth.cookieSecure': false,
    'auth.cookieDomain': undefined,
    'auth.login.maxFailedAttempts': 3,
    'auth.login.lockoutSeconds': 900,
    'jwt.accessSecret': 'test-access-secret-with-at-least-32-characters',
    'app.publicWebUrl': 'http://localhost:3000',
    'app.corsOrigins': ['http://localhost:3000'],
    'google.clientId': 'client-id.test',
    'google.clientSecret': 'client-secret.test',
    'google.callbackUrl': 'http://localhost:4000/api/v1/auth/google/callback',
    'finance.defaultCurrency': 'BDT',
    'finance.defaultTimezone': 'Asia/Dhaka',
  };

  /** Cheap Argon2 params — enough for real verification semantics. */
  const passwords = new PasswordService({
    get: (key: string) =>
      key === 'auth.argon2.memoryCost' ? 4096 : key === 'auth.argon2.timeCost' ? 1 : 1,
  } as never);

  const NOW = new Date('2026-01-01T00:00:00.000Z');

  function userRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      name: 'Alice',
      email: 'alice@example.com',
      phone: null,
      googleId: null,
      avatarUrl: null,
      emailVerified: false,
      phoneVerified: false,
      role: 'USER',
      defaultCurrency: 'BDT',
      timezone: 'Asia/Dhaka',
      passwordHash: null as string | null,
      failedLogins: 0,
      lockedUntil: null as Date | null,
      lastLoginAt: null as Date | null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null as Date | null,
      ...overrides,
    };
  }

  function prismaMock() {
    const mock = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      otpCode: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 10 * 60_000) }),
        update: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: undefined as unknown as ReturnType<typeof vi.fn>,
    };
    mock.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(mock));
    return mock;
  }

  function tokensMock() {
    return {
      accessTokenTtlSeconds: 900,
      issueRefreshToken: vi.fn().mockResolvedValue({
        token: 'refresh-1',
        familyId: 'fam-1',
        rotationIndex: 0,
        expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
      signAccessToken: vi.fn().mockResolvedValue('access-1'),
      verifyRefreshToken: vi.fn(),
      findRefreshRow: vi.fn(),
      revokeFamily: vi.fn().mockResolvedValue(undefined),
      revokeAllFamiliesForUser: vi.fn().mockResolvedValue(undefined),
      rotateRefreshToken: vi.fn(),
    };
  }

  /** An OTP row whose hash matches `code`, valid for another 5 minutes. */
  async function otpRow(code: string, overrides: Record<string, unknown> = {}) {
    return {
      id: 'otp-1',
      email: 'alice@example.com',
      phone: null,
      codeHash: await passwords.hash(code),
      purpose: 'REGISTER',
      consumedAt: null,
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      createdAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = prismaMock();
    tokens = tokensMock();
    mailer = { deliveryEnabled: false, sendOtpCode: vi.fn().mockResolvedValue(undefined) };
    google = { verify: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        OtpService,
        { provide: PasswordService, useValue: passwords },
        { provide: TokenService, useValue: tokens },
        { provide: MailerService, useValue: mailer },
        { provide: GoogleTokenService, useValue: google },
        GoogleOauthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (k: string) => CONFIG[k] } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  describe('POST /auth/otp/send', () => {
    it('issues a challenge with devCode while mail delivery is off', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/otp/send')
        .send({ email: 'alice@example.com', purpose: 'REGISTER' })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data).toMatchObject({ email: 'alice@example.com', resendAfterSeconds: 60 });
      expect(res.body.data.devCode).toMatch(/^\d{6}$/);
      expect(res.body.data.expiresAt).toBeTruthy();
      expect(mailer.sendOtpCode).toHaveBeenCalledWith(
        'alice@example.com',
        expect.stringMatching(/^\d{6}$/),
        'REGISTER',
      );
      expect(prisma.otpCode.create).toHaveBeenCalled();
      expect(prisma.otpCode.deleteMany).toHaveBeenCalledWith({
        where: { email: 'alice@example.com', purpose: 'REGISTER', consumedAt: null },
      });
    });

    it('rate-limits a resend inside the cooldown window', async () => {
      prisma.otpCode.findFirst.mockResolvedValue({ createdAt: new Date() });

      const res = await request(app.getHttpServer())
        .post('/auth/otp/send')
        .send({ email: 'alice@example.com', purpose: 'REGISTER' })
        .expect(429);

      expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED' });
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
    });

    it('rejects an invalid purpose with the validation envelope', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/otp/send')
        .send({ email: 'alice@example.com', purpose: 'WHATEVER' })
        .expect(422);

      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'purpose' })]),
      );
    });
  });

  describe('POST /auth/register with email OTP', () => {
    it('consumes the code atomically and issues a verified session', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.otpCode.findFirst.mockResolvedValue(await otpRow('123456'));
      prisma.user.create.mockImplementation(async ({ data }: never) => userRecord(data));

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'alice@example.com', password: 'Passw0rd-123', code: '123456' })
        .expect(201);

      expect(prisma.otpCode.findFirst).toHaveBeenCalled();
      expect(prisma.user.create.mock.calls[0]![0].data).toMatchObject({ emailVerified: true });
      expect(res.body.data).toMatchObject({ accessToken: 'access-1' });
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain(`${COOKIE_NAMES.refreshToken}=`);
      expect(cookies.join(';')).toContain(`${COOKIE_NAMES.csrfToken}=`);
    });

    it('rejects a wrong code with OTP_INVALID and creates no account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.otpCode.findFirst.mockResolvedValue(await otpRow('111111'));

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'a@example.com', password: 'Passw0rd-123', code: '999999' })
        .expect(400);

      expect(res.body.error).toMatchObject({ code: 'OTP_INVALID' });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.otpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ attempts: 1 }) }),
      );
    });

    it('rejects an expired code with OTP_EXPIRED', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.otpCode.findFirst.mockResolvedValue(
        await otpRow('123456', { expiresAt: new Date(Date.now() - 1000) }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'a@example.com', password: 'Passw0rd-123', code: '123456' })
        .expect(400);

      expect(res.body.error).toMatchObject({ code: 'OTP_EXPIRED' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('locks out after too many wrong attempts', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.otpCode.findFirst.mockResolvedValue(await otpRow('111111', { attempts: 5 }));

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'a@example.com', password: 'Passw0rd-123', code: '111111' })
        .expect(400);

      expect(res.body.error).toMatchObject({ code: 'OTP_TOO_MANY_ATTEMPTS' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('requires the code field', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Alice', email: 'a@example.com', password: 'Passw0rd-123' })
        .expect(422);

      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'code' })]),
      );
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('answers with the same challenge shape for an unknown email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(200);

      expect(res.body.data).toMatchObject({ email: 'ghost@example.com', resendAfterSeconds: 60 });
      expect(res.body.data).not.toHaveProperty('devCode');
      expect(prisma.otpCode.create).not.toHaveBeenCalled();
      expect(mailer.sendOtpCode).not.toHaveBeenCalled();
    });

    it('emails a code for a real account', async () => {
      prisma.user.findFirst.mockResolvedValue(userRecord());

      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'alice@example.com' })
        .expect(200);

      expect(res.body.data.devCode).toMatch(/^\d{6}$/);
      expect(prisma.otpCode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ purpose: 'PASSWORD_RESET' }) }),
      );
      expect(mailer.sendOtpCode).toHaveBeenCalledWith(
        'alice@example.com',
        expect.stringMatching(/^\d{6}$/),
        'PASSWORD_RESET',
      );
    });
  });

  describe('POST /auth/reset-password', () => {
    it('sets the new password, revokes all sessions and starts a new one', async () => {
      prisma.user.findFirst.mockResolvedValue(userRecord({ passwordHash: 'old-hash' }));
      prisma.otpCode.findFirst.mockResolvedValue(
        await otpRow('123456', { purpose: 'PASSWORD_RESET' }),
      );
      prisma.user.update.mockImplementation(async ({ data }: never) => userRecord(data));

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email: 'alice@example.com', code: '123456', password: 'BrandNew-456' })
        .expect(200);

      expect(tokens.revokeAllFamiliesForUser).toHaveBeenCalledWith('user-1');
      const stored = prisma.user.update.mock.calls[0]![0].data.passwordHash as string;
      expect(stored).not.toContain('BrandNew-456');
      await expect(passwords.verify(stored, 'BrandNew-456')).resolves.toBe(true);
      expect(res.body.data).toMatchObject({ accessToken: 'access-1' });
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain(`${COOKIE_NAMES.refreshToken}=`);
    });

    it('rejects a wrong code without touching the account', async () => {
      prisma.user.findFirst.mockResolvedValue(userRecord({ passwordHash: 'old-hash' }));
      prisma.otpCode.findFirst.mockResolvedValue(
        await otpRow('111111', { purpose: 'PASSWORD_RESET' }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ email: 'alice@example.com', code: '222222', password: 'BrandNew-456' })
        .expect(400);

      expect(res.body.error).toMatchObject({ code: 'OTP_INVALID' });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(tokens.revokeAllFamiliesForUser).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/google', () => {
    it('creates an account for a brand-new Google identity', async () => {
      google.verify.mockResolvedValue({
        sub: 'firebase-uid-1',
        email: 'bob@example.com',
        emailVerified: true,
        name: 'Bob',
        picture: 'https://example.com/bob.png',
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: never) => userRecord(data));

      const res = await request(app.getHttpServer())
        .post('/auth/google')
        .send({ idToken: 'a-firebase-id-token-abcdefghij' })
        .expect(200);

      expect(google.verify).toHaveBeenCalledWith('a-firebase-id-token-abcdefghij');
      expect(prisma.user.create.mock.calls[0]![0].data).toMatchObject({
        email: 'bob@example.com',
        googleId: 'firebase-uid-1',
        emailVerified: true,
      });
      expect(res.body.data).toMatchObject({ accessToken: 'access-1' });
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain(`${COOKIE_NAMES.refreshToken}=`);
    });

    it('links Google to an existing password account instead of duplicating it', async () => {
      google.verify.mockResolvedValue({
        sub: 'firebase-uid-1',
        email: 'alice@example.com',
        emailVerified: true,
        name: 'Alice',
        picture: null,
      });
      prisma.user.findFirst.mockResolvedValue(userRecord({ googleId: null }));
      prisma.user.update.mockImplementation(async ({ data }: never) => userRecord(data));

      await request(app.getHttpServer())
        .post('/auth/google')
        .send({ idToken: 'a-firebase-id-token-abcdefghij' })
        .expect(200);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update.mock.calls[0]![0].data).toMatchObject({
        googleId: 'firebase-uid-1',
        emailVerified: true,
      });
    });

    it('returns 401 for a bad Firebase token', async () => {
      google.verify.mockRejectedValue(errors.unauthorized('Google ID token is invalid or expired'));

      const res = await request(app.getHttpServer())
        .post('/auth/google')
        .send({ idToken: 'garbage-token-not-valid-xyz' })
        .expect(401);

      expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/google (browser OAuth flow)', () => {
    /** Starts the flow and hands back the signed state + its one-shot cookie. */
    async function startFlow() {
      const res = await request(app.getHttpServer())
        .get('/auth/google?redirect=/login')
        .expect(302);
      const setCookie = (res.headers['set-cookie'] ?? []) as unknown as string[];
      const stateCookie = setCookie.find((c) => c.startsWith(`${GOOGLE_STATE_COOKIE}=`));
      if (!stateCookie) throw new Error('state cookie missing from start response');
      const state = new URL(res.headers.location as string).searchParams.get('state');
      if (!state) throw new Error('state missing from start redirect');
      return { state, cookie: stateCookie.split(';')[0]! };
    }

    /** Decodes (without verifying) the state payload — white-box assertions. */
    function stateDest(state: string): string {
      const payload = JSON.parse(
        Buffer.from(state.split('.')[1]!, 'base64url').toString('utf8'),
      ) as { dest: string };
      return payload.dest;
    }

    it('redirects to Google with a signed state and a one-shot cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/google?redirect=/login')
        .expect(302);

      const url = new URL(res.headers.location as string);
      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      const params = url.searchParams;
      expect(params.get('client_id')).toBe('client-id.test');
      expect(params.get('redirect_uri')).toBe(
        'http://localhost:4000/api/v1/auth/google/callback',
      );
      expect(params.get('response_type')).toBe('code');
      expect(params.get('scope')).toBe('openid email profile');
      expect(params.get('prompt')).toBe('select_account');
      expect(params.get('state')).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(params.get('nonce')).toMatch(/^[0-9a-f]{32}$/);

      const setCookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
      expect(setCookie).toContain(`${GOOGLE_STATE_COOKIE}=`);
      expect(setCookie).toContain(`Path=${API_PREFIX}/auth/google`);
      expect(setCookie).toContain('HttpOnly');
    });

    it('bounces back with google=unavailable when credentials are missing', async () => {
      const configuredId = CONFIG['google.clientId'];
      CONFIG['google.clientId'] = '';
      try {
        const res = await request(app.getHttpServer())
          .get('/auth/google?redirect=/register')
          .expect(302);

        expect(res.headers.location).toBe('http://localhost:3000/register?google=unavailable');
        expect(res.headers['set-cookie']).toBeUndefined();
      } finally {
        CONFIG['google.clientId'] = configuredId;
      }
    });

    it('never forwards a hostile redirect target to another host', async () => {
      const hostiles = [
        'https://evil.example/steal',
        '//evil.example',
        '/\\evil.example',
        'javascript:alert(1)',
        'nowhere',
      ];
      for (const hostile of hostiles) {
        const res = await request(app.getHttpServer())
          .get(`/auth/google?redirect=${encodeURIComponent(hostile)}`)
          .expect(302);
        const state = new URL(res.headers.location as string).searchParams.get('state')!;
        expect(stateDest(state)).toBe('http://localhost:3000/login');
      }
    });

    it('exchanges the code, links the account and lands on the page that started it', async () => {
      const { state, cookie } = await startFlow();

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'google-access-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            sub: 'oauth-sub-1',
            email: 'bob@example.com',
            email_verified: true,
            name: 'Bob',
            picture: 'https://example.com/bob.png',
          }),
        });
      vi.stubGlobal('fetch', fetchMock);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }: never) => userRecord(data));

      const res = await request(app.getHttpServer())
        .get(`/auth/google/callback?code=oauth-code-1&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login');
      const setCookie = (res.headers['set-cookie'] as unknown as string[]);
      expect(setCookie.join(';')).toContain(`${COOKIE_NAMES.refreshToken}=`);
      expect(setCookie.join(';')).toContain(`${GOOGLE_STATE_COOKIE}=`);
      expect(prisma.user.create.mock.calls[0]![0].data).toMatchObject({
        email: 'bob@example.com',
        googleId: 'oauth-sub-1',
        emailVerified: true,
      });

      const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
      expect(String(tokenUrl)).toBe('https://oauth2.googleapis.com/token');
      expect(String(tokenInit.body)).toContain('grant_type=authorization_code');
      expect(String(tokenInit.body)).toContain('code=oauth-code-1');
      const [infoUrl, infoInit] = fetchMock.mock.calls[1]!;
      expect(String(infoUrl)).toBe('https://openidconnect.googleapis.com/v1/userinfo');
      expect((infoInit.headers as Record<string, string>).authorization).toBe(
        'Bearer google-access-token',
      );
    });

    it('rejects a callback without the state cookie', async () => {
      const { state } = await startFlow();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app.getHttpServer())
        .get(`/auth/google/callback?code=oauth-code-1&state=${encodeURIComponent(state)}`)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login?google=failed');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      const setCookie = ((res.headers['set-cookie'] ?? []) as unknown as string[]).join(';');
      expect(setCookie).not.toContain(`${COOKIE_NAMES.refreshToken}=`);
    });

    it('rejects a tampered state', async () => {
      const { state, cookie } = await startFlow();
      const tampered = `${state.slice(0, -1)}${state.endsWith('A') ? 'B' : 'A'}`;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app.getHttpServer())
        .get(`/auth/google/callback?code=oauth-code-1&state=${encodeURIComponent(tampered)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login?google=failed');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("surfaces Google's denial as google=denied without touching the exchange", async () => {
      const { state, cookie } = await startFlow();
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await request(app.getHttpServer())
        .get(`/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login?google=denied');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('reports google=failed when Google rejects the code', async () => {
      const { state, cookie } = await startFlow();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) }),
      );

      const res = await request(app.getHttpServer())
        .get(`/auth/google/callback?code=bad-code&state=${encodeURIComponent(state)}`)
        .set('Cookie', cookie)
        .expect(302);

      expect(res.headers.location).toBe('http://localhost:3000/login?google=failed');
      expect(prisma.user.create).not.toHaveBeenCalled();
      const setCookie = ((res.headers['set-cookie'] ?? []) as unknown as string[]).join(';');
      expect(setCookie).not.toContain(`${COOKIE_NAMES.refreshToken}=`);
    });
  });
});
