# Qoomb Security Audit Report

**Date:** 2026-02-23
**Auditor:** Offensive Security Engineer (Red Team)
**Scope:** Full codebase — cryptography, authorization, injection, infrastructure
**Commit:** HEAD of main branch

---

## 1. Executive Summary

Qoomb is a multi-tenant application managing sensitive team data with custom-built encryption, authorization, and tenant isolation systems. The codebase demonstrates strong security awareness — proper use of AES-256-GCM, HKDF key derivation, blind email indexes, HTML sanitization via battle-tested libraries, parameterized queries, and defense-in-depth patterns throughout.

However, the audit identified **one critical architectural flaw** that undermines the Row-Level Security (RLS) tenant isolation layer: PostgreSQL session variables (`SET app.hive_id`) are set on individual pool connections without transaction pinning, meaning the SET and subsequent queries may execute on **different connections** from Prisma's connection pool. This renders RLS ineffective as a security boundary, though application-level `hiveId` filters in most service methods provide a functioning — but incomplete — backup.

The encryption implementation is **cryptographically sound** — proper nonce generation, HKDF with unique salts, authenticated encryption with GCM tag validation, and a key rotation mechanism. The authorization model is thorough with a 5-stage access check. The main risks are operational (connection pool behavior, timing side channels) rather than fundamental cryptographic weaknesses.

**Worst-case scenario:** A user in Hive A discovers the UUID of a resource in Hive B, and exploits the broken RLS + missing `hiveId` filter in update operations to modify cross-tenant data. Exploitability is **Medium** (requires knowledge of target UUIDs) but impact is **Critical** (cross-tenant data modification).

---

## 2. Critical Attack Paths (Top 5)

### Attack Path 1: Cross-Tenant Data Modification via RLS Bypass + Missing hiveId Filter

**Severity: CRITICAL**

**The Setup:**
The RLS implementation uses `SET app.hive_id` (session-scoped) instead of `SET LOCAL` (transaction-scoped). More critically, Prisma's connection pool assigns a **different** connection for each query operation. The `SET` command runs on Connection A, but the subsequent `findUnique`/`findMany` queries may run on Connection B, which has a **stale or absent** `app.hive_id`.

**The Attack:**

```
Step 1: Attacker authenticates as user in Hive-A
Step 2: Attacker discovers UUID of an event in Hive-B (e.g., via shared link, timing attack, or log leak)
Step 3: Attacker calls events.update with the cross-tenant event ID:

POST /trpc/events.update
Authorization: Bearer <attacker-jwt-for-hive-a>
Content-Type: application/json

{
  "id": "<event-uuid-from-hive-b>",
  "data": { "title": "PWNED" }
}
```

**Why it works:**

1. `hiveProcedure` calls `setHiveSchema('hive-a-id')` → `SET app.hive_id = 'hive-a-id'` on Connection X
2. The router calls `eventsService.getById(id, hiveId)` → `findFirst({ where: { id, hiveId } })` on Connection Y
3. `getById` includes `hiveId` in WHERE → returns null → **NOT_FOUND** (blocked by defense-in-depth)
4. **BUT**: If `getById` happens to reuse Connection X (which has `app.hive_id = 'hive-a-id'`), RLS also blocks it

**Current mitigation:** The `getById` defense-in-depth filter catches this for **reads**. But the `update` method at `events.service.ts:163` uses:
```typescript
return this.prisma.event.update({ where: { id }, data: patch });
// ⚠️ No hiveId in WHERE clause!
```

If the `getById` check were bypassed (race condition, future code change removing the pre-check), the update would execute on **any** event across all hives.

**Similarly affected:**
- `tasks.service.ts:163` — `update({ where: { id } })` — no hiveId
- `persons.service.ts:143` — `update({ where: { id: personId } })` — no hiveId

**Impact:** Cross-tenant data modification. An attacker who knows a resource UUID can modify it across hive boundaries.

**Affected Code:**
- `apps/api/src/prisma/prisma.service.ts:231` — `SET app.hive_id` (not `SET LOCAL`, not in transaction)
- `apps/api/src/modules/events/events.service.ts:163` — `update({ where: { id } })` missing hiveId
- `apps/api/src/modules/tasks/tasks.service.ts:163` — same issue
- `apps/api/src/modules/persons/persons.service.ts:143` — same issue
- `apps/api/src/trpc/trpc.router.ts:42` — `setHiveSchema` called outside transaction

