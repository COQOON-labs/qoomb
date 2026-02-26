# Copilot Instructions for Qoomb

> These instructions apply to all AI-assisted code generation in this repository.
> For full technical context, see [claude.md](../claude.md).

---

## Project Overview

**Qoomb** is a privacy-first SaaS hive organisation platform built as a TypeScript monorepo
(Turborepo + pnpm). Key stack: NestJS backend, React 19 frontend, tRPC end-to-end types, Prisma
ORM, PostgreSQL with Row-Level Security, Redis, and `typesafe-i18n` for both backend and frontend.

---

## Critical Rules (Always Apply)

### Multi-Tenant Context

- Use **`hiveProcedure`** (not `protectedProcedure`) for all hive-scoped tRPC operations
- The `app.hive_id` Postgres session variable is set by `hiveProcedure` before every handler
- RLS policies enforce tenant isolation at the DB level — never bypass them

### Encryption

- Use **`@EncryptFields({ fields: ['field'], hiveIdArg: N })`** to encrypt INPUT args before they are persisted
- Use **`@DecryptFields({ fields: ['field'], hiveIdArg: N })`** to decrypt RETURN VALUES after they are loaded
- Never encrypt manually — the decorator approach is DRY and prevents accidental plaintext storage

### Type Safety

- No `any` types — use proper TypeScript or Zod schemas
- All API inputs validated with Zod at the boundary (`createEventSchema.parse(input)`)
- Parameterized queries only — never interpolate user values into SQL strings

### Security

- Strip `\r\n` from user-controlled values before logging (log injection prevention)
- Use `sanitizeHtml()` from `@qoomb/validators` — do not roll your own HTML sanitizer
- No default values for security-critical env vars (`KEY_PROVIDER`, `ENCRYPTION_KEY`, etc.)

### Domain-Driven Code Structure (ADR-0002)

- **Types layer** (`PersonRole`, `Person`, …) → `packages/types/src/entities/<entity>.ts` — zero runtime code
- **Domain utils** (`getInitials`, `ROLE_I18N_KEYS`, `hasPermission`, …) → `<entity>.utils.ts` and `permissions.ts`
- Domain utils must be **pure functions**, **framework-agnostic** (no React/NestJS imports)
- Application layer (hooks, guards, handlers) imports domain — **never** the reverse
- Both types and utils are available as `import { ... } from '@qoomb/types'`

### Presentation Hooks (ADR-0002)

- Use `useCurrentPerson()` from `apps/web/src/hooks/` for person display data
- Hooks encapsulate tRPC query + context + memoised derived values
- Pattern: `use<Entity>()` → returns typed interface with `isLoading`

### Cloud-Agnostic Architecture (ADR-0004)

- **No cloud-provider-specific imports** in application code — use pluggable interfaces
- Every technology in the stack must be **open-source and self-hostable**
- `docker-compose up` must be sufficient for full local development — no cloud credentials required
- Deployment differences are expressed through **environment variables**, not code branches

### Hybrid Encryption (ADR-0005)

- Use **`@EncryptFields({ fields: ['field'], hiveIdArg: N })`** to encrypt INPUT args before they are persisted
- Use **`@DecryptFields({ fields: ['field'], hiveIdArg: N })`** to decrypt RETURN VALUES after they are loaded
- Per-hive keys via HKDF — compromise of one hive does not affect others
- Per-user keys for global PII (email, full name) — independent from hive context
- Pluggable key providers: Environment, File, Cloud KMS, Vault — **no default** (fail-safe)
- Email stored as encrypted ciphertext + HMAC-SHA256 blind index — **zero plaintext email in DB**

### Operator Feature Flags

- All operator toggles (`ALLOW_OPEN_REGISTRATION`, `ALLOW_FORGOT_PASSWORD`, `ALLOW_PASSKEYS`) are Zod-validated at startup in `env.validation.ts`
- **`SystemConfigService`** is the single place that reads these env vars — pure boolean getters, no framework imports
- **`requireEnabled()`** in `apps/api/src/trpc/guards.ts` translates a boolean into a `FORBIDDEN` TRPCError
- Routers call `requireEnabled(systemConfigService.is*Allowed(), 'message')` — one line per guard
- Never call `getEnv()` directly inside a router; never put `TRPCError` inside a service
- New cross-cutting guards (e.g. `requireSystemAdmin`) go in `apps/api/src/trpc/guards.ts`, never inline

---

## i18n (Frontend)

All user-facing strings in the React frontend **must** use `typesafe-i18n`.

**Setup:**

- Base locale: `de` (German); secondary locale: `en`
- Config: `apps/web/.typesafe-i18n.json`
- Translation files: `apps/web/src/i18n/de/index.ts`, `apps/web/src/i18n/en/index.ts`
- React adapter auto-generated at `apps/web/src/i18n/i18n-react.tsx`

**Usage pattern:**

