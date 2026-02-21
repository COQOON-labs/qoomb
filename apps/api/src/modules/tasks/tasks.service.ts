import { Injectable } from '@nestjs/common';
import { type Task, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DecryptFields, EncryptDecryptFields, EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/**
 * Task row with all encrypted fields decrypted.
 * Returned by all TasksService read methods.
 */
export type TaskRow = Omit<Task, 'title' | 'description'> & {
  title: string;
  description: string | null;
};

export interface CreateTaskData {
  title: string;
  description?: string;
  assigneeId?: string;
  eventId?: string;
  dueAt?: Date;
  status: string;
  priority: number;
  visibility: string;
  groupId?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  eventId?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  status?: string;
  priority?: number;
  visibility?: string;
  groupId?: string | null;
}

// ============================================
// SERVICE
// ============================================

/**
 * TasksService
 *
 * Handles all DB operations for tasks.
 * Sensitive fields (title, description) are encrypted at rest using per-hive
 * AES-256-GCM keys via EncryptionService.
 *
 * Callers are responsible for:
 * - Authorization checks (use requirePermission / requireResourceAccess in the router)
 * - Input sanitization (sanitizeHtml in the router before calling service methods)
 */
/** Encrypted fields on the Task model */
const ENC_FIELDS = ['title', 'description'];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * List tasks matching the given visibility filter and optional filters.
   * @param visibilityFilter - Prisma WHERE clause built by the router (role-based visibility)
   */
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
  async list(
    hiveId: string,
    visibilityFilter: Prisma.TaskWhereInput,
    filters?: {
      status?: string;
      assigneeId?: string;
      groupId?: string;
      eventId?: string;
      dueBefore?: Date;
      dueAfter?: Date;
    }
  ): Promise<TaskRow[]> {
    const where: Prisma.TaskWhereInput = {
      hiveId,
      ...visibilityFilter,
    };

    if (filters?.status !== undefined) where.status = filters.status;
    if (filters?.assigneeId !== undefined) where.assigneeId = filters.assigneeId;
    if (filters?.groupId !== undefined) where.groupId = filters.groupId;
    if (filters?.eventId !== undefined) where.eventId = filters.eventId;
    if (filters?.dueBefore !== undefined || filters?.dueAfter !== undefined) {
      where.dueAt = {
        ...(filters.dueBefore !== undefined ? { lte: filters.dueBefore } : {}),
        ...(filters.dueAfter !== undefined ? { gte: filters.dueAfter } : {}),
      };
    }

    return this.prisma.task.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get a single task by ID. Returns null if not found or hiveId mismatch.
   * Defense-in-depth: explicit hiveId filter on top of RLS.
   */
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async getById(id: string, hiveId: string): Promise<TaskRow | null> {
    return this.prisma.task.findFirst({ where: { id, hiveId } });
  }

  /**
   * Create a new task. Encrypts title and description before storing.
   * @param creatorId - personId of the creator (set by router from ctx.user.personId)
   */
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async create(data: CreateTaskData, hiveId: string, creatorId: string): Promise<TaskRow> {
    return this.prisma.task.create({
      data: {
        hiveId,
        creatorId,
        title: data.title,
        description: data.description ?? null,
        assigneeId: data.assigneeId ?? null,
        eventId: data.eventId ?? null,
        dueAt: data.dueAt ?? null,
        status: data.status,
        priority: data.priority,
        visibility: data.visibility,
        groupId: data.groupId ?? null,
      },
    });
  }

  /**
   * Update an existing task. Only encrypts fields that are present in the update.
   * Supports nullish fields (null clears the column, undefined skips it).
   */
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 2 })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hiveId is used by @EncryptDecryptFields via args[2]
  async update(id: string, data: UpdateTaskData, hiveId: string): Promise<TaskRow> {
    // Use UncheckedUpdateInput to update scalar FK fields (assigneeId, eventId, groupId) directly.
    // Prisma.TaskUpdateInput only exposes relation-style fields (assignee: { connect/disconnect }).
    const patch: Prisma.TaskUncheckedUpdateInput = {};

    if (data.title !== undefined) patch.title = data.title;
    if ('description' in data) patch.description = data.description ?? null;
    if ('assigneeId' in data) patch.assigneeId = data.assigneeId ?? null;
    if ('eventId' in data) patch.eventId = data.eventId ?? null;
    if ('dueAt' in data) patch.dueAt = data.dueAt ?? null;
    if ('completedAt' in data) patch.completedAt = data.completedAt ?? null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if ('groupId' in data) patch.groupId = data.groupId ?? null;

    return this.prisma.task.update({ where: { id }, data: patch });
  }

  /**
   * Delete a task. Returns true if deleted, false if not found.
   * Uses deleteMany with hiveId for defense-in-depth on top of RLS.
   */
  async remove(id: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.task.deleteMany({ where: { id, hiveId } });
    return result.count > 0;
  }
}
