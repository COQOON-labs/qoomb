# Code Review Checklist

> Mandatory checklist for every PR in this repository.
> Derived from the full audit of `feat/list-settings-panel` (2026-03-22).
> **Update this file** when new patterns, pitfalls, or rules are established.

---

## 0. Before You Start

- [ ] Read [`docs/REGRESSION-PATTERNS.md`](REGRESSION-PATTERNS.md) and scan the changed files against every listed pattern
- [ ] Commit message follows Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- [ ] **No `Co-Authored-By:` trailer** in commit messages — not for AI tools, not for anyone
- [ ] **No manual version bump** in `package.json` or `.release-please-manifest.json` — Release Please owns versioning

---

## 1. Dead Code

- [ ] No unused exports (types, constants, functions) left behind
- [ ] No i18n keys defined but not referenced by any component (`grep -rn "keyName" apps/web/src/` to verify)
- [ ] Removed UI features have their i18n keys, types, and validators removed too — **or** a comment explaining why the backend/schema is kept
- [ ] No imports that only existed for removed features

**Quick scan:**

```bash
# Find i18n keys defined in de/index.ts but not used in src/
# (Manual: search the key name across apps/web/src/)
pnpm --filter @qoomb/web exec tsc --noEmit  # catches dead type imports
```

---

## 2. ADR Compliance

### ADR-0002 — Shared Domain Utilities

- [ ] Business rules shared between frontend + backend live in `packages/types/src/entities/*.utils.ts`
- [ ] No domain logic (permissions, guards, validation rules) duplicated in app layer
- [ ] New domain utils are pure functions — no React/NestJS imports

### ADR-0005 / ADR-0008 — Encryption

- [ ] Every new field storing personal/sensitive data uses `@EncryptFields` / `@DecryptFields`
- [ ] **When adding a new encrypted field:** ADR-0008 inventory updated, `reencrypt.ts` extended, `reencrypt.test.ts` extended (three-step rule)
- [ ] No plaintext sensitive data in DB columns or logs

### ADR-0006 — Accessibility

- [ ] Interactive elements have `aria-label` or visible text (buttons, icon-only controls)
- [ ] New routes/pages covered by at least a smoke test in `*.a11y.test.tsx`
- [ ] Keyboard navigation works for all new interactive components (`Tab`, `Enter`, `Escape`)
- [ ] Color is not the only means of conveying information (icons + text, not color alone)

### ADR-0004 — Cloud-Agnostic

- [ ] No cloud-provider-specific SDK imported in application code
- [ ] `docker compose up` still works without cloud credentials

### ADR-0003 — Branching

- [ ] Branch name follows `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`, `perf/` prefix
- [ ] PR stays mergeable within 1–2 days (no long-running branch)

---

## 3. Multi-Tenant / Security

- [ ] All hive-scoped tRPC operations use `hiveProcedure` (not `protectedProcedure`)
- [ ] No raw SQL string interpolation with user values — only parameterised queries
- [ ] UUID validated before use in raw SQL (see `validateUUID()` in `prisma.service.ts`)
- [ ] User-controlled values stripped of `\r\n` before logging (CWE-117)
- [ ] No `innerHTML`, `dangerouslySetInnerHTML`, or `eval()` with user input
- [ ] No `any` types in security-critical paths (input parsing, auth, encryption)
- [ ] New env vars for security-critical settings have **no default value** (fail-safe)
- [ ] `sanitizeHtml()` from `@qoomb/validators` used — not a custom HTML sanitizer
- [ ] Regex on user input uses bounded negated classes `[^<>]*` not `[^>]*` (ReDoS / CWE-1333)
- [ ] New public or auth endpoints have a rate-limit guard applied (see `CustomThrottlerGuard`)

### Prisma / Database

- [ ] New tables have RLS policies in the migration (pattern: `CREATE POLICY ... USING (hive_id = current_setting('app.hive_id')::uuid)`)
- [ ] Migrations are backward-compatible — no column drops without a deprecation period
- [ ] New migrations do not break existing seed data (`pnpm db:seed` still works)

**Quick scan:**

```bash
grep -rn "innerHTML\|dangerouslySetInnerHTML\|eval(" apps/web/src/ --include="*.tsx"
grep -rn "\$queryRawUnsafe\|\$executeRawUnsafe" apps/api/src/ --include="*.ts" | grep -v "validateUUID\|setHiveSchema"
grep -rn "console\.log" apps/api/src/ --include="*.ts" | grep -v "DevPanel\|\.test\."
```

---

## 4. Type Safety

- [ ] No `any` types — proper TypeScript or Zod schemas used throughout
- [ ] All new API inputs validated with Zod at the boundary
- [ ] `pnpm --filter @qoomb/web exec tsc --noEmit` passes with zero errors
- [ ] `pnpm --filter @qoomb/api exec tsc --noEmit` passes with zero errors

---

## 5. i18n

- [ ] No hardcoded user-visible strings in JSX — always `LL.*()`
- [ ] New keys added to **both** `de/index.ts` and `en/index.ts` before use
- [ ] `pnpm typesafe-i18n` re-run after adding/removing keys (regenerates `i18n-types.ts`)
- [ ] `LL` (or sub-object) included in `useCallback` dependency arrays where used
- [ ] Removed UI features have their i18n keys removed too (see §1)

---

## 6. SOLID / DRY / LEAN

- [ ] No copy-pasted logic — extract as shared util or hook if used ≥2 times
- [ ] Components > ~300 lines: consider splitting by responsibility
- [ ] New page-level hooks (`useChecklistConfig`, `useTableView`, …) extracted for testability if logic is complex
- [ ] No premature abstractions for one-off use (YAGNI)
- [ ] Event handler naming: props use `on*`, internal handlers use `handle*`

