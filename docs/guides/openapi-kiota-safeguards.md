# OpenAPI & Kiota Client Generation Safeguards

> **MIXED GUIDE — read the split before you follow anything.**
> **Normative:** the .NET/OpenAPI/Kiota contract safeguards, the client-regeneration workflow, and
> the front request-body patterns using Kiota's `createUntyped*` factories.
> **Not normative:** any response-extraction helper or path from `apps/old-front`, the retired MUI +
> React Router v7 app. It is not deployed, and the owner will not edit it again. Use the generated
> types in `apps/front`; if a response union remains after fixing the OpenAPI schema, treat a new
> front adapter as its own deliberate change rather than copying the retired utility.

> Extracted from `AGENTS.md` — safeguards for the TypeScript API client auto-generated from the .NET OpenAPI spec using Microsoft Kiota.

**CRITICAL:** Several .NET patterns directly affect TypeScript type generation.

> Note: canonical examples below are identified by symbol name. Avoid depending
> on exact line numbers because handler files move frequently during
> vertical-slice refactors.

**Key rules (always apply):**
- Never use `List<T>?` or a custom static `BindAsync(HttpContext)` on an `[AsParameters]` query DTO — it silently drops all query-parameter metadata from the OpenAPI doc and breaks the Kiota TypeScript client. For multi-value filters, use a CSV-encoded `string?` with a parser method (see [`validator-conventions.md` Rule 8](validator-conventions.md#rule-8-csv-enum-list-filters-multi-select-query-params); canonical examples: `FindTenantUsersAsStaffQuery.Status` at `apps/api/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:36` and `FindAuditLogsQuery.Actions` at `apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs:20`).

## JsonElement Nullability and Kiota Types

**The nullability of `JsonElement` properties directly affects generated TypeScript types:**

```csharp
// NON-nullable JsonElement → generates UntypedNode in TypeScript
public class PasswordLoginBody {
    public JsonElement Email { get; set; }     // → email?: UntypedNode | null
    public JsonElement Password { get; set; }  // → password?: UntypedNode | null
}

// NULLABLE JsonElement? → generates complex union type requiring type casts
public record CreateStaffProfileBody {
    public JsonElement? Name { get; init; }    // → name?: CreateStaffProfileBody_nameMember1 | JsonElement | null
}
```

**Rule:** For REQUIRED fields, use non-nullable `JsonElement` (not `JsonElement?`). This generates cleaner `UntypedNode` types in TypeScript without requiring type assertions.

```csharp
// ✅ CORRECT - Required field uses non-nullable JsonElement
public record CreateUserBody {
    public JsonElement Email { get; init; }     // Required - use non-nullable
    public JsonElement Password { get; init; }  // Required - use non-nullable
    public JsonElement? Bio { get; init; }      // Optional - nullable is fine
}

// ❌ WRONG - Required field uses nullable JsonElement?
public record CreateUserBody {
    public JsonElement? Email { get; init; }    // Generates complex union type!
}
```

## Generic Types and XML Comments (.NET 10 Bug)

**CRITICAL:** .NET 10's OpenAPI source generator has a bug that causes duplicate key errors when processing XML comments on generic types.

```csharp
// ❌ WRONG - XML comments on generic type cause OpenAPI generation failure
/// <summary>
/// Paginated result wrapper.
/// </summary>
public class CursorPaginatedResult<T> {
    /// <summary>
    /// The data items.
    /// </summary>
    public List<T> Data { get; set; } = [];
}

// ✅ CORRECT - Remove XML comments from generic types
// Note: XML comments removed to work around .NET 10 OpenAPI source generator bug
// See: https://github.com/dotnet/aspnetcore/issues/63233
#pragma warning disable CS1591
public class CursorPaginatedResult<T> {
    public List<T> Data { get; set; } = [];
    public string? NextCursor { get; set; } = null;
}
#pragma warning restore CS1591
```

**Rule:** Never add XML documentation comments to generic types (`<T>`) in the API project. The .NET 10 OpenAPI source generator will fail with "duplicate key" errors.

## Integer Type Schema Transformer

**Problem:** .NET 10 OpenAPI generation can produce `["integer", "string"]` union types instead of just `"integer"` for `int` properties. This causes Kiota to generate `UntypedNode` types instead of proper `number` types.

**Solution:** A schema transformer in `ServiceRegistration.cs` fixes this at OpenAPI generation time:

```csharp
// apps/api/Lib/ServiceRegistration.cs
builder.Services.AddOpenApi(options => {
    options.AddSchemaTransformer((schema, context, cancellationToken) => {
        if (schema.Type.HasValue) {
            var schemaType = schema.Type.Value;
            // Fix integer+string unions → just integer
            if (schemaType.HasFlag(JsonSchemaType.Integer) && schemaType.HasFlag(JsonSchemaType.String)) {
                schema.Type = JsonSchemaType.Integer;
            }
            // Fix number+string unions → just number
            else if (schemaType.HasFlag(JsonSchemaType.Number) && schemaType.HasFlag(JsonSchemaType.String)) {
                schema.Type = JsonSchemaType.Number;
            }
        }
        return Task.CompletedTask;
    });
});
```

**Rule:** If you see TypeScript types like `count?: number | UntypedNode` in response DTOs, check that the schema transformer is present and that `OpenApiGenerateDocuments` is `true` in `PublyApp.Api.csproj`.

## Deterministic OpenAPI Output

**Problem:** ASP.NET's generated operation `parameters` order can drift across
SDK/tooling environments when minimal-API endpoints combine route parameters
with `[AsParameters]` query DTOs. XML-comment descriptions can also preserve
environment-specific CRLF newlines.

**Solution:** `OpenApiDocumentNormalizer` is registered as an OpenAPI document
transformer in `ServiceRegistration.cs`. It emits parameters in canonical order
(`path`, `query`, `header`, `cookie`, then name order, with route-template order
for path parameters) and normalizes description newlines to LF before
`apps/api/openapi.json` is written.

**Rule:** Do not manually reorder `apps/api/openapi.json` parameter arrays.
Change the transformer and the `OpenApiContractSpec` guard instead, then run
`just build-api && just generate-client`.

## Query DTO Multi-Value Filters

**Problem:** On an `[AsParameters]` query DTO, a `List<T>?` multi-value filter plus a custom static `BindAsync(HttpContext)` causes ASP.NET's OpenAPI generator to omit every query parameter. Kiota then generates a URI template without query placeholders, so frontend `queryParameters` are dropped before the request leaves the browser.

```csharp
// WRONG - List<T>? forces a custom binder and removes query metadata
public class FindAuditLogsQuery : CursorPaginatedQuery {
    [FromQuery(Name = "values")]
    public List<string>? Values { get; set; }

    public static ValueTask<FindAuditLogsQuery?> BindAsync(HttpContext context) {
        // Custom query parsing...
    }
}
```

Keep the query DTO primitive and parse the CSV value in a getter instead:

```csharp
// CORRECT - primitive query property, parsed after binding
public class FindAuditLogsQuery : CursorPaginatedQuery {
    [FromQuery(Name = "actions")]
    public string? Actions { get; set; }

    public IReadOnlyList<string>? GetActionsList() {
        return AuditLogActionsCsv.Parse(Actions);
    }
}
```

**Rule:** For multi-value query filters on `[AsParameters]` DTOs, use the CSV `string?` pattern from [`validator-conventions.md` Rule 8](validator-conventions.md#rule-8-csv-enum-list-filters-multi-select-query-params). Canonical examples: `FindTenantUsersAsStaffQuery.Status` at `apps/api/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:36` and `GetStatusesOrNull()` at `apps/api/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:47`; `FindAuditLogsQuery.Actions` at `apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs:20` and `GetActionsList()` at `apps/api/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs:30`; `ExportAuditLogsQuery.Actions` at `apps/api/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs:19` and `GetActionsList()` at `apps/api/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs:29`.

## Client Regeneration Workflow

**After ANY changes to .NET DTOs or endpoints:**

```bash
# 1. Build API to regenerate OpenAPI spec (apps/api/openapi.json)
just build-api

# 2. Update TypeScript client from new OpenAPI spec
just generate-client

# 3. Run TypeScript check to verify no type errors
pnpm --filter front typecheck
```

**Common issues after regeneration:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| `UntypedNode` in response types | Integer schema is `["integer", "string"]` | Verify schema transformer is present |
| Complex union types in request bodies | Using `JsonElement?` (nullable) | Use `JsonElement` (non-nullable) for required fields |
| Build fails with "duplicate key" | XML comments on generic type | Remove XML comments from generic types |
| Type casts needed (`as typeof body.name`) | Nullable `JsonElement?` property | Use non-nullable `JsonElement` or accept the cast |

## TypeScript Patterns for Kiota Client

**For request bodies with UntypedNode fields:**

```typescript
import { createUntypedString, createUntypedArray } from '@microsoft/kiota-abstractions';

// ✅ CORRECT - Use Kiota factory functions
const body: CreateUserBody = {
    email: createUntypedString(data.email),
    password: createUntypedString(data.password),
};

// ❌ WRONG - Old pattern that no longer works
const body: CreateUserBody = {
    email: { getValue() { return data.email; } },  // May not match expected type
};
```

**For response data with potential `UntypedNode` unions:**

First fix the OpenAPI schema when the union is a generator artifact; the integer schema transformer
above is the canonical example. `apps/front` has no shared `getUntypedNumber`,
`getUntypedString`, `getUntypedArray`, or `getUntypedValue` utility. Do not copy the similarly named
helper from `apps/old-front` (retired 2026-08-22). If the corrected contract genuinely still needs an adapter,
add and test a front-local seam as a focused change.
