# Migrate Make → Just Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repo’s task runner from `make` to `just` and remove the `Makefile`.

**Architecture:** Add a root `justfile` implementing the repo’s project commands (same recipe names as the prior Make targets), update docs to prefer `just`, then delete the `Makefile`.

**Status (2026-04-10):** Implemented (`justfile` added, docs updated, and `Makefile` removed).

**Tech Stack:** `just`, PowerShell 7 (`pwsh`) on Windows, `bash` on macOS/Linux, pnpm, .NET.

---

## Discoveries (from migration)

- **`biome` isn’t global:** it’s a pnpm dev dependency, so use `pnpm exec biome …` (or `just check` / `just check-write`).
- **PowerShell 5.1 vs 7:** Windows PowerShell 5.1 doesn’t support `&&`, but PowerShell 7 (`pwsh`) does.
- **Windows shells:** `just` can run via `sh` on Windows when a `sh.exe` is on `PATH` (Git Bash/MSYS2/Cygwin). We chose `pwsh` for consistency.
- **Short-circuit semantics:** replacing `cd dir; cmd` with `cd dir && cmd` ensures the command won’t run if `cd` fails (matches Unix expectations).
- **Line endings:** `just check` uses `--line-ending=auto` to avoid CRLF/LF mismatches. If `just check` fails, run `just check-write` once to apply fixes.

## File Structure

**Primary**
- Create: `justfile`

**Docs**
- Modify: `README.md` (add `just` workflow)
- Modify: `AGENTS.md` (update canonical dev commands)

---

### Task 1: Add root `justfile` mirroring `Makefile`

**Files:**
- Create: `justfile`

- [ ] **Step 1: Create `justfile` with cross-platform shell settings**

Create `justfile` with the following contents:

```just
# PublyApp task runner (Just)

# Use bash on Unix, pwsh on Windows
set shell := ["bash", "-cu"]
set windows-shell := ["pwsh", "-NoLogo", "-NoProfile", "-Command"]

# Keep output tidy: show commands, but not recipe names
set echo := true

api_dir := "apps/api"
front_dir := "apps/front"
shared_dir := "packages/shared-ts"
js_client_dir := "packages/client-ts"

[default]
help:
  @just --list --unsorted

# =============================================================================
# INSTALLATION
# =============================================================================

install:
  @echo "Installing pnpm dependencies..."
  pnpm install
  @echo "Restoring .NET packages..."
  dotnet restore
  @echo "Running shared package postinstall..."
  cd {{shared_dir}} && pnpm run postinstall

update-deps:
  @echo "Updating all dependencies..."
  pnpm up -r

# =============================================================================
# DEVELOPMENT
# =============================================================================

dev-api *args:
  @echo "Starting API development server with hot reload..."
  cd {{api_dir}} && dotnet watch run --no-restore -property:OpenApiGenerateDocuments=false {{args}}

dev-api-alt *args:
  @echo "Starting API with Node.js script..."
  node {{api_dir}}/run-dev.mjs {{args}}

dev-front *args:
  @echo "Starting frontend development server..."
  cd {{front_dir}} && pnpm dev {{args}}

dev-services:
  @echo "Starting services with Docker..."
  docker-compose -f docker-compose.services.yml up -d

dev-db: dev-services

# =============================================================================
# BUILDING
# =============================================================================

build-api:
  @echo "Building API..."
  cd {{api_dir}} && dotnet build --no-restore

build-api-full:
  @echo "Building API (with restore)..."
  cd {{api_dir}} && dotnet build

publish-api:
  @echo "Publishing API..."
  cd {{api_dir}} && dotnet publish

build-front:
  @echo "Building frontend..."
  cd {{front_dir}} && pnpm build

build-deploy *args:
  @echo "Building for deployment..."
  node ./scripts/deploy.mjs {{args}}

deploy-front:
  @echo "Deploying front to Dokploy (artifact upload)..."
  node ./scripts/deploy.mjs --target front --upload

deploy-api:
  @echo "Deploying api to Dokploy (artifact upload)..."
  node ./scripts/deploy.mjs --target api --upload

deploy:
  @echo "Deploying front+api to Dokploy (artifact upload)..."
  node ./scripts/deploy.mjs --target all --upload

# =============================================================================
# RUNNING
# =============================================================================

run-api *args:
  @echo "Running API..."
  cd {{api_dir}} && dotnet run --no-restore {{args}}

start-front *args:
  @echo "Starting frontend production server..."
  cd {{front_dir}} && pnpm start {{args}}

# =============================================================================
# TYPE CHECKING
# =============================================================================

tsc-front:
  @echo "Type checking frontend with pnpm..."
  cd {{front_dir}} && pnpm type-check

# =============================================================================
# CODE QUALITY
# =============================================================================

lint *args:
  @echo "Running linting..."
  pnpm biome lint . {{args}}

lint-write *args:
  @echo "Running linting with auto-fix..."
  pnpm biome lint --write . {{args}}

format *args:
  @echo "Formatting code..."
  pnpm biome format . {{args}}

format-write *args:
  @echo "Formatting code with auto-fix..."
  pnpm biome format --write . {{args}}

check *args:
  @echo "Running all checks..."
  pnpm biome check . {{args}}

check-write *args:
  @echo "Running all checks with auto-fix..."
  pnpm biome check --write . {{args}}

knip:
  @echo "Checking for unused dependencies..."
  knip

# =============================================================================
# DATABASE OPERATIONS
# =============================================================================

db-migrate:
  @echo "Running database migrations..."
  cd {{api_dir}} && dotnet tool run dotnet-ef database update

db-reset:
  @echo "Resetting database..."
  cd {{api_dir}} && dotnet tool run dotnet-ef database drop -f
  cd {{api_dir}} && dotnet tool run dotnet-ef database update

db-add name:
  @echo "Adding migration: {{name}}"
  cd {{api_dir}} && dotnet tool run dotnet-ef migrations add {{name}}

db-remove:
  @echo "Removing last migration..."
  cd {{api_dir}} && dotnet tool run dotnet-ef migrations remove

# =============================================================================
# BULK SEEDING FOR TESTING
# =============================================================================

seed-bulk:
  @echo "Running bulk seed (500 tenants, ~8K users, ~5K projects)..."
  cd {{api_dir}} && dotnet run -- seed-bulk

seed-bulk-reset:
  @echo "Resetting bulk seed data..."
  cd {{api_dir}} && dotnet run -- seed-bulk-reset

# =============================================================================
# TESTING
# =============================================================================

test-api *args:
  @echo "Running API integration tests..."
  cd {{api_dir}} && dotnet test Tests/MainApi.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=normal" {{args}}

test-api-debug:
  @echo "Running API integration tests (verbose diagnostics)..."
  cd {{api_dir}} && dotnet test Tests/MainApi.Tests.csproj -c Test --no-restore --nologo --verbosity minimal --logger "console;verbosity=detailed" --environment TEST_VERBOSE_LOGS=1 --diag Tests/bin/Test/test-api-debug.log

# =============================================================================
# DOCKER OPERATIONS
# =============================================================================

docker-build:
  @echo "Building Docker images..."
  docker-compose -f docker-compose.services.yml build

docker-up:
  @echo "Starting services with Docker Compose..."
  docker-compose -f docker-compose.services.yml up -d

docker-down:
  @echo "Stopping Docker services..."
  docker-compose -f docker-compose.services.yml down

# =============================================================================
# CLIENT GENERATION
# =============================================================================

generate-client:
  @echo "Building API and generating OpenAPI spec..."
  cd {{api_dir}} && dotnet build --no-restore
  @echo "Generating API client with Kiota..."
  cd {{js_client_dir}} && dotnet kiota generate -d ../../{{api_dir}}/openapi/MainApi.json -o src -l typescript -n MainApi.Client -c ApiClient

update-client:
  @echo "Updating API client with Kiota..."
  cd {{js_client_dir}} && dotnet kiota update -o src

client-info:
  @echo "Showing client info..."
  cd {{js_client_dir}} && dotnet kiota info -d ../../{{api_dir}}/openapi/MainApi.json -l typeScript

# =============================================================================
# CLEANING
# =============================================================================

clean:
  @echo "Cleaning all build artifacts..."
  node -e "const fs=require('fs'); const p=(x)=>fs.rmSync(x,{recursive:true,force:true}); ['node_modules','apps/api/node_modules','apps/front/node_modules','packages/shared-ts/node_modules','packages/client-ts/node_modules','apps/api/bin','apps/api/obj','apps/api/publish','apps/front/build','apps/front/dist','apps/front/.next'].forEach(p)"

clean-api:
  @echo "Cleaning API build artifacts..."
  cd {{api_dir}} && dotnet clean
  node -e "const fs=require('fs'); const p=(x)=>fs.rmSync(x,{recursive:true,force:true}); ['apps/api/bin','apps/api/obj','apps/api/publish'].forEach(p)"

clean-front:
  @echo "Cleaning frontend build artifacts..."
  node -e "const fs=require('fs'); const p=(x)=>fs.rmSync(x,{recursive:true,force:true}); ['apps/front/build','apps/front/dist','apps/front/.next'].forEach(p)"

# =============================================================================
# UTILITY COMMANDS
# =============================================================================

prepare:
  @echo "Setting up Git hooks..."
  husky

env-check:
  @echo "Checking environment..."
  @echo "Node version: $(node --version)"
  @echo "pnpm version: $(pnpm --version)"
  @echo "Dotnet version: $(dotnet --version)"
  @echo "Docker version: $(docker --version)"

dev-setup: install dev-db
  @echo "Development environment ready!"
  @echo "Run 'just dev-api' in one terminal and 'just dev-front' in another"

quick-start: install dev-db dev-api
  @echo "API started on http://localhost:5000"
  @echo "Run 'just dev-front' in another terminal for the frontend"
```

