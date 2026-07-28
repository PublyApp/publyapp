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

# Apply pending migrations, then start the API development server
dev-api-migrated: db-migrate dev-api

# Start API using Node.js watcher (alternative)
dev-api-alt:
  node {{api_dir}}/run-dev.mjs

# Start React frontend (Vite)
dev-front:
  cd {{front_dir}} && pnpm dev

# Start docker services (postgres, etc.)
dev-services:
  docker compose -f docker-compose.services.yml up -d

# Start database (alias for dev-services)
dev-db: dev-services

# =============================================================================
# Building
# =============================================================================

# Build API only (skip restore)
# APP_ROLE is pinned to `api` (design §3.1, C6/F24): `dotnet build` RUNS the app to emit
# openapi.json, and with ASPNETCORE_ENVIRONMENT unset the host environment resolves to
# Production — where a missing APP_ROLE is a fail-fast startup error, by design. Pinning
# also keeps document generation on the API-only surface instead of composing the job
# engine. Exported by just (a `$`-prefixed parameter), not shell syntax, so it works
# under both bash and pwsh.
build-api $APP_ROLE="api":
  cd {{api_dir}} && dotnet build --no-restore

# Build API (with restore)
build-api-full $APP_ROLE="api":
  cd {{api_dir}} && dotnet build

# Publish API
publish-api $APP_ROLE="api":
  cd {{api_dir}} && dotnet publish

# Build frontend
build-front:
  cd {{front_dir}} && pnpm build

# Build for deployment (dokploy-from-source artifacts)
build-deploy:
  node ./scripts/deploy.mjs

# Build + push the three GHCR deploy images from a clean checkout at REF (Actions is stalled).
deploy-images ref="origin/develop":
  node scripts/deploy-images.mjs {{ref}}

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

# APP_ROLE is pinned to `api` on every dotnet-ef recipe below (design §3.1 item 5, R4-4):
# dotnet-ef builds the app's host to resolve AppDbContext, so AppEnvironment runs and
# reads APP_ROLE. Migration/model creation is an API-role tooling path, never an implicit
# `all` or worker host. As above, the host environment resolves to Production when
# ASPNETCORE_ENVIRONMENT is unset, so the pin is what keeps these recipes booting.
#
# Each recipe builds ONCE with -property:OpenApiGenerateDocuments=false, then runs the EF
# tool with --no-build. Migrations never need openapi.json, and a normal build RUNS the
# app via dotnet-getdocument to emit it — pure waste on these paths, and a hard failure
# point when doc generation is slow/hangs (it would block the very migration you are
# trying to apply, a bootstrap deadlock). Mirrors `dev-api`, which skips doc-gen the same
# way.

# Run EF Core migrations
db-migrate $APP_ROLE="api":
  cd {{api_dir}} && dotnet build -property:OpenApiGenerateDocuments=false
  cd {{api_dir}} && dotnet tool run dotnet-ef database update --no-build

# Drop + migrate database
db-reset $APP_ROLE="api":
  cd {{api_dir}} && dotnet build -property:OpenApiGenerateDocuments=false
  cd {{api_dir}} && dotnet tool run dotnet-ef database drop -f --no-build
  cd {{api_dir}} && dotnet tool run dotnet-ef database update --no-build

# Add new migration: `just db-add CreateUsers`
db-add name $APP_ROLE="api":
  cd {{api_dir}} && dotnet build -property:OpenApiGenerateDocuments=false
  cd {{api_dir}} && dotnet tool run dotnet-ef migrations add {{name}} --no-build

# Remove last migration
db-remove $APP_ROLE="api":
  cd {{api_dir}} && dotnet build -property:OpenApiGenerateDocuments=false
  cd {{api_dir}} && dotnet tool run dotnet-ef migrations remove --no-build

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
# APP_ROLE + ASPNETCORE_ENVIRONMENT pinned for the same reason as build-api (2B/G9):
# the test host's own module-load-time bootstrap (TestEnvironment.Bootstrap(), a
# [ModuleInitializer] in Tests/../Lib/Testing/Fixtures/TestEnvironment.cs) already makes
# `dotnet test` deterministic regardless of these vars — but this recipe pins the same
# contract anyway, so the sanctioned entrypoint and a bare `dotnet test` never disagree.
# Exported by just (a `$`-prefixed parameter, same convention as build-api), not shell
# syntax, so it works under both bash and pwsh.
test-api $APP_ROLE="all" $ASPNETCORE_ENVIRONMENT="Testing":
  cd {{api_dir}} && dotnet restore Tests/PublyApp.Api.Tests.csproj
  cd {{api_dir}} && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=normal"

# Run analyzer tests
test-analyzers:
  dotnet restore packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj
  dotnet test packages/lint-cs/Tests/PublyApp.Analyzers.Tests.csproj -c Release --no-restore --nologo

# Run API integration tests with verbose diagnostics
test-api-debug $APP_ROLE="all" $ASPNETCORE_ENVIRONMENT="Testing":
  cd {{api_dir}} && dotnet restore Tests/PublyApp.Api.Tests.csproj
  cd {{api_dir}} && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=detailed" --environment TEST_VERBOSE_LOGS=1 --diag .artifacts/logs/test-api-debug.log

# =============================================================================
# Local CI gate
# =============================================================================
#
# `just ci`      - everyday pre-push gate: everything the workflows run except
#                  the two browser/e2e suites, PLUS the full API test suite.
# `just ci-full` - `just ci` + both e2e suites.
#
# The API suite is local-only: no workflow runs it (the only `dotnet test` in CI
# is the OpenApiContractSpec filter). So a green `just ci` is STRONGER than CI
# for backend work, and weaker only on the e2e suites that `ci-full` adds.
#
# These recipes deliberately compose existing targets rather than restating
# their commands. `just ci-drift` fails the gate if a workflow gains or changes
# a step that this gate has not been reconciled against.
#
# See docs/guides/local-ci-gate.md.

