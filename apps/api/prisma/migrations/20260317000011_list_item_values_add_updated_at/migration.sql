-- Add updated_at to list_item_values.
--
-- Rationale: without a timestamp on each value row, field-level Last-Write-Wins
-- conflict resolution (Phase 4 Offline Sync) is impossible. Two persons editing
-- different fields of the same item simultaneously would lose one edit entirely.
-- With updated_at on each row, the sync layer can merge at field granularity.
--
-- DEFAULT now() backfills existing rows with a consistent timestamp.
-- Prisma @updatedAt keeps it current on every subsequent write.

ALTER TABLE "list_item_values"
  ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();
