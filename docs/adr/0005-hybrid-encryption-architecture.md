# ADR-0005: Hybrid Encryption Architecture

**Status:** Accepted  
**Date:** 2026-02-20  
**Deciders:** Benjamin Gröner

## Context

Qoomb stores sensitive personal data — names, birthdates, event descriptions, task details,
locations, uploaded files. As a privacy-first platform, we need encryption that:

1. **Protects data at rest** — a database breach must not expose plaintext PII
2. **Isolates tenants cryptographically** — compromise of one hive's key must not affect others
3. **Isolates users** — PII tied to the authentication identity (email, full name) must be
   encrypted independently from hive data
4. **Works without external services** — self-hosted deployments cannot depend on cloud KMS
5. **Supports key rotation** — keys must be rotatable without re-encrypting all existing data
   immediately
6. **Is invisible to developers** — encryption must not require manual encrypt/decrypt calls
   in every service method
7. **Preserves search and filtering** — structural metadata needed for queries must remain
   operational while content is encrypted
8. **Scales to files** — uploaded documents need a different encryption scheme than short text
   fields

Meanwhile, we must avoid:

- **Over-encryption** — encrypting everything makes the database unusable for filtering, sorting,
  and indexing
- **Tight coupling to one KMS** — choosing AWS KMS or Google Cloud KMS as the only option would
  violate our cloud-agnostic principle (ADR-0004)
- **Manual encryption** — requiring developers to remember to encrypt/decrypt in every method
  is error-prone and violates DRY

## Decision

We implement a **hybrid encryption architecture** with three layers:

### Layer 1: Server-Side Field Encryption (AES-256-GCM + HKDF)

All user-typed content fields are encrypted at the application layer before being stored in
PostgreSQL. Structural and operational metadata remains unencrypted.

#### Key Hierarchy

```text
Master Key (from pluggable KeyProvider)
    │
    ├── HKDF("qoomb-hive-encryption", hiveId)
    │   └── Per-Hive Key (32 bytes) ──→ encrypts hive content
    │       - event titles, descriptions, locations
    │       - task titles, descriptions
    │       - person display names, birthdates
    │       - group names, descriptions
    │       - page titles, content (future)
    │
    ├── HKDF("qoomb-user-encryption", userId)
    │   └── Per-User Key (32 bytes) ──→ encrypts user PII
    │       - email address
    │       - full name
    │
    └── HKDF("qoomb-email-hash", <empty salt>)
        └── HMAC Key (32 bytes) ──→ deterministic email blind index
            - HMAC-SHA256(email) stored as email_hash
            - enables O(1) lookups without storing plaintext
```

**Key derivation:** HKDF-SHA256 (RFC 5869). Deterministic — same inputs always produce the
same derived key. No additional key storage required beyond the master key.

**Cipher:** AES-256-GCM (authenticated encryption). Each encryption produces:

- 12-byte random IV (initialization vector)
- 16-byte authentication tag (tamper detection)
- Variable-length ciphertext

**Storage format:** `v{version}:{base64(IV || AuthTag || Ciphertext)}`

The version prefix enables decryption with the correct key version after rotation.

#### What Gets Encrypted

| Field category                      | Encrypted?             | Rationale                               |
| ----------------------------------- | ---------------------- | --------------------------------------- |
| Titles, descriptions, body content  | **Yes**                | Primary user-created content            |
| Location, URL, category, filename   | **Yes**                | User-typed, potentially sensitive       |
| Email, full name (on User entity)   | **Yes** (per-user key) | Global PII, isolated from hive data     |
| Display name, birthdate (on Person) | **Yes** (per-hive key) | Hive-specific PII                       |
| Calendar integration tokens         | **Yes**                | OAuth credentials                       |
| IDs, timestamps, foreign keys       | No                     | Server needs for queries, joins, RLS    |
| Status, priority, sort order        | No                     | Server needs for filtering and ordering |
| Visibility, color, is_archived      | No                     | Structural/cosmetic metadata            |
| Recurrence rules (JSONB)            | No                     | Server needs for occurrence expansion   |
| MIME type, file size                | No                     | Needed for HTTP responses               |

