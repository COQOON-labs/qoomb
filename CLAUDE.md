# Qoomb - Development Guidelines

## JSON Files

- **No comments in `.json` files.** JSON does not support comments (`//` or `/* */`). Do not add comments to any `.json` file, including `tsconfig.json`, `package.json`, and all other JSON configuration files. This is enforced by `eslint-plugin-jsonc` with the `jsonc/no-comments` rule.
- If you need to explain a JSON setting, use a `README.md` next to it, a commit message, or inline documentation in code that references the config.
- Run `pnpm lint:json` to check all JSON files for comments.

## Linting

- TypeScript/TSX: `pnpm lint` (runs ESLint via turbo across all packages)
- JSON: `pnpm lint:json` (runs `jsonc/no-comments` rule on all JSON files)
- Formatting: `pnpm format` (Prettier on ts, tsx, md, json files)
- Pre-commit hooks run both Prettier and JSON linting on staged files via lint-staged.

## Project Structure

```text
qoomb/
├── apps/
│   ├── api/                    # NestJS backend (Fastify adapter)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # JWT auth, PassKey/WebAuthn, registration
│   │   │   │   ├── encryption/     # Key management, @EncryptFields
│   │   │   │   ├── email/          # i18n emails (DE/EN), 3 transports
│   │   │   │   ├── events/         # Calendar events (CRUD, RBAC, encrypted)
│   │   │   │   ├── tasks/          # Task management (CRUD, RBAC, encrypted)
│   │   │   │   ├── persons/        # Hive members (CRUD, RBAC, encrypted)
│   │   │   │   ├── groups/         # Groups + membership management
│   │   │   │   └── sync/           # [Phase 4] Offline sync (empty)
│   │   │   ├── trpc/               # tRPC setup, context, routers
│   │   │   ├── i18n/               # typesafe-i18n (DE/EN locales)
│   │   │   ├── config/             # Env validation, security config
│   │   │   ├── common/             # Guards, interceptors, services
│   │   │   └── prisma/             # Prisma service (multi-tenant)
│   │   └── prisma/
│   │       ├── schema.prisma       # DB schema (public + template)
│   │       └── migrations/         # Version-controlled migrations
│   │
│   ├── web/                    # React 19 PWA frontend
│   │   ├── public/                 # PWA assets (icons, manifest)
│   │   ├── scripts/                # Build scripts (icon generation)
│   │   └── src/
│   │       ├── pages/              # Route pages (Login, Register, Dashboard, …)
│   │       ├── layouts/            # AuthLayout (shared auth page layout)
│   │       ├── components/
│   │       │   ├── auth/           # AuthGuard, PassKeyButton, PassKeyManager
│   │       │   ├── layout/         # HiveSwitcher, EmailVerificationBanner
│   │       │   └── dev/            # Dev-only debugging panel (5 sections)
│   │       ├── lib/
│   │       │   ├── auth/           # AuthContext, tokenStore, authStorage
│   │       │   └── trpc/           # tRPC client (splitLink, CSRF, Bearer)
│   │       ├── hooks/              # App-specific hooks (useCurrentPerson — ADR-0002)
│   │       └── styles/             # Tailwind v4 theme + CSS custom properties
│   │
│   └── mobile/                 # Capacitor mobile wrapper
│       └── capacitor.config.ts     # iOS/Android configuration (dirs generated on demand)
│
├── packages/
│   ├── types/                  # Shared TypeScript types + domain utilities
│   │   └── src/
│   │       ├── entities/           # Hive, Person, Event, Task, common types
│   │       │   ├── person.ts       # PersonRole enum, Person interface
│   │       │   └── person.utils.ts # Domain utils: getInitials(), ROLE_I18N_KEYS (ADR-0002)
│   │       ├── permissions.ts      # HivePermission enum + role mappings
│   │       ├── api/                # [TODO] API response types (empty)
│   │       └── sync/               # [Phase 4] Sync types (empty)
│   ├── validators/             # Shared Zod schemas + sanitizers
│   │   └── src/schemas/            # auth, person, event, task, group, common
│   ├── ui/                     # Shared React components + hooks
│   │   └── src/
│   │       ├── components/         # Button, Input, Card (CVA + Radix)
│   │       ├── hooks/              # 7 hooks (media query, online status, …)
│   │       └── utils/              # cn() class merger (clsx + tw-merge)
│   ├── eslint-config/          # Shared ESLint config (@qoomb/eslint-config)
│   └── config/                 # Shared tsconfig
│
├── docs/                       # Documentation for humans
│   ├── adr/                        # Architecture Decision Records (MADR)
│   │   ├── 0001-adr-process.md     # ADR process and format
│   │   ├── 0002-shared-domain-utilities.md  # Domain-driven code structure (ADR-0002)
│   │   ├── 0003-branching-and-release-strategy.md # Branching & release strategy (ADR-0003)
│   │   ├── 0004-cloud-agnostic-architecture.md # Cloud-agnostic stack (ADR-0004)
│   │   └── 0005-hybrid-encryption-architecture.md # Encryption architecture (ADR-0005)
│   ├── CONTENT_ARCHITECTURE.md     # Content model, schema, encryption
│   ├── DESIGN_SYSTEM.md            # Tailwind v4 design tokens
│   ├── LOCAL_DEVELOPMENT.md        # qoomb.localhost + Caddy setup
│   ├── PERMISSIONS.md              # RBAC architecture + guard API
│   ├── SECURITY.md                 # Security architecture details
│   ├── PERFORMANCE.md              # Prisma performance guide
│   ├── PRISMA_PATTERNS.md          # When to use Prisma vs raw SQL
│   ├── RELEASING.md                # Release process (release-please)
│   └── TERMINOLOGY.md              # Domain terminology glossary
│
├── .github/                    # GitHub configuration
│   ├── workflows/                  # CI/CD pipelines
│   │   ├── ci.yml                 # Main CI (lint, type-check, test, build)
│   │   ├── codeql.yml             # Security scanning (SAST)
│   │   ├── trivy.yml              # Vulnerability & secrets scanning
│   │   ├── release.yml            # Release-please automation
│   │   ├── sbom.yml               # Software Bill of Materials
│   │   ├── scorecard.yml          # OpenSSF Scorecard
│   │   └── version-check.yml     # Version consistency check
│   └── dependabot.yml              # Automated dependency updates
│
├── .husky/                     # Git hooks
│   ├── pre-commit                  # Prettier + Gitleaks
│   ├── pre-push                    # Lint + types + tests
│   └── commit-msg                  # Commitlint + anti-AI-trailer
│
├── justfile                    # Task runner (44 recipes)
├── docker-compose.yml          # PostgreSQL + Redis
├── LICENSE.md                  # Fair Source License v1.0 + CLA
├── COMMERCIAL-LICENSE.md       # Commercial licensing details
├── CLAUDE.md                   # This file (for AI)
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
- Refresh endpoint returns user + hive data for session restoration
- Token rotation and revocation
- Token blacklisting (Redis-based)
- PassKey/WebAuthn (registration, authentication, list, remove)
- CSRF guard (custom request header pattern: `X-CSRF-Protection: 1`)
- Shared schema + Row-Level Security (RLS) on all hive-scoped tables
- `app.hive_id` session variable enforced by `hiveProcedure`
- tRPC context extracts JWT from `Authorization: Bearer` header
- Input validation (Zod) + sanitization
- Rate limiting (Redis-based, distributed)
- Account lockout (exponential backoff)
- Security headers (Helmet.js: CSP, HSTS, etc.)
- Info-leakage prevention (generic errors)
- SQL injection protection (UUID validation)
- Device tracking (IP + User-Agent)
- Audit logging foundation
- **Location:** `apps/api/src/modules/auth/`, `apps/api/src/common/`

**Frontend Application (PRODUCTION-READY):**

- **Auth Flow:** Login, Register, Forgot/Reset Password, Email Verification — all with real tRPC calls
- **PassKey UI:** PassKeyButton (login), PassKeyManager (register/list/remove credentials)
- **Auth Context:** Silent refresh with JWT-expiry scheduling, in-memory access token (never localStorage), hive switching
- **Dashboard:** UI prototype (775 lines, static data — no tRPC calls yet, German placeholder content)
- **Auth Guard:** Route-level protection component
- **tRPC Client:** splitLink (GET queries, POST batch mutations), CSRF header, Bearer auth, superjson transformer
- **HiveSwitcher:** Component for switching between user's hives
- **EmailVerificationBanner:** Persistent banner until email confirmed
- **Location:** `apps/web/src/pages/`, `apps/web/src/components/`, `apps/web/src/lib/`

**Design System (PRODUCTION-READY):**

- Tailwind CSS v4 with `@theme inline` and custom `@utility` directives
- CSS Custom Properties for all design tokens (primary, background, foreground, muted, border, etc.)
- Light mode (warm palette: `#F5C400` primary, `#F8F7F5` background) + Dark mode (auto via `prefers-color-scheme` + `.dark` class)
- Brand tokens: Yellow/black Qoomb identity
- Custom glow utilities: `glow-success`, `glow-destructive`, `glow-primary`, `glow-muted`
- **Location:** `apps/web/src/styles/index.css`, `docs/DESIGN_SYSTEM.md`

