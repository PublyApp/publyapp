# C# Coding Standards

> Extracted from `AGENTS.md` — complete C# coding standards for the PublyApp .NET API.

## Null Checking

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

## No Null-Coalescing Throw (`?? throw`)

**Never use `?? throw` for null checks. Use traditional `if` guard clauses instead:**

```csharp
// ❌ WRONG - Null-coalescing throw
var account = authContext.AccountStaff
    ?? throw new InvalidOperationException("Not found");

var email = element.GetString()
    ?? throw new InvalidOperationException("Null email");

// ✅ CORRECT - Traditional guard clause
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException("Not found");
}

var email = element.GetString();
if (email is null) {
    throw new InvalidOperationException("Null email");
}
```

This applies everywhere: handlers, services, utilities, constructors, property getters, and test helpers.
When the `?? throw` is inside a LINQ `.Select()` or switch expression, refactor to use guard clauses with early returns or loops.

## LINQ Queries

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

## Collection Checking

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

## Async/Await Patterns

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

## Handler Architecture (Vertical Slice)

**CRITICAL:** Each handler file must be self-contained with ALL related code in ONE file.

```csharp
// ✅ CORRECT - Everything in one file: Handler + DTOs + Validators
// File: apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs

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

## DTO and Request/Response Patterns

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

**Update/PATCH body DTOs with clearable nullable fields:** Use non-nullable `JsonElement` (NOT `JsonElement?`) for clearable fields, and `PatchField<T>` in the getter method to distinguish "not sent" from "explicitly null". See the **PatchField\<T\> for Nullable PATCH Fields** section and [`docs/guides/patchfield-pattern.md`](patchfield-pattern.md) for the full pattern.

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

## Service Layer Separation

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
- Clearable nullable fields (need to distinguish "not sent" from "set to null"): use `PatchField<T?>` — see **PatchField\<T\> for Nullable PATCH Fields** section and [`docs/guides/patchfield-pattern.md`](patchfield-pattern.md)

## Service Method Args Records

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

## Dependency Injection Rules

### Adding a New Application Service

- **Namespace**: Place concrete class under `MainApi.Src.Modules.<Domain>.Services`
- **Primary interface**: Define `I{ClassName}` interface (e.g., `UserService` → `IUserService`)
- **Explicit lifetime**: Specify `ServiceLifetime` explicitly (Scoped, Transient, or Singleton)
- **One unkeyed default**: Exactly one unkeyed registration per service type is allowed
- **Key governance**: If multiple implementations exist, additional ones must be keyed using constants (never inline strings)

### Adding a Keyed Implementation

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

### DI Group Boundaries

- **Web group** (`AddWebServices`): ASP.NET Core wiring (ProblemDetails, OpenAPI, CORS, compression)
- **Infrastructure group** (`AddInfraServices`): External capabilities (DbContext, SDK clients, email, health checks)
- **Application group** (`AddAppServices`): Business services only (`MainApi.Src.Modules.*.Services`)

### Attribute-Based Application Service Registration (`[Service]`)

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

### Fail-Fast Validation (Troubleshooting)

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

### DI Manifest Logging (Optional)

If enabled, the app logs a discovered `[Service]` manifest once during startup (after `builder.Build()`),
so the configured logging pipeline is guaranteed to be active.

- **Config flag**: `DI_MANIFEST_ENABLED` environment variable (defaults to `false`)
- **Logging**: Uses the configured Serilog pipeline (no temporary ServiceProvider)
- **Noise control**: No output when no `[Service]` attributes are discovered

## AppEnvironment (Configuration)

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

## Service Dependencies

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

## Naming Conventions

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

## API Response Pattern

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

**NEVER use:**
- `TypedResults.Forbid()` (empty body, no translation key)
- `TypedResults.Unauthorized()` (empty body, no translation key)
- `TypedResults.Json(..., statusCode: 4xx)` for errors (breaks OpenAPI inference)

## Write Operation Response Standard (Create / Update / Delete)

**CRITICAL:** All write operation handlers must follow a consistent response pattern based on the operation type.

| Operation | Response | Why |
|---|---|---|
| **Create** | Return created entity DTO via `Created<TResult>` (201) | Industry standard; client needs server-generated ID, timestamps, computed fields |
| **Update** | Return updated entity DTO via `Ok<TResult>` (200) | Client needs to sync local state without a separate GET |
| **Delete / Destructive** | Return `Ok<ApiResponse>` with message + translationKey | Entity is gone; `ApiResponse` provides i18n support for frontend toast |
| **Action-only** (resend email, trigger) | Return `Ok<ApiResponse>` with message + translationKey | No entity state change to report |

```csharp
// ✅ CORRECT - Create returns 201 with entity DTO
return TypedResults.Created(
    (string?)null,
    new SystemNoticeCreated {
        Id = notice.GetRequiredId(),
        Title = notice.Title,
        // ... all relevant fields
    }
);

