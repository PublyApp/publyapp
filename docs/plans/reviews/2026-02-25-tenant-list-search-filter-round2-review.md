# Round 2 Plan Review: Tenant List Search/Filter/Bulk (Cursor Pagination Update Required)

Date: 2026-02-25  
Reviewed plan: `docs/plans/2026-02-25-tenant-list-search-filter.md` (REVISED)  
Prior review baseline: `docs/plans/2026-02-25-tenant-list-gpt-review.md`

This is a go/no-go readiness check before implementation. It captures remaining blockers and what must change now that the team decided: **convert the staff tenants list endpoint to cursor-based pagination**.

---

## Verdict

**Not ready to implement yet.**  
The plan is close, but it has several concrete contract/implementation mismatches that will cause immediate breakage or stall. Additionally, the plan must be updated to specify the cursor pagination contract + backend keyset strategy + frontend table preset changes.

---

## Blockers (Must fix before coding)

### B1) Query param name mismatch: `q` vs `Search`

The plan’s API contract uses `?q=acme`, but the query DTO example defines:

```csharp
[FromQuery] public string? Search { get; set; }
```

That will bind `?search=...`, not `?q=...`, unless you explicitly map it:

```csharp
[FromQuery(Name = "q")] public string? Search { get; set; }
```

**Action:** Pick one and make it consistent across:
- API contract section
- C# DTO `[FromQuery(Name=...)]` usage
- Frontend hook queryParameters field name
- URL filter state key

Recommendation: keep URL key and API key as `q` for brevity, but bind via `[FromQuery(Name="q")]`.

---

### B2) Sorting parameter mismatch: `sort_id`/`sort_order` vs `sortId`/`sortOrder`

In the repo today:
- Backend pagination DTOs (`PaginatedQuery` / `CursorPaginatedQuery`) expose `SortId` / `SortOrder` which bind query params as `sortId` and `sortOrder`.
- Frontend Kiota calls already use `queryParameters: { sortId, sortOrder }`.
- `useTableState` stores URL state using `sort_id`/`sort_order` (nuqs keys), but that’s an internal frontend convention.

**Action:** In the plan, distinguish clearly:
- **API query params:** `sortId`, `sortOrder`
- **URL-state keys (nuqs):** `sort_id`, `sort_order`

Do not claim the API accepts `sort_id`/`sort_order` unless you explicitly add `[FromQuery(Name="sort_id")]` (not recommended; it would diverge from existing endpoints).

---

### B3) The pg_trgm “migration step” is not implementable as written

The plan proposes:
```sql
CREATE INDEX CONCURRENTLY ...
```

EF migrations run in a transaction by default, and Postgres disallows `CREATE INDEX CONCURRENTLY` inside a transaction.

**Action:** Update the plan with one of these executable options:

Option A (simplest, acceptable early): **non-concurrent** indexes (locks table)
- Use EF `migrationBuilder.Sql("CREATE INDEX ...");` without CONCURRENTLY.

Option B (better for production): **concurrent** indexes with suppressed transaction
- Use EF migration SQL with `suppressTransaction: true` (and document that this migration must not be wrapped).

Also: decide where to add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (same concerns).

---

### B4) Frontend filter hook attempts to reset `page` but pagination is owned by `useTableState`

Task 5 defines:
```ts
const [filters, setFilters] = useQueryStates({ q, status });
setFilters({ ...updates, page: '1' });
```

But `filters` does not include `page`, and in this codebase pagination state lives in `useTableState` (nuqs keys `page`/`size` by default, or custom keys).

**Action:** The plan must show the real wiring:
- Keep filters in nuqs (good).
- Reset pagination via `useTableState` setters (or add a helper like `resetOffsetPagination()` / `resetCursorPagination()` depending on pagination mode).

With cursor pagination (new requirement), this becomes:
- Call `resetCursorPagination()` when filters change.

---

### B5) Debounce implementation uses a dependency that is not present

Plan uses:
```ts
import { useDebouncedCallback } from 'use-debounce';
```

`use-debounce` is not currently in the repo (search found it only in the plan doc).

**Action:** Update plan to use an existing pattern:
- Lodash debounce (already used in codebase, e.g. `apps/front/src/components/floating-card.tsx`), or
- Add the dependency explicitly (not recommended for one use).

