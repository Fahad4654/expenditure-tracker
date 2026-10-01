import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COOKIE_NAMES } from '../src/shared/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CookieCsrfGuard } from '../src/common/guards/cookie-csrf.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import type { TokenService } from '../src/auth/token.service';

function contextFor(request: unknown): ExecutionContext {
  const handler = () => undefined;
  const klass = class {};
  return {
    getHandler: () => handler,
    getClass: () => klass,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function statusOf(fn: () => unknown): { status: number; body: unknown } {
  try {
    fn();
    return { status: 0, body: 'did not throw' };
  } catch (error) {
    const ex = error as HttpException;
    return { status: ex.getStatus(), body: ex.getResponse() };
  }
}

async function rejectionOf(promise: Promise<unknown>): Promise<HttpException | null> {
  return promise.then(
    () => null,
    (caught: unknown) => caught as HttpException,
  );
}

describe('CookieCsrfGuard', () => {
  const guard = new CookieCsrfGuard();

  it('is a no-op when no refresh cookie is present (bearer/mobile clients)', () => {
    expect(guard.canActivate(contextFor({ cookies: {}, headers: {} }))).toBe(true);
    expect(guard.canActivate(contextFor({ headers: {} }))).toBe(true);
  });

  it('rejects a cookie-authenticated request with no CSRF header', () => {
    const result = statusOf(() =>
      guard.canActivate(
        contextFor({
          cookies: { [COOKIE_NAMES.refreshToken]: 'r', [COOKIE_NAMES.csrfToken]: 'c' },
          headers: {},
        }),
      ),
    );
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({ code: 'CSRF_INVALID' });
  });

  it('rejects a mismatched CSRF header', () => {
    const result = statusOf(() =>
      guard.canActivate(
        contextFor({
          cookies: { [COOKIE_NAMES.refreshToken]: 'r', [COOKIE_NAMES.csrfToken]: 'c' },
          headers: { 'x-csrf-token': 'not-c' },
        }),
      ),
    );
    expect(result.status).toBe(403);
  });

  it('rejects when the CSRF cookie was never set', () => {
    const result = statusOf(() =>
      guard.canActivate(
        contextFor({
          cookies: { [COOKIE_NAMES.refreshToken]: 'r' },
          headers: { 'x-csrf-token': 'anything' },
        }),
      ),
    );
    expect(result.status).toBe(403);
  });

  it('accepts a matching double-submit token', () => {
    expect(
      guard.canActivate(
        contextFor({
          cookies: { [COOKIE_NAMES.refreshToken]: 'r', [COOKIE_NAMES.csrfToken]: 'c' },
          headers: { 'x-csrf-token': 'c' },
        }),
      ),
    ).toBe(true);
  });
});

describe('JwtAuthGuard', () => {
  let tokens: { verifyAccessToken: ReturnType<typeof vi.fn> };
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tokens = { verifyAccessToken: vi.fn() };
    reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
  });

  const makeGuard = () =>
    new JwtAuthGuard(reflector as unknown as Reflector, tokens as unknown as TokenService);

  it('lets @Public() routes through without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(makeGuard().canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a request with no Authorization header', async () => {
    const error = await rejectionOf(makeGuard().canActivate(contextFor({ headers: {} })));
    expect(error?.getStatus()).toBe(401);
    expect(error?.getResponse()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a non-Bearer scheme', async () => {
    const error = await rejectionOf(
      makeGuard().canActivate(contextFor({ headers: { authorization: 'Basic abc' } })),
    );
    expect(error?.getStatus()).toBe(401);
    expect(error?.getResponse()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('attaches sub from the verified token — the only source of user identity', async () => {
    tokens.verifyAccessToken.mockResolvedValue({ sub: 'user-1', fid: 'fam-1' });
    const request = { headers: { authorization: 'Bearer  jwt-token' } };

    await expect(makeGuard().canActivate(contextFor(request))).resolves.toBe(true);
    expect(tokens.verifyAccessToken).toHaveBeenCalledWith('jwt-token');
    expect(request).toMatchObject({ user: { sub: 'user-1', fid: 'fam-1' } });
  });

  it('maps any verification failure to the same 401', async () => {
    tokens.verifyAccessToken.mockRejectedValue(new Error('jwt expired'));
    const error = await rejectionOf(
      makeGuard().canActivate(contextFor({ headers: { authorization: 'Bearer nope' } })),
    );
    expect(error?.getStatus()).toBe(401);
    expect(error?.getResponse()).toMatchObject({ code: 'UNAUTHORIZED' });
    // The underlying JWT message must not leak.
    expect(JSON.stringify(error?.getResponse())).not.toContain('jwt expired');
  });
});
