# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Project Overview

PublyApp is a modern full-stack multi-tenant SaaS application built with .NET 10.0 and React 19. The monorepo architecture uses Turborepo and pnpm workspaces with three user scopes: Staff (platform administrators), Tenant (organization-level users), and Project (project-level users).

## Development Commands

### Starting Development Servers

```bash
# Terminal 1 - Start API with hot reload
just dev-api

# Terminal 2 - Start React frontend with Vite
just dev-front

# Start PostgreSQL in Docker
just dev-db
```

**Windows note:** the repo `justfile` uses PowerShell 7 (`pwsh`) on Windows (not Windows PowerShell 5.1).

### Configuration (AppEnvironment)

The API reads configuration exclusively from environment variables via `AppEnvironment` (`apps/api/Src/Lib/AppEnvironment.cs`).

- Development defaults live in repo-root `.env.development` and are loaded when the host environment is `Development`.
- `dotnet build` also runs the app during OpenAPI document generation; if `ASPNETCORE_ENVIRONMENT`/`DOTNET_ENVIRONMENT` are unset, `.env.development` is loaded to prevent build failures.
- Prefer keeping secrets out of the repo: use an example file (e.g. `.env.development.example`) + local overrides / CI secrets.

### Building

```bash
just build-api          # Build .NET API
just build-front        # Build React frontend for production
just build-deploy       # Build everything for deployment
```

### Code Quality

```bash
just check-write        # Run oxlint + oxfmt (auto-fix)
just tsc-front          # TypeScript type checking
just knip               # Check for unused dependencies
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
just test-api          # Run API integration tests (requires Docker)
```

**Prerequisites:** Docker must be running (Testcontainers spins up Postgres automatically).

```bash
# Run a specific test class
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~PasswordLoginSpec"

# Run a specific test method
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "ItShouldReturnSessionTokenWithValidCredentials"

# Frontend tests (when implemented)
cd apps/front && pnpm test
```

For the full guide on writing and debugging integration tests, see [`docs/guides/api-integration-tests.md`](docs/guides/api-integration-tests.md).

## Architecture

### Monorepo Structure

```
apps/
├── api/              # .NET 10.0 Web API backend
├── front/            # React Router v7 frontend (SSR-enabled)
└── jobs/             # Background jobs (future)

packages/
├── shared/           # Shared utilities, validations, i18n
├── js-client/        # Auto-generated TypeScript API client
└── _tsconfig/        # Shared TypeScript configurations
```

### Backend Architecture (Vertical Slice, Domain-First)

The backend follows **Vertical Slice Architecture** using a **domain-first** module layout:

```
apps/api/Src/Modules/<Domain>/
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
- Domain modules (preferred): `apps/api/Src/Modules/<Domain>/` (e.g. `Auth`, `Users`, `Invitations`)
- Legacy (migration in progress): `apps/api/Src/Modules/{Shared,Staff,Tenant}/` (do not add new code here unless you're migrating existing slices)
- Cross-cutting utilities/middleware: `apps/api/Src/Lib/`
- Infrastructure services (email, storage, etc.): `apps/api/Src/Infrastructure/`

### API Module Structure Rules

For the complete module structure rules (module organization, junction entities, infrastructure placement,
slice boundaries, permission enforcement, vertical slice design principles, and decision tree), see:
[`docs/guides/api-module-structure.md`](docs/guides/api-module-structure.md)

**Key principles (always apply):**
- Domain-first modules: `apps/api/Src/Modules/<Domain>/` — route scope expressed via handler folders + endpoint groups
- Junction entities live with their **primary entity**'s domain
- Infrastructure services go in `Infrastructure/`, domain services in `Modules/<Domain>/Services/`
- Split by actor (Staff/Tenant) when auth/security boundary differs; share handler when only permission differs
- Enforce permissions at the route level with `.WithPermission()` (Pattern 1, preferred)
- `AGENTS.md` + its referenced guide files are the single source of truth for architecture rules

### Architecture Details

For detailed documentation on business rules, database layer, authentication, and i18n, see:
[`docs/guides/architecture-details.md`](docs/guides/architecture-details.md)

**Key facts (always apply):**
- Staff/Tenant mutual exclusivity: a `User` can only have accounts of ONE scope type (Staff or Tenant/Project, never both); suspended accounts still count
- PostgreSQL 18 with UUID v7 PKs, soft deletes (`IsDeleted`), audit tracking (`CreatedAt`/`UpdatedAt`/`DeletedAt`), all entities inherit `BaseAttributes`
- Session-based auth via `X-Session-Token`; permission-based authorization via `PermissionFilter`
- Middleware order: Security headers → Exception handling → CORS → Tenant header → Session header → Session auth → Staff auth

### Frontend Architecture (React Router v7)

**File-based routing:**
- Routes defined in `app/routes.ts`
- Route components in `app/routes/[section]/[page]/`
- Three main layouts: Marketing, Auth, Authenticated

**State Management Strategy:**
```
Server State     → TanStack Query (API data, caching, mutations)
Global State     → Zustand (user preferences, UI state)
URL State        → nuqs (filters, pagination, search)
Form State       → React Hook Form (local form state)
```

For detailed frontend architecture patterns (API client integration, getting clients in hooks/browser/SSR,
data fetching patterns by route type, and optimized prefetching), see:
[`docs/guides/frontend-architecture.md`](docs/guides/frontend-architecture.md)

**Key rules (always apply):**
- Marketing/Auth pages use SSR loaders; Authed pages use TanStack Query (client-only)
- Never fetch application data in authed page `loader` — use hook factories (`createStaffQuery`, etc.)
- Use `getClientLoader` wrapper (not raw `clientLoader`) for client-side prefetching
- Authed layout wrapped in `<ClientOnly>` component

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

For the complete frontend coding standards (MUI components, sx prop styling, Day.js utilities,
array methods, arrow functions, arrow components, forms, QueryDisplay, and component structure), see:
[`docs/guides/frontend-coding-standards.md`](docs/guides/frontend-coding-standards.md)

Additional repo-specific preferences for AI assistants (to reduce review churn):
[`docs/guides/ai-agent-preferences.md`](docs/guides/ai-agent-preferences.md)

For the marketing-vs-product surface split (what brand DNA must match vs what's allowed to diverge on radii/sizing/motion, approved hardcoded-color exceptions, where marketing code lives), see:
[`docs/guides/marketing-surface-conventions.md`](docs/guides/marketing-surface-conventions.md)

**Key principles (always apply):**
- MUI v6 only — never native HTML elements (`<div>` → `<Box>`, `<h1>` → `<Typography variant="h1">`)
- `sx` prop for all styling — never Tailwind CSS or className
- Day.js via `format-time.ts` utilities — never import dayjs directly in components
- Arrow function components only — never `function` declarations for components
- `QueryDisplay` component for TanStack Query states — never manual conditional rendering
- No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or `Object.groupBy`
- React Hook Form + Zod for form validation — always use `Form`/`Field.*` wrappers from `@/front/components/hook-form`, never raw MUI `TextField` with `register()`
- First-column table entity avatars/icons must use a neutral, muted, subtle fallback treatment; preserve real images when present, but avoid bright semantic or generated avatar colors for fallback icons
- Marketing surfaces (landing, pricing, future blog) may diverge from product defaults on radii (16–40 px), button sizing, spacing, and motion — but must match product on palette tokens, typography family, primary CTA color, and dark-mode mechanism. See `docs/guides/marketing-surface-conventions.md` for the full divergence table and approved hardcoded-color exceptions.

## JavaScript/TypeScript Conventions

**Key principles (always apply):**
- Prefer targeted `lodash/*` helpers over built-in JavaScript methods when the lodash helper provides safer runtime handling for nullish or invalid inputs
- Import specific helpers such as `lodash/map`, `lodash/trim`, `lodash/isEqual`, and `lodash/capitalize` instead of the full `lodash` package

## C# Coding Standards

For the complete C# coding standards (null checking, LINQ, async/await, handler architecture,
DTOs, service layer, DI rules, API responses, formatting, and more), see:
[`docs/guides/csharp-coding-standards.md`](docs/guides/csharp-coding-standards.md)

For FluentValidation conventions (shared extension methods, pagination validators, encrypted-ID queries), see:
[`docs/guides/validator-conventions.md`](docs/guides/validator-conventions.md)

**Key principles (always apply):**
- Pattern matching for null checks (`is null` / `is not null`, never `== null`)
- **Never** use `?? throw` — use traditional `if` guard clauses for null-then-throw patterns
- **Never** use the null-forgiving operator (`!`) in production code — always handle null explicitly with guard clauses or safe accessors like `GetRequiredId()`
- Guard clauses (flat `if`/early return) over `switch` expressions when handling discriminated union error results from services
- Query syntax for database LINQ queries; method syntax only for terminal ops
- Handlers orchestrate, services implement (no DbContext in handlers)
- Request body DTOs use `JsonElement` with `Get*()` methods for FluentValidation compatibility
- In handlers, cache body DTO getter results in locals when they are used 2+ times or return parsing-sensitive values like `PatchField<T>`, trimmed strings, parsed timestamps, or parsed enums
- All errors use `TypedProblems.*` (RFC 7807), never `TypedResults.Forbid()`
- Services MUST NOT depend on other services (only DbContext + infrastructure)
- Use `[Service]` attribute for DI registration; `{Action}{Domain}Args` records for 3+ params
- `PatchField<T>` for clearable nullable PATCH fields (see [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md))
- Max 100 char line length; always use braces on control flow blocks
- "Find" prefix for list/collection retrieval (not "List")
- Staff handlers MUST use `*ForStaff*` service method variants (e.g., `GetTenantByIdForStaffAsync`) — base methods filter suspended entities
- For cursor/keyset pagination, see [`docs/guides/cursor-keyset-pagination-guide.md`](docs/guides/cursor-keyset-pagination-guide.md)
- For list pages with search/filter + cursor pagination + bulk actions, see [`docs/guides/list-pages-search-filter-cursor-pagination.md`](docs/guides/list-pages-search-filter-cursor-pagination.md)
- **Validators**: use `JsonElementRules.*` extension methods (never inline validation chains); inherit `OffsetPaginatedQueryValidator<T>`/`CursorPaginatedQueryValidator<T>` for pagination; inherit `EncryptedIdTokenQueryValidator<T>` for encrypted-ID + token queries
- **Never** use `ToLower()` / `ToLowerInvariant()` as a comparison or dispatch strategy; use
  `StringComparison.OrdinalIgnoreCase`, `StringComparer.OrdinalIgnoreCase`, or explicit
  case-insensitive parsers/dictionaries instead

## Test Conventions

For full test conventions (file naming, BDD method naming, folder structure, imports), see:
[`docs/guides/test-conventions.md`](docs/guides/test-conventions.md)
For writing and debugging integration tests, see:
[`docs/guides/api-integration-tests.md`](docs/guides/api-integration-tests.md)

**Key rules:** `*.Spec.cs` suffix, `ItShould{Expected}When{Scenario}` method names, specs co-located with source, test infra in `Src/Lib/Testing/{Fixtures,Helpers,Fakes}/`

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
- Backend routes use kebab-case; constants in `RoutePath.cs` (backend) and `constants.ts` (frontend)
- Errors: `AppProblemDetails` (400/401/403/404/500) + `ValidationProblemDetails` (422) — both RFC 7807
- Frontend/Node: use `logger` from `@/shared/lib/logger/iso-logger` (not `console.*`)
- Frontend API errors: centralized via `ApiFailure` discriminated union — see [`docs/guides/frontend-error-handling.md`](docs/guides/frontend-error-handling.md)
- Frontend local mutation handlers must derive user-facing error text through `getFailureMessage(toApiFailure(error), ...)`; never translate `response-message` keys manually at the call site

## Development Environment

**Local access:** Frontend `localhost:5050` | API `localhost:5000` | Scalar docs `localhost:5000/scalar/v1` | Postgres `localhost:5454`
**Env vars:** `.env.development` (committed), `.env.production` (not in repo), validated at startup via `AppEnvironment.Initialize()`

## Deployment

Dokploy on Hostinger VPS: GitHub → GHCR Docker images → Dokploy → Traefik SSL. Config in `dokploy.yml`.

## OpenAPI Documentation

Interactive API docs at `/scalar/v1`. Source of truth for the API contract; drives TypeScript client generation.

## OpenAPI & Kiota Client Generation Safeguards

For the complete Kiota safeguards guide (JsonElement nullability, generic types bug, schema transformer,
client regeneration workflow, and TypeScript patterns), see:
[`docs/guides/openapi-kiota-safeguards.md`](docs/guides/openapi-kiota-safeguards.md)

**Key rules (always apply):**
- Required body fields: non-nullable `JsonElement` (not `JsonElement?`) for cleaner TypeScript types
- Never add XML comments to generic types (`<T>`) — triggers .NET 10 OpenAPI bug
- After DTO/endpoint changes: `just build-api && just generate-client && just tsc-front`
- Use `createUntypedString()` / `createUntypedArray()` for request body fields in TypeScript

## Documentation Organization

- **Never** place generated docs at the repo root — always under `docs/`
- Use existing subdirectories when appropriate; create new ones with kebab-case names
- Existing dirs: `docs/implementation-plans/`, `docs/refactoring-guides/`, `docs/roadmaps/`, `docs/reviews/`, `docs/misc/`
- Only `docs/guides/` files should be referenced from AGENTS.md; unreferenced guides belong elsewhere
