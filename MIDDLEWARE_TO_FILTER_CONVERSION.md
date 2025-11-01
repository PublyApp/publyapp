# Middleware to Filter Conversion Summary

## Overview

This document summarizes the conversion of authentication/authorization middleware classes to endpoint filters in the ASP.NET Core application. The filters are implemented and ready for testing, with the original middlewares kept active until verification is complete.

## What Changed

### Files Created

All new filter files are located in `apps/api/Src/Lib/Filters/`:

1. **CheckSessionHeaderFilter.cs**
   - Validates `X-Session-Token` header presence
   - Sets `SessionToken` in `AuthContext`
   - Returns 401 if header is missing

2. **CheckTenantHeaderFilter.cs**
   - Validates `X-Tenant-Id` header presence
   - Sets `TenantId` in `TenantContext`
   - Returns 401 if header is missing

3. **SessionAuthFilter.cs**
   - Authenticates user by validating session token via `ISessionService`
   - Requires `CheckSessionHeaderFilter` to run first
   - Sets `UserId` in `AuthContext` after successful authentication
   - Returns 401 if session is invalid/expired

4. **StaffAuthFilter.cs**
   - Verifies user has a staff account via `IAccountService`
   - Requires `SessionAuthFilter` to run first
   - Sets `AccountStaff` in `AuthContext` after successful verification
   - Returns 401 if user is not a staff member

5. **TenantAuthFilter.cs**
   - Placeholder for tenant authorization (currently just validates prerequisites)
   - Requires `SessionAuthFilter` and `CheckTenantHeaderFilter` to run first
   - TODO: Implement actual tenant access verification logic

### Files Modified

1. **Program.cs** (`apps/api/Program.cs`)
   - Added `using MainApi.Src.Lib.Filters;`
   - **Kept middleware registrations** (for testing comparison)
   - Applied filters to route groups:
     - `tenantGroup`: CheckSessionHeader ? CheckTenantHeader ? SessionAuth ? TenantAuth
     - `staffGroup`: CheckSessionHeader ? SessionAuth ? StaffAuth
   - **Note**: Order was corrected - CheckSessionHeader must come before CheckTenantHeader for tenant routes

2. **AuthEndpoint.cs** (`apps/api/Src/Features/Common/Auth/AuthEndpoint.cs`)
   - Applied filters to individual auth routes that require session validation:
     - `GetUserAuthData`: WithCheckSessionHeader + WithSessionAuthentication
     - `GetTenantAuthData`: WithCheckSessionHeader + WithSessionAuthentication
     - `GetRedirectCode`: WithCheckSessionHeader + WithSessionAuthentication

## Filter Architecture

### Filter Order of Execution

Filters execute in the order they are added to the route group/handler:

**For Tenant Routes** (`/tenant/*`):
1. `CheckSessionHeaderFilter` - Validates session token header
2. `CheckTenantHeaderFilter` - Validates tenant ID header
3. `SessionAuthFilter` - Authenticates user via session
4. `TenantAuthFilter` - Verifies tenant access (placeholder)

**For Staff Routes** (`/staff/*`):
1. `CheckSessionHeaderFilter` - Validates session token header
2. `SessionAuthFilter` - Authenticates user via session
3. `StaffAuthFilter` - Verifies staff account

**For Specific Auth Routes**:
- `GetUserAuthData`, `GetTenantAuthData`, `GetRedirectCode`:
  1. `CheckSessionHeaderFilter` - Validates session token header
  2. `SessionAuthFilter` - Authenticates user via session

### Extension Methods

Each filter provides extension methods for both `RouteGroupBuilder` and `RouteHandlerBuilder`:

- `WithCheckSessionHeader()` - Adds CheckSessionHeaderFilter
- `WithCheckTenantHeader()` - Adds CheckTenantHeaderFilter
- `WithSessionAuthentication()` - Adds SessionAuthFilter
- `WithStaffAuthorization()` - Adds StaffAuthFilter
- `WithTenantAuthorization()` - Adds TenantAuthFilter

This allows filters to be applied at both the group level and individual route level.

## Key Implementation Details

### Error Responses

All filters use the same error response format as the original middlewares:
- 401 Unauthorized for missing/invalid tokens
- 500 Internal Server Error for configuration/validation errors
- Uses `ApiResponse.Create()` with `ResponseKeys` for i18n support

### Dependencies

Filters rely on scoped services:
- `IAuthContext` - For session token and user ID
- `ITenantContext` - For tenant ID
- `ISessionService` - For session validation
- `IAccountService` - For staff account verification
- `ILogger<T>` - For logging

