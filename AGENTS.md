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
Features/[Domain]/[Feature]/
├── [Feature]Service.cs           # Business logic
├── [Feature]Endpoints.cs         # API endpoint mappings
└── Handlers/
    ├── Create[Feature].cs        # POST handler
    ├── Get[Feature]ById.cs       # GET by ID handler
    ├── Find[Feature]s.cs         # GET list handler
    └── Update[Feature].cs        # PUT handler
```

**Key Patterns:**
- **CQRS-lite**: handlers per operation (create/find/get/update/delete)
- **Minimal APIs**: endpoints map routes and attach filters/permissions
- **FluentValidation**: automatic body/query validation via endpoint extensions
- **Response Format**: errors return RFC 7807 via `TypedProblems.*`; Create success → 201 `Created<T>` with entity DTO; Update success → 200 `Ok<T>` with entity DTO; Delete/action-only success → 200 `Ok<ApiResponse>` with message + translationKey
- **Namespace discipline**: `IDE0130` is treated as error — file namespace must match its folder path

**Finding Backend Code:**
- Common features (auth, accounts, users): `apps/api/Src/Features/Common/`
- Staff-specific features: `apps/api/Src/Features/Staff/`
- Tenant-specific features: `apps/api/Src/Features/Tenant/`
- Shared utilities/middleware: `apps/api/Src/Lib/`

### Multi-Tenant Architecture

**Three tenant scopes:**
- `ITenantEntity`: Tenant-scoped entities (filtered by TenantId)
- `IOptionalTenantEntity`: Entities that may or may not belong to a tenant
- `INoTenantEntity`: Global entities (Staff, permissions)

**Automatic tenant isolation:**
- EF Core global query filters applied in DbContext
- `TenantContext` provides current tenant info (scoped service)
- Tenant ID from `X-Tenant-Id` header (injected via middleware)

### Staff/Tenant Account Mutual Exclusivity

**Business Rule:** A `User` can only have `UserAccount` records of ONE scope type:
- Either **Staff** (platform administrator)
- Or **Tenant/Project** (customer)
- Never both

**Rationale:**
- Conflict of interest: Platform admins shouldn't also be customers with the same identity
- Session model simplicity: User-scoped sessions would be ambiguous with mixed scopes
- Audit clarity: Actions are clearly "as staff" or "as customer"

**Enforcement Points:**
- `AccountService.CreateStaffAccountAsync()` - Rejects if user has tenant/project accounts
- `AccountService.CreateTenantAccountAsync()` - Rejects if user has staff account
- `AcceptInvitation` handler - Validates scope conflicts before accepting staff/tenant invitations
- `CreateStaffInvitation` / `BulkCreateStaffInvitations` handlers - Proactively reject invitations to users with conflicting accounts

**Suspension Behavior:**
- **Suspended accounts still count** toward mutual exclusivity
- Rationale: Suspension is temporary; the identity conflict remains
- Implementation: `Has*Account*` methods check `!IsDeleted` but NOT `IsSuspended`
- This prevents using suspension as a loophole to bypass the business rule

**Dogfooding Approach:**
- Use the **impersonation feature** (staff can impersonate tenant users for support/testing)
- Or use a **separate user account** (different email) for real customer experience

### Database Layer (EF Core)

**Key Patterns:**
- PostgreSQL 18 with UUID v7 primary keys (database-generated)
- Soft deletes: `IsDeleted` flag set automatically on Delete()
- Hard deletes: Use `ForceHardDelete()` method explicitly
- Audit tracking: `CreatedAt`, `UpdatedAt`, `DeletedAt` set automatically
- Base entity: All entities inherit from `BaseAttributes`

**Important entities:**
```csharp
DbSet<User>               // Users (email, password, status)
DbSet<UserAccount>        // Accounts (scope: Staff/Tenant/Project)
DbSet<Tenant>             // Tenants (multi-tenant organizations)
DbSet<Session>            // User sessions (authentication tokens)
DbSet<Profile>            // User profiles/roles
DbSet<ProfilePermission>  // Profile-permission mappings
DbSet<Permission>         // Available permissions
DbSet<Project>            // Projects (future use)
```

**Migration workflow:**
1. Make entity changes in `apps/api/Src/Data/`
2. Run `make db-add NAME=DescriptiveName`
3. Review generated migration in `apps/api/Migrations/`
4. Run `make db-migrate` to apply

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

**Optimized Data Fetching (Optional):**

For authed pages where you want to optimize initial load time, use `getClientLoader` with react-query-kit prefetching:

```tsx
import { getClientLoader } from '@/front/lib/react-router/client-data';
import { QueryClient } from '@tanstack/react-query';

// ✅ CORRECT - Use getClientLoader wrapper
export const clientLoader = getClientLoader({
  loader: async ({ apiClient, z, locale }) => {
    const queryClient = new QueryClient();

    // Prefetch using react-query-kit hooks
    await queryClient.prefetchQuery({
      queryKey: useFindStaffUser.getKey({ page: 1 }),
      queryFn: () => useFindStaffUser.fetcher({ page: 1 }),
    });

    return null;
  },
});

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

### UI Component Library: Material-UI

Additional repo-specific preferences for AI assistants (to reduce review churn):
[`docs/guides/ai-agent-preferences.md`](docs/guides/ai-agent-preferences.md)

