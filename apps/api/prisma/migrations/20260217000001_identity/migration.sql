-- Migration: identity
-- Core identity layer: Hives, Users, Persons, Memberships, Auth tokens.
--
-- All PII is stored encrypted from day one:
--   hives.name         — AES-256-GCM ciphertext (hive-scoped key)
--   users.email        — AES-256-GCM ciphertext (user-scoped key)
--   users.full_name    — AES-256-GCM ciphertext (user-scoped key)
--   users.email_hash   — HMAC-SHA256 blind index for O(1) lookups
--   invitations.email_hash — same blind index; plaintext email never stored

CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- CORE IDENTITY TABLES
-- ============================================

CREATE TABLE "hives" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    -- AES-256-GCM ciphertext; raw name is never stored
    "name"       TEXT        NOT NULL,
    "type"       VARCHAR(50) NOT NULL CHECK (type IN ('family', 'organization')),
    -- BCP 47 language tag (e.g. 'de-DE', 'en-US'). NULL = platform default.
    "locale"     VARCHAR(12),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "hives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
    -- email: AES-256-GCM ciphertext (user-scoped HKDF key).
    -- email_hash: HMAC-SHA256 blind index — the only searchable form of the address.
    "email"            TEXT        NOT NULL,
    "email_hash"       VARCHAR(64) NOT NULL,
    "password_hash"    TEXT        NOT NULL,
    "email_verified"   BOOLEAN     NOT NULL DEFAULT false,
    "is_system_admin"  BOOLEAN     NOT NULL DEFAULT false,
    -- full_name: AES-256-GCM ciphertext (user-scoped HKDF key).
    "full_name"        TEXT,
    -- AES-256-GCM ciphertext (user-scoped key); BCP 47 locale. NULL = inherit.
    "locale"           TEXT,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "persons" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "hive_id"      UUID        NOT NULL,
    "user_id"      UUID,
    "role"         VARCHAR(50) NOT NULL,
    "display_name" TEXT,
    "avatar_url"   TEXT,
    "birthdate"    TEXT,
    "public_key"   TEXT,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ NOT NULL,
    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_hive_memberships" (
    "id"         UUID    NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID    NOT NULL,
    "hive_id"    UUID    NOT NULL,
    "person_id"  UUID    NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "user_hive_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
    "token"              TEXT        NOT NULL,
    "user_id"            UUID        NOT NULL,
    "expires_at"         TIMESTAMPTZ NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at"         TIMESTAMPTZ,
    "replaced_by_token"  TEXT,
    "ip_address"         INET,
    "user_agent"         TEXT,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- AUTH FEATURE TABLES
-- ============================================

