import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import { PasswordService } from '../src/auth/password.service';
import type { TokenService } from '../src/auth/token.service';

const PASSWORD = 'Passw0rd-123';

const CONFIG: Record<string, unknown> = {
  'auth.login.maxFailedAttempts': 3,
  'auth.login.lockoutSeconds': 900,
  'finance.defaultCurrency': 'BDT',
  'finance.defaultTimezone': 'Asia/Dhaka',
};

/** Cheap Argon2 params — these tests only need real hashing semantics. */
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
    rotateRefreshToken: vi.fn().mockResolvedValue({
      token: 'refresh-2',
      familyId: 'fam-1',
      rotationIndex: 1,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    }),
  };
}

function prismaMock() {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: undefined as unknown as ReturnType<typeof vi.fn>,
  };
  prisma.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function otpsMock() {
  return {
    sendEmailOtp: vi.fn(),
    consumeEmailOtp: vi.fn().mockResolvedValue(undefined),
  };
}

function googleMock() {
  return { verify: vi.fn() };
}

async function expectRejection(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught as HttpException,
  );
  expect(error, 'expected the operation to reject').toBeInstanceOf(HttpException);
  expect(error!.getStatus()).toBe(status);
  expect(error!.getResponse()).toMatchObject({ code });
  return error!;
}

const CONTEXT = { userAgent: 'vitest', ip: '127.0.0.1' };

describe('AuthService.register', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let tokens: ReturnType<typeof tokensMock>;
  let otps: ReturnType<typeof otpsMock>;
  let auth: AuthService;

  beforeEach(async () => {
    prisma = prismaMock();
    tokens = tokensMock();
    otps = otpsMock();
    auth = new AuthService(
      prisma as never,
      passwords,
      tokens as unknown as TokenService,
      otps as never,
      googleMock() as never,
      { get: (key: string) => CONFIG[key] } as never,
    );
  });

  it('creates the account and issues a session', async () => {
    const hash = await passwords.hash(PASSWORD);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRecord({ passwordHash: hash }));

    const result = await auth.register(
      { name: 'Alice', email: 'alice@example.com', password: PASSWORD, code: '123456' } as never,
      CONTEXT,
    );

    expect(otps.consumeEmailOtp).toHaveBeenCalledWith(expect.anything(), 'alice@example.com', 'REGISTER', '123456');
    expect(result.session).toMatchObject({ accessToken: 'access-1', expiresIn: 900 });
    expect(result.session.user).toMatchObject({ email: 'alice@example.com' });
    expect(result.csrfToken).toBeTruthy();
    expect(tokens.issueRefreshToken).toHaveBeenCalledWith('user-1', CONTEXT);
    // Defaults come from config, not from the request.
    expect(prisma.user.create.mock.calls[0]![0].data).toMatchObject({
      defaultCurrency: 'BDT',
      timezone: 'Asia/Dhaka',
    });
  });

  it('hashes the password before it reaches the database', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: never) => userRecord(data));

    await auth.register(
      { name: 'A', email: 'a@example.com', password: PASSWORD, code: '123456' } as never,
      CONTEXT,
    );

    const stored = prisma.user.create.mock.calls[0]![0].data.passwordHash as string;
    expect(stored).not.toContain(PASSWORD);
    await expect(passwords.verify(stored, PASSWORD)).resolves.toBe(true);
  });

  it('rejects a taken email with 409 without creating a row', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'other' });

    await expectRejection(
      auth.register(
        { name: 'A', email: 'taken@example.com', password: PASSWORD, code: '123456' } as never,
        CONTEXT,
      ),
      409,
      'CONFLICT',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let tokens: ReturnType<typeof tokensMock>;
  let auth: AuthService;
  let hash: string;

  beforeEach(async () => {
    prisma = prismaMock();
    tokens = tokensMock();
    auth = new AuthService(
      prisma as never,
      passwords,
      tokens as unknown as TokenService,
      otpsMock() as never,
      googleMock() as never,
      { get: (key: string) => CONFIG[key] } as never,
    );
    hash = await passwords.hash(PASSWORD);
    prisma.user.update.mockResolvedValue(userRecord());
  });

  it('returns the same code for a wrong password and a missing account', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord({ passwordHash: hash }));
    await expectRejection(
      auth.login({ email: 'alice@example.com', password: 'nope-nope' } as never, CONTEXT),
      401,
      'INVALID_CREDENTIALS',
    );

    prisma.user.findUnique.mockResolvedValue(null);
    await expectRejection(
      auth.login({ email: 'ghost@example.com', password: PASSWORD } as never, CONTEXT),
      401,
      'INVALID_CREDENTIALS',
    );
  });

  it('burns a real Argon2 round even when the account does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const spy = vi.spyOn(passwords, 'verifyAgainstDummy').mockResolvedValue(false);

    await expectRejection(
      auth.login({ email: 'ghost@example.com', password: PASSWORD } as never, CONTEXT),
      401,
      'INVALID_CREDENTIALS',
    );
    expect(spy).toHaveBeenCalledWith(PASSWORD);
    spy.mockRestore();
  });

  it('counts failures and locks the account at the configured threshold', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord({ passwordHash: hash, failedLogins: 2 }));

    // Third failure reaches maxFailedAttempts = 3: the counter resets and the
    // lock starts.
    await expectRejection(
      auth.login({ email: 'alice@example.com', password: 'nope-nope' } as never, CONTEXT),
      401,
      'INVALID_CREDENTIALS',
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLogins: 0,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('returns 429 ACCOUNT_LOCKED while the lock is live', async () => {
    prisma.user.findUnique.mockResolvedValue(
      userRecord({
        passwordHash: hash,
        failedLogins: 0,
        lockedUntil: new Date(Date.now() + 60_000),
      }),
    );

    await expectRejection(
      auth.login({ email: 'alice@example.com', password: PASSWORD } as never, CONTEXT),
      429,
      'ACCOUNT_LOCKED',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('issues a session and resets the counter on success', async () => {
    prisma.user.findUnique.mockResolvedValue(userRecord({ passwordHash: hash, failedLogins: 2 }));

    const result = await auth.login(
      { email: 'alice@example.com', password: PASSWORD } as never,
      CONTEXT,
    );

    expect(result.session.accessToken).toBe('access-1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { failedLogins: 0, lockedUntil: null, lastLoginAt: expect.any(Date) },
      }),
    );
  });

  it('refuses a soft-deleted account even with the right password', async () => {
    prisma.user.findUnique.mockResolvedValue(
      userRecord({ passwordHash: hash, deletedAt: new Date() }),
    );

    await expectRejection(
      auth.login({ email: 'alice@example.com', password: PASSWORD } as never, CONTEXT),
      401,
      'INVALID_CREDENTIALS',
    );
  });
});