#### Decorator Pattern (DRY Encryption)

Encryption is applied via method decorators on service classes — developers never call
encrypt/decrypt manually. Decorators use a `FieldCryptoOptions` configuration:

```typescript
interface FieldCryptoOptions {
  fields: string[]; // field names to encrypt/decrypt
  hiveIdArg: number; // positional index of the hiveId parameter
  transforms?: Record<
    string,
    {
      serialize: (value: unknown) => string; // before encryption
      deserialize: (value: string) => unknown; // after decryption
    }
  >;
}
```

```typescript
const ENC_FIELDS = ['title', 'description', 'location', 'url', 'category'];

@Injectable()
export class EventsService {
  // @EncryptFields encrypts INPUT data before the method stores it
  @EncryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async createEvent(data: CreateEventInput, _hiveId: string) {
    return this.prisma.event.create({ data });
    // data.title, data.description, etc. are encrypted in-place
  }

  // @DecryptFields decrypts RETURN VALUE after the method loads it
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async getEvent(id: string, _hiveId: string) {
    return this.prisma.event.findUnique({ where: { id } });
    // returned fields are automatically decrypted
  }

  // Works with arrays — each element is decrypted individually
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
  async listEvents(_hiveId: string) {
    return this.prisma.event.findMany();
  }

  // @EncryptDecryptFields combines both in a single decorator
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 2 })
  async updateEvent(id: string, data: UpdateEventInput, _hiveId: string) {
    return this.prisma.event.update({ where: { id }, data });
  }
}
```

The optional `transforms` map handles type conversions for fields that aren't stored as
strings in the application model (e.g. `birthdate: Date` → encrypted ISO string → `Date`):

```typescript
const BIRTHDATE_TRANSFORMS = {
  birthdate: {
    serialize: (v: unknown) => (v as Date).toISOString(),
    deserialize: (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? null : d; },
  },
};

@DecryptFields({ fields: ['displayName', 'birthdate'], hiveIdArg: 1, transforms: BIRTHDATE_TRANSFORMS })
async getPersonDetail(id: string, _hiveId: string) { ... }
```

**How it works:** Each decorator wraps the method's `descriptor.value`, calling
`EncryptionService.serializeToStorage(encrypt(value, hiveId))` before the method (encrypt)
or `decrypt(parseFromStorage(value), hiveId)` after it (decrypt). The service instance is
located by scanning `this` for an `EncryptionService` property.

#### Email Blind Index

User email addresses are never stored in plaintext. Instead:

- `users.email` stores the **encrypted** email (per-user key)
- `users.email_hash` stores a **deterministic HMAC-SHA256** of the normalised (lowercase,
  trimmed) email, using a key derived from the master key with the fixed info string
  `"qoomb-email-hash"`

This enables O(1) lookups (login, duplicate check, invitation matching) via a UNIQUE index
on `email_hash` without ever storing or querying plaintext email.

### Layer 2: Envelope Encryption for Files (Planned — Phase 3)

Uploaded documents use **envelope encryption**: a per-file AES-256-GCM key is generated,
the file is encrypted with that key, and the file key itself is encrypted with the hive key
and stored alongside the file metadata.

```text
File Upload Flow:
1. Generate random 256-bit file key
2. Encrypt file content with file key (AES-256-GCM)
3. Encrypt file key with hive key (HKDF-derived)
4. Store: encrypted file → object storage, encrypted file key → database
5. Store: filename (encrypted), mime_type (plain), size_bytes (plain) → database

File Download Flow:
1. Load encrypted file key from database
2. Decrypt file key with hive key
3. Stream-decrypt file content with file key
4. Serve to client
```

**Why envelope encryption?**

- File content can be very large — encrypting with HKDF-derived key directly would require
  loading the entire file into memory
- Per-file keys allow efficient streaming encryption/decryption
- File keys can be re-encrypted during key rotation without re-encrypting file content

### Layer 3: End-to-End Encryption (Planned — Phase 4)