---

### Attack Path 2: Login Timing Oracle for User Enumeration

**Severity: HIGH**

**The Attack:**
```
Step 1: Send login request with known-invalid email: "nonexistent@test.com"
Step 2: Measure response time: ~5ms (Redis lockout check + DB miss + Redis increment)
Step 3: Send login request with known-valid email: "admin@company.com"
Step 4: Measure response time: ~105-205ms (Redis lockout check + DB hit + bcrypt.compare + Redis increment)
Step 5: The ~100-200ms difference from bcrypt reveals whether the email exists
```

**Why it works:**
At `auth.service.ts:221-224`, when a user doesn't exist:
```typescript
if (!user) {
  await this.accountLockout.recordFailedAttempt(email); // Redis only, ~1ms
  throw new UnauthorizedException('Invalid credentials');
}
```
No `bcrypt.compare()` is performed. When a user DOES exist (`auth.service.ts:228`):
```typescript
const isPasswordValid = await bcrypt.compare(password, user.passwordHash); // ~100-200ms
```

The router at `auth.router.ts:110-117` catches ALL errors and returns "Invalid credentials", but the **timing difference** leaks the information.

**Impact:** Attacker can enumerate valid email addresses, enabling targeted phishing or credential stuffing.

**Fix:** Always run `bcrypt.compare` against a dummy hash when the user doesn't exist:
```typescript
if (!user) {
  await bcrypt.compare(password, '$2b$10$dummyhashtopreventtimingattacks...');
  await this.accountLockout.recordFailedAttempt(email);
  throw new UnauthorizedException('Invalid credentials');
}
```

---

### Attack Path 3: Health Endpoint Information Disclosure

**Severity: MEDIUM**

**The Attack:**
```
GET /trpc/health
# No authentication required (publicProcedure)

Response:
{
  "status": "ok",
  "timestamp": "2026-02-23T12:00:00.000Z",
  "localIp": "10.0.1.42"    ← Internal network IP leaked
}
```

**Why it works:** At `app.router.ts:36-60`, the health endpoint is a `publicProcedure` that iterates `os.networkInterfaces()` and returns the server's internal IPv4 address. This gives an attacker:
- Internal network topology information
- A target IP for SSRF attacks from other compromised services
- Infrastructure fingerprinting

**Impact:** Information disclosure enabling further attacks on internal infrastructure.

---

### Attack Path 4: Refresh Token Stored in localStorage (XSS → Session Hijacking)

**Severity: HIGH**

**The Attack:**
```
Step 1: Find any XSS vector (e.g., stored XSS via improperly rendered content)
Step 2: Inject: localStorage.getItem('qoomb:refreshToken')
Step 3: Send stolen refresh token to attacker's server
Step 4: Call /trpc/auth.refresh with stolen token → get new access token
Step 5: Full account takeover
```

**Why it works:** At `apps/web/src/lib/auth/authStorage.ts:7-9`:
```typescript
const REFRESH_TOKEN_KEY = 'qoomb:refreshToken';
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
```

While the access token is correctly kept in-memory only (`tokenStore.ts`), the refresh token is in `localStorage`, which is accessible to any JavaScript running on the same origin.

**Impact:** Any XSS vulnerability (even in a third-party dependency) can steal the refresh token and hijack the user's session for up to 7 days.

**Fix:** Store the refresh token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie instead of localStorage. The server should set this cookie during login/refresh and read it from the cookie header.

---

### Attack Path 5: Rate Limit Bypass via X-Forwarded-For Spoofing

**Severity: MEDIUM**

**The Attack:**
```
Step 1: Send login request with header: X-Forwarded-For: 1.2.3.4
Step 2: Get rate-limited after 5 attempts
Step 3: Change header: X-Forwarded-For: 1.2.3.5
Step 4: Get 5 more attempts
Step 5: Repeat with different IPs → unlimited login attempts
```

**Why it works:**
- `main.ts:15`: `trustProxy: true` — trusts ALL proxy headers unconditionally
- `custom-throttler.guard.ts:54-58`: Takes the first IP from `X-Forwarded-For` without validating it came from a trusted proxy
- If the application is deployed without a reverse proxy (or behind an untrusted one), any client can spoof their IP

