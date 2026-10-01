import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRangeWhere,
  daysBetween,
  monthOf,
  resolveDateRange,
  startOfMonth,
  todayIn,
} from '../src/common/utils/date-range';
import { sumDecimalStrings, sumFromAggregate, toDecimalString } from '../src/common/utils/money';
import { ttlToSeconds } from '../src/auth/token.service';
import { isDevOrigin } from '../src/common/utils/dev-origin';

describe('ttlToSeconds', () => {
  it('parses every supported unit', () => {
    expect(ttlToSeconds('900')).toBe(900);
    expect(ttlToSeconds('45s')).toBe(45);
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('12h')).toBe(43_200);
    expect(ttlToSeconds('30d')).toBe(2_592_000);
  });

  it('falls back to 15 minutes rather than producing NaN', () => {
    expect(ttlToSeconds('')).toBe(900);
    expect(ttlToSeconds('forever')).toBe(900);
    expect(ttlToSeconds('-5m')).toBe(900);
  });
});

describe('date arithmetic', () => {
  it('rolls over month and year boundaries in UTC', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts whole days and buckets months', () => {
    expect(daysBetween('2026-09-01', '2026-10-01')).toBe(30);
    expect(daysBetween('2026-10-01', '2026-09-01')).toBe(-30);
    expect(daysBetween('2026-09-30', '2026-09-30')).toBe(0);
    expect(monthOf('2026-10-01')).toBe('2026-10');
    expect(startOfMonth('2026-10-15')).toBe('2026-10-01');
  });

  it('rejects malformed dates instead of computing with NaN', () => {
    expect(() => addDays('not-a-date' as never, 1)).toThrow(/Invalid ISO date/);
  });

  it('resolves "today" in the user timezone, not the server one', () => {
    // 2026-09-30T22:00Z is already 2026-10-01 in Dhaka (UTC+6) but still
    // 2026-09-30 in Los Angeles (UTC-7).
    const now = new Date('2026-09-30T22:00:00.000Z');
    expect(todayIn('Asia/Dhaka', now)).toBe('2026-10-01');
    expect(todayIn('America/Los_Angeles', now)).toBe('2026-09-30');
    expect(todayIn('UTC', now)).toBe('2026-09-30');
  });
});

describe('resolveDateRange', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');

  it('computes presets in the requested timezone', () => {
    expect(resolveDateRange({ preset: 'month' }, 'UTC', now)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(resolveDateRange({ preset: 'year' }, 'UTC', now)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(resolveDateRange({ preset: 'today' }, 'UTC', now)).toEqual({
      from: '2026-10-14',
      to: '2026-10-14',
    });
  });

  it('uses an ISO Monday-based week', () => {
    // 2026-10-14 is a Wednesday.
    expect(resolveDateRange({ preset: 'week' }, 'UTC', now)).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
  });

  it('leaves custom and unpinned ranges as given', () => {
    expect(resolveDateRange({ preset: 'custom', from: '2026-01-05' }, 'UTC', now)).toEqual({
      from: '2026-01-05',
      to: undefined,
    });
    expect(resolveDateRange({}, 'UTC', now)).toEqual({ from: undefined, to: undefined });
  });
});

describe('dateRangeWhere', () => {
  it('omits absent bounds entirely', () => {
    expect(dateRangeWhere({})).toEqual({});
    expect(dateRangeWhere({ from: '2026-01-01' })).toEqual({
      transactionDate: { gte: '2026-01-01T00:00:00.000Z' },
    });
  });

  it('pins both bounds to UTC midnight so Prisma never shifts the window', () => {
    expect(dateRangeWhere({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      transactionDate: {
        gte: '2026-09-01T00:00:00.000Z',
        lte: '2026-09-30T00:00:00.000Z',
      },
    });
  });
});

describe('money', () => {
  it('normalises decimals without float arithmetic', () => {
    expect(toDecimalString({ toString: () => '125.5' })).toBe('125.50');
    expect(toDecimalString('1234567890123456.78')).toBe('1234567890123456.78');
  });

  it('sums above 2^53 where a JS number would lose precision', () => {
    const huge = ['90071992547409.97', '90071992547409.97'];
    expect(sumDecimalStrings(huge)).toBe('180143985094819.94');
    expect(sumDecimalStrings(['0.10', '0.20'])).toBe('0.30');
    expect(sumDecimalStrings(['-1.25', '3.00'])).toBe('1.75');
    expect(sumDecimalStrings([])).toBe('0.00');
  });

  it('reads raw aggregate results of every shape PostgreSQL produces', () => {
    expect(sumFromAggregate(null)).toBe('0.00');
    expect(sumFromAggregate(undefined)).toBe('0.00');
    expect(sumFromAggregate('125.5')).toBe('125.50');
    expect(sumFromAggregate(125.5)).toBe('125.50');
  });
});

describe('isDevOrigin', () => {
  it('accepts loopback hosts on any port', () => {
    expect(isDevOrigin('http://localhost:54321')).toBe(true);
    expect(isDevOrigin('http://localhost')).toBe(true);
    expect(isDevOrigin('http://127.0.0.1:8080')).toBe(true);
    expect(isDevOrigin('http://[::1]:9000')).toBe(true);
  });

  it('accepts private LAN origins for phone-browser testing', () => {
    expect(isDevOrigin('http://192.168.1.20:8080')).toBe(true);
    expect(isDevOrigin('http://10.0.0.5')).toBe(true);
    expect(isDevOrigin('http://172.20.5.1')).toBe(true);
  });

  it('rejects public origins and malformed values', () => {
    expect(isDevOrigin('https://example.com')).toBe(false);
    expect(isDevOrigin('http://172.32.0.1')).toBe(false);
    expect(isDevOrigin('not-a-url')).toBe(false);
  });
});
