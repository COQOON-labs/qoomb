# Security Documentation

This document explains the comprehensive security measures implemented in Qoomb to protect user data and prevent common security vulnerabilities.

## Table of Contents

1. [Security Architecture Overview](#security-architecture-overview)
2. [Multi-Tenant Data Isolation](#multi-tenant-data-isolation)
3. [Authentication & Authorization](#authentication--authorization)
4. [Input Validation & Sanitization](#input-validation--sanitization)
5. [Rate Limiting & DoS Protection](#rate-limiting--dos-protection)
6. [Defense-in-Depth Measures](#defense-in-depth-measures)
7. [Audit Logging](#audit-logging)
8. [Security Best Practices](#security-best-practices)
9. [Threat Model](#threat-model)
10. [Security Checklist](#security-checklist)

---

## Security Architecture Overview

Qoomb implements a **defense-in-depth** security strategy with multiple layers of protection:

```
┌─────────────────────────────────────────────────┐
│ Layer 1: Input Validation (Zod + Sanitization) │
├─────────────────────────────────────────────────┤
│ Layer 2: Rate Limiting (Throttler)             │
├─────────────────────────────────────────────────┤
│ Layer 3: Authentication (JWT)                  │
├─────────────────────────────────────────────────┤
│ Layer 4: Authorization (Middleware)            │
├─────────────────────────────────────────────────┤
│ Layer 5: Schema Isolation (search_path)        │
├─────────────────────────────────────────────────┤
│ Layer 6: Row-Level Security (RLS)              │
├─────────────────────────────────────────────────┤
│ Layer 7: Audit Logging                         │
└─────────────────────────────────────────────────┘
```

---

## Multi-Tenant Data Isolation

### 1. PostgreSQL Schema-Per-Hive

**What it is:** Each hive gets its own dedicated PostgreSQL schema (`hive_<uuid>`).

**Why it matters:**

- Complete data isolation between hives
- No risk of cross-hive data leakage
- Easy per-hive backups and data export
- Scalable architecture (can move schemas to different databases)

**Implementation:**

```sql
-- Each hive gets its own schema
CREATE SCHEMA hive_550e8400;

-- Tables are created within the hive schema
CREATE TABLE hive_550e8400.persons (...);
CREATE TABLE hive_550e8400.events (...);
CREATE TABLE hive_550e8400.tasks (...);
```

**Access Control:**

```typescript
// PrismaService.setHiveSchema() with security validation
async setHiveSchema(hiveId: string, userId?: string): Promise<void> {
  // 1. Validate UUID format (prevents SQL injection)
  this.validateUUID(hiveId);

  // 2. Verify hive exists in database
  await this.verifyHiveExists(hiveId);

  // 3. Set session variables for RLS
  await this.$executeRawUnsafe(`SET app.hive_id = '${hiveId}'`);

  // 4. Set search_path to hive schema
  await this.$executeRawUnsafe(`SET search_path TO hive_${hiveId}, public`);
}
```

**Security Measures:**

1. **UUID Validation:** Prevents SQL injection via malformed UUIDs
2. **Existence Verification:** Prevents access to non-existent schemas
3. **Session Variables:** Enables Row-Level Security policies
4. **Logging:** Audit trail for schema context changes

---

## Authentication & Authorization

### 1. Password Security

**Hashing:**

- Algorithm: bcrypt
- Salt rounds: 10 (configurable, 12 for production)
- Max password length: 100 (prevents bcrypt DoS)

**Password Requirements:**

- Minimum 8 characters
- Must contain:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character (@$!%\*?&)

**Implementation:**

```typescript
// Registration
const passwordHash = await bcrypt.hash(input.adminPassword, 10);

// Login
const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
```

### 2. JWT (JSON Web Tokens)

**Token Structure:**

```json
{
  "sub": "user-uuid",
  "hiveId": "hive-uuid",
  "personId": "person-uuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Security Features:**

- Signed with HS256 algorithm
- 7-day expiration (configurable)
- Contains minimal information (no sensitive data)
- Validated on every request

**Token Validation:**

```typescript
async validateToken(token: string) {
  const payload = this.jwtService.verify(token);

  // Verify user still exists
  const user = await this.prisma.user.findUnique({
    where: { id: payload.sub }
  });

  if (!user) {
    throw new UnauthorizedException('User not found');
  }

  return user;
}
```

### 3. Authorization Middleware

**Protected Procedure:**

```typescript
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
```

**Hive Procedure:**

```typescript
export const hiveProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // Set hive schema context with user context for RLS
  await ctx.prisma.setHiveSchema(ctx.user.hiveId, ctx.user.id);
  return next({ ctx });
});
```

### 4. User-Hive Access Verification

**Purpose:** Verify that a user has permission to access a specific hive.

```typescript
async verifyUserHiveAccess(userId: string, hiveId: string): Promise<void> {
  this.validateUUID(userId);
  this.validateUUID(hiveId);

  const user = await this.user.findFirst({
    where: { id: userId, hiveId: hiveId }
  });

  if (!user) {
    throw new UnauthorizedException('Access to this hive is not authorized');
  }
}
```

---

## Input Validation & Sanitization

### 1. Zod Schema Validation

**Purpose:** Validate and sanitize all user input at the API boundary.

**Email Validation:**

```typescript
const emailSchema = z
  .string()
  .trim() // Remove whitespace
  .toLowerCase() // Normalize to lowercase
  .email('Invalid email') // Validate format
  .max(320); // RFC 5321 max length
```

**Password Validation:**

```typescript
const passwordSchema = z
  .string()
  .min(8)
  .max(100)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/);
```

**Name Validation:**

```typescript
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9\s\-'äöüÄÖÜßéèêàâôîûùç]+$/);
```

### 2. Sanitization Utilities

**HTML Sanitization (XSS Prevention):**

```typescript
function sanitizeHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

**SQL Sanitization (Defense-in-Depth):**

```typescript
function sanitizeSql(input: string): string {
  // Remove SQL control characters
  // Note: Should never be needed with parameterized queries
  return input.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, ...);
}
```

**File Name Sanitization:**

```typescript
function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\/\\]/g, '_') // Replace slashes
    .replace(/\.\./g, '_') // Prevent path traversal
    .trim();
}
```

### 3. Validation Layers

```
User Input
    ↓
[1. Zod Schema Validation]
    ↓
[2. Sanitization Utilities]
    ↓
[3. Business Logic Validation]
    ↓
[4. Database Constraints]
    ↓
Stored Data
```

---

## Rate Limiting & DoS Protection

### 1. Rate Limit Configuration

**Global Rate Limit:**

- 100 requests per 15 minutes per IP/user
- Applies to all endpoints by default

**Authentication Endpoints (Strict):**

- **Login:** 5 attempts per 15 minutes per IP
- **Registration:** 3 attempts per hour per IP
- **Password Reset:** 3 attempts per hour per IP

**Search Endpoints (Moderate):**

- 50 searches per 5 minutes per user

**Write Operations:**

- 30 writes per minute per user

### 2. Implementation

**Throttler Guard:**

```typescript
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    // Track by user ID for authenticated requests
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }

    // Track by IP for unauthenticated requests
    return this.getIpFromRequest(req);
  }
}
```

**Configuration:**

```typescript
export const RATE_LIMITS = {
  GLOBAL: { ttl: 15 * 60, limit: 100 },
  AUTH: { ttl: 15 * 60, limit: 5 },
  REGISTRATION: { ttl: 60 * 60, limit: 3 },
};
```

### 3. DoS Protection

**Input Size Limits:**

- Max string length: 10,000 characters
- Max text length: 100,000 characters
- Max array length: 1,000 items
- Max file size: 10 MB
- Max JSON payload: 5 MB

**Password Length Limit:**

- Max 100 characters (prevents bcrypt DoS)

---

## Defense-in-Depth Measures

### 1. Row-Level Security (RLS)

**Purpose:** Additional database-level security even if application logic fails.

**Session Variables:**

```sql
CREATE FUNCTION current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE FUNCTION current_hive_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.hive_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;
```

**RLS Policies:**

```sql
-- Hives: Users can only read their own hive
CREATE POLICY hives_select_policy ON hives
  FOR SELECT
  USING (id = current_hive_id());

-- Users: Users can only read users in their own hive
CREATE POLICY users_select_policy ON users
  FOR SELECT
  USING (id = current_user_id() OR hive_id = current_hive_id());

-- Prevent unauthorized updates and deletes
CREATE POLICY users_update_policy ON users
  FOR UPDATE
  USING (id = current_user_id());

CREATE POLICY users_delete_policy ON users
  FOR DELETE
  USING (FALSE);
```

**Benefits:**

- Prevents data leakage even if application has bugs
- Additional layer of security at the database level
- Enforces access control in all code paths

### 2. Database Triggers

**Email Normalization:**

```sql
CREATE TRIGGER normalize_user_email
  BEFORE INSERT OR UPDATE OF email ON users
  FOR EACH ROW
  EXECUTE FUNCTION normalize_email();
```

**Automatic Timestamps:**

```sql
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Audit Logging

### 1. Audit Log Table

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
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
```

### 2. Logged Events

**Authentication:**

- user.login
- user.logout
- user.register
- user.password_change
- user.password_reset

**Hive Operations:**

- hive.create
- hive.update
- hive.delete

**Data Operations:**

- person.create
- person.delete
- data.export
- data.import

**Permissions:**

- permission.change

### 3. Audit Log Security

**RLS Policies:**

- Users can only read their own audit logs
- Only application can insert audit logs
- No updates or deletes allowed (immutable)

**Retention:**

- Default retention: 90 days
- Configurable per deployment

---

## Security Best Practices

### 1. Production Deployment

**Environment Variables:**

```bash
# Generate strong secrets
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)

# Update .env
NODE_ENV=production
BCRYPT_SALT_ROUNDS=12
RATE_LIMIT_ENABLED=true
ALLOWED_ORIGINS=https://yourdomain.com
```

**Database:**

- Use connection pooling
- Enable SSL/TLS for connections
- Restrict database access to application servers only
- Regular backups with encryption

**Secrets Management:**

- Never commit secrets to version control
- Use environment variables or secret management service
- Rotate secrets regularly
- Use different secrets for each environment

### 2. Regular Security Updates

- Keep dependencies up to date
- Monitor security advisories
- Run `pnpm audit` regularly
- Update Node.js, PostgreSQL, Redis

### 3. Security Headers

**Recommended Headers:**

```typescript
{
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

---

## Threat Model

### Threats We Protect Against

| Threat                                | Protection Measures                                                 |
| ------------------------------------- | ------------------------------------------------------------------- |
| **SQL Injection**                     | Parameterized queries (Prisma), UUID validation, input sanitization |
| **XSS (Cross-Site Scripting)**        | Input sanitization, HTML encoding, CSP headers                      |
| **CSRF (Cross-Site Request Forgery)** | SameSite cookies, CORS configuration, JWT tokens                    |
| **Brute Force Attacks**               | Rate limiting, account lockout, strong password requirements        |
| **Password Attacks**                  | bcrypt hashing, salt rounds, password complexity requirements       |
| **Session Hijacking**                 | HTTPS only, secure cookies, JWT expiration                          |
| **Data Leakage**                      | Schema isolation, RLS policies, hive-ownership validation           |
| **DoS (Denial of Service)**           | Rate limiting, input size limits, bcrypt max length                 |
| **Path Traversal**                    | File name sanitization, no direct file access                       |
| **Command Injection**                 | No shell execution with user input, parameterized queries only      |
| **Information Disclosure**            | Generic error messages, no stack traces in production               |
| **Privilege Escalation**              | Authorization middleware, RLS policies, hive verification           |

### Out of Scope (Future Work)

- Email verification
- Two-factor authentication (2FA)
- Account recovery mechanisms
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
- [ ] All database queries use Prisma (parameterized)
- [ ] File uploads sanitized and validated
- [ ] Dependencies regularly updated

### Deployment

- [ ] Generate strong JWT_SECRET (32+ characters)
- [ ] Generate strong ENCRYPTION_KEY (32+ characters)
- [ ] Set NODE_ENV to "production"
- [ ] Configure ALLOWED_ORIGINS correctly
- [ ] Enable rate limiting
- [ ] Set BCRYPT_SALT_ROUNDS to 12
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

If you discover a security vulnerability, please email security@qoomb.app (or report via GitHub Security Advisories for the private repo).

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
- [bcrypt Security Considerations](https://github.com/kelektiv/node.bcrypt.js#security-issues-and-concerns)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

---

**Last Updated:** 2026-02-03
**Version:** 1.0.0
