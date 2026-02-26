# GPT Review: Phase 3 Tenant List Improvements (Category 3)

Date: 2026-02-25  
Scope: Review of `docs/plans/2026-02-25-tenant-list-search-filter.md` (Tenant list search/filter/bulk actions) for PublyApp.

This review is intentionally harsh. The goal is production-grade behavior, scalability, consistency with repo conventions (especially RFC 7807 + frontend logout semantics), and reusable patterns for future list pages.

---

## 1) Executive Summary

The plan is directionally correct (extend the existing staff tenants list endpoint with optional filters, wire filters into the table, and reuse existing mutations), but it currently underspecifies several **critical** correctness/UX/security/performance details. As written, it risks (1) breaking your API error-shape guarantees due to query param binding, (2) shipping an unscalable search implementation, and (3) implementing “bulk actions” with brittle row IDs and ambiguous partial-failure behavior. Additionally, the filtering model should be simplified: avoid redundant boolean filters (e.g. `IsSuspended`) when an enum filter already exists, and prefer multi-select enum filters (Status should accept multiple values). Fixing these now will pay dividends across every future list page.

---

## 2) Critical Issues (Must-Fix Before Implementation)

### CI-1: Query parameter binding can violate your RFC 7807 + 422 validation conventions

**Why critical:** Your codebase deliberately binds pagination query params as `string?` in `PaginatedQuery` and validates via `WithReqQueryValidation<T>()` to ensure consistent **422 ValidationProblem** responses (and avoid ASP.NET model-binding failures producing inconsistent 400s). Introducing binder-converted types (e.g. `bool?`, `enum`, `string[]`) reintroduces model binding failure paths for malformed values, which can produce inconsistent 400s.

**What’s wrong in the plan:**
- It proposes:
  ```csharp
  public bool? IsSuspended { get; set; }
  ```
  which relies on binder conversion.
- It also proposes a `TenantStatus.IsValid(status)` helper that does not exist (today `TenantStatus` is an enum in `apps/api/Src/Modules/Tenants/Entities/Tenant.cs`).

**How to fix:**
- Bind new query params as `string?` (consistent with `PaginatedQuery`), validate them, then parse safely.
- Add explicit parsing helpers on the query DTO (or a shared query parsing helper) and keep all parse failures behind FluentValidation so they return 422, not exceptions/400s.
- Prefer a single enum-based filter that can accept multiple values (e.g. status list) instead of a mix of enum + boolean flags (e.g. drop `IsSuspended` in favor of `Status=Suspended`).

**Concrete “Before / After”**

**Before (plan):**
```csharp
public class FindTenantsAsStaffQuery : PaginatedQuery {
    public string? Search { get; set; }
    public string? Status { get; set; }
}
```

**After (recommended):**
```csharp
public class FindTenantsAsStaffQuery : PaginatedQuery {
	[FromQuery] public string? Search { get; set; }
	// Multi-select status filter. Prefer comma-separated values in a single query param:
	// ?status=Active,Pending
	[FromQuery] public string? Status { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public IReadOnlySet<TenantStatus>? GetStatusesOrNull() {
		if (Status is null) {
			return null;
		}

		var trimmed = Status.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		// IMPORTANT: API accepts the human strings used by the UI ("Active", "Pending", ...)
		// because the API response already returns Tenant.GetStatusDescription(...)
		var statuses = new HashSet<TenantStatus>();
		foreach (var part in parts) {
			var status = part.ToLowerInvariant() switch {
				"pending" => TenantStatus.Pending,
				"active" => TenantStatus.Active,
				"suspended" => TenantStatus.Suspended,
				"archived" => TenantStatus.Archived,
				_ => throw new Exception("Unreachable if validator runs"),
			};
			statuses.Add(status);
		}
		return statuses;
	}
}
```

Validator (pattern-consistent):
```csharp
public class FindTenantsAsStaffQueryValidator
	: OffsetPaginatedQueryValidator<FindTenantsAsStaffQuery> {
	public FindTenantsAsStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200);

		RuleFor(x => x.Status)
			.Must(raw => {
				if (raw is null) {
					return true;
				}
				if (raw.Trim().Length == 0) {
					return true;
				}
				var parts = raw.Split(
					',',
					StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
				);
				if (parts.Length == 0) {
					return true;
				}
				return parts.All(p =>
					p.Equals("Pending", StringComparison.OrdinalIgnoreCase)
					|| p.Equals("Active", StringComparison.OrdinalIgnoreCase)
					|| p.Equals("Suspended", StringComparison.OrdinalIgnoreCase)
					|| p.Equals("Archived", StringComparison.OrdinalIgnoreCase)
				);
			})
			.WithMessage("Invalid status value.");
	}
}
```

