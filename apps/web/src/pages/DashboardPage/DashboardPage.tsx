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
    <Card>
      <h2 className="text-sm font-medium text-slate-400">{title}</h2>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums ${negative ? 'text-rose-400' : 'text-white'}`}
      >
        {money(summary.balance, summary.currency)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Income</dt>
          <dd className="tabular-nums text-emerald-400">
            {money(summary.totalIncome, summary.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Expense</dt>
          <dd className="tabular-nums text-rose-400">
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
    <main className="w-full px-6 py-10">
      <PageHeader
        title={user ? `Hello, ${user.name.split(' ')[0]}` : 'Dashboard'}
        subtitle="Your money at a glance."
        actions={
          <Link to={ROUTES.transactionNew}>
            <Button>Add transaction</Button>
          </Link>
        }
      />

      <ErrorBanner>
        {error ? (
          <div className="flex items-center justify-between gap-4">
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
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard title="Today" summary={data.today} />
            <SummaryCard title="This month" summary={data.month} />
          </div>

          <Card className="mt-6 !p-0">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-semibold text-white">Recent transactions</h2>
              <Link
                to={ROUTES.transactions}
                className="text-sm text-emerald-400 transition hover:text-emerald-300"
              >
                View all
              </Link>
            </div>

            {data.recent.items.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  title="No transactions yet"
                  body="Add your first income or expense to start seeing totals here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-800 border-t border-slate-800">
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