**Impact:** Complete bypass of IP-based rate limiting, enabling brute-force attacks on login.

---

## 3. Cryptography Analysis

### 3.1 AES-256-GCM Implementation

**File:** `apps/api/src/modules/encryption/encryption.service.ts`

#### Nonce/IV Generation: SECURE
```typescript
const iv = crypto.randomBytes(12); // 96-bit random nonce per operation
```
- Fresh `crypto.randomBytes(12)` per encryption call — **correct**
- Not deterministic, not counter-based, not reused
- At 96 bits, birthday collision becomes probable at ~2^48 encryptions. For a typical Qoomb deployment, this is billions of years of normal usage
- IV is stored alongside ciphertext in the serialized format — **correct**

#### Auth Tag Handling: SECURE
```typescript
const tag = cipher.getAuthTag();           // 16-byte tag extracted
// Stored with ciphertext in serialized format

// During decryption:
decipher.setAuthTag(encrypted.tag);        // Tag validated
const plain = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
// decipher.final() throws if tag doesn't match — correct GCM behavior
```
- Auth tag is always extracted and stored with the ciphertext
- During decryption, `setAuthTag` is called before `final()`, which validates integrity
- Failed tag validation throws an error (not silently ignored)
- No oracle: errors return a generic "Decryption failed" message, not separate "tag invalid" vs "decryption failed"

