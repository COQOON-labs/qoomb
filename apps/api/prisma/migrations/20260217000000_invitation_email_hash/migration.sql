-- Migration: Replace invitations.email (plaintext) with invitations.email_hash (HMAC-SHA256)
--
-- Security rationale:
--   The plain email address is PII and must not be stored in cleartext.
--   The HMAC-SHA256 blind index (same key derivation as users.email_hash) allows
--   O(1) lookup and constant-time comparison without exposing the address.
--
-- Data impact:
--   All pending (unused) invitations are invalidated here because we cannot
--   recompute the HMAC without the encryption key (app-layer secret).
--   Anyone with a pending invitation will need to be re-invited.

-- Step 1: Invalidate all pending invitations — their plaintext email is
--         about to be removed and the HMAC cannot be computed in raw SQL.
UPDATE "invitations" SET "used_at" = NOW() WHERE "used_at" IS NULL;

-- Step 2: Add email_hash column (VARCHAR 64 = hex-encoded SHA-256 output).
--         Use empty string as placeholder for already-invalidated rows so we
--         can immediately add the NOT NULL constraint without a second pass.
ALTER TABLE "invitations" ADD COLUMN "email_hash" VARCHAR(64) NOT NULL DEFAULT '';

-- Step 3: Drop the default (only needed for Step 2; new rows always supply the hash).
ALTER TABLE "invitations" ALTER COLUMN "email_hash" DROP DEFAULT;

-- Step 4: Drop the old plaintext column.
ALTER TABLE "invitations" DROP COLUMN "email";

-- Step 5: Index on email_hash for O(1) lookups (replaces the old index on email).
CREATE INDEX "invitations_email_hash_idx" ON "invitations" ("email_hash");
