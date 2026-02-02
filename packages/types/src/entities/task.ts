import { BaseEntity, EncryptedEntity, UUID } from './common';

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

export enum TaskPriority {
  NORMAL = 0,
  IMPORTANT = 1,
  CRITICAL = 2,
}

export interface Task extends BaseEntity, EncryptedEntity {
  hiveId: UUID;
  title: string;
  description?: string;

  // Assignees
  assigneeId?: UUID;
  contributors: UUID[]; // Additional people involved

  // Status
  status: TaskStatus;
  completedAt?: Date;

  // Deadline
  dueDate?: Date;
  dueTimeOfDay?: string; // HH:mm format, null means all-day
  reminderOffset?: number; // Minutes before due date

  // Recurrence
  recurrenceRule?: string; // iCal RRULE format

  // Relations
  relatedEventId?: UUID;

  // Priority
  priority: TaskPriority;

  // Search
  embedding?: number[]; // pgvector embedding

  // Metadata
  createdBy: UUID;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigneeId?: UUID;
  contributors?: UUID[];
  status?: TaskStatus;
  dueDate?: Date;
  dueTimeOfDay?: string;
  reminderOffset?: number;
  recurrenceRule?: string;
  relatedEventId?: UUID;
  priority?: TaskPriority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assigneeId?: UUID;
  contributors?: UUID[];
  status?: TaskStatus;
  completedAt?: Date;
  dueDate?: Date;
  dueTimeOfDay?: string;
  reminderOffset?: number;
  recurrenceRule?: string;
  relatedEventId?: UUID;
  priority?: TaskPriority;
}

export interface TaskFilter {
  status?: TaskStatus;
  assigneeId?: UUID;
  contributors?: UUID[];
  priority?: TaskPriority;
  dueBefore?: Date;
  dueAfter?: Date;
}
