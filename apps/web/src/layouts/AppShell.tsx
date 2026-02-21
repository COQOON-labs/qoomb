import { getInitials } from '@qoomb/types';
import { Button, cn } from '@qoomb/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChevronUpDownIcon,
  DocumentIcon,
  HomeIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
} from '../components/icons';
import { EmailVerificationBanner } from '../components/layout/EmailVerificationBanner';
import { HiveSwitcher } from '../components/layout/HiveSwitcher';
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
  { id: 'events', route: '/calendar', icon: CalendarIcon },
  { id: 'tasks', route: '/tasks', icon: CheckIcon },
  { id: 'members', route: '/members', icon: UsersIcon },
  { id: 'pages', route: '/pages', icon: DocumentIcon },
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Hive data from tRPC ──────────────────────────────────────────────────
  const { data: members } = trpc.persons.list.useQuery(undefined, { enabled: !!user });

  const hiveName = user?.hiveName ?? '—';
  const hiveInitials = useMemo(() => getInitials(hiveName, '?'), [hiveName]);
  const memberCount = members?.length ?? 0;

  const navLabels: Record<string, string> = {
    dashboard: LL.nav.overview(),
    events: LL.nav.calendar(),
    tasks: LL.nav.tasks(),
    members: LL.nav.members(),
    pages: LL.nav.pages(),
  };

  function handleNav(route: string) {
    void navigate(route);
    setSidebarOpen(false);
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-60 bg-foreground flex flex-col transition-transform duration-200',
          'md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-white/10 shrink-0">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-black text-sm">
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
        <nav className="flex-1 px-3 py-1 overflow-y-auto">
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

          <div className="mt-3 pt-3 border-t border-white/10">
            <button
              onClick={() => handleNav('/profile')}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors',
                location.pathname === '/profile'
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/10'
              )}
            >
              <SettingsIcon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {LL.nav.settings()}
              </span>
            </button>
          </div>
        </nav>

        {/* User */}
        <div className="px-3 pb-3 pt-2 border-t border-white/10 shrink-0">
          <UserMenu displayName={displayName} initials={userInitials} roleLabel={roleLabel} />
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 bg-background border-b-2 border-primary flex items-center gap-3 px-4 shrink-0">
          <button
            className="md:hidden p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <HiveSwitcher />
          <div className="flex-1" />
          <button className="relative p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <BellIcon className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
          </button>
          <Button size="sm" className="gap-1.5 hidden md:inline-flex">
            <PlusIcon className="w-3.5 h-3.5" />
            {LL.common.create()}
          </Button>
        </header>

        {/* Email verification banner */}
        <EmailVerificationBanner />

        {/* Content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
