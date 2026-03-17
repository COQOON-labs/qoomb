-- Remove assignee_id from list_items.
--
-- Rationale: assigneeId was a hard-coded column that gave every list an implicit
-- assignee concept — even shopping lists and budgets that have no such concept.
-- Assignment is now modelled as a ListField of fieldType 'person', consistent
-- with the EAV approach where all user-defined properties live as field values.

-- Drop the composite index that referenced assignee_id
DROP INDEX IF EXISTS "list_items_hive_id_assignee_id_idx";

-- Drop the FK constraint before dropping the column
ALTER TABLE "list_items" DROP CONSTRAINT IF EXISTS "list_items_assignee_id_fkey";

-- Drop the column
ALTER TABLE "list_items" DROP COLUMN IF EXISTS "assignee_id";
