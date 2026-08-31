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


# Start front frontend (Vite)
dev-front port="5050":
  cd {{front_dir}} && pnpm exec vite dev --port {{port}} --strictPort

# {{args}} would interpolate as raw shell text, splitting on internal whitespace and
# letting metacharacters execute (worktree paths/branches with spaces are ordinary here).
# `set positional-arguments` + "$@"/@args forwards each argument as its own argv entry
# instead. `pwsh -Command` (the configured windows-shell) joins trailing args back into
# one string and re-parses it as PowerShell source, defeating positional-arguments — see
# https://github.com/casey/just/issues/1592 — so the Windows variant runs as a real script
# file via [script("pwsh")], which binds $args from genuine process arguments.

# Start another worktree's front frontend by PR/issue number
[unix]
[positional-arguments]
review-front *args:
  node packages/scripts-ts/src/review-front.ts "$@"

[windows]
[script("pwsh")]
[positional-arguments]
review-front *args:
  node packages/scripts-ts/src/review-front.ts @args

# Start another worktree's API by PR/issue number, against the shared dev database.
# Refuses to start if the branch carries a migration the database hasn't applied
# (pass --allow-migrations to proceed anyway) — see #1016.
[unix]
[positional-arguments]
review-api *args:
  node packages/scripts-ts/src/review-api.ts "$@"

[windows]
[script("pwsh")]
[positional-arguments]
review-api *args:
  node packages/scripts-ts/src/review-api.ts @args

# Start Aspire AppHost (postgres + api + worker + front).
# -property:OpenApiGenerateDocuments=false: `dotnet run`'s implicit build would
# otherwise run the API's OpenAPI document generation, which boots the app with
# the ambient .env.development (APP_ROLE=all) while no Postgres is up yet, and the
# worker's migration gate retries until the build fails. This recipe only needs a
# build; the drift gate (build-api-full) and `just generate-client` regenerate.
dev-services:
  dotnet run --project apps/apphost --property:OpenApiGenerateDocuments=false

# Start Aspire AppHost (alias for dev-services)
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
build-api $APP_ROLE="api" $SOCIAL_ACCOUNTS_MASTER_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=":
  cd {{api_dir}} && dotnet build --no-restore

# Build API (with restore)
build-api-full $APP_ROLE="api" $SOCIAL_ACCOUNTS_MASTER_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=":
  cd {{api_dir}} && dotnet build

# Publish API
publish-api $APP_ROLE="api":
  cd {{api_dir}} && dotnet publish


# Build + push the three GHCR deploy images from a clean checkout at REF (Actions is stalled).
deploy-images ref="origin/develop":
  node packages/scripts-ts/src/deploy-images.ts {{ref}}

# =============================================================================
# Running
# =============================================================================

# Run API (skip restore; run `just install` first)
run-api:
  cd {{api_dir}} && dotnet run --no-restore -property:OpenApiGenerateDocuments=false


# =============================================================================
# Type checking
# =============================================================================


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

# React Doctor: check changed files for findings (mirrors CI --scope files --blocking warning)
react-doctor base="origin/develop":
  cd {{front_dir}} && pnpm dlx react-doctor@0.9.12 --scope files --base {{base}} --blocking warning --no-telemetry --verbose

# NuGet vulnerability audit (issue #1187 rung 3). Mirrors
# .github/workflows/quality-gate.yml::quality::Scan .NET packages for known
# vulnerabilities. Uses the machine-readable `--format json` output (not the
# text format that TreatWarningsAsErrors breaks by converting NU1903 into an
# error before the grep pattern can match). Scans EVERY .csproj (via
# `git ls-files`), since PublyApp.slnx omits packages/lint-cs/* but the audit
# scope covers all five projects.
nuget-audit $APP_ROLE="api" $TRUSTED_PROXY_CIDRS="127.0.0.1/32":
  node packages/scripts-ts/src/nuget-audit.ts
  pnpm --filter scripts-ts exec vitest run src/nuget-audit.test.ts
  # Mirrors quality-gate.yml::quality::Run dependency-health pin-location
  # contract test (#1334 fix round 1).
  pnpm --filter scripts-ts exec vitest run src/dependency-health-pin-location.test.ts

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
  cd {{api_dir}} && dotnet run -property:OpenApiGenerateDocuments=false -- seed-bulk

