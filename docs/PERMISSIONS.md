# Qoomb — Permission & Access Control Architecture

> **Audience:** Developers implementing or extending content modules.
> **Status:** Current as of groups + shares redesign (Feb 2026).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Entities & Roles](#2-entities--roles)
3. [Default Role Permissions](#3-default-role-permissions)
4. [Per-Hive Permission Overrides](#4-per-hive-permission-overrides)
5. [Resource Visibility Types](#5-resource-visibility-types)
6. [AccessLevel — Ordinal Share Grants](#6-accesslevel--ordinal-share-grants)
7. [Groups — HiveGroup & HiveGroupMember](#7-groups--hivegroup--hivegroupmember)
8. [PersonShare & GroupShare — Explicit Grants](#8-personshare--groupshare--explicit-grants)
9. [Access Resolution Algorithm](#9-access-resolution-algorithm)
10. [List & Search — Visibility Filter](#10-list--search--visibility-filter)
11. [Guard API Reference](#11-guard-api-reference)
12. [Planned: `allowPrivateResources` Hive Setting](#12-planned-allowprivateresources-hive-setting)
13. [DB Schema Reference](#13-db-schema-reference)
14. [Design Notes & Edge Cases](#14-design-notes--edge-cases)

---

## 1. Overview

Qoomb uses a layered, fail-closed permission system. Each layer adds defense-in-depth; no single layer is the sole gatekeeper.

```
Layer 1: JWT Authentication
    ↓  "are you who you say you are?"
Layer 2: hiveProcedure (tRPC middleware)
    ↓  "are you a member of this hive? what is your role? which groups?"
Layer 3: Role-Based Permission Check (with per-hive DB overrides)
    ↓  "does your role have the required permission?"
Layer 4: Resource-Level Access Check
    ↓  "can you specifically act on this resource? (visibility + shares)"
Layer 5: Row-Level Security (PostgreSQL)
    ↓  "even if the app is wrong, the DB won't leak data"
```

**Core Design Principles:**

- **Fail-closed**: Missing context → `FORBIDDEN`. Never fail-open.
- **Uniform error messages**: Every denial returns `'Insufficient permissions'`. No information leakage about _why_ access was denied.
- **No admin bypass for private/group content**: Admin roles (`parent`, `org_admin`) do NOT have universal access. Private resources require a share or being the creator. Group resources require group membership (or a share).
- **Shares are additive for `'hive'`/`'admins'`**: A share can only elevate access beyond the role baseline.
- **Shares are exclusive for `'group'`/`'private'`**: The only access path besides membership/creator status.
- **Ordinal access levels**: `VIEW (1) < EDIT (2) < MANAGE (3)`. Higher implies lower — a MANAGE share grants view and edit too.
- **MANAGE includes re-sharing rights**: Persons with a MANAGE share can create/modify shares for that resource.

---

## 2. Entities & Roles

### User vs Person

| Entity   | Scope    | Purpose                                                 |
| -------- | -------- | ------------------------------------------------------- |
| `User`   | Global   | Authentication identity (email, password, sessions)     |
| `Person` | Per-hive | Hive identity with a `role` (what you can do in a hive) |

One `User` can have multiple `Person` records across different hives. Permission checks always operate on `Person`, never on `User`.

### Roles per Hive Type

**Family Hive** — minimum 1 `parent` enforced by DB trigger `enforce_minimum_admin`

| Role     | Description                          |
| -------- | ------------------------------------ |
| `parent` | Full admin — all permissions         |
| `child`  | Reduced set — can manage own content |

**Organization Hive** — minimum 1 `org_admin` enforced by DB trigger

| Role        | Description                                   |
| ----------- | --------------------------------------------- |
| `org_admin` | Full admin — all permissions                  |
| `manager`   | Can manage all content, invite/remove members |
| `member`    | Can create and manage own content             |
| `guest`     | Read-only — can only view                     |

### Admin Roles

`parent` and `org_admin` are the "admin roles" for their respective hive types. This designation matters only in the context of `visibility = 'admins'` (see Section 5). It does **not** grant universal access.

---

## 3. Default Role Permissions

Defined in `packages/types/src/permissions.ts` as `HIVE_ROLE_PERMISSIONS`. In-memory only — zero DB cost.

### HivePermission enum values

```
hive:update            hive:delete
members:view           members:invite        members:manage        members:remove
events:view            events:create
events:update:own      events:update:any
events:delete:own      events:delete:any
tasks:view             tasks:create
tasks:update:own       tasks:update:any
tasks:delete:own       tasks:delete:any
```

### Family Hive defaults

| Permission                       | parent | child |
| -------------------------------- | :----: | :---: |
| hive:update / hive:delete        |   ✓    |   —   |
| members:view                     |   ✓    |   ✓   |
| members:invite / manage / remove |   ✓    |   —   |
| events:view / create             |   ✓    |   ✓   |
| events:update:own                |   ✓    |   ✓   |
| events:update:any                |   ✓    |   —   |
| events:delete:own                |   ✓    |   ✓   |
| events:delete:any                |   ✓    |   —   |
| tasks:view / create              |   ✓    |   ✓   |
| tasks:update:own                 |   ✓    |   ✓   |
| tasks:update:any                 |   ✓    |   —   |
| tasks:delete:own                 |   ✓    |   ✓   |
| tasks:delete:any                 |   ✓    |   —   |

### Organization Hive defaults

| Permission                | org_admin | manager |  member  |   guest   |
| ------------------------- | :-------: | :-----: | :------: | :-------: |
| hive:update / hive:delete |     ✓     |    —    |    —     |     —     |
| members:view              |     ✓     |    ✓    |    ✓     |     ✓     |
| members:invite / remove   |     ✓     |    ✓    |    —     |     —     |
| members:manage            |     ✓     |    —    |    —     |     —     |
| events:view / create      |     ✓     |    ✓    |    ✓     | view only |
| events:update:own / any   |     ✓     |  both   | own only |     —     |
| events:delete:own / any   |     ✓     |  both   |    —     |     —     |
| tasks:view / create       |     ✓     |    ✓    |    ✓     | view only |
| tasks:update:own / any    |     ✓     |  both   | own only |     —     |
| tasks:delete:own / any    |     ✓     |  both   |    —     |     —     |

---

## 4. Per-Hive Permission Overrides

Stored in the `hive_role_permissions` table. Allows a hive admin to customize role permissions beyond the global defaults — for example, granting `child` the ability to delete any event, or revoking `member`'s create permission.

### Mechanics

```
effective_permissions =
  global HIVE_ROLE_PERMISSIONS defaults for (hiveType, role)
  + rows with granted = true  (adds to the set)
  - rows with granted = false (removes from the set)
```

**Critical:** A `granted = false` override is a hard revoke. It removes the permission from the effective set regardless of defaults. A `granted = true` override adds a permission even if it's not in the defaults.

### Performance

`hiveProcedure` loads all `hive_role_permissions` for the current hive in a single parallel query (alongside `hive.type`, `person.role`, and group memberships). Typically 0 rows. After loading, the result is filtered in-memory to the current person's role. The table is indexed on `hive_id`.

### Current State

The UI to manage these overrides is not yet implemented. The table is always empty in practice. The code fully supports it.

---

## 5. Resource Visibility Types

Every resource (Event, Task, and future content types) carries a `visibility` field (`String`, default `'hive'`). Resources may additionally carry a `groupId` (required when `visibility = 'group'`).

| Visibility  | Who can access (base — shares can elevate)                           |
| ----------- | -------------------------------------------------------------------- |
| `'hive'`    | Any hive member with the view permission for this resource type      |
| `'admins'`  | Only admin roles (`parent` / `org_admin`) with the view permission   |
| `'group'`   | Only members of the resource's group (VIEW action), plus the creator |
| `'private'` | Only the creator — no exceptions, including admins                   |

### Semantic notes

**`'hive'` — Default visibility**
The resource is visible to all hive members who hold the view permission for this resource type (e.g., `events:view`). This is the standard "everyone in the family sees the dentist appointment" case.

**`'admins'` — Admin-restricted content**
The creator explicitly marks the resource as for-admins-only. A family member creates a "Christmas gift budget" event visible only to parents. Admins must still hold the view permission (subject to per-hive overrides). A share can grant a non-admin explicit access to an `'admins'` resource.

**`'group'` — Group-restricted content**
The resource is visible to and (for VIEW) accessible by members of the associated group. The creator always has full access. Non-member admins gain access by joining the group — this is intentional and auditable (no silent bypass). Shares can grant access to persons outside the group.

**`'private'` — Creator-only content**
The resource is visible and editable exclusively by the creator. No admin override exists. Even the hive owner cannot access a private resource without an explicit `PersonShare`. This is true privacy — "your private stuff, your rules."

---

## 6. AccessLevel — Ordinal Share Grants

Defined in `packages/types/src/permissions.ts` as `AccessLevel`.

```typescript
export enum AccessLevel {
  VIEW = 1, // Can read the resource
  EDIT = 2, // Can read + edit the resource
  MANAGE = 3, // Can read + edit + delete + create/modify shares for this resource
}
```

**Key property:** Higher levels imply lower levels. A `MANAGE` share grants view and edit too — no need to check all three. The guard compares `effectiveShareLevel >= requiredLevel` numerically.

| Action   | Required Level |
| -------- | -------------- |
| `view`   | `VIEW (1)`     |
| `edit`   | `EDIT (2)`     |
| `delete` | `MANAGE (3)`   |

**MANAGE includes re-sharing rights**: A person with a `MANAGE` share may create/modify `PersonShare` and `GroupShare` rows for that resource. This must be enforced in the share-management handlers.

---

## 7. Groups — HiveGroup & HiveGroupMember

### Purpose

Groups allow resources to be scoped to a subset of hive members. Any hive member with `members:manage` permission (typically admins) can create groups and manage membership.

### Tables

- **`hive_groups`** — Group definitions: `id`, `hiveId`, `name`, `description`
- **`hive_group_members`** — Membership junction: `groupId`, `personId`, `hiveId`, `addedByPersonId` (audit trail), `joinedAt`

### Group resource access design

- `visibility = 'group'` resources carry a `groupId` FK pointing to their group.
- Only members of that group can view the resource (VIEW action). The creator always has full access regardless of membership.
- For EDIT/DELETE on group resources, an explicit `PersonShare` or `GroupShare` with sufficient `accessLevel` is required, or the person must be the creator with the appropriate OWN permission.
- **Admins gain access to group content by joining the group.** This is auditable via `addedByPersonId` and `joinedAt`. There is no silent admin bypass.
- Any admin can add themselves to any group; this action is visible in the membership record.

### Context loading

`hiveProcedure` loads the current person's group IDs in parallel with other hive data:

```typescript
const groupMemberships = await ctx.prisma.hiveGroupMember.findMany({
  where: { personId: ctx.user.personId, hiveId: ctx.user.hiveId },
  select: { groupId: true },
});
// Available as ctx.user.groupIds: ReadonlyArray<string>
```

---

## 8. PersonShare & GroupShare — Explicit Grants

Two share tables replace the old `resource_shares` table:

- **`person_shares`** — Grant a specific person an access level on a resource.
- **`group_shares`** — Grant all members of a group an access level on a resource.

Both use the same ordinal `accessLevel: Int` (`1|2|3` = `VIEW|EDIT|MANAGE`).

### Fields (both tables)

```
hiveId        — defense-in-depth filter (RLS also enforces this)
resourceType  — 'event' | 'task' | 'note' | ...
resourceId    — UUID of the resource (polymorphic, no FK)
personId/groupId — recipient of the grant
accessLevel   — AccessLevel.VIEW (1) | EDIT (2) | MANAGE (3)
```

### Share creation rules

| Resource Visibility   | Who can create/modify shares                                                         |
| --------------------- | ------------------------------------------------------------------------------------ |
| `'private'`           | Only the resource creator                                                            |
| `'group'`             | Resource creator OR person with `accessLevel = MANAGE` on the resource               |
| `'hive'` / `'admins'` | Resource creator OR person with `accessLevel = MANAGE` on the resource OR admin role |

### Share behavior by visibility

| Visibility              | Share role                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `'hive'` / `'admins'`   | **Additive** — elevates access beyond role baseline (e.g. a MANAGE share on a 'hive' event lets a guest delete it)         |
| `'group'` / `'private'` | **Exclusive path** — the only access route besides membership/creator; does not affect base role access to other resources |

### Effective share level

When checking access, both personal and group shares for the current person are loaded in parallel. The **maximum** access level across all applicable shares is the effective share level:

```
effectiveShareLevel = max(
  0,                           // no shares → 0
  personalShare?.accessLevel,  // direct person grant
  ...groupShares.map(s => s.accessLevel)  // all group grants for person's groups
)
```

---

## 9. Access Resolution Algorithm

Implemented in `apps/api/src/common/guards/resource-access.guard.ts` as `requireResourceAccess`.

```
Input:
  - ctx.user: { hiveType, role, roleOverrides, personId, hiveId, groupIds }
  - resource:  { type, id, creatorId, visibility, groupId? }
  - action:    'view' | 'edit' | 'delete'
  - permissions: { view, edit, editOwn?, delete, deleteOwn? }

Resolution order (first matching stage wins):

Stage 1: Load shares in parallel
  → Personal share (person_shares WHERE personId + resourceId)
  → Group shares   (group_shares WHERE groupId IN person's groups + resourceId)
  → effectiveShareLevel = max(0, all applicable access levels)

Stage 2: visibility = 'private'?
  → Allow if personId === creatorId  (creator always has full access)
  → Allow if effectiveShareLevel >= required
  → Otherwise: FORBIDDEN

Stage 3: visibility = 'group'?
  → Allow if personId === creatorId
  → Allow if group member AND action = VIEW
  → Allow if effectiveShareLevel >= required
  → Otherwise: FORBIDDEN

Stage 4: visibility = 'admins'?
  → Allow if effectiveShareLevel >= required  (share grants exception)
  → Deny if not isAdminRole(hiveType, role)   (non-admin without share)
  → Admin confirmed — fall through to Stage 5

Stage 5: visibility = 'hive' or 'admins' (admin confirmed above)
  → Allow if effectiveShareLevel >= required  (additive elevation)
  → Check anyPermission (e.g. events:update:any) with DB overrides → allow if held
  → Check ownPermission + (personId === creatorId) → allow if both true
  → Otherwise: FORBIDDEN

Fail-closed: missing hiveType, role, or personId in ctx.user → FORBIDDEN.
```

### Example — Event Permissions

```typescript
const EVENT_PERMISSIONS: ResourcePermissions = {
  view: HivePermission.EVENTS_VIEW,
  edit: HivePermission.EVENTS_UPDATE_ANY,
  editOwn: HivePermission.EVENTS_UPDATE_OWN,
  delete: HivePermission.EVENTS_DELETE_ANY,
  deleteOwn: HivePermission.EVENTS_DELETE_OWN,
};

// In a tRPC mutation:
await requireResourceAccess(
  ctx,
  ctx.prisma,
  {
    type: 'event',
    id: event.id,
    creatorId: event.creatorId,
    visibility: event.visibility,
    groupId: event.groupId ?? undefined,
  },
  'edit',
  EVENT_PERMISSIONS
);
```

### When to use which guard

| Operation       | Guard                                         | Reason                  |
| --------------- | --------------------------------------------- | ----------------------- |
| `events.create` | `requirePermission(ctx, EVENTS_CREATE)`       | No resource ID yet      |
| `events.list`   | `requirePermission` + `buildVisibilityFilter` | Bulk — no per-row guard |
| `events.get`    | `requireResourceAccess(..., 'view', ...)`     | Full resolution needed  |
| `events.update` | `requireResourceAccess(..., 'edit', ...)`     | Full resolution needed  |
| `events.delete` | `requireResourceAccess(..., 'delete', ...)`   | Full resolution needed  |

---

## 10. List & Search — Visibility Filter

For `findMany` and search queries, calling `requireResourceAccess` per result would cause N+1 queries. Instead, use `buildVisibilityFilter` to generate a single Prisma `WHERE` clause that encodes the same logic for VIEW access.

```typescript
import { buildVisibilityFilter } from '../common/guards';

const events = await ctx.prisma.event.findMany({
  where: {
    hiveId: ctx.user.hiveId,
    ...buildVisibilityFilter(ctx.user as VisibilityFilterContext, HivePermission.EVENTS_VIEW),
  },
});
```

### Generated OR conditions

```typescript
{
  OR: [
    // 'hive': role has the view permission
    ...(canViewAll ? [{ visibility: 'hive' }] : []),

    // 'admins': admin role AND has view permission
    ...(isAdmin && canViewAll ? [{ visibility: 'admins' }] : []),

    // 'group': person is a member of the resource's group
    ...(groupIds.length > 0
      ? [{ visibility: 'group', groupId: { in: groupIds } }]
      : []),

    // 'private': own resources only
    { visibility: 'private', creatorId: personId },

    // Any visibility: personal share with at least VIEW access
    { personShares: { some: { personId, accessLevel: { gte: AccessLevel.VIEW } } } },

    // Any visibility: group share for one of person's groups with at least VIEW access
    ...(groupIds.length > 0
      ? [{
          groupShares: {
            some: { groupId: { in: groupIds }, accessLevel: { gte: AccessLevel.VIEW } },
          },
        }]
      : []),
  ],
}
```

This filter is intentionally compatible with future pgvector semantic search (Phase 4) — the same WHERE clause can be passed as an additional filter to vector search queries.

---

## 11. Guard API Reference

### `requirePermission(ctx, permission)`

Checks whether the current user's role holds the given permission, including per-hive DB overrides. Throws `FORBIDDEN` if not held or if `hiveType`/`role` is missing.

```typescript
import { requirePermission } from '../common/guards';
requirePermission(ctx, HivePermission.EVENTS_CREATE);
```

### `requirePermissionOrOwnership(ctx, anyPermission, ownPermission, creatorId)`

Checks ANY permission first. If not held, checks OWN permission + `personId === creatorId`. Useful as a pre-check before loading a resource, when visibility is not yet relevant.

```typescript
requirePermissionOrOwnership(
  ctx,
  HivePermission.EVENTS_UPDATE_ANY,
  HivePermission.EVENTS_UPDATE_OWN,
  event.creatorId
);
```

### `requireResourceAccess(ctx, prisma, resource, action, permissions)`

Full 5-stage resolution including share lookup, group membership check, visibility enforcement, and OWN/ANY role logic. Always use this for get/update/delete operations on a loaded resource.

```typescript
await requireResourceAccess(
  ctx,
  ctx.prisma,
  {
    type: 'event',
    id: event.id,
    creatorId: event.creatorId,
    visibility: event.visibility,
    groupId: event.groupId ?? undefined,
  },
  'edit',
  EVENT_PERMISSIONS
);
```

### `buildVisibilityFilter(ctx, viewPermission)`

Returns a Prisma `{ OR: [...] }` filter for list/search queries. Encodes the same visibility logic as `requireResourceAccess` for VIEW access as a SQL WHERE clause.

---

## 12. Planned: `allowPrivateResources` Hive Setting

**Status: Not yet implemented. DB migration and validator changes required.**

### Motivation

The concern is "pseudo privacy" — a hive where privacy exists but can be administratively overridden at any time, leading users to believe their content is private when it might not be. The principle: **if privacy is advertised, it must be genuine.**

### Proposed Behavior

A new field on `Hive`: `allowPrivateResources: Boolean @default(true)`.

| Setting          | Effect                                                                    |
| ---------------- | ------------------------------------------------------------------------- |
| `true` (default) | Members can create resources with `visibility = 'private'`                |
| `false`          | The API rejects any create/update that would set `visibility = 'private'` |

### Grandfathering

When a hive admin changes `allowPrivateResources` from `true` to `false`:

- **Existing** `private` resources remain private. No data migration.
- **New** `private` resources are blocked at the API level.
- The setting change does **not** grant admins access to existing private resources.

### Implementation plan

1. **DB**: Add `allow_private_resources Boolean DEFAULT true` to `hives` table. Prisma migration.
2. **hiveProcedure context**: Load `hive.allowPrivateResources` alongside `hive.type` and add to `ctx.user`.
3. **Procedure handlers**: Before creating or updating a resource, check `if (input.visibility === 'private' && !ctx.user.allowPrivateResources)` → throw `FORBIDDEN`.

---

## 13. DB Schema Reference

### `hive_role_permissions` (role permission overrides)

```sql
id         UUID PRIMARY KEY
hive_id    UUID REFERENCES hives(id) ON DELETE CASCADE
role       VARCHAR(50)
permission VARCHAR(100)
granted    BOOLEAN   -- true = grant, false = revoke
UNIQUE (hive_id, role, permission)
INDEX (hive_id)
RLS: hive_id = current_setting('app.hive_id', true)::uuid
```

### `hive_groups` (group definitions)

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
hive_id     UUID REFERENCES hives(id) ON DELETE CASCADE
name        VARCHAR(255)
description TEXT
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
INDEX (hive_id)
RLS: hive_id = current_setting('app.hive_id', true)::uuid
```

### `hive_group_members` (group membership + audit)

```sql
id                 UUID PRIMARY KEY
hive_id            UUID REFERENCES hives(id) ON DELETE CASCADE
group_id           UUID REFERENCES hive_groups(id) ON DELETE CASCADE
person_id          UUID REFERENCES persons(id) ON DELETE CASCADE
added_by_person_id UUID REFERENCES persons(id) ON DELETE SET NULL
joined_at          TIMESTAMPTZ
UNIQUE (group_id, person_id)
INDEX (hive_id), INDEX (person_id)
RLS: hive_id = current_setting('app.hive_id', true)::uuid
```

### `person_shares` (per-person explicit grants)

```sql
id            UUID PRIMARY KEY
hive_id       UUID REFERENCES hives(id) ON DELETE CASCADE
resource_type VARCHAR(50)
resource_id   UUID          -- polymorphic, no FK
person_id     UUID REFERENCES persons(id) ON DELETE CASCADE
access_level  SMALLINT      -- AccessLevel: 1=VIEW, 2=EDIT, 3=MANAGE
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
UNIQUE (resource_type, resource_id, person_id)
INDEX (hive_id, resource_type, resource_id)
RLS: hive_id = current_setting('app.hive_id', true)::uuid
```

### `group_shares` (per-group explicit grants)

```sql
id            UUID PRIMARY KEY
hive_id       UUID REFERENCES hives(id) ON DELETE CASCADE
resource_type VARCHAR(50)
resource_id   UUID          -- polymorphic, no FK
group_id      UUID REFERENCES hive_groups(id) ON DELETE CASCADE
access_level  SMALLINT      -- AccessLevel: 1=VIEW, 2=EDIT, 3=MANAGE
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
UNIQUE (resource_type, resource_id, group_id)
INDEX (hive_id, resource_type, resource_id)
RLS: hive_id = current_setting('app.hive_id', true)::uuid
```

### `events` / `tasks` (content tables)

Both carry:

```sql
hive_id    UUID REFERENCES hives(id)
creator_id UUID REFERENCES persons(id)
group_id   UUID REFERENCES hive_groups(id) ON DELETE SET NULL  -- nullable
visibility VARCHAR(20) DEFAULT 'hive'
  CHECK (visibility IN ('hive', 'admins', 'group', 'private'))
```

---

## 14. Design Notes & Edge Cases

### 14.1 No OWN permission for `view`

There is no `events:view:own` permission. A role either has `events:view` (sees all hive events) or nothing. You cannot have a role that only sees its own events via role-based access.

**This is intentional.** The use case "see only my own events" is served by creating events with `visibility = 'private'`. Private resources are always visible to the creator regardless of role. No `VIEW_OWN` permission needed.

---

### 14.2 Admin access to `'group'` resources

Admins do not have a silent bypass for group resources. To access a `'group'` resource, an admin must join the group — which is recorded in `hive_group_members.addedByPersonId` and `joinedAt`. This makes admin access to group content transparent and auditable.

If an admin needs emergency access to a group resource without joining the group (e.g. for compliance), an explicit `PersonShare` can be created with `MANAGE` access.

---

### 14.3 Share creation for `'private'` resources

Only the resource creator may create `PersonShare` or `GroupShare` rows for a `'private'` resource. This must be enforced in share-management handlers:

```typescript
if (resource.visibility === 'private' && resource.creatorId !== ctx.user.personId) {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
}
```

This prevents a scenario where an admin could grant themselves access to a private resource by creating a share, without ever viewing the resource content.

---

### 14.4 Polymorphic `resource_id` — no referential integrity

`person_shares.resource_id` and `group_shares.resource_id` have no foreign keys. If a resource is deleted, its share rows remain in the DB. Orphaned shares are harmless — the resource cannot be loaded anyway. However, they accumulate over time.

**Recommendation:** When deleting a resource, delete associated share rows in the same transaction.

---

### 14.5 `allowPrivateResources = false` does not retroactively unlock existing private resources

An admin setting `allowPrivateResources = false` (transparency policy) does not grant access to existing private resources. Those remain private. The setting only prevents new private resources from being created.

**Recommendation:** The UI should display a warning when toggling this setting, noting that existing private content remains private.

---

### 14.6 `roleOverrides` filter: all-or-nothing hive load

`hiveProcedure` loads all `hive_role_permissions` for the hive (no role filter in SQL), then filters in-memory to the current person's role. This allows all four queries in `hiveProcedure` to run in parallel. The override table is typically empty and indexed on `hive_id`.

If the table grows large for high-override hives, add a role filter to the query (requires sequential loading). For current scope, the parallel approach is correct.

---

### 14.7 Resource access check on list operations

`buildVisibilityFilter` generates the VIEW visibility WHERE clause but does not inline edit/delete permission checks. For bulk operations (e.g. "delete all my tasks"), the caller must add explicit ownership/permission filters manually or call `requireResourceAccess` per item.

For Phase 2, per-item checking is acceptable since bulk destructive operations are unlikely. A `buildActionFilter` helper can be added later if needed.
