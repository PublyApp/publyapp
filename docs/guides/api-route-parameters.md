# API Route Parameter Conventions

> Referenced from `AGENTS.md` — rules for route parameters, ID validation, and error status codes in Minimal API handlers.

## Rule 1: No Route Constraints on ID Parameters

**Never** use ASP.NET route constraints (`:guid`, `:int`, etc.) on route parameters that represent entity IDs.

```csharp
// WRONG - route constraint bypasses our error contract
public const string GetById = "/{logId:guid}";

// CORRECT - unconstrained parameter, validated in handler
public const string GetById = "/{logId}";
```

### Why

Route constraints cause ASP.NET to return a **bare 404** when the parameter doesn't match the constraint type. This response:

- Is **not** RFC 7807 `application/problem+json` — breaks our error contract
- Has **no** `translationKey` — the frontend `ApiFailure` discriminated union can't handle it
- Bypasses handler logic entirely — no logging, no audit trail

## Rule 2: Correct HTTP Status Codes for ID Lookups

Use the semantically correct status code for each failure scenario:

| Scenario | Status | Method | ResponseKey |
|---|---|---|---|
| Malformed ID (not a valid GUID) | **400** | `TypedProblems.BadRequest` | `ResponseKeys.MalformedId` |
| Valid GUID but entity not found | **404** | `TypedProblems.NotFound` | `ResponseKeys.NotFound` |

> **Why 400 and not 422?** 422 is reserved for request body/query validation with structured field-level errors (`errors: Dictionary<string, string[]>`). A malformed route parameter is a fundamentally malformed request (400), not a field-level validation error.

**Never** use `BadRequest` for a missing entity — a valid GUID that doesn't match an existing record is not a bad request, it's a missing resource.

## Pattern

### Route constant (`Routes.*.cs`)

```csharp
public const string GetById = "/{entityId}";
public static string GetByIdFn(string entityId) => $"/{entityId}";
```

### Handler

```csharp
public static async Task<Results<
    Ok<MyResult>,
    AppBadRequestHttpResult,
    AppNotFoundHttpResult
>> HandleGetEntityById(
    [FromRoute] string entityId,          // string, not Guid
    [FromServices] IMyService myService,
    CancellationToken cancellationToken
) {
    // 400 — malformed ID
    if (!Guid.TryParse(entityId, out var entityIdGuid)) {
        return TypedProblems.BadRequest(
            "Invalid entity ID",
            ResponseKeys.MalformedId
        );
    }

    var entity = await myService.GetByIdAsync(
        entityIdGuid, cancellationToken
    );

    // 404 — valid ID, entity does not exist
    if (entity is null) {
        return TypedProblems.NotFound(
            "Entity not found",
            ResponseKeys.NotFound
        );
    }

    return TypedResults.Ok(/* ... */);
}
```

### Key points

1. **`[FromRoute] string`** — never `Guid`; ASP.NET model binding failure on `Guid` produces a generic 400, not our RFC 7807 format
2. **`Guid.TryParse` guard → `BadRequest`** — malformed input is a 400 with `ResponseKeys.MalformedId`
3. **Entity not found → `NotFound`** — missing resource is a 404 with `ResponseKeys.NotFound`
4. **Return type union includes both** — `AppBadRequestHttpResult` and `AppNotFoundHttpResult`

## Canonical Example

- `GetAuditLogById.cs` — follows this exact pattern

## Non-GUID Parameters

String parameters like `{token}` in invitation routes (`/invitations/{token}/details`) don't need constraints either. They are validated in handler logic as needed.

## Nested Resource Roots

The same no-constraint rule applies to `{tenantId}` in nested resource root paths:

```csharp
// Unconstrained — tenantId validated by middleware or handler
public const string Root = "/tenants/{tenantId}/users";
```
