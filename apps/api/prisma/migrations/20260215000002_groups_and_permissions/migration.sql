-- Migration: groups_and_permissions
-- Groups, Role Permissions, Person & Group Shares
-- Includes: RLS policies for all tables

-- ============================================
-- PERMISSION & GROUP TABLES
-- ============================================

-- CreateTable: hive_role_permissions (per-hive role permission overrides)
CREATE TABLE "hive_role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "granted" BOOLEAN NOT NULL,

    CONSTRAINT "hive_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: hive_groups
CREATE TABLE "hive_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hive_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable: hive_group_members
CREATE TABLE "hive_group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "added_by_person_id" UUID,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hive_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable: person_shares (per-person explicit grants)
CREATE TABLE "person_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "access_level" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "person_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable: group_shares (per-group explicit grants)
CREATE TABLE "group_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "access_level" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "group_shares_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX "hive_role_permissions_hive_id_idx" ON "hive_role_permissions"("hive_id");
CREATE UNIQUE INDEX "hive_role_permissions_hive_id_role_permission_key" ON "hive_role_permissions"("hive_id", "role", "permission");

CREATE INDEX "hive_groups_hive_id_idx" ON "hive_groups"("hive_id");

CREATE INDEX "hive_group_members_hive_id_idx" ON "hive_group_members"("hive_id");
CREATE INDEX "hive_group_members_person_id_idx" ON "hive_group_members"("person_id");
CREATE UNIQUE INDEX "hive_group_members_group_id_person_id_key" ON "hive_group_members"("group_id", "person_id");

CREATE UNIQUE INDEX "person_shares_resource_type_resource_id_person_id_key" ON "person_shares"("resource_type", "resource_id", "person_id");
CREATE INDEX "person_shares_hive_id_resource_type_resource_id_idx" ON "person_shares"("hive_id", "resource_type", "resource_id");

CREATE UNIQUE INDEX "group_shares_resource_type_resource_id_group_id_key" ON "group_shares"("resource_type", "resource_id", "group_id");
CREATE INDEX "group_shares_hive_id_resource_type_resource_id_idx" ON "group_shares"("hive_id", "resource_type", "resource_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================

ALTER TABLE "hive_role_permissions" ADD CONSTRAINT "hive_role_permissions_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hive_groups" ADD CONSTRAINT "hive_groups_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_added_by_person_id_fkey"
    FOREIGN KEY ("added_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "person_shares" ADD CONSTRAINT "person_shares_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "person_shares" ADD CONSTRAINT "person_shares_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_shares" ADD CONSTRAINT "group_shares_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_shares" ADD CONSTRAINT "group_shares_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
