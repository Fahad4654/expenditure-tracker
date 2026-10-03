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
    });
  });
});
