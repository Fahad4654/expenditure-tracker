import { useState, type FormEvent } from 'react';
import type { Category, Note, Transaction, TransactionTypeValue } from '../../shared/types';
import {
  createTransactionSchema,
  toFieldErrors,
  type CreateTransactionInputDto,
} from '../../shared/validation';
import { indexByPath } from '../../lib/errors';
import { DEFAULT_TIMEZONE, todayIn } from '../../lib/format';
import { Button, CustomDatePicker, ErrorBanner, Field, Select, TextInput, inputClass, labelClass } from '../ui';

export interface TransactionFormValues {
  type: TransactionTypeValue;
  amount: string;
  title: string;
  description: string;
  transactionDate: string;
  categoryId: string;
  noteId: string;
}

interface Props {
  categories: Category[];
  notes: Note[];
  /** Present in edit mode; omitted when creating. */
  initialValue?: Transaction;
  submitting: boolean;
  banner: string | null;
  fieldErrors: Record<string, string>;
  /** Receives a schema-validated payload; the page adds idempotency/version. */
  onSubmit(payload: CreateTransactionInputDto): void;
}

const TYPE_BUTTONS: ReadonlyArray<{ value: TransactionTypeValue; label: string }> = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
];

/**
 * Create/edit form shared by both flows. It validates with the same Zod schema
 * the API applies, so most mistakes are caught before a round-trip; whatever
 * the server still rejects is merged back in through `fieldErrors`.
 */
export default function TransactionForm({
  categories,
  notes,
  initialValue,
  submitting,
  banner,
  fieldErrors,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<TransactionFormValues>(() => ({
    type: initialValue?.type ?? 'EXPENSE',
    amount: initialValue?.amount ?? '',
    title: initialValue?.title ?? '',
    description: initialValue?.description ?? '',
    transactionDate: initialValue?.transactionDate ?? todayIn(DEFAULT_TIMEZONE),
    categoryId: initialValue?.categoryId ?? '',
    noteId: initialValue?.noteId ?? '',
  }));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const visibleCategories = categories.filter((category) => category.suggestedType === values.type);

  // Flipping type can orphan the chosen category — fall back to the first one
  // that is still valid for the selected type.
  const selectedCategoryId = visibleCategories.some((c) => c.id === values.categoryId)
    ? values.categoryId
    : (visibleCategories[0]?.id ?? '');

  // A tag pointing at a note that no longer exists is dropped rather than
  // sent back to the server as a dangling id.
  const selectedNoteId = notes.some((n) => n.id === values.noteId) ? values.noteId : '';

  const errors = { ...localErrors, ...fieldErrors };

  function update(key: keyof TransactionFormValues, value: string) {
    setLocalErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = createTransactionSchema.safeParse({
      type: values.type,
      amount: values.amount,
      title: values.title,
      categoryId: selectedCategoryId,
      transactionDate: values.transactionDate,
      description: values.description.trim() === '' ? undefined : values.description.trim(),
      noteId: selectedNoteId === '' ? null : selectedNoteId,
    });

    if (!parsed.success) {
      setLocalErrors(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setLocalErrors({});
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <ErrorBanner>{banner}</ErrorBanner>

      <fieldset>
        <legend className={labelClass}>Type</legend>
        <div className="flex gap-2">
          {TYPE_BUTTONS.map((option) => {
            const active = values.type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => update('type', option.value)}
                className={`flex-1 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${
                  active
                    ? option.value === 'INCOME'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                    : 'border border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Amount" htmlFor="tx-amount" error={errors.amount}>
          <TextInput
            id="tx-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            required
            value={values.amount}
            onChange={(event) => update('amount', event.target.value)}
          />
        </Field>

        <Field label="Date" htmlFor="tx-date" error={errors.transactionDate}>
          <CustomDatePicker
            id="tx-date"
            name="transactionDate"
            value={values.transactionDate}
            onChange={(val) => update('transactionDate', val)}
          />
        </Field>
      </div>

      <Field label="Title" htmlFor="tx-title" error={errors.title}>
        <TextInput
          id="tx-title"
          name="title"
          placeholder="Lunch, bus fare, invoice #12…"
          required
          value={values.title}
          onChange={(event) => update('title', event.target.value)}
        />
      </Field>

      <Field label="Category" htmlFor="tx-category" error={errors.categoryId}>
        <Select
          id="tx-category"
          name="categoryId"
          required
          searchable
          searchPlaceholder="Search categories…"
          value={selectedCategoryId}
          onChange={(event) => update('categoryId', event.target.value)}
        >
          <option value="" disabled>
            {visibleCategories.length === 0 ? 'No categories for this type' : 'Choose a category'}
          </option>
          {visibleCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Tag note" htmlFor="tx-note" error={errors.noteId} hint="Optional.">
        <Select
          id="tx-note"
          name="noteId"
          searchable
          searchPlaceholder="Search notes…"
          value={selectedNoteId}
          onChange={(event) => update('noteId', event.target.value)}
        >
          <option value="">No note</option>
          {notes.map((note) => (
            <option key={note.id} value={note.id}>
              {note.title}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Description"
        htmlFor="tx-description"
        error={errors.description}
        hint="Optional."
      >
        <textarea
          id="tx-description"
          name="description"
          rows={3}
          maxLength={1000}
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
          className={`${inputClass} h-auto resize-y`}
        />
      </Field>

      <div className="flex gap-3 pt-1">
        <Button type="submit" className="w-full sm:w-auto" disabled={submitting || visibleCategories.length === 0}>
          {submitting ? 'Saving…' : initialValue ? 'Save changes' : 'Add transaction'}
        </Button>
      </div>
    </form>
  );
}
