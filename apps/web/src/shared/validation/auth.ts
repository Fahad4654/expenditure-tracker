import { z } from 'zod';
import { e164PhoneSchema } from './common';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254).toLowerCase(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.email().max(254).toLowerCase(),
  password: z.string().min(1).max(72),
});

export const sendOtpSchema = z.object({
  phone: e164PhoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: e164PhoneSchema,
  code: z.string().regex(/^\d{4,10}$/, 'OTP code must be 4–10 digits'),
});

export const forgotPasswordSchema = z.object({
  email: z.email().max(254).toLowerCase(),
});

export const refreshSchema = z.object({
  /** Present when the refresh token is not carried in an HTTP-only cookie. */
  refreshToken: z.string().min(10).max(2048).optional(),
});

export type RegisterInputDto = z.infer<typeof registerSchema>;
export type LoginInputDto = z.infer<typeof loginSchema>;
export type SendOtpInputDto = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInputDto = z.infer<typeof verifyOtpSchema>;
