# Phase 3 Implementation Plan: Tenant List Page Improvements (REVISED v9)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add search, filters, and bulk actions to the staff tenant list page using cursor pagination

**Architecture:** Cursor-based pagination with search/filter, EF.Functions.ILike for search, URL-persisted filters via nuqs.

**Tech Stack:** .NET 10, React 19, Material React Table, TanStack Query, nuqs, FluentValidation, PostgreSQL

---

## CRITICAL: Key Decisions (LOCKED)

| Decision | Value |
|----------|-------|
| SortId format | snake_case (`created_at`, `updated_at`, `name`, `status`) sent from frontend |
| URL keys | `sort_id`, `sort_order`, `size` (via nuqs) |
| API params | `sortId`, `sortOrder`, `limit`, `cursor` |
| Cursor parsing | `Guid cursorGuid = Guid.Empty`, pass non-nullable `Guid` to service |
| Type names | `FindTenantsAsStaffResponse` + `FindTenantsAsStaffServiceResult` |
| LINQ style | Query-syntax for DB queries |

---

## API Contract

### Query Parameters

```
GET /staff/tenants?cursor={guid?}&limit={n}&sortId={field}&sortOrder={asc|desc}&q={search?}&status={csv?}
```

| Param | API Binding | Notes |
|-------|-------------|-------|
| `cursor` | `cursor` | Parsed as Guid, empty = first page |
| `limit` | `limit` | Page size |
| `sortId` | `sortId` | snake_case: `created_at`, `updated_at`, `name`, `status` |
| `sortOrder` | `sortOrder` | `asc` or `desc` |
| `q` | `[FromQuery(Name="q")] string? Search` | Search term |
| `status` | `status` | Comma-separated |

### Response Shape

```csharp
// Simple inheritance - CursorPaginatedResult<T> already has Data + NextCursor
public class FindTenantsAsStaffResponse : CursorPaginatedResult<TenantAsStaffListItem> { }
```

### Filter Combination Rules

- **AND logic**: search AND status
- **Empty search**: Ignore filter
- **Empty status**: Return all
- **Cursor reset**: Call `resetCursorPagination()` on filter change

### Allowed Sort Fields

- `created_at` (default)
- `updated_at`
- `name`
- `status`

Invalid sortId → 400 BadRequest (lists: created_at, updated_at, name, status)

---

## IMPLEMENTATION TASKS

### Task 1: Update Backend Query DTO

**Files:**
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`

**Step 1: Query DTO**

```csharp
public class FindTenantsAsStaffQuery : CursorPaginatedQuery {
    [FromQuery(Name = "q")] public string? Search { get; set; }
    [FromQuery] public string? Status { get; set; }

    public string? GetSearchNormalized() {
        if (Search is null) return null;
        var trimmed = Search.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }

    public IReadOnlySet<TenantStatus>? GetStatusesOrNull() {
        if (Status is null) return null;

        var trimmed = Status.Trim();
        if (trimmed.Length == 0) return null;

        var parts = trimmed
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length == 0) return null;

