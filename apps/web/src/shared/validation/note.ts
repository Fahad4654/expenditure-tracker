import { z } from 'zod';
import { uuidSchema } from './common';

/** The full set of transactions a note is tagged on — replaces the set. */
export const transactionIdsSchema = z.array(uuidSchema);

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().max(5000).nullable().optional(),
  transactionIds: transactionIdsSchema.nullish(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    content: z.string().trim().max(5000).nullable().optional(),
    /** `transactionIds` replaces the tag set; `null` clears it. */
    transactionIds: transactionIdsSchema.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const noteIdParamSchema = z.object({ id: uuidSchema });

export type CreateNoteInputDto = z.infer<typeof createNoteSchema>;
export type UpdateNoteInputDto = z.infer<typeof updateNoteSchema>;
