import { type BaseEntity, type UUID } from './common';

export enum HiveType {
  FAMILY = 'family',
  ORGANIZATION = 'organization',
}

export interface Hive extends BaseEntity {
  name: string;
  type: HiveType;
}

export interface User extends BaseEntity {
  email: string;
  emailVerified: boolean;
  hiveId: UUID;
  personId?: UUID;
}

export interface CreateHiveInput {
  name: string;
  type: string; // validated by schema to be HiveType values ('family' | 'organization')
  adminEmail: string;
  adminPassword: string;
  adminName: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  hiveId: UUID;
  personId?: UUID;
}
