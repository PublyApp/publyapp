# Analysis: ProblemDetails vs ApiResponse Migration

## Context

This analysis evaluates whether to migrate from a custom `ApiResponse` class to ASP.NET Core's built-in `ProblemDetails` (RFC 7807) for error handling in a Minimal API application.

### Current Implementation

```csharp
// apps/api/Src/Lib/ApiResponse.cs
public record ApiResponse {
    public string Message { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;

    public static ApiResponse Create(string message, TranslationKey key)
        => new() { Message = message, Key = key };
}
```

**Key characteristics:**
- Simple two-field structure: `Message` (debug/fallback) + `Key` (translation key for frontend i18n)
- Type-safe `TranslationKey` struct with auto-generated constants
- Used across all handlers, middlewares, and exception handlers
- Custom `.ProducesApiResponses()` extension for OpenAPI documentation

---

## Primary Question: Does ProblemDetails Enable Automatic OpenAPI Status Code Detection?

### Short Answer: **Partially, but not for all cases**

### Detailed Findings

#### What TypedResults CAN Auto-Document

| Method | Status | Auto-documented? | Has Response Body? |
|--------|--------|------------------|--------------------|
| `TypedResults.BadRequest()` | 400 | Yes | Yes |
| `TypedResults.NotFound()` | 404 | Yes | Yes |
| `TypedResults.Conflict()` | 409 | Yes | Yes |
| `TypedResults.UnprocessableEntity()` | 422 | Yes | Yes |
| `TypedResults.Forbid()` | 403 | Yes | **No (empty body)** |
| `TypedResults.Problem(statusCode: 403)` | 403 | **No** | Yes |

#### The 403 Forbidden Gap

This is critical because the codebase uses 403 extensively for permission checks.

**Why `TypedResults.Json` and `TypedResults.Problem` behave the same:**

```csharp
// Current approach with ApiResponse
return TypedResults.Json(
    ApiResponse.Create("User does not have the necessary permissions", ResponseKeys.UserDoesNotHaveTheNecessaryPermissions),
    statusCode: StatusCodes.Status403Forbidden
);
// Return type: JsonHttpResult<ApiResponse>
// Status code: runtime parameter, NOT in type signature

// With ProblemDetails
return TypedResults.Problem(
    detail: "User does not have the necessary permissions",
    statusCode: StatusCodes.Status403Forbidden
);
// Return type: ProblemHttpResult
// Status code: runtime parameter, NOT in type signature
```

In both cases, the status code is a **runtime parameter** that cannot be inferred by the OpenAPI generator. The type signatures (`JsonHttpResult<T>` and `ProblemHttpResult`) are opaque regarding status codes.

**Comparison of 403 options:**

| Approach | Has Body? | Auto-documented? |
|----------|-----------|------------------|
| `TypedResults.Json(apiResponse, statusCode: 403)` | Yes | No |
| `TypedResults.Problem(statusCode: 403)` | Yes | No |
| `TypedResults.Forbid()` | **No** | Yes |

**The only way to get automatic detection** is to use distinct typed results like `NotFound<T>`, `BadRequest<T>`, etc. where the status code is encoded in the type. For 403 with a body, no such built-in type exists.

#### Microsoft's Official Position

From [ASP.NET Core documentation](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/include-metadata?view=aspnetcore-9.0):

> "ASP.NET Core does **not** automatically detect status codes from your implementation logic. You must **explicitly** document each possible response."

And:

> "In Minimal APIs, the Produces extension method and the [ProducesResponseType] attribute **only set the response metadata** for the endpoint. They do not modify or constrain the behavior of the endpoint."

---

## Translation Keys Integration

### Current Approach
```csharp
ApiResponse.Create("Error message", ResponseKeys.SomeKey)
// Response: { "message": "Error message", "key": "some-key" }
```

### With ProblemDetails
```csharp
new ProblemDetails {
    Type = "https://api.example.com/errors/forbidden",
    Title = "Forbidden",
    Status = 403,
    Detail = "User does not have the necessary permissions",
    Extensions = { ["translationKey"] = "user-does-not-have-the-necessary-permissions" }
}
// Response: { "type": "...", "title": "Forbidden", "status": 403, "detail": "...", "translationKey": "..." }
```

