import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/**
 * Group summary returned by list().
 * Includes decrypted name and description + member count.
 */
export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: Date;
}

/**
 * Group detail returned by getById().
 * Includes decrypted name, description, and full member list.
 */
export interface GroupDetail extends Omit<GroupSummary, 'memberCount'> {
  members: GroupMemberInfo[];
}

export interface GroupMemberInfo {
  id: string; // HiveGroupMember id
  personId: string;
  displayName: string | null;
  joinedAt: Date;
}

// ============================================
// SERVICE
// ============================================

/**
 * GroupsService
 *
 * Handles all DB operations for hive groups (HiveGroup + HiveGroupMember).
 * Group names and descriptions are encrypted at rest using per-hive AES-256-GCM keys.
 *
 * Callers are responsible for:
 * - Authorization checks (use requirePermission in the router)
 * - Input sanitization (sanitizeHtml in the router before calling service methods)
 */
@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * List all groups in a hive with member counts.
   */
  async list(hiveId: string): Promise<GroupSummary[]> {
    const rows = await this.prisma.hiveGroup.findMany({
      where: { hiveId },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      name: this.decStr(row.name, hiveId),
      description: this.decOpt(row.description, hiveId),
      memberCount: row._count.members,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Get a single group with its members.
   * Defense-in-depth: explicit hiveId filter on top of RLS.
   */
  async getById(id: string, hiveId: string): Promise<GroupDetail | null> {
    const row = await this.prisma.hiveGroup.findFirst({
      where: { id, hiveId },
      include: {
        members: {
          include: {
            person: { select: { id: true, displayName: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      name: this.decStr(row.name, hiveId),
      description: this.decOpt(row.description, hiveId),
      createdAt: row.createdAt,
      members: row.members.map((m) => ({
        id: m.id,
        personId: m.personId,
        displayName: this.decOpt(m.person.displayName, hiveId),
        joinedAt: m.joinedAt,
      })),
    };
  }

  /**
   * Create a new group.
   */
  async create(
    hiveId: string,
    data: { name: string; description?: string }
  ): Promise<GroupSummary> {
    const row = await this.prisma.hiveGroup.create({
      data: {
        hiveId,
        name: this.encStr(data.name, hiveId),
        description: this.encOpt(data.description, hiveId),
      },
    });

    return {
      id: row.id,
      name: data.name,
      description: data.description ?? null,
      memberCount: 0,
      createdAt: row.createdAt,
    };
  }

  /**
   * Update a group's name and/or description.
   */
  async update(
    id: string,
    hiveId: string,
    data: { name?: string; description?: string | null }
  ): Promise<GroupSummary> {
    const patch: Record<string, unknown> = {};

    if (data.name !== undefined) patch.name = this.encStr(data.name, hiveId);
    if ('description' in data) patch.description = this.encOpt(data.description, hiveId);

    const row = await this.prisma.hiveGroup.update({
      where: { id },
      data: patch,
      include: { _count: { select: { members: true } } },
    });

    return {
      id: row.id,
      name: this.decStr(row.name, hiveId),
      description: this.decOpt(row.description, hiveId),
      memberCount: row._count.members,
      createdAt: row.createdAt,
    };
  }

  /**
   * Delete a group. Returns true if deleted, false if not found.
   * Uses deleteMany with hiveId for defense-in-depth on top of RLS.
   */
  async remove(id: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.hiveGroup.deleteMany({ where: { id, hiveId } });
    return result.count > 0;
  }

  /**
   * Add a person to a group. Returns the membership record.
   * @param addedByPersonId - personId of the admin who added this member (audit trail)
   */
  async addMember(
    groupId: string,
    personId: string,
    hiveId: string,
    addedByPersonId: string
  ): Promise<{ id: string; personId: string; joinedAt: Date }> {
    const membership = await this.prisma.hiveGroupMember.create({
      data: {
        hiveId,
        groupId,
        personId,
        addedByPersonId,
      },
    });

    return {
      id: membership.id,
      personId: membership.personId,
      joinedAt: membership.joinedAt,
    };
  }

  /**
   * Remove a person from a group. Returns true if removed, false if not found.
   * Uses deleteMany with hiveId for defense-in-depth.
   */
  async removeMember(groupId: string, personId: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.hiveGroupMember.deleteMany({
      where: { groupId, personId, hiveId },
    });
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
      // Migration window: field not yet encrypted. Log so operators can track
      // progress and know when it is safe to enable STRICT_ENCRYPTION mode.
      this.logger.warn(`Plaintext fallback for hive ${hiveId} — field not yet encrypted`);
      return value;
    }
  }

  private decOpt(value: string | null, hiveId: string): string | null {
    if (value === null) return null;
    return this.decStr(value, hiveId);
  }
}
