.PHONY: help install setup dev build clean docker-up docker-down docker-logs db-migrate db-generate db-studio db-reset test lint format

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Qoomb - Available Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# Setup Commands
# =============================================================================

install: ## Install all dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	pnpm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

setup: install docker-up db-generate db-migrate ## Complete initial setup (install + docker + database)
	@echo ""
	@echo "$(GREEN)========================================$(NC)"
	@echo "$(GREEN)✓ Setup complete!$(NC)"
	@echo "$(GREEN)========================================$(NC)"
	@echo ""
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "  1. Review your .env file (copied from .env.example)"
	@echo "  2. Run 'make dev' to start development servers"
	@echo "  3. Visit http://localhost:5173 (frontend)"
	@echo "  4. Visit http://localhost:3001/trpc/health (backend)"
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
	docker-compose up -d
	@echo "$(YELLOW)Waiting for services to be healthy...$(NC)"
	@sleep 3
	@docker-compose ps
	@echo "$(GREEN)✓ Docker services started$(NC)"

docker-down: ## Stop PostgreSQL and Redis containers
	@echo "$(BLUE)Stopping Docker services...$(NC)"
	docker-compose down
	@echo "$(GREEN)✓ Docker services stopped$(NC)"

docker-restart: docker-down docker-up ## Restart Docker services

docker-logs: ## Show logs from Docker services
	docker-compose logs -f

docker-clean: ## Stop containers and remove volumes (WARNING: deletes data)
	@echo "$(RED)WARNING: This will delete all data in the database!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		echo "$(GREEN)✓ Docker services and volumes removed$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
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

db-reset: ## Reset database (WARNING: deletes all data)
	@echo "$(RED)WARNING: This will delete all data in the database!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		docker-compose up -d; \
		sleep 3; \
		pnpm --filter @qoomb/api db:generate; \
		pnpm --filter @qoomb/api db:migrate; \
		echo "$(GREEN)✓ Database reset complete$(NC)"; \
	else \
		echo "$(YELLOW)Cancelled$(NC)"; \
	fi

# =============================================================================
# Code Quality Commands
# =============================================================================

lint: ## Run linters on all code
	@echo "$(BLUE)Running linters...$(NC)"
	pnpm lint
	@echo "$(GREEN)✓ Linting complete$(NC)"

format: ## Format all code with Prettier
	@echo "$(BLUE)Formatting code...$(NC)"
	pnpm format
	@echo "$(GREEN)✓ Code formatted$(NC)"

test: ## Run all tests
	@echo "$(BLUE)Running tests...$(NC)"
	pnpm test
	@echo "$(GREEN)✓ Tests complete$(NC)"

# =============================================================================
# Cleanup Commands
# =============================================================================

clean: ## Clean build artifacts and dependencies
	@echo "$(BLUE)Cleaning project...$(NC)"
	pnpm clean
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf packages/*/node_modules
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: clean docker-clean ## Clean everything including Docker volumes

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
# Quick Start Commands
# =============================================================================

first-run: ## First time setup (alias for 'make setup')
	@make setup

fresh: clean-all setup ## Complete fresh start (clean + setup)