**Mobile & PWA:**

- PWA manifest with app icons (192, 512, apple-touch, mask-icon)
- Service worker with Workbox (offline caching for static assets + runtime cache for tRPC/API)
- Apple mobile web app support
- Capacitor configuration for iOS/Android (dirs generated on demand, not committed)
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
- **Copyright:** Benjamin Gröner (<bgroener@coqoon.com>)
- **Commercial Options:** Perpetual, Subscription, SaaS/Hosting, OEM licenses
- **Location:** `LICENSE.md`, `COMMERCIAL-LICENSE.md`

**Encryption:**

- Pluggable key providers (Environment, File, AWS KMS, Vault)
- Decorator-based field encryption (`@EncryptFields`, `@DecryptFields`)
- HKDF per-hive key derivation + per-user key derivation (`encryptForUser`/`decryptForUser`)
- AES-256-GCM authenticated encryption with key versioning
- HMAC-SHA256 email blind index (`hashEmail`) for lookups without storing plaintext
- 7-point self-test at startup (basic crypto, hive isolation, serialization, user encryption, multi-version, email hash)
- **Key rotation** via `db:reencrypt --execute` (see ADR-0008); backups written before every write; 30-day retention (`REENCRYPT_BACKUP_RETENTION_DAYS`)
- **Location:** `apps/api/src/modules/encryption/`, `apps/api/prisma/scripts/reencrypt.ts`