For ultra-sensitive content, optional E2E encryption using libsodium:

- Client generates a keypair; public key stored on server, private key never leaves device
- Content encrypted client-side before upload; server stores only ciphertext
- Server cannot decrypt E2E content — even a complete server compromise reveals nothing
- Requires client-side key management (backup, multi-device sync)

This is an opt-in escalation, not the default. Server-side encryption (Layer 1) provides
strong protection while maintaining server-side functionality (search, sync, sharing).

### Pluggable Key Provider Architecture

The master key source is abstracted behind a `KeyProvider` interface:

```typescript
interface KeyProvider {
  getMasterKey(): Promise<Buffer>;
  getVersionedKeys?(): Promise<{ currentVersion: number; keys: Map<number, Buffer> }>;
  getName(): string;
}
```

Four implementations are provided:

| Provider        | Configuration                                               | Use Case                                              |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| **Environment** | `KEY_PROVIDER=environment` + `ENCRYPTION_KEY=<base64>`      | Development, Docker, most deployments                 |
| **File**        | `KEY_PROVIDER=file` + `KEY_FILE_PATH` + `KEY_FILE_PASSWORD` | Self-hosted with file-based key storage               |
| **Cloud KMS**   | `KEY_PROVIDER=aws-kms` + `AWS_KMS_KEY_ID`                   | Enterprise deployments requiring managed HSM          |
| **Vault**       | `KEY_PROVIDER=vault` + `VAULT_ADDR` + `VAULT_TOKEN`         | Enterprise self-hosted, centralised secret management |

**Critical design rule:** No default provider. `KEY_PROVIDER` must be explicitly set.
The application refuses to start without it — fail-safe, not fail-open.

**Cloud KMS is optional, not required.** The Environment and File providers work
without any cloud service. Cloud KMS and Vault are available for organisations that
have compliance requirements mandating external key management — but they are never
the only option.

> **Implementation status:** Environment and File providers are fully implemented.
> Cloud KMS and Vault providers exist as class shells (interface-conformant stubs)
> without SDK dependencies installed. They will be completed when an enterprise
> deployment requires them — YAGNI applies.

### Key Rotation

Key versioning is built into the storage format and the service:

1. The `EncryptionService` loads all key versions at startup via `getVersionedKeys()`
2. New data is always encrypted with the **current** version
3. Existing data carries its version in the storage prefix (`v1:`, `v2:`, ...)
4. Decryption reads the version prefix and uses the correct key automatically
5. A background re-encryption job can gradually migrate old data to the new version

```typescript
// Storage format embeds version
'v1:AAABBBCCC...'; // encrypted with key version 1
'v2:XXXYYYZZZ...'; // encrypted with key version 2

// Decryption auto-selects correct version
const parsed = service.parseFromStorage(stored); // extracts version
const plain = service.decrypt(parsed, hiveId); // uses matching key
```

### Startup Self-Test

The encryption service validates its own correctness at startup with a **7-point self-test**:

1. Basic encryption/decryption round-trip
2. Hive isolation — different hive IDs produce different ciphertexts
3. Cross-hive rejection — decrypting with wrong hive ID fails
4. Storage serialisation round-trip (`serialize → parse → decrypt`)
5. User encryption round-trip (`encryptForUser → decryptForUser`)
6. Multi-version decryption — old version data still decryptable (when multiple versions loaded)
7. Email hash determinism and case-insensitivity

If any test fails, the application refuses to start.

## Rationale

### Why Server-Side Encryption (Not E2E Only)?

Pure E2E encryption means the server can never see plaintext. While this is the strongest
privacy guarantee, it prevents:

- Server-side search across encrypted content
- Server-side recurrence expansion for calendar events
- Invitation emails with personalised content
- Admin tools for account recovery
- Sharing content with new hive members without re-encrypting for each recipient

Server-side encryption is the pragmatic default: it protects against database breaches
(the most common threat) while preserving server functionality. E2E encryption is offered
as an opt-in escalation for users who need it.

