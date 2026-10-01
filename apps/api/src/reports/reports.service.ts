import { Injectable } from '@nestjs/common';
import { toMinorUnits } from '../shared/types';
import type {
  CategoryBreakdownPoint,
  CategoryReport,
  DailyPoint,
  DailyReport,
  DateRangePreset,
  DecimalString,
  IsoDate,
  MonthlyReport,
  MonthlyReportPoint,
  SummaryResponse,
} from '../shared/types';
import type {
  CategoryReportQueryDto,
  DailyReportQueryDto,
  MonthlyReportQueryDto,
  ReportQueryDto,
} from '../shared/validation';
import {
  addDays,
  dateRangeWhere,
  daysBetween,
  monthOf,
  resolveDateRange,
  startOfMonth,
  todayIn,
} from '../common/utils/date-range';
import { toDecimalString } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.module';
import { UsersService } from '../users/users.service';

const EMPTY_DAY: { income: DecimalString; expense: DecimalString } = {
  income: '0.00',
  expense: '0.00',
};

/**
 * Report queries.
 *
 * Bucketing is always done on `transactionDate`, a bare DATE in the owner's
 * timezone — the client supplies the timezone so "this month" follows the
 * user's calendar, not the server's.
 *
 * Amounts are summed as integers (`bigint` minor units); `Decimal` is only
 * converted to a string at the response boundary.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async summary(userId: string, query: ReportQueryDto): Promise<SummaryResponse> {
    const { timezone, defaultCurrency } = await this.users.financeDefaults(userId);
    const tz = query.timezone ?? timezone;
    const range = boundedRange(query, tz);

    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, deletedAt: null, ...dateRangeWhere(range) },
      _sum: { amount: true },
    });

    const totalIncome = sumByType(rows, 'INCOME');
    const totalExpense = sumByType(rows, 'EXPENSE');

    return {
      range,
      timezone: tz,
      currency: defaultCurrency,
      totalIncome,
      totalExpense,
      balance: subtract(totalIncome, totalExpense),
    };
  }

  async daily(userId: string, query: DailyReportQueryDto): Promise<DailyReport> {
    const { timezone, defaultCurrency } = await this.users.financeDefaults(userId);
    const tz = query.timezone ?? timezone;

    const to = query.to ?? todayIn(tz);
    const from = query.from ?? addDays(to, -(query.limit - 1));
    const cappedFrom =
      daysBetween(from, to) > query.limit - 1 ? addDays(to, -(query.limit - 1)) : from;
    const range = { from: cappedFrom, to };

    const rows = await this.prisma.transaction.groupBy({
      by: ['transactionDate', 'type'],
      where: { userId, deletedAt: null, ...dateRangeWhere(range) },
      _sum: { amount: true },
    });

    const buckets = new Map<string, DailyPoint>();
    for (let day = range.from; daysBetween(day, range.to) >= 0; day = addDays(day, 1)) {
      buckets.set(day, { date: day, ...EMPTY_DAY });
    }
    for (const row of rows) {
      const date = row.transactionDate.toISOString().slice(0, 10);
      const point = buckets.get(date);
      if (!point) continue;
      const amount = toDecimalString(row._sum.amount ?? 0);
      if (row.type === 'INCOME') point.income = add(point.income, amount);
      else point.expense = add(point.expense, amount);
    }

    return { range, timezone: tz, currency: defaultCurrency, points: [...buckets.values()] };
  }

  async monthly(userId: string, query: MonthlyReportQueryDto): Promise<MonthlyReport> {
    const { timezone, defaultCurrency } = await this.users.financeDefaults(userId);
    const tz = query.timezone ?? timezone;

    const year = query.year ?? Number(todayIn(tz).slice(0, 4));
    const range = { from: `${year}-01-01` as const, to: `${year}-12-31` as const };

    const rows = await this.prisma.transaction.groupBy({
      by: ['transactionDate', 'type'],
      where: { userId, deletedAt: null, ...dateRangeWhere(range) },
      _sum: { amount: true },
    });

    const buckets = new Map<string, { income: DecimalString; expense: DecimalString }>();
    for (let month = 1; month <= 12; month += 1) {
      buckets.set(`${year}-${String(month).padStart(2, '0')}`, { ...EMPTY_DAY });
    }
    for (const row of rows) {
      const month = monthOf(row.transactionDate.toISOString().slice(0, 10));
      const bucket = buckets.get(month);
      if (!bucket) continue;
      const amount = toDecimalString(row._sum.amount ?? 0);
      if (row.type === 'INCOME') bucket.income = add(bucket.income, amount);
      else bucket.expense = add(bucket.expense, amount);
    }

    const points: MonthlyReportPoint[] = [...buckets.entries()].map(([month, bucket]) => ({
      month,
      year,
      income: bucket.income,
      expense: bucket.expense,
      balance: subtract(bucket.income, bucket.expense),
    }));

    return { year, timezone: tz, currency: defaultCurrency, points };
  }

  async categories(userId: string, query: CategoryReportQueryDto): Promise<CategoryReport> {
    const { timezone, defaultCurrency } = await this.users.financeDefaults(userId);
    const tz = query.timezone ?? timezone;
    const range = boundedRange(query, tz);

    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        deletedAt: null,
        type: query.type,
        ...dateRangeWhere(range),
      },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const categoryIds = rows.map((row) => row.categoryId);
    const categories = categoryIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, color: true },
        })
      : [];
    const byId = new Map(categories.map((c) => [c.id, c]));

    const parts = rows
      .map((row) => ({
        categoryId: row.categoryId,
        categoryName: byId.get(row.categoryId)?.name ?? 'Deleted category',
        color: byId.get(row.categoryId)?.color ?? null,
        minor: toMinorUnits(toDecimalString(row._sum.amount ?? 0)),
      }))
      .sort((a, b) => (a.minor === b.minor ? 0 : a.minor > b.minor ? -1 : 1));

    const total = parts.reduce((acc, part) => acc + part.minor, 0n);

    const points: CategoryBreakdownPoint[] = parts.map((part) => ({
      categoryId: part.categoryId,
      categoryName: part.categoryName,
      color: part.color,
      total: fromMinor(part.minor),
      percentage: percentageOf(part.minor, total),
    }));

    return { range, timezone: tz, currency: defaultCurrency, type: query.type, points };
  }
}

/**
 * Reports require a closed window so every response can echo `range`.
 * Anything the caller left open falls back to "up to today" and, when no start
 * was given at all, the month containing that end date.
 */
