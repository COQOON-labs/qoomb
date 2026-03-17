import { z } from 'zod';

// ── Enums ─────────────────────────────────────────────────────────────────────

// Use z.enum (not z.nativeEnum) to prevent TS2742 inferred-type portability errors
// when the schema flows through AppRouter into the web client type chain.
// Values must stay in sync with enums in packages/types/src/entities/list.ts.

export const listFieldTypeSchema = z.enum([
  'text',
  'number',
  'date',
  'checkbox',
  'select',
  'person',
  'reference',
  'url',
]);

export const listViewTypeSchema = z.enum(['checklist', 'table']);

export const visibilitySchema = z.enum(['hive', 'admins', 'group', 'private']);

// ── Filter schemas ────────────────────────────────────────────────────────────

export const filterComparatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'is_empty',
  'is_not_empty',
  'is_checked',
  'is_unchecked',
]);

export const filterConditionSchema = z.object({
  fieldId: z.uuid(),
  comparator: filterComparatorSchema,
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const filterExpressionSchema: z.ZodType = z.object({
  operator: z.enum(['and', 'or']),
  conditions: z.array(filterConditionSchema).min(1).max(20),
});

export const sortExpressionSchema = z.object({
  fieldId: z.uuid(),
  direction: z.enum(['asc', 'desc']),
});

// ── Field config schemas ──────────────────────────────────────────────────────

export const selectFieldConfigSchema = z.object({
  options: z.array(z.string().min(1).max(200)).min(1).max(50),
});

export const referenceFieldConfigSchema = z.object({
  targetListId: z.uuid(),
  rule: filterExpressionSchema.optional(),
});

export const numberFieldConfigSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().max(50).optional(),
});

export const personFieldConfigSchema = z.object({
  multiple: z.boolean().default(false),
});

export const listFieldConfigSchema = z
  .union([
    selectFieldConfigSchema,
    referenceFieldConfigSchema,
    numberFieldConfigSchema,
    personFieldConfigSchema,
    z.object({}),
  ])
  .default({});

// ── View config schemas ───────────────────────────────────────────────────────

export const checklistViewConfigSchema = z.object({
  checkboxFieldId: z.uuid(),
});

export const tableViewConfigSchema = z.object({
  visibleFieldIds: z.array(z.uuid()),
  columnWidths: z.record(z.uuid(), z.number().positive()).optional(),
});

// ── List CRUD schemas ─────────────────────────────────────────────────────────

export const createListSchema = z.object({
  name: z.string().min(1).max(500),
  icon: z.string().max(50).optional(),
  templateId: z.uuid().optional(),
  visibility: visibilitySchema.default('hive'),
  groupId: z.uuid().optional(),
});

export const updateListSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  icon: z.string().max(50).nullish(),
  visibility: visibilitySchema.optional(),
  groupId: z.uuid().nullish(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

// ── Field CRUD schemas ────────────────────────────────────────────────────────

export const createListFieldSchema = z.object({
  listId: z.uuid(),
  name: z.string().min(1).max(200),
  fieldType: listFieldTypeSchema,
  config: listFieldConfigSchema,
  isRequired: z.boolean().default(false),
  isTitle: z.boolean().default(false),
});

export const updateListFieldSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: listFieldConfigSchema.optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

// ── View CRUD schemas ─────────────────────────────────────────────────────────

export const createListViewSchema = z.object({
  listId: z.uuid(),
  name: z.string().min(1).max(200),
  viewType: listViewTypeSchema,
  config: z.union([checklistViewConfigSchema, tableViewConfigSchema]),
  filter: filterExpressionSchema.optional(),
  sortBy: z.array(sortExpressionSchema).max(5).optional(),
  isDefault: z.boolean().default(false),
});

export const updateListViewSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.union([checklistViewConfigSchema, tableViewConfigSchema]).optional(),
  filter: filterExpressionSchema.nullish(),
  sortBy: z.array(sortExpressionSchema).max(5).nullish(),
  isDefault: z.boolean().optional(),
});

// ── Item CRUD schemas ─────────────────────────────────────────────────────────

/** Value for a single field: key = fieldId, value = typed content or null to clear */
export const listItemValueSchema = z.record(
  z.uuid(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

export const createListItemSchema = z.object({
  listId: z.uuid(),
  values: listItemValueSchema,
});

export const updateListItemSchema = z.object({
  values: listItemValueSchema.optional(),
  sortOrder: z.number().optional(),
});

export const reorderListItemsSchema = z.object({
  listId: z.uuid(),
  items: z
    .array(z.object({ id: z.uuid(), sortOrder: z.number() }))
    .min(1)
    .max(5000),
});

export const listListItemsSchema = z.object({
  listId: z.uuid(),
  filter: filterExpressionSchema.optional(),
});

export const listListsSchema = z.object({
  includeArchived: z.boolean().default(false),
});
