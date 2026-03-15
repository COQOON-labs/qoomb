/* eslint-disable no-console */
/**
 * Re-Encryption Backup Cleanup Script
 *
 * Deletes expired rows from `reencrypt_backups` (where expires_at < now).
 * Run this after confirming the key rotation was successful and the app is
 * stable — typically after REENCRYPT_BACKUP_RETENTION_DAYS (default: 30).
 *
 * Run:  pnpm --filter @qoomb/api db:reencrypt-cleanup            (dry run — counts only)
 *       pnpm --filter @qoomb/api db:reencrypt-cleanup --execute   (delete expired rows)
 *
 * The backup table is indexed on expires_at — cleanup is an O(expired rows) operation.
 *
 * ⚠️  Only run cleanup after:
 *   1. Re-encryption script completed successfully
 *   2. Old key (V_from) has been removed from env
 *   3. App has been running stably on the new key for >= retention period
 */

// Must be imported before any NestJS decorators are evaluated
import 'reflect-metadata';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const EXECUTE = process.argv.includes('--execute');

async function main() {
  // Grant this CLI session access to the ops-only backup table (RLS gate).
  await prisma.$executeRawUnsafe(`SET app.reencrypt_session = 'true'`);

  // Safety interlock: refuse cleanup if key rotation is still active
  // AND unexpired backup rows still exist (see ADR-0008 §4).
  if (process.env['ENCRYPTION_KEY_CURRENT']) {
    const nonExpiredCount = await prisma.reencryptBackup.count({
      where: { expiresAt: { gt: new Date() } },
    });
    if (nonExpiredCount > 0) {
      console.error(`\n⚠️  Cleanup refused: key rotation is still active.`);
      console.error(
        `   ENCRYPTION_KEY_CURRENT is set AND ${nonExpiredCount} non-expired backup row(s) exist.`
      );
      console.error(`   Complete the rotation process first:`);
      console.error(`     1. Run db:reencrypt --execute (if not done yet)`);
      console.error(`     2. Restart the app on the new key only`);
      console.error(`     3. Remove ENCRYPTION_KEY_CURRENT + ENCRYPTION_KEY_V<old> from env`);
      console.error(`     4. Then run db:reencrypt-cleanup again.\n`);
      throw new Error('Cleanup refused — key rotation still active');
    }
  }

  console.log();
  console.log('🧹 Re-Encryption Backup Cleanup');
  console.log(`   Mode: ${EXECUTE ? '⚡ EXECUTE (deleting rows)' : '🔍 DRY RUN (counting only)'}`);
  console.log();

  const now = new Date();

  const count = await prisma.reencryptBackup.count({
    where: { expiresAt: { lte: now } },
  });

  const total = await prisma.reencryptBackup.count();

  console.log(`  Expired rows:     ${count}`);
  console.log(`  Non-expired rows: ${total - count}  (these are NOT deleted)`);
  console.log();

  if (count === 0) {
    console.log('✅ No expired backup rows to clean up.');
    return;
  }

  if (!EXECUTE) {
    console.log(`ℹ️  Dry run: ${count} expired row(s) would be deleted. Pass --execute to apply.`);
    return;
  }

  const result = await prisma.reencryptBackup.deleteMany({
    where: { expiresAt: { lte: now } },
  });

  console.log(`✅ Deleted ${result.count} expired backup row(s).`);
  console.log(`   ${total - count} non-expired row(s) remain.`);
}

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
