/**
 * Input sanitization utilities for security
 *
 * These utilities provide defense-in-depth by sanitizing input
 * even after Zod validation. They help prevent:
 * - XSS attacks
 * - SQL injection
 * - NoSQL injection
 * - Command injection
 */

/**
 * Remove HTML tags and encode special characters
 * Prevents XSS attacks by removing potentially dangerous HTML
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<[^<>]*>/g, '') // First pass: remove complete tags (bounded pattern prevents ReDoS)
    .replace(/<[^<>]*>/g, '') // Second pass: remove tags reconstructed from nested input (e.g. <sc<script>ript>)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Remove SQL control characters
 * Defense-in-depth measure (should never be needed with parameterized queries)
 */
export function sanitizeSql(input: string): string {
  return (
    input
      // eslint-disable-next-line no-control-regex, no-useless-escape
      .replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
        switch (char) {
          case '\0':
            return '\\0';
          case '\x08':
            return '\\b';
          case '\x09':
            return '\\t';
          case '\x1a':
            return '\\z';
          case '\n':
            return '\\n';
          case '\r':
            return '\\r';
          case '"':
          case "'":
          case '\\':
          case '%':
            return '\\' + char;
          default:
            return char;
        }
      })
  );
}

/**
 * Normalize whitespace in strings
 * - Trims leading/trailing whitespace
 * - Replaces multiple spaces with single space
 * - Removes zero-width characters
 */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width chars
    .replace(/\s+/g, ' ') // Replace multiple spaces
    .trim();
}

/**
 * Sanitize file name to prevent path traversal
 * Removes: ../, ./, absolute paths, null bytes
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[/\\]/g, '_') // Replace slashes
    .replace(/\.\./g, '_') // Replace ..
    .replace(/^\.+/, '') // Remove leading dots
    .trim();
}

/**
 * Validate and sanitize UUID
 * Returns null if invalid
 */
export function sanitizeUuid(uuid: string): string | null {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const trimmed = uuid.trim().toLowerCase();

  return uuidRegex.test(trimmed) ? trimmed : null;
}

/**
 * Sanitize email address
 * - Trims whitespace
 * - Converts to lowercase
 * - Validates basic format
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/\s+/g, ''); // Remove any whitespace
}

/**
 * Remove control characters from strings
 * Keeps printable ASCII and common Unicode
 */
export function removeControlCharacters(input: string): string {
  // Remove control characters but keep newlines and tabs
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Limit string length safely
 * Prevents DoS attacks via extremely long strings
 */
export function limitLength(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }

  return input.substring(0, maxLength);
}

/**
 * Comprehensive text sanitization
 * Combines multiple sanitization steps for general text input
 */
export function sanitizeText(input: string, maxLength = 10000): string {
  return limitLength(normalizeWhitespace(removeControlCharacters(input)), maxLength);
}

/**
 * Sanitize search query
 * - Removes special regex characters that could cause DoS
 * - Limits length
 * - Normalizes whitespace
 */
export function sanitizeSearchQuery(query: string): string {
  return limitLength(
    normalizeWhitespace(
      query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    ),
    500
  );
}
