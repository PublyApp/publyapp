# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## AI Orchestration

For multi-task orchestration, follow `~/ai-orchestration-playbook/PLAYBOOK.md`
and this repo's adapter at [`.ai/orchestration-adapter.md`](.ai/orchestration-adapter.md).

## Project Overview

PublyApp is a modern full-stack multi-tenant SaaS application built with .NET 10.0 and React 19. The monorepo architecture uses Turborepo and pnpm workspaces with three user scopes: Staff (platform administrators), Tenant (organization-level users), and Project (project-level users).

## Development Commands

### Starting Development Servers

```bash
# Preferred: the full local stack in one command — the Aspire AppHost runs a
# persistent Postgres (host port 5454, named data volume), the API (5000), the
# worker, and the front dev server.
just dev-db

# Alternative, without the AppHost (each in its own terminal):
#   just db-migrate          # or: just dev-api-migrated (migrate + start API)
#   just dev-api             # API with hot reload (5000)
#   just dev-front           # frontend (TanStack Start dev server, 5050)
```

Do NOT run `just dev-api` (or `just dev-api-migrated`) alongside `just dev-db`: the
AppHost already runs the API on port 5000, and a second API would fail to bind it.

Drive `apps/front` — the app that actually ships — with `just dev-front`, `just review-front <pr-or-issue-number>`, `pnpm --filter front <script>` or the `just ci-front` gate. See also the retired-app note below.

Since #885, the API waits for pending migrations but does not apply them. Run
`just db-migrate` first, or use `just dev-api-migrated` to migrate and start the API.

**Windows note:** the repo `justfile` uses PowerShell 7 (`pwsh`) on Windows (not Windows PowerShell 5.1).

### Configuration (AppEnvironment)

The API reads configuration exclusively from environment variables via `AppEnvironment` (`apps/api/Lib/AppEnvironment.cs`).

- Repo-root `.env.example` is the committed template; copy it to `.env.development` for local
  development. The API loads only `.env.development`, when the host environment is `Development`
  (and, for config values only, when it is unset), then validates the resulting environment
  variables. A local `.env.production` may be **gitignored** as a manually imported personal
  reference, but the application does not consume it. Deployed variables come from the active PaaS
  configuration/secrets service (Dokploy today). Real env files must never be committed — keep the
  committed template in sync when you add a variable.
- `dotnet build` runs the app during OpenAPI document generation. When `ASPNETCORE_ENVIRONMENT`/`DOTNET_ENVIRONMENT` are unset, the host environment resolves to **Production**, where `APP_ROLE` is required and a missing value fails fast — loading `.env.development` supplies config values but does **not** change that classification. So a bare `dotnet build` requires `APP_ROLE=api`; always build through the pinned `just` recipes (`just build-api`, `just generate-client`, `just db-*`), which export `APP_ROLE=api`.
- Keep secrets out of the repo: `.env.example` carries placeholders for genuine secrets and safe defaults for local Compose; real values live in your local `.env.development`, in the deployment platform's env management, or in CI secrets.

### Building

```bash
just build-api                     # Build .NET API
pnpm --filter front build          # Build the shipped frontend for production
just deploy-images                 # Build + push the three GHCR release images
```

Releases use
`just deploy-images` to build and push the `api`, `migrate`, and `front` images from a clean
checkout.

### Code Quality

```bash
just check-write                       # Run oxlint + oxfmt (auto-fix)
pnpm --filter front typecheck          # TypeScript type checking (front)
just knip                              # Check for unused dependencies
```

Dependency health (Dependabot + `pnpm audit`): [`docs/guides/dependency-health.md`](docs/guides/dependency-health.md).

### Git hooks — active in every worktree, no manual step (issue #1852)

The hooks are **versioned** in `.husky/`: `pre-commit` runs lint-staged
(auto-formats staged files), `pre-push` blocks direct pushes to protected
branches. They are wired automatically — the root `prepare` script runs
`packages/scripts-ts/src/install-git-hooks.ts`, which points `core.hooksPath`
at the versioned `.husky` dir in the clone's **shared** git config. Every
existing and newly created worktree of the clone inherits that setting
immediately, so commits are formatted in every worktree with zero per-worktree
setup. The previous husky-generated `.husky/_` scheme silently left fresh
worktrees with no hooks at all (three PRs went red on it); do not reintroduce a
generated hooks directory. The installer fails loudly when it cannot wire the
hooks. CI wires hooks explicitly via the front-ci.yml `supply-chain` job step
"Install Git hooks (mirrors prepare)" (`pnpm run prepare`).

