import { type BaseEntity, type EncryptedEntity, type UUID } from './common';

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum ListFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  CHECKBOX = 'checkbox',
  SELECT = 'select',
  PERSON = 'person',
  REFERENCE = 'reference',
  URL = 'url',
}

export enum ListViewType {
  CHECKLIST = 'checklist',
  TABLE = 'table',
}

// ── Filter types (shared between views and rule-based references) ─────────────

export type FilterComparator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'is_checked'
  | 'is_unchecked';

export interface FilterCondition {
  fieldId: UUID;
  comparator: FilterComparator;
  value?: string | number | boolean;
}

export interface FilterExpression {
  operator: 'and' | 'or';
  conditions: FilterCondition[];
}

export interface SortExpression {
  fieldId: UUID;
  direction: 'asc' | 'desc';
}

// ── Field config types ────────────────────────────────────────────────────────

export interface SelectFieldConfig {
  options: string[];
}

export interface ReferenceFieldConfig {
  targetListId: UUID;
  rule?: FilterExpression;
}

export interface NumberFieldConfig {
  min?: number;
  max?: number;
  unit?: string;
}

export interface PersonFieldConfig {
  multiple: boolean;
}

export type ListFieldConfig =
  | SelectFieldConfig
  | ReferenceFieldConfig
  | NumberFieldConfig
  | PersonFieldConfig
  | Record<string, never>;

// ── View config types ─────────────────────────────────────────────────────────

export interface ChecklistViewConfig {
  checkboxFieldId: UUID;
}

export interface TableViewConfig {
  visibleFieldIds: UUID[];
  columnWidths?: Record<UUID, number>;
}

export type ListViewConfig = ChecklistViewConfig | TableViewConfig;

// ── Entity interfaces ─────────────────────────────────────────────────────────

export interface List extends BaseEntity, EncryptedEntity {
  hiveId: UUID;
  creatorId: UUID;
  name: string;
  icon?: string;
  systemKey: string | null;
  visibility: 'hive' | 'admins' | 'group' | 'private';
  groupId?: UUID;
  sortOrder: number;
  isArchived: boolean;
}

export interface ListField {
  id: UUID;
  listId: UUID;
  name: string;
  fieldType: ListFieldType;
  config: ListFieldConfig;
  isRequired: boolean;
  isTitle: boolean;
  sortOrder: number;
  createdAt: Date;
}

export interface ListView {
  id: UUID;
  listId: UUID;
  name: string;
  viewType: ListViewType;
  config: ListViewConfig;
  filter?: FilterExpression;
  sortBy?: SortExpression[];
  isDefault: boolean;
  createdAt: Date;
}

export interface ListItem extends BaseEntity {
  listId: UUID;
  hiveId: UUID;
  creatorId: UUID;
  sortOrder: number;
}

export interface ListItemValue {
  id: UUID;
  itemId: UUID;
  fieldId: UUID;
  value?: string;
  updatedAt: Date;
}

// ── Template interfaces ───────────────────────────────────────────────────────

export interface ListTemplate {
  id: UUID;
  hiveId?: UUID;
  creatorId?: UUID;
  name: string;
  description?: string;
  icon?: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListTemplateField {
  id: UUID;
  templateId: UUID;
  name: string;
  fieldType: ListFieldType;
  config: ListFieldConfig;
  isRequired: boolean;
  isTitle: boolean;
  sortOrder: number;
}

export interface ListTemplateView {
  id: UUID;
  templateId: UUID;
  name: string;
  viewType: ListViewType;
  config: ListViewConfig;
  filter?: FilterExpression;
  sortBy?: SortExpression[];
  isDefault: boolean;
}

// ── Input interfaces ──────────────────────────────────────────────────────────

export interface CreateListInput {
  name: string;
  icon?: string;
  templateId?: UUID;
  visibility?: 'hive' | 'admins' | 'group' | 'private';
  groupId?: UUID;
}

export interface UpdateListInput {
  name?: string;
  icon?: string;
  visibility?: 'hive' | 'admins' | 'group' | 'private';
  groupId?: UUID;
  isArchived?: boolean;
  sortOrder?: number;
}

export interface CreateListItemInput {
  listId: UUID;
  values: Record<UUID, string | number | boolean | Date | null>;
}

export interface UpdateListItemInput {
  values?: Record<UUID, string | number | boolean | Date | null>;
  sortOrder?: number;
}

export interface ReorderItemInput {
  id: UUID;
  sortOrder: number;
}
