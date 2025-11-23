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

### Running Single Tests

Currently no automated tests are implemented. When added, use:

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
├── _tsconfig/        # Shared TypeScript configurations
└── _tx-key-gen/      # Translation key generator (.NET tool)
```

### Backend Architecture (Vertical Slice)

The backend follows **Vertical Slice Architecture** where each feature is self-contained:

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
- **CQRS-lite**: Request handlers pattern
- **Minimal APIs**: ASP.NET Core minimal API endpoints
- **FluentValidation**: Automatic validation via filters
- **Response Format**: All endpoints return `ApiResponse` with `Message` and `Data`

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

**API Client Integration:**
- Microsoft Kiota auto-generated client from OpenAPI
- Singleton `ClientManager` in `app/lib/js-client/`
- Session token from `X-Session-Token` header
- API client instances: `apiClient` (authenticated), `anonApiClient` (anonymous)

**Data Fetching Pattern (Route-Type Specific):**

**CRITICAL:** Data fetching strategy depends on route type:

1. **Marketing Pages** (`app/routes/marketing/**`) → SSR with React Router loaders/actions
2. **Auth Pages** (`app/routes/auth/**`) → SSR with React Router loaders/actions (hide API endpoints)
3. **Authed Pages** (`app/routes/authed/**`) → Client-only with TanStack Query (NO SSR)

```tsx
// ❌ WRONG - Server loader in authenticated dashboard page
// File: app/routes/authed/staff/members-page.tsx
export const loader = async ({ apiClient }) => {
  const data = await apiClient.staff.staffMembers.get();
  return { data };
};

// ✅ CORRECT - react-query-kit hooks for authenticated pages
// Step 1: Define hook in app/lib/react-query/features/staff/staff-member.hooks.ts
import { createQuery } from 'react-query-kit';
import { getQueryKey } from '../../query-utils';

const findStaffMemberQueryKey = getQueryKey<ApiClient>(
  (client) => client.staff.staffMembers.get,
);

export const useFindStaffMember = createQuery({
  queryKey: [findStaffMemberQueryKey] as const,
  fetcher: async (params: { page?: number }) => {
    const result = await clientManager.apiClient.staff.staffMembers.get({
      queryParameters: { page: params.page?.toString() },
    });
    if (_.isNil(result)) throw new Error(`[${findStaffMemberQueryKey}]: result is nil`);
    return result;
  },
});

// Step 2: Use hook in component
// File: app/routes/authed/staff/members-page.tsx
import { useFindStaffMember } from '@/front/lib/react-query/features/staff/staff-member.hooks';

function StaffMembersPage() {
  const { data, isLoading } = useFindStaffMember({ variables: { page: 1 } });
  return <div>{/* render */}</div>;
}

// ✅ CORRECT - Server loader for auth pages (hide endpoints)
// File: app/routes/auth/login/login-page.tsx
export const loader = getServerLoader({
  loader: async ({ apiClient }) => {
    // Pre-fetch data server-side
    return data({ ... });
  }
});

// ✅ CORRECT - Mutations in authed pages use react-query-kit
// Step 1: Define mutation hook
import { createMutation } from 'react-query-kit';

export const useCreateMember = createMutation({
  mutationKey: [createMemberMutationKey] as const,
  mutationFn: async (data: { email: string }) => {
    const result = await clientManager.apiClient.staff.members.post({
      email: { getValue() { return data.email; } },
    });
    if (_.isNil(result)) throw new Error('result is nil');
    return result;
  },
});

