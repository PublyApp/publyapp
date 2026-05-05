# Final Code Review: RFC 7807 ProblemDetails Implementation (PR #162)

> **Instructions for Reviewer**: You are a principal engineer + security-minded architect with deep expertise in ASP.NET Core Minimal APIs, React/TypeScript, and distributed systems. Your job is to decide if this PR is safe to ship. Be thorough but pragmatic: flag only actionable issues that affect correctness, security, reliability, UX, maintainability, or debuggability (not personal style).

---

## Reviewer Operating System (God-Tier Mode)

### Inputs You Can Assume You Have
- The PR diff (or branch checkout) and the ability to search the repo.
- The full context in this document, including the architecture notes and snippets.
- No runtime access unless explicitly provided; treat "works locally" claims as **unverified** unless backed by a test plan.

### Non-Negotiables (Guardrails)
- **No hallucinations**: If you cannot confirm from the diff/context, label it **Needs confirmation** and say what to check.
- **Evidence-first**: Every issue must include at least one of: file path + symbol name, code quote, or a concrete reproduction path.
- **Root-cause focus**: Prefer the smallest change that fixes the root cause (avoid "rewrite everything").
- **Risk calibration**: Assign **Severity** (Critical/Important/Minor) and **Confidence** (High/Med/Low) to each finding.
- **Production mindset**: Optimize for real-world failure modes (timeouts, partial deploys, proxy behavior, SSR, race conditions, retries).

### Severity + Confidence Rubric
- **Critical**: Could cause security issues, broken auth, data loss/corruption, incorrect HTTP semantics that break clients, infinite loops, crashes, or widespread regressions.
- **Important**: Likely to cause edge-case bugs, confusing DX, fragile behavior, or significant long-term maintenance burden.
- **Minor**: Cosmetic UX, naming/documentation, micro-optimizations, or "would be nicer if...".
- **High confidence**: You can point to the exact code path and explain the failure.
- **Medium confidence**: Strong suspicion with partial evidence; specify exactly what to verify.
- **Low confidence**: A hunch; include as a question, not a directive.

### Review Protocol (Do This In Order)
1. **Map the blast radius**: Summarize what changed and the critical paths (backend -> OpenAPI -> Kiota -> frontend).
2. **Define invariants** (then verify them):
   - All error responses are RFC 7807 with `application/problem+json`.
   - `translationKey` is always present when needed for i18n and never leaks secrets.
   - 401 vs 403 semantics are consistent and cannot accidentally log users out on 403.
   - Validation is 422 with stable, form-mappable field keys.
   - OpenAPI accurately documents non-2xx responses, including 500, and matches runtime behavior.
3. **Backend deep-dive**: Results, filters, exception handler, metadata, status-code semantics, cancellation, logging/telemetry, and PII.
4. **Frontend deep-dive**: Error normalization order, SSR guards, global query/mutation handlers, logout idempotency, form mapping, and toasts.
5. **Integration sanity**: "What the server emits" == "what Kiota throws" == "what Zod accepts" == "what UX shows".
6. **Ship decision**: Summarize top risks and give a merge verdict with minimal required fixes.

### Output Contract (Strict)
Provide the following sections (in this order):
1. **Executive Summary** (<= 8 bullets): merge readiness + top risks.
2. **Risk Register** (table): `Severity | Area | Issue | Impact | Evidence | Suggested Fix | Confidence`.
3. **Critical Issues (Must Fix Before Merge)**
4. **Important Issues (Should Fix)**
5. **Minor Issues (Nice to Have)**
6. **Questions for the Author** (only what blocks confidence)
7. **Positive Observations**
8. **Final Verdict**: **APPROVE** / **REQUEST CHANGES** / **COMMENT**

When you propose a fix, include either (a) a minimal patch sketch, or (b) the exact code area to change and the intended behavior.

## Context

### Project Overview
**PublyApp** is a multi-tenant SaaS platform for social media management. The stack:
- **Backend**: ASP.NET Core Minimal APIs (.NET), Entity Framework Core, FluentValidation
- **Frontend**: React 19 + React Router 7 (SSR) + TanStack Query + React Hook Form
- **API Client**: Kiota-generated TypeScript client from OpenAPI spec
- **Architecture**: Vertical slice architecture, feature-based modules

