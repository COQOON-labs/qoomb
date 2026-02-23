import { FALLBACK_LOCALE, resolveTranslationLocale, type TranslationLocale } from '@qoomb/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import TypesafeI18n, { useI18nContext } from '../../i18n/i18n-react';
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
// Bridge — syncs our activeLocale into TypesafeI18n's internal state.
//
// typesafe-i18n's <TypesafeI18n locale={…}> only reads the prop as the
// *initial* value (via useState). Subsequent prop changes are ignored.
// The library expects consumers to call its own setLocale() from context.
// This bridge component sits inside <TypesafeI18n> and forwards changes.
// ---------------------------------------------------------------------------

function LocaleSyncBridge({
  targetLocale,
  children,
}: {
  targetLocale: Locales;
  children: ReactNode;
}) {
  const { setLocale: setI18nLocale } = useI18nContext();

  useEffect(() => {
    setI18nLocale(targetLocale);
  }, [targetLocale, setI18nLocale]);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [bcp47Locale, setBcp47Locale] = useState<string>(FALLBACK_LOCALE);

  // The locale that is *confirmed loaded* — only this one is passed to
  // TypesafeI18n so we never render with missing translations.
  // Starts at baseLocale which is preloaded synchronously in main.tsx.
  const [activeLocale, _setActiveLocale] = useState<Locales>(baseLocale);

  // Mirror of activeLocale as a ref — allows the setLocale callback to skip
  // redundant async loads without depending on reactive state.
  const activeLocaleRef = useRef<Locales>(baseLocale);
  const setActiveLocale = useCallback((locale: Locales) => {
    activeLocaleRef.current = locale;
    _setActiveLocale(locale);
  }, []);

  // Track the most recently requested BCP 47 tag so that rapid consecutive
  // calls to setLocale only apply the latest one.
  const desiredRef = useRef<string>(FALLBACK_LOCALE);

  const setLocale = useCallback(
    (bcp47: string) => {
      desiredRef.current = bcp47;
      setBcp47Locale(bcp47);

      const target = resolveTranslationLocale(bcp47) as Locales;
      if (!isLocale(target)) {
        console.warn(
          `[LocaleProvider] resolveTranslationLocale('${bcp47}') → '${String(target)}' is not a valid locale`
        );
        return;
      }

      // Already on the desired translation locale — nothing to load.
      if (target === activeLocaleRef.current) return;

      // Eagerly load the translation bundle and switch once ready.
      void loadLocaleAsync(target)
        .then(() => {
          // Only apply if this is still the most recently requested locale.
          if (desiredRef.current === bcp47) {
            setActiveLocale(target);
          }
          return undefined;
        })
        .catch((err: unknown) => {
          console.error(`[LocaleProvider] Failed to load locale '${target}':`, err);
        });
    },
    [setActiveLocale]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ bcp47Locale, translationLocale: activeLocale as TranslationLocale, setLocale }),
    [bcp47Locale, activeLocale, setLocale]
  );

  return (
    <LocaleContext.Provider value={value}>
      <TypesafeI18n locale={activeLocale}>
        <LocaleSyncBridge targetLocale={activeLocale}>{children}</LocaleSyncBridge>
      </TypesafeI18n>
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