For the marketing-vs-product surface split (what brand DNA must match vs what's allowed to diverge on radii/sizing/motion, approved hardcoded-color exceptions, where marketing code lives), see:
[`docs/guides/marketing-surface-conventions.md`](docs/guides/marketing-surface-conventions.md)

Additional repo-specific preferences for AI assistants (to reduce review churn):
[`docs/guides/ai-agent-preferences.md`](docs/guides/ai-agent-preferences.md)

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

### Null Checking

**Always use pattern matching (`is`/`is not`) instead of equality operators:**

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
- Use `[Service]` attribute for DI registration; `{Action}{Domain}Args` records for 3+ params;
  update `apps/api/Src/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` assertions when adding/refactoring these methods
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

// ❌ WRONG
if (user != null)
if (tenant == null)
```

Pattern matching is safer because it cannot be overridden by custom equality operators.

### LINQ Queries

**Prefer query syntax over method syntax for database queries:**

```csharp
// ✅ CORRECT - Query syntax for database queries
var users = from u in db.Users
            where u.IsDeleted == false
            orderby u.CreatedAt descending
            select u;

// ❌ WRONG - Method syntax for database queries
var users = db.Users
    .Where(u => u.IsDeleted == false)
    .OrderByDescending(u => u.CreatedAt);
```

**Exception:** Method syntax is acceptable for:
- Simple single operations: `.First()`, `.Count()`, `.Any()`, `.ToList()`
- Operations without query syntax equivalents
- In-memory collections

### Collection Checking

**Prefer comparing `Count` to 0 rather than using `.Any()` for clarity and performance:**

```csharp
// ❌ WRONG - Using .Any() to check if collection has items
if (invitations.Any())
if (!users.Any())

// ✅ CORRECT - Compare Count to 0
if (invitations.Count > 0)
if (users.Count == 0)
```

**Why prefer `Count > 0`:**
- More explicit and clearer intent
- Better performance for collections that already have a Count property (List<T>, array, etc.)
- Avoids unnecessary enumeration overhead
- More consistent with common C# idioms

**Exception:** Use `.Any()` when:
- Working with IEnumerable<T> that doesn't have an efficient Count implementation
- Using `.Any(predicate)` with a condition: `users.Any(u => u.IsActive)`
- The collection is a LINQ query that hasn't been materialized yet

### Async/Await Patterns

**Critical anti-patterns to NEVER use:**

```csharp
// ❌ NEVER block on async - causes thread pool exhaustion
.Result
.Wait()
.GetAwaiter().GetResult()
Task.Run(() => await SomeAsyncMethod()) // unnecessary for I/O

// ❌ NEVER use async void (except event handlers)
public async void ProcessMessage(Message msg)
```

**Required patterns:**

```csharp
// ✅ CORRECT - async Task with CancellationToken
public async Task<User?> GetUserAsync(
    Guid userId,
    CancellationToken cancellationToken = default)
{
    return await _dbContext.Users
        .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
}

// ✅ CORRECT - Parallel independent operations
var userTask = GetUserAsync(id, cancellationToken);
var permissionsTask = GetPermissionsAsync(id, cancellationToken);
await Task.WhenAll(userTask, permissionsTask);

// ✅ CORRECT - Controlled concurrency for bulk operations
const int maxConcurrency = 10;
using var semaphore = new SemaphoreSlim(maxConcurrency);
var tasks = ids.Select(async id =>
{
    await semaphore.WaitAsync(cancellationToken);
    try { return await ProcessAsync(id, cancellationToken); }
    finally { semaphore.Release(); }
});
var results = await Task.WhenAll(tasks);
```

**Important:** Do NOT use `ConfigureAwait(false)` in this ASP.NET Core application. ASP.NET Core has no SynchronizationContext, so it provides zero benefit.

**Always:**
- Add `CancellationToken cancellationToken = default` to all public async methods
- Use EF Core async methods: `FindAsync`, `FirstOrDefaultAsync`, `ToListAsync`, `SaveChangesAsync`, `ExecuteUpdateAsync`
- Run independent queries in parallel with `Task.WhenAll()`
- Use `SemaphoreSlim` to limit concurrency in bulk operations
- Use `await using` for transactions with explicit rollback on errors

### Handler Architecture (Vertical Slice)

**CRITICAL:** Each handler file must be self-contained with ALL related code in ONE file.

```csharp
// ✅ CORRECT - Everything in one file: Handler + DTOs + Validators
// File: apps/api/Src/Features/Staff/Invitations/Handlers/CreateStaffInvitation.cs

using FluentValidation;
using System.Text.Json;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

// Request DTO (Body suffix for request body, Query suffix for query params)
public record CreateStaffInvitationBody {
    public required JsonElement Email { get; init; }      // JsonElement for body params!
    public required JsonElement ProfileId { get; init; }
}

// Response DTO (no Dto suffix!)
public record InvitationCreated {
    public required Guid InvitationId { get; init; }
    public required string Token { get; init; }
}

// Validator (in same file)
public class CreateStaffInvitationBodyValidator : AbstractValidator<CreateStaffInvitationBody> {
    public CreateStaffInvitationBodyValidator() {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.ProfileId).NotEmpty();
    }
}

// Handler class (descriptive HandleX method name)
public static class CreateStaffInvitation {
    public static async Task<Results<Ok<InvitationCreated>, AppBadRequestHttpResult, AppForbiddenHttpResult>>
    HandleCreateStaffInvitation(  // ✅ Descriptive name, NOT just "Handle"
        [FromServices] IAuthContext authContext,
        [FromServices] IInvitationService invitationService,  // ✅ Use service, NOT DbContext
        [FromBody] CreateStaffInvitationBody request,
        CancellationToken cancellationToken = default
    ) {
        // Handler only orchestrates - no DbContext access!
        var result = await invitationService.CreateStaffInvitationAsync(...);
        return TypedResults.Ok(new InvitationCreated { ... });
    }
}
```

**Rules:**
1. **NO separate DTO files** - Define DTOs in handler file
2. **NO separate Validator files** - Define validators in handler file
3. **NO "Dto" suffix** - Use descriptive names like `InvitationCreated`, NOT `InvitationDto`
4. **Request DTOs naming**:
   - `Body` suffix for request body params (e.g., `CreateUserBody`)
   - `Query` suffix for query params (e.g., `ListUsersQuery`)
5. **Handler method names** - Use `HandleCreateUser`, NOT just `Handle`
6. **NO DbContext in handlers** - All database access through service layer
7. **Line length** - Maximum 100 characters, break long lines

### DTO and Request/Response Patterns

**Request Body DTOs MUST use JsonElement:**

```csharp
// ✅ CORRECT - JsonElement allows FluentValidation to provide friendly errors
public record CreateUserBody {
    public required JsonElement Email { get; init; }
    public required JsonElement Password { get; init; }
}

