import { Logger } from '@nestjs/common';

import type { EncryptionService } from '../encryption.service';

// ============================================
// Types
// ============================================

/**
 * Per-field type transforms for non-string fields.
 *
 * Example: Date ↔ ISO string for birthdate
 */
export interface FieldTransforms {
  /** Convert a non-string value to string before encryption */
  serialize?: (value: unknown) => string;
  /** Convert a decrypted string back to the desired output type */
  deserialize?: (value: string) => unknown;
}

/**
 * Options for field encryption/decryption decorators.
 */
export interface FieldCryptoOptions {
  /** Field names to encrypt or decrypt */
  fields: string[];

  /**
   * Zero-based index of the hiveId parameter in the method signature.
   *
   * Example: `create(data, hiveId, creatorId)` → `hiveIdArg: 1`
   */
  hiveIdArg: number;

  /** Optional per-field type transforms (e.g. Date ↔ ISO string) */
  transforms?: Record<string, FieldTransforms>;
}

// ============================================
// Internal helpers
// ============================================

const logger = new Logger('FieldEncryption');

/**
 * Get EncryptionService from the service instance.
 *
 * Convention: all services inject EncryptionService as
 * `private readonly enc: EncryptionService`.
 */
function getEnc(instance: unknown): EncryptionService {
  const enc = (instance as Record<string, unknown>).enc as EncryptionService | undefined;
  if (!enc || typeof enc.encrypt !== 'function') {
    throw new Error(
      'FieldEncryption: class must have an `enc` property of type EncryptionService. ' +
        'Inject EncryptionService as `private readonly enc: EncryptionService` in the constructor.'
    );
  }
  return enc;
}

// ============================================
// @EncryptFields
// ============================================

/**
 * Encrypt specified fields in the input arguments BEFORE the method executes.
 *
 * Iterates the method's argument list and encrypts matching top-level fields
 * found in object arguments. String values are encrypted directly; non-string
 * values use the optional `transforms.serialize` callback or `JSON.stringify`.
 *
 * The method receives and stores already-encrypted data.
 *
 * @example
 * ```typescript
 * @EncryptFields({ fields: ['title', 'description'], hiveIdArg: 1 })
 * async create(data: CreateEventInput, hiveId: string) {
 *   return this.prisma.event.create({ data });
 *   // data.title and data.description are already encrypted
 * }
 * ```
 */
export function EncryptFields(options: FieldCryptoOptions): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const original = descriptor.value;

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const enc = getEnc(this);
      const hiveId = String(args[options.hiveIdArg]);

      for (const arg of args) {
        if (!arg || typeof arg !== 'object' || Array.isArray(arg)) continue;
        const obj = arg as Record<string, unknown>;

        for (const field of options.fields) {
          if (!(field in obj) || obj[field] === null || obj[field] === undefined) continue;

          let valueStr: string;
          const serialize = options.transforms?.[field]?.serialize;
          if (serialize) {
            valueStr = serialize(obj[field]);
          } else if (typeof obj[field] === 'string') {
            valueStr = obj[field];
          } else {
            valueStr = JSON.stringify(obj[field]);
          }

          obj[field] = enc.serializeToStorage(enc.encrypt(valueStr, hiveId));
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      return original.apply(this, args) as unknown;
    };

    return descriptor;
  };
}

// ============================================
// @DecryptFields
// ============================================

/**
 * Decrypt specified fields in the RETURN VALUE after the method executes.
 *
 * Handles single objects and arrays (each element is decrypted individually).
 * Null fields and missing fields are skipped.
 *
 * If decryption fails for a field (e.g. plaintext migration window), the
 * original value is preserved and a warning is logged.
 *
 * @example
 * ```typescript
 * @DecryptFields({ fields: ['title', 'description'], hiveIdArg: 1 })
 * async getById(id: string, hiveId: string) {
 *   return this.prisma.event.findUnique({ where: { id } });
 *   // returned title and description are automatically decrypted
 * }
 * ```
 */
export function DecryptFields(options: FieldCryptoOptions): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const original = descriptor.value;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const enc = getEnc(this);
      const hiveId = String(args[options.hiveIdArg]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const result: unknown = await (original.apply(this, args) as Promise<unknown>);
      return decryptData(result, options.fields, hiveId, enc, options.transforms);
    };

    return descriptor;
  };
}

// ============================================
// @EncryptDecryptFields
// ============================================

/**
 * Combined decorator: encrypts input fields, then decrypts output fields.
 *
 * Equivalent to stacking `@EncryptFields` over `@DecryptFields`.
 * Useful for create/update methods that store encrypted data and return
 * decrypted results.
 *
 * @example
 * ```typescript
 * @EncryptDecryptFields({ fields: ['title', 'description'], hiveIdArg: 1 })
 * async create(data: CreateInput, hiveId: string) {
 *   return this.prisma.event.create({ data });
 * }
 * ```
 */
export function EncryptDecryptFields(options: FieldCryptoOptions): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    // Apply DecryptFields first (inner wrapper), then EncryptFields (outer wrapper).
    // Execution order: encrypt input → run method → decrypt output.
    DecryptFields(options)(target, propertyKey, descriptor);
    EncryptFields(options)(target, propertyKey, descriptor);
    return descriptor;
  };
}

// ============================================
// Private: recursive decrypt helper
// ============================================

function decryptData(
  data: unknown,
  fields: string[],
  hiveId: string,
  enc: EncryptionService,
  transforms?: Record<string, FieldTransforms>
): unknown {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => decryptData(item, fields, hiveId, enc, transforms));
  }

  if (typeof data === 'object') {
    const obj = { ...(data as Record<string, unknown>) };

    for (const field of fields) {
      if (!(field in obj) || obj[field] === null) continue;

      try {
        const encrypted = enc.parseFromStorage(obj[field] as string);
        const plain = enc.decrypt(encrypted, hiveId);
        const deserialize = transforms?.[field]?.deserialize;
        obj[field] = deserialize ? deserialize(plain) : plain;
      } catch {
        // Migration window: field not yet encrypted. Keep original value.
        logger.warn(`Plaintext fallback for hive ${hiveId} — field '${field}' not yet encrypted`);
      }
    }

    return obj;
  }

  return data;
}
