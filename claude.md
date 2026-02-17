# Qoomb - Technical Context for Claude Code

> **Purpose:** This document provides technical context for AI assistants (Claude Code) to understand and consistently develop the Qoomb project.
>
> **For Human Developers:** See [README.md](README.md) and [docs/](docs/) directory.

---

## Project Essence

**Qoomb** is a **privacy-first SaaS hive organization platform** with:

- **Offline-first architecture** (Notion-style selective sync)
- **Multi-tenant isolation** (shared schema + Row-Level Security)
- **Hybrid encryption** (server-side + optional E2E)
- **SaaS-first** (cloud-agnostic — works on AWS, GCP, Azure, or bare metal; self-hosting as a supported deployment option)

**Core Philosophy:**

- Privacy over convenience where it matters
- SaaS-first, self-hosting as a supported option
- Type-safety everywhere (TypeScript + tRPC + Prisma)
- Security by design, not afterthought
- Simple by default, powerful when needed

---

## Architecture Decisions (Rationale)

### Why Monorepo (Turborepo + pnpm)?

- **Shared types** between frontend/backend (tRPC)
- **Atomic changes** across packages
- **Efficient caching** via Turborepo

### Why NestJS (not Express)?

- **Dependency Injection** (testable, modular)
- **Professional structure** (scales with team)
- **Type-safety** (first-class TypeScript)

### Why tRPC (not REST/GraphQL)?

- **End-to-end type safety** (no schema drift)
- **No code generation** (types flow automatically)
- **Simple** (just TypeScript functions)

### Why Prisma (not raw SQL)?

- **Type-safe queries** (catch bugs at compile-time)
- **Migration management** (version-controlled)
- **Multi-schema support** (critical for multi-tenancy)
- **But:** Use raw SQL for complex queries (see docs/PRISMA_PATTERNS.md)

### Why Shared Schema + Row-Level Security (not per-hive schemas)?