#### Serialization Format: SECURE
```typescript
// Format: v1:<base64(iv + ciphertext + tag)>
serializeToStorage(encrypted: EncryptedData): string {
  const combined = Buffer.concat([encrypted.iv, encrypted.ciphertext, encrypted.tag]);
  return `v${encrypted.version}:${combined.toString('base64')}`;
}
```
- Version-prefixed for future algorithm migration
- IV, ciphertext, and tag are bundled together (can't be manipulated independently)
- Base64 encoding prevents encoding issues in DB storage

### 3.2 Key Derivation (HKDF): SECURE

```typescript
private deriveKey(masterKey: Buffer, scope: string, id: string): Buffer {
  return crypto.hkdfSync('sha256', masterKey, id, `qoomb:${scope}`, 32);
}
```

- **Master key source:** Environment variable (`ENCRYPTION_KEY`), file, AWS KMS, or Vault — configurable
- **Salt:** The `id` parameter (hiveId or userId) — **unique per tenant/user**
- **Info field:** `qoomb:${scope}` where scope is 'hive' or 'user' — **prevents cross-scope key reuse**
- **Result:** Each hive gets a unique derived key. Compromising one hive's key doesn't reveal others
- **Key caching:** Derived keys are cached in a `Map<string, Buffer>` — the cache key includes the scope and ID, so cross-hive contamination is prevented by design

#### Key Rotation: IMPLEMENTED
The `.env.example` documents a key rotation mechanism using `ENCRYPTION_KEY_CURRENT`, `_V1`, `_V2` variables. The key provider factory supports versioned keys, and there's a `db:reencrypt` script mentioned for re-encrypting existing data.

### 3.3 User-Scoped Encryption (PII): SECURE

```typescript
encryptForUser(plaintext: string, userId: string): string {
  const key = this.deriveKey(this.masterKey, 'user', userId);
  // ... AES-256-GCM encryption with per-user key
}
```
- User PII (email, fullName, locale) is encrypted with a key derived from the user's ID
- Different scope ('user' vs 'hive') prevents key reuse between user and hive encryption
- Blind email index (`emailHash`) uses HMAC-SHA256 for O(1) lookups without decryption

### 3.4 Secrets in Memory: ACCEPTABLE RISK

- Derived keys cached in a JavaScript `Map` — cannot be zeroed (JS strings/Buffers managed by GC)
- Master key loaded once at startup and held in memory — standard for Node.js applications
- No evidence of decrypted values in log output (logger.warn only logs field names, not values)
- Prisma query cache may hold encrypted values (ciphertext, not plaintext) — acceptable
- A heap dump would leak the master key and cached derived keys — **inherent Node.js limitation**

### 3.5 Encryption in Prisma Context: MOSTLY SECURE

The `@EncryptFields` / `@DecryptFields` decorators encrypt/decrypt at the **service method level**, not at the Prisma middleware level. This means:

- **`findMany` with `select`:** Only selected fields are returned and decrypted — correct
- **`updateMany` / `deleteMany`:** These are used for bulk operations (e.g., removing shares). They don't go through encrypted service methods, but they operate on non-encrypted fields (IDs, timestamps) — **not a vulnerability**
- **`$queryRaw`:** Only used in `prisma.service.ts` for `SET` commands — no encrypted data involved
- **Race conditions:** Two simultaneous updates could each encrypt a field value independently. Since each encryption generates a fresh IV, both produce valid ciphertexts. The last write wins (standard DB behavior) — **not a crypto vulnerability**
- **Encrypted fields in WHERE clauses:** Not observed — all lookups use IDs or the blind email index, never encrypted field values

### 3.6 Plaintext Fallback: INFORMATION LEAK (LOW)

```typescript
// encrypt-fields.decorator.ts:284
catch {
  // Migration window: field not yet encrypted. Keep original value.
  logger.warn(`Plaintext fallback for ${scope} — field '${field}' not yet encrypted`);
}
```

If decryption fails, the original (potentially plaintext) value is returned to the client. This is documented as a "migration window" behavior. An attacker who can corrupt a ciphertext could trigger this fallback to return the original stored value — but that value would be corrupted ciphertext, not useful plaintext.

**Risk:** During actual migration from plaintext to encrypted storage, fields that haven't been encrypted yet are returned as-is. This is a necessary trade-off for zero-downtime migration.

### 3.7 Crypto Verdict

**The encryption implementation is sound.** Proper algorithm (AES-256-GCM), proper nonce handling (`crypto.randomBytes(12)` per operation), proper key derivation (HKDF with unique salts), proper auth tag validation. The key rotation mechanism exists. No fundamental cryptographic weaknesses found.

The encryption is **real security, not security theater**.

---

## 4. All Findings by Severity

### CRITICAL

#### C-1: RLS Session Variables Not Transaction-Pinned

**Severity:** Critical
**CWE:** CWE-668 (Exposure of Resource to Wrong Sphere)
**OWASP:** A01:2021 — Broken Access Control

**Attack Vector:** Prisma's connection pool assigns different connections per query. `SET app.hive_id` runs on Connection A, but subsequent queries may run on Connection B (which has a stale or absent `app.hive_id`), making RLS policies ineffective.

**Affected Code:**
```
apps/api/src/prisma/prisma.service.ts:231
    await this.executeRawSql(`SET app.hive_id = '${hiveId}'`);

apps/api/src/trpc/trpc.router.ts:42
    await ctx.prisma.setHiveSchema(ctx.user.hiveId, ctx.user.id);
```

**Impact:** RLS is not functioning as a security boundary. Tenant isolation depends entirely on application-level `hiveId` WHERE filters.

**Fix:**
```typescript
// Option A: Wrap all hive-scoped operations in an interactive transaction
async withHiveContext<T>(hiveId: string, userId: string, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return this.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.hive_id = '${hiveId}'`);
    if (userId) await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);
    return fn(tx);
  });
}

// Option B: Use Prisma's $extends with query extension to prepend SET LOCAL
// to every query within a request context
```

---

#### C-2: Update Operations Missing hiveId in WHERE Clause

**Severity:** Critical
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
**OWASP:** A01:2021 — Broken Access Control

**Attack Vector:** Update operations use `where: { id }` without `hiveId`, relying solely on RLS (which is broken per C-1) for tenant isolation. If the pre-read check (`getById` with hiveId) is bypassed or removed, any resource across any hive can be modified.

**Affected Code:**
```
apps/api/src/modules/events/events.service.ts:163
    return this.prisma.event.update({ where: { id }, data: patch });

apps/api/src/modules/tasks/tasks.service.ts:163  (same pattern)

apps/api/src/modules/persons/persons.service.ts:143
    return this.prisma.person.update({ where: { id: personId }, data, select: DETAIL_SELECT });

apps/api/src/modules/persons/persons.service.ts:160
    return this.prisma.person.update({ where: { id: personId }, data: { role }, select: DETAIL_SELECT });
