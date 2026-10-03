import { useMemo, useState } from 'react';
import type {
  CategoryReport,
  DailyReport,
  MonthlyReport,
  SummaryResponse,
} from '../../shared/types';
import type { ShortPreset } from '../../lib/format';
import { Button, Card, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import {
  DEFAULT_TIMEZONE,
  daysBetween,
  formatMonthLabel,
  formatPercent,
  money,
  rangeFor,
} from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useAuth } from '../../auth/auth-context';

const PRESETS: ReadonlyArray<{ value: ShortPreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

interface RangeQuery {
  from: string;
  to: string;
  timezone: string;
}

/**
 * Reports share one client-derived range so the four endpoints can never
 * disagree about what period is on screen.
 */
export default function ReportsPage() {
  const { user } = useAuth();
  const timeZone = user?.timezone || DEFAULT_TIMEZONE;

  const [preset, setPreset] = useState<ShortPreset>('month');
  const [breakdownType, setBreakdownType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [year, setYear] = useState(() => new Date().getFullYear());

  const range = useMemo(() => rangeFor(preset, timeZone), [preset, timeZone]);
  const rangeQuery: RangeQuery = {
    from: range.from,
    to: range.to,
    timezone: timeZone,
  };

  const summary = useAsync<SummaryResponse>(
    (signal) =>
      apiFetch<SummaryResponse>(API_ROUTES.reports.summary, {
        signal,
        query: { preset: 'custom', ...rangeQuery },
      }),
    [range.from, range.to, timeZone],
  );

  const daily = useAsync<DailyReport>(
    (signal) =>
      apiFetch<DailyReport>(API_ROUTES.reports.daily, {
        signal,
        query: { ...rangeQuery, limit: String(daysBetween(range.from, range.to) + 1) },
      }),
    [range.from, range.to, timeZone],
  );

  const monthly = useAsync<MonthlyReport>(
    (signal) =>
      apiFetch<MonthlyReport>(API_ROUTES.reports.monthly, {
        signal,
        query: { year: String(year), timezone: timeZone },
      }),
    [year, timeZone],
  );

  const breakdown = useAsync<CategoryReport>(
    (signal) =>
      apiFetch<CategoryReport>(API_ROUTES.reports.categories, {
        signal,
        query: { preset: 'custom', type: breakdownType, ...rangeQuery },
      }),
    [range.from, range.to, timeZone, breakdownType],
  );

  const currency = summary.data?.currency ?? daily.data?.currency ?? 'USD';
  const denseDaily = (daily.data?.points.length ?? 0) > 45;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Reports"
        subtitle={`${range.from} → ${range.to} · ${timeZone}`}
        actions={
          <div className="grid grid-cols-4 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto" role="group" aria-label="Report period">
            {PRESETS.map((option) => (
              <Button
                key={option.value}
                variant={preset === option.value ? 'primary' : 'ghost'}
                onClick={() => setPreset(option.value)}
                className="w-full sm:w-auto text-xs sm:text-sm px-2 sm:px-3 py-1.5"
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
      />

      {summary.error ? <ErrorBanner>{summary.error.message}</ErrorBanner> : null}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Summary">
        {summary.loading && !summary.data ? (
          <Card>
            <Spinner label="Loading summary" />
          </Card>
        ) : summary.data ? (
          <>
            <SummaryCard
              label="Income"
              value={money(summary.data.totalIncome, currency)}
              tone="income"
            />
            <SummaryCard
              label="Expense"
              value={money(summary.data.totalExpense, currency)}
              tone="expense"
            />
            <SummaryCard
              label="Balance"
              value={money(summary.data.balance, currency)}
              tone="balance"
            />
          </>
        ) : null}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <h2 className="mb-1 font-semibold text-white">Daily activity</h2>
          <p className="mb-4 text-sm text-slate-500">
            {denseDaily
              ? 'Too many days to chart comfortably — narrow the period above.'
              : 'Income (emerald) vs expense (rose) per day.'}
          </p>
          {daily.loading && !daily.data ? (
            <Spinner label="Loading daily report" />
          ) : daily.error ? (
            <ErrorBanner>{daily.error.message}</ErrorBanner>
          ) : !denseDaily && daily.data ? (
            <DailyBars report={daily.data} currency={currency} />
          ) : null}
        </Card>

        <Card className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Category breakdown</h2>
              <p className="text-sm text-slate-500">Share of the period total.</p>
            </div>
            <div className="flex gap-1" role="group" aria-label="Breakdown type">
              {(['EXPENSE', 'INCOME'] as const).map((value) => (
                <Button
                  key={value}
                  variant={breakdownType === value ? 'primary' : 'ghost'}
                  onClick={() => setBreakdownType(value)}
                  className="text-xs sm:text-sm"
                >
                  {value === 'EXPENSE' ? 'Expense' : 'Income'}
                </Button>
              ))}
            </div>
          </div>

          <BreakdownList
            loading={breakdown.loading}
            error={breakdown.error?.message ?? null}
            type={breakdownType}
            report={breakdown.data}
          />
        </Card>
      </section>

      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Monthly trend</h2>
            <p className="text-sm text-slate-500">Income and expense across a full year.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setYear((y) => y - 1)}>
              ←
            </Button>
            <span className="min-w-[4ch] text-center tabular-nums text-slate-200">{year}</span>
            <Button variant="ghost" onClick={() => setYear((y) => y + 1)}>
              →
            </Button>
          </div>
        </div>

        {monthly.loading && !monthly.data ? (
          <Spinner label="Loading monthly report" />
        ) : monthly.error ? (
          <ErrorBanner>{monthly.error.message}</ErrorBanner>
        ) : monthly.data ? (
          <MonthlyBars report={monthly.data} currency={currency} />
        ) : null}
      </Card>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'income' | 'expense' | 'balance';
}) {
  const colour =
    tone === 'income' ? 'text-emerald-400' : tone === 'expense' ? 'text-rose-400' : 'text-white';
  return (
    <Card>
      <p className="text-xs sm:text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl sm:text-3xl font-semibold tabular-nums truncate ${colour}`}>{value}</p>
    </Card>
  );
}

function DailyBars({ report, currency }: { report: DailyReport; currency: string }) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const max = Math.max(
    1,
    ...report.points.map((point) => Math.max(Number(point.income), Number(point.expense))),
  );

  const activePoint = useMemo(
    () => report.points.find((p) => p.date === hoveredDate) ?? null,
    [report.points, hoveredDate],
  );

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Active info bar above chart */}
      <div className="flex min-h-[28px] items-center justify-between rounded-lg bg-slate-900/90 px-3 py-1 text-xs border border-slate-800">
        {activePoint ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-200">{activePoint.date}</span>
            <span className="text-slate-600">·</span>
            <span className="font-medium text-emerald-400">+{money(activePoint.income, currency)}</span>
            <span className="text-slate-600">·</span>
            <span className="font-medium text-rose-400">−{money(activePoint.expense, currency)}</span>
          </div>
        ) : (
          <span className="text-slate-500 italic">Hover or tap a bar for details</span>
        )}
      </div>

      {/* Chart container */}
      <div className="touch-scroll-x pt-2 pb-1">
        <div
          className="daily-chart-inner flex h-44 items-end gap-1.5 pb-1"
          role="img"
          aria-label="Daily income and expense chart"
        >
          {report.points.map((point) => {
            const incHeight = (Number(point.income) / max) * 100;
            const expHeight = (Number(point.expense) / max) * 100;
            const isHovered = hoveredDate === point.date;

            return (
              <div
                key={point.date}
                onMouseEnter={() => setHoveredDate(point.date)}
                onMouseLeave={() => setHoveredDate(null)}
                onClick={() => setHoveredDate((prev) => (prev === point.date ? null : point.date))}
                className={`group relative flex h-full flex-1 flex-col items-center justify-end cursor-pointer rounded-t-md transition-colors ${
                  isHovered ? 'bg-slate-800/40' : ''
                }`}
              >
                <div className="flex h-[calc(100%-20px)] w-full items-end gap-[2px] border-b border-slate-800/80 pb-0.5">
                  <div
                    className={`w-1/2 rounded-t-sm transition-all ${
                      isHovered ? 'bg-emerald-400 shadow-md shadow-emerald-500/20' : 'bg-emerald-500/80 group-hover:bg-emerald-400'
                    }`}
                    style={{ height: `${incHeight}%` }}
                  />
                  <div
                    className={`w-1/2 rounded-t-sm transition-all ${
                      isHovered ? 'bg-rose-400 shadow-md shadow-rose-500/20' : 'bg-rose-500/80 group-hover:bg-rose-400'
                    }`}
                    style={{ height: `${expHeight}%` }}
                  />
                </div>
                <span className={`mt-1 text-[10px] font-mono transition-colors ${isHovered ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                  {point.date.slice(-2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthlyBars({ report, currency }: { report: MonthlyReport; currency: string }) {
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const max = Math.max(
    1,
    ...report.points.map((point) => Math.max(Number(point.income), Number(point.expense))),
  );

  const activePoint = useMemo(
    () => report.points.find((p) => p.month === hoveredMonth) ?? null,
    [report.points, hoveredMonth],
  );

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Active info bar above chart */}
      <div className="flex min-h-[28px] items-center justify-between rounded-lg bg-slate-900/90 px-3 py-1 text-xs border border-slate-800">
        {activePoint ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-200">{formatMonthLabel(activePoint.month)}</span>
            <span className="text-slate-600">·</span>
            <span className="font-medium text-emerald-400">+{money(activePoint.income, currency)}</span>
            <span className="text-slate-600">·</span>
            <span className="font-medium text-rose-400">−{money(activePoint.expense, currency)}</span>
          </div>
        ) : (
          <span className="text-slate-500 italic">Hover or tap a bar for details</span>
        )}
      </div>

      {/* Chart container */}
      <div className="touch-scroll-x pt-2 pb-1">
        <div
          className="monthly-chart-inner flex h-48 items-end gap-3 pb-1"
          role="img"
          aria-label="Monthly income and expense chart"
        >
          {report.points.map((point) => {
            const incHeight = (Number(point.income) / max) * 100;
            const expHeight = (Number(point.expense) / max) * 100;
            const isHovered = hoveredMonth === point.month;

            return (
              <div
                key={point.month}
                onMouseEnter={() => setHoveredMonth(point.month)}
                onMouseLeave={() => setHoveredMonth(null)}
                onClick={() => setHoveredMonth((prev) => (prev === point.month ? null : point.month))}
                className={`group relative flex h-full flex-1 flex-col items-center justify-end cursor-pointer rounded-t-md transition-colors ${
                  isHovered ? 'bg-slate-800/40' : ''
                }`}
              >
                <div className="flex h-[calc(100%-24px)] w-full items-end gap-1 border-b border-slate-800/80 pb-0.5">
                  <div
                    className={`w-1/2 rounded-t-md transition-all ${
                      isHovered ? 'bg-emerald-400 shadow-md shadow-emerald-500/20' : 'bg-emerald-500/80 group-hover:bg-emerald-400'
                    }`}
                    style={{ height: `${incHeight}%` }}
                  />
                  <div
                    className={`w-1/2 rounded-t-md transition-all ${
                      isHovered ? 'bg-rose-400 shadow-md shadow-rose-500/20' : 'bg-rose-500/80 group-hover:bg-rose-400'
                    }`}
                    style={{ height: `${expHeight}%` }}
                  />
                </div>
                <span className={`mt-1.5 text-xs font-medium transition-colors ${isHovered ? 'text-emerald-400 font-bold' : 'text-slate-400'}`}>
                  {formatMonthLabel(point.month)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BreakdownList({
  loading,
  error,
  type,
  report,
}: {
  loading: boolean;
  error: string | null;
  type: 'EXPENSE' | 'INCOME';
  report: CategoryReport | null;
}) {
  if (loading && !report) return <Spinner label="Loading breakdown" />;
  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (!report) return null;
  if (report.points.length === 0) {
    return <p className="text-sm text-slate-500">No {type.toLowerCase()} in this period.</p>;
  }

  return (
    <ul className="space-y-3">
      {report.points.map((point) => {
        const share = Math.max(1.5, Number(point.percentage));
        return (
          <li key={point.categoryId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-200">{point.categoryName}</span>
              <span className="tabular-nums text-slate-400">
                {money(point.total, report.currency)} · {formatPercent(point.percentage)}
              </span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800"
              role="img"
              aria-label={`${point.categoryName}: ${formatPercent(point.percentage)}`}
            >
              <div
                className="h-full rounded-full bg-slate-500 transition-all"
                style={{ width: `${share}%`, backgroundColor: point.color ?? undefined }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
