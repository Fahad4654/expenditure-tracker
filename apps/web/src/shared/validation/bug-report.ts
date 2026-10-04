import { z } from 'zod';

export const BUG_REPORT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const BUG_REPORT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

/**
 * A bug report is submitted once and then triaged server-side: the client
 * chooses the severity but never the status.
 */
export const createBugReportSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(5000),
  severity: z.enum(BUG_REPORT_SEVERITIES).default('MEDIUM'),
  /** Screen/area the bug happened in, e.g. `Transactions`. */
  area: z.string().trim().max(80).nullable().optional(),
  /** Client-reported build, e.g. `1.4.0`. */
  appVersion: z.string().trim().max(40).nullable().optional(),
  /** Client-reported platform: `web`, `android`, `ios`. */
  platform: z.string().trim().max(40).nullable().optional(),
});

export type CreateBugReportInputDto = z.infer<typeof createBugReportSchema>;
