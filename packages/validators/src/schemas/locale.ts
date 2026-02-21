import { z } from 'zod';

/**
 * BCP 47 locale schema.
 *
 * Validates simplified BCP 47 language tags:
 *   - Language only:            'en', 'de'
 *   - Language + region:        'en-US', 'de-AT'
 *   - Language + script + region: 'zh-Hans-CN'
 *
 * Normalises by trimming whitespace. Does not attempt full RFC 5646 validation.
 */
export const bcp47LocaleSchema = z
  .string()
  .trim()
  .min(2, 'Locale must be at least 2 characters')
  .max(12, 'Locale must be at most 12 characters')
  .regex(
    /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/,
    'Locale must be a valid BCP 47 language tag (e.g. "en-US", "de-DE", "de")',
  );

/**
 * Optional BCP 47 locale — for update operations where locale may not be provided.
 */
export const optionalBcp47LocaleSchema = bcp47LocaleSchema.optional().nullable();

/**
 * Schema for updating a user's locale preference.
 */
export const updateLocaleSchema = z.object({
  locale: bcp47LocaleSchema,
});
