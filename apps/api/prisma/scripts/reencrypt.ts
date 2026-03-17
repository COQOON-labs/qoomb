/* eslint-disable no-console */
/**
 * Key Rotation Re-Encryption Script
 *
 * Safely migrates all encrypted fields from one key version to the next.
 * Every old ciphertext is backed up to `reencrypt_backups` before being
 * overwritten — backup rows expire after REENCRYPT_BACKUP_RETENTION_DAYS days
 * (default: 30) and are cleaned up via `db:reencrypt-cleanup`.
 *
 * Run:  pnpm --filter @qoomb/api db:reencrypt            (dry run — no writes)
 *       pnpm --filter @qoomb/api db:reencrypt --execute   (apply changes)
 *
 * Required env vars (rotation mode):
 *   ENCRYPTION_KEY_CURRENT=2
 *   ENCRYPTION_KEY_V1=<old base64 key>   ← keep until this script completes
 *   ENCRYPTION_KEY_V2=<new base64 key>
 *   REENCRYPT_BACKUP_RETENTION_DAYS=30   (optional, default 30)
 *
 * Full deployment sequence — see docs/adr/0008-secure-reencryption-process.md
 *
 * Safety guarantees:
 *   - Zero login disruption: the app uses hashEmailAllVersions() for all
 *     lookups, so both old (V1) and new (V2) email hashes are found during
 *     rotation. No restart is required before running this script.
 *   - Backup-before-write: old ciphertext is saved to reencrypt_backups within
 *     the same transaction as the UPDATE — atomic, recoverable for 30 days.
 *   - Verify-before-commit: decrypts new ciphertext to confirm it matches
 *     original before writing to DB (transaction is rolled back on mismatch).
 *   - Resumable: fields already at the target version are skipped.
 *   - Atomic per-record: each record is its own transaction.
 *   - Dry run by default: pass --execute to write changes.
 */

// Must be imported before any NestJS decorators are evaluated
import 'reflect-metadata';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { EncryptionService } from '../../src/modules/encryption/encryption.service';

// ── Prisma setup ────────────────────────────────────────────────────────────

// max: 1 ensures a single shared connection for the entire CLI session so that
// a SET app.reencrypt_session statement in main() persists for all later queries.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── CLI args ─────────────────────────────────────────────────────────────────

const EXECUTE = process.argv.includes('--execute');
const FROM_VERSION_ARG = process.argv.find((a) => a.startsWith('--from-version='));
const FROM_VERSION_OVERRIDE = FROM_VERSION_ARG
  ? parseInt(FROM_VERSION_ARG.split('=')[1], 10)
  : null;

if (FROM_VERSION_OVERRIDE !== null && (isNaN(FROM_VERSION_OVERRIDE) || FROM_VERSION_OVERRIDE < 1)) {
  console.error(
    `Invalid --from-version value. Must be a positive integer, got: "${FROM_VERSION_ARG?.split('=')[1]}"`
  );
  throw new Error('Invalid --from-version argument');
}

// ── Backup retention ─────────────────────────────────────────────────────────

/**
 * Number of days to keep backup rows in `reencrypt_backups`.
 * Configurable via REENCRYPT_BACKUP_RETENTION_DAYS (default: 30).
 * Minimum value is 1 — zero-day retention is refused at runtime.
 * Exported for unit testing.
 */
export function getBackupRetentionDays(): number {
  const raw = process.env['REENCRYPT_BACKUP_RETENTION_DAYS'];
  if (!raw) return 30;
  const days = parseInt(raw, 10);
  if (isNaN(days) || days < 1) {
    throw new Error(
      `REENCRYPT_BACKUP_RETENTION_DAYS must be a positive integer, got: "${raw}". ` +
        'Zero-day retention is not allowed to protect against accidental data loss.'
    );
  }
  return days;
}

/**
 * Compute the backup expiry timestamp (now + retentionDays).
 * Exported for unit testing.
 */