### Database Operations

```bash
just db-migrate                # Run EF Core migrations
just db-add MigrationName      # Add new migration
just db-reset                  # Drop and recreate database
just db-remove                 # Remove last migration
```

### API Client Generation

After backend changes that modify the API contract:

```bash
just generate-client    # Generate TypeScript client from OpenAPI
```

This is critical - the frontend TypeScript client is auto-generated from the backend OpenAPI spec.

### Running Tests

```bash
just test-api                  # Run API integration tests (requires Docker)
pnpm --filter front test       # Run the front unit/component suite (Vitest)
```

**Prerequisites:** Docker must be running (Testcontainers spins up Postgres automatically).

### Pre-push gate

```bash
just ci                # Mirror of CI (no e2e) + the full API suite — run before pushing
just ci-migration-expand-contract # New migration safety gate for expand/contract DB rollout
just ci-full           # just ci + both e2e suites
```

**CI runs the API suite since #1462** (`api-tests.yml` runs `just test-api` as the
required `api-tests-gate` PR check), so `just ci` mirrors it locally rather than
exceeding CI on the backend.
`just ci-drift` fails if a workflow gains or changes a step the local gate has not been
reconciled against — never bump a hash in `packages/scripts-ts/src/ci-gate-manifest.json` without reading
the step it points at. Full details, exemptions, and known gaps:
[`docs/guides/local-ci-gate.md`](docs/guides/local-ci-gate.md)

```bash
# Run a specific test class
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~PasswordLoginSpec"

# Run a specific test method
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "ItShouldReturnSessionTokenWithValidCredentials"

# Run a single front test file (`pnpm ... test` is a chain of guards, so call vitest directly)
pnpm --filter front exec vitest run src/components/ui/avatar.test.tsx
```

For the full guide on writing and debugging integration tests, see [`docs/guides/api-integration-tests.md`](docs/guides/api-integration-tests.md).

For when a change needs an end-to-end test (the five criteria) and the tag vocabulary, see [`docs/guides/e2e-coverage.md`](docs/guides/e2e-coverage.md) and [`docs/guides/e2e-tags.md`](docs/guides/e2e-tags.md).

## Architecture

### Monorepo Structure

```
apps/
├── api/              # .NET 10.0 Web API backend — also the worker (APP_ROLE=worker) and migrator
└── front/            # THE frontend: TanStack Start + Base UI + Tailwind v4 (deployed)

packages/
├── shared-ts/        # Shared TypeScript utilities, validations, i18n
│   └── src/              # source code (lib/, utils/, validations/, types/, @types/, scripts/)
├── client-ts/        # Auto-generated TypeScript API client
├── lint-ts/          # Custom oxlint/ESLint rules (@org/lint-ts)
├── lint-cs/          # Custom Roslyn analyzers (PublyApp.Analyzers)
├── scripts-cs/       # Codegen tooling (PublyApp.Scripts)
└── _tsconfig/        # Shared TypeScript configurations
```

There is **no `apps/jobs`**. Background jobs shipped inside the API project (`apps/api/Modules/Jobs`)
and run as a separate deployed process off the **same API image** with `APP_ROLE=worker` — see
`dokploy.yml`.

`apps/old-front` was retired on 2026-08-22 (tag `old-front-final`).
All frontend work happens in `apps/front`; the retired app's source lives only at tag `old-front-final`, not in this tree.

### Backend Architecture (Vertical Slice, Domain-First)

The backend follows **Vertical Slice Architecture** using a **domain-first** module layout:

```
apps/api/Modules/<Domain>/
├── Entities/                     # EF Core entities for the domain
├── Services/                     # Domain services (business logic)
├── Seeders/                      # Seeders for the domain
├── Permissions/                  # Permission definitions (used by seeder)
├── Endpoints/                    # Minimal API mappings (by route scope)
└── Handlers/                     # Request handlers (CQRS-lite)
    ├── Anonymous/                # Public/auth-free handlers
    ├── Staff/                    # Staff-only handlers
    └── Tenant/                   # Tenant-scoped handlers
```

**Key Patterns:**
- **CQRS-lite**: handlers per operation (create/find/get/update/delete)
- **Minimal APIs**: endpoints map routes and attach filters/permissions
- **FluentValidation**: automatic body/query validation via endpoint extensions
- **Response Format**: errors return RFC 7807 via `TypedProblems.*`; Create success → 201 `Created<T>` with entity DTO; Update success → 200 `Ok<T>` with entity DTO; Delete/action-only success → 200 `Ok<ApiResponse>` with message + translationKey
- **Namespace discipline**: `IDE0130` is treated as error — file namespace must match its folder path

