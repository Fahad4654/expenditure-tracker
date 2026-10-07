import { useState, type FormEvent } from 'react';
import type { Category, TransactionTypeValue } from '../../shared/types';
import { createCategorySchema, updateCategorySchema, toFieldErrors } from '../../shared/validation';
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
  labelClass,
} from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { CATEGORY_COLORS } from '../../lib/categoryColors';
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
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<TransactionTypeValue>('EXPENSE');
  const [editColor, setEditColor] = useState(CATEGORY_COLORS[0]);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function startEdit(category: Category) {
    setBanner(null);
    setEditErrors({});
    setEditName(category.name);
    setEditType(category.suggestedType);
    setEditColor(category.color ?? CATEGORY_COLORS[0]);
    setEditingId(category.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditErrors({});
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const parsed = createCategorySchema.safeParse({
      name,
      suggestedType,
      color,
    });
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

  async function handleSave(category: Category) {
    const parsed = updateCategorySchema.safeParse({
      name: editName,
      suggestedType: editType,
      color: editColor,
    });
    if (!parsed.success) {
      setEditErrors(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setEditErrors({});
    setBanner(null);
    setSavingEdit(true);
    try {
      const updated = await apiFetch<Category>(API_ROUTES.categories.byId(category.id), {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      list.setData((list.data ?? []).map((c) => (c.id === updated.id ? updated : c)));
      setEditingId(null);
    } catch (error) {
      setBanner(bannerFor(error));
    } finally {
      setSavingEdit(false);
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
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Categories"
        subtitle="System categories are shared and read-only; yours are private to you."
        actions={
          <Link to={ROUTES.transactionNew} className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full sm:w-auto">
              Add transaction
            </Button>
          </Link>
        }
      />

      <ErrorBanner>{banner}</ErrorBanner>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-white">New category</h2>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2" noValidate>
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
          <div className="sm:col-span-2">
            <span className={labelClass}>Colour</span>
            <ColourSwatches value={color} onChange={setColor} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
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
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color ?? '#64748b' }}
                  />
                  <span className="truncate font-medium text-slate-100">{category.name}</span>
                </div>
                {category.isSystem ? (
                  <span className="shrink-0 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    System
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-xs text-slate-500">
                {category.suggestedType === 'INCOME' ? 'Income' : 'Expense'}
                {category.kind === 'USER' ? ' · yours' : ''}
              </p>

              {!category.isSystem && editingId !== category.id ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => startEdit(category)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => setPendingDeleteId(category.id)}>
                    Delete
                  </Button>
                </div>
              ) : null}

              {editingId === category.id ? (
                <form
                  aria-label={`Edit ${category.name}`}
                  className="mt-3 grid gap-3"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSave(category);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') cancelEdit();
                  }}
                >
                  <Field label="Name" htmlFor="cat-edit-name" error={editErrors.name}>
                    <TextInput
                      id="cat-edit-name"
                      maxLength={40}
                      required
                      autoFocus
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Suggested type"
                    htmlFor="cat-edit-type"
                    error={editErrors.suggestedType}
                  >
                    <Select
                      id="cat-edit-type"
                      value={editType}
                      onChange={(event) => setEditType(event.target.value as TransactionTypeValue)}
                    >
                      {TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div>
                    <span className={labelClass}>Colour</span>
                    <ColourSwatches value={editColor} onChange={setEditColor} />
                    {editErrors.color ? (
                      <p className="mt-1.5 text-xs font-medium text-rose-400" role="alert">
                        {editErrors.color}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="primary" disabled={savingEdit}>
                      {savingEdit ? 'Saving…' : 'Save'}
                    </Button>
                    <Button type="button" variant="ghost" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}

              {pendingDeleteId === category.id ? (
                <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm">
                  <p className="text-rose-200">
                    Delete “{category.name}”? Categories still used by transactions are rejected.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
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

/** Swatch row for the category colour — values are data, not theme colours. */
function ColourSwatches({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLORS.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Colour ${hex}`}
          aria-pressed={value === hex}
          onClick={() => onChange(hex)}
          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${
            value === hex ? 'border-emerald-500' : 'border-transparent hover:border-slate-600'
          }`}
          style={{ backgroundColor: hex }}
        >
          {value === hex ? (
            <svg
              aria-hidden
              className="h-4 w-4 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
        </button>
      ))}
    </div>
  );
}
