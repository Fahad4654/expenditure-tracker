import { z } from 'zod';
import { dateRangeSchema, timezoneSchema } from './common';

/**
 * Report queries accept either a preset or an explicit `from`/`to` range.
 * The user's timezone is always supplied so "today"/"this month" are computed
 * in the *user's* day boundaries, not the server's.
 */
export const reportQuerySchema = dateRangeSchema.extend({
  preset: z.enum(['today', 'week', 'month', 'year', 'custom']).default('month'),
  timezone: timezoneSchema.optional(),
});

export const dailyReportQuerySchema = dateRangeSchema.extend({
  timezone: timezoneSchema.optional(),
  limit: z.coerce.number().int().min(1).max(366).default(30),
});

export const monthlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  timezone: timezoneSchema.optional(),
});

export const categoryReportQuerySchema = reportQuerySchema.extend({
  type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
});

export type ReportQueryDto = z.infer<typeof reportQuerySchema>;
export type DailyReportQueryDto = z.infer<typeof dailyReportQuerySchema>;
export type MonthlyReportQueryDto = z.infer<typeof monthlyReportQuerySchema>;
export type CategoryReportQueryDto = z.infer<typeof categoryReportQuerySchema>;
