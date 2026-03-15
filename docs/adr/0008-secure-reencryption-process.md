# ADR-0008: Secure Re-Encryption Process

**Status:** Accepted  
**Date:** 2026-03-14  
**Deciders:** Benjamin Gröner  
**Categories:** Security, Encryption, Operations

---

## Context

Qoomb encrypts all sensitive field values at rest using AES-256-GCM with per-hive or per-user HKDF-derived keys (see ADR-0005). When the master encryption key must be replaced — either because of a suspected compromise, a scheduled rotation policy, or a key-provider change — **every encrypted value in the database must be re-encrypted** with the new key before the old key can be retired.

This process is operationally dangerous:

- A bug in the re-encryption script could silently produce unreadable ciphertext, making data permanently inaccessible.
- Discarding old ciphertext before confirming the new ciphertext is correct creates an irreversible data-loss window.
- Missing encrypted fields from the migration leaves "zombie" values that can no longer be decrypted once the old key is removed.
- Misconfiguration of environment variables (e.g. using the wrong key version index) could corrupt all records silently.

The old script (`db:reencrypt`) lacked backup preservation, had incomplete field coverage (`locale` was not migrated), and was not tested end-to-end.

---

## Decision

### 1. Complete Field Inventory (Mandatory)

Every column that is encrypted at the application layer **must** be explicitly listed in the re-encryption script. Encrypted fields are identified by:

- a `v{n}:` storage prefix (hive-scoped: `enc.serializeToStorage`, user-scoped: `enc.encryptForUser`)
- a documented comment in `schema.prisma` marking the column as encrypted

**Current encrypted fields — re-encrypted during key rotation:**

| Table              | Column(s)                                             | Key scope                                                                 |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| `users`            | `email`, `full_name`, `locale`                        | per-user                                                                  |
| `users`            | `email_hash`                                          | HMAC, recomputed from plaintext email                                     |
| `hives`            | `name`                                                | per-hive                                                                  |
| `persons`          | `display_name`, `avatar_url`, `birthdate`             | per-hive                                                                  |
| `events`           | `title`, `description`, `location`, `url`, `category` | per-hive                                                                  |
| `hive_groups`      | `name`, `description`                                 | per-hive                                                                  |
| `lists`            | `name`                                                | per-hive                                                                  |
| `list_fields`      | `name`                                                | per-hive                                                                  |
| `list_views`       | `name`                                                | per-hive                                                                  |
| `list_item_values` | `value`                                               | per-hive                                                                  |
| `invitations`      | `email_hash`                                          | HMAC, recomputed from plaintext `email` column (migration 20260314000005) |

**Rule:** When a new encrypted field or table is added to the codebase, the developer MUST simultaneously:

1. Add the field to this inventory table above.
2. Add a migration function in `apps/api/prisma/scripts/reencrypt.ts`.
3. Add at least one test case to `apps/api/prisma/scripts/reencrypt.test.ts` covering the new field.

This three-step requirement is enforced through code review (PR checklist).

### 2. Verify-Before-Commit (Mandatory)

The re-encryption script must **never write a new ciphertext unless it can decrypt it back to the exact original plaintext**. The verification happens inside the same database transaction, before the `UPDATE` is committed:

```
for each record:
  old_value = read from DB
  plaintext = decrypt(old_value, old_key)
  new_value = encrypt(plaintext, new_key)
  verified  = decrypt(new_value, new_key)       ← must equal plaintext
  if verified ≠ plaintext → throw (transaction rolls back)
  else → commit UPDATE
```

If verification fails for any record, the script terminates with a non-zero exit code. The **old ciphertext is left unchanged** in the database.

### 3. Backup Table with Configurable Retention (Mandatory)

Before overwriting a record, the old ciphertext is written to a dedicated `reencrypt_backups` table. This table lives in the `public` schema (not a tenant schema). Although it contains old ciphertexts rather than plaintext, cross-hive exposure would still be a security risk, so the table is protected by Row-Level Security — see Section 8 (Security Isolation) below.

**Schema:**

```sql
CREATE TABLE reencrypt_backups (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name       TEXT        NOT NULL,
  record_id        UUID        NOT NULL,
  field_name       TEXT        NOT NULL,
  old_ciphertext   TEXT        NOT NULL,
  from_version     INTEGER     NOT NULL,
  to_version       INTEGER     NOT NULL,
  migrated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX reencrypt_backups_expires_idx   ON reencrypt_backups (expires_at);
CREATE INDEX reencrypt_backups_record_idx    ON reencrypt_backups (table_name, record_id);
```

