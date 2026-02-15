-- Migration: content
-- Content tables: Events, Tasks
-- Includes: RLS policies, visibility CHECK constraints

-- ============================================
-- CONTENT TABLES
-- ============================================

-- CreateTable: events
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "group_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "url" TEXT,
    "color" VARCHAR(20),
    "category" TEXT,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'hive'
        CHECK (visibility IN ('hive', 'admins', 'group', 'private')),
    "recurrence_rule" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tasks
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "group_id" UUID,
    "event_id" UUID,
    "assignee_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'todo',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'hive'
        CHECK (visibility IN ('hive', 'admins', 'group', 'private')),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES (compound, matching Prisma @@index definitions)
-- ============================================

CREATE INDEX "events_hive_id_start_at_idx" ON "events"("hive_id", "start_at");
CREATE INDEX "events_hive_id_creator_id_idx" ON "events"("hive_id", "creator_id");
CREATE INDEX "events_hive_id_group_id_idx" ON "events"("hive_id", "group_id");

CREATE INDEX "tasks_hive_id_status_idx" ON "tasks"("hive_id", "status");
CREATE INDEX "tasks_hive_id_assignee_id_idx" ON "tasks"("hive_id", "assignee_id");
CREATE INDEX "tasks_hive_id_creator_id_idx" ON "tasks"("hive_id", "creator_id");
CREATE INDEX "tasks_hive_id_group_id_idx" ON "tasks"("hive_id", "group_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================

ALTER TABLE "events" ADD CONSTRAINT "events_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_fkey"
    FOREIGN KEY ("creator_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_fkey"
    FOREIGN KEY ("creator_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey"
    FOREIGN KEY ("assignee_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- ROW-LEVEL SECURITY
-- ============================================

-- events
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_hive_isolation" ON "events"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;

-- tasks
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_hive_isolation" ON "tasks"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
