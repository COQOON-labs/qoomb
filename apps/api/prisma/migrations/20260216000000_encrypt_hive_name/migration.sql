-- Migration: encrypt_hive_name
-- Changes hive.name from VARCHAR(255) to TEXT.
-- The name field is now encrypted at rest (AES-256-GCM, per-hive key).
-- TEXT is required because ciphertext is longer than plaintext.

ALTER TABLE "hives" ALTER COLUMN "name" TYPE TEXT;