export function backupExpiresAt(retentionDays: number): Date {
  return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Shape of a single row in reencrypt_backups.
 * Exported so tests can verify the structure without Prisma.
 */
export interface BackupRowInput {
  tableName: string;
  recordId: string;
  fieldName: string;
  oldCiphertext: string;
  fromVersion: number;
  toVersion: number;
  expiresAt: Date;
}

/**
 * Build a backup row for a single field update.
 * Use this in transaction blocks to ensure consistent structure.
 * Exported for testing.
 */
export function buildBackupRow(
  tableName: string,
  recordId: string,
  fieldName: string,
  oldCiphertext: string,
  fromVersion: number,
  toVersion: number,
  retentionDays: number
): BackupRowInput {
  return {
    tableName,
    recordId,
    fieldName,
    oldCiphertext,
    fromVersion,
    toVersion,
    expiresAt: backupExpiresAt(retentionDays),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export interface ReencryptStats {
  migrated: number;
  skipped: number;
  failed: number;
}

/**
 * Attempt to re-encrypt a single stored value.
 *
 * Returns the new ciphertext if the value needed migration and verification
 * passed, null if the value is already at the target version (skip), or
 * throws if decryption / verification fails (caller handles error).
 *
 * Exported so that unit tests can exercise the core logic without Prisma.
 */
export function reencryptField(
  stored: string | null,
  fromVersion: number,
  decryptFn: (s: string) => string,
  encryptFn: (plaintext: string) => string
): string | null {
  if (!stored || !stored.startsWith(`v${fromVersion}:`)) {
    return null; // already at target version or null — skip
  }

  const plaintext = decryptFn(stored);
  const newCiphertext = encryptFn(plaintext);

  // Verify: decrypt the new ciphertext — must equal original plaintext.
  // EncryptionService.decrypt resolves the version from the stored prefix,
  // so decryptFn(v2:...) uses the V2 key automatically.
  const verified = decryptFn(newCiphertext);
  if (verified !== plaintext) {
    // Do NOT include plaintext/ciphertext in the message — logs may be sent to
    // external systems. The caller's catch block logs the record ID and field.
    throw new Error(
      `Verification failed: re-encrypted value decrypts to different content ` +
        `(byte lengths: before=${plaintext.length}, after=${verified.length})`
    );
  }

  return newCiphertext;
}

// ── Table migrations ──────────────────────────────────────────────────────────

async function migrateUsers(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;
  const retentionDays = getBackupRetentionDays();
  const expiresAt = backupExpiresAt(retentionDays);

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: prefix } },
        { fullName: { startsWith: prefix } },
        { locale: { startsWith: prefix } },
      ],
    },
  });

  for (const user of users) {
    try {
      const decUser = (s: string) => enc.decryptForUser(s, user.id);
      const encUser = (s: string) => enc.encryptForUser(s, user.id);

      const newEmail = reencryptField(user.email, fromVersion, decUser, encUser);
      const newFullName = user.fullName
        ? reencryptField(user.fullName, fromVersion, decUser, encUser)
        : null;
      const newLocale = user.locale
        ? reencryptField(user.locale, fromVersion, decUser, encUser)
        : null;

      if (newEmail === null && newFullName === null && newLocale === null) {
        stats.skipped++;
        continue;
      }

      // Compute new emailHash from decrypted email (HMAC key changes with master key)
      const decryptedEmail = newEmail
        ? enc.decryptForUser(newEmail, user.id)
        : enc.decryptForUser(user.email, user.id);
      const newEmailHash = enc.hashEmail(decryptedEmail);

      if (!EXECUTE) {
        console.log(
          `  [DRY RUN] user ${user.id}: email/fullName/locale → v${enc.getCurrentKeyVersion()}, emailHash updated`
        );
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // ── 1. Write backups first (within same transaction) ──────────────
        const backupFields: Array<{ fieldName: string; oldCiphertext: string }> = [];
        if (newEmail !== null) {
          backupFields.push({ fieldName: 'email', oldCiphertext: user.email });
          // Also back up the old HMAC so rollback can restore the correct emailHash.
          // Without this, rolling back would leave emailHash at the new-key value while
          // the app restarts with only the old key → all logins fail (hash mismatch).
          backupFields.push({ fieldName: 'email_hash', oldCiphertext: user.emailHash });
        }
        if (newFullName !== null && user.fullName)
          backupFields.push({ fieldName: 'full_name', oldCiphertext: user.fullName });
        if (newLocale !== null && user.locale)
          backupFields.push({ fieldName: 'locale', oldCiphertext: user.locale });

        if (backupFields.length > 0) {
          await tx.reencryptBackup.createMany({
            data: backupFields.map((f) => ({
              tableName: 'users',
              recordId: user.id,
              fieldName: f.fieldName,
              oldCiphertext: f.oldCiphertext,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            })),
          });
        }

        // ── 2. Update the record ──────────────────────────────────────────
        await tx.user.update({
          where: { id: user.id },
          data: {
            ...(newEmail !== null && { email: newEmail, emailHash: newEmailHash }),
            ...(newFullName !== null && { fullName: newFullName }),
            ...(newLocale !== null && { locale: newLocale }),
          },
        });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ user ${user.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

async function migrateHives(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;
  const retentionDays = getBackupRetentionDays();
  const expiresAt = backupExpiresAt(retentionDays);

  const hives = await prisma.hive.findMany({
    where: { name: { startsWith: prefix } },
  });

  for (const hive of hives) {
    try {
      const decHive = (s: string) => enc.decrypt(enc.parseFromStorage(s), hive.id);
      const encHive = (s: string) => enc.serializeToStorage(enc.encrypt(s, hive.id));

      const newName = reencryptField(hive.name, fromVersion, decHive, encHive);
      if (newName === null) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] hive ${hive.id}: name → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.reencryptBackup.create({
          data: {
            tableName: 'hives',
            recordId: hive.id,
            fieldName: 'name',
            oldCiphertext: hive.name,
            fromVersion,
            toVersion: enc.getCurrentKeyVersion(),
            expiresAt,
          },
        });
        await tx.hive.update({ where: { id: hive.id }, data: { name: newName } });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ hive ${hive.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

async function migratePersons(
  enc: EncryptionService,
  fromVersion: number
): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;
  const retentionDays = getBackupRetentionDays();
  const expiresAt = backupExpiresAt(retentionDays);

  const persons = await prisma.person.findMany({
    where: {
      OR: [
        { displayName: { startsWith: prefix } },
        { avatarUrl: { startsWith: prefix } },
        { birthdate: { startsWith: prefix } },
      ],
    },
  });

  for (const person of persons) {
    try {
      if (!person.hiveId) {
        stats.skipped++;
        continue;
      }
      const decP = (s: string) => enc.decrypt(enc.parseFromStorage(s), person.hiveId);
      const encP = (s: string) => enc.serializeToStorage(enc.encrypt(s, person.hiveId));

      const newDisplayName = reencryptField(person.displayName, fromVersion, decP, encP);
      const newAvatarUrl = reencryptField(person.avatarUrl, fromVersion, decP, encP);
      const newBirthdate = reencryptField(person.birthdate, fromVersion, decP, encP);

      if (newDisplayName === null && newAvatarUrl === null && newBirthdate === null) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] person ${person.id}: fields → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const backupFields: Array<{ fieldName: string; oldCiphertext: string }> = [];
        if (newDisplayName !== null && person.displayName)
          backupFields.push({ fieldName: 'display_name', oldCiphertext: person.displayName });
        if (newAvatarUrl !== null && person.avatarUrl)
          backupFields.push({ fieldName: 'avatar_url', oldCiphertext: person.avatarUrl });
        if (newBirthdate !== null && person.birthdate)
          backupFields.push({ fieldName: 'birthdate', oldCiphertext: person.birthdate });

        if (backupFields.length > 0) {
          await tx.reencryptBackup.createMany({
            data: backupFields.map((f) => ({
              tableName: 'persons',
              recordId: person.id,
              fieldName: f.fieldName,
              oldCiphertext: f.oldCiphertext,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            })),
          });
        }

        await tx.person.update({
          where: { id: person.id },
          data: {
            ...(newDisplayName !== null && { displayName: newDisplayName }),
            ...(newAvatarUrl !== null && { avatarUrl: newAvatarUrl }),
            ...(newBirthdate !== null && { birthdate: newBirthdate }),
          },
        });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ person ${person.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

async function migrateEvents(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;
  const retentionDays = getBackupRetentionDays();
  const expiresAt = backupExpiresAt(retentionDays);

  const events = await prisma.event.findMany({
    where: {
      OR: [
        { title: { startsWith: prefix } },
        { description: { startsWith: prefix } },
        { location: { startsWith: prefix } },
        { url: { startsWith: prefix } },
        { category: { startsWith: prefix } },
      ],
    },
  });

  for (const event of events) {
    try {
      const decE = (s: string) => enc.decrypt(enc.parseFromStorage(s), event.hiveId);
      const encE = (s: string) => enc.serializeToStorage(enc.encrypt(s, event.hiveId));

      const newTitle = reencryptField(event.title, fromVersion, decE, encE);
      const newDescription = reencryptField(event.description, fromVersion, decE, encE);
      const newLocation = reencryptField(event.location, fromVersion, decE, encE);
      const newUrl = reencryptField(event.url, fromVersion, decE, encE);
      const newCategory = reencryptField(event.category, fromVersion, decE, encE);

      if ([newTitle, newDescription, newLocation, newUrl, newCategory].every((v) => v === null)) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] event ${event.id}: fields → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const backupFields: Array<{ fieldName: string; oldCiphertext: string }> = [];
        if (newTitle !== null && event.title)
          backupFields.push({ fieldName: 'title', oldCiphertext: event.title });
        if (newDescription !== null && event.description)
          backupFields.push({ fieldName: 'description', oldCiphertext: event.description });
        if (newLocation !== null && event.location)
          backupFields.push({ fieldName: 'location', oldCiphertext: event.location });
        if (newUrl !== null && event.url)
          backupFields.push({ fieldName: 'url', oldCiphertext: event.url });
        if (newCategory !== null && event.category)
          backupFields.push({ fieldName: 'category', oldCiphertext: event.category });

        if (backupFields.length > 0) {
          await tx.reencryptBackup.createMany({
            data: backupFields.map((f) => ({
              tableName: 'events',
              recordId: event.id,
              fieldName: f.fieldName,
              oldCiphertext: f.oldCiphertext,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            })),
          });
        }

        await tx.event.update({
          where: { id: event.id },
          data: {
            ...(newTitle !== null && { title: newTitle }),
            ...(newDescription !== null && { description: newDescription }),
            ...(newLocation !== null && { location: newLocation }),
            ...(newUrl !== null && { url: newUrl }),
            ...(newCategory !== null && { category: newCategory }),
          },
        });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ event ${event.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

async function migrateGroups(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;
  const retentionDays = getBackupRetentionDays();
  const expiresAt = backupExpiresAt(retentionDays);

  const groups = await prisma.hiveGroup.findMany({
    where: {
      OR: [{ name: { startsWith: prefix } }, { description: { startsWith: prefix } }],
    },
  });

  for (const group of groups) {
    try {
      const decG = (s: string) => enc.decrypt(enc.parseFromStorage(s), group.hiveId);
      const encG = (s: string) => enc.serializeToStorage(enc.encrypt(s, group.hiveId));

      const newName = reencryptField(group.name, fromVersion, decG, encG);
      const newDescription = reencryptField(group.description, fromVersion, decG, encG);

      if (newName === null && newDescription === null) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] group ${group.id}: fields → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const backupFields: Array<{ fieldName: string; oldCiphertext: string }> = [];
        if (newName !== null && group.name)
          backupFields.push({ fieldName: 'name', oldCiphertext: group.name });
        if (newDescription !== null && group.description)
          backupFields.push({ fieldName: 'description', oldCiphertext: group.description });

        if (backupFields.length > 0) {
          await tx.reencryptBackup.createMany({
            data: backupFields.map((f) => ({
              tableName: 'hive_groups',
              recordId: group.id,
              fieldName: f.fieldName,
              oldCiphertext: f.oldCiphertext,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            })),
          });
        }

        await tx.hiveGroup.update({
          where: { id: group.id },
          data: {
            ...(newName !== null && { name: newName }),
            ...(newDescription !== null && { description: newDescription }),
          },
        });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ group ${group.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

async function migrateLists(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;
  const retentionDays = getBackupRetentionDays();
  const expiresAt = backupExpiresAt(retentionDays);

  // ── 1. List.name ──────────────────────────────────────────────────────────
  const lists = await prisma.list.findMany({
    where: { name: { startsWith: prefix } },
  });

  for (const list of lists) {
    try {
      // Global templates (hiveId=null) store plaintext — skip re-encryption (ADR-0009)
      const hiveId = list.hiveId;
      if (hiveId === null) {
        stats.skipped++;
        continue;
      }

      const dec = (s: string) => enc.decrypt(enc.parseFromStorage(s), hiveId);
      const encFn = (s: string) => enc.serializeToStorage(enc.encrypt(s, hiveId));
      const newName = reencryptField(list.name, fromVersion, dec, encFn);

      if (newName === null) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] list ${list.id}: name → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.reencryptBackup.createMany({
          data: [
            {
              tableName: 'lists',
              recordId: list.id,
              fieldName: 'name',
              oldCiphertext: list.name,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            },
          ],
        });
        await tx.list.update({ where: { id: list.id }, data: { name: newName } });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ list ${list.id}: ${msg}`);
      stats.failed++;
    }
  }

  // ── 2. ListField.name ────────────────────────────────────────────────────
  const fields = await prisma.listField.findMany({
    where: { name: { startsWith: prefix } },
    include: { list: { select: { hiveId: true } } },
  });

  for (const field of fields) {
    try {
      // Fields of global templates (hiveId=null) store plaintext — skip re-encryption (ADR-0009)
      const hiveId = field.list.hiveId;
      if (hiveId === null) {
        stats.skipped++;
        continue;
      }

      const dec = (s: string) => enc.decrypt(enc.parseFromStorage(s), hiveId);
      const encFn = (s: string) => enc.serializeToStorage(enc.encrypt(s, hiveId));
      const newName = reencryptField(field.name, fromVersion, dec, encFn);

      if (newName === null) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] listField ${field.id}: name → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.reencryptBackup.createMany({
          data: [
            {
              tableName: 'list_fields',
              recordId: field.id,
              fieldName: 'name',
              oldCiphertext: field.name,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            },
          ],
        });
        await tx.listField.update({ where: { id: field.id }, data: { name: newName } });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ listField ${field.id}: ${msg}`);
      stats.failed++;
    }
  }

  // ── 3. ListView.name ─────────────────────────────────────────────────────
  const views = await prisma.listView.findMany({
    where: { name: { startsWith: prefix } },
    include: { list: { select: { hiveId: true } } },
  });

  for (const view of views) {
    try {
      // Views of global templates (hiveId=null) store plaintext — skip re-encryption (ADR-0009)
      const hiveId = view.list.hiveId;
      if (hiveId === null) {
        stats.skipped++;
        continue;
      }

      const dec = (s: string) => enc.decrypt(enc.parseFromStorage(s), hiveId);
      const encFn = (s: string) => enc.serializeToStorage(enc.encrypt(s, hiveId));
      const newName = reencryptField(view.name, fromVersion, dec, encFn);

      if (newName === null) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] listView ${view.id}: name → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.reencryptBackup.createMany({
          data: [
            {
              tableName: 'list_views',
              recordId: view.id,
              fieldName: 'name',
              oldCiphertext: view.name,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            },
          ],
        });
        await tx.listView.update({ where: { id: view.id }, data: { name: newName } });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ listView ${view.id}: ${msg}`);
      stats.failed++;
    }
  }

  // ── 4. ListItemValue.value (all field types — single encrypted column) ──────

  const itemValues = await prisma.listItemValue.findMany({
    where: { value: { startsWith: prefix } },
    include: { item: { select: { hiveId: true } } },
  });

  for (const iv of itemValues) {
    try {
      const hiveId = iv.item.hiveId;
      const dec = (s: string) => enc.decrypt(enc.parseFromStorage(s), hiveId);
      const encFn = (s: string) => enc.serializeToStorage(enc.encrypt(s, hiveId));
      const newValue = reencryptField(iv.value, fromVersion, dec, encFn);

      if (newValue === null) {
        stats.skipped++;
        continue;
      }

      // iv.value is guaranteed non-null by the findMany WHERE (startsWith prefix),
      // but the Prisma type is String? — add an explicit guard as a safety net.
      if (!iv.value) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] listItemValue ${iv.id}: value → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.reencryptBackup.createMany({
          data: [
            {
              tableName: 'list_item_values',
              recordId: iv.id,
              fieldName: 'value',
              oldCiphertext: iv.value as string,
              fromVersion,
              toVersion: enc.getCurrentKeyVersion(),
              expiresAt,
            },
          ],
        });
        await tx.listItemValue.update({ where: { id: iv.id }, data: { value: newValue } });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ listItemValue ${iv.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

async function migrateInvitations(
  enc: EncryptionService,
  fromVersion: number
): Promise<ReencryptStats> {
  // Invitations don't store encrypted ciphertext — only an HMAC blind index
  // and (since migration 20260314000005) the normalized plaintext email.
  // Re-computation: recompute emailHash from the stored plaintext email using
  // the current key.  No versioned ciphertext migration is needed.
  // Only rows where emailHash was computed with an older key need updating —
  // we detect those by recomputing hashEmail and comparing.
  //
  // Backup-before-write: the old emailHash is written to reencrypt_backups
  // inside the same transaction so the rollback script can restore it if the
  // rotation is aborted after partial migration.
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const retentionDays = getBackupRetentionDays();
  const expiresAt = backupExpiresAt(retentionDays);

  const active = await prisma.invitation.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, emailHash: true },
  });

  for (const inv of active) {
    try {
      if (!inv.email) {
        // Row predates migration 20260314000005 (empty sentinel). Skip and
        // note in stats — operator should revoke/resend these manually.
        console.warn(
          `  ⚠️  invitation ${inv.id}: empty email column (pre-migration row). Skipping.`
        );
        stats.skipped++;
        continue;
      }

      const newHash = enc.hashEmail(inv.email);

      if (newHash === inv.emailHash) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] invitation ${inv.id}: emailHash → new key version`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // 1. Write backup first — old emailHash can be restored on rollback.
        await tx.reencryptBackup.create({
          data: {
            tableName: 'invitations',
            recordId: inv.id,
            fieldName: 'email_hash',
            oldCiphertext: inv.emailHash,
            fromVersion,
            toVersion: enc.getCurrentKeyVersion(),
            expiresAt,
          },
        });

        // 2. Update emailHash only after backup is committed.
        await tx.invitation.update({
          where: { id: inv.id },
          data: { emailHash: newHash },
        });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ invitation ${inv.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Grant this CLI session access to the ops-only backup table (RLS gate).
  // max: 1 pool guarantees this SET persists for all subsequent queries.
  await prisma.$executeRawUnsafe(`SET app.reencrypt_session = 'true'`);

  // Initialize encryption service
  const enc = new EncryptionService();
  await enc.onModuleInit();

  const currentVersion = enc.getCurrentKeyVersion();
  const fromVersion = FROM_VERSION_OVERRIDE ?? currentVersion - 1;

  if (fromVersion < 1) {
    console.log('Nothing to migrate: already at the first key version (V1).');
    console.log(
      'To rotate, set ENCRYPTION_KEY_CURRENT=2, ENCRYPTION_KEY_V1=<old>, ENCRYPTION_KEY_V2=<new>.'
    );
    return;
  }

  console.log();
  console.log(`🔑 Key Rotation Re-Encryption`);
  console.log(`   Migrating: V${fromVersion} → V${currentVersion}`);
  console.log(
    `   Mode:      ${EXECUTE ? '⚡ EXECUTE (writing changes)' : '🔍 DRY RUN (no writes)'}`
  );
  console.log();

  if (!EXECUTE) {
    console.log('ℹ️  Pass --execute to apply changes.\n');
  }

  const results: Record<string, ReencryptStats> = {};

  console.log('── users ───────────────────────────────────────────────────');
  results.users = await migrateUsers(enc, fromVersion);

  console.log('── hives ───────────────────────────────────────────────────');
  results.hives = await migrateHives(enc, fromVersion);

  console.log('── persons ─────────────────────────────────────────────────');
  results.persons = await migratePersons(enc, fromVersion);

  console.log('── events ──────────────────────────────────────────────────');
  results.events = await migrateEvents(enc, fromVersion);

  console.log('── groups ──────────────────────────────────────────────────');
  results.groups = await migrateGroups(enc, fromVersion);

  console.log('── lists ───────────────────────────────────────────────────');
  results.lists = await migrateLists(enc, fromVersion);

  console.log('── invitations ─────────────────────────────────────────────');
  results.invitations = await migrateInvitations(enc, fromVersion);

  console.log();
  console.log('── Summary ─────────────────────────────────────────────────');

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const [table, s] of Object.entries(results)) {
    console.log(
      `  ${table.padEnd(12)} migrated: ${s.migrated}  skipped: ${s.skipped}  failed: ${s.failed}`
    );
    totalMigrated += s.migrated;
    totalSkipped += s.skipped;
    totalFailed += s.failed;
  }

  console.log(
    `  ${'TOTAL'.padEnd(12)} migrated: ${totalMigrated}  skipped: ${totalSkipped}  failed: ${totalFailed}`
  );
  console.log();

  if (totalFailed > 0) {
    console.error(`❌ ${totalFailed} record(s) failed verification — check errors above.`);
    console.error('   The failed records were NOT written. Re-run after fixing the issue.');
    throw new Error(`Re-encryption failed: ${totalFailed} record(s) could not be migrated.`);
  }

  if (totalMigrated === 0 && totalFailed === 0) {
    console.log('✅ Nothing to migrate — all records already at V' + currentVersion);
  } else if (EXECUTE) {
    console.log(
      `✅ Re-encryption complete. ${totalMigrated} record(s) migrated to V${currentVersion}.`
    );
    console.log();
    console.log('Next steps:');
    console.log('  1. Verify the app works (login, check encrypted fields in Prisma Studio)');
    console.log('     Note: the app can stay running throughout — no restart required.');
    console.log(
      '  2. Remove ENCRYPTION_KEY_V' + fromVersion + ' and ENCRYPTION_KEY_CURRENT from env'
    );
    console.log(
      '  3. Rename ENCRYPTION_KEY_V' + currentVersion + ' → ENCRYPTION_KEY (single-key mode)'
    );
  } else {
    console.log(
      `ℹ️  Dry run: ${totalMigrated} record(s) would be migrated. Pass --execute to apply.`
    );
  }
}

// Only run when executed directly — not when imported by tests.
if (require.main === module) {
  main()
    .finally(() => {
      void prisma.$disconnect();
    })
    .catch((e: unknown) => {
      console.error(e);
      throw e;
    });
}
