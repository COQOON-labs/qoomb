import * as crypto from 'crypto';

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

import { KeyProvider, EncryptedData } from './interfaces/key-provider.interface';
import { KeyProviderFactory } from './key-provider.factory';

/**
 * Encryption Service
 *
 * Provides encryption and decryption for hive data using AES-256-GCM.
 *
 * Key Architecture:
 * - Master Key: Retrieved from KeyProvider (environment, file, KMS, Vault)
 * - Hive Keys: Derived from Master Key using HKDF (one key per hive)
 * - Algorithm: AES-256-GCM (authenticated encryption)
 * - Key Derivation: HKDF-SHA256
 *
 * Security Features:
 * - Per-hive key isolation (compromise of one hive ≠ all hives)
 * - Authenticated encryption (prevents tampering)
 * - Key versioning (supports key rotation)
 * - Startup self-test (validates encryption/decryption)
 *
 * Usage:
 * ```typescript
 * const encrypted = encryptionService.encrypt('sensitive data', hiveId);
 * const decrypted = encryptionService.decrypt(encrypted, hiveId);
 * ```
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly keyProvider: KeyProvider;
  private masterKey: Buffer | null = null;
  private currentKeyVersion = 1;

  // For key rotation: Map of key version -> master key
  private readonly keyVersions = new Map<number, Buffer>();

  // Cache for derived keys: `${version}:${info}:${scopeId}` -> 32-byte Buffer.
  // Safe: entries are deterministic and bounded by (active scopes × key versions × info strings).
  // Cleared automatically on app restart (service is singleton, not request-scoped).
  private readonly derivedKeyCache = new Map<string, Buffer>();

  constructor() {
    // Factory creates the right provider based on KEY_PROVIDER env var
    this.keyProvider = KeyProviderFactory.create();
    this.logger.log(`Using key provider: ${this.keyProvider.getName()}`);
  }

  /**
   * Initialize encryption service on module startup
   *
   * 1. Loads master key from provider
   * 2. Runs encryption self-test
   * 3. Validates everything works correctly
   *
   * If any step fails, the application will not start.
   */
  async onModuleInit() {
    try {
      // Step 1: Load master key(s)
      this.logger.log('Loading master encryption key...');
      if (this.keyProvider.getVersionedKeys) {
        // Rotation-aware path: load all available key versions
        const { currentVersion, keys } = await this.keyProvider.getVersionedKeys();
        this.currentKeyVersion = currentVersion;
        for (const [version, key] of keys) {
          this.keyVersions.set(version, key);
        }
        this.masterKey = keys.get(currentVersion) ?? null;
      } else {
        // Fallback path: single key, version 1
        this.masterKey = await this.keyProvider.getMasterKey();
        this.keyVersions.set(this.currentKeyVersion, this.masterKey);
      }

      // Step 2: Run self-test
      this.logger.log('Running encryption self-test...');
      this.runSelfTest();

      const loadedVersions = [...this.keyVersions.keys()].sort().join(', ');
      this.logger.log(
        '✅ Encryption service initialized successfully ' +
          `(provider: ${this.keyProvider.getName()}, ` +
          `versions loaded: [${loadedVersions}], current: ${this.currentKeyVersion})`
      );
    } catch (error) {
      this.logger.error('❌ Failed to initialize encryption service');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        '═══════════════════════════════════════════════════════\n' +
          '  ENCRYPTION SERVICE INITIALIZATION FAILED\n' +
          '═══════════════════════════════════════════════════════\n' +
          '\n' +
          `${errorMessage}\n` +
          '\n' +
          'The application cannot start without a working encryption\n' +
          'service. Please fix the configuration and try again.\n' +
          '\n' +
          'See docs/SECURITY.md for setup instructions.\n' +
          '═══════════════════════════════════════════════════════\n',
        { cause: error }
      );
    }
  }

  /**
   * Derive a scope-specific encryption key from the master key
   *
   * Generic HKDF helper used by both hive and user key derivation.
   *
   * @param scopeId  - UUID of the hive or user
   * @param info     - Context string ("qoomb-hive-encryption" or "qoomb-user-encryption")
   * @param keyVersion - Key version to use (default: current)
   * @returns 32-byte derived key
   */
  private deriveKey(scopeId: string, info: string, keyVersion = this.currentKeyVersion): Buffer {
    const cacheKey = `${keyVersion}:${info}:${scopeId}`;
    const cached = this.derivedKeyCache.get(cacheKey);
    if (cached) return cached;

    const masterKey = this.keyVersions.get(keyVersion);

    if (!masterKey) {
      throw new Error(
        `Key version ${keyVersion} not available. ` + `Current version: ${this.currentKeyVersion}`
      );
    }

    const derived = crypto.hkdfSync(
      'sha256',
      masterKey,
      Buffer.from(scopeId),
      Buffer.from(info),
      32
    );
    const key = Buffer.from(derived);
    this.derivedKeyCache.set(cacheKey, key);
    return key;
  }

  /**
   * Derive a hive-specific encryption key from the master key
   *
   * Uses HKDF (HMAC-based Key Derivation Function) with:
   * - Hash: SHA-256
   * - Input: Master key
   * - Salt: Hive ID (provides hive isolation)
   * - Info: Static string "qoomb-hive-encryption"
   * - Output: 32 bytes (256 bits for AES-256)
   *
   * Benefits:
   * - Each hive has a unique key
   * - Deterministic (same hiveId = same key)
   * - No additional storage needed
   * - Compromise of one key ≠ all keys
   *
   * @param hiveId - UUID of the hive
   * @param keyVersion - Key version to use (default: current)
   * @returns 32-byte derived key
   */
  private deriveHiveKey(hiveId: string, keyVersion = this.currentKeyVersion): Buffer {
    return this.deriveKey(hiveId, 'qoomb-hive-encryption', keyVersion);
  }

  /**
   * Encrypt data for a specific hive
   *
   * Uses AES-256-GCM (authenticated encryption):
   * - 256-bit key (derived per-hive)
   * - 96-bit random IV (initialization vector)
   * - 128-bit authentication tag
   *
   * Output format: [IV (12)][AuthTag (16)][Ciphertext]
   *
   * @param plaintext - Data to encrypt
   * @param hiveId - UUID of the hive
   * @returns EncryptedData with version, provider, and encrypted buffer
   */
  encrypt(plaintext: string, hiveId: string): EncryptedData {
    // Derive hive-specific key
    const hiveKey = this.deriveHiveKey(hiveId);

    // Generate random IV (96 bits = 12 bytes for GCM)
    const iv = crypto.randomBytes(12);

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', hiveKey, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Format: [IV][AuthTag][Encrypted Data]
    const data = Buffer.concat([iv, authTag, encrypted]);

    return {
      version: this.currentKeyVersion,
      provider: this.keyProvider.getName(),
      data,
    };
  }

  /**
   * Decrypt data for a specific hive
   *
   * Extracts IV and authentication tag from encrypted data,
   * then decrypts using hive-specific key.
   *
   * @param encrypted - EncryptedData object
   * @param hiveId - UUID of the hive
   * @returns Decrypted plaintext
   * @throws Error if authentication fails or key version unavailable
   */
  decrypt(encrypted: EncryptedData, hiveId: string): string {
    // Derive hive-specific key (for the version used during encryption)
    const hiveKey = this.deriveHiveKey(hiveId, encrypted.version);

    // Extract IV, authTag, and ciphertext
    const iv = encrypted.data.subarray(0, 12);
    const authTag = encrypted.data.subarray(12, 28);
    const ciphertext = encrypted.data.subarray(28);

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', hiveKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  }

  // ── User-Scoped Encryption ──────────────────────────────────────────────────

  /**
   * Encrypt a field for a specific user.
   *
   * Uses the same AES-256-GCM scheme as encrypt(), but derives the key from
   * the userId instead of the hiveId.  This isolates user PII (email, fullName)
   * from hive data — even a compromise of one user's key does not affect others.
   *
   * @param plaintext - Data to encrypt
   * @param userId    - UUID of the user
   * @returns Serialized storage string (same v{version}:{base64} format)
   */
  encryptForUser(plaintext: string, userId: string): string {
    if (!plaintext) {
      throw new Error('encryptForUser: plaintext must not be empty');
    }
    const userKey = this.deriveKey(userId, 'qoomb-user-encryption');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', userKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    const data = Buffer.concat([iv, authTag, encrypted]);
    return this.serializeToStorage({
      version: this.currentKeyVersion,
      provider: this.keyProvider.getName(),
      data,
    });
  }

  /**
   * Decrypt a user-specific encrypted field.
   *
   * @param stored  - Storage string from the database
   * @param userId  - UUID of the user
   * @returns Decrypted plaintext
   */
  decryptForUser(stored: string, userId: string): string {
    const encryptedData = this.parseFromStorage(stored);
    const userKey = this.deriveKey(userId, 'qoomb-user-encryption', encryptedData.version);
    const iv = encryptedData.data.subarray(0, 12);
    const authTag = encryptedData.data.subarray(12, 28);
    const ciphertext = encryptedData.data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', userKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }

  /**
   * Compute a deterministic HMAC-SHA256 blind index for an email address.
   *
   * The HMAC key is derived from the master key with a fixed info string, so
   * the hash is only reproducible by someone who knows the master key.
   * The input is normalised (lowercase + trimmed) before hashing.
   *
   * Result is a 64-character hex string suitable for a VARCHAR(64) column
   * with a UNIQUE index (used for O(1) lookups without storing plaintext).
   *
   * @param email - Raw email address (any case, optional whitespace)
   * @returns 64-character lowercase hex string
   */
  hashEmail(email: string): string {
    const masterKey = this.keyVersions.get(this.currentKeyVersion);
    if (!masterKey) {
      throw new Error(
        `Key version ${this.currentKeyVersion} not available. ` +
          `Encryption service may not be initialized.`
      );
    }
    const hmacKey = Buffer.from(
      crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from('qoomb-email-hash'), 32)
    );
    return crypto.createHmac('sha256', hmacKey).update(email.toLowerCase().trim()).digest('hex');
  }

  /**
   * Self-test: Encrypt and decrypt test data
   *
   * Validates that:
   * 1. Encryption works
   * 2. Decryption works
   * 3. Decrypted data matches original
   * 4. Different hives get different ciphertexts
   *
   * If this test fails, there's a critical problem with the
   * encryption setup and the application should not start.
   */
  private runSelfTest(): void {
    const testData = 'qoomb-encryption-test-' + crypto.randomBytes(16).toString('hex');
    const testHiveId = crypto.randomUUID();

    try {
      // Test 1: Basic encryption/decryption
      const encrypted = this.encrypt(testData, testHiveId);
      const decrypted = this.decrypt(encrypted, testHiveId);

      if (decrypted !== testData) {
        throw new Error(
          'Decrypted data does not match original.\n' +
            `Expected: ${testData}\n` +
            `Got: ${decrypted}`
        );
      }

      // Test 2: Different hives produce different ciphertexts
      const testHiveId2 = crypto.randomUUID();
      const encrypted2 = this.encrypt(testData, testHiveId2);

      if (encrypted.data.equals(encrypted2.data)) {
        throw new Error(
          'Different hives produced identical ciphertext.\n' +
            'HKDF key derivation may not be working correctly.'
        );
      }

      // Test 3: Wrong hive ID should fail
      try {
        this.decrypt(encrypted, testHiveId2);
        throw new Error('Decryption succeeded with wrong hive ID.\n' + 'This should have failed!');
      } catch (error) {
        // Expected to fail - this is correct
        const errorMessage = error instanceof Error ? error.message : '';
        if (errorMessage.includes('This should have failed')) {
          throw error;
        }
      }

      // Test 4: Storage serialization round-trip
      const serialized = this.serializeToStorage(encrypted);
      if (!serialized.startsWith(`v${this.currentKeyVersion}:`)) {
        throw new Error(
          `Serialized data has unexpected format: ${serialized.slice(0, 20)}...\n` +
            `Expected prefix: v${this.currentKeyVersion}:`
        );
      }
      const parsed = this.parseFromStorage(serialized);
      const decryptedFromStorage = this.decrypt(parsed, testHiveId);
      if (decryptedFromStorage !== testData) {
        throw new Error(
          'Storage round-trip (serialize → parse → decrypt) failed.\n' +
            `Expected: ${testData}\n` +
            `Got: ${decryptedFromStorage}`
        );
      }

      // Test 5: User encryption round-trip
      const testUserId = crypto.randomUUID();
      const encryptedForUser = this.encryptForUser(testData, testUserId);
      const decryptedForUser = this.decryptForUser(encryptedForUser, testUserId);
      if (decryptedForUser !== testData) {
        throw new Error(
          'User encryption round-trip failed.\n' +
            `Expected: ${testData}\n` +
            `Got: ${decryptedForUser}`
        );
      }

      // Test 6: Multi-version decryption (only when multiple key versions are loaded)
      // Verifies that data encrypted with an older key version can still be decrypted
      // after a key rotation — the core guarantee of the versioned key scheme.
      if (this.keyVersions.size > 1) {
        const oldVersions = [...this.keyVersions.keys()].filter(
          (v) => v !== this.currentKeyVersion
        );
        const oldVersion = oldVersions[0]; // test against the first non-current version
        // Encrypt directly with the old key so the stored version tag matches
        const oldKey = this.deriveHiveKey(testHiveId, oldVersion);
        const ivOld = crypto.randomBytes(12);
        const cipherOld = crypto.createCipheriv('aes-256-gcm', oldKey, ivOld);
        let encOld = cipherOld.update(testData, 'utf8');
        encOld = Buffer.concat([encOld, cipherOld.final()]);
        const tagOld = cipherOld.getAuthTag();
        const dataOld = Buffer.concat([ivOld, tagOld, encOld]);
        const storedOld = this.serializeToStorage({ version: oldVersion, data: dataOld });
        const parsedOld = this.parseFromStorage(storedOld);
        const decryptedOld = this.decrypt(parsedOld, testHiveId);
        if (decryptedOld !== testData) {
          throw new Error(
            `Multi-version decryption failed: could not decrypt V${oldVersion} data with current setup.\n` +
              `Expected: ${testData}\n` +
              `Got: ${decryptedOld}`
          );
        }
      }

      // Test 7: Email hash is deterministic and case-insensitive
      const testEmail = 'Test@Example.COM';
      const hash1 = this.hashEmail(testEmail);
      const hash2 = this.hashEmail(testEmail.toLowerCase());
      if (hash1 !== hash2) {
        throw new Error('Email hash is not case-insensitive (hashEmail normalization failed).');
      }
      if (hash1.length !== 64) {
        throw new Error(`Email hash has unexpected length: ${hash1.length} (expected 64).`);
      }

      this.logger.log('✅ Encryption self-test passed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        '❌ Encryption self-test failed!\n' +
          '\n' +
          'The encryption/decryption process is not working correctly.\n' +
          'This indicates a critical problem with the encryption setup.\n' +
          '\n' +
          `Error: ${errorMessage}\n` +
          '\n' +
          'Possible causes:\n' +
          '- Invalid encryption key\n' +
          '- Corrupted key provider implementation\n' +
          '- Crypto library issues\n',
        { cause: error }
      );
    }
  }

  /**
   * Serialize encrypted data to a storage string
   *
   * Format: v{version}:{base64(data)}
   * Example: v1:AAABBBCCC...
   *
   * Embedding the version in the stored string means we can always
   * decrypt existing records correctly after a key rotation.
   *
   * @param encrypted - EncryptedData returned by encrypt()
   * @returns Storage string with version prefix
   */
  serializeToStorage(encrypted: EncryptedData): string {
    return `v${encrypted.version}:${encrypted.data.toString('base64')}`;
  }

  /**
   * Parse a storage string back into EncryptedData
   *
   * Expected format: v{version}:{base64(data)}
   * Example: v1:AAABBBCCC...
   *
   * @param stored - Storage string from the database
   * @returns EncryptedData ready to pass to decrypt()
   * @throws Error if the storage string does not match the expected format
   */
  parseFromStorage(stored: string): EncryptedData {
    const match = /^v(\d+):(.+)$/.exec(stored);

    if (!match) {
      throw new Error(
        `Invalid encrypted data format: expected v{version}:{base64}, got: ${stored.slice(0, 20)}...`
      );
    }

    return {
      version: parseInt(match[1], 10),
      data: Buffer.from(match[2], 'base64'),
    };
  }

  /**
   * Get current key version
   *
   * Useful for monitoring and debugging.
   */
  getCurrentKeyVersion(): number {
    return this.currentKeyVersion;
  }

  /**
   * Get key provider name
   *
   * Useful for logging and monitoring.
   */
  getProviderName(): string {
    return this.keyProvider.getName();
  }
}
