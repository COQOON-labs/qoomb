# Copilot Instructions for Qoomb

> **All project guidelines live in [`AGENTS.md`](../AGENTS.md).**
> This file contains only a condensed quick-reference for Copilot's context window.
> When in doubt, `AGENTS.md` is the source of truth.

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
- For nested relations use dot-path syntax: `fields: ['name', 'fields.*.name', 'views.*.name']`
- Only use manual encryption for conditional cases (e.g. ListItemValue serialization varies by context)
- **When adding a new encrypted field or table**, you MUST simultaneously:
  1. Add it to the [ADR-0008 inventory](../docs/adr/0008-secure-reencryption-process.md)
  2. Add a migration function in `apps/api/prisma/scripts/reencrypt.ts`
  3. Add unit test coverage to `apps/api/prisma/scripts/reencrypt.test.ts`

### Type Safety

- No `any` types — use proper TypeScript or Zod schemas
- All API inputs validated with Zod at the boundary (`createEventSchema.parse(input)`)
- Parameterized queries only — never interpolate user values into SQL strings

### Security

- Strip `\r\n` from user-controlled values before logging (log injection prevention)
- Use `sanitizeHtml()` from `@qoomb/validators` — do not roll your own HTML sanitizer
- No default values for security-critical env vars (`KEY_PROVIDER`, `ENCRYPTION_KEY`, etc.)

### i18n

- All user-facing strings must use `LL.*()` from `typesafe-i18n` — never hardcode text in JSX
- Base locale: `de` (German); secondary: `en`
- Include `LL` in `useCallback` dependency arrays

### Event Handlers

- Props (callbacks from parent) → `on*` prefix
- Internal handlers (defined inside component) → `handle*` prefix

### Code Quality

- Zero ESLint errors before committing
- Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- Never add `Co-Authored-By:` trailers for AI tools
- Never manually bump version numbers — Release Please manages versioning

---

## Documentation

| File                              | Audience                                            |
| --------------------------------- | --------------------------------------------------- |
| `AGENTS.md`                       | Universal AI agent guidelines (source of truth)     |
| `CLAUDE.md`                       | Claude-specific config (references AGENTS.md)       |
| `.github/copilot-instructions.md` | This file — Copilot quick reference                 |
| `docs/`                           | Deep-dive docs (permissions, security, prisma, ...) |
| `docs/adr/`                       | Architecture Decision Records (MADR format)         |