**Finding Backend Code:**
- Domain modules (preferred): `apps/api/Modules/<Domain>/` (e.g. `Auth`, `Users`, `Invitations`)
- Legacy (migration in progress): `apps/api/Modules/{Shared,Staff,Tenant}/` (do not add new code here unless you're migrating existing slices)
- Cross-cutting utilities/middleware: `apps/api/Lib/`
- Infrastructure services (email, storage, etc.): `apps/api/Infrastructure/`

### API Module Structure Rules

For the complete module structure rules (module organization, junction entities, infrastructure placement,
slice boundaries, permission enforcement, vertical slice design principles, and decision tree), see:
[`docs/guides/api-module-structure.md`](docs/guides/api-module-structure.md)

**Key principles (always apply):**
- Domain-first modules: `apps/api/Modules/<Domain>/` — route scope expressed via handler folders + endpoint groups
- Junction entities live with their **primary entity**'s domain
- Pure junction entities use a composite primary key made from their foreign keys; do not inherit
  `BaseAttributes`, do not add a surrogate `id`, and do not add `is_deleted`/`deleted_at`.
  Unassignment hard-deletes the junction row; history belongs in audit logs.
- Infrastructure services go in `Infrastructure/`, domain services in `Modules/<Domain>/Services/`
- Split by actor (Staff/Tenant) when auth/security boundary differs; share handler when only permission differs
- Enforce permissions at the route level with `.WithPermission()` (Pattern 1, preferred)
- `AGENTS.md` + its referenced guide files are the single source of truth for architecture rules

### Architecture Details

For detailed documentation on business rules, database layer, authentication, and i18n, see:
[`docs/guides/architecture-details.md`](docs/guides/architecture-details.md)

For the social accounts master key (`SOCIAL_ACCOUNTS_MASTER_KEY`), the boot canary that
verifies it, its one structured pass log line, and the db-less OpenAPI build path where the
canary is skipped, see: [`docs/guides/social-accounts.md`](docs/guides/social-accounts.md)

For upload admission control (durable byte budgets reserved atomically before a file is
opened) and the `UploadAsset` lifecycle with atomic reference transitions (no TOCTOU
deletes), see: [`docs/guides/uploads.md`](docs/guides/uploads.md)

**Key facts (always apply):**
- Staff/Tenant mutual exclusivity: a `User` can only have accounts of ONE scope type (Staff or Tenant/Project, never both); suspended accounts still count
- PostgreSQL 18 with UUID v7 PKs, soft deletes (`IsDeleted`), and audit tracking
  (`CreatedAt`/`UpdatedAt`/`DeletedAt`) for normal entities via `BaseAttributes`;
  pure junction entities use composite foreign-key primary keys with manual timestamps instead
- Session-based auth via `X-Session-Token`; permission-based authorization via `PermissionFilter`
- Middleware order: Security headers → Exception handling → CORS → Tenant header → Session header → Session auth → Staff auth

### Frontend Architecture (`apps/front` — TanStack Start)

`apps/front` is the only frontend under development and the only one deployed. The normative
guides are:

[`docs/guides/front/index.md`](docs/guides/front/index.md) — stack, commands, layout, and how
front is organized.
[`docs/guides/front/conventions.md`](docs/guides/front/conventions.md) — rendering strategy,
server-function boundary, URL state, error views/logout, mutation feedback ownership, route-local
file naming, and the owner-ratified product UI design preferences.
[`docs/guides/front/context-chunk-isolation-guard.md`](docs/guides/front/context-chunk-isolation-guard.md)
— the context chunk isolation build gate: how it detects contexts, and the hand-maintained
inventory that adding, renaming, moving, or deleting a React context must update.

**Routing:** routes are declared in the virtual route config `apps/front/src/routes.ts` (not
file-based discovery); `routeTree.gen.ts` is generated. A route-local file that must not become a
route is prefixed with `_`.

**State Management Strategy:**
```
Server State     → TanStack Query (API data, caching, mutations)
Global State     → Zustand (UI state — `apps/front/src/lib/store/ui-store.ts`)
URL State        → TanStack Router search params, snake_case keys (q, sort_id, sort_order, cursor, size)
Form State       → React Hook Form + Zod
```

**Key rules (always apply):**
- Marketing and auth surfaces are SSR; authenticated surfaces are CSR (`ssr: false`) and fetch
  application data in the browser via TanStack Query + the Kiota client
- Never fetch authenticated domain data in a server loader or a server function
- `createServerFn` is for frontend-server concerns only (cookie read/write, the session-setting
  login call, i18n resource loading). It is **not** a BFF, and it must never return a raw cookie or
  session token
- URL query parameter names stay snake_case (see the API contract naming split below)
- Only `401` on an authed surface triggers logout; a `401` on the auth surface shows the auth error
  view without logging out; `403` never logs out

### RFC 7807 + Frontend Logout Semantics (Do Not Regress)

**Backend invariants:**
- Error responses must be RFC 7807 `application/problem+json` via `TypedProblems.*` and the `App*HttpResult` types.
- `422` is for validation problems and must include `errors: Dictionary<string, string[]>` with stable keys.
- `401` must be reserved for **invalid/missing session** only (frontend treats `401` as "logout now").
- Tenant header issues should not return `401` (use `400`/`422` as appropriate).
- Never log secrets: do not log `X-Session-Token` (or any session token value) in any log level.

**Frontend invariants:**
- Only `401` triggers centralized logout; `403` must not log users out.

### API Routes & Endpoint Path Design

For the complete route design guide (staff/tenant/anonymous route structures, design principles,
route constants, handler naming conventions, and adding new domain slices), see:
[`docs/guides/api-route-design.md`](docs/guides/api-route-design.md)

For endpoint rate-limit buckets, policy assignment, opt-out rules, and environment knobs, see:
[`docs/guides/api-rate-limiting.md`](docs/guides/api-rate-limiting.md)

For route parameter conventions (no route constraints, ID validation pattern), see:
[`docs/guides/api-route-parameters.md`](docs/guides/api-route-parameters.md)

**Key principles (always apply):**
- Staff API: `/staff/...` with explicit `{tenantId}` in path
- Tenant API: `/...` (root) with implicit tenant from `X-Tenant-Id` header
- Anonymous: `/auth/...`, `/invitations/...`
- Symmetry: same resource names in both APIs (`users`, `invitations`, `posts`)
- Handler suffixes: `*ForStaff`, `*ForTenantAsStaff`, `*ForTenant`, `*Anonymous`
- **Never** use route constraints (`:guid`, `:int`) on ID parameters — validate with `Guid.TryParse` in handlers; malformed ID → `BadRequest` (400), entity not found → `NotFound` (404)
- **API contract naming split**:
  - Internal .NET symbols stay **PascalCase** (`UpdatedAt`, `SortId`, `UserId`)
  - Database column names stay **snake_case** via EF mappings (`updated_at`)
  - JSON body/response fields stay **camelCase** unless a deliberate contract migration says otherwise
  - URL/query parameter names use **snake_case** (`sort_id`, `sort_order`, `updated_at`)
  - Multi-word wire-format option values also use **snake_case** (`created_at`, `user_account_count`)
  - Never use collapsed lowercase wire values like `updatedat`

## Frontend Coding Standards

Frontend work means `apps/front`. It uses `@base-ui/react` primitives wrapped by a local
`src/components/ui/*` layer (`cva` + `tailwind-merge`) on **Tailwind v4** — no MUI, no `sx`, no
HeroUI. The normative sources are
[`docs/guides/front/index.md`](docs/guides/front/index.md) and
[`docs/guides/front/conventions.md`](docs/guides/front/conventions.md); the latter carries the
owner-ratified product UI design preferences (elevation, radius, destructive-action placement,
primary-CTA consistency, tables, selection mode, empty/error states, navigation).

Additional repo-specific preferences for AI assistants (to reduce review churn):
[`docs/guides/ai-agent-preferences.md`](docs/guides/ai-agent-preferences.md)

The product's design language (tokens, the `components/ui/*` layer, interaction conventions, dark
mode, i18n/copy rules, and the guards that enforce them) is distilled in the root
[`DESIGN.md`](DESIGN.md), written for designers and agents who must match the product without
reading the code.

