import { Button, Card } from '@qoomb/ui';
import { useCallback, useState } from 'react';

import { BellIcon } from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── NotificationsPage ─────────────────────────────────────────────────────────

export function NotificationsPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [onlyUnread, setOnlyUnread] = useState(false);

  const { data: notifications = [], isLoading } = trpc.notifications.list.useQuery(
    { onlyUnread, limit: 50, page: 1 },
    { enabled: !!user }
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.countUnread.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.countUnread.invalidate();
    },
  });

  const handleMarkRead = useCallback((id: string) => markRead.mutate(id), [markRead]);

  const handleMarkAllRead = useCallback(() => {
    markAllRead.mutate();
  }, [markAllRead]);

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-2xl">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            {LL.notifications.title()}
          </h1>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
          >
            {LL.notifications.markAllRead()}
          </Button>
        </div>

        {/* ── Filter ──────────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setOnlyUnread(false)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
              !onlyUnread
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {LL.notifications.allNotifications()}
          </button>
          <button
            type="button"
            onClick={() => setOnlyUnread(true)}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
              onlyUnread
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {LL.notifications.onlyUnread()}
          </button>
        </div>

        {/* ── Notification list ────────────────────────────────────────── */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <BellIcon className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">
              {LL.notifications.noNotifications()}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((notif) => (
              <Card key={notif.id} padding="md" className={notif.isRead ? 'opacity-60' : ''}>
                <div className="flex items-start gap-3">
                  {!notif.isRead && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{notif.title}</p>
                    {notif.body && (
                      <p className="text-xs text-muted-foreground mt-0.5">{notif.body}</p>
                    )}
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(notif.id)}
                      disabled={markRead.isPending}
                      className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                    >
                      {LL.notifications.markRead()}
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