**Email:**

- i18n email rendering (DE/EN) via typesafe-i18n
- Handlebars templates: email-verification, password-reset, invitation (+ shared layout partial)
- 3 pluggable transports: Console (dev), SMTP (self-hosted), Resend (SaaS)
- **Location:** `apps/api/src/modules/email/`

**Backend i18n:**

- typesafe-i18n with DE and EN locales
- Used for email templates and user-facing error messages
- **Location:** `apps/api/src/i18n/`

**Frontend i18n (PRODUCTION-READY):**

- typesafe-i18n v5.27.1 with React adapter (`typesafe-i18n/react`)
- Base locale: `de` (German); secondary locale: `en` (English)
- Config: `apps/web/.typesafe-i18n.json` (`baseLocale: "de"`, `adapter: "react"`)
- Provider: `<TypesafeI18n locale="de">` wraps the entire app in `apps/web/src/main.tsx`
- Hook: `const { LL } = useI18nContext()` → call `LL.section.key()` in JSX
- Parameterized strings: `LL.dashboard.greeting({ name })`, `LL.dashboard.memberCount({ count })`
- Generated files (do not edit manually): `i18n-types.ts`, `i18n-util*.ts`, `i18n-react.tsx`, `formatters.ts`
- Translation files (edit these): `apps/web/src/i18n/de/index.ts`, `apps/web/src/i18n/en/index.ts`
- Applied to: all auth pages, ProfilePage, Dashboard, UserMenu, PassKeyButton/Manager, EmailVerificationBanner, HiveSwitcher, AuthLayout
- **All user-visible strings must use `LL.*()` — never hardcode text in JSX**
- **Location:** `apps/web/src/i18n/`

**Frontend i18n namespace structure:**

