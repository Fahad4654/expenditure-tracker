import type { Category } from '../../shared/types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CategoriesPage from './CategoriesPage';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const okBody = (data: unknown) => jsonResponse({ ok: true, data });

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    userId: 'user-1',
    name: 'Pets',
    kind: 'USER',
    icon: 'pets',
    color: '#EC4899',
    isSystem: false,
    suggestedType: 'EXPENSE',
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

function stubFetch(route: Router) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(route(urlOf(input), init)),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/categories']}>
      <CategoriesPage />
    </MemoryRouter>,
  );
}

function bodyOf(call: [input: RequestInfo | URL, init?: RequestInit] | undefined): unknown {
  const body = call?.[1]?.body;
  return JSON.parse(typeof body === 'string' ? body : '{}');
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('CategoriesPage', () => {
  it('lists categories with a colour swatch and edit controls', async () => {
    stubFetch(() => okBody([makeCategory()]));

    renderPage();

    const name = await screen.findByText('Pets');
    const card = name.closest('li');
    expect(card).toBeTruthy();
    const dot = (card as HTMLElement).querySelector<HTMLSpanElement>('span[aria-hidden]');
    expect(dot?.style.backgroundColor).toBe('rgb(236, 72, 153)');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('keeps system categories read-only', async () => {
    stubFetch(() =>
      okBody([
        makeCategory({
          id: 'sys-1',
          name: 'Food',
          kind: 'SYSTEM',
          isSystem: true,
          userId: null,
          icon: 'utensils',
          color: '#F97316',
        }),
      ]),
    );

    renderPage();

    expect(await screen.findByText('Food')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('edits name, suggested type and colour together', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === 'PATCH') {
        return okBody(
          makeCategory({
            name: 'Vet bills',
            suggestedType: 'INCOME',
            color: '#3B82F6',
          }),
        );
      }
      return url ? okBody([makeCategory()]) : okBody([]);
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit Pets' });

    fireEvent.change(within(form).getByLabelText('Name'), {
      target: { value: 'Vet bills' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Suggested type' }));
    fireEvent.click(within(form).getByRole('option', { name: 'Income' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Colour #3B82F6' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(bodyOf(patch)).toEqual({
        name: 'Vet bills',
        suggestedType: 'INCOME',
        color: '#3B82F6',
      });
    });

    expect(await screen.findByText('Vet bills')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Edit Pets' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('cancelling the editor never sends a request', async () => {
    const fetchMock = stubFetch(() => okBody([makeCategory()]));

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      within(screen.getByRole('form', { name: 'Edit Pets' })).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(screen.queryByRole('form', { name: 'Edit Pets' })).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  });

  it('creates a category with the chosen colour', async () => {
    const fetchMock = stubFetch((url, init) => {
      if (init?.method === 'POST') {
        return okBody(makeCategory({ id: 'cat-2', name: 'Vet care' }));
      }
      return url ? okBody([makeCategory()]) : okBody([]);
    });

    renderPage();

    await screen.findByRole('button', { name: 'Add category' });
    fireEvent.change(document.getElementById('cat-name') as HTMLInputElement, {
      target: { value: 'Vet care' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Colour #0EA5E9' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(post).toBeTruthy();
      expect(bodyOf(post)).toEqual({
        name: 'Vet care',
        suggestedType: 'EXPENSE',
        color: '#0EA5E9',
      });
    });
  });
});
