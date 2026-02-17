-- Migration: platform
-- Platform layer: RBAC, Groups, Shares, Content (Events, Tasks).
-- All tables are hive-scoped and isolated via Row-Level Security.

-- ============================================
-- RBAC & GROUP TABLES
-- ============================================

CREATE TABLE "hive_role_permissions" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"    UUID        NOT NULL,
    "role"       VARCHAR(50) NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "granted"    BOOLEAN     NOT NULL,
    CONSTRAINT "hive_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hive_groups" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"     UUID        NOT NULL,
    "name"        TEXT        NOT NULL,
    "description" TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ NOT NULL,
    CONSTRAINT "hive_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "hive_group_members" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"           UUID        NOT NULL,
    "group_id"          UUID        NOT NULL,
    "person_id"         UUID        NOT NULL,
    "added_by_person_id" UUID,
    "joined_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hive_group_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "person_shares" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"       UUID        NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id"   UUID        NOT NULL,
    "person_id"     UUID        NOT NULL,
    "access_level"  SMALLINT    NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ NOT NULL,
    CONSTRAINT "person_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_shares" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"       UUID        NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id"   UUID        NOT NULL,
    "group_id"      UUID        NOT NULL,
    "access_level"  SMALLINT    NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ NOT NULL,
    CONSTRAINT "group_shares_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- CONTENT TABLES
-- ============================================

