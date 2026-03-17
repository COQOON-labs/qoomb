-- Migration: Unify list_templates into lists table (ADR-0009)
-- Collapses ListTemplate/ListTemplateField/ListTemplateView into List/ListField/ListView
-- with isTemplate flag + nullable hiveId/creatorId for global templates.

-- 1. Add is_template column to lists
ALTER TABLE "lists" ADD COLUMN "is_template" BOOLEAN NOT NULL DEFAULT false;

-- 2. Make hive_id and creator_id nullable (global templates have no hive/creator)
ALTER TABLE "lists" ALTER COLUMN "hive_id" DROP NOT NULL;
ALTER TABLE "lists" ALTER COLUMN "creator_id" DROP NOT NULL;

-- 3. Change creator_id FK from CASCADE to SET NULL
--    (deleting a hive member should not cascade-delete their hive templates)
ALTER TABLE "lists" DROP CONSTRAINT "lists_creator_id_fkey";
ALTER TABLE "lists" ADD CONSTRAINT "lists_creator_id_fkey"
  FOREIGN KEY ("creator_id") REFERENCES "persons" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Index for fast template queries
CREATE INDEX "lists_is_template_idx" ON "lists" ("is_template");

-- 5. Update RLS policy: allow reading global templates (hive_id IS NULL) from any hive context
DROP POLICY IF EXISTS "lists_hive_isolation" ON "lists";
CREATE POLICY "lists_hive_isolation" ON "lists"
    USING (
      hive_id = current_setting('app.hive_id', true)::uuid
      OR (hive_id IS NULL AND is_template = TRUE)
    )
    WITH CHECK (
      hive_id = current_setting('app.hive_id', true)::uuid
    );

-- 6. Drop old template tables (no data to migrate — greenfield)
DROP TABLE IF EXISTS "list_template_fields" CASCADE;
DROP TABLE IF EXISTS "list_template_views" CASCADE;
DROP TABLE IF EXISTS "list_templates" CASCADE;
