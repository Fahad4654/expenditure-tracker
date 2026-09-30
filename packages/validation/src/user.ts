import { z } from 'zod';
import { currencyCodeSchema, timezoneSchema } from './common';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    defaultCurrency: currencyCodeSchema.optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export type UpdateProfileInputDto = z.infer<typeof updateProfileSchema>;