| Namespace   | Scope                                    | Examples                                                                  |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `common`    | Generic actions + primitives             | `save`, `cancel`, `add`, `create`, `invite`, `emailLabel`, `passwordHint` |
| `nav`       | Navigation section labels                | `overview`, `calendar`, `tasks`, `members`, `pages`, `settings`           |
| `entities`  | Domain object names                      | `event`, `task`, `page`                                                   |
| `roles`     | Role display names                       | `parent`, `child`, `orgAdmin`, `manager`, `member`                        |
| `auth`      | Auth flows (login, register, passKey, …) | `signIn`, `backToSignIn`, `login.title`                                   |
| `layout`    | Shared layout chrome                     | `userMenu.profile`, `emailVerification.message`                           |
| `profile`   | Profile page strings                     | `displayNameLabel`, `saved`                                               |
| `dashboard` | **Dashboard-view-specific only**         | `greeting`, `memberCount`, `progressText`, `quickAdd.title`               |

**Phase 2 (Core Content):**

- Persons module: `me`, `list`, `get`, `updateProfile`, `updateRole`, `remove`, `invite`
  - AES-256-GCM field encryption: `displayName`, `avatarUrl`, `birthdate` (stored as encrypted ISO string)
  - Self-role-change prevention; last-admin removal blocked by DB trigger `enforce_minimum_admin`
  - `invite` sends hive-level invitation email (requires `MEMBERS_INVITE` permission)
  - Reuses `AuthService.inviteMemberToHive()` — checks existing membership, sends token email
  - Invitations expire after 7 days; plaintext `email` column stored for key-rotation support (migration `20260314000005`)
  - `InvitationCleanupTask` (scheduled cron `EVERY_DAY_AT_3AM`) hard-deletes all rows where `expiresAt < now()`, used or not — data-minimization compliance
  - `AuthService.cleanupExpiredInvitations()` — returns delete count; tested in `invitation-cleanup.test.ts`
- Events module: `list`, `get`, `create`, `update`, `delete`
  - AES-256-GCM field encryption: `title`, `description`, `location`, `url`, `category`
  - `recurrenceRule` stored as opaque JSON — no server-side expansion; client handles display
  - Full 5-stage RBAC guard on `get` / `update` / `delete`
  - `list` uses `buildVisibilityFilter()` for share-aware visibility (role + personal/group shares)
- Lists module (replaced Tasks): `list`, `get`, `create`, `update`, `archive`, `delete`
  - Generic EAV model: `List → ListField → ListItem → ListItemValue`
  - AES-256-GCM field encryption: `name` (list + fields + views), item values
  - System lists (e.g. "tasks" per user) auto-created on first access
  - Templates system (`ListTemplate`, `ListTemplateField`, `ListTemplateView`)
  - Items: `createItem`, `updateItem`, `deleteItem`, `listItems`
  - Fields: `createField`, `updateField`, `removeField`, `getSelectOptions`
  - `getSelectOptions(fieldId, listId)` → `string[]` — returns configured options for a select-type field (Notion-style dropdown); requires `view` access; returns `[]` for non-select fields
  - `ListField.config` JSONB intentionally unencrypted (structural metadata, not personal data) — see ADR-0007 Risks
  - Full 5-stage RBAC guard on all operations
  - Frontend: ListsPage (overview) + ListDetailPage (inline editing, icon picker, archive)
  - **Location:** `apps/api/src/modules/lists/`, `apps/web/src/pages/ListsPage.tsx`, `ListDetailPage.tsx`
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
- **Location:** `apps/api/src/modules/persons/`, `events/`, `lists/`, `groups/`

**Phase 3 (Hive Management & Communication) — IN PROGRESS:**

