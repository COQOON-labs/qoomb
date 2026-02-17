/**
 * Dev-only seed script — creates a "Doe Family" hive with 3 test users.
 *
 * Run:  pnpm --filter @qoomb/api db:seed
 *
 * Test accounts (password: Dev1234!):
 *   john@doe.dev   — parent + sysadmin
 *   anna@doe.dev   — parent
 *   tim@doe.dev    — child
 *
 * All sensitive person fields (displayName, avatarUrl, birthdate) are encrypted
 * via EncryptionService using the same per-hive AES-256-GCM keys as the app.
 * Requires KEY_PROVIDER + ENCRYPTION_KEY to be set in .env.
 */

// Must be imported before any NestJS decorators are evaluated
import 'reflect-metadata';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';

import { EncryptionService } from '../src/modules/encryption/encryption.service';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = 'Dev1234!';
const SALT_ROUNDS = 10;

// Fixed UUIDs → idempotent re-runs
const HIVE_ID = '10000000-0000-0000-0000-000000000001';
const USER_JOHN_ID = '30000000-0000-0000-0000-000000000001';
const USER_ANNA_ID = '30000000-0000-0000-0000-000000000002';
const USER_TIM_ID = '30000000-0000-0000-0000-000000000003';
const PERSON_JOHN_ID = '20000000-0000-0000-0000-000000000001';
const PERSON_ANNA_ID = '20000000-0000-0000-0000-000000000002';
const PERSON_TIM_ID = '20000000-0000-0000-0000-000000000003';

async function main() {
  console.log('🌱 Seeding dev database...\n');

  // ── Encryption ──────────────────────────────────────────────────────────────

  const enc = new EncryptionService();
  await enc.onModuleInit();

  // Encrypt a hive-scoped field (displayName, hive name, etc.)
  const encStr = (value: string, hiveId: string = HIVE_ID) =>
    enc.serializeToStorage(enc.encrypt(value, hiveId));

  // Encrypt a user-scoped field (email, fullName)
  const encUser = (value: string, userId: string) => enc.encryptForUser(value, userId);

  // ── Password hash ────────────────────────────────────────────────────────────

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  // ── Hive ────────────────────────────────────────────────────────────────────

  const hive = await prisma.hive.upsert({
    where: { id: HIVE_ID },
    update: { name: encStr('Doe Family') },
    create: { id: HIVE_ID, name: encStr('Doe Family'), type: 'family' },
  });

  // ── Users ───────────────────────────────────────────────────────────────────

  const john = await prisma.user.upsert({
    where: { id: USER_JOHN_ID },
    update: {
      email: encUser('john@doe.dev', USER_JOHN_ID),
      emailHash: enc.hashEmail('john@doe.dev'),
      fullName: encUser('John Doe', USER_JOHN_ID),
    },
    create: {
      id: USER_JOHN_ID,
      email: encUser('john@doe.dev', USER_JOHN_ID),
      emailHash: enc.hashEmail('john@doe.dev'),
      passwordHash,
      fullName: encUser('John Doe', USER_JOHN_ID),
      emailVerified: true,
      isSystemAdmin: true,
    },
  });

  const anna = await prisma.user.upsert({
    where: { id: USER_ANNA_ID },
    update: {
      email: encUser('anna@doe.dev', USER_ANNA_ID),
      emailHash: enc.hashEmail('anna@doe.dev'),
      fullName: encUser('Anna Doe', USER_ANNA_ID),
    },
    create: {
      id: USER_ANNA_ID,
      email: encUser('anna@doe.dev', USER_ANNA_ID),
      emailHash: enc.hashEmail('anna@doe.dev'),
      passwordHash,
      fullName: encUser('Anna Doe', USER_ANNA_ID),
      emailVerified: true,
      isSystemAdmin: false,
    },
  });

  const tim = await prisma.user.upsert({
    where: { id: USER_TIM_ID },
    update: {
      email: encUser('tim@doe.dev', USER_TIM_ID),
      emailHash: enc.hashEmail('tim@doe.dev'),
      fullName: encUser('Tim Doe', USER_TIM_ID),
    },
    create: {
      id: USER_TIM_ID,
      email: encUser('tim@doe.dev', USER_TIM_ID),
      emailHash: enc.hashEmail('tim@doe.dev'),
      passwordHash,
      fullName: encUser('Tim Doe', USER_TIM_ID),
      emailVerified: true,
      isSystemAdmin: false,
    },
  });

  // ── Persons (DB superuser bypasses RLS in dev) ───────────────────────────────
  // displayName is encrypted using the same per-hive key as the app.

  const johnPerson = await prisma.person.upsert({
    where: { id: PERSON_JOHN_ID },
    update: { displayName: encStr('John') },
    create: {
      id: PERSON_JOHN_ID,
      hiveId: hive.id,
      userId: john.id,
      role: 'parent',
      displayName: encStr('John'),
    },
  });

  const annaPerson = await prisma.person.upsert({
    where: { id: PERSON_ANNA_ID },
    update: { displayName: encStr('Anna') },
    create: {
      id: PERSON_ANNA_ID,
      hiveId: hive.id,
      userId: anna.id,
      role: 'parent',
      displayName: encStr('Anna'),
    },
  });

  const timPerson = await prisma.person.upsert({
    where: { id: PERSON_TIM_ID },
    update: { displayName: encStr('Tim') },
    create: {
      id: PERSON_TIM_ID,
      hiveId: hive.id,
      userId: tim.id,
      role: 'child',
      displayName: encStr('Tim'),
    },
  });

  // ── Memberships ─────────────────────────────────────────────────────────────

  await prisma.userHiveMembership.upsert({
    where: { userId_hiveId: { userId: john.id, hiveId: hive.id } },
    update: {},
    create: { userId: john.id, hiveId: hive.id, personId: johnPerson.id, isPrimary: true },
  });

  await prisma.userHiveMembership.upsert({
    where: { userId_hiveId: { userId: anna.id, hiveId: hive.id } },
    update: {},
    create: { userId: anna.id, hiveId: hive.id, personId: annaPerson.id, isPrimary: true },
  });

  await prisma.userHiveMembership.upsert({
    where: { userId_hiveId: { userId: tim.id, hiveId: hive.id } },
    update: {},
    create: { userId: tim.id, hiveId: hive.id, personId: timPerson.id, isPrimary: true },
  });

  // ── Done ────────────────────────────────────────────────────────────────────

  console.log('✅ Done!\n');
  console.log('  Hive:     Doe Family (family)');
  console.log('  Password: Dev1234!\n');
  console.log('  john@doe.dev   → parent + sysadmin');
  console.log('  anna@doe.dev   → parent');
  console.log('  tim@doe.dev    → child');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