```

**Current Mitigation:** The router performs a `getById(id, hiveId)` check before calling update. This check DOES include `hiveId` and will return NOT_FOUND for cross-tenant IDs. However, this is a TOCTOU (time-of-check-to-time-of-use) pattern — the check and update are not atomic.

**Impact:** If the pre-check is bypassed (race condition, future refactor, direct service call), cross-tenant data modification is possible.

**Fix:**
```typescript
// Add hiveId to all update WHERE clauses
return this.prisma.event.update({
  where: { id, hiveId },  // ← Add hiveId
  data: patch,
});
```

---

### HIGH

#### H-1: Login Timing Oracle Enables User Enumeration

**Severity:** High
**CWE:** CWE-208 (Observable Timing Discrepancy)
**OWASP:** A07:2021 — Identification and Authentication Failures

**Attack Vector:** When a user doesn't exist, `bcrypt.compare` is skipped, creating a ~100-200ms timing difference that reveals whether an email is registered.

**Affected Code:**
```
apps/api/src/modules/auth/auth.service.ts:221-224
    if (!user) {
      await this.accountLockout.recordFailedAttempt(email);
      throw new UnauthorizedException('Invalid credentials');
    }
    // bcrypt.compare only runs if user exists (line 228)
```

**Impact:** Email enumeration, enabling targeted phishing and credential stuffing.

**Fix:**
```typescript
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

if (!user) {
  await bcrypt.compare(password, DUMMY_HASH); // Constant-time regardless of user existence
  await this.accountLockout.recordFailedAttempt(email);
  throw new UnauthorizedException('Invalid credentials');
}
```

---

#### H-2: Refresh Token in localStorage Vulnerable to XSS Exfiltration

**Severity:** High
**CWE:** CWE-922 (Insecure Storage of Sensitive Information)
**OWASP:** A07:2021 — Identification and Authentication Failures

**Attack Vector:** The refresh token is stored in `localStorage`, accessible to any JavaScript on the same origin. An XSS vulnerability in any dependency or user-generated content can steal it.

**Affected Code:**
```
apps/web/src/lib/auth/authStorage.ts:7
    const REFRESH_TOKEN_KEY = 'qoomb:refreshToken';
    // localStorage.setItem / getItem
```

**Impact:** Any XSS → full session hijacking for up to 7 days.

**Fix:** Move the refresh token to an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The API should set this cookie in the `Set-Cookie` response header during login/refresh, and the browser will automatically include it in subsequent requests.

---

#### H-3: trustProxy: true Without Proxy Chain Validation

**Severity:** High
**CWE:** CWE-346 (Origin Validation Error)
**OWASP:** A05:2021 — Security Misconfiguration

**Attack Vector:** `trustProxy: true` trusts ALL `X-Forwarded-For` headers. If the API is directly exposed (no reverse proxy), any client can spoof their IP, bypassing rate limiting and IP-based security controls.

**Affected Code:**
```
apps/api/src/main.ts:15
    trustProxy: true,

apps/api/src/common/guards/custom-throttler.guard.ts:54-58
    const forwardedFor = req.headers['x-forwarded-for'];
    // Takes first IP without validation
```

**Impact:** Rate limit bypass, IP-based brute force protection defeated, IP logging falsified.

**Fix:**
```typescript
// Specify trusted proxy IPs or count
new FastifyAdapter({
  trustProxy: ['127.0.0.1', '10.0.0.0/8'],  // Only trust known proxies
})
```

---

### MEDIUM

#### M-1: Health Endpoint Leaks Internal Network IP

**Severity:** Medium
**CWE:** CWE-200 (Exposure of Sensitive Information)
**OWASP:** A01:2021 — Broken Access Control

**Affected Code:**
```
apps/api/src/trpc/app.router.ts:36-60
    health: publicProcedure.query(() => {
      const localIp = getLocalIp();
      return { status: 'ok', timestamp: ..., localIp: localIp };
    })
```

**Impact:** Internal IP address exposed to unauthenticated users. Aids network reconnaissance.

**Fix:** Remove `localIp` from the production health response. If needed for development, gate it behind `NODE_ENV === 'development'`.

---

#### M-2: Account Lockout Uses Plaintext Email as Redis Key

**Severity:** Medium
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)
**OWASP:** A09:2021 — Security Logging and Monitoring Failures

**Affected Code:**
```
apps/api/src/common/services/account-lockout.service.ts:181
    return `auth:failed:${email}`;

account-lockout.service.ts:67
    this.logger.warn(`Failed login attempt ${attempts}/${this.MAX_ATTEMPTS} for: ${normalizedEmail}`);
