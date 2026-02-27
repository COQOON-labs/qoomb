import { getInitials } from '@qoomb/types';
import { cn } from '@qoomb/ui';
import { useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { CheckIcon, ChevronUpDownIcon, HomeIcon } from '../components/icons';
import { EmailVerificationBanner } from '../components/layout/EmailVerificationBanner';
import { UserMenu } from '../components/layout/UserMenu';
import { useCurrentPerson } from '../hooks/useCurrentPerson';
import { useI18nContext } from '../i18n/i18n-react';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: ReactNode;
}

// ── Nav config ────────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', route: '/dashboard', icon: HomeIcon },
  { id: 'tasks', route: '/tasks', icon: CheckIcon },
];

// ── App Shell ─────────────────────────────────────────────────────────────────

/**
 * Shared application shell with sidebar, topbar, and content area.
 * Used by Dashboard, ProfilePage, and all other authenticated pages.
 */
export function AppShell({ children }: AppShellProps) {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const { displayName, initials: userInitials, roleLabel } = useCurrentPerson();
  const location = useLocation();
  const navigate = useNavigate();
  // ── Hive data from tRPC ──────────────────────────────────────────────────
  const { data: members } = trpc.persons.list.useQuery(undefined, { enabled: !!user });

  const hiveName = user?.hiveName ?? '—';
  const hiveInitials = useMemo(() => getInitials(hiveName, '?'), [hiveName]);
  const memberCount = members?.length ?? 0;

  const navLabels: Record<string, string> = {
    dashboard: LL.nav.overview(),
    tasks: LL.nav.tasks(),
  };

  function handleNav(route: string) {
    void navigate(route);
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sidebar — desktop only ─────────────────────────────────────────── */}
      <aside className="hidden md:flex w-60 bg-foreground flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 px-6 flex items-center gap-2.5 border-b border-white/10 shrink-0">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-black text-sm">
            Q
          </div>
          <span className="font-black text-base text-white tracking-tight">Qoomb</span>
        </div>

        {/* Hive selector */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <button
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left"
            onClick={() => handleNav('/dashboard')}
          >
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground text-sm font-black shrink-0">
              {hiveInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate leading-tight">{hiveName}</div>
              <div className="text-xs text-white/50 leading-tight mt-0.5">
                {LL.dashboard.memberCount({ count: memberCount })}
              </div>
            </div>
            <ChevronUpDownIcon className="text-white/40" />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label={LL.nav.mainLabel()} className="flex-1 px-3 py-1 overflow-y-auto">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.route;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.route)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-bold'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left text-xs font-bold uppercase tracking-wider">
                    {navLabels[item.id] ?? item.id}
                  </span>
                  {item.badge && (
                    <span
                      className={cn(
                        'text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-white/15 text-white'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User */}
        <div className="px-3 pb-3 pt-2 border-t border-white/10 shrink-0">
          <UserMenu displayName={displayName} initials={userInitials} roleLabel={roleLabel} />
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Email verification banner */}
        <EmailVerificationBanner />

        {/* Content */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
      </div>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      <nav
        aria-label={LL.nav.mobileLabel()}
        className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-foreground border-t border-white/10 flex"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.route;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.route)}
              className="flex-1 relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors"
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-colors',
                  isActive ? 'text-primary' : 'text-white/40'
                )}
              />
              <span
                className={cn(
                  'text-[10px] font-bold uppercase tracking-wider transition-colors',
                  isActive ? 'text-primary' : 'text-white/40'
                )}
              >
                {navLabels[item.id] ?? item.id}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-t-full bg-primary" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
