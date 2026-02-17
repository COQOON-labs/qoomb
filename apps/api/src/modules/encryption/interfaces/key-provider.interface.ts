/**
 * Key Provider Interface
 *
 * Defines the contract for all key management providers.
 * Each provider implementation decides where and how to retrieve encryption keys.
 *
 * Implementations:
 * - EnvironmentKeyProvider: Loads from environment variables
 * - FileKeyProvider: Loads from encrypted file
 * - CloudKmsKeyProvider: Uses AWS KMS (optional)
 * - VaultKeyProvider: Uses HashiCorp Vault (optional)
 */
export interface KeyProvider {
  /**
   * Retrieve the master encryption key
   *
   * This key is used to derive hive-specific keys via HKDF.
   * The key must be 32 bytes (256 bits) for AES-256-GCM.
   *
   * @returns Promise<Buffer> - 32-byte encryption key
   * @throws Error if key cannot be loaded or is invalid
   */
  getMasterKey(): Promise<Buffer>;

  /**
   * Optional: Load all key versions for rotation support.
   *
   * Providers that implement this allow running the app with multiple
   * concurrent key versions — old versions for decryption of existing data,
   * the current version for all new encryptions.
   *
   * @returns currentVersion and a Map of version → 32-byte key Buffer
   */
  getVersionedKeys?(): Promise<{ currentVersion: number; keys: Map<number, Buffer> }>;

  /**
   * Optional: Rotate to a new key
   *
   * Not all providers support key rotation.
   * When implemented, this should:
   * 1. Generate/retrieve a new key
   * 2. Keep old key accessible for decrypting existing data
   * 3. Use new key for encrypting new data
   *
   * @throws Error if provider doesn't support rotation
   */
  rotate?(): Promise<void>;

  /**
   * Get the provider name for logging
   *
   * Used for debugging and audit logging.
   *
   * @returns string - Provider name (e.g., "environment", "file", "aws-kms")
   */
  getName(): string;
}

/**
 * Encrypted data format with versioning
 *
 * Allows for key rotation and provider changes by tracking
 * which key version was used to encrypt the data.
 */
export interface EncryptedData {
  /**
   * Key version used for encryption
   * Allows decryption even after key rotation
   */
  version: number;

  /**
   * Provider that was used (for audit/debugging).
   * Not stored in the serialized format — undefined when deserialized from storage.
   */
  provider?: string;

  /**
   * The encrypted data
   * Format: [IV (12 bytes)][AuthTag (16 bytes)][Ciphertext]
   */
  data: Buffer;
}

/**
 * Key metadata for tracking and rotation
 */
export interface KeyMetadata {
  version: number;
  provider: string;
  createdAt: Date;
  rotatedAt?: Date;
}
