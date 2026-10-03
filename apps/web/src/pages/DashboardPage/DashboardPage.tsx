import { Link } from 'react-router-dom';
import type { Category, Paginated, SummaryResponse, Transaction } from '../../shared/types';
import { useAuth } from '../../auth/auth-context';
import TransactionRow from '../../components/TransactionRow/TransactionRow';
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { ROUTES } from '../../routes';

interface DashboardData {
  today: SummaryResponse;
  month: SummaryResponse;
  recent: Paginated<Transaction>;
  categories: Category[];
}

function SummaryCard({ title, summary }: { title: string; summary: SummaryResponse }) {
  const negative = summary.balance.startsWith('-');
  return (
    <Card className="relative overflow-hidden transition-all duration-200 hover:border-slate-700">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-400">
          {summary.currency}
        </span>
      </div>
      <p
        className={`mt-2 text-2xl sm:text-3xl font-bold tracking-tight tabular-nums ${
          negative ? 'text-rose-400' : 'text-white'
        }`}
      >
        {money(summary.balance, summary.currency)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-3 text-sm">
        <div className="rounded-lg bg-emerald-500/5 p-2 border border-emerald-500/10">
          <dt className="text-[11px] font-medium text-slate-400">Income</dt>
          <dd className="mt-0.5 text-sm sm:text-base font-semibold tabular-nums text-emerald-400">
            {money(summary.totalIncome, summary.currency)}
          </dd>
        </div>
        <div className="rounded-lg bg-rose-500/5 p-2 border border-rose-500/10">
          <dt className="text-[11px] font-medium text-slate-400">Expense</dt>
          <dd className="mt-0.5 text-sm sm:text-base font-semibold tabular-nums text-rose-400">
            {money(summary.totalExpense, summary.currency)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync<DashboardData>(async (signal) => {
    const options = { signal };
    const [today, month, recent, categories] = await Promise.all([
      apiFetch<SummaryResponse>(`${API_ROUTES.reports.summary}?preset=today`, options),
      apiFetch<SummaryResponse>(`${API_ROUTES.reports.summary}?preset=month`, options),
      apiFetch<Paginated<Transaction>>(
        `${API_ROUTES.transactions.base}?limit=5&sort=createdAt&order=desc`,
        options,
      ),
      apiFetch<Category[]>(API_ROUTES.categories.base, options),
    ]);
    return { today, month, recent, categories };
  }, []);

  const categoryMap = new Map((data?.categories ?? []).map((c) => [c.id, c]));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title={user ? `Hello, ${user.name.split(' ')[0]}` : 'Dashboard'}
        subtitle="Your money at a glance."
        actions={
          <Link to={ROUTES.transactionNew} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add transaction</span>
            </Button>
          </Link>
        }
      />

      <ErrorBanner>
        {error ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <span>{error.message}</span>
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          </div>
        ) : null}
      </ErrorBanner>

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <Spinner label="Loading dashboard" />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <SummaryCard title="Today" summary={data.today} />
            <SummaryCard title="This month" summary={data.month} />
          </div>

          <Card className="mt-6 !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-slate-800/80">
              <h2 className="font-bold text-white text-base sm:text-lg">Recent transactions</h2>
              <Link
                to={ROUTES.transactions}
                className="text-xs sm:text-sm font-semibold text-emerald-400 transition hover:text-emerald-300"
              >
                View all →
              </Link>
            </div>

            {data.recent.items.length === 0 ? (
              <div className="p-4 sm:p-5">
                <EmptyState
                  title="No transactions yet"
                  body="Add your first income or expense to start seeing totals here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-800/80">
                {data.recent.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    categories={categoryMap}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </main>
  );
}