// ❌ WRONG - Typed properties throw before validation runs
public record CreateUserBody {
    public required string Email { get; init; }  // Throws if not a string!
    public required Guid Id { get; init; }       // Throws if invalid GUID format!
}
```

**Why JsonElement?** ASP.NET Core parameter binding runs BEFORE FluentValidation. Using `JsonElement` defers type conversion to validation, allowing friendly error messages instead of ugly 400 errors.

**Update/PATCH body DTOs with clearable nullable fields:** Use non-nullable `JsonElement` (NOT `JsonElement?`) for clearable fields, and `PatchField<T>` in the getter method to distinguish "not sent" from "explicitly null". See the **PatchField\<T\> for Nullable PATCH Fields** section and [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md) for the full pattern.

```csharp
// ✅ CORRECT - Update body with clearable nullable field
// CRITICAL: clearable field MUST be non-nullable JsonElement
public record UpdateNoticeBody {
    public JsonElement ExpiresAt { get; init; }

    // Returns PatchField via ValueKind switch
    public PatchField<DateTime?> GetExpiresAt() =>
        ExpiresAt.ValueKind switch {
            JsonValueKind.Undefined =>
                PatchField<DateTime?>.Absent(),
            JsonValueKind.Null =>
                PatchField<DateTime?>.Set(null),
            JsonValueKind.String =>
                PatchField<DateTime?>.Set(
                    ExpiresAt.GetValueAsDateTime()
                ),
            _ => throw new InvalidOperationException(
                "ExpiresAt must be string, null, or omitted"
            ),
        };
}
```

**Query Parameters use typed properties:**

```csharp
// ✅ CORRECT - Query params from URL are always strings, so typed properties work
public record ListUsersQuery {
    public string? Search { get; init; }
    public UserStatus? Status { get; init; }
    public int? Page { get; init; }
}
```

### Service Layer Separation

**CRITICAL:** Handlers MUST NOT access `DbContext` directly. Use service layer.

```csharp
// ❌ WRONG - Handler accesses DbContext
public static async Task<Ok> Handle(
    [FromServices] MainApiDbContext dbContext,  // NO!
    [FromBody] CreateBody request
) {
    var user = await dbContext.User.FindAsync(id);  // NO!
    await dbContext.SaveChangesAsync();  // NO!
}

// ✅ CORRECT - Handler delegates to service
public static async Task<Ok> HandleCreateUser(
    [FromServices] IUserService userService,  // YES!
    [FromBody] CreateUserBody request
) {
    var result = await userService.CreateAsync(...);  // YES!
    return TypedResults.Ok();
}
```

**Handler responsibilities:**
- Validate authorization
- Parse/validate input
- Orchestrate service calls
- Map responses to HTTP results

**Service responsibilities:**
- All database access (DbContext)
- Business logic
- Transaction management
- Domain event coordination

**Service parameter conventions for update methods:**
- Non-nullable required fields: use the typed value directly (`string title`)
- Optional fields (update if present, skip if null): use `T?` (`string? title`, `DateTime? startsAt`)
- Clearable nullable fields (need to distinguish "not sent" from "set to null"): use `PatchField<T?>` — see **PatchField\<T\> for Nullable PATCH Fields** section and [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md)

### Service Method Args Records

**CRITICAL:** When a service method has **3 or more domain parameters** (excluding `id`, `CancellationToken`, and infrastructure concerns), bundle them into a single args record. This keeps service signatures stable when fields are added/removed and makes handler code cleaner.

**Rules:**
1. **Naming:** `{Action}{Domain}Args` — e.g., `CreateSystemNoticeArgs`, `UpdateSystemNoticeArgs`
2. **Placement:** Define the args record in the **service file** (it's the service's input contract, not an HTTP DTO)
3. **Construction:** Handlers construct the args record inline — no separate mapper class needed
4. **Keep `id` separate:** Entity identifiers remain as separate parameters (they're routing concerns, not domain input)

```csharp
// ✅ CORRECT - Args record in the service file
public record CreateSystemNoticeArgs(
    NoticeSeverity Severity,
    string Title,
    string Message,
    DateTime StartsAt,
    DateTime? ExpiresAt,
    Guid CreatedByStaffId
);

// ✅ CORRECT - Service interface uses args record
Task<SystemNotice> CreateAsync(
    CreateSystemNoticeArgs args,
    CancellationToken cancellationToken = default);

Task<SystemNotice?> UpdateAsync(
    Guid id,                    // id stays separate
    UpdateSystemNoticeArgs args,
    CancellationToken cancellationToken = default);

// ✅ CORRECT - Handler constructs args inline
var args = new CreateSystemNoticeArgs(
    Severity: severity,
    Title: body.GetTitle(),
    Message: body.GetMessage(),
    StartsAt: body.GetStartsAt(),
    ExpiresAt: body.GetExpiresAt(),
    CreatedByStaffId: account.UserId
);
var notice = await service.CreateAsync(
    args, cancellationToken
);
```

**When NOT to use args records:**
- Methods with 1–2 domain parameters (e.g., `DeleteAsync(Guid id)`, `GetByIdAsync(Guid id)`)
- Query/find methods where parameters are optional filters — use explicit parameters or a dedicated query record

```csharp
// ❌ WRONG - Too many loose parameters
Task<SystemNotice> CreateAsync(
    NoticeSeverity severity,
    string title,
    string message,
    DateTime startsAt,
    DateTime? expiresAt,
    Guid createdByStaffId,
    CancellationToken ct = default);

