import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { getInitials, SUPPORTED_TRANSLATION_LOCALES, type TranslationLocale } from '@qoomb/types';
import { Button, FormSection, Input, Select } from '@qoomb/ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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

// ── Schemas ───────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required').max(255),
});

const languageSchema = z.object({
  locale: z.enum(SUPPORTED_TRANSLATION_LOCALES as [TranslationLocale, ...TranslationLocale[]]),
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type LanguageFormValues = z.infer<typeof languageSchema>;

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

  const utils = trpc.useUtils();

  // ── Profile form ─────────────────────────────────────────────────────────────
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    watch: watchProfile,
    formState: { errors: profileErrors, isDirty: isProfileDirty },
  } = useForm<ProfileFormValues>({
    resolver: standardSchemaResolver(profileSchema),
    defaultValues: { displayName: '' },
  });

  // Initialize form once person data loads
  useEffect(() => {
    if (person) {
      resetProfile({ displayName: person.displayName ?? '' });
    }
  }, [person, resetProfile]);

  // ── Profile mutation ────────────────────────────────────────────────────────
  const updateProfile = trpc.persons.updateProfile.useMutation({
    onSuccess: () => {
      void utils.persons.me.invalidate();
    },
  });

  const onProfileSubmit = handleProfileSubmit((data) => {
    updateProfile.mutate({ displayName: data.displayName });
  });

  // ── Language form ─────────────────────────────────────────────────────────────
  const {
    register: registerLanguage,
    handleSubmit: handleLanguageSubmit,
    watch: watchLanguage,
    formState: { isDirty: isLanguageDirty },
  } = useForm<LanguageFormValues>({
    resolver: standardSchemaResolver(languageSchema),
    defaultValues: { locale: translationLocale },
  });

  // ── Language mutation ───────────────────────────────────────────────────────
  const updateLocale = trpc.auth.updateLocale.useMutation({
    onSuccess: (result) => {
      setLocale(result.locale);
    },
  });

  const onLanguageSubmit = handleLanguageSubmit(({ locale }) => {
    const bcp47 = LOCALE_BCP47_MAP[locale] ?? locale;
    updateLocale.mutate({ locale: bcp47 });
  });

  // ── Derived values ──────────────────────────────────────────────────────────
  const displayName = watchProfile('displayName');
  const initials = getInitials(displayName || null, user?.email ?? '?');

  const formattedBirthdate = person?.birthdate
    ? new Date(person.birthdate).toLocaleDateString(bcp47Locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : undefined;

  const localeLabel = (tl: TranslationLocale): string => {
    const labels: Record<TranslationLocale, () => string> = {
      en: () => LL.profile.language.en(),
      de: () => LL.profile.language.de(),
      'de-AT': () => LL.profile.language.deAT(),
    };
    return labels[tl]();
  };

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
      <div className="px-4 md:px-8 py-8 max-w-2xl mx-auto space-y-6">
        {/* ── Page title ───────────────────────────────────────────────────── */}
        <h1 className="text-2xl font-black text-foreground tracking-tight">{LL.profile.title()}</h1>

        {/* ── Section 1: Profile ───────────────────────────────────────────── */}
        <FormSection
          title={LL.profile.title()}
          footer={
            <>
              <Button
                onClick={() => void onProfileSubmit()}
                disabled={updateProfile.isPending || !isProfileDirty}
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
            </>
          }
        >
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
          <Input
            label={LL.profile.displayNameLabel()}
            placeholder={LL.profile.displayNamePlaceholder()}
            error={profileErrors.displayName?.message}
            {...registerProfile('displayName')}
          />

          <Input label={LL.profile.emailLabel()} value={user?.email ?? ''} disabled />

          <Input label={LL.profile.roleLabel()} value={roleLabel} disabled />

          {formattedBirthdate && (
            <Input label={LL.profile.birthdayLabel()} value={formattedBirthdate} disabled />
          )}
        </FormSection>

        {/* ── Section 2: Language ──────────────────────────────────────────── */}
        <FormSection
          title={LL.profile.language.title()}
          description={LL.profile.language.description()}
          footer={
            <>
              <Button
                onClick={() => void onLanguageSubmit()}
                disabled={updateLocale.isPending || !isLanguageDirty}
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
            </>
          }
        >
          <Select label={LL.profile.language.title()} {...registerLanguage('locale')}>
            {SUPPORTED_TRANSLATION_LOCALES.map((tl: TranslationLocale) => (
              <option key={tl} value={tl}>
                {localeLabel(tl)}
              </option>
            ))}
          </Select>
        </FormSection>

        {/* ── Section 3: Security ─────────────────────────────────────────── */}
        <FormSection
          title={LL.profile.security.title()}
          description={LL.profile.security.description()}
        >
          <PassKeyManager />
        </FormSection>
      </div>
    </AppShell>
  );
}
