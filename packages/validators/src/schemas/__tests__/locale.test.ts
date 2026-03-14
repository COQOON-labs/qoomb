/**
 * Tests for BCP 47 locale validation schemas.
 */

import { describe, it, expect } from 'vitest';

import { bcp47LocaleSchema, optionalBcp47LocaleSchema, updateLocaleSchema } from '../locale';

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

describe('bcp47LocaleSchema', () => {
  it.each(['de', 'en', 'fr', 'zh'])('accepts language-only tag "%s"', (tag) => {
    pass(bcp47LocaleSchema, tag);
  });

  it.each(['de-DE', 'en-US', 'de-AT', 'fr-FR'])('accepts language + region tag "%s"', (tag) => {
    pass(bcp47LocaleSchema, tag);
  });

  it('accepts language + script + region tag', () => {
    pass(bcp47LocaleSchema, 'zh-Hans-CN');
  });

  it('trims whitespace before validation', () => {
    const r = bcp47LocaleSchema.safeParse('  de  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('de');
  });

  it('rejects single character tag', () => {
    fail(bcp47LocaleSchema, 'e');
  });

  it('rejects tag longer than 12 characters', () => {
    fail(bcp47LocaleSchema, 'en-US-toolong');
  });

  it('rejects uppercase language code', () => {
    fail(bcp47LocaleSchema, 'DE');
  });

  it('rejects numeric tags', () => {
    fail(bcp47LocaleSchema, '123');
  });

  it('rejects empty string', () => {
    fail(bcp47LocaleSchema, '');
  });
});

describe('optionalBcp47LocaleSchema', () => {
  it('accepts undefined', () => {
    pass(optionalBcp47LocaleSchema, undefined);
  });

  it('accepts null', () => {
    pass(optionalBcp47LocaleSchema, null);
  });

  it('accepts valid locale', () => {
    pass(optionalBcp47LocaleSchema, 'de-DE');
  });

  it('rejects invalid locale', () => {
    fail(optionalBcp47LocaleSchema, 'INVALID');
  });
});

describe('updateLocaleSchema', () => {
  it('accepts valid locale object', () => {
    pass(updateLocaleSchema, { locale: 'de' });
    pass(updateLocaleSchema, { locale: 'en-US' });
  });

  it('rejects missing locale', () => {
    fail(updateLocaleSchema, {});
  });

  it('rejects invalid locale value', () => {
    fail(updateLocaleSchema, { locale: 'INVALID' });
  });
});
