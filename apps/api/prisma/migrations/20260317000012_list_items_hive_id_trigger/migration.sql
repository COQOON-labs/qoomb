-- Enforce hive_id consistency on list_items via a BEFORE INSERT trigger.
--
-- Rationale: list_items.hive_id is a denormalized copy of lists.hive_id kept
-- for cheap RLS evaluation (direct column check vs. a subquery JOIN). Because
-- lists.hive_id is immutable (no API allows moving a list between hives), the
-- denormalization is safe by application-level invariant. However, "safe by
-- convention" is weaker than "safe by construction". This trigger enforces the
-- invariant at the database level: hive_id is always derived from the parent
-- list, regardless of what the application passes.
--
-- The trigger fires BEFORE INSERT only. list_id is never updated after creation
-- (items do not move between lists), so no UPDATE trigger is needed.

CREATE OR REPLACE FUNCTION list_items_enforce_hive_id()
RETURNS TRIGGER AS $$
BEGIN
    SELECT hive_id INTO NEW.hive_id
    FROM lists
    WHERE id = NEW.list_id;

    IF NEW.hive_id IS NULL THEN
        RAISE EXCEPTION 'list_items_enforce_hive_id: list % not found or has no hive_id', NEW.list_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER list_items_enforce_hive_id_trigger
BEFORE INSERT ON "list_items"
FOR EACH ROW EXECUTE FUNCTION list_items_enforce_hive_id();