        var statuses = new HashSet<TenantStatus>();
        foreach (var part in parts) {
            var parsed = part.ToLowerInvariant() switch {
                "pending" => (TenantStatus?)TenantStatus.Pending,
                "active" => (TenantStatus?)TenantStatus.Active,
                "suspended" => (TenantStatus?)TenantStatus.Suspended,
                "archived" => (TenantStatus?)TenantStatus.Archived,
                _ => null,  // Skip invalid - validator should have already filtered these
            };
            if (parsed is { } status) {
                statuses.Add(status);
            }
        }
        return statuses.Count > 0 ? statuses : null;
    }
}
```

**Step 2: Validator**

```csharp
public class FindTenantsAsStaffQueryValidator
    : CursorPaginatedQueryValidator<FindTenantsAsStaffQuery> {

    private static readonly string[] AllowedStatuses = ["pending", "active", "suspended", "archived"];

    public FindTenantsAsStaffQueryValidator() {
        RuleFor(x => x.Search).MaximumLength(200);

        RuleFor(x => x.Status)
            .Must(raw => {
                if (string.IsNullOrEmpty(raw)) return true;
                var parts = raw.Split(',',
                    StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                return parts.All(p => AllowedStatuses.Contains(p.ToLowerInvariant()));
            })
            .WithMessage("Invalid status value. Must be comma-separated: pending,active,suspended,archived");
    }
}
```

**Step 3: Response type (simple inheritance)**

```csharp
// CursorPaginatedResult<T> already has Data + NextCursor
public class FindTenantsAsStaffResponse : CursorPaginatedResult<TenantAsStaffListItem> { }
```

---

### Task 2: Update Backend Service (Cursor Pagination)

**Files:**
- Modify: `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

**Step 1: API-safe flattened list item DTO**

```csharp
// Flattened API-safe DTO (no EF entities)
public record TenantAsStaffListItem {
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? LogoUrl { get; init; }
    public required int UsersCount { get; init; }
    public required int MaxUsers { get; init; }
    public required string Status { get; init; }
    public required bool IsSuspended { get; init; }
}
```

**Step 2: Filters record**

```csharp
public record FindTenantsAsStaffFilters(
    string? Search,
    IReadOnlySet<TenantStatus>? Status
);
```

**Step 3: Service result discriminated union**

```csharp
public abstract record FindTenantsAsStaffServiceResult {
    public sealed record Success(CursorPaginatedResult<TenantAsStaffListItem> Data)
        : FindTenantsAsStaffServiceResult;

    public sealed record CursorNotFound(string Cursor)
        : FindTenantsAsStaffServiceResult;

    public sealed record InvalidSortId(string SortId)
        : FindTenantsAsStaffServiceResult;
}
```

**Step 4: Interface**

```csharp
Task<FindTenantsAsStaffServiceResult> FindTenantsAsStaffAsync(
    Guid cursor,
    int? limit = null,
    string? sortId = null,
    SortOrder? sortOrder = null,
    FindTenantsAsStaffFilters? filters = null,
    CancellationToken cancellationToken = default
);
```

**Step 5: Implementation (following exact Invitations pattern)**

```csharp
public async Task<FindTenantsAsStaffServiceResult> FindTenantsAsStaffAsync(
    Guid cursor,
    int? limit = null,
    string? sortId = null,
    SortOrder? sortOrder = null,
    FindTenantsAsStaffFilters? filters = null,
    CancellationToken cancellationToken = default
) {
    var effectiveLimit = limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
    var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
    var effectiveSortId = (sortId ?? "created_at").ToLowerInvariant();
    var isAsc = effectiveSortOrder == SortOrder.Asc;

    // ═══════════════════════════════════════════════════════════════════════
    // SortFieldHandler dictionary (strongly-typed)
    // ═══════════════════════════════════════════════════════════════════════
    var sortFieldHandlers = new Dictionary<string, SortFieldHandler> {
        ["created_at"] = new SortFieldHandler(
            getCursorValue: async (guid) => {
                var tenant = await _dbContext.Tenant
                    .Where(t => t.Id == guid && t.IsDeleted != true)
                    .Select(t => new { t.CreatedAt, t.Id })
                    .FirstOrDefaultAsync(cancellationToken);
                return tenant is not null ? (tenant.CreatedAt, tenant.Id) : null;
            },
            applyFilter: (q, cursorValue, isAsc) => {
                if (cursorValue is null) return q;
                var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
                return isAsc
                    ? q.Where(row => row.Tenant.CreatedAt > cursorCreatedAt || (row.Tenant.CreatedAt == cursorCreatedAt && row.Tenant.Id > cursorId))
                    : q.Where(row => row.Tenant.CreatedAt < cursorCreatedAt || (row.Tenant.CreatedAt == cursorCreatedAt && row.Tenant.Id < cursorId));
            },
            applyOrdering: (q, isAsc) => isAsc
                ? q.OrderBy(row => row.Tenant.CreatedAt).ThenBy(row => row.Tenant.Id)
                : q.OrderByDescending(row => row.Tenant.CreatedAt).ThenByDescending(row => row.Tenant.Id)
        ),
        ["updated_at"] = new SortFieldHandler(
            getCursorValue: async (guid) => {
                var tenant = await _dbContext.Tenant
                    .Where(t => t.Id == guid && t.IsDeleted != true)
                    .Select(t => new { t.UpdatedAt, t.Id })
                    .FirstOrDefaultAsync(cancellationToken);
                return tenant is not null ? (tenant.UpdatedAt, tenant.Id) : null;
            },
            applyFilter: (q, cursorValue, isAsc) => {
                if (cursorValue is null) return q;
                var (cursorUpdatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
                return isAsc
                    ? q.Where(row => row.Tenant.UpdatedAt > cursorUpdatedAt || (row.Tenant.UpdatedAt == cursorUpdatedAt && row.Tenant.Id > cursorId))
                    : q.Where(row => row.Tenant.UpdatedAt < cursorUpdatedAt || (row.Tenant.UpdatedAt == cursorUpdatedAt && row.Tenant.Id < cursorId));
            },
            applyOrdering: (q, isAsc) => isAsc
                ? q.OrderBy(row => row.Tenant.UpdatedAt).ThenBy(row => row.Tenant.Id)
                : q.OrderByDescending(row => row.Tenant.UpdatedAt).ThenByDescending(row => row.Tenant.Id)
        ),
        ["name"] = new SortFieldHandler(
            getCursorValue: async (guid) => {
                var tenant = await _dbContext.Tenant
                    .Where(t => t.Id == guid && t.IsDeleted != true)
                    .Select(t => new { t.Name, t.Id })
                    .FirstOrDefaultAsync(cancellationToken);
                return tenant is not null ? (tenant.Name, tenant.Id) : null;
            },
            applyFilter: (q, cursorValue, isAsc) => {
                if (cursorValue is null) return q;
                var (cursorName, cursorId) = ((string, Guid?))cursorValue;
                return isAsc
                    ? q.Where(row => row.Tenant.Name.CompareTo(cursorName) > 0 || (row.Tenant.Name == cursorName && row.Tenant.Id > cursorId))
                    : q.Where(row => row.Tenant.Name.CompareTo(cursorName) < 0 || (row.Tenant.Name == cursorName && row.Tenant.Id < cursorId));
            },
            applyOrdering: (q, isAsc) => isAsc
                ? q.OrderBy(row => row.Tenant.Name).ThenBy(row => row.Tenant.Id)
                : q.OrderByDescending(row => row.Tenant.Name).ThenByDescending(row => row.Tenant.Id)
        ),
    };

    // Validate sortId via TryGetValue
    if (!sortFieldHandlers.TryGetValue(effectiveSortId, out SortFieldHandler? handler)) {
        return new FindTenantsAsStaffServiceResult.InvalidSortId(effectiveSortId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Build base query with filters (QUERY-SYNTAX)
    // ═══════════════════════════════════════════════════════════════════════
    var baseQuery =
        from tenant in _dbContext.Tenant
        where tenant.IsDeleted != true && tenant.Id != null
        join userAccount in _dbContext.UserAccount
            .Where(ua => ua.Scope == AccountScope.Tenant && ua.IsDeleted != true)
            on tenant.Id equals userAccount.TenantId into userAccounts
        select new TenantWithUsersCountRow(tenant, userAccounts.Count());

    // Apply search filter
    if (filters?.Search is { } search) {
        var pattern = $"%{search}%";
        baseQuery = baseQuery.Where(x =>
            EF.Functions.ILike(x.Tenant.Name, pattern) ||
            EF.Functions.ILike(x.Tenant.Code, pattern)
        );
    }

    // Apply status filter
    if (filters?.Status is { } statuses && statuses.Count > 0) {
        baseQuery = baseQuery.Where(x => statuses.Contains(x.Tenant.Status));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Apply cursor filter + ordering (match Invitations exactly)
    // ═══════════════════════════════════════════════════════════════════════
    // ApplyFilter returns IQueryable, ordering always applied after
    IQueryable<TenantWithUsersCountRow> query = baseQuery;

    if (cursor != Guid.Empty) {
        var cursorValue = await handler.GetCursorValue(cursor);
        if (cursorValue is null) {
            return new FindTenantsAsStaffServiceResult.CursorNotFound(cursor.ToString());
        }
        query = handler.ApplyFilter(query, cursorValue, isAsc);
    }

    // Always apply ordering (regardless of whether cursor was present)
    var orderedQuery = handler.ApplyOrdering(query, isAsc);

    // ═══════════════════════════════════════════════════════════════════════
    // Fetch limit + 1 to detect more pages (ASYNC)
    // ═══════════════════════════════════════════════════════════════════════
    var results = await orderedQuery
        .Take(effectiveLimit + 1)
        .ToListAsync(cancellationToken);

    // ═══════════════════════════════════════════════════════════════════════
    // Map to flattened API DTO and determine pagination state (using GetRequiredId)
    // ═══════════════════════════════════════════════════════════════════════
    string? nextCursor = null;
    List<TenantAsStaffListItem> items;

    if (results.Count > effectiveLimit) {
        results.RemoveAt(results.Count - 1);
        nextCursor = results.Last().Tenant.GetRequiredId().ToString();
    }

    items = results.Select(r => new TenantAsStaffListItem {
        Id = r.Tenant.GetRequiredId(),
        Name = r.Tenant.Name,
        LogoUrl = r.Tenant.LogoUrl,
        UsersCount = r.UsersCount,
        MaxUsers = r.Tenant.MaxUsers,
        Status = Tenant.GetStatusDescription(r.Tenant.Status),
        IsSuspended = r.Tenant.IsSuspended
    }).ToList();

    return new FindTenantsAsStaffServiceResult.Success(
        new CursorPaginatedResult<TenantAsStaffListItem> {
            Data = items,
            NextCursor = nextCursor
        }
    );
}

// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// SortFieldHandler (non-generic, strongly-typed)
// ═══════════════════════════════════════════════════════════════════════
// NOTE: TenantWithUsersCountRow is defined as a nested type at the end of the service class
private class SortFieldHandler {
    public Func<Guid, Task<object?>> GetCursorValue { get; }
    public Func<IQueryable<TenantWithUsersCountRow>, object?, bool, IQueryable<TenantWithUsersCountRow>> ApplyFilter { get; }
    public Func<IQueryable<TenantWithUsersCountRow>, bool, IOrderedQueryable<TenantWithUsersCountRow>> ApplyOrdering { get; }

    public SortFieldHandler(
        Func<Guid, Task<object?>> getCursorValue,
        Func<IQueryable<TenantWithUsersCountRow>, object?, bool, IQueryable<TenantWithUsersCountRow>> applyFilter,
        Func<IQueryable<TenantWithUsersCountRow>, bool, IOrderedQueryable<TenantWithUsersCountRow>> applyOrdering
    ) {
        GetCursorValue = getCursorValue;
        ApplyFilter = applyFilter;
        ApplyOrdering = applyOrdering;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Nested type: TenantWithUsersCountRow (must be on service class, not inside method)
// ═══════════════════════════════════════════════════════════════════════
private sealed record TenantWithUsersCountRow(Tenant Tenant, int UsersCount);
```

**Step 6: Add pg_trgm migration (raw SQL, partial indexes)**

> **Justification:** pg_trgm provides efficient "contains" substring search for the `q` filter. This is Postgres-specific functionality (not supported by EF/Fluent), requiring raw SQL. Partial indexes (`WHERE is_deleted = false`) keep the index small and performant. Using `suppressTransaction: true` is required because `CREATE INDEX CONCURRENTLY` cannot run inside a transaction.

```csharp
// In migration file
migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;", suppressTransaction: true);
migrationBuilder.Sql("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_name_trgm ON tenants USING gin (name gin_trgm_ops) WHERE is_deleted = false;", suppressTransaction: true);
migrationBuilder.Sql("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_code_trgm ON tenants USING gin (code gin_trgm_ops) WHERE is_deleted = false;", suppressTransaction: true);
```

> **Down migration note:** If your project expects reversible migrations, drop the concurrent indexes with `suppressTransaction: true` as well. Consider **not** dropping the `pg_trgm` extension in `Down()` if it may be shared by other features.
>
> ```csharp
> // In Down()
> migrationBuilder.Sql("DROP INDEX CONCURRENTLY IF EXISTS idx_tenants_name_trgm;", suppressTransaction: true);
> migrationBuilder.Sql("DROP INDEX CONCURRENTLY IF EXISTS idx_tenants_code_trgm;", suppressTransaction: true);
> // Intentionally omit: DROP EXTENSION pg_trgm;
> ```

**Step 7: Add keyset b-tree indexes via Fluent API**

Add to `apps/api/Src/Data/DbContext/MainApiDbContext.cs`:

```csharp
modelBuilder.Entity<Tenant>()
    .HasIndex(t => new { t.CreatedAt, t.Id })
    .HasDatabaseName("ix_tenants_staff_created_at_id")
    .HasFilter("\"is_deleted\" = false");

modelBuilder.Entity<Tenant>()
    .HasIndex(t => new { t.UpdatedAt, t.Id })
    .HasDatabaseName("ix_tenants_staff_updated_at_id")
    .HasFilter("\"is_deleted\" = false");

modelBuilder.Entity<Tenant>()
    .HasIndex(t => new { t.Name, t.Id })
    .HasDatabaseName("ix_tenants_staff_name_id")
    .HasFilter("\"is_deleted\" = false");
```

Then run: `make db-add NAME=AddTenantKeysetIndexes`

**Step 8: Run build**

Run: `cd apps/api && dotnet build`

---

### Task 3: Update Backend Handler

**Files:**
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`

```csharp
public static async Task<Results<Ok<FindTenantsAsStaffResponse>, AppBadRequestHttpResult>>
    HandleFindTenantsAsStaff(
        [AsParameters] FindTenantsAsStaffQuery findTenantsAsStaffQuery,
        [FromServices] ITenantAsStaffService tenantAsStaffService,
        CancellationToken cancellationToken
    ) {
    // Parse cursor - Guid.Empty means first page
    var cursorStr = findTenantsAsStaffQuery.GetCursor();
    var cursorGuid = Guid.Empty;

    if (!string.IsNullOrEmpty(cursorStr)) {
        if (!Guid.TryParse(cursorStr, out cursorGuid)) {
            return TypedProblems.BadRequest("Invalid cursor format", ResponseKeys.BadRequest);
        }
    }

    var limit = findTenantsAsStaffQuery.GetLimit();
    var sortId = findTenantsAsStaffQuery.GetSortId();
    var sortOrder = findTenantsAsStaffQuery.GetSortOrder();

    var filters = new FindTenantsAsStaffFilters(
        Search: findTenantsAsStaffQuery.GetSearchNormalized(),
        Status: findTenantsAsStaffQuery.GetStatusesOrNull()
    );

    var result = await tenantAsStaffService.FindTenantsAsStaffAsync(
        cursor: cursorGuid,
        limit: limit,
        sortId: sortId,
        sortOrder: sortOrder,
        filters: filters,
        cancellationToken: cancellationToken
    );

    // Pattern matching for discriminated union
    if (result is FindTenantsAsStaffServiceResult.CursorNotFound cursorError) {
        return TypedProblems.BadRequest(
            $"Cursor record not found: {cursorError.Cursor}",
            ResponseKeys.BadRequest
        );
    }

    if (result is FindTenantsAsStaffServiceResult.InvalidSortId sortIdError) {
        return TypedProblems.BadRequest(
            $"Invalid sortId: {sortIdError.SortId}. Allowed: created_at, updated_at, name, status",
            ResponseKeys.BadRequest
        );
    }

    if (result is FindTenantsAsStaffServiceResult.Success success) {
        return TypedResults.Ok(new FindTenantsAsStaffResponse {
            Data = success.Data.Data,
            NextCursor = success.Data.NextCursor,
        });
    }

    throw new InvalidOperationException("Unhandled result type");
}
```

---

### Task 4: Regenerate TypeScript Client

Run: `make generate-client`
Run: `make tsc-front`

---

### Task 5: Update Frontend Hook (matching repo conventions)

**Files:**
- Modify: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

```typescript
// Match repo conventions: sort uses { id, order } shape.
// IMPORTANT: Tenant list is cursor-paginated; remove legacy offset params (page) from this hook.
type FindTenantsParams = {
    cursor?: string;
    limit?: number;
    sort?: { id: string; order: 'asc' | 'desc' };
    q?: string;
    status?: string; // csv: active,pending,suspended,archived
};

export const useFindTenants = createStaffQuery({
    queryKeyFn: (client) => client.staff.tenants.get,
    fetcher: async (client, params: FindTenantsParams) => {
        const result = await client.staff.tenants.get({
            queryParameters: {
                cursor: params.cursor,
                limit: params.limit ? params.limit.toString() : undefined,
                sortId: params.sort?.id,
                sortOrder: params.sort?.order,
                q: params.q,
                status: params.status,
            },
        });

        if (_.isNil(result)) {
            throw new Error('useFindTenants: result is nil');
        }

        return result;
    },
});
```

---

### Task 6: Update Frontend Table (nuqs + Cursor reset)

**Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

**Step 1: Import**

```typescript
import _ from 'lodash';
import { parseAsString, useQueryStates } from 'nuqs';
```

**Step 2: Filter state with nuqs**

```typescript
const [filterStates, setFilterStates] = useQueryStates({
    q: parseAsString.withDefault(''),
    status: parseAsString.withDefault(''),  // lowercase: active,pending,suspended,archived
});

const [globalFilter, setGlobalFilter] = useState(filterStates.q);
const [statusFilter, setStatusFilter] = useState(filterStates.status);
```

**Step 3: Column definitions with snake_case IDs (MUST match backend sortId)**

```typescript
const columnHelper = createMRTColumnHelper<TenantRowData>();

const columns = useMemo(() => [
    columnHelper.accessor('name', {
        header: t('name'),
        // id defaults to 'name' from accessor
    }),
    columnHelper.accessor('code', {
        header: t('code'),
    }),
    columnHelper.accessor('status', {
        header: t('status'),
    }),
    columnHelper.accessor('isSuspended', {
        header: t('suspended'),
    }),
    columnHelper.accessor('usersCount', {
        header: t('users'),
    }),
    columnHelper.accessor('createdAt', {
        id: 'created_at',  // MUST match backend allowed sortId
        header: t('created-at'),
    }),
    columnHelper.accessor('updatedAt', {
        id: 'updated_at',
        header: t('updated-at'),
    }),
], [t]);
```

**Step 4: Table state with cursor (snake_case sort id)**

```typescript
const defaultSorting = { desc: true, id: 'created_at' };  // snake_case

const {
    handlePaginationChange,
    handleSortingChange,
    apiVariables,
    tableState,
    setNextCursor,
    hasNextPage,
    hasPreviousPage,
    resetCursorPagination,
} = useTableState({
    defaultSorting,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    paginationMode: 'cursor',
});
```

**Step 4: Debounced search with cursor reset**

```typescript
// Always reset cursor BEFORE updating filters
const debouncedSearch = useMemo(
    () => _.debounce((value: string) => {
        resetCursorPagination?.();  // Reset cursor first!
        setFilterStates({ q: value, status: statusFilter });
    }, 300),
    [setFilterStates, statusFilter, resetCursorPagination]
);

const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGlobalFilter(value);
    debouncedSearch(value);
};

