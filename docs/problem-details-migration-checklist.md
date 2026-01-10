# ProblemDetails Migration: Completion & Maintenance Checklist

**Status:** Completed (PR `radandevist/publyapp#162`)

This is the living reference for PublyApp's API error responses and their OpenAPI documentation rules.

## API Error Contract (Current)

- Generic errors (`400/401/403/404/500`): `AppProblemDetails` as `application/problem+json` with `translationKey` (and `traceId`).
- Validation errors (`422`): `ValidationProblemDetails` as `application/problem+json` with:
  - `translationKey`
  - `errors: Dictionary<string, string[]>` (field-level errors)

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