### PR Summary
This PR implements RFC 7807 ProblemDetails for standardized API error responses, replacing a custom `ApiResponse` class. The change spans both backend (27 handlers, 8 filters) and frontend (centralized error handling).

**Key Goals**:
1. Standard RFC 7807 error format with `translationKey` extension for i18n
2. Automatic OpenAPI documentation via `IEndpointMetadataProvider`
3. Clear HTTP status code semantics (400 vs 422, 401 vs 403)
4. Centralized frontend error handling with discriminated union pattern
5. Type-safe form validation mapping

### Previous Reviews
This implementation has passed 3 rounds of AI review with issues addressed:
- Round 1: Schema discriminator, SSR QueryClient leak, auth flag reset, DOMException guard
- Round 2: Side-effect during render, hook naming, toast cache reset, Response guard
- Round 3: Approved with minor polish items (implemented)

---

## Metrics

| Metric | Value |
|--------|-------|
| Files Changed | 94 |
| Lines Added | 7,473 |
| Lines Deleted | 1,537 |
| Backend Handlers Migrated | 27 |
| Backend Filters Migrated | 8 |
| Endpoints with 500 Documented | 34/34 |
| Frontend Forms Migrated | 5 |

---

## Architecture Overview

### Backend Flow
```
Handler returns error:
    TypedProblems.BadRequest("detail", ResponseKeys.SomeKey)
    TypedProblems.ValidationProblem("detail", ResponseKeys.Key, errors)
                    |
                    v
    App*HttpResult (implements IResult + IEndpointMetadataProvider)
                    |
        +-----------+-----------+
        |                       |
        v                       v
    ExecuteAsync()          PopulateMetadata()
    - Sets status code      - Adds ProducesAppProblemMetadata
    - Sets content-type     - Auto-documents in OpenAPI
    - Writes JSON body
                    |
                    v
    JSON Response:
    {
        "type": "https://httpstatuses.com/400",
        "title": "Bad Request",
        "status": 400,
        "detail": "Profile name already exists",
        "translationKey": "profile-name-already-exists",
        "instance": "/api/v1/staff/profiles",
        "traceId": "0HN5K8..."
    }
```

### Frontend Flow
```
Kiota Client throws error (with responseStatusCode from Kiota's ApiError)
                    |
                    v
            toApiFailure(error)
                    |
    Zod validates against AppProblemDetailsSchema
    (requires responseStatusCode as discriminator)
                    |
                    v
    Returns discriminated union:
    - validation (422) -> fieldErrors dictionary
    - problem (400/401/403/404/500) -> status, detail, translationKey
    - network -> fetch failed
    - abort -> request cancelled (silent)
    - unknown -> unexpected error
                    |
                    v
    MutationCache / QueryCache global handlers
                    |
        +-----------+-----------+-----------+-----------+
        |           |           |           |           |
        v           v           v           v           v
    401         422+form    422         other       abort
    logout()    silent      toast       toast       silent
```

---

## Backend Review Areas

### 1. HTTP Status Code Semantics

The PR establishes clear distinctions between status codes:

| Status | Class | Use Case |
|--------|-------|----------|
| **400** | `AppBadRequestHttpResult` | Business logic errors (e.g., "Email already exists", "Invalid permission keys") |
| **401** | `AppUnauthorizedHttpResult` | Authentication failures (no valid session) |
| **403** | `AppForbiddenHttpResult` | Authorization failures (valid session, but no permission) |
| **404** | `AppNotFoundHttpResult` | Resource not found |
| **422** | `AppValidationProblemHttpResult` | Request body/query validation failures with field-level errors |
| **500** | `AppInternalServerErrorHttpResult` | Server errors |

**Questions**:
- Is the 400 vs 422 distinction correctly applied across all handlers?
- Should "Profile name already exists" be 400 (current) or 409 Conflict?
- Are all authorization failures using 403 (not 401)?

### 2. IEndpointMetadataProvider Implementation

Each result class implements `IEndpointMetadataProvider` for automatic OpenAPI documentation:

