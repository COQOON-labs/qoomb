/**
 * Tests for common Zod validation schemas.
 *
 * Coverage targets:
 * - uuidSchema: valid UUIDs vs invalid strings
 * - emailSchema: normalisation (lowercase + trim), length limits
 * - urlSchema: valid URLs, length limit
 * - hexColorSchema: #RRGGBB format
 * - paginationSchema: defaults, bounds
 * - timezoneSchema: Region/City format
 * - iso8601DurationSchema: P-format durations
 * - phoneNumberSchema: international E.164 format
 * - sortOrderSchema: asc/desc default
 * - searchQuerySchema: max length, optional
 */

import { describe, it, expect } from 'vitest';

import {
  uuidSchema,
  emailSchema,
  urlSchema,
  hexColorSchema,
  paginationSchema,
  timezoneSchema,
  iso8601DurationSchema,
  phoneNumberSchema,
  sortOrderSchema,
  searchQuerySchema,
  safeStringSchema,
} from '../common';

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

// ── safeStringSchema (factory) ────────────────────────────────────────────────

describe('safeStringSchema', () => {
  it('uses default minLength=1 and maxLength=1000', () => {
    const schema = safeStringSchema();
    expect(schema.safeParse('a').success).toBe(true);
    expect(schema.safeParse('').success).toBe(false);
    expect(schema.safeParse('x'.repeat(1001)).success).toBe(false);
  });

  it('respects custom minLength', () => {
    const schema = safeStringSchema(5);
    expect(schema.safeParse('abcde').success).toBe(true);
    expect(schema.safeParse('abcd').success).toBe(false);
  });

  it('respects custom maxLength', () => {
    const schema = safeStringSchema(1, 10);
    expect(schema.safeParse('hello').success).toBe(true);
    expect(schema.safeParse('x'.repeat(11)).success).toBe(false);
  });

  it('trims whitespace before checking length', () => {
    const schema = safeStringSchema(1, 5);
    const r = schema.safeParse('  hi  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('hi');
  });
});

// ── uuidSchema ────────────────────────────────────────────────────────────────

describe('uuidSchema', () => {
  it('accepts a valid v4 UUID', () => {
    pass(uuidSchema, '00000000-0000-4000-8000-000000000001');
    pass(uuidSchema, 'a1b2c3d4-e5f6-4789-abcd-ef0123456789');
  });

  it('rejects a non-UUID string', () => {
    fail(uuidSchema, 'not-a-uuid');
    fail(uuidSchema, '1234');
    fail(uuidSchema, '');
  });

  it('rejects non-string values', () => {
    fail(uuidSchema, null);
    fail(uuidSchema, 123);
  });
});

// ── emailSchema ───────────────────────────────────────────────────────────────

describe('emailSchema', () => {
  it('accepts a valid email address', () => {
    pass(emailSchema, 'user@example.com');
  });

  it('normalises to lowercase', () => {
    const r = emailSchema.safeParse('USER@EXAMPLE.COM');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('user@example.com');
  });

  it('trims leading/trailing whitespace', () => {
    const r = emailSchema.safeParse('  user@example.com  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('user@example.com');
  });

  it('rejects an invalid email format', () => {
    fail(emailSchema, 'not-an-email');
    fail(emailSchema, '@example.com');
    fail(emailSchema, 'user@');
  });

  it('rejects empty string', () => {
    fail(emailSchema, '');
  });

  it('rejects email longer than 320 characters', () => {
    fail(emailSchema, 'a'.repeat(310) + '@example.com');
  });
});

// ── urlSchema ─────────────────────────────────────────────────────────────────

describe('urlSchema', () => {
  it('accepts a valid URL', () => {
    pass(urlSchema, 'https://example.com');
    pass(urlSchema, 'http://localhost:3000/path?query=1');
  });

  it('rejects a non-URL string', () => {
    fail(urlSchema, 'not-a-url');
    fail(urlSchema, 'example.com'); // missing scheme
  });

  it('rejects URL longer than 2000 characters', () => {
    fail(urlSchema, 'https://example.com/' + 'a'.repeat(1990));
  });
});

// ── hexColorSchema ────────────────────────────────────────────────────────────

describe('hexColorSchema', () => {
  it('accepts #RRGGBB format', () => {
    pass(hexColorSchema, '#1A2B3C');
    pass(hexColorSchema, '#ffffff');
    pass(hexColorSchema, '#000000');
    pass(hexColorSchema, '#ABCDEF');
  });

  it('rejects color without # prefix', () => {
    fail(hexColorSchema, 'ffffff');
    fail(hexColorSchema, '1A2B3C');
  });

  it('rejects 3-digit shorthand (#RGB)', () => {
    fail(hexColorSchema, '#fff');
  });

  it('rejects 8-digit format (#RRGGBBAA)', () => {
    fail(hexColorSchema, '#1A2B3C4D');
  });

  it('rejects non-hex characters', () => {
    fail(hexColorSchema, '#GGGGGG');
    fail(hexColorSchema, '#12345Z');
  });

  it('rejects empty string', () => {
    fail(hexColorSchema, '');
  });
});

// ── paginationSchema ──────────────────────────────────────────────────────────

describe('paginationSchema', () => {
  it('accepts valid page and limit', () => {
    pass(paginationSchema, { page: 1, limit: 20 });
    pass(paginationSchema, { page: 5, limit: 100 });
  });

  it('defaults page to 1 when omitted', () => {
    const r = paginationSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.page).toBe(1);
  });

  it('defaults limit to 20 when omitted', () => {
    const r = paginationSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(20);
  });

  it('rejects page of 0 (must be positive)', () => {
    fail(paginationSchema, { page: 0, limit: 20 });
  });

  it('rejects negative page', () => {
    fail(paginationSchema, { page: -1, limit: 20 });
  });

  it('rejects limit of 0', () => {
    fail(paginationSchema, { page: 1, limit: 0 });
  });

  it('rejects limit greater than 100', () => {
    fail(paginationSchema, { page: 1, limit: 101 });
  });
});

// ── sortOrderSchema ───────────────────────────────────────────────────────────

describe('sortOrderSchema', () => {
  it('accepts "asc"', () => {
    pass(sortOrderSchema, 'asc');
  });

  it('accepts "desc"', () => {
    pass(sortOrderSchema, 'desc');
  });

  it('defaults to "asc"', () => {
    const r = sortOrderSchema.safeParse(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('asc');
  });

  it('rejects unknown order values', () => {
    fail(sortOrderSchema, 'random');
    fail(sortOrderSchema, 'ascending');
    fail(sortOrderSchema, '');
  });
});

// ── searchQuerySchema ─────────────────────────────────────────────────────────

describe('searchQuerySchema', () => {
  it('accepts a valid search string', () => {
    pass(searchQuerySchema, 'meeting');
  });

  it('accepts undefined (field is optional)', () => {
    pass(searchQuerySchema, undefined);
  });

  it('trims whitespace', () => {
    const r = searchQuerySchema.safeParse('  query  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('query');
  });

  it('rejects strings longer than 500 characters', () => {
    fail(searchQuerySchema, 'a'.repeat(501));
  });
});

// ── timezoneSchema ────────────────────────────────────────────────────────────

describe('timezoneSchema', () => {
  it('accepts Europe/Berlin', () => {
    pass(timezoneSchema, 'Europe/Berlin');
  });

  it('accepts America/New_York', () => {
    pass(timezoneSchema, 'America/New_York');
  });

  it('rejects plain strings without region/city', () => {
    fail(timezoneSchema, 'UTC');
    fail(timezoneSchema, 'GMT');
    fail(timezoneSchema, '');
  });

  it('rejects numeric offsets', () => {
    fail(timezoneSchema, '+02:00');
  });
});

// ── iso8601DurationSchema ─────────────────────────────────────────────────────

describe('iso8601DurationSchema', () => {
  it('accepts P1Y (1 year)', () => {
    pass(iso8601DurationSchema, 'P1Y');
  });

  it('accepts P1M (1 month)', () => {
    pass(iso8601DurationSchema, 'P1M');
  });

  it('accepts P7D (7 days)', () => {
    pass(iso8601DurationSchema, 'P7D');
  });

  it('accepts PT1H (1 hour)', () => {
    pass(iso8601DurationSchema, 'PT1H');
  });

  it('accepts P1Y2M3DT4H5M6S', () => {
    pass(iso8601DurationSchema, 'P1Y2M3DT4H5M6S');
  });

  it('rejects strings not starting with P', () => {
    fail(iso8601DurationSchema, '1Y');
    fail(iso8601DurationSchema, 'invalid');
    fail(iso8601DurationSchema, '');
  });
});

// ── phoneNumberSchema ─────────────────────────────────────────────────────────

describe('phoneNumberSchema', () => {
  it('accepts a valid E.164 number with + prefix', () => {
    pass(phoneNumberSchema, '+491234567890');
    pass(phoneNumberSchema, '+12125551234');
  });

  it('accepts a number without + prefix', () => {
    pass(phoneNumberSchema, '491234567890');
  });

  it('rejects a number starting with 0', () => {
    fail(phoneNumberSchema, '+01234567890');
    fail(phoneNumberSchema, '01234567890');
  });

  it('rejects a number with letters', () => {
    fail(phoneNumberSchema, '+49CALL1234');
  });

  it('rejects empty string', () => {
    fail(phoneNumberSchema, '');
  });

  it('rejects a number exceeding E.164 max length (15 digits)', () => {
    fail(phoneNumberSchema, '+1234567890123456'); // 16 digits after +
  });
});
