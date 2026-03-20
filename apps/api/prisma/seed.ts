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
// NOTE: Must be RFC 4122-compliant (version byte [1-8], variant byte [89ab])
// so that Zod v4's z.uuid() accepts them as tRPC input parameters.
// Format: XXXXXXXX-0000-4000-8000-XXXXXXXXXXXX (version 4, variant 1)
const HIVE_ID = '10000000-0000-4000-8000-000000000001';
const USER_JOHN_ID = '30000000-0000-4000-8000-000000000001';
const USER_ANNA_ID = '30000000-0000-4000-8000-000000000002';
const USER_TIM_ID = '30000000-0000-4000-8000-000000000003';
const PERSON_JOHN_ID = '20000000-0000-4000-8000-000000000001';
const PERSON_ANNA_ID = '20000000-0000-4000-8000-000000000002';
const PERSON_TIM_ID = '20000000-0000-4000-8000-000000000003';

// ── Example list / field fixed IDs (idempotent re-runs) ─────────────────────
const LIST_GROCERY_ID = '40000000-0000-4000-8000-000000000001';
const LIST_CHORES_ID = '40000000-0000-4000-8000-000000000002';
const LIST_PACKING_ID = '40000000-0000-4000-8000-000000000003';
const LIST_XMAS_ID = '40000000-0000-4000-8000-000000000004';
// Grocery list fields
const FG_ITEM = '50000000-0000-4000-8000-000000000001';
const FG_QTY = '50000000-0000-4000-8000-000000000002';
const FG_CAT = '50000000-0000-4000-8000-000000000003';
const FG_DONE = '50000000-0000-4000-8000-000000000004';
// Chores list fields
const FC_TASK = '50000000-0000-4000-8000-000000000011';
const FC_PERSON = '50000000-0000-4000-8000-000000000012';
const FC_STATUS = '50000000-0000-4000-8000-000000000013';
const FC_DUE = '50000000-0000-4000-8000-000000000014';
// Packing list fields
const FP_ITEM = '50000000-0000-4000-8000-000000000021';
const FP_CAT = '50000000-0000-4000-8000-000000000022';
const FP_PACKED = '50000000-0000-4000-8000-000000000023';
// Christmas wish list fields
const FX_ITEM = '50000000-0000-4000-8000-000000000031';
const FX_FOR = '50000000-0000-4000-8000-000000000032';
const FX_PRICE = '50000000-0000-4000-8000-000000000033';
const FX_BOUGHT = '50000000-0000-4000-8000-000000000034';

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
  await seedSystemTemplates();
  await seedExampleLists(enc);
}

// ── Example lists ─────────────────────────────────────────────────────────────

