/**
 * Tests for person Zod validation schemas.
 *
 * Coverage targets:
 * - personRoleSchema: all valid roles across both hive types
 * - createPersonSchema / updatePersonSchema: optional field handling
 * - updatePersonProfileSchema: HTTPS-only avatarUrl (XSS/URI injection guard)
 * - updatePersonRoleSchema: role + UUID personId validation
 * - inviteMemberSchema: email normalisation
 * - Security: javascript: / data: URI injection via avatarUrl
 */

import { describe, it, expect } from 'vitest';

import {
  personRoleSchema,
  createPersonSchema,
  updatePersonSchema,
  updatePersonProfileSchema,
  updatePersonRoleSchema,
  inviteMemberSchema,
} from '../person';

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

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

// ── personRoleSchema ──────────────────────────────────────────────────────────

describe('personRoleSchema', () => {
  it.each(['parent', 'child', 'org_admin', 'manager', 'member', 'guest'])(
    'accepts valid role "%s"',
    (role) => {
      pass(personRoleSchema, role);
    }
  );

  it('rejects an unknown role', () => {
    fail(personRoleSchema, 'superuser');
    fail(personRoleSchema, 'admin');
    fail(personRoleSchema, '');
  });

  it('rejects non-string values', () => {
    fail(personRoleSchema, null);
    fail(personRoleSchema, 1);
  });
});

// ── createPersonSchema ────────────────────────────────────────────────────────

describe('createPersonSchema', () => {
  it('accepts minimal input with only role', () => {
    pass(createPersonSchema, { role: 'parent' });
  });

  it('accepts full input', () => {
    pass(createPersonSchema, {
      role: 'member',
      displayName: 'Jane Doe',
      birthdate: new Date('1990-01-01'),
    });
  });

  it('rejects invalid role', () => {
    fail(createPersonSchema, { role: 'unknown' });
  });

  it('rejects displayName shorter than 1 character', () => {
    fail(createPersonSchema, { role: 'parent', displayName: '' });
  });

  it('rejects displayName longer than 255 characters', () => {
    fail(createPersonSchema, { role: 'parent', displayName: 'A'.repeat(256) });
  });

  it('rejects missing role', () => {
    fail(createPersonSchema, {});
  });
});

// ── updatePersonSchema ────────────────────────────────────────────────────────

describe('updatePersonSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    pass(updatePersonSchema, {});
  });

  it('accepts partial update', () => {
    pass(updatePersonSchema, { displayName: 'Updated Name' });
  });

  it('rejects invalid role in update', () => {
    fail(updatePersonSchema, { role: 'hacker' });
  });

  it('rejects avatarUrl that is not a valid URL', () => {
    fail(updatePersonSchema, { avatarUrl: 'not-a-url' });
  });

  it('accepts valid HTTPS avatar URL', () => {
    pass(updatePersonSchema, { avatarUrl: 'https://example.com/avatar.png' });
  });
});

// ── updatePersonProfileSchema ─────────────────────────────────────────────────

describe('updatePersonProfileSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    pass(updatePersonProfileSchema, {});
  });

  it('accepts valid displayName', () => {
    pass(updatePersonProfileSchema, { displayName: 'Alice Müller' });
  });

  it('accepts HTTPS avatarUrl', () => {
    pass(updatePersonProfileSchema, { avatarUrl: 'https://cdn.example.com/photo.jpg' });
  });

  it('rejects HTTP avatarUrl (HTTPS required)', () => {
    fail(updatePersonProfileSchema, { avatarUrl: 'http://insecure.com/avatar.png' });
  });

  it('rejects javascript: URI avatarUrl (XSS injection vector)', () => {
    fail(updatePersonProfileSchema, { avatarUrl: 'javascript:alert(document.cookie)' });
  });

  it('rejects data: URI avatarUrl (data exfiltration / XSS vector)', () => {
    fail(updatePersonProfileSchema, { avatarUrl: 'data:image/png;base64,abc123' });
  });

  it('rejects ftp: URI avatarUrl', () => {
    fail(updatePersonProfileSchema, { avatarUrl: 'ftp://files.example.com/photo.jpg' });
  });

  it('accepts valid ISO date string for birthdate (YYYY-MM-DD)', () => {
    pass(updatePersonProfileSchema, { birthdate: '1990-06-15' });
  });

  it('rejects invalid date string for birthdate', () => {
    fail(updatePersonProfileSchema, { birthdate: 'not-a-date' });
  });

  it('rejects displayName shorter than 1 character', () => {
    fail(updatePersonProfileSchema, { displayName: '' });
  });

  it('rejects displayName longer than 255 characters', () => {
    fail(updatePersonProfileSchema, { displayName: 'A'.repeat(256) });
  });
});

// ── updatePersonRoleSchema ────────────────────────────────────────────────────

describe('updatePersonRoleSchema', () => {
  it('accepts valid personId UUID and valid role', () => {
    pass(updatePersonRoleSchema, { personId: VALID_UUID, role: 'manager' });
  });

  it('rejects personId that is not a UUID', () => {
    fail(updatePersonRoleSchema, { personId: 'not-a-uuid', role: 'manager' });
  });

  it('rejects invalid role', () => {
    fail(updatePersonRoleSchema, { personId: VALID_UUID, role: 'superadmin' });
  });

  it('rejects missing personId', () => {
    fail(updatePersonRoleSchema, { role: 'manager' });
  });

  it('rejects missing role', () => {
    fail(updatePersonRoleSchema, { personId: VALID_UUID });
  });
});

// ── inviteMemberSchema ────────────────────────────────────────────────────────

describe('inviteMemberSchema', () => {
  it('accepts a valid email', () => {
    pass(inviteMemberSchema, { email: 'invite@example.com' });
  });

  it('normalises email to lowercase', () => {
    const r = inviteMemberSchema.safeParse({ email: 'INVITE@EXAMPLE.COM' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('invite@example.com');
  });

  it('rejects an invalid email address', () => {
    fail(inviteMemberSchema, { email: 'not-an-email' });
  });

  it('rejects empty email', () => {
    fail(inviteMemberSchema, { email: '' });
  });

  it('rejects email longer than 320 characters', () => {
    const longEmail = 'a'.repeat(310) + '@example.com';
    fail(inviteMemberSchema, { email: longEmail });
  });
});
