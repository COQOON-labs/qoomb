-- Add Refresh Tokens Table
-- This migration adds support for JWT refresh tokens with rotation

-- ============================================================================
-- REFRESH TOKENS TABLE
-- ============================================================================

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  replaced_by_token TEXT,

  -- Track device/session info for security monitoring
  ip_address INET,
  user_agent TEXT,

  CONSTRAINT valid_expiration CHECK (expires_at > created_at),
  CONSTRAINT revoked_before_expiry CHECK (revoked_at IS NULL OR revoked_at <= expires_at)
);

-- Indexes for performance
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

-- Partial index for active tokens (not revoked)
-- Note: Removed expires_at > NOW() check for PostgreSQL 17 compatibility
-- (index predicates must use IMMUTABLE functions only)
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(user_id, token)
  WHERE revoked_at IS NULL;

-- ============================================================================
-- ROW-LEVEL SECURITY FOR REFRESH TOKENS
-- ============================================================================

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read their own refresh tokens
CREATE POLICY refresh_tokens_select_policy ON refresh_tokens
  FOR SELECT
  USING (user_id = current_user_id());

-- Only application can insert refresh tokens
CREATE POLICY refresh_tokens_insert_policy ON refresh_tokens
  FOR INSERT
  WITH CHECK (TRUE);

-- Only application can update refresh tokens (for revocation)
CREATE POLICY refresh_tokens_update_policy ON refresh_tokens
  FOR UPDATE
  USING (TRUE);

-- Users can delete their own refresh tokens (logout)
CREATE POLICY refresh_tokens_delete_policy ON refresh_tokens
  FOR DELETE
  USING (user_id = current_user_id());

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================

-- Function to clean up expired refresh tokens (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens() RETURNS void AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '30 days'; -- Keep for audit trail
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE refresh_tokens IS 'Stores refresh tokens for JWT authentication with rotation support';
COMMENT ON COLUMN refresh_tokens.token IS 'Hashed refresh token (SHA-256)';
COMMENT ON COLUMN refresh_tokens.replaced_by_token IS 'Hash of the new token that replaced this one (for token rotation)';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Timestamp when token was revoked (NULL if still valid)';
COMMENT ON FUNCTION cleanup_expired_refresh_tokens() IS 'Removes refresh tokens that expired more than 30 days ago';
