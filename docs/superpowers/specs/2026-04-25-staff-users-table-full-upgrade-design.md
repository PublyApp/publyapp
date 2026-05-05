# Staff Users Table Full Upgrade For Issue #280

Date: 2026-04-25
Status: Draft
Owner: Staff users slice

## Summary

Issue `#280` requires the staff users table to adopt the newer actionable
Material React Table UX already established by the staff tenants list.

For `staff-users-table`, a visual-only migration is not sufficient. The current
staff users surface still has important lifecycle gaps:

- no real delete behavior
- no bulk suspend endpoint
- no bulk reactivate endpoint
- no bulk delete endpoint
- no export dialog
- no selection mode
- no selection-aware locking for query controls

This design upgrades the feature end-to-end:

- add missing backend lifecycle endpoints for staff users
- regenerate the TypeScript client and expose React Query hooks
- migrate the frontend table onto the shared actionable-table foundation
- add integration coverage for the new API behavior

## Problem

The current implementation in
`apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
still uses the older table pattern:

- a standalone search field above the table
- row-level actions only
- no row selection
- no shared toolbar selection state
- no export dialog
- no bulk lifecycle flows
- a delete button that still shows placeholder behavior

This does not satisfy issue `#280`, whose requirement for actionable tables is:

- selection mode
- overflow bulk-action menu
- export dialog
- search/filter/sort/pagination disabled while selection is active

The backend also lacks the lifecycle endpoints required for true parity with the
tenants table. Without those endpoints, the frontend would have to fall back to
client fan-out or partial behavior, which would not meet the requested
"full upgrade end-to-end" scope.

## Goals

- Bring `staff-users-table` onto the same actionable-table UX foundation as the
  staff tenants table.
- Add real single-delete behavior for staff users.
- Add real bulk suspend, bulk reactivate, and bulk delete endpoints for staff
  users.
- Preserve RFC 7807 error behavior and existing repo route conventions.
- Keep the implementation aligned with the repository's shared MRT toolbar
  extension points instead of introducing a new table preset.
- Keep the frontend implementation modular enough to avoid turning one table
  file into an oversized controller.
- Add integration coverage for the new API contract and the delete lifecycle.

## Non-Goals

- Adding new staff-user business rules unrelated to issue `#280`.
- Reworking staff authentication or logout semantics.
- Introducing a frontend test framework where one is not currently configured.
- Replacing cursor pagination or server-side sorting/filtering with client-side
  table state.
- Generalizing a reusable "bulk lifecycle framework" across unrelated slices in
  this issue.

## Existing State

### Backend

Staff users currently support:

- find
- get by id
- create
- update
- update email
- suspend
- reactivate
- get profiles
- update profiles

The routes and permissions already anticipate single delete:

- `Routes.Users.ForStaff.Delete`
- `AppPermissions.Staff.Users.DELETE_FOR_STAFF`

But there is no staff-user delete handler or service method yet, and there are
no bulk staff-user lifecycle routes.

### Frontend

The current staff users table already has:

- server-backed cursor pagination
- debounced free-text search via URL state
- row-level reminder action for pending users
- row-level details navigation
- row-level delete affordance with placeholder behavior

The staff tenants table already provides the target UX pattern:

- shared toolbar filters/actions via MRT meta extension points
- row selection mode
- selected-count display and clear action
- overflow selection menu
- export dialog controller
- selection-aware disabling of search, sorting, and pagination controls

## Design Decisions

### 1. Use real backend bulk endpoints, not client fan-out

The staff users table should achieve true parity with the tenants table.

We will add:

- `POST /staff/users/bulk-suspend`
- `POST /staff/users/bulk-reactivate`
- `POST /staff/users/bulk-delete`

These endpoints will accept a bounded list of staff user ids, execute
per-record lifecycle operations on the backend, and return aggregate success and
failure counts.

This avoids:

- slow frontend fan-out
- duplicated partial-success logic in the UI
- more network chatter than necessary
- UX inconsistency with the tenants table

### 2. Single delete follows the tenant delete safety model

Single staff-user delete should mirror tenant delete semantics:

- malformed id -> `400`
- missing user -> `404`
- user not suspended -> `400`
- success -> `200 Ok<ApiResponse>`

Delete remains a deliberate terminal action that requires prior suspension.
This keeps the safety model consistent with the existing tenant lifecycle.

### 3. Staff-user delete is a transactional soft delete

