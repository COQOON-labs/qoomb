-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "hives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "type" VARCHAR(50) NOT NULL CHECK (type IN ('family', 'organization')),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "hives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "full_name" VARCHAR(255),
    "nickname" VARCHAR(255),
    "birthday" DATE,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Hive-scoped: isolated via Row-Level Security (see policy below)
CREATE TABLE "persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hive_id" UUID NOT NULL,
    "user_id" UUID,
    "role" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(255),
    "avatar_url" TEXT,
    "birthdate" DATE,
    "public_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_hive_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "hive_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_hive_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by_token" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "persons_hive_id_idx" ON "persons"("hive_id");

-- CreateIndex
CREATE INDEX "persons_user_id_idx" ON "persons"("user_id");

-- CreateIndex
CREATE INDEX "user_hive_memberships_user_id_idx" ON "user_hive_memberships"("user_id");

-- CreateIndex
CREATE INDEX "user_hive_memberships_hive_id_idx" ON "user_hive_memberships"("hive_id");

-- CreateIndex
CREATE INDEX "user_hive_memberships_person_id_idx" ON "user_hive_memberships"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_hive_memberships_user_id_hive_id_key" ON "user_hive_memberships"("user_id", "hive_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_at_idx" ON "refresh_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_active" ON "refresh_tokens"("user_id", "token");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hive_memberships" ADD CONSTRAINT "user_hive_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hive_memberships" ADD CONSTRAINT "user_hive_memberships_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hive_memberships" ADD CONSTRAINT "user_hive_memberships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRLS
-- current_setting('app.hive_id', true) returns NULL (not error) when var is not set (e.g. during migrations)
ALTER TABLE "persons" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persons_hive_isolation" ON "persons"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "persons" FORCE ROW LEVEL SECURITY;

-- MinimumAdmin trigger: prevents removing the last parent (family) or org_admin (organization)
-- SECURITY DEFINER bypasses RLS so it can count all admins in the hive
CREATE OR REPLACE FUNCTION check_minimum_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  hive_type_val TEXT;
  admin_role    TEXT;
  admin_count   INT;
  affected_role TEXT := COALESCE(OLD.role, '');
BEGIN
  SELECT type INTO hive_type_val FROM hives WHERE id = OLD.hive_id;
  admin_role := CASE hive_type_val
    WHEN 'family'       THEN 'parent'
    WHEN 'organization' THEN 'org_admin'
    ELSE NULL
  END;

  -- Not an admin role — nothing to guard
  IF admin_role IS NULL OR affected_role != admin_role THEN
    RETURN OLD;
  END IF;

  -- UPDATE that keeps the role — nothing changes
  IF TG_OP = 'UPDATE' AND NEW.role = admin_role THEN
    RETURN NEW;
  END IF;

  -- Count remaining admins excluding this row
  SELECT COUNT(*) INTO admin_count
  FROM persons
  WHERE hive_id = OLD.hive_id AND role = admin_role AND id != OLD.id;

  IF admin_count < 1 THEN
    RAISE EXCEPTION 'Cannot remove the last % from hive', admin_role USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER enforce_minimum_admin
  BEFORE UPDATE OR DELETE ON persons
  FOR EACH ROW EXECUTE FUNCTION check_minimum_admin();

-- ============================================
-- PERMISSION EXTENSION TABLES
-- ============================================

CREATE TABLE "hive_role_permissions" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "hive_id"    UUID         NOT NULL,
  "role"       VARCHAR(50)  NOT NULL,
  "permission" VARCHAR(100) NOT NULL,
  "granted"    BOOLEAN      NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("hive_id", "role", "permission"),
  FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE CASCADE
);
CREATE INDEX ON "hive_role_permissions"("hive_id");

CREATE TABLE "resource_shares" (
  "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
  "hive_id"       UUID        NOT NULL,
  "resource_type" VARCHAR(50) NOT NULL,
  "resource_id"   UUID        NOT NULL,
  "person_id"     UUID        NOT NULL,
  "can_view"      BOOLEAN     NOT NULL DEFAULT false,
  "can_edit"      BOOLEAN     NOT NULL DEFAULT false,
  "can_delete"    BOOLEAN     NOT NULL DEFAULT false,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("resource_type", "resource_id", "person_id"),
  FOREIGN KEY ("hive_id")   REFERENCES "hives"("id")   ON DELETE CASCADE,
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE
);
CREATE INDEX ON "resource_shares"("hive_id", "resource_type", "resource_id");

-- EnableRLS for hive-scoped permission extension tables
ALTER TABLE "hive_role_permissions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hive_role_permissions_isolation" ON "hive_role_permissions"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "hive_role_permissions" FORCE ROW LEVEL SECURITY;

ALTER TABLE "resource_shares" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_shares_isolation" ON "resource_shares"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "resource_shares" FORCE ROW LEVEL SECURITY;
