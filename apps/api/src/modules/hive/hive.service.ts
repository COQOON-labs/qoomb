import { Injectable } from '@nestjs/common';
import { type Hive, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DecryptFields, EncryptDecryptFields, EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/**
 * Hive row with the encrypted name field decrypted.
 * Returned by all HiveService read methods.
 */
export type HiveRow = Omit<Hive, 'name'> & { name: string };

export interface UpdateHiveData {
  name?: string;
  locale?: string | null;
  settings?: Record<string, unknown>;
}

// ============================================
// SERVICE
// ============================================

/** Encrypted fields on the Hive model */
const ENC_FIELDS = ['name'];

/**
 * HiveService
 *
 * Handles all DB operations for hive management (Phase 3).
 * The `name` field is encrypted at rest using per-hive AES-256-GCM keys.
 *
 * Callers (router) are responsible for:
 * - Authorization checks (HIVE_UPDATE / HIVE_DELETE permissions)
 * - Input sanitization before calling service methods
 */
@Injectable()
export class HiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * Get the current hive by ID.
   * Returns null if not found (should not happen for authenticated context).
   */
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
  async getById(hiveId: string): Promise<HiveRow | null> {
    return this.prisma.hive.findUnique({ where: { id: hiveId } });
  }

  /**
   * Update hive name, locale, and/or settings.
   * Only provided fields are updated. `name` is encrypted by @EncryptDecryptFields.
   */
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async update(data: UpdateHiveData, hiveId: string): Promise<HiveRow> {
    const patch: Prisma.HiveUpdateInput = {};

    if (data.name !== undefined) patch.name = data.name;
    if ('locale' in data) patch.locale = data.locale ?? null;
    if (data.settings !== undefined) patch.settings = data.settings as Prisma.InputJsonValue;

    return this.prisma.hive.update({ where: { id: hiveId }, data: patch });
  }

  /**
   * Delete the hive and all its data (cascade handled by DB foreign keys).
   * Returns true if deleted, false if not found.
   */
  async remove(hiveId: string): Promise<boolean> {
    try {
      await this.prisma.hive.delete({ where: { id: hiveId } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return false;
      }
      throw e;
    }
  }
}
