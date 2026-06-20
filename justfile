# PublyApp task runner
#
# Notes:
# - Unix: uses bash.
# - Windows: uses PowerShell 7 (`pwsh`).
#
# Run `just --list` to see available recipes.

set shell := ["bash", "-cu"]
set windows-shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

api_dir := "apps/api"
front_dir := "apps/front"
shared_dir := "packages/shared-ts"
js_client_dir := "packages/client-ts"
scripts_cs_dir := "packages/scripts-cs"

[default]
help:
  @just --list --unsorted

# =============================================================================
# Installation
# =============================================================================

# Install all dependencies (pnpm + dotnet restore)
install:
  @echo "Installing pnpm dependencies..."
  pnpm install
  @echo "Restoring .NET packages..."
  dotnet restore
  @echo "Running shared package postinstall..."
  cd {{shared_dir}} && pnpm run postinstall

# Update all pnpm workspace dependencies
update-deps:
  pnpm up -r

# =============================================================================
# Development
# =============================================================================

# Start API development server (dotnet watch)
dev-api:
  cd {{api_dir}} && dotnet watch run --no-restore -property:OpenApiGenerateDocuments=false

# Start API using Node.js watcher (alternative)
dev-api-alt:
  node {{api_dir}}/run-dev.mjs

# Start React frontend (Vite)
dev-front:
  cd {{front_dir}} && pnpm dev

# Start docker services (postgres, etc.)
dev-services:
  docker-compose -f docker-compose.services.yml up -d

# Start database (alias for dev-services)
dev-db: dev-services

# =============================================================================
# Building
# =============================================================================

# Build API only (skip restore)
build-api:
  cd {{api_dir}} && dotnet build --no-restore

# Build API (with restore)
build-api-full:
  cd {{api_dir}} && dotnet build

# Publish API
publish-api:
  cd {{api_dir}} && dotnet publish

# Build frontend
build-front:
  cd {{front_dir}} && pnpm build

# Build for deployment (dokploy-from-source artifacts)
build-deploy:
  node ./scripts/deploy.mjs

# Deploy front artifact (dokploy)
deploy-front:
  node ./scripts/deploy.mjs --target front --upload

# Deploy api artifact (dokploy)
deploy-api:
  node ./scripts/deploy.mjs --target api --upload

# Deploy both artifacts (dokploy)
deploy:
  node ./scripts/deploy.mjs --target all --upload

# =============================================================================
# Running
# =============================================================================

# Run API (skip restore; run `just install` first)
run-api:
  cd {{api_dir}} && dotnet run --no-restore

# Start frontend production server
start-front:
  cd {{front_dir}} && pnpm start

# =============================================================================
# Type checking
# =============================================================================

# Type-check frontend (pnpm)
tsc-front:
  cd {{front_dir}} && pnpm type-check

# =============================================================================
# Code quality
# =============================================================================

# Lint (oxlint)
lint:
  pnpm lint

# Lint with auto-fix
lint-write:
  pnpm lint:fix

# Format check (oxfmt)
format:
  pnpm format

# Format with auto-fix
format-write:
  pnpm format:write

# Run all checks (lint + format)
check:
  pnpm lint
  pnpm format

# Run all checks with auto-fix
check-write:
  pnpm lint:fix
  pnpm format:write

# Check for unused dependencies
knip:
  pnpm exec knip

# =============================================================================
# Database
# =============================================================================

# Run EF Core migrations
db-migrate:
  cd {{api_dir}} && dotnet tool run dotnet-ef database update

# Drop + migrate database
db-reset:
  cd {{api_dir}} && dotnet tool run dotnet-ef database drop -f
  cd {{api_dir}} && dotnet tool run dotnet-ef database update

# Add new migration: `just db-add CreateUsers`
db-add name:
  cd {{api_dir}} && dotnet tool run dotnet-ef migrations add {{name}}

# Remove last migration
db-remove:
  cd {{api_dir}} && dotnet tool run dotnet-ef migrations remove

# =============================================================================
# Bulk seeding (testing)
# =============================================================================

# Run bulk seed (500 tenants, ~8K tenant users, 500 staff users, ~5K projects)
seed-bulk:
  cd {{api_dir}} && dotnet run -- seed-bulk

# Clear bulk seed data
seed-bulk-reset:
  cd {{api_dir}} && dotnet run -- seed-bulk-reset

# =============================================================================
# Testing
# =============================================================================

