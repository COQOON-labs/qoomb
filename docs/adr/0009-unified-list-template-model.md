# ADR-0009: Unified List/Template Model

**Status:** Accepted  
**Date:** 2026-03-17  
**Deciders:** Benjamin Gröner

## Context

The initial Lists implementation (ADR-0007) introduced three separate template tables:
`list_templates`, `list_template_fields`, and `list_template_views`. These are structurally
almost identical to `lists`, `list_fields`, and `list_views`:

| Column       | `ListField` | `ListTemplateField` |
| ------------ | ----------- | ------------------- |
| `name`       | ✅          | ✅                  |
| `fieldType`  | ✅          | ✅                  |
| `config`     | ✅          | ✅                  |
| `isRequired` | ✅          | ✅                  |
| `isTitle`    | ✅          | ✅                  |
| `sortOrder`  | ✅          | ✅                  |
| `listId`     | ✅          | ❌ (`templateId`)   |
| `createdAt`  | ✅          | ❌                  |

Every new `ListField` feature (new field type, `updatedAt` for LWW sync, etc.) requires changes
in four places: `ListField`, `ListTemplateField`, the list service, and the template service.

### Forces

- No production data exists yet — this is a greenfield migration.
- Templates need two visibility scopes: **global** (available to all hives) and
  **hive-scoped** (private to a specific hive).
- Encryption policy differs: hive-scoped entries use AES-256-GCM with the hive key;
  global entries have no hive key and must remain plaintext.
- The RLS model for `lists` uses `hive_id` for row isolation.

## Decision

We **collapse** `ListTemplate`, `ListTemplateField`, and `ListTemplateView` into the existing
`List`, `ListField`, and `ListView` tables by adding an `isTemplate` flag to `List`.

### Core Design

```
List (isTemplate=false, hiveId=<uuid>)   →  regular list
List (isTemplate=true,  hiveId=<uuid>)   →  hive-scoped template
List (isTemplate=true,  hiveId=NULL)     →  global system template
```

`ListField` and `ListView` rows are reused unchanged — they attach to the same `lists` table
via `list_id` regardless of whether the parent is a template or a real list.

### Schema changes

- `lists.hive_id` → `String?` (nullable — global templates have no hive)
- `lists.creator_id` → `String?` (nullable — system templates have no creator)
- `lists.is_template` → `Boolean DEFAULT false` (new column)
- Drop `list_templates`, `list_template_fields`, `list_template_views`

### RLS policy update

The `lists` RLS policy is updated to allow reading global templates from any hive context:

```sql
-- USING (read): own hive rows OR global templates
USING (
  hive_id = current_setting('app.hive_id', true)::uuid
  OR (hive_id IS NULL AND is_template = TRUE)
)

-- WITH CHECK (write): only own hive (global templates are immutable from hive context)
WITH CHECK (
  hive_id = current_setting('app.hive_id', true)::uuid
)
```

This means global templates are **read-only** from all hive contexts. Only a system migration
(running outside RLS, as superuser) can create or modify global templates.

### Encryption consistency

| Row type        | `hiveId` | `name` encryption      |
| --------------- | -------- | ---------------------- |
| Regular list    | UUID     | AES-256-GCM (hive key) |
| Hive template   | UUID     | AES-256-GCM (hive key) |
| Global template | NULL     | Plaintext (no key)     |

The service checks `hiveId === null` before decrypting, exactly as the previous `isSystem` check.

### Template instantiation

Creating a list from a template copies `ListField` and `ListView` rows from the template list
into the new list. After creation, the list and template are fully independent (same behaviour
as before — ADR-0007 §Decision point 2).

## Consequences

### Easier

- **Single schema for all list-like content** — new `ListField` features (types, flags,
  timestamps) automatically apply to templates without duplication.
- **Three fewer tables** — `list_templates`, `list_template_fields`, `list_template_views`
  are gone.
- **One service code-path** — `listTemplates()` is a filtered query on `lists`, not a
  separate Prisma model.
- **Hive-template visibility** works naturally: a hive can create its own templates
  (`isTemplate=true, hiveId=<uuid>`) which are invisible to other hives via RLS.

### Harder

- **`hive_id` and `creator_id` are now nullable** on `lists` — downstream code that reads
  these fields must handle `null` for global templates.
- **`list_items` hive_id trigger** (`list_items_enforce_hive_id_trigger`) will fail if an
  application tries to add items to a template list (since the trigger derives `hive_id` from
  the parent `list.hive_id`, which is NULL for global templates). This is the correct behaviour —
  templates must not have items.

### Not changing

- The `list_items` table and all item/value logic are unchanged.
- The fractional-index `reorderItems` endpoint works for template field ordering too.
- The `@@unique([hiveId, creatorId, systemKey])` constraint is retained — PostgreSQL treats
  NULL as distinct in UNIQUE indexes, so multiple global templates with different `systemKey`
  values are allowed.

## References

- [ADR-0007](0007-flexible-lists-architecture.md) — Lists as universal content model
- [ADR-0005](0005-hybrid-encryption-architecture.md) — Encryption architecture
- [LISTS_CONCEPT.md](../LISTS_CONCEPT.md) — Template catalogue and user stories
