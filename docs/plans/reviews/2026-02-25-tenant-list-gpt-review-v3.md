# GPT Review (Round 4): Tenant List Improvements — Cursor Pagination + Search/Filters + Bulk Actions

Date: 2026-02-25  
Plan reviewed: `docs/plans/2026-02-25-tenant-list-search-filter.md` (REVISED v3)

## 1) Verdict: **NO-GO (close, but still has contract + wiring blockers)**

This v3 plan is a meaningful improvement: it explicitly locks the previously agreed decisions (cursor pagination, snake_case `sortId`, URL keys via `useTableState`, distinct service-vs-response naming), and the backend cursor logic is broadly aligned with `docs/guides/cursor-keyset-pagination-guide.md`.

However, there are still a few **must-fix plan issues** that will otherwise cause immediate breakage or a big mid-implementation detour:
- **API DTO / service DTO mismatch** (risk of leaking EF entities + OpenAPI contract mismatch)
- **Frontend hook variable shape mismatch** (plan diverges from `useTableState` + existing hook conventions)
- **Cursor reset wiring** (plan tries to write `cursor` through `useQueryStates`, which is not part of the filter state and not how cursor mode works in this repo)

Fix the Critical Issues below and I’d switch to **GO**.

---

## 2) Critical Issues (Must-Fix)

### CI-1: The plan’s service `TenantAsStaffItem` is not an API DTO (it wraps an EF entity)

**What’s wrong**

In v3 Task 2, the service projection builds:

```csharp
select new TenantAsStaffItem {
    Tenant = tenant,
    UsersCount = userAccounts.Count()
};
```

That `TenantAsStaffItem` is the existing *service* type (`MainApi.Src.Modules.Tenants.Services.TenantAsStaffItem`) which contains `Tenant Tenant`.

But the current API contract (and frontend model) expects a flattened DTO like the one currently defined in the handler (`MainApi.Src.Modules.Tenants.Handlers.Staff.TenantAsStaffItem`: `Id`, `Name`, `UsersCount`, `Status`, `IsSuspended`, etc.).

The v3 handler success path then does:

```csharp
Data = success.Data.Data,
```

…which would return the service type (entity wrapper) unless you change types. That is a **hard contract break** and a **data leakage risk** (EF entity serialization can unintentionally surface fields / relationships).

**Why it’s critical**
- Breaks OpenAPI response schema vs what frontend expects (`TenantAsStaffItem` in `packages/js-client`).
- Risks serializing EF entities (even if `[JsonIgnore]` exists today, this is not a safe API boundary).
- Forces a redesign mid-implementation.

**How to fix (stick to existing conventions)**

Follow the established pattern used by Invitations:
- Service defines *API-safe list item DTOs* (records) used by both service + handler.
- Handler response type simply wraps `CursorPaginatedResult<TListItem>`.

Concretely for tenants:
1) Rename the existing service wrapper type to something internal, e.g.:
   - `TenantWithUsersCountRow` (internal projection)
2) Define (in the **service layer**) the flattened DTO that the API returns:
   - Keep the name `TenantAsStaffItem` if you want to avoid churn in generated TS models, but **it must not contain EF entities**.
3) Update the handler file to remove its duplicate `TenantAsStaffItem` (or rename it), and use the service DTO like other slices do.

**Example (recommended target shape)**

```csharp
// apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs
public record TenantAsStaffItem {
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? LogoUrl { get; init; }
    public required int UsersCount { get; init; }
    public required int MaxUsers { get; init; }
    public required string Status { get; init; } // existing API uses string labels
    public required bool IsSuspended { get; init; }
}
```

Then, in the query:

```csharp
var baseQuery =
    from tenant in _dbContext.Tenant
    where tenant.IsDeleted != true
    join userAccount in _dbContext.UserAccount
        .Where(ua => ua.Scope == AccountScope.Tenant && ua.IsDeleted != true)
        on tenant.Id equals userAccount.TenantId into userAccounts
    select new {
        Tenant = tenant,
        UsersCount = userAccounts.Count()
    };

// later, after paging results:
var items = results.Select(r => new TenantAsStaffItem {
    Id = r.Tenant.GetRequiredId(),
    Name = r.Tenant.Name,
    LogoUrl = r.Tenant.LogoUrl,
    UsersCount = r.UsersCount,
    MaxUsers = r.Tenant.MaxUsers,
    Status = Tenant.GetStatusDescription(r.Tenant.Status),
    IsSuspended = r.Tenant.IsSuspended,
}).ToList();
```

This keeps the API boundary consistent and mirrors the existing `FindTenantsAsStaff` mapping logic, just moved into the service (same as Invitations).

