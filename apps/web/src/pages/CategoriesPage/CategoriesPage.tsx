import { useState, type FormEvent } from 'react';
import type { Category, TransactionTypeValue } from '../../shared/types';
import { createCategorySchema, toFieldErrors } from '../../shared/validation';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  Spinner,
  TextInput,
} from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { useAsync } from '../../lib/useAsync';
import { ROUTES } from '../../routes';
import { Link } from 'react-router-dom';

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionTypeValue; label: string }> = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
];

export default function CategoriesPage() {
  const list = useAsync<Category[]>(
    (signal) => apiFetch<Category[]>(API_ROUTES.categories.base, { signal }),
    [],
  );

  const [name, setName] = useState('');
  const [suggestedType, setSuggestedType] = useState<TransactionTypeValue>('EXPENSE');
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const parsed = createCategorySchema.safeParse({ name, suggestedType });
    if (!parsed.success) {
      setCreateErrors(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setCreateErrors({});
    setSubmitting(true);
    try {
      const created = await apiFetch<Category>(API_ROUTES.categories.base, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      list.setData([...(list.data ?? []), created]);
      setName('');
    } catch (error) {
      setCreateErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRename(category: Category) {
    const parsed = createCategorySchema.pick({ name: true }).safeParse({ name: editName });
    if (!parsed.success) {
      setBanner(indexByPath(toFieldErrors(parsed.error)).name ?? null);
      return;
    }

    setBanner(null);
    try {
      const updated = await apiFetch<Category>(API_ROUTES.categories.byId(category.id), {
        method: 'PATCH',
        body: JSON.stringify({ name: parsed.data.name }),
      });
      list.setData((list.data ?? []).map((c) => (c.id === updated.id ? updated : c)));
      setEditingId(null);
    } catch (error) {
      setBanner(bannerFor(error));
    }
  }

  async function handleDelete(category: Category) {
    setBanner(null);
    try {
      await apiFetch(API_ROUTES.categories.byId(category.id), { method: 'DELETE' });
      list.setData((list.data ?? []).filter((c) => c.id !== category.id));
      setPendingDeleteId(null);
    } catch (error) {
      setPendingDeleteId(null);
      setBanner(bannerFor(error));
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <PageHeader
        title="Categories"
        subtitle="System categories are shared and read-only; yours are private to you."
        actions={
          <Link to={ROUTES.transactionNew}>
            <Button variant="secondary">Add transaction</Button>
          </Link>
        }
      />

      <ErrorBanner>{banner}</ErrorBanner>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-white">New category</h2>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-3" noValidate>
          <Field label="Name" htmlFor="cat-name" error={createErrors.name}>
            <TextInput
              id="cat-name"
              placeholder="Pet care"
              maxLength={40}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Suggested type" htmlFor="cat-type" error={createErrors.suggestedType}>
            <Select
              id="cat-type"
              value={suggestedType}
              onChange={(event) => setSuggestedType(event.target.value as TransactionTypeValue)}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add category'}
            </Button>
          </div>
        </form>
      </Card>

      {list.loading && !list.data ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading categories" />
        </div>
      ) : list.error ? (
        <ErrorBanner>{list.error.message}</ErrorBanner>
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState title="No categories yet" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((category) => (
            <li
              key={category.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: category.color ?? '#64748b' }}
                  />
                  {editingId === category.id ? (
                    <input
                      autoFocus
                      aria-label={`Rename ${category.name}`}
                      value={editName}
                      maxLength={40}
                      onChange={(event) => setEditName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void handleRename(category);
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                      className="w-36 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <span className="font-medium text-slate-100">{category.name}</span>
                  )}
                </div>
                {category.isSystem ? (
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    System
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-xs text-slate-500">
                {category.suggestedType === 'INCOME' ? 'Income' : 'Expense'}
                {category.kind === 'USER' ? ' · yours' : ''}
              </p>

              {!category.isSystem ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {editingId === category.id ? (
                    <>
                      <Button variant="primary" onClick={() => void handleRename(category)}>
                        Save
                      </Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditName(category.name);
                        }}
                      >
                        Rename
                      </Button>
                      <Button variant="ghost" onClick={() => setPendingDeleteId(category.id)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              ) : null}

              {pendingDeleteId === category.id ? (
                <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm">
                  <p className="text-rose-200">
                    Delete “{category.name}”? Categories still used by transactions are rejected.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="danger" onClick={() => void handleDelete(category)}>
                      Delete
                    </Button>
                    <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
