import { z } from 'zod';
import { isoDateSchema, uuidSchema } from './common';

/** `HH:mm` (24-hour) — an optional wall-clock time on the due date. */
export const dueTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, {
  message: 'Time must be HH:mm (24-hour)',
});

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().max(1000).nullable().optional(),
  dueDate: isoDateSchema,
  dueTime: dueTimeSchema.nullish(),
});

export const updateReminderSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    details: z.string().trim().max(1000).nullable().optional(),
    dueDate: isoDateSchema.optional(),
    /** `HH:mm` sets/replaces the time; `null` clears it. */
    dueTime: dueTimeSchema.nullish(),
    completed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const reminderIdParamSchema = z.object({ id: uuidSchema });

export type CreateReminderInputDto = z.infer<typeof createReminderSchema>;
export type UpdateReminderInputDto = z.infer<typeof updateReminderSchema>;