// Step 2: Use in component
function CreateMemberDialog() {
  const { mutate } = useCreateMember({
    onSuccess: () => queryClient.invalidateQueries(['staff.members.get'])
  });
}
```

**Why different strategies:**
- **Marketing/Auth pages:** SSR for SEO and security (hide API endpoints)
- **Authed pages:** Client-only for better UX, real-time updates, no SEO needed
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
      queryKey: useFindStaffMember.getKey({ page: 1 }),
      queryFn: () => useFindStaffMember.fetcher({ page: 1 }),
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

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

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
    public static async Task<Results<Ok<InvitationCreated>, BadRequest<ApiResponse>, Forbidden<ApiResponse>>>
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

**Exception:** Infrastructure services (ILogger, IConfiguration, IOptions) are OK since they don't create circular dependencies.

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

**CRITICAL:** All responses MUST follow the `ApiResponse` pattern.

**Rules:**
1. **Success WITH data**: Return data directly using `TypedResults.Ok(data)`
2. **Success WITHOUT data**: Return `ApiResponse` using `TypedResults.Ok(new ApiResponse { ... })`
3. **All error responses**: MUST return `ApiResponse` with appropriate status code

```csharp
// ✅ Success WITH data - return data directly
public static async Task<Results<
    Ok<User>,
    NotFound<ApiResponse>
>> HandleGetUser(...) {
    var user = await userService.GetUserAsync(id);

    if (user is null) {
        return TypedResults.NotFound(
            ApiResponse.Create("User not found", ResponseKeys.NotFound)
        );
    }

    return TypedResults.Ok(user);  // Data returned directly
}

// ✅ Success WITHOUT data - return ApiResponse
public static async Task<Results<
    Ok<ApiResponse>,
    NotFound<ApiResponse>
>> HandleDeleteUser(...) {
    var success = await userService.DeleteUserAsync(id);

    if (!success) {
        return TypedResults.NotFound(
            ApiResponse.Create("User not found", ResponseKeys.NotFound)
        );
    }

    // No data to return, so return ApiResponse
    return TypedResults.Ok(
        ApiResponse.Create("User deleted successfully", ResponseKeys.UserDeleted)
    );
}

// ✅ For responses that don't support custom payload - use JsonHttpResult
public static async Task<Results<
    Ok<User>,
    BadRequest<ApiResponse>,
    JsonHttpResult  // For 403 since Forbid() doesn't support payload
>> HandleUpdateUser(...) {
    if (!hasPermission) {
        return TypedResults.Json(
            ApiResponse.Create(
                "User does not have the necessary permissions",
                ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
            ),
            statusCode: StatusCodes.Status403Forbidden
        );
    }

    var updatedUser = await userService.UpdateUserAsync(user);
    return TypedResults.Ok(updatedUser);
}
```

**When TypedResults doesn't support custom payloads** (like `.Forbid()`, `.Unauthorized()`):
Use `TypedResults.Json()` with explicit status code and `ApiResponse` payload.

**❌ NEVER use:**
- `TypedResults.Ok()` without payload
- `TypedResults.Forbid()` (use `TypedResults.Json(..., statusCode: 403)` instead)
- `TypedResults.Unauthorized()` (use `TypedResults.Json(..., statusCode: 401)` instead)

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

**CRITICAL:** Document ALL status codes the handler can return.

```csharp
// Handler returns these status codes
public static async Task<Results<
    Ok<Response>,
    BadRequest<ApiResponse>,
    Forbidden<ApiResponse>,       // Must document this!
    JsonHttpResult<ApiResponse>   // Must document custom status codes!
>> HandleAction(...) {
    if (!authorized) {
        return TypedResults.Json(
            ApiResponse.Create("Forbidden", ResponseKeys.Forbidden),
            statusCode: StatusCodes.Status403Forbidden  // Custom status code
        );
    }
}

// Endpoint MUST document ALL possible responses
group.MapPost("/", Handler.HandleAction)
    .WithReqBodyValidation<CreateBody>()
    .ProducesApiResponses(
        StatusCodes.Status500InternalServerError,  // Always include
        StatusCodes.Status403Forbidden             // From JsonHttpResult!
        // 400 auto-documented by WithReqBodyValidation
        // 200 auto-documented by Ok<Response>
    );