```csharp
// AppForbiddenHttpResult.cs
public sealed class AppForbiddenHttpResult : IResult, IEndpointMetadataProvider {
    public async Task ExecuteAsync(HttpContext httpContext) {
        _problemDetails.Instance ??= httpContext.Request.Path.Value;
        _problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

        httpContext.Response.StatusCode = StatusCodes.Status403Forbidden;
        httpContext.Response.ContentType = "application/problem+json";
        await httpContext.Response.WriteAsJsonAsync(_problemDetails, httpContext.RequestAborted);
    }

    public static void PopulateMetadata(MethodInfo method, EndpointBuilder builder) {
        builder.Metadata.Add(new ProducesAppProblemMetadata(StatusCodes.Status403Forbidden));
    }
}
```

**Questions**:
- Is `application/problem+json` the correct content type for RFC 7807?
- Should `traceId` be in `Extensions` or a dedicated property?
- Is `Instance` correctly set to the request path?

### 3. Filter Extension Methods & OpenAPI

Filters automatically add their error responses to OpenAPI via extension methods:

```csharp
// PermissionFilterExtensions
public static RouteGroupBuilder WithPermission(
    this RouteGroupBuilder builder,
    Permission[] requiredPermissions
) {
    return builder
        .AddEndpointFilter(new PermissionFilter(requiredPermissions))
        .ProducesAppProblem(StatusCodes.Status403Forbidden);  // Auto-documents 403
}

// ReqBodyValidationFilterExtensions
public static RouteHandlerBuilder WithReqBodyValidation<TRequest>(this RouteHandlerBuilder builder) {
    return builder
        .AddEndpointFilter<ReqBodyValidationFilter<TRequest>>()
        .ProducesValidationProblem();  // Auto-documents 422
}
```

**Questions**:
- Is the filter ordering correct? (auth -> permission -> validation)
- Are all filters returning exactly the status codes they document?
- Could any filter throw an exception instead of returning a typed result?

### 4. Validation Filter Logic

```csharp
// ReqBodyValidationFilter.cs
public async ValueTask<object?> InvokeAsync(
    EndpointFilterInvocationContext httpContext,
    EndpointFilterDelegate next
) {
    var (found, idx) = httpContext.Arguments
        .Select((arg, i) => (arg, i))
        .FirstOrDefault(x => x.arg is TRequest);

    if (found is null) {
        return TypedProblems.ValidationProblem(
            "Request body is required",
            ResponseKeys.RequestBodyValidationFailed,
            new Dictionary<string, string[]> { { "body", ["Request body is required"] } }
        );
    }

    var request = httpContext.GetArgument<TRequest>(idx);
    var result = await _validator.ValidateAsync(request, httpContext.HttpContext.RequestAborted);

    if (!result.IsValid) {
        return TypedProblems.ValidationProblem(
            "Request body validation failed",
            ResponseKeys.RequestBodyValidationFailed,
            result.ToDictionary()
        );
    }

    return await next(httpContext);
}
```

**Questions**:
- Is the argument discovery logic (`FirstOrDefault`) reliable for all endpoint signatures?
- What happens if multiple arguments match `TRequest`?
- Is `result.ToDictionary()` producing the expected `Record<string, string[]>` format?
- What if the validator throws an exception?

### 5. Exception Handler

```csharp
// CustomExceptionHandler.cs
public static void UseCustomExceptionHandler(this IApplicationBuilder app) {
    app.UseExceptionHandler(exceptionHandlerApp => {
        exceptionHandlerApp.Run(async context => {
            context.Response.ContentType = "application/problem+json";

            var statusCode = StatusCodes.Status500InternalServerError;
            var title = "Internal Server Error";
            var detail = "Internal server error";
            var key = ResponseKeys.InternalServerError;

            var exceptionHandlerFeature = context.Features.Get<IExceptionHandlerFeature>();
            var exceptionType = exceptionHandlerFeature?.Error;

            if (exceptionType != null) {
                // Handle missing request body
                if (exceptionType is BadHttpRequestException badRequestException
                    && badRequestException.Message.Contains("Required parameter")
                    && badRequestException.Message.Contains("was not provided from body")) {
                    statusCode = StatusCodes.Status400BadRequest;
                    title = "Bad Request";
                    detail = "Request body is missing";
                    key = ResponseKeys.RequestBodyMissing;
                }
                // Handle missing query parameter
                if (exceptionType is BadHttpRequestException validationException
                    && validationException.Message.Contains("Required parameter")
                    && validationException.Message.Contains("was not provided from query string")) {
                    // Extract parameter name via regex...
                }
            }

            context.Response.StatusCode = statusCode;
            var response = AppProblemDetails.Create(statusCode, title, detail, key);
            response.Instance = context.Request.Path.Value;
            response.Extensions["traceId"] = context.TraceIdentifier;

            await context.Response.WriteAsJsonAsync(response, context.RequestAborted);
        });
    });
}
```