**Retention period:** Configured via `REENCRYPT_BACKUP_RETENTION_DAYS` (default: `30`).

The backup row is written **within the same transaction** as the `UPDATE`. Either both succeed or neither does.

**Read-back**: To restore an individual record from backup:

```sql
SELECT old_ciphertext FROM reencrypt_backups
WHERE table_name = 'users' AND record_id = '<uuid>' AND field_name = 'email'
ORDER BY migrated_at DESC LIMIT 1;
```

Then manually `UPDATE users SET email = '<old_ciphertext>' WHERE id = '<uuid>'`.

### 4. Expiry and Cleanup (Mandatory)

Expired backup rows must be removed separately, not automatically. Operators run:

```bash
pnpm --filter @qoomb/api db:reencrypt-cleanup
```

This deletes all rows where `expires_at < now()`. The command must be run manually so that operators confirm the new ciphertext is working in production first.

**Safety interlocks:**

- The cleanup script refuses to run if any row has `expires_at > now()` AND the system is still in rotation mode (`ENCRYPTION_KEY_CURRENT` is set). This means: finish rotation, remove old key from env, _then_ clean up.
- If `REENCRYPT_BACKUP_RETENTION_DAYS` is set to 0, the script refuses to run and logs an error — zero-day retention is not allowed.

### 5. Deployment Sequence with Safety Gates

```
Step 1   openssl rand -base64 32                    → generate new master key
Step 2   Set ENCRYPTION_KEY_CURRENT=2,
         ENCRYPTION_KEY_V1=<old>, ENCRYPTION_KEY_V2=<new>
Step 3   Restart the app (now loads both keys;
         hashEmailAllVersions() makes login work for both hash versions)
Step 4   pnpm --filter @qoomb/api db:reencrypt      → dry run (zero writes)
         Review output: all tables, expected record counts
Step 5   pnpm --filter @qoomb/api db:reencrypt --execute
         → each record: backup saved, new ciphertext verified, then written
         → login continues uninterrupted throughout (no disruption window)
Step 6   Verify in production: login, profile, encrypted field reads
Step 7   After ≥ REENCRYPT_BACKUP_RETENTION_DAYS days of confirmed stability,
         remove ENCRYPTION_KEY_V1 + ENCRYPTION_KEY_CURRENT from env
Step 8   Rename ENCRYPTION_KEY_V2 → ENCRYPTION_KEY (single-key mode)
Step 9   Restart the app (back to single-key mode)
Step 10  pnpm --filter @qoomb/api db:reencrypt-cleanup
         (only succeeds if no active rotation mode is detected)
```

### 6. Test Coverage (Mandatory)

The following test scenarios must exist in `apps/api/prisma/scripts/reencrypt.test.ts`:

| Scenario                        | Description                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `reencryptField` — skip         | Value already at target version → return null, no-op                                                                           |
| `reencryptField` — migrate      | Value at `fromVersion` → returns new ciphertext at new version                                                                 |
| `reencryptField` — null input   | null stored value → return null, no-op                                                                                         |
| `reencryptField` — verification | In-place verification: `decrypt(newCiphertext) === plaintext`                                                                  |
| Rotation mode key loading       | EncryptionService initialises with V1+V2 keys, `getCurrentKeyVersion()` returns 2                                              |
| Cross-version decryption        | V1 ciphertext decrypted by service running in V2 (rotation mode)                                                               |
| emailHash recomputation         | hashEmail result changes with new master key                                                                                   |
| `getBackupRetentionDays`        | Default 30; env override; rejects zero, negative, and NaN values                                                               |
| `backupExpiresAt`               | Returns future Date; scales correctly with retention days                                                                      |
| `buildBackupRow`                | Correct structure, expiresAt derived from retentionDays, no mutation                                                           |
| Version-mixing batch            | Mixed v1/v2 batch: only v1 records migrated; already-v2 records skipped; `encryptFn` never called for already-migrated records |
| Resumability — partial run      | Second pass over a partially-migrated batch skips already-v2 records; third pass (all migrated) returns all-null               |

These are unit tests that do not require a running database.

### 7. Resumability of Aborted Migrations

The re-encryption script is safe to abort and resume for **all encrypted fields**, including `emailHash`.

The skip condition `!stored.startsWith('v${fromVersion}:')` means any record already re-encrypted to `v2:...` is silently skipped on the next run.

