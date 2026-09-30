import { z } from 'zod';
import { TRANSACTION_TYPES } from '@exp/types';
import { uuidSchema } from './common';

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex color such as #F97316');

const iconSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9-]+$/, 'Icon must be a lowercase token such as `utensils`');

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  icon: iconSchema.optional(),
  color: colorSchema.optional(),
  suggestedType: z.enum(TRANSACTION_TYPES).default('EXPENSE'),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    icon: iconSchema.nullable().optional(),
    color: colorSchema.nullable().optional(),
    suggestedType: z.enum(TRANSACTION_TYPES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const categoryIdParamSchema = z.object({ id: uuidSchema });

export type CreateCategoryInputDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInputDto = z.infer<typeof updateCategorySchema>;