**Questions**:
- Is string matching on exception messages fragile? Could ASP.NET Core change these messages?
- Should we log the original exception before returning the sanitized response?
- Are there other exception types that should be handled specially (e.g., `DbUpdateException`, `TimeoutException`)?
- Should unhandled exceptions ever expose the actual error message in development mode?

### 6. Handler Migration Pattern

Example of a migrated handler:

```csharp
// CreateStaffProfile.cs
public static async Task<Results<
    Ok<StaffProfileCreated>,
    AppBadRequestHttpResult  // Was: BadRequest<ApiResponse>
>> HandleCreateStaffProfile(...) {
    // ...
    if (result is CreateStaffProfileResult.ProfileNameExists) {
        return TypedProblems.BadRequest(
            "Profile name already exists",
            ResponseKeys.ProfileNameAlreadyExists
        );
    }

    if (result is CreateStaffProfileResult.InvalidPermissions invalidPerms) {
        return TypedProblems.BadRequest(
            $"Invalid permission keys: {string.Join(", ", invalidPerms.InvalidKeys)}",
            ResponseKeys.BadRequest
        );
    }
    // ... more result checks
}
```

**Questions**:
- Are all 27 handlers correctly updated with the new return types in `Results<>`?
- Are error messages consistent and meaningful for frontend display?
- Are translation keys specific enough (e.g., `ResponseKeys.BadRequest` is generic)?
- Is the pattern of checking result types with `is` the recommended approach for discriminated unions?

---

## Frontend Review Areas

### 7. Zod Schema Validation

```typescript
// schemas.ts
export const AppProblemDetailsSchema = z
    .object({
        // RFC 7807 standard fields
        type: z.string().nullish(),
        title: z.string().nullish(),
        status: z.number().nullish(),
        detail: z.string().nullish(),
        instance: z.string().nullish(),
        // Our custom extension
        translationKey: z.string().nullish(),
        // Kiota's ApiError field - REQUIRED as discriminator
        responseStatusCode: z.number(),
        responseHeaders: z.record(z.array(z.string())).optional(),
    })
    .passthrough();
```

**Questions**:
- Is requiring only `responseStatusCode` sufficient to identify Kiota errors?
- Could any non-Kiota object accidentally match this schema?
- Is `.passthrough()` necessary? Could it leak sensitive data?
- Should we validate that `status` matches `responseStatusCode` when both present?

### 8. Error Normalization Order

```typescript
// to-api-failure.ts
export const toApiFailure = (error: unknown): ApiFailure => {
    // 1. ValidationProblemDetails (HTTP 422) - must be before AppProblemDetails
    const validationDetails = parseValidationProblemDetails(error);
    if (validationDetails) { return { kind: 'validation', ... }; }

    // 2. AppProblemDetails (HTTP 400, 401, 403, 404, 500)
    const problemDetails = parseAppProblemDetails(error);
    if (problemDetails) { return { kind: 'problem', ... }; }

    // 3. AbortError - must be before network errors (abort is intentional)
    if ((typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message.includes('aborted'))) {
        return { kind: 'abort', raw: error };
    }

    // 4. Network errors (TypeError with fetch-related message)
    // 5. Raw Response object (SSR-guarded)
    // 6. Kiota fallback (has responseStatusCode but failed shape validation)
    // 7. Standard Error
    // 8. Unknown (primitives, null, undefined)
};
```

**Questions**:
- Is the classification order correct for all edge cases?
- Could `error.message.includes('aborted')` cause false positives?
- Is the fallback chain (status -> responseStatusCode -> 500) safe?

### 9. Auth Error Handling (401 vs 403)

```typescript
// query-client.tsx - Mutation handler
if (failure.kind === 'problem' && failure.status === 401 && !mutation.meta?.skipAuthErrorHandler) {
    if (!authLogoutInProgress && onAuthError) {
        authLogoutInProgress = true;
        onAuthError(failure.status, failure);
    }
    return;  // No toast for 401
}
// 403 falls through -> toast or error boundary
```

