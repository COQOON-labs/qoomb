.PHONY: help install setup dev build clean docker-up docker-down docker-logs docker-clean _docker-volumes-remove db-migrate db-generate db-studio db-reset test lint format check-ports check-deps db-shell redis-cli type-check generate-secrets start stop restart clean-all fresh

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo ""
	@echo "$(GREEN)   __ _  ___   ___  _ __ ___  | |__  $(NC)"
	@echo "$(GREEN)  / _\` |/ _ \ / _ \| '_ \` _ \ | '_ \ $(NC)"
	@echo "$(GREEN) | (_| | (_) | (_) | | | | | || |_) |$(NC)"
	@echo "$(GREEN)  \__, |\___/ \___/|_| |_| |_||_.__/ $(NC)"
	@echo "$(GREEN)     |_|                             $(NC)"
	@echo ""
	@echo "$(BLUE)Available Commands:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# Setup Commands
# =============================================================================

check-deps: ## Check if required dependencies are installed
	@echo "$(BLUE)Checking dependencies...$(NC)"
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)✗ Docker not installed$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Docker found:$(NC) $$(docker --version | cut -d' ' -f3)"
	@command -v pnpm >/dev/null 2>&1 || { echo "$(RED)✗ pnpm not installed$(NC)"; exit 1; }
	@echo "$(GREEN)✓ pnpm found:$(NC) $$(pnpm --version)"
	@command -v node >/dev/null 2>&1 || { echo "$(RED)✗ Node.js not installed$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Node.js found:$(NC) $$(node --version)"
	@test -f .env || { echo "$(RED)✗ .env file not found$(NC)"; exit 1; }
	@echo "$(GREEN)✓ .env file exists$(NC)"
	@echo "$(GREEN)✓ All dependencies satisfied$(NC)"

check-ports: ## Check if required ports are available
	@echo "$(BLUE)Checking ports...$(NC)"
	@HAS_PORT_CONFLICT=0; \
	\
	if docker ps --filter "name=qoomb-postgres" --filter "status=running" -q 2>/dev/null | grep -q .; then \
		echo "$(GREEN)✓ Port 5432 (PostgreSQL) - qoomb container already running$(NC)"; \
	elif lsof -Pi :5432 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":5432.*LISTEN"; then \
		echo "$(RED)✗ Port 5432 (PostgreSQL) is in use by another process$(NC)"; \
		HAS_PORT_CONFLICT=1; \
	else \
		echo "$(GREEN)✓ Port 5432 (PostgreSQL) is available$(NC)"; \
	fi; \
	\
	if docker ps --filter "name=qoomb-redis" --filter "status=running" -q 2>/dev/null | grep -q .; then \
		echo "$(GREEN)✓ Port 6379 (Redis) - qoomb container already running$(NC)"; \
	elif lsof -Pi :6379 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":6379.*LISTEN"; then \
		echo "$(RED)✗ Port 6379 (Redis) is in use by another process$(NC)"; \
		HAS_PORT_CONFLICT=1; \
	else \
		echo "$(GREEN)✓ Port 6379 (Redis) is available$(NC)"; \
	fi; \
	\
	if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":3001.*LISTEN"; then \
		echo "$(YELLOW)⚠ Port 3001 (API) is in use$(NC)"; \
	else \
		echo "$(GREEN)✓ Port 3001 (API) is available$(NC)"; \
	fi; \
	\
	if [ $$HAS_PORT_CONFLICT -eq 1 ]; then \
		echo ""; \
		echo "$(RED)╔════════════════════════════════════════════════════════════╗$(NC)"; \
		echo "$(RED)║  ⚠️  PORT CONFLICT DETECTED  ⚠️                             ║$(NC)"; \
		echo "$(RED)║                                                            ║$(NC)"; \
		echo "$(RED)║  Required ports are in use by other processes.            ║$(NC)"; \
		echo "$(RED)║                                                            ║$(NC)"; \
		echo "$(RED)║  Solutions:                                                ║$(NC)"; \
		echo "$(RED)║  1. Stop native PostgreSQL:                               ║$(NC)"; \
		echo "$(RED)║     brew services stop postgresql@17                       ║$(NC)"; \
		echo "$(RED)║                                                            ║$(NC)"; \
		echo "$(RED)║  2. Or change Docker ports in docker-compose.yml:         ║$(NC)"; \
		echo "$(RED)║     5432:5432 → 5433:5432                                  ║$(NC)"; \
		echo "$(RED)║     (then update DATABASE_URL in .env to port 5433)       ║$(NC)"; \
		echo "$(RED)╚════════════════════════════════════════════════════════════╝$(NC)"; \
		echo ""; \
		exit 1; \
	fi

install: ## Install all dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	pnpm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

setup: check-deps check-ports install docker-up db-generate db-migrate ## Complete initial setup (deps + docker + db)
	@echo ""
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "$(GREEN)========================================$(NC)"
	@echo ""
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  $(GREEN)make dev$(NC)       - Start development server"
	@echo "  $(GREEN)make db-studio$(NC) - Open Prisma Studio (DB GUI)"
	@echo "  $(GREEN)make status$(NC)    - Check service status"
	@echo "  $(GREEN)make logs$(NC)      - View logs"
	@echo ""

# =============================================================================
# Development Commands
# =============================================================================

dev: ## Start all development servers (frontend + backend)
	@echo "$(BLUE)Starting development servers...$(NC)"
	pnpm dev

dev-api: ## Start only the backend API server
	@echo "$(BLUE)Starting API server...$(NC)"
	pnpm --filter @qoomb/api dev

dev-web: ## Start only the frontend web server
	@echo "$(BLUE)Starting web server...$(NC)"
	pnpm --filter @qoomb/web dev

build: ## Build all applications for production
	@echo "$(BLUE)Building applications...$(NC)"
	pnpm build
	@echo "$(GREEN)✓ Build complete$(NC)"

# =============================================================================
# Docker Commands
# =============================================================================

docker-up: ## Start PostgreSQL and Redis containers
	@echo "$(BLUE)Starting Docker services...$(NC)"
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)Creating .env from .env.example...$(NC)"; \
		cp .env.example .env; \
	fi
	@# Check if containers are already running
	@if docker ps --filter "name=qoomb-postgres" --filter "status=running" -q | grep -q . && \
	   docker ps --filter "name=qoomb-redis" --filter "status=running" -q | grep -q .; then \
		echo "$(GREEN)✓ Docker services already running$(NC)"; \
		docker-compose ps; \
	else \
		docker-compose up -d; \
		echo "$(YELLOW)Waiting for services to be healthy...$(NC)"; \
		sleep 3; \
		docker-compose ps; \
		echo "$(GREEN)✓ Docker services started$(NC)"; \
	fi

