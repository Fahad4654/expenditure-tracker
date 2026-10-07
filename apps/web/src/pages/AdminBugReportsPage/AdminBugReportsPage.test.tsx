import type { AdminBugReport } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthProvider from '../../auth/AuthProvider';
import AdminBugReportsPage from './AdminBugReportsPage';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const okBody = (data: unknown) => jsonResponse({ ok: true, data });
const failAuth = () =>
  jsonResponse({ ok: false, error: { code: 'REFRESH_TOKEN_INVALID', message: 'gone' } }, 401);

function makeReport(overrides: Partial<AdminBugReport> = {}): AdminBugReport {
  return {
    id: 'bug-1',
    userId: 'user-9',
    reporterName: 'Bob Khan',
    reporterEmail: 'bob@example.com',
    title: 'Chart renders empty',
    description: 'The monthly report chart is blank for October.',
    severity: 'HIGH',
    status: 'OPEN',
    area: 'Reports',
    appVersion: null,
    platform: 'web',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

type Router = (url: string, init?: RequestInit) => Response;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function bodyText(init: RequestInit | undefined): string {
  const body = init?.body;
  return typeof body === 'string' ? body : '';
}

function stubFetch(route: Router) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(route(urlOf(input), init)),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderAdminPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/bug-reports']}>
      <AuthProvider>
        <AdminBugReportsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('AdminBugReportsPage', () => {
  it('lists every report with its reporter, newest data on screen', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([
        makeReport(),
        makeReport({
          id: 'bug-2',
          title: 'Wrong balance',
          userId: 'user-4',
          reporterName: 'Alice Rahman',
          reporterEmail: 'alice@example.com',
        }),
      ]);
    });

    renderAdminPage();

    expect(await screen.findByText('Chart renders empty')).toBeTruthy();
    expect(screen.getByText('Wrong balance')).toBeTruthy();
    expect(screen.getByText('Bob Khan')).toBeTruthy();
    expect(screen.getByText('Alice Rahman')).toBeTruthy();
    expect(screen.getByText(/alice@example\.com/)).toBeTruthy();
    expect(screen.getByText('2 of 2 reports')).toBeTruthy();
  });

  it('filters by status on the client', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([
        makeReport(),
        makeReport({ id: 'bug-2', title: 'Wrong balance', status: 'RESOLVED' }),
      ]);
    });

    renderAdminPage();
    await screen.findByText('Chart renders empty');

    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Resolved' }));

    expect(await screen.findByText('1 of 2 reports')).toBeTruthy();
    expect(screen.queryByText('Chart renders empty')).toBeNull();
    expect(screen.getByText('Wrong balance')).toBeTruthy();
  });

  it('moves a report through triage with a PATCH to the admin route', async () => {
    const mock = stubFetch((url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (String(url).endsWith('/admin/bug-reports/bug-1') && method === 'PATCH') {
        return okBody(makeReport({ status: 'IN_PROGRESS' }));
      }
      return okBody([makeReport()]);
    });

    renderAdminPage();
    await screen.findByText('Chart renders empty');

    fireEvent.click(screen.getAllByRole('button', { name: 'Status' })[0]!);
    fireEvent.click(await screen.findByRole('option', { name: 'In progress' }));

    await waitFor(() => {
      const patch = mock.mock.calls.find(
        ([url, init]) =>
          urlOf(url).endsWith('/admin/bug-reports/bug-1') &&
          (init as RequestInit)?.method === 'PATCH',
      );
      expect(patch).toBeDefined();
      expect(JSON.parse(bodyText(patch![1]))).toEqual({
        status: 'IN_PROGRESS',
      });
    });

    expect(
      mock.mock.calls.some(
        ([url, init]) =>
          urlOf(url).endsWith('/admin/bug-reports/bug-1') &&
          (init as RequestInit)?.method === 'PATCH',
      ),
    ).toBe(true);
    // The row moved off OPEN — chip and select both reflect the response.
    expect(screen.queryByText('Open')).toBeNull();
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
  });

  it('surfaces an admin rejection instead of silently dropping the change', async () => {
    const mock = stubFetch((url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (String(url).endsWith('/admin/bug-reports/bug-1') && method === 'PATCH') {
        return jsonResponse(
          { ok: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
          403,
        );
      }
      return okBody([makeReport()]);
    });

    renderAdminPage();
    await screen.findByText('Chart renders empty');

    fireEvent.click(screen.getAllByRole('button', { name: 'Status' })[0]!);
    fireEvent.click(await screen.findByRole('option', { name: 'Closed' }));

    expect(await screen.findByText(/Admin access required/)).toBeTruthy();
    expect(
      mock.mock.calls.some(
        ([url, init]) =>
          urlOf(url).endsWith('/admin/bug-reports/bug-1') &&
          (init as RequestInit)?.method === 'PATCH',
      ),
    ).toBe(true);
    // The row keeps the status the server refused to change.
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
    expect(screen.queryByText('Closed')).toBeNull();
  });
});