**Key principles (always apply):**
For the complete list of custom lint rules with severity and source, see [`docs/guides/lint-rules.md`](docs/guides/lint-rules.md).

- Compose UI from the local `apps/front/src/components/ui/*` wrappers over Base UI primitives; style with Tailwind utility classes through `cn()` (`apps/front/src/lib/utils.ts`). Do not reach into Base UI protected/internal APIs.
- Design-token discipline is machine-checked — `pnpm --filter front check:design-system` runs in `just ci-front` and in `pnpm --filter front test`.
- Every z-index utility in `apps/front/src` must route through the `--publy-z-*` scale — machine-checked by the z-index guard's fixture-suite live-tree scan, which runs inside `pnpm --filter front test` (part of `just ci-front`); the standalone `pnpm --filter front check:zindex` CLI runs the same guard on demand. See [`docs/guides/front/z-index-guard.md`](docs/guides/front/z-index-guard.md) for the invariant, the mechanism, and the explicitly stated out-of-scope gaps.
- Every production `<Trans>` call site under `apps/front/src` must have a spec in the real-`<Trans>` render guard (`src/lib/i18n/trans-render.guard.test.tsx`, pinned into CI) — a new call site without one turns the suite red naming `file:line`. A spread-only `<Trans {...props} />` IS discovered (not a blind spot); the only residual gap is a `Trans` re-exported through a local module. Boundaries are pinned by tests — see [`docs/guides/front/conventions.md`](docs/guides/front/conventions.md) ("<Trans> render guard").
- No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or `Object.groupBy` (enforced by `publy/no-array-reduce`).
- Never import dayjs directly in components (enforced by `publy/no-direct-dayjs-in-components`).
- No IIFEs — extract a named function or compute the value with preceding statements (enforced by `publy/no-iife`).
- React Hook Form + Zod for form validation; go through the front form/field wrappers rather than wiring `register()` onto raw inputs.
- Loading/empty/error states use the front state components (`state-view.tsx`, `state-surface.tsx`, `skeleton.tsx`) — never ad-hoc conditional rendering per page.
- **Entity images and avatars:** preserve the real image when one exists and keep the intended aspect ratio. When there is genuinely no image, an **entity identity** surface — a person or an organization — falls back to initials on a deterministic, name-hashed colour from the `--publy-avatar-1`…`--publy-avatar-8` palette with `--publy-avatar-foreground` text (`paletteIndex()` in [`apps/front/src/components/ui/avatar-initials.ts`](apps/front/src/components/ui/avatar-initials.ts), applied via [`apps/front/src/components/ui/person-avatar.tsx`](apps/front/src/components/ui/person-avatar.tsx)). That colour is **identity, not decoration**: it is what distinguishes two photoless people in the same list and makes one person recognizable across a table row, a drawer, and the account menu — a uniform grey column carries no information at all. The palette is WCAG-pinned against fixed white text and deliberately theme-invariant, so do **not** swap it for muted tokens, and do **not** give it an `html.dark` counterpart (see `THEME_INVARIANT_TOKENS` in [`apps/front/scripts/guards/check-design-system.mts`](apps/front/scripts/guards/check-design-system.mts) and the contrast guard in [`apps/front/src/styles/avatar-fallback-contrast.test.ts`](apps/front/src/styles/avatar-fallback-contrast.test.ts)). Neutral muted tokens remain correct for fallbacks that are **not** entity identity. Build on the stable `Avatar`/`AvatarImage`/`AvatarFallback` primitive layer in [`apps/front/src/components/ui/avatar.tsx`](apps/front/src/components/ui/avatar.tsx), whose image preserves a square cover crop and whose bare fallback stays neutral for those non-identity consumers. **front has no `<Image>` primitive** — do not import one, and do not invent one as a side effect of another task; if a non-avatar content-image need appears, raise it as its own change rather than sprawling raw `<img>` tags. Raw `<img>` is acceptable only for the brand wordmark/logo and inline SVGs, as it is used today in the layouts.
- **React Doctor HARD gate:** a PR must not leave any React Doctor finding in a file it changes. Run `just react-doctor` before pushing. CI enforces this via `.github/workflows/react-doctor.yml` (`--scope files --blocking warning`). Full guide: [`docs/guides/react-doctor.md`](docs/guides/react-doctor.md).
- Bulk-action items on list-page selection menus always render — never `disabled`, never conditionally hidden by per-row eligibility; ineligible clicks show an i18n toast. The trigger button gates on `BULK_ACTION_MAX_COUNT`. See [`docs/guides/bulk-action-ux-conventions.md`](docs/guides/bulk-action-ux-conventions.md) (its backend/UX policy is normative; its old MUI-era `apps/old-front` code snippets died with that retired app).

