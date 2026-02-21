import { getInitials, SUPPORTED_TRANSLATION_LOCALES, type TranslationLocale } from '@qoomb/types';
import { Button, Card, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';

import { PassKeyManager } from '../components/auth/PassKeyManager';
import { useCurrentPerson } from '../hooks/useCurrentPerson';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { useLocale } from '../lib/locale/LocaleProvider';
import { trpc } from '../lib/trpc/client';

// ── Locale → BCP 47 mapping for the updateLocale endpoint ────────────────────

const LOCALE_BCP47_MAP: Record<TranslationLocale, string> = {
  en: 'en-US',
  de: 'de-DE',
  'de-AT': 'de-AT',
};

// ── Profile Page ──────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const { roleLabel } = useCurrentPerson();
  const { bcp47Locale, translationLocale, setLocale } = useLocale();

  // ── Person data ─────────────────────────────────────────────────────────────
  const { data: person, isLoading } = trpc.persons.me.useQuery(undefined, {
    enabled: !!user,
  });

  const [displayName, setDisplayName] = useState('');
  const [nameInitialized, setNameInitialized] = useState(false);

  // Initialize form once person data loads
  if (person && !nameInitialized) {
    setDisplayName(person.displayName ?? '');
    setNameInitialized(true);
  }

  const utils = trpc.useUtils();

  // ── Profile mutation ────────────────────────────────────────────────────────
  const updateProfile = trpc.persons.updateProfile.useMutation({
    onSuccess: () => {
      void utils.persons.me.invalidate();
    },
  });

  const handleSaveProfile = useCallback(() => {
    if (!displayName.trim()) return;
    updateProfile.mutate({ displayName: displayName.trim() });
  }, [displayName, updateProfile]);

  // ── Language mutation ───────────────────────────────────────────────────────
  const [selectedLocale, setSelectedLocale] = useState<TranslationLocale>(translationLocale);

  const updateLocale = trpc.auth.updateLocale.useMutation({
    onSuccess: (result) => {
      setLocale(result.locale);
    },
  });

  const handleSaveLanguage = useCallback(() => {
    const bcp47 = LOCALE_BCP47_MAP[selectedLocale] ?? selectedLocale;
    updateLocale.mutate({ locale: bcp47 });
  }, [selectedLocale, updateLocale]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const initials = getInitials(displayName || null, user?.email ?? '?');

  const formattedBirthdate = person?.birthdate
    ? new Date(person.birthdate).toLocaleDateString(bcp47Locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : undefined;

  const localeLabel = useCallback(
    (tl: TranslationLocale): string => {
      const labels: Record<TranslationLocale, () => string> = {
        en: () => LL.profile.language.en(),
        de: () => LL.profile.language.de(),
        'de-AT': () => LL.profile.language.deAT(),
      };
      return labels[tl]();
    },
    [LL]
  );

  const hasLanguageChanged = selectedLocale !== translationLocale;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {LL.common.loading()}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-8 max-w-2xl mx-auto space-y-8">
        {/* ── Page title ───────────────────────────────────────────────────── */}
        <h1 className="text-2xl font-black text-foreground tracking-tight">{LL.profile.title()}</h1>

        {/* ── Section 1: Profile ───────────────────────────────────────────── */}
        <Card>
          <div className="space-y-6">
            {/* Avatar + Name header */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-xl font-black text-primary-foreground shrink-0">
                {initials}
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {person?.displayName ?? user?.email ?? '—'}
                </p>
                <p className="text-sm text-muted-foreground">{roleLabel}</p>
              </div>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <Input
                label={LL.profile.displayNameLabel()}
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={LL.profile.displayNamePlaceholder()}
              />

              <Input label={LL.profile.emailLabel()} value={user?.email ?? ''} disabled />

              <Input label={LL.profile.roleLabel()} value={roleLabel} disabled />

              {formattedBirthdate && (
                <Input label={LL.profile.birthdayLabel()} value={formattedBirthdate} disabled />
              )}
            </div>

            {/* Save */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSaveProfile}
                disabled={
                  updateProfile.isPending ||
                  !displayName.trim() ||
                  displayName.trim() === (person?.displayName ?? '')
                }
                fullWidth
              >
                {updateProfile.isPending ? LL.common.saving() : LL.common.save()}
              </Button>

              {updateProfile.isSuccess && (
                <p className="text-sm text-success text-center">{LL.profile.saved()}</p>
              )}
              {updateProfile.isError && (
                <p className="text-sm text-destructive text-center">{LL.profile.saveError()}</p>
              )}
            </div>
          </div>
        </Card>

        {/* ── Section 2: Language ──────────────────────────────────────────── */}
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-foreground text-base">{LL.profile.language.title()}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {LL.profile.language.description()}
              </p>
            </div>

            <div>
              <select
                value={selectedLocale}
                onChange={(e) => setSelectedLocale(e.target.value as TranslationLocale)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
              >
                {SUPPORTED_TRANSLATION_LOCALES.map((tl) => (
                  <option key={tl} value={tl}>
                    {localeLabel(tl)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSaveLanguage}
                disabled={updateLocale.isPending || !hasLanguageChanged}
                fullWidth
              >
                {updateLocale.isPending ? LL.common.saving() : LL.common.save()}
              </Button>

              {updateLocale.isSuccess && (
                <p className="text-sm text-success text-center">{LL.profile.language.saved()}</p>
              )}
              {updateLocale.isError && (
                <p className="text-sm text-destructive text-center">
                  {LL.profile.language.saveError()}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* ── Section 3: Security ─────────────────────────────────────────── */}
        <Card>
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-foreground text-base">{LL.profile.security.title()}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {LL.profile.security.description()}
              </p>
            </div>

            <PassKeyManager />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
