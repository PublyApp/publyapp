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
# Terminal 1 - Start API with hot reload
just dev-api

# Terminal 2 - Start the frontend (front-2, TanStack Start dev server)
pnpm --filter front-2 dev

# Start PostgreSQL in Docker
just dev-db
```

**Frontend recipe naming:** these recipes directly build, run, deploy, type-check, or clean
`apps/front`, the retired app: `dev-front`, `build-front`, `build-deploy`, `deploy-front`, `deploy`,
`start-front`, `tsc-front`, `ci-front`, `ci-e2e-front`, and `clean-front`. The aggregate `ci` and
`ci-full` gates intentionally include the retired app's characterization suites, and `clean` removes
its artifacts along with the rest of the workspace. `dev-setup` and `quick-start` also print the
obsolete instruction to run `just dev-front`; ignore that final prompt. Drive `apps/front-2` — the
app that actually ships — with `pnpm --filter front-2 <script>` or the `just ci-front-2` gate.

Since #885, the API waits for pending migrations but does not apply them. Run
`just db-migrate` first, or use `just dev-api-migrated` to migrate and start the API.

**Windows note:** the repo `justfile` uses PowerShell 7 (`pwsh`) on Windows (not Windows PowerShell 5.1).

### Configuration (AppEnvironment)

The API reads configuration exclusively from environment variables via `AppEnvironment` (`apps/api/Lib/AppEnvironment.cs`).

- Repo-root `.env.example` is the committed template; copy it to `.env.development` for local
  development. The API loads only `.env.development`, when the host environment is `Development`
  (and, for config values only, when it is unset), then validates the resulting environment
  variables. A local `.env.production` would be **gitignored** but is not consumed; production
  variables come from Dokploy's environment management. Real env files must never be committed —
  keep the committed template in sync when you add a variable.
- `dotnet build` runs the app during OpenAPI document generation. When `ASPNETCORE_ENVIRONMENT`/`DOTNET_ENVIRONMENT` are unset, the host environment resolves to **Production**, where `APP_ROLE` is required and a missing value fails fast — loading `.env.development` supplies config values but does **not** change that classification. So a bare `dotnet build` requires `APP_ROLE=api`; always build through the pinned `just` recipes (`just build-api`, `just generate-client`, `just db-*`), which export `APP_ROLE=api`.
- Keep secrets out of the repo: `.env.example` carries placeholder values only; real values live in your local `.env.development`, in the deployment platform's env management, or in CI secrets.

### Building

```bash
just build-api                     # Build .NET API
pnpm --filter front-2 build        # Build the shipped frontend for production
just build-deploy                  # Build legacy Dokploy-from-source API + apps/front artifacts
just deploy-images                 # Build + push the three GHCR release images
just build-front                   # Builds apps/front (retired app) — not the release artifact
```

`just build-deploy` does not build `front-2` or the migrator image. Releases use
`just deploy-images` to build and push the `api`, `migrate`, and `front-2` images from a clean
checkout.

### Code Quality

```bash
just check-write                       # Run oxlint + oxfmt (auto-fix)
pnpm --filter front-2 typecheck        # TypeScript type checking (front-2)
just tsc-front                         # TypeScript type checking (apps/front, retired)
just knip                              # Check for unused dependencies
```

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
pnpm --filter front-2 test     # Run the front-2 unit/component suite (Vitest)
```

**Prerequisites:** Docker must be running (Testcontainers spins up Postgres automatically).

### Pre-push gate

```bash
just ci                # Mirror of CI (no e2e) + the full API suite — run before pushing
just ci-migration-expand-contract # New migration safety gate for expand/contract DB rollout
just ci-full           # just ci + both e2e suites
```

**CI never runs the API suite** (the only `dotnet test` in a workflow is the
`OpenApiContractSpec` filter), so `just ci` is a stronger backend signal than CI is.
`just ci-drift` fails if a workflow gains or changes a step the local gate has not been
reconciled against — never bump a hash in `scripts/ci-gate-manifest.json` without reading
the step it points at. Full details, exemptions, and known gaps:
[`docs/guides/local-ci-gate.md`](docs/guides/local-ci-gate.md)

```bash
# Run a specific test class
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~PasswordLoginSpec"

# Run a specific test method
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "ItShouldReturnSessionTokenWithValidCredentials"

# Run a single front-2 test file (`pnpm ... test` is a chain of guards, so call vitest directly)
pnpm --filter front-2 exec vitest run src/components/ui/avatar.test.tsx
```

For the full guide on writing and debugging integration tests, see [`docs/guides/api-integration-tests.md`](docs/guides/api-integration-tests.md).

## Architecture

### Monorepo Structure

