import { z } from 'zod';
import { TRANSACTION_TYPES } from '../types';
import { currencyCodeSchema, decimalAmountSchema, isoDateSchema, uuidSchema } from './common';

/** Payload accepted inside a sync operation for a TRANSACTION entity. */
export const transactionSyncPayloadSchema = z.object({
  clientId: uuidSchema.optional(),
  deviceId: z.string().trim().min(1).max(128).nullish(),
  type: z.enum(TRANSACTION_TYPES),
  amount: decimalAmountSchema,
  currency: currencyCodeSchema.optional(),
  categoryId: uuidSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  transactionDate: isoDateSchema,
  noteId: uuidSchema.nullish(),
});

/** Payload accepted inside a sync operation for a CATEGORY entity. */
export const categorySyncPayloadSchema = z.object({
  name: z.string().trim().min(1).max(40),
  icon: z.string().trim().min(1).max(40).nullish(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullish(),
  suggestedType: z.enum(TRANSACTION_TYPES).optional(),
});

const entityTypeSchema = z.enum(['TRANSACTION', 'CATEGORY']);
const operationSchema = z.enum(['CREATE', 'UPDATE', 'DELETE']);

/**
 * One unit of offline change.
 *
 * `operationId` is the idempotency key: replaying the exact same operation
 * returns `DUPLICATE` instead of applying it twice.
 */
export const syncOperationSchema = z
  .object({
    operationId: uuidSchema,
    entityId: uuidSchema,
    entityType: entityTypeSchema,
    operation: operationSchema,
    timestamp: z.iso.datetime({ offset: true }),
    baseVersion: z.coerce.number().int().min(0).optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .superRefine((op, ctx) => {
    if (op.operation === 'DELETE') return;
    const schema =
      op.entityType === 'TRANSACTION' ? transactionSyncPayloadSchema : categorySyncPayloadSchema;
    const parsed = schema.safeParse(op.payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: 'custom',
          path: ['payload', ...issue.path],
          message: issue.message,
        });
      }
    }
  });

export const MAX_SYNC_OPERATIONS_PER_REQUEST = 200;

export const syncRequestSchema = z
  .object({
    deviceId: z.string().trim().min(1).max(128),
    cursor: z.string().max(256).nullish(),
    operations: z.array(syncOperationSchema).max(MAX_SYNC_OPERATIONS_PER_REQUEST),
  })
  .superRefine((req, ctx) => {
    const seen = new Set<string>();
    req.operations.forEach((op, index) => {
      if (seen.has(op.operationId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['operations', index, 'operationId'],
          message: 'Duplicate operationId in batch',
        });
      }
      seen.add(op.operationId);
    });
  });

export const syncChangesQuerySchema = z.object({
  cursor: z.string().max(256).nullish(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  /// Pulling device — its own writes are excluded from the response.
  deviceId: z.string().trim().min(1).max(128).nullish(),
});

export type SyncOperationInputDto = z.infer<typeof syncOperationSchema>;
export type SyncRequestDto = z.infer<typeof syncRequestSchema>;
export type SyncChangesQueryDto = z.infer<typeof syncChangesQuerySchema>;
