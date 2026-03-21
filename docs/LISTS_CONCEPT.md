# Qoomb Lists — Concept & Architecture

> **Audience:** Product, Design, and Engineering team + AI Assistants.
> This document describes the "Lists" feature from a user perspective and as a technical architecture.
> Related ADR: [ADR-0007](adr/0007-flexible-lists-architecture.md)

---

## 1. Vision

**Everything is a list.** — Shopping lists, projects, cleaning schedules, vocabulary collections,
budget trackers, and any other collections are represented by a single, flexible data model. The
power comes from configurable fields and views — the simplicity from templates that handle 80% of
the work.

**Guiding principle:** _"You can do a lot with it — but you don't have to."_
Progressive Disclosure: simple lists work immediately, power features are optional.

---

## 2. User Perspective

### 2.1 What is a List?

A **list** is a configurable collection of items with its own schema (blueprint).
Each list has:

- a **name** and optionally an **icon**
- a **blueprint** (schema): which fields does an item have? (Title, Checkbox, Date, …)
- one or more **views** (Checklist, Table, Kanban)
- a **visibility** setting (Hive / Admins / Group / Private)

### 2.2 Items

A **list item** is a record within a list. Its fields are defined by the list's blueprint.
Each item belongs to **exactly one** list — no multi-membership, but references to items in other
lists are possible.

### 2.3 Templates

A **template** is a saved blueprint preset. When creating a new list, you choose a template — the
list gets a copy of the blueprint. **After creation, list and template are independent of each
other.** Changes to the blueprint don't affect the template and vice versa.

Templates can be predefined (by Qoomb) or user-created.

### 2.4 Views

Each list can have **multiple views**. Views display the same data differently:

| View          | Description                                   | Status     |
| ------------- | --------------------------------------------- | ---------- |
| **Checklist** | Items as a checkable list                     | ✅ Done    |
| **Table**     | Items as rows, fields as columns              | ✅ Done    |
| **Kanban**    | Items as cards, grouped by a status field     | ✅ Done    |
| **Calendar**  | Items with dates on a calendar view           | 🔮 Planned |
| **Gallery**   | Items as image cards (e.g. recipe collection) | 🔮 Planned |

Each view can have **its own filters and sorting**:

- Filter: e.g. "hide completed", "only high priority"
- Sorting: Drag & Drop (manual order) or automatic by attribute (date, priority…)

**Archiving = filtered view.** There is no explicit archive model.
Items with "completed" status are hidden in a view — can be shown when needed.
Permanent **deletion** is also possible.

### 2.5 Inbox

Each person has an automatically created **Inbox list** (system list, `type: 'inbox'`).
Quick-Add without list assignment → item goes to the Inbox. From there, items are manually
sorted into actual lists.

Benefits:

- `listId` is always NOT NULL — no special case in the data model
- Inbox appears as a normal list in the navigation
- Drag & Drop / moving between lists is a uniform pattern

### 2.6 Quick-Add

Quick capture of an item:

- **Within a list**: Item is created directly there
- **Global** (e.g. via a `+` icon in the navigation): Item goes to the Inbox
- Minimal input: just title → Enter → done (all other fields optional)

### 2.7 Assignments

Items can be **assigned to a person** (per item). Not at the list level.

### 2.8 References