// ✅ CORRECT - Update returns updated entity DTO
return TypedResults.Ok(new GetTenantAsStaffResult {
    TenantId = tenant.GetRequiredId(),
    Name = tenant.Name,
    // ... all relevant fields
});

// ✅ CORRECT - Delete returns ApiResponse
return TypedResults.Ok(
    ApiResponse.Create(
        "Tenant deleted successfully",
        ResponseKeys.TenantDeletedSuccess
    )
);

// ✅ CORRECT - Action-only returns ApiResponse
return TypedResults.Ok(
    ApiResponse.Create(
        "Invitation email resent successfully",
        ResponseKeys.InvitationResent
    )
);

// ❌ WRONG - Update returns only a message
return TypedResults.Ok(
    ApiResponse.Create(
        "Updated successfully",
        ResponseKeys.Updated
    )
);

// ❌ WRONG - Delete returns NoContent (no i18n key)
return TypedResults.NoContent();
```

**Why return entity data on Create/Update?**
- Eliminates the need for a follow-up GET request
- Server-generated values (ID, timestamps, computed fields) are immediately available
- Frontend cache invalidation can be replaced with optimistic update using returned data

**Why `ApiResponse` instead of `NoContent()` for Delete?**
- Provides `translationKey` for frontend i18n toast messages
- Consistent structured JSON response body
- `NoContent` (204) returns an empty body with no i18n support

## String Comparison

**NEVER use `.ToLower()` / `.ToLowerInvariant()` as a comparison, membership, or
dispatch strategy.**

```csharp
// ❌ WRONG - Creates temporary strings
if (email.ToLowerInvariant() == other.ToLowerInvariant())

// ✅ CORRECT - No temporary strings
if (email.Equals(other, StringComparison.OrdinalIgnoreCase))

// ✅ CORRECT - For Contains, StartsWith, EndsWith
if (email.Contains("@example.com", StringComparison.OrdinalIgnoreCase))
if (path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))

// ❌ WRONG - Dispatch via lowered string
return sortId.ToLowerInvariant() switch {
    "created_at" => query.OrderBy(x => x.CreatedAt),
    "updated_at" => query.OrderBy(x => x.UpdatedAt),
    _ => query.OrderBy(x => x.Id),
};

// ✅ CORRECT - Case-insensitive switch alternative via comparer
if (string.Equals(
    sortId, "created_at", StringComparison.OrdinalIgnoreCase
)) {
    return query.OrderBy(x => x.CreatedAt);
}
if (string.Equals(
    sortId, "updated_at", StringComparison.OrdinalIgnoreCase
)) {
    return query.OrderBy(x => x.UpdatedAt);
}
return query.OrderBy(x => x.Id);

// ✅ CORRECT - Case-insensitive membership
var allowedStatuses = new HashSet<string>(
    ["active", "suspended"],
    StringComparer.OrdinalIgnoreCase
);
if (!allowedStatuses.Contains(status)) {
    return false;
}
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

**Normalization is still allowed when it is the stored canonical value**, such as
email normalization before persistence or lookup. The rule above is specifically
about using `ToLower*()` as the mechanism for comparison, dispatch, filtering, or
allowlist membership in application logic.

## OpenAPI Documentation

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

## 500 Internal Server Error Documentation

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

## Code Formatting

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

