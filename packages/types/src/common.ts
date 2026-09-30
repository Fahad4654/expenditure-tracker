/**
 * Primitive aliases used across API + web.
 *
 * Money is NEVER a `number`. Amounts cross the wire as decimal strings
 * (e.g. "100.50") and are stored as PostgreSQL `Decimal(18,2)`.
 */

/** ISO-8601 UTC instant, e.g. `2026-10-01T12:00:00.000Z`. */
export type IsoDateTime = string;

/** Calendar date without time, `YYYY-MM-DD`, interpreted in the user's timezone. */
export type IsoDate = string;

/** IANA timezone identifier, e.g. `Asia/Dhaka`. */
export type Timezone = string;

/** ISO-4217 currency code. */
export type CurrencyCode = string;

/** Unsigned decimal string with up to 2 fraction digits, e.g. `"100.50"`. */
export type DecimalString = string;

/** Client-generated UUID v4 (RFC 4122). */
export type Uuid = string;

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type SortDirection = 'asc' | 'desc';

export interface DateRangeQuery {
  /** `YYYY-MM-DD` inclusive. */
  from?: IsoDate;
  /** `YYYY-MM-DD` inclusive. */
  to?: IsoDate;
}

/** Predefined date-range presets understood by reports/summary endpoints. */
export const DATE_RANGE_PRESETS = ['today', 'week', 'month', 'year', 'custom'] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];
