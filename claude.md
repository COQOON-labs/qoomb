# Qoomb - Family Organization Platform

## Project Overview

Qoomb is a privacy-first, Notion-inspired family organization platform designed to help families manage events, tasks, and daily coordination with offline-first capabilities and hybrid encryption.

## Architecture Decisions

### Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Monorepo** | Turborepo + pnpm | Efficient workspace management, shared dependencies |
| **Backend** | NestJS + TypeScript | Professional structure, type-safety, dependency injection |
| **API Layer** | tRPC | End-to-end type safety, no schema sync needed |
| **Frontend** | React 18 + Vite | Fast HMR, modern tooling, large ecosystem |
| **Database** | PostgreSQL 16 | pgvector support, JSONB, multi-schema isolation |
| **Cache/Queue** | Redis 7 | Session store, pub/sub, job queue |
| **ORM** | Prisma | Type-safe queries, migration management |
| **Offline Storage** | SQLite (client-side) | Offline-first, sync with server |
| **Encryption** | Hybrid (AES-256-GCM + libsodium) | Balance between features and privacy |

### Key Features

- **Offline-First**: Notion-style "Offline Forest" for selective sync
- **Multi-Tenant**: Per-family PostgreSQL schemas for data isolation
- **Hybrid Encryption**: Server-side for searchable data, E2E for sensitive content
- **Real-time Sync**: Vector clock-based conflict resolution
- **Semantic Search**: pgvector for AI-powered search
- **Pluggable AI**: Support for OpenAI, Anthropic, Ollama, or none

## Project Structure

```
qoomb/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/      # Authentication & authorization
│   │   │   │   ├── events/    # Calendar events
│   │   │   │   ├── tasks/     # Task management
│   │   │   │   ├── persons/   # Family members
│   │   │   │   ├── sync/      # Sync engine
│   │   │   │   └── encryption/ # Encryption service
│   │   │   ├── trpc/          # tRPC router setup
│   │   │   ├── config/        # Configuration
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                    # React frontend (PWA)
│       ├── src/
│       │   ├── components/    # React components
│       │   ├── pages/         # Page components
│       │   ├── hooks/         # Custom React hooks
│       │   ├── lib/
│       │   │   ├── trpc/      # tRPC client setup
│       │   │   ├── db/        # SQLite local DB
│       │   │   └── sync/      # Sync engine
│       │   ├── workers/       # Service worker
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   ├── types/                  # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── entities/      # Entity types (Event, Task, Person)
│   │   │   ├── api/           # API request/response types
│   │   │   └── sync/          # Sync-related types
│   │   └── package.json
│   │
│   ├── validators/             # Shared Zod validators
│   │   ├── src/
│   │   │   └── schemas/
│   │   └── package.json
│   │
│   └── config/                 # Shared configuration
│       └── tsconfig/           # Base TypeScript configs
│
├── docker/
│   ├── postgres/
│   │   └── init.sql           # Initial DB setup
│   └── redis/
│       └── redis.conf
│
├── docker-compose.yml          # Development environment
├── docker-compose.prod.yml     # Production (self-hosting)
├── turbo.json                  # Turborepo configuration
├── pnpm-workspace.yaml         # pnpm workspace config
├── package.json                # Root package.json
├── .env.example
└── README.md
```

## Setup Progress

### Phase 1: Foundation ✅ (COMPLETED)

- [x] Initialize monorepo with Turborepo and pnpm workspaces
- [x] Set up NestJS backend with basic module structure
- [x] Set up React frontend with Vite and TypeScript
- [x] Create shared types package (types + validators)
- [x] Configure Docker Compose for PostgreSQL and Redis
- [x] Set up Prisma with initial schema
- [x] Configure tRPC routers (basic health check)
- [x] Environment configuration and .env templates
- [x] Created README.md with setup instructions

### Phase 2: Core Features (Next)

- [ ] Authentication system (JWT + session)
- [ ] Multi-tenant middleware (per-family schema routing)
- [ ] Events module (CRUD + recurrence rules)
- [ ] Tasks module (CRUD + assignees)
- [ ] Persons module (family members + roles)
- [ ] Basic React UI for events/tasks
- [ ] tRPC integration between frontend/backend

### Phase 3: Advanced Features (Later)

- [ ] Sync engine (vector clock, conflict resolution)
- [ ] Offline storage (SQLite client-side)
- [ ] Service worker for PWA
- [ ] Encryption service (hybrid mode)
- [ ] Semantic search (pgvector + embeddings)
- [ ] External calendar sync (Google, Apple)
- [ ] Template system
- [ ] Background workers (BullMQ)

### Phase 4: Polish & Deployment

- [ ] Self-hosting Docker image (all-in-one)
- [ ] Production Docker Compose files
- [ ] Documentation
- [ ] Testing (unit + E2E)
- [ ] Performance optimization
- [ ] Security audit

## Database Schema

### Core Tables (per family schema)