- [x] Hive CRUD: update name/locale/settings, delete hive (with cascade) — `apps/api/src/modules/hive/`
- [x] Hive settings page (frontend) — `apps/web/src/pages/HiveSettingsPage.tsx`
- [x] Invitation management UI: list pending, resend, revoke — `persons.listInvitations`, `persons.resendInvitation`, `persons.revokeInvitation` in persons router + MembersPage
- [x] In-app notifications: bell icon, notification model, read/unread state — `apps/api/src/modules/notifications/`, `apps/web/src/pages/NotificationsPage.tsx`, `NotificationsBell`
- [x] Notification preferences: per-user opt-in/out (inApp + email per type) — `notifications.getPreferences`, `notifications.updatePreferences`
- [x] In-app messaging: encrypted direct messages — `apps/api/src/modules/messaging/`, `apps/web/src/pages/MessagingPage.tsx`
- [x] Activity log (change feed) — `apps/api/src/modules/activity/`, `apps/web/src/pages/ActivityPage.tsx`
- [ ] Notification emails: event reminders, task assignments, member joined/left — email templates + trigger calls from mutations
- [ ] Email queue with retry (BullMQ) — replace inline-send with async queue
- [ ] Email preferences unsubscribe endpoint
- [ ] Hive settings: invitation management admin panel (revoke via /settings)

### 🚧 TODO (Next)

**Phase 4 (Sync & Real-Time):**

- [ ] Client-side SQLite cache (wa-sqlite + OPFS in browser, native on mobile)
- [ ] Web Worker isolation for local DB (XSS protection)
- [ ] SSE change feed (Redis Pub/Sub → per-hive event stream)
- [ ] Optimistic mutations with server confirmation
- [ ] Offline queue with reconnect-merge
- [ ] Field-level LWW conflict resolution
- [ ] Full local search (all non-file content synced to client)
- [ ] pgvector semantic search (server-side complement)
- [ ] E2E encryption option (libsodium — opt-in for ultra-sensitive content)

**Phase 5 (Pages & Files):**

- [ ] Pages module (Tiptap editor, tree hierarchy, version history)
- [ ] Real-time collaborative editing (Yjs CRDT)
- [ ] Documents module (file upload + envelope encryption)

**Phase 6 (Calendar Integration):**

- [ ] Google Calendar (OAuth + webhook)
- [ ] Apple Calendar (CalDAV)
- [ ] Microsoft Outlook (Graph API)
- [ ] Bidirectional sync + conflict resolution UI

**Data Paradigm:** All business-data values are AES-256-GCM encrypted at rest. The server
decrypts on read and sends plaintext over TLS. Filtering, sorting, and searching happen
**client-side** (local SQLite from Phase 4, in-memory before that). The server never filters
on decrypted values — it fetches all records within a scope and returns them in bulk.

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
@EncryptFields({ fields: ['sensitiveField'], hiveIdArg: 1 })  // Can't forget!
async create(data: Input, _hiveId: string) { ... }
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
@EncryptFields({ fields: ['sensitiveData'], hiveIdArg: 1 })
async create(data: Input, _hiveId: string) { ... }

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

One module = one reason to change

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

**In justfile:**

```just
# ✅ GOOD: Atomic, reusable recipes
[private]
_docker-volumes-remove:  # Does ONE thing
    docker compose down -v

docker-clean: _docker-volumes-remove  # Adds UI layer

# ❌ BAD: Duplicate logic
docker-clean:
    docker compose down -v

db-reset:
    docker compose down -v  # Duplication!
```

#### Open/Closed Principle (OCP)

Open for extension, closed for modification

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

Subtypes must be substitutable for base types

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

Don't force clients to depend on unused methods

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

Depend on abstractions, not concretions

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

Every piece of knowledge must have a single, unambiguous representation

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

**In justfile:**

```just
# ✅ GOOD: DRY
[private]
_docker-volumes-remove:
    docker compose down -v

docker-clean: _docker-volumes-remove
db-reset: _docker-volumes-remove

# ❌ BAD: Duplication
docker-clean:
    docker compose down -v  # Repeated

db-reset:
    docker compose down -v  # Repeated
```

#### Keep It Simple, Stupid (KISS)

Simplicity should be a key goal

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

Don't add functionality until it's necessary

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

Prefer composing objects over class hierarchies

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

Different concerns should be in different modules

```text
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

### 8. Event Handler Naming Conventions (Critical)

Follow official React naming conventions. Consistent naming makes the data-flow direction immediately clear.

#### Props (callbacks received from parent) → always `on*`

Use the `on` prefix for function props that a parent passes to a component. This mirrors React's built-in events (`onClick`, `onChange`, `onSubmit`).

```typescript
// ✅ GOOD: prop callbacks use on*
interface UserMenuProps {
  onProfileClick: () => void;
  onLogoutClick: () => void;
}

