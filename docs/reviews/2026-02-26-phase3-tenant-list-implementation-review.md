# Staff Tenant List Search/Filter/Cursor Pagination — Implementation Review (Claude Request)

Date: 2026-02-26  
Branch: `phase-3-tenant-list-improvements`  
Plan reference: `docs/plans/2026-02-25-tenant-list-search-filter.md`

This review responds to the “Code Review Prompt: Staff Tenant List Search/Filter/Cursor Pagination” and the follow-up questions.

---

## 0) Owner Decisions (Aki)

These are the decisions taken after reading this review:

- **Q1 (`q` reuse): defer.** Keep `q` parsing/normalization local for now; revisit after we have more list pages using `q`.
- **Q2 (debounce): use `minimal-shared` and standardize.** Drop `react-use` entirely; use `useDebounce` from `minimal-shared/hooks` and update the relevant guides so this doesn’t drift again.
- **Q3 (runtime error): understood.** Proceed with the recommended backend query rewrite.
- **Scope: fix all findings in this review.** Must-Fix + Should-Fix items are all in-scope.

---

## 1) Executive Summary

The overall direction (cursor pagination, `q` search, CSV `status`, `sortId` allowlist, URL-persisted filters) matches the agreed plan and existing Invitations patterns. However, the backend implementation currently throws at runtime due to an EF Core translation issue in the keyset query, and the frontend misses a couple of required cursor-reset and consistency behaviors. As-is: **No-Go** for merge.

---

## 2) Verdict

**No-Go** until the critical backend LINQ translation issue is fixed and cursor-reset behavior is corrected on the frontend. After that, this is close.

---

## 3) Critical Issues (Must-Fix)

### CI-1 — Backend runtime crash: EF Core cannot translate ordering query

**Symptom**
- Runtime exception (from `apps/api/logs/error20260226.log`) shows EF Core failing to translate an `OrderByDescending(...)` that effectively constructs `TenantWithUsersCountRow(...)` inside the key selector.

**Why it’s critical**
- The staff tenants list endpoint fails in production and cannot be used at all.

**Root cause (likely)**
- The current query shape projects `TenantWithUsersCountRow(tenant, userAccounts.Count())` and then applies ordering on `row.Tenant.CreatedAt` / `row.Tenant.UpdatedAt` / `row.Tenant.Name`.
- EF Core appears to rewrite/push down the ordering in a way that causes the projection (including `Count()`) to appear inside the order-by key selector, which becomes non-translatable.

**How to fix (recommended)**
- Paginate on `Tenant` only (like Invitations paginates on `Invitation`) and compute `UsersCount` **after** the page is determined.
- This keeps keyset pagination purely on tenant scalar fields and prevents correlated `Count()` from interfering with ordering translation.

**Suggested implementation sketch (service)**
```csharp
// 1) Base query over tenants only
var tenantsQuery =
	from tenant in _dbContext.Tenant
	where tenant.IsDeleted != true && tenant.Id != null
	select tenant;

// 2) Apply filters on tenantsQuery (q, status)
if (filters?.Search is { } search) {
	var pattern = $"%{search}%";
	tenantsQuery = tenantsQuery.Where(t =>
		EF.Functions.ILike(t.Name, pattern) ||
		EF.Functions.ILike(t.Code, pattern)
	);
}

if (filters?.Status is { } statuses && statuses.Count > 0) {
	tenantsQuery = tenantsQuery.Where(t => statuses.Contains(t.Status));
}

// 3) Apply keyset cursor filter + ordering on Tenant (no UsersCount here)
// SortFieldHandler should now target IQueryable<Tenant>
// - cursor value tuples: (DateTime, Guid?), (string, Guid?), etc.

// 4) Fetch effectiveLimit + 1 tenants
var tenantResults = await orderedTenantsQuery
	.Take(effectiveLimit + 1)
	.ToListAsync(cancellationToken);

// 5) Compute nextCursor from last tenant id
// 6) Load UsersCount in one additional query for the page tenantIds
var tenantIds = tenantResults.Select(t => t.GetRequiredId()).ToList();

var countsQuery =
	from ua in _dbContext.UserAccount
	where ua.Scope == AccountScope.Tenant
		&& ua.IsDeleted != true
		&& tenantIds.Contains(ua.TenantId)
	group ua by ua.TenantId into g
	select new { TenantId = g.Key, Count = g.Count() };

var counts = await countsQuery.ToListAsync(cancellationToken);
var countByTenantId = counts.ToDictionary(x => x.TenantId, x => x.Count);

// 7) Map DTO list items using countByTenantId.TryGetValue(id, out var c)
```

