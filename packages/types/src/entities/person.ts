import { type BaseEntity, type UUID } from './common';

export enum PersonRole {
  PARENT = 'parent',
  CHILD = 'child',
  GRANDPARENT = 'grandparent',
  BABYSITTER = 'babysitter',
  OTHER = 'other',
}

export enum AgeGroup {
  BABY = 'baby',
  TODDLER = 'toddler',
  CHILD = 'child',
  TEEN = 'teen',
  ADULT = 'adult',
}

export interface Person extends BaseEntity {
  hiveId: UUID;
  name: string;
  role: PersonRole;
  birthdate?: Date;
  ageGroup?: AgeGroup;
  permissionLevel: number; // 0-100
  publicKey?: string; // For E2E encryption
}

export interface CreatePersonInput {
  name: string;
  role: PersonRole;
  birthdate?: Date;
  ageGroup?: AgeGroup;
}

export interface UpdatePersonInput {
  name?: string;
  role?: PersonRole;
  birthdate?: Date;
  ageGroup?: AgeGroup;
}
