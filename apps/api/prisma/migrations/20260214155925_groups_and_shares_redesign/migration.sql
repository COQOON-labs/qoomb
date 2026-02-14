/*
  Warnings:

  - You are about to drop the `resource_shares` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "resource_shares" DROP CONSTRAINT "resource_shares_hive_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_shares" DROP CONSTRAINT "resource_shares_person_id_fkey";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "group_id" UUID;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "group_id" UUID;

-- DropTable
DROP TABLE "resource_shares";

-- CreateTable
CREATE TABLE "hive_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hive_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hive_group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "added_by_person_id" UUID,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hive_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX "hive_groups_hive_id_idx" ON "hive_groups"("hive_id");

-- CreateIndex
CREATE INDEX "hive_group_members_hive_id_idx" ON "hive_group_members"("hive_id");

-- CreateIndex
CREATE INDEX "hive_group_members_person_id_idx" ON "hive_group_members"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "hive_group_members_group_id_person_id_key" ON "hive_group_members"("group_id", "person_id");

-- CreateIndex
CREATE INDEX "person_shares_hive_id_resource_type_resource_id_idx" ON "person_shares"("hive_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_shares_resource_type_resource_id_person_id_key" ON "person_shares"("resource_type", "resource_id", "person_id");

-- CreateIndex
CREATE INDEX "group_shares_hive_id_resource_type_resource_id_idx" ON "group_shares"("hive_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_shares_resource_type_resource_id_group_id_key" ON "group_shares"("resource_type", "resource_id", "group_id");

-- CreateIndex
CREATE INDEX "events_hive_id_group_id_idx" ON "events"("hive_id", "group_id");

-- CreateIndex
CREATE INDEX "tasks_hive_id_group_id_idx" ON "tasks"("hive_id", "group_id");

-- AddForeignKey
ALTER TABLE "hive_groups" ADD CONSTRAINT "hive_groups_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hive_group_members" ADD CONSTRAINT "hive_group_members_added_by_person_id_fkey" FOREIGN KEY ("added_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_shares" ADD CONSTRAINT "person_shares_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_shares" ADD CONSTRAINT "person_shares_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_shares" ADD CONSTRAINT "group_shares_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_shares" ADD CONSTRAINT "group_shares_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "hive_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UpdateCheck: rename visibility values in events (parents→admins, shared removed, group added)
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_visibility_check";
ALTER TABLE "events" ADD CONSTRAINT "events_visibility_check"
  CHECK (visibility IN ('hive', 'admins', 'group', 'private'));

-- UpdateCheck: rename visibility values in tasks
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_visibility_check";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_visibility_check"
  CHECK (visibility IN ('hive', 'admins', 'group', 'private'));

-- EnableRLS: hive_groups (hive-scoped group definitions)
ALTER TABLE "hive_groups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hive_groups_isolation" ON "hive_groups"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "hive_groups" FORCE ROW LEVEL SECURITY;

-- EnableRLS: hive_group_members (hive-scoped group memberships)
ALTER TABLE "hive_group_members" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hive_group_members_isolation" ON "hive_group_members"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "hive_group_members" FORCE ROW LEVEL SECURITY;

-- EnableRLS: person_shares (replaces resource_shares for per-person grants)
ALTER TABLE "person_shares" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_shares_isolation" ON "person_shares"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "person_shares" FORCE ROW LEVEL SECURITY;

-- EnableRLS: group_shares (per-group access grants)
ALTER TABLE "group_shares" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_shares_isolation" ON "group_shares"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "group_shares" FORCE ROW LEVEL SECURITY;