---

### CI-2: Frontend hook + variables in the plan don’t match existing `useTableState` conventions

**What’s wrong**

The plan’s Task 5 suggests a hook signature like:

```ts
sort?: string;
sortDir?: 'asc' | 'desc';
```

But **every existing list hook** (and `useTableState`) uses:

```ts
sort?: { id: string; order: 'asc' | 'desc' };
```

Also, `useTableState` in cursor mode already provides `apiVariables.cursor`, `apiVariables.limit`, `apiVariables.sort` (object) and expects the hook to accept that shape.

**Why it’s critical**
- The plan as-written will not integrate cleanly with `useTableState` and will likely create TS compile errors.
- It introduces an inconsistent query-variable shape across the codebase.

**How to fix**

Update the plan to keep `useFindTenants` variables consistent with existing patterns, like `useFindStaffInvitations` and `useFindTenantUsers`.

**Example (recommended)**

```ts
type FindTenantsParams = {
  cursor?: string;
  limit?: number;
  sort?: { id: string; order: 'desc' | 'asc' };
  q?: string;
  status?: string; // CSV
};

// fetcher uses queryParameters: { cursor, limit, sortId: sort?.id, sortOrder: sort?.order, q, status }
```

Then wiring becomes:

```ts
const tenantsQuery = useFindTenants({
  variables: {
    cursor: apiVariables.cursor || undefined,
    limit: apiVariables.limit,
    sort: apiVariables.sort, // stays { id, order }
    q: filterStates.q || undefined,
    status: filterStates.status || undefined,
  },
});
```

---

### CI-3: Cursor reset on filter changes is incorrect (plan tries to set `cursor` through `useQueryStates`)

**What’s wrong**

In v3 Task 6:

```ts
setFilterStates({ q: value, status: statusFilter, cursor: null });
```

But `useQueryStates` is only configured with `{ q, status }`. Writing `cursor` there:
- doesn’t match the declared state shape (TS error / ignored key),
- and cursor pagination in this repo is **not URL-driven**; it’s managed inside `useTableState` via `resetCursorPagination()` + internal cursor history.

**Why it’s critical**
- The plan will not compile cleanly (or will silently fail to reset cursor).
- Users will see “Next/Previous” behaving incorrectly after changing filters.

**How to fix (match existing cursor table pattern)**

Use `resetCursorPagination?.()` exactly like `StaffInvitationsTable` does, *then* update URL filter states.

```ts
const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setGlobalFilter(value);
  debouncedSearch(value);
};

const debouncedSearch = useMemo(
  () => _.debounce((value: string) => {
    resetCursorPagination?.();
    setFilterStates({ q: value, status: statusFilter });
  }, 300),
  [resetCursorPagination, setFilterStates, statusFilter],
);

const handleStatusChange = (event: SelectChangeEvent<string[]>) => {
  const selected = event.target.value;
  const value = selected.join(',');
  resetCursorPagination?.();
  setStatusFilter(value);
  setFilterStates({ q: globalFilter, status: value });
};
```

This keeps URL filter persistence (nuqs) while keeping cursor mechanics consistent.

---

## 3) Recommended Improvements (Should-Fix)

### RI-0: Use `SortFieldHandler` + dictionary (match existing cursor services)

Other cursor-paginated services in this repo use a `SortFieldHandler` abstraction (or equivalent) and a dictionary keyed by `sortId`. The v3 plan currently hardcodes `if (effectiveSortId == "name") ... else ...` and duplicates ordering + cursor filter logic.

**Why it matters**
- Eliminates duplication between “ordering” and “cursor filter” branches (common source of pagination bugs).
- Makes it trivial/safer to add sort fields later (add one handler + index).
- Keeps the code consistent with the established cursor/keyset pagination patterns and `docs/guides/cursor-keyset-pagination-guide.md`.

**How to fix**
Refactor the plan’s Task 2 / Step 4 pseudocode to use:
- `ISortFieldHandler<TCursorValue>` per field
- `Dictionary<string, ISortFieldHandler>` keyed by allowed `sortId`
- Early `TryGetValue` validation → `InvalidSortId`
- Cursor anchor lookup via `GetCursorValue` → `CursorNotFound` when missing

**Example structure**

