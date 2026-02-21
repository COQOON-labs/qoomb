import { Button, Card, cn, Input } from '@qoomb/ui';
import { getInitials } from '@qoomb/types';
import { useMemo, useState } from 'react';

import {
  BellIcon,
  CalendarIcon,
  CheckIcon,
  CheckMarkIcon,
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

// ── Static placeholder data (Phase 2 will replace with tRPC queries) ─────────

// USER and HIVE data are now fetched via tRPC (persons.me + persons.list + useAuth)

const EVENTS = [
  {
    id: '1',
    title: 'Arzttermin Max',
    dateLabel: 'Fr',
    dateNum: '14',
    monthLabel: 'Feb',
    time: '14:00 Uhr',
    tag: 'Gesundheit',
    tagClass: 'bg-rose-100 text-rose-700',
    isNext: true,
  },
  {
    id: '2',
    title: 'Familienessen',
    dateLabel: 'Sa',
    dateNum: '15',
    monthLabel: 'Feb',
    time: '18:30 Uhr',
    tag: 'Familie',
    tagClass: 'bg-amber-100 text-amber-800',
    isNext: false,
  },
  {
    id: '3',
    title: 'Elterngespräch Schule',
    dateLabel: 'Mo',
    dateNum: '17',
    monthLabel: 'Feb',
    time: '09:00 Uhr',
    tag: 'Schule',
    tagClass: 'bg-sky-100 text-sky-700',
    isNext: false,
  },
  {
    id: '4',
    title: 'Emmas Geburtstag 🎉',
    dateLabel: 'Mi',
    dateNum: '19',
    monthLabel: 'Feb',
    time: 'Ganztags',
    tag: 'Feier',
    tagClass: 'bg-violet-100 text-violet-700',
    isNext: false,
  },
];

const TASKS = [
  {
    id: '1',
    title: 'Lebensmittel einkaufen',
    done: false,
    assignee: 'John',
    priority: 'high' as const,
  },
  {
    id: '2',
    title: 'Kinder von der Schule abholen',
    done: false,
    assignee: 'Lisa',
    priority: 'high' as const,
  },
  {
    id: '3',
    title: 'Zahnarzt anrufen',
    done: false,
    assignee: 'John',
    priority: 'medium' as const,
  },
  {
    id: '4',
    title: 'Flug für Osterurlaub buchen',
    done: false,
    assignee: 'Lisa',
    priority: 'low' as const,
  },
  {
    id: '5',
    title: 'Tierarzt Max (Hamster)',
    done: true,
    assignee: 'Emma',
    priority: 'low' as const,
  },
  {
    id: '6',
    title: 'Auto zur Werkstatt',
    done: true,
    assignee: 'John',
    priority: 'medium' as const,
  },
];

// Each member gets a warm, distinct color
const MEMBERS = [
  {
    name: 'John',
    role: 'Elternteil',
    initials: 'JD',
    online: true,
    avatarBg: 'bg-amber-400',
    avatarText: 'text-amber-950',
  },
  {
    name: 'Lisa',
    role: 'Elternteil',
    initials: 'LD',
    online: true,
    avatarBg: 'bg-rose-400',
    avatarText: 'text-rose-950',
  },
  {
    name: 'Max',
    role: 'Kind',
    initials: 'M',
    online: false,
    avatarBg: 'bg-sky-400',
    avatarText: 'text-sky-950',
  },
  {
    name: 'Emma',
    role: 'Kind',
    initials: 'E',
    online: false,
    avatarBg: 'bg-violet-400',
    avatarText: 'text-violet-950',
  },
  {
    name: 'Oma H.',
    role: 'Gast',
    initials: 'H',
    online: false,
    avatarBg: 'bg-emerald-400',
    avatarText: 'text-emerald-950',
  },
];

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const { displayName, initials: userInitials, roleLabel } = useCurrentPerson();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');
  const [tasks, setTasks] = useState(TASKS);

  // ── Hive data from tRPC ────────────────────────────────────────────────────
  const { data: members } = trpc.persons.list.useQuery(undefined, { enabled: !!user });

  const hiveName = user?.hiveName ?? '—';
  const hiveInitials = useMemo(() => getInitials(hiveName, '?'), [hiveName]);
  const memberCount = members?.length ?? 0;

  const NAV_ITEMS = [
    { id: 'dashboard', label: LL.nav.overview(), icon: HomeIcon, active: true, badge: null },
    { id: 'events', label: LL.nav.calendar(), icon: CalendarIcon, active: false, badge: null },
    { id: 'tasks', label: LL.nav.tasks(), icon: CheckIcon, active: false, badge: '4' },
    { id: 'members', label: LL.nav.members(), icon: UsersIcon, active: false, badge: null },
    { id: 'pages', label: LL.nav.pages(), icon: DocumentIcon, active: false, badge: null },
  ];

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const doneTasks = tasks.filter((t) => t.done).length;
  const taskProgress = Math.round((doneTasks / tasks.length) * 100);
  const nextEvent = EVENTS.find((e) => e.isNext);
  const remainingEvents = EVENTS.filter((e) => !e.isNext);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
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
          <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
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
              return (
                <button
                  key={item.id}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors',
                    item.active
                      ? 'bg-primary text-primary-foreground font-bold'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left text-xs font-bold uppercase tracking-wider">
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={cn(
                        'text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold',
                        item.active
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
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors">
              <SettingsIcon className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider">
                {LL.nav.settings()}
              </span>
            </button>
          </div>
        </nav>

        {/* User */}
        <div className="px-3 pb-3 pt-2 border-t border-white/10 shrink-0">
          <UserMenu
            displayName={displayName}
            initials={userInitials}
            roleLabel={roleLabel}
          />
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
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
        <main className="flex-1 overflow-auto">
          {/* ── People strip — Locket-style ──────────────────────────────────── */}
          <div className="px-4 md:px-8 pt-7 pb-3">
            <div className="flex items-end gap-5 overflow-x-auto pb-1">
              {MEMBERS.map((member) => (
                <button
                  key={member.name}
                  className="flex flex-col items-center gap-1.5 shrink-0 group outline-none"
                >
                  <div className="relative">
                    <div
                      className={cn(
                        'w-14 h-14 rounded-full flex items-center justify-center text-base font-bold shadow-sm',
                        'transition-transform group-hover:scale-105',
                        member.avatarBg,
                        member.avatarText
                      )}
                    >
                      {member.initials}
                    </div>
                    <div
                      className={cn(
                        'absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background',
                        member.online ? 'bg-success' : 'bg-border'
                      )}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground">{member.name}</span>
                </button>
              ))}

              {/* Invite */}
              <button className="flex flex-col items-center gap-1.5 shrink-0 group outline-none">
                <div className="w-14 h-14 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground group-hover:border-primary group-hover:text-primary transition-colors">
                  <PlusIcon className="w-5 h-5" />
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                  {LL.common.invite()}
                </span>
              </button>
            </div>
          </div>

          {/* ── Editorial greeting ───────────────────────────────────────────── */}
          <div className="px-4 md:px-8 pt-4 pb-5">
            <div className="max-w-5xl flex items-start gap-4">
              {/* Big date number — editorial decoration */}
              <div className="shrink-0 hidden sm:block select-none -mt-3 leading-none">
                <span className="text-[88px] font-black leading-none tabular-nums text-foreground/10">
                  12
                </span>
              </div>
              <div className="sm:pt-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
                  Donnerstag · Februar 2026
                </p>
                <h1 className="text-3xl font-black text-foreground tracking-tight leading-tight">
                  {LL.dashboard.greeting({ name: displayName })}
                </h1>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  {LL.dashboard.todayIntro()}
                  <span className="text-foreground font-medium">{nextEvent?.title}</span>
                  {nextEvent && ` um ${nextEvent.time}`}
                  {' · '}
                  <span className="text-foreground font-medium">
                    {tasks.filter((t) => !t.done).length} {LL.nav.tasks()}
                  </span>{' '}
                  {LL.dashboard.openLabel()}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 md:px-8 pb-10 space-y-5 max-w-5xl">
            {/* ── Next event — editorial card, no gradient ─────────────────── */}
            {nextEvent && (
              <Card padding="none" className="overflow-hidden">
                <div className="flex items-stretch">
                  {/* Date column — solid yellow block */}
                  <div className="w-18 bg-primary flex flex-col items-center justify-center py-5 shrink-0">
                    <span className="text-[10px] font-black text-primary-foreground/70 uppercase tracking-wide">
                      {nextEvent.dateLabel}
                    </span>
                    <span className="text-3xl font-black text-primary-foreground leading-tight">
                      {nextEvent.dateNum}
                    </span>
                    <span className="text-[10px] text-primary-foreground/60">
                      {nextEvent.monthLabel}
                    </span>
                  </div>
                  {/* Event info */}
                  <div className="px-5 py-4 flex flex-1 items-center justify-between gap-4 min-w-0">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                        {LL.dashboard.nextEvent()}
                      </p>
                      <p className="text-lg font-bold text-foreground leading-tight truncate">
                        {nextEvent.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">{nextEvent.time}</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0">
                      {LL.common.details()}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* ── Events + Tasks grid ──────────────────────────────────────── */}
            <div className="grid md:grid-cols-2 gap-5">
              {/* Upcoming events */}
              <Card padding="none">
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-black text-foreground uppercase tracking-wide text-sm">
                      {LL.dashboard.moreEvents()}
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {LL.common.showAll()}
                    </Button>
                  </div>

                  <div className="space-y-px">
                    {remainingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                      >
                        {/* Date */}
                        <div className="text-center w-8 shrink-0">
                          <div className="text-[10px] font-bold text-primary uppercase tracking-wide leading-none">
                            {event.dateLabel}
                          </div>
                          <div className="text-xl font-black text-foreground leading-tight">
                            {event.dateNum}
                          </div>
                        </div>
                        {/* Divider */}
                        <div className="w-px h-8 bg-border shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {event.title}
                          </div>
                          <div className="text-xs text-muted-foreground">{event.time}</div>
                        </div>
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded font-bold shrink-0',
                            event.tagClass
                          )}
                        >
                          {event.tag}
                        </span>
                      </div>
                    ))}
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

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">
                        {LL.dashboard.progressText({ done: doneTasks, total: tasks.length })}
                      </span>
                      <span className="text-xs font-semibold text-foreground">{taskProgress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-primary rounded transition-all duration-500"
                        style={{ width: `${taskProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-px">
                    {tasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                        onClick={() => toggleTask(task.id)}
                      >
                        <div
                          className={cn(
                            'w-4.5 h-4.5 rounded border-2 shrink-0 flex items-center justify-center transition-all',
                            task.done
                              ? 'bg-success border-success'
                              : 'border-border hover:border-primary'
                          )}
                        >
                          {task.done && <CheckMarkIcon />}
                        </div>
                        <span
                          className={cn(
                            'flex-1 text-sm truncate',
                            task.done ? 'line-through text-muted-foreground' : 'text-foreground'
                          )}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!task.done && task.priority === 'high' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                          )}
                          <span className="text-xs text-muted-foreground">{task.assignee}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      fullWidth
                      className="justify-start text-muted-foreground hover:text-foreground"
                    >
                      <PlusIcon className="w-4 h-4 mr-1.5" />
                      {LL.dashboard.addTask()}
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
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder={LL.dashboard.quickAdd.placeholder()}
                  value={quickAdd}
                  onChange={(e) => setQuickAdd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickAdd.trim()) setQuickAdd('');
                  }}
                />
                <Button disabled={!quickAdd.trim()} onClick={() => setQuickAdd('')}>
                  {LL.common.add()}
                </Button>
              </div>
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
        </main>
      </div>
    </div>
  );
}
