-- Migration: auth_extensions
-- Auth feature tables: PassKeys, Email Verification, Password Reset, Invitations

-- ============================================
-- AUTH EXTENSION TABLES
-- ============================================

-- CreateTable: passkey_credentials (WebAuthn / FIDO2)
CREATE TABLE "passkey_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "credential_public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "device_name" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable: email_verification_tokens
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: password_reset_tokens
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invitations
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "token" TEXT NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "hive_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- INDEXES
-- ============================================

CREATE UNIQUE INDEX "passkey_credentials_credential_id_key" ON "passkey_credentials"("credential_id");
CREATE INDEX "passkey_credentials_user_id_idx" ON "passkey_credentials"("user_id");

CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");
CREATE INDEX "invitations_email_idx" ON "invitations"("email");
CREATE INDEX "invitations_invited_by_user_id_idx" ON "invitations"("invited_by_user_id");
CREATE INDEX "invitations_expires_at_idx" ON "invitations"("expires_at");

-- ============================================
-- FOREIGN KEYS
-- ============================================

ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey"
    FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_hive_id_fkey"
    FOREIGN KEY ("hive_id") REFERENCES "hives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
