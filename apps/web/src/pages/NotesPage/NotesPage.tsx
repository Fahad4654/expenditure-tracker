import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Note } from '../../shared/types';
import { createNoteSchema, toFieldErrors } from '../../shared/validation';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Spinner,
  TextInput,
  inputClass,
} from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { formatDay, formatInstant } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { transactionPath } from '../../routes';

/**
 * Notes: a private scratch space with list + inline create/edit/delete.
 * Follows the CategoriesPage conventions — no modals, confirmations expand in
 * place, and every mutation updates the local list optimistically.
 */
export default function NotesPage() {
  const list = useAsync<Note[]>(
    (signal) => apiFetch<Note[]>(API_ROUTES.notes.base, { signal }),
    [],
  );

  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const notes = (list.data ?? []).filter(
    (note) =>
      query === '' ||
      note.title.toLowerCase().includes(query) ||
      (note.content ?? '').toLowerCase().includes(query),
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const parsed = createNoteSchema.safeParse({
      title,
      content: content.trim() || null,
    });
    if (!parsed.success) {
      setCreateErrors(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setCreateErrors({});
    setSubmitting(true);
    try {
      const created = await apiFetch<Note>(API_ROUTES.notes.base, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      list.setData([created, ...(list.data ?? [])]);
      setTitle('');
      setContent('');
    } catch (error) {
      setCreateErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave(note: Note) {
    const parsed = createNoteSchema.safeParse({
      title: editTitle,
      content: editContent.trim() || null,
    });
    if (!parsed.success) {
      setBanner(indexByPath(toFieldErrors(parsed.error)).title ?? null);
      return;
    }

    setBanner(null);
    try {
      const updated = await apiFetch<Note>(API_ROUTES.notes.byId(note.id), {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      list.setData((list.data ?? []).map((n) => (n.id === updated.id ? updated : n)));
      setEditingId(null);
    } catch (error) {
      setBanner(bannerFor(error));
    }
  }

  async function handleDelete(note: Note) {
    setBanner(null);
    try {
      await apiFetch(API_ROUTES.notes.byId(note.id), { method: 'DELETE' });
      list.setData((list.data ?? []).filter((n) => n.id !== note.id));
      setPendingDeleteId(null);
    } catch (error) {
      setPendingDeleteId(null);
      setBanner(bannerFor(error));
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Notes"
        subtitle="Quick thoughts and lists — private to your account."
      />

      <ErrorBanner>{banner}</ErrorBanner>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-white">New note</h2>
        <form onSubmit={handleCreate} className="grid gap-4" noValidate>
          <Field label="Title" htmlFor="note-title" error={createErrors.title}>
            <TextInput
              id="note-title"
              placeholder="Grocery list"
              maxLength={120}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Note" htmlFor="note-content" error={createErrors.content}>
            <textarea
              id="note-content"
              rows={4}
              maxLength={5000}
              placeholder="Anything you want to remember…"
              className={inputClass}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
              {submitting ? 'Saving…' : 'Add note'}
            </Button>
          </div>
        </form>
      </Card>

      {(list.data?.length ?? 0) > 0 ? (
        <div className="mb-4 max-w-sm">
          <label htmlFor="note-search" className="sr-only">
            Search notes
          </label>
          <TextInput
            id="note-search"
            type="search"
            placeholder="Search notes…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      ) : null}

      {list.loading && !list.data ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading notes" />
        </div>
      ) : list.error ? (
        <ErrorBanner>{list.error.message}</ErrorBanner>
      ) : notes.length === 0 ? (
        <EmptyState
          title={query ? 'No notes match your search' : 'No notes yet'}
          body={query ? undefined : 'Create your first note above.'}
        />
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {notes.map((note) => (
            <li
              key={note.id}
              className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              {editingId === note.id ? (
                <div className="grid gap-3">
                  <label htmlFor={`edit-title-${note.id}`} className="sr-only">
                    Edit title
                  </label>
                  <input
                    id={`edit-title-${note.id}`}
                    autoFocus
                    aria-label="Edit title"
                    value={editTitle}
                    maxLength={120}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm font-medium text-slate-100 outline-none focus:border-emerald-500"
                  />
                  <label htmlFor={`edit-content-${note.id}`} className="sr-only">
                    Edit note
                  </label>
                  <textarea
                    id={`edit-content-${note.id}`}
                    aria-label="Edit note"
                    rows={5}
                    maxLength={5000}
                    className={inputClass}
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" onClick={() => void handleSave(note)}>
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="font-medium text-slate-100 break-words">{note.title}</h3>
                  {note.content ? (
                    <p className="mt-2 flex-1 whitespace-pre-wrap break-words text-sm text-slate-400 line-clamp-6">
                      {note.content}
                    </p>
                  ) : (
                    <div className="flex-1" />
                  )}
                  {note.transactions.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500">Tagged on</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {note.transactions.map((transaction) => (
                          <Link
                            key={transaction.id}
                            to={transactionPath(transaction.id)}
                            className="max-w-full truncate rounded-full border border-emerald-900 bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300 transition hover:border-emerald-700 hover:text-emerald-200"
                          >
                            {transaction.title} · {formatDay(transaction.transactionDate)}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-3 text-xs text-slate-500">
                    Edited {formatInstant(note.updatedAt)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditTitle(note.title);
                        setEditContent(note.content ?? '');
                        setPendingDeleteId(null);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setPendingDeleteId(pendingDeleteId === note.id ? null : note.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}

              {pendingDeleteId === note.id ? (
                <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm">
                  <p className="text-rose-200">Delete “{note.title}”? This cannot be undone.</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="danger" onClick={() => void handleDelete(note)}>
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