## Enum Parsing on Entities

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

## Prefer `if` Blocks Over `??` Throw for Guard Clauses

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

## Body DTO Getter Methods

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

## Cache Reused Body Getter Results

When a handler uses the same body DTO getter more than once, cache the result in
local variables instead of calling the getter repeatedly.

This rule is especially important when the getter returns:

- `PatchField<T>` values
- trimmed/normalized strings
- parsed timestamps
- parsed enums or other semantic wrapper values

### Use cached locals when

1. a getter is used **2 or more times**, or
2. the getter returns a parsing-sensitive value that is then reused across:
   - empty-body guards
   - parser calls
   - args-record construction
   - audit payloads
   - response mapping

### Why

- Prevents repeated parsing/normalization work
- Makes the handler operate on one clear semantic snapshot of the request
- Reduces the chance that guard logic and service args drift apart because they
  were built from repeated inline getter calls
- Makes debugging easier because the parsed values are visible in locals

### Correct pattern

```csharp
var severityStr = body.GetSeverity();
var title = body.GetTitle();
var message = body.GetMessage();
var startsAt = body.GetStartsAt();
var expiresAt = body.GetExpiresAt();

if (severityStr is null
    && title is null
    && message is null
    && startsAt is null
    && !expiresAt.IsPresent) {
    return TypedProblems.BadRequest(
        "No fields to update",
        ResponseKeys.BadRequest
    );
}

NoticeSeverity? severity = null;
if (severityStr is not null) {
    var parsedSeverity =
        SystemNotice.ParseSeverity(severityStr);
    if (parsedSeverity is null) {
        throw new InvalidOperationException(
            "Severity parser rejected validated "
            + $"value '{severityStr}'."
        );
    }
    severity = parsedSeverity.Value;
}

var args = new UpdateSystemNoticeArgs(
    Severity: severity,
    Title: title,
    Message: message,
    StartsAt: startsAt,
    ExpiresAt: expiresAt
);
```

### Avoid repeated inline getter calls

```csharp
// ❌ WRONG - Repeats getters across multiple semantic steps
if (body.GetSeverity() is null
    && body.GetTitle() is null
    && body.GetMessage() is null
    && body.GetStartsAt() is null
    && !body.GetExpiresAt().IsPresent) {
    ...
}

var severityStr = body.GetSeverity();
var args = new UpdateSystemNoticeArgs(
    Severity: severity,
    Title: body.GetTitle(),
    Message: body.GetMessage(),
    StartsAt: body.GetStartsAt(),
    ExpiresAt: body.GetExpiresAt()
);
```

### Do not over-apply this rule

Do **not** create noisy locals for trivial single-use getters. If a getter is
used once and the inline call is clear, keep it inline.

The rule is:

- cache reused or parsing-sensitive getter results
- do not mechanically cache every getter in every handler

## Guard Clause in Staff Handlers

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

## Never Use the Null-Forgiving Operator (`!`) in Production Code

**CRITICAL:** Never use the null-forgiving operator (`!`) in production handler or service code. Always handle null cases explicitly, even when you "know" the value is non-null due to prior checks. Prefer verbose but correct null handling over bold assumptions.

```csharp
// ❌ WRONG - Null-forgiving operator hides potential bugs
var tenant = result.Tenant!;
var id = notice.Id!.Value;
var userId = authContext.UserId!.Value;
var format = query.Format!.ToLowerInvariant();

// ✅ CORRECT - Explicit null guard for service results
if (result.Tenant is null) {
    throw new InvalidOperationException(
        "Service returned success "
        + "but Tenant was null."
    );
}
var tenant = result.Tenant;

// ✅ CORRECT - Use existing safe accessor
var id = notice.GetRequiredId();  // Already throws with message

// ✅ CORRECT - Guard clause for auth context
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has "
        + ".WithPermission() middleware."
    );
}
// Then use account.UserId (non-null on the typed object)

// ✅ CORRECT - Guard for validated query params
if (query.Format is null) {
    return TypedProblems.BadRequest(
        "Format is required",
        ResponseKeys.BadRequest
    );
}
var format = query.Format.ToLowerInvariant();
```

