import type { DateRangePreset, IsoDate } from '@exp/types';

/**
 * Date-range resolution done in the *user's* timezone, not the server's.
 *
 * `transactionDate` is a bare DATE column; "today" and "this month" must follow
 * the owner's calendar or a Dhaka user sees yesterday's data after midnight
 * UTC. Everything here works on plain `YYYY-MM-DD` strings via UTC arithmetic,
 * so no DST transition can shift a bucket.
 */

export interface DateRange {
  from?: IsoDate;
  to?: IsoDate;
}

/** `2026-10-01` -> `[2026, 10, 1]`. Throws rather than producing `NaN` math. */
function parseYmd(date: IsoDate): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  const parts = [year, month, day];
  if (parts.some((part) => part === undefined || !Number.isFinite(part))) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  return parts as [number, number, number];
}

/** `2026-10-01` for `now` as observed in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/** Adds `days` calendar days to a `YYYY-MM-DD` string (UTC-safe rollover). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = parseYmd(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** `2026-10-01` -> `2026-10`, the bucket key used by monthly reports. */
export function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = parseYmd(from);
  const [y2, m2, d2] = parseYmd(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

function endOfMonth(date: IsoDate): IsoDate {
  const [year, month] = parseYmd(date);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

/** Monday-based ISO week containing `date`. */
function startOfWeek(date: IsoDate): IsoDate {
  const [year, month, day] = parseYmd(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (weekday + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

const PRESET_BUILDERS: Record<Exclude<DateRangePreset, 'custom'>, (today: IsoDate) => DateRange> = {
  today: (today) => ({ from: today, to: today }),
  week: (today) => {
    const from = startOfWeek(today);
    return { from, to: addDays(from, 6) };
  },
  month: (today) => ({ from: startOfMonth(today), to: endOfMonth(today) }),
  year: (today) => ({ from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }),
};

/**
 * Resolves a report/list window.
 *
 * - An explicit `preset` (other than `custom`) wins and is computed in `timeZone`.
 * - `custom` and unpinned queries fall back to whatever `from`/`to` were given,
 *   each bound optional.
 */
export function resolveDateRange(
  input: { from?: IsoDate; to?: IsoDate; preset?: DateRangePreset },
  timeZone: string,
  now: Date = new Date(),
): DateRange {
  const today = todayIn(timeZone, now);

  if (input.preset && input.preset !== 'custom') {
    return PRESET_BUILDERS[input.preset](today);
  }

  return { from: input.from, to: input.to };
}

/**
 * `from <= date <= to` predicates for Prisma, omitting absent bounds.
 *
 * Dates are passed as explicit UTC ISO strings so the value Prisma sends to
 * PostgreSQL never depends on the server's local timezone — an off-by-one here
 * would silently shift every report window.
 */
export function dateRangeWhere(range: DateRange): {
  transactionDate?: { gte?: string; lte?: string };
} {
  if (!range.from && !range.to) return {};
  return {
    transactionDate: {
      ...(range.from && { gte: `${range.from}T00:00:00.000Z` }),
      ...(range.to && { lte: `${range.to}T00:00:00.000Z` }),
    },
  };
}
