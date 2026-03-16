import { Button, Card } from '@qoomb/ui';
import { useState } from 'react';

import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── ActivityPage ──────────────────────────────────────────────────────────────

export function ActivityPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data: events = [], isLoading } = trpc.activity.list.useQuery(
    { limit: LIMIT, page },
    { enabled: !!user }
  );

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-2xl">
        <h1 className="text-2xl font-black text-foreground tracking-tight mb-6">
          {LL.activity.title()}
        </h1>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            {LL.activity.noActivity()}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {events.map((event) => (
                <Card key={event.id} padding="md">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/40 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {event.summary && <p className="text-sm text-foreground">{event.summary}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-mono text-primary/80 mr-2">{event.action}</span>
                        {event.resourceType} · {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {events.length === LIMIT && (
              <div className="mt-4 text-center">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)}>
                  {LL.activity.loadMore()}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
