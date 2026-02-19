# Qoomb Setup Guide - Quick Start

**Status:** ✅ Environment configured and ready
**Date:** 2026-02-03

---

## ✅ What is already done

- ✓ `.env` file created with secure, generated secrets
- ✓ `docker-compose.yml` configured (PostgreSQL 18 + Redis 8)
- ✓ JWT Refresh Token System fully implemented
- ✓ All TypeScript errors resolved
- ✓ Security features enabled (Rate Limiting, Account Lockout, Token Blacklisting)

---

## 🚀 Setup in 3 Steps

### Step 1: Start Docker Services (PostgreSQL + Redis)

```bash
# In the project root directory
docker-compose up -d

# Check if services are running
docker-compose ps

# Should show:
# qoomb-postgres   running   (healthy)
# qoomb-redis      running   (healthy)
```

**What happens:**

- PostgreSQL 18 with pgvector extension starts on port 5432
- Redis 8 starts on port 6379
- UUID extension is enabled
- Data is persisted in Docker volumes

**If there are problems:**

```bash
# Show logs
docker-compose logs -f postgres
docker-compose logs -f redis

# Restart
docker-compose down
docker-compose up -d
```

---

### Step 2: Run Database Migration

```bash
# Change to the API directory
cd apps/api

# Generate Prisma Client
pnpm prisma generate

# Run migration (creates tables)
pnpm prisma migrate deploy

# Alternative: Development migration (creates migration if needed)
# pnpm prisma migrate dev
```

**What happens:**

- Prisma Client is generated
- `public` schema is created with User, Hive, RefreshToken tables
- PostgreSQL extensions are enabled
- Indexes are created

**Expected output:**

```text
✓ Prisma Client generated
✓ Applied migrations:
  - 20240204000000_add_refresh_tokens
✓ Database schema up to date
```

**Optional — view the database:**

```bash
# Open Prisma Studio (GUI for the database)
pnpm prisma studio
# Opens http://localhost:5555
```

---

### Step 3: Start the API Server

```bash
# In the root directory OR in apps/api
pnpm dev

# Or specifically just the API:
cd apps/api
pnpm dev
```

**Expected output:**

```text
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   🚀 Qoomb API Server Running                          │
│                                                         │
│   Environment: development                             │
│   URL: http://localhost:3001                          │
│   Security: ✓ Rate Limiting                            │
│              ✓ Helmet Headers                          │
│              ✓ CORS Protection                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Server is now running at:** `http://localhost:3001`

---

## 🧪 Testing the System

### Test 1: Health Check

```bash
curl http://localhost:3001/trpc/health
```

**Expected response:**

```json
{
  "status": "ok",
  "timestamp": "2026-02-03T..."
}
```

---

### Test 2: Hive Registration

```bash
curl -X POST http://localhost:3001/trpc/auth.register \
  -H "Content-Type: application/json" \
  -d '{
    "hiveName": "My Family",
    "adminName": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "hiveId": "uuid",
    "personId": "uuid"
  },
  "hive": {
    "id": "uuid",
    "name": "My Family"
  }
}
```

**What happens:**

- New hive is created
- Dedicated PostgreSQL schema `hive_<uuid>` is provisioned
- Admin user is created
- Admin person is created in the hive schema
- Access token (15 min) + Refresh token (7 days) are returned
- IP + User-Agent are stored for device tracking

---

### Test 3: Login

```bash
curl -X POST http://localhost:3001/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "x9y8z7w6v5u4...",
  "expiresIn": 900,
  "user": { ... },
  "hive": { ... }
}
```

---

### Test 4: Token Refresh

```bash
# Save the refreshToken from the previous login
REFRESH_TOKEN="<refreshToken from login>"

curl -X POST http://localhost:3001/trpc/auth.refresh \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }"
```

**Expected response:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "abc123...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "john@example.com",
    "hiveId": "uuid",
    "personId": "uuid"
  },
  "hive": {
    "id": "uuid",
    "name": "My Hive"
  }
}
```

**Important:** The old refresh token is now revoked!

---

### Test 5: List Active Sessions

```bash
# Save the accessToken from login
ACCESS_TOKEN="<accessToken from login>"

curl http://localhost:3001/trpc/auth.getActiveSessions \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Expected response:**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "createdAt": "2026-02-03T...",
      "expiresAt": "2026-02-10T...",
      "ipAddress": "127.0.0.1",
      "userAgent": "curl/8.4.0"
    }
  ]
}
```

---

### Test 6: Logout

```bash
curl -X POST http://localhost:3001/trpc/auth.logout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"accessToken\": \"$ACCESS_TOKEN\",
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }"
```

**Expected response:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**What happens:**

- Access token is blacklisted in Redis
- Refresh token is revoked in the DB
- Subsequent requests with these tokens are rejected

---

### Test 7: Account Lockout (Security)

```bash
# 5 failed attempts in a row
for i in {1..5}; do
  curl -X POST http://localhost:3001/trpc/auth.login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "john@example.com",
      "password": "wrongpassword"
    }'
  echo "\n--- Attempt $i ---\n"