// ❌ WRONG - Args record for a trivial method
public record DeleteArgs(Guid Id);  // Overkill
Task<bool> DeleteAsync(DeleteArgs args, CancellationToken ct);

// ✅ CORRECT - Simple methods keep plain parameters
Task<bool> DeleteAsync(
    Guid id, CancellationToken ct = default);
```

### Dependency Injection Rules

#### Adding a New Application Service

- **Namespace**: Place concrete class under `MainApi.Src.Modules.<Domain>.Services`
- **Primary interface**: Define `I{ClassName}` interface (e.g., `UserService` → `IUserService`)
- **Explicit lifetime**: Specify `ServiceLifetime` explicitly (Scoped, Transient, or Singleton)
- **One unkeyed default**: Exactly one unkeyed registration per service type is allowed
- **Key governance**: If multiple implementations exist, additional ones must be keyed using constants (never inline strings)

#### Adding a Keyed Implementation

When adding a second (or nth) implementation of an existing service interface:

- **Keys classes**: Use the appropriate keys class:
  - `ProviderKeys` — provider/adapter implementations (email providers, auth providers)
  - `StorageKeys` — storage backends (file storage, blob storage)
  - `IntegrationKeys` — external integrations (payment gateways, notification services)
- **Key naming**: Use lowercase, stable identifiers as `public const string` (e.g., `"resend"`, `"local"`)
- **Allowed characters**: `[a-z0-9._-]` only (no whitespace/control chars)
- **Collision avoidance**: Verify no other implementation of the same service type uses the same key
- **Registration**: Use `.AddKeyed*<TService, TImpl>(YourKeys.YourKey)`
- **Injection**: Use `[FromKeyedServices(YourKeys.YourKey)]` at the consumer

#### DI Group Boundaries

- **Web group** (`AddWebServices`): ASP.NET Core wiring (ProblemDetails, OpenAPI, CORS, compression)
- **Infrastructure group** (`AddInfraServices`): External capabilities (DbContext, SDK clients, email, health checks)
- **Application group** (`AddAppServices`): Business services only (`MainApi.Src.Modules.*.Services`)

#### Attribute-Based Application Service Registration (`[Service]`)

`[Service]` is used ONLY for application/business services and is enforced with fail-fast startup validation.

Quick Do / Don't:

- Do: Use `[Service]` only on concrete classes under `MainApi.Src.Modules.*.Services`
- Do: Implement the primary interface `I{ClassName}`
- Don't: Add multiple unkeyed implementations for the same service type (only one default allowed; additional ones must be keyed)

- **Allowed location**: Only concrete classes under `MainApi.Src.Modules.*.Services`
- **Scanning scope**: Single assembly (Main API) only
- **Lifetime**: Must be explicit (`ServiceLifetime` is required)
- **Interface binding**: Registers ONLY the primary interface `I{ClassName}`
- **No register-as-self**
- **No secondary interfaces**: If a class must be resolved via additional business interfaces, register those explicitly (manual DI wiring)
- **Concrete only**: No abstract classes; no open generic type definitions
- **Keyed DI**: Key type is `string` only
- **Key format**: Non-empty, lowercase only
- **Keys governance**: Keys must be centralized constants (no inline strings)
- **Duplicate implementations**:
  - Exactly ONE unkeyed default implementation per service type is allowed
  - Additional implementations MUST be keyed
  - Duplicate unkeyed defaults or duplicate keys are startup errors
- **Migration guardrail**: If a service type is discovered via `[Service]`, it MUST NOT also have any explicit DI registrations (unkeyed or keyed). Startup fails fast to prevent half-migrated states.
- **Misuse is a hard error**: Any `[Service]` attribute outside `MainApi.Src.Modules.*.Services` fails startup

#### Fail-Fast Validation (Troubleshooting)

Validation runs during `AddAppServices()` (before `builder.Build()`).
On any violation, startup fails with `InvalidOperationException` and a bullet list of errors.

Common failure categories and fixes:

- **Abstract/open generic**: Remove `[Service]` or apply it only to a concrete, non-generic implementation.
- **Invalid namespace**: Move the class to `MainApi.Src.Modules.<Domain>.Services` (or remove `[Service]` and wire explicitly).
- **Missing primary interface**: Ensure the class implements `I{ClassName}`.
- **Invalid key**: Use a non-empty, lowercase key constant; use `null` for unkeyed default.
- **Duplicate unkeyed**: Keep exactly one default; key additional implementations.
- **Duplicate keys**: Choose a unique key per service type.
- **Assembly type load failure**: Fix missing/incompatible references; rebuild and review loader exception messages.

#### DI Manifest Logging (Optional)

If enabled, the app logs a discovered `[Service]` manifest once during startup (after `builder.Build()`),
so the configured logging pipeline is guaranteed to be active.

- **Config flag**: `DI_MANIFEST_ENABLED` environment variable (defaults to `false`)
- **Logging**: Uses the configured Serilog pipeline (no temporary ServiceProvider)
- **Noise control**: No output when no `[Service]` attributes are discovered

### AppEnvironment (Configuration)

All application configuration is loaded from environment variables via `AppEnvironment`. This class is initialized once at startup and provides static access throughout the application.

**Initialization (in Program.cs):**
```csharp
AppEnvironment.Initialize(); // Must be called before anything else
```

**Usage anywhere in the codebase:**
```csharp
// Direct static access - no DI required
var env = AppEnvironment.Instance;
var frontUrl = env.FRONT_URL;
var tokenLength = env.INVITATION_TOKEN_LENGTH;