# Clear bulk seed data
seed-bulk-reset:
  cd {{api_dir}} && dotnet run -property:OpenApiGenerateDocuments=false -- seed-bulk-reset

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
# The API suite ran local-only until #1462 added .github/workflows/api-tests.yml,
# which runs `just test-api` as the required api-tests-gate PR check. `just ci`
# still runs the same suite locally before every push, so backend failures are
# caught before they reach CI.
#
# These recipes deliberately compose existing targets rather than restating
# their commands. `just ci-drift` fails the gate if a workflow gains or changes
# a step that this gate has not been reconciled against.
#
# See docs/guides/local-ci-gate.md.

# Fail if .github/workflows has a step the local gate is not reconciled with,
# if the #1017 changed-path classifier's fail-closed logic regresses, or if
# an aggregate gate's job graph (needs/if/permissions/outputs — the metadata
# check-ci-drift.ts's step-content hash does not cover) drifts from what
# #1017 requires. Also enforces upload-artifact/download-artifact version
# compatibility when archive: false is used (#1728).
ci-drift:
  @echo "=== [gate] workflow drift guard ==="
  pnpm --filter scripts-ts exec vitest run src/codeowners-contract.test.ts
  pnpm test:ci-drift
  # #1709: the ratchet-floor generator's own suite. Without this line the
  # ratchet guarding against silent step erasure is itself unverified —
  # exactly the #1709 finding that file-by-file enumeration left a 463-line
  # test suite with no CI consumer. Mirrored by the gate-selftest step in
  # front-ci.yml, and pinned structurally by
  # packages/scripts-ts/src/check-ci-gate-structure.ts (gateSelftestTests +
  # EXPECTED_GATE_SELFTEST_TESTS) so this line cannot silently drop.
  pnpm --filter scripts-ts exec vitest run src/gen-reason-ref.test.ts
  pnpm --filter scripts-ts exec vitest run src/lint-front.test.ts
  # #1679: the no-floating-promises ratchet's own suite. front-ci.yml's
  # gate-selftest step runs it; without this line the local mirror would be
  # missing a command CI actually runs — exactly the drift this recipe exists
  # to make impossible.
  pnpm --filter scripts-ts exec vitest run src/check-no-floating-promises.test.ts
  node ./packages/scripts-ts/src/check-ci-drift.ts
  pnpm --filter scripts-ts exec vitest run src/ci-changed-paths.test.ts
  pnpm --filter scripts-ts exec vitest run src/artifact-version-compat.test.ts
  node ./packages/scripts-ts/src/artifact-version-compat.ts
  pnpm --filter scripts-ts exec vitest run src/ci-gate-bootstrap.test.ts
  pnpm --filter scripts-ts exec vitest run src/ci-gate-aggregation.test.ts
  pnpm --filter scripts-ts exec vitest run src/ci-e2e-rerun-guard.test.ts
  # #1975 round 2: live-tree coverage guard — every project the API suite
  # compiles (slnx projects + spec-referenced projects) must be reached by a
  # workflow path filter. Mirrors the gate-selftest step in front-ci.yml.
  pnpm --filter scripts-ts exec vitest run src/check-api-tests-path-coverage.test.ts
  pnpm --filter scripts-ts exec vitest run src/check-ci-gate-structure.test.ts
  node ./packages/scripts-ts/src/check-ci-gate-structure.ts
  pnpm --filter scripts-ts exec vitest run src/require-linked-issue.test.ts
  pnpm --filter scripts-ts exec vitest run src/check-actions-pinned.test.ts
  node ./packages/scripts-ts/src/check-actions-pinned.ts
  pnpm --filter scripts-ts exec vitest run src/check-actions-pins.test.ts
  node ./packages/scripts-ts/src/check-actions-pins.ts
  pnpm --filter scripts-ts exec vitest run src/ci-referenced-paths.test.ts
  pnpm --filter scripts-ts exec vitest run src/check-cyclomatic-bound.test.ts
  node ./packages/scripts-ts/src/check-cyclomatic-bound.ts
  # #1674: bite-proof test for the production-dependency audit gate.
  # The CI gate is `pnpm audit --prod --audit-level=moderate`
  # (front-ci.yml::supply-chain), and this test pins that exact command
  # string and runs the real pnpm audit against a controlled fixture
  # carrying ejs@3.1.7 → GHSA-ghr5-ch3p-vcr6 (a stable moderate advisory)
  # so a regression that reverts the threshold to `high`, drops `--prod`,
  # or removes the step is caught locally as well as in CI.
  pnpm --filter scripts-ts exec vitest run src/prod-audit-bites.test.ts