```typescript
// authed-layout.tsx - Error boundary
if (failure.status === 401) {
    logout({ redirectCause: 'invalid_session' });
    return <SplashScreen />;
}
if (failure.status === 403) {
    return <View403 />;  // No logout!
}
```

**Questions**:
- Is there any code path where 403 could trigger logout?
- Is the idempotency flag (`authLogoutInProgress`) reset at the right time?
- What happens if logout fails? Could the flag get stuck?
- Could race conditions cause double logout or navigation issues?

### 10. Form Validation Mapping

```typescript
// map-validation-errors.ts
const toCamelCase = (str: string): string => {
    return str.charAt(0).toLowerCase() + str.slice(1);
};

export const mapValidationErrors = <TForm extends FieldValues>(
    failure: ValidationFailure,
    setError: UseFormSetError<TForm>,
    options: MapValidationErrorsOptions<TForm> = {},
): MapValidationErrorsResult => {
    for (const [serverField, messages] of Object.entries(failure.fieldErrors)) {
        // Handle nested paths (e.g., "User.Email" -> "user.email")
        if (serverField.includes('.')) {
            formField = autoConvertCase
                ? serverField.split('.').map(toCamelCase).join('.')
                : serverField;
        }
        // Set error on form
        setError(formField as FieldPath<TForm>, {
            type: 'server',
            message: messages[0],  // Only first error shown
        });
    }
};
```

**Questions**:
- Is showing only the first error message per field acceptable UX?
- Is simple PascalCase->camelCase conversion reliable for all .NET property names (e.g., "XMLParser" -> "xMLParser")?
- What happens if a server field doesn't exist in the form? (RHF silently ignores)
- Should we add dev-mode warnings for unmapped fields?

### 11. SSR Safety Guards

```typescript
// to-api-failure.ts
if (typeof DOMException !== 'undefined' && error instanceof DOMException && ...)
if (typeof Response !== 'undefined' && error instanceof Response)

// navigation-helper.ts
if (typeof window === 'undefined') return;

// query-client.tsx
if (isServer) return;  // in safeToast()
```

**Questions**:
- Are there any unguarded browser API usages?
- Is the `isServer` constant reliable in all SSR contexts (e.g., edge workers)?
- What happens if a toast is attempted during SSR?

### 12. Global Navigation & QueryClient Setup

```typescript
// navigation-helper.ts
let navigateFn: NavigateFunction | null = null;
export const setGlobalNavigate = (fn: NavigateFunction): void => { navigateFn = fn; };
export const globalNavigate = (path: string, options?: { replace?: boolean }): void => {
    if (typeof window === 'undefined') return;
    if (!navigateFn) { window.location.href = path; return; }
    navigateFn(path, { replace: options?.replace });
};

// root.tsx
const App = ({ loaderData }: Route.ComponentProps) => {
    const navigate = useNavigate();
    setGlobalNavigate(navigate);  // Called on every render
    // ...
};
```

```typescript
// query-client.tsx
export const getQueryClient = (options?: CreateQueryClientOptions): QueryClient => {
    if (isServer) return createQueryClient(options);  // Fresh per request
    if (!browserQueryClient) browserQueryClient = createQueryClient(options);  // Singleton
    return browserQueryClient;
};
```

**Questions**:
- Is calling `setGlobalNavigate` on every render safe?
- Could there be issues with stale navigate function after hot reload?
- Are the QueryClient `options` (especially `onAuthError`) correctly captured on first browser call?

---

## Files to Review

### Backend Core (`apps/api/Src/Lib/ProblemResults/`)

| File | Purpose |
|------|---------|
| `AppProblemDetails.cs` | RFC 7807 base class with `translationKey` extension |
| `ValidationProblemDetails.cs` | Extends base with `errors` dictionary for field-level validation |
| `TypedProblems.cs` | Factory methods for all status codes (400, 401, 403, 404, 422, 500) |
| `App*HttpResult.cs` | 6 result classes implementing `IResult` + `IEndpointMetadataProvider` |
| `ProducesAppProblemMetadata.cs` | OpenAPI metadata for AppProblemDetails responses |
| `ProducesValidationProblemMetadata.cs` | OpenAPI metadata for ValidationProblemDetails responses |

### Backend Filters (`apps/api/Src/Lib/Filters/`)

