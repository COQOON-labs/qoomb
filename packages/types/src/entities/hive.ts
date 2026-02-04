import { type BaseEntity, type UUID } from './common';

export interface Hive extends BaseEntity {
  name: string;
}

export interface User extends BaseEntity {
  email: string;
  hiveId: UUID;
  personId?: UUID; // Links to Person in hive schema
}

export interface CreateHiveInput {
  name: string;
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
