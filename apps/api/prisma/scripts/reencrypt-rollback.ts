/* eslint-disable no-console */
/**
 * Key Rotation Rollback Script
 *
 * Restores encrypted fields to their previous (V_from) ciphertext using the
 * backup rows written by `reencrypt.ts`. Only works while backup rows still
 * exist (within REENCRYPT_BACKUP_RETENTION_DAYS of the original migration).
 *
 * Run:  pnpm --filter @qoomb/api db:reencrypt-rollback            (dry run)
 *       pnpm --filter @qoomb/api db:reencrypt-rollback --execute   (apply)
 *
 * Required env vars — both key versions must still be available:
 *   ENCRYPTION_KEY_CURRENT=2
 *   ENCRYPTION_KEY_V1=<old base64 key>
 *   ENCRYPTION_KEY_V2=<new base64 key>
 *
 * ⚠️  After a successful rollback:
 *   1. Remove ENCRYPTION_KEY_CURRENT + _V2 from env (V2 is no longer current)
 *   2. Rename ENCRYPTION_KEY_V1 → ENCRYPTION_KEY (back to single-key mode)
 *   3. Restart the application
 *
 * Safety guarantees:
 *   - Dry run by default: pass --execute to write changes.
 *   - Atomic per-record: each restore is a single UPDATE.
 *   - Backup rows are NOT deleted by this script — they expire naturally.
 *   - Only restores records where a backup row exists (no guesswork).
 *   - Skips records where the live value is already back at fromVersion.
 */

// Must be imported before any NestJS decorators are evaluated
import 'reflect-metadata';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

// ── Prisma setup ─────────────────────────────────────────────────────────────

// max: 1 ensures a single shared connection so SET app.reencrypt_session persists
// for all queries in this CLI session.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── CLI args ─────────────────────────────────────────────────────────────────

const EXECUTE = process.argv.includes('--execute');
const TO_VERSION_ARG = process.argv.find((a) => a.startsWith('--to-version='));
const TO_VERSION_OVERRIDE = TO_VERSION_ARG ? parseInt(TO_VERSION_ARG.split('=')[1], 10) : null;

if (TO_VERSION_OVERRIDE !== null && (isNaN(TO_VERSION_OVERRIDE) || TO_VERSION_OVERRIDE < 1)) {
  console.error(
    `Invalid --to-version value. Must be a positive integer, got: "${TO_VERSION_ARG?.split('=')[1]}"`
  );
  throw new Error('Invalid --to-version argument');
}

// ── Field-name mapping ────────────────────────────────────────────────────────

/**
 * Map a DB column name (snake_case, from backup rows) to the Prisma model field
 * name (camelCase). Exported so tests can verify the mapping exhaustively.
 *
 * Most fields pass through unchanged (e.g. 'title', 'name', 'email').
 * Only columns where DB name ≠ Prisma field name need an explicit entry.
 */
export function mapFieldName(tableName: string, fieldName: string): string {
  if (tableName === 'users') {
    if (fieldName === 'full_name') return 'fullName';
    if (fieldName === 'email_hash') return 'emailHash';
  }
  if (tableName === 'persons') {
    if (fieldName === 'display_name') return 'displayName';
    if (fieldName === 'avatar_url') return 'avatarUrl';
  }
  if (tableName === 'invitations') {
    if (fieldName === 'email_hash') return 'emailHash';
  }
  return fieldName; // all other fields pass through as-is
}

/**
 * All table names that this script knows how to restore.
 * Exported so tests can assert exhaustive coverage against the ADR-0008 inventory.
 */
export const SUPPORTED_TABLES = [
  'users',
  'hives',
  'persons',
  'events',
  'hive_groups',
  'lists',
  'list_fields',
  'list_views',
  'list_item_values',
  'invitations',
] as const;

export type SupportedTable = (typeof SUPPORTED_TABLES)[number];

// ── Per-table restore helpers ───────────────────────────────────────────────

async function restoreUser(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.user.update({
    where: { id: recordId },
    data: { [mapFieldName('users', fieldName)]: oldCiphertext },
  });
}

async function restoreHive(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  _fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.hive.update({ where: { id: recordId }, data: { name: oldCiphertext } });
}

async function restorePerson(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.person.update({
    where: { id: recordId },
    data: { [mapFieldName('persons', fieldName)]: oldCiphertext },
  });
}

async function restoreEvent(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.event.update({ where: { id: recordId }, data: { [fieldName]: oldCiphertext } });
}

async function restoreGroup(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.hiveGroup.update({ where: { id: recordId }, data: { [fieldName]: oldCiphertext } });
}

async function restoreList(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  _fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.list.update({ where: { id: recordId }, data: { name: oldCiphertext } });
}