### Context Flow

Filters set values in context services that downstream filters can read:
1. `CheckSessionHeaderFilter` sets `authContext.SessionToken`
2. `SessionAuthFilter` reads token, validates, sets `authContext.UserId`
3. `StaffAuthFilter` reads `UserId`, verifies staff account, sets `authContext.AccountStaff`
4. `TenantAuthFilter` validates prerequisites (placeholder for tenant verification)

## Testing Checklist

Before removing middlewares, verify:

### Session Header Validation
- [ ] Request to `/staff/*` without `X-Session-Token` returns 401
- [ ] Request to `/tenant/*` without `X-Session-Token` returns 401
- [ ] Request to `/auth/user-auth-data` without `X-Session-Token` returns 401

### Tenant Header Validation
- [ ] Request to `/tenant/*` without `X-Tenant-Id` returns 401
- [ ] Request to `/tenant/*` with `X-Tenant-Id` continues to next filter

### Session Authentication
- [ ] Request with invalid session token returns 401
- [ ] Request with expired session token returns 401
- [ ] Request with valid session token sets `UserId` in `AuthContext`

### Staff Authorization
- [ ] Request to `/staff/*` by non-staff user returns 401
- [ ] Request to `/staff/*` by staff user sets `AccountStaff` in `AuthContext`
- [ ] Request without `SessionAuthFilter` returns 500 (configuration error)

### Tenant Authorization
- [ ] Request to `/tenant/*` without authentication returns 500
- [ ] Request to `/tenant/*` without tenant header returns 500
- [ ] Request to `/tenant/*` with both passes through (placeholder implementation)

### Auth Routes
- [ ] `/auth/login` and `/auth/register` work without filters
- [ ] `/auth/user-auth-data` requires valid session token
- [ ] `/auth/tenant-auth-data` requires valid session token
- [ ] `/auth/redirect-code` requires valid session token

## Comparison: Middleware vs Filters

### Middleware Approach (Current)
- Applied globally using `UseWhen()` with path matching
- Runs for all requests matching path patterns
- Execution order: Middleware pipeline order
- Applied at application level

### Filter Approach (New)
- Applied to specific route groups/handlers
- Only runs for endpoints that explicitly use them
- Execution order: Filter chain order
- Applied at route/group level
- More granular control over which endpoints get which filters

## Next Steps

1. **Test the filters** - Run all test cases above to verify behavior matches middleware
2. **Compare behavior** - Since middlewares are still active, filters may run twice (this is intentional for testing)
3. **Once verified**:
   - Remove middleware registrations from `Program.cs` (lines 29-33)
   - Remove `using MainApi.Src.Lib.Middlewares;` from `Program.cs`
   - Delete middleware files:
     - `apps/api/Src/Lib/Middlewares/CheckSessionHeaderMiddleware.cs`
     - `apps/api/Src/Lib/Middlewares/CheckTenantHeaderMiddleware.cs`
     - `apps/api/Src/Lib/Middlewares/SessionAuthMiddleware.cs`
     - `apps/api/Src/Lib/Middlewares/StaffAuthMiddleware.cs`
     - `apps/api/Src/Lib/Middlewares/TenantAuthMiddleware.cs` (currently empty)
4. **Implement TenantAuthFilter** - Add actual tenant access verification logic when ready

## Potential Issues to Watch

1. **Double Execution**: Currently both middlewares and filters are active. During testing, you may see filters executing after middlewares. This is expected and helps verify filter logic matches middleware.

2. **Filter Order**: Ensure filters are added in the correct order. The current implementation in `Program.cs` has been corrected to match the middleware execution order.

3. **Context Services**: Ensure `IAuthContext` and `ITenantContext` are properly scoped. Filters read/write to these services, so they must be scoped per request.

4. **Error Response Format**: Filters use `TypedResults.Json()` which may have slightly different serialization than middleware's `WriteAsJsonAsync()`. Verify response format matches.

## Code Quality

- ? All filters follow async/await patterns
- ? Proper null checking using pattern matching (`is not null`)
- ? Structured logging with context
- ? Consistent error handling
- ? XML documentation comments
- ? Follows project coding standards (LINQ query syntax, null checks, etc.)

## Questions for Review

1. Should filters handle edge cases differently than middlewares?
2. Is the filter execution order correct for all scenarios?
3. Are there any performance implications of using filters vs middlewares?
4. Should we implement global filter registration for certain filters instead of per-group?
5. Is the TenantAuthFilter placeholder approach acceptable, or should it be removed until fully implemented?
