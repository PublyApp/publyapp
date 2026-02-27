# Makefile for PublyApp - Complete Script Migration
.PHONY: help install dev build clean lint format test test-api docker db-migrate db-reset seed-bulk seed-bulk-reset

# Project paths
API_DIR = apps/api
FRONTEND_DIR = apps/front
SHARED_DIR = packages/shared
JS_CLIENT_DIR = packages/js-client
ROOT_DIR = .

# Cross-platform commands
ifeq ($(OS),Windows_NT)
    RM = rmdir /s /q
    MKDIR = mkdir
else
    RM = rm -rf
    MKDIR = mkdir -p
endif

# Default target
help:
	@echo "Available commands:"
	@echo ""
	@echo "=== INSTALLATION ==="
	@echo "  install     - Install all dependencies (pnpm + dotnet restore)"
	@echo "  update-deps - Update all dependencies"
	@echo ""
	@echo "=== DEVELOPMENT ==="
	@echo "  dev-api     - Start API development server (dotnet watch)"
	@echo "  dev-api-alt - Start API with Node.js script"
	@echo "  dev-front   - Start frontend development server"
	@echo "  dev-db      - Start database with Docker"
	@echo ""
	@echo "=== TESTING ==="
	@echo "  test-api    - Run API integration tests"
	@echo "  test-api-debug - Run API integration tests with verbose diagnostics"
	@echo ""
	@echo "=== BUILDING ==="
	@echo "  build-api   - Build API only (skip restore, faster)"
	@echo "  build-api-full - Build API with full NuGet restore"
	@echo "  build-front - Build frontend only"
	@echo "  build-deploy - Build for deployment"
	@echo ""
	@echo "=== RUNNING ==="
	@echo "  run-api     - Run API (skip restore; run 'make install' first)"
	@echo "  start-front - Start frontend production server"
	@echo ""
	@echo "=== TYPE CHECKING ==="
	@echo "  tsc-front   - Type check frontend (pnpm)"
	@echo ""
	@echo "=== CODE QUALITY ==="
	@echo "  lint        - Run linting (biome lint)"
	@echo "  lint-write  - Run linting with auto-fix"
	@echo "  format      - Format code (biome format)"
	@echo "  format-write - Format code with auto-fix"
	@echo "  check       - Run all checks (biome check)"
	@echo "  check-write - Run all checks with auto-fix"
	@echo "  knip       - Check for unused dependencies"
	@echo ""
	@echo "=== DATABASE ==="
	@echo "  db-migrate  - Run database migrations"
	@echo "  db-reset    - Reset database (drop + migrate)"
	@echo "  db-add      - Add new migration (usage: make db-add NAME=migration_name)"
	@echo "  db-remove   - Remove last migration"
	@echo "  seed-bulk       - Run bulk seed for testing (500 tenants, ~8K users, ~5K projects)"
	@echo "  seed-bulk-reset - Clear bulk seed data"
	@echo ""
	@echo "=== DOCKER ==="
	@echo "  docker-build - Build Docker images"
	@echo "  docker-push  - Push Docker images"
	@echo "  docker-up    - Start services with Docker Compose"
	@echo "  docker-down  - Stop Docker services"
	@echo ""
	@echo "=== CLIENT GENERATION ==="
	@echo "  generate-client - Build API + generate TS client (skip restore)"
	@echo "  update-client  - Update API client (kiota)"
	@echo "  client-info    - Show client info (kiota)"
	@echo ""
	@echo "=== CLEANING ==="
	@echo "  clean       - Clean all build artifacts"
	@echo "  clean-api   - Clean API build artifacts"
	@echo "  clean-front - Clean frontend build artifacts"

# =============================================================================
# INSTALLATION
# =============================================================================

install:
	@echo "Installing pnpm dependencies..."
	pnpm install
	@echo "Restoring .NET packages..."
	dotnet restore
	@echo "Running shared package postinstall..."
	cd $(SHARED_DIR) && pnpm run postinstall

update-deps:
	@echo "Updating all dependencies..."
	pnpm up -r

# =============================================================================
# DEVELOPMENT
# =============================================================================

dev-api:
	@echo "Starting API development server with hot reload..."
	cd $(API_DIR) && dotnet watch run --no-restore -property:OpenApiGenerateDocuments=false

dev-api-alt:
	@echo "Starting API with Node.js script..."
	node $(API_DIR)/run-dev.mjs

dev-front:
	@echo "Starting frontend development server..."
	cd $(FRONTEND_DIR) && pnpm dev

dev-services:
	@echo "Starting services with Docker..."
	docker-compose -f docker-compose.services.yml up -d

# =============================================================================
# BUILDING
# =============================================================================

build-api:
	@echo "Building API..."
	cd $(API_DIR) && dotnet build --no-restore

build-api-full:
	@echo "Building API (with restore)..."
	cd $(API_DIR) && dotnet build

publish-api:
	@echo "Publishing API..."
	cd $(API_DIR) && dotnet publish

build-front:
	@echo "Building frontend..."
	cd $(FRONTEND_DIR) && pnpm build

build-deploy:
	@echo "Building for deployment..."
	node ./scripts/deploy.mjs

# =============================================================================
# RUNNING
# =============================================================================

run-api:
	@echo "Running API..."
	cd $(API_DIR) && dotnet run --no-restore

start-front:
	@echo "Starting frontend production server..."
	cd $(FRONTEND_DIR) && pnpm start

# =============================================================================
# TYPE CHECKING
# =============================================================================

tsc-front:
	@echo "Type checking frontend with pnpm..."
	cd $(FRONTEND_DIR) && pnpm type-check

# =============================================================================
# CODE QUALITY
# =============================================================================