# Run API integration tests (requires Docker)
test-api:
  cd {{api_dir}} && dotnet restore Tests/PublyApp.Api.Tests.csproj
  cd {{api_dir}} && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=normal"

# Run analyzer tests
test-analyzers:
  dotnet restore packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj
  dotnet test packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj -c Release --no-restore --nologo

# Run API integration tests with verbose diagnostics
test-api-debug:
  cd {{api_dir}} && dotnet restore Tests/PublyApp.Api.Tests.csproj
  cd {{api_dir}} && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=detailed" --environment TEST_VERBOSE_LOGS=1 --diag .artifacts/logs/test-api-debug.log

# =============================================================================
# Docker
# =============================================================================

# Build docker images
docker-build:
  docker-compose -f docker-compose.services.yml build

# Start docker services
docker-up:
  docker-compose -f docker-compose.services.yml up -d

# Stop docker services
docker-down:
  docker-compose -f docker-compose.services.yml down

# =============================================================================
# Code generation
# =============================================================================

# Generate API response translation key constants
generate-response-keys:
  dotnet run --project {{scripts_cs_dir}}/PublyApp.Scripts.csproj -- generate-translation-keys {{shared_dir}}/lib/i18n/json/response-message.en.json {{api_dir}}/Localization/ResponseKeys.g.cs

# =============================================================================
# Client generation (Kiota)
# =============================================================================

# Build API + generate TypeScript client from OpenAPI
generate-client:
  cd {{api_dir}} && dotnet build --no-restore
  cd {{js_client_dir}} && dotnet kiota generate -d ../../{{api_dir}}/openapi.json -o src -l typescript -n PublyApp.Api.Client -c ApiClient
  cd {{js_client_dir}} && node -e "const fs=require('fs'),path=require('path'); const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name); return e.isDirectory()?walk(p):[p];}); for (const f of walk('src')) { if (f.endsWith('.ts')||f.endsWith('.json')) { const c=fs.readFileSync(f,'utf8'); const n=c.replace(/\r\n?/g,'\n'); if (n!==c) fs.writeFileSync(f,n); } }"

# Update existing client
update-client:
  cd {{js_client_dir}} && dotnet kiota update -o src
  cd {{js_client_dir}} && node -e "const fs=require('fs'); const p='src/kiota-lock.json'; if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'))"

# Show client info
client-info:
  cd {{js_client_dir}} && dotnet kiota info -d ../../{{api_dir}}/openapi.json -l typeScript

# =============================================================================
# Cleaning
# =============================================================================

# Clean all build artifacts (cross-platform via node)
clean:
  node -e "const fs=require('fs'); const rm=(x)=>fs.rmSync(x,{recursive:true,force:true}); const glob=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).filter((x)=>x.isDirectory()).map((x)=>`${dir}/${x.name}/.artifacts`):[]; ['node_modules','apps/api/node_modules','apps/front/node_modules','packages/shared-ts/node_modules','packages/client-ts/node_modules','packages/scripts-cs/bin','packages/scripts-cs/obj','apps/front/build','apps/front/dist','apps/front/.next',...glob('apps'),...glob('packages')].forEach(rm)"

# Clean API artifacts
clean-api:
  cd {{api_dir}} && dotnet clean
  node -e "const fs=require('fs'); const p=(x)=>fs.rmSync(x,{recursive:true,force:true}); ['apps/api/.artifacts'].forEach(p)"

# Clean frontend artifacts
clean-front:
  node -e "const fs=require('fs'); const p=(x)=>fs.rmSync(x,{recursive:true,force:true}); ['apps/front/build','apps/front/dist','apps/front/.next'].forEach(p)"

# =============================================================================
# Utility
# =============================================================================

# Set up Git hooks
prepare:
  pnpm run prepare

# Print basic toolchain info
env-check:
  @echo "Node version: $(node --version)"
  @echo "pnpm version: $(pnpm --version)"
  @echo "Dotnet version: $(dotnet --version)"
  @echo "Docker version: $(docker --version)"

# Convenience: setup dev env (install + db)
dev-setup: install dev-db
  @echo "Development environment ready!"
  @echo "Run 'just dev-api' in one terminal and 'just dev-front' in another"

# Convenience: quick-start api after install+db
quick-start: install dev-db dev-api
  @echo "API started on http://localhost:5000"
  @echo "Run 'just dev-front' in another terminal for the frontend"
