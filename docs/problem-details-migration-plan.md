# ProblemDetails Migration Execution Plan

## Overview

Complete the migration from `ApiResponse` to RFC 7807 `ProblemDetails` using the existing `TypedProblems` infrastructure.

**Current State:** Infrastructure built (TypedProblems, typed HTTP results, AppProblemDetails)
**Goal:** Migrate all handlers, filters, and endpoints to use the new system

---

## Migration Order

Execute in this order to minimize breaking changes:

1. **Phase 1: Filter RouteGroupBuilder updates** (6 files)
2. **Phase 2: Validation filters** (2 files)
3. **Phase 3: Handler migration** (26 files)
4. **Phase 4: Endpoint cleanup** (8 files)
5. **Phase 5: Regenerate & verify** (build, OpenAPI, client)

---

## Phase 1: Filter RouteGroupBuilder Updates

Update RouteGroupBuilder extensions to add OpenAPI metadata matching their RouteHandlerBuilder counterparts.

### Files to Update:

| File | Add Status Codes |
|------|------------------|
| `apps/api/Src/Lib/Filters/CheckSessionHeaderFilter.cs` | 401 |
| `apps/api/Src/Lib/Filters/CheckTenantHeaderFilter.cs` | 401 |
| `apps/api/Src/Lib/Filters/SessionAuthFilter.cs` | 401, 500 |
| `apps/api/Src/Lib/Filters/StaffAuthFilter.cs` | 403, 500 |
| `apps/api/Src/Lib/Filters/TenantAuthFilter.cs` | 401, 403, 404, 500 |
| `apps/api/Src/Lib/Filters/PermissionFilter.cs` | 403 (create RouteGroupBuilder overloads) |

### Pattern:
```csharp
// Before
public static RouteGroupBuilder WithSessionAuthentication(this RouteGroupBuilder builder) {
    return builder.AddEndpointFilter<SessionAuthFilter>();
}

// After
public static RouteGroupBuilder WithSessionAuthentication(this RouteGroupBuilder builder) {
    return builder
        .AddEndpointFilter<SessionAuthFilter>()
        .ProducesAppProblem(StatusCodes.Status401Unauthorized, StatusCodes.Status500InternalServerError);
}
```

### Note:
Need to add `ProducesAppProblem` extension for `RouteGroupBuilder` in OpenApiExtensions.cs (currently only exists for RouteHandlerBuilder).

---

## Phase 2: Validation Filters

Create RFC 7807 compliant validation error response.

### Files to Create:
- `apps/api/Src/Lib/ProblemResults/ValidationProblemDetails.cs` - Extends AppProblemDetails with `Errors` dictionary
- `apps/api/Src/Lib/ProblemResults/ValidationProblemHttpResult.cs` - Typed result with IEndpointMetadataProvider

### Files to Update:
- `apps/api/Src/Lib/Filters/ReqBodyValidationFilter.cs`
- `apps/api/Src/Lib/Filters/ReqQueryValidationFilter.cs`

### New Response Shape:
```json
{
  "type": "https://httpstatuses.com/400",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Request body validation failed",
  "translationKey": "request-body-validation-failed",
  "errors": {
    "email": ["Email is required"],
    "password": ["Password must be at least 8 characters"]
  }
}
```

---

## Phase 3: Handler Migration

Migrate 26 handler files from ApiResponse to TypedProblems.

### Migration Patterns:

**Pattern A: BadRequest with ApiResponse → BadRequestHttpResult**
```csharp
// Before
return TypedResults.BadRequest(ApiResponse.Create("User not found", ResponseKeys.NotFound));

// After
return TypedProblems.BadRequest("User not found", ResponseKeys.NotFound);
```

**Pattern B: JsonHttpResult for 403 → ForbiddenHttpResult**
```csharp
// Before
return TypedResults.Json(
    ApiResponse.Create("Access denied", ResponseKeys.Forbidden),
    statusCode: StatusCodes.Status403Forbidden
);

// After
return TypedProblems.Forbidden("Access denied", ResponseKeys.Forbidden);
```

**Pattern C: Ok<ApiResponse> for success → Keep as-is**
```csharp
// Keep ApiResponse for success messages - no change needed
return TypedResults.Ok(ApiResponse.Create("Updated", ResponseKeys.Success));
```

