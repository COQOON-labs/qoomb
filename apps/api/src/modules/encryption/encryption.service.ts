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
  private readonly currentKeyVersion = 1;

  // For key rotation: Map of key version -> master key
  private readonly keyVersions = new Map<number, Buffer>();

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
      // Step 1: Load master key
      this.logger.log('Loading master encryption key...');
      this.masterKey = await this.keyProvider.getMasterKey();
      this.keyVersions.set(this.currentKeyVersion, this.masterKey);

      // Step 2: Run self-test
      this.logger.log('Running encryption self-test...');
      this.runSelfTest();

      this.logger.log(
        '✅ Encryption service initialized successfully ' +
          `(provider: ${this.keyProvider.getName()}, ` +
          `key version: ${this.currentKeyVersion})`
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
          '═══════════════════════════════════════════════════════\n'
      );
    }
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
    const masterKey = this.keyVersions.get(keyVersion);

    if (!masterKey) {
      throw new Error(
        `Key version ${keyVersion} not available. ` + `Current version: ${this.currentKeyVersion}`
      );
    }

    // HKDF: Derive hive-specific key
    const derived = crypto.hkdfSync(
      'sha256', // Hash algorithm
      masterKey, // Input key material
      Buffer.from(hiveId), // Salt (hive-specific)
      Buffer.from('qoomb-hive-encryption'), // Info string
      32 // Output length (32 bytes = 256 bits)
    );
    return Buffer.from(derived);
  }

  /**
   * Encrypt data for a specific hive
   *
   * Uses AES-256-GCM (authenticated encryption):
   * - 256-bit key (derived per-hive)
   * - 96-bit random IV (initialization vector)
   * - 128-bit authentication tag
   *
   * Output format: [IV (16)][AuthTag (16)][Ciphertext]
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
          '- Crypto library issues\n'
      );
    }
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
