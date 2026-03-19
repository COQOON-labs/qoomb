import { Button, Card, Input } from '@qoomb/ui';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// Notification types that can be toggled by the user.
const NOTIF_TYPES = ['member_joined', 'task_assigned', 'event_reminder'] as const;
type NotifType = (typeof NOTIF_TYPES)[number];
type NotifPrefs = Record<NotifType, { inApp: boolean; email: boolean }>;

const DEFAULT_PREFS: NotifPrefs = {
  member_joined: { inApp: true, email: true },
  task_assigned: { inApp: true, email: true },
  event_reminder: { inApp: true, email: false },
};

// ── HiveSettingsPage ──────────────────────────────────────────────────────────

export function HiveSettingsPage() {
  const { LL } = useI18nContext();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // ── Load current hive data ────────────────────────────────────────────────
  const { data: hive, isLoading } = trpc.hive.get.useQuery(undefined, { enabled: !!user });

  // ── General settings form state ──────────────────────────────────────────
  const [name, setName] = useState('');
  const [locale, setLocale] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Seed form when hive data loads
  useEffect(() => {
    if (hive) {
      setName(hive.name);
      setLocale(hive.locale ?? '');
    }
  }, [hive]);

  // ── Notification preferences ─────────────────────────────────────────────
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [prefsSaveStatus, setPrefsSaveStatus] = useState<'idle' | 'success'>('idle');

  const { data: savedPrefs } = trpc.notifications.getPreferences.useQuery(undefined, {
    enabled: !!user,
  });

  // Merge saved preferences over defaults whenever they load
  useEffect(() => {
    if (savedPrefs) {
      setPrefs((prev) => {
        const merged = { ...prev };
        for (const type of NOTIF_TYPES) {
          if (savedPrefs[type]) {
            merged[type] = savedPrefs[type] as { inApp: boolean; email: boolean };
          }
        }
        return merged;
      });
    }
  }, [savedPrefs]);

  const updatePrefs = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => {
      void utils.notifications.getPreferences.invalidate();
      setPrefsSaveStatus('success');
      setTimeout(() => setPrefsSaveStatus('idle'), 3000);
    },
  });

  const handlePrefToggle = useCallback((type: NotifType, channel: 'inApp' | 'email') => {
    setPrefs((prev) => ({
      ...prev,
      [type]: { ...prev[type], [channel]: !prev[type][channel] },
    }));
  }, []);

  const handlePrefsSave = useCallback(() => {
    updatePrefs.mutate(prefs);
  }, [prefs, updatePrefs]);

  const updateHive = trpc.hive.update.useMutation({
    onSuccess: () => {
      void utils.hive.get.invalidate();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: () => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  const handleSave = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updateHive.mutate({
        name: name.trim() || undefined,
        locale: locale.trim() || undefined,
      });
    },
    [name, locale, updateHive]
  );

  // ── Delete hive ───────────────────────────────────────────────────────────
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const deleteHive = trpc.hive.delete.useMutation({
    onSuccess: () => {
      // Hive deleted — log out and redirect to login
      void logout();
      void navigate('/login');
    },
  });

  const handleDelete = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      deleteHive.mutate({ confirmation: deleteConfirmation });
    },
    [deleteConfirmation, deleteHive]
  );

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-2xl">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <h1 className="text-2xl font-black text-foreground tracking-tight mb-6">
          {LL.hiveSettings.title()}
        </h1>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
        ) : (
          <>
            {/* ── General Settings ────────────────────────────────────── */}
            <Card padding="md" className="mb-6">
              <h2 className="text-base font-bold text-foreground mb-4">
                {LL.hiveSettings.generalSection()}
              </h2>
              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <Input
                  label={LL.hiveSettings.nameLabel()}
                  placeholder={LL.hiveSettings.namePlaceholder()}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">
                    {LL.hiveSettings.localeLabel()}
                  </label>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">—</option>
                    <option value="de-DE">{LL.profile.language.deDE()}</option>
                    <option value="de-AT">{LL.profile.language.deAT()}</option>
                    <option value="en-US">{LL.profile.language.enUS()}</option>
                  </select>
                </div>

                {saveStatus === 'success' && (
                  <p className="text-sm text-success font-medium">
                    {LL.hiveSettings.saveSuccess()}
                  </p>
                )}
                {saveStatus === 'error' && (
                  <p className="text-sm text-destructive font-medium">
                    {LL.hiveSettings.saveError()}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={updateHive.isPending}
                  className="self-start"
                >
                  {updateHive.isPending ? LL.common.saving() : LL.common.save()}
                </Button>
              </form>
            </Card>

            {/* ── Notification Preferences ─────────────────────────── */}
            <Card padding="md" className="mb-6">
              <h2 className="text-base font-bold text-foreground mb-1">
                {LL.hiveSettings.notificationPrefsSection()}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {LL.hiveSettings.notificationPrefsDescription()}
              </p>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center mb-2">
                <span />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                  {LL.hiveSettings.notifInApp()}
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                  {LL.hiveSettings.notifEmail()}
                </span>
              </div>

              <div className="flex flex-col divide-y divide-border">
                {NOTIF_TYPES.map((type) => (
                  <div
                    key={type}
                    className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center py-3"
                  >
                    <span className="text-sm text-foreground">
                      {LL.hiveSettings.notifTypes[type]()}
                    </span>
                    {/* In-App toggle */}
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={prefs[type].inApp}
                        onChange={() => handlePrefToggle(type, 'inApp')}
                        className="size-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </div>
                    {/* Email toggle */}
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={prefs[type].email}
                        onChange={() => handlePrefToggle(type, 'email')}
                        className="size-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={updatePrefs.isPending}
                  onClick={handlePrefsSave}
                >
                  {updatePrefs.isPending ? LL.common.saving() : LL.common.save()}
                </Button>
                {prefsSaveStatus === 'success' && (
                  <p className="text-sm text-success font-medium">{LL.hiveSettings.notifSaved()}</p>
                )}
              </div>
            </Card>

            {/* ── Danger Zone ─────────────────────────────────────────── */}
            <Card padding="md" className="border-destructive/30">
              <h2 className="text-base font-bold text-destructive mb-1">
                {LL.hiveSettings.dangerZone()}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {LL.hiveSettings.deleteDescription()}
              </p>
              <form onSubmit={handleDelete} className="flex flex-col gap-3">
                <Input
                  label={LL.hiveSettings.deleteConfirmLabel()}
                  placeholder={LL.hiveSettings.deleteConfirmPlaceholder()}
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={deleteConfirmation !== 'DELETE' || deleteHive.isPending}
                  className="self-start"
                >
                  {LL.hiveSettings.deleteButton()}
                </Button>
                {deleteHive.isError && (
                  <p className="text-sm text-destructive">
                    {deleteHive.error?.message ?? LL.hiveSettings.saveError()}
                  </p>
                )}
              </form>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
