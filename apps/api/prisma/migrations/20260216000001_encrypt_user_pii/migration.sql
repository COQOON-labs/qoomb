-- Migration: encrypt_user_pii
-- Removes dead columns (nickname, birthday, avatar_url) and prepares the
-- users table for encrypted PII storage.
--
-- email: drops the UNIQUE constraint and widens to TEXT (ciphertext > plaintext).
-- email_hash: new column — HMAC-SHA256 blind index for O(1) lookups.
-- full_name: widens to TEXT for ciphertext storage.
--
-- NOTE: After applying this migration, existing rows will have a NULL email_hash
-- and their email/full_name columns will still contain plaintext.
-- Run `pnpm --filter @qoomb/api db:seed` to repopulate with encrypted values
-- (or run `db:reset` first on a dev database).

-- Drop dead columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "nickname";
ALTER TABLE "users" DROP COLUMN IF EXISTS "birthday";
ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_url";

-- email: remove unique index, widen to TEXT for ciphertext.
-- The init migration created this as CREATE UNIQUE INDEX (not ADD CONSTRAINT),
-- so DROP INDEX is required — DROP CONSTRAINT would silently no-op.
DROP INDEX IF EXISTS "users_email_key";
ALTER TABLE "users" ALTER COLUMN "email" TYPE TEXT;

-- email_hash: blind index for deterministic lookups (nullable during migration window)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_hash" VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_hash_key" ON "users"("email_hash");

-- full_name: widen to TEXT for ciphertext storage
ALTER TABLE "users" ALTER COLUMN "full_name" TYPE TEXT;