# #1821: production duplication ratchet. Runs jscpd against production paths and
# verifies the unique pair count and line count are within the committed baseline.
# NOTE: the exclusion list is a SINGLE comma-separated --ignore value. jscpd's
# CLI keeps only the LAST repeated --ignore flag, so repeated flags silently
# drop every exclusion but the last (measured in #1821-r2: only
# apps/front/scripts never bound until the comma-separated form).
ci-jscpd:
  @echo "=== [gate] jscpd duplication ratchet ==="
  @echo "Running jscpd scan..."
  pnpm exec jscpd . --min-tokens 50 --ignore '/node_modules/**,/bin/**,/obj/**,/dist/**,/.artifacts/**,**/Migrations/**,.worktrees/**,packages/client-ts/**,apps/front/scripts/**' --reporters json --output .dump/jscpd-report.json
  @echo "Verifying baseline..."
  pnpm --filter scripts-ts exec vitest run src/check-jscpd.test.ts
  node ./packages/scripts-ts/src/check-jscpd.ts
  pnpm --filter scripts-ts exec tsc -p tsconfig.jscpd.json

# Bind every pinned action SHA to the version its "# vX.Y.Z" comment claims
# (#1392): resolves each tag through `gh api` (annotated tags peeled to their
# commit) and compares against the pinned SHA; unparseable input fails loud.
# Network-dependent: the live second command needs gh auth. Skip ONLY that
# half locally with `just ci-actions-pins ARGS="--offline"` (air-gapped work);
# CI never passes --offline.
ci-actions-pins ARGS='':
    @echo "=== [gate] actions pin/comment binding ==="
    pnpm --filter scripts-ts exec vitest run src/check-actions-pins.test.ts
    node ./packages/scripts-ts/src/check-actions-pins.ts {{ARGS}}

# Guard rails for database migration compatibility during zero-downtime rolling deploys.
ci-migration-expand-contract:
  @echo "=== [gate] migration expand/contract guard ==="
  pnpm --filter scripts-ts exec vitest run src/check-migration-expand-contract.test.ts
  node ./packages/scripts-ts/src/check-migration-expand-contract.ts

# Ensure the review-worktree pure-resolution logic remains covered in the gate.
ci-review-worktree-resolution:
  pnpm test:review-worktree-resolution

# Repo-wide dead relative links in tracked Markdown (docs/records/ bodies
# are write-once evidence and exempt) + prune-inventory freshness (--check
# fails when the committed audit record no longer matches its generator)
ci-doc-links:
  @echo "=== [gate] doc links ==="
  pnpm --filter scripts-ts exec vitest run src/check-doc-links.test.ts
  pnpm --filter scripts-ts exec vitest run src/audit-docs-prune.test.ts
  node ./packages/scripts-ts/src/check-doc-links.ts
  node ./packages/scripts-ts/src/audit-docs-prune.ts --check