| File | Status Codes | Purpose |
|------|-------------|---------|
| `SessionAuthFilter.cs` | 401 | Validates session header |
| `StaffAuthFilter.cs` | 403, 500 | Verifies user is staff member |
| `TenantAuthFilter.cs` | 401, 403, 404, 500 | Multi-tenant authorization |
| `PermissionFilter.cs` | 403 | Permission-based authorization |
| `ReqBodyValidationFilter.cs` | 422 | Request body validation with FluentValidation |
| `ReqQueryValidationFilter.cs` | 422 | Query string validation |
| `CheckSessionHeaderFilter.cs` | 401 | Session header presence check |
| `CheckTenantHeaderFilter.cs` | 401 | Tenant header presence check |

### Backend Infrastructure

| File | Purpose |
|------|---------|
| `apps/api/Src/Lib/Extensions/CustomExceptionHandler.cs` | Global exception handler returning ProblemDetails |
| `apps/api/Src/Lib/Extensions/OpenApiExtensions.cs` | `ProducesAppProblem()` and `ProducesValidationProblem()` helpers |

### Frontend Core (`apps/front/app/lib/api-failure/`)

| File | Purpose |
|------|---------|
| `types.ts` | `ApiFailure` discriminated union (5 kinds) |
| `schemas.ts` | Zod validation with `responseStatusCode` discriminator |
| `to-api-failure.ts` | Error normalization with SSR guards |
| `map-validation-errors.ts` | Server errors -> React Hook Form fields |
| `with-form-validation.ts` | Mutation wrapper for form validation |
| `index.ts` | Public API exports |

### Frontend Infrastructure

| File | Purpose |
|------|---------|
| `apps/front/app/lib/react-query/query-client.tsx` | Global handlers, auth callback, toast caching |
| `apps/front/app/lib/react-router/navigation-helper.ts` | Global navigate for SPA logout |
| `apps/front/app/lib/cookies/logout.utils.ts` | Session cleanup + navigation |
| `apps/front/app/routes/authed/_layout/authed-layout.tsx` | Auth error boundary + flag reset |
| `apps/front/app/root.tsx` | QueryClient setup with `onAuthError` |

---

## Code Snippets for Reference

### Backend: TypedProblems Factory

```csharp
public static class TypedProblems {
    public static AppBadRequestHttpResult BadRequest(
        string detail, TranslationKey translationKey, string title = "Bad Request"
    ) => new(AppProblemDetails.Create(StatusCodes.Status400BadRequest, title, detail, translationKey));

    public static AppForbiddenHttpResult Forbidden(
        string detail, TranslationKey translationKey, string title = "Forbidden"
    ) => new(AppProblemDetails.Create(StatusCodes.Status403Forbidden, title, detail, translationKey));

    public static AppValidationProblemHttpResult ValidationProblem(
        string detail, TranslationKey translationKey, IDictionary<string, string[]> errors
    ) => new(ValidationProblemDetails.Create(detail, translationKey, errors));

    // + Unauthorized, NotFound, InternalServerError
}
```

### Backend: AppProblemDetails

```csharp
public class AppProblemDetails : ProblemDetails {
    [JsonPropertyName("translationKey")]
    public string TranslationKey { get; set; } = string.Empty;

    public static AppProblemDetails Create(
        int statusCode, string title, string detail, TranslationKey translationKey,
        string? type = null, string? instance = null
    ) => new() {
        Status = statusCode,
        Title = title,
        Detail = detail,
        TranslationKey = translationKey.Value,
        Type = type ?? $"https://httpstatuses.com/{statusCode}",
        Instance = instance
    };
}
```

### Backend: ValidationProblemDetails

```csharp
public class ValidationProblemDetails : AppProblemDetails {
    [JsonPropertyName("errors")]
    public IDictionary<string, string[]> Errors { get; set; } = new Dictionary<string, string[]>();

    public static ValidationProblemDetails Create(
        string detail, TranslationKey translationKey, IDictionary<string, string[]> errors
    ) => new() {
        Status = StatusCodes.Status422UnprocessableEntity,
        Title = "Validation Failed",
        Detail = detail,
        TranslationKey = translationKey.Value,
        Type = "https://httpstatuses.com/422",
        Errors = errors
    };
}
```

### Frontend: ApiFailure Types

