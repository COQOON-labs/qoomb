import { Button, Card, Input } from '@qoomb/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ArrowLeftIcon } from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── Profile Page ──────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { LL } = useI18nContext();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch person data (displayName, role, birthdate, avatarUrl)
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

  const updateProfile = trpc.persons.updateProfile.useMutation({
    onSuccess: () => {
      void utils.persons.me.invalidate();
    },
  });

  const handleSave = () => {
    if (!displayName.trim()) return;
    updateProfile.mutate({ displayName: displayName.trim() });
  };

  // Derive initials from display name
  const initials = displayName
    ? displayName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? '?');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="h-14 bg-background border-b-2 border-primary flex items-center gap-3 px-4">
        <button
          onClick={() => void navigate('/dashboard')}
          className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black uppercase tracking-wider text-foreground">
          {LL.profile.title()}
        </h1>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">{LL.common.loading()}</div>
        ) : (
          <div className="space-y-6">
            {/* Avatar + Name */}
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center text-2xl font-black text-primary-foreground">
                {initials}
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">
                  {person?.displayName ?? user?.email ?? '—'}
                </p>
                <p className="text-sm text-muted-foreground capitalize">{person?.role ?? '—'}</p>
              </div>
            </div>

            {/* Edit form */}
            <Card>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="displayName"
                    className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5"
                  >
                    {LL.profile.displayNameLabel()}
                  </label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={LL.profile.displayNamePlaceholder()}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {LL.common.emailLabel()}
                  </label>
                  <Input value={user?.email ?? ''} disabled />
                </div>

                {person?.birthdate && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                      {LL.profile.birthdayLabel()}
                    </label>
                    <Input
                      value={new Date(person.birthdate).toLocaleDateString('de-DE')}
                      disabled
                    />
                  </div>
                )}

                <Button
                  onClick={handleSave}
                  disabled={
                    updateProfile.isPending ||
                    !displayName.trim() ||
                    displayName.trim() === (person?.displayName ?? '')
                  }
                  className="w-full"
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
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
