import { type BaseEntity, type UUID } from './common';

export enum PersonRole {
  // Family hive roles
  PARENT = 'parent',
  CHILD = 'child',

  // Organization hive roles
  ORG_ADMIN = 'org_admin',
  MANAGER = 'manager',
  MEMBER = 'member',
  GUEST = 'guest',
}

export interface Person extends BaseEntity {
  hiveId: UUID;
  role: PersonRole;
  displayName?: string;
  avatarUrl?: string;
  birthdate?: Date;
  publicKey?: string; // For E2E encryption
}

export interface CreatePersonInput {
  role: PersonRole;
  displayName?: string;
  birthdate?: Date;
}

export interface UpdatePersonInput {
  role?: PersonRole;
  displayName?: string;
  avatarUrl?: string;
  birthdate?: Date;
}
