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

  getName(): string {
    return 'environment';
  }
}
