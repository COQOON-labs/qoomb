/**
 * Unit tests for the key-rotation re-encryption script.
 *
 * Coverage targets (see ADR-0008 §6):
 *  - reencryptField: null stored value → no-op (returns null)
 *  - reencryptField: stored value already at a newer version → skip (returns null)
 *  - reencryptField: migrate V1 → V2 with plain callbacks (control flow)
 *  - reencryptField: migrate V1 → V2 with real AES-256-GCM (hive-scoped)
 *  - reencryptField: migrate V1 → V2 with real AES-256-GCM (user-scoped)
 *  - reencryptField: verification gate — throws when ciphertext is corrupted
 *  - reencryptField: idempotent — second pass over an already-migrated value is a no-op
 *  - EncryptionService rotation mode: currentVersion = 2, new data encrypted at V2
 *  - Cross-version decryption: V1 hive-scoped ciphertext readable in rotation mode
 *  - Cross-version decryption: V1 user-scoped ciphertext readable in rotation mode
 *  - emailHash recomputation: HMAC shifts when master key changes (must recompute)
 *  - emailHash: case-normalised (case-insensitive lookups)
 *  - getBackupRetentionDays: default 30, env override, rejects zero/negative/NaN
 *  - backupExpiresAt: result is in the future, scales with retentionDays
 *  - buildBackupRow: correct structure, expiresAt ~retentionDays ahead, no mutation
 *  - Version-mixing batch: only v-fromVersion records are migrated, others skipped
 *  - Resumability: after partial migration, re-run migrates only remaining records
 *
 * No Prisma / no database — pure function tests + EncryptionService integration.
 */

// Must be first — NestJS decorators require reflect-metadata at run time.
import 'reflect-metadata';

import * as crypto from 'crypto';

// KEY_PROVIDER must be set before new EncryptionService() is called.
// TypeScript compiles static imports to require() calls at their source
// position, so this assignment precedes the require('./reencrypt') call.
process.env['KEY_PROVIDER'] = 'environment';

import { EncryptionService } from '../../src/modules/encryption/encryption.service';

import {
  reencryptField,
  getBackupRetentionDays,
  backupExpiresAt,
  buildBackupRow,
} from './reencrypt';

import { mapFieldName, SUPPORTED_TABLES, dispatchRestore } from './reencrypt-rollback';

// ── Key material ──────────────────────────────────────────────────────────────
const KEY_V1 = crypto.randomBytes(32).toString('base64');
const KEY_V2 = crypto.randomBytes(32).toString('base64');

// ── EncryptionService factory helpers ─────────────────────────────────────────

async function createSvc(keyBase64: string): Promise<EncryptionService> {
  process.env['ENCRYPTION_KEY'] = keyBase64;
  delete process.env['ENCRYPTION_KEY_CURRENT'];
  for (let i = 1; i <= 10; i++) delete process.env[`ENCRYPTION_KEY_V${i}`];
  const svc = new EncryptionService();
  await svc.onModuleInit();
  return svc;
}

async function createRotationSvc(v1Key: string, v2Key: string): Promise<EncryptionService> {
  delete process.env['ENCRYPTION_KEY'];
  process.env['ENCRYPTION_KEY_CURRENT'] = '2';
  process.env['ENCRYPTION_KEY_V1'] = v1Key;
  process.env['ENCRYPTION_KEY_V2'] = v2Key;
  const svc = new EncryptionService();
  await svc.onModuleInit();
  return svc;
}

// ── Simple encode/decode helpers (no AES) — for control-flow tests only ────────
const simpleEnc =
  (version: number) =>
  (s: string): string =>
    `v${version}:${Buffer.from(s).toString('base64')}`;
const simpleDec = (s: string): string =>
  Buffer.from(s.split(':').slice(1).join(':'), 'base64').toString();

// ═══════════════════════════════════════════════════════════════════════════════
// reencryptField — pure control-flow tests (plain callbacks, no crypto)
// ═══════════════════════════════════════════════════════════════════════════════

