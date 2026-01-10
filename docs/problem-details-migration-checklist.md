# ProblemDetails Migration: Remaining Work Checklist

This document tracks the remaining work to complete the RFC 7807 `ProblemDetails` migration and achieve consistent, automatically-documented OpenAPI status codes across the API.

Scope: PR `radandevist/publyapp#162` (custom typed results + filter/exception adoption).

## Completed Infrastructure

The following infrastructure has been implemented:

- ✅ `AppProblemDetails` - RFC 7807 compliant ProblemDetails with `translationKey` extension
- ✅ `TypedProblems` factory class with methods: `BadRequest()`, `Unauthorized()`, `Forbidden()`, `NotFound()`, `InternalServerError()`
- ✅ Typed HTTP result classes implementing `IEndpointMetadataProvider` for automatic OpenAPI documentation:
  - `BadRequestHttpResult`, `UnauthorizedHttpResult`, `ForbiddenHttpResult`, `NotFoundHttpResult`, `InternalServerErrorHttpResult`
- ✅ Filter extension methods (RouteHandlerBuilder overloads) now add OpenAPI metadata automatically
- ✅ `ProducesAppProblem()` helper extension for manual OpenAPI documentation when needed

---

## Definition of “Complete”

1. All error responses use `application/problem+json` with `AppProblemDetails` (includes `translationKey`).
2. OpenAPI documents **all** relevant error status codes for each route (including `401`, `403`, `404`, `500`) **without** manual per-endpoint status-code patching.
3. Frontend JS client + UI can reliably parse and display errors using `translationKey` (and optionally `traceId`).

---

## 1) Core OpenAPI Plumbing (must-do)

### 1.1 Add filter metadata on route *groups* (not only handlers)

Many filters are applied via `RouteGroupBuilder` in `apps/api/Program.cs`. Today, most filter OpenAPI metadata is only added in the `RouteHandlerBuilder` overloads, which means group-protected endpoints can be missing `401/403/...` in the generated spec.

Action:
- Update each `RouteGroupBuilder` extension to also add the relevant `.ProducesAppProblem(...)` responses.

Targets:
- `apps/api/Src/Lib/Filters/CheckSessionHeaderFilter.cs`
  - Group: add `401`
- `apps/api/Src/Lib/Filters/CheckTenantHeaderFilter.cs`
  - Group: add `401`
- `apps/api/Src/Lib/Filters/SessionAuthFilter.cs`
  - Group: add `401`, `500`
- `apps/api/Src/Lib/Filters/StaffAuthFilter.cs`
  - Group: add `403`, `500`
- `apps/api/Src/Lib/Filters/TenantAuthFilter.cs`
  - Group: add `401`, `403`, `404`, `500`
- `apps/api/Src/Lib/Filters/PermissionFilter.cs`
  - Group/handler: ensure `403` is documented wherever the filter is attached

### 1.2 Use a single helper for filter-produced errors ✅ DONE

`apps/api/Src/Lib/Extensions/OpenApiExtensions.cs` provides `ProducesAppProblem(...)`.

Filter RouteHandlerBuilder extensions now use this helper. RouteGroupBuilder extensions still need updating (see 1.1).

### 1.3 Decide and document the “global 500” contract

`UseCustomExceptionHandler()` emits `application/problem+json` for unhandled exceptions.

Action:
- Ensure OpenAPI consistently documents `500` as `AppProblemDetails` everywhere you consider it part of the API contract.
- Prefer doing this at group/convention level (not per endpoint).

---

## 2) Eliminate OpenAPI Response-Type Mismatches (must-do)

### 2.1 Remove `.ProducesApiResponses(...)` calls - use TypedProblems instead

The new approach uses `TypedProblems.*` methods in handlers with typed result classes that auto-document in OpenAPI. Manual `.ProducesApiResponses(...)` calls are no longer needed.

