import { z } from 'zod';

export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain a special character');

export const currencySchema = z
  .string()
  .length(3, 'Currency code must be 3 characters')
  .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase');

export const amountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid number with up to 2 decimals')
  .transform((val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) throw new Error('Amount must be non-negative');
    return Math.round(num * 100); // Convert to minor units (cents)
  });

export const merchantKeySchema = z
  .string()
  .min(3, 'Merchant key must be at least 3 characters')
  .max(50, 'Merchant key must be at most 50 characters')
  .regex(/^[a-z0-9_-]+$/, 'Merchant key must contain only lowercase letters, numbers, hyphens, and underscores');

export const idempotencyKeySchema = z
  .string()
  .min(1, 'Idempotency key is required')
  .max(100, 'Idempotency key is too long');

export const registrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1, 'Display name is required').max(255),
  companyName: z.string().min(1, 'Company name is required').max(255),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetSchema = z.object({
  email: emailSchema,
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

export const emailVerificationSchema = z.object({
  email: emailSchema,
  token: z.string().min(1, 'Verification token is required'),
});
