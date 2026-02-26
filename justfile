# Qoomb — development task runner
# Install: https://github.com/casey/just
# Usage:   just <recipe>   |   just (shows list)

set shell := ["bash", "-euo", "pipefail", "-c"]

project_dir := justfile_directory()

# Auto-approve all prompts (AUTO=1 just start)
export AUTO := env('AUTO', '0')

# Auto-approve seed data (SEED=1 just start)
export SEED := env('SEED', '0')

# Color codes (work with echo -e in bash)
green  := "\\033[0;32m"
yellow := "\\033[1;33m"
blue   := "\\033[0;34m"
red    := "\\033[0;31m"
cyan   := "\\033[0;36m"
nc     := "\\033[0m"

# ─── Default ─────────────────────────────────────────────────────────────────

# Show available recipes
default:
    @just --list

# ─── Setup ───────────────────────────────────────────────────────────────────

# Check if required CLI tools are installed
check-deps:
    @echo -e "{{blue}}Checking dependencies...{{nc}}"
    @command -v docker >/dev/null 2>&1 || { echo -e "{{red}}✗ Docker not installed{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ Docker:{{nc}}   $(docker --version | cut -d' ' -f3)"
    @command -v pnpm >/dev/null 2>&1 || { echo -e "{{red}}✗ pnpm not installed{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ pnpm:{{nc}}     $(pnpm --version)"
    @command -v node >/dev/null 2>&1 || { echo -e "{{red}}✗ Node.js not installed{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ Node.js:{{nc}}  $(node --version)"

# Check if required ports are available
check-ports: _check-docker
    #!/usr/bin/env bash
    set -euo pipefail
    echo -e "\033[0;34mChecking ports...\033[0m"
    CONFLICT=0

    if docker ps --filter "name=qoomb-postgres" --filter "status=running" -q 2>/dev/null | grep -q .; then
        echo -e "\033[0;32m✓ Port 5432 (PostgreSQL) — qoomb container already running\033[0m"
    elif lsof -Pi :5432 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":5432.*LISTEN"; then
        echo -e "\033[0;31m✗ Port 5432 (PostgreSQL) in use by another process\033[0m"
        CONFLICT=1
    else
        echo -e "\033[0;32m✓ Port 5432 (PostgreSQL) available\033[0m"
    fi

    if docker ps --filter "name=qoomb-redis" --filter "status=running" -q 2>/dev/null | grep -q .; then
        echo -e "\033[0;32m✓ Port 6379 (Redis) — qoomb container already running\033[0m"
    elif lsof -Pi :6379 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":6379.*LISTEN"; then
        echo -e "\033[0;31m✗ Port 6379 (Redis) in use by another process\033[0m"
        CONFLICT=1
    else
        echo -e "\033[0;32m✓ Port 6379 (Redis) available\033[0m"
    fi

    if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":3001.*LISTEN"; then
        echo -e "\033[1;33m⚠ Port 3001 (API) is in use\033[0m"
    else
        echo -e "\033[0;32m✓ Port 3001 (API) available\033[0m"
    fi

    if [ "$CONFLICT" -eq 1 ]; then
        echo ""
        echo -e "\033[0;31m╔════════════════════════════════════════════════════════════╗\033[0m"
        echo -e "\033[0;31m║  ⚠️  PORT CONFLICT — required ports are taken               ║\033[0m"
        echo -e "\033[0;31m║                                                            ║\033[0m"
        echo -e "\033[0;31m║  Fix:  brew services stop postgresql@17                    ║\033[0m"
        echo -e "\033[0;31m║  Or:   change 5432:5432 → 5433:5432 in docker-compose.yml ║\033[0m"
        echo -e "\033[0;31m╚════════════════════════════════════════════════════════════╝\033[0m"
        exit 1
    fi

# Install all dependencies
install:
    @echo -e "{{blue}}Installing dependencies...{{nc}}"
    pnpm install
    @echo -e "{{green}}✓ Dependencies installed{{nc}}"

# Simple setup: deps + Docker + DB + optional seed (localhost only)
setup-simple: check-ports _preflight
    @echo ""
    @echo -e "{{green}}========================================{{nc}}"
    @echo -e "{{green}}✓ Setup complete!{{nc}}"
    @echo -e "{{green}}========================================{{nc}}"
    @echo ""
    @echo -e "{{cyan}}Next steps:{{nc}}"
    @echo ""
    @echo -e "  Option A — Simple (localhost only)"
    @echo -e "    {{green}}just start-simple{{nc}}   Start on localhost:5173 & :3001"
    @echo ""
    @echo -e "  Option B — Full (HTTPS + mobile)"
    @echo -e "    {{green}}just setup{{nc}}         One-time HTTPS & cert setup"
    @echo -e "    {{green}}just start{{nc}}         Start with HTTPS on :8443"
    @echo ""
    @echo -e "  Database:"
    @echo -e "    {{green}}just db-studio{{nc}}      Open Prisma Studio (DB GUI)"
    @echo -e "    {{green}}just db-seed{{nc}}        (Re-)load dev users"
    @echo ""

# Full setup: HTTPS + local domain via Caddy + mkcert (macOS/Linux)
setup: setup-simple
    @echo -e "{{blue}}Setting up extended development environment...{{nc}}"
    @test -f scripts/setup-local-domain.sh || { echo -e "{{red}}✗ scripts/setup-local-domain.sh not found{{nc}}"; exit 1; }
    @bash scripts/setup-local-domain.sh
    @echo ""
    @echo -e "{{green}}✓ Full setup complete!{{nc}}"
    @echo -e "{{yellow}}Next: just start{{nc}}"

# ─── Development ─────────────────────────────────────────────────────────────

[private]
_dev-stop:
    @pkill -f "{{project_dir}}/apps/web" 2>/dev/null || true
    @pkill -f "{{project_dir}}/apps/api" 2>/dev/null || true
    @pkill -f "prisma studio" 2>/dev/null || true

[private]
_check-docker:
    #!/usr/bin/env bash
    if ! docker info >/dev/null 2>&1; then
        echo -e "\033[0;31m✗ Docker daemon is not running\033[0m"
        echo -e "\033[1;33m  → Start Docker Desktop and wait ~15 seconds, then retry.\033[0m"
        echo -e "\033[0;36m      macOS:  open -a Docker\033[0m"
        echo -e "\033[0;36m      Linux:  sudo systemctl start docker\033[0m"
        exit 1
    fi

[private]
_preflight:
    #!/usr/bin/env bash
    set -euo pipefail

    # ── Helpers ──────────────────────────────────────────────────────────
    ask() {
        local msg="$1"
        if [ "${AUTO:-0}" = "1" ]; then
            echo -e "    \033[0;36m→ Auto-approved (AUTO=1)\033[0m"
            return 0
        fi
        read -r -p "$(echo -e "    \033[1;33m${msg} [Y/n] \033[0m")" ANSWER
        [[ "${ANSWER:-y}" =~ ^[Nn]$ ]] && return 1
        return 0
    }

    env_set() {
        local key="$1" value="$2"
        if grep -qE "^${key}=" .env; then
            sed -i.bak "s|^${key}=.*|${key}=\"${value}\"|" .env && rm -f .env.bak
        else
            echo "${key}=\"${value}\"" >> .env
        fi
    }

    ok()   { echo -e "\033[0;32m  ✓ $1\033[0m"; }
    warn() { echo -e "\033[1;33m  ⚠ $1\033[0m"; }
    fail() { echo -e "\033[0;31m  ✗ $1\033[0m"; exit 1; }

    echo -e "\033[0;34m🔍 Pre-flight checks...\033[0m"

    # 1. .env ─────────────────────────────────────────────────────────────
    if [ ! -f .env ]; then
        [ -f .env.example ] || fail ".env not found (no .env.example either)"
        warn ".env not found — creating from .env.example"
        cp .env.example .env
        ok ".env created"
    elif grep -qE '^JWT_SECRET=' .env && ! grep -qE '^JWT_PRIVATE_KEY=' .env; then
        warn ".env uses deprecated JWT_SECRET — Qoomb now requires RS256"
        if ask "Recreate from .env.example? (backup saved as .env.backup)"; then
            cp .env .env.backup
            cp .env.example .env
            ok ".env recreated (backup: .env.backup)"
            warn "Review DATABASE_URL, REDIS_URL etc. in .env!"
        else
            fail "Cannot continue with outdated .env"
        fi
    else
        ok ".env"
    fi

    # 2. JWT RS256 key pair ───────────────────────────────────────────────
    JWT_PRIV=$(grep -E '^JWT_PRIVATE_KEY=' .env | sed 's/^JWT_PRIVATE_KEY=//' | sed 's/^"//;s/"$//' || true)
    JWT_PUB=$(grep -E '^JWT_PUBLIC_KEY=' .env | sed 's/^JWT_PUBLIC_KEY=//' | sed 's/^"//;s/"$//' || true)
    if [ -z "$JWT_PRIV" ] || [ -z "$JWT_PUB" ]; then
        warn "JWT_PRIVATE_KEY / JWT_PUBLIC_KEY not set"
        if ask "Generate RS256 key pair now?"; then
            command -v openssl >/dev/null 2>&1 || fail "openssl not found"
            JWT_TMP=$(mktemp -d)
            openssl genpkey -algorithm RSA -out "$JWT_TMP/private.pem" -pkeyopt rsa_keygen_bits:2048 2>/dev/null
            openssl rsa -pubout -in "$JWT_TMP/private.pem" -out "$JWT_TMP/public.pem" 2>/dev/null
            env_set JWT_PRIVATE_KEY "$(base64 < "$JWT_TMP/private.pem" | tr -d '\n')"
            env_set JWT_PUBLIC_KEY  "$(base64 < "$JWT_TMP/public.pem" | tr -d '\n')"
            rm -rf "$JWT_TMP"
            ok "RS256 key pair generated and written to .env"
        else
            fail "App cannot start without JWT keys"
        fi
    else
        ok "JWT keys"
    fi

    # 3. Encryption key (must be base64-encoded 32 bytes = 44 chars) ────
    ENC_KEY=$(grep -E '^ENCRYPTION_KEY=' .env | sed 's/^ENCRYPTION_KEY=//' | sed 's/^"//;s/"$//' || true)
    if [ -z "$ENC_KEY" ] || [ "${#ENC_KEY}" -ne 44 ] || ! printf '%s' "$ENC_KEY" | grep -qE '^[A-Za-z0-9+/]+=*$'; then
        warn "ENCRYPTION_KEY missing or invalid — generating..."
        command -v openssl >/dev/null 2>&1 || fail "openssl not found"
        env_set ENCRYPTION_KEY "$(openssl rand -base64 32)"
        ok "ENCRYPTION_KEY generated and written to .env"
    else
        ok "ENCRYPTION_KEY"
    fi

    # 4. Dependencies ─────────────────────────────────────────────────────
    if [ ! -d node_modules ] || { [ -f pnpm-lock.yaml ] && [ pnpm-lock.yaml -nt node_modules ]; }; then
        warn "Installing dependencies..."
        pnpm install
        ok "Dependencies"
    else
        ok "Dependencies"
    fi

    # 5. Docker ───────────────────────────────────────────────────────────
    if ! docker info >/dev/null 2>&1; then
        fail "Docker is not running (macOS: open -a Docker | Linux: sudo systemctl start docker)"
    fi
    if ! (docker ps --filter "name=qoomb-postgres" --filter "status=running" -q | grep -q . && \
          docker ps --filter "name=qoomb-redis"    --filter "status=running" -q | grep -q .); then
        warn "Starting Docker services..."
        docker-compose up -d
        sleep 3
    fi
    ok "Docker services"

    # 6. Prisma client ────────────────────────────────────────────────────
    PRISMA_GENERATED=$(echo node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client)
    if [ ! -f "$PRISMA_GENERATED/index.js" ] || \
       ! diff -q apps/api/prisma/schema.prisma "$PRISMA_GENERATED/schema.prisma" >/dev/null 2>&1; then
        warn "Generating Prisma client..."
        pnpm --filter @qoomb/api db:generate
    fi
    ok "Prisma client"

    # 7. Database migrations ──────────────────────────────────────────────
    MIGRATION_TABLE=$(docker exec qoomb-postgres psql -U qoomb -d qoomb -tAc \
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations')" \
        2>/dev/null || echo "f")
    MIGRATION_TABLE=$(echo "$MIGRATION_TABLE" | tr -d '[:space:]')
    if [ "$MIGRATION_TABLE" != "t" ]; then
        warn "Running database migrations..."
        pnpm --filter @qoomb/api db:migrate
        ok "Migrations applied"
    else
        APPLIED=$(docker exec qoomb-postgres psql -U qoomb -d qoomb -tAc \
            "SELECT COUNT(*) FROM public._prisma_migrations" 2>/dev/null || echo "0")
        APPLIED=$(echo "$APPLIED" | tr -d '[:space:]')
        AVAILABLE=$(ls -d apps/api/prisma/migrations/2* 2>/dev/null | wc -l | tr -d ' ')
        if [ "$APPLIED" -lt "$AVAILABLE" ] 2>/dev/null; then
            warn "$((AVAILABLE - APPLIED)) pending migration(s)..."
            pnpm --filter @qoomb/api db:migrate
            ok "Migrations applied"
        else
            ok "Database ($APPLIED migration(s))"
        fi
    fi

    # 8. Dev seed data (optional) ─────────────────────────────────────────
    SEED_EXISTS=$(docker exec qoomb-postgres psql -U qoomb -d qoomb -tAc \
        "SELECT EXISTS(SELECT 1 FROM public.hives WHERE id='10000000-0000-0000-0000-000000000001')" \
        2>/dev/null || echo "f")
    SEED_EXISTS=$(echo "$SEED_EXISTS" | tr -d '[:space:]')
    if [ "$SEED_EXISTS" = "t" ]; then
        ok "Seed data (Doe Family)"
    elif [ "${SEED:-0}" = "1" ]; then
        just db-seed
        ok "Seed data installed"
    elif [ "${AUTO:-0}" != "1" ]; then
        warn "No seed data"
        if ask "Install dev seed? (john@doe.dev, anna@doe.dev, tim@doe.dev)"; then
            just db-seed
            ok "Seed data installed"
        fi
    else
        warn "No seed data — skipped (use SEED=1 to auto-install)"
    fi

    echo ""

# Start development servers on localhost (no HTTPS)
start-simple: _dev-stop _preflight
    #!/usr/bin/env bash
    set -euo pipefail
    echo ""
    echo -e "\033[0;32m========================================\033[0m"
    echo -e "\033[0;32m  🚀 Development servers starting...\033[0m"
    echo -e "\033[0;32m========================================\033[0m"
    echo ""
    echo -e "\033[1;33mAccess:\033[0m"
    echo -e "  💻 Desktop:      \033[0;32mhttp://localhost:5173\033[0m"
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
    if [ -n "$LOCAL_IP" ]; then echo -e "  📱 Mobile:       \033[0;32mhttp://$LOCAL_IP:5173\033[0m (no HTTPS — limited PWA)"; fi
    echo -e "  🗄️  DB Studio:    \033[0;32mhttp://localhost:5555\033[0m (starting in background)"
    echo ""
    (sleep 4 && pnpm --filter @qoomb/api db:studio) >/dev/null 2>&1 &
    STUDIO_PID=$!
    trap "kill $STUDIO_PID 2>/dev/null || true" EXIT INT TERM
    (sleep 5 && (open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null || true)) &
    pnpm dev

# Start with HTTPS + local domain (runs setup interactively if needed)
start: _dev-stop _preflight
    #!/usr/bin/env bash
    set -euo pipefail

    # Check HTTPS setup (Caddy + SSL certs)
    HTTPS_READY=1
    if ! command -v caddy >/dev/null 2>&1; then
        HTTPS_READY=0
        echo -e "\033[1;33m  ⚠ Caddy not installed\033[0m"
    fi
    if ! ls certs/qoomb.localhost+*.pem >/dev/null 2>&1; then
        HTTPS_READY=0
        echo -e "\033[1;33m  ⚠ SSL certificates not found\033[0m"
    fi

    if [ "$HTTPS_READY" -eq 0 ]; then
        echo ""
        if [ "${AUTO:-0}" = "1" ]; then
            echo -e "\033[0;36m  → Auto-approved (AUTO=1)\033[0m"
            bash scripts/setup-local-domain.sh
        else
            read -r -p "$(echo -e '\033[1;33mHTTPS setup not complete. Run setup now? [Y/n] \033[0m')" ANSWER
            if [[ "${ANSWER:-y}" =~ ^[Nn]$ ]]; then
                echo -e "\033[0;36m  → Use 'just start-simple' for localhost-only mode\033[0m"
                exit 0
            fi
            bash scripts/setup-local-domain.sh
        fi
        echo ""
    else
        echo -e "\033[0;32m  ✓ HTTPS (Caddy + certificates)\033[0m"
    fi

    echo -e "\033[0;34mStarting Caddy...\033[0m"
    caddy stop 2>/dev/null || true
    caddy start --config Caddyfile.dev
    sleep 2
    echo -e "\033[0;32m✓ Caddy started (port 8443)\033[0m"
    echo ""
    echo -e "\033[0;32m========================================\033[0m"
    echo -e "\033[0;32m  🚀 qoomb.localhost is ready!\033[0m"
    echo -e "\033[0;32m========================================\033[0m"
    echo ""
    echo -e "  💻 Desktop:      \033[0;32mhttps://qoomb.localhost:8443\033[0m"
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
    if [ -n "$LOCAL_IP" ]; then
        echo -e "  📱 Mobile:       \033[0;32mhttps://$LOCAL_IP:8443\033[0m (same WiFi)"
    fi
    echo -e "  🗄️  DB Studio:    \033[0;32mhttp://localhost:5555\033[0m (starting in background)"
    echo ""
    (sleep 4 && pnpm --filter @qoomb/api db:studio) >/dev/null 2>&1 &
    STUDIO_PID=$!
    trap "kill $STUDIO_PID 2>/dev/null || true" EXIT INT TERM
    (sleep 5 && (open https://qoomb.localhost:8443 2>/dev/null || xdg-open https://qoomb.localhost:8443 2>/dev/null || true)) &
    pnpm dev

# Stop Caddy proxy
stop:
    @caddy stop 2>/dev/null || echo -e "{{yellow}}Caddy was not running{{nc}}"
    @echo -e "{{green}}✓ Extended dev stopped{{nc}}"

# Start only the API server
dev-api:
    pnpm --filter @qoomb/api dev

# Start only the web frontend
dev-web:
    pnpm --filter @qoomb/web dev

# Build all packages for production
build:
    @echo -e "{{blue}}Building...{{nc}}"
    pnpm build
    @echo -e "{{green}}✓ Build complete{{nc}}"

# ─── Docker ──────────────────────────────────────────────────────────────────

# Start PostgreSQL and Redis containers
docker-up: _check-docker
    #!/usr/bin/env bash
    set -euo pipefail
    if docker ps --filter "name=qoomb-postgres" --filter "status=running" -q | grep -q . && \
       docker ps --filter "name=qoomb-redis"    --filter "status=running" -q | grep -q .; then
        echo -e "\033[0;32m✓ Docker services already running\033[0m"
    else
        echo -e "\033[0;34mStarting Docker services...\033[0m"
        docker-compose up -d
        sleep 3
        echo -e "\033[0;32m✓ Docker services started\033[0m"
    fi

# Stop PostgreSQL and Redis containers
docker-down: _check-docker
    @echo -e "{{blue}}Stopping Docker services...{{nc}}"
    docker-compose down
    @echo -e "{{green}}✓ Docker services stopped{{nc}}"

# Restart Docker services
docker-restart: docker-down docker-up

# Stream Docker logs
docker-logs: _check-docker
    docker-compose logs -f

# ⚠️ DESTRUCTIVE: Stop containers and remove all volumes (deletes all data)
docker-clean: _check-docker
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "${AUTO:-0}" != "1" ]; then
        read -r -p "$(echo -e '\033[0;31m⚠️  This permanently deletes all PostgreSQL data and Redis volumes. Continue? [y/N] \033[0m')" ANSWER
        if [[ ! "${ANSWER:-n}" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 0
        fi
    fi
    docker-compose down -v
    echo -e "\033[0;32m✓ Docker services and volumes removed\033[0m"

# ─── Database ────────────────────────────────────────────────────────────────

# Generate Prisma client from schema
db-generate:
    @echo -e "{{blue}}Generating Prisma client...{{nc}}"
    pnpm --filter @qoomb/api db:generate
    @echo -e "{{green}}✓ Prisma client generated{{nc}}"

# Run database migrations
db-migrate:
    @echo -e "{{blue}}Running database migrations...{{nc}}"
    pnpm --filter @qoomb/api db:migrate
    @echo -e "{{green}}✓ Migrations complete{{nc}}"

# Push schema changes without migration files (dev only)
db-push:
    @echo -e "{{blue}}Pushing schema to database...{{nc}}"
    pnpm --filter @qoomb/api db:push
    @echo -e "{{green}}✓ Schema pushed{{nc}}"

# Load dev seed data (Doe Family — john@doe.dev / anna@doe.dev / tim@doe.dev — password: Dev1234!)
db-seed:
    @echo -e "{{blue}}Seeding database...{{nc}}"
    pnpm --filter @qoomb/api db:seed
    @echo -e "{{green}}✓ Seed complete{{nc}}"

# Open Prisma Studio (visual DB GUI)
db-studio:
    pnpm --filter @qoomb/api db:studio

# Open a PostgreSQL shell
db-shell: _check-docker
    docker exec -it qoomb-postgres psql -U qoomb -d qoomb

# Open a Redis CLI
redis-cli: _check-docker
    docker exec -it qoomb-redis redis-cli

# ⚠️ DESTRUCTIVE: Wipe database, re-run migrations, optionally seed
db-reset: _check-docker
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "${AUTO:-0}" != "1" ]; then
        read -r -p "$(echo -e '\033[0;31m⚠️  This permanently deletes all data and rebuilds the schema. Continue? [y/N] \033[0m')" ANSWER
        if [[ ! "${ANSWER:-n}" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 0
        fi
    fi
    docker-compose down -v
    docker-compose up -d
    sleep 3
    just db-generate
    just db-migrate
    echo ""
    if [ "${SEED:-0}" = "1" ] || [ "${AUTO:-0}" = "1" ]; then
        just db-seed
    else
        read -r -p "Install dev seed data? (john@doe.dev, anna@doe.dev, tim@doe.dev) [y/N] " ANSWER
        if [[ "${ANSWER:-n}" =~ ^[Yy]$ ]]; then
            just db-seed
        fi
    fi
    echo -e "\033[0;32m✓ Database reset complete\033[0m"

# ─── Code Quality ─────────────────────────────────────────────────────────────

# Run ESLint on all packages
lint:
    @echo -e "{{blue}}Running linters...{{nc}}"
    pnpm run lint
    @echo -e "{{green}}✓ Linting complete{{nc}}"

# Run ESLint with auto-fix
lint-fix:
    @echo -e "{{blue}}Running linters (auto-fix)...{{nc}}"
    pnpm run lint:fix
    @echo -e "{{green}}✓ Linting complete{{nc}}"

# Format all code with Prettier
format:
    @echo -e "{{blue}}Formatting code...{{nc}}"
    pnpm run format
    @echo -e "{{green}}✓ Code formatted{{nc}}"

# Check formatting without making changes
format-check:
    @echo -e "{{blue}}Checking formatting...{{nc}}"
    pnpm run format:check
    @echo -e "{{green}}✓ Formatting OK{{nc}}"

# Run TypeScript type checking
type-check:
    @echo -e "{{blue}}Type checking...{{nc}}"
    pnpm run type-check
    @echo -e "{{green}}✓ No type errors{{nc}}"

# Run all tests
test:
    @echo -e "{{blue}}Running tests...{{nc}}"
    pnpm test
    @echo -e "{{green}}✓ Tests complete{{nc}}"

# Run all quality checks (lint + format-check + type-check)
quality: lint format-check type-check
    @echo -e "{{green}}✓ All quality checks passed{{nc}}"

# Run all quality checks with auto-fix
quality-fix: lint-fix format type-check
    @echo -e "{{green}}✓ All quality checks complete{{nc}}"

# ─── Utilities ────────────────────────────────────────────────────────────────

# Check status of all services
status:
    @echo -e "{{blue}}Service Status:{{nc}}"
    @echo ""
    @echo -e "{{yellow}}Docker:{{nc}}"
    @docker-compose ps 2>/dev/null || echo -e "  {{red}}Not running{{nc}}"
    @echo ""
    @echo -e "{{yellow}}Backend health:{{nc}}"
    @curl -s http://localhost:3001/trpc/health 2>/dev/null | jq '.' || echo -e "  {{red}}Not running{{nc}}"

# Generate new secrets for .env
generate-secrets:
    @echo -e "{{blue}}Generating secrets...{{nc}}"
    @echo ""
    @echo -e "{{yellow}}JWT RS256 Key Pair:{{nc}}"
    @tmpdir=$(mktemp -d) && \
      openssl genpkey -algorithm RSA -out "$tmpdir/jwt-private.pem" -pkeyopt rsa_keygen_bits:2048 2>/dev/null && \
      openssl rsa -pubout -in "$tmpdir/jwt-private.pem" -out "$tmpdir/jwt-public.pem" 2>/dev/null && \
      echo "JWT_PRIVATE_KEY=$(base64 -w0 < "$tmpdir/jwt-private.pem")" && \
      echo "" && \
      echo "JWT_PUBLIC_KEY=$(base64 -w0 < "$tmpdir/jwt-public.pem")" && \
      rm -rf "$tmpdir"
    @echo ""
    @echo -e "{{yellow}}ENCRYPTION_KEY:{{nc}}"
    @openssl rand -base64 32
    @echo ""
    @echo -e "{{yellow}}SESSION_SECRET:{{nc}}"
    @openssl rand -base64 32
    @echo ""
    @echo -e "{{blue}}Copy these values to your .env file{{nc}}"

# Verify environment configuration
env-check:
    @echo -e "{{blue}}Checking .env...{{nc}}"
    @test -f .env            || { echo -e "{{red}}✗ .env not found{{nc}}"; exit 1; }
    @grep -q "DATABASE_URL"   .env || { echo -e "{{red}}✗ DATABASE_URL not set{{nc}}"; exit 1; }
    @grep -q "REDIS_URL"      .env || { echo -e "{{red}}✗ REDIS_URL not set{{nc}}"; exit 1; }
    @grep -q "JWT_PRIVATE_KEY" .env || { echo -e "{{red}}✗ JWT_PRIVATE_KEY not set{{nc}}"; exit 1; }
    @grep -q "JWT_PUBLIC_KEY"  .env || { echo -e "{{red}}✗ JWT_PUBLIC_KEY not set{{nc}}"; exit 1; }
    @grep -q "ENCRYPTION_KEY" .env || { echo -e "{{red}}✗ ENCRYPTION_KEY not set{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ Environment configuration is valid{{nc}}"

# Show project information
info:
    @echo -e "{{green}}   __ _  ___   ___  _ __ ___  | |__  {{nc}}"
    @echo -e "{{green}}  / _\` |/ _ \\ / _ \\| '_ \` _ \\ | '_ \\ {{nc}}"
    @echo -e "{{green}} | (_| | (_) | (_) | | | | | || |_) |{{nc}}"
    @echo -e "{{green}}  \\__, |\\___/ \\___/|_| |_| |_||_.__/ {{nc}}"
    @echo -e "{{green}}     |_|                              {{nc}}"
    @echo ""
    @echo -e "{{blue}}Project:{{nc}}"
    @echo "  Name:     qoomb v0.1.0"
    @echo "  Node:     $(node --version 2>/dev/null || echo 'not installed')"
    @echo "  pnpm:     $(pnpm --version 2>/dev/null || echo 'not installed')"
    @echo "  Docker:   $(docker --version 2>/dev/null | cut -d' ' -f3 || echo 'not installed')"
    @echo "  just:     $(just --version 2>/dev/null || echo 'not installed')"
    @echo ""
    @echo -e "{{blue}}Services:{{nc}}"
    @docker-compose ps 2>/dev/null || echo -e "  {{yellow}}Docker services not running{{nc}}"

# Clean build artifacts and node_modules
clean: _dev-stop
    @echo -e "{{blue}}Cleaning project...{{nc}}"
    @if [ -d node_modules ]; then pnpm clean 2>/dev/null || true; fi
    @rm -rf node_modules apps/*/node_modules packages/*/node_modules 2>/dev/null || true
    @echo -e "{{green}}✓ Cleanup complete{{nc}}"

# ⚠️ DESTRUCTIVE: Clean everything (node_modules + all data)
clean-all: _check-docker
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "${AUTO:-0}" != "1" ]; then
        read -r -p "$(echo -e '\033[0;31m⚠️  This deletes node_modules AND all Docker data. Continue? [y/N] \033[0m')" ANSWER
        if [[ ! "${ANSWER:-n}" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 0
        fi
    fi
    just clean
    docker-compose down -v
    echo -e "\033[0;32m✓ Full cleanup complete\033[0m"

# ─── Aliases ─────────────────────────────────────────────────────────────────

# Alias: docker-restart
restart: docker-restart

# Alias: docker-up
up: docker-up

# Alias: docker-down
down: docker-down

# Alias: status
ps: status

# Alias: setup
first-run: setup

# ⚠️ DESTRUCTIVE: Complete fresh start (wipe everything + setup from scratch)
fresh: _check-docker
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "${AUTO:-0}" != "1" ]; then
        read -r -p "$(echo -e '\033[0;31m⚠️  This wipes EVERYTHING and starts fresh. Continue? [y/N] \033[0m')" ANSWER
        if [[ ! "${ANSWER:-n}" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 0
        fi
    fi
    just clean
    docker-compose down -v
    just setup
