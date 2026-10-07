import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BugReportsService } from '../src/bug-reports/bug-reports.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

type Spy = ReturnType<typeof vi.fn>;

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

function reportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bug-1',
    userId: 'user-1',
    title: 'Chart renders empty',
    description: 'The monthly report chart is blank for October.',
    severity: 'MEDIUM',
    status: 'OPEN',
    area: 'Reports',
    appVersion: null,
    platform: null,
    version: 1,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

interface BugReportMock {
  findMany: Spy;
  findUnique: Spy;
  create: Spy;
  update: Spy;
}

describe('BugReportsService', () => {
  let prisma: { bugReport: BugReportMock };
  let service: BugReportsService;

  beforeEach(() => {
    prisma = {
      bugReport: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    service = new BugReportsService(prisma as never);
  });

  it('lists only the caller’s reports, newest first', async () => {
    prisma.bugReport.findMany.mockResolvedValue([reportRecord()]);

    const list = await service.list('user-1');

    expect(list).toHaveLength(1);
    expect(prisma.bugReport.findMany.mock.calls[0]![0]).toMatchObject({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('creates a report scoped to the caller with MEDIUM severity and empty context', async () => {
    prisma.bugReport.create.mockResolvedValue(reportRecord({ severity: 'MEDIUM', status: 'OPEN' }));

    const created = await service.create('user-1', {
      title: 'Chart renders empty',
      description: 'The monthly report chart is blank for October.',
    } as never);

    const createArgs = prisma.bugReport.create.mock.calls[0]![0] as { data: unknown };
    expect(createArgs.data).toMatchObject({
      userId: 'user-1',
      title: 'Chart renders empty',
      description: 'The monthly report chart is blank for October.',
      severity: 'MEDIUM',
      area: null,
      appVersion: null,
      platform: null,
    });
    expect(created.id).toBe('bug-1');
    expect(created.status).toBe('OPEN');
    expect(created.createdAt).toBe(NOW.toISOString());
  });

  it('captures the client-reported severity and context verbatim', async () => {
    prisma.bugReport.create.mockResolvedValue(
      reportRecord({ severity: 'CRITICAL', platform: 'android', appVersion: '1.4.0' }),
    );

    await service.create('user-1', {
      title: 'App crashes on launch',
      description: 'Crashes before the dashboard paints.',
      severity: 'CRITICAL',
      area: 'Dashboard',
      appVersion: '1.4.0',
      platform: 'android',
    } as never);

    const createArgs = prisma.bugReport.create.mock.calls[0]![0] as { data: unknown };
    expect(createArgs.data).toMatchObject({
      severity: 'CRITICAL',
      area: 'Dashboard',
      appVersion: '1.4.0',
      platform: 'android',
    });
  });

  it('never lets the client choose a triage status', async () => {
    prisma.bugReport.create.mockResolvedValue(reportRecord());

    await service.create('user-1', {
      title: 'Wrong total',
      description: 'Balance is off by one taka.',
      status: 'RESOLVED',
    } as never);

    const data = (prisma.bugReport.create.mock.calls[0]![0] as { data: unknown }).data;
    expect(data).not.toHaveProperty('status');
  });

  it('reports another user’s report as missing', async () => {
    prisma.bugReport.findUnique.mockResolvedValue(reportRecord({ userId: 'user-2' }));

    await expectRejection(service.remove('user-1', 'bug-1'), 404, 'NOT_FOUND');
    expect(prisma.bugReport.update).not.toHaveBeenCalled();
  });

  it('reports a tombstoned report as missing', async () => {
    prisma.bugReport.findUnique.mockResolvedValue(reportRecord({ deletedAt: NOW }));

    await expectRejection(service.remove('user-1', 'bug-1'), 404, 'NOT_FOUND');
    expect(prisma.bugReport.update).not.toHaveBeenCalled();
  });

  it('tombstones rather than hard-deletes', async () => {
    prisma.bugReport.findUnique.mockResolvedValue(reportRecord());
    prisma.bugReport.update.mockResolvedValue(reportRecord({ deletedAt: NOW, version: 2 }));

    const deleted = await service.remove('user-1', 'bug-1');

    const updateArgs = prisma.bugReport.update.mock.calls[0]![0] as {
      data: { deletedAt: unknown };
    };
    expect(updateArgs).toMatchObject({
      where: { id: 'bug-1' },
      data: { version: { increment: 1 } },
    });
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(deleted.id).toBe('bug-1');
  });

  describe('admin', () => {
    const reporter = { id: 'user-9', name: 'Bob Khan', email: 'bob@example.com' };
    const adminRecord = (overrides: Record<string, unknown> = {}) =>
      reportRecord({ ...overrides, user: reporter });

    it('lists every report, unscoped by user, with the reporter joined in', async () => {
      prisma.bugReport.findMany.mockResolvedValue([adminRecord()]);

      const list = await service.listAll();

      expect(prisma.bugReport.findMany.mock.calls[0]![0]).toMatchObject({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      expect(list[0]).toMatchObject({
        id: 'bug-1',
        userId: 'user-9',
        reporterName: 'Bob Khan',
        reporterEmail: 'bob@example.com',
      });
    });

    it('applies a triage status and bumps the sync version', async () => {
      prisma.bugReport.findUnique.mockResolvedValue(reportRecord());
      prisma.bugReport.update.mockResolvedValue(adminRecord({ status: 'RESOLVED', version: 2 }));

      const updated = await service.setStatus('bug-1', 'RESOLVED');

      expect(prisma.bugReport.update.mock.calls[0]![0]).toMatchObject({
        where: { id: 'bug-1' },
        data: { status: 'RESOLVED', version: { increment: 1 } },
      });
      expect(updated).toMatchObject({
        status: 'RESOLVED',
        reporterName: 'Bob Khan',
        reporterEmail: 'bob@example.com',
      });
    });

    it('refuses to triage a tombstoned report', async () => {
      prisma.bugReport.findUnique.mockResolvedValue(reportRecord({ deletedAt: NOW }));

      await expectRejection(service.setStatus('bug-1', 'CLOSED'), 404, 'NOT_FOUND');
      expect(prisma.bugReport.update).not.toHaveBeenCalled();
    });
  });
});