<UserMenu onProfileClick={handleProfileClick} onLogoutClick={handleLogoutClick} />

// ❌ BAD: non-standard prefix for props
interface UserMenuProps {
  profileClickHandler: () => void;   // Unclear direction
  handleLogout: () => void;          // Looks like internal handler
}
```

#### Internal handlers (defined inside a component) → `handle*`

Use `handle` as the prefix for functions defined inside the component body that respond to events.

```typescript
// ✅ GOOD: internal handlers use handle*
function Dashboard() {
  function handleAddTask() { ... }
  function handleProfileClick() { ... }

  return <UserMenu onProfileClick={handleProfileClick} />;
  //              ↑ prop name (on*)   ↑ local impl (handle*)
}

// ❌ BAD: on* for internal handlers
function Dashboard() {
  function onProfileClick() { ... }  // Looks like a prop, not a handler
}
```

#### Inline handlers → anonymous arrow functions are fine for trivial cases

```typescript
// ✅ GOOD: trivial inline handler
<Button onClick={() => setOpen(false)}>Cancel</Button>

// ✅ GOOD: extracted for reuse or complexity
const handleSubmit = useCallback((e: React.FormEvent) => {
  e.preventDefault();
  // …
}, [deps]);
```

#### `useCallback` dependencies

When a handler uses context values (e.g. `LL` from i18n), include them in the dependency array.

```typescript
// ✅ GOOD: LL included in deps
const handleSubmit = useCallback(
  (e: React.FormEvent) => {
    if (invalid) setError(LL.auth.passwordMismatch());
  },
  [LL, invalid, setError] // ← LL is a dependency
);
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
// Decorator config — declared once, reused across methods
const ENC_FIELDS = ['title', 'description', 'location', 'url', 'category'];

@Injectable()
export class EventsService {
  // @EncryptFields: encrypts the named fields in the INPUT argument before
  // the method executes — the method receives (and stores) encrypted data.
  // hiveIdArg: positional index of the hiveId parameter (0-based)
  @EncryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async createEvent(data: CreateEventInput, _hiveId: string) {
    return this.prisma.event.create({ data });
    // data.title, data.description, etc. are encrypted in-place
  }

  // @DecryptFields: decrypts the named fields in the RETURN VALUE after the
  // method executes — the caller receives plaintext.
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async getEvent(id: string, _hiveId: string) {
    return this.prisma.event.findUnique({ where: { id } });
    // returned fields are automatically decrypted
  }

  // Works with arrays automatically
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
  async listEvents(_hiveId: string) {
    return this.prisma.event.findMany();
  }

  // @EncryptDecryptFields combines both in a single decorator
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 2 })
  async updateEvent(id: string, data: UpdateEventInput, _hiveId: string) {
    return this.prisma.event.update({ where: { id }, data });
  }
}
```

**Nested path syntax** — for models with encrypted fields inside relations (arrays), use
`'relation.*.field'` where `*` iterates over each array element:

```typescript
// Lists have encrypted name + nested fields[].name + views[].name
const LIST_ENC_FIELDS = ['name', 'fields.*.name', 'views.*.name'];

@DecryptFields({ fields: LIST_ENC_FIELDS, hiveIdArg: 0 })
async list(hiveId: string): Promise<ListRow[]> {
  return this.prisma.list.findMany({
    include: { fields: true, views: true },
  });
  // name, fields[].name, views[].name are all decrypted automatically
}
```

**When to use manual encryption instead:** When values need serialization before encryption
(e.g. ListItemValue stores all field types as encrypted strings) — use explicit helper methods.

````

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
````

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

### Pattern: Operator Feature Flag Guard

Operator-controlled toggles (`ALLOW_OPEN_REGISTRATION`, `ALLOW_FORGOT_PASSWORD`, `ALLOW_PASSKEYS`)
are enforced at the tRPC boundary using a two-layer split:

```
Env var (validated by Zod at startup)
    ↓