docker-down: ## Stop PostgreSQL and Redis containers
	@echo "$(BLUE)Stopping Docker services...$(NC)"
	docker-compose down
	@echo "$(GREEN)✓ Docker services stopped$(NC)"

docker-restart: docker-down docker-up ## Restart Docker services

docker-logs: ## Show logs from Docker services
	docker-compose logs -f

# Internal: Remove Docker volumes without confirmation (used by other commands)
_docker-volumes-remove:
	@docker-compose down -v

docker-clean: ## Stop containers and remove volumes (⚠️  DESTRUCTIVE: deletes all data!)
	@echo "$(RED)╔════════════════════════════════════════════╗$(NC)"
	@echo "$(RED)║  ⚠️  DESTRUCTIVE OPERATION  ⚠️              ║$(NC)"
	@echo "$(RED)║  This will permanently delete:            ║$(NC)"
	@echo "$(RED)║  • All PostgreSQL data and volumes        ║$(NC)"
	@echo "$(RED)║  • All Redis data                         ║$(NC)"
	@echo "$(RED)║  • All Docker containers                  ║$(NC)"
	@echo "$(RED)╚════════════════════════════════════════════╝$(NC)"
	@echo ""
	@read -p "Type 'yes' to confirm deletion: " -r; \
	echo; \
	if [[ $$REPLY == "yes" ]]; then \
		$(MAKE) _docker-volumes-remove; \
		echo "$(GREEN)✓ Docker services and volumes removed$(NC)"; \
	else \
		echo "$(YELLOW)✗ Cancelled (must type 'yes' to confirm)$(NC)"; \
	fi

# =============================================================================
# Database Commands
# =============================================================================

