import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category, Paginated, Transaction } from '../../shared/types';
import TransactionRow from '../../components/TransactionRow/TransactionRow';
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
} from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { queryString } from '../../lib/query';
import { useAsync } from '../../lib/useAsync';
import { useDebounced } from '../../lib/useDebounced';
import { ROUTES } from '../../routes';

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const activeFilterCount =
    (type ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (preset ? 1 : 0) +
    (sort !== 'transactionDate|desc' ? 1 : 0);

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
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Transactions"
        subtitle={meta ? `${meta.total} matching` : 'Everything you have recorded.'}
        actions={
          <Link to={ROUTES.transactionNew} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Add transaction</span>
            </Button>
          </Link>
        }
      />

      <Card className="mb-6">
        {/* Mobile top filter bar: Search input + Filter toggle button */}
        <div className="flex sm:hidden items-center gap-2">
          <div className="flex-1 min-w-0">
            <TextInput
              id="tx-search-mobile"
              type="search"
              placeholder="Search title or description..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button
            type="button"
            variant={showMobileFilters || activeFilterCount > 0 ? 'primary' : 'secondary'}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs min-h-[44px]"
            onClick={() => setShowMobileFilters((v) => !v)}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span>Filter</span>
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </div>

        {/* Active filter pills on mobile when collapsed */}
        {!showMobileFilters && activeFilterCount > 0 ? (
          <div className="flex sm:hidden flex-wrap items-center gap-1.5 mt-2.5">
            {type ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-200 border border-slate-700">
                {TYPE_OPTIONS.find((o) => o.value === type)?.label}
                <button
                  type="button"
                  onClick={() => {
                    setType('');
                    setPage(1);
                  }}
                  className="text-slate-400 hover:text-white font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            ) : null}
            {categoryId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-200 border border-slate-700">
                {categoryMap.get(categoryId)?.name ?? 'Category'}
                <button
                  type="button"
                  onClick={() => {
                    setCategoryId('');
                    setPage(1);
                  }}
                  className="text-slate-400 hover:text-white font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            ) : null}
            {preset ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-200 border border-slate-700">
                {PRESET_OPTIONS.find((o) => o.value === preset)?.label}
                <button
                  type="button"
                  onClick={() => {
                    setPreset('');
                    setPage(1);
                  }}
                  className="text-slate-400 hover:text-white font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            ) : null}
            {sort !== 'transactionDate|desc' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-200 border border-slate-700">
                {SORT_OPTIONS.find((o) => o.value === sort)?.label}
                <button
                  type="button"
                  onClick={() => {
                    setSort('transactionDate|desc');
                    setPage(1);
                  }}
                  className="text-slate-400 hover:text-white font-bold ml-0.5"
                >
                  ×
                </button>
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setType('');
                setCategoryId('');
                setPreset('');
                setSort('transactionDate|desc');
                setPage(1);
              }}
              className="text-xs text-emerald-400 hover:underline ml-1 font-medium"
            >
              Clear all
            </button>
          </div>
        ) : null}

        {/* Filters panel (Collapsible on mobile, always visible on desktop) */}
        <div className={`mt-4 sm:mt-0 ${showMobileFilters ? 'block' : 'hidden sm:block'}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search" htmlFor="tx-search" className="hidden sm:block">
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

          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-slate-800/80 pt-4 sm:border-0 sm:pt-0">
            <div className="w-full sm:w-48">
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
            </div>

            {hasFilters || sort !== 'transactionDate|desc' ? (
              <Button
                variant="ghost"
                className="self-end text-xs sm:text-sm"
                onClick={() => {
                  setSearch('');
                  setType('');
                  setCategoryId('');
                  setPreset('');
                  setSort('transactionDate|desc');
                  setPage(1);
                }}
              >
                Clear all filters
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <ErrorBanner>
        {list.error ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-slate-800/80">
            {list.data.items.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                categories={categoryMap}
              />
            ))}
          </ul>

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-800/80 px-4 sm:px-5 py-4 text-sm">
              <Button
                variant="secondary"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </Button>
              <span className="text-slate-400 text-xs sm:text-sm">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </main>
  );
}