**Pattern D: Update return type signature**
```csharp
// Before
Results<Ok<Data>, BadRequest<ApiResponse>, JsonHttpResult<ApiResponse>>

// After
Results<Ok<Data>, BadRequestHttpResult, ForbiddenHttpResult>
```

### Handler Files (grouped by module):

**Shared/Auth (8 files):**
- PassWordLogin.cs
- PasswordRegister.cs
- VerifyEmailRequest.cs
- ResetPassword.cs
- CheckEmailVerificationToken.cs
- CheckResetPasswordToken.cs
- GetVerificationLink.cs
- GetUserAuthData.cs

**Shared/Invitations (3 files):**
- AcceptInvitation.cs
- GetInvitationDetails.cs
- CheckInvitationToken.cs

**Staff/InvitationsAsStaff (4 files):**
- CreateStaffInvitation.cs
- RevokeInvitation.cs
- BulkCreateStaffInvitations.cs
- FindStaffInvitations.cs

**Staff/StaffMember (4 files):**
- CreateStaffMember.cs
- FindStaffMembers.cs
- GetStaffMemberById.cs
- UpdateStaffMember.cs

**Staff/ProfilesAsStaff (3 files):**
- CreateStaffProfile.cs
- FindStaffProfiles.cs
- FindTenantProfilesAsStaff.cs

**Staff/TenantsAsStaff (3 files):**
- FindTenantsAsStaff.cs
- CreateTenantAsStaff.cs
- GetTenantAsStaff.cs

**Staff/PermissionsAsStaff (1 file):**
- FindStaffPermissions.cs

---

## Phase 4: Endpoint Cleanup

Remove `.ProducesApiResponses()` calls from endpoint files (status codes now auto-documented).

### Files:
- `apps/api/Src/Modules/Tenant/Products/ProductEndpoints.cs`
- `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationEndpoints.cs`
- `apps/api/Src/Modules/Shared/Auth/AuthEndpoints.cs`
- `apps/api/Src/Modules/Staff/PermissionsAsStaff/PermissionAsStaffEndpoints.cs`
- `apps/api/Src/Modules/Shared/Invitations/InvitationEndpoints.cs`
- `apps/api/Src/Modules/Staff/TenantsAsStaff/TenantAsStaffEndpoints.cs`
- `apps/api/Src/Modules/Staff/StaffMember/StaffMemberEndPoints.cs`
- `apps/api/Src/Modules/Staff/ProfilesAsStaff/ProfileAsStaffEndpoints.cs`

---

## Phase 5: Regenerate & Verify

1. Build API: `make build-api`
2. Generate OpenAPI: Check `apps/api/openapi/MainApi.json`
3. Generate client: `make generate-client`
4. Run tests: `make test-api`

---

## Decision: Success Responses

**User decision:** Keep ApiResponse for success responses.

**Approach:**
- Handlers returning domain data (e.g., `PasswordLoginResult`, `InvitationCreated`) → Keep as-is
- Handlers returning `Ok<ApiResponse>` with success messages → Keep as-is (no migration needed)
- Only migrate **error responses** from ApiResponse to TypedProblems

**No change needed for success:**
```csharp
// Keep as-is - ApiResponse works fine for success messages
return TypedResults.Ok(ApiResponse.Create("User updated", ResponseKeys.Success));
```

---

## Verification Checklist

After each phase:
- [ ] `make build-api` passes
- [ ] No TypeScript errors in generated client

After all phases:
- [ ] All error responses return `application/problem+json`
- [ ] OpenAPI spec includes all status codes
- [ ] Frontend can parse `translationKey` from error responses
- [ ] `rg "BadRequest<ApiResponse>" apps/api/Src/Modules` shows no usages (errors migrated)
- [ ] ApiResponse.cs retained for success responses only

---

## Estimated Scope

| Phase | Files | Complexity |
|-------|-------|------------|
| Phase 1: Filters | 6-7 | Low |
| Phase 2: Validation | 4 | Medium |
| Phase 3: Handlers | 26 | Medium (repetitive) |
| Phase 4: Endpoints | 8 | Low |
| Phase 5: Verify | - | Low |

Total: ~45 files
