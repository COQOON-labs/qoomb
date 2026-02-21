# ADR-0002: Domain-Driven Code Structure

**Status:** Accepted  
**Date:** 2026-02-20  
**Deciders:** Benjamin Gröner

## Context

As Qoomb grows, domain logic tends to leak into the wrong layers:

- **Permission resolution** duplicated across tRPC handlers and UI components
- **Role validation** and hive-type constraints scattered across backend modules
- **Display derivation** (initials, localised role labels) copy-pasted in page components
- **Visibility filtering** logic mixed into Prisma queries with no single source of truth

This creates several problems:

1. **Code duplication** — the same business rule exists in multiple places (violates DRY)
2. **Testing difficulty** — business logic entangled with framework code requires extensive mocking
3. **Misplaced responsibility** — presentation pages contain domain logic, backend handlers contain display logic (violates SRP)
4. **No sharing** — backend (email templates, seed scripts) can't reuse logic defined in frontend components, and vice versa
5. **Ripple effects** — changing a business rule (e.g. "managers can now delete any event") requires hunting across handlers, guards, and components

We need a structure that:

- Separates pure business logic from infrastructure and presentation
- Makes domain rules testable without framework mocks
- Allows independent evolution of each layer
- Provides clear boundaries and contracts between layers
- Scales as we add content types (Pages, Documents) in future phases

## Decision

We adopt a **three-layer structure** for domain logic, inspired by Domain-Driven Design and Clean Architecture:

```
packages/types/src/
├── entities/                    ← Entity definitions (types layer)
│   ├── person.ts                ← PersonRole enum, Person interface
│   ├── person.utils.ts          ← Domain logic for Person entity
│   ├── event.ts                 ← Event interface, CreateEventInput
│   ├── event.utils.ts           ← Domain logic for Event entity (future)
│   ├── task.ts                  ← Task interface, TaskStatus enum
│   ├── task.utils.ts            ← Domain logic for Task entity (future)
│   ├── hive.ts                  ← Hive types
│   ├── common.ts                ← BaseEntity, UUID, EncryptedEntity
│   └── index.ts                 ← Barrel re-exports
├── permissions.ts               ← RBAC rules, role→permission maps, access checks
└── index.ts                     ← Package entry point
```

### Layer Responsibilities

#### 1. Types Layer (Pure Definitions)

**Purpose:** Entity types, interfaces, enums — zero runtime code  
**Files:** `<entity>.ts`  
**Dependencies:** Only other types within the package

```typescript
// entities/person.ts — ONLY types, no functions
export enum PersonRole {
  PARENT = 'parent',
  CHILD = 'child',
  ORG_ADMIN = 'org_admin',
  MANAGER = 'manager',
  MEMBER = 'member',
  GUEST = 'guest',
}

export interface Person extends BaseEntity {
  hiveId: UUID;
  role: PersonRole;
  displayName?: string;
  // ...
}
```

**Rules:**

- Zero runtime code (no functions, no side effects)
- Only `type`, `interface`, and `enum` declarations
- Can import from other `.ts` entity files (e.g. `common.ts`)

#### 2. Domain Utilities Layer (Pure Business Logic)

**Purpose:** Functions that encode business rules and derive data from entities  
**Files:** `<entity>.utils.ts` and `permissions.ts`  
**Dependencies:** Types from layer 1 only — **no framework imports**

```typescript
// permissions.ts — business rules as pure functions
export function hasPermission(hiveType: string, role: string, permission: HivePermission): boolean {
  return getPermissionsForRole(hiveType, role).includes(permission);
}

export function hasPermissionWithOverrides(
  hiveType: string,
  role: string,
  permission: HivePermission,
  overrides: ReadonlyArray<{ permission: string; granted: boolean }>
): boolean {
  const effective = new Set(getPermissionsForRole(hiveType, role));
  for (const override of overrides) {
    if (override.granted) effective.add(override.permission);
    else effective.delete(override.permission);
  }
  return effective.has(permission);
}

export function isAdminRole(hiveType: string, role: string): boolean {
  return (
    (hiveType === 'family' && role === 'parent') ||
    (hiveType === 'organization' && role === 'org_admin')
  );
}
```

```typescript
// entities/person.utils.ts — domain logic for the Person entity
export function getInitials(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback.slice(0, 1).toUpperCase();
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const ROLE_I18N_KEYS = {
  [PersonRole.PARENT]: 'parent',
  [PersonRole.CHILD]: 'child',
  [PersonRole.ORG_ADMIN]: 'orgAdmin',
  // ...
} as const;
```

