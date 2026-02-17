import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  ENCRYPT_FIELDS_KEY,
  DECRYPT_FIELDS_KEY,
  HIVE_ID_PARAM_KEY,
} from '../decorators/encrypt-fields.decorator';
import { EncryptionService } from '../encryption.service';

/**
 * Encryption Interceptor
 *
 * Automatically encrypts/decrypts fields based on decorator metadata.
 *
 * Semantics:
 * - @EncryptFields(['f1', 'f2']): encrypts those fields in the INPUT arguments
 *   (in-place, before the method executes) so the method stores encrypted data.
 * - @DecryptFields(['f1', 'f2']): decrypts those fields in the RETURN VALUE
 *   (after the method executes) so the caller receives plaintext.
 *
 * Using both decorators on the same method is intentional for update operations
 * that need to store encrypted and return decrypted data.
 *
 * Performance considerations:
 * - Only activated on methods with decorators
 * - Only encrypts/decrypts specified fields
 * - Handles arrays and objects recursively
 */
@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EncryptionInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly encryptionService: EncryptionService
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Get metadata from decorator
    const encryptFields = this.reflector.get<string[]>(ENCRYPT_FIELDS_KEY, context.getHandler());
    const decryptFields = this.reflector.get<string[]>(DECRYPT_FIELDS_KEY, context.getHandler());
    const hiveIdParamName =
      this.reflector.get<string>(HIVE_ID_PARAM_KEY, context.getHandler()) || 'hiveId';

    // If no encryption/decryption needed, pass through
    if (!encryptFields && !decryptFields) {
      return next.handle();
    }

    // Extract method arguments
    const args = context.getArgs();

    // Find hiveId in method parameters
    const hiveId = this.extractHiveId(args, hiveIdParamName);

    if (!hiveId) {
      this.logger.error(
        `Could not find hiveId parameter '${hiveIdParamName}' in method arguments. ` +
          `Ensure the parameter is named '${hiveIdParamName}' or specify the correct name ` +
          `in the decorator: @EncryptFields({ fields: [...], hiveIdParam: 'yourParamName' })`
      );
      throw new Error(`Encryption failed: hiveId parameter '${hiveIdParamName}' not found`);
    }

    // @EncryptFields: encrypt specified fields in the input arguments IN-PLACE,
    // before the method executes, so the method stores already-encrypted data.
    if (encryptFields && encryptFields.length > 0) {
      this.encryptInputArgs(args, encryptFields, hiveId);
    }

    // Execute method, then @DecryptFields: decrypt specified fields in the return value.
    return next.handle().pipe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map((data: any) => {
        if (!data) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return data;
        }

        if (decryptFields && decryptFields.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return this.processFields(data, decryptFields, hiveId, 'decrypt');
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return data;
      })
    );
  }

  /**
   * Encrypt specified fields in-place across all object arguments.
   *
   * Iterates the method's argument list and encrypts any matching top-level
   * fields found in object arguments.  String values are encrypted directly;
   * non-string values are JSON-serialised first.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private encryptInputArgs(args: any[], fields: string[], hiveId: string): void {
    for (const arg of args) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
        continue;
      }
      for (const field of fields) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (!(field in arg) || arg[field] === null || arg[field] === undefined) {
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const value: string =
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          typeof arg[field] === 'string'
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
              arg[field]
            : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              JSON.stringify(arg[field]);
        const encrypted = this.encryptionService.encrypt(value, hiveId);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        arg[field] = this.encryptionService.serializeToStorage(encrypted);
      }
    }
  }

  /**
   * Extract hiveId from method arguments
   *
   * Looks for a parameter with the specified name in the method arguments.
   *
   * @param args - Method arguments array
   * @param paramName - Name of the hiveId parameter
   * @returns hiveId or null if not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractHiveId(args: any[], paramName: string): string | null {
    // Check each argument
    for (const arg of args) {
      // If arg is an object, check if it has the hiveId property
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (arg && typeof arg === 'object' && paramName in arg) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return arg[paramName];
      }

      // If arg is the hiveId itself (string matching UUID pattern)
      if (
        typeof arg === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg)
      ) {
        return arg;
      }
    }

    // Also check if it's in an ExecutionContext (NestJS request)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const request = args.find((arg) => arg?.user?.hiveId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (request?.user?.hiveId) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return request.user.hiveId;
    }

    return null;
  }

  /**
   * Process fields (encrypt or decrypt) in data
   *
   * Handles:
   * - Simple objects: { title: "..." }
   * - Arrays: [{ title: "..." }, ...]
   * - Nested fields: "user.email"
   *
   * @param data - Data to process
   * @param fields - Array of field names to process
   * @param hiveId - Hive ID for encryption/decryption
   * @param operation - 'encrypt' or 'decrypt'
   * @returns Processed data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processFields(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    fields: string[],
    hiveId: string,
    operation: 'encrypt' | 'decrypt'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return data.map((item) => this.processFields(item, fields, hiveId, operation));
    }

    // Handle objects
    if (typeof data === 'object') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const processed = { ...data };

      for (const fieldPath of fields) {
        // Support nested fields with dot notation
        const parts = fieldPath.split('.');

        if (parts.length === 1) {
          // Simple field
          const field = parts[0];
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (field in processed && processed[field] !== null) {
            try {
              if (operation === 'encrypt') {
                const encrypted = this.encryptionService.encrypt(
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                  typeof processed[field] === 'string'
                    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                      processed[field]
                    : // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                      JSON.stringify(processed[field]),
                  hiveId
                );
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                processed[field] = this.encryptionService.serializeToStorage(encrypted);
              } else {
                // Decrypt: parse the versioned storage string (format: v{version}:{base64})
                const encryptedData = this.encryptionService.parseFromStorage(
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                  String(processed[field])
                );
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                processed[field] = this.encryptionService.decrypt(encryptedData, hiveId);
              }
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              this.logger.error(`Failed to ${operation} field '${field}': ${errorMessage}`);
              // Re-throw: silently returning plaintext on encryption failure (or ciphertext
              // on decryption failure) is a security defect — the caller must know.
              throw error;
            }
          }
        } else {
          // Nested field (e.g., "user.email") — not yet implemented.
          // Throw instead of warn: a silent no-op would leave the field unencrypted
          // without the caller noticing.
          throw new Error(
            `Nested field encryption is not yet supported: '${fieldPath}'. ` +
              `Use top-level field names only.`
          );
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return processed;
    }

    // Return as-is for primitives
    return data;
  }
}