describe('AuthService.refresh', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let tokens: ReturnType<typeof tokensMock>;
  let auth: AuthService;

  beforeEach(() => {
    prisma = prismaMock();
    tokens = tokensMock();
    auth = new AuthService(
      prisma as never,
      passwords,
      tokens as unknown as TokenService,
      otpsMock() as never,
      googleMock() as never,
      { get: (key: string) => CONFIG[key] } as never,
    );
  });

  it('rejects a missing token', async () => {
    await expectRejection(auth.refresh(undefined, CONTEXT), 401, 'REFRESH_TOKEN_INVALID');
  });

  it('rejects an unverifiable token', async () => {
    tokens.verifyRefreshToken.mockRejectedValue(new Error('bad signature'));
    await expectRejection(auth.refresh('garbage', CONTEXT), 401, 'REFRESH_TOKEN_INVALID');
  });

  it('rotates a valid token and mints a new access token', async () => {
    tokens.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', fid: 'fam-1', rot: 0 });
    tokens.findRefreshRow.mockResolvedValue({
      id: 'row-1',
      userId: 'user-1',
      familyId: 'fam-1',
      rotationIndex: 0,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    prisma.user.findFirst.mockResolvedValue(userRecord());

    const result = await auth.refresh('refresh-1', CONTEXT);

    expect(result.session.refreshToken).toBe('refresh-2');
    expect(result.session.accessToken).toBe('access-1');
    expect(tokens.rotateRefreshToken).toHaveBeenCalledWith(
      { id: 'row-1', familyId: 'fam-1', userId: 'user-1', rotationIndex: 0 },
      CONTEXT,
    );
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    tokens.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', fid: 'fam-1', rot: 0 });
    tokens.findRefreshRow.mockResolvedValue({
      id: 'row-1',
      userId: 'user-1',
      familyId: 'fam-1',
      rotationIndex: 0,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
    });

    await expectRejection(auth.refresh('stale-refresh', CONTEXT), 401, 'REFRESH_TOKEN_INVALID');
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1');
    expect(tokens.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('revokes the family when the DB row and the JWT disagree on rotation', async () => {
    tokens.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', fid: 'fam-1', rot: 5 });
    tokens.findRefreshRow.mockResolvedValue({
      id: 'row-1',
      userId: 'user-1',
      familyId: 'fam-1',
      rotationIndex: 2,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });

    await expectRejection(auth.refresh('refresh-1', CONTEXT), 401, 'REFRESH_TOKEN_INVALID');
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1');
  });

  it('revokes the family when the account no longer exists', async () => {
    tokens.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', fid: 'fam-1', rot: 0 });
    tokens.findRefreshRow.mockResolvedValue({
      id: 'row-1',
      userId: 'user-1',
      familyId: 'fam-1',
      rotationIndex: 0,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    prisma.user.findFirst.mockResolvedValue(null);

    await expectRejection(auth.refresh('refresh-1', CONTEXT), 401, 'REFRESH_TOKEN_INVALID');
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1');
  });
});

describe('AuthService.logout', () => {
  it('is a no-op without a token', async () => {
    const tokens = tokensMock();
    const auth = new AuthService(
      prismaMock() as never,
      passwords,
      tokens as unknown as TokenService,
      otpsMock() as never,
      googleMock() as never,
      { get: (key: string) => CONFIG[key] } as never,
    );

    await expect(auth.logout(undefined)).resolves.toBeNull();
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });

  it('revokes the family even when the row lookup fails', async () => {
    const tokens = tokensMock();
    tokens.verifyRefreshToken.mockResolvedValue({ sub: 'user-1', fid: 'fam-1', rot: 0 });
    tokens.findRefreshRow.mockResolvedValue(null);
    const auth = new AuthService(
      prismaMock() as never,
      passwords,
      tokens as unknown as TokenService,
      otpsMock() as never,
      googleMock() as never,
      { get: (key: string) => CONFIG[key] } as never,
    );

    await expect(auth.logout('refresh-1')).resolves.toBeNull();
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1');
  });
});