lint:
	@echo "Running linting..."
	pnpm biome lint .

lint-write:
	@echo "Running linting with auto-fix..."
	pnpm biome lint --write .

format:
	@echo "Formatting code..."
	pnpm biome format .

format-write:
	@echo "Formatting code with auto-fix..."
	pnpm biome format --write .

check:
	@echo "Running all checks..."
	pnpm biome check .

check-write:
	@echo "Running all checks with auto-fix..."
	pnpm biome check --write .

knip:
	@echo "Checking for unused dependencies..."
	knip

# =============================================================================
# DATABASE OPERATIONS
# =============================================================================

db-migrate:
	@echo "Running database migrations..."
	cd $(API_DIR) && dotnet tool run dotnet-ef database update

db-reset:
	@echo "Resetting database..."
	cd $(API_DIR) && dotnet tool run dotnet-ef database drop -f
	cd $(API_DIR) && dotnet tool run dotnet-ef database update

db-add:
	@echo "Adding migration: $(filter-out $@,$(MAKECMDGOALS))"
	cd $(API_DIR) && dotnet tool run dotnet-ef migrations add $(filter-out $@,$(MAKECMDGOALS))

db-remove:
	@echo "Removing last migration..."
	cd $(API_DIR) && dotnet tool run dotnet-ef migrations remove

# =============================================================================
# BULK SEEDING FOR TESTING
# =============================================================================

seed-bulk:
	@echo "Running bulk seed (500 tenants, ~8K users, ~5K projects)..."
	cd $(API_DIR) && dotnet run -- seed-bulk

seed-bulk-reset:
	@echo "Resetting bulk seed data..."
	cd $(API_DIR) && dotnet run -- seed-bulk-reset

# Catch-all target to prevent Make from trying to build non-existent targets
%:
	@:

# =============================================================================
# TESTING
# =============================================================================

test-api:
	@echo "Running API integration tests..."
	cd $(API_DIR) && dotnet test Tests/MainApi.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=normal"

test-api-debug:
	@echo "Running API integration tests (verbose diagnostics)..."
	cd $(API_DIR) && dotnet test Tests/MainApi.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=detailed" --environment TEST_VERBOSE_LOGS=1 --diag Tests/bin/Test/test-api-debug.log

# =============================================================================
# DOCKER OPERATIONS
# =============================================================================

docker-build:
	@echo "Building Docker images..."
	docker-compose build

docker-push:
	@echo "Pushing Docker images..."
	node scripts/build-and-push.mjs

docker-up:
	@echo "Starting services with Docker Compose..."
	docker-compose -f docker-compose.services.yml up -d

docker-down:
	@echo "Stopping Docker services..."
	docker-compose down

# =============================================================================
# CLIENT GENERATION
# =============================================================================

generate-client:
	@echo "Building API and generating OpenAPI spec..."
	cd $(API_DIR) && dotnet build --no-restore
	@echo "Generating API client with Kiota..."
	cd $(JS_CLIENT_DIR) && dotnet kiota generate -d ../../$(API_DIR)/openapi/MainApi.json -o src -l typescript -n MainApi.Client -c ApiClient

update-client:
	@echo "Updating API client with Kiota..."
	cd $(JS_CLIENT_DIR) && dotnet kiota update -o src

client-info:
	@echo "Showing client info..."
	cd $(JS_CLIENT_DIR) && dotnet kiota info -d ../../$(API_DIR)/openapi/MainApi.json -l typeScript

# =============================================================================
# CLEANING
# =============================================================================

clean:
	@echo "Cleaning all build artifacts..."
	@$(RM) node_modules
	@$(RM) apps/api/node_modules
	@$(RM) apps/front/node_modules
	@$(RM) packages/shared/node_modules
	@$(RM) packages/js-client/node_modules
	@$(RM) apps/api/bin
	@$(RM) apps/api/obj
	@$(RM) apps/api/publish
	@$(RM) apps/front/build
	@$(RM) apps/front/dist
	@$(RM) apps/front/.next

clean-api:
	@echo "Cleaning API build artifacts..."
	cd $(API_DIR) && dotnet clean
	@$(RM) $(API_DIR)/bin
	@$(RM) $(API_DIR)/obj
	@$(RM) $(API_DIR)/publish

clean-front:
	@echo "Cleaning frontend build artifacts..."
	@$(RM) $(FRONTEND_DIR)/build
	@$(RM) $(FRONTEND_DIR)/dist
	@$(RM) $(FRONTEND_DIR)/.next

# =============================================================================
# UTILITY COMMANDS
# =============================================================================

prepare:
	@echo "Setting up Git hooks..."
	husky

logs-api:
	@echo "Showing API logs..."
ifeq ($(OS),Windows_NT)
	@echo "Log files in apps/api/logs/:"
	@dir apps\api\logs\ 2>nul || echo "No logs directory found"
	@echo "Use 'type apps\api\logs\*.log' to view logs, or open the files directly"
else
	@tail -f $(API_DIR)/logs/*.log
endif

env-check:
	@echo "Checking environment..."
	@echo "Node version: $$(node --version)"
	@echo "pnpm version: $$(pnpm --version)"
	@echo "Dotnet version: $$(dotnet --version)"
	@echo "Docker version: $$(docker --version)"

# =============================================================================
# DEVELOPMENT WORKFLOW HELPERS
# =============================================================================

dev-setup: install dev-db
	@echo "Development environment ready!"
	@echo "Run 'make dev-api' in one terminal and 'make dev-front' in another"

quick-start: install dev-db dev-api
	@echo "API started on http://localhost:5000"
	@echo "Run 'make dev-front' in another terminal for the frontend"
