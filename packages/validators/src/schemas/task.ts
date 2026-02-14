import { z } from 'zod';

// Use z.enum (not z.nativeEnum(TaskStatus)) to prevent TS2742 inferred-type portability errors
// when the schema flows through AppRouter into the web client type chain.
// Values must stay in sync with TaskStatus enum in packages/types/src/entities/task.ts.
export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);

// Priority: 0 = normal, 1 = important, 2 = critical.
// Values must stay in sync with TaskPriority enum in packages/types/src/entities/task.ts.
export const taskPrioritySchema = z.number().int().min(0).max(2);

export const taskIdSchema = z.string().uuid();

/**
 * Input schema for creating a task.
 *
 * Fields mapped to DB model (apps/api/prisma/schema.prisma → Task):
 * - Encrypted at rest by TasksService: title, description
 * - Unencrypted (used for filtering/sorting): status, priority, dueAt, visibility
 */
export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(), // link to parent event (event → task spawning)
  dueAt: z.string().datetime().optional(),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default(0),
  visibility: z.enum(['hive', 'admins', 'group', 'private']).default('hive'),
  groupId: z.string().uuid().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullish(),
  assigneeId: z.string().uuid().nullish(), // null to unassign
  eventId: z.string().uuid().nullish(), // null to unlink from event
  dueAt: z.string().datetime().nullish(), // null to remove due date
  completedAt: z.string().datetime().nullish(), // set when marking complete
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  visibility: z.enum(['hive', 'admins', 'group', 'private']).optional(),
  groupId: z.string().uuid().nullish(), // null to remove from group
});

export const listTasksSchema = z.object({
  status: taskStatusSchema.optional(),
  assigneeId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
});
