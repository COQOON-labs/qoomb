import { Injectable } from '@nestjs/common';
import { type ActivityEvent, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DecryptFields, EncryptFields, EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/** ActivityEvent row with `summary` decrypted. */
export type ActivityEventRow = Omit<ActivityEvent, 'summary'> & { summary: string | null };

export interface RecordActivityData {
  actorPersonId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  /** Human-readable summary (encrypted at rest). */
  summary?: string;
  /** Structural metadata (JSONB, unencrypted — no PII). */
  metadata?: Record<string, unknown>;
}

// ============================================
// SERVICE
// ============================================

const ENC_FIELDS = ['summary'];

/**
 * ActivityService
 *
 * Records and retrieves the hive activity log (change feed).
 * `summary` is encrypted at rest (AES-256-GCM, hive-scoped key).
 *
 * Callers are responsible for:
 * - Authorization (ACTIVITY_VIEW permission for list; internal for record)
 * - Metadata must contain only structural data — no PII
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * Record an activity event. Called internally after successful mutations.
   * Failures are swallowed — activity recording must never break core operations.
   */
  @EncryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async record(data: RecordActivityData, hiveId: string): Promise<void> {
    await this.prisma.activityEvent.create({
      data: {
        hiveId,
        actorPersonId: data.actorPersonId ?? null,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        summary: data.summary ?? null,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * List activity events for the hive, most recent first.
   * Supports filtering by resourceType, resourceId, or actorPersonId.
   */
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
  async list(
    hiveId: string,
    options?: {
      resourceType?: string;
      resourceId?: string;
      actorPersonId?: string;
      limit?: number;
      page?: number;
    }
  ): Promise<ActivityEventRow[]> {
    const limit = options?.limit ?? 20;
    const page = options?.page ?? 1;

    const where: Prisma.ActivityEventWhereInput = { hiveId };
    if (options?.resourceType) where.resourceType = options.resourceType;
    if (options?.resourceId) where.resourceId = options.resourceId;
    if (options?.actorPersonId) where.actorPersonId = options.actorPersonId;

    return this.prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });
  }
}
