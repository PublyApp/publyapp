# OpenAPI & Kiota Client Generation Safeguards

> Extracted from `AGENTS.md` — safeguards for the TypeScript API client auto-generated from the .NET OpenAPI spec using Microsoft Kiota.

**CRITICAL:** Several .NET patterns directly affect TypeScript type generation.

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
// apps/api/Src/Lib/ServiceRegistration.cs
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

**Rule:** If you see TypeScript types like `count?: number | UntypedNode` in response DTOs, check that the schema transformer is present and that `OpenApiGenerateDocuments` is `true` in `MainApi.csproj`.

## Client Regeneration Workflow

**After ANY changes to .NET DTOs or endpoints:**

```bash
# 1. Build API to regenerate OpenAPI spec (apps/api/openapi/MainApi.json)
make build-api

# 2. Update TypeScript client from new OpenAPI spec
make update-client

# 3. Run TypeScript check to verify no type errors
make tsc-front
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

**For response data with potential UntypedNode unions:**

```typescript
import { getUntypedNumber } from '@/front/lib/js-client/kiota-utils';

// ✅ CORRECT - Use utility to safely extract number
const count = getUntypedNumber(response.count, 0);

// ❌ WRONG - Assumes response.count is always number
const count = response.count;  // Could be number | UntypedNode
```

**Utility functions in `apps/front/app/lib/js-client/kiota-utils.ts`:**
- `getUntypedNumber(value, defaultValue)` - Safely extract number from `number | UntypedNode`
- `getUntypedString(value, defaultValue)` - Safely extract string from `string | UntypedNode`
- `getUntypedArray(value)` - Safely extract array from `T[] | UntypedNode`
- `getUntypedValue(value)` - Generic extraction for any type
