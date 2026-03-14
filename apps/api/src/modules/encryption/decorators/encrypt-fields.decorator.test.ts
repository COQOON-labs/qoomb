/**
 * Unit tests for @EncryptFields, @DecryptFields, and @EncryptDecryptFields decorators.
 *
 * Coverage targets:
 * - @EncryptFields encrypts flat and nested fields in method input arguments
 * - @DecryptFields decrypts flat and nested fields in the method return value
 * - @EncryptDecryptFields combines both: encrypt input → run method → decrypt output
 * - User-scoped (userIdArg) vs hive-scoped (hiveIdArg) encryption paths
 * - Null / undefined / missing field handling (skipped gracefully)
 * - Plaintext fallback in @DecryptFields (migration window, no throw)
 * - Nested wildcard path support: 'relation.*.field'
 * - Error: class missing `enc` property throws at decoration time
 */

import * as crypto from 'crypto';

// Set env vars BEFORE importing anything that triggers EncryptionService construction.
process.env['KEY_PROVIDER'] = 'environment';
process.env['ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');

import { EncryptionService } from '../encryption.service'; // eslint-disable-line import-x/order -- env vars must be set before these imports
import { EncryptFields, DecryptFields, EncryptDecryptFields } from './encrypt-fields.decorator';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createService(): Promise<EncryptionService> {
  const svc = new EncryptionService();
  await svc.onModuleInit();
  return svc;
}

/** Build a minimal test service class with the given EncryptionService injected as `enc`. */
function buildTestService(enc: EncryptionService) {
  class TestService {
    enc = enc; // convention required by getEnc() helper in the decorator

    @EncryptFields({ fields: ['name', 'description'], hiveIdArg: 1 })
    createHive(data: Record<string, unknown>, _hiveId: string): Record<string, unknown> {
      return { ...data };
    }

    @DecryptFields({ fields: ['name', 'description'], hiveIdArg: 1 })
    getHive(data: Record<string, unknown>, _hiveId: string): Record<string, unknown> {
      return { ...data };
    }

    @EncryptDecryptFields({ fields: ['title'], hiveIdArg: 1 })
    updateEvent(data: Record<string, unknown>, _hiveId: string): Record<string, unknown> {
      return { ...data };
    }

    @EncryptFields({ fields: ['name', 'fields.*.label'], hiveIdArg: 1 })
    createList(data: Record<string, unknown>, _hiveId: string): Record<string, unknown> {
      return { ...data };
    }

    @DecryptFields({ fields: ['name', 'fields.*.label'], hiveIdArg: 1 })
    getList(data: Record<string, unknown>, _hiveId: string): Record<string, unknown> {
      return { ...data };
    }

    @EncryptFields({ fields: ['email'], userIdArg: 1 })
    createUser(data: Record<string, unknown>, _userId: string): Record<string, unknown> {
      return { ...data };
    }

    @DecryptFields({ fields: ['email'], userIdArg: 1 })
    getUser(data: Record<string, unknown>, _userId: string): Record<string, unknown> {
      return { ...data };
    }
  }

  return new TestService();
}

// ═══════════════════════════════════════════════════════════════════════════════
// @EncryptFields — hive-scoped
// ═══════════════════════════════════════════════════════════════════════════════

