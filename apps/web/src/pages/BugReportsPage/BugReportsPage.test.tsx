import type { BugReport } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AuthProvider from '../../auth/AuthProvider';
import BugReportsPage from './BugReportsPage';

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

function makeReport(overrides: Partial<BugReport> = {}): BugReport {
  return {
    id: 'bug-1',
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

function renderReports() {
  return render(
    <MemoryRouter initialEntries={['/bug-reports']}>
      <AuthProvider>
        <BugReportsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('BugReportsPage', () => {
  it('lists the loaded reports with severity and status chips', async () => {
    stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([makeReport()]);
    });

    renderReports();

    expect(await screen.findByText('Chart renders empty')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText(/Reports · Web/)).toBeTruthy();
  });

  it('validates on the client and never posts an empty report', async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith('/auth/refresh')) return failAuth();
      return okBody([]);
    });

    renderReports();
    await waitFor(() => expect(screen.getByText('No bug reports yet')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    const posts = mock.mock.calls.filter(
      ([url, init]) =>
        urlOf(url).endsWith('/bug-reports') && (init as RequestInit)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });

  it('creates a report, tagging it as coming from the web client', async () => {
    const mock = stubFetch((url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (url.endsWith('/bug-reports') && method === 'POST') {
        return okBody(
          makeReport({ id: 'bug-2', title: 'Wrong balance', severity: 'MEDIUM', area: null }),
        );
      }
      return okBody([]);
    });

    renderReports();
    await waitFor(() => expect(screen.getByText('No bug reports yet')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Wrong balance' },
    });
    fireEvent.change(screen.getByLabelText('What happened?'), {
      target: { value: 'Balance is off by one taka.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    expect(await screen.findByText('Wrong balance')).toBeTruthy();

    const post = mock.mock.calls.find(
      ([url, init]) =>
        urlOf(url).endsWith('/bug-reports') && (init as RequestInit)?.method === 'POST',
    );
    expect(post).toBeDefined();
    expect(JSON.parse(bodyText(post![1]))).toEqual({
      title: 'Wrong balance',
      description: 'Balance is off by one taka.',
      severity: 'MEDIUM',
      area: null,
      platform: 'web',
    });
  });

  it('lets the caller pick a severity from the system select', async () => {
    const mock = stubFetch((url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (url.endsWith('/bug-reports') && method === 'POST') {
        return okBody(makeReport({ id: 'bug-3', title: 'Crashes on launch' }));
      }
      return okBody([]);
    });

    renderReports();
    await waitFor(() => expect(screen.getByText('No bug reports yet')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Crashes on launch' },
    });
    fireEvent.change(screen.getByLabelText('What happened?'), {
      target: { value: 'It never gets past the splash screen.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Severity' }));
    fireEvent.click(screen.getByRole('option', { name: 'Critical' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));

    await waitFor(() => {
      const post = mock.mock.calls.find(
        ([url, init]) =>
          urlOf(url).endsWith('/bug-reports') && (init as RequestInit)?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse(bodyText(post![1]))).toMatchObject({
        title: 'Crashes on launch',
        severity: 'CRITICAL',
      });
    });
  });

  it('deletes a report after an inline confirmation', async () => {
    const mock = stubFetch((url, init) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/auth/refresh')) return failAuth();
      if (String(url).endsWith('/bug-reports/bug-1') && method === 'DELETE') {
        return okBody(makeReport());
      }
      return okBody([makeReport()]);
    });

    renderReports();
    expect(await screen.findByText('Chart renders empty')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // The confirm panel repeats the label — the second click is the confirm.
    const deletes = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deletes.at(-1)!);

    await waitFor(() => expect(screen.queryByText('Chart renders empty')).toBeNull());

    const call = mock.mock.calls.find(
      ([url, init]) =>
        urlOf(url).endsWith('/bug-reports/bug-1') && (init as RequestInit)?.method === 'DELETE',
    );
    expect(call).toBeDefined();
  });
});
