-- Scope 1 schema completions:
--
-- 1. lists.type  VARCHAR(20) DEFAULT 'custom'
--    Distinguishes 'custom' lists from the special 'inbox' system list.
--    Each person has exactly one inbox per hive, enforced by partial UNIQUE index.
--
-- 2. list_views.sort_mode  VARCHAR(10) DEFAULT 'manual'
--    Controls whether items in the view are ordered by drag-and-drop (manual)
--    or automatically sorted by the sortBy fields (auto).
--
-- 3. list_fields.updated_at  TIMESTAMPTZ @updatedAt
--    list_views.updated_at   TIMESTAMPTZ @updatedAt
--    Required for field-level LWW conflict resolution in Phase 4 (offline sync),
--    consistent with list_item_values.updated_at added in migration 000011.

-- ── 1. lists.type ────────────────────────────────────────────────────────────

ALTER TABLE "lists"
  ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'custom';

-- Partial unique index: at most one inbox list per (hive, person).
-- Prisma cannot express partial indexes in schema.prisma — managed here.
CREATE UNIQUE INDEX "lists_hive_id_creator_id_inbox_key"
  ON "lists" ("hive_id", "creator_id")
  WHERE (type = 'inbox');

CREATE INDEX "lists_hive_id_type_idx"
  ON "lists" ("hive_id", "type");

-- ── 2. list_views.sort_mode ──────────────────────────────────────────────────

ALTER TABLE "list_views"
  ADD COLUMN "sort_mode" VARCHAR(10) NOT NULL DEFAULT 'manual';

-- ── 3. updated_at on list_fields and list_views ──────────────────────────────

ALTER TABLE "list_fields"
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Drop the backfill DEFAULT immediately (Prisma @updatedAt sets value at app layer).
ALTER TABLE "list_fields"
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "list_views"
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE "list_views"
  ALTER COLUMN "updated_at" DROP DEFAULT;
