import type { IsoDateTime, Uuid } from './common';

export type BugReportSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Triage state — owned by the server; clients only ever read it. */
export type BugReportStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface BugReport {
  id: Uuid;
  title: string;
  description: string;
  severity: BugReportSeverity;
  status: BugReportStatus;
  /** Screen/area the bug happened in, e.g. `Transactions`. */
  area: string | null;
  /** Client-reported build, e.g. `1.4.0`. */
  appVersion: string | null;
  /** Client-reported platform: `web`, `android`, `ios`. */
  platform: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * Admin view of a report: the user-facing {@link BugReport} plus the identity
 * of whoever filed it. Never returned by the caller-scoped endpoints.
 */
export interface AdminBugReport extends BugReport {
  userId: Uuid;
  reporterName: string;
  reporterEmail: string | null;
}

export interface CreateBugReportInput {
  title: string;
  description: string;
  severity?: BugReportSeverity;
  area?: string | null;
  appVersion?: string | null;
  platform?: string | null;
}