**Rules:**

- Pure functions only — no side effects (no I/O, no network, no database)
- Only imports from `@qoomb/types` internals and Node.js built-ins
- **Framework-agnostic** — no React, no NestJS, no ORM imports
- Defines contracts and rules, doesn't implement infrastructure
- Companion `.utils.ts` files are created only when needed (YAGNI applies)

#### 3. Application Layer (Orchestration)

**Purpose:** Coordinates domain logic, infrastructure, and framework-specific concerns  
**Location:** `apps/api/src/modules/` (backend) or `apps/web/src/hooks/` (frontend)  
**Dependencies:** Domain layer + framework + infrastructure

```typescript
// apps/api/src/common/guards/permission.guard.ts
// Uses domain functions but adds NestJS-specific orchestration
import { hasPermissionWithOverrides, isAdminRole } from '@qoomb/types';

export async function requirePermission(ctx, permission: HivePermission) {
  const overrides = await loadOverrides(ctx.hiveId); // Infrastructure
  const allowed = hasPermissionWithOverrides(
    // Domain logic
    ctx.hiveType,
    ctx.role,
    permission,
    overrides
  );
  if (!allowed) throw new ForbiddenException(); // Framework
}
```

```typescript
// apps/web/src/hooks/useCurrentPerson.ts
// Uses domain functions but adds React-specific state management
import { getInitials, ROLE_I18N_KEYS } from '@qoomb/types';

export function useCurrentPerson(): CurrentPerson {
  const { data: person } = trpc.persons.me.useQuery(); // Infrastructure
  const initials = getInitials(person?.displayName); // Domain logic
  const roleLabel = LL.roles[ROLE_I18N_KEYS[role]](); // Presentation
  return { displayName, initials, roleLabel, isLoading };
}
```

**Rules:**

- Knows about domain and infrastructure, but delegates business rules to domain layer
- Handles framework concerns (DI, hooks, guards, error responses)
- Never duplicates business logic that belongs in domain utils

### What Lives Where

| Logic                        | Layer          | Location            | Example                                    |
| ---------------------------- | -------------- | ------------------- | ------------------------------------------ |
| Entity shapes, enums         | Types          | `<entity>.ts`       | `PersonRole`, `TaskStatus`, `HiveType`     |
| Role→permission mapping      | Domain         | `permissions.ts`    | `HIVE_ROLE_PERMISSIONS`, `hasPermission()` |
| Admin role detection         | Domain         | `permissions.ts`    | `isAdminRole()`                            |
| Permission with DB overrides | Domain         | `permissions.ts`    | `hasPermissionWithOverrides()`             |
| Display name derivation      | Domain         | `person.utils.ts`   | `getInitials()`                            |
| Role→i18n key bridge         | Domain         | `person.utils.ts`   | `ROLE_I18N_KEYS`                           |
| Hive-type role validation    | Domain         | `permissions.ts`    | `VALID_ROLES_BY_HIVE_TYPE`                 |
| tRPC handlers, NestJS guards | Application    | `apps/api/src/`     | `requirePermission()`                      |
| React hooks, components      | Application    | `apps/web/src/`     | `useCurrentPerson()`                       |
| Prisma queries, Redis calls  | Infrastructure | `apps/api/src/`     | `PrismaService`, `RedisService`            |
| Zod schemas, sanitizers      | Validation     | `@qoomb/validators` | `createEventSchema`                        |

### What Does NOT Live in `@qoomb/types`

- React hooks or components → `apps/web/src/hooks/` or `@qoomb/ui`
- Zod schemas or input validation → `@qoomb/validators`
- HTML sanitization or security utils → `@qoomb/validators`
- Database queries or ORM logic → `apps/api/src/`
- Framework-specific error handling → application layer

## Rationale

### Why This Structure?

1. **Testability**
   - Domain layer: test with zero mocks (pure functions)
   - Application layer: mock only infrastructure interfaces
   - Infrastructure layer: mock database/cache or use test containers

2. **Shareability**
   - `@qoomb/types` is consumed by both `apps/api` and `apps/web`
   - Permission checks, role validation, display logic — all shared from one source
   - Future: CLI tools, mobile-specific logic, email renderers all use the same domain

3. **Type Safety**
   - Domain defines contracts (enums, interfaces, function signatures)
   - TypeScript enforces dependency direction at compile time
   - Changing a `PersonRole` value propagates errors to every consumer

4. **Portability**
   - Domain layer has no runtime dependencies — could run in browser, server, CLI, or edge worker
   - Infrastructure can be swapped (different database, different cache) without touching domain

