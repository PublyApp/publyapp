# GPT Review (Round 3): Tenant List Improvements (Cursor Pagination) — Final Go/No-Go

Date: 2026-02-25  
Plan reviewed: `docs/plans/2026-02-25-tenant-list-search-filter.md` (REVISED v2)

---

## 1) Verdict: **NO-GO (one more plan fix pass needed)**

The updated plan is materially better and it *does* incorporate most Round 1/2 feedback (cursor pagination, `q` binding, lodash debounce, MUI multi-select, executable `pg_trgm` migration). However, there are still a few **compile-break / contract-break** issues plus a couple of **missing-but-required wiring details** (URL persistence with nuqs + correct sort IDs) that will cause immediate breakage or a large mid-implementation detour.

Once the **Critical Issues** below are addressed (mostly naming + URL state wiring + sort-id normalization), the plan becomes implementation-ready.

---

## 2) Critical Issues (Must-Fix)

### CI-0: Cursor pagination must comply with the existing guide + established patterns

There is an authoritative guide: `docs/guides/cursor-keyset-pagination-guide.md`, and the repo has established cursor implementations (e.g. `FindStaffInvitations`, `FindAuditLogs`). The plan must follow those patterns exactly; do not invent a second cursor dialect.

**Must follow (non-negotiable):**
- Cursor is always an entity ID (Guid) even when sorting by other fields.
- Use a tie-breaker (Id) and ensure tie-breaker direction matches primary sort direction.
- Parse cursor in handler into `Guid cursorGuid = Guid.Empty` (first page), and pass a non-nullable `Guid cursor` to the service.
- Apply cursor filter only when `cursorGuid != Guid.Empty`.
- Fetch `limit + 1`, remove the extra record, compute `NextCursor` from the last returned entity Id.
- Use a discriminated union result type for service outcomes (`Success`, `CursorNotFound`, `InvalidSortId`) and pattern-match in handler.

### CI-1: Result type naming is inconsistent and will not compile (service “union” vs API response DTO)

In the plan:
- Task 2 introduces:
  ```csharp
  public class FindTenantsAsStaffResult : CursorPaginatedResult<TenantAsStaffItem> { }
  ```
  as the API response type.
- Task 3 introduces:
  ```csharp
  public abstract class FindTenantsAsStaffResult { ... CursorNotFoundResult ... }
  ```
  as a service-layer discriminated union / result type.
- Task 4 handler code then checks:
  ```csharp
  if (result is FindTenantsAsStaffResult.CursorNotFoundResult ...)
  ```
  which only exists on the service “union”, not on the API response type.

**Why critical:** This is a hard compile blocker and will also create confusion between handler namespace types vs service namespace types.

**How to fix (recommended pattern, consistent with existing code):**
- Use distinct names:
  - API response DTO: `FindTenantsAsStaffResponse : CursorPaginatedResult<TenantAsStaffListItem>`
  - Service union: `FindTenantsAsStaffServiceResult` (or `FindTenantsAsStaffQueryResult`)

**Example:**
```csharp
// Handler layer (API response)
public class FindTenantsAsStaffResponse
	: CursorPaginatedResult<TenantAsStaffItem> { }

// Service layer union
public abstract record FindTenantsAsStaffServiceResult {
	public sealed record Success(
		List<TenantAsStaffItem> Data,
		Guid? NextCursor
	) : FindTenantsAsStaffServiceResult;

	public sealed record CursorNotFound(Guid Cursor)
		: FindTenantsAsStaffServiceResult;

	public sealed record InvalidSortId(string SortId)
		: FindTenantsAsStaffServiceResult;
}
```

Then in handler:
```csharp
if (serviceResult is FindTenantsAsStaffServiceResult.Success success) {
	return TypedResults.Ok(new FindTenantsAsStaffResponse {
		Data = success.Data.Select(MapToDto).ToList(),
		NextCursor = success.NextCursor?.ToString(),
	});
}
```

---

### CI-2: SortId contract is not aligned with existing frontend behavior (`createdAt` vs `created_at`)

The plan’s allowed sort IDs are `created_at`, `name` (and the service code also includes `updated_at`).  
But the existing tenants table uses `useTableState` with `defaultSorting.id = 'createdAt'` (current code in `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`), and API currently receives `sortId=createdAt`.

**Why critical:** If you implement the backend exactly as planned, the very first request from the current UI will likely send `sortId=createdAt`, which the backend will reject with **400 Invalid sortId**.

**Decision (confirmed): Option B.**
- Frontend must change its sort IDs to match backend allowed values (snake_case).
- Update tenants list `defaultSorting` to `{ id: 'created_at', desc: true }`.
- Ensure sortable column IDs passed to MRT match the backend allowed set (`created_at`, `name`, optionally `updated_at`).
- Keep backend strict and return 400 for invalid sortId (consistent with existing cursor endpoints).

---

### CI-3: Plan claims “URL persisted via nuqs”, but the Task 7 code uses local state only

Plan states multiple times:
- “persist filters in URL via nuqs”
- “Frontend nuqs keys match API params”

But Task 7 uses:
```ts
const [globalFilter, setGlobalFilter] = useState('');
const [statusFilter, setStatusFilter] = useState('');
```
and never uses `useQueryStates`.

**Why critical:** This is a direct requirement mismatch, and it will break expected behavior (refresh/share/back button). It also matters for cursor pagination because the UX expectation is that filter state is reflected in the URL.

**How to fix:** Use nuqs for `q` and `status`, and call `resetCursorPagination()` on change.

