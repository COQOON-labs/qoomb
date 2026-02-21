/**
 * Locale types and resolution utilities.
 *
 * Qoomb stores locale preferences as BCP 47 language tags (e.g. 'de-DE', 'en-US').
 * These are mapped to available translation locales ('de', 'en') for the UI,
 * while the full BCP 47 tag is used for Intl formatters (dates, numbers, currency).
 *
 * Resolution order (highest priority first):
 *   1. User preference  (users.locale)
 *   2. Hive setting     (hives.locale)
 *   3. Platform default  (DEFAULT_LOCALE env var)
 *   4. Hardcoded fallback ('en-US')
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hardcoded last-resort fallback when nothing else is configured. */
export const FALLBACK_LOCALE = 'en-US' as const;

/**
 * Translation locales that have actual translation files.
 * Each maps to a folder under `apps/web/src/i18n/<locale>/` and
 * `apps/api/src/i18n/<locale>/`.
 *
 * To add a new translation language, add its key here **and** create the
 * corresponding translation files in both apps.
 */
export const SUPPORTED_TRANSLATION_LOCALES = ['de', 'de-AT', 'en'] as const;

/** Union type of available translation locales. */
export type TranslationLocale = (typeof SUPPORTED_TRANSLATION_LOCALES)[number];

// ---------------------------------------------------------------------------
// BCP 47 helpers
// ---------------------------------------------------------------------------

/**
 * Regex for **simplified** BCP 47 language tags.
 *
 * Accepts:
 *  - Language only: `en`, `de`
 *  - Language + region: `en-US`, `de-AT`
 *  - Language + script + region: `zh-Hans-CN`
 *
 * Does NOT attempt full RFC 5646 validation — this covers the realistic
 * subset we expect for user / hive / platform locale preferences.
 */
export const BCP47_LOCALE_REGEX = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

/**
 * Extract the two-letter language prefix from a BCP 47 tag.
 *
 * @example
 * extractLanguage('de-DE')  // → 'de'
 * extractLanguage('en-US')  // → 'en'
 * extractLanguage('zh-Hans-CN') // → 'zh'
 */
export function extractLanguage(bcp47Locale: string): string {
  return bcp47Locale.split('-')[0].toLowerCase();
}

// ---------------------------------------------------------------------------
// Resolution utilities
// ---------------------------------------------------------------------------

/**
 * Map a BCP 47 locale to the closest available translation locale.
 *
 * Falls back to `'en'` when the language prefix has no matching translations.
 *
 * @example
 * resolveTranslationLocale('de-AT')  // → 'de-AT' (exact match)
 * resolveTranslationLocale('de-CH')  // → 'de'    (language prefix fallback)
 * resolveTranslationLocale('en-GB')  // → 'en'
 * resolveTranslationLocale('fr-FR')  // → 'en'    (no French translations)
 */
export function resolveTranslationLocale(bcp47Locale: string): TranslationLocale {
  // 1. Exact match (e.g. 'de-AT' → 'de-AT')
  const exact = SUPPORTED_TRANSLATION_LOCALES.find((tl) => tl === bcp47Locale);
  if (exact) return exact;

  // 2. Language prefix fallback (e.g. 'de-CH' → 'de')
  const language = extractLanguage(bcp47Locale);
  const match = SUPPORTED_TRANSLATION_LOCALES.find((tl) => tl === language);
  return match ?? 'en';
}

/**
 * Resolve the effective BCP 47 locale from the preference cascade.
 *
 * Priority: user → hive → platform default → FALLBACK_LOCALE ('en-US').
 *
 * @param userLocale     - User-level preference (nullable)
 * @param hiveLocale     - Hive-level preference (nullable)
 * @param platformDefault - Platform-wide default from `DEFAULT_LOCALE` env var (nullable)
 * @returns The resolved BCP 47 locale string.
 *
 * @example
 * resolveLocale('de-AT', 'en-US', 'en-US')  // → 'de-AT'  (user wins)
 * resolveLocale(null, 'de-DE', 'en-US')      // → 'de-DE'  (hive wins)
 * resolveLocale(null, null, 'de-DE')          // → 'de-DE'  (platform default)
 * resolveLocale(null, null, null)             // → 'en-US'  (fallback)
 */
export function resolveLocale(
  userLocale?: string | null,
  hiveLocale?: string | null,
  platformDefault?: string | null
): string {
  return userLocale ?? hiveLocale ?? platformDefault ?? FALLBACK_LOCALE;
}