**`emailHash` specifically:** Because `EncryptionService.hashEmailAllVersions()` is used for all DB lookups, the app can find users by email regardless of whether their `emailHash` is at V1 or V2. There is **no disruption window** — the app does not need to be restarted before, during, or after the migration.

The safe sequence is simply:

1. Set rotation env vars (`ENCRYPTION_KEY_CURRENT=2`, `ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`)
2. Optionally restart the app (it will load both keys and use `hashEmailAllVersions` automatically)
3. Run `db:reencrypt --execute` at any time — login works throughout
4. After confirmed stability, remove the old key and restart once in single-key mode

### 8. Security Isolation of the Backup Table

Although `reencrypt_backups` stores old ciphertexts (not plaintext), cross-hive access would expose which fields changed between rotation cycles. The table is protected by Row-Level Security:

```sql
ALTER TABLE "reencrypt_backups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reencrypt_backups_ops_only" ON "reencrypt_backups"
    USING     (current_setting('app.reencrypt_session', true) = 'true')
    WITH CHECK (current_setting('app.reencrypt_session', true) = 'true');
ALTER TABLE "reencrypt_backups" FORCE ROW LEVEL SECURITY;
```

**How it works:**

- Normal application connections never set `app.reencrypt_session`. Any attempt to `SELECT`, `INSERT`, `UPDATE`, or `DELETE` from `reencrypt_backups` is denied by the policy.
- The three re-encryption scripts (`reencrypt.ts`, `reencrypt-rollback.ts`, `reencrypt-cleanup.ts`) execute `SET app.reencrypt_session = 'true'` at startup and use a connection pool with `max: 1`. This guarantees the session variable persists for every subsequent query in the process (single shared connection).
- PostgreSQL superusers bypass `FORCE ROW LEVEL SECURITY`. In development this is acceptable; in production, the re-encryption scripts should run as a dedicated database role that is **not** a superuser, ensuring the RLS policy is enforced unconditionally.

**Limitation:** The `app.reencrypt_session` variable is a session setting, not a transaction setting. If two different processes (e.g., the app and the re-encryption script) share the same physical connection (e.g., via a PgBouncer transaction-mode pool), the setting from one process would leak to the other. The `max: 1` pool in the scripts prevents this — each script process owns exactly one dedicated connection with no sharing.

### 9. ESLint and Console Output

The re-encryption script is a CLI tool. It uses `console.log` extensively for operator feedback (progress, dry-run output, summary). A file-level `/* eslint-disable no-console */` comment is added at the top of the script. This is the single approved exception to the `no-console` rule — it is explicitly for operator-facing CLI scripts, not application code.

---

## Consequences

### Positive

- Zero-risk key rotation: old ciphertext is never lost; recovery is always possible within the retention window.
- Complete field coverage: locale (and all future encrypted fields) are migrated.
- Testable: rotation and verification logic is unit-tested; regressions are caught before deployment.
- Auditable: the backup table provides a complete log of what was re-encrypted, when, and from which version.

### Negative / Trade-offs

- The backup table can grow large for databases with many encrypted records. Operators must remember to run the cleanup command.
- The brief login disruption window (Steps 4→5) **no longer exists**. `EncryptionService.hashEmailAllVersions()` queries both V1 and V2 hashes simultaneously, so logins succeed regardless of whether a user's `emailHash` row has been re-encrypted yet.

### Neutral

- The `REENCRYPT_BACKUP_RETENTION_DAYS` environment variable is only relevant during and after a rotation. It should be set before running the script and removed after cleanup.

---

## References

- [ADR-0005](./0005-hybrid-encryption-architecture.md) — Hybrid Encryption Architecture
- [apps/api/prisma/scripts/reencrypt.ts](../../apps/api/prisma/scripts/reencrypt.ts) — Re-encryption script
- [apps/api/prisma/scripts/reencrypt-rollback.ts](../../apps/api/prisma/scripts/reencrypt-rollback.ts) — Rollback script (restore from backup)
- [apps/api/prisma/scripts/reencrypt-cleanup.ts](../../apps/api/prisma/scripts/reencrypt-cleanup.ts) — Cleanup script (delete expired backups)
- [apps/api/prisma/scripts/reencrypt.test.ts](../../apps/api/prisma/scripts/reencrypt.test.ts) — Tests
- [apps/api/prisma/migrations/20260314000004_add_reencrypt_backup/migration.sql](../../apps/api/prisma/migrations/20260314000004_add_reencrypt_backup/migration.sql) — Backup table + RLS migration
- [docs/SECURITY.md](../SECURITY.md) — Security architecture
