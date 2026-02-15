# Qoomb Setup Guide - Quick Start

**Status:** ✅ Environment konfiguriert und bereit
**Datum:** 2026-02-03

---

## ✅ Was bereits erledigt ist

- ✓ `.env` Datei erstellt mit sicheren, generierten Secrets
- ✓ `docker-compose.yml` konfiguriert (PostgreSQL 18 + Redis 8)
- ✓ JWT Refresh Token System vollständig implementiert
- ✓ Alle TypeScript Errors behoben
- ✓ Security Features aktiviert (Rate Limiting, Account Lockout, Token Blacklisting)

---

## 🚀 Setup in 3 Schritten

### Schritt 1: Docker Services starten (PostgreSQL + Redis)

```bash
# Im Root-Verzeichnis des Projekts
docker-compose up -d

# Prüfen ob Services laufen
docker-compose ps

# Sollte zeigen:
# qoomb-postgres   running   (healthy)
# qoomb-redis      running   (healthy)
```

**Was passiert:**

- PostgreSQL 18 mit pgvector Extension startet auf Port 5432
- Redis 8 startet auf Port 6379
- UUID Extension wird aktiviert
- Daten werden in Docker Volumes persistiert

**Falls Probleme:**

```bash
# Logs anzeigen
docker-compose logs -f postgres
docker-compose logs -f redis

# Neu starten
docker-compose down
docker-compose up -d
```

---

### Schritt 2: Datenbank-Migration ausführen

```bash
# In das API-Verzeichnis wechseln
cd apps/api

# Prisma Client generieren
pnpm prisma generate

# Migration ausführen (erstellt Tabellen)
pnpm prisma migrate deploy

# Alternative: Development Migration (erstellt Migration wenn nötig)
# pnpm prisma migrate dev
```

**Was passiert:**

- Prisma Client wird generiert
- `public` Schema wird mit User, Hive, RefreshToken Tabellen erstellt
- PostgreSQL Extensions werden aktiviert
- Indizes werden erstellt

**Erwartete Ausgabe:**

```
✓ Prisma Client generated
✓ Applied migrations:
  - 20240204000000_add_refresh_tokens
✓ Database schema up to date
```

**Optional - Datenbank anschauen:**

```bash
# Prisma Studio öffnen (GUI für Datenbank)
pnpm prisma studio
# Öffnet http://localhost:5555
```

---

### Schritt 3: API Server starten

```bash
# Im Root-Verzeichnis ODER in apps/api
pnpm dev

# Oder spezifisch nur die API:
cd apps/api
pnpm dev
```

**Erwartete Ausgabe:**

```
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

**Server läuft jetzt auf:** `http://localhost:3001`

---

## 🧪 System testen

### Test 1: Health Check

```bash
curl http://localhost:3001/trpc/health
```

**Erwartete Antwort:**

```json
{
  "status": "ok",
  "timestamp": "2026-02-03T..."
}
```

---

### Test 2: Hive Registrierung

```bash
curl -X POST http://localhost:3001/trpc/auth.register \
  -H "Content-Type: application/json" \
  -d '{
    "hiveName": "Meine Familie",
    "adminName": "Max Mustermann",
    "email": "max@example.com",
    "password": "SecurePass123!"
  }'
```

**Erwartete Antwort:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a1b2c3d4e5f6...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "max@example.com",
    "hiveId": "uuid",
    "personId": "uuid"
  },
  "hive": {
    "id": "uuid",
    "name": "Meine Familie"
  }
}
```

**Was passiert:**

- Neues Hive wird erstellt
- Dedicated PostgreSQL Schema `hive_<uuid>` wird angelegt
- Admin User wird erstellt
- Admin Person wird im Hive-Schema erstellt
- Access Token (15min) + Refresh Token (7d) werden zurückgegeben
- IP + User-Agent werden für Device-Tracking gespeichert

---

### Test 3: Login

```bash
curl -X POST http://localhost:3001/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "max@example.com",
    "password": "SecurePass123!"
  }'
```

**Erwartete Antwort:**

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
# Speichere refreshToken aus vorherigem Login
REFRESH_TOKEN="<refreshToken aus Login>"

curl -X POST http://localhost:3001/trpc/auth.refresh \
  -H "Content-Type: application/json" \
  -d "{
    \"refreshToken\": \"$REFRESH_TOKEN\"
  }"
```

**Erwartete Antwort:**

```json
{
  "accessToken": "eyJhbGci...",  # Neuer Access Token
  "refreshToken": "abc123...",   # Neuer Refresh Token (Rotation!)
  "expiresIn": 900
}
```

**Wichtig:** Der alte Refresh Token ist jetzt revoked!

---

### Test 5: Aktive Sessions anzeigen

```bash
# Speichere accessToken aus Login
ACCESS_TOKEN="<accessToken aus Login>"

curl http://localhost:3001/trpc/auth.getActiveSessions \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Erwartete Antwort:**

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

**Erwartete Antwort:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Was passiert:**

- Access Token wird in Redis blacklisted
- Refresh Token wird in DB revoked
- Nachfolgende Requests mit diesen Tokens werden abgelehnt

---

### Test 7: Account Lockout (Security)

```bash
# 5 Fehlversuche nacheinander
for i in {1..5}; do
  curl -X POST http://localhost:3001/trpc/auth.login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "max@example.com",
      "password": "wrongpassword"
    }'
  echo "\n--- Attempt $i ---\n"
