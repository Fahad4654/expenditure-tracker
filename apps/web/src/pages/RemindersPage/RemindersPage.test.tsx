import type { Reminder } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthProvider from '../../auth/AuthProvider';
import RemindersPage from './RemindersPage';

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

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem-1',
    title: 'Pay internet bill',
    details: 'Account 12345',
    dueDate: '2020-01-01',
    completedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
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

function renderReminders() {
  return render(
    <MemoryRouter initialEntries={['/reminders']}>
      <AuthProvider>
        <RemindersPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('RemindersPage', () => {
  it('lists pending reminders first and flags overdue ones', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([
        makeReminder(),
        makeReminder({
          id: 'rem-2',
          title: 'Renew passport',
          dueDate: '2030-05-01',
          completedAt: '2026-09-01T12:00:00.000Z',
        }),
      ]);
    });

    renderReminders();

    expect(await screen.findByText('Pay internet bill')).toBeTruthy();
    expect(screen.getByText(/Overdue/)).toBeTruthy();
    expect(screen.getByText('Renew passport')).toBeTruthy();

    const titles = screen.getAllByRole('heading', { level: 3 }).map((el) => el.textContent);
    expect(titles.indexOf('Pay internet bill')).toBeLessThan(titles.indexOf('Renew passport'));
  });

  it('marks a reminder completed with a single PATCH', async () => {
    const mock = stubFetch((url, init) => {
      const method = (init as RequestInit | undefined)?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (String(url).includes('/reminders/') && method === 'PATCH') {
        return okBody(
          makeReminder({ completedAt: '2026-10-03T12:00:00.000Z' }),
        );
      }
      return okBody([makeReminder()]);
    });

    renderReminders();

    const toggle = await screen.findByRole('button', {
      name: 'Mark Pay internet bill as completed',
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      const patch = mock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ completed: true });
    });
  });

  it('validates on the client and never posts an incomplete reminder', async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([]);
    });

    renderReminders();
    await waitFor(() => expect(screen.getByText('No reminders yet')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    const posts = mock.mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith('/reminders') && (init as RequestInit)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });
});
