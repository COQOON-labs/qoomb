import * as crypto from 'crypto';
import { promises as fs } from 'fs';

import { Logger } from '@nestjs/common';

import { type KeyProvider } from '../interfaces/key-provider.interface';

/**
 * File-Based Key Provider
 *
 * Loads the master encryption key from an encrypted file.
 * The file is protected with a password (PBKDF2 + AES-256-GCM).
 *
 * Use Cases:
 * - Self-hosting with additional security layer
 * - Key rotation support
 * - Separation of key storage from environment
 * - Docker volume-based key management
 *
 * Configuration:
 * ```bash
 * KEY_PROVIDER=file
 * KEY_FILE_PATH=/secrets/master-key.enc
 * KEY_FILE_PASSWORD=<strong-password>
 * ```
 *
 * Generate encrypted key file:
 * ```bash
 * node scripts/generate-key-file.js \
 *   --output /secrets/master-key.enc \
 *   --password "your-strong-password"
 * ```
 *
 * Security considerations:
 * - Password must be strong (min 20 characters recommended)
 * - File should be read-only (chmod 400)
 * - Supports key rotation with backup
 */
export class FileKeyProvider implements KeyProvider {
  private readonly logger = new Logger(FileKeyProvider.name);
  private readonly filePath: string;
  private readonly password: string;
  private cachedKey: Buffer | null = null;

  constructor() {
    this.filePath = process.env.KEY_FILE_PATH || '/secrets/master-key.enc';
    this.password = process.env.KEY_FILE_PASSWORD || '';

    if (!this.password) {
      throw new Error(
        '\n' +
          '╔════════════════════════════════════════════════════════╗\n' +
          '║  ❌ KEY_FILE_PASSWORD not set                         ║\n' +
          '╠════════════════════════════════════════════════════════╣\n' +
          '║                                                        ║\n' +
          '║  KEY_FILE_PASSWORD is required when using             ║\n' +
          '║  KEY_PROVIDER=file.                                   ║\n' +
          '║                                                        ║\n' +
          '║  This password protects the encrypted key file.       ║\n' +
          '║  Use a strong password (min 20 characters).           ║\n' +
          '║                                                        ║\n' +
          '║  Example:                                             ║\n' +
          '║  KEY_FILE_PASSWORD="my-very-strong-password-123!"     ║\n' +
          '║                                                        ║\n' +
          '╚════════════════════════════════════════════════════════╝\n'
      );
    }

    if (this.password.length < 20) {
      throw new Error(
        'KEY_FILE_PASSWORD is too short (minimum 20 characters).\n' +
          'The password protects the encrypted key file and must be strong.\n' +
          'Use a randomly generated passphrase of at least 20 characters.'
      );
    }
  }

  async getMasterKey(): Promise<Buffer> {
    if (this.cachedKey) {
      return this.cachedKey;
    }

    try {
      // Read encrypted key file
      const encryptedData = await fs.readFile(this.filePath);

      // Decrypt with password
      this.cachedKey = this.decryptKeyFile(encryptedData, this.password);

      // Validate key length
      if (this.cachedKey.length !== 32) {
        throw new Error(
          `Decrypted key has invalid length: ${this.cachedKey.length} bytes (expected 32)`
        );
      }

      this.logger.log(`✅ Master encryption key loaded from file: ${this.filePath}`);

      return this.cachedKey;
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'ENOENT') {
        throw new Error(
          `Key file not found: ${this.filePath}\n` +
            `Generate a key file with: node scripts/generate-key-file.js --output ${this.filePath}`,
          { cause: error }
        );
      }

      if (err.code === 'EACCES') {
        throw new Error(
          `Permission denied reading key file: ${this.filePath}\n` +
            `Ensure the file is readable by the application.`,
          { cause: error }
        );
      }

      const errorMessage = err.message ?? 'Unknown error';
      if (errorMessage.includes('Unsupported state or unable to authenticate data')) {
        throw new Error(
          'Failed to decrypt key file. Wrong password?\n' +
            'Ensure KEY_FILE_PASSWORD matches the password used to encrypt the file.',
          { cause: error }
        );
      }

      throw new Error(
        `Failed to load key from file: ${this.filePath}\n` + `Error: ${errorMessage}`,
        { cause: error }
      );
    }
  }

  /**
   * Rotate to a new key
   *
   * Generates a new random key and encrypts it with the same password.
   * Creates a backup of the old key file before rotating.
   */
  async rotate(): Promise<void> {
    this.logger.log('🔄 Starting key rotation...');

    // Generate new random key
    const newKey = crypto.randomBytes(32);

    // Encrypt new key
    const encryptedData = this.encryptKeyFile(newKey, this.password);

    // Create backup of old key
    const backupPath = `${this.filePath}.backup.${Date.now()}`;
    try {
      await fs.copyFile(this.filePath, backupPath);
      this.logger.log(`✅ Backup created: ${backupPath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create backup during rotation: ${errorMessage}`, { cause: error });
    }

    // Write new key (atomic write)
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, encryptedData);
    await fs.rename(tempPath, this.filePath);

    // Update cache
    this.cachedKey = newKey;

    this.logger.log('✅ Key rotation completed successfully. Old key backed up.');
    this.logger.warn('⚠️  Remember: Old data is encrypted with old key. Keep backup!');
  }

  /**
   * Decrypt key file protected with password
   *
   * Format: [salt (16)][iv (12)][authTag (16)][ciphertext (32)]
   * Total: 76 bytes
   */
  private decryptKeyFile(encrypted: Buffer, password: string): Buffer {
    if (encrypted.length !== 76) {
      throw new Error(
        `Invalid encrypted key file format. Expected 76 bytes, got ${encrypted.length}`
      );
    }

    // Extract components
    const salt = encrypted.subarray(0, 16);
    const iv = encrypted.subarray(16, 28);
    const authTag = encrypted.subarray(28, 44);
    const ciphertext = encrypted.subarray(44);

    // Derive key from password using PBKDF2
    const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    // Decrypt with AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Encrypt key file with password
   *
   * Uses PBKDF2 (100,000 iterations) + AES-256-GCM
   */
  private encryptKeyFile(key: Buffer, password: string): Buffer {
    // Generate random salt and IV
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);

    // Derive key from password
    const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    // Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(key), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: [salt][iv][authTag][encrypted]
    return Buffer.concat([salt, iv, authTag, encrypted]);
  }

  getName(): string {
    return 'file';
  }
}