// Or inline
var headerKey = AppEnvironment.Instance.SESSION_TOKEN_HEADER_KEY;
```

**Available properties:**

| Category | Properties |
|----------|------------|
| **Secrets/URLs** | `POSTGRES_CONNECTION_STRING`, `FRONT_URL`, `RESEND_API_KEY`, `STAFF_OWNER_EMAIL`, `STAFF_OWNER_BOOTSTRAP_CODE` |
| **App Settings** | `APP_NAME`, `SESSION_TOKEN_HEADER_KEY`, `TENANT_ID_HEADER_KEY`, `DEFAULT_EMAIL_SENDER_EMAIL`, `DEFAULT_EMAIL_SENDER_NAME` |
| **Token Config** | `SESSION_EXPIRY_DAYS`, `EMAIL_VERIFY_TOKEN_VALIDITY_DURATION`, `PASSWORD_RESET_TOKEN_VALIDITY_DURATION`, `PASSWORD_MIN_LENGTH`, `EMAIL_VERIFY_TOKEN_LENGTH`, `PASSWORD_RESET_TOKEN_LENGTH`, `INVITATION_TOKEN_LENGTH` |
| **Feature Flags** | `DI_MANIFEST_ENABLED` |
| **Constants** | `MAX_PROFILES_PER_USER`, `PAGINATION_DEFAULT_LIMIT`, `MAX_BULK_INVITATIONS_SIZE`, `DEFAULT_MAX_USERS_PER_TENANT` |
| **Computed** | `IsDevelopment`, `IsProduction`, `EnvironmentName` |

**Environment files:**
- Development: `.env.development` (committed to repo)
- Production: `.env.production` (not in repo, set via deployment)

**Why static access instead of DI?**
- Configuration is immutable after startup
- Needed in static methods, extension methods, and places without DI
- Avoids `IOptions<T>` boilerplate throughout the codebase
- Validated once at startup with fail-fast behavior

### Service Dependencies

**CRITICAL:** Services MUST NOT depend on other services. This prevents circular dependencies.

```csharp
// ❌ WRONG - Service depending on other services
public class InvitationService : IInvitationService {
    private readonly ISessionService _sessionService;      // BAD!
    private readonly IPasswordService _passwordService;    // BAD!

    public InvitationService(
        MainApiDbContext dbContext,
        ISessionService sessionService,
        IPasswordService passwordService
    ) { }
}

// ✅ CORRECT - Services only depend on DbContext and infrastructure
public class InvitationService : IInvitationService {
    private readonly MainApiDbContext _dbContext;
    private readonly ILogger<InvitationService> _logger;

    public InvitationService(
        MainApiDbContext dbContext,
        ILogger<InvitationService> logger
    ) { }

    // Service methods do ONE thing, return data
    public async Task<User> CreateUserFromInvitationAsync(
        Invitation invitation,
        string firstName,
        string lastName,
        string passwordHash  // Already hashed by handler!
    ) {
        var user = new User {
            Email = invitation.Email,
            Password = passwordHash,  // No service dependency needed
            // ...
        };
        await _dbContext.User.AddAsync(user);
        await _dbContext.SaveChangesAsync();
        return user;
    }
}

// ✅ CORRECT - Handlers orchestrate multiple services
public static class AcceptInvitation {
    public static async Task<Results<...>> HandleAcceptInvitation(
        [FromServices] IInvitationService invitationService,
        [FromServices] ISessionService sessionService,
        [FromServices] IPasswordService passwordService,
        // ... other services
    ) {
        // Handler orchestrates - calls services in sequence
        var hash = passwordService.HashPassword(password);
        var user = await invitationService.CreateUserFromInvitationAsync(..., hash);
        var session = await sessionService.CreateSessionForUser(user);
        return TypedResults.Ok(...);
    }
}
```

**Architecture principle:** Handlers orchestrate, Services implement.

**Exception:** Infrastructure services (ILogger, IConfiguration) are OK since they don't create circular dependencies.

### Naming Conventions

**Use "Find" prefix for list/collection retrieval, NOT "List":**

```csharp
// ❌ WRONG
Task<List<Invitation>> ListStaffInvitationsAsync();
public static class ListStaffInvitations { }
public static async Task<...> HandleListStaffInvitations(...) { }

// ✅ CORRECT
Task<List<Invitation>> FindStaffInvitationsAsync();
public static class FindStaffInvitations { }
public static async Task<...> HandleFindStaffInvitations(...) { }
```

**Naming patterns:**
- Get single item: `GetUserById`, `HandleGetUserById`
- Get list/collection: `FindUsers`, `HandleFindUsers`
- Create: `CreateUser`, `HandleCreateUser`
- Update: `UpdateUser`, `HandleUpdateUser`
- Delete: `DeleteUser`, `HandleDeleteUser`
- Special actions: Use the verb (e.g., `RevokeInvitation`)

### API Response Pattern

**CRITICAL:** All error responses MUST use RFC 7807 ProblemDetails via `TypedProblems`.

**Rules:**
1. **Success WITH data**: Return data directly using `TypedResults.Ok(data)`
2. **Success WITHOUT data**: Return a message using `TypedResults.Ok(new { Message = "..." })`
3. **All error responses**: MUST use `TypedProblems.*` methods for RFC 7807 compliance and automatic OpenAPI documentation

```csharp
// ✅ Success WITH data - return data directly
public static async Task<Results<
    Ok<User>,
    AppNotFoundHttpResult
>> HandleGetUser(...) {
    var user = await userService.GetUserAsync(id);

    if (user is null) {
        return TypedProblems.NotFound("User not found", ResponseKeys.NotFound);
    }

    return TypedResults.Ok(user);  // Data returned directly
}

// ✅ All error responses use TypedProblems for automatic OpenAPI documentation
public static async Task<Results<
    Ok<User>,
    AppBadRequestHttpResult,
    AppForbiddenHttpResult
>> HandleUpdateUser(...) {
    if (!hasPermission) {
        return TypedProblems.Forbidden(
            "User does not have the necessary permissions",
            ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
        );
    }

    var updatedUser = await userService.UpdateUserAsync(user);
    return TypedResults.Ok(updatedUser);
}

