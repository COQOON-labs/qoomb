-- Multi-Hive Support Migration
-- Allows users to be members of multiple hives
-- Converts 1:1 user-hive relationship to many-to-many

-- ============================================================================
-- CREATE USER_HIVE_MEMBERSHIPS TABLE
-- ============================================================================

CREATE TABLE "user_hive_memberships" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4 (),
    "user_id" UUID NOT NULL,
    "hive_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'member',
    "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "user_hive_memberships_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Unique constraint: A user can only be a member of a hive once
CREATE UNIQUE INDEX "user_hive_memberships_user_id_hive_id_key" ON "user_hive_memberships" ("user_id", "hive_id");

-- Index for looking up all hives for a user
CREATE INDEX "user_hive_memberships_user_id_idx" ON "user_hive_memberships" ("user_id");

-- Index for looking up all users in a hive
CREATE INDEX "user_hive_memberships_hive_id_idx" ON "user_hive_memberships" ("hive_id");

-- Index for person lookups
CREATE INDEX "user_hive_memberships_person_id_idx" ON "user_hive_memberships" ("person_id");

-- Ensure only one primary membership per user
CREATE UNIQUE INDEX "user_hive_memberships_user_id_is_primary_key" ON "user_hive_memberships" ("user_id")
WHERE
    "is_primary" = TRUE;

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

ALTER TABLE "user_hive_memberships"
ADD CONSTRAINT "user_hive_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_hive_memberships"
ADD CONSTRAINT "user_hive_memberships_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- MIGRATE EXISTING DATA
-- ============================================================================

-- Copy existing user-hive relationships to the new table
-- Set is_primary = TRUE since these are the original/only hives
INSERT INTO
    "user_hive_memberships" (
        "user_id",
        "hive_id",
        "person_id",
        "role",
        "is_primary",
        "updated_at"
    )
SELECT "id" as "user_id", "hive_id", COALESCE(
        "person_id", uuid_generate_v4 ()
    ) as "person_id", -- Generate UUID if NULL
    'admin' as "role", -- Existing users are admins of their hives
    TRUE as "is_primary", NOW() as "updated_at"
FROM "users"
WHERE
    "hive_id" IS NOT NULL;

-- ============================================================================
-- DROP OLD COLUMNS FROM USERS TABLE
-- ============================================================================

-- Drop the foreign key constraint first
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_hive_id_fkey";

-- Drop the columns
ALTER TABLE "users" DROP COLUMN "hive_id";

ALTER TABLE "users" DROP COLUMN "person_id";

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger for user_hive_memberships updated_at
CREATE TRIGGER update_user_hive_memberships_updated_at BEFORE UPDATE ON "user_hive_memberships"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE "user_hive_memberships" ENABLE ROW LEVEL SECURITY;

-- Users can see their own memberships
CREATE POLICY user_hive_memberships_select_policy ON "user_hive_memberships" FOR
SELECT USING (
        "user_id" = current_user_id ()
    );

-- Users can update their own memberships (but application should control this)
CREATE POLICY user_hive_memberships_update_policy ON "user_hive_memberships" FOR
UPDATE USING (
    "user_id" = current_user_id ()
);

-- Only application can insert new memberships
CREATE POLICY user_hive_memberships_insert_policy ON "user_hive_memberships" FOR
INSERT
WITH
    CHECK (TRUE);

-- Only application can delete memberships
CREATE POLICY user_hive_memberships_delete_policy ON "user_hive_memberships" FOR DELETE USING (
    "user_id" = current_user_id ()
);