# #1798: every production-required env var documented in the deploy runbook.
# Extracts required vars from actual source code (env.ts schema, server.ts
# validateRuntimeEnv, AppEnvironment.cs GetRequiredString calls) and the
# documented vars from the actual runbook (§5a table + §5b block). Fails
# closed: an unparseable source file FAILS LOUDLY with the file name and
# error rather than silently passing.
ci-deploy-env-docs:
  @echo "=== [gate] deploy env doc coverage ==="
  pnpm --filter scripts-ts exec vitest run src/check-deploy-env-docs.test.ts
  node ./packages/scripts-ts/src/check-deploy-env-docs.ts

# Ensure the shared PR-closure projection cannot drift from the project's
# durable config, board contract, or fail-closed security rules.
ci-project-closure-adapter:
  @echo "=== [gate] project closure adapter ==="
  pnpm test:project-closure-adapter

# #1513: fail if any tracked file matches a .gitignore rule. Interrogates the
# real repo via `git ls-files --cached --ignored --exclude-standard` — empty
# output is green, any named path is red. Mirrors quality-gate.yml::quality.
ci-no-ignored-tracked:
  @echo "=== [gate] no tracked file matches .gitignore (#1513) ==="
  pnpm --filter scripts-ts exec vitest run src/check-no-ignored-tracked.test.ts
  node ./packages/scripts-ts/src/check-no-ignored-tracked.ts

# #1849: no `<Dockerfile>.dockerignore` shadow file may exist anywhere in the
# tree — Docker REPLACES (not merges) the root .dockerignore when one sits next
# to a Dockerfile, silently re-including node_modules, dist, .turbo and
# .worktrees in every build context (see #1832/#1836). Walks the real working
# tree and names every offending path. Mirrors
# quality-gate.yml::no-dockerignore-shadow (unconditioned job, same binary).
ci-dockerignore-shadow:
  @echo "=== [gate] no .dockerignore shadow files (#1849) ==="
  pnpm --filter scripts-ts exec vitest run src/check-dockerignore-shadow.test.ts
  node ./packages/scripts-ts/src/check-dockerignore-shadow.ts

# #1891: a `.dockerignore` placed anywhere other than the repository root
# creates the same context divergence as the shadow file #1849 names — it is
# INERT when context = repo root, ACTIVE when context = the subdirectory
# itself (BuildKit additive sub-context feature). Walks the real working
# tree and names every `.dockerignore` not at the root. Mirrors
# quality-gate.yml::no-subdir-dockerignore (unconditioned job, same binary).
ci-no-subdir-dockerignore:
  @echo "=== [gate] no .dockerignore outside the repo root (#1891) ==="
  pnpm --filter scripts-ts exec vitest run src/check-no-subdir-dockerignore.test.ts
  node ./packages/scripts-ts/src/check-no-subdir-dockerignore.ts

# Install exactly as CI does (supply-chain policy: frozen + no lifecycle scripts)
ci-install:
  @echo "=== [gate] install (frozen lockfile, no scripts) ==="
  node apps/front/scripts/run-guarded.mts apps/front/scripts/guards/assert-pinned.mts
  pnpm install --frozen-lockfile --ignore-scripts
  pnpm --filter @org/shared-ts run postinstall

# Formatting (repo-wide oxfmt --check, exactly as both workflows run it),
# plus the #1875 formatter-scope guard: the vitest file asks oxfmt itself
# which files each package.json format glob would process against the real
# .oxfmtrc.json, so an ignorePatterns entry that silently swallows a directory
# the globs enumerate fails the gate naming the directory. Mirrors
# quality-gate.yml::quality::Check formatter scope (#1875).
ci-format: format
  pnpm --filter scripts-ts exec vitest run src/check-formatter-scope.test.ts
  @echo "=== [gate] format (done) ==="

# Lint exactly the scope CI lints.
#
# Deliberately NOT `just lint`, which runs `oxlint --quiet .` over the whole
# repo. Issue #803 owns broadening that scope and resolving the remaining
# repo-wide errors. Until then, this gate mirrors the narrower CI lint step
# exactly — apps/front, packages/shared-ts, and (since #1017 closed the gap
# where packages/scripts-ts/ had no CI lint coverage at all) packages/scripts-ts/. See
# docs/guides/local-ci-gate.md.
ci-lint:
  @echo "=== [gate] lint ==="
  node packages/scripts-ts/src/lint-front.ts --quiet
  node packages/scripts-ts/src/check-no-floating-promises.ts
  pnpm lint:disables
  pnpm check:frontend-barrels
  pnpm --filter @org/lint-ts test

