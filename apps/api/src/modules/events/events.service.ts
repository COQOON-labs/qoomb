import { Injectable } from '@nestjs/common';
import { type Event, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DecryptFields, EncryptDecryptFields, EncryptionService } from '../encryption';

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
/** Encrypted fields on the Event model */
const ENC_FIELDS = ['title', 'description', 'location', 'url', 'category'];

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
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
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

    return this.prisma.event.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * Get a single event by ID. Returns null if not found or hiveId mismatch.
   * Defense-in-depth: explicit hiveId filter on top of RLS.
   */
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async getById(id: string, hiveId: string): Promise<EventRow | null> {
    return this.prisma.event.findFirst({ where: { id, hiveId } });
  }

  /**
   * Create a new event. Sensitive fields are encrypted by @EncryptDecryptFields.
   * @param creatorId - personId of the creator (set by router from ctx.user.personId)
   */
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async create(data: CreateEventData, hiveId: string, creatorId: string): Promise<EventRow> {
    return this.prisma.event.create({
      data: {
        hiveId,
        creatorId,
        title: data.title,
        description: data.description ?? null,
        startAt: data.startAt,
        endAt: data.endAt,
        allDay: data.allDay,
        location: data.location ?? null,
        url: data.url ?? null,
        color: data.color ?? null,
        category: data.category ?? null,
        visibility: data.visibility,
        groupId: data.groupId ?? null,
        recurrenceRule: (data.recurrenceRule as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Update an existing event. Only provided fields are encrypted by @EncryptDecryptFields.
   * Supports nullish fields (null clears the column, undefined skips it).
   */
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 2 })
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- hiveId is used by @EncryptDecryptFields via args[2]
  async update(id: string, data: UpdateEventData, hiveId: string): Promise<EventRow> {
    // Use UncheckedUpdateInput to update scalar FK fields (groupId) directly.
    // Prisma.EventUpdateInput only exposes relation-style fields (group: { connect/disconnect }).
    const patch: Prisma.EventUncheckedUpdateInput = {};

    if (data.title !== undefined) patch.title = data.title;
    if ('description' in data) patch.description = data.description ?? null;
    if (data.startAt !== undefined) patch.startAt = data.startAt;
    if (data.endAt !== undefined) patch.endAt = data.endAt;
    if (data.allDay !== undefined) patch.allDay = data.allDay;
    if ('location' in data) patch.location = data.location ?? null;
    if ('url' in data) patch.url = data.url ?? null;
    if ('color' in data) patch.color = data.color ?? null;
    if ('category' in data) patch.category = data.category ?? null;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if ('groupId' in data) patch.groupId = data.groupId ?? null;
    if ('recurrenceRule' in data)
      patch.recurrenceRule = (data.recurrenceRule as Prisma.InputJsonValue) ?? Prisma.JsonNull;

    // Defense-in-depth: updateMany accepts non-unique WHERE, so we can filter
    // by hiveId to prevent cross-tenant modification even if RLS fails.
    const result = await this.prisma.event.updateMany({ where: { id, hiveId }, data: patch });
    if (result.count === 0) {
      throw new Error('Event not found in this hive');
    }
    return this.prisma.event.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Delete an event. Returns true if deleted, false if not found.
   * Uses deleteMany with hiveId for defense-in-depth on top of RLS.
   */
  async remove(id: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.event.deleteMany({ where: { id, hiveId } });
    return result.count > 0;
  }
}
