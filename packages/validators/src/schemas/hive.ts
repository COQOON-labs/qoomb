import { z } from 'zod';

import { uuidSchema } from './common';

/**
 * BCP 47 locale tag (e.g. 'de-DE', 'en-US').
 * Validated loosely — full IANA list validation is overkill for our use case.
 */
const localeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2,3})?$/, 'Invalid locale format (e.g. de-DE, en-US)')
  .optional();

export const hiveIdSchema = uuidSchema;

export const updateHiveSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(200).optional(),
    locale: localeSchema,
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const deleteHiveSchema = z.object({
  confirmation: z
    .string()
    .refine((v) => v === 'DELETE', { message: 'You must type DELETE to confirm' }),
});