**In FluentValidation DependentRules:** Even inside `DependentRules` where the parent rule guarantees non-null, use explicit null checks instead of `!`:

```csharp
// ❌ WRONG - Relies on DependentRules guarantee
.Must(e => e!.Value.ValueKind == JsonValueKind.String)
.Must(e => e!.Value.GetString()!.Trim().Length >= 2)

// ✅ CORRECT - Explicit null handling
.Must(e =>
    e is not null
    && e.Value.ValueKind == JsonValueKind.String)
.Must(e => {
    if (!e.HasValue) {
        return false;
    }
    var str = e.Value.GetString();
    return str is not null
        && str.Trim().Length >= 2;
})
```

**Exception:** The `!` operator is acceptable in test spec files (`*.Spec.cs`) where assertion patterns like `result!.Id.Should()` are standard FluentAssertions usage.

**Why:** The `!` operator suppresses the compiler's null safety analysis. If the assumption is ever wrong (bug in service layer, race condition, refactoring), the result is a `NullReferenceException` with no helpful context. Explicit guards produce `InvalidOperationException` with a descriptive message that points to the root cause.

## Prefer Guard Clauses Over Switch on Error Enums

When handling discriminated union error results from services (e.g., `result.Error`), use flat `if` guard clauses with early returns instead of `switch` expressions. This style is called "guard clauses" (or "early return pattern").

```csharp
// ❌ WRONG - Switch expression on error enum
if (result.Error is not null) {
    return result.Error switch {
        DeleteTenantError.NotFound =>
            TypedProblems.NotFound(...),
        DeleteTenantError.NotSuspended =>
            TypedProblems.BadRequest(...),
        _ => throw new InvalidOperationException(
            $"Unknown error: {result.Error}"
        )
    };
}

// ✅ CORRECT - Guard clauses with early returns
if (result.Error is DeleteTenantError.NotFound) {
    return TypedProblems.NotFound(
        "Tenant not found",
        ResponseKeys.TenantNotFound
    );
}
if (result.Error is DeleteTenantError.NotSuspended) {
    return TypedProblems.BadRequest(
        "Only suspended tenants can be deleted",
        ResponseKeys.TenantNotSuspendedCannotDelete
    );
}
if (result.Error is not null) {
    throw new InvalidOperationException(
        $"Unknown error: {result.Error}"
    );
}
```

**Why:** Guard clauses are:
- Easier to read — each error case is self-contained with its own `if` block
- Easier to debug — breakpoints can target individual error paths
- More consistent with the project's existing early-return pattern for null checks and validation
- Less indentation nesting than a switch inside an `if`

## Staff Service Method Selection (Suspended Tenant Visibility)

**CRITICAL:** Staff handlers that retrieve tenant data MUST use the `*ForStaff*` service method variant — never the base method that filters suspended tenants.

```csharp
// ❌ WRONG - Filters out suspended tenants (staff can't see them)
var tenant = await tenantAsStaffService.GetTenantByIdAsync(
    tenantIdGuid, cancellationToken
);

// ✅ CORRECT - Only filters deleted tenants (staff can see suspended)
var tenant = await tenantAsStaffService.GetTenantByIdForStaffAsync(
    tenantIdGuid, cancellationToken
);
```

**Why this matters:**
- `GetTenantByIdAsync` calls `Tenant.IsTenantActive()` which returns `false` for suspended tenants, causing the method to return `null` → handler returns 404
- `GetTenantByIdForStaffAsync` only filters `IsDeleted`, allowing staff to view and manage suspended tenants
- Staff users need to see suspended tenants to reactivate them or inspect their state

**General rule:** When a service exposes both a base method and a `*ForStaff*` variant, staff handlers should always prefer the `*ForStaff*` variant. The base methods enforce tenant-scoped visibility rules (e.g., hiding suspended tenants) that don't apply to staff administrators.

## DTO Placement: Service vs Handler

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

## PatchField\<T\> for Nullable PATCH Fields

> Full guide with examples, decision tree, anti-patterns, and validator patterns: [`docs/guides/patchfield-pattern.md`](patchfield-pattern.md)

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
