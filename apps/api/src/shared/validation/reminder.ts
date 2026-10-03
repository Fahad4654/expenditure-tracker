import { z } from 'zod';
import { isoDateSchema, uuidSchema } from './common';

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(1000).nullable().optional(),
  dueDate: isoDateSchema,
});

export const updateReminderSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    details: z.string().trim().max(1000).nullable().optional(),
    dueDate: isoDateSchema.optional(),
    completed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const reminderIdParamSchema = z.object({ id: uuidSchema });

export type CreateReminderInputDto = z.infer<typeof createReminderSchema>;
export type UpdateReminderInputDto = z.infer<typeof updateReminderSchema>;
