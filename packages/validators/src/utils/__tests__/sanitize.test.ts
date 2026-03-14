/**
 * Tests for input sanitization utilities.
 *
 * Coverage targets (security-critical):
 * - sanitizeHtml: strips all HTML tags, blocks XSS payloads
 * - sanitizeSql: escapes SQL control characters (defense-in-depth)
 * - normalizeWhitespace: trims, collapses spaces, removes zero-width chars
 * - sanitizeFileName: prevents path traversal (../, null bytes, absolute paths)
 * - sanitizeUuid: validates UUID format, rejects injections
 * - removeControlCharacters: strips invisible control chars
 * - limitLength: hard-truncates strings (DoS guard)
 * - sanitizeText: composition of normalise + removeControl + limitLength
 * - sanitizeSearchQuery: escapes regex special chars, limits length
 */

import { describe, it, expect } from 'vitest';

import {
  sanitizeHtml,
  sanitizeSql,
  normalizeWhitespace,
  sanitizeFileName,
  sanitizeUuid,
  removeControlCharacters,
  limitLength,
  sanitizeText,
  sanitizeSearchQuery,
} from '../sanitize';

// ── sanitizeHtml ──────────────────────────────────────────────────────────────

describe('sanitizeHtml', () => {
  it('returns plain text unchanged', () => {
    expect(sanitizeHtml('Hello World')).toBe('Hello World');
  });

  it('strips a simple <b> tag', () => {
    expect(sanitizeHtml('<b>bold</b>')).toBe('bold');
  });

  it('strips <script> XSS payload', () => {
    expect(sanitizeHtml('<script>alert(document.cookie)</script>')).toBe('');
  });

  it('strips inline event handler (onerror XSS)', () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).toBe('');
  });

  it('strips javascript: href XSS', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">click</a>')).toBe('click');
  });

  it('strips nested/obfuscated tags', () => {
    expect(sanitizeHtml('<sc<script>ript>alert(1)</sc</script>ript>')).not.toContain('<script>');
  });

  it('strips style tags', () => {
    expect(sanitizeHtml('<style>body{color:red}</style>')).toBe('');
  });

  it('strips iframe tags', () => {
    expect(sanitizeHtml('<iframe src="https://evil.com"></iframe>')).toBe('');
  });

  it('preserves text content inside stripped tags', () => {
    expect(sanitizeHtml('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

// ── sanitizeSql ───────────────────────────────────────────────────────────────

describe('sanitizeSql', () => {
  it('returns clean strings unchanged', () => {
    expect(sanitizeSql('hello world')).toBe('hello world');
  });

  it('escapes single quotes', () => {
    expect(sanitizeSql("O'Brien")).toContain("\\'");
  });

  it('escapes double quotes', () => {
    expect(sanitizeSql('"value"')).toContain('\\"');
  });

  it('escapes backslashes', () => {
    expect(sanitizeSql('path\\file')).toContain('\\\\');
  });

  it('escapes null bytes', () => {
    expect(sanitizeSql('before\0after')).toContain('\\0');
  });

  it('escapes newlines (\\n)', () => {
    expect(sanitizeSql('line1\nline2')).toContain('\\n');
  });

  it('escapes carriage returns (\\r)', () => {
    expect(sanitizeSql('line1\rline2')).toContain('\\r');
  });

  it('escapes backspace (\\x08)', () => {
    expect(sanitizeSql('hel\x08lo')).toContain('\\b');
  });

  it('escapes horizontal tab (\\x09)', () => {
    expect(sanitizeSql('col1\x09col2')).toContain('\\t');
  });

  it('escapes substitute char (\\x1a)', () => {
    expect(sanitizeSql('data\x1aend')).toContain('\\z');
  });

  it('escapes percent sign (%)', () => {
    expect(sanitizeSql('LIKE %value%')).toContain('\\%');
  });

  it('handles a classic SQL injection attempt', () => {
    const result = sanitizeSql("'; DROP TABLE users; --");
    expect(result).not.toBe("'; DROP TABLE users; --");
    expect(result).toContain("\\'");
  });
});

// ── normalizeWhitespace ───────────────────────────────────────────────────────

describe('normalizeWhitespace', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces to one', () => {
    expect(normalizeWhitespace('hello   world')).toBe('hello world');
  });

  it('removes zero-width space (U+200B)', () => {
    expect(normalizeWhitespace('hel\u200Blo')).toBe('hello');
  });

  it('removes zero-width non-joiner (U+200C)', () => {
    expect(normalizeWhitespace('hel\u200Clo')).toBe('hello');
  });

  it('removes BOM (U+FEFF)', () => {
    expect(normalizeWhitespace('\uFEFFhello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(normalizeWhitespace('')).toBe('');
  });
});

// ── sanitizeFileName ──────────────────────────────────────────────────────────

describe('sanitizeFileName', () => {
  it('returns a clean filename unchanged', () => {
    expect(sanitizeFileName('document.pdf')).toBe('document.pdf');
  });

  it('replaces forward slashes (path traversal)', () => {
    expect(sanitizeFileName('../../etc/passwd')).not.toContain('/');
  });

  it('replaces backslashes (Windows path traversal)', () => {
    expect(sanitizeFileName('..\\..\\windows\\system32')).not.toContain('\\');
  });

  it('replaces .. sequences', () => {
    expect(sanitizeFileName('../secret')).not.toContain('..');
  });

  it('removes null bytes', () => {
    expect(sanitizeFileName('file\0name.txt')).not.toContain('\0');
  });

  it('removes leading dots', () => {
    const result = sanitizeFileName('.hidden');
    expect(result).not.toMatch(/^\./);
  });

  it('handles empty string', () => {
    expect(sanitizeFileName('')).toBe('');
  });
});

// ── sanitizeUuid ──────────────────────────────────────────────────────────────

describe('sanitizeUuid', () => {
  it('accepts a valid v4 UUID', () => {
    expect(sanitizeUuid('00000000-0000-4000-8000-000000000001')).toBe(
      '00000000-0000-4000-8000-000000000001'
    );
  });

  it('normalises to lowercase', () => {
    expect(sanitizeUuid('ABCD1234-AB12-4000-8000-ABCDEF123456')).toBe(
      'abcd1234-ab12-4000-8000-abcdef123456'
    );
  });

  it('trims whitespace before validating', () => {
    expect(sanitizeUuid('  00000000-0000-4000-8000-000000000001  ')).toBe(
      '00000000-0000-4000-8000-000000000001'
    );
  });

  it('returns null for a non-UUID string', () => {
    expect(sanitizeUuid('not-a-uuid')).toBeNull();
  });

  it('returns null for SQL injection attempt', () => {
    expect(sanitizeUuid("' OR 1=1 --")).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeUuid('')).toBeNull();
  });

  it('returns null for UUID with missing segment', () => {
    expect(sanitizeUuid('00000000-0000-4000-8000')).toBeNull();
  });
});

// ── removeControlCharacters ───────────────────────────────────────────────────

describe('removeControlCharacters', () => {
  it('returns clean strings unchanged', () => {
    expect(removeControlCharacters('Hello World')).toBe('Hello World');
  });

  it('removes null byte (\\x00)', () => {
    expect(removeControlCharacters('hel\x00lo')).toBe('hello');
  });

  it('removes backspace (\\x08)', () => {
    expect(removeControlCharacters('hel\x08lo')).toBe('hello');
  });

  it('removes DEL (\\x7F)', () => {
    expect(removeControlCharacters('hel\x7Flo')).toBe('hello');
  });

  it('preserves newlines (\\n)', () => {
    expect(removeControlCharacters('line1\nline2')).toBe('line1\nline2');
  });

  it('preserves tabs (\\t)', () => {
    expect(removeControlCharacters('col1\tcol2')).toBe('col1\tcol2');
  });
});

// ── limitLength ───────────────────────────────────────────────────────────────

describe('limitLength', () => {
  it('returns string unchanged if within limit', () => {
    expect(limitLength('hello', 10)).toBe('hello');
  });

  it('truncates to exact limit', () => {
    expect(limitLength('hello world', 5)).toBe('hello');
  });

  it('handles limit equal to string length', () => {
    expect(limitLength('hello', 5)).toBe('hello');
  });

  it('handles limit of 0', () => {
    expect(limitLength('hello', 0)).toBe('');
  });
});

// ── sanitizeText ──────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
  it('returns clean text unchanged', () => {
    expect(sanitizeText('Hello World')).toBe('Hello World');
  });

  it('removes control characters', () => {
    expect(sanitizeText('hel\x00lo')).toBe('hello');
  });

  it('normalises whitespace', () => {
    expect(sanitizeText('  hello   world  ')).toBe('hello world');
  });

  it('truncates to maxLength (default 10000)', () => {
    const long = 'a'.repeat(10001);
    expect(sanitizeText(long)).toHaveLength(10000);
  });

  it('truncates to custom maxLength', () => {
    expect(sanitizeText('hello world', 5)).toBe('hello');
  });
});

// ── sanitizeSearchQuery ───────────────────────────────────────────────────────

describe('sanitizeSearchQuery', () => {
  it('returns plain words unchanged (no special chars)', () => {
    expect(sanitizeSearchQuery('meeting notes')).toBe('meeting notes');
  });

  it('escapes regex special characters to prevent ReDoS', () => {
    const result = sanitizeSearchQuery('(a+b)*');
    expect(result).toContain('\\(');
    expect(result).toContain('\\+');
    expect(result).toContain('\\*');
  });

  it('limits output to 500 characters', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeSearchQuery(long).length).toBeLessThanOrEqual(500);
  });

  it('normalises whitespace', () => {
    expect(sanitizeSearchQuery('  hello   world  ')).toBe('hello world');
  });
});