function boundedRange(
  query: { from?: IsoDate; to?: IsoDate; preset?: DateRangePreset },
  timezone: string,
): { from: IsoDate; to: IsoDate } {
  const resolved = resolveDateRange(query, timezone);
  const to = resolved.to ?? todayIn(timezone);
  const from = resolved.from ?? startOfMonth(to);
  return { from, to };
}

function sumByType(
  rows: ReadonlyArray<{ type: string; _sum: { amount: unknown } }>,
  type: 'INCOME' | 'EXPENSE',
): DecimalString {
  const row = rows.find((r) => r.type === type);
  return row?._sum.amount ? toDecimalString(row._sum.amount) : '0.00';
}

function add(a: DecimalString, b: DecimalString): DecimalString {
  return fromMinor(toMinorUnits(a) + toMinorUnits(b));
}

function subtract(a: DecimalString, b: DecimalString): DecimalString {
  return fromMinor(toMinorUnits(a) - toMinorUnits(b));
}

function fromMinor(minor: bigint): DecimalString {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** `(part / whole) * 100` with two decimals, computed entirely in integers. */
function percentageOf(part: bigint, whole: bigint): DecimalString {
  if (whole === 0n) return '0.00';
  const hundredths = (part * 10_000n) / whole;
  const negative = hundredths < 0n;
  const abs = negative ? -hundredths : hundredths;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
