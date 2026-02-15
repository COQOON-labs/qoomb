# Qoomb - Privacy-First Family Organization Platform

A family organization platform with offline-first capabilities, hybrid encryption, and multi-tenant architecture.

## Prerequisites

- **Node.js** 24+ (LTS)
- **pnpm** 10+ (`npm install -g pnpm`)
- **Docker** & **Docker Compose** (for PostgreSQL and Redis)

## Quick Start

### Option 1: Using Makefile (Recommended) ⭐

```bash
# Standard setup (works on all platforms)
make setup

# Start development servers
make dev
```

That's it! Visit:

- **Frontend**: <http://localhost:5173>
- **Backend**: <http://localhost:3001>

**Optional: Extended setup with HTTPS** (for mobile/PWA testing on macOS/Linux):

```bash
make setup-extended
make dev-extended
# Visit: https://qoomb.localhost:8443
```

Extended setup includes:

- ✅ HTTPS with trusted certificates (via mkcert)
- ✅ Local domain (qoomb.localhost)
- ✅ Mobile/PWA testing ready
- ✅ Production-like environment

#### Available Make Commands

```bash
make help          # Show all available commands

# Setup
make setup         # Standard setup (Docker + DB, works everywhere)
make setup-extended # Extended setup with HTTPS (macOS/Linux)

# Development
make dev           # Start on localhost (standard, works everywhere)
make dev-extended  # Start with HTTPS & qoomb.localhost (extended)
make dev-api       # Start only backend API
make dev-web       # Start only frontend

# Docker
make docker-up     # Start PostgreSQL and Redis
make docker-down   # Stop Docker services

# Database
make db-migrate    # Run database migrations
make db-studio     # Open Prisma Studio (DB GUI)

# Utilities
make status        # Check service status
make stop-extended # Stop extended development
make clean         # Clean build artifacts
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

```
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

### Available Commands

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

## Features (Planned)

### Phase 1: Foundation ✅

- [x] Monorepo setup
- [x] Backend foundation (NestJS + tRPC)
- [x] Frontend foundation (React + Vite)
- [x] Database setup (PostgreSQL + Redis)
- [x] Type-safe API layer (tRPC)

### Phase 2: Core Features 🚧

- [ ] Authentication system
- [ ] Multi-tenant routing
- [ ] Events management
- [ ] Tasks management
- [ ] Family members (persons)
- [ ] Basic UI components

### Phase 3: Advanced Features 📋

- [ ] Offline sync engine
- [ ] Conflict resolution
- [ ] Hybrid encryption
- [ ] Semantic search
- [ ] External calendar sync
- [ ] Template system
- [ ] Background workers

### Phase 4: Polish & Deployment 📋

- [ ] Self-hosting Docker image
- [ ] Production deployment
- [ ] Testing suite
- [ ] Documentation
- [ ] Performance optimization

## License

**Qoomb** is licensed under the **[Fair Source License v1.0](LICENSE.md)** with a **20-employee threshold**.

### What does this mean?

✅ **Free to use for:**

- Personal, non-commercial use
- Development, testing, and evaluation
- Small organizations with **< 20 employees**
- Non-profit organizations with < 20 employees
- Educational and research purposes

❌ **Requires commercial license for:**

- Organizations with **≥ 20 employees** using it internally
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