This preserves your consistent 422 error format and prevents unexpected 400/500 behavior from model binding or parse exceptions.

---

### CI-2: The proposed search implementation (`ToLower().Contains()`) is a performance trap and is semantically sloppy

**Why critical:** Case-insensitive contains search on large tables will become a slow sequential scan without the right approach + indexes. It will also quietly allocate/compute `ToLower()` per-row at runtime (translated into `LOWER(column)` in SQL), which prevents normal b-tree index usage and makes performance deteriorate quickly.

**What’s wrong in the plan:**
- It proposes:
  ```csharp
  t.Tenant.Name.ToLower().Contains(search.ToLower())
  ```
  which in EF translates poorly for index use.
- It doesn’t define search semantics:
  - Is it “contains” or “prefix”?
  - Does it tokenize?
  - Do we treat consecutive spaces?
  - Should code search be exact/prefix (since codes are normalized lowercase)?

**How to fix (minimum viable, production-safe):**
1. Normalize the search string once (`trim`, optionally collapse whitespace).
2. Use database-native case-insensitive match:
   - Prefer `EF.Functions.ILike(...)` for PostgreSQL.
3. Add the right indexes if you keep “contains” semantics:
   - For `ILIKE '%term%'`, you want `pg_trgm` + GIN indexes (or accept that it won’t scale).

**Recommended query fragment:**
```csharp
var q = filters.Search; // already normalized
if (q is not null) {
	var pattern = $"%{q}%";
	query =
		from t in query
		where EF.Functions.ILike(t.Tenant.Name, pattern)
			|| EF.Functions.ILike(t.Tenant.Code, pattern)
		select t;
}
```

**Why not jump straight to Postgres full-text search (FTS)?**
- If your UX is “type a few characters, match substrings in name/code”, FTS is not the best fit. FTS shines for tokenized word search + ranking, not arbitrary substring matching (especially for code-like fields).
- For “contains” behavior, `pg_trgm` indexes typically outperform FTS in both implementation complexity and UX alignment.
- If you want “Google-like” search (words, relevance ranking) for tenant names at 10k+ scale, then yes: consider FTS for `Name` specifically, while keeping `Code` on trigram/prefix.

**Index recommendation (Postgres):**
- Default recommendation for this feature set: **trigram**.
  - Enable extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  - Add indexes:
    - `CREATE INDEX CONCURRENTLY ... ON tenants USING gin (name gin_trgm_ops);`
    - `CREATE INDEX CONCURRENTLY ... ON tenants USING gin (code gin_trgm_ops);`
- If you can accept prefix search (often good enough, much faster):
  - Use `ILIKE 'term%'` and store/search normalized fields (or add an expression index on `lower(name)`).

**Also note:** SQL injection is not the risk here (EF parameterization protects you). The risk is **performance** and ambiguous semantics.

---

### CI-3: Export should be dropped from this phase (no clear value + high complexity)

**Why critical:** Export has non-trivial product semantics (current page vs all matches), performance/security concerns, and requires additional conventions (file formats, limits, streaming, auditing) to be done responsibly. If it doesn’t provide clear value right now, it is the wrong feature to ship “just because it’s on the list”.

**What’s wrong in the plan:** It includes export as a medium-priority item without any validated user workflow, while the underlying list is server-paginated (making naive client export incorrect by default).

**How to fix:** Remove export from this phase. Reintroduce it only when there is a real need, and then design it intentionally (scope, limits, permissions, audit logs, CSV injection protections, streaming/async job).

---

### CI-4: “Bulk actions” plan is incomplete (API strategy, partial failures, and UI state are not defined)

**Why critical:** Bulk operations are high-risk UX. Users will select many rows, expect a single confirmation, and expect clear success/failure reporting. Doing N individual API calls without a plan will produce:
- partial failure ambiguity,
- noisy toasts,
- slow UI,
- and awkward retry behavior.

**What’s missing in the plan:**
- No decision: batch API endpoint vs individual calls.
- No partial failure strategy (some succeed, some fail).
- No transaction/atomicity expectations.
- No explicit limit (e.g. “max 100 selected”) to protect your API and DB.
- No “permission semantics” if a bulk endpoint is introduced.

