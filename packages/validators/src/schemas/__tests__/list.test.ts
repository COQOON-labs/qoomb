/**
 * Tests for list Zod validation schemas.
 *
 * These schemas define the API contract for all list operations.
 * Invalid input must be caught here before reaching the service layer.
 */

import { describe, it, expect } from 'vitest';

import {
  createListSchema,
  updateListSchema,
  createListFieldSchema,
  updateListFieldSchema,
  createListViewSchema,
  updateListViewSchema,
  createListItemSchema,
  updateListItemSchema,
  listListsSchema,
  visibilitySchema,
  listFieldTypeSchema,
  listViewTypeSchema,
  filterExpressionSchema,
  sortExpressionSchema,
} from '../list';

// ── Helpers ───────────────────────────────────────────────────────────────────

const validUuid = '00000000-0000-4000-8000-000000000001';
const validUuid2 = '00000000-0000-4000-8000-000000000002';

function expectPass(schema: { safeParse: (v: unknown) => { success: boolean } }, data: unknown) {
  const result = schema.safeParse(data);
  expect(result.success).toBe(true);
}

function expectFail(schema: { safeParse: (v: unknown) => { success: boolean } }, data: unknown) {
  const result = schema.safeParse(data);
  expect(result.success).toBe(false);
}

// ── visibilitySchema ──────────────────────────────────────────────────────────

describe('visibilitySchema', () => {
  it.each(['hive', 'admins', 'group', 'private'])('accepts "%s"', (val) => {
    expectPass(visibilitySchema, val);
  });

  it('rejects invalid visibility values', () => {
    expectFail(visibilitySchema, 'public');
    expectFail(visibilitySchema, 'everyone');
    expectFail(visibilitySchema, '');
    expectFail(visibilitySchema, 123);
  });
});

// ── listFieldTypeSchema ───────────────────────────────────────────────────────

describe('listFieldTypeSchema', () => {
  it.each(['text', 'number', 'date', 'checkbox', 'select', 'person', 'reference', 'url'])(
    'accepts "%s"',
    (val) => {
      expectPass(listFieldTypeSchema, val);
    }
  );

  it('rejects unknown field types', () => {
    expectFail(listFieldTypeSchema, 'color');
    expectFail(listFieldTypeSchema, 'file');
    expectFail(listFieldTypeSchema, '');
  });
});

// ── listViewTypeSchema ────────────────────────────────────────────────────────

describe('listViewTypeSchema', () => {
  it.each(['checklist', 'table'])('accepts "%s"', (val) => {
    expectPass(listViewTypeSchema, val);
  });

  it('rejects unknown view types', () => {
    expectFail(listViewTypeSchema, 'kanban');
    expectFail(listViewTypeSchema, 'calendar');
  });
});

// ── createListSchema ──────────────────────────────────────────────────────────