Files still using `.ProducesApiResponses(...)` (need handler migration first - see section 3):
- `apps/api/Src/Modules/Tenant/Products/ProductEndpoints.cs`
- `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationEndpoints.cs`
- `apps/api/Src/Modules/Shared/Auth/AuthEndpoints.cs`
- `apps/api/Src/Modules/Staff/PermissionsAsStaff/PermissionAsStaffEndpoints.cs`
- `apps/api/Src/Modules/Shared/Invitations/InvitationEndpoints.cs`
- `apps/api/Src/Modules/Staff/TenantsAsStaff/TenantAsStaffEndpoints.cs`
- `apps/api/Src/Modules/Staff/StaffMember/StaffMemberEndPoints.cs`
- `apps/api/Src/Modules/Staff/ProfilesAsStaff/ProfileAsStaffEndpoints.cs`

Action:
- Migrate handlers to use `TypedProblems.*` methods (see section 3)
- Update handler return types to use typed results (`ForbiddenHttpResult`, etc.)
- Remove `.ProducesApiResponses(...)` calls from endpoint registration - status codes will be auto-documented

---

## 3) Migrate Remaining Handlers Off `ApiResponse` (must-do)

Goal: handler return signatures encode status codes (via typed results / `Results<...>` union) so OpenAPI inference is automatic and payloads are consistent.

### 3.1 Replace `ApiResponse` error handling with `TypedProblems`

**Before (old pattern):**
```csharp
public static async Task<Results<Ok<Data>, JsonHttpResult<ApiResponse>>> Handler(...) {
    return TypedResults.Json(
        ApiResponse.Create("Forbidden", ResponseKeys.Forbidden),
        statusCode: StatusCodes.Status403Forbidden
    );
}
```

**After (new pattern):**
```csharp
public static async Task<Results<Ok<Data>, ForbiddenHttpResult>> Handler(...) {
    return TypedProblems.Forbidden("Forbidden", ResponseKeys.Forbidden);
}
```

Action:
- Replace `ApiResponse.Create(...)` with `TypedProblems.*` methods
- Update return type unions to use typed results (`ForbiddenHttpResult`, `NotFoundHttpResult`, etc.)

### 3.2 Remaining handler files referencing `ApiResponse` (as of this PR)

These should be migrated to `TypedProblems.*` + typed result unions:
- `apps/api/Src/Modules/Shared/Invitations/Handlers/AcceptInvitation.cs`
- `apps/api/Src/Modules/Shared/Invitations/Handlers/GetInvitationDetails.cs`
- `apps/api/Src/Modules/Shared/Invitations/Handlers/CheckInvitationToken.cs`
- `apps/api/Src/Modules/Staff/PermissionsAsStaff/Handlers/FindStaffPermissions.cs`
- `apps/api/Src/Modules/Staff/InvitationsAsStaff/Handlers/CreateStaffInvitation.cs`
- `apps/api/Src/Modules/Staff/InvitationsAsStaff/Handlers/RevokeInvitation.cs`
- `apps/api/Src/Modules/Staff/InvitationsAsStaff/Handlers/BulkCreateStaffInvitations.cs`
- `apps/api/Src/Modules/Staff/InvitationsAsStaff/Handlers/FindStaffInvitations.cs`
- `apps/api/Src/Modules/Staff/StaffMember/Handlers/CreateStaffMember.cs`
- `apps/api/Src/Modules/Staff/StaffMember/Handlers/FindStaffMembers.cs`
- `apps/api/Src/Modules/Staff/StaffMember/Handlers/GetStaffMemberById.cs`
- `apps/api/Src/Modules/Staff/StaffMember/Handlers/UpdateStaffMember.cs`
- `apps/api/Src/Modules/Staff/ProfilesAsStaff/Handlers/CreateStaffProfile.cs`
- `apps/api/Src/Modules/Staff/ProfilesAsStaff/Handlers/FindStaffProfiles.cs`
- `apps/api/Src/Modules/Staff/ProfilesAsStaff/Handlers/FindTenantProfilesAsStaff.cs`
- `apps/api/Src/Modules/Staff/TenantsAsStaff/Handlers/FindTenantsAsStaff.cs`
- `apps/api/Src/Modules/Staff/TenantsAsStaff/Handlers/CreateTenantAsStaff.cs`
- `apps/api/Src/Modules/Staff/TenantsAsStaff/Handlers/GetTenantAsStaff.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/PassWordLogin.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/PasswordRegister.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/VerifyEmailRequest.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/ResetPassword.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/CheckEmailVerificationToken.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/CheckResetPasswordToken.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/GetVerificationLink.cs`
- `apps/api/Src/Modules/Shared/Auth/Handlers/GetUserAuthData.cs`

