-- Align Phase 3 tables with the Prisma schema after migration 20260315000007.
--
-- Root causes introduced by that migration's hand-written SQL:
--
--   1. updated_at columns were given DEFAULT now() — Prisma @updatedAt manages
--      these at the application layer and expects no DB-level default.
--
--   2. FKs were created via inline REFERENCES syntax, which defaults to
--      ON UPDATE NO ACTION. Prisma generates ON UPDATE CASCADE for all
--      relations by default, so the constraint definitions diverge.
--
--   3. The notifications hive_id index was named idx_notifications_hive;
--      Prisma auto-names an un-mapped @@index([hiveId]) as
--      {Model_table}_{field}_idx, i.e. notifications_hive_id_idx.
--
-- This migration brings all four tables into sync with no data loss.

-- ---------------------------------------------------------------------------
-- 1. Drop DB-level DEFAULT from @updatedAt columns
-- ---------------------------------------------------------------------------

ALTER TABLE direct_messages         ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE notification_preferences ALTER COLUMN updated_at DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 2. Rename notifications index to the Prisma auto-generated name
-- ---------------------------------------------------------------------------

ALTER INDEX idx_notifications_hive RENAME TO "notifications_hive_id_idx";

-- ---------------------------------------------------------------------------
-- 3. Recreate FK constraints with ON UPDATE CASCADE
--
--    The Phase 3 migration relied on inline REFERENCES, leaving the ON UPDATE
--    action at NO ACTION (PostgreSQL default). Prisma always generates
--    ON UPDATE CASCADE. We drop and recreate each constraint.
--
--    Constraint names follow PostgreSQL's auto-assigned naming convention:
--    {table}_{column}_fkey — which matches Prisma's expected names.
-- ---------------------------------------------------------------------------

-- activity_events ---------------------------------------------------------
ALTER TABLE activity_events
  DROP CONSTRAINT activity_events_hive_id_fkey,
  DROP CONSTRAINT activity_events_actor_person_id_fkey;

ALTER TABLE activity_events
  ADD CONSTRAINT "activity_events_hive_id_fkey"
  FOREIGN KEY (hive_id) REFERENCES hives(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE activity_events
  ADD CONSTRAINT "activity_events_actor_person_id_fkey"
  FOREIGN KEY (actor_person_id) REFERENCES persons(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- direct_messages ---------------------------------------------------------
ALTER TABLE direct_messages
  DROP CONSTRAINT direct_messages_hive_id_fkey,
  DROP CONSTRAINT direct_messages_sender_person_id_fkey,
  DROP CONSTRAINT direct_messages_recipient_person_id_fkey;

ALTER TABLE direct_messages
  ADD CONSTRAINT "direct_messages_hive_id_fkey"
  FOREIGN KEY (hive_id) REFERENCES hives(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE direct_messages
  ADD CONSTRAINT "direct_messages_sender_person_id_fkey"
  FOREIGN KEY (sender_person_id) REFERENCES persons(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE direct_messages
  ADD CONSTRAINT "direct_messages_recipient_person_id_fkey"
  FOREIGN KEY (recipient_person_id) REFERENCES persons(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- notification_preferences ------------------------------------------------
ALTER TABLE notification_preferences
  DROP CONSTRAINT notification_preferences_hive_id_fkey,
  DROP CONSTRAINT notification_preferences_person_id_fkey;

ALTER TABLE notification_preferences
  ADD CONSTRAINT "notification_preferences_hive_id_fkey"
  FOREIGN KEY (hive_id) REFERENCES hives(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE notification_preferences
  ADD CONSTRAINT "notification_preferences_person_id_fkey"
  FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- notifications -----------------------------------------------------------
ALTER TABLE notifications
  DROP CONSTRAINT notifications_hive_id_fkey,
  DROP CONSTRAINT notifications_recipient_person_id_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT "notifications_hive_id_fkey"
  FOREIGN KEY (hive_id) REFERENCES hives(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT "notifications_recipient_person_id_fkey"
  FOREIGN KEY (recipient_person_id) REFERENCES persons(id) ON DELETE CASCADE ON UPDATE CASCADE;
