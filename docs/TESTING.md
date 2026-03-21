# Testing Guide

> This guide defines the testing philosophy, per-layer requirements, anti-pattern gallery,
> and coverage expectations for the Qoomb monorepo.
> The companion quick-reference is [`docs/CODE-REVIEW-CHECKLIST.md`](CODE-REVIEW-CHECKLIST.md) §8.

---

## 1. Philosophy

### Test behaviour, not implementation

A test should verify **what the code does for its caller**, not _how_ it does it internally.

```typescript
// ✅ GOOD — tests observable behaviour
it('blocks deleting the last field', () => {
  expect(canDeleteField('f1', [field('f1')], [])).toEqual({ allowed: false, reason: 'lastField' });
});

// ❌ BAD — tests implementation detail (internal variable name)
it('sets isLast to true', () => {
  const spy = vi.spyOn(module, '_isLastField');
  canDeleteField('f1', [field('f1')], []);
  expect(spy).toHaveBeenCalled();
});
```

### The "mutation test" check

Before approving or writing a test, ask: **"If I delete the line of logic this test is targeting, does the test fail?"**

If the answer is **no**, the test provides no protection. Common failure modes:

| Code                                           | Test                                                 | Does the test catch deleting the guard?       |
| ---------------------------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| `if (!isAdmin) throw FORBIDDEN`                | `expect(() => fn()).not.toThrow()` (admin path only) | **No** — happy path never exercises the guard |
| `return data.filter(x => x.hiveId === hiveId)` | `expect(result).toBeDefined()`                       | **No** — `undefined` is never returned anyway |
| `encrypt(field, hiveId)`                       | `expect(result.title).toBeTruthy()`                  | **No** — plaintext is also truthy             |

### Quality over coverage numbers

100% line coverage with alibi tests is worse than 70% coverage with tests that actually verify real invariants — because false coverage metrics hide blind spots.

Coverage is a **minimum floor**, not a quality indicator. Branch coverage is more meaningful than line coverage.

---

## 2. Test Inventory by Layer

### 2a. Domain utils — `packages/types/src/entities/*.utils.ts`

**Tools:** Vitest, zero external dependencies  
**Run:** `pnpm --filter @qoomb/types test`

These are pure functions with no side effects. They are the most valuable tests per line of effort written — and the easiest to write correctly.

**Requirements:**

- One `describe` block per exported function
- One `it` per logical branch (each `if`/`else if`/`else`, each early-return guard)
- All implicit fallbacks for missing or `null` config tested explicitly

**Gold standard:** `packages/types/src/entities/list.utils.test.ts`

```typescript
// Every blocking rule + every fallback covered separately:
it('blocks the active checkbox field', () => { ... });
it('blocks the first checkbox field when checkboxFieldId is not configured (fallback)', () => { ... });
it('allows a checkbox field not referenced by any view', () => { ... });
```

**Coverage target:** 100% branch coverage. Pure functions with no IO — there is no excuse below this.

---

### 2b. Validators — `packages/validators/src/schemas/`

**Tools:** Vitest  
**Run:** `pnpm --filter @qoomb/validators test`

Zod schemas encode validation rules. Each schema test should verify the schema independently of any component that uses it.

**Requirements:**

- Test _valid_ input is accepted (parse succeeds)
- Test _each distinct rule_ rejects invalid input — one `it` per rule, not one `it` with many `expect`s
- At least one edge case per string field: empty string, max-length, `<script>alert(1)</script>`

```typescript
// ✅ GOOD — each rule is a separate, named test
it('rejects a title exceeding 500 characters', () => {
  expect(() => createEventSchema.parse({ ...valid, title: 'a'.repeat(501) })).toThrow();
});
it('rejects a missing title', () => {
  expect(() => createEventSchema.parse({ ...valid, title: undefined })).toThrow();
});

// ❌ BAD — multiple rules in one test; unclear which rule failed
it('validates the title field', () => {
  expect(() => schema.parse({ title: '' })).toThrow();
  expect(() => schema.parse({ title: 'a'.repeat(600) })).toThrow();
  expect(() => schema.parse({ title: undefined })).toThrow();
});
```

**Coverage target:** 100% of distinct validation rules. If a rule has no test, it might as well not exist.

---

### 2c. Backend services — `apps/api/src/modules/*/*.service.test.ts`

**Tools:** Jest + manual mocks (Prisma, EncryptionService)  
**Run:** `cd apps/api && pnpm test`

Services contain business logic. Tests use a mock Prisma client and an identity-encryption mock so business logic can be tested without a real database or key material.

**Requirements:**

**Happy path:**

- Verify _return value shape_, not just "it returned something"
- For create/update: verify the data passed to Prisma includes expected defaults (creator ID, hive ID)

**Error paths — mandatory for every mutation:**

