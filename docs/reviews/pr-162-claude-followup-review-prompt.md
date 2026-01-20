# Claude Review Request: PR #162 Follow-up Fixes (ProblemDetails + Auth Semantics)

## Role
You are a principal engineer + security-minded architect with deep expertise in ASP.NET Core Minimal APIs, OpenAPI/Kiota, React Router v7 (SSR), and TanStack Query.

Your job: **audit the follow-up fixes** applied after the initial RFC 7807 ProblemDetails implementation. Decide whether the current state is safe to ship and whether any regressions were introduced.

## Non‑negotiables
- **No hallucinations**: if you can’t verify from code, label **Needs confirmation** and say exactly what to check.
- **Evidence-first**: every finding must include file path + line(s)/symbol or concrete reproduction steps.
- **Pragmatic**: flag only actionable issues affecting correctness, security, reliability, UX, or debuggability.

## What changed (summary)
Please verify these were implemented correctly and did not break contracts:

### Backend
1) **Secret logging removed**
- Removed session token logging from permission checks.
- Key file: `apps/api/Src/Lib/Filters/PermissionFilter.cs`

2) **Tenant header errors no longer return 401**
- Missing tenant header → `400` + `translationKey: TenantIdRequired`
- Invalid tenant ID format → `400` + `translationKey: BadRequest`
- Key files: `apps/api/Src/Lib/Filters/CheckTenantHeaderFilter.cs`, `apps/api/Src/Lib/Filters/TenantAuthFilter.cs`

3) **Binding-time missing body/query param failures return 422 ValidationProblemDetails**
- Global exception handler now logs unhandled exceptions.
- Missing body / query param binding errors become `422` with `errors` map (stable keys).
- Key file: `apps/api/Src/Lib/Extensions/CustomExceptionHandler.cs`

4) **Products endpoints now comply with RFC 7807 error contract and OpenAPI**
- Replaced bare `TypedResults.NotFound()/BadRequest()` with `TypedProblems.*`.
- Added success/error response metadata.
- Key files: `apps/api/Src/Modules/Tenant/Products/ProductHandlers.cs`, `apps/api/Src/Modules/Tenant/Products/ProductEndpoints.cs`

5) **Nullable body parameters to avoid binder exceptions**
- Several `[FromBody]` params changed to nullable and then dereferenced after validation filters.
- Goal: consistent 422 from filters / handler.

### Frontend
6) **QueryClient singleton auth handler no longer “first-call wins”**
- `onAuthError` can be set even if QueryClient was created earlier.
- 401 is not silently swallowed when no callback is available.
- Key file: `apps/front/app/lib/react-query/query-client.tsx`

7) **SSR hygiene**
- `setGlobalNavigate()` moved to `useEffect` (avoid side-effects during render + avoid SSR global mutations).
- Key file: `apps/front/app/root.tsx`

8) **Minor behavior hardening**
- Abort detection tightened to avoid false positives.
- PascalCase→camelCase mapping improved for acronyms.
- Key files: `apps/front/app/lib/api-failure/to-api-failure.ts`, `apps/front/app/lib/api-failure/map-validation-errors.ts`

### Docs
9) **Behavior documented**
- Added runtime semantics section describing status code meanings, validation rules, frontend logout invariants.
- Key files: `docs/guides/problem-details-migration-checklist.md`, `AGENTS.md`

## What you should review (checklist)

### A) Backend correctness + security
- Confirm no remaining logs include session tokens or other secrets.
- Confirm `CheckTenantHeaderFilter` and `TenantAuthFilter` return exactly the documented status codes and content type.
- Confirm `CustomExceptionHandler`:
  - Logs only server-side details and does not leak PII/secrets in responses.
  - Produces valid `ValidationProblemDetails` (422) when appropriate, with stable `errors` keys.
  - Still produces `AppProblemDetails` (500) for unhandled exceptions.
- Confirm request cancellation token usage isn’t broken.

### B) OpenAPI ↔ Kiota ↔ runtime alignment
- Ensure endpoints that can return errors have matching OpenAPI metadata.
- Specifically validate Products endpoints and tenant/staff route groups.
- Ensure `application/problem+json` is used for ProblemDetails responses.

### C) Frontend global error policy
- Confirm only `401` triggers logout, and `403` never does.
- Confirm QueryClient auth handler works even if QueryClient is created before root.
- Confirm there is no SSR leakage/cross-request state.

### D) Edge cases / regressions
- Evaluate whether making `[FromBody]` nullable can lead to null dereferences if validation filters are missing.
- Validate that the fallback behavior on 401 without callback is acceptable and doesn’t cause noisy UX.

## Concrete areas to inspect
- `apps/api/Src/Lib/Filters/PermissionFilter.cs`
- `apps/api/Src/Lib/Filters/CheckTenantHeaderFilter.cs`
- `apps/api/Src/Lib/Filters/TenantAuthFilter.cs`
- `apps/api/Src/Lib/Extensions/CustomExceptionHandler.cs`
- `apps/api/Src/Lib/Filters/ReqBodyValidationFilter.cs`
- `apps/api/Src/Modules/Tenant/Products/ProductHandlers.cs`
- `apps/api/Src/Modules/Tenant/Products/ProductEndpoints.cs`
- `apps/front/app/lib/react-query/query-client.tsx`
- `apps/front/app/root.tsx`
- `apps/front/app/lib/api-failure/to-api-failure.ts`
- `apps/front/app/lib/api-failure/map-validation-errors.ts`
- `docs/guides/problem-details-migration-checklist.md`
- `AGENTS.md`

## Output format (strict)
Please output in this order:
1) **Executive Summary** (<= 8 bullets)
2) **Risk Register** (table preferred; otherwise bullets with same columns)
3) **Critical Issues (Must Fix)**
4) **Important Issues (Should Fix)**
5) **Minor Issues (Nice to Have)**
6) **Questions / Needs Confirmation**
7) **Positive Observations**
8) **Final Verdict**: APPROVE / REQUEST CHANGES / COMMENT

## Notes
- Assume builds passed locally (`dotnet build apps/api/MainApi.csproj -c Release`, `pnpm -C apps/front run type-check`), but treat runtime behavior as unverified unless you can reason from code.