# Knip (issue #455): unused files/deps/devDeps/binary invocations, unlisted
# deps, unused exports/types, and duplicate exports. Mirrors the
# quality-gate.yml::quality::Knip step (same `pnpm exec knip`, same root
# knip.ts). Exit 0 is the contract; every exception must be a scoped entry
# with a reason in knip.ts, never a blanket ignore.
ci-knip:
  @echo "=== [gate] knip (unused exports & dependencies) ==="
  pnpm exec knip

# @org/shared-ts: typecheck + vitest (issue #1270). The package ships the
# repo-wide logger, i18n, query-factory and ApiFailure contracts consumed by
# every front surface, but nothing standing verified it after its i18next
# range moved two majors (#1262) — no typecheck script and no gate ran its 82
# vitest tests. Both now run here and in quality-gate.yml::quality, exactly
# as CI runs them.
ci-shared-ts:
  @echo "=== [gate] @org/shared-ts typecheck + tests ==="
  pnpm --filter @org/shared-ts typecheck
  pnpm --filter @org/shared-ts test

# @org/lint-ts: typecheck (issue #1600). The package ships the repo's custom
# publy/* oxlint rules that guard every front surface, but nothing verified
# its own types — only its vitest tests ran (via ci-lint). The typecheck script
# now runs here and in quality-gate.yml::quality, exactly as CI runs it.
#
# Since #1692, also typechecks @org/client-ts (the Kiota-generated TypeScript
# API client). Its typecheck script was added to packages/client-ts/package.json
# but was never wired into any CI step or local gate — trompe-l'oeil coverage.
# Now runs here and in quality-gate.yml::quality, exactly as CI runs it.
ci-lint-ts:
  @echo "=== [gate] @org/lint-ts + @org/client-ts typecheck ==="
  pnpm --filter @org/lint-ts typecheck
  pnpm --filter @org/client-ts typecheck

# front: build, bundle guards, smoke start, typecheck, design system, unit tests
ci-front:
  @echo "=== [gate] front build + checks ==="
  pnpm --filter front build
  pnpm --filter front verify:build
  pnpm --filter front smoke:start
  pnpm --filter front typecheck
  pnpm --filter front check:design-system
  # #1769: refuse ColumnDef/Row/TanStackTable imported from
  # @tanstack/react-table or @tanstack/react-table/legacy — the passthrough at
  # apps/front/src/components/table/column-type.ts is the only sanctioned
  # source. Without this, a developer who imports the v9 root types instead
  # of the passthrough gets twenty TS7031 errors very far from the cause
  # (this is the third occurrence: #1627, #1737).
  pnpm --filter front check:column-type-imports
  # #1822: real-artifact guard — `srvx/static` renamed its `serveStatic`
  # named export to `staticMiddleware` in 0.12.7. The pre-#1628 import
  # `import { serveStatic } from 'srvx/static'` would throw at module
  # load and crash the front server at startup, surfacing as the
  # publish-now e2e timing out on a `toBeVisible` (Traefik 502 over the
  # down upstream). This guard parses server.mjs with ts-morph, loads
  # the real installed srvx/static, and asserts every imported name
  # resolves — without it, a future rename would re-open the same
  # shape behind the next dependabot srvx bump.
  pnpm --filter front check:server-static-imports
  pnpm --filter front test:server-static-imports-guard
  # Built-artifact guard (#1234): proves the React Compiler actually ran on
  # the dist produced above (runtime chunk present, compiled-module count
  # >= floor). Same pattern as check:design-system: a step of `pnpm --filter
  # front test` AND an explicit front-ci.yml::supply-chain step.
  pnpm --filter front check:react-compiler
  pnpm --filter front test
  # #1948: the 4-way vitest shard matrix must partition the suite exactly
  # once. Reads the REAL discovery of every shard (`vitest list --shard=i/n`)
  # and the unsharded suite, and fails if any file is lost, duplicated, or
  # invented by the matrix. Mirrors front-ci.yml::test-vitest-coverage.
  pnpm --filter front test:vitest-shard-coverage
  just test-preuves
  # end of front front-ci.yml::supply-chain parallel block (Test front step)
  @echo "=== [gate] production dependency audit (mirrors front-ci.yml::supply-chain) ==="
  pnpm audit --prod --audit-level=moderate

