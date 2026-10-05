import type { Note } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthProvider from '../../auth/AuthProvider';
import NotesPage from './NotesPage';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const okBody = (data: unknown) => jsonResponse({ ok: true, data });
const failAuth = () =>
  jsonResponse({ ok: false, error: { code: 'REFRESH_TOKEN_INVALID', message: 'gone' } }, 401);

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Groceries',
    content: 'milk, eggs',
    transactions: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T09:30:00.000Z',
    ...overrides,
  };
}

type Router = (url: string, init?: RequestInit) => Response;

function stubFetch(route: Router) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(route(String(input), init)),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderNotes() {
  return render(
    <MemoryRouter initialEntries={['/notes']}>
      <AuthProvider>
        <NotesPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('NotesPage', () => {
  it('lists the loaded notes', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([makeNote()]);
    });

    renderNotes();

    expect(await screen.findByText('Groceries')).toBeTruthy();
    expect(screen.getByText('milk, eggs')).toBeTruthy();
    expect(screen.queryByText('Tagged on')).toBeNull();
  });

  it('shows the transactions a note is tagged on', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([
        makeNote({
          transactions: [{ id: 'tx-1', title: 'Weekly groceries', transactionDate: '2026-10-02' }],
        }),
      ]);
    });

    renderNotes();

    const link = await screen.findByRole('link', { name: /Weekly groceries/ });
    expect(link.getAttribute('href')).toBe('/transactions/tx-1');
    expect(screen.getByText('Tagged on')).toBeTruthy();
  });

  it('validates on the client and never posts an empty title', async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([]);
    });

    renderNotes();
    await waitFor(() => expect(screen.getByText('No notes yet')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    const posts = mock.mock.calls.filter(
      ([url, init]) => String(url).endsWith('/notes') && (init as RequestInit)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });

  it('creates a note and appends it to the list', async () => {
    const mock = stubFetch((url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (url.endsWith('/notes') && method === 'POST') {
        return okBody(makeNote({ id: 'note-2', title: 'Weekend plans', content: null }));
      }
      return okBody([]);
    });

    renderNotes();
    await waitFor(() => expect(screen.getByText('No notes yet')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Weekend plans' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(await screen.findByText('Weekend plans')).toBeTruthy();

    const post = mock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/notes') && (init as RequestInit)?.method === 'POST',
    );
    expect(post).toBeDefined();
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      title: 'Weekend plans',
      content: null,
      transactionIds: [],
    });
  });

  it('tags a transaction on a new note', async () => {
    const txId = '33333333-3333-4333-8333-333333333333';
    const mock = stubFetch((url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (String(url).includes('/transactions?')) {
        return okBody({
          items: [
            { id: txId, title: 'Weekly groceries', transactionDate: '2026-10-02' },
          ],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        });
      }
      if (url.endsWith('/notes') && method === 'POST') {
        return okBody(
          makeNote({
            id: 'note-9',
            title: 'Groceries run',
            transactions: [
              { id: txId, title: 'Weekly groceries', transactionDate: '2026-10-02' },
            ],
          }),
        );
      }
      return okBody([]);
    });

    renderNotes();
    await waitFor(() => expect(screen.getByText('No notes yet')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Groceries run' } });

    // The select trigger takes its accessible name from the field label.
    fireEvent.click(screen.getByRole('button', { name: 'Tagged transactions' }));
    fireEvent.click(screen.getByRole('option', { name: /Weekly groceries/ }));

    const remove = screen.getByRole('button', {
      name: 'Remove tag Weekly groceries · 2 Oct 2026',
    });
    expect(remove).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => {
      const post = mock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/notes') && (init as RequestInit)?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
        title: 'Groceries run',
        content: null,
        transactionIds: [txId],
      });
    });
  });

  it('filters the tag picker as the query is typed', async () => {
    stubFetch((url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (String(url).includes('/transactions?')) {
        return okBody({
          items: [
            { id: '33333333-3333-4333-8333-333333333333', title: 'Weekly groceries', transactionDate: '2026-10-02' },
            { id: '44444444-4444-4444-8444-444444444444', title: 'Rent', transactionDate: '2026-10-01' },
          ],
          meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
        });
      }
      if (method === 'GET' && url.endsWith('/notes')) return okBody([]);
      return okBody([]);
    });

    renderNotes();
    await waitFor(() => expect(screen.getByText('No notes yet')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Tagged transactions' }));
    const search = screen.getByLabelText('Search transactions…');

    fireEvent.change(search, { target: { value: 'rent' } });
    expect(screen.getByRole('option', { name: 'Rent · 1 Oct 2026' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Weekly groceries/ })).toBeNull();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByText('No matches for “zzz”')).toBeTruthy();
  });

  it('updates the tag set when saving an edit', async () => {
    const txKeep = '44444444-4444-4444-8444-444444444444';
    const txDrop = '33333333-3333-4333-8333-333333333333';
    const mock = stubFetch((url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (String(url).includes('/transactions?')) {
        return okBody({
          items: [
            { id: txKeep, title: 'Rent', transactionDate: '2026-10-01' },
            { id: txDrop, title: 'Weekly groceries', transactionDate: '2026-10-02' },
          ],
          meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
        });
      }
      if (String(url).endsWith('/notes/note-1') && method === 'PATCH') {
        return okBody(
          makeNote({
            transactions: [
              { id: txKeep, title: 'Rent', transactionDate: '2026-10-01' },
            ],
          }),
        );
      }
      if (url.endsWith('/notes')) {
        return okBody([
          makeNote({
            transactions: [
              { id: txDrop, title: 'Weekly groceries', transactionDate: '2026-10-02' },
              { id: txKeep, title: 'Rent', transactionDate: '2026-10-01' },
            ],
          }),
        ]);
      }
      return okBody([]);
    });

    renderNotes();
    expect(await screen.findByText('Groceries')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Drop one tag, keep the other.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove tag Weekly groceries · 2 Oct 2026' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = mock.mock.calls.find(
        ([url, init]) =>
          String(url).endsWith('/notes/note-1') && (init as RequestInit)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({
        title: 'Groceries',
        content: 'milk, eggs',
        transactionIds: [txKeep],
      });
    });
  });
});
