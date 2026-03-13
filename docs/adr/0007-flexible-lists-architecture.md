# ADR-0007: Flexible Lists as Universal Content Model

**Status:** Proposed  
**Date:** 2026-03-13  
**Deciders:** Benjamin Gröner

## Context

Qoomb currently has separate, fixed-schema content types: Tasks, Events, Pages, Documents
(see [CONTENT_ARCHITECTURE.md](../CONTENT_ARCHITECTURE.md)). As requirements grow, users need
increasingly varied list-like structures: shopping lists, project boards, cleaning schedules,
vocabulary collections, budget trackers, packing lists, inventory, meal plans, and more.

Building each as a separate module (like Tasks) would lead to:

- **Model proliferation** — each use case needs its own DB schema, API, service, validators, UI
- **Rigid schemas** — users cannot add custom fields to a Task or Shopping Item
- **Duplicate logic** — filtering, sorting, views, permissions, encryption all re-implemented
- **Template impossibility** — no way for users to create their own structured list types

At the same time, the existing Tasks module is already implemented with CRUD, RBAC, encryption,
and visibility. We need a migration path that doesn't break existing functionality.

### Requirements

1. **One model for all list-like content** — tasks, shopping lists, projects, inventories, etc.
2. **Custom fields** — users define the schema of their lists (Notion-style properties)
3. **Multiple views per list** — same data as checklist, table, kanban, etc.
4. **Filter & sort per view** — each view can show a different subset of items
5. **Templates** — predefined + user-created blueprints for common list types
6. **Template independence** — after creation, list schema and template are decoupled
7. **Inbox per person** — system list for quick-capture without assignment
8. **Rule-based references** — fields that auto-populate based on conditions across lists
9. **No nesting** — flat lists only; cross-list references instead of parent-child
10. **Privacy** — private lists within a shared hive; existing visibility model applies
11. **Encryption** — user-typed field values encrypted; structural metadata unencrypted
12. **Gradual migration** — existing Tasks module to be replaced, not broken overnight

### Forces

- **Simplicity vs. flexibility** — must not overwhelm non-technical family users
- **Performance** — EAV (Entity-Attribute-Value) pattern has known query complexity trade-offs
- **Encryption** — All EAV values are encrypted uniformly in a single column
- **Backward compatibility** — Tasks API consumers need a migration path
- **Existing patterns** — must work with hiveProcedure, RLS, @EncryptFields, 5-stage access checks

## Decision

We introduce a **flexible Lists system** as the universal model for all structured, list-like
content in Qoomb. The existing Tasks module will be gradually replaced.

### Core Design Choices

#### 1. EAV with single encrypted value column

List items store field values in a separate `list_item_values` table with a **single `value`
column**. All values are serialized to string, encrypted with AES-256-GCM (hive-scoped key),
and stored as ciphertext. The client parses values back by field type after decryption.
This maximizes privacy (all data encrypted uniformly) while remaining flexible for any field type.

**Rejected alternative: Typed columns (value_text, value_number, etc.)** — would leave
non-text columns unencrypted, violating the privacy-first principle. Server-side filtering
on decrypted values is not needed since the project uses client-side filtering.

**Rejected alternative: JSONB blob per item** — would require encrypting the entire blob
or leaving it unencrypted (violating privacy principles).

**Rejected alternative: Fixed schema per list type** — would require DDL changes for each new
list type or custom field, not viable for user-created schemas.

#### 2. Templates as blueprints, not live links

When a list is created from a template, the template's fields and views are **copied** into the
list. After creation, the list and template are independent. This avoids:

- Cascading changes (template update breaks existing lists)
- Complex versioning (which template version does this list use?)
- Permission conflicts (template visible but list private)

#### 3. Inbox as a system list (not a NULL listId)

Quick-captured items without a list go to the user's **Inbox** — a real list with
`type: 'inbox'`, auto-created per person. This keeps `list_items.list_id` NOT NULL and avoids
special-case handling throughout the codebase.

#### 4. Views as first-class entities

Views are stored in the DB (not client-side preferences) so they can be shared with hive members.
Each view has its own filter, sort, and display configuration.

#### 5. Rule-based references (Scope 1: read-only)

A Reference field can have a `rule` (FilterExpression) that determines which items from a target
list are auto-linked. This enables patterns like "show all ingredients from the meal plan that
aren't in the pantry". Scope 1 is read-only — write-side automations (e.g., "when checked off in
shopping list → add to inventory") are deferred to Scope 2+.

#### 6. Gradual Tasks migration

1. Build the Lists system alongside the existing Tasks module
2. Create a "Task List" template that mirrors current Task functionality
3. Migrate existing Task data into List Items
4. Deprecate and remove the Tasks API

### Scope Boundaries

**Scope 1 (MVP):** Lists, Fields (8 types), Views (Checklist + Table), Templates, Inbox,
Quick-Add, Rule-based references, RBAC, Encryption

**Scope 2:** Kanban view, recurring items, cross-list automations, drag-drop between lists

**Scope 3+:** Calendar/Gallery views, external API, offline sync, semantic search

## Consequences

### Easier

- **One model to rule them all** — shopping lists, projects, budgets, inventories share the same
  infrastructure (API, permissions, encryption, sync)
- **User empowerment** — users create custom list types without developer intervention
- **Template ecosystem** — predefined templates make onboarding fast; power users can create
  and share their own
- **View flexibility** — same data, multiple presentations (checklist for quick action, table
  for overview)
- **Consistent encryption** — decorator-based field encryption applies uniformly to all
  text values across all list types

### Harder

- **EAV complexity** — queries for "all items in list X with field Y > 10" require joins
  through `list_item_values`. Mitigated by: indexes on typed columns, denormalized `hive_id`
  on `list_items` for RLS, and Prisma raw SQL for complex filters (following existing patterns
  from [PRISMA_PATTERNS.md](../PRISMA_PATTERNS.md))
- **Migration effort** — existing Tasks data and API consumers need a transition period
- **Template management** — system templates need to be maintained and versioned across
  Qoomb releases (but since lists are decoupled after creation, this is low-risk)
- **UI complexity** — building a configurable field editor, view switcher, and filter builder
  is significantly more frontend work than a fixed-schema form. Mitigated by progressive
  disclosure: simple lists work with zero configuration
- **Performance at scale** — EAV with many items × many fields could be slow. Mitigated by:
  limiting initial scope, pagination, lazy-loading field values for non-visible columns,
  and future denormalization if needed

### Risks

- **Over-engineering for families** — if most users only need simple checklists, the EAV model
  adds unnecessary complexity. Mitigated by templates that hide the complexity.
- **Notion comparison** — power users will compare Qoomb Lists to Notion databases. We must
  set expectations that Scope 1 is deliberately simpler. Features like formulas, rollups, and
  relations are roadmap items, not launch features.

## References

- [LISTS_CONCEPT.md](../LISTS_CONCEPT.md) — full concept with user stories and schema details
- [ADR-0005](0005-hybrid-encryption-architecture.md) — encryption architecture
- [PERMISSIONS.md](../PERMISSIONS.md) — RBAC and visibility model
- [CONTENT_ARCHITECTURE.md](../CONTENT_ARCHITECTURE.md) — existing content model (to be updated)