db-generate: ## Generate Prisma client from schema
	@echo "$(BLUE)Generating Prisma client...$(NC)"
	pnpm --filter @qoomb/api db:generate
	@echo "$(GREEN)✓ Prisma client generated$(NC)"

db-migrate: ## Run database migrations
	@echo "$(BLUE)Running database migrations...$(NC)"
	pnpm --filter @qoomb/api db:migrate
	@echo "$(GREEN)✓ Migrations complete$(NC)"

db-push: ## Push schema changes to database (no migration files)
	@echo "$(BLUE)Pushing schema to database...$(NC)"
	pnpm --filter @qoomb/api db:push
	@echo "$(GREEN)✓ Schema pushed$(NC)"

db-studio: ## Open Prisma Studio (database GUI)
	@echo "$(BLUE)Opening Prisma Studio...$(NC)"
	pnpm --filter @qoomb/api db:studio

db-shell: ## Open PostgreSQL shell
	@echo "$(BLUE)Opening PostgreSQL shell...$(NC)"
	@docker exec -it qoomb-postgres psql -U qoomb -d qoomb

redis-cli: ## Open Redis CLI
	@echo "$(BLUE)Opening Redis CLI...$(NC)"
	@docker exec -it qoomb-redis redis-cli

db-reset: ## Reset database (⚠️  DESTRUCTIVE: deletes all data & rebuilds schema!)
	@echo "$(RED)╔════════════════════════════════════════════╗$(NC)"
	@echo "$(RED)║  ⚠️  DESTRUCTIVE OPERATION  ⚠️              ║$(NC)"
	@echo "$(RED)║  This will permanently:                   ║$(NC)"
	@echo "$(RED)║  • Delete all database data               ║$(NC)"
	@echo "$(RED)║  • Delete all Redis cache                 ║$(NC)"
	@echo "$(RED)║  • Rebuild schema from migrations         ║$(NC)"
	@echo "$(RED)╚════════════════════════════════════════════╝$(NC)"
	@echo ""
	@read -p "Type 'yes' to confirm reset: " -r; \
	echo; \
	if [[ $$REPLY == "yes" ]]; then \
		$(MAKE) _docker-volumes-remove; \
		docker-compose up -d; \
		sleep 3; \
		$(MAKE) db-generate; \
		$(MAKE) db-migrate; \
		echo "$(GREEN)✓ Database reset complete$(NC)"; \
	else \
		echo "$(YELLOW)✗ Cancelled (must type 'yes' to confirm)$(NC)"; \
	fi

# =============================================================================
# Code Quality Commands
# =============================================================================

lint: ## Run ESLint on all packages
	@echo "$(BLUE)Running linters...$(NC)"
	pnpm run lint
	@echo "$(GREEN)✓ Linting complete$(NC)"

lint-fix: ## Run ESLint with auto-fix
	@echo "$(BLUE)Running linters with auto-fix...$(NC)"
	pnpm run lint:fix
	@echo "$(GREEN)✓ Linting complete$(NC)"

format: ## Format all code with Prettier
	@echo "$(BLUE)Formatting code...$(NC)"
	pnpm run format
	@echo "$(GREEN)✓ Code formatted$(NC)"

format-check: ## Check formatting without changes
	@echo "$(BLUE)Checking formatting...$(NC)"
	pnpm run format:check
	@echo "$(GREEN)✓ Formatting check complete$(NC)"

type-check: ## Run TypeScript type checking
	@echo "$(BLUE)Running type check...$(NC)"
	pnpm run type-check
	@echo "$(GREEN)✓ No type errors$(NC)"

test: ## Run all tests
	@echo "$(BLUE)Running tests...$(NC)"
	pnpm test
	@echo "$(GREEN)✓ Tests complete$(NC)"

quality: lint format-check type-check ## Run all quality checks
	@echo "$(GREEN)✓ All quality checks passed$(NC)"

quality-fix: lint-fix format type-check ## Run all quality checks with fixes
	@echo "$(GREEN)✓ All quality checks complete$(NC)"

# =============================================================================
# Cleanup Commands
# =============================================================================