describe('createListSchema', () => {
  it('accepts minimal valid input', () => {
    expectPass(createListSchema, { name: 'My List' });
  });

  it('defaults visibility to "hive"', () => {
    const result = createListSchema.safeParse({ name: 'My List' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('hive');
    }
  });

  it('accepts full valid input', () => {
    expectPass(createListSchema, {
      name: 'Shopping',
      icon: '🛒',
      templateId: validUuid,
      visibility: 'private',
      groupId: validUuid2,
    });
  });

  it('rejects empty name', () => {
    expectFail(createListSchema, { name: '' });
  });

  it('rejects name exceeding 500 chars', () => {
    expectFail(createListSchema, { name: 'x'.repeat(501) });
  });

  it('rejects missing name', () => {
    expectFail(createListSchema, {});
  });

  it('rejects invalid visibility', () => {
    expectFail(createListSchema, { name: 'X', visibility: 'public' });
  });

  it('rejects non-UUID templateId', () => {
    expectFail(createListSchema, { name: 'X', templateId: 'not-a-uuid' });
  });

  it('rejects non-UUID groupId', () => {
    expectFail(createListSchema, { name: 'X', groupId: 'not-a-uuid' });
  });

  it('accepts icon up to 50 chars', () => {
    expectPass(createListSchema, { name: 'X', icon: '🛒' });
  });

  it('rejects icon exceeding 50 chars', () => {
    expectFail(createListSchema, { name: 'X', icon: 'a'.repeat(51) });
  });
});

// ── updateListSchema ──────────────────────────────────────────────────────────

describe('updateListSchema', () => {
  it('accepts empty object (no updates)', () => {
    expectPass(updateListSchema, {});
  });

  it('accepts partial name update', () => {
    expectPass(updateListSchema, { name: 'New Name' });
  });

  it('accepts visibility change', () => {
    expectPass(updateListSchema, { visibility: 'private' });
  });

  it('accepts archive toggle', () => {
    expectPass(updateListSchema, { isArchived: true });
  });

  it('accepts sortOrder change', () => {
    expectPass(updateListSchema, { sortOrder: 3.5 });
  });

  it('accepts null icon (clear)', () => {
    expectPass(updateListSchema, { icon: null });
  });

  it('accepts null groupId (clear)', () => {
    expectPass(updateListSchema, { groupId: null });
  });

  it('rejects empty name', () => {
    expectFail(updateListSchema, { name: '' });
  });

  it('rejects invalid visibility', () => {
    expectFail(updateListSchema, { visibility: 'none' });
  });
});

// ── createListFieldSchema ─────────────────────────────────────────────────────

describe('createListFieldSchema', () => {
  it('accepts minimal valid field', () => {
    expectPass(createListFieldSchema, {
      listId: validUuid,
      name: 'Status',
      fieldType: 'text',
    });
  });

  it('accepts field with config', () => {
    expectPass(createListFieldSchema, {
      listId: validUuid,
      name: 'Priority',
      fieldType: 'select',
      config: { options: ['Low', 'Medium', 'High'] },
    });
  });

  it('accepts field with isRequired and isTitle flags', () => {
    expectPass(createListFieldSchema, {
      listId: validUuid,
      name: 'Title',
      fieldType: 'text',
      isRequired: true,
      isTitle: true,
    });
  });

  it('rejects missing listId', () => {
    expectFail(createListFieldSchema, { name: 'X', fieldType: 'text' });
  });

  it('rejects missing name', () => {
    expectFail(createListFieldSchema, { listId: validUuid, fieldType: 'text' });
  });

  it('rejects empty name', () => {
    expectFail(createListFieldSchema, { listId: validUuid, name: '', fieldType: 'text' });
  });

  it('rejects name exceeding 200 chars', () => {
    expectFail(createListFieldSchema, {
      listId: validUuid,
      name: 'x'.repeat(201),
      fieldType: 'text',
    });
  });

  it('rejects invalid field type', () => {
    expectFail(createListFieldSchema, { listId: validUuid, name: 'X', fieldType: 'color' });
  });

  it('rejects non-UUID listId', () => {
    expectFail(createListFieldSchema, { listId: 'abc', name: 'X', fieldType: 'text' });
  });
});

// ── updateListFieldSchema ─────────────────────────────────────────────────────

describe('updateListFieldSchema', () => {
  it('accepts empty object', () => {
    expectPass(updateListFieldSchema, {});
  });

  it('accepts name update', () => {
    expectPass(updateListFieldSchema, { name: 'Renamed' });
  });

  it('accepts sortOrder update', () => {
    expectPass(updateListFieldSchema, { sortOrder: 5 });
  });

  it('rejects empty name', () => {
    expectFail(updateListFieldSchema, { name: '' });
  });
});

// ── createListViewSchema ──────────────────────────────────────────────────────

describe('createListViewSchema', () => {
  it('accepts minimal table view', () => {
    expectPass(createListViewSchema, {
      listId: validUuid,
      name: 'Default View',
      viewType: 'table',
      config: { visibleFieldIds: [validUuid] },
    });
  });

  it('accepts checklist view with checkboxFieldId', () => {
    expectPass(createListViewSchema, {
      listId: validUuid,
      name: 'Todo View',
      viewType: 'checklist',
      config: { checkboxFieldId: validUuid },
    });
  });

  it('accepts view with filter and sort', () => {
    expectPass(createListViewSchema, {
      listId: validUuid,
      name: 'Filtered',
      viewType: 'table',
      config: { visibleFieldIds: [validUuid] },
      filter: {
        operator: 'and',
        conditions: [{ fieldId: validUuid, comparator: 'eq', value: 'active' }],
      },
      sortBy: [{ fieldId: validUuid, direction: 'asc' }],
      isDefault: true,
    });
  });

  it('rejects missing config', () => {
    expectFail(createListViewSchema, {
      listId: validUuid,
      name: 'X',
      viewType: 'table',
    });
  });

  it('rejects empty name', () => {
    expectFail(createListViewSchema, {
      listId: validUuid,
      name: '',
      viewType: 'table',
      config: { visibleFieldIds: [validUuid] },
    });
  });

  it('rejects invalid view type', () => {
    expectFail(createListViewSchema, {
      listId: validUuid,
      name: 'X',
      viewType: 'kanban',
      config: {},
    });
  });
});

// ── updateListViewSchema ──────────────────────────────────────────────────────

describe('updateListViewSchema', () => {
  it('accepts empty object', () => {
    expectPass(updateListViewSchema, {});
  });

  it('accepts name update', () => {
    expectPass(updateListViewSchema, { name: 'New View Name' });
  });

  it('accepts null filter (clear)', () => {
    expectPass(updateListViewSchema, { filter: null });
  });

  it('accepts null sortBy (clear)', () => {
    expectPass(updateListViewSchema, { sortBy: null });
  });

  it('accepts isDefault toggle', () => {
    expectPass(updateListViewSchema, { isDefault: true });
  });
});

// ── createListItemSchema ──────────────────────────────────────────────────────

describe('createListItemSchema', () => {
  it('accepts item with values', () => {
    expectPass(createListItemSchema, {
      listId: validUuid,
      values: { [validUuid]: 'Hello', [validUuid2]: 42 },
    });
  });

  it('accepts empty values', () => {
    expectPass(createListItemSchema, {
      listId: validUuid,
      values: {},
    });
  });

  it('accepts boolean and null values', () => {
    expectPass(createListItemSchema, {
      listId: validUuid,
      values: { [validUuid]: true, [validUuid2]: null },
    });
  });

  it('accepts optional assigneeId', () => {
    expectPass(createListItemSchema, {
      listId: validUuid,
      assigneeId: validUuid2,
      values: {},
    });
  });

  it('rejects missing listId', () => {
    expectFail(createListItemSchema, { values: {} });
  });

  it('rejects non-UUID listId', () => {
    expectFail(createListItemSchema, { listId: 'abc', values: {} });
  });

  it('rejects non-UUID assigneeId', () => {
    expectFail(createListItemSchema, {
      listId: validUuid,
      assigneeId: 'not-uuid',
      values: {},
    });
  });
});

// ── updateListItemSchema ──────────────────────────────────────────────────────

describe('updateListItemSchema', () => {
  it('accepts empty object', () => {
    expectPass(updateListItemSchema, {});
  });

  it('accepts values update', () => {
    expectPass(updateListItemSchema, {
      values: { [validUuid]: 'Updated' },
    });
  });

  it('accepts assigneeId null (unassign)', () => {
    expectPass(updateListItemSchema, { assigneeId: null });
  });

  it('accepts sortOrder change', () => {
    expectPass(updateListItemSchema, { sortOrder: 10 });
  });
});

// ── listListsSchema ──────────────────────────────────────────────────────────

describe('listListsSchema', () => {
  it('accepts empty object (defaults to includeArchived=false)', () => {
    const result = listListsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeArchived).toBe(false);
    }
  });

  it('accepts includeArchived=true', () => {
    expectPass(listListsSchema, { includeArchived: true });
  });
});

