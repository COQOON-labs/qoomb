import { z } from 'zod';

import { emailSchema } from './common';

// Use z.enum (not z.nativeEnum) to prevent TS2742 inferred type portability errors
// when PersonRole flows through AppRouter into the web client type chain.
export const personRoleSchema = z.enum([
  'parent',
  'child',
  'org_admin',
  'manager',
  'member',
  'guest',
]);

export const createPersonSchema = z.object({
  role: personRoleSchema,
  displayName: z.string().min(1).max(255).optional(),
  birthdate: z.date().optional(),
});

export const updatePersonSchema = z.object({
  role: personRoleSchema.optional(),
  displayName: z.string().min(1).max(255).optional(),
  avatarUrl: z.string().url().optional(),
  birthdate: z.date().optional(),
});

export const personIdSchema = z.string().uuid();

/**
 * For updating one's own profile fields.
 * Role is intentionally excluded — use updatePersonRoleSchema for admin role changes.
 */
export const updatePersonProfileSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  // HTTPS-only: prevents javascript: / data: URI injection when rendered as <img src>
  avatarUrl: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), { message: 'Avatar URL must use HTTPS' })
    .optional(),
  birthdate: z.string().date().optional(), // ISO date string (YYYY-MM-DD)
});

export const updatePersonRoleSchema = z.object({
  personId: personIdSchema,
  role: personRoleSchema,
});

/**
 * Hive-level member invitation.
 * Sends an invitation email to join the current hive.
 * The role field is intentionally omitted — invited users get the default role
 * for the hive type (parent for family, member for organization).
 */
export const inviteMemberSchema = z.object({
  email: emailSchema,
});
