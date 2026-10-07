/**
 * Static, realistic mock of the signed-in dashboard shown under the hero.
 * Purely illustrative — it is marked `role="img"` so screen readers announce
 * it as a single preview instead of reading mock figures as live data.
 */

const BALANCE = '৳12,450.00';
const INCOME = '৳48,000.00';
const EXPENSES = '৳31,275.50';

/** Daily spending heights, percent of the tallest day. */
const SPENDING_BARS = [38, 64, 45, 72, 55, 88, 61, 47, 70, 58, 82, 52, 66, 74] as const;

const RECENT = [
  { title: 'Salary', category: 'Income', date: 'Oct 1', amount: '+৳48,000.00', income: true },
  { title: 'Groceries', category: 'Food', date: 'Sep 30', amount: '−৳1,250.00', income: false },
  {
    title: 'Electric bill',
    category: 'Utilities',
    date: 'Sep 29',
    amount: '−৳860.00',
    income: false,
  },
  {
    title: 'Ride to work',
    category: 'Transport',
    date: 'Sep 28',
    amount: '−৳120.00',
    income: false,
  },
] as const;

function PreviewStat({
  label,
  value,
  tone = 'plain',
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'income' | 'expense';
}) {
  const toneClass =
    tone === 'income' ? 'text-emerald-400' : tone === 'expense' ? 'text-rose-400' : 'text-white';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function ProductPreview() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      <div
        role="img"
        aria-label="Preview of the Expenditure Tracker dashboard: balance, income, expenses, a spending chart and recent transactions"
        className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/40"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/70 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-700" aria-hidden />
          <span className="ml-3 hidden rounded-md border border-slate-800 bg-slate-900 px-3 py-0.5 text-xs text-slate-500 sm:inline-block">
            /dashboard
          </span>
        </div>

        <div className="p-5 sm:p-6">
          {/* App header row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Hello, Ada</p>
              <p className="text-xs text-slate-500">Your money at a glance.</p>
            </div>
            <span className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-slate-950">
              Add transaction
            </span>
          </div>

          {/* Summary */}
          <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
            <PreviewStat label="Balance" value={BALANCE} />
            <PreviewStat label="Income · this month" value={INCOME} tone="income" />
            <PreviewStat label="Expenses · this month" value={EXPENSES} tone="expense" />
          </div>

          {/* Chart + recent */}
          <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-slate-500">Spending · last 14 days</p>
                <p className="text-xs tabular-nums text-slate-400">avg ৳1,120</p>
              </div>
              <div className="mt-3 flex h-28 items-end gap-1.5" aria-hidden>
                {SPENDING_BARS.map((height, index) => (
                  <span
                    key={index}
                    className={`flex-1 rounded-sm ${index === 5 ? 'bg-emerald-400' : 'bg-emerald-500/50'}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Recent transactions</p>
                <p className="text-xs text-emerald-400">View all</p>
              </div>
              <ul className="mt-3 divide-y divide-slate-800/80">
                {RECENT.map((row) => (
                  <li key={row.title} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">{row.title}</p>
                      <p className="text-xs text-slate-500">
                        {row.category} · {row.date}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm tabular-nums ${row.income ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                      {row.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