---

## 4) Validation Filters: Move to RFC 7807 Validation Shape (must-do)

Currently these return `ApiResponse`-derived models with `FieldErrors`, which keeps `400` documented/serialized as `application/json` (not `application/problem+json`):
- `apps/api/Src/Lib/Filters/ReqBodyValidationFilter.cs`
- `apps/api/Src/Lib/Filters/ReqQueryValidationFilter.cs`

Action:
- Define a validation-problem type that matches common conventions (e.g. `errors` dictionary) while preserving `translationKey`.
- Provide a typed result (e.g. `ValidationProblemHttpResult`) implementing `IEndpointMetadataProvider` so `400` is inferred as `application/problem+json`.
- Update `.WithReqBodyValidation<T>()` / `.WithReqQueryValidation<T>()` to document the validation problem response.

---

## 5) Semantics + Translation Keys (must-do)

Action:
- Ensure `401` is used only for “not authenticated / invalid session token”.
- Ensure `403` is used for “authenticated but not allowed”.
- Ensure `translationKey` matches the meaning of the error (avoid using a generic key for unrelated 403s unless intentional).

If new keys are needed:
- Add them to `packages/shared/lib/i18n/json/response-message.en.json`
- Regenerate `apps/api/Generated/ResponseKeys.g.cs` via the repo’s build/keygen flow.

---

## 6) Regenerate Outputs (must-do after migration)

Action:
- Regenerate OpenAPI (`apps/api/openapi/MainApi.json`) after the migration is consistent.
- Regenerate the TypeScript client (`make generate-client`) once OpenAPI stabilizes.

---

## 7) Frontend Follow-through (must-do for end-to-end completeness)

Action:
- Ensure frontend error handling parses `application/problem+json`, reads `translationKey`, and (optionally) logs/displays `traceId`.
- Align any UI assumptions that previously expected `{ message, key }` for errors.

---

## 8) Optional cleanup (nice-to-have)

Action:
- Once fully migrated, remove or deprecate:
  - `apps/api/Src/Lib/ApiResponse.cs`
  - `apps/api/Src/Lib/Extensions/OpenApiExtensions.cs:ProducesApiResponses(...)` (or keep only for success-message patterns, if desired)

---

## Useful discovery commands

```bash
# Find endpoints still documenting ApiResponse
rg -n "\\.ProducesApiResponses\\(" apps/api/Src -S -g"*.cs"

# Find handlers still referencing ApiResponse
rg -n "\\bApiResponse\\b" apps/api/Src/Modules -S -g"*.cs"

# Find runtime-status error results (break OpenAPI inference)
rg -n "TypedResults\\.Json\\(\\s*ApiResponse" apps/api/Src -S -g"*.cs"

# Find old Results unions still encoding ApiResponse
rg -n "BadRequest<\\s*ApiResponse|NotFound<\\s*ApiResponse|InternalServerError<\\s*ApiResponse|JsonHttpResult<\\s*ApiResponse" apps/api/Src/Modules -S -g"*.cs"

# Find validation filters still returning ApiResponse shapes
rg -n "ReqBodyValidationFailedResponse|ReqQueryValidationFailedResponse" apps/api/Src -S -g"*.cs"
```

