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

- Use **`@EncryptFields(['field'])`** to encrypt INPUT args before they are persisted
- Use **`@DecryptFields(['field'])`** to decrypt RETURN VALUES after they are loaded
- Never encrypt manually — the decorator approach is DRY and prevents accidental plaintext storage

### Type Safety

- No `any` types — use proper TypeScript or Zod schemas
- All API inputs validated with Zod at the boundary (`createEventSchema.parse(input)`)
- Parameterized queries only — never interpolate user values into SQL strings

### Security

- Strip `\r\n` from user-controlled values before logging (log injection prevention)
- Use `sanitizeHtml()` from `@qoomb/validators` — do not roll your own HTML sanitizer
- No default values for security-critical env vars (`KEY_PROVIDER`, `ENCRYPTION_KEY`, etc.)

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
