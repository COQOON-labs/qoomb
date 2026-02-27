import { Button, Card } from '@qoomb/ui';

import { CalendarIcon, CheckIcon, DocumentIcon, PlusIcon } from '../components/icons';
import { useCurrentPerson } from '../hooks/useCurrentPerson';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';

// ── Helpers ───────────────────────────────────────────────────────────────────

function useTodayLabel(): { dayNum: string; dateLabel: string } {
  const now = new Date();
  const dayNum = String(now.getDate());
  const dateLabel = now
    .toLocaleDateString('de-DE', { weekday: 'long', month: 'long', year: 'numeric' })
    .replace(/(\w+), (\w+ \d{4})/, '$1 · $2');
  return { dayNum, dateLabel };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { LL } = useI18nContext();
  const { displayName } = useCurrentPerson();
  const { dayNum, dateLabel } = useTodayLabel();

  return (
    <AppShell>
      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-8 pt-4 pb-5">
        <div className="max-w-5xl flex items-start gap-4">
          {/* Big date number — editorial decoration */}
          <div className="shrink-0 hidden sm:block select-none -mt-3 leading-none">
            <span className="text-[88px] font-black leading-none tabular-nums text-foreground/10">
              {dayNum}
            </span>
          </div>
          <div className="sm:pt-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
              {dateLabel}
            </p>
            <h1 className="text-3xl font-black text-foreground tracking-tight leading-tight">
              {LL.dashboard.greeting({ name: displayName })}
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-10 space-y-5 max-w-5xl">
        {/* ── Events + Tasks grid ──────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* Events */}
          <Card padding="none">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-foreground uppercase tracking-wide text-sm">
                  {LL.nav.calendar()}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {LL.common.showAll()}
                </Button>
              </div>

              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <CalendarIcon className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{LL.dashboard.emptyEvents()}</p>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <PlusIcon className="w-3.5 h-3.5" />
                  {LL.entities.event()}
                </Button>
              </div>
            </div>
          </Card>

          {/* Tasks */}
          <Card padding="none">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-foreground uppercase tracking-wide text-sm">
                  {LL.nav.tasks()}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {LL.common.showAll()}
                </Button>
              </div>

              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <CheckIcon className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{LL.dashboard.emptyTasks()}</p>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <PlusIcon className="w-3.5 h-3.5" />
                  {LL.entities.task()}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Quick create ─────────────────────────────────────────────── */}
        <div>
          <h2 className="font-black text-foreground uppercase tracking-wide text-sm mb-3">
            {LL.dashboard.quickAdd.title()}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5" />
              {LL.entities.event()}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <CheckIcon className="w-3.5 h-3.5" />
              {LL.entities.task()}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <DocumentIcon className="w-3.5 h-3.5" />
              {LL.entities.page()}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
