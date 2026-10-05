import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Category, Note } from '../../shared/types';
import TransactionForm from './TransactionForm';

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-food',
    userId: null,
    name: 'Food',
    kind: 'SYSTEM',
    icon: 'utensils',
    color: '#F97316',
    isSystem: true,
    suggestedType: 'EXPENSE',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

const categories: Category[] = [
  makeCategory(),
  makeCategory({ id: 'cat-transport', name: 'Transport', icon: 'car' }),
  makeCategory({ id: 'cat-salary', name: 'Salary', suggestedType: 'INCOME' }),
];

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

const notes: Note[] = [
  makeNote(),
  makeNote({ id: 'note-2', title: 'Trip ideas' }),
];

function renderForm() {
  return render(
    <TransactionForm
      categories={categories}
      notes={notes}
      submitting={false}
      banner={null}
      fieldErrors={{}}
      onSubmit={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe('TransactionForm category search', () => {
  it('opens the category list with a search box', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Category' }));

    expect(screen.getByLabelText('Search categories…')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Food' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Transport' })).toBeTruthy();
  });

  it('filters categories as the query is typed', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    fireEvent.change(screen.getByLabelText('Search categories…'), {
      target: { value: 'trans' },
    });

    expect(screen.getByRole('option', { name: 'Transport' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Food' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Salary' })).toBeNull();
  });

  it('reports when nothing matches the query', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    fireEvent.change(screen.getByLabelText('Search categories…'), {
      target: { value: 'zzz' },
    });

    expect(screen.queryByRole('option')).toBeNull();
    expect(screen.getByText('No matches for “zzz”')).toBeTruthy();
  });

  it('picks the matching category and closes the list', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Category' }));
    fireEvent.change(screen.getByLabelText('Search categories…'), {
      target: { value: 'trans' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'Transport' }));

    const trigger = screen.getByRole('button', { name: 'Category' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.textContent).toContain('Transport');
  });
});

describe('TransactionForm tag-note search', () => {
  it('filters the note list as the query is typed', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Tag note' }));
    expect(screen.getByLabelText('Search notes…')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search notes…'), {
      target: { value: 'trip' },
    });

    expect(screen.getByRole('option', { name: 'Trip ideas' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Groceries' })).toBeNull();
  });

  it('picks the matching note and closes the list', () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Tag note' }));
    fireEvent.change(screen.getByLabelText('Search notes…'), {
      target: { value: 'trip' },
    });
    fireEvent.click(screen.getByRole('option', { name: 'Trip ideas' }));

    const trigger = screen.getByRole('button', { name: 'Tag note' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.textContent).toContain('Trip ideas');
  });
});