```

**Impact:** Email addresses stored as plaintext Redis keys and logged in plaintext. A Redis breach or log exfiltration reveals all emails that had failed login attempts. This undermines the blind email index (`emailHash`) used in PostgreSQL.

**Fix:** Use the same HMAC hash used for the DB blind index (`enc.hashEmail(email)`) as the Redis key. Remove email from log messages.

---

#### M-3: CSP Disabled in Development Mode

**Severity:** Medium
**CWE:** CWE-1021 (Improper Restriction of Rendered UI Layers)
**OWASP:** A05:2021 — Security Misconfiguration

**Affected Code:**
```
apps/api/src/main.ts:22
    contentSecurityPolicy: process.env.NODE_ENV === 'development' ? false : SECURITY_HEADERS.contentSecurityPolicy,
```

**Impact:** If `NODE_ENV` is accidentally left as 'development' in a production deployment, all CSP protections are disabled. While the API primarily serves JSON, any HTML error pages or file serving would be unprotected.

**Fix:** Log a warning at startup if CSP is disabled. Consider using a relaxed CSP for development rather than disabling it entirely.

---

#### M-4: Password Regex Missing End Anchor

**Severity:** Medium
**CWE:** CWE-185 (Incorrect Regular Expression)

**Affected Code:**
```
apps/api/src/config/security.config.ts:105
    REQUIREMENTS_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    //                                                                                    ^ missing $
```

**Impact:** The regex lacks a `$` anchor and only matches a single character after the lookaheads. While this actually WIDENS the accepted character set (not a direct vulnerability), it means the character class restriction `[A-Za-z\d@$!%*?&]` is not enforced for the full password — only the first character after the lookaheads.

**Fix:**
```typescript
REQUIREMENTS_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
```

---

#### M-5: No Maximum Concurrent Sessions Enforcement

**Severity:** Medium
**CWE:** CWE-770 (Allocation of Resources Without Limits)

**Affected Code:**
```
apps/api/src/config/security.config.ts:140
    MAX_SESSIONS: 5,  // Defined but never enforced

apps/api/src/modules/auth/refresh-token.service.ts
    // No check for active session count before creating new token
```

**Impact:** `SESSION_CONFIG.MAX_SESSIONS = 5` is defined but never checked during `createRefreshToken`. An attacker with valid credentials can create unlimited sessions, potentially exhausting database storage.

**Fix:** Before creating a new refresh token, count active tokens for the user and reject if at the limit, or revoke the oldest session.

---

#### M-6: CSRF Protection is Header-Only (No Token)

**Severity:** Medium
**CWE:** CWE-352 (Cross-Site Request Forgery)
**OWASP:** A01:2021 — Broken Access Control

**Affected Code:**
```
apps/api/src/common/guards/csrf.guard.ts:62-64
    const csrfHeader = request.headers[CsrfGuard.REQUIRED_HEADER];
    if (csrfHeader !== CsrfGuard.REQUIRED_VALUE) {
      throw new ForbiddenException('CSRF validation failed');
    }
```

**Impact:** The CSRF protection relies only on the presence of a custom header (`X-CSRF-Protection: 1`), not a cryptographic token. While custom headers cannot be set by HTML forms (preventing simple CSRF), this offers weaker protection than a proper CSRF token. An XSS vulnerability on the same origin can set this header trivially.

**Mitigation Note:** Since the application uses Bearer tokens (not cookies) for authentication, traditional CSRF attacks are already mitigated. The custom header adds defense-in-depth. This is acceptable for a Bearer-token-based API.

---

#### M-7: Recurrence Rule Without Expansion Limits

**Severity:** Medium
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Affected Code:**
```
apps/api/src/modules/events/events.service.ts:133
    recurrenceRule: (data.recurrenceRule as Prisma.InputJsonValue) ?? Prisma.JsonNull,
```

The `recurrenceRule` is stored as a JSON blob. If a client submits `{ "frequency": "daily", "interval": 1 }` without `until` or `count`, and the server or client expands this rule into discrete occurrences, it could generate events for eternity, causing memory/CPU exhaustion.

**Impact:** Denial of service via infinite recurrence expansion.

**Fix:** Validate recurrence rules on the server: require either `until` or `count`, and cap maximum occurrences (e.g., 1000).

---

### LOW

#### L-1: JWT Uses HS256 Instead of RS256

**Severity:** Low
**CWE:** CWE-327 (Use of a Broken or Risky Cryptographic Algorithm)

**Affected Code:**
```
apps/api/src/config/security.config.ts:125
    ALGORITHM: 'HS256' as const,