```sql
-- Public schema (shared)
CREATE TABLE families (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  family_id UUID REFERENCES families(id),
  person_id UUID, -- Links to person in family schema
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-family schema (e.g., family_<uuid>)
CREATE TABLE persons (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  birthdate DATE,
  age_group VARCHAR(20),
  permission_level INT DEFAULT 0,
  public_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1
);

CREATE TABLE events (
  id UUID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(50) DEFAULT 'Europe/Berlin',
  recurrence_rule TEXT,
  participants UUID[],
  organizer_id UUID REFERENCES persons(id),
  location VARCHAR(500),
  encryption_mode VARCHAR(20) DEFAULT 'server_side',
  encrypted_data BYTEA,
  embedding vector(1536),
  created_by UUID REFERENCES persons(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES persons(id),
  status VARCHAR(20) DEFAULT 'todo',
  due_date TIMESTAMPTZ,
  priority INT DEFAULT 0,
  encryption_mode VARCHAR(20) DEFAULT 'server_side',
  encrypted_data BYTEA,
  embedding vector(1536),
  created_by UUID REFERENCES persons(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INT NOT NULL DEFAULT 1
);
```

## Development Workflow

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)
- Redis 7 (via Docker)
- Make (optional, but recommended)

### Quick Setup (Using Makefile)

The project includes a comprehensive Makefile that simplifies common tasks:

```bash
# Complete initial setup (one command!)
make setup

# Start development servers
make dev

# View all available commands
make help
```

**Common Make Commands:**

| Command            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `make setup`       | Complete initial setup (install + docker + database)  |
| `make dev`         | Start both frontend and backend                       |
| `make dev-api`     | Start only the backend                                |
| `make dev-web`     | Start only the frontend                               |
| `make docker-up`   | Start PostgreSQL and Redis                            |
| `make docker-down` | Stop Docker services                                  |
| `make db-migrate`  | Run database migrations                               |
| `make db-studio`   | Open Prisma Studio (DB GUI)                           |
| `make status`      | Check status of all services                          |
| `make clean`       | Clean build artifacts                                 |
| `make fresh`       | Complete fresh start (clean + setup)                  |

### Manual Setup Commands

If you prefer not to use Make:

```bash
# Install dependencies
pnpm install

# Start development services (Postgres, Redis)
docker-compose up -d

# Run database migrations
pnpm --filter @qoomb/api db:migrate

# Start development servers
pnpm dev

# Backend: http://localhost:3001
# Frontend: http://localhost:5173
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://qoomb:password@localhost:5432/qoomb"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# Encryption
ENCRYPTION_KEY="base64-encoded-key"

# AI (optional)
AI_PROVIDER="openai" # openai | anthropic | ollama | disabled
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
OLLAMA_BASE_URL="http://localhost:11434"
```

## API Structure (tRPC)

### Router Organization

```typescript
// apps/api/src/trpc/router.ts
export const appRouter = router({
  auth: authRouter,      // login, register, logout
  events: eventsRouter,  // CRUD for events
  tasks: tasksRouter,    // CRUD for tasks
  persons: personsRouter, // CRUD for persons
  sync: syncRouter,      // Sync operations
  search: searchRouter,  // Semantic search
});

export type AppRouter = typeof appRouter;
```

### Example Router

```typescript
// apps/api/src/modules/events/events.router.ts
export const eventsRouter = router({
  list: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.event.findMany({
        where: {
          start_time: { gte: input.startDate },
          end_time: { lte: input.endDate },
        },
      });
    }),

  create: protectedProcedure
    .input(createEventSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.event.create({
        data: {
          ...input,
          created_by: ctx.user.personId,
        },
      });
    }),
});
```

## Security Considerations

### Authentication Flow

1. User registers with email/password
2. Server creates user account + generates JWT
3. JWT contains: userId, familyId, personId
4. All API calls validate JWT and set family schema context

### Encryption Strategy

- **Server-Side (default)**: Events, tasks, persons
  - Searchable on server
  - AI features available
  - Encrypted at rest with AES-256-GCM

- **End-to-End (opt-in)**: Sensitive documents, private notes
  - Client-side encryption with libsodium
  - Server cannot read content
  - No search/AI on encrypted content

### Multi-Tenant Isolation

- Each family gets dedicated PostgreSQL schema
- Middleware sets `search_path` based on JWT familyId
- Row-level security (RLS) as additional safety layer
- No cross-family data leakage possible

## Next Steps

1. **Start with Phase 1**: Get basic monorepo + backend + frontend running
2. **Add authentication**: Simple email/password auth with JWT
3. **Implement first feature**: Event CRUD operations
4. **Build basic UI**: Calendar view for events
5. **Add sync gradually**: Start with simple polling, evolve to WebSocket + vector clock

## Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [tRPC Documentation](https://trpc.io/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Vite Documentation](https://vitejs.dev/)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [pgvector Documentation](https://github.com/pgvector/pgvector)

## Notes

- Focus on **self-hosting first**, SaaS mode can come later
- Keep **AI optional** - core features must work without it
- **Offline-first** is complex - start with online-only, add offline incrementally
- **Don't over-engineer** - build what's needed, refactor when necessary
- **Type safety everywhere** - leverage TypeScript + tRPC + Prisma for full stack type safety
