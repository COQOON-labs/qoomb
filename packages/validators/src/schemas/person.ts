import { PersonRole, AgeGroup } from '@qoomb/types';
import { z } from 'zod';

export const personRoleSchema = z.nativeEnum(PersonRole);
export const ageGroupSchema = z.nativeEnum(AgeGroup);

export const createPersonSchema = z.object({
  name: z.string().min(1).max(255),
  role: personRoleSchema,
  birthdate: z.date().optional(),
  ageGroup: ageGroupSchema.optional(),
});

export const updatePersonSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: personRoleSchema.optional(),
  birthdate: z.date().optional(),
  ageGroup: ageGroupSchema.optional(),
});

export const personIdSchema = z.string().uuid();