---

## 7. Documentation

- [ ] `AGENTS.md` + `CLAUDE.md` updated to reflect new features, changed behaviour, or removed functionality
- [ ] ADR-0008 inventory up to date (see §2)
- [ ] Intentionally-kept dead code (e.g. backend infra with UI removed) has an explanatory comment citing the reason and the PR
- [ ] New ADRs written for significant architectural decisions
- [ ] If a new bug pattern or regression risk was encountered: add it to [`docs/REGRESSION-PATTERNS.md`](REGRESSION-PATTERNS.md)

---

## 8. Tests — Quality over Coverage

> Full methodology and anti-pattern gallery: [`docs/TESTING.md`](TESTING.md).

**Mental model for every test you review:** "If I deleted the logic under test, would this test fail?"
If the answer is no, the test is an alibi — it creates false confidence without protecting anything.

### 8a. Anti-patterns to reject

- [ ] No test that only asserts `toBeDefined()`, `toBeInTheDocument()`, or bare `not.toThrow()` on a path that never throws anyway
- [ ] No test that only asserts on mock call counts (`expect(mockFn).toHaveBeenCalled()`) without verifying what was _returned_ or _changed_ as a result
- [ ] No guard/rule function with multiple blocking conditions that only tests the happy path — every branch must have a case
- [ ] No test that would still pass if the implementation were replaced with `return null` or `return true`
- [ ] No test body that is effectively `render(component); expect(component).toBeTruthy()` — that tests the harness, not the component

### 8b. Domain utils (`packages/types/src/entities/*.utils.ts`)

- [ ] Every util with branching logic has one test per branch — not just happy path
- [ ] Guard functions cover: happy path + **all** blocking conditions + **all** implicit fallbacks for old/missing config
- [ ] Pure functions tested with real inputs/outputs — no DI mocks needed
- [ ] Reference standard: `list.utils.test.ts` (17 cases incl. every `null`-config fallback)

### 8c. Validators (`packages/validators/src/schemas/`)

- [ ] Valid input is accepted
- [ ] Invalid input is rejected — one test per _distinct_ validation rule (wrong type, too long, missing required, malformed)
- [ ] At least one edge-case input: empty string, max-length boundary, SQL fragment, `<script>` tag through an HTML field

### 8d. Backend services (`apps/api/src/modules/*/*.service.test.ts`)

- [ ] Error paths: missing record → `NOT_FOUND`; unauthorised → `FORBIDDEN`; invalid input → `BAD_REQUEST`
- [ ] Cross-tenant defence: queries filtering by `id` also filter by `hiveId` (assert both appear in mock args)
- [ ] For encrypted fields: at least one test verifies stored value differs from plaintext
- [ ] Identity-mock pattern for encryption is acceptable (see `events.service.test.ts`) — use it to keep focus on business logic
- [ ] New cron / cleanup jobs: test "0 records" case and "N records deleted" case (see `invitation-cleanup.test.ts`)

### 8e. Frontend components / pages (`apps/web/src/`)

- [ ] Data-driven components: loading state, empty/error state, and populated state each have at least one test
- [ ] Mutations: assert the `mutate` call received the **correct payload** — not just that it was called
- [ ] Interactions: click/keyboard → assert on the _outcome_ (navigate called, mutate called with correct args, state changed)
- [ ] Form validation: invalid submit stays on page; valid submit triggers mutation with correct shape

### 8f. Accessibility tests (`apps/web/src/**/*.a11y.test.tsx`)

- [ ] Every new route has an axe smoke test (`expectNoAxeViolations`)
- [ ] New dialogs / modals: `Escape` key closes; focus returns to trigger element

### 8g. Run and verify

```bash
pnpm test                                                 # all packages
pnpm --filter @qoomb/types test --coverage                # domain utils — aim 100% branch
pnpm --filter @qoomb/validators test --coverage           # validators — aim 100% branch
cd apps/api && pnpm test --coverage 2>&1 | tail -20       # review uncovered branches
```

**Minimum targets (enforced in review, not yet automated):**

| Layer                              | Target                                      | What actually matters        |
| ---------------------------------- | ------------------------------------------- | ---------------------------- |
| Domain utils (`packages/types`)    | 100% branch                                 | Pure functions — no excuses  |
| Validators (`packages/validators`) | 100% of distinct rules                      | One test per validation rule |
| Backend service mutations          | Happy path + ≥1 error path per method       | Coverage % is secondary      |
| Frontend pages                     | Loading + empty + populated + 1 interaction | Not pixel-perfect rendering  |

---

## 9. Bundle / Performance

- [ ] Dev-only pages / large components loaded lazily (`React.lazy` + `Suspense`) where they would otherwise inflate the prod bundle
- [ ] No synchronous `import` of dev tooling outside `import.meta.env.DEV` guards

---

## 10. Known Deferred Work (tracked here, not in code)

| Item                                  | Why deferred                                                   | Revisit when             |
| ------------------------------------- | -------------------------------------------------------------- | ------------------------ |
| `ListDetailPage.tsx` (1094 lines)     | Functional, low priority split                                 | Next major Lists feature |
| `ListSettingsPanel.tsx` (837 lines)   | Functional, low priority split                                 | Next major Lists feature |
| `recurrenceRule` on `list_items`      | Infra kept for future repeating-tasks feature                  | When feature is planned  |
| `setTimeout(..., 0)` focus hacks (3×) | No React 18 `flushSync` alternative available without refactor | React 19 transition      |

---

> **Last updated:** 2026-03-22 — Audit of `feat/list-settings-panel`
> **Next review:** After next major feature PR
