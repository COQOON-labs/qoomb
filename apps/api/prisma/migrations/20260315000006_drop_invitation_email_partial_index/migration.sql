-- Migration: drop_invitation_email_partial_index
--
-- The previous migration (20260314000005_invitation_email) created a partial
-- index on invitations.email:
--
--   CREATE INDEX "invitations_email_idx" ON "invitations" ("email")
--       WHERE "email" != '';
--
-- Prisma cannot represent partial (conditional) indexes in its schema DSL, so
-- the `prisma migrate diff` / shadow-database check flags this as schema drift:
--   "[-] Removed index on columns (email)"
--
-- The index was added as a convenience for the re-encryption script, but the
-- script only runs as an infrequent admin operation that scans all rows anyway.
-- Dropping the index removes the drift and matches the Prisma schema exactly.

DROP INDEX IF EXISTS "invitations_email_idx";
