import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Category, Transaction } from '@exp/types';
import type { CreateTransactionInputDto } from '@exp/validation';
import TransactionForm from '../components/TransactionForm';
import { Button, Card, PageHeader, Spinner } from '../components/ui';
import { API_ROUTES, apiFetch } from '../lib/api';
import { bannerFor, parseFormError } from '../lib/errors';
import { newClientId } from '../lib/id';
import { useAsync } from '../lib/useAsync';
import { ROUTES } from '../routes';

export default function TransactionNewPage() {
  const navigate = useNavigate();
  // Generated once per form so a retried submit reuses the same idempotency key.
  const [clientId] = useState(() => newClientId());
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const categories = useAsync<Category[]>(
    (signal) => apiFetch<Category[]>(API_ROUTES.categories.base, { signal }),
    [],
  );

  async function handleSubmit(payload: CreateTransactionInputDto) {
    setSubmitting(true);
    setBanner(null);
    setFieldErrors({});
    try {
      const created = await apiFetch<Transaction>(API_ROUTES.transactions.base, {
        method: 'POST',
        body: JSON.stringify({ ...payload, clientId }),
      });
      navigate(`/transactions/${created.id}`, { replace: true });
    } catch (error) {
      setFieldErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
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
        {categories.loading && !categories.data ? (
          <div className="flex justify-center py-10">
            <Spinner label="Loading categories" />
          </div>
        ) : categories.error ? (
          <p className="text-sm text-rose-400">{categories.error.message}</p>
        ) : (
          <TransactionForm
            categories={categories.data ?? []}
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