```

**Impact:** HS256 (symmetric) means the same secret signs and verifies tokens. If a service needs to verify tokens but not sign them, it still gets the signing key. RS256 (asymmetric) would allow distributing the public key for verification without exposing the private signing key.

**Current Risk:** Low — the JWT secret is only in the API server. No external services verify tokens. This becomes a concern if the system grows to multiple services.

---

#### L-2: Prisma Migrations in .gitignore

**Severity:** Low
**CWE:** CWE-1188 (Insecure Default Initialization of Resource)

**Affected Code:**
```
.gitignore:50
    prisma/migrations
```

**Impact:** Migration files that define RLS policies, triggers (like `enforce_minimum_admin`), and indexes are not version-controlled by default via the root `.gitignore`. However, the migrations DO exist in the repository at `apps/api/prisma/migrations/` — the `.gitignore` pattern `prisma/migrations` only matches at the root level, not nested under `apps/api/`. This is a near-miss that could cause confusion.

**Note:** After verification, the migrations ARE tracked in git. The `.gitignore` pattern does not affect nested paths. No action needed.

---

#### L-3: JWT Secret Entropy Validation Too Weak

**Severity:** Low
**CWE:** CWE-330 (Use of Insufficiently Random Values)

**Affected Code:**
```
apps/api/src/config/env.validation.ts:62-63
    const uniqueChars = new Set(secret.split('')).size;
    return uniqueChars >= 10;
```

**Impact:** A JWT secret like `"aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeee"` (10 unique chars, 42 chars long) passes validation but has poor entropy. The check should use actual entropy calculation rather than unique character count.

---

#### L-4: No Cleanup Cron for Expired Tokens

**Severity:** Low
**CWE:** CWE-459 (Incomplete Cleanup)

**Affected Code:**
```
apps/api/src/modules/auth/refresh-token.service.ts:236-254
    async cleanupExpiredTokens(): Promise<number> {
      // Method exists but is never called automatically
    }
```

**Impact:** The `cleanupExpiredTokens` method exists but no cron job or scheduler calls it. Expired refresh tokens accumulate in the database indefinitely, increasing storage costs and slowing queries.

---

#### L-5: Account Lockout Logs Email Addresses

**Severity:** Low
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

**Affected Code:**
```
apps/api/src/common/services/account-lockout.service.ts:67
    this.logger.warn(`Failed login attempt ${attempts}/${this.MAX_ATTEMPTS} for: ${normalizedEmail}`);

account-lockout.service.ts:88
    this.logger.error(`Account locked (${lockCount + 1}x) for ${lockoutMinutes} minutes: ${normalizedEmail}`);
