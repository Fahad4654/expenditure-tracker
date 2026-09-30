import { z } from 'zod';
import { TRANSACTION_TYPES } from '@exp/types';
import {
  currencyCodeSchema,
  decimalAmountSchema,
  isoDateSchema,
  paginationSchema,
  uuidSchema,
} from './common';

export const createTransactionSchema = z.object({
  /** Client-generated UUID. Required from offline-capable clients for idempotency. */
  clientId: uuidSchema.optional(),
  deviceId: z.string().trim().min(1).max(128).nullish(),
  type: z.enum(TRANSACTION_TYPES),
  amount: decimalAmountSchema,
  currency: currencyCodeSchema.optional(),
  categoryId: uuidSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  transactionDate: isoDateSchema,
});

export const updateTransactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES).optional(),
    amount: decimalAmountSchema.optional(),
    currency: currencyCodeSchema.optional(),
    categoryId: uuidSchema.optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullish(),
    transactionDate: isoDateSchema.optional(),
    /** Version observed by the client — enables optimistic concurrency. */
    baseVersion: z.coerce.number().int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const transactionIdParamSchema = z.object({ id: uuidSchema });

export const listTransactionsSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  categoryId: uuidSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  preset: z.enum(['today', 'week', 'month', 'year', 'custom']).optional(),
  sort: z.enum(['transactionDate', 'createdAt', 'amount']).default('transactionDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateTransactionInputDto = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInputDto = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQueryDto = z.infer<typeof listTransactionsSchema>;
