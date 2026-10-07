import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/auth-context';
import type { Reminder } from '../../shared/types';
import { createReminderSchema, toFieldErrors } from '../../shared/validation';
import {
  Button,
  Card,
  CustomDatePicker,
  CustomSelect,
  CustomTimePicker,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Spinner,
  TextInput,
} from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { DEFAULT_TIMEZONE, formatDay, todayIn } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
] as const;

type FilterValue = (typeof FILTER_OPTIONS)[number]['value'];

function dueLabel(reminder: Reminder, today: string): { text: string; className: string } {
  const time = reminder.dueTime ? ` · ${reminder.dueTime}` : '';
  if (reminder.completedAt) {
    return { text: `Completed`, className: 'bg-slate-800 text-slate-400' };
  }
  if (reminder.dueDate < today) {
    return {
      text: `Overdue · ${formatDay(reminder.dueDate)}${time}`,
      className: 'bg-rose-950 text-rose-300 border border-rose-900',
    };
  }
  if (reminder.dueDate === today) {
    return {
      text: `Due today${time}`,
      className: 'bg-amber-950 text-amber-300 border border-amber-900',
    };
  }
  return {
    text: `${formatDay(reminder.dueDate)}${time}`,
    className: 'bg-slate-800 text-slate-400',
  };
}

/**
 * Reminders: dated to-dos with a pending/completed split, overdue highlighting
 * and inline create/edit/delete. `completed` is toggled with a single PATCH —
 * the server owns the completion timestamp.
 */
