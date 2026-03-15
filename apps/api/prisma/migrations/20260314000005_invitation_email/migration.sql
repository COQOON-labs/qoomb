-- Migration: invitation_email
-- Adds a plaintext email column to the invitations table.
--
-- Rationale: Invitation.emailHash is an HMAC derived from the master key.
-- When the master key rotates the HMAC cannot be re-derived (plaintext is
-- not stored anywhere), which means pending invitations become unresolvable
-- until they expire. Storing the normalized plaintext email allows the
-- re-encryption script to update the HMAC during key rotation, keeping
-- existing invitations valid throughout the rotation process.
--
-- Security note: Invitation records are short-lived (7 days), the email
-- is already known to the inviter, and it is transmitted in the invitation
-- email itself. The marginal exposure of storing it here is accepted by the
-- operator as a deliberate trade-off (see ADR-0008).
--
-- The column is NOT NULL for new rows.  Existing rows (if any) are backfilled
-- with an empty string sentinel; operators can clean them up manually or let
-- them expire naturally.

ALTER TABLE "invitations" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

-- Remove the default so future inserts must supply the value explicitly.
ALTER TABLE "invitations" ALTER COLUMN "email" DROP DEFAULT;

-- Index for re-encryption script lookups (SELECT WHERE email IS NOT NULL).
CREATE INDEX "invitations_email_idx" ON "invitations" ("email")
    WHERE "email" != '';
