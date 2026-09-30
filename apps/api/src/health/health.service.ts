import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

export interface HealthCheck {
  status: 'up' | 'down';
  latencyMs?: number;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live(): { status: 'ok'; uptimeSeconds: number; timestamp: string } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async ready(): Promise<{ status: 'ok'; checks: Record<string, HealthCheck> }> {
    const checks: Record<string, HealthCheck> = {};

    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = { status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      checks.postgres = { status: 'down' };
    }

    if (checks.postgres?.status !== 'up') {
      throw new ServiceUnavailableException('PostgreSQL is not reachable');
    }

    return { status: 'ok', checks };
  }
}