```typescript
// Missing record
it('throws NOT_FOUND when event does not exist', async () => {
  mockPrisma.event.findUniqueOrThrow.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError('Not found', { code: 'P2025', ... })
  );
  await expect(svc.get('bad-id', hiveId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

// Cross-tenant defence
it('passes hiveId to the WHERE clause so cross-tenant reads are blocked', async () => {
  await svc.get(eventId, hiveId);
  expect(mockPrisma.event.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ hiveId }) })
  );
});
```

**Encryption invariant:**

```typescript
it('stores title as ciphertext (not plaintext)', () => {
  const data = buildCreateData({ title: 'Secret meeting' });
  svc.create(data, hiveId);
  const stored = mockPrisma.event.create.mock.calls[0][0].data.title;
  expect(stored).not.toBe('Secret meeting'); // identity mock returns the encrypted wrapper
});
```

**Identity-mock pattern for encryption:**  
Use `mockEnc.encrypt = jest.fn((v) => ({ _data: v }))` so that decorated methods still run the full encryption path but you can test business logic without real crypto. See `events.service.test.ts` for the established pattern.

**Coverage target:** Every public method has at minimum: happy path + 1 error path (e.g. not found, or forbidden). 100% branch coverage is ideal but not always achievable with pure unit tests.

---

### 2d. tRPC guards — `apps/api/src/trpc/guards.test.ts`

**Tools:** Jest

Guards translate booleans to `TRPCError`s. The test contract is:

- `true` → no throw
- `false` → throws `TRPCError` with `code === 'FORBIDDEN'` and the exact message

```typescript
it('thrown error has FORBIDDEN code', () => {
  expect(() => requireEnabled(false, 'msg')).toThrowMatching(
    (e) => e instanceof TRPCError && e.code === 'FORBIDDEN'
  );
});
```

This is the model for any new guard added to `guards.ts`.

---

### 2e. Frontend components / pages — `apps/web/src/**/*.test.tsx`

**Tools:** Vitest + Testing Library + jsdom  
**Run:** `pnpm --filter @qoomb/web test`

React tests should verify **user-visible outcomes**, not implementation internals like component state or internal variable values.

**The three non-negotiable states:**

```typescript
it('renders loading state', () => {
  setup({ isLoading: true });
  expect(screen.getByRole('progressbar')).toBeInTheDocument(); // or a spinner
});

it('renders empty state when no items', () => {
  setup({ data: [] });
  expect(screen.getByText(LL.lists.empty())).toBeInTheDocument();
});

it('renders the item list', () => {
  setup({ data: mockItems });
  expect(screen.getAllByRole('row')).toHaveLength(mockItems.length + 1); // +1 header
});
```

**Mutation payload — assert what matters:**

```typescript
// ❌ BAD — only asserts it was called
it('deletes the item', () => {
  fireEvent.click(screen.getByLabelText(LL.common.delete()));
  expect(mutateFn).toHaveBeenCalled();
});

// ✅ GOOD — asserts the correct ID was passed
it('deletes the correct item', () => {
  fireEvent.click(screen.getAllByLabelText(LL.common.delete())[0]);
  expect(mutateFn).toHaveBeenCalledWith({ id: 'item-001' });
});
```

**Interaction outcomes:**

```typescript
// ✅ GOOD — tests what changes after the user acts
it('navigates to the list after creation', async () => {
  fireEvent.click(screen.getByRole('button', { name: LL.common.create() }));
  await waitFor(() => {
    expect(mockNavigate).toHaveBeenCalledWith('/lists/list-001');
  });
});
```

**Coverage target:** Loading + empty + populated states; at least one mutation interaction with payload assertion.

---

### 2f. Accessibility tests — `apps/web/src/**/*.a11y.test.tsx`

**Tools:** Vitest + Testing Library + axe-core (`expectNoAxeViolations`)

Each main route needs a smoke test. These catch the most common a11y violations automatically (missing labels, bad heading hierarchy, contrast issues).

```typescript
it('has no axe violations in populated state', async () => {
  const { container } = setup({ data: mockItems });
  await expectNoAxeViolations(container);
});
```

Additionally for interactive elements like dialogs:

```typescript
it('closes on Escape key', () => {
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

---

### 2g. Encryption re-encryption scripts — `apps/api/prisma/scripts/reencrypt.test.ts`

When a new encrypted field or table is added, the re-encryption script and its tests **must** be updated as part of the same PR. See [ADR-0008](adr/0008-secure-reencryption-process.md) for the three-step rule.

Test requirements for `reencrypt.ts`:

- Dry-run mode: reports the count without writing
- Execute mode: re-encrypts to new key correctly (round-trips through new encryption)
- Skip-already-migrated: records with the new key version are not re-encrypted twice
- Backup written before the update: `reencrypt_backups` row exists before the new ciphertext is committed

---

## 3. Anti-Pattern Gallery

### AP-1: The Always-Passing Test

```typescript
// ❌ BAD — this test passes even if the function is deleted
it('returns a result', async () => {
  const result = await eventsService.list(hiveId);
  expect(result).toBeDefined();
});

