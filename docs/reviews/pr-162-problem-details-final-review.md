# Final Code Review: RFC 7807 ProblemDetails Implementation (PR #162)

## Executive Summary
- **REQUEST CHANGES** before merge; there are **2 merge-blocking issues** (one security, one correctness) that can cause token leakage and broken 401 handling.
- **Critical security**: `X-Session-Token` is logged in plaintext in a debug log path.
- **Critical correctness/UX**: `QueryClient` singleton can be created **without** `onAuthError`, making **401s silently ignored** (no logout, no toast) due to init-order + “options only used on first call”.
- **Important semantics drift**: backend returns **401** for missing/invalid tenant header (not just invalid session), which can incorrectly trigger logout.
- **Important contract mismatch**: tenant Products endpoints still return bare `TypedResults.NotFound()/BadRequest()` (non-RFC7807), but Kiota expects `application/problem+json`.
- **Important validation consistency**: missing body is handled as **400** in exception handler (fragile string match), undermining the “422 form-mappable” invariant.
- Core `ProblemDetails` result types + OpenAPI metadata approach is solid and consistent for the migrated slices.
- Recommend merging after the blockers + a small semantics cleanup pass.

## Risk Register

| Severity | Area | Issue | Impact | Evidence | Suggested Fix | Confidence |
|---|---|---|---|---|---|---|
| **Critical** | Backend/Security | Session token logged in plaintext | Credential leak via logs; incident-grade | `apps/api/Src/Lib/Filters/PermissionFilter.cs:56-60` | Remove `sessionToken` from logs; if needed log a short hash/fingerprint only | **High** |
| **Critical** | Frontend/Auth | `QueryClient` singleton can be created without `onAuthError`, causing 401s to be silently dropped | Users can get stuck with invalid session; no logout + no toast on 401 | `apps/front/app/lib/react-query/query-client.tsx:171-184`, `apps/front/app/lib/react-query/query-client.tsx:392-403`, plus early calls `apps/front/app/routes/auth/_layout/auth-layout.tsx:169-176`, `apps/front/app/lib/cookies/logout.utils.ts:34` | Make `onAuthError` settable after creation (module-level ref), or ensure the first `getQueryClient()` call in browser always supplies `onAuthError` | **High** |
| Important | Backend/Auth semantics | 401 used for missing tenant header and invalid tenant-id format | Frontend treats 401 as “invalid session” → unintended logout | `apps/api/Src/Lib/Filters/CheckTenantHeaderFilter.cs:26-28`, `apps/api/Src/Lib/Filters/TenantAuthFilter.cs:56-64` | Reserve 401 for invalid session only; use 400/422 (or 403) for tenant header problems, or gate logout on translationKey | **High** |
| Important | Backend/Validation | Missing body handled as 400 via exception message parsing (fragile) vs filter 422 path | Inconsistent status + weaker form mapping; brittle across ASP.NET changes | `apps/api/Src/Lib/Extensions/CustomExceptionHandler.cs:24-34`, `apps/api/Src/Lib/Filters/ReqBodyValidationFilter.cs:18-31` | Prefer nullable body params + filter-driven 422; or convert missing-body exceptions to 422 ValidationProblemDetails with `errors` | **Med** |
| Important | Backend↔OpenAPI↔Kiota | Products endpoints emit non-ProblemDetails errors | Kiota error parsing/UX inconsistent; spec mismatch | `apps/api/Src/Modules/Tenant/Products/ProductHandlers.cs:12-27`, Kiota expects problem+json `packages/js-client/src/tenant/products/item/index.ts:74-104` | Return `TypedProblems.*` for 400/404 (and set content-type), or remove/mark endpoints as placeholder | **High** |
| Important | Backend/Observability | Global exception handler doesn’t log exceptions | Harder production debugging; no server-side root cause | `apps/api/Src/Lib/Extensions/CustomExceptionHandler.cs:10-60` (no logging) | Inject/use `ILogger` and log `exceptionHandlerFeature.Error` with appropriate level + redaction | **High** |
| Important | Frontend/SSR hygiene | `setGlobalNavigate()` called during render (and on server) | Potential SSR memory retention + side-effect during render | `apps/front/app/root.tsx:150-156`, `apps/front/app/lib/react-router/navigation-helper.ts:13-21` | Move to `useEffect(() => setGlobalNavigate(navigate), [navigate])` and ensure it never runs on server | **Med** |
| Minor | Frontend/Validation mapping | PascalCase→camelCase conversion breaks acronyms (`XMLParser` → `xMLParser`) | Occasional unmapped RHF field errors | `apps/front/app/lib/api-failure/map-validation-errors.ts:46-48` | Use a more robust case conversion (or explicit mappings for affected forms) | **High** |
| Minor | Frontend/Error classification | `error.message.includes('aborted')` may false-positive | Misclassified errors (silent abort) | `apps/front/app/lib/api-failure/to-api-failure.ts:45-59` | Tighten abort detection (prefer `name === 'AbortError'`) | **Med** |

## Critical Issues (Must Fix Before Merge)

### 1) Session token is logged (plaintext)
- **Impact**: leaking session tokens into logs is a direct security incident vector (log aggregation, support dumps, shared environments).
- **Evidence**: `apps/api/Src/Lib/Filters/PermissionFilter.cs:56-60`
  - Logs include `sessionToken = authContext.SessionToken`.
- **Minimal fix** (recommended):
  - Remove `sessionToken` from the logged object entirely.
  - If correlation is required, log a **non-reversible** fingerprint (e.g., first 6 chars of SHA-256) and never the raw token.