async function seedExampleLists(enc: EncryptionService) {
  console.log('📋 Seeding example lists...\n');
  const e = (val: string) => enc.serializeToStorage(enc.encrypt(val, HIVE_ID));

  async function seedList(
    listId: string,
    creatorId: string,
    name: string,
    icon: string,
    listSortOrder: number,
    fields: Array<{
      id: string;
      name: string;
      type: string;
      config?: Record<string, unknown>;
      isTitle?: boolean;
      isRequired?: boolean;
      sortOrder: number;
    }>,
    views: Array<{ name: string; viewType: string; isDefault: boolean; sortOrder: number }>,
    items: Array<Record<string, string>>
  ) {
    const exists = await prisma.list.findUnique({ where: { id: listId } });
    if (exists) {
      console.log(`  - ${icon} ${name} (already exists)`);
      return;
    }

    await prisma.list.create({
      data: {
        id: listId,
        hiveId: HIVE_ID,
        creatorId,
        name: e(name),
        icon,
        type: 'custom',
        visibility: 'hive',
        sortOrder: listSortOrder,
        fields: {
          create: fields.map((f) => ({
            id: f.id,
            name: e(f.name),
            fieldType: f.type,
            config: (f.config ?? {}) as object,
            isTitle: f.isTitle ?? false,
            isRequired: f.isRequired ?? false,
            sortOrder: f.sortOrder,
          })),
        },
        views: {
          create: views.map((v) => ({
            name: e(v.name),
            viewType: v.viewType,
            config: {} as object,
            isDefault: v.isDefault,
          })),
        },
      },
    });

    const fieldIdByName = new Map(fields.map((f) => [f.name, f.id]));
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const values = Object.entries(row)
        .filter(([, v]) => v !== '')
        .map(([fname, val]) => {
          const fieldId = fieldIdByName.get(fname);
          if (!fieldId) throw new Error(`Seed: unknown field "${fname}" in list "${name}"`);
          return { fieldId, value: e(val) };
        });
      await prisma.listItem.create({
        data: {
          listId,
          hiveId: HIVE_ID,
          creatorId,
          sortOrder: i,
          values: { create: values },
        },
      });
    }
    console.log(`  ✓ ${icon} ${name} (${items.length} items)`);
  }

  // ── 1. Weekly Groceries ───────────────────────────────────────────────────
  await seedList(
    LIST_GROCERY_ID,
    PERSON_ANNA_ID,
    'Weekly Groceries',
    '🛒',
    0,
    [
      { id: FG_ITEM, name: 'Item', type: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { id: FG_QTY, name: 'Quantity', type: 'text', sortOrder: 1 },
      {
        id: FG_CAT,
        name: 'Category',
        type: 'select',
        sortOrder: 2,
        config: {
          options: ['Fruit & Veg', 'Dairy', 'Meat & Fish', 'Bakery', 'Drinks', 'Frozen', 'Other'],
        },
      },
      { id: FG_DONE, name: 'Done', type: 'checkbox', sortOrder: 3 },
    ],
    [
      { name: 'Checklist', viewType: 'checklist', isDefault: true, sortOrder: 0 },
      { name: 'Table', viewType: 'table', isDefault: false, sortOrder: 1 },
    ],
    [
      { Item: 'Whole wheat bread', Quantity: '1 loaf', Category: 'Bakery', Done: 'true' },
      { Item: 'Milk', Quantity: '2 l', Category: 'Dairy', Done: 'true' },
      { Item: 'Apples', Quantity: '1 kg', Category: 'Fruit & Veg', Done: 'false' },
      { Item: 'Chicken breast', Quantity: '500 g', Category: 'Meat & Fish', Done: 'false' },
      { Item: 'Mozzarella', Quantity: '125 g', Category: 'Dairy', Done: 'false' },
      { Item: 'Cherry tomatoes', Quantity: '250 g', Category: 'Fruit & Veg', Done: 'false' },
      { Item: 'Orange juice', Quantity: '1.5 l', Category: 'Drinks', Done: 'false' },
      { Item: 'Pasta', Quantity: '500 g', Category: 'Other', Done: 'false' },
      { Item: 'Sparkling water', Quantity: '6-pack', Category: 'Drinks', Done: 'false' },
    ]
  );

  // ── 2. Family Chores ──────────────────────────────────────────────────────
  await seedList(
    LIST_CHORES_ID,
    PERSON_JOHN_ID,
    'Family Chores',
    '🧹',
    1,
    [
      { id: FC_TASK, name: 'Task', type: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { id: FC_PERSON, name: 'Assigned To', type: 'person', sortOrder: 1 },
      {
        id: FC_STATUS,
        name: 'Status',
        type: 'select',
        sortOrder: 2,
        config: { options: ['Open', 'In Progress', 'Done'] },
      },
      { id: FC_DUE, name: 'Due Date', type: 'date', sortOrder: 3 },
    ],
    [
      { name: 'Table', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checklist', viewType: 'checklist', isDefault: false, sortOrder: 1 },
    ],
    [
      {
        Task: 'Clean kitchen',
        'Assigned To': PERSON_ANNA_ID,
        Status: 'Open',
        'Due Date': '2026-03-22',
      },
      {
        Task: 'Vacuum living room',
        'Assigned To': PERSON_TIM_ID,
        Status: 'Open',
        'Due Date': '2026-03-21',
      },
      {
        Task: 'Pay electricity bill',
        'Assigned To': PERSON_JOHN_ID,
        Status: 'Done',
        'Due Date': '2026-03-20',
      },
      {
        Task: 'Birthday present for Grandma',
        'Assigned To': PERSON_JOHN_ID,
        Status: 'In Progress',
        'Due Date': '2026-03-28',
      },
      {
        Task: 'Sort recycling',
        'Assigned To': PERSON_TIM_ID,
        Status: 'Open',
        'Due Date': '2026-03-21',
      },
      {
        Task: 'Book dentist appointment',
        'Assigned To': PERSON_ANNA_ID,
        Status: 'Open',
        'Due Date': '2026-04-02',
      },
      {
        Task: 'Repair garden fence',
        'Assigned To': PERSON_JOHN_ID,
        Status: 'Open',
        'Due Date': '2026-04-05',
      },
    ]
  );

  // ── 3. Italy Trip — Packing ───────────────────────────────────────────────
  await seedList(
    LIST_PACKING_ID,
    PERSON_JOHN_ID,
    'Italy Trip — Packing',
    '✈️',
    2,
    [
      { id: FP_ITEM, name: 'Item', type: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      {
        id: FP_CAT,
        name: 'Category',
        type: 'select',
        sortOrder: 1,
        config: { options: ['Clothing', 'Electronics', 'Toiletries', 'Documents', 'Other'] },
      },
      { id: FP_PACKED, name: 'Packed', type: 'checkbox', sortOrder: 2 },
    ],
    [{ name: 'Checklist', viewType: 'checklist', isDefault: true, sortOrder: 0 }],
    [
      { Item: 'Passports', Category: 'Documents', Packed: 'true' },
      { Item: 'Travel insurance docs', Category: 'Documents', Packed: 'false' },
      { Item: 'Phone chargers', Category: 'Electronics', Packed: 'true' },
      { Item: 'Portable power bank', Category: 'Electronics', Packed: 'false' },
      { Item: 'Sunscreen SPF 50', Category: 'Toiletries', Packed: 'false' },
      { Item: 'T-shirts × 5', Category: 'Clothing', Packed: 'false' },
      { Item: 'Shorts × 3', Category: 'Clothing', Packed: 'false' },
      { Item: 'Swimwear', Category: 'Clothing', Packed: 'false' },
      { Item: 'Beach towels', Category: 'Clothing', Packed: 'false' },
      { Item: 'Sunglasses', Category: 'Other', Packed: 'true' },
      { Item: 'Camera', Category: 'Electronics', Packed: 'false' },
      { Item: 'Travel adapter', Category: 'Electronics', Packed: 'false' },
    ]
  );

  // ── 4. Christmas Wish List ────────────────────────────────────────────────
  await seedList(
    LIST_XMAS_ID,
    PERSON_ANNA_ID,
    'Christmas Wish List',
    '🎄',
    3,
    [
      { id: FX_ITEM, name: 'Item', type: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { id: FX_FOR, name: 'For', type: 'text', sortOrder: 1 },
      { id: FX_PRICE, name: 'Price', type: 'number', sortOrder: 2 },
      { id: FX_BOUGHT, name: 'Bought', type: 'checkbox', sortOrder: 3 },
    ],
    [
      { name: 'Table', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checklist', viewType: 'checklist', isDefault: false, sortOrder: 1 },
    ],
    [
      { Item: 'LEGO Technic 4×4 Off-Roader', For: 'Tim', Price: '89.99', Bought: 'false' },
      { Item: 'Nintendo Switch Sports', For: 'Tim', Price: '49.99', Bought: 'true' },
      { Item: 'KitchenAid Stand Mixer', For: 'Anna', Price: '449.00', Bought: 'false' },
      { Item: 'Running shoes', For: 'John', Price: '139.99', Bought: 'false' },
      { Item: 'Kindle Paperwhite', For: 'Anna', Price: '109.99', Bought: 'false' },
      { Item: 'Wireless headphones', For: 'John', Price: '199.00', Bought: 'false' },
      { Item: 'Telescope', For: 'Tim', Price: '79.99', Bought: 'false' },
      { Item: 'Ottolenghi Simple cookbook', For: 'Anna', Price: '29.99', Bought: 'true' },
    ]
  );

  console.log('');
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
    name: 'Task List',
    icon: '✅',
    fields: [
      { name: 'Title', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      {
        name: 'Status',
        fieldType: 'select',
        config: { options: ['Open', 'In Progress', 'Done'] },
        sortOrder: 1,
      },
      {
        name: 'Priority',
        fieldType: 'select',
        config: { options: ['High', 'Medium', 'Low'] },
        sortOrder: 2,
      },
      { name: 'Due Date', fieldType: 'date', sortOrder: 3 },
      { name: 'Assigned To', fieldType: 'person', sortOrder: 4 },
    ],
    views: [
      { name: 'Checklist', viewType: 'checklist', isDefault: true, sortOrder: 0 },
      { name: 'Table', viewType: 'table', isDefault: false, sortOrder: 1 },
    ],
  },
  {
    systemKey: 'shopping-list',
    name: 'Shopping List',
    icon: '🛒',
    fields: [
      { name: 'Item', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Quantity', fieldType: 'text', sortOrder: 1 },
      {
        name: 'Category',
        fieldType: 'select',
        config: {
          options: [
            'Fruit & Veg',
            'Dairy & Cheese',
            'Meat & Fish',
            'Bakery',
            'Drinks',
            'Frozen',
            'Other',
          ],
        },
        sortOrder: 2,
      },
      { name: 'Done', fieldType: 'checkbox', sortOrder: 3 },
    ],
    views: [{ name: 'Checklist', viewType: 'checklist', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'project',
    name: 'Project',
    icon: '📋',
    fields: [
      { name: 'Title', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      {
        name: 'Status',
        fieldType: 'select',
        config: { options: ['Todo', 'In Progress', 'Done', 'Blocked'] },
        sortOrder: 1,
      },
      {
        name: 'Priority',
        fieldType: 'select',
        config: { options: ['High', 'Medium', 'Low'] },
        sortOrder: 2,
      },
      { name: 'Assigned To', fieldType: 'person', sortOrder: 3 },
      { name: 'Due Date', fieldType: 'date', sortOrder: 4 },
    ],
    views: [
      { name: 'Table', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checklist', viewType: 'checklist', isDefault: false, sortOrder: 1 },
    ],
  },
  {
    systemKey: 'packing-list',
    name: 'Packing List',
    icon: '🧳',
    fields: [
      { name: 'Item', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      {
        name: 'Category',
        fieldType: 'select',
        config: { options: ['Clothing', 'Electronics', 'Toiletries', 'Documents', 'Other'] },
        sortOrder: 1,
      },
      { name: 'Packed', fieldType: 'checkbox', sortOrder: 2 },
    ],
    views: [{ name: 'Checklist', viewType: 'checklist', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'reading-list',
    name: 'Reading List',
    icon: '📚',
    fields: [
      { name: 'Title', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Author', fieldType: 'text', sortOrder: 1 },
      {
        name: 'Type',
        fieldType: 'select',
        config: { options: ['Book', 'Article', 'Film', 'Podcast'] },
        sortOrder: 2,
      },
      {
        name: 'Status',
        fieldType: 'select',
        config: { options: ['Want to read', 'Reading', 'Finished'] },
        sortOrder: 3,
      },
      {
        name: 'Rating',
        fieldType: 'select',
        config: { options: ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'] },
        sortOrder: 4,
      },
    ],
    views: [{ name: 'Table', viewType: 'table', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'wish-list',
    name: 'Wish List',
    icon: '🎁',
    fields: [
      { name: 'Item', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'For', fieldType: 'text', sortOrder: 1 },
      { name: 'Link', fieldType: 'url', sortOrder: 2 },
      { name: 'Price', fieldType: 'number', config: { unit: '€' }, sortOrder: 3 },
      { name: 'Bought', fieldType: 'checkbox', sortOrder: 4 },
    ],
    views: [
      { name: 'Table', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checklist', viewType: 'checklist', isDefault: false, sortOrder: 1 },
    ],
  },
  {
    systemKey: 'habit-tracker',
    name: 'Habit Tracker',
    icon: '🏃',
    fields: [
      { name: 'Habit', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Done', fieldType: 'checkbox', sortOrder: 1 },
      { name: 'Note', fieldType: 'text', sortOrder: 2 },
    ],
    views: [{ name: 'Checklist', viewType: 'checklist', isDefault: true, sortOrder: 0 }],
  },
  {
    systemKey: 'collection',
    name: 'Collection',
    icon: '📦',
    fields: [
      { name: 'Title', fieldType: 'text', isTitle: true, isRequired: true, sortOrder: 0 },
      { name: 'Note', fieldType: 'text', sortOrder: 1 },
    ],
    views: [
      { name: 'Table', viewType: 'table', isDefault: true, sortOrder: 0 },
      { name: 'Checklist', viewType: 'checklist', isDefault: false, sortOrder: 1 },
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
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
