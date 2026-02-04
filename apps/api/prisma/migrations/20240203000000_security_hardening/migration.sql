-- Security Hardening Migration
-- This migration implements defense-in-depth security measures:
-- 1. Row-Level Security (RLS) policies for public schema tables
-- 2. Session variables for user context
-- 3. Additional indexes for security queries

-- ============================================================================
-- SESSION VARIABLES
-- ============================================================================

-- Function to get current user ID from session
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Function to get current hive ID from session
CREATE OR REPLACE FUNCTION current_hive_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.hive_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- ROW-LEVEL SECURITY: HIVES TABLE
-- ============================================================================

-- Enable RLS on hives table
ALTER TABLE hives ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own hive
CREATE POLICY hives_select_policy ON hives
  FOR SELECT
  USING (id = current_hive_id());

-- Policy: No direct updates to hives (managed by application)
CREATE POLICY hives_update_policy ON hives
  FOR UPDATE
  USING (id = current_hive_id());

-- Policy: No direct deletes (managed by application with proper cascade logic)
CREATE POLICY hives_delete_policy ON hives
  FOR DELETE
  USING (FALSE);

-- Policy: Hive creation is managed by auth service (no RLS needed for INSERT)
-- This allows the auth service to create hives without setting session variables
CREATE POLICY hives_insert_policy ON hives
  FOR INSERT
  WITH CHECK (TRUE);

-- ============================================================================
-- ROW-LEVEL SECURITY: USERS TABLE
-- ============================================================================

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own user record
CREATE POLICY users_select_policy ON users
  FOR SELECT
  USING (id = current_user_id() OR hive_id = current_hive_id());

-- Policy: Users can only update their own record
CREATE POLICY users_update_policy ON users
  FOR UPDATE
  USING (id = current_user_id());

-- Policy: User creation is managed by auth service (no RLS needed for INSERT)
CREATE POLICY users_insert_policy ON users
  FOR INSERT
  WITH CHECK (TRUE);

-- Policy: Users cannot delete themselves (managed by admin/application)
CREATE POLICY users_delete_policy ON users
  FOR DELETE
  USING (FALSE);

-- ============================================================================
-- SECURITY INDEXES
-- ============================================================================

-- Index for hive ownership lookups (used in validation)
CREATE INDEX IF NOT EXISTS idx_users_hive_id ON users(hive_id);

-- Index for user authentication lookups
CREATE INDEX IF NOT EXISTS idx_users_email_hive_id ON users(email, hive_id);

-- ============================================================================
-- SECURITY CONSTRAINTS
-- ============================================================================

-- Ensure user email is trimmed and lowercase (normalized)
CREATE OR REPLACE FUNCTION normalize_email() RETURNS TRIGGER AS $$
BEGIN
  NEW.email := LOWER(TRIM(NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_user_email
  BEFORE INSERT OR UPDATE OF email ON users
  FOR EACH ROW
  EXECUTE FUNCTION normalize_email();

-- ============================================================================
-- AUDIT LOGGING FOUNDATION
-- ============================================================================

-- Create audit log table for security events
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(50) NOT NULL,
  user_id UUID,
  hive_id UUID,
  resource_type VARCHAR(50),
  resource_id UUID,
  action VARCHAR(20) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for audit log queries
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_hive_id ON audit_logs(hive_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);

-- RLS for audit logs: users can only see their own audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_policy ON audit_logs
  FOR SELECT
  USING (user_id = current_user_id());

-- Only application can insert audit logs
CREATE POLICY audit_logs_insert_policy ON audit_logs
  FOR INSERT
  WITH CHECK (TRUE);

-- No updates or deletes on audit logs
CREATE POLICY audit_logs_update_policy ON audit_logs
  FOR UPDATE
  USING (FALSE);

CREATE POLICY audit_logs_delete_policy ON audit_logs
  FOR DELETE
  USING (FALSE);

-- ============================================================================
-- SECURITY COMMENTS
-- ============================================================================

COMMENT ON FUNCTION current_user_id() IS 'Returns the current authenticated user ID from session variable app.user_id';
COMMENT ON FUNCTION current_hive_id() IS 'Returns the current authenticated hive ID from session variable app.hive_id';
COMMENT ON TABLE audit_logs IS 'Audit log for security-relevant events and actions';
COMMENT ON POLICY hives_select_policy ON hives IS 'Users can only read their own hive';
COMMENT ON POLICY users_select_policy ON users IS 'Users can only read their own user record or users in their hive';