```

**Rule:** If handler uses `JsonHttpResult` → Must add status code to `ProducesApiResponses`.

**Why:** TypeScript API client is auto-generated from OpenAPI spec. Missing status codes = broken error handling in frontend.

### Code Formatting

**Maximum line length: 100 characters**

```csharp
// ❌ WRONG - Line too long
public static async Task<Results<Ok<Response>, BadRequest<ApiResponse>, Forbidden<ApiResponse>>> HandleAction([FromServices] IAuthContext authContext, [FromServices] IService service, [FromBody] CreateBody request, CancellationToken cancellationToken = default) {

// ✅ CORRECT - Break into multiple lines
public static async Task<Results<
    Ok<Response>,
    BadRequest<ApiResponse>,
    Forbidden<ApiResponse>
>> HandleAction(
    [FromServices] IAuthContext authContext,
    [FromServices] IService service,
    [FromBody] CreateBody request,
    CancellationToken cancellationToken = default
) {
    // Implementation
}
```

## Common Workflows

### Adding a New Feature

**Quick reference:**
- After API contract changes: `just build-api && just generate-client` (never modify `packages/client-ts/` manually)
- New entity: inherit `BaseAttributes`, implement tenant interface, add `DbSet`, `just db-add <MigrationName> && just db-migrate`
- New permission: add to `Seeder.cs`, use `PermissionFilter` on endpoint, check via `AuthContext.HasPermission()`

**Frontend:**
1. Create route file in `app/routes/[section]/[page]/`
2. Add route to `app/routes.ts`
3. Create query/mutation hooks using `react-query-kit`
4. Use auto-generated API client from `packages/js-client`
5. Add translations to `packages/shared/lib/i18n/json/en/common.json`

### Updating API Contract

**Key rules (always apply):**
- Backend routes use kebab-case; constants in `RoutePath.cs` (backend) and `constants.ts` (frontend)
- Errors: `AppProblemDetails` (400/401/403/404/500) + `ValidationProblemDetails` (422) — both RFC 7807
- Frontend/Node: use `logger` from `@/shared/lib/logger/iso-logger` (not `console.*`)
- Frontend API errors: centralized via `ApiFailure` discriminated union — see [`docs/guides/frontend-error-handling.md`](docs/guides/frontend-error-handling.md)
- Frontend local mutation handlers must derive user-facing error text through `getFailureMessage(toApiFailure(error), ...)`; never translate `response-message` keys manually at the call site

## Development Environment

**Access points when running locally:**
- Frontend: http://localhost:5050
- API: http://localhost:5000
- API Documentation (Scalar): http://localhost:5000/scalar/v1
- PostgreSQL: localhost:5454

**Environment variables:**
- Development: `.env.development` (committed)
- Production: `.env.production` (not in repo)
- Validated at startup via `AppSettings` class

## Deployment

The project uses Dokploy on Hostinger VPS:
1. Code pushed to GitHub
2. Docker images built and pushed to GitHub Container Registry
3. Dokploy pulls images and deploys
4. Traefik reverse proxy handles SSL and routing

Configuration in `dokploy.yml`.

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

**CRITICAL:** When generating documentation files during chat sessions (implementation plans, refactoring guides, roadmaps, reviews, etc.), you MUST organize them intelligently in the `docs/` directory to make them easy to find later.

**Guidelines:**

- **NEVER place generated documentation files at the repository root**
- **Organize by relevance and type** - Create or use subdirectories that make logical sense for the document type
- **Use existing subdirectories when appropriate** - Check `docs/` for existing folders before creating new ones
- **Create new subdirectories as needed** - You have full freedom to create new organizational structures that improve searchability
- **Use descriptive folder names** - Use kebab-case names that clearly indicate the content type (e.g., `implementation-plans`, `architecture-decisions`, `api-designs`, `database-schemas`, `performance-analysis`)

**Existing subdirectories** (as examples, not prescriptive):
- `docs/implementation-plans/` - Detailed plans for implementing features
- `docs/refactoring-guides/` - Guides for refactoring existing code
- `docs/roadmaps/` - Project roadmaps and milestone planning
- `docs/reviews/` - Code reviews, architecture reviews, design reviews
- `docs/misc/` - Miscellaneous documentation

**Principle:** Organize intelligently so that developers can easily find relevant documentation by browsing the `docs/` folder structure. Think about how someone would search for this document later.