export default function RemindersPage() {
  const { user } = useAuth();
  const today = todayIn(user?.timezone ?? DEFAULT_TIMEZONE);

  const list = useAsync<Reminder[]>(
    (signal) => apiFetch<Reminder[]>(API_ROUTES.reminders.base, { signal }),
    [],
  );

  const [filter, setFilter] = useState<FilterValue>('all');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const rows = list.data ?? [];
  const pending = rows.filter((r) => !r.completedAt);
  const completed = rows.filter((r) => r.completedAt);
  const visible =
    filter === 'pending'
      ? pending
      : filter === 'completed'
        ? completed
        : [...pending, ...completed];

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const parsed = createReminderSchema.safeParse({
      title,
      details: details.trim() || null,
      dueDate,
      dueTime: dueTime || null,
    });
    if (!parsed.success) {
      setCreateErrors(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setCreateErrors({});
    setSubmitting(true);
    try {
      const created = await apiFetch<Reminder>(API_ROUTES.reminders.base, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      list.setData([...(list.data ?? []), created]);
      setTitle('');
      setDetails('');
      setDueDate('');
      setDueTime('');
    } catch (error) {
      setCreateErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(reminder: Reminder) {
    setBanner(null);
    try {
      const updated = await apiFetch<Reminder>(API_ROUTES.reminders.byId(reminder.id), {
        method: 'PATCH',
        body: JSON.stringify({ completed: !reminder.completedAt }),
      });
      list.setData((list.data ?? []).map((r) => (r.id === updated.id ? updated : r)));
    } catch (error) {
      setBanner(bannerFor(error));
    }
  }

  async function handleSave(reminder: Reminder) {
    const parsed = createReminderSchema.safeParse({
      title: editTitle,
      details: editDetails.trim() || null,
      dueDate: editDueDate,
      dueTime: editDueTime || null,
    });
    if (!parsed.success) {
      setBanner(indexByPath(toFieldErrors(parsed.error)).title ?? null);
      return;
    }

    setBanner(null);
    try {
      const updated = await apiFetch<Reminder>(API_ROUTES.reminders.byId(reminder.id), {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      list.setData((list.data ?? []).map((r) => (r.id === updated.id ? updated : r)));
      setEditingId(null);
    } catch (error) {
      setBanner(bannerFor(error));
    }
  }

  async function handleDelete(reminder: Reminder) {
    setBanner(null);
    try {
      await apiFetch(API_ROUTES.reminders.byId(reminder.id), { method: 'DELETE' });
      list.setData((list.data ?? []).filter((r) => r.id !== reminder.id));
      setPendingDeleteId(null);
    } catch (error) {
      setPendingDeleteId(null);
      setBanner(bannerFor(error));
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Reminders"
        subtitle="Bills, goals and anything with a date — pending items sort first."
      />

      <ErrorBanner>{banner}</ErrorBanner>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-white">New reminder</h2>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Title" htmlFor="rem-title" error={createErrors.title}>
            <TextInput
              id="rem-title"
              placeholder="Pay electricity bill"
              maxLength={120}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Due date" htmlFor="rem-due" error={createErrors.dueDate}>
            <CustomDatePicker
              id="rem-due"
              placeholder="Pick a date"
              required
              value={dueDate}
              onChange={setDueDate}
            />
          </Field>
          <Field label="Time" htmlFor="rem-time" error={createErrors.dueTime}>
            <CustomTimePicker id="rem-time" value={dueTime} onChange={setDueTime} />
          </Field>
          <Field label="Details" htmlFor="rem-details" error={createErrors.details}>
            <TextInput
              id="rem-details"
              placeholder="Optional — account number, amount…"
              maxLength={1000}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
              {submitting ? 'Saving…' : 'Add reminder'}
            </Button>
          </div>
        </form>
      </Card>

      {rows.length > 0 ? (
        <div className="mb-4 max-w-[220px]">
          <Field label="Show" htmlFor="rem-filter">
            <CustomSelect
              id="rem-filter"
              value={filter}
              onChange={(value) => setFilter(value as FilterValue)}
              options={[...FILTER_OPTIONS]}
            />
          </Field>
        </div>
      ) : null}

      {list.loading && !list.data ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading reminders" />
        </div>
      ) : list.error ? (
        <ErrorBanner>{list.error.message}</ErrorBanner>
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            rows.length === 0
              ? 'No reminders yet'
              : filter === 'pending'
                ? 'Nothing pending — nice'
                : 'Nothing completed yet'
          }
          body={rows.length === 0 ? 'Add your first reminder above.' : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((reminder) => {
            const chip = dueLabel(reminder, today);
            const done = Boolean(reminder.completedAt);
            return (
              <li
                key={reminder.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                {editingId === reminder.id ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor={`edit-title-${reminder.id}`} className="sr-only">
                        Edit title
                      </label>
                      <input
                        id={`edit-title-${reminder.id}`}
                        autoFocus
                        aria-label="Edit title"
                        value={editTitle}
                        maxLength={120}
                        onChange={(event) => setEditTitle(event.target.value)}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm font-medium text-slate-100 outline-none focus:border-emerald-500"
                      />
                    </div>
                    <Field label="Due date" htmlFor={`edit-due-${reminder.id}`}>
                      <CustomDatePicker
                        id={`edit-due-${reminder.id}`}
                        value={editDueDate}
                        onChange={setEditDueDate}
                      />
                    </Field>
                    <Field label="Time" htmlFor={`edit-time-${reminder.id}`}>
                      <CustomTimePicker
                        id={`edit-time-${reminder.id}`}
                        value={editDueTime}
                        onChange={setEditDueTime}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`edit-details-${reminder.id}`}
                        className="mb-1.5 block text-sm font-medium text-slate-300"
                      >
                        Details
                      </label>
                      <TextInput
                        id={`edit-details-${reminder.id}`}
                        maxLength={1000}
                        value={editDetails}
                        onChange={(event) => setEditDetails(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button variant="primary" onClick={() => void handleSave(reminder)}>
                        Save
                      </Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-3">
                    <button
                      type="button"
                      aria-label={
                        done
                          ? `Mark ${reminder.title} as pending`
                          : `Mark ${reminder.title} as completed`
                      }
                      aria-pressed={done}
                      onClick={() => void handleToggle(reminder)}
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        done
                          ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                          : 'border-slate-600 text-transparent hover:border-emerald-400'
                      }`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`font-medium break-words ${
                            done ? 'text-slate-500 line-through' : 'text-slate-100'
                          }`}
                        >
                          {reminder.title}
                        </h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${chip.className}`}>
                          {chip.text}
                        </span>
                      </div>
                      {reminder.details ? (
                        <p className="mt-1 break-words text-sm text-slate-400">
                          {reminder.details}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingId(reminder.id);
                            setEditTitle(reminder.title);
                            setEditDetails(reminder.details ?? '');
                            setEditDueDate(reminder.dueDate);
                            setEditDueTime(reminder.dueTime ?? '');
                            setPendingDeleteId(null);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setPendingDeleteId(pendingDeleteId === reminder.id ? null : reminder.id)
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {pendingDeleteId === reminder.id ? (
                  <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm">
                    <p className="text-rose-200">
                      Delete “{reminder.title}”? This cannot be undone.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="danger" onClick={() => void handleDelete(reminder)}>
                        Delete
                      </Button>
                      <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