CREATE TABLE "events" (
    "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"         UUID        NOT NULL,
    "creator_id"      UUID        NOT NULL,
    "group_id"        UUID,
    "title"           TEXT        NOT NULL,
    "description"     TEXT,
    "start_at"        TIMESTAMPTZ NOT NULL,
    "end_at"          TIMESTAMPTZ NOT NULL,
    "all_day"         BOOLEAN     NOT NULL DEFAULT false,
    "location"        TEXT,
    "url"             TEXT,
    "color"           VARCHAR(20),
    "category"        TEXT,
    "visibility"      VARCHAR(20) NOT NULL DEFAULT 'hive' CHECK (visibility IN ('hive', 'admins', 'group', 'private')),
    "recurrence_rule" JSONB,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ NOT NULL,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tasks" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"      UUID        NOT NULL,
    "creator_id"   UUID        NOT NULL,
    "group_id"     UUID,
    "event_id"     UUID,
    "assignee_id"  UUID,
    "title"        TEXT        NOT NULL,
    "description"  TEXT,
    "due_at"       TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "status"       VARCHAR(20) NOT NULL DEFAULT 'todo',
    "priority"     INTEGER     NOT NULL DEFAULT 0,
    "visibility"   VARCHAR(20) NOT NULL DEFAULT 'hive' CHECK (visibility IN ('hive', 'admins', 'group', 'private')),
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ NOT NULL,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES
-- ============================================

-- hive_role_permissions
CREATE INDEX        "hive_role_permissions_hive_id_idx"                 ON "hive_role_permissions" ("hive_id");
CREATE UNIQUE INDEX "hive_role_permissions_hive_id_role_permission_key" ON "hive_role_permissions" ("hive_id", "role", "permission");

-- hive_groups
CREATE INDEX "hive_groups_hive_id_idx" ON "hive_groups" ("hive_id");

-- hive_group_members
CREATE INDEX        "hive_group_members_hive_id_idx"          ON "hive_group_members" ("hive_id");
CREATE INDEX        "hive_group_members_person_id_idx"         ON "hive_group_members" ("person_id");
CREATE UNIQUE INDEX "hive_group_members_group_id_person_id_key" ON "hive_group_members" ("group_id", "person_id");

-- person_shares
CREATE UNIQUE INDEX "person_shares_resource_type_resource_id_person_id_key" ON "person_shares" ("resource_type", "resource_id", "person_id");
CREATE INDEX        "person_shares_hive_id_resource_type_resource_id_idx"   ON "person_shares" ("hive_id", "resource_type", "resource_id");

-- group_shares
CREATE UNIQUE INDEX "group_shares_resource_type_resource_id_group_id_key" ON "group_shares" ("resource_type", "resource_id", "group_id");
CREATE INDEX        "group_shares_hive_id_resource_type_resource_id_idx"   ON "group_shares" ("hive_id", "resource_type", "resource_id");

-- events
CREATE INDEX "events_hive_id_start_at_idx"   ON "events" ("hive_id", "start_at");
CREATE INDEX "events_hive_id_creator_id_idx" ON "events" ("hive_id", "creator_id");
CREATE INDEX "events_hive_id_group_id_idx"   ON "events" ("hive_id", "group_id");

-- tasks
CREATE INDEX "tasks_hive_id_status_idx"      ON "tasks" ("hive_id", "status");
CREATE INDEX "tasks_hive_id_assignee_id_idx" ON "tasks" ("hive_id", "assignee_id");
CREATE INDEX "tasks_hive_id_creator_id_idx"  ON "tasks" ("hive_id", "creator_id");
CREATE INDEX "tasks_hive_id_group_id_idx"    ON "tasks" ("hive_id", "group_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================

ALTER TABLE "hive_role_permissions"
    ADD CONSTRAINT "hive_role_permissions_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hive_groups"
    ADD CONSTRAINT "hive_groups_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hive_group_members"
    ADD CONSTRAINT "hive_group_members_hive_id_fkey"            FOREIGN KEY ("hive_id")            REFERENCES "hives"       ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hive_group_members"
    ADD CONSTRAINT "hive_group_members_group_id_fkey"           FOREIGN KEY ("group_id")           REFERENCES "hive_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hive_group_members"
    ADD CONSTRAINT "hive_group_members_person_id_fkey"          FOREIGN KEY ("person_id")          REFERENCES "persons"     ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hive_group_members"
    ADD CONSTRAINT "hive_group_members_added_by_person_id_fkey" FOREIGN KEY ("added_by_person_id") REFERENCES "persons"     ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "person_shares"
    ADD CONSTRAINT "person_shares_hive_id_fkey"   FOREIGN KEY ("hive_id")   REFERENCES "hives"   ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "person_shares"
    ADD CONSTRAINT "person_shares_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_shares"
    ADD CONSTRAINT "group_shares_hive_id_fkey"  FOREIGN KEY ("hive_id")  REFERENCES "hives"       ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_shares"
    ADD CONSTRAINT "group_shares_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "hive_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events"
    ADD CONSTRAINT "events_hive_id_fkey"    FOREIGN KEY ("hive_id")    REFERENCES "hives"       ("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "events"
    ADD CONSTRAINT "events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "persons"     ("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "events"
    ADD CONSTRAINT "events_group_id_fkey"   FOREIGN KEY ("group_id")   REFERENCES "hive_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_hive_id_fkey"    FOREIGN KEY ("hive_id")    REFERENCES "hives"       ("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "persons"     ("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_group_id_fkey"   FOREIGN KEY ("group_id")   REFERENCES "hive_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_event_id_fkey"   FOREIGN KEY ("event_id")   REFERENCES "events"      ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "persons"   ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- ROW-LEVEL SECURITY
-- ============================================

-- hive_role_permissions
ALTER TABLE "hive_role_permissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hive_role_permissions_hive_isolation" ON "hive_role_permissions"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);
ALTER TABLE "hive_role_permissions" FORCE ROW LEVEL SECURITY;

-- hive_groups
ALTER TABLE "hive_groups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hive_groups_hive_isolation" ON "hive_groups"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);
ALTER TABLE "hive_groups" FORCE ROW LEVEL SECURITY;

-- hive_group_members
ALTER TABLE "hive_group_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hive_group_members_hive_isolation" ON "hive_group_members"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);
ALTER TABLE "hive_group_members" FORCE ROW LEVEL SECURITY;

-- person_shares
ALTER TABLE "person_shares" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "person_shares_hive_isolation" ON "person_shares"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);
ALTER TABLE "person_shares" FORCE ROW LEVEL SECURITY;

-- group_shares
ALTER TABLE "group_shares" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_shares_hive_isolation" ON "group_shares"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);
ALTER TABLE "group_shares" FORCE ROW LEVEL SECURITY;

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
