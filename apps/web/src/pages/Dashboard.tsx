import { Button, Card, cn, Input } from '@qoomb/ui';
import { useState } from 'react';

// ── Static placeholder data (Phase 2 will replace with tRPC queries) ─────────

const HIVE = { name: 'Mayer Familie', memberCount: 5, initials: 'MF' };
const USER = { name: 'Ben', fullName: 'Ben Gröner', role: 'parent', initials: 'BG' };

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
    assignee: 'Ben',
    priority: 'high' as const,
  },
  {
    id: '2',
    title: 'Kinder von der Schule abholen',
    done: false,
    assignee: 'Lisa',
    priority: 'high' as const,
  },
  { id: '3', title: 'Zahnarzt anrufen', done: false, assignee: 'Ben', priority: 'medium' as const },
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
    assignee: 'Ben',
    priority: 'medium' as const,
  },
];

// Each member gets a warm, distinct color
const MEMBERS = [
  {
    name: 'Ben',
    role: 'Elternteil',
    initials: 'BG',
    online: true,
    avatarBg: 'bg-amber-400',
    avatarText: 'text-amber-950',
  },
  {
    name: 'Lisa',
    role: 'Elternteil',
    initials: 'LM',
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

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Übersicht', icon: HomeIcon, active: true, badge: null },
  { id: 'events', label: 'Kalender', icon: CalendarIcon, active: false, badge: null },
  { id: 'tasks', label: 'Aufgaben', icon: CheckIcon, active: false, badge: '4' },
  { id: 'members', label: 'Mitglieder', icon: UsersIcon, active: false, badge: null },
  { id: 'pages', label: 'Seiten', icon: DocumentIcon, active: false, badge: null },
];

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CheckMarkIcon() {
  return (
    <svg
      className="w-2.5 h-2.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  );
}

function ChevronUpDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('w-3.5 h-3.5', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');
  const [tasks, setTasks] = useState(TASKS);

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
              {HIVE.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate leading-tight">{HIVE.name}</div>
              <div className="text-xs text-white/50 leading-tight mt-0.5">
                {HIVE.memberCount} Mitglieder
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
              <span className="text-xs font-bold uppercase tracking-wider">Einstellungen</span>
            </button>
          </div>
        </nav>

        {/* User */}
        <div className="px-3 pb-3 pt-2 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-xs font-black text-primary-foreground shrink-0">
              {USER.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white truncate leading-tight">
                {USER.fullName}
              </div>
              <div className="text-xs text-white/50 leading-tight mt-0.5 uppercase tracking-wide">
                {USER.role === 'parent' ? 'Elternteil' : USER.role}
              </div>
            </div>
          </div>
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
            <MenuIcon />
          </button>
          <div className="flex-1" />
          <button className="relative p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <BellIcon />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
          </button>
          <Button size="sm" className="gap-1.5 hidden md:inline-flex">
            <PlusIcon className="w-3.5 h-3.5" />
            Erstellen
          </Button>
        </header>

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
                  Einladen
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
                  Guten Morgen, {USER.name}! 👋
                </h1>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  Heute: <span className="text-foreground font-medium">{nextEvent?.title}</span>
                  {nextEvent && ` um ${nextEvent.time}`}
                  {' · '}
                  <span className="text-foreground font-medium">
                    {tasks.filter((t) => !t.done).length} Aufgaben
                  </span>{' '}
                  offen
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
                        Nächster Termin
                      </p>
                      <p className="text-lg font-bold text-foreground leading-tight truncate">
                        {nextEvent.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">{nextEvent.time}</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0">
                      Details
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
                      Weitere Termine
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Alle anzeigen
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
                      Aufgaben
                    </h2>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Alle anzeigen
                    </Button>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-muted-foreground">
                        {doneTasks} von {tasks.length} erledigt
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
                      Aufgabe hinzufügen
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* ── Quick create ─────────────────────────────────────────────── */}
            <div>
              <h2 className="font-black text-foreground uppercase tracking-wide text-sm mb-3">
                Schnell hinzufügen
              </h2>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Was steht als nächstes an?"
                  value={quickAdd}
                  onChange={(e) => setQuickAdd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickAdd.trim()) setQuickAdd('');
                  }}
                />
                <Button disabled={!quickAdd.trim()} onClick={() => setQuickAdd('')}>
                  Hinzufügen
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  Termin
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <CheckIcon className="w-3.5 h-3.5" />
                  Aufgabe
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <DocumentIcon className="w-3.5 h-3.5" />
                  Seite
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