// ✅ Available TypedProblems methods (all auto-document in OpenAPI):
// TypedProblems.BadRequest(detail, translationKey)        -> 400 (generic bad request)
// TypedProblems.Unauthorized(detail, translationKey)      -> 401
// TypedProblems.Forbidden(detail, translationKey)         -> 403
// TypedProblems.NotFound(detail, translationKey)          -> 404
// TypedProblems.InternalServerError(detail, translationKey) -> 500
// TypedProblems.ValidationProblem(detail, translationKey, errors) -> 422 (validation errors)
```

**HTTP Status Code Distinction (400 vs 422):**
- **400 Bad Request** — Generic bad requests (invalid credentials, user already exists, invalid token, etc.)
  - Uses `AppProblemDetails` schema
  - Created via `TypedProblems.BadRequest(...)`
- **422 Unprocessable Entity** — Field-level validation errors from FluentValidation
  - Uses `ValidationProblemDetails` schema (includes `errors` dictionary)
  - Created via `TypedProblems.ValidationProblem(...)` or automatically by validation filters

**Note on framework/binding errors:**
- Missing required query/body parameters can still produce a **400** (e.g., request body missing / required query parameter missing).
- These are normalized by `UseCustomExceptionHandler()` to `AppProblemDetails` (`application/problem+json`), so endpoints may legitimately document both `400` (generic/binding) and `422` (validation).
- `builder.Services.AddProblemDetails()` is registered (see `apps/api/Src/Lib/ServiceRegistration.cs`) for framework integration, but endpoints still return ProblemDetails explicitly via `TypedProblems.*`.

```csharp
// 400 - Generic bad request (e.g., invalid credentials)
return TypedProblems.BadRequest("Invalid email or password", ResponseKeys.InvalidCredentials);

// 422 - Validation errors (automatically returned by .WithReqBodyValidation<T>())
// Response includes field-level errors: { "errors": { "email": ["Email is required"] } }
```

**Why TypedProblems?**
- Returns RFC 7807 `application/problem+json` responses
- Includes `translationKey` for frontend i18n
- Typed result classes implement `IEndpointMetadataProvider` for automatic OpenAPI documentation
- No manual `.ProducesApiResponses()` needed - status codes are inferred from return type

**❌ NEVER use:**
- `TypedResults.Forbid()` (empty body, no translation key)
- `TypedResults.Unauthorized()` (empty body, no translation key)
- `TypedResults.Json(..., statusCode: 4xx)` for errors (breaks OpenAPI inference)

### String Comparison

**NEVER use `.ToLowerInvariant()` with `==` for case-insensitive comparison:**

```csharp
// ❌ WRONG - Creates temporary strings
if (email.ToLowerInvariant() == other.ToLowerInvariant())

// ✅ CORRECT - No temporary strings
if (email.Equals(other, StringComparison.OrdinalIgnoreCase))