describe('@EncryptFields (hive-scoped, flat fields)', () => {
  let enc: EncryptionService;
  let svc: ReturnType<typeof buildTestService>;
  const hiveId = crypto.randomUUID();

  beforeAll(async () => {
    enc = await createService();
    svc = buildTestService(enc);
  });

  it('encrypts specified fields before the method executes', () => {
    const result = svc.createHive({ name: 'Hive A', description: 'Secret' }, hiveId);
    // Fields must not be plaintext anymore
    expect(result['name']).not.toBe('Hive A');
    expect(result['description']).not.toBe('Secret');
    // Must be parseable as stored encrypted data
    expect(() => enc.parseFromStorage(result['name'] as string)).not.toThrow();
  });

  it('leaves fields not listed in `fields` option unchanged', () => {
    const result = svc.createHive({ name: 'Hive A', extra: 'keep-me' }, hiveId);
    expect(result['extra']).toBe('keep-me');
  });

  it('skips null field values without throwing', () => {
    const result = svc.createHive({ name: 'Hive A', description: null }, hiveId);
    expect(result['description']).toBeNull();
  });

  it('skips undefined field values without throwing', () => {
    const result = svc.createHive({ name: 'Hive A' }, hiveId);
    expect(result['description']).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// @EncryptFields — nested wildcard paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('@EncryptFields (nested wildcard path: fields.*.label)', () => {
  let enc: EncryptionService;
  let svc: ReturnType<typeof buildTestService>;
  const hiveId = crypto.randomUUID();

  beforeAll(async () => {
    enc = await createService();
    svc = buildTestService(enc);
  });

  it('encrypts each element of a nested array path', () => {
    const input = {
      name: 'My List',
      fields: [{ label: 'Column A' }, { label: 'Column B' }],
    };
    const result = svc.createList({ ...input, fields: [...input.fields] }, hiveId);
    const fields = result['fields'] as Array<{ label: string }>;
    expect(fields[0].label).not.toBe('Column A');
    expect(fields[1].label).not.toBe('Column B');
    expect(() => enc.parseFromStorage(fields[0].label)).not.toThrow();
  });

  it('also encrypts the flat `name` field alongside nested paths', () => {
    const input = { name: 'My List', fields: [] };
    const result = svc.createList({ ...input }, hiveId);
    expect(result['name']).not.toBe('My List');
  });

  it('handles an empty nested array without throwing', () => {
    const result = svc.createList({ name: 'Empty', fields: [] }, hiveId);
    expect(result['fields']).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// @DecryptFields — hive-scoped
// ═══════════════════════════════════════════════════════════════════════════════

describe('@DecryptFields (hive-scoped, flat fields)', () => {
  let enc: EncryptionService;
  let svc: ReturnType<typeof buildTestService>;
  const hiveId = crypto.randomUUID();

  beforeAll(async () => {
    enc = await createService();
    svc = buildTestService(enc);
  });

  it('decrypts specified fields in the return value', async () => {
    const encName = enc.serializeToStorage(enc.encrypt('Hive Alpha', hiveId));
    const encDesc = enc.serializeToStorage(enc.encrypt('Top secret', hiveId));
    const result = await svc.getHive({ name: encName, description: encDesc }, hiveId);
    expect(result['name']).toBe('Hive Alpha');
    expect(result['description']).toBe('Top secret');
  });

  it('falls back gracefully to plaintext when field is not encrypted (migration window)', async () => {
    // During a migration window old records may not yet be encrypted
    const result = await svc.getHive({ name: 'plain-text-not-yet-encrypted' }, hiveId);
    expect(result['name']).toBe('plain-text-not-yet-encrypted');
  });

  it('skips null fields without throwing', async () => {
    const result = await svc.getHive({ name: null }, hiveId);
    expect(result['name']).toBeNull();
  });

  it('leaves non-listed fields unchanged', async () => {
    const encName = enc.serializeToStorage(enc.encrypt('Test', hiveId));
    const result = await svc.getHive({ name: encName, extra: 'unchanged' }, hiveId);
    expect(result['extra']).toBe('unchanged');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// @DecryptFields — nested wildcard paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('@DecryptFields (nested wildcard path: fields.*.label)', () => {
  let enc: EncryptionService;
  let svc: ReturnType<typeof buildTestService>;
  const hiveId = crypto.randomUUID();

  beforeAll(async () => {
    enc = await createService();
    svc = buildTestService(enc);
  });

  it('decrypts each element of a nested array path', async () => {
    const stored = {
      name: enc.serializeToStorage(enc.encrypt('My List', hiveId)),
      fields: [
        { label: enc.serializeToStorage(enc.encrypt('Col A', hiveId)) },
        { label: enc.serializeToStorage(enc.encrypt('Col B', hiveId)) },
      ],
    };
    const result = await svc.getList(stored, hiveId);
    const fields = result['fields'] as Array<{ label: string }>;
    expect(fields[0].label).toBe('Col A');
    expect(fields[1].label).toBe('Col B');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// @EncryptDecryptFields
// ═══════════════════════════════════════════════════════════════════════════════

describe('@EncryptDecryptFields', () => {
  let svc: ReturnType<typeof buildTestService>;
  const hiveId = crypto.randomUUID();

  beforeAll(async () => {
    const enc = await createService();
    svc = buildTestService(enc);
  });

  it('encrypts input and decrypts output — caller sees original plaintext', async () => {
    const result = await svc.updateEvent({ title: 'Encrypted Meeting' }, hiveId);
    // Output must be decrypted back to plaintext
    expect(result['title']).toBe('Encrypted Meeting');
  });

  it('leaves non-listed fields unchanged through the round-trip', async () => {
    const result = await svc.updateEvent({ title: 'Meeting', extra: 'meta' }, hiveId);
    expect(result['extra']).toBe('meta');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// User-scoped encryption (userIdArg)
// ═══════════════════════════════════════════════════════════════════════════════

describe('User-scoped encryption (userIdArg)', () => {
  let enc: EncryptionService;
  let svc: ReturnType<typeof buildTestService>;
  const userId = crypto.randomUUID();

  beforeAll(async () => {
    enc = await createService();
    svc = buildTestService(enc);
  });

  it('@EncryptFields with userIdArg encrypts field using the user key', () => {
    const result = svc.createUser({ email: 'user@example.com' }, userId);
    expect(result['email']).not.toBe('user@example.com');
    // User-scoped output is in the same v{n}: format
    expect(result['email'] as string).toMatch(/^v\d+:/);
  });

  it('@DecryptFields with userIdArg decrypts field using the user key', async () => {
    const stored = enc.encryptForUser('user@example.com', userId);
    const result = await svc.getUser({ email: stored }, userId);
    expect(result['email']).toBe('user@example.com');
  });

  it('user-scoped ciphertext differs from hive-scoped ciphertext for the same plaintext', () => {
    const plain = 'shared-value';
    const hiveId = crypto.randomUUID();
    const hiveCipher = enc.serializeToStorage(enc.encrypt(plain, hiveId));
    const userCipher = enc.encryptForUser(plain, userId);
    expect(hiveCipher).not.toBe(userCipher);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error paths
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error paths', () => {
  it('throws when the class does not have an `enc` property', () => {
    class BrokenService {
      // No `enc` property — getEnc() will throw
      @EncryptFields({ fields: ['name'], hiveIdArg: 1 })
      create(data: Record<string, unknown>, _hiveId: string) {
        return data;
      }
    }

    const broken = new BrokenService();
    expect(() => broken.create({ name: 'test' }, 'some-hive-id')).toThrow(
      'class must have an `enc` property'
    );
  });
});