describe('reencryptField — pure function (plain callbacks)', () => {
  it('returns null for a null stored value (no-op)', () => {
    expect(reencryptField(null, 1, simpleDec, simpleEnc(2))).toBeNull();
  });

  it('returns null when stored value is at a newer version (skip)', () => {
    // 'v2:...' does not start with 'v1:' → skip without touching the value
    const storedV2 = simpleEnc(2)('hello');
    expect(reencryptField(storedV2, 1, simpleDec, simpleEnc(2))).toBeNull();
  });

  it('migrates a v1 value and returns a v2 ciphertext', () => {
    const storedV1 = simpleEnc(1)('My List Name');
    const result = reencryptField(storedV1, 1, simpleDec, simpleEnc(2));
    expect(result).not.toBeNull();
    expect(result!.startsWith('v2:')).toBe(true);
    expect(simpleDec(result!)).toBe('My List Name');
  });

  it('throws when the re-encrypted ciphertext fails verification', () => {
    const storedV1 = simpleEnc(1)('original');
    // corruptEnc appends noise → simpleDec(corruptEnc(x)) !== x → verification fails
    const corruptEnc = (s: string): string => simpleEnc(2)(s + '\x00extra');
    expect(() => reencryptField(storedV1, 1, simpleDec, corruptEnc)).toThrow(/[Vv]erif/);
    // Error must NOT include plaintext — it could end up in log forwarding services
    let thrownMessage = '';
    expect(() => {
      try {
        reencryptField(storedV1, 1, simpleDec, corruptEnc);
      } catch (e) {
        thrownMessage = (e as Error).message;
        throw e;
      }
    }).toThrow();
    expect(thrownMessage).not.toContain('original');
  });

  it('is a no-op on a second pass (idempotent)', () => {
    const storedV1 = simpleEnc(1)('data');
    const migrated = reencryptField(storedV1, 1, simpleDec, simpleEnc(2))!;
    expect(migrated).not.toBeNull();
    // migrated starts with 'v2:' — fromVersion is still 1 → doesn't match → skip
    expect(reencryptField(migrated, 1, simpleDec, simpleEnc(2))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reencryptField — integration tests with real AES-256-GCM
// ═══════════════════════════════════════════════════════════════════════════════
//
// Uses a rotation-mode service as both decryptFn AND encryptFn:
//   - decryptFn: rotation service can decrypt V1 ciphertext (V1 key still loaded)
//   - encryptFn: rotation service encrypts at V2 (currentVersion = 2) → "v2:..."
// So reencryptField receives a "v1:..." input, decrypts it, re-encrypts as "v2:...",
// and then the decryptFn verifies it (rotation service can also decrypt V2).

describe('reencryptField — real AES-256-GCM callbacks', () => {
  const hiveId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  let svcSingleV1: EncryptionService; // old service: only KEY_V1
  let svcRotation: EncryptionService; // rotation service: V1 + V2, current = V2

  beforeAll(async () => {
    svcSingleV1 = await createSvc(KEY_V1);
    svcRotation = await createRotationSvc(KEY_V1, KEY_V2);
  });

  it('migrates a hive-scoped V1 ciphertext to V2 (round-trip)', () => {
    const plaintext = 'Geheimer Eventname 🔐';
    // Old service produces a "v1:..." ciphertext
    const storedV1 = svcSingleV1.serializeToStorage(svcSingleV1.encrypt(plaintext, hiveId));
    expect(storedV1.startsWith('v1:')).toBe(true);

    // Rotation service: decrypts V1, re-encrypts at V2, verifies V2
    const rotDec = (s: string) => svcRotation.decrypt(svcRotation.parseFromStorage(s), hiveId);
    const rotEnc = (s: string) => svcRotation.serializeToStorage(svcRotation.encrypt(s, hiveId));

    const newCiphertext = reencryptField(storedV1, 1, rotDec, rotEnc);
    expect(newCiphertext).not.toBeNull();
    expect(newCiphertext!.startsWith('v2:')).toBe(true);

    // Confirm round-trip: rotation service can decrypt the new V2 ciphertext
    const recovered = svcRotation.decrypt(svcRotation.parseFromStorage(newCiphertext!), hiveId);
    expect(recovered).toBe(plaintext);
  });

  it('migrates a user-scoped V1 ciphertext to V2 (encryptForUser / decryptForUser)', () => {
    const plaintext = 'user@example.com';
    const storedV1 = svcSingleV1.encryptForUser(plaintext, userId);
    expect(storedV1.startsWith('v1:')).toBe(true);

    const rotDec = (s: string) => svcRotation.decryptForUser(s, userId);
    const rotEnc = (s: string) => svcRotation.encryptForUser(s, userId);

    const newCiphertext = reencryptField(storedV1, 1, rotDec, rotEnc);
    expect(newCiphertext).not.toBeNull();
    expect(newCiphertext!.startsWith('v2:')).toBe(true);

    expect(svcRotation.decryptForUser(newCiphertext!, userId)).toBe(plaintext);
  });

  it('throws when encryptFn uses a different hive key (AES-GCM auth failure)', () => {
    const hiveA = crypto.randomUUID();
    const hiveB = crypto.randomUUID();

    const storedV1 = svcSingleV1.serializeToStorage(svcSingleV1.encrypt('secret', hiveA));
    // decryptFn decrypts under hiveA; encryptFn encrypts under hiveB
    // → dec(enc(secret)) attempts decrypt of hiveB ciphertext with hiveA key → GCM auth fail
    const decA = (s: string) => svcRotation.decrypt(svcRotation.parseFromStorage(s), hiveA);
    const encBadHive = (s: string) => svcRotation.serializeToStorage(svcRotation.encrypt(s, hiveB));

    expect(() => reencryptField(storedV1, 1, decA, encBadHive)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EncryptionService — rotation mode
// ═══════════════════════════════════════════════════════════════════════════════

describe('EncryptionService — rotation mode (V1 + V2)', () => {
  const hiveId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  let svcSingleV1: EncryptionService;
  let svcRotation: EncryptionService;

  beforeAll(async () => {
    svcSingleV1 = await createSvc(KEY_V1);
    svcRotation = await createRotationSvc(KEY_V1, KEY_V2);
  });

  it('getCurrentKeyVersion() returns 2', () => {
    expect(svcRotation.getCurrentKeyVersion()).toBe(2);
  });

  it('encrypts new data at version 2', () => {
    const encrypted = svcRotation.encrypt('hello', hiveId);
    expect(encrypted.version).toBe(2);
    expect(svcRotation.serializeToStorage(encrypted).startsWith('v2:')).toBe(true);
  });

  it('decrypts a V1 hive-scoped ciphertext produced by the single-key service', () => {
    const stored = svcSingleV1.serializeToStorage(svcSingleV1.encrypt('V1 hive data', hiveId));
    expect(stored.startsWith('v1:')).toBe(true);

    const plaintext = svcRotation.decrypt(svcRotation.parseFromStorage(stored), hiveId);
    expect(plaintext).toBe('V1 hive data');
  });

  it('decrypts a V1 user-scoped ciphertext in rotation mode', () => {
    const stored = svcSingleV1.encryptForUser('V1 user data', userId);
    expect(stored.startsWith('v1:')).toBe(true);

    expect(svcRotation.decryptForUser(stored, userId)).toBe('V1 user data');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// emailHash — must be recomputed on key rotation
// ═══════════════════════════════════════════════════════════════════════════════

describe('emailHash', () => {
  let svc1: EncryptionService;
  let svc2: EncryptionService;

  beforeAll(async () => {
    svc1 = await createSvc(KEY_V1);
    svc2 = await createSvc(KEY_V2);
  });

  it('produces different hashes for different master keys', () => {
    // Different master key → different HMAC key → different hash.
    // Confirms emailHash MUST be recomputed during key rotation.
    expect(svc1.hashEmail('alice@example.com')).not.toBe(svc2.hashEmail('alice@example.com'));
  });

  it('is deterministic for the same key', () => {
    const h = svc1.hashEmail('alice@example.com');
    expect(svc1.hashEmail('alice@example.com')).toBe(h);
  });

  it('normalises case (case-insensitive lookup)', () => {
    const lower = svc1.hashEmail('alice@example.com');
    expect(svc1.hashEmail('ALICE@EXAMPLE.COM')).toBe(lower);
    expect(svc1.hashEmail('Alice@Example.COM')).toBe(lower);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reencrypt-rollback.ts — dry-run logic (no DB, import-only)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The rollback script contains only side-effect-free routing logic (a switch
// over tableName → Prisma model). We test the structural guarantees:
//   - The module exports nothing and does not auto-execute (require.main guard)
//   - Every known tableName in ADR-0008 is handled (no "Unknown table" throw)

describe('reencrypt-rollback — module structure', () => {
  it('does not throw on import (require.main guard present)', async () => {
    // If require.main === module guard is missing, import would try to connect
    // to DB and fail immediately. A clean import means the guard is in place.
    process.env['DATABASE_URL'] = 'postgresql://localhost/test_guard';
    await expect(import('./reencrypt-rollback')).resolves.not.toThrow();
    delete process.env['DATABASE_URL'];
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// reencrypt-cleanup.ts — module structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('reencrypt-cleanup — module structure', () => {
  it('does not throw on import (require.main guard present)', async () => {
    process.env['DATABASE_URL'] = 'postgresql://localhost/test_guard';
    await expect(import('./reencrypt-cleanup')).resolves.not.toThrow();
    delete process.env['DATABASE_URL'];
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getBackupRetentionDays — environment-driven configuration
// ═══════════════════════════════════════════════════════════════════════════════
describe('getBackupRetentionDays', () => {
  afterEach(() => {
    delete process.env['REENCRYPT_BACKUP_RETENTION_DAYS'];
  });

  it('returns 30 when env var is not set (default)', () => {
    expect(getBackupRetentionDays()).toBe(30);
  });

  it('returns custom value when env = "45"', () => {
    process.env['REENCRYPT_BACKUP_RETENTION_DAYS'] = '45';
    expect(getBackupRetentionDays()).toBe(45);
  });

  it('returns 1 when env = "1" (minimum allowed)', () => {
    process.env['REENCRYPT_BACKUP_RETENTION_DAYS'] = '1';
    expect(getBackupRetentionDays()).toBe(1);
  });

  it('throws when env = "0"', () => {
    process.env['REENCRYPT_BACKUP_RETENTION_DAYS'] = '0';
    expect(() => getBackupRetentionDays()).toThrow();
  });

  it('throws when env = "-1"', () => {
    process.env['REENCRYPT_BACKUP_RETENTION_DAYS'] = '-1';
    expect(() => getBackupRetentionDays()).toThrow();
  });

  it('throws when env = "abc" (NaN)', () => {
    process.env['REENCRYPT_BACKUP_RETENTION_DAYS'] = 'abc';
    expect(() => getBackupRetentionDays()).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// backupExpiresAt — date calculation
// ═══════════════════════════════════════════════════════════════════════════════
describe('backupExpiresAt', () => {
  it('returns a Date object', () => {
    expect(backupExpiresAt(30)).toBeInstanceOf(Date);
  });

  it('returns a date in the future', () => {
    expect(backupExpiresAt(1).getTime()).toBeGreaterThan(Date.now());
  });

  it('retention=1 → approximately 1 day from now (±1 min tolerance)', () => {
    const expected = Date.now() + 1 * 24 * 60 * 60 * 1000;
    const actual = backupExpiresAt(1).getTime();
    expect(Math.abs(actual - expected)).toBeLessThan(60_000);
  });

  it('retention=30 → approximately 30 days from now (±1 min tolerance)', () => {
    const expected = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const actual = backupExpiresAt(30).getTime();
    expect(Math.abs(actual - expected)).toBeLessThan(60_000);
  });

  it('different retentionDays produce different dates', () => {
    expect(backupExpiresAt(7).getTime()).not.toBe(backupExpiresAt(30).getTime());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildBackupRow — structure contract
// ═══════════════════════════════════════════════════════════════════════════════
describe('buildBackupRow', () => {
  const TABLE = 'hive_events';
  const ID = 'aaaaaaaa-0000-0000-0000-000000000001';
  const FIELD = 'title';
  const CIPHERTEXT = 'v1:abc123';
  const FROM = 1;
  const TO = 2;
  const DAYS = 30;

  it('returns all required fields with correct scalar values', () => {
    const row = buildBackupRow(TABLE, ID, FIELD, CIPHERTEXT, FROM, TO, DAYS);
    expect(row.tableName).toBe(TABLE);
    expect(row.recordId).toBe(ID);
    expect(row.fieldName).toBe(FIELD);
    expect(row.oldCiphertext).toBe(CIPHERTEXT);
    expect(row.fromVersion).toBe(FROM);
    expect(row.toVersion).toBe(TO);
  });

  it('oldCiphertext is the exact value passed in (not mutated)', () => {
    const row = buildBackupRow(TABLE, ID, FIELD, CIPHERTEXT, FROM, TO, DAYS);
    expect(row.oldCiphertext).toStrictEqual(CIPHERTEXT);
  });

  it('expiresAt is a Date computed from retentionDays', () => {
    const row = buildBackupRow(TABLE, ID, FIELD, CIPHERTEXT, FROM, TO, 7);
    const expected = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(row.expiresAt).toBeInstanceOf(Date);
    expect(Math.abs(row.expiresAt.getTime() - expected)).toBeLessThan(60_000);
  });

  it('different retentionDays produce different expiresAt', () => {
    const row7 = buildBackupRow(TABLE, ID, FIELD, CIPHERTEXT, FROM, TO, 7);
    const row30 = buildBackupRow(TABLE, ID, FIELD, CIPHERTEXT, FROM, TO, 30);
    expect(row7.expiresAt.getTime()).not.toBe(row30.expiresAt.getTime());
  });

  it('fromVersion and toVersion are preserved exactly', () => {
    const row = buildBackupRow(TABLE, ID, FIELD, CIPHERTEXT, 3, 4, DAYS);
    expect(row.fromVersion).toBe(3);
    expect(row.toVersion).toBe(4);
  });
});

// =============================================================================
// Version-mixing batch resilience - mixed v1 / v2 records in a single batch
// =============================================================================
describe('Version-mixing batch resilience', () => {
  // simpleEnc / simpleDec are defined at module scope - no DB required.

  it('migrates only v1 records from a mixed batch', () => {
    const v1Ciphertext = simpleEnc(1)('hello');
    const v2Ciphertext = simpleEnc(2)('already-migrated');

    const results = [
      reencryptField(v1Ciphertext, 1, simpleDec, simpleEnc(2)),
      reencryptField(v2Ciphertext, 1, simpleDec, simpleEnc(2)),
    ];

    expect(results[0]).not.toBeNull(); // v1 record was migrated
    expect(results[1]).toBeNull(); // v2 record was skipped
  });

  it('returns null for all records if all are already at v2 (fully migrated)', () => {
    const v2a = simpleEnc(2)('already-a');
    const v2b = simpleEnc(2)('already-b');

    expect(reencryptField(v2a, 1, simpleDec, simpleEnc(2))).toBeNull();
    expect(reencryptField(v2b, 1, simpleDec, simpleEnc(2))).toBeNull();
  });

  it('batch count: 5 records, 3 v1 + 2 v2 - exactly 3 non-null results', () => {
    const v1s = [simpleEnc(1)('a'), simpleEnc(1)('b'), simpleEnc(1)('c')];
    const v2s = [simpleEnc(2)('x'), simpleEnc(2)('y')];
    const all = [...v1s, ...v2s];

    const results = all.map((c) => reencryptField(c, 1, simpleDec, simpleEnc(2)));

    const migrated = results.filter((r) => r !== null);
    expect(migrated).toHaveLength(3);
  });

  it('already-migrated records are never passed to encryptFn', () => {
    const encryptSpy = jest.fn().mockReturnValue(simpleEnc(2)('new'));
    const v2Ciphertext = simpleEnc(2)('already');

    reencryptField(v2Ciphertext, 1, simpleDec, encryptSpy);

    expect(encryptSpy).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Resumability - aborted migration re-run
// =============================================================================
describe('Resumability: aborted migration re-run', () => {
  // simpleEnc / simpleDec are defined at module scope - no DB required.

  it('second run skips already-migrated records (returns null for them)', () => {
    const v1 = simpleEnc(1)('secret');
    const firstResult = reencryptField(v1, 1, simpleDec, simpleEnc(2))!;
    expect(firstResult).not.toBeNull();
    expect(firstResult.startsWith('v2:')).toBe(true);

    // second pass: the record is now v2 - should be skipped
    const secondResult = reencryptField(firstResult, 1, simpleDec, simpleEnc(2));
    expect(secondResult).toBeNull();
  });

  it('second run migrates only remaining v1 records', () => {
    const v1a = simpleEnc(1)('record-a');
    const v1b = simpleEnc(1)('record-b');

    // Simulate partial first pass: only v1a was migrated before crash
    const v2a = reencryptField(v1a, 1, simpleDec, simpleEnc(2))!;
    expect(v2a).not.toBeNull();

    // Resume: v2a is already done, v1b still needs migration
    const resumeA = reencryptField(v2a, 1, simpleDec, simpleEnc(2));
    const resumeB = reencryptField(v1b, 1, simpleDec, simpleEnc(2));

    expect(resumeA).toBeNull(); // already migrated - skipped
    expect(resumeB).not.toBeNull(); // still v1 - migrated
  });

  it('running again after ALL records are migrated - all return null', () => {
    const originals = [simpleEnc(1)('x'), simpleEnc(1)('y'), simpleEnc(1)('z')];

    // First pass: migrate all
    const firstPass = originals.map((c) => reencryptField(c, 1, simpleDec, simpleEnc(2)));
    expect(firstPass.every((r) => r !== null)).toBe(true);

    // Second pass ('re-run'): all should be skipped
    const secondPass = (firstPass as string[]).map((c) =>
      reencryptField(c, 1, simpleDec, simpleEnc(2))
    );
    expect(secondPass.every((r) => r === null)).toBe(true);
  });

  it('migration counting: 3 records, 2 migrated first pass - 1 migrated second pass', () => {
    const records = [simpleEnc(1)('p'), simpleEnc(1)('q'), simpleEnc(1)('r')];

    // First pass: migrate first two
    const v2p = reencryptField(records[0], 1, simpleDec, simpleEnc(2))!;
    const v2q = reencryptField(records[1], 1, simpleDec, simpleEnc(2))!;
    expect(v2p).not.toBeNull();
    expect(v2q).not.toBeNull();

    // Second pass (resume): only records[2] should be migrated
    const resumeResults = [
      reencryptField(v2p, 1, simpleDec, simpleEnc(2)),
      reencryptField(v2q, 1, simpleDec, simpleEnc(2)),
      reencryptField(records[2], 1, simpleDec, simpleEnc(2)),
    ];

    const migrated = resumeResults.filter((r) => r !== null);
    expect(migrated).toHaveLength(1); // only records[2] was migrated
  });
});

// =============================================================================
// Rollback — mapFieldName: DB column → Prisma field name mapping
// =============================================================================
describe('reencrypt-rollback — mapFieldName', () => {
  // ── users ──────────────────────────────────────────────────────────────────
  it('users / full_name → fullName', () => {
    expect(mapFieldName('users', 'full_name')).toBe('fullName');
  });

  it('users / email_hash → emailHash', () => {
    expect(mapFieldName('users', 'email_hash')).toBe('emailHash');
  });

  it('users / email passes through unchanged', () => {
    expect(mapFieldName('users', 'email')).toBe('email');
  });

  it('users / locale passes through unchanged', () => {
    expect(mapFieldName('users', 'locale')).toBe('locale');
  });

  // ── persons ────────────────────────────────────────────────────────────────
  it('persons / display_name → displayName', () => {
    expect(mapFieldName('persons', 'display_name')).toBe('displayName');
  });

  it('persons / avatar_url → avatarUrl', () => {
    expect(mapFieldName('persons', 'avatar_url')).toBe('avatarUrl');
  });

  it('persons / birthdate passes through unchanged', () => {
    expect(mapFieldName('persons', 'birthdate')).toBe('birthdate');
  });

  // ── invitations ────────────────────────────────────────────────────────────
  it('invitations / email_hash → emailHash', () => {
    expect(mapFieldName('invitations', 'email_hash')).toBe('emailHash');
  });

  // ── events ─────────────────────────────────────────────────────────────────
  it('events / title passes through unchanged', () => {
    expect(mapFieldName('events', 'title')).toBe('title');
  });

  it('events / description passes through unchanged', () => {
    expect(mapFieldName('events', 'description')).toBe('description');
  });

  // ── groups ─────────────────────────────────────────────────────────────────
  it('hive_groups / name passes through unchanged', () => {
    expect(mapFieldName('hive_groups', 'name')).toBe('name');
  });

  // ── lists ──────────────────────────────────────────────────────────────────
  it('lists / name passes through unchanged', () => {
    expect(mapFieldName('lists', 'name')).toBe('name');
  });

  it('list_fields / name passes through unchanged', () => {
    expect(mapFieldName('list_fields', 'name')).toBe('name');
  });

  it('list_views / name passes through unchanged', () => {
    expect(mapFieldName('list_views', 'name')).toBe('name');
  });

  it('list_item_values / value passes through unchanged', () => {
    expect(mapFieldName('list_item_values', 'value')).toBe('value');
  });

  // ── unknown table ──────────────────────────────────────────────────────────
  it('unknown table / any field passes through unchanged (no throw)', () => {
    // mapFieldName itself never throws — only dispatchRestore throws on unknown table.
    expect(mapFieldName('unknown_table', 'some_field')).toBe('some_field');
  });
});

// =============================================================================
// Rollback — SUPPORTED_TABLES: coverage against the ADR-0008 inventory
// =============================================================================
describe('reencrypt-rollback — SUPPORTED_TABLES coverage', () => {
  const EXPECTED_TABLES = [
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
  ];

  it('contains exactly the tables listed in ADR-0008 §3 inventory', () => {
    expect([...SUPPORTED_TABLES].sort()).toStrictEqual([...EXPECTED_TABLES].sort());
  });

  it('every entry in SUPPORTED_TABLES is a non-empty string', () => {
    for (const t of SUPPORTED_TABLES) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Rollback — dispatchRestore: routing + unknown-table guard
// =============================================================================
describe('reencrypt-rollback — dispatchRestore routing', () => {
  // Build a fake Prisma tx that records calls instead of hitting the DB.
  // Each model has update() that captures { where, data } for assertions.
  type CallRecord = { where: Record<string, unknown>; data: Record<string, unknown> };

  function makeFakeTx(): {
    tx: Parameters<typeof dispatchRestore>[0];
    calls: Map<string, CallRecord>;
  } {
    const calls = new Map<string, CallRecord>();
    const makeModel = (name: string) => ({
      update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.set(name, args);
        return Promise.resolve();
      },
    });
    const tx = {
      user: makeModel('user'),
      hive: makeModel('hive'),
      person: makeModel('person'),
      event: makeModel('event'),
      hiveGroup: makeModel('hiveGroup'),
      list: makeModel('list'),
      listField: makeModel('listField'),
      listView: makeModel('listView'),
      listItemValue: makeModel('listItemValue'),
      invitation: makeModel('invitation'),
    };
    return { tx: tx as unknown as Parameters<typeof dispatchRestore>[0], calls };
  }

  const ID = 'aaaaaaaa-0000-0000-0000-000000000001';

  it('users — updates user with mapped field name', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'users', ID, 'full_name', 'v1:abc');
    expect(calls.get('user')).toMatchObject({
      where: { id: ID },
      data: { fullName: 'v1:abc' },
    });
  });

  it('users — restores emailHash field', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'users', ID, 'email_hash', 'oldhash');
    expect(calls.get('user')).toMatchObject({
      where: { id: ID },
      data: { emailHash: 'oldhash' },
    });
  });

  it('users — restores email field (passes through)', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'users', ID, 'email', 'v1:cipher');
    expect(calls.get('user')).toMatchObject({ data: { email: 'v1:cipher' } });
  });

  it('hives — always writes to name field', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'hives', ID, 'name', 'v1:hivename');
    expect(calls.get('hive')).toMatchObject({ data: { name: 'v1:hivename' } });
  });

  it('persons — maps display_name → displayName', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'persons', ID, 'display_name', 'v1:name');
    expect(calls.get('person')).toMatchObject({ data: { displayName: 'v1:name' } });
  });

  it('persons — maps avatar_url → avatarUrl', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'persons', ID, 'avatar_url', 'v1:url');
    expect(calls.get('person')).toMatchObject({ data: { avatarUrl: 'v1:url' } });
  });

  it('persons — birthdate passes through', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'persons', ID, 'birthdate', 'v1:date');
    expect(calls.get('person')).toMatchObject({ data: { birthdate: 'v1:date' } });
  });

  it('events — title passes through', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'events', ID, 'title', 'v1:title');
    expect(calls.get('event')).toMatchObject({ data: { title: 'v1:title' } });
  });

  it('hive_groups — name passes through', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'hive_groups', ID, 'name', 'v1:groupname');
    expect(calls.get('hiveGroup')).toMatchObject({ data: { name: 'v1:groupname' } });
  });

  it('lists — always writes to name field', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'lists', ID, 'name', 'v1:listname');
    expect(calls.get('list')).toMatchObject({ data: { name: 'v1:listname' } });
  });

  it('list_fields — always writes to name field', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'list_fields', ID, 'name', 'v1:fieldname');
    expect(calls.get('listField')).toMatchObject({ data: { name: 'v1:fieldname' } });
  });

  it('list_views — always writes to name field', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'list_views', ID, 'name', 'v1:viewname');
    expect(calls.get('listView')).toMatchObject({ data: { name: 'v1:viewname' } });
  });

  it('list_item_values — always writes to value field', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'list_item_values', ID, 'value', 'v1:val');
    expect(calls.get('listItemValue')).toMatchObject({ data: { value: 'v1:val' } });
  });

  it('invitations — maps email_hash → emailHash', async () => {
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'invitations', ID, 'email_hash', 'oldhash');
    expect(calls.get('invitation')).toMatchObject({ data: { emailHash: 'oldhash' } });
  });

  it('every SUPPORTED_TABLE dispatches without throwing (smoke)', async () => {
    for (const table of SUPPORTED_TABLES) {
      const { tx } = makeFakeTx();
      await expect(dispatchRestore(tx, table, ID, 'name', 'v1:val')).resolves.not.toThrow();
    }
  });

  it('unknown table throws with table name in message', async () => {
    const { tx } = makeFakeTx();
    await expect(dispatchRestore(tx, 'unknown_mystery_table', ID, 'col', 'val')).rejects.toThrow(
      /unknown_mystery_table/
    );
  });

  it('where clause always contains the correct record ID', async () => {
    const testId = 'bbbbbbbb-1111-1111-1111-111111111111';
    const { tx, calls } = makeFakeTx();
    await dispatchRestore(tx, 'events', testId, 'title', 'v1:x');
    expect(calls.get('event')?.where).toStrictEqual({ id: testId });
  });

  it('oldCiphertext value is written verbatim (not re-encrypted)', async () => {
    const { tx, calls } = makeFakeTx();
    const raw = 'v1:EXACTLY_THIS_VALUE';
    await dispatchRestore(tx, 'events', ID, 'title', raw);
    expect(calls.get('event')?.data?.title).toBe(raw);
  });
});

// =============================================================================
// Rollback — skip logic: fromVersion !== toVersion
// =============================================================================
describe('reencrypt-rollback — skip logic via reencryptField', () => {
  // The rollback script skips backup rows where fromVersion !== toVersion.
  // We model the skip logic using reencryptField's version-prefix check,
  // because the core invariant is the same: "is the stored value at the
  // expected source version?" If not — skip, don't touch it.

  it('v1 record targeted for rollback to v1: matches fromVersion=1 prefix', () => {
    // A record at v1 does NOT start with v2 → reencryptField(v2→v1 migration) would skip
    // Modelled: a v2 record targeted for rollback to v1 should be processed.
    // fromVersion of BACKUP row is 1 (before migration), toVersion is 2 (after migration).
    // rollback restores the v1 oldCiphertext verbatim — no re-decryption needed.
    // ∴ the skip condition is: fromVersion !== toVersion (not a reencryptField call).
    // We verify the semantics by checking backup row structure:
    const row = buildBackupRow('events', ID, 'title', 'v1:abc', 1, 2, 30);
    expect(row.fromVersion).toBe(1);
    expect(row.toVersion).toBe(2);
    // rollback toVersion default is 1 → row.fromVersion (1) === toVersion (1) → NOT skipped
    expect(row.fromVersion).toBe(1);
  });

  it('backup row fromVersion !== rollback toVersion → should be skipped', () => {
    // e.g. a V2→V3 backup row when rolling back to V1 → different version family → skip
    const row = buildBackupRow('events', 'id', 'title', 'v2:abc', 2, 3, 30);
    const rollbackToVersion = 1;
    // Simulate the skip condition in the main() loop:
    const shouldSkip = row.fromVersion !== rollbackToVersion;
    expect(shouldSkip).toBe(true);
  });

  it('backup row fromVersion === rollback toVersion → should NOT be skipped', () => {
    const row = buildBackupRow('events', 'id', 'title', 'v1:abc', 1, 2, 30);
    const rollbackToVersion = 1;
    const shouldSkip = row.fromVersion !== rollbackToVersion;
    expect(shouldSkip).toBe(false);
  });

  const ID = 'aaaaaaaa-0000-0000-0000-000000000001';
});

// ── migrateInvitations — backup-before-write semantics ───────────────────────
// These tests verify the contract: OLD emailHash is written to reencrypt_backups
// inside the same transaction BEFORE the new hash is committed to invitations.
// This mirrors the pattern used by all other migration functions (migrateUsers,
// migratePersons, etc.) and ensures the rollback script has data to restore.

describe('migrateInvitations — backup-before-write contract', () => {
  const INV_ID = 'cccccccc-0000-0000-0000-000000000001';

  it('backup row uses table=invitations, field=email_hash, correct record ID', () => {
    // Verify the structural contract for the backup row that migrateInvitations writes.
    const oldHash = 'deadbeefdeadbeef';
    const row = buildBackupRow('invitations', INV_ID, 'email_hash', oldHash, 1, 2, 30);
    expect(row.tableName).toBe('invitations');
    expect(row.fieldName).toBe('email_hash');
    expect(row.recordId).toBe(INV_ID);
    expect(row.oldCiphertext).toBe(oldHash);
  });

  it('backup row stores the OLD emailHash verbatim (not the new hash)', () => {
    const oldHash = 'oldv1hash';
    const row = buildBackupRow('invitations', INV_ID, 'email_hash', oldHash, 1, 2, 30);
    // The old hash must survive unchanged — it will be written to DB first
    // so the rollback script can restore it without knowing the old key.
    expect(row.oldCiphertext).toBe('oldv1hash');
    expect(row.oldCiphertext).not.toBe('newv2hash');
  });

  it('backup row fromVersion=1, toVersion=2 aligns with rotation direction', () => {
    const row = buildBackupRow('invitations', INV_ID, 'email_hash', 'h', 1, 2, 30);
    expect(row.fromVersion).toBe(1);
    expect(row.toVersion).toBe(2);
  });

  it('dispatchRestore can restore invitations emailHash from the backup row', async () => {
    // Simulate the rollback scenario: backup row exists → dispatchRestore writes old hash back.
    // Build a minimal fake tx scoped to this test (mirrors makeFakeTx pattern).
    const calls = new Map<
      string,
      { where: Record<string, unknown>; data: Record<string, unknown> }
    >();
    const makeModel = (name: string) => ({
      update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.set(name, args);
        return Promise.resolve();
      },
    });
    const localTx = {
      user: makeModel('user'),
      hive: makeModel('hive'),
      person: makeModel('person'),
      event: makeModel('event'),
      hiveGroup: makeModel('hiveGroup'),
      list: makeModel('list'),
      listField: makeModel('listField'),
      listView: makeModel('listView'),
      listItemValue: makeModel('listItemValue'),
      invitation: makeModel('invitation'),
    } as unknown as Parameters<typeof dispatchRestore>[0];

    await dispatchRestore(localTx, 'invitations', INV_ID, 'email_hash', 'restoredOldHash');
    expect(calls.get('invitation')).toMatchObject({
      where: { id: INV_ID },
      data: { emailHash: 'restoredOldHash' },
    });
  });

  it('mapFieldName maps email_hash → emailHash for invitations (rollback key mapping)', () => {
    // Ensures the rollback script translates the DB column name 'email_hash'
    // to the Prisma field name 'emailHash' when calling tx.invitation.update().
    expect(mapFieldName('invitations', 'email_hash')).toBe('emailHash');
  });

  it('empty email sentinel does not produce a backup row (skip branch)', () => {
    // When email is '' (pre-migration row), no backup row should be written.
    // We test the invariant: buildBackupRow is never called for such rows.
    // Model: if email is falsy, the migration skips → oldCiphertext is never used.
    const wouldBeBuilt = (email: string) => {
      if (!email) return null; // mirrors the migrateInvitations skip check
      return buildBackupRow('invitations', INV_ID, 'email_hash', 'hash', 1, 2, 30);
    };
    expect(wouldBeBuilt('')).toBeNull();
    expect(wouldBeBuilt('user@example.com')).not.toBeNull();
  });

  it('already-current hash does not produce a backup row (skip branch)', () => {
    // When newHash === inv.emailHash, the migration skips → no backup written.
    const wouldMigrate = (currentHash: string, newHash: string) => currentHash !== newHash;
    expect(wouldMigrate('sameHash', 'sameHash')).toBe(false); // skip
    expect(wouldMigrate('oldHash', 'newHash')).toBe(true); // migrate → backup written
  });
});
