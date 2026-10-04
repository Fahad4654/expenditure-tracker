import { Injectable } from '@nestjs/common';
import type { AdminBugReport, BugReport, BugReportStatus } from '../shared/types';
import type { CreateBugReportInputDto } from '../shared/validation';
import { errors } from '../common/http/api-error';
import { PrismaService } from '../prisma/prisma.module';

interface BugReportRecord {
  id: string;
  userId: string;
  title: string;
  description: string;
  severity: BugReport['severity'];
  status: BugReport['status'];
  area: string | null;
  appVersion: string | null;
  platform: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Reporter projection joined onto a report for the admin list. */
interface AdminBugReportRecord extends BugReportRecord {
  user: { id: string; name: string; email: string | null };
}

const REPORTER_SELECT = { id: true, name: true, email: true } as const;

function toBugReport(report: BugReportRecord): BugReport {
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    severity: report.severity,
    status: report.status,
    area: report.area,
    appVersion: report.appVersion,
    platform: report.platform,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

function toAdminBugReport(report: AdminBugReportRecord): AdminBugReport {
  return {
    ...toBugReport(report),
    userId: report.user.id,
    reporterName: report.user.name,
    reporterEmail: report.user.email,
  };
}

/**
 * User-submitted bug reports, always scoped to the caller. Another user's
 * report is a 404 so its existence is never disclosed, and deletes are soft
 * so a tombstone can later feed the sync change log.
 *
 * The client picks the severity but never the `status` — triage happens
 * server-side (`OPEN` → `IN_PROGRESS` → `RESOLVED`/`CLOSED`). `area`,
 * `appVersion` and `platform` are optional context captured by whichever
 * surface filed the report (web, Android or iOS).
 *
 * Reports are not part of the Phase 5 sync feed; the `version` counter is
 * bumped on every write so sync can adopt them without a schema change.
 *
 * Two audiences share this service: the caller-scoped methods below (every
 * user sees only their own reports) and the admin methods, which the
 * `AdminGuard`-protected controller exposes over `/admin/bug-reports`.
 */
@Injectable()
export class BugReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<BugReport[]> {
    const reports = await this.prisma.bugReport.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return reports.map(toBugReport);
  }

  async create(userId: string, input: CreateBugReportInputDto): Promise<BugReport> {
    const report = await this.prisma.bugReport.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        severity: input.severity ?? 'MEDIUM',
        area: input.area ?? null,
        appVersion: input.appVersion ?? null,
        platform: input.platform ?? null,
      },
    });
    return toBugReport(report);
  }

  async remove(userId: string, id: string): Promise<BugReport> {
    const report = await this.requireOwned(userId, id);
    const deleted = await this.prisma.bugReport.update({
      where: { id: report.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return toBugReport(deleted);
  }

  private async requireOwned(userId: string, id: string): Promise<BugReportRecord> {
    const report = await this.prisma.bugReport.findUnique({ where: { id } });
    if (!report || report.deletedAt || report.userId !== userId) {
      // Another user's report — indistinguishable from "does not exist".
      throw errors.notFound('Bug report not found');
    }
    return report;
  }

  /**
   * Every report across every account, newest first, with the reporter joined
   * in. Admin-guarded: none of the caller-scoped methods ever reach this.
   */
  async listAll(): Promise<AdminBugReport[]> {
    const reports = await this.prisma.bugReport.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: REPORTER_SELECT } },
    });
    return reports.map(toAdminBugReport);
  }

  /**
   * Triage status change. Soft-deleted reports are 404s even for an admin so
   * the trash stays inert, and `version` bumps so the change is observable
   * by the sync feed once reports join it.
   */
  async setStatus(id: string, status: BugReportStatus): Promise<AdminBugReport> {
    const existing = await this.prisma.bugReport.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw errors.notFound('Bug report not found');

    const report = await this.prisma.bugReport.update({
      where: { id },
      data: { status, version: { increment: 1 } },
      include: { user: { select: REPORTER_SELECT } },
    });
    return toAdminBugReport(report);
  }
}