CREATE TABLE "passkey_credentials" (
    "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"               UUID        NOT NULL,
    "credential_id"         TEXT        NOT NULL,
    "credential_public_key" BYTEA       NOT NULL,
    "counter"               BIGINT      NOT NULL DEFAULT 0,
    "transports"            TEXT[],
    "device_name"           VARCHAR(255),
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at"          TIMESTAMPTZ,
    CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_verification_tokens" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "token"      TEXT        NOT NULL,
    "user_id"    UUID        NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at"    TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "token"      TEXT        NOT NULL,
    "user_id"    UUID        NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at"    TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invitations" (
    "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    -- email_hash: HMAC-SHA256 blind index. Plaintext email is never stored —
    -- the inviter already knows it and it is only transmitted via the invitation email.
    "email_hash"          VARCHAR(64) NOT NULL,
    "token"               TEXT        NOT NULL,
    "invited_by_user_id"  UUID        NOT NULL,
    "hive_id"             UUID,
    "expires_at"          TIMESTAMPTZ NOT NULL,
    "used_at"             TIMESTAMPTZ,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES
-- ============================================

-- users
CREATE UNIQUE INDEX "users_email_hash_key"   ON "users" ("email_hash");

-- persons
CREATE INDEX "persons_hive_id_idx"           ON "persons" ("hive_id");
CREATE INDEX "persons_user_id_idx"           ON "persons" ("user_id");

-- user_hive_memberships
CREATE INDEX        "user_hive_memberships_user_id_idx"    ON "user_hive_memberships" ("user_id");
CREATE INDEX        "user_hive_memberships_hive_id_idx"    ON "user_hive_memberships" ("hive_id");
CREATE INDEX        "user_hive_memberships_person_id_idx"  ON "user_hive_memberships" ("person_id");
CREATE UNIQUE INDEX "user_hive_memberships_user_id_hive_id_key" ON "user_hive_memberships" ("user_id", "hive_id");

-- refresh_tokens
CREATE UNIQUE INDEX "refresh_tokens_token_key"       ON "refresh_tokens" ("token");
CREATE INDEX        "refresh_tokens_user_id_idx"     ON "refresh_tokens" ("user_id");
CREATE INDEX        "refresh_tokens_token_idx"       ON "refresh_tokens" ("token");
CREATE INDEX        "refresh_tokens_expires_at_idx"  ON "refresh_tokens" ("expires_at");
CREATE INDEX        "refresh_tokens_revoked_at_idx"  ON "refresh_tokens" ("revoked_at");
CREATE INDEX        "idx_refresh_tokens_active"      ON "refresh_tokens" ("user_id", "token");

-- passkey_credentials
CREATE UNIQUE INDEX "passkey_credentials_credential_id_key" ON "passkey_credentials" ("credential_id");
CREATE INDEX        "passkey_credentials_user_id_idx"       ON "passkey_credentials" ("user_id");

-- email_verification_tokens
CREATE UNIQUE INDEX "email_verification_tokens_token_key"      ON "email_verification_tokens" ("token");
CREATE INDEX        "email_verification_tokens_user_id_idx"    ON "email_verification_tokens" ("user_id");
CREATE INDEX        "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" ("expires_at");

-- password_reset_tokens
CREATE UNIQUE INDEX "password_reset_tokens_token_key"      ON "password_reset_tokens" ("token");
CREATE INDEX        "password_reset_tokens_user_id_idx"    ON "password_reset_tokens" ("user_id");
CREATE INDEX        "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" ("expires_at");

-- invitations
CREATE UNIQUE INDEX "invitations_token_key"               ON "invitations" ("token");
CREATE INDEX        "invitations_email_hash_idx"          ON "invitations" ("email_hash");
CREATE INDEX        "invitations_invited_by_user_id_idx"  ON "invitations" ("invited_by_user_id");
CREATE INDEX        "invitations_expires_at_idx"          ON "invitations" ("expires_at");

-- ============================================
-- FOREIGN KEYS
-- ============================================

ALTER TABLE "persons"
    ADD CONSTRAINT "persons_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "persons"
    ADD CONSTRAINT "persons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_hive_memberships"
    ADD CONSTRAINT "user_hive_memberships_user_id_fkey"   FOREIGN KEY ("user_id")   REFERENCES "users"   ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_hive_memberships"
    ADD CONSTRAINT "user_hive_memberships_hive_id_fkey"   FOREIGN KEY ("hive_id")   REFERENCES "hives"   ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_hive_memberships"
    ADD CONSTRAINT "user_hive_memberships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passkey_credentials"
    ADD CONSTRAINT "passkey_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_verification_tokens"
    ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens"
    ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations"
    ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations"
    ADD CONSTRAINT "invitations_hive_id_fkey" FOREIGN KEY ("hive_id") REFERENCES "hives" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- ROW-LEVEL SECURITY: persons
-- current_setting('app.hive_id', true) returns NULL (not error) when var is not set
-- ============================================

ALTER TABLE "persons" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "persons_hive_isolation" ON "persons"
    USING (hive_id = current_setting('app.hive_id', true)::uuid)
    WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "persons" FORCE ROW LEVEL SECURITY;

-- ============================================
-- TRIGGER: Minimum admin enforcement
-- Prevents removing the last parent (family) or org_admin (organization).
-- SECURITY DEFINER bypasses RLS so it can count all admins in the hive.
-- ============================================

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