**Trade-offs**
- 2 queries per request (tenants page + counts), but:
  - avoids the EF translation pitfall,
  - is typically faster than a more complex join/group-by for large datasets,
  - mirrors Invitations’ “fetch base rows then enrich” pattern.

---

### CI-2 — Frontend must reset cursor pagination on filter changes (currently missing)

**What I saw**
- In `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`, both search and status changes call `setFilterStates(...)`, but do **not** call `resetCursorPagination?.()` first.
- Invitations table explicitly does this for its status filter.

**Why it’s critical**
- Filter changes invalidate cursor history. Without reset, the UI can request an old cursor under new filters and get:
  - “Cursor not found” 400s, or
  - incorrect pages / confusing pagination behavior.

**How to fix**
- Destructure `resetCursorPagination` from `useTableState(...)`.
- Call it before updating nuqs state for both handlers and inside the debounced callback.

**Suggested patch sketch**
```ts
const { resetCursorPagination, ...rest } = useTableState({ paginationMode: 'cursor', ... });

const debouncedSearch = useMemo(
  () =>
    _.debounce((value: string) => {
      resetCursorPagination?.();
      setFilterStates({ q: value, status: statusFilter });
    }, 300),
  [resetCursorPagination, setFilterStates, statusFilter],
);

const handleStatusChange = (event: SelectChangeEvent) => {
  const value = event.target.value;
  resetCursorPagination?.();
  setStatusFilter(value);
  setFilterStates({ q: globalFilter, status: value });
};
```

---

## 4) Recommended Improvements (Should-Fix)

### R-1 — Remove dead DTOs in `FindTenantsAsStaff.cs`

**What I saw**
- `TenantAsStaffItem` and `TenantAsStaffResult` exist but are not used by the new endpoint flow (response is `CursorPaginatedResult<TenantAsStaffListItem>`).

**Why**
- Dead code increases confusion and encourages “accidental reuse” later.

**Fix**
- Delete unused classes from `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`.

---

### R-2 — Tenants table default sorting references a column id that doesn’t exist in MRT columns

**What I saw**
- `defaultSorting` uses `{ id: 'created_at' }`, but the tenants table doesn’t define a `created_at` accessor column (unlike Invitations).

**Risk**
- MRT may ignore or behave inconsistently when the sorting state references a non-existent column id.

**Options**
- Option A (recommended): add `createdAt` (and optionally `updatedAt`) columns with explicit `id: 'created_at'` / `id: 'updated_at'`, even if hidden/secondary.
- Option B: change the default sort to `name` (but that changes backend default behavior).

---

### R-3 — `TenantRowDataMapper` should never generate random ids

**What I saw**
- `id: tenant.id || nanoid()`.

**Why**
- Random ids break row identity across renders; selection/pagination becomes unstable and debugging is harder.

**Fix**
- Treat missing `tenant.id` as a bug: either filter the row out or use a stable placeholder and log once.
- Strong preference: make backend always return `id` and remove the fallback.

---

### R-4 — Search/status filter UI isn’t fully aligned with the planned UX (multi-select + i18n)

**What I saw**
- Status filter is single-select (the backend accepts CSV multi-status).
- Search placeholder and “All” are hardcoded strings.

**Fix**
- Either:
  - implement multi-select now (recommended to match the plan), or
  - explicitly scope the plan down and document single-select as intentional for v1.
- Replace hardcoded strings with `t(...)` keys.

---

### R-5 — Status parsing method + validator have conflicting intent

**What I saw**
- Validator rejects invalid tokens (422), but `GetStatusesOrNull()` silently ignores invalid values and returns only valid ones.

**Fix**
- Since validator already enforces correctness, simplify `GetStatusesOrNull()` to assume valid input (or keep the strict behavior and remove “skip invalid” logic).
- If you *do* want “best effort”, then the validator must change to allow mixed values (but that conflicts with “uniform everywhere”).

---

## 5) Answers to Your Specific Questions