SystemConfigService — pure boolean getters, zero framework imports
    ↓
requireEnabled() in apps/api/src/trpc/guards.ts — translates boolean → TRPCError
    ↓
Router handler — single-line guard call before business logic
```

```typescript
// ✅ CORRECT: service returns boolean, guard throws
import { requireEnabled } from '../../trpc/guards';

someEndpoint: publicProcedure.mutation(async ({ input }) => {
  requireEnabled(systemConfigService.isForgotPasswordAllowed(), 'Password reset is disabled.');
  await authService.resetPassword(input.token, input.newPassword);
  return { success: true };
}),

// ❌ WRONG: inline if/throw duplicated across endpoints
if (!systemConfigService.isForgotPasswordAllowed()) {
  throw new TRPCError({ code: 'FORBIDDEN', message: '...' });
}

// ❌ WRONG: service throws TRPCError (layer violation)
class SystemConfigService {
  requireForgotPassword() {
    if (!this.isForgotPasswordAllowed())
      throw new TRPCError(...)  // ← NestJS service must not import @trpc/server
  }
}
```

New guards (e.g. `requireSystemAdmin`, `requireNotRateLimited`) go in `apps/api/src/trpc/guards.ts`.
Never add guard logic directly inside a router file.

---

## RBAC & Resource Permission Architecture

### Roles

**Family Hive** (minimum 1 `parent` required, enforced by DB trigger `enforce_minimum_admin`)

| Role     | Permissions                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------- |
| `parent` | Everything                                                                                      |
| `child`  | members:view, events:view/create/update:own/delete:own, tasks:view/create/update:own/delete:own |

**Organization Hive** (minimum 1 `org_admin` required)

| Role        | Permissions                                                               |
| ----------- | ------------------------------------------------------------------------- |
| `org_admin` | Everything                                                                |
| `manager`   | events:_, tasks:_, members:view/invite/remove                             |
| `member`    | members:view, events:view/create/update:own, tasks:view/create/update:own |
| `guest`     | members:view, events:view, tasks:view                                     |

Global defaults defined in `packages/types/src/permissions.ts`. Per-hive overrides stored in `hive_role_permissions` table.

### Resource Permission Resolution (5-stage check)

```text
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