**Verdict:** Translation keys can be preserved via the `Extensions` dictionary. The frontend would need to look for `response.translationKey` instead of `response.key`.

---

## Comparison Matrix

| Aspect | Current ApiResponse | With ProblemDetails |
|--------|---------------------|---------------------|
| **400 BadRequest** | Manual `.ProducesApiResponses(400)` | Automatic via `TypedResults.BadRequest()` |
| **404 NotFound** | Manual `.ProducesApiResponses(404)` | Automatic via `TypedResults.NotFound()` |
| **403 Forbidden** | Manual `.ProducesApiResponses(403)` | **Still manual** via `.ProducesProblem(403)` |
| **500 Server Error** | Manual `.ProducesApiResponses(500)` | **Still manual** via `.ProducesProblem(500)` |
| **Translation keys** | Native `Key` property | Via `Extensions["translationKey"]` |
| **Response structure** | Simple: `{ Message, Key }` | Complex: `{ type, title, status, detail, instance, extensions }` |
| **Industry standard** | Custom | RFC 7807 compliant |
| **Tooling ecosystem** | Limited | Broad (many HTTP clients understand ProblemDetails) |

---

## Migration Impact Assessment

### Files Requiring Changes

1. **Core Types**
   - `apps/api/Src/Lib/ApiResponse.cs` - Replace or remove
   - `apps/api/Src/Lib/Extensions/OpenApiExtensions.cs` - Replace `ProducesApiResponses` with `ProducesProblem`

2. **All Handlers** (every handler returning ApiResponse)
   - Replace `ApiResponse.Create(...)` with `new ProblemDetails { ... }`
   - Update return type signatures

3. **Middlewares**
   - `CheckTenantHeaderMiddleware`
   - `SessionAuthMiddleware`
   - `StaffAuthMiddleware`
   - `TenantAuthMiddleware`

4. **Exception Handler**
   - `CustomExceptionHandler.cs`

5. **Validation Filter**
   - `WithReqBodyValidation` filter (if it returns ApiResponse)

6. **Frontend**
   - Update TypeScript client to parse ProblemDetails structure
   - Change `response.key` to `response.translationKey`
   - Handle additional ProblemDetails fields

### Estimated Scope
- ~50+ handler methods
- 4-5 middleware classes
- 1 exception handler
- Frontend API client layer

---

## Alternative Solutions to the Original Problem

If the goal is to reduce forgotten `ProducesApiResponses` bindings, consider these lighter alternatives:

### 1. Roslyn Analyzer
Create a compile-time analyzer that warns when:
- Handler uses `JsonHttpResult` without corresponding `ProducesApiResponses`
- Handler return type includes status codes not documented

### 2. Integration Tests
Add tests that:
- Parse the generated OpenAPI document
- Compare documented status codes against handler implementations
- Fail on mismatches

### 3. Custom Typed Results
Create strongly-typed results for common status codes:

```csharp
public static class CustomResults {
    public static ForbiddenResult<T> Forbidden<T>(T value) => new(value);
}

public class ForbiddenResult<T> : IResult, IEndpointMetadataProvider {
    // Returns 403 with body AND provides OpenAPI metadata
}
```

---

## Recommendations

### Option A: Keep ApiResponse (Recommended)

**Rationale:**
- Migration effort is high (~50+ files)
- Primary pain point (OpenAPI auto-detection) is only partially solved
- 403 Forbidden (heavily used) still requires manual documentation
- Current solution is simple and purpose-built for the frontend's needs

**Action items:**
1. Consider implementing a Roslyn analyzer for forgotten `ProducesApiResponses`
2. Add integration tests validating OpenAPI spec completeness
3. Close the GitHub issue as "won't fix" with rationale

### Option B: Migrate to ProblemDetails

**Rationale:**
- RFC 7807 compliance is an industry standard
- Some automatic documentation (400, 404)
- Better tooling ecosystem support

**Action items:**
1. Create ProblemDetails factory methods that include translation keys
2. Update all handlers, middlewares, exception handler
3. Update frontend to parse new response structure
4. Replace `.ProducesApiResponses()` with `.ProducesProblem()`
5. Still manually document 403, 500, and other custom codes