Deleting a staff user should soft-delete the entire staff-scope presence in one
transaction:

- `User.IsDeleted = true`
- staff `UserAccount.IsDeleted = true`
- related `UserAccountProfile` rows for that staff account soft-deleted

This removes the user from staff list/detail/profile assignment surfaces while
staying aligned with the repo's soft-delete conventions.

We intentionally do not add physical deletion in this issue.

### 4. Reuse existing permissions for bulk operations

Bulk routes should not introduce new permission keys.

They should reuse the existing staff-user lifecycle permissions:

- `SUSPEND_FOR_STAFF`
- `REACTIVATE_FOR_STAFF`
- `DELETE_FOR_STAFF`

This matches the tenant bulk pattern and keeps permission seeding simpler.

### 5. Preserve current lifecycle rules in this issue

This design intentionally does not add new guards such as:

- cannot suspend yourself
- cannot delete yourself
- cannot suspend the last staff admin
- cannot delete the last staff admin

Those may be valid future product rules, but they are not already enforced in
the staff-user lifecycle and would expand `#280` beyond table parity and
lifecycle completion.

To avoid ambiguity: the full upgrade in this issue means completing the missing
lifecycle surfaces, not redefining staff admin policy.

### 6. The frontend must use the shared actionable-table pattern

`staff-users-table` should converge on the same shared MRT toolbar extension
pattern used by the tenants table instead of inventing another implementation.

The table will support:

- shared toolbar filters
- shared export action
- selection mode
- selection actions menu
- selection-aware query control locking
- export dialog controller

### 7. Keep frontend state local to prevent heavy re-renders

The table is a heavy sibling. Volatile UI state should stay in the smallest
owning component possible:

- export dialog `open` state in an export dialog controller
- overflow menu anchor state in the selection action component
- row-level confirm dialog state in row action components

This follows repo guidance on rerender isolation and prevents unnecessary full
table rerenders while interacting with menus and dialogs.

## API Design

### Single delete

Route:

- `DELETE /staff/users/{userId}`

Permission:

- `AppPermissions.Staff.Users.DELETE_FOR_STAFF`

Success response:

- `200 Ok<ApiResponse>`

Error behavior:

- malformed id -> `400`
- not found -> `404`
- not suspended -> `400`

Audit:

- add `AuditActions.StaffUserDeleted`

### Bulk suspend

Route:

- `POST /staff/users/bulk-suspend`

Permission:

- `AppPermissions.Staff.Users.SUSPEND_FOR_STAFF`

Body:

- `{ userIds: string[] }`

Validation:

- `userIds` must be an array
- must contain at least one id
- maximum `100` ids
- every id must be a valid GUID

Success response:

- `200 Ok`
- `{ succeededCount, failedCount, failedItems }`

Each failed item contains:

- `userId`
- `error`

Audit:

- add `AuditActions.StaffUserBulkSuspended`

### Bulk reactivate

Route:

- `POST /staff/users/bulk-reactivate`

Permission:

- `AppPermissions.Staff.Users.REACTIVATE_FOR_STAFF`

Body and response shape:

- same structural contract as bulk suspend

Audit:

- add `AuditActions.StaffUserBulkReactivated`

### Bulk delete

Route:

- `POST /staff/users/bulk-delete`

Permission:

- `AppPermissions.Staff.Users.DELETE_FOR_STAFF`

Body and response shape:

- same structural contract as bulk suspend

Per-item delete rule:

- only suspended staff users can be deleted

Audit:

- add `AuditActions.StaffUserBulkDeleted`

### Service behavior

Add single-user service results for delete and bulk result records mirroring the
tenant service style.

Bulk service methods should:

- iterate through ids on the backend
- reuse the single-user lifecycle methods where practical
- aggregate partial failures
- return stable counts and failed items

This keeps error mapping centralized and avoids duplicating business rules.

## Frontend Design

### Table UX