`apps/old-front` was retired on 2026-08-22 (tag `old-front-final`). The MUI/`sx` standards that governed it are archived, not deleted as guidance — see git history or that tag for the retired patterns.

**Enabled `publy/*` lint-rule scopes** (the configuration sets each of these to `error`):

- All linted JavaScript/TypeScript: `no-array-reduce`, `no-iife`,
  `prefer-specific-lodash-imports`, and
  `no-manual-response-message-translation`.
- `no-console-in-source`: source files under `apps/front/src` and `packages/shared-ts`, excluding tests/specs, shared package scripts, and CLI files.
- `no-direct-dayjs-in-components`: TSX files under `apps/front/src` `components/`, `_parts/`, `_components/`, or `routes/` source paths.
- `no-raw-mui-textfield-register`, `no-native-html-in-mui-surfaces`, `no-raw-img-in-product-surfaces`: **deleted** with #1172 — their only target was the retired `apps/old-front` (MUI). The raw `<img>` policy for front above is a review rule, not a lint rule.

`publy/no-op` is off; `publy/arrow-function-components` is enforced at `error` in front
(#1210): arrow components; class methods stay methods — `this` binding.

## JavaScript/TypeScript Conventions

**Key principles (always apply):**
For the complete list of custom lint rules with severity and source, see [`docs/guides/lint-rules.md`](docs/guides/lint-rules.md).

- Prefer targeted `lodash/*` helpers over built-in JavaScript methods when the lodash helper provides safer runtime handling for nullish or invalid inputs
- Import specific helpers such as `lodash/map`, `lodash/trim`, `lodash/isEqual`, and `lodash/capitalize` instead of the full `lodash` package (enforced by `publy/prefer-specific-lodash-imports`)

## C# Coding Standards

For the complete C# coding standards (null checking, LINQ, async/await, handler architecture,
DTOs, service layer, DI rules, API responses, formatting, and more), see:
[`docs/guides/csharp-coding-standards.md`](docs/guides/csharp-coding-standards.md)