done

# 6. Versuch sollte mit Account Lockout fehlschlagen
curl -X POST http://localhost:3001/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "max@example.com",
    "password": "SecurePass123!"  # Selbst mit richtigem Passwort!
  }'
```

**Erwartete Antwort (6. Versuch):**

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
# 101 Requests in schneller Folge (Limit: 100/min)
for i in {1..101}; do
  curl -s http://localhost:3001/trpc/health > /dev/null
  echo "Request $i"
done
```

**Erwartetes Verhalten:**

- Requests 1-100: ✓ 200 OK
- Request 101: ❌ 429 Too Many Requests

---

## 📊 Datenbank überprüfen

### Prisma Studio (GUI)

```bash
cd apps/api
pnpm prisma studio
```

Öffnet Browser auf `http://localhost:5555`

**Du kannst sehen:**

- `User` Tabelle mit deinem Admin-User
- `Hive` Tabelle mit deinem Hive
- `RefreshToken` Tabelle mit aktiven Sessions
- Hive-spezifische Schemas (z.B. `hive_<uuid>`)

### PostgreSQL CLI

```bash
# Direkt in Container verbinden
docker exec -it qoomb-postgres psql -U qoomb -d qoomb

# Dann in psql:
\dt                          -- Alle Tabellen im public Schema
\dn                          -- Alle Schemas (inkl. hive_*)
SELECT * FROM users;         -- Alle Users
SELECT * FROM refresh_tokens; -- Alle Sessions
\q                           -- Beenden
```

### Redis CLI

```bash
# In Redis Container verbinden
docker exec -it qoomb-redis redis-cli

# Dann in redis-cli:
KEYS *                       -- Alle Keys anzeigen
GET <key>                    -- Wert eines Keys anzeigen
TTL <key>                    -- Verbleibende Zeit bis Expiration
QUIT                         -- Beenden
```

---

## 🐛 Troubleshooting

### Problem: Docker Services starten nicht

**Lösung 1: Ports belegt**

```bash
# Prüfe ob Ports bereits belegt sind
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Stoppe andere PostgreSQL/Redis Instanzen oder ändere Ports in docker-compose.yml
```

**Lösung 2: Alte Container aufräumen**

```bash
docker-compose down -v  # -v löscht auch Volumes (Achtung: Datenverlust!)
docker-compose up -d
```

---

### Problem: Prisma Migration schlägt fehl

**Fehler: "Can't reach database server"**

```bash
# Prüfe ob PostgreSQL läuft
docker-compose ps

# Prüfe PostgreSQL Logs
docker-compose logs postgres

# Warte bis Health Check OK ist
docker-compose ps | grep healthy
```

**Fehler: "Migration already applied"**

```bash
# Das ist OK - Migration wurde bereits ausgeführt
# Weiter mit nächstem Schritt
```

---

### Problem: Server startet nicht

**Fehler: "Cannot find module"**

```bash
# Dependencies installieren
pnpm install

# Prisma Client regenerieren
cd apps/api
pnpm prisma generate
```

**Fehler: "PORT already in use"**

```bash
# Ändere Port in .env
API_PORT=3002
```

**Fehler: "Redis connection failed"**

```bash
# Prüfe ob Redis läuft
docker-compose ps redis

# Prüfe Redis URL in .env
REDIS_URL=redis://localhost:6379
```

---

### Problem: Tests schlagen fehl

**401 Unauthorized**

- Access Token ist abgelaufen (15min)
- Token ist blacklisted (nach Logout)
- Token ist ungültig

**Lösung:** Neuen Token holen via `auth.login` oder `auth.refresh`

**429 Too Many Requests**

- Rate Limit erreicht (100 req/min)

**Lösung:** 1 Minute warten oder Rate Limit in Code temporär erhöhen

---

## 🎉 Erfolg!

Wenn alle Tests funktionieren:

✅ PostgreSQL läuft
✅ Redis läuft
✅ API Server läuft
✅ JWT Auth funktioniert
✅ Token Rotation funktioniert
✅ Account Lockout funktioniert
✅ Rate Limiting funktioniert
✅ Session Management funktioniert

**Dein Qoomb Backend ist production-ready!** 🚀

---

## 📚 Nächste Schritte

### 1. Frontend Client entwickeln

- tRPC Client in React/Web einrichten
- Login/Register UI bauen
- Token Management im Frontend

### 2. Core Features implementieren

- Events Module (Kalender)
- Tasks Module (Aufgaben)
- Persons Module (Hive-Mitglieder)

### 3. Testing

- Unit Tests schreiben
- Integration Tests
- E2E Tests

### 4. Production Deployment

- `.env` für Production anpassen
- Docker Image bauen
- Deployment auf Server/Cloud

---

## 📖 Weitere Dokumentation

- [JWT_REFRESH_TOKEN_IMPLEMENTATION.md](docs/JWT_REFRESH_TOKEN_IMPLEMENTATION.md) - JWT Implementation Details
- [IMPLEMENTATION_COMPLETE.md](docs/IMPLEMENTATION_COMPLETE.md) - Feature Übersicht
- [STATUS_REPORT.md](STATUS_REPORT.md) - Aktueller Implementierungs-Status
- [SECURITY.md](docs/SECURITY.md) - Security Architektur
- [claude.md](claude.md) - Projekt-Kontext für Entwicklung

---

**Setup Guide Version:** 1.0
**Last Updated:** 2026-02-03
