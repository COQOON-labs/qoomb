import { TaskStatus, TaskPriority } from '@qoomb/types';
import { z } from 'zod';

export const taskStatusSchema = z.nativeEnum(TaskStatus);
export const taskPrioritySchema = z.nativeEnum(TaskPriority);

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  contributors: z.array(z.string().uuid()).default([]),
  status: taskStatusSchema.default('todo' as TaskStatus),
  dueDate: z.date().optional(),
  dueTimeOfDay: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/)
    .optional(), // HH:mm format
  reminderOffset: z.number().min(0).optional(),
  recurrenceRule: z.string().optional(),
  relatedEventId: z.string().uuid().optional(),
  priority: taskPrioritySchema.default(0 as TaskPriority),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  contributors: z.array(z.string().uuid()).optional(),
  status: taskStatusSchema.optional(),
  completedAt: z.date().optional(),
  dueDate: z.date().optional(),
  dueTimeOfDay: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  reminderOffset: z.number().min(0).optional(),
  recurrenceRule: z.string().optional(),
  relatedEventId: z.string().uuid().optional(),
  priority: taskPrioritySchema.optional(),
});

export const taskFilterSchema = z.object({
  status: taskStatusSchema.optional(),
  assigneeId: z.string().uuid().optional(),
  contributors: z.array(z.string().uuid()).optional(),
  priority: taskPrioritySchema.optional(),
  dueBefore: z.date().optional(),
  dueAfter: z.date().optional(),
});

export const taskIdSchema = z.string().uuid();