async function restoreListField(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  _fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.listField.update({ where: { id: recordId }, data: { name: oldCiphertext } });
}

async function restoreListView(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  _fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.listView.update({ where: { id: recordId }, data: { name: oldCiphertext } });
}

async function restoreListItemValue(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  _fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.listItemValue.update({ where: { id: recordId }, data: { value: oldCiphertext } });
}

async function restoreInvitation(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  recordId: string,
  fieldName: string,
  oldCiphertext: string
): Promise<void> {
  await tx.invitation.update({
    where: { id: recordId },
    data: { [mapFieldName('invitations', fieldName)]: oldCiphertext },
  });
}

/**
 * Dispatch a restore operation to the correct per-table helper.
 * Throws for unknown table names so any mismatch between ADR-0008 inventory
 * and the migrate script is caught at runtime (and in tests).
 * Exported for unit testing.
 */
export async function dispatchRestore(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  tableName: string,
  recordId: string,
  fieldName: string,
  oldCiphertext: string
): Promise<void> {
  switch (tableName) {
    case 'users':
      await restoreUser(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'hives':
      await restoreHive(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'persons':
      await restorePerson(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'events':
      await restoreEvent(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'hive_groups':
      await restoreGroup(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'lists':
      await restoreList(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'list_fields':
      await restoreListField(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'list_views':
      await restoreListView(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'list_item_values':
      await restoreListItemValue(tx, recordId, fieldName, oldCiphertext);
      break;
    case 'invitations':
      await restoreInvitation(tx, recordId, fieldName, oldCiphertext);
      break;
    default:
      throw new Error(`Unknown table in backup row: "${tableName}"`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Grant this CLI session access to the ops-only backup table (RLS gate).
  await prisma.$executeRawUnsafe(`SET app.reencrypt_session = 'true'`);

  const toVersion = TO_VERSION_OVERRIDE ?? 1; // default: roll back to V1

  console.log();
  console.log('⏪ Key Rotation Rollback');
  console.log(`   Restoring to version: V${toVersion}`);
  console.log(`   Mode: ${EXECUTE ? '⚡ EXECUTE (writing changes)' : '🔍 DRY RUN (no writes)'}`);
  console.log();

  if (!EXECUTE) {
    console.log('ℹ️  Pass --execute to apply changes.\n');
  }

  // Load all unexpired backup rows for the target version
  const backups = await prisma.reencryptBackup.findMany({
    where: {
      toVersion: { gt: toVersion }, // these are backups OF values migrated AWAY from toVersion
      expiresAt: { gt: new Date() },
    },
    orderBy: [{ tableName: 'asc' }, { recordId: 'asc' }],
  });

  if (backups.length === 0) {
    console.log('✅ No unexpired backup rows found — nothing to roll back.');
    console.log('   (Backup rows may have expired. Check REENCRYPT_BACKUP_RETENTION_DAYS.)');
    return;
  }

  console.log(`Found ${backups.length} backup row(s) to restore.\n`);

  let restored = 0;
  let skipped = 0;
  let failed = 0;

  for (const backup of backups) {
    const { tableName, recordId, fieldName, oldCiphertext, fromVersion } = backup;

    // Skip rows where restoration target version doesn't match
    if (fromVersion !== toVersion) {
      skipped++;
      continue;
    }

    if (!EXECUTE) {
      console.log(
        `  [DRY RUN] ${tableName} / ${recordId} / ${fieldName}: restore v${backup.toVersion} → v${fromVersion}`
      );
      restored++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await dispatchRestore(tx, tableName, recordId, fieldName, oldCiphertext);
      });
      console.log(`  ✅ ${tableName} / ${recordId} / ${fieldName}`);
      restored++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ ${tableName} / ${recordId} / ${fieldName}: ${msg}`);
      failed++;
    }
  }

  console.log();
  console.log(`── Summary ─────────────────────────────────────────────────────────────`);
  console.log(`  Restored: ${restored}  Skipped: ${skipped}  Failed: ${failed}`);
  console.log();

  if (failed > 0) {
    console.error(`❌ ${failed} record(s) could not be restored — check errors above.`);
    throw new Error(`Rollback failed: ${failed} record(s) could not be restored.`);
  }

  if (EXECUTE && restored > 0) {
    console.log(`✅ Rollback complete. ${restored} record(s) restored to V${toVersion}.`);
    console.log();
    console.log('Next steps:');
    console.log(`  1. Remove ENCRYPTION_KEY_CURRENT and ENCRYPTION_KEY_V${toVersion + 1} from env`);
    console.log(
      `  2. Rename ENCRYPTION_KEY_V${toVersion} → ENCRYPTION_KEY (back to single-key mode)`
    );
    console.log('  3. Restart the application');
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