**How to fix:**
- Decide now:
  - If you want speed + clarity: create **bulk endpoints**.
  - If you want minimum backend churn: do individual calls but with:
    - concurrency limit (e.g. 5–10),
    - single summary toast,
    - and a per-row result report.

**Recommended bulk endpoint shape:**
```csharp
public record BulkSuspendTenantsAsStaffBody {
	public required List<Guid> TenantIds { get; init; }
	public string? Reason { get; init; }
}

public record BulkActionFailure(Guid TenantId, string Code, string Message);

public record BulkSuspendTenantsAsStaffResult {
	public required int Requested { get; init; }
	public required int Succeeded { get; init; }
	public required List<BulkActionFailure> Failures { get; init; }
}
```

**UX requirement:** after the action, clear selection, refresh data once, and show a single summary (“12 suspended, 3 failed” with a “View details” expandable list).

---

### CI-5: Frontend row IDs are not guaranteed stable today (this will break selection/bulk actions)

**Why critical:** The current mapper uses `tenant.id || nanoid()`; bulk selection *requires stable IDs* or selection will drift between renders/pages/refreshes.

**What’s wrong in current code (`tenants-table.tsx`):**
```ts
id: tenant.id || nanoid(),
```

If `tenant.id` is ever missing due to a client-gen quirk or data edge-case, you silently generate random IDs, which:
- breaks links (`/staff/tenants/{id}`),
- breaks selection (row identity changes),
- breaks bulk actions (you’ll send IDs that don’t exist).

**How to fix:**
- Treat missing IDs as a hard error (throw) or render a non-selectable “invalid row”.
- In MRT config, set `getRowId` to `row.id` so selection keys are always tenant IDs.

---

### CI-6: The plan violates existing i18n file conventions

**Why critical:** Your guides say translations live under `packages/shared/lib/i18n/json/...` (not `packages/shared/src/i18n/en.json`). Following the plan will create “orphaned” translations not copied into the frontend build (see `apps/front/_vite/copy-i18n-files.ts`).

**How to fix:**
- Put UI strings in `packages/shared/lib/i18n/json/en/common.json` (and `fr/...` if you support it).
- Put response-message / toast keys in `packages/shared/lib/i18n/json/en/response-message.json` when appropriate.

---

## 3) Recommended Improvements (High Priority)

### RI-1: Avoid “parameter explosion” by introducing a filters args record, and unify Count + Find query construction

**Problem:** The plan adds `search`, `status`, `isSuspended` as optional args to both `FindTenantsAsync` and `CountTenantsAsync`. This tends to grow into a 10+ param method over time and causes divergence between count and data queries.

**Recommendation:** Introduce a record `FindTenantsAsStaffFilters` (or similar) and a shared private query builder.

**Example:**
```csharp
public record FindTenantsAsStaffFilters(
	string? Search,
	TenantStatus? Status,
	bool? IsSuspended
);

private IQueryable<TenantAsStaffItem> BuildFindTenantsQuery(FindTenantsAsStaffFilters filters) {
	var query =
		from tenant in _dbContext.Tenant.AsNoTracking()
		where tenant.IsDeleted != true
		join userAccount in _dbContext.UserAccount.AsNoTracking()
				.Where(ua => ua.Scope == AccountScope.Tenant && ua.IsDeleted != true)
			on tenant.Id equals userAccount.TenantId into userAccounts
		select new TenantAsStaffItem {
			Tenant = tenant,
			UsersCount = userAccounts.Count()
		};

	if (filters.Search is not null) {
		var pattern = $"%{filters.Search}%";
		query =
			from t in query
			where EF.Functions.ILike(t.Tenant.Name, pattern)
				|| EF.Functions.ILike(t.Tenant.Code, pattern)
			select t;
	}

	if (filters.Status is not null) {
		query =
			from t in query
			where t.Tenant.Status == filters.Status.Value
			select t;
	}

	if (filters.IsSuspended is not null) {
		query =
			from t in query
			where t.Tenant.IsSuspended == filters.IsSuspended.Value
			select t;
	}

	return query;
}
```

Then:
- `FindTenantsAsync(...)` uses `BuildFindTenantsQuery(filters)` + sort + skip/take.
- `CountTenantsAsync(...)` uses a *parallel* `BuildCountQuery(filters)` that does not join user accounts (unless absolutely necessary).

