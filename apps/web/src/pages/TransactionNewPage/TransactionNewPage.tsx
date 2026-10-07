import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Category, Note, Transaction } from '../../shared/types';
import type { CreateTransactionInputDto } from '../../shared/validation';
import TransactionForm from '../../components/TransactionForm/TransactionForm';
import { Button, Card, PageHeader, Spinner } from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { bannerFor, parseFormError } from '../../lib/errors';
import { newClientId } from '../../lib/id';
import { useAsync } from '../../lib/useAsync';
import { ROUTES } from '../../routes';

export default function TransactionNewPage() {
  const navigate = useNavigate();
  // Generated once per form so a retried submit reuses the same idempotency key.
  const [clientId] = useState(() => newClientId());
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const initial = useAsync<{ categories: Category[]; notes: Note[] }>(async (signal) => {
    const [categories, notes] = await Promise.all([
      apiFetch<Category[]>(API_ROUTES.categories.base, { signal }),
      apiFetch<Note[]>(API_ROUTES.notes.base, { signal }),
    ]);
    return { categories, notes };
  }, []);

  async function handleSubmit(payload: CreateTransactionInputDto) {
    setSubmitting(true);
    setBanner(null);
    setFieldErrors({});
    try {
      const created = await apiFetch<Transaction>(API_ROUTES.transactions.base, {
        method: 'POST',
        body: JSON.stringify({ ...payload, clientId }),
      });
      await navigate(`/transactions/${created.id}`, { replace: true });
    } catch (error) {
      setFieldErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Add transaction"
        subtitle="Records are idempotent — resubmitting this form cannot create a duplicate."
        actions={
          <Link to={ROUTES.transactions}>
            <Button variant="ghost">Cancel</Button>
          </Link>
        }
      />

      <Card>
        {initial.loading && !initial.data ? (
          <div className="flex justify-center py-10">
            <Spinner label="Loading form" />
          </div>
        ) : initial.error ? (
          <p className="text-sm text-rose-400">{initial.error.message}</p>
        ) : (
          <TransactionForm
            categories={initial.data?.categories ?? []}
            notes={initial.data?.notes ?? []}
            submitting={submitting}
            banner={banner}
            fieldErrors={fieldErrors}
            onSubmit={(payload) => void handleSubmit(payload)}
          />
        )}
      </Card>
    </main>
  );
}
