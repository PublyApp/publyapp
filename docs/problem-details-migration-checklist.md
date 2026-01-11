# ProblemDetails Migration: Completion & Maintenance Checklist

**Status:** Completed (PR `radandevist/publyapp#162`)

This is the living reference for PublyApp's API error responses and their OpenAPI documentation rules.

## API Error Contract (Current)

- Generic errors (`400/401/403/404/500`): `AppProblemDetails` as `application/problem+json` with `translationKey` (and `traceId`).
- Validation errors (`422`): `ValidationProblemDetails` as `application/problem+json` with:
  - `translationKey`
  - `errors: Dictionary<string, string[]>` (field-level errors)

## Runtime Semantics (Important Behavior)

### Status Code Semantics

- `401 Unauthorized` means **session invalid/missing** and is the *only* status code that should trigger automatic logout on the frontend.
- `403 Forbidden` means **authenticated but not allowed** (no logout; show a forbidden view).
- Tenant header problems are **not** `401`:
  - Missing tenant header returns `400` with `translationKey: TenantIdRequired`.
  - Invalid tenant ID format returns `400` with `translationKey: BadRequest`.

### Validation & “Missing Input” Rules

- `422 ValidationProblemDetails` is the canonical format for validation problems and must include `errors: Record<string, string[]>`.
- Missing request body/query params should produce `422` with stable keys (`body` for missing body; the query param name for missing query params).
- There are two sources of missing-body/query-param failures:
  - Validation filters (`ReqBodyValidationFilter` / `ReqQueryValidationFilter`) when the endpoint binds successfully.
  - Global exception handler for binding-time failures that occur before filters run.

### Frontend Auth Handling (TanStack Query)

- Global query/mutation handlers classify errors via `toApiFailure()` and apply policy:
  - `401` triggers centralized logout (idempotent).
  - `403` must never trigger logout.
- `QueryClient` is a browser singleton. **Do not rely on “first call wins” options** for auth handling:
  - The code supports setting/updating `onAuthError` even if the singleton is created earlier by another callsite.
  - If `onAuthError` is missing (misconfiguration), `401` should not be silently swallowed; fallback UX should show an error.

### Security Note (Non-Negotiable)

- Never log session tokens (or other secrets). If correlation is needed, log a non-reversible fingerprint instead.

## Backbone (Do Not Regress)

- Use `TypedProblems.*` in handlers (avoid `TypedResults.Json(..., statusCode: ...)` for errors).
- Ensure the runtime pipeline supports RFC 7807 formatting:
  - `builder.Services.AddProblemDetails(...)` is registered (framework integration).
  - `app.UseCustomExceptionHandler()` normalizes unhandled/binding errors to `AppProblemDetails`.
- Encode possible error status codes in the handler return type via `Results<...>` unions with typed results:
  - `AppBadRequestHttpResult`
  - `AppUnauthorizedHttpResult`
  - `AppForbiddenHttpResult`
  - `AppNotFoundHttpResult`
  - `AppInternalServerErrorHttpResult`
  - `AppValidationProblemHttpResult` (422)
- Filter-produced errors are not inferred from handler signatures:
  - Use `.ProducesAppProblem(...)` for filter/group-produced `401/403/404/500` as applicable.
  - Use `.ProducesValidationProblem()` to document `422` when validation filters apply.

## When Adding/Updating an Endpoint

- [ ] **Handler return type** includes the `App*HttpResult` types it can return.
- [ ] **Errors** use `TypedProblems.*` with correct `ResponseKeys.*` `translationKey`.
- [ ] **Validation**: if using `.WithReqBodyValidation<T>()` / `.WithReqQueryValidation<T>()`, ensure the endpoint documents `422` (`ValidationProblemDetails`).
- [ ] **500 documentation**:
  - Endpoints protected by auth/permission filters should document `500` via those filters/groups.
  - Anonymous endpoints must add `.ProducesAppProblem(StatusCodes.Status500InternalServerError)` manually (by design; no global OpenAPI transformer is used).

## Quick Verification

- Confirm `apps/api/openapi/MainApi.json` has a `"500"` response for every path + method.
- Confirm endpoints with request validation have a `"422"` response with schema `ValidationProblemDetails`.
- After any OpenAPI changes: regenerate client via `make generate-client`.

## Useful Discovery Commands

```bash
# Any remaining legacy OpenAPI helper usage (should be none)
rg -n "\\.ProducesApiResponses\\(" apps/api/Src -S -g"*.cs"

# Any remaining ApiResponse-based error unions?
rg -n "BadRequest<\\s*ApiResponse|NotFound<\\s*ApiResponse|JsonHttpResult<\\s*ApiResponse" apps/api/Src -S -g"*.cs"

# Any runtime-status error results (break OpenAPI inference)
rg -n "TypedResults\\.Json\\(.*statusCode:" apps/api/Src -S -g"*.cs"
```
