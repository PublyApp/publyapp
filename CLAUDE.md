# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PublyApp is a modern full-stack multi-tenant SaaS application built with .NET 9.0 and React 19. The monorepo architecture uses Turborepo and pnpm workspaces with three user scopes: Staff (platform administrators), Tenant (organization-level users), and Project (project-level users).

## Development Commands

### Starting Development Servers

```bash
# Terminal 1 - Start API with hot reload
make dev-api

# Terminal 2 - Start React frontend with Vite
make dev-front

# Start PostgreSQL in Docker
make dev-db
```

### Building

```bash
make build-api          # Build .NET API
make build-front        # Build React frontend for production
make build-deploy       # Build everything for deployment
```

### Code Quality

```bash
make check-write        # Run Biome linting + formatting (auto-fix)
make tsc-front          # TypeScript type checking
make knip               # Check for unused dependencies
```

### Database Operations

```bash
make db-migrate                # Run EF Core migrations
make db-add NAME=MigrationName # Add new migration
make db-reset                  # Drop and recreate database
make db-remove                 # Remove last migration
```

### API Client Generation

After backend changes that modify the API contract:

```bash
make generate-client    # Generate TypeScript client from OpenAPI
```

This is critical - the frontend TypeScript client is auto-generated from the backend OpenAPI spec.

### Running Single Tests

Currently no automated tests are implemented. When added, use:

```bash
# .NET tests (when implemented)
dotnet test apps/api/Tests/

# Frontend tests (when implemented)
cd apps/front && pnpm test
```

## Architecture

### Monorepo Structure

```
apps/
├── api/              # .NET 9.0 Web API backend
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

**Data Fetching Pattern:**
```tsx
// Server-side loader
export const loader = getServerLoader({
  loader: async ({ params, apiClient }) => {
    const data = await apiClient.staff.staffMembers.get();
    return { data };
  }
});

// Client-side query
const { data } = useQuery({
  queryKey: ['staff-members'],
  queryFn: () => api.staff.staffMembers.get()
});
```

### Authentication & Authorization

**Authentication:**
- Session-based with token in `X-Session-Token` header
- `AuthContext`: Scoped service providing current user info
- Middlewares: `SessionAuthMiddleware`, `StaffAuthMiddleware`, `TenantAuthMiddleware`

**Authorization:**
- Permission-based using `PermissionFilter`
- Permissions defined in `Permission` entity
- Profile-permission mappings in `ProfilePermission`

**Middleware order (critical):**
1. Security headers
2. Exception handling
3. CORS
4. Tenant header check
5. Session header check
6. Session authentication
7. Staff authorization (for `/staff/*` routes)

### Internationalization (i18n)

**Translation workflow:**
1. Add translations to `packages/shared/lib/i18n/json/*.json`
2. Auto-generated C# constants in `apps/api/Src/Generated/ResponseKeys.g.cs`
3. Auto-generated Zod i18n map on `pnpm install`

**Translation namespaces:**
- `common`: General UI translations
- `zod`: Validation error messages
- `response-message`: API response messages

**Usage:**
```typescript
// Frontend
const { t } = useTranslation('common');
t('key.path');

// Backend
using static PublyApp.Api.Generated.ResponseKeys;
return TypedResults.BadRequest(new ApiResponse { Message = ValidationError });
```

### API Routes

**Backend route patterns:**
```
/auth/*           # Authentication (login, register, password reset)
/staff/*          # Staff-specific endpoints
/tenant/*         # Tenant-specific endpoints
```

Routes defined in `apps/api/Src/Lib/RoutePath.cs` and frontend in `packages/shared/lib/constants.ts`.

## C# Coding Standards

### Null Checking

**Always use pattern matching (`is`/`is not`) instead of equality operators:**

```csharp
// ✅ CORRECT
if (user is not null)
if (tenant is null)

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

**Backend:**
1. Create feature directory: `apps/api/Src/Features/[Domain]/[Feature]/`
2. Create service: `[Feature]Service.cs`
3. Create handlers in `Handlers/` directory
4. Create validators using FluentValidation
5. Register endpoints in `[Feature]Endpoints.cs`
6. Add route constants to `apps/api/Src/Lib/RoutePath.cs`
7. Add translation keys to `packages/shared/lib/i18n/json/en/response-message.json`
8. If database changes: `make db-add NAME=MigrationName` then `make db-migrate`
9. Generate client: `make generate-client`

**Frontend:**
1. Create route file in `app/routes/[section]/[page]/`
2. Add route to `app/routes.ts`
3. Create query/mutation hooks using `react-query-kit`
4. Use auto-generated API client from `packages/js-client`
5. Add translations to `packages/shared/lib/i18n/json/en/common.json`

### Updating API Contract

**After changing request/response types or endpoints:**

```bash
# 1. Build API to generate updated OpenAPI spec
make build-api

# 2. Generate updated TypeScript client
make generate-client

# 3. Update frontend code to use new types
```

The TypeScript client is auto-generated - never modify files in `packages/js-client/` manually.

### Adding Database Entities

1. Create entity class in `apps/api/Src/Features/[Domain]/[Entity].cs`
2. Implement appropriate tenant interface: `ITenantEntity`, `IOptionalTenantEntity`, or `INoTenantEntity`
3. Inherit from `BaseAttributes` for automatic audit tracking
4. Add `DbSet<[Entity]>` to `MainApiDbContext`
5. Configure entity in `OnModelCreating` if needed
6. Create migration: `make db-add NAME=Add[Entity]Table`
7. Review and apply: `make db-migrate`

### Handling Permissions

**Adding a new permission:**
1. Add permission to database seed in `apps/api/Src/Data/Seeder.cs`
2. Use `PermissionFilter` on endpoints that require it
3. Check permissions in handlers via `AuthContext`

**Example:**
```csharp
public static async Task<Results<Ok<Response>, Forbidden>> Handle(
    [FromServices] IAuthContext auth,
    // ... other params
)
{
    if (!auth.HasPermission("staff_member.update"))
        return TypedResults.Forbid();

    // ... handler logic
}
```

## Important Conventions

### Route Naming

- Backend routes use kebab-case: `/staff/staff-members`
- Route constants defined in `apps/api/Src/Lib/RoutePath.cs`
- Frontend route constants in `packages/shared/lib/constants.ts`

### API Response Format

All endpoints return:
```csharp
public class ApiResponse {
    public string? Message { get; set; }  // i18n key for translation
    public object? Data { get; set; }      // Optional response data
}
```

### Validation

- Backend: FluentValidation validators applied via filters
- Frontend: Zod schemas with React Hook Form
- Shared validation logic in `packages/shared/lib/zod/`

### Error Handling

- Backend: Structured logging with Serilog, contextual error information
- Frontend: React Router error boundaries, custom error pages (400, 403, 404, 500)
- Always log before rethrowing exceptions

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

Interactive API documentation available at `/scalar/v1` when API is running. This is the source of truth for the API contract and drives TypeScript client generation.
