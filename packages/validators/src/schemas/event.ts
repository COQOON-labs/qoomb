import { z } from 'zod';

// Use z.enum (not a @qoomb/types import) to prevent TS2742 inferred-type portability errors
// when the schema flows through AppRouter into the web client type chain.
const resourceVisibilitySchema = z.enum(['hive', 'admins', 'group', 'private']);

// Recurrence rule: validated iCal RRULE fields (RFC 5545 subset).
// Stored unencrypted — needed for server-side occurrence expansion (Phase 4).
// Requires either `count` or `until` to prevent unbounded expansion (DoS / CWE-400).
const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(['yearly', 'monthly', 'weekly', 'daily']),
    interval: z.number().int().min(1).max(400).optional(),
    count: z.number().int().min(1).max(1000).optional(),
    until: z.string().datetime().optional(),
    byDay: z
      .array(z.string().regex(/^(-?\d{0,2})?(MO|TU|WE|TH|FR|SA|SU)$/))
      .max(7)
      .optional(),
    byMonth: z.array(z.number().int().min(1).max(12)).max(12).optional(),
    byMonthDay: z.array(z.number().int().min(-31).max(31)).max(31).optional(),
  })
  .refine((r) => r.count !== undefined || r.until !== undefined, {
    message: 'Recurrence rule must specify either count or until to prevent unbounded expansion',
  });

export const eventIdSchema = z.string().uuid();

/**
 * Input schema for creating an event.
 *
 * Datetime fields use ISO 8601 string format (z.string().datetime()) for safe tRPC transport.
 * Fields mapped to DB model (apps/api/prisma/schema.prisma → Event):
 * - Encrypted at rest by EventsService: title, description, location, url, category
 * - Unencrypted (used for queries/sorting): startAt, endAt, allDay, color, visibility, recurrenceRule
 */
export const createEventSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    allDay: z.boolean().default(false),
    location: z.string().max(1000).optional(),
    // HTTPS-only: blocks javascript: / data: URI injection when rendered as a hyperlink
    url: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), { message: 'URL must use HTTPS' })
      .optional(),
    // Hex color for calendar display (#RRGGBB)
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Color must be a valid hex color (#RRGGBB)' })
      .optional(),
    category: z.string().max(100).optional(),
    visibility: resourceVisibilitySchema.default('hive'),
    groupId: z.string().uuid().optional(),
    recurrenceRule: recurrenceRuleSchema.optional(),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: 'End time must be after start time',
    path: ['endAt'],
  })
  .refine((data) => data.visibility !== 'group' || data.groupId !== undefined, {
    message: "groupId is required when visibility is 'group'",
    path: ['groupId'],
  });

export const updateEventSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullish(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(1000).nullish(),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://'), { message: 'URL must use HTTPS' })
    .nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Color must be a valid hex color (#RRGGBB)' })
    .nullish(),
  category: z.string().max(100).nullish(),
  visibility: resourceVisibilitySchema.optional(),
  groupId: z.string().uuid().nullish(),
  recurrenceRule: recurrenceRuleSchema.nullish(),
});

export const listEventsSchema = z.object({
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  groupId: z.string().uuid().optional(),
});
