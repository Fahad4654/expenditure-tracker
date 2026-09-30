import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.module';

/**
 * Smoke tests for the response envelope, error envelope and health probes.
 * DB-free: `PrismaService` is mocked so the suite runs without infrastructure.
 */
describe('health + response envelope', () => {
  let app: INestApplication;
  let prismaMock: { $queryRaw: () => Promise<unknown> };

  beforeEach(async () => {
    prismaMock = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health/live returns the success envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toMatchObject({ ok: true, data: { status: 'ok' } });
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
  });

  it('GET /health/ready reports dependency checks', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.checks.postgres).toMatchObject({ status: 'up' });
    expect(typeof res.body.data.checks.postgres.latencyMs).toBe('number');
  });

  it('GET /health/ready returns 503 envelope when the database is down', async () => {
    prismaMock.$queryRaw = vi.fn().mockRejectedValue(new Error('connection refused'));
    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(res.body).toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    // The underlying error message must not leak to the client.
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });

  it('unknown routes return the failure envelope with a stable code', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
