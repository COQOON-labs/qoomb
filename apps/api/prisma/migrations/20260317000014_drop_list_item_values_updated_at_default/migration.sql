-- Drop the DEFAULT now() from list_item_values.updated_at.
--
-- Migration 000011 used DEFAULT now() to backfill existing rows when the column
-- was added. That DB-level default is no longer needed: Prisma's @updatedAt sets
-- the value at the application layer on every write. Keeping a DB default causes
-- a schema drift detected by `prisma migrate diff` / CI.

ALTER TABLE "list_item_values"
  ALTER COLUMN "updated_at" DROP DEFAULT;
