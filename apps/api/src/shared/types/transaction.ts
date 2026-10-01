import type { CurrencyCode, DecimalString, IsoDate, IsoDateTime, Uuid } from './common';

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE'] as const;
export type TransactionTypeValue = (typeof TRANSACTION_TYPES)[number];

export interface Transaction {
  id: Uuid;
  /**
   * Client-generated UUID created by the mobile app before it ever talks to the
   * server. Stable across devices and sync retries — used for idempotency.
   */
  clientId: Uuid;
  /** Device that first created this row (nullable for web-created rows). */
  deviceId: string | null;
  userId: Uuid;
  type: TransactionTypeValue;
  /** Decimal string, e.g. `"250.00"`. Never a JS number. */
  amount: DecimalString;
  currency: CurrencyCode;
  categoryId: Uuid;
  title: string;
  description: string | null;
  /** Calendar date in the owner's timezone: `YYYY-MM-DD`. */
  transactionDate: IsoDate;
  /** Server monotonic version — bumped on every write, used for conflict resolution. */
  version: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface CreateTransactionInput {
  clientId?: Uuid;
  deviceId?: string | null;
  type: TransactionTypeValue;
  amount: DecimalString;
  currency?: CurrencyCode;
  categoryId: Uuid;
  title: string;
  description?: string | null;
  transactionDate: IsoDate;
}

export interface UpdateTransactionInput {
  type?: TransactionTypeValue;
  amount?: DecimalString;
  currency?: CurrencyCode;
  categoryId?: Uuid;
  title?: string;
  description?: string | null;
  transactionDate?: IsoDate;
}

export interface ListTransactionsQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: TransactionTypeValue;
  categoryId?: Uuid;
  from?: IsoDate;
  to?: IsoDate;
  preset?: 'today' | 'week' | 'month' | 'year' | 'custom';
  sort?: 'transactionDate' | 'createdAt' | 'amount';
  order?: 'asc' | 'desc';
}

export interface DashboardSummary {
  today: PeriodSummary;
  month: PeriodSummary;
  recentTransactions: Transaction[];
}

export interface PeriodSummary {
  income: DecimalString;
  expense: DecimalString;
  balance: DecimalString;
  currency: CurrencyCode;
}