done

# 6th attempt should fail with Account Lockout
curl -X POST http://localhost:3001/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

**Expected response (6th attempt):**

```json
{
  "error": {
    "message": "Account temporarily locked. Please try again in 15 minute(s)."
  }
}
```

---

### Test 8: Rate Limiting

```bash
# 101 requests in quick succession (limit: 100/min)
for i in {1..101}; do
  curl -s http://localhost:3001/trpc/health > /dev/null
  echo "Request $i"
done
```

**Expected behavior:**

- Requests 1-100: ✓ 200 OK
- Request 101: ❌ 429 Too Many Requests

---

## 📊 Inspecting the Database

### Prisma Studio (GUI)

```bash
cd apps/api
pnpm prisma studio
```

Opens browser at `http://localhost:5555`

**You can view:**

- `User` table with your admin user
- `Hive` table with your hive
- `RefreshToken` table with active sessions
- Hive-specific schemas (e.g. `hive_<uuid>`)

### PostgreSQL CLI

```bash
# Connect directly into the container
docker exec -it qoomb-postgres psql -U qoomb -d qoomb

# Then in psql:
\dt                          -- All tables in public schema
\dn                          -- All schemas (incl. hive_*)
SELECT * FROM users;         -- All users
SELECT * FROM refresh_tokens; -- All sessions
\q                           -- Exit
```

### Redis CLI

```bash
# Connect into the Redis container
docker exec -it qoomb-redis redis-cli

# Then in redis-cli:
KEYS *                       -- List all keys
GET <key>                    -- Get value of a key
TTL <key>                    -- Remaining time until expiration
QUIT                         -- Exit
```

---

## 🐛 Troubleshooting

### Problem: Docker services won't start

Solution 1: Ports in use

```bash
# Check if ports are already in use
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Stop other PostgreSQL/Redis instances or change ports in docker-compose.yml
```

Solution 2: Clean up old containers

```bash
docker-compose down -v  # -v also removes volumes (caution: data loss!)
docker-compose up -d
```

---

### Problem: Prisma migration fails

Error: "Can't reach database server"

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check PostgreSQL logs
docker-compose logs postgres

# Wait until health check is OK
docker-compose ps | grep healthy
```

Error: "Migration already applied"

```bash
# This is OK — migration was already applied
# Continue with the next step
```

---

### Problem: Server won't start

Error: "Cannot find module"

```bash
# Install dependencies
pnpm install

# Regenerate Prisma Client
cd apps/api
pnpm prisma generate
```

Error: "PORT already in use"

```bash
# Change port in .env
API_PORT=3002
```

Error: "Redis connection failed"

```bash
# Check if Redis is running
docker-compose ps redis

# Check Redis URL in .env
REDIS_URL=redis://localhost:6379
```

---

### Problem: Tests fail

401 Unauthorized

- Access token has expired (15 min)
- Token is blacklisted (after logout)
- Token is invalid

**Solution:** Get a new token via `auth.login` or `auth.refresh`

429 Too Many Requests

- Rate limit reached (100 req/min)

**Solution:** Wait 1 minute or temporarily increase the rate limit in code

---

## 🎉 Success

If all tests pass:

✅ PostgreSQL is running
✅ Redis is running
✅ API Server is running
✅ JWT Auth works
✅ Token Rotation works
✅ Account Lockout works
✅ Rate Limiting works
✅ Session Management works

**Your Qoomb backend is production-ready!** 🚀

---

## 📚 Next Steps

### 1. Connect Dashboard to Live Data

- Connect the Dashboard prototype (775 lines) with tRPC calls
- Replace static placeholders with real API data

### 2. Frontend i18n

- Set up typesafe-i18n in the frontend (DE/EN)
- Replace hardcoded text in Dashboard with i18n keys

### 3. Start Phase 3

- Pages Module (Tiptap Editor, tree structure)
- Documents Module (File Upload, Envelope Encryption)
- Activity Log (Change Feed)

### 4. Expand Testing

- Unit tests for new modules
- Integration tests
- E2E tests

### 5. Production Deployment

- Update `.env` for production
- Build Docker image
- Deploy to server/cloud

---

## 📖 Further Documentation

- [CONTENT_ARCHITECTURE.md](docs/CONTENT_ARCHITECTURE.md) - Content Model, Schema, Encryption
- [PERMISSIONS.md](docs/PERMISSIONS.md) - RBAC Architecture + Guard API
- [SECURITY.md](docs/SECURITY.md) - Security Architecture
- [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) - Tailwind v4 Design Tokens
- [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) - Local Development + Caddy
- [PERFORMANCE.md](docs/PERFORMANCE.md) - Prisma Performance Guide
- [PRISMA_PATTERNS.md](docs/PRISMA_PATTERNS.md) - Prisma vs Raw SQL
- [CLAUDE.md](CLAUDE.md) - Project context for development

---

**Setup Guide Version:** 1.1
**Last Updated:** 2026-02-19