```csharp
private interface ISortFieldHandler<TCursorValue> {
	Task<TCursorValue?> GetCursorValue(Guid cursor, CancellationToken ct);
	IQueryable<T> ApplyFilter<T>(IQueryable<T> query, TCursorValue cursorValue, bool isAsc);
	IOrderedQueryable<T> ApplyOrdering<T>(IQueryable<T> query, bool isAsc);
}

var sortHandlers = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase) {
	["created_at"] = new CreatedAtSortHandler(),
	["name"] = new NameSortHandler(),
};

if (!sortHandlers.TryGetValue(effectiveSortId, out var handlerObj)) {
	return new FindTenantsAsStaffServiceResult.InvalidSortId(effectiveSortId);
}

var handler = (ISortFieldHandler<...>)handlerObj;

var query = baseQuery;
if (cursor != Guid.Empty) {
	var cursorValue = await handler.GetCursorValue(cursor, ct);
	if (cursorValue is null) {
		return new FindTenantsAsStaffServiceResult.CursorNotFound(cursor.ToString());
	}
	query = handler.ApplyFilter(query, cursorValue, isAsc);
}

var orderedQuery = handler.ApplyOrdering(query, isAsc);
```

This is the same architecture as other cursor-paginated endpoints; don’t introduce a one-off style for tenants.

### RI-1: Add keyset pagination b-tree indexes via Fluent API (do not rely only on pg_trgm)

You’re sorting by:
- `created_at` + `id`
- `name` + `id`

The DbContext already defines keyset indexes for Profiles. Tenants should follow the same convention.

**Recommendation**

Add to `apps/api/Src/Data/DbContext/MainApiDbContext.cs`:

```csharp
modelBuilder.Entity<Tenant>()
    .HasIndex(t => new { t.CreatedAt, t.Id })
    .HasDatabaseName("ix_tenants_staff_created_at_id")
    .HasFilter("\"is_deleted\" = false");

modelBuilder.Entity<Tenant>()
    .HasIndex(t => new { t.Name, t.Id })
    .HasDatabaseName("ix_tenants_staff_name_id")
    .HasFilter("\"is_deleted\" = false");
```

This matches the existing “Keyset pagination indexes” pattern and avoids introducing new migration conventions.

---

### RI-2: Make the trigram indexes partial (`WHERE is_deleted = false`)

Current plan creates:
```sql
CREATE INDEX CONCURRENTLY ... ON tenants USING gin (name gin_trgm_ops);
```

Prefer:
```sql
... WHERE is_deleted = false;
```

This keeps indexes smaller and better aligned with the API’s base filter (`tenant.IsDeleted != true`).

---

### RI-3: Status filter casing should be consistent (recommend lowercase everywhere)

Other slices (Invitations) use lowercase statuses in URL/API (`pending`, `accepted`, …).

Your plan currently implies `status=Active,Pending`. It will work (you lower-case server-side), but it’s inconsistent and produces noisy URLs.

**Recommendation**
- UI `MenuItem` values should be lowercase (`active`, `pending`, `suspended`, `archived`)
- Backend validator message should reflect lowercase

---

### RI-4: Cursor anchor lookup should apply the same base constraints

Cursor anchor query currently ignores `IsDeleted`:

```csharp
from t in _dbContext.Tenant
where t.Id == cursor
select ...
```

At minimum, require `t.IsDeleted != true`. Optionally require it also matches the active filter set (recommended when users paste URLs).

---

### RI-5: Bulk actions plan needs to cover all actions + confirmation + partial failure UX

Plan only shows `handleBulkSuspend`. For production readiness, document:
- bulk reactivate + bulk delete
- confirmation dialogs (especially delete)
- selection limit (e.g. max 100)
- partial failure display (at least list failed tenantIds)

This is a planning completeness issue, not a code one.

---

## 4) Questions (Need a decision / clarification)

1) **Filter URL persistence standard**: the plan uses nuqs for filters (good per architecture guide), but some existing pages (e.g. staff invitations status filter) still use local state only. Do we:
   - keep moving forward with URL-persisted filters and backfill later, or
   - align tenants page to the existing invitations behavior (no URL persistence) for short-term uniformity?

2) **Cursor semantics for filtered-out anchor**: if a cursor exists but does not match current filters (e.g. user changes status list), do we:
   - return 400 CursorNotFound (strict), or
   - treat it as “reset to first page” (lenient)?
   
   Repo cursor guide leans strict; invitations handler returns 400 when cursor record isn’t found.

---

## 5) Final Notes

- The plan’s decision to use `EF.Functions.ILike` + `pg_trgm` is reasonable for tenant name/code “contains” search; full-text search is usually worse for short identifiers/codes and substring matching.
- Using `migrationBuilder.Sql(..., suppressTransaction: true)` is acceptable **only** for Postgres-specific operations that EF can’t express (extension + `CONCURRENTLY`). For the keyset b-tree indexes, prefer Fluent API in `MainApiDbContext` to match existing conventions.
- Once CI-1/2/3 are corrected in the plan, I consider this **ready to implement**.
