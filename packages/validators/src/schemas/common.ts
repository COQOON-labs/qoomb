import { z } from 'zod';

/**
 * Common validation schemas used across the application
 */

/**
 * UUID schema with strict validation
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Date schema with validation
 */
export const dateSchema = z.coerce.date();

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

/**
 * Sort order schema
 */
export const sortOrderSchema = z.enum(['asc', 'desc']).default('asc');

/**
 * Search query schema with sanitization
 */
export const searchQuerySchema = z.string().trim().max(500, 'Search query is too long').optional();

/**
 * Safe string schema for text content
 * - Trims whitespace
 * - Has reasonable length limits
 * - Allows unicode for international support
 */
export const safeStringSchema = (minLength = 1, maxLength = 1000) =>
  z
    .string()
    .trim()
    .min(minLength, `Must be at least ${minLength} characters`)
    .max(maxLength, `Must be at most ${maxLength} characters`);

/**
 * URL schema with validation
 */
export const urlSchema = z.string().url('Invalid URL format').max(2000);

/**
 * Email schema with normalization
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format')
  .max(320, 'Email is too long');

/**
 * Timezone schema
 */
export const timezoneSchema = z
  .string()
  .regex(/^[A-Za-z]+\/[A-Za-z_]+$/, 'Invalid timezone format (e.g., Europe/Berlin)');

/**
 * ISO 8601 duration schema (for recurrence rules)
 */
export const iso8601DurationSchema = z
  .string()
  .regex(
    /^P(?:\d+Y)?(?:\d+M)?(?:\d+W)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+S)?)?$/,
    'Invalid ISO 8601 duration format'
  );

/**
 * Hex color code schema
 */
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format');

/**
 * Phone number schema (international format)
 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format');
