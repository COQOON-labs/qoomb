# Security Documentation

This document explains the comprehensive security measures implemented in Qoomb to protect user data and prevent common security vulnerabilities.

## Table of Contents

1. [Security Architecture Overview](#security-architecture-overview)
2. [Multi-Tenant Data Isolation](#multi-tenant-data-isolation)
3. [Authentication & Authorization](#authentication--authorization)
4. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
5. [Resource-Level Access Control](#resource-level-access-control)
6. [Input Validation & Sanitization](#input-validation--sanitization)
7. [Rate Limiting & DoS Protection](#rate-limiting--dos-protection)
8. [Defense-in-Depth Measures](#defense-in-depth-measures)
9. [Audit Logging](#audit-logging)
10. [Security Best Practices](#security-best-practices)
11. [Threat Model](#threat-model)
12. [Security Checklist](#security-checklist)

---

## Security Architecture Overview

Qoomb implements a **defense-in-depth** security strategy with multiple independent layers of protection:

```text
┌─────────────────────────────────────────────────┐
│ Layer 1: Input Validation (Zod + Sanitization) │
├─────────────────────────────────────────────────┤
│ Layer 2: Rate Limiting (Throttler + Redis)     │
├─────────────────────────────────────────────────┤
│ Layer 3: Authentication (JWT Access + Refresh) │
├─────────────────────────────────────────────────┤
│ Layer 4: Authorization (hiveProcedure + RBAC)  │
├─────────────────────────────────────────────────┤
│ Layer 5: Resource Access (5-stage guard)       │
├─────────────────────────────────────────────────┤
│ Layer 6: Row-Level Security (PostgreSQL RLS)   │
├─────────────────────────────────────────────────┤
│ Layer 7: Audit Logging                         │
└─────────────────────────────────────────────────┘
```

Each layer is independent. If one fails, others still protect.

---

## Multi-Tenant Data Isolation

### Architecture: Shared Schema + Row-Level Security

**What it is:** All hives share a single PostgreSQL schema. Isolation is enforced at the database level via Row-Level Security (RLS) policies on every hive-scoped table.

**Why not Schema-Per-Hive?**

- SaaS-first: schema-per-hive does not scale to many small tenants
- Simple migrations: one migration updates all tenants instantly
- Connection pooling compatible (PgBouncer/pgpool)
- Cross-tenant analytics for billing/usage without schema federation

### How isolation works

Every hive-scoped table has an RLS policy keyed on a PostgreSQL session variable:

```sql
-- Session variable set by hiveProcedure before every handler
SET app.hive_id = '<hive-uuid>';

-- Example RLS policy (events table)
CREATE POLICY "events_isolation" ON "events"
  USING (hive_id = current_setting('app.hive_id', true)::uuid)
  WITH CHECK (hive_id = current_setting('app.hive_id', true)::uuid);

ALTER TABLE "events" FORCE ROW LEVEL SECURITY;
```

`FORCE ROW LEVEL SECURITY` ensures even the table owner (application role) cannot bypass the policies.

### Tables with RLS

All hive-scoped tables have isolation policies:

| Table                   | RLS policy key |
| ----------------------- | -------------- |
| `persons`               | `app.hive_id`  |
| `events`                | `app.hive_id`  |
| `tasks`                 | `app.hive_id`  |
| `hive_role_permissions` | `app.hive_id`  |
| `hive_groups`           | `app.hive_id`  |
| `hive_group_members`    | `app.hive_id`  |
| `person_shares`         | `app.hive_id`  |
| `group_shares`          | `app.hive_id`  |

Global tables (`users`, `hives`, `user_hive_memberships`, `refresh_tokens`) are not hive-scoped and have no RLS. Access is controlled at the application layer.

### Session variable setup

`PrismaService.setHiveSchema()` sets the session variables before any handler runs:

```typescript
async setHiveSchema(hiveId: string, userId?: string): Promise<void> {
  // 1. UUID validation — only [0-9a-f-] allowed, prevents SQL injection
  this.validateUUID(hiveId);
  if (userId) this.validateUUID(userId);

  // 2. Verify hive exists in DB
  await this.verifyHiveExists(hiveId);

  // 3. Set RLS session variables
  await this.executeRawSql(`SET app.hive_id = '${hiveId}'`);
  if (userId) {
    await this.executeRawSql(`SET app.user_id = '${userId}'`);
  }
}
```

**Note:** PostgreSQL SET requires a literal value, not a parameter. UUID validation (strict regex for `[0-9a-f-]` format) is the injection prevention mechanism here.

---

## Authentication & Authorization

### 1. Password Security

**Hashing:**

- Algorithm: bcrypt
- Salt rounds: 10 (dev), 12 (production)
- Max password length: 100 (prevents bcrypt DoS via long input)

**Password Requirements:**

- Minimum 8 characters
- Must contain uppercase, lowercase, number, and special character (`@$!%*?&`)

### 2. JWT Tokens (Access + Refresh)

Qoomb uses a **dual-token model**:

| Token         | Lifetime   | Storage                     | Purpose                  |
| ------------- | ---------- | --------------------------- | ------------------------ |
| Access token  | 15 minutes | Memory / short-lived cookie | API authentication       |
| Refresh token | 7 days     | HttpOnly cookie             | Obtain new access tokens |

**Access token payload:**

```json
{
  "sub": "user-uuid",
  "hiveId": "hive-uuid",
  "personId": "person-uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Security features:**

- Signed with RS256 (asymmetric; private key signs, public key verifies)
- Keys stored base64-encoded in `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`
- Minimal payload — no sensitive data, no email
- Refresh tokens stored in DB (`refresh_tokens` table) with device/IP metadata
- Refresh token rotation: each use issues a new token and invalidates the old one
- Token blacklisting: revoked tokens stored in Redis (covers logout, password change, suspicious activity)
- Server-side session revocation on logout

**Token validation flow:**

```text
Request with Access Token
    ↓
JWT signature verification
    ↓
Redis blacklist check (token revoked?)
    ↓
User exists in DB?
    ↓
Proceed with ctx.user
```

### 3. tRPC Procedures (Authorization Tiers)

```typescript
// Tier 1: No auth required
publicProcedure; // login, register, health check

// Tier 2: JWT required
protectedProcedure; // user profile, cross-hive operations

// Tier 3: JWT + hive context + RBAC data loaded
hiveProcedure; // all hive-scoped operations (events, tasks, persons, ...)
```

**`hiveProcedure` loads 4 things in parallel before every handler:**

```typescript
const [hive, person, allHiveOverrides, groupMemberships] = await Promise.all([
  ctx.prisma.hive.findUnique({ select: { type: true } }),
  ctx.prisma.person.findUnique({ select: { role: true } }),
  ctx.prisma.hiveRolePermission.findMany({ where: { hiveId } }),
  ctx.prisma.hiveGroupMember.findMany({ where: { personId, hiveId } }),
]);
// ctx.user gains: hiveType, role, roleOverrides, groupIds
```

### 4. Passkey / WebAuthn

FIDO2/WebAuthn passkey authentication is supported as a password-free alternative. Credential public keys are stored in `passkey_credentials` with signature counter tracking to detect credential cloning. No biometric data leaves the user's device.

### 5. Email Verification

Implemented via `email_verification_tokens` table. New registrations receive a verification email. Unverified accounts have limited access until verified.

### 6. Account Lockout

Exponential backoff after failed login attempts. Tracked in Redis. Prevents brute-force attacks without requiring CAPTCHA.

---

## Role-Based Access Control (RBAC)

### Roles

**Family Hive** — minimum 1 `parent` enforced by DB trigger `enforce_minimum_admin`

| Role     | Description                      |
| -------- | -------------------------------- |
| `parent` | Full admin — all permissions     |
| `child`  | Reduced — can manage own content |

**Organization Hive** — minimum 1 `org_admin` enforced by DB trigger

| Role        | Description                                   |
| ----------- | --------------------------------------------- |
| `org_admin` | Full admin — all permissions                  |
| `manager`   | Can manage all content, invite/remove members |
| `member`    | Can create and manage own content             |
| `guest`     | Read-only                                     |

### Permission system

Global defaults defined in `packages/types/src/permissions.ts` (`HIVE_ROLE_PERMISSIONS`). In-memory lookup, zero DB cost.

Per-hive overrides stored in `hive_role_permissions` table (grant/revoke individual permissions for a role). Applied at runtime by `hasPermissionWithOverrides()`.

**Checking a permission in a handler:**

```typescript
import { requirePermission } from '../common/guards';
requirePermission(ctx, HivePermission.EVENTS_CREATE);
// Throws FORBIDDEN if role lacks this permission (including DB overrides)
```

### DB trigger: minimum admin enforcement

`enforce_minimum_admin` (SECURITY DEFINER, bypasses RLS) prevents removing the last `parent`/`org_admin` from a hive. This ensures there is always at least one admin who can manage the hive.

---

## Resource-Level Access Control

For operations on specific resources (get, update, delete), role alone is insufficient. Resource visibility and explicit shares are also evaluated.

### Visibility values

Every resource (Event, Task, etc.) carries a `visibility` field:

| Value       | Access                                              |
| ----------- | --------------------------------------------------- |
| `'hive'`    | All hive members with the view permission (default) |
| `'admins'`  | Admin roles only (`parent` / `org_admin`)           |
| `'group'`   | Members of the resource's group only                |
| `'private'` | Creator only — **no admin bypass**                  |

### Groups

`HiveGroup` + `HiveGroupMember` tables. Admins gain access to group resources by joining the group — this is recorded in `addedByPersonId` + `joinedAt` for auditability. There is no silent admin bypass.

### Shares (PersonShare & GroupShare)

Explicit access grants using an ordinal `accessLevel`:

- `VIEW (1)` — can read
- `EDIT (2)` — can read + edit
- `MANAGE (3)` — can read + edit + delete + re-share

Higher levels imply lower levels.

**Share behavior by visibility:**

- `'hive'` / `'admins'`: Shares are **additive** — they elevate access beyond role baseline
- `'group'` / `'private'`: Shares are the **exclusive** non-member access path

**Share creation restriction:** Only the resource creator may create shares for `'private'` resources. This prevents admins from granting themselves access to private content without ever seeing it.

### 5-stage access resolution

Implemented in `apps/api/src/common/guards/resource-access.guard.ts`:

```text
Stage 1: Load PersonShare + GroupShares in parallel
   → effectiveShareLevel = max(0, all applicable levels)
Stage 2: visibility = 'private' → creator OR share ≥ required → else FORBIDDEN
Stage 3: visibility = 'group'   → creator OR member (VIEW) OR share ≥ required
Stage 4: visibility = 'admins'  → share exception OR admin role required
Stage 5: visibility = 'hive'    → share (additive) OR role-based (ANY/OWN)
```

Fail-closed: missing `hiveType`, `role`, or `personId` in context → always `FORBIDDEN`.

**Key security property:** No admin bypass exists for `'private'` or `'group'` resources. Every access path is explicit and (for groups) auditable.

**See also:** `docs/PERMISSIONS.md` for the complete permission architecture.

---

## Input Validation & Sanitization

### 1. Zod Schema Validation

All input validated at the API boundary with Zod schemas before any processing:

```typescript
const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/);
```

### 2. HTML Sanitization (XSS Prevention)

`sanitizeHtml()` in `@qoomb/validators` runs two tag-removal passes + encodes remaining `<`/`>`:

```typescript
// Two-pass removal prevents reconstruction attacks like <sc<script>ript>
input
  .replace(/<[^<>]*>/g, '') // Pass 1
  .replace(/<[^<>]*>/g, '') // Pass 2
  .replace(/</g, '&lt;') // Encode remaining (final safety net)
  .replace(/>/g, '&gt;');
```

**Note:** The negated class is `[^<>]` (excludes both delimiters), not `[^>]`, to prevent ReDoS via polynomial backtracking.

### 3. Log Injection Prevention

User-controlled values (URLs, headers) have `\r\n` stripped before logging to prevent log-line forgery:

```typescript
const url = request.url.replace(/[\r\n]/g, '');
this.logger.warn(`[RATE_LIMIT] Throttled request to ${url}`);
```

### 4. UUID Validation

All UUID inputs are strictly validated before use in raw SQL. This is the injection prevention mechanism for session variable SET commands.

---

## Rate Limiting & DoS Protection

### Rate Limit Configuration

- **Global:** 100 requests / 15 minutes per IP or authenticated user ID
- **Login:** 5 attempts / 15 minutes per IP
- **Registration:** 3 attempts / hour per IP
- **Password Reset:** 3 attempts / hour per IP

### Implementation

Redis-backed distributed rate limiting via `CustomThrottlerGuard`. Tracks by user ID for authenticated requests, by IP for unauthenticated.

### DoS Protection

- Max string length: 10,000 characters
- Max text/body: 100,000 characters / 5 MB JSON
- Max file size: 10 MB
- Max password length: 100 chars (bcrypt DoS prevention)

### CSRF Protection

Custom request header required for all mutating requests (defense against CSRF via form-based cross-origin submissions). The header requirement is validated by middleware before reaching tRPC handlers.

---

## Defense-in-Depth Measures

### Security Headers (Helmet.js)

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

### Encryption at Rest

AES-256-GCM encryption is applied to all PII and sensitive content fields. Keys are derived via HKDF from a master key — compromise of one hive does not expose others.

**PII fields (encrypted from day one, stored as ciphertext — no plaintext ever written to DB):**

| Field                  | Key scope | Purpose                         |
| ---------------------- | --------- | ------------------------------- |
| `users.email`          | Per-user  | Email address ciphertext        |
| `users.full_name`      | Per-user  | Full name ciphertext            |
| `hives.name`           | Per-hive  | Hive name ciphertext            |
| `persons.display_name` | Per-hive  | Display name ciphertext         |
| `persons.birthdate`    | Per-hive  | Birthdate ciphertext (ISO 8601) |

**Email blind index:**

`users.email_hash` and `invitations.email_hash` store an HMAC-SHA256 of the email address (using a separate `HMAC_SECRET`). This allows O(1) lookups by email (login, duplicate check, invitation matching) without storing plaintext. No plaintext email is ever written to the database.

**Content fields (per-hive key):**

Event and task fields (`title`, `description`, `location`, `url`, `category`) are encrypted via the `@EncryptFields` / `@DecryptFields` decorator pattern. Group fields (`name`, `description`) are likewise encrypted.

Pluggable key providers: Environment, File, AWS KMS, HashiCorp Vault.

### Database Hardening

- Parameterized queries (Prisma) for all ORM operations
- Raw SQL only where necessary (complex queries), with UUID pre-validation
- RLS `FORCE ROW LEVEL SECURITY` on all hive-scoped tables
- DB trigger `enforce_minimum_admin` (SECURITY DEFINER) prevents admin removal

---

## Audit Logging

Lightweight audit trail. No plaintext content stored — only IDs and action types.

**Logged events:**

- Authentication: login, logout, register, password change/reset
- Hive operations: create, update, delete
- Member operations: create, delete
- Permission changes
- Data export/import

**Schema (planned):**

```sql
audit_logs:
  id            UUID PK
  hive_id       UUID FK → hives (nullable for global events)
  actor_id      UUID FK → persons (nullable for system)
  action        VARCHAR(20)   -- created|updated|deleted|shared|restored
  resource_type VARCHAR(50)
  resource_id   UUID          -- no FK (polymorphic)
  ip_address    INET
  user_agent    TEXT
  metadata      JSONB?        -- e.g. {fields_changed:['title']} — no values
  created_at    TIMESTAMPTZ

INDEX: (hive_id, created_at DESC)
```

Audit logs are immutable — no updates or deletes allowed.

---

## Security Best Practices

### Production Deployment

```bash
# Required — no defaults accepted
KEY_PROVIDER=environment   # or: file | aws-kms | vault
ENCRYPTION_KEY=$(openssl rand -base64 32)

# RS256 key pair for JWT signing
openssl genpkey -algorithm RSA -out jwt-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
JWT_PRIVATE_KEY=$(base64 -w0 < jwt-private.pem)
JWT_PUBLIC_KEY=$(base64 -w0 < jwt-public.pem)
# Store jwt-private.pem securely (KMS/vault) — delete the local copy after

DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NODE_ENV=production
BCRYPT_SALT_ROUNDS=12
ALLOWED_ORIGINS=https://yourdomain.com
```

### Secrets Management

- Never commit secrets to version control
- Use environment variables or a secrets manager
- Rotate JWT key pair and ENCRYPTION_KEY quarterly
- Use different secrets per environment

---

## Threat Model

### Threats We Protect Against

| Threat                        | Protection Measures                                                          |
| ----------------------------- | ---------------------------------------------------------------------------- |
| **SQL Injection**             | Prisma parameterized queries; UUID pre-validation for raw SET commands       |
| **XSS**                       | Two-pass HTML sanitization; CSP headers; Zod input validation                |
| **CSRF**                      | Custom request header requirement; SameSite cookies                          |
| **Brute Force**               | Rate limiting; account lockout with exponential backoff                      |
| **Password Attacks**          | bcrypt (12 rounds prod); max length 100; complexity requirements             |
| **Session Hijacking**         | HTTPS; HttpOnly cookies; short-lived access tokens (15 min)                  |
| **Cross-Tenant Data Leakage** | Shared Schema + RLS (FORCE); `app.hive_id` session variable; UUID validation |
| **Privilege Escalation**      | RBAC with per-hive overrides; 5-stage resource access guard; fail-closed     |
| **Private Data Exposure**     | No admin bypass for `'private'` resources; creator-only share creation       |
| **DoS**                       | Rate limiting; input size limits; bcrypt length cap                          |
| **Path Traversal**            | File name sanitization                                                       |
| **Log Injection**             | `\r\n` stripping on user-controlled log values                               |
| **ReDoS**                     | Bounded negated character classes in all sanitization regex                  |
| **Info Leakage**              | Generic error messages (`'Insufficient permissions'`) everywhere             |
| **PII Exposure (DB breach)**  | All PII encrypted at rest; email stored only as HMAC-SHA256 blind index      |

### Out of Scope (Future Work)

- Two-factor authentication (2FA)
- IP geolocation blocking
- Advanced bot detection
- Web Application Firewall (WAF)

---

## Security Checklist

### Development

- [ ] All user input validated with Zod schemas
- [ ] Sensitive operations use `hiveProcedure` middleware
- [ ] No secrets in code or version control
- [ ] Error messages don't leak sensitive information
- [ ] All DB queries use Prisma (parameterized); raw SQL only with UUID pre-validation
- [ ] File uploads sanitized and validated
- [ ] Dependencies regularly updated (`pnpm audit`)

### Deployment

- [ ] Generate RS256 key pair (`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`)
- [ ] Generate strong ENCRYPTION_KEY (32+ characters)
- [ ] Set NODE_ENV=production
- [ ] Configure ALLOWED_ORIGINS correctly
- [ ] Enable rate limiting
- [ ] Set BCRYPT_SALT_ROUNDS=12
- [ ] Database uses SSL/TLS connections
- [ ] Redis secured with password
- [ ] Regular backups configured
- [ ] Monitoring and alerting set up
- [ ] Security headers configured
- [ ] HTTPS enforced everywhere

### Ongoing

- [ ] Regular security audits
- [ ] Monitor audit logs for suspicious activity
- [ ] Keep dependencies up to date
- [ ] Review and rotate secrets quarterly
- [ ] Test disaster recovery procedures
- [ ] Review rate limit effectiveness
- [ ] Monitor failed login attempts

---

## Reporting Security Issues

If you discover a security vulnerability, please email <security@qoomb.app> or report via GitHub Security Advisories for the private repo.

**Please do not:**

- Open public GitHub issues for security vulnerabilities
- Share vulnerabilities publicly before they are fixed

**We commit to:**

- Acknowledge receipt within 48 hours
- Provide a fix timeline within 7 days
- Credit researchers (if desired) after fix is deployed

---

## Further Reading

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [NestJS Security Best Practices](https://docs.nestjs.com/security/authentication)
- [JWT Best Practices (RFC 8725)](https://tools.ietf.org/html/rfc8725)

---

**Last Updated:** 2026-02-17
**Version:** 1.2.0