// ── filterExpressionSchema ────────────────────────────────────────────────────

describe('filterExpressionSchema', () => {
  it('accepts simple AND filter', () => {
    expectPass(filterExpressionSchema, {
      operator: 'and',
      conditions: [{ fieldId: validUuid, comparator: 'eq', value: 'done' }],
    });
  });

  it('accepts OR filter with multiple conditions', () => {
    expectPass(filterExpressionSchema, {
      operator: 'or',
      conditions: [
        { fieldId: validUuid, comparator: 'gt', value: 5 },
        { fieldId: validUuid2, comparator: 'is_checked' },
      ],
    });
  });

  it('rejects empty conditions array', () => {
    expectFail(filterExpressionSchema, { operator: 'and', conditions: [] });
  });

  it('rejects invalid operator', () => {
    expectFail(filterExpressionSchema, {
      operator: 'xor',
      conditions: [{ fieldId: validUuid, comparator: 'eq' }],
    });
  });

  it('rejects too many conditions (>20)', () => {
    const conditions = Array.from({ length: 21 }, (_, i) => ({
      fieldId: validUuid,
      comparator: 'eq' as const,
      value: `v${i}`,
    }));
    expectFail(filterExpressionSchema, { operator: 'and', conditions });
  });

  it('rejects invalid comparator', () => {
    expectFail(filterExpressionSchema, {
      operator: 'and',
      conditions: [{ fieldId: validUuid, comparator: 'like' }],
    });
  });
});

// ── sortExpressionSchema ──────────────────────────────────────────────────────

describe('sortExpressionSchema', () => {
  it('accepts valid sort expression', () => {
    expectPass(sortExpressionSchema, { fieldId: validUuid, direction: 'asc' });
    expectPass(sortExpressionSchema, { fieldId: validUuid, direction: 'desc' });
  });

  it('rejects invalid direction', () => {
    expectFail(sortExpressionSchema, { fieldId: validUuid, direction: 'ascending' });
  });

  it('rejects non-UUID fieldId', () => {
    expectFail(sortExpressionSchema, { fieldId: 'abc', direction: 'asc' });
  });
});