```

**Impact:** Email addresses logged in plaintext. If logs are shipped to a logging service (ELK, Datadog, etc.), this creates a secondary exposure path for PII that the database encryption was designed to protect.

---

## 5. What Was Done Well

The development team deserves credit for several security decisions that are **above average** for a startup-stage application:

1. **Cryptography Implementation is Sound:** AES-256-GCM with proper nonce generation (`crypto.randomBytes(12)`), HKDF with unique salts per tenant, and correct auth tag validation. This is better than most custom encryption implementations I've audited.

2. **Blind Email Index:** Using HMAC-SHA256 for email lookups (`emailHash`) instead of storing emails in plaintext or using reversible encryption for lookups. This is a sophisticated privacy-preserving pattern.

3. **Defense-in-Depth hiveId Filters:** Every service method includes explicit `hiveId` WHERE clauses on top of RLS. This saved the application from the broken RLS being a total disaster.

4. **Proper HTML Sanitization:** Using `sanitize-html` library (battle-tested) instead of custom regex. The `sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} })` configuration strips ALL HTML — the strictest possible setting.

5. **Token Rotation with Revocation Chain:** Refresh tokens are rotated on every use, with `replacedByToken` tracking. Old tokens are revoked. This is the gold standard for refresh token security.

6. **Generic Error Messages:** Login errors consistently return "Invalid credentials" without leaking whether the email or password was wrong. Password reset always returns success.

7. **Parameterized Queries Throughout:** No string concatenation in Prisma queries. All user input flows through Zod schemas with strict type validation before reaching the database layer.

8. **UUID Validation:** The `validateUUID` method in PrismaService strictly validates UUID format before use in raw SQL, preventing SQL injection in the `SET` commands.

9. **Access Token in Memory Only:** The access token is never written to `localStorage` or `sessionStorage` (`tokenStore.ts`), reducing XSS exposure for the short-lived token.

10. **Rate Limiting with Redis:** Distributed rate limiting with per-endpoint configurations, exponential backoff on account lockout, and user-based limiting for authenticated requests.

11. **Security Headers:** Proper Helmet configuration with HSTS (1 year, includeSubDomains, preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, and strict CSP in production.

12. **CI/CD Security:** Dependency review action blocks HIGH/CRITICAL vulnerabilities, `pnpm audit` runs in CI, license compliance checking, pinned GitHub Actions with hash versions (not mutable tags).

13. **Key Provider Architecture:** The `KeyProviderFactory` pattern supports environment variables, encrypted files, AWS KMS, and HashiCorp Vault. This is enterprise-grade key management architecture.

14. **No Secrets in Git:** `.env` is properly gitignored. `.env.example` contains placeholder values ("change-me-in-production"). CI uses separate test secrets.

---

## 6. Prioritized Fix List

Ordered by: Severity x Exploitability x Fix Effort

| Priority | Finding | Severity | Effort | Action |
|----------|---------|----------|--------|--------|
| **P0** | C-2: Add hiveId to all update WHERE clauses | Critical | **Low** | Add `hiveId` to `where` in `events.service.ts:163`, `tasks.service.ts:163`, `persons.service.ts:143,160` |
| **P0** | C-1: Fix RLS connection pinning | Critical | **Medium** | Wrap `setHiveSchema` + queries in Prisma interactive transaction with `SET LOCAL` |
| **P1** | H-1: Add dummy bcrypt for missing users | High | **Low** | Add `bcrypt.compare(password, DUMMY_HASH)` in the `!user` branch |
| **P1** | H-3: Configure trusted proxy properly | High | **Medium** | Replace `trustProxy: true` with specific proxy IPs/CIDR |
| **P1** | H-2: Move refresh token to HttpOnly cookie | High | **High** | Requires API changes (Set-Cookie header) and frontend changes |
| **P2** | M-1: Remove localIp from health endpoint | Medium | **Low** | Delete the `getLocalIp()` function and `localIp` field |
| **P2** | M-2: Hash email in Redis keys and logs | Medium | **Low** | Use `enc.hashEmail()` for Redis keys; redact emails in logs |
| **P2** | M-5: Enforce MAX_SESSIONS limit | Medium | **Low** | Count active tokens before creating new ones |
| **P2** | M-7: Validate recurrence rules | Medium | **Low** | Require `until` or `count`; cap at 1000 occurrences |
| **P3** | M-4: Fix password regex | Medium | **Low** | Add `+$` to the end of the pattern |
| **P3** | L-4: Add token cleanup cron | Low | **Low** | Add a NestJS `@Cron` scheduler calling `cleanupExpiredTokens()` |
| **P3** | L-5: Redact emails in log messages | Low | **Low** | Replace email with hash in all logger calls |
| **P4** | L-1: Consider RS256 for JWT | Low | **Medium** | Only relevant when adding external services |
| **P4** | M-3: Don't fully disable CSP in dev | Low | **Low** | Use relaxed CSP instead of `false` |

**Immediate Actions (before next deploy):**
1. Add `hiveId` to all update WHERE clauses (30 minutes of work, eliminates the cross-tenant attack surface)
2. Add dummy bcrypt hash for non-existent users (5 minutes, eliminates timing oracle)
3. Remove `localIp` from health endpoint (2 minutes)

**Short-term (this sprint):**
4. Fix RLS with interactive transactions + `SET LOCAL`
5. Configure `trustProxy` with actual proxy IPs
6. Hash emails in Redis keys and log messages

**Medium-term (next sprint):**
7. Migrate refresh token from localStorage to HttpOnly cookie
8. Enforce session limits
9. Add recurrence rule validation