# Run paired preuve red tests via vitest.preuves.config.ts.
#
# These tests are EXPECTED TO FAIL — each proves a bug is present by failing
# against the corrected code. This recipe runs ONLY the proof tests that the
# current PR declares (files added/modified under apps/front/tests/proofs/).
# If the PR declares no proofs, the recipe prints an explicit no-op message
# and exits 0 — this is NOT a silent success, it states what was checked.
#
# The proof files are versionned under apps/front/tests/proofs/ (committed to
# the repo), so CI can always see them — unlike .dump/ which is git-ignored.
# The developer replay path is `just test-preuves` in the lane worktree
# (where .dump/ traces also exist). CI runs the same command on a clean
# checkout.
#
# `pnpm run prepare` runs first: it wires core.hooksPath to the versioned
# .husky dir (packages/scripts-ts/src/install-git-hooks.ts), so the replay
# exercises the real pre-commit pipeline on real worktrees — mirroring the
# front-ci.yml::supply-chain "Install Git hooks (mirrors prepare)" step.
test-preuves:
  @echo "=== [gate] paired red proofs (expected to fail) ==="
  pnpm run prepare
  pnpm --filter front test:preuves

# Quality gate (issue #803): repo-wide oxlint + oxfmt check + .NET warnings-as-errors + analyzer tests.
# Mirrors .github/workflows/quality-gate.yml::quality — fails PRs on any oxlint diagnostic
# (pnpm lint is repo-wide oxlint --quiet + lint:disables + frontend-barrels, pnpm format is
# oxfmt --check) and on any .NET analyzer / code-style warning (Directory.Build.props sets
# TreatWarningsAsErrors + EnforceCodeStyleInBuild, so a restore+build of PublyApp.slnx is the gate).
# Composes ci-format (pnpm format) instead of restating it so `just ci` (which already
# runs ci-format/ci-lint) does not run the same format check twice.
ci-quality: ci-format ci-quality-dotnet test-analyzers
  @echo "=== [gate] quality (lint + format + dotnet build + analyzers) ==="
  pnpm lint

# .NET solution build with warnings-as-errors (the quality gate's dotnet half).
# APP_ROLE + TRUSTED_PROXY_CIDRS pinned for the same reason as build-api: `dotnet build`
# boots the app to emit openapi.json and AppEnvironment requires APP_ROLE in Production.
ci-quality-dotnet $APP_ROLE="api" $TRUSTED_PROXY_CIDRS="127.0.0.1/32" $SOCIAL_ACCOUNTS_MASTER_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=":
  dotnet restore PublyApp.slnx
  dotnet build PublyApp.slnx --no-restore

# openapi.json + client-ts determinism, then the OpenAPI contract spec
ci-spec-drift:
  @echo "=== [gate] openapi + client drift ==="
  dotnet tool restore
  just build-api-full
  node ./packages/scripts-ts/src/check-tree-clean.ts apps/api/openapi.json
  just generate-client
  node ./packages/scripts-ts/src/check-tree-clean.ts packages/client-ts
  cd {{api_dir}} && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~OpenApiContractSpec"

