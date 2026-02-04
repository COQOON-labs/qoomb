import { Module, Global } from '@nestjs/common';

import { EncryptionService } from './encryption.service';

/**
 * Encryption Module
 *
 * Provides encryption/decryption services with pluggable key providers.
 *
 * This module is marked as @Global so EncryptionService can be injected
 * anywhere without explicitly importing the module.
 *
 * Usage:
 * ```typescript
 * constructor(private readonly encryption: EncryptionService) {}
 * ```
 */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
