import type { CurrencyCode, DecimalString, IsoDate, Timezone } from './common';

export interface SummaryResponse {
  range: { from: IsoDate; to: IsoDate };
  timezone: Timezone;
  currency: CurrencyCode;
  totalIncome: DecimalString;
  totalExpense: DecimalString;
  balance: DecimalString;
}

export interface DailyPoint {
  date: IsoDate;
  income: DecimalString;
  expense: DecimalString;
}

export interface CategoryBreakdownPoint {
  categoryId: string;
  categoryName: string;
  color: string | null;
  total: DecimalString;
  /** Percentage of the period total, 0–100, 2 decimal places. */
  percentage: DecimalString;
}

export interface DailyReport {
  range: { from: IsoDate; to: IsoDate };
  timezone: Timezone;
  currency: CurrencyCode;
  points: DailyPoint[];
}

export interface MonthlyReportPoint {
  month: string;
  year: number;
  income: DecimalString;
  expense: DecimalString;
  balance: DecimalString;
}

export interface MonthlyReport {
  year: number;
  timezone: Timezone;
  currency: CurrencyCode;
  points: MonthlyReportPoint[];
}

export interface CategoryReport {
  range: { from: IsoDate; to: IsoDate };
  timezone: Timezone;
  currency: CurrencyCode;
  type: 'EXPENSE' | 'INCOME';
  points: CategoryBreakdownPoint[];
}