// ✅ FIX — assert the actual shape
it('returns events sorted by startAt ascending', async () => {
  mockPrisma.event.findMany.mockResolvedValueOnce([eventB, eventA]);
  const result = await svc.list(hiveId, {});
  expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ orderBy: { startAt: 'asc' } })
  );
});
```

---

### AP-2: The Mock-Only Test (tests wiring, not logic)

```typescript
// ❌ BAD — only asserts the mock was invoked; passes even if the wrong args are used
it('creates an event', async () => {
  await svc.createEvent(createData, hiveId);
  expect(mockPrisma.event.create).toHaveBeenCalled();
});

// ✅ FIX — assert the full payload including security-relevant fields
it('creates an event with hiveId and creatorId set', async () => {
  await svc.createEvent({ title: 'Team sync', startAt: now, endAt: future }, hiveId);
  expect(mockPrisma.event.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      hiveId,
      creatorId: PERSON_ID,
      title: 'Team sync',
    }),
  });
});
```

---

### AP-3: The Happy-Path-Only Guard

```typescript
// ❌ BAD — canDeleteField has 4 blocking rules; this only tests that allowed returns true
describe('canDeleteField', () => {
  it('returns allowed: true', () => {
    expect(canDeleteField('f1', [field('f1'), field('f2')], [])).toEqual({ allowed: true });
  });
});

// ✅ FIX — test every reason a deletion can be blocked
it('blocks when it is the last field', () => { ... });
it('blocks the active checkbox field in a checklist view', () => { ... });
it('blocks when checkboxFieldId is not set (fallback to first checkbox)', () => { ... });
it('blocks the active title field', () => { ... });
it('blocks when titleFieldId is not set (fallback to first text field)', () => { ... });
it('allows a field referenced by no view', () => { ... });
```

---

### AP-4: The Render-Only Component Test

```typescript
// ❌ BAD — tests that React can mount the component without crashing; not useful
it('renders', () => {
  render(<ListsPage />);
  expect(document.body).toBeTruthy();
});

// ✅ FIX — test the three states + at least one interaction
it('shows empty state when no lists exist', () => {
  setup({ lists: [] });
  expect(screen.getByText(LL.lists.empty())).toBeInTheDocument();
});

it('passes the correct list ID to the delete mutation', () => {
  setup({ lists: mockLists });
  fireEvent.click(screen.getAllByLabelText(LL.common.delete())[0]);
  expect(mutateFn).toHaveBeenCalledWith({ id: 'list-001' });
});
```

---

### AP-5: The Coverage-Padding Test

```typescript
// ❌ BAD — tests trivial getter code to inflate coverage numbers
it('returns the key provider name', () => {
  expect(svc.keyProviderName).toBeDefined();
});

// The test does test something (non-null), but contributes near-zero value.
// Coverage on trivial accessors is not the goal — coverage on logic branches is.
```

Trivia: a class with 10 trivial getters and 1 complex method can show 90% coverage even with only getter tests. **Always focus on the complex method**.

---

## 4. Where Tests Live

| What                         | Location                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Domain util tests            | `packages/types/src/entities/*.utils.test.ts`                                |
| Validator schema tests       | `packages/validators/src/schemas/__tests__/*.test.ts`                        |
| Sanitizer tests              | `packages/validators/src/utils/__tests__/*.test.ts`                          |
| NestJS service tests         | `apps/api/src/modules/{module}/{module}.service.test.ts`                     |
| tRPC guard tests             | `apps/api/src/trpc/guards.test.ts`                                           |
| Encryption tests             | `apps/api/src/modules/encryption/*.test.ts`                                  |
| Re-encryption script tests   | `apps/api/prisma/scripts/reencrypt.test.ts`                                  |
| Guard infrastructure tests   | `apps/api/src/common/guards/*.test.ts`                                       |
| React page / component tests | `apps/web/src/pages/*.test.tsx`                                              |
| Accessibility smoke tests    | `apps/web/src/pages/*.a11y.test.tsx`, `apps/web/src/layouts/*.a11y.test.tsx` |
| Frontend component tests     | `apps/web/src/components/{area}/*.test.ts(x)`                                |

---

## 5. Running Tests

```bash
# All packages
pnpm test

# Specific package with coverage
pnpm --filter @qoomb/types test --coverage
pnpm --filter @qoomb/validators test --coverage

# Backend only (Jest)
cd apps/api && pnpm test
cd apps/api && pnpm test --coverage

# Frontend only (Vitest)
cd apps/web && pnpm test
cd apps/web && pnpm test --coverage

# Single file (fast feedback loop)
cd apps/web && pnpm test src/components/lists/listFieldGuards.test.ts
cd apps/api && pnpm test src/trpc/guards.test.ts
```

---

> **Last updated:** 2026-03-22
> **See also:** [`docs/CODE-REVIEW-CHECKLIST.md`](CODE-REVIEW-CHECKLIST.md) §8 for the quick-reference checklist
