import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Category, Transaction } from '../../shared/types';
import type { CreateTransactionInputDto } from '../../shared/validation';
import TransactionForm from '../../components/TransactionForm/TransactionForm';
import NotFoundPage from '../NotFoundPage/NotFoundPage';
import { Button, Card, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { bannerFor, parseFormError } from '../../lib/errors';
import { formatDay, formatInstant, money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { ROUTES } from '../../routes';

export default function TransactionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const query = useAsync<{ transaction: Transaction; categories: Category[] }>(
    async (signal) => {
      const [transaction, categories] = await Promise.all([
        apiFetch<Transaction>(API_ROUTES.transactions.byId(id), { signal }),
        apiFetch<Category[]>(API_ROUTES.categories.base, { signal }),
      ]);
      return { transaction, categories };
    },
    [id],
  );

  async function handleSave(payload: CreateTransactionInputDto) {
    if (!query.data) return;
    setSubmitting(true);
    setBanner(null);
    setFieldErrors({});
    try {
      // Fields are listed explicitly: the update schema must not silently gain
      // a create-only field (e.g. `clientId`) that the API would reject.
      await apiFetch<Transaction>(API_ROUTES.transactions.byId(id), {
        method: 'PATCH',
        body: JSON.stringify({
          type: payload.type,
          amount: payload.amount,
          currency: payload.currency,
          categoryId: payload.categoryId,
          title: payload.title,
          description: payload.description ?? null,
          transactionDate: payload.transactionDate,
          // Optimistic concurrency: refuse to clobber a concurrent edit.
          baseVersion: query.data.transaction.version,
        }),
      });
      setEditing(false);
      query.reload();
    } catch (error) {
      setFieldErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setBanner(null);
    try {
      await apiFetch(API_ROUTES.transactions.byId(id), { method: 'DELETE' });
      navigate(ROUTES.transactions, { replace: true });
    } catch (error) {
      setConfirmingDelete(false);
      setBanner(bannerFor(error));
    }
  }

  if (query.loading && !query.data) {
    return (
      <main className="flex justify-center py-24">
        <Spinner label="Loading transaction" />
      </main>
    );
  }

  // A 404 here means the id is unknown *or* belongs to someone else — the API
  // deliberately does not distinguish, and neither should the UI.
  if (query.error?.code === 'NOT_FOUND') return <NotFoundPage />;
  if (query.error) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
        <ErrorBanner>{query.error.message}</ErrorBanner>
      </main>
    );
  }
  if (!query.data) return null;

  const { transaction, categories } = query.data;
  const category = categories.find((c) => c.id === transaction.categoryId);
  const expense = transaction.type === 'EXPENSE';

  return (
    <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title={editing ? 'Edit transaction' : transaction.title}
        subtitle={`${expense ? 'Expense' : 'Income'} · ${formatDay(transaction.transactionDate, {
          weekday: true,
        })}`}
        actions={
          editing ? null : (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </Button>
            </>
          )
        }
      />

      <ErrorBanner>{banner}</ErrorBanner>

      <Card className="mt-4">
        {editing ? (
          <TransactionForm
            key={transaction.id}
            categories={categories}
            initialValue={transaction}
            submitting={submitting}
            banner={null}
            fieldErrors={fieldErrors}
            onSubmit={(payload) => void handleSave(payload)}
          />
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-slate-500">Amount</p>
              <p
                className={`text-4xl font-semibold tabular-nums ${
                  expense ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {money(transaction.amount, transaction.currency)}
              </p>
            </div>

            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Category</dt>
                <dd className="mt-1 text-slate-200">{category?.name ?? 'Uncategorised'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Date</dt>
                <dd className="mt-1 text-slate-200">
                  {formatDay(transaction.transactionDate, { weekday: true })}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-slate-500">Description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-200">
                  {transaction.description || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="mt-1 text-slate-300">{formatInstant(transaction.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Version</dt>
                <dd className="mt-1 text-slate-300">{transaction.version}</dd>
              </div>
            </dl>

            {confirmingDelete ? (
              <div className="rounded-lg border border-rose-900 bg-rose-950/50 p-4">
                <p className="text-sm text-rose-200">
                  Delete “{transaction.title}”? This leaves a tombstone so other devices see the
                  removal.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" onClick={() => void handleDelete()}>
                    Yes, delete
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            <Link
              to={ROUTES.transactions}
              className="inline-block text-sm text-slate-400 transition hover:text-slate-200"
            >
              ← Back to transactions
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
