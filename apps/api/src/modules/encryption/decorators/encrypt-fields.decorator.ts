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
 * Base options shared by all field encryption scopes.
 */
interface FieldCryptoOptionsBase {
  /** Field names to encrypt or decrypt */
  fields: string[];

  /** Optional per-field type transforms (e.g. Date ↔ ISO string) */
  transforms?: Record<string, FieldTransforms>;
}

/**
 * Hive-scoped encryption: key derived from hive ID via HKDF.
 *
 * Use for content fields (event titles, task descriptions, etc.).
 */
interface HiveScopedCryptoOptions extends FieldCryptoOptionsBase {
  /**
   * Zero-based index of the hiveId parameter in the method signature.
   *
   * Example: `create(data, hiveId, creatorId)` → `hiveIdArg: 1`
   */
  hiveIdArg: number;
  userIdArg?: never;
}

/**
 * User-scoped encryption: key derived from user ID via HKDF.
 *
 * Use for user PII (email, fullName, locale) — isolated from hive context.
 */
interface UserScopedCryptoOptions extends FieldCryptoOptionsBase {
  /**
   * Zero-based index of the userId parameter in the method signature.
   *
   * Example: `updateLocale(userId, data)` → `userIdArg: 0`
   */
  userIdArg: number;
  hiveIdArg?: never;
}

/**
 * Options for field encryption/decryption decorators.
 *
 * Provide **either** `hiveIdArg` (hive-scoped) or `userIdArg` (user-scoped):
 *
 * @example
 * ```typescript
 * // Hive-scoped (events, tasks, groups):
 * @EncryptFields({ fields: ['title'], hiveIdArg: 1 })
 *
 * // User-scoped (email, fullName, locale):
 * @EncryptFields({ fields: ['locale'], userIdArg: 0 })
 * ```
 */
export type FieldCryptoOptions = HiveScopedCryptoOptions | UserScopedCryptoOptions;

// ============================================
// Internal helpers
// ============================================

const logger = new Logger('FieldEncryption');

/**
 * Check if a field path contains nested segments (e.g. 'fields.*.name').
 */
function isNestedPath(field: string): boolean {
  return field.includes('.');
}

/**
 * Apply a transform function at a dot-separated path within a nested object.
 *
 * Supports `*` as a wildcard for iterating over all elements of an array.
 *
 * Example paths:
 *  - `'name'`            → `obj.name`
 *  - `'fields.*.name'`   → `obj.fields[i].name` for each i
 *  - `'a.b.*.c'`         → `obj.a.b[i].c` for each i
 *
 * Mutates `obj` in-place. Silently skips if a segment is missing, null, or
 * the wrong type (array vs object).
 */
function applyAtPath(
  obj: Record<string, unknown>,
  segments: string[],
  transform: (value: string) => string
): void {
  if (segments.length === 0) return;

  const [head, ...rest] = segments;

  if (head === '*') {
    // Current context should be an array — iterate each element
    if (!Array.isArray(obj)) return;
    for (const item of obj) {
      if (item && typeof item === 'object') {
        applyAtPath(item as Record<string, unknown>, rest, transform);
      }
    }
    return;
  }

  if (!(head in obj) || obj[head] === null || obj[head] === undefined) return;

  if (rest.length === 0) {
    // Leaf: apply transform to this field
    if (typeof obj[head] === 'string') {
      obj[head] = transform(obj[head]);
    }
    return;
  }

  // Recurse into the next level
  const next = obj[head];
  if (typeof next === 'object') {
    // Works for both arrays and plain objects:
    // - If rest starts with '*' and next is an array → '*' handler iterates
    // - If next is a plain object → recurse into it
    applyAtPath(next as Record<string, unknown>, rest, transform);
  }
}

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

/**
 * Resolve the encryption key ID and scope from decorator options.
 *
 * @returns keyId — the hiveId or userId string
 * @returns userScoped — true for user-scoped (encryptForUser/decryptForUser)
 */
function resolveKeyScope(
  options: FieldCryptoOptions,
  args: unknown[]
): { keyId: string; userScoped: boolean } {
  if ('userIdArg' in options && options.userIdArg !== undefined) {
    return { keyId: String(args[options.userIdArg]), userScoped: true };
  }
  if ('hiveIdArg' in options && options.hiveIdArg !== undefined) {
    return { keyId: String(args[options.hiveIdArg]), userScoped: false };
  }
  throw new Error('FieldEncryption: options must specify either hiveIdArg or userIdArg');
}

// ============================================
// @EncryptFields
// ============================================

