-- Update RLS Policies for Multi-Hive Support
-- Updates policies to work with the new user_hive_memberships table

-- ============================================================================
-- DROP OLD POLICIES
-- ============================================================================

DROP POLICY IF EXISTS users_select_policy ON users;
DROP INDEX IF EXISTS idx_users_hive_id;
DROP INDEX IF EXISTS idx_users_email_hive_id;

-- ============================================================================
-- UPDATE USERS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Users can select their own record
CREATE POLICY users_select_policy ON users
  FOR SELECT
  USING (id = current_user_id());

-- ============================================================================
-- UPDATE AUDIT LOGS RLS (if needed)
-- ============================================================================

-- Audit logs should show logs for current user OR current hive
-- This allows seeing actions by other users in the same hive
DROP POLICY IF EXISTS audit_logs_select_policy ON audit_logs;

CREATE POLICY audit_logs_select_policy ON audit_logs
  FOR SELECT
  USING (
    user_id = current_user_id() 
    OR 
    hive_id = current_hive_id()
  );

-- ============================================================================
-- INDEXES FOR MULTI-HIVE QUERIES
-- ============================================================================

-- These are already created in the multi_hive_support migration, but adding comment
COMMENT ON INDEX user_hive_memberships_user_id_idx IS 'Index for looking up all hives for a user';
COMMENT ON INDEX user_hive_memberships_hive_id_idx IS 'Index for looking up all users in a hive';
COMMENT ON INDEX user_hive_memberships_person_id_idx IS 'Index for person lookups in memberships';