**Example (minimal):**
```ts
const [filters, setFilters] = useQueryStates({
	q: parseAsString.withDefault(''),
	status: parseAsString.withDefault(''), // csv string
});

const setQ = (q: string) => {
	setFilters({ q });
	resetCursorPagination();
};

const setStatus = (status: string) => {
	setFilters({ status });
	resetCursorPagination();
};
```

Then wire `filters.q` / `filters.status` into `useFindTenants`.

---

### CI-4: URL query key conventions must remain uniform (Decision: keep existing `useTableState` URL keys)

The project already standardized URL keys via `useTableState`:
- sorting URL keys: `sort_id`, `sort_order`
- pagination URL key (page size): `size`

**Decision (confirmed): keep existing convention everywhere.**

**Why critical:** If this page diverges, it creates permanent inconsistency and a bad precedent.

**How to fix the plan:**
- Document that **URL state** uses `sort_id`, `sort_order`, `size` (and filter keys like `q`, `status`).
- Document that **API params** remain `sortId`, `sortOrder`, `limit`, `cursor`.
- Continue using `useTableState` defaults; do not rename URL keys to API-like keys.

---

## 3) Recommended Improvements (Should-Fix)

### RI-1: Cursor anchor lookup should respect the same base set (deleted + filters), not just `Tenant.FindAsync`

Service currently anchors the cursor by:
```csharp
var cursorTenant = await _dbContext.Tenant.FindAsync(new object[] { cursor.Value }, cancellationToken);
```

**Why it matters:** In keyset pagination, the cursor should represent “last row of previous page” within the same logical dataset. If you allow anchoring on a tenant that is deleted or doesn’t match filters, paging behavior becomes surprising and can skip/duplicate.

**Suggested fix:** Fetch cursor “anchor values” from the same base query shape, or at least enforce `is_deleted = false`:
```csharp
var cursorAnchor = await (
	from t in _dbContext.Tenant.AsNoTracking()
	where t.Id == cursor.Value && t.IsDeleted != true
	select new { t.Id, t.Name, t.CreatedAt, t.UpdatedAt }
).FirstOrDefaultAsync(cancellationToken);
```

Optionally also validate the anchor against filters (recommended if you expect users to paste URLs).

---

### RI-2: Align “Allowed Sort Fields” section with the actual service code and indexes

The plan text says allowed sort IDs are:
- `created_at` (default)
- `name`

But the service code includes `updated_at`, and the handler error message lists it too.

**Suggestion:** Decide explicitly:
- If you want to keep scope tight: remove `updated_at` from allowed list + handler message.
- If you keep `updated_at`: add a matching keyset index and document it:
  - `idx_tenants_updated_at_id` on `(updated_at desc, id desc) where is_deleted=false`

Also: if you allow sort by `name`, add an index:
```csharp
migrationBuilder.Sql(
	"CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_name_id ON tenants (name, id) WHERE is_deleted = false;",
	suppressTransaction: true
);
```

---

### RI-3: Frontend search input should be controlled for good UX

Current plan updates `globalFilter` only in the debounced callback. If the TextField is controlled by `globalFilter`, users will see laggy input. If it’s uncontrolled, you risk desync between displayed value and query state.

**Recommendation:**
- Keep `searchInput` state updated on every keystroke.
- Debounce updating `filters.q` (nuqs) / `globalFilter`.

---

### RI-4: Bulk actions should include selection limits + confirm dialogs + per-action behavior

Plan shows only `handleBulkSuspend`. For production readiness, at minimum:
- enforce a max selection count (e.g. 100)
- confirm dialog for destructive actions (suspend/delete)
- define behavior for reactivate/delete (and ensure backend rules: delete requires suspended)
- show failure details somewhere (even a simple expandable list)

---

## 4) Compliance Checks (Rules/Guides to enforce in the plan)

These already exist in the repo; if a guide/rule exists, the plan must comply (do not invent alternatives):

1) **Cursor/keyset pagination:** follow `docs/guides/cursor-keyset-pagination-guide.md` (cursor parsing, tie-breaker direction, limit+1, service union, handler pattern matching).
2) **DB LINQ style:** database LINQ queries should use query syntax; method syntax only for terminal ops (AGENTS.md).
3) **Frontend UI:** MUI components only (AGENTS.md).
4) **RFC 7807 + auth semantics:** keep consistent 422 validation for query parsing; reserve 401 for invalid/missing session only (AGENTS.md).

---

## 5) Questions (Remaining decisions)

1) Should an invalid cursor format be 400 (current pattern in other handlers) vs 422 validation? (Plan currently uses 400, which is fine, but document it.)
2) Do we require the cursor anchor to satisfy the current filters (recommended), or is “anchor must exist and not be deleted” sufficient?

---

## 6) Final Notes

- Decision (confirmed): it is acceptable to use `migrationBuilder.Sql(..., suppressTransaction: true)` for Postgres-specific operations that cannot be expressed cleanly with existing EF Fluent/attribute patterns (notably `CREATE EXTENSION pg_trgm` and `CREATE INDEX CONCURRENTLY ... gin_trgm_ops`). Keep this SQL minimal and tightly scoped.
- For standard b-tree keyset indexes that *can* be represented with existing patterns, prefer Fluent API `HasIndex(...).HasFilter(...)` (as already used for profiles in `MainApiDbContext`).
- The backend cursor pagination approach (keyset with tie-breaker `Id`) is directionally correct.
- The remaining work is mostly “wiring correctness”: type naming, sort ID alignment, and real URL persistence via nuqs (not just claimed).

Once CI-0 through CI-4 are resolved in the plan, I’d consider it **GO** for implementation.
