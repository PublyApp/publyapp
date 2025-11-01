# Middleware to Filter Conversion - Implementation Summary

## Overview
Converted 5 middleware classes to endpoint filters to align with ASP.NET Core best practices. All filters are implemented and configured, with original middlewares kept in place for comparison during testing.

## Created Files

### 1. CheckSessionHeaderFilter.cs
**Location:** `apps/api/Src/Lib/Filters/CheckSessionHeaderFilter.cs`

**Purpose:** Validates that `X-Session-Token` header is present in the request.

**Behavior:**
- Checks `AuthContext.SessionToken` first, then falls back to `X-Session-Token` header
- Returns 401 Unauthorized if token is missing
- Sets `authContext.SessionToken` for downstream filters/handlers

**Extension Methods:**
- `RouteGroupBuilder.WithCheckSessionHeader()`
- `RouteHandlerBuilder.WithCheckSessionHeader()`

### 2. CheckTenantHeaderFilter.cs
**Location:** `apps/api/Src/Lib/Filters/CheckTenantHeaderFilter.cs`

**Purpose:** Validates that `X-Tenant-Id` header is present in the request.

**Behavior:**
- Checks `TenantContext.TenantId` first, then falls back to `X-Tenant-Id` header
- Returns 401 Unauthorized if tenant ID is missing
- Sets `tenantContext.TenantId` for downstream filters/handlers

**Extension Methods:**
- `RouteGroupBuilder.WithCheckTenantHeader()`
- `RouteHandlerBuilder.WithCheckTenantHeader()`

### 3. SessionAuthFilter.cs
**Location:** `apps/api/Src/Lib/Filters/SessionAuthFilter.cs`

**Purpose:** Authenticates the user by validating the session token against the database.

**Behavior:**
- Retrieves session token from `AuthContext` or header
- Calls `ISessionService.GetSessionByToken()` to validate token
- Returns 401 if token is missing, invalid, or expired
- Sets `authContext.UserId` and `authContext.SessionToken` after successful authentication
- Returns 500 if authentication state is invalid (should not happen)

**Dependencies:**
- Requires `CheckSessionHeaderFilter` to run first (expects token to be in `AuthContext`)

**Extension Methods:**
- `RouteGroupBuilder.WithSessionAuthentication()`
- `RouteHandlerBuilder.WithSessionAuthentication()`

### 4. StaffAuthFilter.cs
**Location:** `apps/api/Src/Lib/Filters/StaffAuthFilter.cs`

**Purpose:** Verifies that the authenticated user has a staff account.

**Behavior:**
- Checks if user is authenticated (validates `authContext.IsAuthenticated`)
- Calls `IAccountService.GetUserStaffAccountAsync()` to verify staff account
- Returns 401 if user is not a staff member
- Sets `authContext.AccountStaff` after successful verification
- Returns 500 if `SessionAuthFilter` hasn't run first

**Dependencies:**
- Requires `SessionAuthFilter` to run first (expects authenticated user)

**Extension Methods:**
- `RouteGroupBuilder.WithStaffAuthorization()`
- `RouteHandlerBuilder.WithStaffAuthorization()`

### 5. TenantAuthFilter.cs
**Location:** `apps/api/Src/Lib/Filters/TenantAuthFilter.cs`

**Purpose:** Placeholder for tenant authorization (currently passes through after validation).

**Behavior:**
- Validates that user is authenticated and tenant ID is present
- Returns 500 if prerequisites are missing
- Currently passes through without actual tenant verification (TODO in code)

**Dependencies:**
- Requires `SessionAuthFilter` and `CheckTenantHeaderFilter` to run first

**Extension Methods:**
- `RouteGroupBuilder.WithTenantAuthorization()`
- `RouteHandlerBuilder.WithTenantAuthorization()`

## Modified Files

### 1. Program.cs
**Location:** `apps/api/Program.cs`

**Changes:**
- Added `using MainApi.Src.Lib.Filters;`
- Added comment noting middlewares are kept for testing
- Applied filters to route groups:
  - **tenantGroup**: `WithCheckSessionHeader()` ? `WithCheckTenantHeader()` ? `WithSessionAuthentication()` ? `WithTenantAuthorization()`
  - **staffGroup**: `WithCheckSessionHeader()` ? `WithSessionAuthentication()` ? `WithStaffAuthorization()`

**Note:** Original middleware registrations remain active (lines 29-32) for comparison during testing.

### 2. AuthEndpoint.cs
**Location:** `apps/api/Src/Features/Common/Auth/AuthEndpoint.cs`