// ✅ CORRECT - For Contains, StartsWith, EndsWith
if (email.Contains("@example.com", StringComparison.OrdinalIgnoreCase))
if (path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
```

**For database queries:** Store emails in lowercase, compare directly:

```csharp
// ✅ CORRECT - Normalize once for storage
var normalizedEmail = email.ToLowerInvariant();
var user = await (
    from u in _dbContext.User
    where u.Email == normalizedEmail  // Direct comparison
    select u
).FirstOrDefaultAsync(cancellationToken);
```

### OpenAPI Documentation

**CRITICAL:** Use `TypedProblems.*` methods for automatic OpenAPI documentation.

```csharp
// Handler return type includes typed results - OpenAPI is auto-documented!
public static async Task<Results<
    Ok<Response>,
    AppBadRequestHttpResult,     // Auto-documented as 400 with AppProblemDetails
    AppForbiddenHttpResult       // Auto-documented as 403 with AppProblemDetails
>> HandleAction(...) {
    if (!authorized) {
        return TypedProblems.Forbidden("Forbidden", ResponseKeys.Forbidden);
    }
    // ...
}

// Endpoint registration - no manual status code documentation needed!
group.MapPost("/", Handler.HandleAction)
    .WithReqBodyValidation<CreateBody>();
    // ✅ 200 auto-documented by Ok<Response>
    // ✅ 400 auto-documented by AppBadRequestHttpResult (generic bad request)
    // ✅ 403 auto-documented by AppForbiddenHttpResult
    // ✅ 422 auto-documented by WithReqBodyValidation (validation errors)
```

**How automatic documentation works:**
- Typed result classes (`AppForbiddenHttpResult`, `AppUnauthorizedHttpResult`, etc.) implement `IEndpointMetadataProvider`
- Filter extension methods (`.WithSessionAuthentication()`, `.WithStaffAuthorization()`, etc.) add their possible error responses automatically
- No manual `.ProducesApiResponses()` calls needed

**Why:** TypeScript API client is auto-generated from OpenAPI spec. Typed results ensure accurate documentation without manual maintenance.

### 500 Internal Server Error Documentation

**CRITICAL:** The global exception handler can return 500 for ANY endpoint. How 500 is documented depends on the endpoint type.

**Authenticated endpoints (auto-documented):**
Auth filter extension methods automatically add 500 to OpenAPI documentation:
- `.WithSessionAuthentication()` → adds 401, 500
- `.WithStaffAuthorization()` → adds 403, 500
- `.WithTenantAuthorization()` → adds 401, 403, 404, 500

```csharp
// ✅ 500 is auto-documented via auth filter
group.MapGet("/user", GetUser.HandleGetUser)
    .WithSessionAuthentication();  // Adds 401, 500 automatically
```

**Anonymous endpoints (manual documentation required):**
Endpoints without auth filters do NOT automatically document 500, even though the global exception handler can still return it. You MUST add `.ProducesAppProblem(StatusCodes.Status500InternalServerError)` manually.

```csharp
// ❌ WRONG - Anonymous endpoint missing 500 documentation
group.MapPost("/login", Login.HandleLogin)
    .WithReqBodyValidation<LoginBody>();
    // Global exception handler can return 500, but it's not documented!

// ✅ CORRECT - Manually document 500 for anonymous endpoints
group.MapPost("/login", Login.HandleLogin)
    .WithReqBodyValidation<LoginBody>()
    .ProducesAppProblem(StatusCodes.Status500InternalServerError);
```

**Rule:** When creating anonymous endpoints (no auth filter), always add:
```csharp
.ProducesAppProblem(StatusCodes.Status500InternalServerError)
```

**Anonymous endpoints requiring manual 500 documentation:**
- Login/Register endpoints (`/auth/login`, `/auth/register`)
- Password reset flow (`/auth/reset-password`, `/auth/check-reset-password-token`)
- Email verification (`/auth/verify-email-request`, `/auth/verification-link`, `/auth/check-email-verification-token`)
- Public invitation endpoints (`/invitations/{token}/details`, `/invitations/{token}/accept`, `/invitations/check`)
- Any future public/anonymous endpoints

### Code Formatting

**Always use braces on `if`/`else`/`for`/`foreach`/`while` blocks:**

```csharp
// ❌ WRONG - Bracketless if body
if (element is null)
    return true;
if (!ok) return false;

// ✅ CORRECT - Always wrap in braces
if (element is null) {
    return true;
}
if (!ok) {
    return false;
}
```

Single-statement bodies are not exempt. This prevents subtle bugs when adding lines later, and makes control flow unambiguous during code review.

**Maximum line length: 100 characters**

```csharp
// ❌ WRONG - Line too long
public static async Task<Results<Ok<Response>, AppBadRequestHttpResult, AppForbiddenHttpResult>> HandleAction([FromServices] IAuthContext authContext, [FromServices] IService service, [FromBody] CreateBody request, CancellationToken cancellationToken = default) {

// ✅ CORRECT - Break into multiple lines
public static async Task<Results<
    Ok<Response>,
    AppBadRequestHttpResult,
    AppForbiddenHttpResult
>> HandleAction(
    [FromServices] IAuthContext authContext,
    [FromServices] IService service,
    [FromBody] CreateBody request,
    CancellationToken cancellationToken = default
) {
    // Implementation
}
```

### Enum Parsing on Entities

When an entity has an associated enum (e.g., `NoticeSeverity`, `UserStatus`, `AccountLevel`), add a `Parse{EnumName}(string)` static method on the entity class. Handlers must use these methods instead of inline switch expressions or `Enum.Parse`.

```csharp
// ❌ WRONG - Inline switch expression in handler
var severity = severityStr switch {
    "info" => NoticeSeverity.Info,
    "warning" => NoticeSeverity.Warning,
    "critical" => NoticeSeverity.Critical,
    _ => NoticeSeverity.Info
};

// ✅ CORRECT - Static parse method on entity
// In entity file:
public static NoticeSeverity? ParseSeverity(
    string severity
) {
    var isInfo = string.Compare(
        severity, "info",
        StringComparison.OrdinalIgnoreCase
    ) == 0;
    if (isInfo) {
        return NoticeSeverity.Info;
    }
    // ... other cases
    return null;
}

// In handler:
var severity = SystemNotice.ParseSeverity(severityStr)
    ?? throw new InvalidOperationException(
        $"Severity parser rejected validated value '{severityStr}'."
    );
```

**Why:** Centralizes parsing logic, ensures case-insensitive comparison using `string.Compare` (no `.ToLowerInvariant()` allocation), and keeps entity-related logic on the entity.

### Prefer `if` Blocks Over `??` Throw for Guard Clauses

For multi-line guard checks (e.g., auth context guards with descriptive messages), prefer explicit `if` blocks. Both patterns are idiomatic C#; use whichever is more readable for the specific case.

```csharp
// ✅ PREFERRED for multi-line guards - Clear guard clause
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has "
        + ".WithPermission() middleware."
    );
}

// ✅ ACCEPTABLE for short, single-line guards
var account = authContext.AccountStaff
    ?? throw new InvalidOperationException(
        "Staff account not found"
    );
```

### Body DTO Getter Methods

Request body DTOs must expose `Get{PropertyName}()` methods that use `JsonElementExtensions` to extract typed values. Never extract values from `JsonElement` directly in handler methods.

```csharp
// ✅ CORRECT - Getter methods on body DTO
public record CreateSystemNoticeBody {
    public required JsonElement Severity { get; init; }
    public required JsonElement Title { get; init; }
    public JsonElement? ExpiresAt { get; init; }

    public string GetSeverity() =>
        Severity.GetValueAsString();

    public string GetTitle() =>
        Title.GetValueAsString();

    public DateTime? GetExpiresAt() =>
        ExpiresAt.GetValueAsDateTimeOrNull();
}

// In handler - clean extraction:
var severityStr = body.GetSeverity();
var title = body.GetTitle();
var expiresAt = body.GetExpiresAt();

// ❌ WRONG - Inline extraction in handler
var severityStr = body.Severity
    .GetValueAsString().ToLowerInvariant();
var title = body.Title.GetValueAsString();
DateTime? expiresAt = null;
if (body.ExpiresAt is not null
    && body.ExpiresAt.Value.ValueKind
        == JsonValueKind.String) {
    expiresAt = DateTime.Parse(
        body.ExpiresAt.Value.GetString()!
    ).ToUniversalTime();
}
```

**Why:** Keeps handlers focused on orchestration. Extraction logic is testable, reusable, and consistent across handlers that share the same body DTO.

### Guard Clause in Staff Handlers

When a handler behind `.WithPermission()` needs `authContext.AccountStaff`, use a guard `if` block that throws `InvalidOperationException` (not `TypedProblems.Forbidden()`). This is a developer safety net — the middleware guarantees the account exists.

```csharp
// ✅ CORRECT - Developer safety net
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has "
        + ".WithPermission() middleware."
    );
}