### Option C: Hybrid Approach

**Rationale:**
- Get automatic documentation where possible
- Minimize changes for edge cases

**Not recommended** because:
- Inconsistent API response format (some ProblemDetails, some ApiResponse)
- Confuses frontend error handling
- Worst of both worlds

### Option D: Custom Typed Results with ProblemDetails (IMPLEMENTED)

**Rationale:**
- RFC 7807 compliance via custom `TranslatedProblemDetails` class
- Full automatic OpenAPI documentation for ALL status codes (including 403, 500)
- Native translation key support (not buried in Extensions dictionary)
- Gradual migration possible - new and old patterns can coexist

**Implementation:** Custom typed results that implement `IEndpointMetadataProvider`:

```csharp
// Usage in handlers:
return TypedProblems.Forbidden(
    "User does not have the necessary permissions",
    ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
);

// Handler signature - OpenAPI auto-detects 403!
public static async Task<Results<
    Ok<Response>,
    ForbiddenHttpResult,      // <-- 403 is now in the type!
    NotFoundHttpResult        // <-- 404 is now in the type!
>> Handle(...)
```

**Response format (RFC 7807 compliant):**
```json
{
  "type": "https://httpstatuses.com/403",
  "title": "Forbidden",
  "status": 403,
  "detail": "User does not have the necessary permissions",
  "translationKey": "user-does-not-have-the-necessary-permissions"
}
```

**Files created:**
- `apps/api/Src/Lib/ProblemResults/TranslatedProblemDetails.cs` - ProblemDetails with TranslationKey
- `apps/api/Src/Lib/ProblemResults/TypedProblems.cs` - Factory methods
- `apps/api/Src/Lib/ProblemResults/ForbiddenHttpResult.cs` - 403 with auto-documentation
- `apps/api/Src/Lib/ProblemResults/UnauthorizedHttpResult.cs` - 401 with auto-documentation
- `apps/api/Src/Lib/ProblemResults/NotFoundHttpResult.cs` - 404 with auto-documentation
- `apps/api/Src/Lib/ProblemResults/BadRequestHttpResult.cs` - 400 with auto-documentation
- `apps/api/Src/Lib/ProblemResults/InternalServerErrorHttpResult.cs` - 500 with auto-documentation

**Benefits:**
- No more `.ProducesApiResponses()` needed for any status code
- OpenAPI generator sees the status code in the handler's return type
- Translation keys are first-class citizens (not in Extensions)
- Gradual migration - can use alongside existing `ApiResponse` pattern
- Type-safe at compile time

**Migration path:**
1. Start using `TypedProblems.*` for new handlers
2. Gradually migrate existing handlers
3. Eventually remove `ApiResponse` and `.ProducesApiResponses()`

---

## Sources

- [Include OpenAPI metadata in ASP.NET Core | Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/openapi/include-metadata?view=aspnetcore-9.0)
- [Handle errors in ASP.NET Core APIs | Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling-api?view=aspnetcore-10.0)
- [GitHub Issue #60394: Should Minimal APIs return ProblemDetails by default?](https://github.com/dotnet/aspnetcore/issues/60394)
- [Problem Details for ASP.NET Core APIs | Milan Jovanović](https://www.milanjovanovic.tech/blog/problem-details-for-aspnetcore-apis)
- [Create responses in Minimal API applications | Microsoft Learn](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/responses?view=aspnetcore-9.0)
- [ProblemDetails Class | Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.mvc.problemdetails?view=aspnetcore-8.0)

---

## Conclusion

The migration to standard ProblemDetails does **not** solve the primary pain point of automatic OpenAPI status code detection for all cases. While it provides RFC 7807 compliance and automatic documentation for 400/404, the heavily-used 403 Forbidden pattern still requires manual documentation.

**However, Option D (Custom Typed Results with ProblemDetails) solves all the issues:**
- Full RFC 7807 compliance
- Automatic OpenAPI documentation for ALL status codes (including 403, 500)
- Native translation key support
- Gradual migration path

**Recommended approach: Option D** - Use the custom `TypedProblems` factory and typed result classes that have been implemented in `apps/api/Src/Lib/ProblemResults/`.
