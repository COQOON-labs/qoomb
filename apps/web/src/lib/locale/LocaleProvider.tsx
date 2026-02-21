import { FALLBACK_LOCALE, resolveTranslationLocale, type TranslationLocale } from '@qoomb/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  /** Update the BCP 47 locale — triggers lazy load + re-render with new translations. */
  setLocale: (bcp47: string) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [bcp47Locale, setBcp47Locale] = useState<string>(FALLBACK_LOCALE);

  // The locale we *want* to display (derived from BCP 47 tag).
  const targetLocale = useMemo(() => resolveTranslationLocale(bcp47Locale), [bcp47Locale]);

  // The locale that is *confirmed loaded* — only this one is passed to
  // TypesafeI18n so we never render with missing translations.
  // Starts at baseLocale which is preloaded synchronously in main.tsx.
  const [activeLocale, setActiveLocale] = useState<Locales>(baseLocale);

  // Lazily load the target locale when it differs from the active one.
  useEffect(() => {
    const target = targetLocale as Locales;
    if (target === activeLocale) return;
    if (!isLocale(target)) return;

    let cancelled = false;
    void loadLocaleAsync(target).then(() => {
      if (!cancelled) setActiveLocale(target);
      return;
    });
    return () => {
      cancelled = true;
    };
  }, [targetLocale, activeLocale]);

  const setLocale = useCallback((bcp47: string) => {
    setBcp47Locale(bcp47);
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
