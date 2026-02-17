import { Logger } from '@nestjs/common';

import { type KeyProvider } from '../interfaces/key-provider.interface';

/**
 * Environment Variable Key Provider
 *
 * Loads the master encryption key from the ENCRYPTION_KEY environment variable.
 *
 * Use Cases:
 * - Development environments
 * - Docker Compose deployments
 * - Self-hosting without cloud dependencies
 * - Simple production setups
 *
 * Configuration:
 * ```bash
 * KEY_PROVIDER=environment
 * ENCRYPTION_KEY=<base64-encoded-32-byte-key>
 * ```
 *
 * Generate key:
 * ```bash
 * openssl rand -base64 32
 * ```
 *
 * Security considerations:
 * - Key is visible in environment (process.env)
 * - Suitable for most deployments
 * - For higher security, use FileKeyProvider or CloudKmsKeyProvider
 */
export class EnvironmentKeyProvider implements KeyProvider {
  private readonly logger = new Logger(EnvironmentKeyProvider.name);
  private cachedKey: Buffer | null = null;

  // eslint-disable-next-line @typescript-eslint/require-await
  async getMasterKey(): Promise<Buffer> {
    // Return cached key if already loaded
    if (this.cachedKey) {
      return this.cachedKey;
    }

    // Get key from environment
    const keyString = process.env.ENCRYPTION_KEY;

    if (!keyString) {
      throw new Error(
        '\n' +
          '╔════════════════════════════════════════════════════════╗\n' +
          '║  ❌ ENCRYPTION_KEY not set                            ║\n' +
          '╠════════════════════════════════════════════════════════╣\n' +
          '║                                                        ║\n' +
          '║  The ENCRYPTION_KEY environment variable is required  ║\n' +
          '║  when using KEY_PROVIDER=environment.                 ║\n' +
          '║                                                        ║\n' +
          '║  Generate a key:                                      ║\n' +
          '║  $ openssl rand -base64 32                            ║\n' +
          '║                                                        ║\n' +
          '║  Then add to your .env file:                          ║\n' +
          '║  ENCRYPTION_KEY=<generated-key>                       ║\n' +
          '║                                                        ║\n' +
          '╚════════════════════════════════════════════════════════╝\n'
      );
    }

    try {
      // Decode base64 key
      this.cachedKey = Buffer.from(keyString, 'base64');

      // Validate key length (must be 32 bytes for AES-256)
      if (this.cachedKey.length !== 32) {
        throw new Error(
          `ENCRYPTION_KEY must be exactly 32 bytes (256 bits).\n` +
            `Current key is ${this.cachedKey.length} bytes.\n` +
            `Generate a valid key with: openssl rand -base64 32`
        );
      }

      // Validate entropy (prevent weak keys like "aaaaaaaa...")
      const uniqueBytes = new Set(this.cachedKey).size;
      if (uniqueBytes < 16) {
        throw new Error(
          'ENCRYPTION_KEY has insufficient entropy (too many repeated bytes).\n' +
            'The key must be cryptographically random.\n' +
            'Generate a new key with: openssl rand -base64 32'
        );
      }

      this.logger.log('✅ Master encryption key loaded from environment (32 bytes, AES-256)');

      return this.cachedKey;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('ENCRYPTION_KEY')) {
        throw error; // Re-throw our custom errors
      }

      throw new Error(
        'Failed to decode ENCRYPTION_KEY from base64.\n' +
          'Ensure the key is properly base64-encoded.\n' +
          'Generate a new key with: openssl rand -base64 32\n' +
          `Error: ${errorMessage}`
      );
    }
  }

  /**
   * Load multiple key versions for rotation support.
   *
   * Single-key mode (backward compatible — default):
   * ```
   * ENCRYPTION_KEY=<base64>
   * ```
   *
   * Rotation mode (multiple versions):
   * ```
   * ENCRYPTION_KEY_CURRENT=2          # version used for new encryptions
   * ENCRYPTION_KEY_V1=<old base64>    # keep until re-encryption completes
   * ENCRYPTION_KEY_V2=<new base64>    # all new data encrypted with this
   * ```
   *
   * Rotation deployment sequence:
   * 1. Add ENCRYPTION_KEY_CURRENT + _V1 + _V2 to env
   * 2. Restart app (reads V2 for writes, still decrypts V1)
   * 3. Run: pnpm --filter @qoomb/api db:reencrypt --execute
   * 4. Remove ENCRYPTION_KEY_V1 + ENCRYPTION_KEY_CURRENT once complete
   */
  async getVersionedKeys(): Promise<{ currentVersion: number; keys: Map<number, Buffer> }> {
    const currentVersionStr = process.env.ENCRYPTION_KEY_CURRENT;

    if (!currentVersionStr) {
      // Single-key mode — backward compatible
      const key = await this.getMasterKey();
      return { currentVersion: 1, keys: new Map([[1, key]]) };
    }

    const currentVersion = parseInt(currentVersionStr, 10);
    if (isNaN(currentVersion) || currentVersion < 1) {
      throw new Error(
        `ENCRYPTION_KEY_CURRENT must be a positive integer, got: "${currentVersionStr}"`
      );
    }

    const MAX_KEY_VERSIONS = 100;
    const keys = new Map<number, Buffer>();
    let v = 1;
    while (v <= MAX_KEY_VERSIONS && process.env[`ENCRYPTION_KEY_V${v}`]) {
      keys.set(v, this.loadVersionedKey(v));
      v++;
    }

    if (keys.size === 0) {
      throw new Error(
        'ENCRYPTION_KEY_CURRENT is set but no ENCRYPTION_KEY_V{n} variables were found.\n' +
          'Set ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, etc. for rotation mode.'
      );
    }

    if (!keys.has(currentVersion)) {
      throw new Error(
        `ENCRYPTION_KEY_CURRENT=${currentVersion} but ENCRYPTION_KEY_V${currentVersion} is not set.`
      );
    }

    this.logger.log(
      `Key rotation mode: versions [${[...keys.keys()].join(', ')}], current = V${currentVersion}`
    );

    return { currentVersion, keys };
  }

  private loadVersionedKey(version: number): Buffer {
    const envVar = `ENCRYPTION_KEY_V${version}`;
    const keyString = process.env[envVar];

    if (!keyString) {
      throw new Error(`${envVar} is not set.`);
    }

    let key: Buffer;
    try {
      key = Buffer.from(keyString, 'base64');
    } catch {
      throw new Error(`Failed to decode ${envVar} from base64.`);
    }

    if (key.length !== 32) {
      throw new Error(
        `${envVar} must be exactly 32 bytes (256 bits). Current: ${key.length} bytes.\n` +
          `Generate a valid key with: openssl rand -base64 32`
      );
    }

    const uniqueBytes = new Set(key).size;
    if (uniqueBytes < 16) {
      throw new Error(
        `${envVar} has insufficient entropy. Generate a new key: openssl rand -base64 32`
      );
    }

    this.logger.log(`✅ Key V${version} loaded from ${envVar} (32 bytes)`);
    return key;
  }

  getName(): string {
    return 'environment';
  }
}
