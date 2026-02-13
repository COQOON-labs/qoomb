/**
 * Dev-only seed script — creates a "Miller Family" hive with 3 test users.
 *
 * Run:  pnpm --filter @qoomb/api db:seed
 *
 * Test accounts (password: Dev1234!):
 *   ben@miller.dev   — parent + sysadmin
 *   anna@miller.dev  — parent
 *   tim@miller.dev   — child
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEV_PASSWORD = 'Dev1234!';
const SALT_ROUNDS = 10;

// Fixed UUIDs → idempotent re-runs
const HIVE_ID = '10000000-0000-0000-0000-000000000001';
const PERSON_BEN_ID = '20000000-0000-0000-0000-000000000001';
const PERSON_ANNA_ID = '20000000-0000-0000-0000-000000000002';
const PERSON_TIM_ID = '20000000-0000-0000-0000-000000000003';

async function main() {
  console.log('🌱 Seeding dev database...\n');

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  // ── Hive ────────────────────────────────────────────────────────────────────

  const hive = await prisma.hive.upsert({
    where: { id: HIVE_ID },
    update: {},
    create: { id: HIVE_ID, name: 'Miller Family', type: 'family' },
  });

  // ── Users ───────────────────────────────────────────────────────────────────

  const ben = await prisma.user.upsert({
    where: { email: 'ben@miller.dev' },
    update: {},
    create: {
      email: 'ben@miller.dev',
      passwordHash,
      fullName: 'Ben Miller',
      emailVerified: true,
      isSystemAdmin: true,
    },
  });

  const anna = await prisma.user.upsert({
    where: { email: 'anna@miller.dev' },
    update: {},
    create: {
      email: 'anna@miller.dev',
      passwordHash,
      fullName: 'Anna Miller',
      emailVerified: true,
      isSystemAdmin: false,
    },
  });

  const tim = await prisma.user.upsert({
    where: { email: 'tim@miller.dev' },
    update: {},
    create: {
      email: 'tim@miller.dev',
      passwordHash,
      fullName: 'Tim Miller',
      emailVerified: true,
      isSystemAdmin: false,
    },
  });

  // ── Persons (DB superuser bypasses RLS in dev) ───────────────────────────────

  const benPerson = await prisma.person.upsert({
    where: { id: PERSON_BEN_ID },
    update: {},
    create: {
      id: PERSON_BEN_ID,
      hiveId: hive.id,
      userId: ben.id,
      role: 'parent',
      displayName: 'Ben',
    },
  });

  const annaPerson = await prisma.person.upsert({
    where: { id: PERSON_ANNA_ID },
    update: {},
    create: {
      id: PERSON_ANNA_ID,
      hiveId: hive.id,
      userId: anna.id,
      role: 'parent',
      displayName: 'Anna',
    },
  });

  const timPerson = await prisma.person.upsert({
    where: { id: PERSON_TIM_ID },
    update: {},
    create: {
      id: PERSON_TIM_ID,
      hiveId: hive.id,
      userId: tim.id,
      role: 'child',
      displayName: 'Tim',
    },
  });

  // ── Memberships ─────────────────────────────────────────────────────────────

  await prisma.userHiveMembership.upsert({
    where: { userId_hiveId: { userId: ben.id, hiveId: hive.id } },
    update: {},
    create: { userId: ben.id, hiveId: hive.id, personId: benPerson.id, isPrimary: true },
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
  console.log('  Hive:     Miller Family (family)');
  console.log('  Password: Dev1234!\n');
  console.log('  ben@miller.dev   → parent + sysadmin');
  console.log('  anna@miller.dev  → parent');
  console.log('  tim@miller.dev   → child');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
