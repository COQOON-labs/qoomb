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
- Never increment `APP_VERSION` without explicit user approval

---

## Versioning Policy

- Current version: `0.1.0` — defined in `apps/web/src/App.tsx` as `APP_VERSION`
- Bumping requires explicit user approval + updates to `App.tsx`, `claude.md`, `README.md`
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