**Changes:**
- Applied filters to individual auth routes requiring session validation:
  - `GetUserAuthData`: Added `WithCheckSessionHeader()` + `WithSessionAuthentication()`
  - `GetTenantAuthData`: Added `WithCheckSessionHeader()` + `WithSessionAuthentication()`
  - `GetRedirectCode`: Added `WithCheckSessionHeader()` + `WithSessionAuthentication()`

## Key Design Decisions

### 1. Filter Execution Order
Filters execute in the order they're added. The order in `Program.cs` ensures:
- Header checks run before authentication
- Authentication runs before authorization
- This matches the original middleware execution order

### 2. Extension Methods Support Both RouteGroupBuilder and RouteHandlerBuilder
All filter extension methods support both:
- `RouteGroupBuilder` - for applying to entire route groups
- `RouteHandlerBuilder` - for applying to individual routes

This provides flexibility for both patterns used in the codebase.

### 3. Error Response Consistency
All filters return errors using the same format as the original middlewares:
```csharp
TypedResults.Json(
    ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized),
    statusCode: StatusCodes.Status401Unauthorized
)
```

### 4. Dependency Validation
Filters that depend on previous filters check for required state and return 500 errors if dependencies are missing, making debugging easier.

### 5. Middleware Compatibility
Original middlewares remain active to allow side-by-side testing and comparison. They can be safely removed once filters are verified.

## Filter Execution Flow

### Staff Routes (`/staff/*`)
1. `CheckSessionHeaderFilter` - Validates session token header
2. `SessionAuthFilter` - Authenticates user
3. `StaffAuthFilter` - Verifies staff account

### Tenant Routes (`/tenant/*`)
1. `CheckSessionHeaderFilter` - Validates session token header
2. `CheckTenantHeaderFilter` - Validates tenant ID header
3. `SessionAuthFilter` - Authenticates user
4. `TenantAuthFilter` - Verifies tenant access (placeholder)

### Auth Routes (Specific endpoints)
- `GetUserAuthData`, `GetTenantAuthData`, `GetRedirectCode`:
  1. `CheckSessionHeaderFilter`
  2. `SessionAuthFilter`

## Testing Checklist

Before removing middlewares, verify:

### Staff Routes
- [ ] `/staff/*` routes return 401 when `X-Session-Token` is missing
- [ ] `/staff/*` routes return 401 when session token is invalid
- [ ] `/staff/*` routes return 401 when user is not a staff member
- [ ] `/staff/*` routes work correctly when user is authenticated staff member

### Tenant Routes
- [ ] `/tenant/*` routes return 401 when `X-Session-Token` is missing
- [ ] `/tenant/*` routes return 401 when `X-Tenant-Id` is missing
- [ ] `/tenant/*` routes return 401 when session token is invalid
- [ ] `/tenant/*` routes work correctly when user is authenticated

### Auth Routes
- [ ] `GET /auth/user-auth-data` requires session token
- [ ] `GET /auth/tenant-auth-data` requires session token
- [ ] `GET /auth/redirect-code` requires session token
- [ ] Other auth routes (login, register, etc.) work without session token

### Integration
- [ ] PermissionFilter still works (depends on StaffAuthFilter)
- [ ] AuthContext and TenantContext are properly populated
- [ ] No double validation (middlewares + filters running simultaneously)

## Potential Issues to Watch For

1. **Double Execution**: Both middlewares and filters may run simultaneously until middlewares are removed. This could cause:
   - Double header validation
   - Double authentication checks
   - Duplicate error responses

2. **Filter Order in Program.cs**: The tenantGroup filter order has been updated (session header check first, then tenant header). Verify this matches expected behavior.

3. **TenantAuthFilter Placeholder**: The tenant authorization filter currently passes through without actual verification. Ensure this is acceptable or implement the verification logic.

4. **Route-Specific Filters**: Some auth routes have filters applied directly. Ensure this doesn't conflict with group-level filters.

## Next Steps

1. **Test the filters** with the middlewares still active to compare behavior
2. **Disable middlewares** by commenting out lines 29-32 in `Program.cs`
3. **Test again** with only filters active
4. **If tests pass**, remove middleware registrations and middleware files:
   - `CheckSessionHeaderMiddleware.cs`
   - `CheckTenantHeaderMiddleware.cs`
   - `SessionAuthMiddleware.cs`
   - `StaffAuthMiddleware.cs`
   - `TenantAuthMiddleware.cs` (if empty, already minimal)
5. **Remove middleware using statements** from `Program.cs` (line 5: `using MainApi.Src.Lib.Middlewares;`)

## Code Quality Notes

- All filters follow async/await best practices
- Uses dependency injection for services
- Proper error handling and logging
- Follows existing code patterns in the codebase
- XML documentation comments included
- No linter errors detected
