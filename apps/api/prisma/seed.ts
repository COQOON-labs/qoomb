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
// ── System templates ─────────────────────────────────────────────────────────
//
// Global templates (hiveId=null, creatorId=null, isTemplate=true).
// Names and field names are stored as plaintext — templates contain no PII.
// Each template is identified by a stable systemKey so re-running the seed
// never creates duplicates.

interface TemplateField {
  name: string;
  fieldType: string;
  config?: Record<string, unknown>;
  isTitle?: boolean;
  isRequired?: boolean;
  sortOrder: number;
}

interface TemplateView {
  name: string;
  viewType: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
  sortOrder: number;
}

interface TemplateSpec {
  systemKey: string;
  name: string;
  icon: string;
  fields: TemplateField[];
  views: TemplateView[];
}

const SYSTEM_TEMPLATES: TemplateSpec[] = [
  {
    systemKey: 'task-list',
    name: 'Aufgabenliste',
    icon: '✅',
    fields: [
      { name: 'Titel', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      {
        name: 'Status',
        fieldType: 'select',
        config: { options: ['Offen', 'In Bearbeitung', 'Erledigt'] },
        sortOrder: 1,
      },
      {
        name: 'Priorität',
        fieldType: 'select',
        config: { options: ['Hoch', 'Mittel', 'Niedrig'] },
        sortOrder: 2,
      },
      { name: 'Fällig am', fieldType: 'date', sortOrder: 3 },
      { name: 'Zugewiesen', fieldType: 'person', sortOrder: 4 },
    ],
    views: [
      { name: 'Checkliste', viewType: 'checklist', isDefault: true, sortOrder: 0 },
      { name: 'Tabelle', viewType: 'table', isDefault: false, sortOrder: 1 },
    ],
  },
  {
    systemKey: 'shopping-list',
    name: 'Einkaufsliste',
    icon: '🛒',
    fields: [
      { name: 'Artikel', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Menge', fieldType: 'text', sortOrder: 1 },
      {
        name: 'Kategorie',
        fieldType: 'select',
        config: {
          options: [
            'Obst & Gemüse',
            'Milch & Käse',
            'Fleisch & Fisch',
            'Backwaren',
            'Getränke',
            'Tiefkühl',
            'Sonstiges',
          ],
        },
        sortOrder: 2,
      },
      { name: 'Erledigt', fieldType: 'checkbox', sortOrder: 3 },
    ],
    views: [{ name: 'Checkliste', viewType: 'checklist', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'project',
    name: 'Projekt',
    icon: '📋',
    fields: [
      { name: 'Titel', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      {
        name: 'Status',
        fieldType: 'select',
        config: { options: ['Todo', 'In Bearbeitung', 'Erledigt', 'Blockiert'] },
        sortOrder: 1,
      },
      {
        name: 'Priorität',
        fieldType: 'select',
        config: { options: ['Hoch', 'Mittel', 'Niedrig'] },
        sortOrder: 2,
      },
      { name: 'Zugewiesen', fieldType: 'person', sortOrder: 3 },
      { name: 'Fällig am', fieldType: 'date', sortOrder: 4 },
    ],
    views: [
      { name: 'Tabelle', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checkliste', viewType: 'checklist', isDefault: false, sortOrder: 1 },
    ],
  },
  {
    systemKey: 'packing-list',
    name: 'Packliste',
    icon: '🧳',
    fields: [
      { name: 'Gegenstand', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      {
        name: 'Kategorie',
        fieldType: 'select',
        config: { options: ['Kleidung', 'Elektronik', 'Hygiene', 'Dokumente', 'Sonstiges'] },
        sortOrder: 1,
      },
      { name: 'Eingepackt', fieldType: 'checkbox', sortOrder: 2 },
    ],
    views: [{ name: 'Checkliste', viewType: 'checklist', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'reading-list',
    name: 'Leseliste',
    icon: '📚',
    fields: [
      { name: 'Titel', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Autor', fieldType: 'text', sortOrder: 1 },
      {
        name: 'Typ',
        fieldType: 'select',
        config: { options: ['Buch', 'Artikel', 'Film', 'Podcast'] },
        sortOrder: 2,
      },
      {
        name: 'Status',
        fieldType: 'select',
        config: { options: ['Will lesen', 'Lese gerade', 'Gelesen'] },
        sortOrder: 3,
      },
      {
        name: 'Bewertung',
        fieldType: 'select',
        config: { options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'] },
        sortOrder: 4,
      },
    ],
    views: [{ name: 'Tabelle', viewType: 'table', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'wish-list',
    name: 'Wunschliste',
    icon: '🎁',
    fields: [
      { name: 'Gegenstand', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Für wen', fieldType: 'text', sortOrder: 1 },
      { name: 'Link', fieldType: 'url', sortOrder: 2 },
      { name: 'Preis', fieldType: 'number', config: { unit: '€' }, sortOrder: 3 },
      { name: 'Gekauft', fieldType: 'checkbox', sortOrder: 4 },
    ],
    views: [
      { name: 'Tabelle', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checkliste', viewType: 'checklist', isDefault: false, sortOrder: 1 },
    ],
  },
  {
    systemKey: 'habit-tracker',
    name: 'Habit-Tracker',
    icon: '🏃',
    fields: [
      { name: 'Gewohnheit', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Erledigt', fieldType: 'checkbox', sortOrder: 1 },
      { name: 'Notiz', fieldType: 'text', sortOrder: 2 },
    ],
    views: [{ name: 'Checkliste', viewType: 'checklist', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'collection',
    name: 'Sammlung',
    icon: '📦',
    fields: [
      { name: 'Titel', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Notiz', fieldType: 'text', sortOrder: 1 },
    ],
    views: [
      { name: 'Tabelle', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checkliste', viewType: 'checklist', isDefault: false, sortOrder: 1 },
    ],
  },
];

async function seedSystemTemplates() {
  console.log('🗂️  Seeding system templates...\n');
  let created = 0;
  let skipped = 0;

  for (const spec of SYSTEM_TEMPLATES) {
    const existing = await prisma.list.findFirst({
      where: { systemKey: spec.systemKey, isTemplate: true, hiveId: null },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.list.create({
      data: {
        hiveId: null,
        creatorId: null,
        name: spec.name,
        icon: spec.icon,
        type: 'custom',
        systemKey: spec.systemKey,
        isTemplate: true,
        visibility: 'hive',
        sortOrder: SYSTEM_TEMPLATES.indexOf(spec),
        fields: {
          create: spec.fields.map((f) => ({
            name: f.name,
            fieldType: f.fieldType,
            config: (f.config ?? {}) as object,
            isTitle: f.isTitle ?? false,
            isRequired: f.isRequired ?? false,
            sortOrder: f.sortOrder,
          })),
        },
        views: {
          create: spec.views.map((v) => ({
            name: v.name,
            viewType: v.viewType,
            config: (v.config ?? {}) as object,
            isDefault: v.isDefault ?? false,
          })),
        },
      },
    });
    created++;
    console.log(`  ✓ ${spec.icon} ${spec.name}`);
  }

  console.log(`\n  Created: ${created}, Skipped (already exist): ${skipped}\n`);
}
main()
  .then(() => seedSystemTemplates())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