// ❌ WRONG - Returns HTTP error for a developer mistake
if (authContext.AccountStaff is null) {
    return TypedProblems.Forbidden(
        "Not authorized",
        ResponseKeys.Forbidden
    );
}
```

### DTO Placement: Service vs Handler

Service input/output DTOs (return types, result discriminated unions) belong in the service file. HTTP request/response DTOs and validators belong in the handler file. When a type is used as both service output and HTTP response, prefer keeping one definition in the service file over duplicating.

```
Service file:
  - FindSystemNoticesResult (discriminated union)
  - SystemNoticeListItem (used by service and handler)
  - ActiveSystemNotice (used by service and handler)

Handler file:
  - CreateSystemNoticeBody (request DTO)
  - SystemNoticeCreated (response DTO unique to this handler)
  - CreateSystemNoticeBodyValidator
```

### PatchField\<T\> for Nullable PATCH Fields

> Full guide with examples, decision tree, anti-patterns, and validator patterns: [`docs/guides/patchfield-pattern.md`](docs/guides/patchfield-pattern.md)

**CRITICAL:** `PatchField<T>` (`apps/api/Src/Lib/PatchField.cs`) is the **mandatory** way to represent three-state nullable fields in PATCH/update endpoints.

**Checklist:**

1. **Use when:** Update/PATCH endpoint + nullable entity field + client can clear it
2. **DTO property:** Non-nullable `JsonElement` (NOT `JsonElement?` — nullable cannot distinguish omitted from explicit null)
3. **Getter method:** `ValueKind` switch → `Undefined` = `Absent()`, `Null` = `Set(null)`, `String` = `Set(parsed)`, `_` = throw
4. **Args record:** `PatchField<T?>` field in the service args record (NOT `DateTime?` + `bool clearX`)
5. **Service impl:** `if (args.Field.IsPresent) { entity.Field = args.Field.Value; }`
6. **Safety:** `.Value` throws when absent — always check `IsPresent`, use `TryGetValue`, or use `Match`
7. **Never:** Use `JsonElement?` for clearable fields, use `PatchField` for required fields, access `.Value` without `IsPresent` check

**Quick reference:**

```csharp
// DTO (handler file) — clearable field uses non-nullable JsonElement
public JsonElement ExpiresAt { get; init; }

public PatchField<DateTime?> GetExpiresAt() =>
    ExpiresAt.ValueKind switch {
        JsonValueKind.Undefined => PatchField<DateTime?>.Absent(),
        JsonValueKind.Null => PatchField<DateTime?>.Set(null),
        JsonValueKind.String => PatchField<DateTime?>.Set(ExpiresAt.GetValueAsDateTime()),
        _ => throw new InvalidOperationException("ExpiresAt must be string, null, or omitted"),
    };
```

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

### Frontend API Error Handling

**CRITICAL:** The frontend uses a centralized error handling system. Understanding this is essential for writing correct mutation/query code.

**Architecture:**
- All API errors are normalized into `ApiFailure` discriminated union via `toApiFailure()`
- Global handlers in `MutationCache`/`QueryCache` handle toasts and auth errors
- Forms use `withFormValidation()` helper for field-level error mapping

**Default behavior (no code needed):**
```typescript
// ✅ Errors auto-toast - no onError handler required
const { mutate } = useCreateStaffUser();
mutate(data);
```

**Form validation pattern:**
```typescript
import { withFormValidation } from '@/front/lib/api-failure';

// ✅ Field errors mapped to form, other errors still toast
const { mutate } = useCreateStaffUser(
  withFormValidation(form.setError, {
    meta: { showSuccessToast: true },
    onSuccess: () => navigate('/staff'),
  })
);
```

**Opt-out for custom handling:**
```typescript
// ✅ Full control - global handler skipped
const { mutate } = useMyMutation({
  meta: { skipGlobalErrorHandler: true },
  onError: (error) => {
    const failure = toApiFailure(error);
    // Custom handling
  },
});
```

**ApiFailure kinds:**
| Kind | HTTP Status | Default Behavior |
|------|-------------|------------------|
| `validation` | 422 | Toast (unless form handles) |
| `problem` | 400/401/403/404/500 | Toast (401 → logout) |
| `network` | - | Toast "Network error" |
| `abort` | - | Silent |
| `unknown` | - | Toast + log |

**Auth error handling:**
- **401**: Global hook triggers `logout()` immediately
- **403**: Error boundary shows `View403` (no logout - user is authenticated but forbidden)

**Mutation meta options:**
- `showSuccessToast: true` - Toast success message from API response
- `successMessage: "key"` - Override with explicit message
- `validationHandledByForm: true` - Suppress validation toast
- `skipGlobalErrorHandler: true` - Handle all errors locally
- `skipAuthErrorHandler: true` - Don't logout on 401 (rare)

**Reference:** See `docs/guides/frontend-error-handling.md` for complete guide.

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

## OpenAPI & Kiota Client Generation Safeguards

For the complete Kiota safeguards guide (JsonElement nullability, generic types bug, schema transformer,
client regeneration workflow, and TypeScript patterns), see:
[`docs/guides/openapi-kiota-safeguards.md`](docs/guides/openapi-kiota-safeguards.md)

**Key rules (always apply):**
- Required body fields: non-nullable `JsonElement` (not `JsonElement?`) for cleaner TypeScript types
- Never add XML comments to generic types (`<T>`) — triggers .NET 10 OpenAPI bug
- After DTO/endpoint changes: `make build-api && make generate-client && make tsc-front`
- Use `createUntypedString()` / `createUntypedArray()` for request body fields in TypeScript

## Documentation Organization

- **Never** place generated docs at the repo root — always under `docs/`
- Use existing subdirectories when appropriate; create new ones with kebab-case names
- Existing dirs: `docs/implementation-plans/`, `docs/refactoring-guides/`, `docs/roadmaps/`, `docs/reviews/`, `docs/misc/`
- Only `docs/guides/` files should be referenced from AGENTS.md; unreferenced guides belong elsewhere
