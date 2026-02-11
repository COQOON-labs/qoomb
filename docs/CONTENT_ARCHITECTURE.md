# Qoomb Content Architecture

> **Audience:** Developers and AI assistants working on this codebase.
> This document describes the complete content model, data architecture, and
> cross-cutting concerns (encryption, search, versioning, permissions) for all
> content types in Qoomb.

---

## 1. Mental Model

**Hive = Team Space** (comparable to a Notion Team Space or a Linear Team).
Everything below lives inside one Hive and is isolated from other Hives via
Row-Level Security + schema isolation.

```
Hive
├── Pages          (navigable, editable pages — tree structure)
│   └── Sub-Pages  (parentId → Page, unlimited depth)
├── Events         (calendar entries — standalone or linked to a Page)
├── Tasks          (actionable items — standalone or linked to a Page or Event)
├── Documents      (uploaded files — standalone or attached to a Page)
└── (future) Collections
```

---

## 2. Content Types

### 2.1 Page

A navigable, rich-text document that can contain sub-pages. Comparable to a
Notion page. Edited directly in the client using Tiptap (ProseMirror).

**Key properties:**

- Tree structure: `parent_id → Page` (null = root-level page in Hive)
- Rich text body stored as Tiptap/ProseMirror JSON (JSONB)
- Full version history via snapshot table (`page_versions`)
- Can have associated Events and Tasks via FK on those entities
- Can contain **reference blocks** in the Tiptap content (e.g.,
  `{type: 'event-ref', attrs: {eventId}}`) — these are UI-only references;
  the Event itself lives independently in the DB

**Schema (planned):**

```sql
pages:
  id              UUID PK
  hive_id         UUID FK → hives
  creator_id      UUID FK → persons
  parent_id       UUID? FK → pages     -- tree; null = hive root
  title           TEXT   ENCRYPTED
  content         JSONB  ENCRYPTED     -- Tiptap JSON
  icon            TEXT?                -- emoji or image URL (cosmetic, unencrypted)
  cover_url       TEXT?                -- reference to a Document
  sort_order      FLOAT                -- sibling ordering
  is_archived     BOOLEAN DEFAULT false
  visibility      VARCHAR(20) DEFAULT 'hive'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

page_versions:
  id              UUID PK
  page_id         UUID FK → pages
  version_number  INT
  title           TEXT  ENCRYPTED      -- snapshot
  content         JSONB ENCRYPTED      -- snapshot
  actor_id        UUID FK → persons
  created_at      TIMESTAMPTZ
```

### 2.2 Event

