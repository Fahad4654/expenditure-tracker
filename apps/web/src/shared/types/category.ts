import type { IsoDateTime, Uuid } from './common';
import type { TransactionTypeValue } from './transaction';

export const CATEGORY_KINDS = ['SYSTEM', 'USER'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface Category {
  id: Uuid;
  /** `null` for system categories which are visible to every user. */
  userId: Uuid | null;
  name: string;
  kind: CategoryKind;
  /** Optional icon token resolved by the client (e.g. `utensils`, `car`). */
  icon: string | null;
  /** Optional hex color, e.g. `#F97316`. */
  color: string | null;
  /** System categories cannot be deleted or renamed by users. */
  isSystem: boolean;
  /** Suggested transaction type for this category. */
  suggestedType: TransactionTypeValue;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateCategoryInput {
  name: string;
  icon?: string;
  color?: string;
  suggestedType?: TransactionTypeValue;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string | null;
  color?: string | null;
  suggestedType?: TransactionTypeValue;
}

/**
 * Seed data for system categories. Order matters — it is the default display order.
 * Kept here so API seeding and web/mobile fallbacks agree on names.
 */
export const DEFAULT_SYSTEM_CATEGORIES: ReadonlyArray<{
  name: string;
  icon: string;
  color: string;
  suggestedType: TransactionTypeValue;
}> = [
  { name: 'Food', icon: 'utensils', color: '#F97316', suggestedType: 'EXPENSE' },
  { name: 'Transport', icon: 'car', color: '#3B82F6', suggestedType: 'EXPENSE' },
  { name: 'Shopping', icon: 'bag', color: '#EC4899', suggestedType: 'EXPENSE' },
  { name: 'Bills', icon: 'receipt', color: '#EF4444', suggestedType: 'EXPENSE' },
  { name: 'Entertainment', icon: 'film', color: '#8B5CF6', suggestedType: 'EXPENSE' },
  { name: 'Health', icon: 'heart', color: '#10B981', suggestedType: 'EXPENSE' },
  { name: 'Education', icon: 'book', color: '#06B6D4', suggestedType: 'EXPENSE' },
  { name: 'Salary', icon: 'wallet', color: '#22C55E', suggestedType: 'INCOME' },
  { name: 'Business', icon: 'briefcase', color: '#0EA5E9', suggestedType: 'INCOME' },
  { name: 'Investment', icon: 'trending-up', color: '#14B8A6', suggestedType: 'INCOME' },
  { name: 'Other', icon: 'dots', color: '#64748B', suggestedType: 'EXPENSE' },
];