Upgrade
`apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
to the actionable-table pattern used by the tenants table.

The upgraded table should support:

- row selection
- selected-count UI
- clear selection
- overflow selection actions menu
- export dialog
- search and status filters in the shared toolbar
- selection-aware disabling of search, sorting, and pagination controls

### Filters and URL state

Persist filter state in the URL with `nuqs`:

- `q`
- `status`

Rules:

- debounce `q` updates
- reset cursor pagination before filter changes
- keep server-side sorting and cursor pagination

Status filter values should be lowercase wire tokens that match backend query
conventions.

### Sorting

Use explicit snake_case sort ids that match backend sorting allowlists:

- `created_at`
- `updated_at`
- `email`
- `status`
- `level`
- `first_name`
- `last_name`

The default sort remains `created_at desc`.

### Row actions

Row-level actions should become fully functional:

- send verification follow-up for pending users
- navigate to user details
- suspend when active
- reactivate when suspended
- delete when suspended

Delete should remain visibly disabled for non-suspended users, with a tooltip
explaining why.

### Bulk actions

Selection menu actions:

- export selected
- bulk suspend
- bulk reactivate
- bulk delete

Each destructive action should confirm before execution.

On success:

- clear selection
- invalidate the staff users list query once
- show success or partial-success feedback

### Export

Use a dialog controller pattern like the tenants table:

- keep dialog `open` state outside the table controller
- support exporting the current result set or the selected rows already loaded
- CSV and JSON are supported
- XLSX remains disabled with the same "coming soon" affordance already used
  elsewhere

## Performance Requirements

- Bulk request size is capped at `100` ids.
- No frontend per-row mutation fan-out for bulk actions.
- No extra fetch for export in this issue; export uses the current loaded page or
  selected rows.
- Table stays server-driven for pagination, sorting, and filtering.
- Avoid unnecessary full-table rerenders by localizing dialog and menu state.
- Only invalidate the relevant list query family after lifecycle mutations.

## Compliance With Repo Rules

### Backend

- Use domain-first placement under `apps/api/Src/Modules/Users/`.
- Keep endpoint permissions attached with `.WithPermission(...)`.
- Use `TypedProblems.*` for all error responses.
- Do not use route constraints on ids.
- Use RFC 7807 responses for `400`, `404`, and validation problems.
- Keep namespaces aligned with folder structure.

### Frontend

- MUI components only
- `sx` styling only
- targeted lodash imports
- arrow function components only
- no `Array.reduce()`
- reuse shared MRT toolbar extension points and existing preset architecture
- keep volatile UI state local to avoid heavy rerenders

### Contract workflow

Because the backend API changes, implementation must include:

1. `just build-api`
2. `just generate-client`
3. `just tsc-front`

The generated client remains the source of truth for frontend hook updates.

## Testing Strategy

### API integration tests

Add coverage for single delete:

- success for suspended staff user
- `400` for malformed id
- `404` for missing user
- `400` when deleting a non-suspended user
- `403` when the caller lacks delete permission

Add coverage for bulk suspend:

- validation failure for malformed body
- success for multiple valid active users
- partial success when some users are missing or already suspended
- `403` when the caller lacks suspend permission

Add coverage for bulk reactivate:

- validation failure for malformed body
- success for multiple suspended users
- partial success when some users are not suspended or missing
- `403` when the caller lacks reactivate permission

Add coverage for bulk delete:

- validation failure for malformed body
- success for multiple suspended users
- partial success when some users are not suspended or missing
- `403` when the caller lacks delete permission

Add lifecycle coverage proving delete side effects:

- deleted staff user no longer appears in `FindStaffUsers`
- deleted staff user no longer resolves as an active staff account
- deleted staff-user profile links are removed from staff-user profile queries

### Frontend verification

The frontend package does not currently expose an established test runner in
`apps/front/package.json`, so this issue should not expand into adding Vitest or
Playwright.

Frontend verification for this slice should be:

- `just tsc-front`
- `just build-front`
- manual smoke pass for:
  - selection mode lock behavior
  - export dialog behavior
  - bulk suspend/reactivate/delete flows
  - row-level delete enablement rules
  - search and status filter behavior with cursor reset

## Verification Before Completion

Implementation should not be considered complete until the following pass:

1. `just build-api`
2. `just generate-client`
3. `just tsc-front`
4. targeted `just test-api` coverage for the new handlers and lifecycle cases
5. manual smoke pass on the staff users list page

## Recommended Implementation Order

1. Add backend single delete service method and handler.
2. Add backend bulk suspend/reactivate/delete handlers and service methods.
3. Add audit action constants and test coverage.
4. Build the API and regenerate the TypeScript client.
5. Add React Query hooks for the new bulk and delete endpoints.
6. Refactor `staff-users-table` onto the shared actionable-table pattern.
7. Add export dialog, status filter, selection actions, and bulk dialogs.
8. Run verification commands and smoke-test the upgraded table.
