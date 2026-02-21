# ADR-0003: Presentation Hooks for Derived UI State

**Status:** Accepted  
**Date:** 2026-02-20  
**Deciders:** Benjamin Gröner

## Context

Multiple frontend components need the same derived data about the current user:

- **Display name** (from `persons.me`, with email fallback)
- **Initials** (derived from display name)
- **Localised role label** (derived from DB role via i18n)

This data requires:

1. A tRPC query (`persons.me`)
2. Auth context (`useAuth`)
3. i18n context (`useI18nContext`)
4. Domain utility functions (`getInitials`, `ROLE_I18N_KEYS`)

When this logic lived inline in `Dashboard.tsx`, it could not be reused by the Sidebar,
UserMenu, MobileNav, or any other component that shows the current person's info —
leading to duplication or prop-drilling.

## Decision

Create **presentation hooks** in `apps/web/src/hooks/` that encapsulate:

1. Data fetching (tRPC query)
2. Context access (auth, i18n)
3. Derived value computation (memoised)

### Example: `useCurrentPerson`

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

**Naming convention:**

| Pattern          | Location              | Example                                |
| ---------------- | --------------------- | -------------------------------------- |
| `use<Entity>`    | `apps/web/src/hooks/` | `useCurrentPerson`, `useCurrentHive`   |
| Domain utils     | `@qoomb/types`        | `getInitials()`, `ROLE_I18N_KEYS`      |
| Generic UI hooks | `@qoomb/ui`           | `useMediaQuery()`, `useOnlineStatus()` |

**Rules:**

- One hook per entity/concern (SRP)
- Hooks compose domain utils (`@qoomb/types`) + tRPC + context — never duplicate logic
- Return a typed interface (not loose object) for discoverability
- All derived values are memoised
- Include `isLoading` so consumers can show loading states

## Consequences

### Easier

- **DRY** — Dashboard, Sidebar, MobileNav all call `useCurrentPerson()` instead of duplicating
- **Thin components** — pages focus purely on layout and event handling
- **Type-safe** — consumers get a well-typed `CurrentPerson` interface
- **Testable** — hooks can be tested with `renderHook()` in isolation

### Harder

- One more file per entity (but hooks are small and focused)
- Need to understand which hook to use (mitigated by consistent naming: `use<Entity>`)
- tRPC query deduplication relies on React Query's caching (multiple components calling the same
  hook don't trigger multiple network requests — this is handled automatically by `@tanstack/react-query`)