- **SaaS-first** (many small tenants — per-hive schemas don't scale)
- **Simple migrations** (one migration updates all tenants instantly)
- **Connection pooling works** (PgBouncer/pgpool compatible)
- **Easy analytics** (cross-tenant queries for billing, usage, monitoring)
- **RLS enforced at DB level** — even if app logic fails, data stays isolated
- **`app.hive_id` session variable** set by `hiveProcedure` before every handler

### Why Decorator-Based Encryption?

- **Can't forget** (compile-time safety)
- **Implicit** (DRY principle)
- **Explicit** (visible in code)
- **Performance** (only when needed)

### Why CommonJS for NestJS + Node16 for Packages?

- **NestJS + CommonJS:** Mature, stable ecosystem with proven compatibility
- **Packages + Node16:** Modern ESM output for shared libraries
- **Base config + Bundler:** TypeScript 7.0 compatible module resolution
- **Intentional choice:** Not using full ESM yet (NestJS ESM support is newer)
- **Future-proof:** Can migrate to full ESM when ecosystem matures
- **See:** `OPTION_A_IMPLEMENTATION_SUMMARY.md` for details

### Why Fair Source License (not MIT/Apache)?

- **Sustainable Open Source:** Free for individuals and small teams, commercial licensing for enterprises
- **Prevents exploitation:** Large companies can't use it for free without contributing back
- **Contributor Protection:** CLA ensures contributors grant necessary rights while protecting IP
- **Dual Licensing Rights:** Enables offering commercial licenses while keeping code open
- **10-Employee Threshold:** Applies to organizations only; families of any size are explicitly exempt for private non-commercial use
- **See:** `LICENSE.md` and `COMMERCIAL-LICENSE.md` for details

---

## Technology Stack

| Component          | Choice                         | Why                           |
| ------------------ | ------------------------------ | ----------------------------- |
| **Monorepo**       | Turborepo + pnpm               | Shared types, atomic changes  |
| **Backend**        | NestJS + TypeScript            | DI, professional structure    |
| **API**            | tRPC                           | End-to-end type safety        |
| **Frontend**       | React 19 + Vite                | Fast HMR, large ecosystem     |
| **Mobile**         | Capacitor                      | Native iOS/Android wrapper    |
| **PWA**            | vite-plugin-pwa + Workbox      | Offline-first, installable    |
| **Database**       | PostgreSQL 18                  | pgvector, JSONB, RLS          |
| **Cache/Queue**    | Redis 8                        | Session store, pub/sub        |
| **ORM**            | Prisma                         | Type-safe, migrations         |
| **Encryption**     | AES-256-GCM + libsodium        | Server-side + E2E             |
| **Key Management** | Pluggable (Env/File/KMS/Vault) | Flexible, cloud-agnostic      |
| **Code Quality**   | ESLint + Prettier              | Consistent style, type safety |
| **Git Hooks**      | Husky + lint-staged            | Pre-commit/push quality gates |
| **Commit Format**  | Commitlint + Conventional      | Structured commit messages    |
| **CI/CD**          | GitHub Actions                 | Automated testing & security  |
| **License**        | Fair Source v1.0 (10-user)     | Sustainable open source       |

---

## Project Structure

```
qoomb/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # JWT auth, hive registration
│   │   │   │   ├── encryption/     # Key management, @EncryptFields
│   │   │   │   ├── events/         # [TODO] Calendar events
│   │   │   │   ├── tasks/          # [TODO] Task management
│   │   │   │   └── persons/        # [TODO] Hive members
│   │   │   ├── trpc/               # tRPC setup, context, routers
│   │   │   ├── config/             # Env validation, security config
│   │   │   ├── common/             # Guards, interceptors
│   │   │   └── prisma/             # Prisma service (multi-tenant)
│   │   └── prisma/
│   │       ├── schema.prisma       # DB schema (public + template)
│   │       └── migrations/         # Version-controlled migrations
│   │
│   ├── web/                    # React PWA frontend
│   │   ├── public/                 # PWA assets (icons, manifest)
│   │   ├── scripts/                # Build scripts (icon generation)
│   │   └── src/
│   │       ├── components/dev/     # Dev-only debugging panel
│   │       │   ├── DevPanel.tsx    # Main sliding panel
│   │       │   ├── DevPanelTab.tsx # Floating button
│   │       │   └── sections/       # Panel sections
│   │       └── lib/trpc/           # tRPC client
│   │
│   └── mobile/                 # Capacitor mobile wrapper
│       ├── capacitor.config.ts     # iOS/Android configuration
│       ├── ios/                    # [Generated] Xcode project
│       └── android/                # [Generated] Android Studio project
│
├── packages/
│   ├── types/                  # Shared TypeScript types
│   ├── validators/             # Shared Zod schemas + sanitizers
│   ├── ui/                     # Shared React components + hooks
│   │   ├── src/components/         # Button, Input, Card, etc.
│   │   ├── src/hooks/              # useMediaQuery, useOnlineStatus
│   │   └── src/utils/              # cn() class merger
│   └── config/                 # Shared tsconfig
│
├── docs/                       # Documentation for humans
│   ├── SECURITY.md                        # Security architecture
│   ├── JWT_REFRESH_TOKEN_IMPLEMENTATION.md # JWT refresh token guide
│   ├── PERFORMANCE.md                     # Prisma performance guide
│   └── PRISMA_PATTERNS.md                 # When to use Prisma vs raw SQL
│
├── .github/                    # GitHub configuration
│   ├── workflows/                  # CI/CD pipelines
│   │   ├── ci.yml                 # Main CI pipeline
│   │   ├── codeql.yml             # Security scanning (SAST)
│   │   ├── trivy.yml              # Vulnerability & secrets scanning
│   │   └── pr-checks.yml          # PR validation
│   └── dependabot.yml              # Automated dependency updates
│
├── .husky/                     # Git hooks
│   ├── pre-commit                  # Fast checks (Prettier)
│   ├── pre-push                    # Thorough checks (types, tests)
│   └── commit-msg                  # Conventional commits validation
│
├── docker-compose.yml          # PostgreSQL + Redis
├── LICENSE.md                  # Fair Source License v1.0 + CLA
├── COMMERCIAL-LICENSE.md       # Commercial licensing details
├── claude.md                   # This file (for AI)
└── README.md                   # For humans
```

---

## Implementation Status

### ✅ Production-Ready

**Infrastructure:**

- Monorepo (Turborepo + pnpm)
- NestJS backend
- React 19 PWA frontend with vite-plugin-pwa
- Capacitor mobile wrapper (iOS/Android)
- Docker Compose (PostgreSQL 18 + Redis 8)
- Prisma with multi-schema
- Shared UI component library (@qoomb/ui)
- Local development with qoomb.localhost (Caddy + mkcert)

**Security & Auth (PRODUCTION-READY):**

- JWT authentication with refresh tokens (15min access, 7d refresh)
- Token rotation and revocation
- Token blacklisting (Redis-based)
- Shared schema + Row-Level Security (RLS) on all hive-scoped tables
- `app.hive_id` session variable enforced by `hiveProcedure`
- Input validation (Zod) + sanitization
- Rate limiting (Redis-based, distributed)
- Account lockout (exponential backoff)
- Security headers (Helmet.js: CSP, HSTS, etc.)
- Info-leakage prevention (generic errors)
- SQL injection protection (UUID validation)
- Device tracking (IP + User-Agent)
- Audit logging foundation
- **Location:** `apps/api/src/modules/auth/`, `apps/api/src/common/`

**Mobile & PWA (NEW):**

- PWA manifest with app icons
- Service worker with Workbox (offline caching)
- Apple mobile web app support
- Capacitor configuration for iOS/Android
- Native plugins: Push Notifications, Haptics, Splash Screen
- **Location:** `apps/web/`, `apps/mobile/`

**Shared UI Library:**

- Button, Input, Card components
- Responsive hooks (useMediaQuery, useIsMobile, useIsDesktop)
- Offline detection (useOnlineStatus)
- Tailwind class merger utility (cn)
- **Location:** `packages/ui/`

**Developer Experience (DEV MODE ONLY):**

- **Dev Panel:** Sliding debug panel (right side, dev mode only)
  - Mobile Setup: QR codes for certificate & app access
  - Environment Info: URLs, API endpoints, env variables
  - Backend Health: Auto-refreshing health checks
  - Network Status: Online/offline detection, connection type
  - Quick Actions: Cache controls, Prisma Studio, console logs
- **Qoomb Branding:** Yellow/black theme matching project identity
- **Zero Production Impact:** Completely invisible in production builds
- **Location:** `apps/web/src/components/dev/`

**Code Quality & CI/CD (PRODUCTION-READY):**

- **ESLint:** Shared configuration (@qoomb/eslint-config) with strict TypeScript rules
- **Prettier:** Consistent code formatting across monorepo
- **Husky + lint-staged:** Pre-commit hooks (Prettier auto-fix)
- **Pre-push hooks:** Type checking, testing, build validation
- **Commitlint:** Conventional Commits enforcement
- **GitHub Actions CI:** Lint, type-check, test, build
- **CodeQL:** Static Application Security Testing (SAST)
- **Trivy:** Container & dependency vulnerability scanning
- **Dependabot:** Automated dependency updates (grouped by type)
- **3-Layer Defense:** pre-commit (fast) → pre-push (thorough) → CI/CD (complete)
- **Zero ESLint Errors:** All 182 API + 11 UI errors fixed, strict type safety enforced
- **Location:** `.github/workflows/`, `.husky/`, `packages/eslint-config/`

**Licensing (PRODUCTION-READY):**

- **Fair Source License v1.0:** 10-employee threshold for commercial use
- **Contributor License Agreement (CLA):** Protects both contributors and project
- **Dual Licensing:** Free for individuals/small teams, commercial for enterprises
- **Copyright:** Benjamin Gröner (bgroener@coqoon.com)
- **Commercial Options:** Perpetual, Subscription, SaaS/Hosting, OEM licenses
- **Location:** `LICENSE.md`, `COMMERCIAL-LICENSE.md`

**Encryption:**

- Pluggable key providers (Environment, File, AWS KMS, Vault)
- Decorator-based field encryption (`@EncryptFields`, `@DecryptFields`)
- HKDF per-hive key derivation
- AES-256-GCM authenticated encryption
- Startup self-test
- **Location:** `apps/api/src/modules/encryption/`

**Phase 2 (Core Content):**

- Persons module: `me`, `list`, `get`, `updateProfile`, `updateRole`, `remove`, `invite`
  - AES-256-GCM field encryption: `displayName`, `avatarUrl`, `birthdate` (stored as encrypted ISO string)
  - Self-role-change prevention; last-admin removal blocked by DB trigger `enforce_minimum_admin`
  - `invite` sends hive-level invitation email (requires `MEMBERS_INVITE` permission)
  - Reuses `AuthService.inviteMemberToHive()` — checks existing membership, sends token email
- Events module: `list`, `get`, `create`, `update`, `delete`
  - AES-256-GCM field encryption: `title`, `description`, `location`, `url`, `category`
  - `recurrenceRule` stored as opaque JSON — no server-side expansion; client handles display
  - Full 5-stage RBAC guard on `get` / `update` / `delete`
  - `list` uses `buildVisibilityFilter()` for share-aware visibility (role + personal/group shares)
- Tasks module: `list`, `get`, `create`, `update`, `complete`, `delete`
  - AES-256-GCM field encryption: `title`, `description`
  - Tasks can be linked to events via `eventId` — `tasks.create` + `tasks.list` with `eventId`
    enables a to-do list per event (e.g. "what needs to be done before this event starts")
  - Full 5-stage RBAC guard on `get` / `update` / `complete` / `delete`
  - `list` uses `buildVisibilityFilter()` for share-aware visibility (role + personal/group shares)
- Groups module: `list`, `get`, `create`, `update`, `delete`, `addMember`, `removeMember`
  - AES-256-GCM field encryption: `name`, `description`
  - MEMBERS_VIEW for read, MEMBERS_MANAGE for write
  - Duplicate membership prevention (P2002 catch)
  - **Location:** `apps/api/src/modules/groups/`
- RBAC guard infrastructure (`apps/api/src/common/guards/`):
  - `requirePermission` — role check with per-hive DB overrides
  - `requirePermissionOrOwnership` — ANY vs OWN logic
  - `requireResourceAccess` — 5-stage check: shares → private → group → admins → hive/role
  - `buildVisibilityFilter` — Prisma WHERE clause for list queries (avoids N+1)
- **Location:** `apps/api/src/modules/persons/`, `events/`, `tasks/`, `groups/`

### 🚧 TODO (Next)

**Phase 3 (Pages + Files):**

- [ ] Pages module (Tiptap editor, tree hierarchy, version history)
- [ ] Documents module (file upload + envelope encryption)
- [ ] Activity log (change feed / "what changed since last login")

**Phase 4 (Offline + Search):**

- [ ] Client-side SQLite sync (vector clock conflict resolution)
- [ ] Full local search (all non-file content synced to client)
- [ ] E2E encryption option (libsodium)
- [ ] pgvector semantic search (server-side complement)

**Phase 5 (Calendar Integration):**

- [ ] Google Calendar (OAuth + webhook)
- [ ] Apple Calendar (CalDAV)
- [ ] Microsoft Outlook (Graph API)
- [ ] Bidirectional sync + conflict resolution UI

**See:** `docs/CONTENT_ARCHITECTURE.md` for the complete content model, schema sketches, encryption strategy, and phase details.

---

## Development Principles

### 1. Type Safety Everywhere

```typescript
// ✅ GOOD: End-to-end types via tRPC
export const eventsRouter = router({
  create: hiveProcedure.input(createEventSchema).mutation(...)
});

// ❌ BAD: Untyped or `any`
async createEvent(data: any) { ... }
```

### 2. Explicit over Implicit (except where safety benefits)

```typescript
// ✅ GOOD: Explicit config (no hidden defaults)
if (!process.env.KEY_PROVIDER) {
  throw new Error('KEY_PROVIDER must be set explicitly');
}

// ✅ GOOD: Implicit where it prevents errors
@EncryptFields(['sensitiveField'])  // Can't forget!
async create() { ... }
```

### 3. Multi-Tenant Always

```typescript
// ✅ GOOD: Always use hiveProcedure for hive-specific ops
export const eventsRouter = router({
  create: hiveProcedure.mutation(async ({ ctx, input }) => {
    // ctx.prisma already has hive schema set
  })
});

// ❌ BAD: Forgetting hive context
export const eventsRouter = router({
  create: protectedProcedure.mutation(...)  // Missing hive schema!
});
```

### 4. Security by Design

```typescript
// ✅ GOOD: Validate, sanitize, then process
const data = createEventSchema.parse(input);  // Zod validation
const sanitized = sanitizeHtml(data.description);

// ✅ GOOD: Use decorators for encryption
@EncryptFields(['sensitiveData'])
async create() { ... }

// ❌ BAD: Manual encryption (easy to forget)
const encrypted = await encryptionService.encrypt(...);
```

### 5. Fail-Safe over Fail-Open

```typescript
// ✅ GOOD: Explicit required config
KEY_PROVIDER = environment; // Must be set, no default

// ✅ GOOD: RLS as defense-in-depth
// Even if app logic fails, RLS prevents data leaks

// ❌ BAD: Default to insecure
const keyProvider = process.env.KEY_PROVIDER || 'environment';
```

### 6. SOLID Principles (Critical)

These principles apply to **all code** in the project - backend, frontend, scripts, configuration.

#### Single Responsibility Principle (SRP)

**One module = one reason to change**

```typescript
// ✅ GOOD: Separate concerns
class UserRepository {
  findById(id: string) { ... }  // Only DB access
}

class UserService {
  validateUser(user: User) { ... }  // Only business logic
}

// ❌ BAD: Mixed concerns
class UserService {
  findById(id: string) { ... }       // DB access
  validateUser(user: User) { ... }  // Business logic
  sendEmail(user: User) { ... }     // Email sending
}
```

**In Makefile:**

```makefile
# ✅ GOOD: Atomic, reusable commands
_docker-volumes-remove:  # Does ONE thing
    docker-compose down -v

docker-clean:  # Adds UI layer
    [confirmation] + $(MAKE) _docker-volumes-remove

# ❌ BAD: Duplicate logic
docker-clean:
    docker-compose down -v

db-reset:
    docker-compose down -v  # Duplication!
```

#### Open/Closed Principle (OCP)

**Open for extension, closed for modification**

```typescript
// ✅ GOOD: Extensible via abstraction
interface KeyProvider {
  getKey(): Promise<string>;
}

class EnvironmentKeyProvider implements KeyProvider { ... }
class VaultKeyProvider implements KeyProvider { ... }
// Add new providers WITHOUT modifying existing code

// ❌ BAD: Requires modification to extend
function getKey(type: string) {
  if (type === 'env') { ... }
  else if (type === 'vault') { ... }
  // Must modify this function to add new types
}
```

#### Liskov Substitution Principle (LSP)

**Subtypes must be substitutable for base types**

```typescript
// ✅ GOOD: All implementations work the same
const keyProvider: KeyProvider = getKeyProvider(config.KEY_PROVIDER);
const key = await keyProvider.getKey(); // Works for ANY provider

// ❌ BAD: Subtype changes behavior
class BrokenKeyProvider implements KeyProvider {
  getKey() {
    throw new Error('Not implemented');
  } // Breaks contract!
}
```

#### Interface Segregation Principle (ISP)

**Don't force clients to depend on unused methods**

```typescript
// ✅ GOOD: Small, focused interfaces
interface Encryptable {
  encrypt(data: string): string;
}

interface Decryptable {
  decrypt(data: string): string;
}

// ❌ BAD: Fat interface
interface CryptoService {
  encrypt(data: string): string;
  decrypt(data: string): string;
  hash(data: string): string;
  sign(data: string): string;
  verify(data: string): boolean;
  // Not all clients need all methods!
}
```

#### Dependency Inversion Principle (DIP)

**Depend on abstractions, not concretions**

```typescript
// ✅ GOOD: Depend on interface
class UserService {
  constructor(private keyProvider: KeyProvider) {} // Abstraction
}

// ❌ BAD: Depend on concrete class
class UserService {
  constructor(private keyProvider: EnvironmentKeyProvider) {} // Concrete
}
```

### 7. Clean Code Principles (Critical)

#### Don't Repeat Yourself (DRY)

**Every piece of knowledge must have a single, unambiguous representation**

```typescript
// ✅ GOOD: Extract common logic
function validateEmail(email: string): boolean {
  return emailSchema.parse(email);
}

// Use everywhere
validateEmail(user.email);
validateEmail(input.email);

// ❌ BAD: Duplicate validation
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(user.email)) { ... }  // Duplicated
if (!emailRegex.test(input.email)) { ... }  // Duplicated
```

**In Makefile:**

```makefile
# ✅ GOOD: DRY
_docker-volumes-remove:
    docker-compose down -v

docker-clean: $(MAKE) _docker-volumes-remove
db-reset: $(MAKE) _docker-volumes-remove

# ❌ BAD: Duplication
docker-clean:
    docker-compose down -v  # Repeated

db-reset:
    docker-compose down -v  # Repeated
```

#### Keep It Simple, Stupid (KISS)

**Simplicity should be a key goal**

```typescript
// ✅ GOOD: Simple and clear
function isAdmin(user: User): boolean {
  return user.role === 'admin';
}

// ❌ BAD: Over-engineered
function isAdmin(user: User): boolean {
  const roleHierarchy = ['user', 'moderator', 'admin'];
  const adminLevel = roleHierarchy.indexOf('admin');
  const userLevel = roleHierarchy.indexOf(user.role);
  return userLevel >= adminLevel;
}
```

#### You Aren't Gonna Need It (YAGNI)

**Don't add functionality until it's necessary**

```typescript
// ✅ GOOD: Only implement what's needed NOW
class User {
  id: string;
  email: string;
  hiveId: string;
}

// ❌ BAD: Premature optimization/features
class User {
  id: string;
  email: string;
  hiveId: string;
  preferences?: UserPreferences; // Not needed yet
  socialLinks?: SocialLinks[]; // Not needed yet
  futureFeatureFlag?: boolean; // Not needed yet
}
```

#### Composition over Inheritance

**Prefer composing objects over class hierarchies**

```typescript
// ✅ GOOD: Composition
class AuthService {
  constructor(
    private userRepo: UserRepository,
    private tokenService: TokenService,
    private encryptionService: EncryptionService
  ) {}
}

// ❌ BAD: Deep inheritance
class BaseService extends LoggingService
  extends CacheService
  extends MetricsService { }
```

#### Separation of Concerns (SoC)

**Different concerns should be in different modules**

```
✅ GOOD Structure:
apps/api/src/
├── modules/
│   ├── auth/           # Authentication concern
│   ├── encryption/     # Encryption concern
│   └── events/         # Events concern
├── common/             # Shared utilities
└── config/             # Configuration

❌ BAD Structure:
apps/api/src/
└── services/
    └── user-service.ts  # Auth + Encryption + Events mixed!
```

---

## Key Code Patterns

### Pattern: Multi-Tenant tRPC Procedure

```typescript
// Use hiveProcedure for all hive-specific operations
export const eventsRouter = router({
  create: hiveProcedure.input(createEventSchema).mutation(async ({ ctx, input }) => {
    // ctx.prisma has hive schema already set
    // ctx.user has { id, hiveId, personId }

    return ctx.prisma.event.create({
      data: { ...input, created_by: ctx.user.personId },
    });
  }),
});
```

### Pattern: Decorator-Based Encryption

```typescript
@Injectable()
export class EventsService {
  // @EncryptFields: encrypts the named fields in the INPUT argument before
  // the method executes — the method receives (and stores) encrypted data.
  @EncryptFields(['title', 'description'])
  async createEvent(data: CreateEventInput, hiveId: string) {
    return this.prisma.event.create({ data });
    // data.title and data.description are encrypted in-place before prisma call
  }

  // @DecryptFields: decrypts the named fields in the RETURN VALUE after the
  // method executes — the caller receives plaintext.
  @DecryptFields(['title', 'description'])
  async getEvent(id: string, hiveId: string) {
    return this.prisma.event.findUnique({ where: { id } });
    // returned title & description are automatically decrypted
  }

  // Works with arrays automatically
  @DecryptFields(['title', 'description'])
  async listEvents(hiveId: string) {
    return this.prisma.event.findMany();
  }
}
```

### Pattern: Schema-Safe Raw SQL

```typescript
// When Prisma is insufficient, use raw SQL safely
async complexQuery(hiveId: string) {
  // 1. Set hive schema context
  await this.prisma.setHiveSchema(hiveId);

  // 2. Use parameterized queries (NEVER interpolate!)
  const result = await this.prisma.$queryRawUnsafe(`
    SELECT * FROM events WHERE id = $1
  `, eventId);  // ✅ Parameterized

  // ❌ NEVER: `SELECT * FROM events WHERE id = '${eventId}'`

  return result;
}
```

### Pattern: Validation & Sanitization

```typescript
// 1. Zod validation at API boundary
const createEventSchema = z.object({
  title: z.string().trim().max(500),
  description: z.string().trim().max(10000),
});

// 2. Additional sanitization if needed
import { sanitizeHtml } from '@qoomb/validators';

async create(input: CreateEventInput) {
  const validated = createEventSchema.parse(input);
  const sanitized = {
    ...validated,
    description: sanitizeHtml(validated.description)
  };
  return this.prisma.event.create({ data: sanitized });
}
```

---

## RBAC & Resource Permission Architecture

### Roles

**Family Hive** (minimum 1 `parent` required, enforced by DB trigger `enforce_minimum_admin`)
| Role | Permissions |
| -------- | ----------------------------------------------------------------------------------------------- |
| `parent` | Everything |
| `child` | members:view, events:view/create/update:own/delete:own, tasks:view/create/update:own/delete:own |

**Organization Hive** (minimum 1 `org_admin` required)
| Role | Permissions |
| ----------- | ------------------------------------------------------------------------- |
| `org_admin` | Everything |
| `manager` | events:_, tasks:_, members:view/invite/remove |
| `member` | members:view, events:view/create/update:own, tasks:view/create/update:own |
| `guest` | members:view, events:view, tasks:view |

Global defaults defined in `packages/types/src/permissions.ts`. Per-hive overrides stored in `hive_role_permissions` table.

### Resource Permission Resolution (5-stage check)

```
Stage 1: Load PersonShare + GroupShares in parallel
   → effectiveShareLevel = max(0, personal share, all group shares)

Stage 2: visibility = 'private'
   → creator OR effectiveShareLevel >= required → allow
   → else FORBIDDEN (no admin bypass)

Stage 3: visibility = 'group'
   → creator OR (group member + VIEW action) OR effectiveShareLevel >= required
   → else FORBIDDEN (admins must join the group — auditable)

Stage 4: visibility = 'admins'
   → effectiveShareLevel >= required → allow (share exception)
   → not admin role → FORBIDDEN
   → admin confirmed → fall through to Stage 5

Stage 5: visibility = 'hive' or 'admins' (admin confirmed)
   → effectiveShareLevel >= required → allow (additive elevation)
   → role-based check with DB overrides (ANY permission, or OWN + creator)
   → else FORBIDDEN
```

### Resource Visibility Values

Each resource (event, task, note, …) carries a `visibility` field:

- `'hive'` — all hive members with the relevant role permission (default)
- `'admins'` — admin roles only (`parent` / `org_admin`); shares can grant exceptions
- `'group'` — members of the resource's group only; requires `groupId` on the resource
- `'private'` — creator only; no admin bypass; only creator can create shares for it

### AccessLevel (ordinal share grants)

`PersonShare` and `GroupShare` use `accessLevel: Int` instead of boolean flags:

- `VIEW (1)` — can read
- `EDIT (2)` — can read + edit
- `MANAGE (3)` — can read + edit + delete + manage shares for this resource

Higher levels imply lower: `MANAGE >= EDIT >= VIEW`.

### DB Tables

- `hive_role_permissions` — per-hive role permission overrides (currently empty, UI TBD)
- `hive_groups` — group definitions (id, hiveId, name)
- `hive_group_members` — group membership + audit (personId, groupId, addedByPersonId)
- `person_shares` — per-person explicit grants (`accessLevel: 1|2|3`)
- `group_shares` — per-group explicit grants (`accessLevel: 1|2|3`)

**See:** `docs/PERMISSIONS.md` for the full architecture, algorithm, and guard API.

---

## Security Architecture (Critical for LLMs to understand)

### Multi-Tenant Isolation (Defense-in-Depth)

```
Layer 1: JWT Authentication
    ↓
Layer 2: Authorization Middleware (hiveProcedure)
    ↓
Layer 3: RLS Session Context (SET app.hive_id = '<uuid>')
    ↓
Layer 4: Row-Level Security (RLS policy on every hive-scoped table)
    ↓
Layer 5: Audit Logging
```

**Key Point:** Each layer is independent. If one fails, others still protect.

### Encryption Architecture

```
Master Key (from KEY_PROVIDER)
    ↓ HKDF (deterministic derivation)
Hive-Specific Keys (one per hive, 32 bytes)
    ↓ AES-256-GCM (authenticated encryption)
Encrypted Data (IV + AuthTag + Ciphertext)
```

**Key Decisions:**

- **Per-hive keys:** Compromise of one hive ≠ all hives
- **HKDF:** Deterministic, no storage needed
- **AES-256-GCM:** Authenticated (prevents tampering)
- **Pluggable providers:** Cloud-agnostic

### Key Provider Strategy

| Provider        | Production Use            | Why                             |
| --------------- | ------------------------- | ------------------------------- |
| **Environment** | ✅ Most deployments       | Simple, Docker-friendly         |
| **File**        | ✅ Advanced self-hosting  | Key rotation, separate from env |
| **AWS KMS**     | ✅ Enterprise AWS         | Compliance, auto-rotation       |
| **Vault**       | ✅ Enterprise self-hosted | No cloud, centralized secrets   |

**Critical:** NO DEFAULT! Must be explicitly set. Prevents accidental production misconfig.

---

## When to Use What

### When to use Prisma vs Raw SQL?

**Use Prisma for:**

- Simple CRUD operations
- Type-safe queries
- Relationships with includes/joins

**Use Raw SQL for:**

- Complex aggregations
- Window functions
- Full-text search
- Performance-critical queries

**See:** `docs/PRISMA_PATTERNS.md` for details.

### When to encrypt fields?

**Encrypt (server-side):**

- Personal notes, descriptions
- Private event details
- Sensitive task information

**Don't encrypt:**

- Titles (needed for search)
- Public metadata
- Timestamps, IDs

**Future E2E:**

- Ultra-sensitive documents
- Medical/financial data
- When user explicitly opts in

### When to use which tRPC procedure?

```typescript
publicProcedure; // Unauth: login, register
protectedProcedure; // Auth but no hive: user profile
hiveProcedure; // Auth + hive: events, tasks, persons (MOST COMMON)
```

---

## Common Pitfalls (for LLMs to avoid)

### ❌ DON'T: Forget hive context

```typescript
// BAD: Using protectedProcedure for hive data
export const eventsRouter = router({
  create: protectedProcedure.mutation(...)  // Missing hive schema!
});
```

### ✅ DO: Always use hiveProcedure

```typescript
export const eventsRouter = router({
  create: hiveProcedure.mutation(...)  // Correct!
});
```

### ❌ DON'T: Manual encryption (easy to forget)

```typescript
// BAD: Manual encryption — easy to forget, no compile-time safety
const encrypted = encryptionService.serializeToStorage(
  encryptionService.encrypt(data.title, hiveId)
);
await prisma.event.create({ data: { title: encrypted } });
```

### ✅ DO: Use decorators

```typescript
// GOOD: @EncryptFields encrypts INPUT fields before the method stores them.
// @DecryptFields decrypts RETURN VALUE fields after the method loads them.
@EncryptFields(['title'])
async createEvent(data: CreateEventInput, hiveId: string) {
  return prisma.event.create({ data }); // data.title is already encrypted
}
```

### ❌ DON'T: SQL injection via string interpolation

```typescript
// DANGEROUS!
await prisma.$queryRawUnsafe(`SELECT * FROM events WHERE id = '${eventId}'`);
```

### ✅ DO: Parameterized queries

```typescript
// SAFE
await prisma.$queryRawUnsafe(`SELECT * FROM events WHERE id = $1`, eventId);
```

### ❌ DON'T: Use `any` types

```typescript
// BAD
async createEvent(data: any) { ... }
```

### ✅ DO: Use Zod schemas

```typescript
// GOOD
async createEvent(data: CreateEventInput) {
  const validated = createEventSchema.parse(data);
  ...
}
```

### ❌ DON'T: Log user-controlled input directly (Log Injection / CWE-117)

```typescript
// BAD: request.url could contain \r\n to forge log lines
console.warn(`[RATE_LIMIT] Throttled request to ${request.url}`);
```

### ✅ DO: Strip newlines from user-controlled values before logging

```typescript
// GOOD: newlines removed → no fake log entries possible
const url = request.url.replace(/[\r\n]/g, '');
console.warn(`[RATE_LIMIT] Throttled request to ${url}`);
```

**Rule:** Any value from `request.url`, `request.headers`, query params, or body that is interpolated into a log string must have `\r\n` stripped first.

### ❌ DON'T: Use unbounded negated character classes in regex on user input (ReDoS / CWE-1333)

```typescript
// BAD: [^>]* can match < which causes polynomial backtracking
input.replace(/<[^>]*>/g, '');
```

### ✅ DO: Bound negated classes to exclude all ambiguous delimiters

```typescript
// GOOD: [^<>]* cannot match either delimiter → O(n) guaranteed
input.replace(/<[^<>]*>/g, '');
```

**Rule:** In `[^X]*` patterns applied to untrusted input, exclude ALL characters that could start a new match — not just the closing delimiter.

### ❌ DON'T: Assume a single-pass sanitization removes all dangerous patterns

```typescript
// BAD: <sc<script>ript> → after one pass → <script> (reconstructed!)
input.replace(/<[^<>]*>/g, '');
```

### ✅ DO: Run tag removal twice + encode remaining special characters

```typescript
// GOOD: two passes + encoding — see sanitizeHtml() in @qoomb/validators
input
  .replace(/<[^<>]*>/g, '') // Pass 1
  .replace(/<[^<>]*>/g, '') // Pass 2: catches reconstructed tags
  .replace(/</g, '&lt;') // Encode any remaining < (final safety net)
  .replace(/>/g, '&gt;');
```

**Use the existing `sanitizeHtml()` utility from `@qoomb/validators` instead of rolling your own.**

---

## Environment Configuration

**Critical Environment Variables:**

```bash
# REQUIRED (no defaults!)
KEY_PROVIDER=environment  # environment|file|aws-kms|vault
ENCRYPTION_KEY=<base64>   # Generate: openssl rand -base64 32
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<32+ chars>    # Generate: openssl rand -base64 32
```

**See:** `.env.example` for complete configuration.

---

## Documentation Structure

```text
README.md              → Human onboarding
claude.md              → This file (AI context)
docs/
  ├── SECURITY.md          → Security architecture details
  ├── PERFORMANCE.md       → Prisma performance guide
  ├── PRISMA_PATTERNS.md   → When to use Prisma vs SQL
  └── LOCAL_DEVELOPMENT.md → qoomb.localhost setup for mobile/PWA testing

apps/api/src/modules/encryption/
  ├── README.md        → Encryption quick start
  └── examples/        → Example usage
```

---

## Notes for LLMs

### Critical Rules (MUST Follow)

1. **Always use `hiveProcedure`** for hive-specific operations
2. **Always use `@EncryptFields` / `@DecryptFields`** for sensitive data (`@EncryptFields` encrypts INPUT args; `@DecryptFields` decrypts RETURN values)
3. **Always validate with Zod** at API boundaries
4. **Always use parameterized queries** (never string interpolation)
5. **Always consider multi-tenant** context (which hive?)
6. **Never create default configs** for security-critical settings
7. **Never use `any`** types (use proper TypeScript/Zod)
8. **Never bypass ESLint rules** without explicit disable comments + explanation
9. **Prefer Prisma** for CRUD, **raw SQL** for complex queries
10. **Follow existing patterns** (see Key Code Patterns section)
11. **Document architectural decisions** in this file

### Code Quality Standards

- **All code MUST pass ESLint** with zero errors (warnings acceptable only with justification)
- **All code MUST be formatted** with Prettier before commit
- **All commits MUST follow** Conventional Commits format (feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert)
- **NEVER add `Co-Authored-By:` trailers** to commit messages — not for Claude, not for any AI tool
- **Type safety is mandatory** - no implicit `any`, proper type annotations for all Prisma queries
- **Pre-commit hooks will auto-fix** Prettier issues, but ESLint errors must be fixed manually
- **Pre-push hooks will block** if type-check, tests, or build fails

### Versioning Policy (CRITICAL)

**⚠️ Version numbers are ONLY changed for actual releases, not for incremental development!**

- **Current Version:** `0.1.0` (defined in `apps/web/src/App.tsx` as `APP_VERSION`)
- **Single Source of Truth:** `apps/web/src/App.tsx` exports `APP_VERSION`
- **Semantic Versioning:** `MAJOR.MINOR.PATCH` (following semver.org)

**When to bump versions:**

- **0.1.0 → 0.2.0:** Phase 2 complete (Auth, Events, Tasks, Persons production-ready)
- **0.2.0 → 0.3.0:** Phase 3 complete (Offline sync, E2E encryption, semantic search)
- **0.x.0 → 1.0.0:** First production release (all core features stable)
- **PATCH (0.1.x):** Critical bugfixes only, no new features

**When NOT to bump:**

- ❌ Adding dev tools (e.g., dev panel, debug utilities)
- ❌ Refactoring code without user-visible changes
- ❌ Improving documentation
- ❌ Internal optimizations
- ❌ Infrastructure changes (CI/CD, build config)
- ❌ Work-in-progress features

**Version changes require:**

1. **Explicit user approval** - Never change version without asking
2. Update `apps/web/src/App.tsx` (`APP_VERSION` constant)
3. Update `claude.md` (this file, at bottom)
4. Update `README.md` if version is mentioned
5. Git commit: `chore: bump version to X.Y.Z`

**LLM Instruction:** NEVER increment version numbers autonomously. Always keep `APP_VERSION = '0.1.0'` unless explicitly instructed by user for a release.

### Licensing & Contributions

- **Copyright:** Benjamin Gröner (all new code contributions)
- **License:** Fair Source v1.0 (10-employee threshold) - see LICENSE.md
- **Contributors must agree** to CLA when submitting code
- **Commercial licensing** available for enterprises (≥10 employees, SaaS, OEM)
- **Never modify license files** without explicit user request

**When adding new features:**

- Create module in `apps/api/src/modules/`
- Create tRPC router with `hiveProcedure`
- Add Zod schemas in `packages/validators`
- Use `@EncryptFields` for sensitive data
- Add to Implementation Status section in this file

---

**Last Updated:** 2026-02-10
**Version:** 0.1.0 (Phase 1 - Foundation with PWA, Mobile, Dev Tools)
