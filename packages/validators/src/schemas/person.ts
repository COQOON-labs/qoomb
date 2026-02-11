import { z } from 'zod';

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
