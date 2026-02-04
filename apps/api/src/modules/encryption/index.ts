/**
 * Encryption Module Exports
 *
 * Provides clean imports for encryption functionality:
 *
 * ```typescript
 * import {
 *   EncryptionModule,
 *   EncryptionService,
 *   EncryptFields,
 *   DecryptFields,
 * } from './modules/encryption';
 * ```
 */

export { EncryptionModule } from './encryption.module';
export { EncryptionService } from './encryption.service';
export {
  EncryptFields,
  DecryptFields,
  EncryptDecryptFields,
  type EncryptFieldsOptions,
} from './decorators/encrypt-fields.decorator';
export type { KeyProvider, EncryptedData, KeyMetadata } from './interfaces/key-provider.interface';
export { KeyProviderFactory } from './key-provider.factory';