A time-bound entry. Can exist standalone (e.g., imported from a calendar) or
be linked to a Page (appears in the Page's "Associated Events" section and can
be referenced as a block inside the Page's text).

**Key properties:**

- Optional `page_id` FK (loose coupling — Option A)
- Simple recurrence rule stored as JSONB (see §5)
- Bidirectional calendar sync via `calendar_integrations` (see §7)
- Title + description + location + URL all encrypted

**Schema (planned):**

```sql
events:
  id                  UUID PK
  hive_id             UUID FK → hives
  creator_id          UUID FK → persons
  page_id             UUID? FK → pages
  title               TEXT  ENCRYPTED
  description         TEXT? ENCRYPTED
  start_at            TIMESTAMPTZ
  end_at              TIMESTAMPTZ
  all_day             BOOLEAN DEFAULT false
  location            TEXT? ENCRYPTED
  url                 TEXT? ENCRYPTED
  color               VARCHAR(20)?             -- unencrypted, cosmetic
  category            TEXT? ENCRYPTED
  visibility          VARCHAR(20) DEFAULT 'hive'
  recurrence_rule     JSONB?                   -- unencrypted (see §5)
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ

INDEX: (hive_id, start_at)
INDEX: (hive_id, creator_id)
```

### 2.3 Task

An actionable item. Can be linked to a Page, spawned from an Event, or
standalone. Tasks cannot contain nested Tasks (flat list model — sub-tasks
can be modelled as a separate Task with a parent_task_id if needed later).

**Key properties:**

- Optional `page_id` FK
- Optional `event_id` FK ("spawned from" relationship)
- Optional `assignee_id` → Person
- Status: `todo | in_progress | done | cancelled`
- Priority: integer (0 = none, 1 = low, 2 = medium, 3 = high)
- Documents can be referenced from a Task (see §2.4)

**Schema (planned):**

```sql
tasks:
  id              UUID PK
  hive_id         UUID FK → hives
  creator_id      UUID FK → persons
  page_id         UUID? FK → pages
  event_id        UUID? FK → events
  assignee_id     UUID? FK → persons
  title           TEXT  ENCRYPTED
  description     TEXT? ENCRYPTED
  due_at          TIMESTAMPTZ?
  completed_at    TIMESTAMPTZ?
  status          VARCHAR(20) DEFAULT 'todo'   -- unencrypted (needed for filtering)
  priority        SMALLINT DEFAULT 0           -- unencrypted
  visibility      VARCHAR(20) DEFAULT 'hive'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

INDEX: (hive_id, status)
INDEX: (hive_id, assignee_id)
```

**Relationship rules:**

- Task → Document: A task's `description` (Tiptap content) can include
  `{type: 'document-ref', attrs: {documentId}}` reference blocks.
- Document → Task: Documents cannot contain tasks (Documents are files, not
  editable content).

### 2.4 Document (File Upload)

An uploaded file (PDF, image, Office document, etc.). Stored in object storage;
metadata lives in the DB. Can be attached to a Page or stand alone.

**Key properties:**

- Original filename and storage key are encrypted
- `mime_type` and `size_bytes` are unencrypted (needed for HTTP responses)
- File content is envelope-encrypted before upload to storage

**Schema (planned):**

```sql
documents:
  id              UUID PK
  hive_id         UUID FK → hives
  creator_id      UUID FK → persons
  page_id         UUID? FK → pages
  filename        TEXT ENCRYPTED       -- original filename
  mime_type       VARCHAR(100)         -- unencrypted, needed for serving
  size_bytes      BIGINT               -- unencrypted
  storage_key     TEXT ENCRYPTED       -- path in object storage
  visibility      VARCHAR(20) DEFAULT 'hive'
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
```

---

## 3. Page-to-Content Linking (Option A)

Content types link to Pages via an **optional FK on the content entity**, not
via blocks stored in the Page's content blob. This is intentional:

```
events.page_id  ──→  pages.id   (nullable)
tasks.page_id   ──→  pages.id   (nullable)
documents.page_id → pages.id   (nullable)
```

**Why Option A (not block-based):**

- Independent lifecycle: Events/Tasks exist and are queryable without a Page
- Simple DB queries: `SELECT * FROM events WHERE page_id = $1`
- Events/Tasks can belong to at most one Page (clear ownership)

**Tiptap reference blocks (UI layer only):**
The Page's Tiptap content can embed a reference widget:

```json
{ "type": "event-ref", "attrs": { "eventId": "<uuid>" } }
{ "type": "task-ref",  "attrs": { "taskId":  "<uuid>" } }
{ "type": "doc-ref",   "attrs": { "docId":   "<uuid>" } }
```

These are purely UI — the client fetches and renders the referenced item.
No DB schema changes are needed when adding this feature.

---

## 4. Encryption Strategy

**Principle:** Encrypt everything the user typed. Leave structural/operational
metadata unencrypted because the server needs it for RLS, filtering, and sync.

| Field type                                     | Encrypted? | Rationale                  |
| ---------------------------------------------- | ---------- | -------------------------- |
| Titles, descriptions, body content             | ✅         | Primary user data          |
| Location, URL, category, filename, storage key | ✅         | User-typed / sensitive     |
| IDs, timestamps, status, priority, mime_type   | ❌         | Server needs for ops       |
| Color, sort_order, is_archived, visibility     | ❌         | Cosmetic / structural      |
| recurrence_rule (JSONB)                        | ❌         | Server needs for expansion |
| Token fields in calendar_integrations          | ✅         | Credentials                |

**Encryption implementation:** `@EncryptFields(['title', 'description'])`
decorator on service methods (existing pattern from encryption module).

**File encryption:** Envelope encryption — a per-file AES-256-GCM key is
generated, the file is encrypted with that key, the key itself is encrypted
with the hive key (HKDF-derived) and stored in the DB alongside the file
metadata.

---

## 5. Recurrence (Events)

Simple recurrence stored as JSONB on the event row. No separate table.
Occurrences are **expanded at query time** in the API (or client for local
mode) — there are no pre-materialized occurrence rows.

```typescript
interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number; // every N units, default 1
  daysOfWeek?: number[]; // weekly only: 0=Sun … 6=Sat
  until?: string; // ISO date string — inclusive end
  count?: number; // max occurrences (alternative to until)
}
```

**Examples:**

- Every Tuesday and Thursday: `{ frequency: 'weekly', daysOfWeek: [2, 4] }`
- Every 2 weeks on Monday: `{ frequency: 'weekly', interval: 2, daysOfWeek: [1] }`
- Monthly on the same date: `{ frequency: 'monthly', interval: 1 }`

**Recurrence exceptions** (cancelling or modifying a single occurrence): not
supported in Phase 2. Workaround: clone the event and set the exception date
as a one-off. A `recurrence_exceptions` table can be added in a later phase.

**Update semantics:** Updating a recurring event changes **all** occurrences
(the rule on the base row). "Edit only this occurrence" requires exception
support — deferred to a later phase.

---

## 6. Search Strategy

**Philosophy:** The server never builds a plaintext index. All searchable
content is synced to the client; search runs locally.

```
Server                         Client (Phase 3)
──────                         ────────────────
Encrypted blobs in PostgreSQL  ←── full sync (non-file content)
                                    ↓
                               Local SQLite (decrypted)
                                    ↓
                               Fuzzy / full-text search in-process
```

**Sync scope:** All non-file content (pages, events, tasks, document metadata).
File binaries are fetched on demand.

**Phase 2 (before local sync):** Server-side filtered queries. Client sends
search terms to the server, server returns matching encrypted rows. This is
less private but acceptable as a transitional measure.

**Phase 3:** Full local sync via vector clocks + conflict resolution
(see roadmap). pgvector semantic search added as a complement for
non-local scenarios (e.g., server-side search across hives for admin).

---

## 7. Version History (Pages)

Full snapshot-based versioning for Pages. Every explicit save creates a new
version row.

```
pages.updated_at            — last modified timestamp
page_versions               — immutable snapshot history
  └── version_number INT    — monotonically increasing per page
  └── title + content       — encrypted snapshots at that point in time
  └── actor_id              — who made the change
```

**Retention policy:** Configurable per hive (default: keep last 100 versions
or 90 days, whichever is less). Older versions are pruned by a background job.

**Restore:** `pages.PATCH` with `versionId` copies the snapshot back as the
current content (creates a new version marking the restore).

Version history is **not** applied to Events, Tasks, or Documents in Phase 2.
It is Page-specific.

---

## 8. Activity Log (Change Feed)

Lightweight audit trail used to power the "what changed since my last login"
feed. No plaintext content is stored — only metadata.

**Schema (planned):**

```sql
activity_logs:
  id              UUID PK
  hive_id         UUID FK → hives
  actor_id        UUID? FK → persons   -- null for system actions
  action          VARCHAR(20)          -- created|updated|deleted|shared|restored
  resource_type   VARCHAR(50)          -- page|event|task|document
  resource_id     UUID                 -- no FK (polymorphic)
  metadata        JSONB?               -- e.g. {fields_changed:['title']} — no values
  created_at      TIMESTAMPTZ

INDEX: (hive_id, created_at DESC)     -- for feed queries
INDEX: (hive_id, resource_type, resource_id)
```

**Feed query:**

```sql
SELECT * FROM activity_logs
WHERE hive_id = $1
  AND created_at > $2           -- last_seen_at from user session
ORDER BY created_at DESC
LIMIT 50;
```

The client then fetches the referenced resources it does not yet have cached.
The activity log itself is **not encrypted** — no sensitive data, only IDs
and action types.

**RLS:** `hive_id = current_setting('app.hive_id', true)::uuid`

---

## 9. Calendar Integration

Separate module, implemented after the core content types are stable.

### Providers

| Provider          | Protocol             | Auth                              |
| ----------------- | -------------------- | --------------------------------- |
| Google Calendar   | REST API             | OAuth 2.0                         |
| Apple Calendar    | CalDAV               | OAuth 2.0 / App-specific password |
| Microsoft Outlook | Microsoft Graph REST | OAuth 2.0 (MSAL)                  |

### Schema (planned)

```sql
calendar_integrations:
  id                UUID PK
  hive_id           UUID FK → hives
  person_id         UUID FK → persons   -- who authorized
  provider          VARCHAR(20)         -- google|apple|microsoft
  sync_direction    VARCHAR(10)         -- read|write|both
  access_token      TEXT ENCRYPTED
  refresh_token     TEXT ENCRYPTED
  token_expires_at  TIMESTAMPTZ
  external_cal_id   TEXT ENCRYPTED      -- e.g. Google Calendar ID
  last_synced_at    TIMESTAMPTZ?
  is_active         BOOLEAN DEFAULT true
  created_at, updated_at

calendar_event_mappings:
  id                UUID PK
  hive_id           UUID FK → hives
  event_id          UUID FK → events
  integration_id    UUID FK → calendar_integrations
  external_event_id TEXT                -- unencrypted — needed for API calls
  external_etag     TEXT?               -- for change detection
  sync_status       VARCHAR(20)         -- synced|pending|conflict|error
  last_synced_at    TIMESTAMPTZ
```

### Sync Architecture

- **Inbound (read):** Webhook (Google) or polling every N minutes (CalDAV).
  External events are imported into the `events` table with
  `external_calendar_id` set. Title/description are encrypted on import.
- **Outbound (write):** When a Qoomb event is created/updated/deleted and a
  matching `calendar_integration` with `sync_direction = 'write'|'both'`
  exists, the change is queued and pushed to the external calendar.
- **Conflict resolution:** `external_etag` / `updated_at` comparison.
  If both sides changed → flag as `conflict`, surface to user.

---

## 10. Resource Permissions (cross-content)

All content types use the same permission model described in `SECURITY.md`:

```
canAccess(person, action, resource):
  1. parent / org_admin → always granted
  2. resource.creator_id = personId → granted (own content)
  3. resource_shares row for (resource_type, resource_id, personId) → use canView/canEdit/canDelete
  4. resource.visibility = 'private' → denied
  5. resource.visibility = 'parents' → denied
  6. visibility = 'hive' | 'shared' → evaluate role permissions (HIVE_ROLE_PERMISSIONS + hive_role_permissions overrides)
```

**Implementation location:** `apps/api/src/common/guards/resource-access.ts`
(to be created when Events module is built — reused by Tasks, Pages, Documents).

---

## 11. Implementation Phases

### Phase 2 — Core Content (current focus)

- [ ] Persons module (hive member management)
- [ ] Events module (CRUD + recurrence expansion + `canAccessResource`)
- [ ] Tasks module (CRUD + assignees + event→task spawning)
- [ ] `resource-access.ts` guard (visibility resolution, reused everywhere)

### Phase 3 — Pages + Files

- [ ] Pages module (Tiptap editor, tree hierarchy, version history)
- [ ] Documents module (file upload + envelope encryption)
- [ ] Activity log

### Phase 4 — Offline + Search

- [ ] Client-side SQLite sync (vector clock conflict resolution)
- [ ] Full local search
- [ ] pgvector semantic search (server-side complement)

### Phase 5 — Calendar Integration

- [ ] Google Calendar (OAuth + webhook)
- [ ] Apple Calendar (CalDAV)
- [ ] Microsoft Outlook (Graph API)
- [ ] Bidirectional sync + conflict resolution UI

---

**Last Updated:** 2026-02-10
