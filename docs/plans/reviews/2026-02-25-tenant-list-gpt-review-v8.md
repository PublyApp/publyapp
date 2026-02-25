# GPT Review (Round 9): Tenant List Improvements — “Revised v8” Go/No-Go Check

Date: 2026-02-25  
Plan reviewed: `docs/plans/2026-02-25-tenant-list-search-filter.md` (file currently titled **REVISED v7**, but Minimax message claims “Revised v8”)

## 1) Verdict: **NO-GO (one contract mismatch that will break sorting)**

The plan is extremely close and the backend cursor/keyset flow is now aligned with the Invitations pattern. However, the frontend plan introduces a sortable `updated_at` column while the backend still only allows `created_at` and `name`. That mismatch will cause immediate `400 BadRequest` errors the first time a user sorts by “Updated at”.

Fix the sortId contract (either remove/disable that column sort, or add backend support) and you’re ready to implement.

---

## 2) Critical Issues (Must-Fix)

### CI-1: Frontend emits `sortId=updated_at`, but backend does not allow or implement it

**What the plan currently says (backend)**

Allowed sort fields section:
- `created_at` (default)
- `name`

Service `sortFieldHandlers` dictionary only defines:
- `created_at`
- `name`

**What the plan currently says (frontend)**

It adds a sortable MRT column:

```ts
columnHelper.accessor('updatedAt', {
  id: 'updated_at',
  header: t('updated-at'),
})
```

**Why it’s critical**
- MRT will emit `sortingState = [{ id: 'updated_at', ... }]` when users click that header.
- `useTableState` will push `sort_id=updated_at` into the URL.
- The API call will send `sortId=updated_at`.
- Backend will return `400 BadRequest` (“Invalid sortId”), breaking a basic table interaction.

**How to fix (pick ONE option and make it explicit in the plan)**

**Option A (recommended / minimal scope): don’t support updated_at sorting**
- Keep backend as-is (`created_at`, `name` only).
- Change the frontend column to be non-sortable and/or remove `id: 'updated_at'`.

Example plan snippet:

```ts
columnHelper.accessor('updatedAt', {
  header: t('updated-at'),
  enableSorting: false,
})
```

**Option B: support updated_at sorting end-to-end**
- Update the “Allowed Sort Fields” section to include `updated_at`.
- Add `["updated_at"]` handler to `sortFieldHandlers`:
  - `getCursorValue`: select `{ UpdatedAt, Id }`
  - `applyFilter`: compare `(UpdatedAt, Id)` with correct asc/desc semantics
  - `applyOrdering`: `OrderBy(UpdatedAt).ThenBy(Id)` (direction must match)
- Add a matching b-tree keyset index via Fluent API: `(updated_at, id)` with `is_deleted=false`.

Until one of these is done, the plan is not implementable without churn.

---

## 3) Recommended Improvements (Should-Fix)

### RI-1: Make the plan version consistent (v8 vs v7)

- The file title still says **REVISED v7** while the update claim is v8.
- The “Summary” section references “revised v7”.

This is small, but it causes review confusion and increases the chance someone follows stale assumptions.

### RI-2: Validator/message casing should match the “lowercase end-to-end” status convention

You’ve standardized on lowercase tokens (`active,pending,suspended,archived`). Update the validator message accordingly (currently it shows `Active,Pending,...`).

### RI-3: Don’t silently skip invalid status values in `GetStatusesOrNull()`

Current behavior skips unknown tokens:
```csharp
_ => null, // skip
```

If query validation is ever accidentally removed from the endpoint, invalid status values would be silently ignored (hard to debug).

Preferred:
- Keep validation required (as now), and
- Make parsing strict (e.g., return a special “invalid” signal, or throw `InvalidOperationException` with a message that indicates validation is missing).

Not a functional blocker if `.WithReqQueryValidation<FindTenantsAsStaffQuery>()` is guaranteed, but it’s a reliability footgun.

---

## 4) Questions

1) Do we want `updated_at` sorting as a product feature right now (Option B), or should we keep the initial scope minimal (Option A)?
2) Do you want to enforce `tenant.Id != null` in the base query (Invitations does this) for consistency, even if DB guarantees it?

---

## 5) Final Notes

- Once the `updated_at` sortId mismatch is resolved, I expect this to be **GO**.
- Everything else (cursor flow, filters, URL-state, debounce, bulk action fan-out with concurrency limit) is in a reasonable, convention-aligned shape.

