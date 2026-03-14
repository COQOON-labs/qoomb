/**
 * Tests for group Zod validation schemas.
 *
 * Coverage targets:
 * - createGroupSchema: required name, optional description, length limits
 * - updateGroupSchema: fully optional, can clear description with null
 * - addGroupMemberSchema / removeGroupMemberSchema: UUID validation for both IDs
 */

import { describe, it, expect } from 'vitest';

import {
  createGroupSchema,
  updateGroupSchema,
  addGroupMemberSchema,
  removeGroupMemberSchema,
} from '../group';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(schema: { safeParse(v: unknown): { success: boolean } }, data: unknown) {
  const r = schema.safeParse(data);
  expect(
    r.success,
    `Expected success, got: ${JSON.stringify((r as { error?: unknown }).error)}`
  ).toBe(true);
}

function fail(schema: { safeParse(v: unknown): { success: boolean } }, data: unknown) {
  expect(schema.safeParse(data).success, `Expected failure for: ${JSON.stringify(data)}`).toBe(
    false
  );
}

const VALID_GROUP_UUID = '00000000-0000-4000-8000-000000000001';
const VALID_PERSON_UUID = '00000000-0000-4000-8000-000000000002';

// ── createGroupSchema ─────────────────────────────────────────────────────────

describe('createGroupSchema', () => {
  it('accepts minimal input with only name', () => {
    pass(createGroupSchema, { name: 'Engineering' });
  });

  it('accepts name with description', () => {
    pass(createGroupSchema, { name: 'Engineering', description: 'All engineers' });
  });

  it('trims whitespace from name', () => {
    const r = createGroupSchema.safeParse({ name: '  Frontend  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Frontend');
  });

  it('rejects empty name (after trim)', () => {
    fail(createGroupSchema, { name: '' });
    fail(createGroupSchema, { name: '   ' }); // whitespace-only
  });

  it('rejects name longer than 255 characters', () => {
    fail(createGroupSchema, { name: 'A'.repeat(256) });
  });

  it('rejects description longer than 1000 characters', () => {
    fail(createGroupSchema, { name: 'Team', description: 'A'.repeat(1001) });
  });

  it('rejects missing name', () => {
    fail(createGroupSchema, {});
    fail(createGroupSchema, { description: 'A group without a name' });
  });
});

// ── updateGroupSchema ─────────────────────────────────────────────────────────

describe('updateGroupSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    pass(updateGroupSchema, {});
  });

  it('accepts updating only name', () => {
    pass(updateGroupSchema, { name: 'New Name' });
  });

  it('accepts updating only description', () => {
    pass(updateGroupSchema, { description: 'Updated description' });
  });

  it('accepts null description to clear the field', () => {
    pass(updateGroupSchema, { description: null });
  });

  it('rejects empty name (after trim)', () => {
    fail(updateGroupSchema, { name: '' });
  });

  it('rejects name longer than 255 characters', () => {
    fail(updateGroupSchema, { name: 'A'.repeat(256) });
  });

  it('rejects description longer than 1000 characters', () => {
    fail(updateGroupSchema, { description: 'A'.repeat(1001) });
  });
});

// ── addGroupMemberSchema ──────────────────────────────────────────────────────

describe('addGroupMemberSchema', () => {
  it('accepts valid groupId and personId UUIDs', () => {
    pass(addGroupMemberSchema, { groupId: VALID_GROUP_UUID, personId: VALID_PERSON_UUID });
  });

  it('rejects groupId that is not a UUID', () => {
    fail(addGroupMemberSchema, { groupId: 'not-a-uuid', personId: VALID_PERSON_UUID });
  });

  it('rejects personId that is not a UUID', () => {
    fail(addGroupMemberSchema, { groupId: VALID_GROUP_UUID, personId: 'not-a-uuid' });
  });

  it('rejects missing groupId', () => {
    fail(addGroupMemberSchema, { personId: VALID_PERSON_UUID });
  });

  it('rejects missing personId', () => {
    fail(addGroupMemberSchema, { groupId: VALID_GROUP_UUID });
  });

  it('rejects empty object', () => {
    fail(addGroupMemberSchema, {});
  });
});

// ── removeGroupMemberSchema ───────────────────────────────────────────────────

describe('removeGroupMemberSchema', () => {
  it('accepts valid groupId and personId UUIDs', () => {
    pass(removeGroupMemberSchema, { groupId: VALID_GROUP_UUID, personId: VALID_PERSON_UUID });
  });

  it('rejects groupId that is not a UUID', () => {
    fail(removeGroupMemberSchema, { groupId: 'bad-id', personId: VALID_PERSON_UUID });
  });

  it('rejects personId that is not a UUID', () => {
    fail(removeGroupMemberSchema, { groupId: VALID_GROUP_UUID, personId: 'bad-id' });
  });

  it('rejects missing fields', () => {
    fail(removeGroupMemberSchema, {});
  });
});
