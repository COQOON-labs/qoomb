import { z } from 'zod';

export const groupIdSchema = z.string().uuid();

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(1000).nullish(),
});

export const addGroupMemberSchema = z.object({
  groupId: groupIdSchema,
  personId: z.string().uuid(),
});

export const removeGroupMemberSchema = z.object({
  groupId: groupIdSchema,
  personId: z.string().uuid(),
});
