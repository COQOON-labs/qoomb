-- Add locale columns to users and hives tables.
-- BCP 47 language tags (e.g. 'de-DE', 'en-US', 'en-GB').
-- NULL means "inherit from next level in cascade" (user → hive → platform default → en-US).

ALTER TABLE "users" ADD COLUMN "locale" VARCHAR(12);

ALTER TABLE "hives" ADD COLUMN "locale" VARCHAR(12);