```tsx
import { useI18nContext } from '../i18n/i18n-react';

function MyComponent() {
  const { LL } = useI18nContext();
  return <p>{LL.section.key()}</p>;
}
```

**Namespace structure:**

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

**Parameterised strings:**

```tsx
LL.dashboard.greeting({ name: user.displayName }); // 'Guten Morgen, {name:string}! 👋'
LL.dashboard.memberCount({ count: 5 }); // '{count:number} Mitglieder'
```

**Rules:**

- Never hardcode user-visible text in JSX — always call `LL.*()`
- Add missing keys to **both** `de/index.ts` and `en/index.ts` before using them
- Include `LL` (or the specific sub-object used) in `useCallback` dependency arrays

**Backend i18n** (`apps/api/src/i18n/`) is separate — it uses `typesafe-i18n` for emails only
with English as the base locale.

---

## Event Handler Naming Conventions

Follow official React naming conventions:

### Props (callbacks from parent) → `on*`

```tsx
// ✅ GOOD
interface UserMenuProps {
  onProfileClick: () => void;
  onLogoutClick: () => void;
}
<UserMenu onProfileClick={handleProfileClick} onLogoutClick={handleLogoutClick} />;

// ❌ BAD — unclear direction
interface UserMenuProps {
  handleLogout: () => void; // looks like an internal handler
  profileClickCb: () => void; // non-standard naming
}
```

### Internal handlers (defined inside component) → `handle*`

```tsx
// ✅ GOOD
function Dashboard() {
  function handleAddTask() { ... }
  const handleSubmit = useCallback((e: React.FormEvent) => { ... }, [LL, ...deps]);

  return <Form onSubmit={handleSubmit} />;
  //          ↑ prop (on*)  ↑ impl (handle*)
}

// ❌ BAD — on* used for internal handler
function Dashboard() {
  function onAddTask() { ... }  // reads like a prop
}
```

### Inline handlers — arrow functions are fine for trivial cases

```tsx
<Button onClick={() => setOpen(false)}>Cancel</Button>
```

### `useCallback` dependencies — always include context objects like `LL`

```tsx
const handleSubmit = useCallback(
  (e: React.FormEvent) => {
    if (!valid) setError(LL.auth.validationFailed());
  },
  [LL, valid, setError] // ← LL must be listed
);
```

---

## Code Quality

- Zero ESLint errors before committing (warnings are acceptable with justification)
- Prettier auto-formats on pre-commit — do not fight it
- Commits must follow **Conventional Commits** (`feat:`, `fix:`, `chore:`, etc.)
- **Never add `Co-Authored-By:` trailers** — not for AI tools, not for anyone
- Never manually change version numbers — Release Please manages versioning

---

## Git & Branching (Trunk-Based Development)

This project follows **Scaled Trunk-Based Development** — see [ADR-0003](../docs/adr/0003-branching-and-release-strategy.md) for the full rationale. Apply these rules when creating branches or suggesting workflows:

### Branch Naming

Always use the standard prefixes — **never** use `claude/`, `ai/`, or other non-standard prefixes:

| Prefix      | Use for                                 |
| ----------- | --------------------------------------- |
| `feat/`     | New features                            |
| `fix/`      | Bug fixes                               |
| `docs/`     | Documentation only                      |
| `refactor/` | Code restructuring, no behaviour change |
| `test/`     | Tests                                   |
| `chore/`    | Build, CI, tooling, deps                |
| `perf/`     | Performance improvements                |

Examples: `feat/event-recurrence`, `fix/csrf-token-missing`, `chore/upgrade-prisma`

### Branch Lifetime

- Branches must be **merged within 1–2 days** — no long-running feature branches
- Split large tasks into multiple small PRs (Expand/Contract pattern)
- Each PR must leave `main` in a **releasable state**

### Splitting Large Changes

When a task is too large for one PR, propose a sequence:

1. **PR 1 — Foundation:** Types, schema, API surface (no breaking changes yet)
2. **PR 2 — Feature:** Behaviour and UI wired up
3. **PR 3 — Cleanup:** Remove deprecated paths

Never suggest accumulating work in a branch for more than 2 days.

### Merge Strategy

- Always **squash merge** — one commit per PR on `main`
- The squash commit message must follow Conventional Commits
- Never force-push to `main`

---

## Versioning Policy

- **Single source of truth:** Root `package.json` version (managed by Release Please)
- Vite injects `__APP_VERSION__` at build time — no hardcoded version in app code
- Development work (new features, refactors, docs) does **not** bump version

---

## Documentation

| File                              | Audience                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| `README.md`                       | Human developers                                           |
| `claude.md`                       | AI assistants (full technical context)                     |
| `.github/copilot-instructions.md` | This file — GitHub Copilot quick reference                 |
| `docs/`                           | Deep-dive docs (permissions, security, prisma patterns, …) |
| `docs/adr/`                       | Architecture Decision Records (MADR format)                |
