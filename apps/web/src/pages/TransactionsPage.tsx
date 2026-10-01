import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category, Paginated, Transaction } from '@exp/types';
import TransactionRow from '../components/TransactionRow';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  Spinner,
  TextInput,
} from '../components/ui';
import { API_ROUTES, apiFetch } from '../lib/api';
import { queryString } from '../lib/query';
import { useAsync } from '../lib/useAsync';
import { useDebounced } from '../lib/useDebounced';
import { ROUTES } from '../routes';

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'EXPENSE', label: 'Expenses' },
  { value: 'INCOME', label: 'Income' },
] as const;

const PRESET_OPTIONS = [
  { value: '', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
] as const;

const SORT_OPTIONS = [
  { value: 'transactionDate|desc', label: 'Newest first' },
  { value: 'transactionDate|asc', label: 'Oldest first' },
  { value: 'amount|desc', label: 'Highest amount' },
  { value: 'amount|asc', label: 'Lowest amount' },
] as const;

export default function TransactionsPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [preset, setPreset] = useState('');
  const [sort, setSort] = useState('transactionDate|desc');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search);

  // Any filter change invalidates the current page number. Resetting inside
  // each control keeps the rule "no setState in an effect" honest.

  const [sortField, sortOrder] = sort.split('|') as [string, string];

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      type: type || undefined,
      categoryId: categoryId || undefined,
      preset: preset || undefined,
      page,
      limit: PAGE_SIZE,
      sort: sortField,
      order: sortOrder,
    }),
    [debouncedSearch, type, categoryId, preset, page, sortField, sortOrder],
  );

  const categories = useAsync<Category[]>(
    (signal) => apiFetch<Category[]>(API_ROUTES.categories.base, { signal }),
    [],
  );

  const list = useAsync<Paginated<Transaction>>(
    (signal) =>
      apiFetch<Paginated<Transaction>>(`${API_ROUTES.transactions.base}${queryString(filters)}`, {
        signal,
      }),
    [filters],
  );

  const categoryMap = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data],
  );

  const meta = list.data?.meta;
  const hasFilters = Boolean(debouncedSearch || type || categoryId || preset);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <PageHeader
        title="Transactions"
        subtitle={meta ? `${meta.total} matching` : 'Everything you have recorded.'}
        actions={
          <Link to={ROUTES.transactionNew}>
            <Button>Add transaction</Button>
          </Link>
        }
      />

      <Card className="mb-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="tx-search">
            <TextInput
              id="tx-search"
              type="search"
              placeholder="Title or description"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>

          <Field label="Type" htmlFor="tx-type">
            <Select
              id="tx-type"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category" htmlFor="tx-category">
            <Select
              id="tx-category"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Period" htmlFor="tx-preset">
            <Select
              id="tx-preset"
              value={preset}
              onChange={(event) => {
                setPreset(event.target.value);
                setPage(1);
              }}
            >
              {PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Field label="Sort" htmlFor="tx-sort">
            <Select
              id="tx-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setType('');
                setCategoryId('');
                setPreset('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      <ErrorBanner>
        {list.error ? (
          <div className="flex items-center justify-between gap-4">
            <span>{list.error.message}</span>
            <Button variant="secondary" onClick={list.reload}>
              Retry
            </Button>
          </div>
        ) : null}
      </ErrorBanner>

      {list.loading && !list.data ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading transactions" />
        </div>
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No transactions match these filters' : 'No transactions yet'}
          body={
            hasFilters
              ? 'Try widening the period or clearing the search.'
              : 'Add your first income or expense to get started.'
          }
        />
      ) : list.data ? (
        <Card className="!p-0">
          <ul className="divide-y divide-slate-800">
            {list.data.items.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                categories={categoryMap}
              />
            ))}
          </ul>

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4 text-sm">
              <Button
                variant="secondary"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-slate-400">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}
