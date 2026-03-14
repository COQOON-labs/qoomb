/**
 * Tests for auth Zod validation schemas.
 *
 * Coverage targets:
 * - passwordSchema: length, character class requirements
 * - registerSchema: valid / invalid combinations, XSS-in-name, special chars
 * - loginSchema: email normalisation, relaxed password check
 * - tokenSchema: JWT format (3-segment base64url)
 * - resetPasswordSchema / verifyEmailSchema: secure token length
 * - sendInvitationSchema: optional hiveId as UUID
 * - registerWithInviteSchema: inherits registerSchema + inviteToken
 * - Security edge cases: excessively long inputs (DoS prevention)
 */

import { describe, it, expect } from 'vitest';

import {
  passwordSchema,
  registerSchema,
  loginSchema,
  tokenSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  sendInvitationSchema,
  registerWithInviteSchema,
} from '../auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(schema: { safeParse(v: unknown): { success: boolean } }, data: unknown) {
  const r = schema.safeParse(data);
  expect(
    r.success,
    `Expected parse to succeed, got: ${JSON.stringify((r as { error?: unknown }).error)}`
  ).toBe(true);
}

function fail(schema: { safeParse(v: unknown): { success: boolean } }, data: unknown) {
  expect(
    schema.safeParse(data).success,
    `Expected parse to fail for: ${JSON.stringify(data)}`
  ).toBe(false);
}

// ── passwordSchema ────────────────────────────────────────────────────────────

describe('passwordSchema', () => {
  it('accepts a valid password meeting all requirements', () => {
    pass(passwordSchema, 'Secure1!');
    pass(passwordSchema, 'MyP@ssw0rd');
    pass(passwordSchema, 'Abc123$xyz');
  });

  it('rejects passwords shorter than 8 characters', () => {
    fail(passwordSchema, 'Ab1!');
    fail(passwordSchema, 'Ab1!xyz'); // 7 chars
  });

  it('rejects passwords longer than 100 characters', () => {
    fail(passwordSchema, 'Aa1!' + 'x'.repeat(97)); // 101 chars
  });

  it('rejects passwords missing an uppercase letter', () => {
    fail(passwordSchema, 'secure1!');
  });

  it('rejects passwords missing a lowercase letter', () => {
    fail(passwordSchema, 'SECURE1!');
  });

  it('rejects passwords missing a digit', () => {
    fail(passwordSchema, 'SecureAbc!');
  });

  it('rejects passwords missing a special character', () => {
    fail(passwordSchema, 'Secure123');
  });

  it('rejects empty string', () => {
    fail(passwordSchema, '');
  });

  it('rejects non-string values', () => {
    fail(passwordSchema, 123456);
    fail(passwordSchema, null);
  });
});

// ── registerSchema ────────────────────────────────────────────────────────────

describe('registerSchema', () => {
  const validBase = {
    email: 'alice@example.com',
    password: 'Secure1!',
    hiveName: 'Smith Family',
    hiveType: 'family' as const,
    adminName: 'Alice',
  };

  it('accepts a valid family registration', () => {
    pass(registerSchema, validBase);
  });

  it('accepts a valid organization registration', () => {
    pass(registerSchema, { ...validBase, hiveType: 'organization' });
  });

  it('rejects unknown hiveType', () => {
    fail(registerSchema, { ...validBase, hiveType: 'club' });
  });

  it('normalises email to lowercase', () => {
    const r = registerSchema.safeParse({ ...validBase, email: 'Alice@Example.COM' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('alice@example.com');
  });

  it('rejects invalid email address', () => {
    fail(registerSchema, { ...validBase, email: 'not-an-email' });
  });

  it('rejects missing email', () => {
    const { email: _e, ...rest } = validBase;
    fail(registerSchema, rest);
  });

  it('rejects weak password', () => {
    fail(registerSchema, { ...validBase, password: 'weakpassword' });
  });

  it('rejects blank adminName', () => {
    fail(registerSchema, { ...validBase, adminName: '' });
  });

  it('rejects adminName with XSS characters (<script>)', () => {
    fail(registerSchema, { ...validBase, adminName: '<script>alert(1)</script>' });
  });

  it('rejects adminName with SQL injection characters (semicolons not in allowed set)', () => {
    fail(registerSchema, { ...validBase, adminName: "Robert'); DROP TABLE--" });
  });

  it('accepts adminName with allowed special characters (hyphen, apostrophe, German umlauts)', () => {
    pass(registerSchema, { ...validBase, adminName: "O'Brien-Müller" });
    pass(registerSchema, { ...validBase, adminName: 'Ärztekammer' });
  });

  it('rejects hiveName longer than 255 characters', () => {
    fail(registerSchema, { ...validBase, hiveName: 'A'.repeat(256) });
  });

  it('rejects adminName longer than 255 characters', () => {
    fail(registerSchema, { ...validBase, adminName: 'A'.repeat(256) });
  });
});

// ── loginSchema ───────────────────────────────────────────────────────────────

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    pass(loginSchema, { email: 'user@example.com', password: 'anypassword' });
  });

  it('normalises email to lowercase', () => {
    const r = loginSchema.safeParse({ email: 'USER@EXAMPLE.COM', password: 'pass' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('user@example.com');
  });

  it('accepts any non-empty password (no strength check on login)', () => {
    // Relaxed: login must not reveal password requirements to attackers
    pass(loginSchema, { email: 'user@example.com', password: 'short' });
  });

  it('rejects empty password', () => {
    fail(loginSchema, { email: 'user@example.com', password: '' });
  });

  it('rejects password longer than 100 characters (DoS guard)', () => {
    fail(loginSchema, { email: 'user@example.com', password: 'x'.repeat(101) });
  });

  it('rejects invalid email', () => {
    fail(loginSchema, { email: 'not-an-email', password: 'pass' });
  });

  it('rejects missing fields', () => {
    fail(loginSchema, { email: 'user@example.com' });
    fail(loginSchema, { password: 'pass' });
  });
});

