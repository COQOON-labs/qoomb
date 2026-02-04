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
import { EncryptedData } from '../interfaces/key-provider.interface';

/**
 * Encryption Interceptor
 *
 * Automatically encrypts/decrypts fields based on decorator metadata.
 *
 * This interceptor:
 * 1. Reads metadata from @EncryptFields / @DecryptFields decorators
 * 2. Extracts hiveId from method parameters
 * 3. Encrypts specified fields in method parameters (before execution)
 * 4. Decrypts specified fields in return value (after execution)
 *
 * Performance considerations:
 * - Only activated on methods with decorators
 * - Only encrypts/decrypts specified fields
 * - Supports nested fields with dot notation
 * - Handles arrays and objects recursively
 */
@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EncryptionInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly encryptionService: EncryptionService
  ) {}

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
    const request = context.switchToHttp().getRequest();
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

    // Encrypt fields in request (before method execution)
    if (encryptFields && encryptFields.length > 0) {
      // TODO: Implement encryption of input parameters if needed
      // For now, we focus on encrypting return values
    }

    // Execute method and decrypt fields in response
    return next.handle().pipe(
      map((data) => {
        if (!data) {
          return data;
        }

        // Decrypt fields if specified
        if (decryptFields && decryptFields.length > 0) {
          return this.processFields(data, decryptFields, hiveId, 'decrypt');
        }

        // Encrypt fields if specified
        if (encryptFields && encryptFields.length > 0) {
          return this.processFields(data, encryptFields, hiveId, 'encrypt');
        }

        return data;
      })
    );
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
  private extractHiveId(args: any[], paramName: string): string | null {
    // Check each argument
    for (const arg of args) {
      // If arg is an object, check if it has the hiveId property
      if (arg && typeof arg === 'object' && paramName in arg) {
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
    const request = args.find((arg) => arg?.user?.hiveId);
    if (request?.user?.hiveId) {
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
  private processFields(
    data: any,
    fields: string[],
    hiveId: string,
    operation: 'encrypt' | 'decrypt'
  ): any {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map((item) => this.processFields(item, fields, hiveId, operation));
    }

    // Handle objects
    if (typeof data === 'object') {
      const processed = { ...data };

      for (const fieldPath of fields) {
        // Support nested fields with dot notation
        const parts = fieldPath.split('.');

        if (parts.length === 1) {
          // Simple field
          const field = parts[0];
          if (field in processed && processed[field] !== null) {
            try {
              if (operation === 'encrypt') {
                const encrypted = this.encryptionService.encrypt(
                  typeof processed[field] === 'string'
                    ? processed[field]
                    : JSON.stringify(processed[field]),
                  hiveId
                );
                processed[field] = encrypted.data.toString('base64');
              } else {
                // Decrypt
                // FIXME: CRITICAL - Version is hardcoded! This breaks key rotation.
                // Current data format: base64(encrypted_data)
                // Needed format: version:base64(encrypted_data) OR JSON
                // Before implementing key rotation, MUST change data format to include version.
                const encryptedData: EncryptedData = {
                  version: 1, // FIXME: Hardcoded - read from stored data instead
                  provider: this.encryptionService.getProviderName(),
                  data: Buffer.from(processed[field], 'base64'),
                };
                processed[field] = this.encryptionService.decrypt(encryptedData, hiveId);
              }
            } catch (error) {
              this.logger.error(`Failed to ${operation} field '${field}': ${error.message}`);
              // Keep original value on error
            }
          }
        } else {
          // Nested field (e.g., "user.email")
          // TODO: Implement nested field support if needed
          this.logger.warn(`Nested field encryption not yet implemented: ${fieldPath}`);
        }
      }

      return processed;
    }

    // Return as-is for primitives
    return data;
  }
}
