import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/**
 * Raw person row as returned by Prisma after the encrypt_person_fields migration.
 * displayName, avatarUrl, birthdate are encrypted ciphertext strings in the DB.
 * Internal to PersonsService — never exported.
 */
type PersonSummaryRaw = {
  id: string;
  role: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
};

type PersonDetailRaw = PersonSummaryRaw & {
  birthdate: string | null; // encrypted ISO 8601 UTC string
  userId: string | null;
};

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
  private readonly logger = new Logger(PersonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * List all persons in a hive, ordered by join date.
   * Returns PersonSummary (decrypted). No userId — not exposed in list views.
   */
  async list(hiveId: string): Promise<PersonSummary[]> {
    const rows = await this.prisma.person.findMany({
      where: { hiveId },
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.decryptSummary(row, hiveId));
  }

  /**
   * Get a single person by ID within the hive. Returns null if not found.
   * Defense-in-depth: explicit hiveId filter on top of RLS.
   */
  async getById(id: string, hiveId: string): Promise<PersonDetail | null> {
    const row = await this.prisma.person.findFirst({
      where: { id, hiveId },
      select: DETAIL_SELECT,
    });
    return row ? this.decryptDetail(row, hiveId) : null;
  }

  /**
   * Update a person's own profile fields (displayName, avatarUrl, birthdate).
   * Role changes are NOT allowed here — use updateRole() for that.
   *
   * @param hiveId - Required for per-hive encryption key derivation
   * @throws Prisma P2025 if personId does not exist (handled by router)
   */
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

    if (input.displayName !== undefined) data.displayName = this.encStr(input.displayName, hiveId);
    if (input.avatarUrl !== undefined) data.avatarUrl = this.encStr(input.avatarUrl, hiveId);
    if (input.birthdate !== undefined)
      data.birthdate = this.encStr(input.birthdate.toISOString(), hiveId);

    const row = await this.prisma.person.update({
      where: { id: personId },
      data,
      select: DETAIL_SELECT,
    });
    return this.decryptDetail(row, hiveId);
  }

  /**
   * Change a person's role within the hive. Admin-only operation.
   * The DB trigger `enforce_minimum_admin` prevents removing the last admin.
   *
   * @throws Prisma P2025 if personId does not exist (handled by router)
   * @throws DB trigger error if this would remove the last admin (handled by router)
   */
  async updateRole(personId: string, hiveId: string, role: string): Promise<PersonDetail> {
    const row = await this.prisma.person.update({
      where: { id: personId },
      data: { role },
      select: DETAIL_SELECT,
    });
    return this.decryptDetail(row, hiveId);
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

  // -----------------------------------------------------------------------
  // Private encryption helpers
  // -----------------------------------------------------------------------

  private encStr(value: string, hiveId: string): string {
    return this.enc.serializeToStorage(this.enc.encrypt(value, hiveId));
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

  private decBirthdate(value: string | null, hiveId: string): Date | null {
    const s = this.decOpt(value, hiveId);
    if (s === null) return null;
    const d = new Date(s);
    // isNaN guard handles both legacy plain ISO strings and invalid values
    return isNaN(d.getTime()) ? null : d;
  }

  private decryptSummary(row: PersonSummaryRaw, hiveId: string): PersonSummary {
    return {
      ...row,
      displayName: this.decOpt(row.displayName, hiveId),
      avatarUrl: this.decOpt(row.avatarUrl, hiveId),
    };
  }

  private decryptDetail(row: PersonDetailRaw, hiveId: string): PersonDetail {
    return {
      ...this.decryptSummary(row, hiveId),
      birthdate: this.decBirthdate(row.birthdate, hiveId),
      userId: row.userId,
    };
  }
}
