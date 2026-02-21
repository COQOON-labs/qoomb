import type { Translation } from '../i18n-types';
import de from '../de';
import { extendDictionary } from '../i18n-util';

/**
 * Austrian German (de-AT) — extends the base `de` locale.
 *
 * Only keys that differ from standard German need to be listed here.
 * Everything else is inherited automatically via `extendDictionary`.
 */
const de_AT = extendDictionary(de, {
  // Add Austrian-specific overrides here when needed.
}) as Translation;

export default de_AT;
