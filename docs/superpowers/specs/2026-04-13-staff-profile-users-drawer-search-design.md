# Staff Profile Users Drawer: Server Search + Infinite Loading

## Context

The staff profile details page includes a `Users` tab with a right-side assignment drawer.

Current shortcomings:

- the drawer fetches a fixed page of staff users and filters client-side
- search is not server-driven, so large datasets do not scale
- each row shows repeated `Assign` / `Assigned` text buttons, which feels visually heavy
- the drawer content scrolls as one block instead of keeping the title/search area fixed
- assignment currently depends on fetch-before-write profile replacement semantics per row
- rapid repeated assign interactions need explicit race-safe optimistic handling

This feature upgrades the drawer to the same search/pagination quality bar already used by the repo's stronger list endpoints.

## Goals

- use server-side search for the drawer user picker
- use the same backend pattern as other `q` + cursor-paginated endpoints
- support infinite loading in the drawer list
- keep the drawer header fixed while only the list scrolls
- replace heavy text row actions with subtle icon actions
- allow immediate unassign from the drawer for already-assigned users
- support safe optimistic assign/unassign with race-aware query handling

## Non-Goals

- redesign the main profile users table
- add confirmation dialogs for assign/unassign
- add a dedicated batch assign/unassign endpoint
- introduce a second assignment UI separate from the drawer

## Backend Design

### Endpoint Contract

Upgrade staff user search to match the repo's cursor-pagination conventions instead of staying on offset pagination.

Target route:

- `GET /staff/users`

Target query shape:

- `cursor`
- `limit`
- `sort_id`
- `sort_order`
- `q`

### Search Semantics

Search remains case-insensitive substring matching on:

- `email`
- `first_name`
- `last_name`

This mirrors the existing staff/tenant search semantics already used elsewhere.

### Sorting

Allowed sort fields should stay explicit and validated. Reuse the current meaningful sortable fields:

- `created_at`
- `updated_at`
- `email`
- `first_name`
- `last_name`
- `status`
- `level`

The endpoint should return the standard cursor-paginated response shape used by the repo's newer list endpoints:

- `data`
- `nextCursor`

There is no backward-compatibility requirement here. `FindStaffUsers` should be upgraded cleanly, and every existing frontend consumer of that endpoint must be updated to the new canonical contract.

### Service Layer

Replace the current offset-based `FindStaffUsersAsync(page, limit, ...)` pathway with a cursor-based args record aligned with repo rules.

Recommended service additions:

- `FindStaffUsersArgs`
- `FindStaffUsersFilters`
- `FindStaffUsersResult`

Behavior:

- apply `q` server-side
- enforce explicit sort field handling
- use stable keyset ordering with `Guid` tiebreakers
- include suspended staff users, consistent with the current staff-management visibility rules
- continue excluding deleted users and deleted staff accounts

This should follow the same architectural pattern already used by the stronger tenant/invitation list endpoints rather than a drawer-specific shortcut.

## Frontend Design

### Drawer Layout

The drawer should be split into two vertical regions:

1. fixed header region
2. scrollable list region

Header region contains:

- title
- short helper text
- search field

List region contains:

- infinite-loaded rows
- empty state
- loading states

Use the shared [`scrollbar.tsx`](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/components/scrollbar/scrollbar.tsx) component for the scrollable region.

### Row Presentation

Keep the current list row structure because it is already serviceable:

- avatar
- full name
- email
- right-aligned action

Change the action presentation:

- unassigned row: subtle icon button for assign
- assigned row: subtle icon button for unassign

No repeated text labels inside the button itself.

Use tooltip text to keep affordance clear:

- assign
- unassign

### Search Behavior

Search input should:

- debounce before hitting the server
- reset the infinite list to the first cursor when the search term changes
- never perform client-side filtering on the fetched list

The rendered rows should be exactly the API result set for the current `q` + cursor state.

### Infinite Loading

Preferred UX:

- infinite scroll inside the drawer list region
- fetch next page when the user nears the bottom

Implementation detail is flexible:

- intersection observer sentinel at the bottom is preferred
- a fallback "load more" button is acceptable only if needed during implementation, but not preferred

## Assignment Semantics

### Assigned Rows

Assigned users remain visible in the drawer search results and expose an immediate `unassign` action.

Rationale:

- keeps search truthful
- avoids "missing user" confusion
- supports one-place profile membership management

### Immediate Unassign

Unassign from the drawer is immediate:

- no confirmation dialog
- optimistic UI update
- rollback on failure

This is intentionally symmetric with assign.

## Optimistic Updates and Race Safety

### Required Guarantees

If someone clicks assign/unassign quickly across multiple rows:

- rows should not flicker into stale states
- a late response should not overwrite a newer optimistic state
- only the affected row should show in-flight locking

### Frontend Strategy

For assign/unassign mutations:

1. cancel relevant queries before optimistic writes
2. snapshot previous cache state
3. optimistically update:
   - the profile users list cache
   - the drawer assigned-state cache / derived set
   - any cached user-profile summary for the affected user when available
4. lock only the affected row while its mutation is in flight
5. rollback from snapshot on failure
6. invalidate relevant queries on settle

Relevant queries to reconcile:

- profile users list
- drawer staff-user search/infinite query
- affected user profile summary query

### Mutation Concurrency

Per-user in-flight guards should prevent duplicate rapid submissions on the same row.

Different users may still be assigned/unassigned concurrently.

## API Shape for Mutations

Keep the existing replace-set semantics for user profiles for now if no smaller add/remove endpoint exists yet.

However, the drawer code must abstract this ugliness away:

- assign = compute next profile id set with current profile added
- unassign = compute next profile id set with current profile removed

The UI component should not scatter fetch-before-write logic throughout row rendering.

If implementation reveals the replace-set workflow is too brittle under concurrency, the next step would be dedicated add/remove endpoints, but that is out of scope for this iteration.

## Error Handling

- rely on the repo's centralized API failure handling pattern
- optimistic updates must rollback cleanly on failure
- tooltips and disabled/loading visuals should make row state obvious
- search failures should surface through the existing query display/error pattern used in this area, not ad hoc inline exceptions

## Testing

### Backend

Add integration coverage for:

- staff users search by `q`
- cursor pagination ordering and `nextCursor`
- invalid `sort_id`
- suspended staff users still included
- deleted users/accounts excluded

### Frontend

Smoke/manual verification should cover:

- search triggers server requests
- scrolling loads more rows
- header stays fixed while list scrolls
- assign icon updates row immediately
- unassign icon updates row immediately
- rapid multi-row assign/unassign does not produce stale UI
- failure rolls back optimistic state correctly

## Recommended Implementation Order

1. backend: convert `FindStaffUsers` to `q` + cursor pagination pattern
2. regenerate client
3. frontend: update all existing `FindStaffUsers` consumers to the new contract, including the main staff-users table
4. frontend: add infinite-query hook for staff users in the profile users drawer
5. frontend: refactor drawer layout with fixed header + scrollable list
6. frontend: add optimistic assign/unassign handling with per-row in-flight state
7. update smoke checklist if needed
