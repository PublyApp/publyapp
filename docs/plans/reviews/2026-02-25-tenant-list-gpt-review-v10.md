# GPT Review (Round 11): Tenant List Improvements — “Revised v10” Final Go/No-Go Check

Date: 2026-02-25  
Plan reviewed: `docs/plans/2026-02-25-tenant-list-search-filter.md` (currently titled **REVISED v9**; latest change set described as “v10” in chat)

## 1) Verdict: **GO (ready to implement)**

The plan is now implementable end-to-end without known compile-time or core contract breakage:
- Cursor/keyset pagination flow matches the established Invitations pattern (optional cursor filter → always apply ordering → `limit + 1` → `NextCursor`).
- `updated_at` is consistently supported across backend sort handlers + Fluent API keyset index, and the frontend uses explicit snake_case MRT column IDs.
- Filters are URL-persisted (nuqs) and correctly reset cursor pagination before updating filter state.

---

## 2) Critical Issues (Must-Fix)

None found that would obviously block implementation (compile/contract/cursor correctness).

---

## 3) Recommended Improvements (Should-Fix)

### RI-1: Update the API contract table + key decisions to include `updated_at`

The plan now supports `updated_at`, but the API contract table row for `sortId` still says:
- “snake_case: `created_at`, `name`”

Update that line (and the “SortId format” key decision) to include `updated_at` so the doc matches the implementation.

### RI-2: Make the frontend hook plan explicit about new query parameters (cursor + q + status)

Task 5 currently only sketches a `useFindTenants` variables shape. Add one concrete snippet showing the `queryParameters` mapping so implementation is unambiguous and consistent with the generated Kiota client:

```ts
await client.staff.tenants.get({
  queryParameters: {
    cursor: params.cursor,
    limit: params.limit ? params.limit.toString() : undefined,
    sortId: params.sort?.id,
    sortOrder: params.sort?.order,
    q: params.q,
    status: params.status,
  },
});
```

Also call out removing legacy offset params (`page`) from tenant list calls once the endpoint switches to cursor pagination.

### RI-3: Align validator error message casing with “lowercase tokens” convention

The validator message still lists `Active,Pending,...` while the plan standardizes lowercase tokens (`active,pending,suspended,archived`). Update the message for consistency and copy/paste friendliness.

### RI-4: Migration completeness note (optional)

If your repo expects Down migrations to drop indexes/extensions, add a short note in the plan to implement the Down path for the pg_trgm migration (or explicitly state the project’s policy if you don’t roll back schema changes).

---

## 4) Questions (Optional)

1) Do we want `updated_at` to be exposed as a visible column (as in the plan) or only as a sorting option? (Either is fine, but decide intentionally.)

---

## 5) Final Notes

- With the keyset indexes `(created_at,id)`, `(updated_at,id)`, `(name,id)` plus the pg_trgm GIN indexes, this should scale reasonably for staff usage.
- After implementation: run `make build-api && make generate-client && make tsc-front` to keep the frontend client in sync with the new endpoint contract.

