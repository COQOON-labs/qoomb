import { z } from 'zod';

import { emailSchema } from './common';

/**
 * Password schema with security requirements
 * - Min 8 characters (industry standard)
 * - Max 100 to prevent DoS
 * - Must contain at least one uppercase, lowercase, number, and special char
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password is too long')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    'Password must contain uppercase, lowercase, number, and special character'
  );

/**
 * Name schema with sanitization
 * - Trims whitespace
 * - Prevents XSS with character restrictions
 * - Reasonable length limits
 */
const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(255, 'Name is too long')
  .regex(/^[a-zA-Z0-9\s\-'äöüÄÖÜßéèêàâôîûùç]+$/, 'Name contains invalid characters');

/**
 * Hive name schema
 * - Same as name schema but with slightly different error messages
 */
const hiveNameSchema = z
  .string()
  .trim()
  .min(1, 'Hive name is required')
  .max(255, 'Hive name is too long')
  .regex(/^[a-zA-Z0-9\s\-'äöüÄÖÜßéèêàâôîûùç]+$/, 'Hive name contains invalid characters');

/**
 * Registration schema
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  hiveName: hiveNameSchema,
  adminName: nameSchema,
});

/**
 * Login schema
 * Note: Password validation is relaxed for login to avoid revealing
 * information about password requirements to potential attackers
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(100),
});

/**
 * Create hive schema (for admin/internal use)
 */
export const createHiveSchema = z.object({
  name: hiveNameSchema,
  adminEmail: emailSchema,
  adminPassword: passwordSchema,
  adminName: nameSchema,
});

/**
 * JWT token validation schema
 */
export const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, 'Invalid token format');