```
apps/
├── api/              # .NET 10.0 Web API backend — also the worker (APP_ROLE=worker) and migrator
├── front/            # RETIRED React Router v7 + MUI frontend — see note below
└── front-2/          # THE frontend: TanStack Start + Base UI + Tailwind v4 (deployed)

packages/
├── shared-ts/        # Shared TypeScript utilities, validations, i18n
├── client-ts/        # Auto-generated TypeScript API client
├── lint-ts/          # Custom oxlint/ESLint rules (@org/lint-ts)
├── lint-cs/          # Custom Roslyn analyzers (PublyApp.Analyzers)
├── scripts-cs/       # Codegen tooling (PublyApp.Scripts)
└── _tsconfig/        # Shared TypeScript configurations
```

There is **no `apps/jobs`**. Background jobs shipped inside the API project (`apps/api/Modules/Jobs`)
and run as a separate deployed process off the **same API image** with `APP_ROLE=worker` — see
`dokploy.yml`.

**`apps/front` is retired-but-present.** It is not built for release and not deployed: the release
workflow builds only `apps/api/Dockerfile` and `apps/front-2/Dockerfile`, and `dokploy.yml` serves
`ghcr.io/radandevist/publyapp/front-2`. The directory still exists and is still covered by the
`front-characterization.yml` CI job, so do not be surprised to find it — but **do not write code in
it and do not use it as a pattern source.** All frontend work happens in `apps/front-2`.
front→front-2 feature parity is **not** complete (open: #735, #818, #819, #820).

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

**Key facts (always apply):**
- Staff/Tenant mutual exclusivity: a `User` can only have accounts of ONE scope type (Staff or Tenant/Project, never both); suspended accounts still count
- PostgreSQL 18 with UUID v7 PKs, soft deletes (`IsDeleted`), and audit tracking
  (`CreatedAt`/`UpdatedAt`/`DeletedAt`) for normal entities via `BaseAttributes`;
  pure junction entities use composite foreign-key primary keys with manual timestamps instead
- Session-based auth via `X-Session-Token`; permission-based authorization via `PermissionFilter`
- Middleware order: Security headers → Exception handling → CORS → Tenant header → Session header → Session auth → Staff auth

### Frontend Architecture (`apps/front-2` — TanStack Start)

`apps/front-2` is the only frontend under development and the only one deployed. The normative
guides are:

[`docs/guides/front-2/index.md`](docs/guides/front-2/index.md) — stack, commands, layout, and how
front-2 is organized.
[`docs/guides/front-2/conventions.md`](docs/guides/front-2/conventions.md) — rendering strategy,
server-function boundary, URL state, error views/logout, mutation feedback ownership, route-local
file naming, and the owner-ratified product UI design preferences.

**Routing:** routes are declared in the virtual route config `apps/front-2/src/routes.ts` (not
file-based discovery); `routeTree.gen.ts` is generated. A route-local file that must not become a
route is prefixed with `_`.

**State Management Strategy:**
```
Server State     → TanStack Query (API data, caching, mutations)
Global State     → Zustand (UI state — `apps/front-2/src/lib/store/ui-store.ts`)
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

Frontend work means `apps/front-2`. It uses `@base-ui/react` primitives wrapped by a local
`src/components/ui/*` layer (`cva` + `tailwind-merge`) on **Tailwind v4** — no MUI, no `sx`, no
HeroUI. The normative sources are
[`docs/guides/front-2/index.md`](docs/guides/front-2/index.md) and
[`docs/guides/front-2/conventions.md`](docs/guides/front-2/conventions.md); the latter carries the
owner-ratified product UI design preferences (elevation, radius, destructive-action placement,
primary-CTA consistency, tables, selection mode, empty/error states, navigation).

Additional repo-specific preferences for AI assistants (to reduce review churn):
[`docs/guides/ai-agent-preferences.md`](docs/guides/ai-agent-preferences.md)

**Key principles (always apply):**
For the complete list of custom lint rules with severity and source, see [`docs/guides/lint-rules.md`](docs/guides/lint-rules.md).

- Compose UI from the local `apps/front-2/src/components/ui/*` wrappers over Base UI primitives; style with Tailwind utility classes through `cn()` (`apps/front-2/src/lib/utils.ts`). Do not reach into Base UI protected/internal APIs.
- Design-token discipline is machine-checked — `pnpm --filter front-2 check:design-system` runs in `just ci-front-2` and in `pnpm --filter front-2 test`.
- No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or `Object.groupBy` (enforced by `publy/no-array-reduce`).
- Never import dayjs directly in components (enforced by `publy/no-direct-dayjs-in-components`).
- React Hook Form + Zod for form validation; go through the front-2 form/field wrappers rather than wiring `register()` onto raw inputs.
- Loading/empty/error states use the front-2 state components (`state-view.tsx`, `state-surface.tsx`, `skeleton.tsx`) — never ad-hoc conditional rendering per page.
- **Entity images and avatars:** preserve the real image when one exists, keep the intended aspect ratio, and fall back to a neutral, muted, subtle treatment — never a bright semantic colour or a generated per-entity colour. For person avatars, use the stable `Avatar`/`AvatarImage`/`AvatarFallback` primitive layer in [`apps/front-2/src/components/ui/avatar.tsx`](apps/front-2/src/components/ui/avatar.tsx); its image preserves a square cover crop and its fallback uses the muted tokens. Do not use a name-hashed palette as a person fallback. **front-2 has no `<Image>` primitive** — do not import one, and do not invent one as a side effect of another task; if a non-avatar content-image need appears, raise it as its own change rather than sprawling raw `<img>` tags. Raw `<img>` is acceptable only for the brand wordmark/logo and inline SVGs, as it is used today in the layouts.
- Bulk-action items on list-page selection menus always render — never `disabled`, never conditionally hidden by per-row eligibility; ineligible clicks show an i18n toast. The trigger button gates on `BULK_ACTION_MAX_COUNT`. See [`docs/guides/bulk-action-ux-conventions.md`](docs/guides/bulk-action-ux-conventions.md) (its backend/UX policy is normative; its code examples are MUI-era `apps/front`).

**About `apps/front`:** it is retired. The MUI/`sx`/React-Router-loader/animation-preset standards
that used to live in this section governed that app only; they are gone from this file on purpose,
because the owner will not edit `apps/front` again.

**Enabled `publy/*` lint-rule scopes** (the configuration sets each of these to `error`):

- All linted JavaScript/TypeScript: `no-array-reduce`, `prefer-specific-lodash-imports`, and
  `no-manual-response-message-translation`.
- `no-console-in-source`: source files under `apps/front/src`, `apps/front-2/src`, and
  `packages/shared-ts`, excluding tests/specs, shared package scripts, and CLI files.
- `no-direct-dayjs-in-components`: TSX files under either frontend's `components/`, `_parts/`,
  `_components/`, or `routes/` source paths.
- Retired `apps/front` only: `no-raw-mui-textfield-register` covers its source files;
  `no-native-html-in-mui-surfaces` and `no-raw-img-in-product-surfaces` cover product JSX under
  `components/`, `layouts/`, `routes/`, and `lib/`, with their narrow marketing/brand exclusions.

`publy/no-op` and `publy/arrow-function-components` are off. Component declaration style is
therefore not lint-enforced in front-2; both arrow components and function declarations exist.

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
- Frontend/Node: use `logger` from `@org/shared-ts/lib/logger/iso-logger` (not `console.*`) (enforced by `publy/no-console-in-source`)
- Frontend API errors: centralized via `ApiFailure` discriminated union — see [`docs/guides/frontend-error-handling.md`](docs/guides/frontend-error-handling.md)
- Frontend local mutation handlers must derive user-facing error text through `getFailureMessage(toApiFailure(error), ...)`; never translate `response-message` keys manually at the call site (enforced by `publy/no-manual-response-message-translation`)

## Development Environment

**Local access:** Frontend `localhost:5050` | API `localhost:5000` | Scalar docs `localhost:5000/scalar/v1` | Postgres `localhost:5454`
**Env vars:** `.env.example` is the only committed env file (the template).
`.env.development` is **gitignored**, is the only env file the API loads, and is used only for
Development or an unset host environment. `.env.production` would also be gitignored but is not
consumed; production variables come from Dokploy. Real env files must never be committed.
`AppEnvironment.Initialize()` validates the resulting runtime environment variables.
**.NET artifacts:** New .NET projects must output under a local `.artifacts/` directory.
Set `DotNetArtifactsRoot` in a project-area `Directory.Build.props` before importing the repo
root props; `Directory.Build.targets` enforces this during builds.

## Deployment

**Production has been live since 2026-07-20.** Dokploy on a Hostinger VPS, run as plain
`docker compose` (not Swarm): GitHub → GHCR Docker images → Dokploy → Traefik SSL. Config in
`dokploy.yml`.

`.github/workflows/deploy-images.yml` publishes **three** image artifacts per release, all tagged
with the same commit SHA: `api` (from `apps/api/Dockerfile`, target `runtime`), `migrate` (same
Dockerfile, target `migrate`), and `front-2` (from `apps/front-2/Dockerfile`). Four *services* run
from them — `publyapp-api`, `publyapp-worker` (the **same API image** with `APP_ROLE=worker`),
`publyapp-migrate`, and `publyapp-front`.

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
- After DTO/endpoint changes: `just build-api && just generate-client && pnpm --filter front-2 typecheck` (add `just tsc-front` only if you also need the retired app to keep compiling)
- Use `createUntypedString()` / `createUntypedArray()` for request body fields in TypeScript

## Documentation Organization

[`docs/README.md`](docs/README.md) is the filing index: it lists which documents are normative and
gives one filing rule per directory. Read it before creating a document.

- **Never** place a generated doc at the repo root, and never at the `docs/` root either — always in
  a `docs/` subdirectory
- Use an existing subdirectory; only create a new one (kebab-case) if nothing in `docs/README.md` fits
- This file links guides/deployment docs for standing policy and may also link repository
  config/source files to anchor a rule. A `docs/guides/` file this file does not link is a record,
  not a rule
- Standing rules belong in this file or a `docs/guides/` file. Plans, reviews, audits, analyses and
  change notes are records: write them once, date them, and supersede rather than retro-edit them