For FluentValidation conventions (shared extension methods, pagination validators, encrypted-ID queries), see:
[`docs/guides/validator-conventions.md`](docs/guides/validator-conventions.md)

For the repo-wide .NET project layout (placement under `apps/` vs `packages/*-cs`, co-located `*.Spec.cs` tests, the `Tests/` runner shell, `PublyApp.*` naming, and centralized `Directory.Build.props`/`.targets`/`Directory.Packages.props`), see:
[`docs/guides/dotnet-project-layout.md`](docs/guides/dotnet-project-layout.md)

**Key principles (always apply):**
For the complete list of custom lint rules with severity and source, see [`docs/guides/lint-rules.md`](docs/guides/lint-rules.md).

- Pattern matching for null checks (`is null` / `is not null`, never `== null`) (enforced by `PUBLY0008`; expression-tree/`IQueryable` contexts are exempt — `is null` is a CS8122 error there)
- **Never** use `?? throw` — use traditional `if` guard clauses for null-then-throw patterns (enforced by `PUBLY0002`)
- **Never** use the null-forgiving operator (`!`) in production code — always handle null explicitly with guard clauses or safe accessors like `GetRequiredId()` (enforced by `PUBLY0001`)
- Guard clauses (flat `if`/early return) over `switch` expressions when handling discriminated union error results from services
- Query syntax for database LINQ queries; method syntax only for terminal ops
- Handlers orchestrate, services implement (no DbContext in handlers)
- Handler entrypoint method is `Handle` (never `HandleX`); handler class is `public sealed class <Operation>`; HTTP `Body`/`Query`/`Result`/`Response`/`Item` + `*Validator` types are top-level siblings in the handler file, never nested — see [`docs/guides/csharp-coding-standards.md`](docs/guides/csharp-coding-standards.md)
- Request body DTOs use `JsonElement` with `Get*()` methods for FluentValidation compatibility
- In handlers, cache body DTO getter results in locals when they are used 2+ times or return parsing-sensitive values like `PatchField<T>`, trimmed strings, parsed timestamps, or parsed enums (enforced by `PUBLY0006`)
- All errors use `TypedProblems.*` (RFC 7807), never `TypedResults.Forbid()`
- Services MUST NOT depend on other services (only DbContext + infrastructure)
- Use `[Service]` attribute for DI registration; `{Action}{Domain}Args` records for 3+ params;
  update `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` assertions when adding/refactoring these methods
