# Cursor/Keyset Pagination Guide

> **Backend-normative.** The cursor/keyset contract in this guide — DTOs, service interfaces, query
> shape, handler wiring, and the `sort_id`/`sort_order`/`cursor`/`size` wire names — is current and
> applies to all new work. The one exception is the "Frontend note (Material React Table)" near the
> end: Material React Table belonged to `apps/old-front` (retired 2026-08-22), the retired MUI app. `apps/front` uses its own
> table components — see [`front/conventions.md`](front/conventions.md).

## Table of Contents
- [Overview](#overview)
- [Why Keyset Pagination?](#why-keyset-pagination)
- [Core Concepts](#core-concepts)
- [Implementation Guide](#implementation-guide)
  - [Step 1: Create DTOs](#step-1-create-dtos)
  - [Step 2: Define Service Interface](#step-2-define-service-interface)
  - [Step 3: Implement Service Method](#step-3-implement-service-method)
  - [Step 4: Implement Handler](#step-4-implement-handler)
- [Complete Example](#complete-example)
- [Common Pitfalls](#common-pitfalls)
- [Best Practices](#best-practices)

## Overview

Keyset pagination (also called cursor-based pagination) is a pagination technique that uses a reference point (cursor) from the previous page to fetch the next set of results. Unlike offset-based pagination, it remains performant with large datasets and prevents issues with duplicate or skipped records when data changes between requests.

## Why Keyset Pagination?

### Offset-Based Pagination Problems

```sql
-- Page 1: OFFSET 0 LIMIT 10
SELECT * FROM profiles ORDER BY name LIMIT 10 OFFSET 0;

-- Page 2: OFFSET 10 LIMIT 10
SELECT * FROM profiles ORDER BY name LIMIT 10 OFFSET 10;
-- ❌ Problem: Database must scan and skip 10 rows for every request
-- ❌ Problem: If a record is inserted/deleted, results shift causing duplicates/gaps
-- ❌ Problem: Performance degrades linearly with page number
```

### Keyset Pagination Advantages

```sql
-- Page 1: No cursor
SELECT * FROM profiles ORDER BY name, id LIMIT 10;
-- Returns: Last record has name='Charlie', id=200

-- Page 2: cursor=200
SELECT * FROM profiles
WHERE (name > 'Charlie') OR (name = 'Charlie' AND id > 200)
ORDER BY name, id LIMIT 10;
-- ✅ Benefit: Database uses index efficiently (no skipping)
-- ✅ Benefit: Consistent results even if data changes
-- ✅ Benefit: O(1) performance regardless of page depth
```

## Core Concepts

### 1. The Cursor

The cursor is always an **entity ID** (Guid in our case), even when sorting by other fields. It represents the position in the dataset from which to continue.

```csharp
// First page request
GET /api/staff/profiles?limit=10
// Response includes: NextCursor = "018c-UUID-here"

// Second page request
GET /api/staff/profiles?limit=10&cursor=018c-UUID-here
// Continue from where we left off
```

### 2. Composite Sorting with Tie-Breakers

When sorting by non-unique fields (like `name`, `created_at`, or `user_account_count`), we **must** include `Id` as a tie-breaker to ensure deterministic ordering.

```sql
-- ❌ Wrong: No tie-breaker (non-deterministic)
ORDER BY name

-- ✅ Correct: Tie-breaker ensures consistent ordering
ORDER BY name ASC, id ASC
```

**Critical Rule**: The tie-breaker direction **must match** the primary sort direction for keyset pagination to work correctly.

```sql
-- ✅ Correct
ORDER BY name ASC, id ASC
ORDER BY name DESC, id DESC

-- ❌ Wrong: Mismatched directions break pagination
ORDER BY name ASC, id DESC
```

### 3. Keyset Filter Logic

For fields with tie-breakers, the WHERE clause must handle both the field value and the tie-breaker:

```sql
-- Ascending: Get records AFTER cursor position
WHERE (name > 'Charlie') OR (name = 'Charlie' AND id > cursorId)

-- Descending: Get records BEFORE cursor position
WHERE (name < 'Charlie') OR (name = 'Charlie' AND id < cursorId)
```

### 4. Fetching Extra Records

Always fetch `limit + 1` records to determine if there are more pages:

```csharp
var results = await query.Take(effectiveLimit + 1).ToListAsync();

if (results.Count > effectiveLimit) {
    // More pages exist
    results.RemoveAt(results.Count - 1);  // Remove the extra
    nextCursor = results.Last().Id.ToString();
} else {
    // Last page
    nextCursor = null;
}
```

### 5. ~~Total Count for Better UX~~ (REMOVED)

**Note**: The `TotalCount` feature has been removed from cursor pagination.

**Reason**: Total count defeats the purpose of cursor pagination:
- ❌ `COUNT(*)` queries are expensive on large datasets
- ❌ Total count becomes stale as data changes
- ❌ Not needed for Previous/Next navigation
- ❌ Misleading for infinite scroll UX patterns

**Solution**: Use cursor pagination without total count. The table UI shows only "Previous" and "Next" buttons without displaying "X of Y" indicators.

```csharp
// ✅ Simplified: No COUNT query
return new FindEntitiesResult.Success(
    new CursorPaginatedResult<EntityItem> {
        Data = results,
        NextCursor = nextCursor,  // null = last page
    }
);
```

**Performance Impact**: Removes COUNT query overhead, making pagination faster for large datasets.

### 6. ~~Current Offset for Accurate Page Numbers~~ (REMOVED)

**Note**: The `CurrentOffset` feature has been removed. Cursor pagination should use **Previous/Next navigation only** - not page numbers.

**Reason**: Cursor pagination is fundamentally incompatible with numbered page navigation:
- ✅ Supports: Previous (reset to first page), Next (sequential forward)
- ❌ Does not support: Jump to arbitrary page numbers

**UI Pattern**: Display only Previous/Next buttons, hide page numbers:
```typescript
muiPaginationProps: {
  showFirstButton: false,
  showLastButton: false,
  siblingCount: 0,       // Hide page numbers
  boundaryCount: 0,      // Hide boundary numbers
}
```

The simplified approach removes ~50-200ms overhead per request and aligns with cursor pagination best practices.

## Implementation Guide

### Step 1: Create DTOs

Create a DTO for the projected data and use the built-in `CursorPaginatedResult<T>`:

```csharp
// In your service file (e.g., ProfileAsStaffService.cs)
public class StaffProfileItem {
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int UserAccountCount { get; set; }
}

// CursorPaginatedResult is already defined in Lib/CursorPaginatedResult.cs
// public class CursorPaginatedResult<T> {
//     public List<T> Data { get; set; } = [];
//     public string? NextCursor { get; set; } = null;
// }
```

### Step 2: Define Service Interface

Create a discriminated union for the result type to handle errors. Keep C#
property names idiomatic, but expose multi-word query params on the wire in
snake_case via `[FromQuery(Name = "...")]`.

```csharp
/// <summary>
/// Discriminated union representing the result of finding entities.
/// </summary>
public abstract record FindEntitiesResult {
    /// <summary>
    /// Successful result containing the paginated entities.
    /// </summary>
    public sealed record Success(CursorPaginatedResult<EntityItem> Data) : FindEntitiesResult;

    /// <summary>
    /// Error result when the cursor record was not found (deleted or invalid).
    /// </summary>
    public sealed record CursorNotFound(string Cursor) : FindEntitiesResult;

    /// <summary>
    /// Error result when the sort_id value is not supported.
    /// </summary>
    public sealed record InvalidSortId(string SortId) : FindEntitiesResult;
}

public interface IYourService {
    Task<FindEntitiesResult> FindEntitiesAsync(
        Guid cursor,
        int? limit = null,
        string? sortId = null,
        SortOrder? sortOrder = null,
        CancellationToken cancellationToken = default
    );
}
```

### Step 3: Implement Service Method

Implement the service method following this structure:

```csharp
public async Task<FindEntitiesResult> FindEntitiesAsync(
    Guid cursor,
    int? limit = null,
    string? sortId = null,
    SortOrder? sortOrder = null,
    CancellationToken cancellationToken = default
) {
    var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;
    var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
    var effectiveSortId = sortId ?? "id";

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3.1: Define Sort Field Handlers
    // ═══════════════════════════════════════════════════════════════════════
    var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<YourEntity>>(
        StringComparer.OrdinalIgnoreCase
    ) {
        // Handler for Id sorting (simple case)
        ["id"] = new CursorSortFieldHandler<YourEntity>(
            getCursorValue: async (guid) => {
                var entity = await _dbContext.YourEntity
                    .AsNoTracking()
                    .Where(e => e.Id == guid)
                    .Select(e => new { e.Id })
                    .FirstOrDefaultAsync();
                return entity?.Id;
            },
            applyFilter: (q, cursorValue, isAsc) => {
                var cursorGuid = (Guid?)cursorValue;
                if (cursorGuid is null) return q;
                return isAsc
                    ? q.Where(e => e.Id > cursorGuid)
                    : q.Where(e => e.Id < cursorGuid);
            },
            applyOrdering: (q, isAsc) => isAsc
                ? q.OrderBy(e => e.Id)
                : q.OrderByDescending(e => e.Id)
        ),

        // Handler for Name sorting (with tie-breaker)
        ["name"] = new CursorSortFieldHandler<YourEntity>(
            getCursorValue: async (guid) => {
                var entity = await _dbContext.YourEntity
                    .AsNoTracking()
                    .Where(e => e.Id == guid)
                    .Select(e => new { e.Name, e.Id })
                    .FirstOrDefaultAsync();
                return entity is not null ? (entity.Name, entity.Id) : null;
            },
            applyFilter: (q, cursorValue, isAsc) => {
                if (cursorValue is null) return q;
                var (cursorName, cursorId) = ((string, Guid?))cursorValue;
                return isAsc
                    ? q.Where(e => e.Name.CompareTo(cursorName) > 0 || (e.Name == cursorName && e.Id > cursorId))
                    : q.Where(e => e.Name.CompareTo(cursorName) < 0 || (e.Name == cursorName && e.Id < cursorId));
            },
            applyOrdering: (q, isAsc) => isAsc
                ? q.OrderBy(e => e.Name).ThenBy(e => e.Id)
                : q.OrderByDescending(e => e.Name).ThenByDescending(e => e.Id)
        ),

        // Handler for CreatedAt sorting (with tie-breaker)
        ["created_at"] = new CursorSortFieldHandler<YourEntity>(
            getCursorValue: async (guid) => {
                var entity = await _dbContext.YourEntity
                    .AsNoTracking()
                    .Where(e => e.Id == guid)
                    .Select(e => new { e.CreatedAt, e.Id })
                    .FirstOrDefaultAsync();
                return entity is not null ? (entity.CreatedAt, entity.Id) : null;
            },
            applyFilter: (q, cursorValue, isAsc) => {
                if (cursorValue is null) return q;
                var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
                return isAsc
                    ? q.Where(e => e.CreatedAt > cursorCreatedAt || (e.CreatedAt == cursorCreatedAt && e.Id > cursorId))
                    : q.Where(e => e.CreatedAt < cursorCreatedAt || (e.CreatedAt == cursorCreatedAt && e.Id < cursorId));
            },
            applyOrdering: (q, isAsc) => isAsc
                ? q.OrderBy(e => e.CreatedAt).ThenBy(e => e.Id)
                : q.OrderByDescending(e => e.CreatedAt).ThenByDescending(e => e.Id)
        ),

        // Handler for computed fields (with tie-breaker)
        ["related_count"] = new CursorSortFieldHandler<YourEntity>(
            getCursorValue: async (guid) => {
                var entity = await _dbContext.YourEntity
                    .AsNoTracking()
                    .Where(e => e.Id == guid)
                    .Select(e => new { Count = e.RelatedEntities.Count, e.Id })
                    .FirstOrDefaultAsync();
                return entity is not null ? (entity.Count, entity.Id) : null;
            },
            applyFilter: (q, cursorValue, isAsc) => {
                if (cursorValue is null) return q;
                var (cursorCount, cursorId) = ((int, Guid?))cursorValue;
                return isAsc
                    ? q.Where(e => e.RelatedEntities.Count > cursorCount || (e.RelatedEntities.Count == cursorCount && e.Id > cursorId))
                    : q.Where(e => e.RelatedEntities.Count < cursorCount || (e.RelatedEntities.Count == cursorCount && e.Id < cursorId));
            },
            applyOrdering: (q, isAsc) => isAsc
                ? q.OrderBy(e => e.RelatedEntities.Count).ThenBy(e => e.Id)
                : q.OrderByDescending(e => e.RelatedEntities.Count).ThenByDescending(e => e.Id)
        )
    };

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3.2: Validate sort_id Parameter
    // ═══════════════════════════════════════════════════════════════════════
    if (!sortFieldHandlers.ContainsKey(effectiveSortId)) {
        return new FindEntitiesResult.InvalidSortId(effectiveSortId);
    }

    var handler = sortFieldHandlers[effectiveSortId];

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3.3: Build Base Query
    // ═══════════════════════════════════════════════════════════════════════
    var query = _dbContext.YourEntity
        .AsNoTracking()
        .Where(e => e.Id != null);  // Add your filters here

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3.4: Apply Cursor-Based Filter
    // ═══════════════════════════════════════════════════════════════════════
    if (cursor != Guid.Empty) {
        var cursorValue = await handler.GetCursorValue(cursor);

        if (cursorValue is null) {
            return new FindEntitiesResult.CursorNotFound(cursor.ToString());
        }

        query = handler.ApplyFilter(query, cursorValue, effectiveSortOrder == SortOrder.Asc);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3.5: Apply Ordering
    // ═══════════════════════════════════════════════════════════════════════
    var orderedQuery = handler.ApplyOrdering(query, effectiveSortOrder == SortOrder.Asc);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3.6: Project and Fetch Results
    // ═══════════════════════════════════════════════════════════════════════
    var results = await orderedQuery
        .Select(e => new EntityItem {
            Id = e.Id!.Value,
            Name = e.Name,
            // ... other fields
        })
        .Take(effectiveLimit + 1)  // Fetch one extra to detect more pages
        .ToListAsync(cancellationToken);

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 3.7: Determine Pagination State
    // ═══════════════════════════════════════════════════════════════════════
    string? nextCursor = null;
    if (results.Count > effectiveLimit) {
        results.RemoveAt(results.Count - 1);
        nextCursor = results.Last().Id.ToString();
    }

    return new FindEntitiesResult.Success(
        new CursorPaginatedResult<EntityItem> {
            Data = results,
            NextCursor = nextCursor
        }
    );
}

// CursorSortFieldHandler<TEntity> lives in PublyApp.Api.Lib.
// Do not define a private SortFieldHandler helper in each service.
```

`CursorSortFieldHandler<TEntity>` intentionally has no `getOffset` delegate.
Cursor pagination in this codebase does not calculate `CurrentOffset` or expose
page numbers today; it only returns `NextCursor`. Future cursor UX work that
needs `total_count` or visible range text, such as issue #282, should add an
explicit pagination metadata contract instead of reusing the stale `getOffset`
helper shape.

### Step 4: Implement Handler

Create the endpoint handler with proper error handling:

```csharp
// In your handler file (e.g., Handlers/FindEntities.cs)
using PublyApp.Api.Localization;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace PublyApp.Api.Modules.YourFeature.Handlers;

public class FindEntitiesResult : CursorPaginatedResult<EntityItem> { }

public class FindEntitiesQuery : CursorPaginatedQuery {
    [FromQuery(Name = "sort_id")]
    public string? SortId { get; init; }

    [FromQuery(Name = "sort_order")]
    public string? SortOrder { get; init; }
}

public class FindEntitiesQueryValidator : CursorPaginatedQueryValidator<FindEntitiesQuery> { }

public class FindEntities {
    public static async Task<Results<Ok<FindEntitiesResult>, AppBadRequestHttpResult>> HandleFindEntities(
        [AsParameters] FindEntitiesQuery findEntitiesQuery,
        [FromServices] IYourService yourService,
        CancellationToken cancellationToken
    ) {
        // ───────────────────────────────────────────────────────────────────
        // STEP 4.1: Parse and Validate Cursor
        // ───────────────────────────────────────────────────────────────────
        var cursor = findEntitiesQuery.GetCursor();
        var cursorGuid = Guid.Empty;

        // Support initial page request (null/empty cursor defaults to Guid.Empty)
        if (!string.IsNullOrEmpty(cursor)) {
            if (!Guid.TryParse(cursor, out cursorGuid)) {
                return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
            }
        }

        // ───────────────────────────────────────────────────────────────────
        // STEP 4.2: Extract Query Parameters
        // ───────────────────────────────────────────────────────────────────
        var limit = findEntitiesQuery.GetLimit();
        var sortId = findEntitiesQuery.GetSortId();
        var sortOrder = findEntitiesQuery.GetSortOrder();

        // ───────────────────────────────────────────────────────────────────
        // STEP 4.3: Call Service
        // ───────────────────────────────────────────────────────────────────
        var serviceResult = await yourService.FindEntitiesAsync(
            cursor: cursorGuid,
            limit: limit,
            sortId: sortId,
            sortOrder: sortOrder,
            cancellationToken: cancellationToken
        );

        // ───────────────────────────────────────────────────────────────────
        // STEP 4.4: Handle Result with Pattern Matching
        // ───────────────────────────────────────────────────────────────────
        if (serviceResult is YourFeature.FindEntitiesResult.CursorNotFound cursorError) {
            return TypedProblems.BadRequest(
                $"Cursor record not found: {cursorError.Cursor}. The record may have been deleted or the cursor is invalid.",
                ResponseKeys.BadRequest
            );
        }

        if (serviceResult is YourFeature.FindEntitiesResult.InvalidSortId sortIdError) {
            return TypedProblems.BadRequest(
                $"Invalid sort_id: {sortIdError.SortId}. Allowed values: id, name, created_at, related_count",
                ResponseKeys.BadRequest
            );
        }

        if (serviceResult is YourFeature.FindEntitiesResult.Success success) {
            return TypedResults.Ok(new FindEntitiesResult {
                Data = success.Data.Data,
                NextCursor = success.Data.NextCursor,
            });
        }

        throw new InvalidOperationException("Unhandled result type");
    }
}
```

## Complete Example

For a complete, working example, see:
- Service: `apps/api/Modules/Profiles/Services/ProfileAsStaffService.cs`
- Handler: `apps/api/Modules/Profiles/Handlers/Staff/FindStaffProfiles.cs`

## Common Pitfalls

### 1. Mismatched Tie-Breaker Direction

```csharp
// ❌ WRONG: Tie-breaker direction doesn't match primary sort
applyOrdering: (q, isAsc) => isAsc
    ? q.OrderBy(e => e.Name).ThenByDescending(e => e.Id)  // Descending Id!
    : q.OrderByDescending(e => e.Name).ThenBy(e => e.Id)   // Ascending Id!

// ✅ CORRECT: Both directions match
applyOrdering: (q, isAsc) => isAsc
    ? q.OrderBy(e => e.Name).ThenBy(e => e.Id)
    : q.OrderByDescending(e => e.Name).ThenByDescending(e => e.Id)
```

### 2. Forgetting Tie-Breaker in Filter

```csharp
// ❌ WRONG: Only comparing the field, not the Id tie-breaker
applyFilter: (q, cursorValue, isAsc) => {
    var (cursorName, _) = ((string, Guid?))cursorValue;
    return isAsc
        ? q.Where(e => e.Name.CompareTo(cursorName) > 0)  // Missing Id check!
        : q.Where(e => e.Name.CompareTo(cursorName) < 0);
}

// ✅ CORRECT: Includes OR clause with Id comparison
applyFilter: (q, cursorValue, isAsc) => {
    var (cursorName, cursorId) = ((string, Guid?))cursorValue;
    return isAsc
        ? q.Where(e => e.Name.CompareTo(cursorName) > 0 || (e.Name == cursorName && e.Id > cursorId))
        : q.Where(e => e.Name.CompareTo(cursorName) < 0 || (e.Name == cursorName && e.Id < cursorId));
}
```

### 3. Not Fetching Cursor Value for Non-Id Sorts

```csharp
// ❌ WRONG: Not looking up the field value for cursor
if (cursor != Guid.Empty) {
    query = query.Where(e => e.Id > cursor);  // Only works for Id sorting!
}

// ✅ CORRECT: Look up the cursor field value first
if (cursor != Guid.Empty) {
    var cursorValue = await handler.GetCursorValue(cursor);
    if (cursorValue is null) {
        return new FindEntitiesResult.CursorNotFound(cursor.ToString());
    }
    query = handler.ApplyFilter(query, cursorValue, isAsc);
}
```

### 4. Not Validating Cursor Exists

```csharp
// ❌ WRONG: Silently continues if cursor not found
var cursorValue = await handler.GetCursorValue(cursor);
query = handler.ApplyFilter(query, cursorValue, isAsc);  // Might apply null value!

// ✅ CORRECT: Return error if cursor not found
var cursorValue = await handler.GetCursorValue(cursor);
if (cursorValue is null) {
    return new FindEntitiesResult.CursorNotFound(cursor.ToString());
}
query = handler.ApplyFilter(query, cursorValue, isAsc);
```

### 5. Forgetting to Remove Extra Record

```csharp
// ❌ WRONG: Returning limit+1 records to client
var results = await query.Take(effectiveLimit + 1).ToListAsync();
nextCursor = results.Count > effectiveLimit ? results.Last().Id.ToString() : null;
return results;  // Oops! Returning 11 records when limit was 10

// ✅ CORRECT: Remove the extra record before returning
var results = await query.Take(effectiveLimit + 1).ToListAsync();
string? nextCursor = null;
if (results.Count > effectiveLimit) {
    results.RemoveAt(results.Count - 1);  // Remove the extra
    nextCursor = results.Last().Id.ToString();
}
return results;  // Correctly returns 10 records
```

## Best Practices

### 0. Keep `sort_id` Stable Across Frontend and Backend

Cursor pagination requires deterministic ordering. In this codebase, list pages
use **snake_case** `sort_id` values on the wire (e.g., `created_at`,
`updated_at`, `name`).

**Frontend note (Material React Table):** MRT emits sorting IDs from column `id`.
If the backend expects snake_case sort IDs, the table columns must explicitly set
snake_case IDs:

```ts
columnHelper.accessor('createdAt', { id: 'created_at', header: 'Created at' });
columnHelper.accessor('updatedAt', { id: 'updated_at', header: 'Updated at' });
columnHelper.accessor('name', { id: 'name', header: 'Name' });
```

If a visible column is not supported by backend sorting, set `enableSorting: false`
to prevent sending invalid `sort_id` values.

### 1. Always Use Discriminated Unions for Results

Instead of throwing exceptions or returning null, use discriminated unions to represent all possible outcomes:

```csharp
public abstract record FindEntitiesResult {
    public sealed record Success(CursorPaginatedResult<EntityItem> Data) : FindEntitiesResult;
    public sealed record CursorNotFound(string Cursor) : FindEntitiesResult;
    public sealed record InvalidSortId(string SortId) : FindEntitiesResult;
}
```

### 2. Use `AsNoTracking()` for Read-Only Cursor Queries

Cursor-paginated list methods are read-only. Add `AsNoTracking()` to the base
result query and to each `GetCursorValue` lookup query so EF Core does not track
entities that will never be updated. Apply the same rule to secondary metadata
queries used only to hydrate list DTOs.

### 3. Project to DTOs at the Database Level

```csharp
// ✅ GOOD: Projection happens in the database
var results = await query
    .Select(e => new EntityItem {
        Id = e.Id!.Value,
        Name = e.Name,
        Count = e.RelatedEntities.Count
    })
    .Take(limit)
    .ToListAsync();

// ❌ BAD: Loading full entities then projecting in memory
var entities = await query.Take(limit).ToListAsync();
var results = entities.Select(e => new EntityItem { ... }).ToList();
```

### 4. Document Sort Field Allowed Values

In error messages and documentation, clearly state which sort fields are supported:

```csharp
return TypedProblems.BadRequest(
    $"Invalid sort_id: {sortIdError.SortId}. Allowed values: id, name, created_at, user_account_count",
    ResponseKeys.BadRequest
);
```

### 5. Use Meaningful Default Sort

Choose a default sort that makes sense for your domain:

```csharp
var effectiveSortId = sortId ?? "created_at";  // Most recent first
```

Validate the value against a case-sensitive snake_case allowlist, or normalize it
through an explicit parser/dictionary built with
`StringComparer.OrdinalIgnoreCase`. Do not use `ToLowerInvariant()` for dispatch.

### 6. Consider Database Indexes

For optimal performance, create indexes that match your sort patterns:

```sql
-- For sorting by name with Id tie-breaker
CREATE INDEX idx_profiles_name_id ON profiles(name, id);

-- For sorting by created_at with Id tie-breaker
CREATE INDEX idx_profiles_created_at_id ON profiles(created_at, id);
```

### 7. Validate `sort_id` Early

Validate the wire `sort_id` parameter before doing any database work:

```csharp
if (!sortFieldHandlers.ContainsKey(effectiveSortId)) {
    return new FindEntitiesResult.InvalidSortId(effectiveSortId);
}
```

### 8. Make Cursor Optional in First Request

Allow `cursor` to be `null` or `Guid.Empty` for the first page:

```csharp
var cursorGuid = Guid.Empty;
if (!string.IsNullOrEmpty(cursor)) {
    if (!Guid.TryParse(cursor, out cursorGuid)) {
        return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
    }
}
```

---

## Quick Reference Checklist

When implementing cursor pagination:

- [ ] Created DTO with all required fields including `Id`
- [ ] Defined discriminated union result type with `Success`, `CursorNotFound`, and `InvalidSortId`
- [ ] Implemented `CursorSortFieldHandler<TEntity>` entries for each sortable field
- [ ] For non-Id sorts: included tie-breaker in `getCursorValue` (returns tuple)
- [ ] For non-Id sorts: included tie-breaker in `applyFilter` (OR clause with Id comparison)
- [ ] For non-Id sorts: included tie-breaker in `applyOrdering` (ThenBy/ThenByDescending)
- [ ] Tie-breaker direction matches primary sort direction
- [ ] Validated `sort_id` parameter against allowed values
- [ ] Added `AsNoTracking()` to read-only cursor lookup queries
- [ ] Added `AsNoTracking()` to the read-only base result query
- [ ] Added `AsNoTracking()` to secondary read-only metadata queries
- [ ] Handled `cursor == Guid.Empty` for first page
- [ ] Validated cursor exists before applying filter
- [ ] Fetched `limit + 1` records to detect more pages
- [ ] Removed extra record before returning results
- [ ] Set `nextCursor` correctly (null for last page, Id.ToString() otherwise)
- [ ] Projected to DTO at database level (in Select clause)
- [ ] Handler uses pattern matching for discriminated union results
- [ ] Error messages are clear and actionable

---

For questions or improvements to this guide, please update this document or discuss with the team.