This prevents the “count query doesn’t match find query” class of bugs.

---

### RI-2: Define filter semantics precisely (especially Status vs IsSuspended)

Right now your domain has both:
- `Tenant.Status` enum (Pending/Active/Suspended/Archived)
- `Tenant.IsSuspended` boolean

They are intended to be consistent (Suspend sets both, Reactivate sets both), but any mismatch (historic data, bugs, manual DB edits) will produce confusing filter results.

**You need a documented contract:**
- Avoid redundant filters. If the UI needs a “Suspended only” control, it should be a shortcut that sets status selection to include only `Suspended`.
- Prefer a multi-select enum filter: Status should accept multiple values (e.g. `Active,Pending`) and the server should interpret that as `Status IN (...)`.

**Recommended simplification:** Drop `IsSuspended` from the endpoint. Use status selection for suspension filtering.

---

### RI-3: Persist filter state in the URL (consistent with `useTableState`) and reset pagination on filter changes

You already persist pagination + sorting in the URL via `useTableState` (nuqs). Adding local-only filters creates a jarring UX:
- refresh loses filters,
- users can’t share a filtered link,
- back/forward navigation becomes inconsistent.

**Recommendation:** Use nuqs (`useQueryStates`) for filters too.

**Example hook pattern (recommended new convention):**
```ts
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';

const _status = ['Active', 'Pending', 'Suspended', 'Archived'] as const;

export const useTenantListFilters = () => {
	const [filters, setFilters] = useQueryStates({
		q: parseAsString.withDefault(''),
		status: parseAsStringLiteral(_status).withDefault(''),
		suspended: parseAsString.withDefault(''), // "true" | "false" | ""
	});

	return { filters, setFilters };
};
```

**Reset pagination behavior:** on any filter change, force `page=1`. With your existing `useTableState`, call `setPaginationState({ page: '1', pageSize: ... })` (or provide a helper in `useTableState` like `resetOffsetPagination()`).

---

### RI-4: Add debouncing with a clear policy (and avoid spamming history)

**Recommendation:**
- Debounce the *API-driving* search value by ~250–400ms.
- Update the visible input immediately.
- If URL is updated per keystroke, ensure it uses “replace” semantics (not “push”) or only write to URL after debounce/Enter.

**Example (client-only route):**
```ts
const [searchInput, setSearchInput] = useState(filters.q);
const debouncedSearch = useMemo(() => _.debounce((v: string) => {
	setFilters({ q: v });
}, 300), [setFilters]);

useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);
```

Also: trim search before sending to API; treat empty/whitespace as “no filter”.

---

### RI-5: Future export security (if reintroduced): prevent CSV/Excel formula injection

Export is out of scope for this phase, but if/when you reintroduce CSV export: when users open CSV in Excel/Sheets, values starting with `=`, `+`, `-`, or `@` can be interpreted as formulas (CSV injection).

**Mitigation (client or server):**
- For each exported string cell, if it starts with one of those characters, prefix with `'` or `\t`.

**Example:**
```ts
const sanitizeCsvCell = (value: string) => {
	const trimmed = value.trimStart();
	return /^[=+\\-@]/.test(trimmed) ? `'${value}` : value;
};
```

This is a real security issue if tenant names/codes are user-controlled.

---

## 4) Suggestions (Nice-To-Have / Medium Priority)

- Add “Clear filters” button and show active filters as chips.
- Show result count (“123 tenants”) and selected count in the bulk toolbar.
- Provide a “No results” empty state with guidance (“Try clearing filters”).
- Consider virtualized rows if you ever allow large `limit` values client-side (MRT supports virtualization patterns).
- Consider “starts with” search on code (fast) + contains search on name (slower) for a pragmatic compromise.
- Consider a `searchFields` concept for future lists (e.g., code/name/email).

---

## 5) Code Examples & Alternative Implementations

### 5.1 Backend: Safer, consistent filters + counting

**Scenario:** You add filters now and later add “statusUpdatedAfter” or “minUsersCount”. If you keep adding optional method parameters, the service becomes unmaintainable.

**Alternative implementation (filters record + query builder)** was shown in RI-1.

**Trade-offs:**
- Pros: prevents Count/Find divergence; scales cleanly.
- Cons: slightly more boilerplate now.

---

### 5.2 Backend: Cursor-based pagination for search?

**Do you need cursor pagination for search?** Not necessarily right now.

**Offset pagination is acceptable when:**
- data size is modest (hundreds/thousands),
- staff-only usage,
- and you accept that results can “shift” if data changes while paging.

**Cursor pagination is better when:**
- large datasets (10k+),
- frequent writes,
- strict consistency expectations,
- and you want stable next-page performance.

**But:** cursor pagination with flexible filters/search requires careful cursor design and stable sorting keys. Your current tenant list already supports offset and sorting; the plan’s decision to keep offset for now is fine *if you add search indexes and keep limit sensible*. Document this explicitly.

---

### 5.3 Frontend: Bulk actions without a bulk endpoint (acceptable fallback)

If you choose not to add bulk endpoints yet, do this at minimum:

```ts
import pLimit from 'p-limit';