Items can **reference items in other lists** via a "Reference" field type.
In Scope 1, **rule-based references** are possible: a reference field can be automatically
populated based on conditions (e.g. "all ingredients from meal plan week 12 that are not
in inventory").

### 2.9 No Nesting

Lists do not have sub-lists. No parent-child hierarchy. Flat structure.
Relationships between lists are modeled via references.

### 2.10 Link to Events

Events remain a **separate model**. Bidirectional linking is possible:

- Events can spawn tasks / list items
- List items can reference events

---

## 3. Template Catalog (Predefined)

| Template                       | Typical Fields                                                              | Views            |
| ------------------------------ | --------------------------------------------------------------------------- | ---------------- |
| **Task List**                  | Title, Status (open/done), Priority, Due date, Assigned to                  | Checklist, Table |
| **Shopping List**              | Item, Quantity, Category (Fruit, Dairy…), Done                              | Checklist        |
| **Project**                    | Title, Status (Todo/In Progress/Done/Blocked), Priority, Assigned to, Due   | Table, Kanban    |
| **Packing List**               | Item, Category, Packed                                                      | Checklist        |
| **Cleaning Schedule**          | Area/Room, Task, Responsible, Done                                          | Table, Checklist |
| **Reading List**               | Title, Author, Type (Book/Article/Film), Status (want/reading/read), Rating | Table            |
| **Wish List**                  | Item, For whom, Link/URL, Price, Purchased                                  | Table, Checklist |
| **Meal Plan**                  | Dish, Day (Mon–Sun), Meal (Breakfast/Lunch/Dinner), Ingredients reference   | Table            |
| **Inventory**                  | Item, Category, Location (Basement/Fridge/…), Quantity                      | Table            |
| **Vocabulary Collection**      | Word, Translation, Example sentence, Learned                                | Checklist, Table |
| **Budget Tracker**             | Description, Category, Amount, Date                                         | Table            |
| **Contacts/Service Providers** | Name, Type, Phone, Email, Note                                              | Table            |
| **Kids Checklist**             | Task, Child (Assigned), Done                                                | Checklist        |
| **Habit Tracker**              | Habit, Done (per day)                                                       | Table, Checklist |
| **Collection** (generic)       | Title, Note                                                                 | Checklist, Table |

Users can **create their own templates** at any time: save the blueprint of an existing list as a
new template, or build an empty template from scratch.

---

## 4. Architecture

### 4.1 Data Model (Overview)

```text
List (Schema/Blueprint)
├── ListField[]       (Field definitions of the blueprint)
├── ListView[]        (Views: Checklist, Table, …)
│   └── ViewFilter[]  (Filters + sorting per view)
└── ListItem[]        (The actual data items)
    └── ListItemValue[] (Field values per item)

ListTemplate (Presets)
├── TemplateField[]   (Field definitions of the preset)
└── TemplateView[]    (Default views of the preset)
```

### 4.2 Schema (Implemented)

> The actual schema is defined in `apps/api/prisma/schema.prisma`.
> The following is a simplified overview. Fields like `system_key`,
> `recurrence_rule` and the `list_favorites` table were added during implementation.

```sql
-- ── Lists ─────────────────────────────────────────────────────────────────────

lists:
  id              UUID PK
  hive_id         UUID FK → hives
  creator_id      UUID FK → persons
  name            TEXT ENCRYPTED
  icon            TEXT?                         -- emoji or URL, unencrypted (cosmetic)
  type            VARCHAR(20) DEFAULT 'custom'  -- 'custom' | 'inbox'
  system_key      VARCHAR(50)?                  -- e.g. 'tasks' — triggers auto-creation + delete protection
  visibility      VARCHAR(20) DEFAULT 'hive'
    -- CHECK (visibility IN ('hive', 'admins', 'group', 'private'))
  group_id        UUID? FK → hive_groups        -- required when visibility = 'group'
  sort_order      FLOAT                         -- order in the navigation
  is_archived     BOOLEAN DEFAULT false
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

INDEX: (hive_id, type)
INDEX: (hive_id, creator_id)
UNIQUE: (hive_id, creator_id) WHERE type = 'inbox'  -- max 1 Inbox per person
UNIQUE: (hive_id, creator_id, system_key)            -- max 1 system list per type per person

-- ── Field Definitions (Blueprint of a List) ──────────────────────────────────

list_fields:
  id              UUID PK
  list_id         UUID FK → lists (CASCADE)
  name            TEXT ENCRYPTED                -- field name, e.g. "Priority"
  field_type      VARCHAR(30)                   -- text | number | date | checkbox |
                                                -- select | person | reference | url
  config          JSONB                         -- type-specific:
                  -- select: { options: ["High", "Medium", "Low"] }
                  -- reference: { targetListId: UUID, rule?: FilterExpression }
                  -- person: {}
                  -- number: { min?, max?, unit? }
  is_required     BOOLEAN DEFAULT false
  is_title        BOOLEAN DEFAULT false         -- exactly 1 field per list is the title
  sort_order      FLOAT                         -- field order
  created_at      TIMESTAMPTZ

INDEX: (list_id, sort_order)

-- ── Views ─────────────────────────────────────────────────────────────────────

list_views:
  id              UUID PK
  list_id         UUID FK → lists (CASCADE)
  name            TEXT ENCRYPTED
  view_type       VARCHAR(20)                   -- 'checklist' | 'table' | 'kanban'
  config          JSONB                         -- view-specific:
                  -- checklist: { checkboxFieldId: UUID }
                  -- table: { visibleFieldIds: UUID[], columnWidths: {} }
                  -- kanban: { groupByFieldId: UUID }
  filter          JSONB?                        -- FilterExpression (see §4.4)
  sort_by         JSONB?                        -- [{ fieldId: UUID, direction: 'asc'|'desc' }]
  sort_mode       VARCHAR(10) DEFAULT 'auto'    -- 'auto' | 'manual'
  is_default      BOOLEAN DEFAULT false
  created_at      TIMESTAMPTZ

INDEX: (list_id)

-- ── Favorites ─────────────────────────────────────────────────────────────────

list_favorites:
  id              UUID PK
  list_id         UUID FK → lists (CASCADE)
  person_id       UUID FK → persons (CASCADE)
  sort_order      FLOAT                         -- order in the favorites list
  created_at      TIMESTAMPTZ

UNIQUE: (list_id, person_id)
INDEX: (person_id)

-- ── List Items ────────────────────────────────────────────────────────────────

list_items:
  id              UUID PK
  list_id         UUID FK → lists (CASCADE)
  hive_id         UUID FK → hives               -- denormalized for RLS
  creator_id      UUID FK → persons
  assignee_id     UUID? FK → persons
  sort_order      FLOAT                         -- manual order
  recurrence_rule JSONB?                        -- recurrence rule (unencrypted for server-side expansion)
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

INDEX: (list_id, sort_order)
INDEX: (hive_id, creator_id)
INDEX: (hive_id, assignee_id)

-- ── Field Values per Item ─────────────────────────────────────────────────────

list_item_values:
  id              UUID PK
  item_id         UUID FK → list_items (CASCADE)
  field_id        UUID FK → list_fields (CASCADE)
  value           TEXT? ENCRYPTED               -- all values: serialized → encrypted

UNIQUE: (item_id, field_id)  -- one value per field per item
INDEX: (field_id)

-- ── Templates ─────────────────────────────────────────────────────────────────

list_templates:
  id              UUID PK
  hive_id         UUID? FK → hives              -- NULL = System-Template (vordefiniert)
  creator_id      UUID? FK → persons            -- NULL = System-Template
  name            TEXT                           -- unencrypted (templates are presets, not PII)
  description     TEXT?
  icon            TEXT?
  is_system       BOOLEAN DEFAULT false         -- true = predefined by Qoomb
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

INDEX: (hive_id)

-- Template field definitions (copy preset)
list_template_fields:
  id              UUID PK
  template_id     UUID FK → list_templates (CASCADE)
  name            TEXT                           -- plaintext (templates contain no PII)
  field_type      VARCHAR(30)
  config          JSONB
  is_required     BOOLEAN DEFAULT false
  is_title        BOOLEAN DEFAULT false
  sort_order      FLOAT

-- Template views (copy preset)
list_template_views:
  id              UUID PK
  template_id     UUID FK → list_templates (CASCADE)
  name            TEXT
  view_type       VARCHAR(20)
  config          JSONB
  filter          JSONB?
  sort_by         JSONB?
  sort_mode       VARCHAR(10) DEFAULT 'auto'
  is_default      BOOLEAN DEFAULT false
```

### 4.3 Field Types (Scope 1)

| Type          | `field_type` | Stored in                           | Description                         |
| ------------- | ------------ | ----------------------------------- | ----------------------------------- |
| **Text**      | `text`       | `value` (encrypted)                 | Free text, single or multi-line     |
| **Number**    | `number`     | `value` (encrypted, as string)      | Numeric value (amount, quantity, …) |
| **Date**      | `date`       | `value` (encrypted, ISO 8601)       | Date/timestamp                      |
| **Checkbox**  | `checkbox`   | `value` (encrypted, "true"/"false") | Yes/No (checkable)                  |
| **Select**    | `select`     | `value` (encrypted)                 | Dropdown from predefined options    |
| **Person**    | `person`     | `value` (encrypted, UUID)           | Assignment to a hive member         |
| **Reference** | `reference`  | `value` (encrypted, UUID)           | Reference to item in another list   |
| **URL**       | `url`        | `value` (encrypted)                 | Link                                |

### 4.4 Filter Expressions (FilterExpression)

Views and rule-based references use the same filter expression:

```typescript
interface FilterExpression {
  operator: 'and' | 'or';
  conditions: FilterCondition[];
}

interface FilterCondition {
  fieldId: string; // UUID of the field
  comparator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'is_not_empty'
    | 'is_checked'
    | 'is_unchecked';
  value?: string | number | boolean;
}
```

Example — "Hide completed":

```json
{
  "operator": "and",
  "conditions": [{ "fieldId": "<checkbox-feld-id>", "comparator": "is_unchecked" }]
}
```

### 4.5 Rule-Based References

A reference field can optionally have a **rule** (filter) that automatically determines which
items from the target list are referenced. The rule is stored as a `FilterExpression` in
`list_fields.config.rule`.

Example — Shopping list automatically references all ingredients from the meal plan that are not
in inventory:

```json
{
  "targetListId": "<meal-plan-list-id>",
  "rule": {
    "operator": "and",
    "conditions": [{ "fieldId": "<ingredients-field-id>", "comparator": "is_not_empty" }]
  }
}
```

> **Note:** More complex cross-list automations (e.g. "when shopping item checked → move to
> inventory") are planned for Scope 2+. Scope 1 is limited to read-only references.

### 4.6 Encryption

Follows the existing pattern (see [ADR-0005](adr/0005-hybrid-encryption-architecture.md)):

| Field                       | Encrypted? | Reason                                     |
| --------------------------- | ---------- | ------------------------------------------ |
| `lists.name`                | ✅         | User-entered name                          |
| `list_fields.name`          | ✅         | User-defined field name                    |
| `list_views.name`           | ✅         | User-named view name                       |
| `list_item_values.value`    | ✅         | All user data (serialized + encrypted)     |
| IDs, Timestamps, sort_order | ❌         | Structural/operational                     |
| Template fields             | ❌         | Templates contain no PII (generic presets) |

### 4.7 Permissions

Lists use the existing 5-stage access model (see [PERMISSIONS.md](PERMISSIONS.md)):

- **Visibility**: `hive` / `admins` / `group` / `private`
- **PersonShares & GroupShares**: `VIEW (1)` / `EDIT (2)` / `MANAGE (3)`
- **Role-based permissions** (new):

```typescript
// New permissions for packages/types/src/permissions.ts
LISTS_VIEW = 'lists:view';
LISTS_CREATE = 'lists:create';
LISTS_UPDATE_OWN = 'lists:update:own';
LISTS_UPDATE_ANY = 'lists:update:any';
LISTS_DELETE_OWN = 'lists:delete:own';
LISTS_DELETE_ANY = 'lists:delete:any';
```

| Role                   | Family Hive                          | Organization Hive        |
| ---------------------- | ------------------------------------ | ------------------------ |
| `parent` / `org_admin` | All permissions                      | All permissions          |
| `child` / `member`     | VIEW, CREATE, UPDATE_OWN, DELETE_OWN | VIEW, CREATE, UPDATE_OWN |
| `manager`              | —                                    | All permissions          |
| `guest`                | —                                    | VIEW                     |

A person's Inbox list automatically has `visibility: 'private'`.

---

## 5. Boundaries

### Lists vs. Events

| Aspect               | Lists                   | Events                        |
| -------------------- | ----------------------- | ----------------------------- |
| Time relation        | Optional ("Date" field) | Central (Start/End, Duration) |
| Recurrence           | ✅ Implemented          | ✅ (RecurrenceRule)           |
| Calendar integration | No                      | Yes (Google, Apple, Outlook)  |
| Flexible schema      | Yes (Custom Fields)     | No (fixed schema)             |

**Linking**: List items can point to an event via a reference field.
Events can spawn list items (e.g. "tasks for this event").

### Lists vs. Pages

| Aspect    | Lists                        | Pages                        |
| --------- | ---------------------------- | ---------------------------- |
| Structure | Structured items with fields | Free text (Tiptap Rich-Text) |
| Views     | Checklist, Table, Kanban, …  | Document view                |
| Use case  | Tasks, collections, trackers | Notes, documentation, wiki   |

**Linking**: Pages can embed list items as reference blocks.
List items can have a text field serving as a mini-note.

### Lists vs. the Former Tasks Module

The `tasks` module has been **fully replaced and removed** by the Lists concept.
The directory `apps/api/src/modules/tasks/` no longer exists. A task list is
a list with the system key `tasks` (auto-created per person on first access).

---

## 6. Scope Planning

### Scope 1 (MVP) — ✅ Implemented

- [x] Data model: `lists`, `list_fields`, `list_views`, `list_items`, `list_item_values`
- [x] Templates: `list_templates`, `list_template_fields`, `list_template_views`
- [x] Field types: Text, Number, Date, Checkbox, Select, Person, Reference, URL
- [x] Views: Checklist, Table, Kanban (incl. Drag & Drop)
- [x] Inbox: System list per person (auto-created via `getInbox`)
- [x] Quick-Add: Inline per list
- [x] Visibility: Hive / Admins / Group / Private
- [x] Encryption: value encrypted, field names encrypted
- [x] RBAC: LISTS\_\* Permissions + 5-stage access model
- [x] Predefined system templates
- [x] UI: Lists page, List detail (Table, Checklist, Kanban)
- [x] Favorites: Toggle + Drag-to-Reorder
- [x] Recurring checklist items (client-side recurrence expansion)
- [x] System lists (`system_key`) with delete/rename protection
- [ ] Quick-Add: Global (→ Inbox) — UI not yet implemented
- [ ] Rule-based references (read-only) — schema exists, UI missing
- [ ] Create custom templates — API exists, UI missing

### Scope 2 — Partially Implemented

- [x] Kanban view (moved forward from Scope 2)
- [x] Recurring items (client-side expansion for checklist items)
- [ ] Cross-list automations (shopping checked → inventory)
- [ ] Drag & Drop between lists (move item)
- [ ] Lists as dashboard widget

### Scope 3+

- [ ] Calendar view for lists
- [ ] Gallery view
- [ ] API for external integrations
- [ ] Offline sync (SQLite, as planned in Phase 4)
- [ ] pgvector semantic search over list items

---

## 7. List Settings Panel — UX Concept

> Decided 2026-03-21. Replaces the per-column header menu approach.

### Problem

Per-column dropdown menus (⋮ in each header) have known weaknesses:

- **Discoverability**: Users don't know options exist until they hover/tap
- **Mobile**: No hover state — explicit touch targets per column don't scale beyond 8+ fields
- **Context fragmentation**: Each field has its own menu — no overview of all fields at once
- **No batch workflow**: You cannot quickly hide 3 fields or reorder them

### Reference Analysis

| App                 | Pattern                                   | Strength                                                    | Weakness                                |
| ------------------- | ----------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| **Airtable**        | "Fields" sidebar panel via toolbar button | Full overview, drag-reorder, visibility toggles at a glance | Needs space                             |
| **Notion**          | Toolbar "Properties" button → popover     | Lightweight, quick access                                   | Popover gets cluttered with many fields |
| **Linear**          | "View" dropdown with filter/sort/group    | Compact, focused on view config                             | Field management separate               |
| **Apple Reminders** | Dedicated settings page                   | Mobile-first, clearly structured                            | Navigation overhead                     |
| **Monday.com**      | "Customize" panel (sidebar)               | All column settings in one place                            | Can feel overloaded                     |

**Winner pattern**: The **sidebar panel** (Airtable/Monday.com) scales best — especially when both desktop and mobile must be served.

### Design: Settings Panel with Two Levels

**Entry point**: A single **⚙️ Settings button** in the view tab bar (right-aligned).

- **Desktop**: Slide-in panel (right side, ~360px width)
- **Mobile**: Bottom-sheet or full-screen overlay

#### Level 1 — Overview

```
┌─────────────────────────────────────────────────┐
│ ⚙️ List Settings                          ✕    │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─ 📋 List ──────────────────────────────────┐ │
│ │  Name:        [Shopping List       ] ✏️     │ │
│ │  Icon:        📋  [change]                 │ │
│ │  Visibility:  [Hive        ▾]              │ │
│ └────────────────────────────────────────────┘ │
│                                                 │
│ ┌─ 📐 Fields ────────────────────────────────┐ │
│ │  ⠿ ☑ Done              [👁] [⚙]           │ │
│ │  ⠿ Aa Title             [👁] [⚙]           │ │
│ │  ⠿ 📅 Due date          [👁] [⚙]           │ │
│ │  ⠿ 🏷 Category          [👁] [⚙]           │ │
│ │  ⠿ 👤 Assigned to       [👁] [⚙]           │ │
│ │                                             │ │
│ │  [+ Add field]                              │ │
│ └────────────────────────────────────────────┘ │
│                                                 │
│ ┌─ 🎛 Active view: "Table" ──────────────────┐ │
│ │  Type:          Table                       │ │
│ │  Sort:          [+ Add sort]                │ │
│ │  Filter:        [+ Add filter]              │ │
│ │  (Kanban: Group by [Field ▾])               │ │
│ │  (Checklist: Checkbox field [Field ▾])      │ │
│ └────────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Panel elements:**

| Section         | Contents                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **List**        | Name (editable), icon picker, visibility dropdown                                                        |
| **Fields**      | One row per field: drag handle (⠿), type icon, name, visibility toggle (👁), config button (⚙)           |
| **Active view** | View-type-specific config: checkbox field (checklist), group-by field (kanban), sort rules, filter rules |

**Interactions in the fields section:**

- **⠿ Drag handle**: Reorder fields via @dnd-kit (vertical sort)
- **👁 Eye toggle**: Show/hide field in the active view (writes `visibleFieldIds` to view config)
- **⚙ Gear button**: Opens field detail subpanel (level 2)
- **[+ Add field]**: Inline add at the bottom, same as current `AddFieldForm` but embedded in the panel

#### Level 2 — Field Detail (Subpanel)

```
┌─────────────────────────────────────────────────┐
│ ← Back              Field: Category             │
├─────────────────────────────────────────────────┤
│                                                 │
│  Name:     [Category              ]             │
│  Type:     [Select           ▾]                 │
│  Required: [ ] Required field                   │
│  Icon:     🏷  [change]                         │
│  Description: [Short help text    ]             │
│                                                 │
│  Options:                                       │
│    ⠿ 🟢 Fruit                         [✕]      │
│    ⠿ 🔵 Vegetables                    [✕]      │
│    ⠿ 🟡 Household                     [✕]      │
│    [+ Add option]                               │
│                                                 │
│  ─────────────────────────────────────────      │
│  [Duplicate field]   [🗑 Delete field]          │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Field detail contains:**

- Name (editable)
- Type (dropdown — enables field type change, PR 8)
- Required toggle
- Icon picker (PR 3)
- Description (PR 3)
- Type-specific config (select options, number min/max, person multi-select, etc.)
- Actions: Duplicate (PR 4) and Delete with confirmation

### Why This Pattern

1. **Single entry point** instead of N header menus — immediately clear where configuration lives
2. **Overview**: All fields visible at once with visibility toggles — fast show/hide without per-field menus
3. **Drag-reorder** fields in the panel instead of column headers (less fragile, no conflict with column resize)
4. **Mobile-friendly**: Panel becomes bottom-sheet or full-screen — no hover dependency
5. **Scales**: When filter, sort, field descriptions, field icons arrive later, there is a natural place for them
6. **Two-level navigation** (list → field detail) instead of deeply nested menus
7. **View config integrated**: Checklist checkbox field, kanban grouping, filter, sort — all under "Active view"

### What Gets Removed

| Current                                     | Replacement                          |
| ------------------------------------------- | ------------------------------------ |
| Column header ⋮ menu (SortableColumnHeader) | Panel → Field row → ⚙ → edit/delete  |
| Inline field name edit in header            | Panel → Field row → ⚙ → Name         |
| AddFieldForm (inline above table)           | Panel → "Add field" button           |
| FieldEditPanel (floating component)         | Panel → Field detail subpanel        |
| Checklist checkbox-field picker in header   | Panel → Active view → Checkbox field |
| Kanban group-by picker in header            | Panel → Active view → Group by       |

What stays: List name and icon inline editing (top of the page). This is a progressive-disclosure shortcut — the panel also exposes these fields for completeness.

### Component Architecture

```
ListSettingsPanel (right slide-in / mobile bottom-sheet)
├── ListSettingsSection        — name, icon, visibility
├── FieldsSection              — field list with drag, visibility, gear
│   ├── SortableFieldRow       — one row per field
│   └── AddFieldInline         — add field at bottom
├── ViewConfigSection          — active view settings
│   ├── ChecklistConfig        — checkbox field picker
│   ├── KanbanConfig           — group-by field picker
│   ├── SortConfig             — sort rules (PR 9)
│   └── FilterConfig           — filter rules (PR 9)
└── FieldDetailSubpanel        — slide-in level 2
    ├── FieldNameInput
    ├── FieldTypeSelect        — type change (PR 8)
    ├── FieldIconPicker        — (PR 3)
    ├── FieldDescription       — (PR 3)
    ├── FieldTypeConfig        — select options, number range, etc.
    └── FieldActions           — duplicate (PR 4), delete
```

---

## 8. List Settings & UX Overhaul — Feature Roadmap

> Decided 2026-03-21, revised 2026-03-21. Inspired by Notion Databases. 19 features in 9 PRs.

### PR 1 — Quick Wins ✅ (merged)

> Branch: `fix/list-ux-polish` · PR #140

| ID  | Feature                                        | Status |
| --- | ---------------------------------------------- | ------ |
| D1  | Larger delete icon touch targets (44px)        | ✅     |
| E1  | Locale-aware date formatting (i18n locale)     | ✅     |
| E4  | Cell text truncation (`max-w-50` + `truncate`) | ✅     |

### PR 2 — Settings Panel (Foundation) ← replaces old "Field Context Menu"

> Branch: `feat/list-settings-panel` · See §7 for full UX concept

| ID  | Feature                                                     | Effort |
| --- | ----------------------------------------------------------- | ------ |
| NEW | Settings panel shell (⚙ button, slide-in, mobile sheet)     | Medium |
| NEW | List section (name, icon, visibility inline editing)        | Small  |
| NEW | Fields section (drag-reorder, 👁 visibility toggle, ⚙)      | Medium |
| A4  | Hide/show fields per view (`visibleFieldIds` in config)     | Small  |
| NEW | Field detail subpanel (name, type display, delete)          | Medium |
| NEW | Active view section (checklist/kanban config, sort, filter) | Small  |

This panel replaces all per-column ⋮ menus in `SortableColumnHeader`. The ⋮ menu and
`FieldEditPanel` are removed once the Settings Panel ships.

### PR 3 — Field Metadata (Icon + Description)

> Branch: `feat/field-metadata` · Independent of PR 2

| ID  | Feature                           | Effort |
| --- | --------------------------------- | ------ |
| A5  | Field icons (emoji per column)    | Small  |
| A6  | Field description (hover tooltip) | Small  |

Backend: add `icon` and `description` to `ListField` (migration + encryption for `description`).
Frontend: icon picker + description input in field detail subpanel (PR 2) and column header.

### PR 4 — Duplicate Actions

> Branch: `feat/list-duplicate-actions` · Depends on PR 2 (field detail subpanel)

| ID  | Feature                                | Effort |
| --- | -------------------------------------- | ------ |
| A3  | Duplicate field (copy config)          | Small  |
| D3  | Duplicate item (copy all field values) | Small  |

### PR 5 — View Management ✅ (PR #141)

> Branch: `feat/view-management` · PR #141

| ID  | Feature                                         | Status |
| --- | ----------------------------------------------- | ------ |
| C1  | View tabs drag-to-reorder (persisted sortOrder) | ✅     |
| C2  | Duplicate view                                  | ✅     |
| C5  | Checklist: switchable checkbox field            | ✅     |
| C6  | Kanban: switchable group-by field               | ✅     |

### PR 6 — Visual Polish

> Branch: `feat/list-visual-polish`

| ID  | Feature                               | Effort |
| --- | ------------------------------------- | ------ |
| E5  | Colored select tags (Notion-style)    | Medium |
| E3  | Resizable column widths (drag handle) | Medium |

E5: `color` property per select option in `config.options[]` (JSONB, no migration).
E3: Drag on column border + `columnWidths` in view config (field already exists in schema).

### PR 7 — Undo Delete

> Branch: `feat/list-undo-delete`

| ID  | Feature                                  | Effort |
| --- | ---------------------------------------- | ------ |
| D5  | Undo item deletion (toast + soft-delete) | Medium |

Items get `deletedAt` timestamp instead of hard-delete. 5-second undo toast.
Cleanup job hard-deletes after expiry. Requires schema migration.

### PR 8 — Field Type Change (largest feature)

> Branch: `feat/field-type-change` · Depends on PR 2 (field detail subpanel)

| ID  | Feature                                          | Effort |
| --- | ------------------------------------------------ | ------ |
| A2  | Change field type with value conversion strategy | High   |

**Conversion matrix:**

| From → To       | Strategy                              |
| --------------- | ------------------------------------- |
| Text → Number   | Parse as number, else `null`          |
| Text → Date     | Parse as ISO date, else `null`        |
| Text → Checkbox | `"true"/"1"/"ja"` → true, else false  |
| Text → Select   | Value becomes first option            |
| Number → Text   | `String(value)`                       |
| Select → Text   | Option name becomes plaintext         |
| Checkbox → Text | `"true"/"false"`                      |
| Date → Text     | ISO string                            |
| Any → URL       | Keep string if valid URL, else `null` |
| Any → Person    | Not convertible → `null`              |

Non-convertible values → `null` + warning dialog ("3 of 12 values could not be converted").

### PR 9 — Filter & Sort UI

> Branch: `feat/list-filter-sort` · Backend schema already exists

| ID  | Feature                             | Effort |
| --- | ----------------------------------- | ------ |
| C3  | Filter UI (multi-condition builder) | High   |
| C4  | Sort UI (multi-level sort dropdown) | Medium |

### Dependencies

```
PR 2 (Settings Panel) ──→ PR 4 (Duplicate Actions)
                       ──→ PR 8 (Field Type Change)
PR 3 (Field Metadata) is independent — can be developed in parallel with PR 2.
PR 5 (View Management) ✅ already merged.
PR 6, 7, 9 are independent.
```

### Decided against (for now)

| ID   | Feature                      | Reason                        |
| ---- | ---------------------------- | ----------------------------- |
| D2   | Item detail page (modal)     | Deferred to later phase       |
| D4   | Batch actions (multi-select) | Deferred to later phase       |
| E2   | Relative date display        | Nice-to-have, not prioritized |
| C7   | Gallery view                 | High effort, Phase 5 (Pages)  |
| C8   | Calendar view                | High effort, Phase 6          |
| F1–5 | Formulas, Rollups, etc.      | Power features, future phases |
