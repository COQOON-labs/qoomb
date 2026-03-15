-- Migration: add_reencrypt_backup
-- Adds the reencrypt_backups table used by the key-rotation re-encryption script.
-- Each row stores the old ciphertext for a single field before it is overwritten,
-- so that the migration can be rolled back manually if needed.
-- Rows expire after REENCRYPT_BACKUP_RETENTION_DAYS days (default 30) and are
-- removed by the operator via `pnpm --filter @qoomb/api db:reencrypt-cleanup`.

CREATE TABLE "reencrypt_backups" (
    "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
    "table_name"     TEXT        NOT NULL,
    "record_id"      UUID        NOT NULL,
    "field_name"     TEXT        NOT NULL,
    "old_ciphertext" TEXT        NOT NULL,
    "from_version"   INTEGER     NOT NULL,
    "to_version"     INTEGER     NOT NULL,
    "migrated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expires_at"     TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reencrypt_backups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reencrypt_backups_expires_idx" ON "reencrypt_backups" ("expires_at");
CREATE INDEX "reencrypt_backups_record_idx"  ON "reencrypt_backups" ("table_name", "record_id");

-- ============================================
-- ACCESS CONTROL
-- Restrict reencrypt_backups to operator-session connections only.
--
-- The re-encryption CLI scripts set SET app.reencrypt_session = 'true' on their
-- single pooled connection (max: 1) before running.  Normal NestJS app connections
-- never set this variable, so all three RLS operations (SELECT, INSERT, DELETE)
-- are denied at the database layer.
--
-- Superusers (PostgreSQL built-in) bypass FORCE ROW LEVEL SECURITY — acceptable
-- for local development where the DB owner is also the app user.
-- In production use a dedicated admin role (GRANT BYPASS RLS) for CLI scripts
-- and a restricted app role (no BYPASS RLS) for the NestJS process.
-- ============================================
ALTER TABLE "reencrypt_backups" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reencrypt_backups_ops_only" ON "reencrypt_backups"
    USING     (current_setting('app.reencrypt_session', true) = 'true')
    WITH CHECK (current_setting('app.reencrypt_session', true) = 'true');

ALTER TABLE "reencrypt_backups" FORCE ROW LEVEL SECURITY;
