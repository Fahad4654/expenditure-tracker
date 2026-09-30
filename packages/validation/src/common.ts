import { z } from 'zod';

/** Maximum accepted amount: 18 whole digits + 2 fraction digits. */
export const MAX_AMOUNT_digits = 18;

export const decimalAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,18}(\.\d{1,2})?$/, 'Amount must be a positive decimal with up to 2 decimal places');

export const uuidSchema = z.uuid();

export const isoDateSchema = z.iso.date();

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Strict E.164, e.g. `+8801712345678`. */
export const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be in E.164 format, e.g. +8801712345678');

export const currencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO-4217 code');

export const timezoneSchema = z.string().trim().min(1).max(64);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** Turns a ZodError into the API's `details` shape (never echoes raw input). */
export function toFieldErrors(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
