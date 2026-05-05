# GPT Review (Round 8): Tenant List Improvements — REVISED v7 Go/No-Go Check

Date: 2026-02-25  
Plan reviewed: `docs/plans/2026-02-25-tenant-list-search-filter.md` (REVISED v7)

## 1) Verdict: **NO-GO (one small but critical frontend contract fix remaining)**

Backend cursor pagination is now structurally correct and matches the Invitations keyset flow (typed row, nested types, ApplyFilter returns `IQueryable`, and ordering is always applied after cursor filtering). The `pg_trgm` migration approach is now explicitly justified.

The remaining blocker is on the frontend: with `sortId` locked to **snake_case**, the plan still doesn’t ensure Material React Table emits **snake_case column IDs** when the user changes sorting. That will cause immediate `400 BadRequest` (“Invalid sortId”) during normal usage.

---

## 2) Critical Issues (Must-Fix)

### CI-1: MRT column IDs are not explicitly set to snake_case → sorting will send invalid `sortId`

**What’s locked by the plan**
- Frontend sends `sortId` as snake_case (`created_at`, `name`)
- Backend only allows `created_at` and `name`
- Invalid `sortId` returns `400 BadRequest` (correct behavior)

**What’s missing**
The plan only sets:

```ts
const defaultSorting = { desc: true, id: 'created_at' };
```

…but does not show (or require) setting `id` on the actual MRT column definitions. Without explicit IDs:
- MRT typically uses accessor keys like `createdAt`
- On header click, it will emit `id: 'createdAt'`
- Backend receives `sortId=createdAt` → returns 400 → table “breaks” on sort interaction

**Why it’s critical**
Cursor pagination correctness depends on deterministic, valid sorting. If sorting can’t be changed safely, users will hit hard errors in normal flows.

**How to fix (copy Invitations table pattern)**
In `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`, explicitly set snake_case IDs for sortable columns:

```ts
columnHelper.accessor('name', {
  id: 'name',
  header: t('name'),
});

columnHelper.accessor('createdAt', {
  id: 'created_at',
  header: t('created-at'),
});
```

If you also support sorting by `updated_at` later, it must likewise be `id: 'updated_at'` (and added to the backend handler dictionary + allowed list).

---

## 3) Recommended Improvements (Should-Fix)

### RI-1: Clean up plan drift (“revised v5” text still present)

The plan header is now REVISED v7, but the Summary section still says “This revised v5 plan…”. Update that so implementers don’t follow stale assumptions.

### RI-2: Make status tokens convention explicit (lowercase end-to-end)

The validator and parsing support lowercase tokens, and Invitations uses lowercase. The plan still includes:
> “convert to Title case when sending to API”

That should be removed unless you intentionally want mixed casing. Recommendation: **lowercase tokens in URL and API** (`status=active,pending`) and map to `TenantStatus` server-side.

### RI-3: Avoid `throw new Exception(...)` in `GetStatusesOrNull()`

Even if query validation should always run, it’s safer for plan/code to avoid “validator-dependent unreachable exceptions” on request parsing.

Preferred approaches:
- Return `null` (treat as no filter) and let validator enforce correctness; or
- Return a typed error earlier (but that’s more plumbing).

Not a blocker if `.WithReqQueryValidation<FindTenantsAsStaffQuery>()` is guaranteed, but it’s a sharp edge.

### RI-4: Consider escaping `%` and `_` in the `q` LIKE pattern

Current plan uses:
```csharp
var pattern = $"%{search}%";
```

If a user types `%` or `_`, LIKE semantics change. This isn’t “SQL injection” (it’s still parameterized), but it can unintentionally broaden queries and degrade performance. Decide whether that’s acceptable for your UX.

---

## 4) Questions (Need confirmation)

1) Do we standardize **status tokens** to lowercase everywhere (`active,pending,archived,suspended`), including UI → URL → API?
2) For `pg_trgm` migrations: do you want a repo-wide convention document for “Postgres extensions + concurrent indexes via raw SQL” (since this is new in `apps/api/Migrations`)?

---

## 5) Final Notes

- Backend cursor/keyset logic is now in the “expected shape” per `docs/guides/cursor-keyset-pagination-guide.md` and the Invitations implementation.
- Once CI-1 (explicit MRT column IDs) is reflected in the plan, this should be **GO** to implement with low churn.

