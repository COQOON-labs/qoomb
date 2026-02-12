import { Button, Card, cn, Input } from '@qoomb/ui';
import { useState } from 'react';

// ── Static placeholder data (Phase 2 will replace with tRPC queries) ─────────

const HIVE = { name: 'Mayer Familie', memberCount: 5, initials: 'MF' };
const USER = { name: 'Ben Gröner', role: 'parent', initials: 'BG' };

const EVENTS = [
  {
    id: '1',
    title: 'Arzttermin Max',
    dateLabel: 'Fr',
    dateNum: '14',
    monthLabel: 'Feb',
    time: '14:00',
    tag: 'Gesundheit',
    tagClass: 'bg-destructive/10 text-destructive',
  },
  {
    id: '2',
    title: 'Familienessen',
    dateLabel: 'Sa',
    dateNum: '15',
    monthLabel: 'Feb',
    time: '18:30',
    tag: 'Familie',
    tagClass: 'bg-primary/10 text-primary',
  },
  {
    id: '3',
    title: 'Elterngespräch Schule',
    dateLabel: 'Mo',
    dateNum: '17',
    monthLabel: 'Feb',
    time: '09:00',
    tag: 'Schule',
    tagClass: 'bg-success/10 text-success',
  },
  {
    id: '4',
    title: 'Emmas Geburtstag 🎉',
    dateLabel: 'Mi',
    dateNum: '19',
    monthLabel: 'Feb',
    time: 'Ganztags',
    tag: 'Feier',
    tagClass: 'bg-primary/10 text-primary',
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

const MEMBERS = [
  { name: 'Ben G.', role: 'Elternteil', initials: 'BG', online: true },
  { name: 'Lisa M.', role: 'Elternteil', initials: 'LM', online: true },
  { name: 'Max', role: 'Kind', initials: 'M', online: false },
  { name: 'Emma', role: 'Kind', initials: 'E', online: false },
  { name: 'Oma H.', role: 'Gast', initials: 'OH', online: false },
];

const STATS = [
  { label: 'Events heute', value: '2', icon: '📅' },
  { label: 'Offene Aufgaben', value: '4', icon: '✅' },
  { label: 'Heute erledigt', value: '2', icon: '⚡' },
  { label: 'Mitglieder', value: '5', icon: '👥' },
];

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⊞', active: true, badge: null },
  { id: 'events', label: 'Kalender', icon: '📅', active: false, badge: null },
  { id: 'tasks', label: 'Aufgaben', icon: '✅', active: false, badge: '4' },
  { id: 'members', label: 'Mitglieder', icon: '👥', active: false, badge: null },
  { id: 'pages', label: 'Seiten', icon: '📄', active: false, badge: null },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      className="w-2.5 h-2.5 text-success-foreground"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

function ChevronUpDownIcon() {
  return (
    <svg
      className="w-4 h-4 text-muted-foreground shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 9l4-4 4 4m0 6l-4 4-4-4"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200',
          'md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-border shrink-0">
          <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold text-sm select-none">
            Q
          </div>
          <span className="font-semibold text-foreground">Qoomb</span>
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
            beta
          </span>
        </div>

        {/* Hive selector */}
        <div className="p-3 border-b border-border shrink-0">
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
              {HIVE.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{HIVE.name}</div>
              <div className="text-xs text-muted-foreground">{HIVE.memberCount} Mitglieder</div>
            </div>
            <ChevronUpDownIcon />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  item.active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="text-xs bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-medium">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors">
              <span className="text-base leading-none">⚙️</span>
              <span>Einstellungen</span>
            </button>
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-border shrink-0">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <div className="w-8 h-8 bg-muted border border-border rounded-full flex items-center justify-center text-xs font-bold text-foreground shrink-0">
              {USER.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{USER.name}</div>
              <div className="text-xs text-muted-foreground capitalize">{USER.role}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-10 h-14 bg-background/80 backdrop-blur-sm border-b border-border flex items-center gap-3 px-4">
          <button
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors text-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menü öffnen"
          >
            <MenuIcon />
          </button>

          <span className="text-sm font-medium text-foreground hidden md:block">Dashboard</span>

          <div className="flex-1" />

          {/* Search */}
          <button className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-sm text-muted-foreground border border-border transition-colors">
            <SearchIcon />
            <span>Suchen...</span>
            <kbd className="ml-2 text-xs bg-card border border-border rounded px-1">⌘K</kbd>
          </button>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-muted transition-colors text-foreground">
            <BellIcon />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
          </button>

          {/* Create */}
          <Button size="sm" className="hidden md:inline-flex gap-1.5">
            <PlusIcon className="w-4 h-4" />
            Erstellen
          </Button>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-auto">
          {/* Greeting */}
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Guten Morgen, Ben! 👋</h1>
            <p className="text-muted-foreground mt-1">Donnerstag, 12. Februar 2026 · {HIVE.name}</p>
          </div>

          {/* ── Stats ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATS.map((stat) => (
              <Card key={stat.label} padding="sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                  <span className="text-xl">{stat.icon}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* ── Events + Tasks ────────────────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Events */}
            <Card padding="none">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-card-foreground">Nächste Termine</h2>
                <Button variant="ghost" size="sm">
                  Alle anzeigen
                </Button>
              </div>

              <div className="px-3 pb-3 space-y-0.5">
                {EVENTS.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                  >
                    {/* Date badge */}
                    <div className="text-center w-9 shrink-0">
                      <div className="text-xs font-semibold text-primary leading-tight">
                        {event.dateLabel}
                      </div>
                      <div className="text-base font-bold text-foreground leading-tight">
                        {event.dateNum}
                      </div>
                      <div className="text-xs text-muted-foreground leading-tight">
                        {event.monthLabel}
                      </div>
                    </div>

                    <div className="w-px h-9 bg-border shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {event.title}
                      </div>
                      <div className="text-xs text-muted-foreground">{event.time}</div>
                    </div>

                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                        event.tagClass
                      )}
                    >
                      {event.tag}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Tasks */}
            <Card padding="none">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-card-foreground">Aufgaben</h2>
                <Button variant="ghost" size="sm">
                  Alle anzeigen
                </Button>
              </div>

              <div className="px-3 pb-2 space-y-0.5">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => toggleTask(task.id)}
                  >
                    {/* Checkbox */}
                    <div
                      className={cn(
                        'w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                        task.done
                          ? 'bg-success border-success'
                          : 'border-border hover:border-primary'
                      )}
                    >
                      {task.done && <CheckIcon />}
                    </div>

                    <span
                      className={cn(
                        'flex-1 text-sm truncate',
                        task.done ? 'line-through text-muted-foreground' : 'text-foreground'
                      )}
                    >
                      {task.title}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {!task.done && (
                        <span
                          className={cn('w-1.5 h-1.5 rounded-full', {
                            'bg-destructive': task.priority === 'high',
                            'bg-primary': task.priority === 'medium',
                            'bg-border': task.priority === 'low',
                          })}
                        />
                      )}
                      <span className="text-xs text-muted-foreground">{task.assignee}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 pb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="justify-start text-muted-foreground"
                >
                  <PlusIcon className="w-4 h-4 mr-1.5" />
                  Aufgabe hinzufügen
                </Button>
              </div>
            </Card>
          </div>

          {/* ── Members ───────────────────────────────────────────────────── */}
          <Card padding="none">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-card-foreground">Mitglieder</h2>
              <Button variant="ghost" size="sm">
                Verwalten
              </Button>
            </div>
            <div className="px-5 pb-5 flex flex-wrap gap-4">
              {MEMBERS.map((member) => (
                <div key={member.name} className="flex items-center gap-2.5 cursor-pointer group">
                  <div className="relative">
                    <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center text-sm font-semibold text-foreground group-hover:ring-2 group-hover:ring-primary/30 transition-all">
                      {member.initials}
                    </div>
                    <div
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card',
                        member.online ? 'bg-success' : 'bg-border'
                      )}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground leading-tight">
                      {member.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{member.role}</div>
                  </div>
                </div>
              ))}

              {/* Invite button */}
              <button className="flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-full border-2 border-dashed border-border flex items-center justify-center text-muted-foreground group-hover:border-primary group-hover:text-primary transition-colors">
                  <PlusIcon className="w-4 h-4" />
                </div>
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  Einladen
                </span>
              </button>
            </div>
          </Card>

          {/* ── Quick create ──────────────────────────────────────────────── */}
          <Card padding="md">
            <h2 className="text-base font-semibold text-card-foreground mb-4">
              Schnell hinzufügen
            </h2>
            <div className="flex gap-2">
              <Input
                placeholder="Neuen Eintrag eingeben..."
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
            <div className="flex flex-wrap gap-2 mt-3">
              <Button variant="outline" size="sm">
                📅 Termin
              </Button>
              <Button variant="outline" size="sm">
                ✅ Aufgabe
              </Button>
              <Button variant="outline" size="sm">
                📄 Seite
              </Button>
              <Button variant="outline" size="sm">
                💬 Nachricht
              </Button>
            </div>
          </Card>

          {/* ── Component showcase (design tokens in context) ─────────────── */}
          <Card padding="md">
            <h2 className="text-base font-semibold text-card-foreground mb-1">
              Design System · Button Variants
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Alle Varianten, semantische Farben, kein hardcodiertes Indigo mehr.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button isLoading>Laden...</Button>
              <Button disabled>Deaktiviert</Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button fullWidth className="mt-2">
                Full Width
              </Button>
            </div>
          </Card>

          <Card padding="md">
            <h2 className="text-base font-semibold text-card-foreground mb-1">
              Design System · Input Variants
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Label, Helper Text und Error State — alle aus denselben Tokens.
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <Input label="Standard" placeholder="Max Mustermann" />
              <Input
                label="Mit Hilfetext"
                placeholder="max@example.com"
                helperText="Wird nur intern verwendet."
              />
              <Input
                label="Mit Fehler"
                placeholder="Bitte ausfüllen"
                error="Dieses Feld ist erforderlich."
              />
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}
