-- Replace single-column list_id indexes with composite (list_id, sort_order)
-- on list_items and list_fields.
--
-- Rationale: the most common query pattern for both tables is:
--   SELECT ... WHERE list_id = ? ORDER BY sort_order
-- A composite index on (list_id, sort_order) eliminates the separate sort step
-- and is a superset of the single-column (list_id) index for equality predicates,
-- making the old indexes redundant.

-- list_fields
DROP INDEX "list_fields_list_id_idx";
CREATE INDEX "list_fields_list_id_sort_order_idx" ON "list_fields" ("list_id", "sort_order");

-- list_items
DROP INDEX "list_items_list_id_idx";
CREATE INDEX "list_items_list_id_sort_order_idx" ON "list_items" ("list_id", "sort_order");
