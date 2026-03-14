/**
 * Tests for event Zod validation schemas.
 *
 * Coverage targets:
 * - createEventSchema: required fields, endAt > startAt invariant
 * - createEventSchema: HTTPS-only URL enforcement (XSS / URI injection guard)
 * - createEventSchema: hex color format validation
 * - createEventSchema: visibility enum + groupId requirement when visibility='group'
 * - createEventSchema: recurrenceRule requires count OR until (DoS / CWE-400 guard)
 * - recurrenceRule field validations: frequency, interval, byDay, byMonth, byMonthDay
 * - updateEventSchema: all optional fields, same URL/color/recurrence constraints
 * - listEventsSchema: optional filters
 */

import { describe, it, expect } from 'vitest';

import { createEventSchema, updateEventSchema, listEventsSchema } from '../event';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(schema: { safeParse(v: unknown): { success: boolean } }, data: unknown) {
  const r = schema.safeParse(data);
  expect(
    r.success,
    `Expected success, errors: ${JSON.stringify((r as { error?: unknown }).error)}`
  ).toBe(true);
}

function fail(schema: { safeParse(v: unknown): { success: boolean } }, data: unknown) {
  expect(schema.safeParse(data).success, `Expected failure for: ${JSON.stringify(data)}`).toBe(
    false
  );
}

// ── Shared test data ──────────────────────────────────────────────────────────

const NOW = '2025-06-01T10:00:00.000Z';
const LATER = '2025-06-01T11:00:00.000Z';
const VALID_UUID = '00000000-0000-4000-8000-000000000001';

const baseEvent = {
  title: 'Team Meeting',
  startAt: NOW,
  endAt: LATER,
};

// ═══════════════════════════════════════════════════════════════════════════════
// createEventSchema
// ═══════════════════════════════════════════════════════════════════════════════

describe('createEventSchema — required fields', () => {
  it('accepts minimal valid event', () => {
    pass(createEventSchema, baseEvent);
  });

  it('accepts fully-populated event', () => {
    pass(createEventSchema, {
      ...baseEvent,
      description: 'Weekly sync',
      location: 'Conference Room A',
      url: 'https://meet.example.com',
      color: '#1A2B3C',
      category: 'work',
      visibility: 'hive',
      allDay: false,
    });
  });

  it('rejects missing title', () => {
    fail(createEventSchema, { startAt: NOW, endAt: LATER });
  });

  it('rejects empty title', () => {
    fail(createEventSchema, { ...baseEvent, title: '' });
  });

  it('rejects title longer than 500 characters', () => {
    fail(createEventSchema, { ...baseEvent, title: 'A'.repeat(501) });
  });

  it('rejects missing startAt', () => {
    fail(createEventSchema, { title: 'Test', endAt: LATER });
  });

  it('rejects missing endAt', () => {
    fail(createEventSchema, { title: 'Test', startAt: NOW });
  });

  it('rejects invalid datetime format for startAt', () => {
    fail(createEventSchema, { ...baseEvent, startAt: '2025-06-01' }); // date, not datetime
  });
});

describe('createEventSchema — endAt > startAt invariant', () => {
  it('rejects endAt equal to startAt', () => {
    fail(createEventSchema, { ...baseEvent, endAt: NOW });
  });

  it('rejects endAt before startAt', () => {
    fail(createEventSchema, { ...baseEvent, startAt: LATER, endAt: NOW });
  });

  it('accepts endAt one second after startAt', () => {
    pass(createEventSchema, {
      ...baseEvent,
      startAt: '2025-06-01T10:00:00.000Z',
      endAt: '2025-06-01T10:00:01.000Z',
    });
  });
});

describe('createEventSchema — URL security (HTTPS enforcement)', () => {
  it('accepts HTTPS URL', () => {
    pass(createEventSchema, { ...baseEvent, url: 'https://example.com' });
  });

  it('rejects HTTP URL (not HTTPS)', () => {
    fail(createEventSchema, { ...baseEvent, url: 'http://example.com' });
  });

  it('rejects javascript: URI (XSS injection vector)', () => {
    fail(createEventSchema, { ...baseEvent, url: 'javascript:alert(1)' });
  });

  it('rejects data: URI (data exfiltration / XSS vector)', () => {
    fail(createEventSchema, { ...baseEvent, url: 'data:text/html,<script>alert(1)</script>' });
  });

  it('rejects ftp: URI', () => {
    fail(createEventSchema, { ...baseEvent, url: 'ftp://example.com/file' });
  });

  it('rejects a bare string that is not a URL', () => {
    fail(createEventSchema, { ...baseEvent, url: 'not-a-url' });
  });

  it('omitting url is valid (field is optional)', () => {
    pass(createEventSchema, baseEvent);
  });
});

describe('createEventSchema — hex color validation', () => {
  it('accepts #RRGGBB format', () => {
    pass(createEventSchema, { ...baseEvent, color: '#1A2B3C' });
    pass(createEventSchema, { ...baseEvent, color: '#ffffff' });
    pass(createEventSchema, { ...baseEvent, color: '#000000' });
  });

  it('rejects color without # prefix', () => {
    fail(createEventSchema, { ...baseEvent, color: '1A2B3C' });
  });

  it('rejects 3-digit short hex (#RGB)', () => {
    fail(createEventSchema, { ...baseEvent, color: '#abc' });
  });

  it('rejects hex longer than 7 characters', () => {
    fail(createEventSchema, { ...baseEvent, color: '#1A2B3C4D' });
  });

  it('rejects non-hex characters', () => {
    fail(createEventSchema, { ...baseEvent, color: '#GGGGGG' });
  });

  it('omitting color is valid', () => {
    pass(createEventSchema, baseEvent);
  });
});