- [ ] **Step 2: Smoke-check `justfile` locally**

Run:
```bash
just --list
just env-check
just build-api
just build-front
```

Expected:
- `just --list` prints all recipes
- `env-check` prints versions
- `build-api` and `build-front` run without recipe parsing errors

- [ ] **Step 3: Verify parameter passing works**

Run:
```bash
just db-add AddExampleMigration
just dev-api -- --help
just dev-front -- --help
```

Expected:
- `db-add` passes migration name through to `dotnet-ef`
- extra args after `--` are forwarded to the underlying tool

---

### Task 2: Update docs to prefer `just`

**Files:**
- Modify: `README.md` (notably around current “Using Makefile” section, `README.md:78`, `README.md:138`)
- Modify: `AGENTS.md` (dev commands and other references)

- [ ] **Step 1: Add “Just (Recommended)” section to README**

Update `README.md` to introduce `just` as the preferred task runner.

Example snippet to add near the existing prerequisites / workflow section:

````md
```bash
just install
just dev-db
just dev-api
just dev-front
```
````

- [ ] **Step 2: Update AGENTS.md command snippets**

Replace examples like:
- `just dev-api`
- `just dev-front`
- `just dev-db`

With:

```md
just dev-api
just dev-front
just dev-db
```

And update the “After API contract changes” snippets to:

```md
just build-api && just generate-client && just tsc-front
```

- [ ] **Step 3: Keep Makefile references but mark them “legacy”**

Add a short note in both `README.md` and `AGENTS.md` that `just` is the canonical task runner for this repository.

---

### Task 3 (Optional, phase 2): Makefile becomes a thin wrapper around `just`

**Files:**
- Modify: `Makefile` (convert recipe bodies to `just <recipe>`)

**Rationale:** reduces duplication and prevents `Makefile` and `justfile` drifting apart.

- [ ] **Step 1: Replace Makefile recipe bodies with wrappers**

Example pattern:

```sh
dev-api:
	just dev-api

build-api:
	just build-api
```

- [ ] **Step 2: Handle `db-add` wrapper explicitly**

```sh
db-add:
	just db-add $(filter-out $@,$(MAKECMDGOALS))
```

- [ ] **Step 3: Verify both invocations work**

```bash
just dev-api
just dev-api
```

---

### Task 4: Rollout + safety checks

**Files:**
- Modify: `README.md` (migration note)
- (Optional) Add: `docs/misc/just-migration.md` if you want a longer write-up

- [ ] **Step 1: Remove any remaining `make` references**

Pick a date and communicate:
- new team members use `just`
- CI/scripts should call `just`
- `Makefile` removed

- [ ] **Step 2: Add a short “install just” note**

Keep it simple (don’t bikeshed install methods):
- “Install `just` from your package manager or from `just.systems`”
- “On Windows, `just` works well with `pwsh` via `windows-shell` setting”

- [ ] **Step 3: Verification checklist**

Run:
```bash
just check
just tsc-front
just test-api
```

Expected:
- Commands behave the same as their prior `make` equivalents
