-- Add recurrence rule to list items.
--
-- recurrence_rule JSONB NULL
--   Stores an iCal-compatible recurrence rule as JSON.
--   Schema: { frequency: 'daily' | 'weekly' | 'monthly' | 'yearly', interval?: number }
--   NULL means the item does not recur.
--
--   When a recurring item's checkbox field is toggled to true (completed),
--   the client spawns a new copy of the item (same field values, unchecked)
--   so the next occurrence appears immediately in the checklist.

ALTER TABLE "list_items" ADD COLUMN "recurrence_rule" JSONB NULL;