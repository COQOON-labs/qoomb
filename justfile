# Qoomb — development task runner
# Install: https://github.com/casey/just
# Usage:   just <recipe>   |   just (shows list)

set shell := ["bash", "-euo", "pipefail", "-c"]

project_dir := justfile_directory()

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

# Check if required dependencies are installed
check-deps:
    @echo -e "{{blue}}Checking dependencies...{{nc}}"
    @command -v docker >/dev/null 2>&1 || { echo -e "{{red}}✗ Docker not installed{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ Docker:{{nc}}   $(docker --version | cut -d' ' -f3)"
    @command -v pnpm >/dev/null 2>&1 || { echo -e "{{red}}✗ pnpm not installed{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ pnpm:{{nc}}     $(pnpm --version)"
    @command -v node >/dev/null 2>&1 || { echo -e "{{red}}✗ Node.js not installed{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ Node.js:{{nc}}  $(node --version)"
    @test -f .env || { echo -e "{{red}}✗ .env file not found — copy .env.example to .env{{nc}}"; exit 1; }
    @echo -e "{{green}}✓ .env file exists{{nc}}"

# Check if required ports are available
check-ports:
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

# Standard setup: deps + Docker + DB + optional seed
setup: check-deps check-ports install docker-up db-generate db-migrate
    #!/usr/bin/env bash
    set -euo pipefail
    echo ""
    echo -e "\033[0;32m========================================\033[0m"
    echo -e "\033[0;32m✓ Setup complete!\033[0m"
    echo -e "\033[0;32m========================================\033[0m"
    echo ""

    read -r -p "Install dev seed data? (john@doe.dev, anna@doe.dev, tim@doe.dev) [y/N] " SEED
    if [[ "${SEED:-n}" =~ ^[Yy]$ ]]; then
        just db-seed
    fi

    echo ""
    echo -e "\033[0;36mNext steps:\033[0m"
    echo ""
    echo -e "  Option A — Basic (localhost only)"
    echo -e "    \033[0;32mjust dev\033[0m           Start on localhost:5173 & :3001"
    echo ""
    echo -e "  Option B — Extended (HTTPS + mobile)"
    echo -e "    \033[0;32mjust setup-extended\033[0m One-time HTTPS & cert setup"
    echo -e "    \033[0;32mjust dev-extended\033[0m   Start with HTTPS on :8443"
    echo ""
    echo -e "  Database:"
    echo -e "    \033[0;32mjust db-studio\033[0m      Open Prisma Studio (DB GUI)"
    echo -e "    \033[0;32mjust db-seed\033[0m        (Re-)load dev users"
    echo ""

# Extended setup: HTTPS + local domain via Caddy + mkcert (macOS/Linux)
setup-extended:
    @echo -e "{{blue}}Setting up extended development environment...{{nc}}"
    @test -f scripts/setup-local-domain.sh || { echo -e "{{red}}✗ scripts/setup-local-domain.sh not found{{nc}}"; exit 1; }
    @bash scripts/setup-local-domain.sh
    @echo ""
    @echo -e "{{green}}✓ Extended setup complete!{{nc}}"
    @echo -e "{{yellow}}Next: just dev-extended{{nc}}"

# ─── Development ─────────────────────────────────────────────────────────────

[private]
_dev-stop:
    @pkill -f "{{project_dir}}/apps/web" 2>/dev/null || true
    @pkill -f "{{project_dir}}/apps/api" 2>/dev/null || true
    @pkill -f "prisma studio" 2>/dev/null || true

# Start development servers on localhost
dev: _dev-stop docker-up
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

# Start with HTTPS + local domain (requires just setup-extended first)
dev-extended: _dev-stop
    #!/usr/bin/env bash
    set -euo pipefail
    command -v caddy >/dev/null || { echo -e "\033[0;31m✗ Caddy not installed — run: just setup-extended\033[0m"; exit 1; }
    ls certs/qoomb.localhost+*.pem >/dev/null 2>&1 || { echo -e "\033[0;31m✗ SSL certs missing — run: just setup-extended\033[0m"; exit 1; }
    just docker-up
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

# Stop extended dev (Caddy proxy)
stop-extended:
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
docker-up:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -f .env ]; then
        echo -e "\033[1;33mCreating .env from .env.example...\033[0m"
        cp .env.example .env
    fi
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
docker-down:
    @echo -e "{{blue}}Stopping Docker services...{{nc}}"
    docker-compose down
    @echo -e "{{green}}✓ Docker services stopped{{nc}}"

# Restart Docker services
docker-restart: docker-down docker-up

# Stream Docker logs
docker-logs:
    docker-compose logs -f

# ⚠️ DESTRUCTIVE: Stop containers and remove all volumes (deletes all data)
[confirm("⚠️  This permanently deletes all PostgreSQL data and Redis volumes. Continue? [y/N]")]
docker-clean:
    docker-compose down -v
    @echo -e "{{green}}✓ Docker services and volumes removed{{nc}}"

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
db-shell:
    docker exec -it qoomb-postgres psql -U qoomb -d qoomb

# Open a Redis CLI
redis-cli:
    docker exec -it qoomb-redis redis-cli

# ⚠️ DESTRUCTIVE: Wipe database, re-run migrations, optionally seed
[confirm("⚠️  This permanently deletes all data and rebuilds the schema. Continue? [y/N]")]
db-reset:
    #!/usr/bin/env bash
    set -euo pipefail
    docker-compose down -v
    docker-compose up -d
    sleep 3
    just db-generate
    just db-migrate
    echo ""
    read -r -p "Install dev seed data? (john@doe.dev, anna@doe.dev, tim@doe.dev) [y/N] " SEED
    if [[ "${SEED:-n}" =~ ^[Yy]$ ]]; then
        just db-seed
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
    @echo -e "{{yellow}}JWT_SECRET:{{nc}}"
    @openssl rand -base64 32
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
    @grep -q "JWT_SECRET"     .env || { echo -e "{{red}}✗ JWT_SECRET not set{{nc}}"; exit 1; }
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
[confirm("⚠️  This deletes node_modules AND all Docker data. Continue? [y/N]")]
clean-all:
    #!/usr/bin/env bash
    set -euo pipefail
    just clean
    docker-compose down -v
    echo -e "\033[0;32m✓ Full cleanup complete\033[0m"

# ─── Aliases ─────────────────────────────────────────────────────────────────

# Alias: docker-up
start: docker-up

# Alias: docker-down
stop: docker-down

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
[confirm("⚠️  This wipes EVERYTHING and starts fresh. Continue? [y/N]")]
fresh:
    #!/usr/bin/env bash
    set -euo pipefail
    just clean
    docker-compose down -v
    just setup