useEffect(() => () => { debouncedSearch.cancel(); }, [debouncedSearch]);
```

**Step 5: Status filter with MUI Select multiple**

```typescript
const handleStatusChange = (event: any) => {
    const value = typeof event.target.value === 'string'
        ? event.target.value
        : event.target.value.join(',');
    setStatusFilter(value);
    resetCursorPagination?.();  // Reset cursor first!
    setFilterStates({ q: globalFilter, status: value });
};

// Optional: Use lowercase status values (active,pending) in URLs to match Invitations pattern
// Status values are lowercase (active, pending, suspended, archived) in URLs to match backend validation
```

**Step 6: Wire query (matching useTableState shape)**

```typescript
const { data, isPending } = useFindTenants({
    variables: {
        cursor: apiVariables.cursor || undefined,
        limit: apiVariables.limit,
        sort: apiVariables.sort,        // { id: string, order: 'asc' | 'desc' }
        q: filterStates.q || undefined,
        status: filterStates.status || undefined,
    },
});

useEffect(() => {
    setNextCursor(data?.nextCursor);
}, [data?.nextCursor, setNextCursor]);
```

**Step 7: Cursor table preset + stable row IDs**

```typescript
const getRowId = useCallback((row: TenantRowData) => row.id, []);

const table = useMRTTable('minimal-cursor', {
    getRowId,
    onRowSelectionChange: setRowSelection,
});
```

---

### Task 7: Implement Bulk Actions

```typescript
import pLimit from 'p-limit';

