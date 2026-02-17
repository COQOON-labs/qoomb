-- Make email_hash NOT NULL.
-- All users must have their emailHash set before this migration is applied.
-- In production: run `db:reencrypt --execute` first if any NULL rows exist.
ALTER TABLE "users" ALTER COLUMN "email_hash" SET NOT NULL;
