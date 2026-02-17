/**
 * Key Rotation Re-Encryption Script
 *
 * Safely migrates all encrypted fields from one key version to the next.
 *
 * Run:  pnpm --filter @qoomb/api db:reencrypt            (dry run — no writes)
 *       pnpm --filter @qoomb/api db:reencrypt --execute   (apply changes)
 *
 * Required env vars (rotation mode):
 *   ENCRYPTION_KEY_CURRENT=2
 *   ENCRYPTION_KEY_V1=<old base64 key>   ← keep until this script completes
 *   ENCRYPTION_KEY_V2=<new base64 key>
 *
 * Full deployment sequence:
 *   1. openssl rand -base64 32            → generate new key
 *   2. Set ENCRYPTION_KEY_CURRENT=2, _V1=<old>, _V2=<new> in env
 *   3. pnpm --filter @qoomb/api db:reencrypt          (dry run — app still on V1)
 *   4. pnpm --filter @qoomb/api db:reencrypt --execute (migrate all data incl. emailHash)
 *   5. Restart app immediately (all data is at V2, app will use V2 HMAC for logins)
 *   6. Remove ENCRYPTION_KEY_V1 and ENCRYPTION_KEY_CURRENT from env
 *
 * ⚠️  Brief login disruption window (steps 4 → 5):
 *   After step 4 the DB contains V2 email_hash values, but the running app (still
 *   on V1) computes V1 HMAC hashes for login lookups — they will not match.
 *   Minimise this window by restarting the app immediately after step 4 completes.
 *
 * Note: Records written between steps 4 and 5 (while app is still on V1) will be at
 * V1. Run the script once more after restart if zero residual V1 records are required.
 *
 * Safety guarantees:
 *   - Verify-before-commit: decrypts new ciphertext to confirm it matches
 *     original before writing to DB (transaction is rolled back on mismatch)
 *   - Resumable: fields already at the target version are skipped
 *   - Atomic per-record: each record is its own transaction
 *   - Dry run by default: pass --execute to write changes
 */

// Must be imported before any NestJS decorators are evaluated
import 'reflect-metadata';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { EncryptionService } from '../../src/modules/encryption/encryption.service';

// ── Prisma setup ────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── CLI args ─────────────────────────────────────────────────────────────────

const EXECUTE = process.argv.includes('--execute');
const FROM_VERSION_ARG = process.argv.find((a) => a.startsWith('--from-version='));
const FROM_VERSION_OVERRIDE = FROM_VERSION_ARG
  ? parseInt(FROM_VERSION_ARG.split('=')[1], 10)
  : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ReencryptStats {
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
 */
function reencryptField(
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
    throw new Error(
      `Verification failed: decrypting new ciphertext produced "${verified}" but expected "${plaintext.slice(0, 20)}..."`
    );
  }

  return newCiphertext;
}

// ── Table migrations ──────────────────────────────────────────────────────────

async function migrateUsers(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: { startsWith: prefix } }, { fullName: { startsWith: prefix } }],
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

      if (newEmail === null && newFullName === null) {
        stats.skipped++;
        continue;
      }

      // Compute new emailHash from decrypted email (hash changes with master key)
      const decryptedEmail = newEmail
        ? enc.decryptForUser(newEmail, user.id)
        : enc.decryptForUser(user.email, user.id);
      const newEmailHash = enc.hashEmail(decryptedEmail);

      if (!EXECUTE) {
        console.log(
          `  [DRY RUN] user ${user.id}: email → v${enc.getCurrentKeyVersion()}, emailHash updated`
        );
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            ...(newEmail !== null && { email: newEmail, emailHash: newEmailHash }),
            ...(newFullName !== null && { fullName: newFullName }),
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

async function migrateTasks(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;

  const tasks = await prisma.task.findMany({
    where: {
      OR: [{ title: { startsWith: prefix } }, { description: { startsWith: prefix } }],
    },
  });

  for (const task of tasks) {
    try {
      const decT = (s: string) => enc.decrypt(enc.parseFromStorage(s), task.hiveId);
      const encT = (s: string) => enc.serializeToStorage(enc.encrypt(s, task.hiveId));

      const newTitle = reencryptField(task.title, fromVersion, decT, encT);
      const newDescription = reencryptField(task.description, fromVersion, decT, encT);

      if (newTitle === null && newDescription === null) {
        stats.skipped++;
        continue;
      }

      if (!EXECUTE) {
        console.log(`  [DRY RUN] task ${task.id}: fields → v${enc.getCurrentKeyVersion()}`);
        stats.migrated++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: task.id },
          data: {
            ...(newTitle !== null && { title: newTitle }),
            ...(newDescription !== null && { description: newDescription }),
          },
        });
      });

      stats.migrated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ task ${task.id}: ${msg}`);
      stats.failed++;
    }
  }

  return stats;
}

async function migrateGroups(enc: EncryptionService, fromVersion: number): Promise<ReencryptStats> {
  const stats: ReencryptStats = { migrated: 0, skipped: 0, failed: 0 };
  const prefix = `v${fromVersion}:`;

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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
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

  console.log('── tasks ───────────────────────────────────────────────────');
  results.tasks = await migrateTasks(enc, fromVersion);

  console.log('── groups ──────────────────────────────────────────────────');
  results.groups = await migrateGroups(enc, fromVersion);

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
    process.exit(1);
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