// ── tokenSchema ───────────────────────────────────────────────────────────────

describe('tokenSchema', () => {
  it('accepts a valid JWT-format token (3 base64url segments)', () => {
    // Minimal but structurally valid JWT
    pass(tokenSchema, 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature'); // gitleaks:allow
  });

  it('rejects a token with only 2 segments', () => {
    fail(tokenSchema, 'header.payload');
  });

  it('rejects a token with 4 segments', () => {
    fail(tokenSchema, 'a.b.c.d');
  });

  it('rejects empty string', () => {
    fail(tokenSchema, '');
  });
});

// ── resetPasswordSchema ───────────────────────────────────────────────────────

describe('resetPasswordSchema', () => {
  const validToken = 'a'.repeat(43); // 43 chars — typical base64url for 32 random bytes

  it('accepts valid token and strong new password', () => {
    pass(resetPasswordSchema, { token: validToken, newPassword: 'NewPass1!' });
  });

  it('rejects token shorter than 32 characters', () => {
    fail(resetPasswordSchema, { token: 'short', newPassword: 'NewPass1!' });
  });

  it('rejects weak new password', () => {
    fail(resetPasswordSchema, { token: validToken, newPassword: 'weakpassword' });
  });

  it('rejects missing fields', () => {
    fail(resetPasswordSchema, { token: validToken });
    fail(resetPasswordSchema, { newPassword: 'NewPass1!' });
  });
});

// ── verifyEmailSchema ─────────────────────────────────────────────────────────

describe('verifyEmailSchema', () => {
  it('accepts a token of valid length', () => {
    pass(verifyEmailSchema, { token: 'a'.repeat(43) });
  });

  it('rejects token shorter than 32 characters', () => {
    fail(verifyEmailSchema, { token: 'short' });
  });

  it('rejects token longer than 128 characters', () => {
    fail(verifyEmailSchema, { token: 'a'.repeat(129) });
  });
});

// ── requestPasswordResetSchema ────────────────────────────────────────────────

describe('requestPasswordResetSchema', () => {
  it('accepts a valid email', () => {
    pass(requestPasswordResetSchema, { email: 'user@example.com' });
  });

  it('normalises email to lowercase', () => {
    const r = requestPasswordResetSchema.safeParse({ email: 'USER@EXAMPLE.COM' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('user@example.com');
  });

  it('rejects invalid email', () => {
    fail(requestPasswordResetSchema, { email: 'not-an-email' });
  });
});

// ── sendInvitationSchema ──────────────────────────────────────────────────────

describe('sendInvitationSchema', () => {
  it('accepts email without hiveId', () => {
    pass(sendInvitationSchema, { email: 'user@example.com' });
  });

  it('accepts email with valid UUID hiveId', () => {
    pass(sendInvitationSchema, {
      email: 'user@example.com',
      hiveId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects hiveId that is not a UUID', () => {
    fail(sendInvitationSchema, { email: 'user@example.com', hiveId: 'not-a-uuid' });
  });
});

// ── registerWithInviteSchema ──────────────────────────────────────────────────

describe('registerWithInviteSchema', () => {
  const base = {
    email: 'alice@example.com',
    password: 'Secure1!',
    hiveName: '',
    hiveType: 'family' as const,
    adminName: 'Alice',
    inviteToken: 'a'.repeat(43),
  };

  it('accepts valid invite registration with empty hiveName', () => {
    pass(registerWithInviteSchema, base);
  });

  it('accepts valid invite registration with non-empty hiveName', () => {
    pass(registerWithInviteSchema, { ...base, hiveName: 'New Hive' });
  });

  it('rejects missing inviteToken', () => {
    const { inviteToken: _t, ...rest } = base;
    fail(registerWithInviteSchema, rest);
  });

  it('rejects inviteToken shorter than 32 characters', () => {
    fail(registerWithInviteSchema, { ...base, inviteToken: 'short' });
  });

  it('rejects weak password', () => {
    fail(registerWithInviteSchema, { ...base, password: 'weakpassword' });
  });
});
