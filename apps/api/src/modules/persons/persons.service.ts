import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  DecryptFields,
  EncryptFields,
  EncryptionService,
  type FieldTransforms,
} from '../encryption';

// ============================================
// TYPES
// ============================================

/**
 * Decrypted person summary — returned by list().
 * No userId (global identifier not exposed for other members).
 * No birthdate (sensitive field not needed for list views).
 */
export interface PersonSummary {
  id: string;
  role: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

/**
 * Decrypted person detail — returned by getById(), updateProfile(), updateRole().
 * Includes birthdate (as Date) and userId (for own-record lookups).
 */
export interface PersonDetail extends PersonSummary {
  birthdate: Date | null;
  userId: string | null;
}

const SUMMARY_SELECT = {
  id: true,
  role: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  birthdate: true,
  userId: true,
} as const;

/** Encrypted string fields on Person (no special transforms needed) */
const SUMMARY_ENC_FIELDS = ['displayName', 'avatarUrl'];

/** All encrypted fields including birthdate (Date ↔ ISO string transform) */
const DETAIL_ENC_FIELDS = ['displayName', 'avatarUrl', 'birthdate'];

/** Birthdate requires Date ↔ ISO string conversion around encryption */
const BIRTHDATE_TRANSFORMS: Record<string, FieldTransforms> = {
  birthdate: {
    serialize: (value: unknown) => (value as Date).toISOString(),
    deserialize: (value: string) => {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    },
  },
};

// ============================================
// SERVICE
// ============================================

/**
 * PersonsService
 *
 * Handles all DB operations for hive members.
 * Sensitive fields (displayName, avatarUrl, birthdate) are encrypted at rest using
 * per-hive AES-256-GCM keys via EncryptionService.
 *
 * Callers are responsible for:
 * - Authorization checks (use requirePermission in the router)
 * - Input sanitization (sanitizeHtml in the router before calling service methods)
 */
@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * List all persons in a hive, ordered by join date.
   * Returns PersonSummary (decrypted). No userId — not exposed in list views.
   */
  @DecryptFields({ fields: SUMMARY_ENC_FIELDS, hiveIdArg: 0 })
  async list(hiveId: string): Promise<PersonSummary[]> {
    return this.prisma.person.findMany({
      where: { hiveId },
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get a single person by ID within the hive. Returns null if not found.
   * Defense-in-depth: explicit hiveId filter on top of RLS.
   */
  @DecryptFields({ fields: DETAIL_ENC_FIELDS, hiveIdArg: 1, transforms: BIRTHDATE_TRANSFORMS })
  async getById(id: string, hiveId: string): Promise<PersonDetail | null> {
    // Decorator transforms birthdate from string → Date at runtime
    return this.prisma.person.findFirst({
      where: { id, hiveId },
      select: DETAIL_SELECT,
    }) as Promise<PersonDetail | null>;
  }

  /**
   * Update a person's own profile fields (displayName, avatarUrl, birthdate).
   * Role changes are NOT allowed here — use updateRole() for that.
   *
   * @param hiveId - Required for per-hive encryption key derivation
   * @throws Prisma P2025 if personId does not exist (handled by router)
   */
  @EncryptFields({ fields: DETAIL_ENC_FIELDS, hiveIdArg: 1, transforms: BIRTHDATE_TRANSFORMS })
  @DecryptFields({ fields: DETAIL_ENC_FIELDS, hiveIdArg: 1, transforms: BIRTHDATE_TRANSFORMS })
  async updateProfile(
    personId: string,
    hiveId: string,
    input: {
      displayName?: string;
      avatarUrl?: string;
      birthdate?: Date;
    }
  ): Promise<PersonDetail> {
    const data: Prisma.PersonUncheckedUpdateInput = {};

    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    // After @EncryptFields, birthdate is an encrypted string at runtime
    if (input.birthdate !== undefined) data.birthdate = input.birthdate as unknown as string;

    // Defense-in-depth: updateMany accepts non-unique WHERE, so we can filter
    // by hiveId to prevent cross-tenant modification even if RLS fails.
    const result = await this.prisma.person.updateMany({
      where: { id: personId, hiveId },
      data,
    });
    if (result.count === 0) {
      throw new Error('Person not found in this hive');
    }
    return this.prisma.person.findFirstOrThrow({
      where: { id: personId, hiveId },
      select: DETAIL_SELECT,
    }) as Promise<PersonDetail>;
  }

  /**
   * Change a person's role within the hive. Admin-only operation.
   * The DB trigger `enforce_minimum_admin` prevents removing the last admin.
   *
   * @throws Prisma P2025 if personId does not exist (handled by router)
   * @throws DB trigger error if this would remove the last admin (handled by router)
   */
  @DecryptFields({ fields: DETAIL_ENC_FIELDS, hiveIdArg: 1, transforms: BIRTHDATE_TRANSFORMS })
  async updateRole(personId: string, hiveId: string, role: string): Promise<PersonDetail> {
    // Defense-in-depth: updateMany accepts non-unique WHERE, so we can filter
    // by hiveId to prevent cross-tenant modification even if RLS fails.
    const result = await this.prisma.person.updateMany({
      where: { id: personId, hiveId },
      data: { role },
    });
    if (result.count === 0) {
      throw new Error('Person not found in this hive');
    }
    return this.prisma.person.findFirstOrThrow({
      where: { id: personId, hiveId },
      select: DETAIL_SELECT,
    }) as Promise<PersonDetail>;
  }

  /**
   * Remove a person from the hive (DELETE the person record).
   * The DB trigger `enforce_minimum_admin` prevents removing the last admin.
   *
   * Uses deleteMany with explicit hiveId filter (defense-in-depth on top of RLS).
   * Returns true if deleted, false if not found in this hive.
   *
   * @throws DB trigger error if this would remove the last admin (handled by router)
   */
  async remove(personId: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.person.deleteMany({
      where: { id: personId, hiveId },
    });
    return result.count > 0;
  }
}