### Why Per-Hive Keys (Not a Single Application Key)?

A single application-wide key means a breach of that key exposes all data from all tenants.
Per-hive HKDF-derived keys provide:

- **Blast radius limitation** — compromising one derived key affects only one hive
- **Deterministic derivation** — no additional key storage; derived on-the-fly from master key + hive ID
- **Efficient** — HKDF is computationally cheap and the result is cached

### Why Per-User Keys for PII?

User PII (email, full name) is global — it exists outside any hive context. Encrypting it
with a hive key would mean:

- A user in multiple hives would have their email encrypted differently in each hive's context
- There's no "hive" to derive a key from for the global `users` table

Per-user keys solve this cleanly: the user's ID is the HKDF salt, the PII is encrypted
once, and it's decryptable regardless of which hive context is active.

### Why HMAC Blind Index for Email?

Encrypted email cannot be queried with `WHERE email = ?`. The blind index provides:

- **O(1) lookup** — `WHERE email_hash = HMAC(input)` uses a standard index
- **No plaintext exposure** — the HMAC is irreversible without the master key
- **Case-insensitive** — input is normalised before hashing
- **Deterministic** — same email always produces the same hash (required for lookups)

### Why Decorators (Not Manual Encryption)?

Manual `encrypt()`/`decrypt()` calls in every service method:

- Are easy to forget (a single oversight means plaintext in the database)
- Violate DRY (same pattern repeated in every CRUD operation)
- Are hard to audit (must check every method individually)

Decorators make encryption **declarative**: the fields, hive-ID position, and any type
transforms are visible in one place. Code review only needs to verify that the right
fields are listed. The decorator wraps the method descriptor directly — no NestJS
interceptor involved — so it works with any class method.

### Rejected Alternatives

- **Transparent Disk Encryption (TDE)** — protects against physical disk theft but not
  application-level breaches, SQL injection, or database admin access. Insufficient alone.
- **Column-level database encryption** — PostgreSQL's `pgcrypto` extension encrypts at the
  DB layer but requires key management in SQL and loses type safety. Our application-level
  approach is more flexible and works with any PostgreSQL installation.
- **E2E only** — too restrictive for server-side features (search, sharing, sync). Offered
  as opt-in escalation, not default.
- **Single application-wide key** — no tenant isolation. A breach exposes everything.
- **Third-party encryption SaaS** — violates cloud-agnostic principle (ADR-0004) and
  introduces external dependency for a core security function.

## Consequences

### Positive

- **Database breach protection** — all PII and content fields are ciphertext in the database
- **Tenant isolation** — per-hive keys limit blast radius of key compromise
- **Zero plaintext email** — email stored only as encrypted ciphertext + blind index hash
- **Developer-friendly** — decorators make encryption invisible to business logic
- **Self-hostable** — Environment and File providers work without any cloud service
- **Rotation-ready** — versioned key scheme supports rolling key changes
- **Self-validating** — 7-point self-test catches misconfigurations at startup
- **Cloud-agnostic** — pluggable providers satisfy both self-hosted and enterprise requirements

### Negative

- **Encrypted fields are not searchable** — server-side full-text search on encrypted content
  is not possible (mitigated by planned client-side search in Phase 4)
- **Performance overhead** — ~0.1ms per field encryption/decryption (negligible for typical
  payloads, but measurable on large batch operations)
- **Complexity** — key hierarchy, versioning, and decorator mechanics add conceptual overhead
  (mitigated by thorough documentation and self-test)
- **Re-encryption cost** — key rotation for existing data is a background batch process that
  touches every encrypted row (mitigated by the version scheme allowing gradual migration)

## References

- [NIST SP 800-108 — Key Derivation Using Pseudorandom Functions (HKDF)](https://csrc.nist.gov/publications/detail/sp/800-108/rev-1/final)
- [RFC 5116 — Authenticated Encryption (AES-GCM)](https://tools.ietf.org/html/rfc5116)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Envelope Encryption Pattern](https://cloud.google.com/kms/docs/envelope-encryption) (concept, not vendor-specific)