### Rejected Alternatives

- **Single-file modules**: Simple initially, becomes unmaintainable as entities grow in complexity
- **Domain logic in backend only**: Frontend can't share rules — leads to duplicated permission checks, display logic, and validation
- **Full DDD (Aggregates, Value Objects, Bounded Contexts)**: Overkill for the current scale — would add unnecessary abstraction layers. Can be adopted later if complexity demands it
- **Separate `domain` package**: Adds package overhead and build steps; co-locating `.utils.ts` alongside `.ts` entity files is simpler and equally discoverable

## Implementation Guidelines

### Dependency Flow (Dependency Inversion)

```
        ┌──────────────────────┐
        │   Application Layer  │  ← Orchestrates (NestJS, React)
        │   (apps/api, web)    │
        └──────────┬───────────┘
                   │ imports
        ┌──────────▼───────────┐
        │   Domain Layer       │  ← Pure business logic
        │   (@qoomb/types)     │
        └──────────┬───────────┘
                   │ imports
        ┌──────────▼───────────┐
        │   Types Layer        │  ← Enums, interfaces
        │   (entities/*.ts)    │
        └──────────────────────┘
```

**Key constraint:** Domain imports types. Application imports domain. **Never** the reverse.

### Adding a New Domain Utility

1. **Types** — add types/interfaces in `<entity>.ts` (if not already present)
2. **Domain** — add pure function in `<entity>.utils.ts` (import only from layer 1)
3. **Application** — use in backend handlers or frontend hooks (import from `@qoomb/types`)
4. **Re-export** through barrel `index.ts` — consumers always import from `@qoomb/types`

### Frontend Application Layer (Presentation Hooks)

When multiple frontend components need the same **derived data** (display names, initials,
localised role labels), that logic is encapsulated in a presentation hook rather than
duplicated across components.

**Pattern:** `use<Entity>()` hooks in `apps/web/src/hooks/`

```typescript
// apps/web/src/hooks/useCurrentPerson.ts
export function useCurrentPerson(): CurrentPerson {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const { data: person, isLoading } = trpc.persons.me.useQuery(...);

  const displayName = person?.displayName ?? user?.email ?? '—';
  const initials = useMemo(() => getInitials(...), [deps]);
  const roleLabel = useMemo(() => LL.roles[ROLE_I18N_KEYS[role]](), [deps]);

  return { displayName, initials, role, roleLabel, isLoading };
}
```

**Hook placement:**

| Hook type          | Location              | Example                                |
| ------------------ | --------------------- | -------------------------------------- |
| App-specific hooks | `apps/web/src/hooks/` | `useCurrentPerson`, `useCurrentHive`   |
| Generic UI hooks   | `@qoomb/ui`           | `useMediaQuery()`, `useOnlineStatus()` |

**Rules:**

- One hook per entity/concern (SRP)
- Hooks compose domain utils (`@qoomb/types`) + tRPC + context — never duplicate logic
- Return a typed interface (not loose object) with `isLoading` for loading states
- All derived values are memoised
- tRPC query deduplication is handled automatically by `@tanstack/react-query`

### Testing Strategy

| Layer       | What to mock         | Example                                          |
| ----------- | -------------------- | ------------------------------------------------ |
| Domain      | Nothing — pure funcs | `expect(getInitials('John Doe', '')).toBe('JD')` |
| Application | Infrastructure only  | Mock Prisma/Redis, real domain logic             |
| Hooks       | tRPC + context       | `renderHook()` with mocked providers             |

## Consequences

### Positive

- **Fewer mocks in tests** — domain layer needs zero, application layer mocks only infrastructure
- **Clear ownership** — each layer has one reason to change (SRP)
- **DRY presentation logic** — `use<Entity>()` hooks eliminate duplicate derived-state computation across components
- **Newcomer-friendly** — structure guides where code belongs (types? utils? hook? guard?)
- **Refactoring safety** — TypeScript enforces contracts across layer boundaries
- **Portable business logic** — domain layer runs anywhere TypeScript runs
- **Single source of truth** — permission rules, role mappings, display logic defined once

### Negative

- **More files** — each entity may get `.utils.ts` + a presentation hook (mitigated by YAGNI — only when needed)
- **Rebuild step** — changes to `@qoomb/types` require `pnpm --filter @qoomb/types build`
- **Learning curve** — developers must understand which layer owns which responsibility

## References

- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Clean Architecture by Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hexagonal Architecture (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture/)