const limit = pLimit(5);
const results = await Promise.allSettled(
	selectedTenantIds.map((tenantId) =>
		limit(async () => suspendTenantAsync({ tenantId })),
	),
);

const failures = results
	.map((r, idx) => ({ r, tenantId: selectedTenantIds[idx] }))
	.filter((x) => x.r.status === 'rejected');
```

Then:
- show one summary toast,
- display details for failures,
- invalidate list query once,
- clear selection.

**Trade-offs:**
- Pros: no backend changes.
- Cons: slower, harder to explain partial failures, more client complexity.

---

## 6) New Conventions (Proposed Rules for Future Search/Filter Features)

### Convention N-1: Query params are strings + validated + parsed (no binder conversion)

For any endpoint using `WithReqQueryValidation<TQuery>()`:
- **All query parameters should be `string?`** on the DTO.
- Validators ensure parseability and allowed values.
- DTO exposes `GetXOrNull()` parsing helpers.

This preserves consistent 422 RFC 7807 validation failures and avoids binder-driven 400s.

### Convention N-2: Filters live in URL for list pages

All staff list pages:
- persist filters via nuqs (like `useTableState`),
- reset pagination on filter changes,
- debounce search inputs.

Suggested URL keys:
- `q` (search text)
- `status` (comma-separated enum strings for multi-select)
- keep existing `page`, `size`, `sort_id`, `sort_order`.

### Convention N-3: Shared “list filter hook” per list page

Each list route should create a small, local hook (or a shared helper) to:
- define query keys + parsers,
- normalize values,
- and output API variables.

This reduces copy/paste bugs and standardizes behavior.

### Convention N-4: Bulk actions must specify limits + partial failure UX

Bulk action design must include:
- max selection count (e.g., 100),
- server-side cap enforcement if bulk endpoint exists,
- summary + failure details UI,
- and single refresh/invalidation.

---

## 7) Questions (Things to Clarify Before Proceeding)

1. Status multi-select encoding: do we standardize on `status=Active,Pending` or `statuses=Active,Pending` across the app?
2. Search semantics: contains vs prefix? Should code be exact/prefix?
3. Expected tenant scale: 100? 10,000? This directly affects search/index decisions (trigram vs FTS vs hybrid).
4. Bulk actions: do you accept partial success, or should actions be atomic?
5. Internationalization: do you require French strings now, or is English-only acceptable short-term?

---

## 8) Alternative Approaches (If Redesigning)

### Alt-A: Introduce a reusable “ListQuery” pattern across backend modules

Define a generic pattern:
- `ListQuery` DTO (strings only)
- `ListQueryValidator`
- `ListQueryParser`
- `ListQueryBuilder` in service

Then every list endpoint becomes consistent (search/filter/sort/pagination/count).

### Alt-B: Full-text search (Postgres FTS)

If search needs to scale and be “smart” (tokenization, ranking):
- maintain a `tsvector` column or computed expression,
- query via `to_tsvector` and `plainto_tsquery`,
- optionally add ranking.

---

## Closing Notes

- The plan text says “.NET 9” while the prompt context says “.NET 10”. This isn’t inherently a problem, but it’s a signal the plan may not be anchored to the actual repo state. Confirm target framework + generator behavior before implementing.
- The plan’s overall approach can work well, but only if you tighten the contracts (query parsing/validation), define filter semantics, and put in the baseline performance/security guardrails now.
 - Export is intentionally dropped from this phase per current product preference. If reintroduced later, ensure you include CSV injection mitigation for CSV exports (values beginning with `=`, `+`, `-`, `@`), plus clear scope (“current page” vs “all matches”) and limits.
