import { type KeyProvider } from './interfaces/key-provider.interface';
import { CloudKmsKeyProvider } from './providers/cloud-kms-key.provider';
import { EnvironmentKeyProvider } from './providers/environment-key.provider';
import { FileKeyProvider } from './providers/file-key.provider';
import { VaultKeyProvider } from './providers/vault-key.provider';

/**
 * Key Provider Factory
 *
 * Creates the appropriate key provider based on KEY_PROVIDER environment variable.
 *
 * IMPORTANT: No default provider is used. You MUST explicitly set KEY_PROVIDER.
 * This is a security-first design to prevent accidental misconfigurations.
 *
 * Supported providers:
 * - environment: Load from ENCRYPTION_KEY env var (simplest, Docker-friendly)
 * - file: Load from encrypted file (advanced self-hosting)
 * - aws-kms: Use AWS Key Management Service (enterprise, requires @aws-sdk/client-kms)
 * - vault: Use HashiCorp Vault (enterprise self-hosted, requires node-vault)
 *
 * Example configurations:
 *
 * Development (.env):
 * ```
 * KEY_PROVIDER=environment
 * ENCRYPTION_KEY=<base64-key>
 * ```
 *
 * Production with file:
 * ```
 * KEY_PROVIDER=file
 * KEY_FILE_PATH=/secrets/master-key.enc
 * KEY_FILE_PASSWORD=<strong-password>
 * ```
 *
 * Enterprise with AWS KMS:
 * ```
 * KEY_PROVIDER=aws-kms
 * AWS_KMS_KEY_ID=arn:aws:kms:...
 * AWS_REGION=eu-central-1
 * ```
 *
 * Enterprise self-hosted with Vault:
 * ```
 * KEY_PROVIDER=vault
 * VAULT_ADDR=https://vault.company.com
 * VAULT_TOKEN=<token>
 * ```
 */
export class KeyProviderFactory {
  /**
   * Create the appropriate key provider based on configuration
   *
   * @throws Error if KEY_PROVIDER is not set or unknown
   * @returns KeyProvider instance
   */
  static create(): KeyProvider {
    const providerType = process.env.KEY_PROVIDER;

    // NO DEFAULT! Must be explicitly set
    if (!providerType) {
      throw new Error(
        '\n' +
          '╔═══════════════════════════════════════════════════════════════╗\n' +
          '║                                                               ║\n' +
          '║  ❌ KEY_PROVIDER not configured                              ║\n' +
          '║                                                               ║\n' +
          '╠═══════════════════════════════════════════════════════════════╣\n' +
          '║                                                               ║\n' +
          '║  You MUST explicitly set KEY_PROVIDER to configure how        ║\n' +
          '║  encryption keys are managed.                                 ║\n' +
          '║                                                               ║\n' +
          '║  This is a security-first design to prevent accidental        ║\n' +
          '║  misconfigurations in production.                             ║\n' +
          '║                                                               ║\n' +
          '║  ┌─────────────────────────────────────────────────────────┐ ║\n' +
          '║  │ Available Options:                                      │ ║\n' +
          '║  ├─────────────────────────────────────────────────────────┤ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  │  • environment  - Load from ENCRYPTION_KEY env var     │ ║\n' +
          '║  │                   ✓ Simple, Docker-friendly            │ ║\n' +
          '║  │                   ✓ Best for most deployments          │ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  │  • file        - Load from encrypted file              │ ║\n' +
          '║  │                   ✓ Advanced self-hosting              │ ║\n' +
          '║  │                   ✓ Supports key rotation              │ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  │  • aws-kms     - Use AWS Key Management Service        │ ║\n' +
          '║  │                   ✓ Enterprise grade                   │ ║\n' +
          '║  │                   ✓ Automatic rotation                 │ ║\n' +
          '║  │                   ⚠ Requires @aws-sdk/client-kms       │ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  │  • vault       - Use HashiCorp Vault                   │ ║\n' +
          '║  │                   ✓ Self-hosted enterprise             │ ║\n' +
          '║  │                   ✓ No cloud dependency                │ ║\n' +
          '║  │                   ⚠ Requires node-vault                │ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  └─────────────────────────────────────────────────────────┘ ║\n' +
          '║                                                               ║\n' +
          '║  ┌─────────────────────────────────────────────────────────┐ ║\n' +
          '║  │ Quick Start (Development):                              │ ║\n' +
          '║  ├─────────────────────────────────────────────────────────┤ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  │  1. Generate a key:                                    │ ║\n' +
          '║  │     $ openssl rand -base64 32                          │ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  │  2. Add to .env:                                       │ ║\n' +
          '║  │     KEY_PROVIDER=environment                           │ ║\n' +
          '║  │     ENCRYPTION_KEY=<generated-key>                     │ ║\n' +
          '║  │                                                         │ ║\n' +
          '║  └─────────────────────────────────────────────────────────┘ ║\n' +
          '║                                                               ║\n' +
          '║  📖 See docs/SECURITY.md for detailed setup guide            ║\n' +
          '║                                                               ║\n' +
          '╚═══════════════════════════════════════════════════════════════╝\n'
      );
    }

    // Create provider based on type
    switch (providerType.toLowerCase()) {
      case 'environment':
        return new EnvironmentKeyProvider();

      case 'file':
        return new FileKeyProvider();

      case 'aws-kms':
        return new CloudKmsKeyProvider();

      case 'vault':
        return new VaultKeyProvider();

      default:
        throw new Error(
          '\n' +
            '╔════════════════════════════════════════════════════════╗\n' +
            `║  ❌ Unknown KEY_PROVIDER: "${providerType}"           ║\n` +
            '╠════════════════════════════════════════════════════════╣\n' +
            '║                                                        ║\n' +
            '║  Valid options:                                       ║\n' +
            '║  • environment                                        ║\n' +
            '║  • file                                               ║\n' +
            '║  • aws-kms                                            ║\n' +
            '║  • vault                                              ║\n' +
            '║                                                        ║\n' +
            `║  You set: KEY_PROVIDER=${providerType}                ║\n` +
            '║                                                        ║\n' +
            '╚════════════════════════════════════════════════════════╝\n'
        );
    }
  }
}