```typescript
export type ApiFailure =
    | ValidationFailure   // 422 with fieldErrors: Record<string, string[]>
    | ProblemFailure      // 400/401/403/404/500 with status, detail, translationKey
    | NetworkFailure      // Fetch failed with message
    | AbortFailure        // Request cancelled (silent)
    | UnknownFailure;     // Unexpected with message
```

### Frontend: Global Mutation Handler

```typescript
const createMutationErrorHandler = (onAuthError?: OnAuthErrorCallback) => {
    return (error: unknown, _vars: unknown, _ctx: unknown, mutation: Mutation<...>): void => {
        const failure = toApiFailure(error);

        if (failure.kind === 'abort') return;  // Silent

        if (failure.kind === 'problem' && failure.status === 401 && !mutation.meta?.skipAuthErrorHandler) {
            if (!authLogoutInProgress && onAuthError) {
                authLogoutInProgress = true;
                onAuthError(failure.status, failure);
            }
            return;  // No toast
        }

        if (mutation.meta?.skipGlobalErrorHandler) return;
        if (failure.kind === 'validation' && mutation.meta?.validationHandledByForm) return;

        showToast('error', getErrorMessage(failure));
    };
};
```

### Frontend: Logout Flow

```typescript
export const logout = (options?: LogoutOptions): void => {
    clearSessionCookie();
    getQueryClient().clear();
    getClientManager().clearClients();
    ClientManager.resetInstance();

    const loginUrl = new URL(FRONT_PATH_NAMES.auth.login, window.location.origin);
    if (options?.redirectCause === 'invalid_session') {
        loginUrl.searchParams.set(queryParamKey.login_page.redirect_cause, ...);
    }

    fetch(FRONT_PATH_NAMES.auth.clearSession, { method: 'POST', credentials: 'include', body: formData })
        .catch(() => {})
        .finally(() => { globalNavigate(loginUrl.pathname + loginUrl.search, { replace: true }); });
};
```

---

## Output Contract (Reminder)

Follow the **Output Contract (Strict)** defined near the top of this document.

If your environment cannot render tables, output the **Risk Register** as a bullet list using the same columns: `Severity | Area | Issue | Impact | Evidence | Suggested Fix | Confidence`.

---

## Test Plan Reference

### Backend Tests Completed
- [x] Build succeeds with no errors
- [x] OpenAPI spec includes `AppProblemDetails` and `ValidationProblemDetails` schemas
- [x] All filter extension methods add their status codes to OpenAPI
- [x] All 34 endpoints have 500 documented
- [x] TypeScript client regenerated successfully
- [x] Manual testing: error responses return correct RFC 7807 format with `translationKey`

### Frontend Tests Completed
- [x] TypeScript compiles with no errors
- [x] All forms migrated to centralized error handling
- [x] 3 rounds of AI code review passed
- [x] Manual testing: validation errors appear on form fields
- [x] Manual testing: 401 triggers logout and redirect
- [x] Manual testing: 403 shows forbidden page (no logout)
- [x] Manual testing: success toasts appear when configured

---

## Links

- **Issue**: https://github.com/radandevist/publyapp/issues/116
- **PR**: https://github.com/radandevist/publyapp/pull/162
- **RFC 7807**: https://datatracker.ietf.org/doc/html/rfc7807
- **ASP.NET Core IEndpointMetadataProvider**: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.metadata.iendpointmetadataprovider

---

## Key Design Decisions

1. **401 vs 403**: Only 401 triggers logout. 403 means "authenticated but forbidden" - user may need to switch tenants or request access.

2. **400 vs 422**: 400 for business logic errors ("email exists"), 422 for validation errors with field-level details.

3. **translationKey extension**: Custom RFC 7807 extension for frontend i18n support.

4. **IEndpointMetadataProvider**: All `App*HttpResult` classes implement this for automatic OpenAPI documentation.

5. **Success toasts are opt-in**: Mutations are silent by default. Use `meta.showSuccessToast` or `meta.successMessage`.

6. **Validation errors toast by default**: Unless `meta.validationHandledByForm` is set.

7. **responseStatusCode as discriminator**: Kiota always adds this field to ApiError. Random objects won't match.

8. **SPA logout**: Uses fetch + React Router navigation to avoid full page reload.

---

**Review this implementation thoroughly. Focus on correctness, security, edge cases, and production readiness across both backend and frontend. Your feedback determines if this is ready for production.**
