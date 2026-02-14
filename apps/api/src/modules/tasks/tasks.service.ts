import { Injectable } from '@nestjs/common';
import { type Task, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption';

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

    const rows = await this.prisma.task.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => this.decryptRow(row, hiveId));
  }

  /**
   * Get a single task by ID. Returns null if not found or hiveId mismatch.
   * Defense-in-depth: explicit hiveId filter on top of RLS.
   */
  async getById(id: string, hiveId: string): Promise<TaskRow | null> {
    const row = await this.prisma.task.findFirst({ where: { id, hiveId } });
    return row ? this.decryptRow(row, hiveId) : null;
  }

  /**
   * Create a new task. Encrypts title and description before storing.
   * @param creatorId - personId of the creator (set by router from ctx.user.personId)
   */
  async create(data: CreateTaskData, hiveId: string, creatorId: string): Promise<TaskRow> {
    const row = await this.prisma.task.create({
      data: {
        hiveId,
        creatorId,
        title: this.encStr(data.title, hiveId),
        description: this.encOpt(data.description, hiveId),
        assigneeId: data.assigneeId ?? null,
        eventId: data.eventId ?? null,
        dueAt: data.dueAt ?? null,
        status: data.status,
        priority: data.priority,
        visibility: data.visibility,
        groupId: data.groupId ?? null,
      },
    });

    return this.decryptRow(row, hiveId);
  }

  /**
   * Update an existing task. Only encrypts fields that are present in the update.
   * Supports nullish fields (null clears the column, undefined skips it).
   */
  async update(id: string, data: UpdateTaskData, hiveId: string): Promise<TaskRow> {
    // Use UncheckedUpdateInput to update scalar FK fields (assigneeId, eventId, groupId) directly.
    // Prisma.TaskUpdateInput only exposes relation-style fields (assignee: { connect/disconnect }).
    const patch: Prisma.TaskUncheckedUpdateInput = {};

    if (data.title !== undefined) patch.title = this.encStr(data.title, hiveId);
    if ('description' in data) patch.description = this.encOpt(data.description, hiveId);
    if ('assigneeId' in data) patch.assigneeId = data.assigneeId ?? null;
    if ('eventId' in data) patch.eventId = data.eventId ?? null;
    if ('dueAt' in data) patch.dueAt = data.dueAt ?? null;
    if ('completedAt' in data) patch.completedAt = data.completedAt ?? null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if ('groupId' in data) patch.groupId = data.groupId ?? null;

    const row = await this.prisma.task.update({ where: { id }, data: patch });
    return this.decryptRow(row, hiveId);
  }

  /**
   * Delete a task. Returns true if deleted, false if not found.
   * Uses deleteMany with hiveId for defense-in-depth on top of RLS.
   */
  async remove(id: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.task.deleteMany({ where: { id, hiveId } });
    return result.count > 0;
  }

  // -----------------------------------------------------------------------
  // Private encryption helpers
  // -----------------------------------------------------------------------

  private encStr(value: string, hiveId: string): string {
    return this.enc.serializeToStorage(this.enc.encrypt(value, hiveId));
  }

  private encOpt(value: string | null | undefined, hiveId: string): string | null {
    if (value === null || value === undefined) return null;
    return this.encStr(value, hiveId);
  }

  private decStr(value: string, hiveId: string): string {
    try {
      return this.enc.decrypt(this.enc.parseFromStorage(value), hiveId);
    } catch {
      // Graceful fallback: return as-is if data is not encrypted (e.g. migration window)
      return value;
    }
  }

  private decOpt(value: string | null, hiveId: string): string | null {
    if (value === null) return null;
    return this.decStr(value, hiveId);
  }

  private decryptRow(row: Task, hiveId: string): TaskRow {
    return {
      ...row,
      title: this.decStr(row.title, hiveId),
      description: this.decOpt(row.description, hiveId),
    };
  }
}
