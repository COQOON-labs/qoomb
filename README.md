# Qoomb — Privacy-First Hive Organisation Platform

[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/COQOON-labs/qoomb/badge)](https://securityscorecards.dev/viewer/?uri=github.com/COQOON-labs/qoomb)
[![CI](https://github.com/COQOON-labs/qoomb/actions/workflows/ci.yml/badge.svg)](https://github.com/COQOON-labs/qoomb/actions/workflows/ci.yml)
[![CodeQL](https://github.com/COQOON-labs/qoomb/actions/workflows/codeql.yml/badge.svg)](https://github.com/COQOON-labs/qoomb/actions/workflows/codeql.yml)

A privacy-first SaaS hive organisation platform for families and teams. Built on a TypeScript monorepo with NestJS, React 19, tRPC, Prisma, and AES-256-GCM field encryption at rest.

## Prerequisites

- **Node.js** 24+ (LTS)
- **pnpm** 10+ (`npm install -g pnpm`)
- **Docker** & **Docker Compose** (for PostgreSQL and Redis)
- **just** — task runner (`brew install just`)
- **gitleaks** — pre-commit secret scanning (`brew install gitleaks`)

## Quick Start

```bash
# Full setup (HTTPS + local domain, macOS/Linux)
just dev-setup

# Start development servers
just dev-start
```

Visit: **<https://qoomb.localhost:8443>**

**Simple mode** (localhost only, all platforms):

```bash
just dev-setup-simple && just dev-start-simple
# Visit: http://localhost:5173
```

**Seed data & login:** Run with `SEED=1 just dev-start` to create test users:

| User     | Email        | Password | Role   |
| -------- | ------------ | -------- | ------ |
| John Doe | john@doe.dev | Dev1234! | parent |
| Anna Doe | anna@doe.dev | Dev1234! | parent |
| Tim Doe  | tim@doe.dev  | Dev1234! | child  |

<details>
<summary>Useful justfile commands</summary>

```bash
just help                # Show all available commands
just dev-setup           # Full setup with HTTPS (macOS/Linux)
just dev-setup-simple    # Simple setup (Docker + DB, localhost only)
just dev-start           # Start with HTTPS & qoomb.localhost
just dev-start-simple    # Start on localhost only (no HTTPS)
just docker-up           # Start PostgreSQL and Redis
just docker-down         # Stop Docker services
just db-migrate          # Run database migrations
just db-studio           # Open Prisma Studio (DB GUI)
just db-seed             # Load dev seed data
just status              # Check service status
just stop                # Stop Caddy proxy
just clean               # Clean build artifacts
just test                # Run all tests
just quality             # Lint + format-check + type-check
```

</details>

<details>
<summary>Manual setup (without justfile)</summary>

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm --filter @qoomb/api db:generate
pnpm --filter @qoomb/api db:migrate
pnpm dev
```

</details>

## Project Structure

```text
qoomb/
├── apps/
│   ├── api/          # NestJS backend (Fastify, tRPC, Prisma)
│   ├── web/          # React 19 PWA (Vite, Tailwind v4)
│   └── mobile/       # Capacitor wrapper (iOS / Android)
├── packages/
│   ├── types/        # Shared TypeScript types + domain utilities
│   ├── validators/   # Shared Zod schemas + sanitizers
│   ├── ui/           # Shared React component library (CVA + Radix)
│   └── config/       # Shared tsconfig
├── docs/             # Architecture docs, ADRs, design system
└── docker-compose.yml
```

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

**Auth & Security** — JWT RS256 with refresh rotation and Redis blacklisting, Passkey/WebAuthn, multi-tenant isolation via shared DB schema + Row-Level Security, RBAC with per-hive permission overrides and 5-stage resource access guard, CSRF protection, rate limiting, account lockout.

**Encryption** — AES-256-GCM field encryption at rest with HKDF per-hive and per-user key derivation. Decorator-based (`@EncryptFields` / `@DecryptFields`). Pluggable key providers (Environment, File, AWS KMS, Vault). HMAC-SHA256 email blind index. Key rotation with automatic backups.

**Lists** — Flexible Notion-style lists with table, checklist, and kanban views. Six field types (text, number, date, checkbox, select, person). Drag & drop row/column reordering, inline cell editing, favorites, settings panel, field visibility, templates, icon picker, archive. Full RBAC + encryption.

**Events** — Calendar events with CRUD, recurrence rules, visibility control, and share-based access.

**Persons & Groups** — Member management with role assignment, hive invitations (7 d expiry, daily cleanup), group membership.

**i18n & Accessibility** — All strings via typesafe-i18n (DE + EN), WCAG 2.1 AA.

**CI/CD** — OpenSSF Scorecard, CodeQL SAST, Trivy scanning, gitleaks pre-commit, Commitlint, Husky hooks, Release Please.

## Roadmap

**Phase 3: Hive Management & Communication** 🚧

- Hive settings UI, invitation management (list/resend/revoke)
- In-app notifications, notification emails, email preferences
- Encrypted in-app messaging, activity log

**Phase 4: Sync & Real-Time** 📋

- Client-side SQLite cache (wa-sqlite + OPFS), SSE change feed
- Optimistic mutations, offline queue, local search
- pgvector semantic search, optional E2E encryption (libsodium)

**Phase 5: Pages & Files** 📋

- Tiptap editor with tree hierarchy and version history
- Real-time collaborative editing (Yjs CRDT)
- File upload with envelope encryption

**Phase 6: Calendar Integration** 📋

- Google Calendar, Apple Calendar (CalDAV), Microsoft Outlook (Graph API)
- Bidirectional sync with conflict resolution UI

## Documentation

| File                                                         | Description                                             |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                       | AI agent guidelines (source of truth for project rules) |
| [docs/SECURITY.md](docs/SECURITY.md)                         | Security architecture                                   |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md)                   | RBAC architecture + guard API                           |
| [docs/CONTENT_ARCHITECTURE.md](docs/CONTENT_ARCHITECTURE.md) | Content model, schema, encryption strategy              |
| [docs/TESTING.md](docs/TESTING.md)                           | Test quality criteria and anti-patterns                 |
| [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md)       | qoomb.localhost + Caddy setup                           |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)               | Tailwind v4 design tokens                               |
| [docs/adr/](docs/adr/)                                       | Architecture Decision Records                           |

## License

**Qoomb** is licensed under the **[Fair Source License v1.0](LICENSE.md)** with a **10-employee threshold**.

|                                |                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| ✅ Free                        | Personal use, evaluation, small orgs < 10 employees, families, non-profits, education |
| ❌ Commercial license required | Orgs ≥ 10 employees, hosting as SaaS, redistributing commercially                     |

[Full License](LICENSE.md) · [Commercial Licensing](COMMERCIAL-LICENSE.md) · Contact: <bgroener@coqoon.com>

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, …)
4. Ensure tests pass and ESLint reports zero errors
5. Submit a pull request

By submitting a PR you agree to the [Contributor License Agreement](LICENSE.md#contributor-license-agreement-cla). See [CHANGELOG.md](CHANGELOG.md) for version history and [CONTRIBUTORS.md](CONTRIBUTORS.md) for the list of contributors.
