-- Migration: lists
-- Replace Tasks with the generic Lists system.
-- Drops the tasks table and creates List, ListField, ListView, ListItem,
-- ListItemValue, ListTemplate, ListTemplateField, ListTemplateView.

-- ============================================
-- DROP TASKS TABLE
-- ============================================

-- Remove RLS policies first
DROP POLICY IF EXISTS "tasks_hive_isolation" ON "tasks";

ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;

-- Remove foreign keys
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_hive_id_fkey";

ALTER TABLE "tasks"
DROP CONSTRAINT IF EXISTS "tasks_creator_id_fkey";

ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_group_id_fkey";

ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_event_id_fkey";

ALTER TABLE "tasks"
DROP CONSTRAINT IF EXISTS "tasks_assignee_id_fkey";

-- Remove indexes
DROP INDEX IF EXISTS "tasks_hive_id_status_idx";

DROP INDEX IF EXISTS "tasks_hive_id_assignee_id_idx";

DROP INDEX IF EXISTS "tasks_hive_id_creator_id_idx";

DROP INDEX IF EXISTS "tasks_hive_id_group_id_idx";

-- Drop the table
DROP TABLE "tasks";

-- ============================================
-- LISTS
-- ============================================

CREATE TABLE "lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "hive_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "group_id" UUID,
    "name" TEXT NOT NULL,
    "icon" VARCHAR(50),
    "system_key" VARCHAR(50),
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'hive',
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "lists_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- LIST FIELDS
-- ============================================

CREATE TABLE "list_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "list_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "field_type" VARCHAR(30) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_title" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "list_fields_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- LIST VIEWS
-- ============================================

CREATE TABLE "list_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "list_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "view_type" VARCHAR(20) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "filter" JSONB,
    "sort_by" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "list_views_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- LIST ITEMS
-- ============================================

CREATE TABLE "list_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "list_id" UUID NOT NULL,
    "hive_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "assignee_id" UUID,
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "list_items_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- LIST ITEM VALUES
-- ============================================

CREATE TABLE "list_item_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "item_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT,
    CONSTRAINT "list_item_values_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- LIST TEMPLATES
-- ============================================

CREATE TABLE "list_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "hive_id" UUID,
    "creator_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(50),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "list_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "list_template_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "field_type" VARCHAR(30) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_title" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "list_template_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "list_template_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid (),
    "template_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "view_type" VARCHAR(20) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "filter" JSONB,
    "sort_by" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "list_template_views_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES
-- ============================================

-- lists
CREATE INDEX "lists_hive_id_idx" ON "lists" ("hive_id");

CREATE INDEX "lists_hive_id_creator_id_idx" ON "lists" ("hive_id", "creator_id");

CREATE UNIQUE INDEX "lists_hive_id_creator_id_system_key_key" ON "lists" (
    "hive_id",
    "creator_id",
    "system_key"
);

-- list_fields
CREATE INDEX "list_fields_list_id_idx" ON "list_fields" ("list_id");

-- list_views
CREATE INDEX "list_views_list_id_idx" ON "list_views" ("list_id");

-- list_items
CREATE INDEX "list_items_list_id_idx" ON "list_items" ("list_id");

CREATE INDEX "list_items_hive_id_idx" ON "list_items" ("hive_id");

CREATE INDEX "list_items_hive_id_assignee_id_idx" ON "list_items" ("hive_id", "assignee_id");

-- list_item_values
CREATE INDEX "list_item_values_field_id_idx" ON "list_item_values" ("field_id");

CREATE UNIQUE INDEX "list_item_values_item_id_field_id_key" ON "list_item_values" ("item_id", "field_id");

-- list_templates
CREATE INDEX "list_templates_hive_id_idx" ON "list_templates" ("hive_id");

-- list_template_fields
CREATE INDEX "list_template_fields_template_id_idx" ON "list_template_fields" ("template_id");

-- list_template_views
CREATE INDEX "list_template_views_template_id_idx" ON "list_template_views" ("template_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================

-- lists
ALTER TABLE "lists"
ADD CONSTRAINT "lists_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lists"
ADD CONSTRAINT "lists_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "persons" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lists"
ADD CONSTRAINT "lists_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "hive_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- list_fields
ALTER TABLE "list_fields"
ADD CONSTRAINT "list_fields_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- list_views
ALTER TABLE "list_views"
ADD CONSTRAINT "list_views_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- list_items
ALTER TABLE "list_items"
ADD CONSTRAINT "list_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "list_items"
ADD CONSTRAINT "list_items_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "persons" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "list_items"
ADD CONSTRAINT "list_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "persons" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- list_item_values
ALTER TABLE "list_item_values"
ADD CONSTRAINT "list_item_values_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "list_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "list_item_values"
ADD CONSTRAINT "list_item_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "list_fields" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- list_template_fields
ALTER TABLE "list_template_fields"
ADD CONSTRAINT "list_template_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "list_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- list_template_views
ALTER TABLE "list_template_views"
ADD CONSTRAINT "list_template_views_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "list_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- ROW-LEVEL SECURITY
-- ============================================

-- lists
ALTER TABLE "lists" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lists_hive_isolation" ON "lists"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "lists" FORCE ROW LEVEL SECURITY;

-- list_items (hive_id column for direct RLS)
ALTER TABLE "list_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_items_hive_isolation" ON "list_items"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "list_items" FORCE ROW LEVEL SECURITY;