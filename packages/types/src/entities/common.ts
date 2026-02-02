/**
 * Common types and enums used across all entities
 */

export type UUID = string;

export interface BaseEntity {
  id: UUID;
  createdAt: Date;
  updatedAt: Date;
  version: number; // For conflict detection
}

export enum EncryptionMode {
  SERVER_SIDE = 'server_side',
  END_TO_END = 'e2e',
}

export interface EncryptedEntity {
  encryptionMode: EncryptionMode;
  encryptedData?: Buffer; // Only populated when E2E
}
