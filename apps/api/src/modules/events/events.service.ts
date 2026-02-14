import { Injectable } from '@nestjs/common';
import { type Event, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/**
 * Event row with all encrypted fields decrypted.
 * Returned by all EventsService read methods.
 */
export type EventRow = Omit<Event, 'title' | 'description' | 'location' | 'url' | 'category'> & {
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  category: string | null;
};

export interface CreateEventData {
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location?: string;
  url?: string;
  color?: string;
  category?: string;
  visibility: string;
  groupId?: string;
  recurrenceRule?: Record<string, unknown>;
}

export interface UpdateEventData {
  title?: string;
  description?: string | null;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  location?: string | null;
  url?: string | null;
  color?: string | null;
  category?: string | null;
  visibility?: string;
  groupId?: string | null;
  recurrenceRule?: Record<string, unknown> | null;
}

// ============================================
// SERVICE
// ============================================

/**
 * EventsService
 *
 * Handles all DB operations for events.
 * Sensitive fields (title, description, location, url, category) are encrypted at rest
 * using per-hive AES-256-GCM keys via EncryptionService.
 *
 * Callers are responsible for:
 * - Authorization checks (use requirePermission / requireResourceAccess in the router)
 * - Input sanitization (sanitizeHtml in the router before calling service methods)
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * List events matching the given visibility filter and optional filters.
   * @param visibilityFilter - Prisma WHERE clause built by the router (role-based visibility)
   */
  async list(
    hiveId: string,
    visibilityFilter: Prisma.EventWhereInput,
    filters?: { startAt?: Date; endAt?: Date; groupId?: string }
  ): Promise<EventRow[]> {
    const where: Prisma.EventWhereInput = {
      hiveId,
      ...visibilityFilter,
    };

    if (filters?.startAt !== undefined) where.startAt = { gte: filters.startAt };
    if (filters?.endAt !== undefined) where.endAt = { lte: filters.endAt };
    if (filters?.groupId !== undefined) where.groupId = filters.groupId;

    const rows = await this.prisma.event.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });

    return rows.map((row) => this.decryptRow(row, hiveId));
  }

  /**
   * Get a single event by ID. Returns null if not found or hiveId mismatch.
   * Defense-in-depth: explicit hiveId filter on top of RLS.
   */
  async getById(id: string, hiveId: string): Promise<EventRow | null> {
    const row = await this.prisma.event.findFirst({ where: { id, hiveId } });
    return row ? this.decryptRow(row, hiveId) : null;
  }

  /**
   * Create a new event. Encrypts sensitive fields before storing.
   * @param creatorId - personId of the creator (set by router from ctx.user.personId)
   */
  async create(data: CreateEventData, hiveId: string, creatorId: string): Promise<EventRow> {
    const row = await this.prisma.event.create({
      data: {
        hiveId,
        creatorId,
        title: this.encStr(data.title, hiveId),
        description: this.encOpt(data.description, hiveId),
        startAt: data.startAt,
        endAt: data.endAt,
        allDay: data.allDay,
        location: this.encOpt(data.location, hiveId),
        url: this.encOpt(data.url, hiveId),
        color: data.color ?? null,
        category: this.encOpt(data.category, hiveId),
        visibility: data.visibility,
        groupId: data.groupId ?? null,
        recurrenceRule: (data.recurrenceRule as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });

    return this.decryptRow(row, hiveId);
  }

  /**
   * Update an existing event. Only encrypts fields that are present in the update.
   * Supports nullish fields (null clears the column, undefined skips it).
   */
  async update(id: string, data: UpdateEventData, hiveId: string): Promise<EventRow> {
    // Use UncheckedUpdateInput to update scalar FK fields (groupId) directly.
    // Prisma.EventUpdateInput only exposes relation-style fields (group: { connect/disconnect }).
    const patch: Prisma.EventUncheckedUpdateInput = {};

    if (data.title !== undefined) patch.title = this.encStr(data.title, hiveId);
    if ('description' in data) patch.description = this.encOpt(data.description, hiveId);
    if (data.startAt !== undefined) patch.startAt = data.startAt;
    if (data.endAt !== undefined) patch.endAt = data.endAt;
    if (data.allDay !== undefined) patch.allDay = data.allDay;
    if ('location' in data) patch.location = this.encOpt(data.location, hiveId);
    if ('url' in data) patch.url = this.encOpt(data.url, hiveId);
    if ('color' in data) patch.color = data.color ?? null;
    if ('category' in data) patch.category = this.encOpt(data.category, hiveId);
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if ('groupId' in data) patch.groupId = data.groupId ?? null;
    if ('recurrenceRule' in data)
      patch.recurrenceRule = (data.recurrenceRule as Prisma.InputJsonValue) ?? Prisma.JsonNull;

    const row = await this.prisma.event.update({ where: { id }, data: patch });
    return this.decryptRow(row, hiveId);
  }

  /**
   * Delete an event. Returns true if deleted, false if not found.
   * Uses deleteMany with hiveId for defense-in-depth on top of RLS.
   */
  async remove(id: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.event.deleteMany({ where: { id, hiveId } });
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

  private decryptRow(row: Event, hiveId: string): EventRow {
    return {
      ...row,
      title: this.decStr(row.title, hiveId),
      description: this.decOpt(row.description, hiveId),
      location: this.decOpt(row.location, hiveId),
      url: this.decOpt(row.url, hiveId),
      category: this.decOpt(row.category, hiveId),
    };
  }
}
