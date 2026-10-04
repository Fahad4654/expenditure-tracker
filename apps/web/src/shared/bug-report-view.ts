import type { BugReport, BugReportSeverity, BugReportStatus } from './types';

export const SEVERITY_LABELS: Record<BugReportSeverity, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const SEVERITY_CLASSES: Record<BugReportSeverity, string> = {
  LOW: 'border-slate-700 bg-slate-800/60 text-slate-300',
  MEDIUM: 'border-sky-900 bg-sky-950/60 text-sky-300',
  HIGH: 'border-amber-900 bg-amber-950/60 text-amber-300',
  CRITICAL: 'border-rose-900 bg-rose-950/60 text-rose-300',
};

export const STATUS_CLASSES: Record<BugReportStatus, string> = {
  OPEN: 'border-slate-700 bg-slate-800/60 text-slate-300',
  IN_PROGRESS: 'border-emerald-900 bg-emerald-950/60 text-emerald-300',
  RESOLVED: 'border-sky-900 bg-sky-950/60 text-sky-300',
  CLOSED: 'border-slate-800 bg-slate-900/60 text-slate-400',
};

export function statusLabel(status: BugReportStatus): string {
  return status === 'IN_PROGRESS'
    ? 'In progress'
    : status.charAt(0) + status.slice(1).toLowerCase();
}

/** Where a report came from: `Dashboard · Web · v1.4.0` style context line. */
export function contextLine(report: BugReport): string | null {
  const parts = [
    report.area ?? null,
    report.platform ? report.platform.replace(/^\w/, (c) => c.toUpperCase()) : null,
    report.appVersion ? `v${report.appVersion}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}
