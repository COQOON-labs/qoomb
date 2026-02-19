# Qoomb - Privacy-First Family Organization Platform

[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/COQOON-labs/qoomb/badge)](https://securityscorecards.dev/viewer/?uri=github.com/COQOON-labs/qoomb)
[![CI](https://github.com/COQOON-labs/qoomb/actions/workflows/ci.yml/badge.svg)](https://github.com/COQOON-labs/qoomb/actions/workflows/ci.yml)
[![CodeQL](https://github.com/COQOON-labs/qoomb/actions/workflows/codeql.yml/badge.svg)](https://github.com/COQOON-labs/qoomb/actions/workflows/codeql.yml)

A family organization platform with offline-first capabilities, hybrid encryption, and multi-tenant architecture.

## Prerequisites

- **Node.js** 24+ (LTS)
- **pnpm** 10+ (`npm install -g pnpm`)
- **Docker** & **Docker Compose** (for PostgreSQL and Redis)
- **gitleaks** — required for pre-commit secret scanning (`brew install gitleaks`)

## Quick Start

### Option 1: Using justfile (Recommended) ⭐

```bash
# Full setup (HTTPS + local domain, macOS/Linux)
just setup

# Start development servers
just dev
```

Visit: **<https://qoomb.localhost:8443>** (also works on mobile devices)

**Simple mode** (localhost only, works on all platforms including Windows):

```bash
just setup-simple
just dev-simple
# Visit: http://localhost:5173
```

#### Available Commands

```bash
just help          # Show all available commands

# Setup
just setup-simple  # Simple setup (Docker + DB, localhost only)
just setup         # Full setup with HTTPS (macOS/Linux, recommended)

# Development
just dev           # Start with HTTPS & qoomb.localhost (recommended)
just dev-simple    # Start on localhost only (no HTTPS)
just dev-api       # Start only backend API
just dev-web       # Start only frontend

# Docker
just docker-up     # Start PostgreSQL and Redis
just docker-down   # Stop Docker services

# Database
just db-migrate    # Run database migrations
just db-studio     # Open Prisma Studio (DB GUI)

# Utilities
just status        # Check service status
just stop          # Stop development (Caddy)
just clean         # Clean build artifacts
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
│   ├── api/                    # NestJS backend
│   └── web/                    # React frontend (PWA)
├── packages/
│   ├── types/                  # Shared TypeScript types
│   ├── validators/             # Shared Zod schemas
│   └── config/                 # Shared configurations
├── docker/                     # Docker configurations
├── docker-compose.yml          # Development services
└── claude.md                   # Detailed architecture docs
```

## Development

### pnpm Commands

```bash
# Development
pnpm dev                        # Start all apps in dev mode
pnpm build                      # Build all apps
pnpm lint                       # Lint all apps
pnpm test                       # Run all tests

# Database
pnpm --filter @qoomb/api db:generate    # Generate Prisma client
pnpm --filter @qoomb/api db:migrate     # Run migrations
pnpm --filter @qoomb/api db:push        # Push schema changes
pnpm --filter @qoomb/api db:studio      # Open Prisma Studio

# Docker
docker-compose up -d            # Start services
docker-compose down             # Stop services
docker-compose logs -f          # View logs
```

### Development Tools

#### 🔧 Dev Panel (Development Mode Only)

When running in development mode (`pnpm dev`), a **Dev Tools panel** is available on the right side of the screen:

**Features:**

- **Mobile Setup** - QR codes for certificate installation and mobile testing
- **Environment Info** - URLs, API endpoints, environment variables
- **Backend Health** - Auto-refreshing health checks
- **Network Status** - Online/offline detection and connection type
- **Quick Actions**:
  - Clear all caches (Service Workers, localStorage, sessionStorage)
  - Clear console
  - Reload page
  - Open Prisma Studio
  - Action logs

**How to use:**

1. Look for the **"🔧 DEV TOOLS"** tab on the right edge
2. Click to open the sliding panel
3. All debugging tools are organized in sections

**Note:** The dev panel is completely invisible in production builds.

### Technology Stack

- **Backend**: NestJS, tRPC, Prisma, PostgreSQL (with pgvector), Redis
- **Frontend**: React 19, Vite, TypeScript
- **Monorepo**: Turborepo, pnpm workspaces
- **Database**: PostgreSQL 18 with pgvector extension
- **Cache**: Redis 8
- **Encryption**: Hybrid (AES-256-GCM + libsodium)

## Architecture

See [claude.md](claude.md) for detailed architecture documentation, including:

- System overview and component diagram
- Database schema design
- Sync strategy (offline-first approach)
- Encryption architecture
- Multi-tenant isolation
- Deployment options

## Features

### Phase 1: Foundation ✅

- [x] Monorepo (Turborepo + pnpm workspaces)
- [x] NestJS backend + tRPC (end-to-end type safety)
- [x] React 19 PWA frontend (Vite + vite-plugin-pwa)
- [x] Capacitor mobile wrapper (iOS / Android)
- [x] Docker Compose (PostgreSQL 18 + Redis 8)
- [x] Shared UI library (`@qoomb/ui`)
- [x] Dev panel (debug tools, mobile QR, health checks — dev only)

### Phase 2: Auth, Encryption & Core Content ✅

- [x] JWT authentication (15 min access + 7 d refresh, rotation, blacklisting)
- [x] Passkey / WebAuthn support
- [x] Multi-tenant isolation (shared schema + Row-Level Security)
- [x] RBAC with per-hive permission overrides
- [x] PII encryption at rest (AES-256-GCM, per-user HKDF keys)
- [x] Hive name encryption (hive-scoped HKDF key)
- [x] Email blind index (HMAC-SHA256 — no plaintext email in DB)
- [x] Pluggable key providers (Env, File, AWS KMS, Vault)
- [x] Events module (create, list, get, update, delete + field encryption)
- [x] Tasks module (create, list, get, update, complete, delete + field encryption)
- [x] Persons module (list, get, update profile/role, invite, remove)
- [x] Groups module (create, list, get, update, delete, add/remove members)
- [x] 5-stage resource access guard (shares → private → group → admins → hive)
- [x] CI/CD (CodeQL, Trivy, OpenSSF Scorecard, gitleaks pre-commit, dependency review)

### Phase 3: Pages & Files 🚧

- [ ] Pages module (Tiptap editor, tree hierarchy, version history)
- [ ] Documents module (file upload + envelope encryption)
- [ ] Activity log (change feed — "what changed since last login")

### Phase 4: Offline & Search 📋

- [ ] Client-side SQLite sync (vector clock conflict resolution)
- [ ] Full local search (all non-file content synced to client)
- [ ] E2E encryption option (libsodium)
- [ ] Semantic search (pgvector, server-side)

### Phase 5: Calendar Integration 📋

- [ ] Google Calendar (OAuth + webhook)
- [ ] Apple Calendar (CalDAV)
- [ ] Microsoft Outlook (Graph API)
- [ ] Bidirectional sync + conflict resolution UI

## License

**Qoomb** is licensed under the **[Fair Source License v1.0](LICENSE.md)** with a **10-employee threshold**.

### What does this mean?

✅ **Free to use for:**

- Personal, non-commercial use
- Development, testing, and evaluation
- Small organizations with **< 10 employees**
- Non-profit organizations with < 10 employees
- Educational and research purposes
- **Families of any size** — strictly private, non-commercial use (the 10-employee threshold does not apply to families)

❌ **Requires commercial license for:**

- Organizations with **≥ 10 employees** using it internally
- Offering Qoomb as a hosted service (SaaS)
- Redistributing Qoomb as part of a commercial product

**Why Fair Source?**

We believe in sustainable open-source. Small teams and individuals can use Qoomb freely. Larger organizations that benefit from Qoomb should contribute back through commercial licensing.

📄 **More Information:**

- [Full License Text](LICENSE.md)
- [Commercial Licensing](COMMERCIAL-LICENSE.md)
- Contact: <bgroener@coqoon.com>

## Contributing

We welcome contributions from the community! By contributing, you agree that your contributions will be licensed under the same Fair Source License.

**How to contribute:**

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Follow our [Conventional Commits](https://www.conventionalcommits.org/) conventions
4. Submit a pull request

📖 **Documentation:**

- [Release Process](docs/RELEASING.md) - How releases are managed
- [Contributors](CONTRIBUTORS.md) - Our amazing contributors
- [Changelog](CHANGELOG.md) - Version history

**Before contributing:**

- Check existing issues and PRs
- Discuss major changes in GitHub Discussions first
- Ensure all tests pass and code follows our linting rules

**Contributor License Agreement:**

By submitting a pull request, you agree to the terms outlined in the [Contributor License Agreement](LICENSE.md#contributor-license-agreement-cla) section of the license. In summary:

- You grant Benjamin Gröner a license to use your contributions
- You certify that you have the right to submit the contribution
- You acknowledge that Benjamin Gröner retains the right to offer commercial licenses for Qoomb, including your contributions

See the full CLA terms in [LICENSE.md](LICENSE.md#contributor-license-agreement-cla).
