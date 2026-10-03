import { z } from 'zod';
import { uuidSchema } from './common';

export const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().max(5000).nullable().optional(),
});

export const updateNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    content: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const noteIdParamSchema = z.object({ id: uuidSchema });

export type CreateNoteInputDto = z.infer<typeof createNoteSchema>;
export type UpdateNoteInputDto = z.infer<typeof updateNoteSchema>;
