# Qoomb — Privacy-First Hive Organisation Platform

[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/COQOON-labs/qoomb/badge)](https://securityscorecards.dev/viewer/?uri=github.com/COQOON-labs/qoomb)
[![CI](https://github.com/COQOON-labs/qoomb/actions/workflows/ci.yml/badge.svg)](https://github.com/COQOON-labs/qoomb/actions/workflows/ci.yml)
[![CodeQL](https://github.com/COQOON-labs/qoomb/actions/workflows/codeql.yml/badge.svg)](https://github.com/COQOON-labs/qoomb/actions/workflows/codeql.yml)

A privacy-first SaaS hive organisation platform for families and teams. Built on a TypeScript monorepo with NestJS, React 19, tRPC, Prisma, and AES-256-GCM field encryption at rest.

## Prerequisites

- **Node.js** 24+ (LTS)
- **pnpm** 10+ (`npm install -g pnpm`)
- **Docker** & **Docker Compose** (for PostgreSQL and Redis)
- **gitleaks** — required for pre-commit secret scanning (`brew install gitleaks`)

## Quick Start

### Option 1: justfile (Recommended) ⭐

```bash
# Full setup (HTTPS + local domain, macOS/Linux)
just dev-setup

# Start development servers
just dev-start
```

Visit: **<https://qoomb.localhost:8443>** (also works on mobile devices)

**Simple mode** (localhost only, works on all platforms):

```bash
just dev-setup-simple
just dev-start-simple
# Visit: http://localhost:5173
```

#### Useful justfile commands

```bash
just help                # Show all available commands

just dev-setup-simple    # Simple setup (Docker + DB, localhost only)
just dev-setup           # Full setup with HTTPS (macOS/Linux, recommended)
just dev-start           # Start with HTTPS & qoomb.localhost
just dev-start-simple    # Start on localhost only (no HTTPS)

just docker-up           # Start PostgreSQL and Redis
just docker-down         # Stop Docker services
just db-migrate          # Run database migrations
just db-studio           # Open Prisma Studio (DB GUI)

just status              # Check service status
just stop                # Stop development (Caddy)
just clean               # Clean build artifacts

AUTO=1 just dev-start    # Auto-approve all prompts
SEED=1 just dev-start    # Pre-seed with Doe Family test data
```

### Option 2: Manual Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Setup environment
cp .env.example .env

# 3. Start Docker services (PostgreSQL + Redis)
docker-compose up -d

# 4. Setup database
pnpm --filter @qoomb/api db:generate
pnpm --filter @qoomb/api db:migrate

# 5. Start development servers
pnpm dev
```

## Project Structure

```text
qoomb/
├── apps/
│   ├── api/          # NestJS backend (Fastify adapter, tRPC, Prisma)
│   ├── web/          # React 19 PWA frontend (Vite, Tailwind v4)
│   └── mobile/       # Capacitor wrapper (iOS / Android)
├── packages/
│   ├── types/        # Shared TypeScript types + domain utilities
│   ├── validators/   # Shared Zod schemas + sanitizers
│   ├── ui/           # Shared React component library (CVA + Radix)
│   └── config/       # Shared tsconfig
├── docs/             # Architecture docs, ADRs, design system
├── docker-compose.yml
└── AGENTS.md         # Universal AI agent guidelines (source of truth)
```

## Development

```bash
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all apps
pnpm lint             # Lint (ESLint + jsonc/no-comments)
pnpm lint:json        # JSON-only lint (no comments in .json files)
pnpm format           # Format with Prettier
pnpm test             # Run all tests
```

### Dev Panel (Development Mode Only)

A sliding debug panel is available on the right edge of the screen in dev mode. It provides QR codes for mobile certificate setup, environment info, backend health checks, network status, and cache controls. Completely invisible in production builds.

## Technology Stack

| Layer                 | Technology                                  |
| --------------------- | ------------------------------------------- |
| Backend               | NestJS, Fastify, tRPC, Prisma ORM           |
| Frontend              | React 19, Vite, Tailwind CSS v4, PWA        |
| Mobile                | Capacitor (iOS / Android)                   |
| Database              | PostgreSQL 18 with Row-Level Security       |
| Cache / Rate Limiting | Redis 8                                     |
| Auth                  | JWT RS256, Passkey / WebAuthn               |
| Encryption            | AES-256-GCM + HKDF, pluggable key providers |
| i18n                  | typesafe-i18n (DE + EN)                     |
| Monorepo              | Turborepo + pnpm workspaces                 |

## Features

### Phase 1: Foundation ✅

- Turborepo + pnpm monorepo, shared `@qoomb/ui` component library
- NestJS backend with tRPC (end-to-end type safety)
- React 19 PWA (Vite + Workbox service worker)
- Capacitor mobile wrapper (iOS / Android)
- Docker Compose (PostgreSQL 18 + Redis 8)
- Dev panel (mobile QR codes, health checks, cache controls — dev only)

### Phase 2: Auth, Encryption & Core Content ✅

**Auth & Security**

- JWT RS256 (15 min access + 7 d refresh, rotation, Redis blacklisting)
- Passkey / WebAuthn (register, authenticate, list, remove credentials)
- Multi-tenant isolation: shared DB schema + Row-Level Security on every hive table
- RBAC with per-hive permission overrides (family: parent/child; org: admin/manager/member/guest)
- 5-stage resource access guard (shares → private → group → admins → hive)
- CSRF guard, rate limiting (Redis), account lockout, security headers (Helmet)
- Operator feature flags: `ALLOW_OPEN_REGISTRATION`, `ALLOW_FORGOT_PASSWORD`, `ALLOW_PASSKEYS`

**Encryption**

- AES-256-GCM field encryption at rest, HKDF per-hive and per-user key derivation
- Decorator-based: `@EncryptFields` / `@DecryptFields` on service methods
- Pluggable key providers: Environment, File, AWS KMS, HashiCorp Vault
- HMAC-SHA256 email blind index (no plaintext email in DB)
- Key rotation script with automatic backups (see ADR-0008)
- 7-point self-test at startup

**Persons, Events & Groups**

- Persons: profile, role management, hive invitations (expire after 7 d, daily cleanup cron)
- Events: CRUD, recurrence rule storage, visibility + share access
- Groups: create/manage groups, add/remove members

**Lists (replaces Tasks)**

Generic EAV model — `List → ListField → ListItem → ListItemValue`:

- **Field types**: text, number, date, checkbox, select (Notion-style dropdown), person
- **Three views**: Table, Checklist, Kanban
- **Table view**: drag & drop row reordering, drag & drop column reordering, inline cell editing, field visibility toggle, cell truncation
- **Checklist view**: configurable checkbox and title fields, inline title editing (click-to-edit)
- **Kanban view**: card-based layout per list
- **Person fields**: multi-assignee picker with Notion-style autocomplete, free-text fallback, resolved display names
- **Favorites**: star any list, drag-and-drop reorder, pinned at top of sidebar
- **Settings Panel**: per-view field visibility, field deletion with guards, view-specific config
- **Field deletion guards**: shared rule in `@qoomb/types`, enforced on both frontend (disabled button + tooltip) and backend (`PRECONDITION_FAILED`)
- **Templates**: system lists auto-created on first access
- **Icon picker**, archive / unarchive, full RBAC + AES-256-GCM encryption
- i18n (DE + EN), WCAG 2.1 AA accessibility

**Developer Experience**

- Typesafe i18n (DE + EN) for all user-facing strings on backend and frontend
- WCAG 2.1 AA accessibility standards
- OpenSSF Scorecard, CodeQL SAST, Trivy (vulnerability + secrets + IaC), gitleaks pre-commit
- Commitlint (Conventional Commits), Husky hooks (pre-commit, pre-push, commit-msg)
- Release Please for automated semantic versioning and changelog

### Phase 3: Hive Management & Communication 🚧

- [ ] Hive CRUD (name, locale, settings) and settings UI
- [ ] Invitation management UI (list pending, resend, revoke)
- [ ] In-app notifications (bell icon, read/unread state)
- [ ] Notification emails (event reminders, task assignments, member joined/left)
- [ ] Email preferences (per-user opt-in/out, unsubscribe)
- [ ] In-app messaging between hive members (encrypted)
- [ ] Activity log ("what changed since last login")

### Phase 4: Sync & Real-Time 📋

- [ ] Client-side SQLite cache (wa-sqlite + OPFS in browser, native on mobile)
- [ ] SSE change feed (Redis Pub/Sub → per-hive event stream)
- [ ] Optimistic mutations with server confirmation, offline queue
- [ ] Full local search (all non-file content synced to client)
- [ ] pgvector semantic search (server-side)
- [ ] E2E encryption option (libsodium — opt-in for ultra-sensitive content)

### Phase 5: Pages & Files 📋

- [ ] Pages module (Tiptap editor, tree hierarchy, version history)
- [ ] Real-time collaborative editing (Yjs CRDT)
- [ ] Documents module (file upload + envelope encryption)

### Phase 6: Calendar Integration 📋

- [ ] Google Calendar (OAuth + webhook)
- [ ] Apple Calendar (CalDAV)
- [ ] Microsoft Outlook (Graph API)
- [ ] Bidirectional sync + conflict resolution UI

## Documentation

| File                                                   | Description                                     |
| ------------------------------------------------------ | ----------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                 | Universal AI agent guidelines (source of truth) |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md)             | RBAC architecture + guard API                   |
| [docs/SECURITY.md](docs/SECURITY.md)                   | Security architecture                           |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)         | Tailwind v4 design tokens                       |
| [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) | qoomb.localhost + Caddy setup                   |
| [docs/adr/](docs/adr/)                                 | Architecture Decision Records                   |

## License

**Qoomb** is licensed under the **[Fair Source License v1.0](LICENSE.md)** with a **10-employee threshold**.

|                                |                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| ✅ Free                        | Personal use, evaluation, small orgs < 10 employees, families, non-profits, education |
| ❌ Commercial license required | Orgs ≥ 10 employees, hosting Qoomb as SaaS, redistributing commercially               |

- [Full License](LICENSE.md) · [Commercial Licensing](COMMERCIAL-LICENSE.md) · Contact: <bgroener@coqoon.com>

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …)
4. Ensure tests pass and ESLint reports zero errors
5. Submit a pull request

By submitting a PR you agree to the [Contributor License Agreement](LICENSE.md#contributor-license-agreement-cla). See [CHANGELOG.md](CHANGELOG.md) for version history and [CONTRIBUTORS.md](CONTRIBUTORS.md) for the list of contributors.
