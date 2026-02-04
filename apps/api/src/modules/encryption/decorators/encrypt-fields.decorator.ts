import { SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';

import { EncryptionInterceptor } from '../interceptors/encryption.interceptor';

/**
 * Metadata keys for encryption decorators
 */
export const ENCRYPT_FIELDS_KEY = 'encrypt:fields';
export const DECRYPT_FIELDS_KEY = 'decrypt:fields';
export const HIVE_ID_PARAM_KEY = 'encrypt:hiveIdParam';

/**
 * Configuration for field encryption
 */
export interface EncryptFieldsOptions {
  /**
   * Array of field names to encrypt
   * Supports nested fields with dot notation: 'user.email'
   */
  fields: string[];

  /**
   * Name of the parameter that contains the hiveId
   * Default: 'hiveId'
   *
   * The decorator will look for this parameter in the method signature
   * and use it for encryption.
   */
  hiveIdParam?: string;
}

/**
 * Encrypt Fields Decorator
 *
 * Automatically encrypts specified fields in the return value of a method.
 *
 * Usage:
 * ```typescript
 * @EncryptFields({
 *   fields: ['title', 'description'],
 *   hiveIdParam: 'hiveId'  // optional, defaults to 'hiveId'
 * })
 * async createEvent(data: CreateEventInput, hiveId: string) {
 *   // data.title and data.description will be automatically encrypted
 *   // before being returned or stored
 *   return this.prisma.event.create({ data });
 * }
 * ```
 *
 * Shorthand for single parameter:
 * ```typescript
 * @EncryptFields(['title', 'description'])
 * async createEvent(data: CreateEventInput, hiveId: string) {
 *   // ...
 * }
 * ```
 *
 * How it works:
 * 1. Decorator stores metadata about which fields to encrypt
 * 2. EncryptionInterceptor reads this metadata
 * 3. Before the method returns, specified fields are encrypted
 * 4. The hiveId is extracted from method parameters
 *
 * @param options - Configuration or array of field names
 */
export function EncryptFields(options: EncryptFieldsOptions | string[]): MethodDecorator {
  // Normalize options
  const config: EncryptFieldsOptions = Array.isArray(options)
    ? { fields: options, hiveIdParam: 'hiveId' }
    : { hiveIdParam: 'hiveId', ...options };

  return applyDecorators(
    SetMetadata(ENCRYPT_FIELDS_KEY, config.fields),
    SetMetadata(HIVE_ID_PARAM_KEY, config.hiveIdParam),
    UseInterceptors(EncryptionInterceptor)
  );
}

/**
 * Decrypt Fields Decorator
 *
 * Automatically decrypts specified fields in the return value of a method.
 *
 * Usage:
 * ```typescript
 * @DecryptFields({
 *   fields: ['title', 'description'],
 *   hiveIdParam: 'hiveId'
 * })
 * async getEvent(id: string, hiveId: string) {
 *   const event = await this.prisma.event.findUnique({ where: { id } });
 *   // event.title and event.description will be automatically decrypted
 *   return event;
 * }
 * ```
 *
 * Shorthand:
 * ```typescript
 * @DecryptFields(['title', 'description'])
 * async getEvent(id: string, hiveId: string) {
 *   // ...
 * }
 * ```
 *
 * @param options - Configuration or array of field names
 */
export function DecryptFields(options: EncryptFieldsOptions | string[]): MethodDecorator {
  // Normalize options
  const config: EncryptFieldsOptions = Array.isArray(options)
    ? { fields: options, hiveIdParam: 'hiveId' }
    : { hiveIdParam: 'hiveId', ...options };

  return applyDecorators(
    SetMetadata(DECRYPT_FIELDS_KEY, config.fields),
    SetMetadata(HIVE_ID_PARAM_KEY, config.hiveIdParam),
    UseInterceptors(EncryptionInterceptor)
  );
}

/**
 * Combined Encrypt & Decrypt Decorator
 *
 * Encrypts fields on input (method parameters) and decrypts on output (return value).
 * Useful for update operations where you receive encrypted data and return encrypted data.
 *
 * Usage:
 * ```typescript
 * @EncryptDecryptFields({
 *   fields: ['title', 'description'],
 *   hiveIdParam: 'hiveId'
 * })
 * async updateEvent(id: string, data: UpdateEventInput, hiveId: string) {
 *   // data comes in encrypted, gets decrypted automatically
 *   const updated = await this.prisma.event.update({ where: { id }, data });
 *   // result gets encrypted before return
 *   return updated;
 * }
 * ```
 *
 * @param options - Configuration or array of field names
 */
export function EncryptDecryptFields(options: EncryptFieldsOptions | string[]): MethodDecorator {
  // Normalize options
  const config: EncryptFieldsOptions = Array.isArray(options)
    ? { fields: options, hiveIdParam: 'hiveId' }
    : { hiveIdParam: 'hiveId', ...options };

  return applyDecorators(
    SetMetadata(ENCRYPT_FIELDS_KEY, config.fields),
    SetMetadata(DECRYPT_FIELDS_KEY, config.fields),
    SetMetadata(HIVE_ID_PARAM_KEY, config.hiveIdParam),
    UseInterceptors(EncryptionInterceptor)
  );
}