### 2) 401 handling can silently stop working (QueryClient init-order bug)
- **Impact**: if `QueryClient` is first created via `getQueryClient()` *without* `onAuthError`, then later calls (including root) cannot attach it (“options only used on first call”). Your 401 branch returns early even when `onAuthError` is missing → **silent failures**.
- **Evidence**
  - Early-return on 401 regardless of callback presence: `apps/front/app/lib/react-query/query-client.tsx:171-184`
  - Singleton “options only used on first call”: `apps/front/app/lib/react-query/query-client.tsx:392-403`
  - Calls that can run before root initialization (client loaders / utilities):
    - `apps/front/app/routes/auth/_layout/auth-layout.tsx:169-176` (calls `getQueryClient()` without options)
    - `apps/front/app/lib/cookies/logout.utils.ts:34` (calls `getQueryClient()` without options)
- **Minimal fix options**
  1) **Preferred**: store `onAuthError` in a module-level mutable ref and have error handlers read it at runtime (not captured at creation). Then `getQueryClient({ onAuthError })` can set/update it even after singleton exists.
  2) Enforce that every browser callsite uses a wrapper like `getRootQueryClient()` (always passes `onAuthError`) and prevent naked `getQueryClient()` usage (harder to guarantee long-term).

## Important Issues (Should Fix)

### A) 401 vs tenant-header failures can trigger unintended logout
- **Evidence**
  - Missing tenant header returns 401: `apps/api/Src/Lib/Filters/CheckTenantHeaderFilter.cs:26-28`
  - Invalid tenant-id format returns 401: `apps/api/Src/Lib/Filters/TenantAuthFilter.cs:56-64`
- **Why it matters**: frontend policy is “401 ⇒ logout”. These are not necessarily invalid sessions.
- **Suggested fix**: reserve 401 for missing/invalid session only; use 400/422 for tenant header issues (and include field errors if you want form mapping), or make frontend logout conditional on a specific translationKey that means “session invalid”.

### B) Missing-body handling is brittle + inconsistent with 422 validation invariant
- **Evidence**
  - Exception-message string matching: `apps/api/Src/Lib/Extensions/CustomExceptionHandler.cs:24-34`
  - Body validation filter emits 422 for “body required”: `apps/api/Src/Lib/Filters/ReqBodyValidationFilter.cs:18-31`
- **Suggested fix**: make `[FromBody]` params nullable so binding doesn’t throw and the filter consistently returns `422` with `{ errors: { body: [...] } }`. If you keep the exception handler path, convert missing-body exceptions to `422 ValidationProblemDetails` instead of 400.

### C) Products endpoints violate “all errors are RFC7807”
- **Evidence**
  - `TypedResults.NotFound()` / `TypedResults.BadRequest()` without ProblemDetails: `apps/api/Src/Modules/Tenant/Products/ProductHandlers.cs:12-27`
  - Kiota expects `application/problem+json` + `AppProblemDetails` for these: `packages/js-client/src/tenant/products/item/index.ts:74-104`
- **Suggested fix**: either migrate Products to `TypedProblems.*` (and document properly), or explicitly treat them as placeholder and remove from generated client / routes until compliant.

### D) Exception handler does not log the underlying exception
- **Evidence**: no logging in `apps/api/Src/Lib/Extensions/CustomExceptionHandler.cs:10-60`
- **Suggested fix**: add `ILogger` usage and log `exceptionHandlerFeature.Error` (with redaction). Keep response sanitized.

### E) `setGlobalNavigate()` is invoked during render (and likely on server)
- **Evidence**: `apps/front/app/root.tsx:150-156`
- **Suggested fix**: move it to `useEffect`; ensures no SSR global mutation and avoids side-effects during render.

## Minor Issues (Nice to Have)
- `mapValidationErrors` case conversion is naive for acronyms: `apps/front/app/lib/api-failure/map-validation-errors.ts:46-48`.
- Abort detection is a bit broad: `apps/front/app/lib/api-failure/to-api-failure.ts:45-59`.
- There are stray non-printable characters in comments (shows as `\u001a`) in validation filter files: `apps/api/Src/Lib/Filters/ReqBodyValidationFilter.cs:23`, `apps/api/Src/Lib/Filters/ReqQueryValidationFilter.cs:24`.

## Questions for the Author
1) Is it guaranteed that the browser’s first call to `getQueryClient()` always passes `onAuthError`? Current code suggests **no** due to client loaders and `logout()` using `getQueryClient()` directly.
2) Do you intend “missing tenant header / invalid tenantId header” to force logout? If not, we should change the status codes (or frontend policy).
3) Are the tenant Products endpoints production-relevant, or placeholders? If relevant, they need RFC7807 compliance to match Kiota/OpenAPI.

## Positive Observations
- Backend `IResult + IEndpointMetadataProvider` approach is clean and keeps OpenAPI accurate for migrated handlers (`apps/api/Src/Lib/ProblemResults/*HttpResult.cs`).
- Consistent `application/problem+json` and `traceId` enrichment in results (`apps/api/Src/Lib/ProblemResults/App*HttpResult.cs`).
- Frontend normalization via Zod + discriminated union is a solid foundation (`apps/front/app/lib/api-failure/schemas.ts`, `apps/front/app/lib/api-failure/to-api-failure.ts`).
- SSR-safe toast import pattern is good (`apps/front/app/lib/react-query/query-client.tsx:67-97`).

## Final Verdict: REQUEST CHANGES

Fix the two Critical issues (token logging + QueryClient/onAuthError init-order) before shipping; then address the tenant-header 401 semantics and Products RFC7807 mismatch to align with the PR’s stated invariants.