# Fail if .github/workflows has a step the local gate is not reconciled with
ci-drift:
  @echo "=== [gate] workflow drift guard ==="
  pnpm test:ci-drift
  node ./scripts/check-ci-drift.mjs

# Guard rails for database migration compatibility during zero-downtime rolling deploys.
ci-migration-expand-contract:
  @echo "=== [gate] migration expand/contract guard ==="
  node --test ./scripts/check-migration-expand-contract.test.mjs
  node ./scripts/check-migration-expand-contract.mjs

# Ensure the review-front-2 pure-resolution logic remains covered in the gate.
ci-review-front-2-resolution:
  pnpm test:review-front-2-resolution

# Install exactly as CI does (supply-chain policy: frozen + no lifecycle scripts)
ci-install:
  @echo "=== [gate] install (frozen lockfile, no scripts) ==="
  node apps/front-2/scripts/assert-pinned.mjs
  node apps/front-2-spike/scripts/assert-pinned.mjs
  pnpm install --frozen-lockfile --ignore-scripts
  pnpm --filter @org/shared-ts run postinstall

# Formatting (repo-wide oxfmt --check, exactly as both workflows run it)
ci-format: format
  @echo "=== [gate] format (done) ==="

# Lint exactly the scope CI lints.
#
# Deliberately NOT `just lint`, which runs `oxlint --quiet .` over the whole
# repo. That superset is red on develop today over pre-existing errors in
# apps/front-2-spike, a disposable app no workflow lints — so using it here
# would make `just ci` fail on things CI passes. A gate that cries wolf gets
# ignored, which costs more than the extra coverage is worth. See
# docs/guides/local-ci-gate.md.
ci-lint:
  @echo "=== [gate] lint ==="
  npx oxlint --quiet apps/front-2 packages/shared-ts
  pnpm lint:disables
  pnpm check:frontend-barrels

# front-2: build, bundle guards, smoke start, typecheck, design system, unit tests
ci-front-2:
  @echo "=== [gate] front-2 build + checks ==="
  pnpm --filter front-2 build
  pnpm --filter front-2 verify:build
  pnpm --filter front-2 check:context-chunk-isolation
  pnpm --filter front-2 smoke:start
  pnpm --filter front-2 typecheck
  pnpm --filter front-2 check:design-system
  pnpm --filter front-2 test

# front-2-spike: the disposable spike app's supply-chain build
ci-front-2-spike:
  @echo "=== [gate] front-2-spike build ==="
  pnpm --filter front-2-spike build

# front (legacy app): unit characterization + typecheck
ci-front: tsc-front
  @echo "=== [gate] front unit characterization ==="
  pnpm --filter front run test

# openapi.json + client-ts determinism, then the OpenAPI contract spec
ci-spec-drift:
  @echo "=== [gate] openapi + client drift ==="
  dotnet tool restore
  just build-api-full
  node ./scripts/check-tree-clean.mjs apps/api/openapi.json
  just generate-client
  node ./scripts/check-tree-clean.mjs packages/client-ts
  cd {{api_dir}} && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~OpenApiContractSpec"

# front-2 e2e: docker stack + playwright (e2e only; `just ci-full` runs this)
#
# The stack is reset up front rather than only torn down at the end. CI tears
# down with `if: always()`, which a justfile cannot express — `just` stops at the
# first failing line, so a Playwright failure would skip the teardown. Resetting
# first makes the recipe idempotent regardless of how the last run ended, and
# leaving a failed stack up is what you want locally anyway: you can inspect it.
ci-e2e-front-2:
  @echo "=== [gate] front-2 e2e (docker + playwright) ==="
  docker compose -f apps/front-2/docker-compose.test.yml down -v --remove-orphans
  docker compose -f apps/front-2/docker-compose.test.yml up -d --build --wait --wait-timeout 180
  pnpm --filter front-2 exec playwright install chromium
  pnpm --filter front-2 exec playwright test
  docker compose -f apps/front-2/docker-compose.test.yml down -v

# front e2e characterization: docker stack + playwright
ci-e2e-front:
  @echo "=== [gate] front e2e characterization (docker + playwright) ==="
  pnpm --filter front exec playwright install chromium
  pnpm --filter front run test:e2e:fresh

# Everyday pre-push gate (no e2e). Fails on the first red sub-gate.
ci: ci-drift ci-migration-expand-contract ci-review-front-2-resolution ci-install ci-format ci-lint ci-front-2 ci-front-2-spike ci-front ci-spec-drift test-api
  @echo ""
  @echo "=== just ci: PASSED ==="
  @echo "Not covered here: the two e2e suites (run 'just ci-full')."

# Full gate: `just ci` plus both e2e suites.
ci-full: ci ci-e2e-front-2 ci-e2e-front
  @echo ""
  @echo "=== just ci-full: PASSED ==="

# =============================================================================
# Docker
# =============================================================================

# Build docker images
docker-build:
  docker compose -f docker-compose.services.yml build

# Start docker services
docker-up:
  docker compose -f docker-compose.services.yml up -d

# Stop docker services
docker-down:
  docker compose -f docker-compose.services.yml down

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
# APP_ROLE pinned for the same reason as build-api: this `dotnet build` boots the app to
# regenerate openapi.json before kiota reads it (design §3.1 item 3).
generate-client $APP_ROLE="api":
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
