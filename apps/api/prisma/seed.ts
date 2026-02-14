/**
 * Dev-only seed script — creates a "Doe Family" hive with 3 test users.
 *
 * Run:  pnpm --filter @qoomb/api db:seed
 *
 * Test accounts (password: Dev1234!):
 *   john@doe.dev   — parent + sysadmin
 *   anna@doe.dev   — parent
 *   tim@doe.dev    — child
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
const PERSON_JOHN_ID = '20000000-0000-0000-0000-000000000001';
const PERSON_ANNA_ID = '20000000-0000-0000-0000-000000000002';
const PERSON_TIM_ID = '20000000-0000-0000-0000-000000000003';

async function main() {
  console.log('🌱 Seeding dev database...\n');

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  // ── Hive ────────────────────────────────────────────────────────────────────

  const hive = await prisma.hive.upsert({
    where: { id: HIVE_ID },
    update: {},
    create: { id: HIVE_ID, name: 'Doe Family', type: 'family' },
  });

  // ── Users ───────────────────────────────────────────────────────────────────

  const john = await prisma.user.upsert({
    where: { email: 'john@doe.dev' },
    update: {},
    create: {
      email: 'john@doe.dev',
      passwordHash,
      fullName: 'John Doe',
      emailVerified: true,
      isSystemAdmin: true,
    },
  });

  const anna = await prisma.user.upsert({
    where: { email: 'anna@doe.dev' },
    update: {},
    create: {
      email: 'anna@doe.dev',
      passwordHash,
      fullName: 'Anna Doe',
      emailVerified: true,
      isSystemAdmin: false,
    },
  });

  const tim = await prisma.user.upsert({
    where: { email: 'tim@doe.dev' },
    update: {},
    create: {
      email: 'tim@doe.dev',
      passwordHash,
      fullName: 'Tim Doe',
      emailVerified: true,
      isSystemAdmin: false,
    },
  });

  // ── Persons (DB superuser bypasses RLS in dev) ───────────────────────────────

  const johnPerson = await prisma.person.upsert({
    where: { id: PERSON_JOHN_ID },
    update: {},
    create: {
      id: PERSON_JOHN_ID,
      hiveId: hive.id,
      userId: john.id,
      role: 'parent',
      displayName: 'John',
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