- `PatchField<T>` for clearable nullable PATCH fields (see [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md))
- Max 100 char line length; always use braces on control flow blocks
- "Find" prefix for list/collection retrieval (not "List")
- Staff handlers MUST use `*ForStaff*` service method variants (e.g., `GetTenantByIdForStaffAsync`) — base methods filter suspended entities (enforced by `PUBLY0007`)
- Handler HTTP wire-contract types (the `Body`/`Query`/`Result`/`Response`/`Item` siblings) must not carry a `Dto` suffix (enforced by `PUBLY0004`)
- For cursor/keyset pagination, see [`docs/guides/cursor-keyset-pagination-guide.md`](docs/guides/cursor-keyset-pagination-guide.md)
- For list pages with search/filter + cursor pagination + bulk actions, see [`docs/guides/list-pages-search-filter-cursor-pagination.md`](docs/guides/list-pages-search-filter-cursor-pagination.md)
- For bulk-action UX + backend conventions (always-render menu items, batched service queries, batched audit logs, mutation-hook split try/catch), see [`docs/guides/bulk-action-ux-conventions.md`](docs/guides/bulk-action-ux-conventions.md)
- **Validators**: use `JsonElementRules.*` extension methods (never inline validation chains) (enforced by `PUBLY0005`); inherit `OffsetPaginatedQueryValidator<T>`/`CursorPaginatedQueryValidator<T>` for pagination; inherit `EncryptedIdTokenQueryValidator<T>` for encrypted-ID + token queries
- **Never** use `ToLower()` / `ToLowerInvariant()` as a comparison or dispatch strategy; use
  `StringComparison.OrdinalIgnoreCase`, `StringComparer.OrdinalIgnoreCase`, or explicit
  case-insensitive parsers/dictionaries instead (enforced by `PUBLY0003`)

## Test Conventions

For full test conventions (file naming, BDD method naming, folder structure, imports), see:
[`docs/guides/test-conventions.md`](docs/guides/test-conventions.md)
For writing and debugging integration tests, see:
[`docs/guides/api-integration-tests.md`](docs/guides/api-integration-tests.md)

**Key rules:** `*.Spec.cs` suffix, `ItShould{Expected}{Connector}{Scenario}` method names (connector = `When`/`With`/`Without`/`For`), specs co-located with source, test infra in `Lib/Testing/{Fixtures,Helpers,Fakes}/`

**Paired red/green proofs:** the test that proves a bug is present cannot stay in the suite — by
construction it FAILS against the corrected code. The convention is to keep it under
`apps/front/tests/proofs/<issue>/` (versionned, committed) and have the trace name the path plus the
mutation that reproduces the red. A PR that claims a paired red proof declares it by adding or
modifying a file under that directory; the CI step `Verify paired red proofs` replays only the
declared proofs with inverted semantics. Full rule and rationale in
[`docs/guides/test-conventions.md`](docs/guides/test-conventions.md) §"Paired Red/Green Proofs —
keeping the red test alive".

## Common Workflows

For step-by-step checklists (adding features, updating API contract, adding entities, handling permissions), see:
[`docs/guides/common-workflows.md`](docs/guides/common-workflows.md)

**Quick reference:**
- After API contract changes: `just build-api && just generate-client` (never modify `packages/client-ts/` manually)
- New entity: inherit `BaseAttributes`, implement tenant interface, add `DbSet`, `just db-add <MigrationName> && just db-migrate`
- New permission: add to `Seeder.cs`, use `PermissionFilter` on endpoint, check via `AuthContext.HasPermission()`

## Project Conventions

For detailed conventions (route naming, API response format with JSON examples, validation, error handling, logger rules), see:
[`docs/guides/project-conventions.md`](docs/guides/project-conventions.md)

**Key rules (always apply):**
For the complete list of custom lint rules with severity and source, see [`docs/guides/lint-rules.md`](docs/guides/lint-rules.md).

- Backend routes use kebab-case; constants in `RoutePath.cs` (backend) and `constants.ts` (frontend)
- Errors: `AppProblemDetails` (400/401/403/404/500) + `ValidationProblemDetails` (422) — both RFC 7807
- **Transparent failure causes (owner product rule, 2026-08-22):** every failure the backend persists or returns carries a human-readable cause and, where one exists, the next action — a `Failed`/`Paused`/`NeedsReconnect` row stores a sanitised `LastError`/cause (never a secret, never a stack trace), a job failure records the provider's classified reason, and a problem response names what went wrong in plain words. Never `Failed` with an empty reason, never a generic "something went wrong". Spec: `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md` §1.7; UI counterpart in `DESIGN.md` (error states).
- Frontend/Node: use `logger` from `@org/shared-ts/lib/logger/iso-logger` (not `console.*`) (enforced by `publy/no-console-in-source`)
- Frontend API errors: centralized via `ApiFailure` discriminated union — see [`docs/guides/frontend-error-handling.md`](docs/guides/frontend-error-handling.md)
- Frontend local mutation handlers must derive user-facing error text through `getFailureMessage(toApiFailure(error), ...)`; never translate `response-message` keys manually at the call site (enforced by `publy/no-manual-response-message-translation`)