/**
 * Encrypt specified fields in the input arguments BEFORE the method executes.
 *
 * Iterates the method's argument list and encrypts matching fields found in
 * object arguments. Supports both flat fields (`'title'`) and nested paths
 * (`'fields.*.name'`) where `*` iterates over array elements.
 *
 * String values are encrypted directly; non-string values use the optional
 * `transforms.serialize` callback or `JSON.stringify`.
 *
 * The method receives and stores already-encrypted data.
 *
 * @example
 * ```typescript
 * // Flat fields:
 * @EncryptFields({ fields: ['title', 'description'], hiveIdArg: 1 })
 *
 * // Nested paths (arrays):
 * @EncryptFields({ fields: ['name', 'fields.*.name', 'views.*.name'], hiveIdArg: 1 })
 * ```
 */
export function EncryptFields(options: FieldCryptoOptions): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const original = descriptor.value;

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const enc = getEnc(this);
      const { keyId, userScoped } = resolveKeyScope(options, args);

      const encryptValue = (value: string): string =>
        userScoped
          ? enc.encryptForUser(value, keyId)
          : enc.serializeToStorage(enc.encrypt(value, keyId));

      for (const arg of args) {
        if (!arg || typeof arg !== 'object' || Array.isArray(arg)) continue;
        const obj = arg as Record<string, unknown>;

        for (const field of options.fields) {
          if (isNestedPath(field)) {
            // Nested path: mutate in-place via applyAtPath
            applyAtPath(obj, field.split('.'), encryptValue);
            continue;
          }

          // Flat field (existing behaviour)
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

          obj[field] = encryptValue(valueStr);
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
 * Supports both flat fields (`'title'`) and nested paths (`'fields.*.name'`)
 * where `*` iterates over array elements.
 *
 * Null fields and missing fields are skipped. If decryption fails for a field
 * (e.g. plaintext migration window), the original value is preserved and a
 * warning is logged.
 *
 * @example
 * ```typescript
 * // Flat fields:
 * @DecryptFields({ fields: ['title', 'description'], hiveIdArg: 1 })
 *
 * // Nested paths (arrays):
 * @DecryptFields({ fields: ['name', 'fields.*.name', 'views.*.name'], hiveIdArg: 0 })
 * ```
 */
export function DecryptFields(options: FieldCryptoOptions): MethodDecorator {
  return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const original = descriptor.value;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const enc = getEnc(this);
      const { keyId, userScoped } = resolveKeyScope(options, args);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const result: unknown = await (original.apply(this, args) as Promise<unknown>);
      return decryptData(result, options.fields, keyId, userScoped, enc, options.transforms);
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
  keyId: string,
  userScoped: boolean,
  enc: EncryptionService,
  transforms?: Record<string, FieldTransforms>
): unknown {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map((item) => decryptData(item, fields, keyId, userScoped, enc, transforms));
  }

  if (typeof data === 'object') {
    const obj = { ...(data as Record<string, unknown>) };

    // Deep-clone nested arrays/objects so we don't mutate the original Prisma result
    for (const field of fields) {
      if (isNestedPath(field)) {
        const rootKey = field.split('.')[0];
        if (rootKey in obj && obj[rootKey] !== null && Array.isArray(obj[rootKey])) {
          obj[rootKey] = (obj[rootKey] as unknown[]).map((item) =>
            item && typeof item === 'object' ? { ...item } : item
          );
        }
      }
    }

    const decryptValue = (value: string): string => {
      if (userScoped) {
        return enc.decryptForUser(value, keyId);
      }
      const encrypted = enc.parseFromStorage(value);
      return enc.decrypt(encrypted, keyId);
    };

    for (const field of fields) {
      if (isNestedPath(field)) {
        // Nested path: decrypt in-place via applyAtPath (on shallow-cloned arrays)
        applyAtPath(obj, field.split('.'), (value) => {
          try {
            return decryptValue(value);
          } catch {
            const scope = userScoped ? `user ${keyId}` : `hive ${keyId}`;
            logger.warn(
              `Plaintext fallback for ${scope} — nested field '${field}' not yet encrypted`
            );
            return value;
          }
        });
        continue;
      }

      // Flat field (existing behaviour)
      if (!(field in obj) || obj[field] === null) continue;

      try {
        const plain = decryptValue(obj[field] as string);
        const deserialize = transforms?.[field]?.deserialize;
        obj[field] = deserialize ? deserialize(plain) : plain;
      } catch {
        // Migration window: field not yet encrypted. Keep original value.
        const scope = userScoped ? `user ${keyId}` : `hive ${keyId}`;
        logger.warn(`Plaintext fallback for ${scope} — field '${field}' not yet encrypted`);
      }
    }

    return obj;
  }

  return data;
}
