import type { AppRouter } from '@qoomb/api/src/trpc/app.router';
import { Button, Card } from '@qoomb/ui';
import type { inferRouterOutputs } from '@trpc/server';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { CheckIcon, PlusIcon } from '../components/icons';
import { useCurrentPerson } from '../hooks/useCurrentPerson';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { useLocale } from '../lib/locale/LocaleProvider';
import { trpc } from '../lib/trpc/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type RouterOutput = inferRouterOutputs<AppRouter>;
type ListSummary = RouterOutput['lists']['list'][number];

// ── ListProgressBar ───────────────────────────────────────────────────────────

interface ListProgressBarProps {
  listId: string;
  checkboxFieldId: string;
}

function ListProgressBar({ listId, checkboxFieldId }: ListProgressBarProps) {
  const { LL } = useI18nContext();
  const { data: items = [] } = trpc.lists.listItems.useQuery({ listId });

  const total = items.length;
  const done = items.filter(
    (item) => item.values.find((v) => v.fieldId === checkboxFieldId)?.value === 'true'
  ).length;

  if (total === 0) return null;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">
          {LL.dashboard.progressText({ done, total })}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── getCheckboxFieldId ────────────────────────────────────────────────────────

function getCheckboxFieldId(list: ListSummary): string | null {
  const checklistView = list.views.find((v) => v.viewType === 'checklist');
  if (!checklistView) return null;
  const cfg = checklistView.config as { checkboxFieldId?: string } | null;
  return cfg?.checkboxFieldId ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useTodayLabel(): { dayNum: string; dateLabel: string } {
  const { bcp47Locale } = useLocale();
  const now = new Date();
  const dayNum = String(now.getDate());
  const dateLabel = now
    .toLocaleDateString(bcp47Locale, { weekday: 'long', month: 'long', year: 'numeric' })
    .replace(/(\w+), (\w+ \d{4})/, '$1 · $2');
  return { dayNum, dateLabel };
}

// Picked once per page load (module-level), so reloads give variety
// while re-renders within the same session stay stable.
const sessionVariant = Math.floor(Math.random() * 3) as 0 | 1 | 2;

function useGreeting(name: string): string {
  const { LL } = useI18nContext();
  const v = sessionVariant;
  const h = new Date().getHours();
  const g = LL.dashboard.greetings;
  if (h >= 5 && h < 12) {
    if (v === 0) return g.morning0({ name });
    if (v === 1) return g.morning1({ name });
    return g.morning2({ name });
  }
  if (h >= 12 && h < 18) {
    if (v === 0) return g.afternoon0({ name });
    if (v === 1) return g.afternoon1({ name });
    return g.afternoon2({ name });
  }
  if (h >= 18 && h < 23) {
    if (v === 0) return g.evening0({ name });
    if (v === 1) return g.evening1({ name });
    return g.evening2({ name });
  }
  if (v === 0) return g.night0({ name });
  if (v === 1) return g.night1({ name });
  return g.night2({ name });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { LL } = useI18nContext();
  const { displayName } = useCurrentPerson();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { dayNum, dateLabel } = useTodayLabel();
  const greeting = useGreeting(displayName);

  const { data: lists = [] } = trpc.lists.list.useQuery(
    { includeArchived: false },
    { enabled: !!user }
  );

  // Show max 5 lists: favorites first (by sortOrder), then alphabetical
  const recentLists = useMemo(() => {
    const favs = lists
      .filter((l) => l.isFavorite)
      .sort((a, b) => (a.favoriteSortOrder ?? 0) - (b.favoriteSortOrder ?? 0));
    const nonFavs = lists.filter((l) => !l.isFavorite).sort((a, b) => a.name.localeCompare(b.name));
    return [...favs, ...nonFavs].slice(0, 5);
  }, [lists]);

  const handleNavigateToLists = useCallback(() => {
    void navigate('/lists');
  }, [navigate]);

  const handleNavigateToList = useCallback(
    (id: string) => {
      void navigate(`/lists/${id}`);
    },
    [navigate]
  );

  const handleNavigateToNewList = useCallback(() => {
    void navigate('/lists');
  }, [navigate]);

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
              {greeting}
            </h1>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 pb-10 space-y-5 max-w-5xl">
        {/* ── Lists ────────────────────────────────────────────── */}
        <div className="max-w-md">
          <Card padding="none">
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-black text-foreground uppercase tracking-wide text-sm">
                  {LL.nav.lists()}
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleNavigateToLists}
                >
                  {LL.common.showAll()}
                </Button>
              </div>

              {recentLists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                  <CheckIcon className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{LL.dashboard.emptyList()}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleNavigateToNewList}
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    {LL.entities.list()}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {recentLists.map((list) => {
                    const checkboxFieldId = getCheckboxFieldId(list);
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => handleNavigateToList(list.id)}
                        className="flex items-start gap-3 px-1 py-2.5 hover:bg-muted/20 transition-colors text-left rounded"
                      >
                        <span className="text-lg leading-none w-6 text-center shrink-0 mt-0.5">
                          {list.icon ?? '📋'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-foreground truncate block">
                            {list.name}
                          </span>
                          {checkboxFieldId && (
                            <ListProgressBar listId={list.id} checkboxFieldId={checkboxFieldId} />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Quick create ────────────────────────────────────────────── */}
        <div>
          <h2 className="font-black text-foreground uppercase tracking-wide text-sm mb-3">
            {LL.dashboard.quickAdd.title()}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleNavigateToNewList}
            >
              <CheckIcon className="w-3.5 h-3.5" />
              {LL.entities.list()}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