# front e2e: docker stack + playwright (e2e only; `just ci-full` runs this)
#
# The stack is reset up front rather than only torn down at the end. CI tears
# down with `if: always()`, which a justfile cannot express — `just` stops at the
# first failing line, so a Playwright failure would skip the teardown. Resetting
# first makes the recipe idempotent regardless of how the last run ended, and
# leaving a failed stack up is what you want locally anyway: you can inspect it.
#
# Per-worktree isolation (#1642): docker compose indexes on the project name,
# not the file path. Without a per-worktree name, `down -v` from one tree
# destroys another tree's stack. The e2e-compose-env script derives a stable,
# worktree-specific project name and port offsets so multiple trees can run
# independent stacks simultaneously. CI sets COMPOSE_PROJECT_NAME explicitly
# (via E2E_IMAGE_TAG, which is unique per run) so CI stacks never collide either.
ci-e2e-front:
  @echo "=== [gate] front e2e (docker + playwright) ==="
  @eval "$(node apps/front/scripts/e2e-compose-env.mts)" || { echo "Failed to derive e2e compose environment"; exit 1; }
  docker compose -f apps/front/docker-compose.test.yml down -v --remove-orphans
  docker compose -f apps/front/docker-compose.test.yml up -d --build --wait --wait-timeout 180
  pnpm --filter front exec playwright install chromium
  E2E_BASE_URL="$E2E_BASE_URL" E2E_API_BASE_URL="$E2E_API_BASE_URL" pnpm --filter front exec playwright test
  # Round 19 I3: the drawer-description contrast source guard launches
  # Chromium itself, so it runs in this browser-provisioned lane exactly as CI
  # runs it (front-e2e.yml shard 4) — through the same package script.
  pnpm --filter front test:drawer-contrast
  docker compose -f apps/front/docker-compose.test.yml down -v


# Everyday pre-push gate (no e2e). Fails on the first red sub-gate.
ci: ci-drift ci-migration-expand-contract ci-review-worktree-resolution ci-doc-links ci-jscpd ci-deploy-env-docs ci-project-closure-adapter ci-no-ignored-tracked ci-dockerignore-shadow ci-install ci-format ci-lint ci-lint-ts ci-knip ci-shared-ts ci-quality ci-front ci-spec-drift nuget-audit test-api
  @echo ""
  @echo "=== just ci: PASSED ==="
  @echo "Not covered here: the two e2e suites (run 'just ci-full')."

# Full gate: `just ci` plus both e2e suites.
ci-full: ci ci-e2e-front
  @echo ""
  @echo "=== just ci-full: PASSED ==="

# =============================================================================
# Code generation
# =============================================================================

# Generate API response translation key constants
generate-response-keys:
  dotnet run --project {{scripts_cs_dir}}/PublyApp.Scripts.csproj -- generate-translation-keys {{shared_dir}}/src/lib/i18n/json/response-message.en.json {{api_dir}}/Localization/ResponseKeys.g.cs

# =============================================================================
# Client generation (Kiota)
# =============================================================================

# Build API + generate TypeScript client from OpenAPI
# APP_ROLE pinned for the same reason as build-api: this `dotnet build` boots the app to
# regenerate openapi.json before kiota reads it (design §3.1 item 3).
generate-client $APP_ROLE="api" $SOCIAL_ACCOUNTS_MASTER_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=":
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
  node -e "const fs=require('fs'); const rm=(x)=>fs.rmSync(x,{recursive:true,force:true}); const glob=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).filter((x)=>x.isDirectory()).map((x)=>`${dir}/${x.name}/.artifacts`):[]; ['node_modules','apps/api/node_modules','packages/shared-ts/node_modules','packages/client-ts/node_modules','packages/scripts-cs/bin','packages/scripts-cs/obj'...glob('apps'),...glob('packages')].forEach(rm)"

# Clean API artifacts
clean-api:
  cd {{api_dir}} && dotnet clean
  node -e "const fs=require('fs'); const p=(x)=>fs.rmSync(x,{recursive:true,force:true}); ['apps/api/.artifacts'].forEach(p)"


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

# Convenience: setup dev env (install + apphost)
dev-setup: install dev-services
  @echo "Development environment ready!"
  @echo "The Aspire AppHost is running the API, worker, and front."

# Convenience: quick-start (install + apphost)
quick-start: install dev-services
  @echo "Aspire AppHost started — API on http://localhost:5000, front on http://localhost:5050"