const limit = pLimit(5);

const handleBulkSuspend = async () => {
    const selectedIds = Object.keys(rowSelection);

    const results = await Promise.allSettled(
        selectedIds.map((id) =>
            limit(() => suspendTenantAsync({ tenantId: id }))
        )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    toast.success(t('bulk-suspend-result', { succeeded, failed }));
    queryClient.invalidateQueries({ queryKey: useFindTenants.getKey() });
    setRowSelection({});
};
```

---

### Task 8: Add Translations

**Files:**
- Modify: `packages/shared/lib/i18n/json/en/common.json`

```json
{
  "search-tenants": "Search tenants...",
  "filter-by-status": "Filter by status",
  "all-statuses": "All statuses",
  "active": "Active",
  "pending": "Pending",
  "suspended": "Suspended",
  "archived": "Archived",
  "bulk-actions": "Bulk actions",
  "bulk-suspend": "Suspend selected",
  "bulk-reactivate": "Reactivate selected",
  "bulk-delete": "Delete selected",
  "selected-count": "{{count}} selected",
  "bulk-suspend-result": "{{succeeded}} suspended, {{failed}} failed"
}
```

---

### Task 9: Manual Testing

**Step 1: Start servers**

```bash
make dev-api
make dev-front
```

---

### Task 10: Documentation (New Foundations)

Add/Update documentation so the new list-page patterns are reusable and consistent across the app:

- Add guide: `docs/guides/list-pages-search-filter-cursor-pagination.md`
- Update: `docs/guides/cursor-keyset-pagination-guide.md` (frontend `sortId` stability + MRT column `id` requirement)
- Update: `docs/guides/frontend-coding-standards.md` (nuqs + cursor lists; reset cursor on filter change; snake_case sort IDs)
- Update: `docs/guides/validator-conventions.md` (CSV enum list filters pattern)
- Update: `AGENTS.md` to reference the new guide (so it becomes part of the repo’s authoritative conventions)

---

## Summary

This revised v9 plan implements 4 features with cursor pagination, fully compliant with:

- `cursor-keyset-pagination-guide.md`
- Existing Invitations service pattern (SortFieldHandler)
- Repo frontend conventions (useTableState shape, nuqs, cursor reset)

**Key fixes from v4:**
| Issue | Fix |
|-------|-----|
| CI-1: EF entity in response | Added flattened `TenantAsStaffListItem` DTO |
| CI-2: Non-compiling SortFieldHandler | Copied exact Invitations pattern with non-generic class + object? boxing |
| CI-3: Response redeclares properties | Simple inheritance: `class FindTenantsAsStaffResponse : CursorPaginatedResult<T>` |
| CI-4: Wrong frontend shape | `sort: { id, order }` + `resetCursorPagination?.()` on filter changes |

**Files to modify:**
- `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`
- `packages/shared/lib/i18n/json/en/common.json`

**Note:** Do NOT commit - user will handle their own commits.