clean: ## Clean build artifacts and dependencies
	@echo "$(BLUE)Cleaning project...$(NC)"
	@if [ -d "node_modules" ]; then \
		pnpm clean 2>/dev/null || echo "$(YELLOW)⚠ pnpm clean skipped (dependencies missing)$(NC)"; \
	fi
	@rm -rf node_modules apps/*/node_modules packages/*/node_modules 2>/dev/null || true
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: clean docker-clean ## ⚠️  DESTRUCTIVE: Clean everything (code + data!)

# =============================================================================
# Utility Commands
# =============================================================================

status: ## Check status of all services
	@echo "$(BLUE)Service Status:$(NC)"
	@echo ""
	@echo "$(YELLOW)Docker Services:$(NC)"
	@docker-compose ps || echo "  $(RED)Not running$(NC)"
	@echo ""
	@echo "$(YELLOW)Backend Health:$(NC)"
	@curl -s http://localhost:3001/trpc/health 2>/dev/null | jq '.' || echo "  $(RED)Not running$(NC)"
	@echo ""

logs: ## Show logs from all services
	@echo "$(BLUE)Showing logs (Ctrl+C to exit)...$(NC)"
	pnpm dev 2>&1 | grep -E "error|ERROR|warn|WARN|✓|✗|→"

# =============================================================================
# Utility Commands (Additional)
# =============================================================================

generate-secrets: ## Generate new secrets for .env
	@echo "$(BLUE)Generating new secrets...$(NC)"
	@echo ""
	@echo "$(YELLOW)JWT_SECRET:$(NC)"
	@openssl rand -base64 32
	@echo ""
	@echo "$(YELLOW)ENCRYPTION_KEY:$(NC)"
	@openssl rand -base64 32
	@echo ""
	@echo "$(YELLOW)SESSION_SECRET:$(NC)"
	@openssl rand -base64 32
	@echo ""
	@echo "$(BLUE)Copy these values to your .env file$(NC)"

env-check: ## Verify environment configuration
	@echo "$(BLUE)Checking environment configuration...$(NC)"
	@test -f .env || { echo "$(RED)✗ .env file not found$(NC)"; exit 1; }
	@grep -q "DATABASE_URL" .env || { echo "$(RED)✗ DATABASE_URL not set$(NC)"; exit 1; }
	@grep -q "REDIS_URL" .env || { echo "$(RED)✗ REDIS_URL not set$(NC)"; exit 1; }
	@grep -q "JWT_SECRET" .env || { echo "$(RED)✗ JWT_SECRET not set$(NC)"; exit 1; }
	@grep -q "ENCRYPTION_KEY" .env || { echo "$(RED)✗ ENCRYPTION_KEY not set$(NC)"; exit 1; }
	@echo "$(GREEN)✓ Environment configuration is valid$(NC)"

info: ## Show project information
	@echo ""
	@echo "$(GREEN)   __ _  ___   ___  _ __ ___  | |__  $(NC)"
	@echo "$(GREEN)  / _\` |/ _ \ / _ \| '_ \` _ \ | '_ \ $(NC)"
	@echo "$(GREEN) | (_| | (_) | (_) | | | | | || |_) |$(NC)"
	@echo "$(GREEN)  \__, |\___/ \___/|_| |_| |_||_.__/ $(NC)"
	@echo "$(GREEN)     |_|                             $(NC)"
	@echo ""
	@echo "$(BLUE)Project Information:$(NC)"
	@echo "  Name:         qoomb"
	@echo "  Version:      0.2.0"
	@echo "  Node:         $$(node --version 2>/dev/null || echo 'not installed')"
	@echo "  pnpm:         $$(pnpm --version 2>/dev/null || echo 'not installed')"
	@echo "  Docker:       $$(docker --version 2>/dev/null | cut -d' ' -f3 || echo 'not installed')"
	@echo ""
	@echo "$(BLUE)Services:$(NC)"
	@docker-compose ps 2>/dev/null || echo "  $(YELLOW)Docker services not running$(NC)"
	@echo ""

# =============================================================================
# Quick Start Commands & Aliases
# =============================================================================

first-run: ## First time setup (alias for 'make setup')
	@make setup

fresh: clean-all setup ## ⚠️  DESTRUCTIVE: Complete fresh start (deletes all data!)

start: docker-up ## Alias for docker-up

stop: docker-down ## Alias for docker-down

restart: docker-restart ## Alias for docker-restart

up: start ## Alias for start

down: stop ## Alias for stop

ps: status ## Alias for status
