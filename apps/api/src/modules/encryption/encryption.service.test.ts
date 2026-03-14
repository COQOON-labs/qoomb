/**
 * Unit tests for EncryptionService.
 *
 * Coverage targets:
 * - AES-256-GCM encrypt/decrypt round-trip
 * - Per-hive key isolation (cross-hive decryption failure)
 * - Tamper detection via GCM authentication tag
 * - User-scoped encryption (encryptForUser/decryptForUser)
 * - Email blind index (hashEmail)
 * - Storage serialization round-trip
 * - Error paths: wrong hive, wrong user, corrupted data, invalid format
 * - Key version and provider name accessors
 *
 * The service is initialised with the environment key provider using a
 * freshly-generated random key so tests are isolated from any real secrets.
 */

import * as crypto from 'crypto';

// Set env vars BEFORE importing the service — KeyProviderFactory reads them
// at construction time inside the EncryptionService constructor.
process.env['KEY_PROVIDER'] = 'environment';
process.env['ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');

import { EncryptionService } from './encryption.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createService(): Promise<EncryptionService> {
  const svc = new EncryptionService();
  await svc.onModuleInit();
  return svc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// encrypt / decrypt
// ═══════════════════════════════════════════════════════════════════════════════

describe('EncryptionService — encrypt / decrypt', () => {
  let svc: EncryptionService;
  const hiveId = crypto.randomUUID();

  beforeAll(async () => {
    svc = await createService();
  });

  it('round-trips plaintext through AES-256-GCM', () => {
    const plain = 'Sensitive business data';
    expect(svc.decrypt(svc.encrypt(plain, hiveId), hiveId)).toBe(plain);
  });

  it('encrypts the empty string without throwing', () => {
    const enc = svc.encrypt('', hiveId);
    expect(svc.decrypt(enc, hiveId)).toBe('');
  });

  it('handles unicode and emoji content', () => {
    const plain = 'Ärger 🔒 über Ölfelder — こんにちは';
    expect(svc.decrypt(svc.encrypt(plain, hiveId), hiveId)).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext across hives (HKDF isolation)', () => {
    const plain = 'same data';
    const hiveA = crypto.randomUUID();
    const hiveB = crypto.randomUUID();
    const encA = svc.encrypt(plain, hiveA);
    const encB = svc.encrypt(plain, hiveB);
    expect(encA.data.equals(encB.data)).toBe(false);
  });

  it('produces different ciphertexts on repeated encryption of the same input (random IV)', () => {
    const enc1 = svc.encrypt('same', hiveId);
    const enc2 = svc.encrypt('same', hiveId);
    // IVs are random — identical plaintext must not produce identical output
    expect(enc1.data.equals(enc2.data)).toBe(false);
  });

  it('throws when decrypting with a wrong hive ID (cross-hive isolation)', () => {
    const enc = svc.encrypt('secret', hiveId);
    const wrongHive = crypto.randomUUID();
    expect(() => svc.decrypt(enc, wrongHive)).toThrow();
  });

  it('throws when ciphertext bytes are tampered (GCM auth-tag check)', () => {
    const enc = svc.encrypt('secret', hiveId);
    // Flip a bit inside the ciphertext area (bytes 0-11 = IV, 12-27 = auth tag, 28+ = ciphertext)
    enc.data[30] ^= 0xff;
    expect(() => svc.decrypt(enc, hiveId)).toThrow();
  });

  it('throws when the authentication tag is tampered', () => {
    const enc = svc.encrypt('secret', hiveId);
    // Corrupt the auth tag (bytes 12-27)
    enc.data[15] ^= 0xaa;
    expect(() => svc.decrypt(enc, hiveId)).toThrow();
  });

  it('returns version number and provider name on encrypted object', () => {
    const enc = svc.encrypt('data', hiveId);
    expect(enc.version).toBe(1);
    expect(enc.provider).toBe('environment');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// encryptForUser / decryptForUser
// ═══════════════════════════════════════════════════════════════════════════════

describe('EncryptionService — encryptForUser / decryptForUser', () => {
  let svc: EncryptionService;
  const userId = crypto.randomUUID();

  beforeAll(async () => {
    svc = await createService();
  });

  it('round-trips user-scoped plaintext', () => {
    const plain = 'user@example.com';
    expect(svc.decryptForUser(svc.encryptForUser(plain, userId), userId)).toBe(plain);
  });

  it('throws for empty plaintext (encryptForUser guard)', () => {
    expect(() => svc.encryptForUser('', userId)).toThrow('plaintext must not be empty');
  });

  it('produces output in the v{n}: serialized format', () => {
    const stored = svc.encryptForUser('data', userId);
    expect(stored).toMatch(/^v\d+:/);
  });

  it('user-scoped ciphertext differs from hive-scoped ciphertext for the same input', () => {
    const plain = 'data';
    const hiveId = crypto.randomUUID();
    const hiveCipher = svc.serializeToStorage(svc.encrypt(plain, hiveId));
    const userCipher = svc.encryptForUser(plain, userId);
    expect(hiveCipher).not.toBe(userCipher);
  });

  it('throws when decrypting with the wrong userId (cross-user isolation)', () => {
    const stored = svc.encryptForUser('secret', userId);
    const wrongUser = crypto.randomUUID();
    expect(() => svc.decryptForUser(stored, wrongUser)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// hashEmail
// ═══════════════════════════════════════════════════════════════════════════════

describe('EncryptionService — hashEmail', () => {
  let svc: EncryptionService;

  beforeAll(async () => {
    svc = await createService();
  });

  it('returns a 64-character lowercase hex string', () => {
    expect(svc.hashEmail('test@example.com')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const email = 'test@example.com';
    expect(svc.hashEmail(email)).toBe(svc.hashEmail(email));
  });

  it('is case-insensitive (normalised before hashing)', () => {
    expect(svc.hashEmail('Test@Example.COM')).toBe(svc.hashEmail('test@example.com'));
  });

  it('trims leading/trailing whitespace before hashing', () => {
    expect(svc.hashEmail('  test@example.com  ')).toBe(svc.hashEmail('test@example.com'));
  });

  it('produces different hashes for different email addresses', () => {
    const h1 = svc.hashEmail('alice@example.com');
    const h2 = svc.hashEmail('bob@example.com');
    expect(h1).not.toBe(h2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// serializeToStorage / parseFromStorage
// ═══════════════════════════════════════════════════════════════════════════════

describe('EncryptionService — serializeToStorage / parseFromStorage', () => {
  let svc: EncryptionService;
  const hiveId = crypto.randomUUID();

  beforeAll(async () => {
    svc = await createService();
  });

  it('round-trips EncryptedData through serialize → parse → decrypt', () => {
    const plain = 'storage round-trip data';
    const enc = svc.encrypt(plain, hiveId);
    const serialized = svc.serializeToStorage(enc);
    const parsed = svc.parseFromStorage(serialized);
    expect(svc.decrypt(parsed, hiveId)).toBe(plain);
  });

  it('serialized format starts with v{version}:', () => {
    const serialized = svc.serializeToStorage(svc.encrypt('x', hiveId));
    expect(serialized).toMatch(/^v1:/);
  });

  it('parseFromStorage throws on missing version prefix', () => {
    expect(() => svc.parseFromStorage('invaliddata')).toThrow('Invalid encrypted data format');
  });

  it('parseFromStorage throws on empty string', () => {
    expect(() => svc.parseFromStorage('')).toThrow('Invalid encrypted data format');
  });

  it('parseFromStorage throws when format has no colon separator', () => {
    expect(() => svc.parseFromStorage('v1')).toThrow('Invalid encrypted data format');
  });

  it('parseFromStorage throws when version is not prefixed with v', () => {
    expect(() => svc.parseFromStorage('1:somebase64data')).toThrow('Invalid encrypted data format');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Accessors
// ═══════════════════════════════════════════════════════════════════════════════

describe('EncryptionService — accessors', () => {
  let svc: EncryptionService;

  beforeAll(async () => {
    svc = await createService();
  });

  it('getCurrentKeyVersion returns 1 for single-key setup', () => {
    expect(svc.getCurrentKeyVersion()).toBe(1);
  });

  it('getProviderName returns "environment"', () => {
    expect(svc.getProviderName()).toBe('environment');
  });
});