### Q1) “Can `q` be repeated across handlers — should it be reusable right away?”

Yes, this will repeat, but I would not rush a repo-wide abstraction unless we agree on a single semantic contract for all `q` searches (max length, normalization rules, which fields searched, etc.).

**Low-risk improvement now (recommended)**
- Add a small shared helper to normalize optional search strings, e.g.:
  - `MainApi.Src.Lib.Validation.QueryStringNormalization.NormalizeOptionalTrimmed(string? raw)`
  - or an extension method.

**Bigger abstraction (decision needed)**
- Introduce a shared query base class like `SearchableCursorPaginatedQuery : CursorPaginatedQuery` with:
  - `[FromQuery(Name="q")] string? Q { get; set; }`
  - `GetSearchNormalized()`

I can’t recommend doing the base-class approach “by default” without your explicit sign-off because it becomes a global convention that’s hard to unwind later.

---

### Q2) “Why lodash debounce? Doesn’t `react-use` have a hook?”

We should **not** use `react-use` here. It’s not very active and its CommonJS packaging can be awkward under Vite SSR/ESM.

**Decision (owner): drop `react-use`, use `minimal-shared/hooks` and standardize it.**
- Refactor list-page debouncing to use `useDebounce` from `minimal-shared/hooks`.
- Update:
  - `docs/guides/frontend-coding-standards.md`
  - `docs/guides/list-pages-search-filter-cursor-pagination.md`
  to make `minimal-shared/hooks` the standard for debouncing list-page URL filter updates.

---

### Q3) “I ran the app and got an error — why?”

The error in `apps/api/logs/error20260226.log` is an EF Core LINQ translation failure (query cannot be translated to SQL). It happens in `TenantAsStaffService.FindTenantsAsStaffAsync(...)` when executing the ordered query.

The fix is **CI-1** above: paginate on `Tenant` only, compute `UsersCount` separately after the page is determined.

---

## 6) Additional Notes / Consistency Checks

- Backend error semantics look correct:
  - invalid cursor format => 400 BadRequest (not 401),
  - cursor record not found => 400 BadRequest (matches Invitations),
  - invalid sortId => 400 BadRequest with allowlist.
- Status query param as CSV and lowercased tokens is aligned with the conventions we established.
- Frontend uses nuqs for URL state (good), but must integrate cursor reset properly.

---

## 7) Suggested Prompt to Ask Claude to Address All Findings

Paste this to Claude:

```md
We hit a runtime failure + correctness/convention gaps. Please address EVERYTHING in `docs/reviews/2026-02-26-phase3-tenant-list-implementation-review.md` on branch `phase-3-tenant-list-improvements`. Owner decisions are in section “0) Owner Decisions (Aki)” and should be followed.

Top priorities (Must-Fix):
1) Fix EF Core translation crash in `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs` (see CI-1). Recommended approach: paginate on `Tenant` only with keyset cursor + allowlisted sort fields, then fetch `UsersCount` for the returned tenantIds in a second query (like Invitations enriches base rows). Remove/avoid `TenantWithUsersCountRow` in the ordered query path.
2) In `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`, call `resetCursorPagination?.()` BEFORE updating URL filter state for both debounced `q` changes and `status` changes (see CI-2). Also ensure debounce cleanup remains correct.

Should-Fix:
- Remove unused DTOs in `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs` (R-1).
- Ensure `defaultSorting` column id exists in MRT columns (add `createdAt`/`updatedAt` columns with explicit `id: 'created_at'/'updated_at'`, or change default sort with rationale) (R-2).
- Remove `nanoid()` fallback for row ids; enforce backend always returns `id` and keep row identity stable (R-3).
- Align UI + i18n: avoid hardcoded “Search tenants…” / “All”, and either implement status multi-select CSV or explicitly document why single-select is intentionally kept (R-4).
- Make status parsing/validation intent consistent (R-5).

Decisions to apply:
- Q1 defer: do NOT introduce a shared `q` base query class yet.
- Q2 enforce `minimal-shared` debouncing: drop `react-use`, use `useDebounce` from `minimal-shared/hooks`, and update docs/guides to standardize this so we don’t repeat the same mistake.

After fixes, run:
- `make build-api`
- `make generate-client`
- `make tsc-front`
and paste outputs (or confirm green).
```
