import { FALLBACK_LOCALE, resolveTranslationLocale, type TranslationLocale } from '@qoomb/types';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import TypesafeI18n from '../../i18n/i18n-react';
import type { Locales } from '../../i18n/i18n-types';
import { baseLocale, isLocale } from '../../i18n/i18n-util';
import { loadLocaleAsync } from '../../i18n/i18n-util.async';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface LocaleContextValue {
  /** Full BCP 47 locale tag (e.g. 'de-DE', 'en-US'). Use for Intl formatters. */
  bcp47Locale: string;
  /** Translation locale used by typesafe-i18n ('de' | 'de-AT' | 'en'). */
  translationLocale: TranslationLocale;
  /** Update the BCP 47 locale — eagerly loads translations + re-renders. */
  setLocale: (bcp47: string) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [bcp47Locale, setBcp47Locale] = useState<string>(FALLBACK_LOCALE);

  // The locale that is *confirmed loaded* — only this one is passed to
  // TypesafeI18n so we never render with missing translations.
  // Starts at baseLocale which is preloaded synchronously in main.tsx.
  const [activeLocale, setActiveLocale] = useState<Locales>(baseLocale);

  // Track the most recently requested BCP 47 tag so that rapid consecutive
  // calls to setLocale only apply the latest one.
  const desiredRef = useRef<string>(FALLBACK_LOCALE);

  const setLocale = useCallback((bcp47: string) => {
    desiredRef.current = bcp47;
    setBcp47Locale(bcp47);

    const target = resolveTranslationLocale(bcp47) as Locales;
    if (!isLocale(target)) return;

    // Eagerly load the translation bundle and switch once ready.
    void loadLocaleAsync(target).then(() => {
      // Only apply if this is still the most recently requested locale.
      if (desiredRef.current === bcp47) {
        setActiveLocale(target);
      }
    });
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ bcp47Locale, translationLocale: activeLocale as TranslationLocale, setLocale }),
    [bcp47Locale, activeLocale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>
      <TypesafeI18n locale={activeLocale}>{children}</TypesafeI18n>
    </LocaleContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the current locale context.
 *
 * - `bcp47Locale` — full BCP 47 tag for Intl APIs (date/number formatting)
 * - `translationLocale` — short key used by typesafe-i18n ('de' | 'de-AT' | 'en')
 * - `setLocale(bcp47)` — update the app's locale (called by AuthProvider)
 */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside <LocaleProvider>');
  return ctx;
}