describe('createEventSchema — visibility and groupId', () => {
  it('accepts all visibility values', () => {
    for (const v of ['hive', 'admins', 'private']) {
      pass(createEventSchema, { ...baseEvent, visibility: v });
    }
  });

  it('accepts visibility=group with a valid groupId', () => {
    pass(createEventSchema, { ...baseEvent, visibility: 'group', groupId: VALID_UUID });
  });

  it('rejects visibility=group without groupId', () => {
    fail(createEventSchema, { ...baseEvent, visibility: 'group' });
  });

  it('rejects unknown visibility value', () => {
    fail(createEventSchema, { ...baseEvent, visibility: 'public' });
  });

  it('defaults visibility to "hive" when omitted', () => {
    const r = createEventSchema.safeParse(baseEvent);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.visibility).toBe('hive');
  });

  it('rejects groupId that is not a UUID', () => {
    fail(createEventSchema, { ...baseEvent, visibility: 'group', groupId: 'not-a-uuid' });
  });
});

describe('createEventSchema — recurrenceRule (DoS / CWE-400 guard)', () => {
  const withCount = {
    frequency: 'weekly' as const,
    count: 10,
  };

  const withUntil = {
    frequency: 'monthly' as const,
    until: '2026-01-01T00:00:00.000Z',
  };

  it('accepts a rule with count', () => {
    pass(createEventSchema, { ...baseEvent, recurrenceRule: withCount });
  });

  it('accepts a rule with until', () => {
    pass(createEventSchema, { ...baseEvent, recurrenceRule: withUntil });
  });

  it('accepts a rule with both count and until', () => {
    pass(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'daily', count: 5, until: '2025-12-31T00:00:00.000Z' },
    });
  });

  it('rejects a rule with neither count nor until (unbounded — DoS vector)', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'daily' },
    });
  });

  it('rejects unknown frequency', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'hourly', count: 5 },
    });
  });

  it('rejects count of 0', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'weekly', count: 0 },
    });
  });

  it('rejects count exceeding 1000 (hard DoS limit)', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'weekly', count: 1001 },
    });
  });

  it('rejects interval of 0', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'weekly', count: 5, interval: 0 },
    });
  });

  it('rejects interval exceeding 400', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'weekly', count: 5, interval: 401 },
    });
  });

  it('accepts byDay with valid weekday codes', () => {
    pass(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'weekly', count: 4, byDay: ['MO', 'WE', 'FR'] },
    });
  });

  it('rejects invalid byDay value', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'weekly', count: 4, byDay: ['MONDAY'] },
    });
  });

  it('accepts byMonth with valid month numbers (1-12)', () => {
    pass(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'yearly', count: 2, byMonth: [1, 6, 12] },
    });
  });

  it('rejects byMonth value of 0 or 13', () => {
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'yearly', count: 2, byMonth: [0] },
    });
    fail(createEventSchema, {
      ...baseEvent,
      recurrenceRule: { frequency: 'yearly', count: 2, byMonth: [13] },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// updateEventSchema
// ═══════════════════════════════════════════════════════════════════════════════

describe('updateEventSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    pass(updateEventSchema, {});
  });

  it('accepts partial update with only title', () => {
    pass(updateEventSchema, { title: 'Updated Title' });
  });

  it('rejects title shorter than 1 character', () => {
    fail(updateEventSchema, { title: '' });
  });

  it('rejects HTTP URL', () => {
    fail(updateEventSchema, { url: 'http://insecure.com' });
  });

  it('accepts null URL (clearing the field)', () => {
    pass(updateEventSchema, { url: null });
  });

  it('accepts null description (clearing the field)', () => {
    pass(updateEventSchema, { description: null });
  });

  it('rejects invalid hex color', () => {
    fail(updateEventSchema, { color: 'not-a-color' });
  });

  it('accepts null color (clearing the field)', () => {
    pass(updateEventSchema, { color: null });
  });

  it('rejects recurrenceRule without count or until', () => {
    fail(updateEventSchema, { recurrenceRule: { frequency: 'weekly' } });
  });

  it('accepts null recurrenceRule (removing recurrence)', () => {
    pass(updateEventSchema, { recurrenceRule: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// listEventsSchema
// ═══════════════════════════════════════════════════════════════════════════════

describe('listEventsSchema', () => {
  it('accepts empty object (all filters optional)', () => {
    pass(listEventsSchema, {});
  });

  it('accepts valid datetime filters', () => {
    pass(listEventsSchema, { startAt: NOW, endAt: LATER });
  });

  it('accepts valid groupId filter', () => {
    pass(listEventsSchema, { groupId: VALID_UUID });
  });

  it('rejects non-UUID groupId', () => {
    fail(listEventsSchema, { groupId: 'not-a-uuid' });
  });

  it('rejects invalid datetime for startAt', () => {
    fail(listEventsSchema, { startAt: '2025-06-01' }); // date string, not datetime
  });
});