---

### B6) Status multi-select UI component is likely incorrect

Plan uses:
```ts
import { MultiSelect } from 'material-react-table';
```

This is not a standard MRT export/pattern used elsewhere in the repo. Existing list pages typically implement filtering controls with **MUI components** (e.g. `Select`, `MenuItem`, `FormControl`) outside the table (see `staff-invitations-table.tsx`).

**Action:** Update plan to use MUI:
- `Select` with `multiple` (simple), or
- `Autocomplete multiple` (better UX).

---

## New Requirement: Convert tenants list endpoint to cursor pagination

This is a substantive change. The current revised plan still describes offset pagination (`page`/`limit`, `Count` result) and MRT config (`rowCount`, `manualPagination`) consistent with offset.

### What must change in the plan (minimum)

#### C1) API contract

Update contract to cursor shape (consistent with other staff cursor endpoints):

```
GET /staff/tenants?cursor={guid?}&limit={n}&sortId={field}&sortOrder={asc|desc}&q={search?}&status={csv?}
```

Response should become cursor-based, i.e.:
- `data: TenantAsStaffItem[]`
- `nextCursor: string | null`

Do **not** require `count` for cursor pagination (the UI cursor preset doesn’t use it).

#### C2) Backend DTO + validator base class

Switch:
- from `PaginatedQuery` + `OffsetPaginatedQueryValidator<T>`
- to `CursorPaginatedQuery` + `CursorPaginatedQueryValidator<T>`

Maintain the “string-only query params + validation + parsing helpers” approach for `q` and multi-status.

Cursor itself is already `string?` in `CursorPaginatedQuery`. Decide and document:
- whether invalid cursor format returns 422 (validator) or 400 (handler). Existing handlers often return 400 for “invalid cursor” (see `FindAuditLogs` / `FindStaffInvitations`).

#### C3) Backend service method signatures + keyset logic

You must specify:
- what the cursor represents (tenant id? created_at+id?),
- what sort fields are supported for cursor pagination,
- and the tie-breaker (always include `Id` as a secondary sort).

**Important:** supporting arbitrary sortId values with cursor pagination is non-trivial.

To keep this implementable, the plan must explicitly choose one of:

Option A (recommended for scope): **limit allowed sortId** for cursor pagination initially
- e.g. only `created_at` (or `createdAt`) and maybe `name`
- reject unsupported sortId with a clear 400 BadRequest (pattern used elsewhere)

Option B: implement cursor logic per supported sortId
- significantly more work; plan must include per-field cursor encoding/decoding and indexes

Also include required indexes for keyset (e.g. `(created_at, id)` on non-deleted tenants).

#### C4) Frontend table integration

Switch tenants list to cursor table preset and cursor pagination wiring (pattern: staff invitations):
- use `useTableState({ paginationMode: 'cursor' })`
- `useFindTenants` uses `cursor` + `limit` + sort
- `useEffect` sets `setNextCursor(data?.nextCursor)`
- use `useMRTTable('minimal-cursor', ...)` (no rowCount)

Filtering changes must call `resetCursorPagination()` (not “page=1”).

---

## Ready-to-Implement Checklist

I would consider the plan ready once it:

1) Fixes param naming consistency (`q`, `status`, `sortId`, `sortOrder`, `cursor`, `limit`)
2) Replaces all offset references with cursor pagination design + response shape
3) Defines allowed `sortId` values for cursor pagination (and error behavior for invalid/unsupported)
4) Replaces `use-debounce` dependency with lodash debounce (or adds the dependency explicitly)
5) Uses MUI multi-select components (not a speculative MRT `MultiSelect`)
6) Correctly wires filter state (nuqs) + cursor pagination reset via `resetCursorPagination()`
7) Makes the pg_trgm/index migration step executable (transaction vs concurrent)

---

## Summary: Are we ready to implement?

**No**—the plan needs one more revision to:
- correct concrete mismatches (q/search, sort_id/sortId, debounce lib, pagination reset)
- and incorporate cursor pagination end-to-end (API, backend service, frontend hooks, table preset).

Once that revision is done, implementation should be straightforward, especially by copying the proven cursor patterns from:
- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs`
- `apps/front/src/routes/authed/staff/invitations/list/parts/staff-invitations-table.tsx`