```text
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

```text
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
@EncryptFields({ fields: ['title'], hiveIdArg: 1 })
async createEvent(data: CreateEventInput, _hiveId: string) {
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

# JWT RS256 asymmetric key pair (NOT symmetric — there is no JWT_SECRET)
# Generate both at once: just generate-secrets
JWT_PRIVATE_KEY=<base64-encoded RSA private key PEM>
JWT_PUBLIC_KEY=<base64-encoded RSA public key PEM>

# WebAuthn / PassKey — RP ID must be a registrable domain suffix of ALL origins
WEBAUTHN_RP_ID=localhost             # "localhost" covers localhost + *.localhost
WEBAUTHN_RP_NAME=Qoomb
WEBAUTHN_ORIGIN=http://localhost:5173  # comma-separated for multiple origins
```

**WebAuthn RP ID / Origin constraint:** A single RP ID can cover multiple origins as long as it is a domain suffix of each. Credentials are bound to the RP ID — not the individual origin.

```bash
# ✅ "localhost" is valid for both dev modes simultaneously
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:5173,https://qoomb.localhost:8443

# ✅ Production
WEBAUTHN_RP_ID=qoomb.com
WEBAUTHN_ORIGIN=https://app.qoomb.com
```

**See:** `.env.example` for complete configuration, `docs/SECURITY.md §4` for WebAuthn details.

---

## Documentation Structure

```text
README.md              → Human onboarding
CLAUDE.md              → This file (AI context)
docs/
  ├── adr/                        → Architecture Decision Records (MADR)
  │   ├── 0001-adr-process.md     → ADR format and process
  │   ├── 0002-shared-domain-utilities.md → Domain-driven code structure
  │   ├── 0003-branching-and-release-strategy.md → Branching & release strategy
  │   ├── 0004-cloud-agnostic-architecture.md → Cloud-agnostic stack
  │   └── 0005-hybrid-encryption-architecture.md → Encryption architecture
  ├── CONTENT_ARCHITECTURE.md → Content model, schema, encryption
  ├── DESIGN_SYSTEM.md       → Tailwind v4 design tokens
  ├── LOCAL_DEVELOPMENT.md   → qoomb.localhost + Caddy setup
  ├── PERMISSIONS.md         → RBAC architecture + guard API
  ├── SECURITY.md            → Security architecture details
  ├── PERFORMANCE.md         → Prisma performance guide
  ├── PRISMA_PATTERNS.md     → When to use Prisma vs SQL
  ├── RELEASING.md           → Release process (release-please)
  └── TERMINOLOGY.md         → Domain terminology glossary

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
12. **When adding a new encrypted field or table** you MUST simultaneously: (a) add it to the [ADR-0008 inventory](docs/adr/0008-secure-reencryption-process.md), (b) add a migration function in `apps/api/prisma/scripts/reencrypt.ts`, (c) add unit tests in `apps/api/prisma/scripts/reencrypt.test.ts`

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

- **Single Source of Truth:** Root `package.json` version (managed by Release Please)
- **Build-time injection:** Vite injects `__APP_VERSION__` from root `package.json` at build time
- **No hardcoded versions** in application code — use `__APP_VERSION__` global constant
- **Semantic Versioning:** `MAJOR.MINOR.PATCH` (following semver.org)

**How it works:**

1. Release Please bumps `package.json` version + `.release-please-manifest.json` atomically
2. Vite reads `package.json` at build time and defines `__APP_VERSION__`
3. `version-check.yml` CI workflow validates `package.json` matches the manifest
4. No manual sync needed — everything flows from `package.json`

**When to bump versions:**

- **0.1.0 → 0.2.0:** Phase 2 complete (Core Content: Events, Lists, Persons, Groups)
- **0.2.0 → 0.3.0:** Phase 3 complete (Hive Management & Communication)
- **0.3.0 → 0.4.0:** Phase 4 complete (Sync & Real-Time, Offline, Search)
- **0.x.0 → 1.0.0:** First production release (all core features stable)
- **PATCH (0.1.x):** Critical bugfixes only, no new features

**When NOT to bump:**

- ❌ Adding dev tools (e.g., dev panel, debug utilities)
- ❌ Refactoring code without user-visible changes
- ❌ Improving documentation
- ❌ Internal optimizations
- ❌ Infrastructure changes (CI/CD, build config)
- ❌ Work-in-progress features

**LLM Instruction:** NEVER increment version numbers in `package.json` or `.release-please-manifest.json` autonomously. Only Release Please should bump versions.

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
- **If the feature stores encrypted fields:** add them to the [ADR-0008 inventory](docs/adr/0008-secure-reencryption-process.md), extend `reencrypt.ts`, extend `reencrypt.test.ts`
- Add to Implementation Status section in this file

---

**Last Updated:** 2026-03-15
**Version:** 0.3.0 (Phase 3 - Hive Management, Notifications, Messaging, Activity Log)

<!-- gitnexus:start -->

# GitNexus MCP

This project is indexed by GitNexus as **qoomb** (1117 symbols, 2891 relationships, 79 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task                                         | Read this skill file                               |
| -------------------------------------------- | -------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/refactoring/SKILL.md`     |

## Tools Reference

| Tool             | What it gives you                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `query`          | Process-grouped code intelligence — execution flows related to a concept |
| `context`        | 360-degree symbol view — categorized refs, processes it participates in  |
| `impact`         | Symbol blast radius — what breaks at depth 1/2/3 with confidence         |
| `detect_changes` | Git-diff impact — what do your current changes affect                    |
| `rename`         | Multi-file coordinated rename with confidence-tagged edits               |
| `cypher`         | Raw graph queries (read `gitnexus://repo/{name}/schema` first)           |
| `list_repos`     | Discover indexed repos                                                   |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource                                       | Content                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `gitnexus://repo/{name}/context`               | Stats, staleness check                    |
| `gitnexus://repo/{name}/clusters`              | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members                              |
| `gitnexus://repo/{name}/processes`             | All execution flows                       |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace                        |
| `gitnexus://repo/{name}/schema`                | Graph schema for Cypher                   |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
