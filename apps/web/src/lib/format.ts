import type { CurrencyCode, DecimalString, IsoDate, Timezone } from '@exp/types';
import { formatMoney } from '@exp/types';

const DAY_MS = 86_400_000;

/** `2026-10-01` for `now` as observed in `timeZone` — mirrors the API helper. */
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

export function addDays(date: IsoDate, days: number): IsoDate {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Money display. Amounts are decimal strings, so no float ever touches them. */
export function money(amount: DecimalString, currency: CurrencyCode): string {
  return formatMoney(amount, currency);
}

const LOCALE = 'en-GB';

/**
 * `2026-09-30` -> `30 Sep 2026`. Parsed as a UTC midnight so the calendar day
 * the user typed is the day they see, regardless of the browser's timezone.
 */
export function formatDay(isoDate: IsoDate, options?: { weekday?: boolean }): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(options?.weekday ? { weekday: 'short' } : {}),
  }).format(date);
}

/** `2026-10-01T12:00:00.000Z` -> `1 Oct, 12:00`. */
export function formatInstant(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** `2026-09` -> `Sep 2026`. */
export function formatMonthLabel(month: string): string {
  const [year = '', monthOfYear = ''] = month.split('-');
  const index = Number(monthOfYear) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 11) return month;
  const label = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, index, 1)),
  );
  return `${label} ${year}`;
}

/** Percentage decimal string -> `92.6%` (one decimal keeps bars readable). */
export function formatPercent(value: DecimalString): string {
  return `${Number(value).toFixed(1)}%`;
}

/** Short axis label for a daily series: `1 Oct`. */
export function formatDayShort(isoDate: IsoDate): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/** Monday of the ISO week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
  const [year = 1970, month = 1] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

export function startOfYear(date: IsoDate): IsoDate {
  return `${date.slice(0, 4)}-01-01`;
}

export function endOfYear(date: IsoDate): IsoDate {
  return `${date.slice(0, 4)}-12-31`;
}

export type ShortPreset = 'today' | 'week' | 'month' | 'year';

/**
 * Resolves a preset to an explicit window in the *user's* day boundaries, so
 * the client and the API agree on what "this month" means.
 */
export function rangeFor(
  preset: ShortPreset,
  timeZone: string,
  now: Date = new Date(),
): { from: IsoDate; to: IsoDate } {
  const today = todayIn(timeZone, now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const from = startOfWeek(today);
      return { from, to: addDays(from, 6) };
    }
    case 'year':
      return { from: startOfYear(today), to: endOfYear(today) };
    default:
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

/** Whole days between two calendar dates, for empty-range messaging. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS,
  );
}

/** Default timezone when the profile has not been loaded yet. */
export const DEFAULT_TIMEZONE: Timezone = 'Asia/Dhaka';
export const DEFAULT_CURRENCY: CurrencyCode = 'BDT';