## Development Environment

**Local access:** Frontend `localhost:5050` | API `localhost:5000` | Scalar docs `localhost:5000/scalar/v1` | Postgres `localhost:5454`
**Env vars:** `.env.example` is the only committed env file (the template).
`.env.development` is **gitignored**, is the only env file the API loads, and is used only for
Development or an unset host environment. `.env.production` may also be gitignored as a manually
imported personal reference, but is not consumed; deployed variables come from the active PaaS
configuration/secrets service (Dokploy today). Real env files must never be committed.
`AppEnvironment.Initialize()` validates the resulting runtime environment variables.
**.NET artifacts:** New .NET projects must output under a local `.artifacts/` directory.
Set `DotNetArtifactsRoot` in a project-area `Directory.Build.props` before importing the repo
root props; `Directory.Build.targets` enforces this during builds.

## Deployment

**The first-deploy operator record reports production live since 2026-07-20.** It records Dokploy
on a Hostinger VPS with the app observed in plain `docker compose` mode rather than Swarm:
GitHub → GHCR Docker images → Dokploy → Traefik SSL. `dokploy.yml` declares the service topology
but does not encode the selected Dokploy mode.

`.github/workflows/deploy-images.yml` publishes **three** image artifacts per release, all tagged
with the same commit SHA: `api` (from `apps/api/Dockerfile`, target `runtime`), `migrate` (same
Dockerfile, target `migrate`), and `front` (from `apps/front/Dockerfile`). They back four
declared services: the long-running `publyapp-api`, `publyapp-worker` (the **same API image** with
`APP_ROLE=worker`), and `publyapp-front`, plus the one-shot `publyapp-migrate`, which remains
exited after it finishes.

Operational docs: [`docs/deployment/production-deployment-design.md`](docs/deployment/production-deployment-design.md)
(why it is shaped this way), [`docs/deployment/production-deploy-runbook.md`](docs/deployment/production-deploy-runbook.md)
(migration gating + release checklist), [`docs/deployment/first-deploy-runbook.md`](docs/deployment/first-deploy-runbook.md)
(click-by-click, plus the traps that actually bit).

## OpenAPI Documentation

Interactive API docs at `/scalar/v1`. Source of truth for the API contract; drives TypeScript client generation.

## OpenAPI & Kiota Client Generation Safeguards

For the complete Kiota safeguards guide (JsonElement nullability, generic types bug, schema transformer,
client regeneration workflow, and TypeScript patterns), see:
[`docs/guides/openapi-kiota-safeguards.md`](docs/guides/openapi-kiota-safeguards.md)

**Key rules (always apply):**
- Required body fields: non-nullable `JsonElement` (not `JsonElement?`) for cleaner TypeScript types
- Never add XML comments to generic types (`<T>`) — triggers .NET 10 OpenAPI bug
- `[AsParameters]` query DTOs: never use `List<T>?` or custom `BindAsync`; use CSV `string?` + parser method for multi-value filters — see [`openapi-kiota-safeguards.md`](docs/guides/openapi-kiota-safeguards.md#query-dto-multi-value-filters)
- After DTO/endpoint changes: `just build-api && just generate-client && pnpm --filter front typecheck`
- Use `createUntypedString()` / `createUntypedArray()` for request body fields in TypeScript

## Documentation Organization

`docs/` has exactly four directories: `guides/` (standing rules), `deployment/` (production
operations), `records/` (dated, write-once records named `YYYY-MM-DD-<type>-<topic>.md`, type from
spec/plan/review/audit/spike/analysis), and `assets/`. [`docs/README.md`](docs/README.md) is the
filing index; read it before creating a document.

- **Never** place a generated doc at the repo root, and never at the `docs/` root either — always in
  one of those four directories
- A new record goes to `docs/records/` under a `YYYY-MM-DD-<type>-<topic>.md` name; never create a
  new top-level `docs/` directory
- This file links guides/deployment docs for standing policy and may also link repository
  config/source files to anchor a rule. A `docs/guides/` file this file does not link is a record,
  not a rule
- Standing rules belong in this file or a `docs/guides/` file. Plans, reviews, audits, analyses and
  change notes are records: write them once, date them, and supersede rather than retro-edit them
