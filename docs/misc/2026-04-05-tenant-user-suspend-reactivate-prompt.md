# Prompt: Add suspend/reactivate tenant-user control in tenant details > users

You are implementing a tenant-user membership suspension/reactivation flow in the tenant details `Users` tab.

This is **not** a greenfield design task. Follow the existing repo patterns and the constraints below exactly.

## Goal

In the tenant details `Users` list, staff should be able to:

- suspend an active tenant user
- reactivate a suspended tenant user

The UX must be **similar to the current account level dropdown** in the `Level` column:

- the `Status` cell becomes the interactive surface
- it wraps the status chip and a chevron in one clickable surface
- opening it shows a small single-choice menu
- selecting the other state triggers the real mutation

This should replace the current read-only status chip in the tenant users table.

## Critical domain invariant

The suspension belongs to the **tenant membership** (`UserAccount` join row), **not** to the global `User` record.

That means:

- do **not** suspend the global `User`
- do **not** overload the meaning into `User.Status`
- do update the tenant-scoped `UserAccount.IsSuspended`

This is the correct boundary for this feature.

## Current code context

Main frontend file:

- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

Current relevant frontend patterns already in that file:

- `LevelCell`
  - interactive dropdown surface
  - wraps chip + arrow
  - uses `ButtonBase` + `Menu`
  - selected item is shown as selected, not disabled
  - no misleading auto-focused alternative item
- `UserActionsCell`
  - already intentionally slim
  - contains `FollowUpAction`
  - contains `UserDetailsDrawerAction`
  - contains `RemoveUserAction`

Current frontend hooks:

- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
  - `useFindTenantUsers`
  - `useUpdateTenantUser`
  - no dedicated tenant-user suspend/reactivate hook exists yet

Current backend tenant-user update slice:

- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Services/UserService.cs`

Current backend reality:

- tenant-user update currently supports:
  - profile fields
  - account level
- it does **not** support tenant-membership suspension/reactivation yet

## Recommended backend design

Use **dedicated suspend/reactivate tenant-user endpoints**, not a generic PATCH field.

Why this is the recommended shape:

- suspension/reactivation is a lifecycle transition, not a generic profile edit
- it aligns better with the existing tenant lifecycle endpoints (`suspend` / `reactivate`)
- it keeps the API explicit and easier to audit
- it avoids overloading `UpdateTenantUserAsStaff` with unrelated semantics

Recommended route shape:

- `POST /staff/tenants/{tenantId}/users/{userId}/suspend`
- `POST /staff/tenants/{tenantId}/users/{userId}/reactivate`

Recommended new backend slices:

- handlers under:
  - `apps/api/Src/Modules/Users/Handlers/Staff/`
- endpoint mappings under:
  - `apps/api/Src/Modules/Users/Endpoints/`
- service methods in:
  - `apps/api/Src/Modules/Users/Services/UserService.cs`

Recommended service result shape:

- use discriminated unions, not nullable payload/error pairs
- follow the repo rule already used elsewhere

Examples of likely result cases:

- `Success(TenantUserData UserData)`
- `NotFound()`
- `CannotSuspendLastAdmin()`
- `AlreadySuspended()`
- `NotSuspended()`

Use flat guard clauses in handlers when matching these service results.

## Recommended business rules

1. Active tenant membership can be suspended.
2. Suspended tenant membership can be reactivated.
3. The last active admin in a tenant must not be suspendable.

That last rule should mirror the existing “cannot demote/remove last admin” safety rule.

Interpretation:

- if the target membership is `Admin`
- and it is the last **non-suspended, non-deleted** admin account for that tenant
- suspension must be rejected with a specific domain error / response key

This is important because suspension should not be a loophole around the existing admin invariant.

## Frontend UX requirements

Implement the UI in the tenant users table with the same interaction language as `LevelCell`.

### Status cell

The `Status` cell should:

- become the interactive control
- wrap the status chip and arrow in one clickable surface
- only be interactive for meaningful membership statuses
- use the same visual behavior as the level dropdown trigger

For this table, the meaningful tenant-membership states are:

- `Active`
- `Suspended`

Do **not** reintroduce `Pending` in this table. That was intentionally removed from the tenant users filter/contract because pending belongs to invitations, not users.

### Menu behavior

The menu should:

- anchor below the trigger
- show `Active` and `Suspended`
- show the current value as `selected`, not disabled
- avoid auto-focusing the alternative option in a way that looks preselected
- clicking the current value should just close the menu

This should match the corrected UX already used in `LevelCell`.

### Mutation/confirmation behavior

Recommended UX:

- choosing the other status should **not** instantly mutate
- it should open a small confirm dialog, similar to existing destructive/sensitive actions

Use clear messaging:

- suspend:
  - explain the user will lose access to this tenant
- reactivate:
  - explain access to this tenant will be restored

### Actions column

Keep `RemoveUserAction` as a separate row action.

Do **not** move suspension into the actions column.

The target interaction model is:

- `Level` cell controls account level
- `Status` cell controls tenant-membership activation/suspension
- actions column keeps secondary row actions

## Frontend composition constraints

Stay consistent with the current refactors in `tenant-users-table.tsx`.

That means:

- keep the implementation in the same file unless there is a compelling reason not to
- prefer same-file small components for stateful row actions/cells
- do not create unnecessary new files for tiny table-only components
- pass the whole row object to child row-action/cell components rather than fine-grained props where practical

If you extract a new status action component, keep it in:

- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

## Error handling requirements

Follow the documented frontend error-handling rule:

- local mutation handlers must use:
  - `toApiFailure(error)`
  - `getFailureMessage(...)`
- do not manually translate `response-message` keys at the call site

If the row-level suspend/reactivate mutations do **not** need special local failure UX, prefer relying on the global mutation error handler, exactly like the current row-level update/remove tenant-user mutations.

If you do use local `onError`, it must still use the shared `ApiFailure` helpers.

## Audit logging

Check whether tenant-user lifecycle actions should emit audit logs similarly to other staff-managed changes.

If the existing tenant-user update/remove flows already log, follow that pattern.

If audit logging is expected for lifecycle changes, include:

- who performed the action
- which tenant
- which target user
- whether the action was suspend or reactivate

## Translations

Add all required translation keys.

Likely needed keys include variants of:

- `change-status`
- `suspend`
- `reactivate`
- `confirm-suspend-tenant-user`
- `confirm-reactivate-tenant-user`
- `tenant-user-suspended-success`
- `tenant-user-reactivated-success`
- `cannot-suspend-last-admin`

Prefer existing shared wording patterns where possible. Do not invent inconsistent copy if an equivalent tenant/row-action phrasing already exists elsewhere.

## Tests and verification

### Backend

Add integration coverage for the new endpoints and domain rules.

At minimum cover:

- suspend active tenant user succeeds
- reactivate suspended tenant user succeeds
- suspending a nonexistent tenant user returns not found
- suspending the last active admin is rejected with the correct error
- reactivating a user who is not suspended behaves correctly

### Frontend

At minimum verify:

- `make generate-client` if the API contract changes
- `make tsc-front`
- targeted Biome check on touched frontend files
- `react-doctor` because this is a React UI change

### Manual smoke expectations

After implementation, a reviewer should be able to confirm:

1. In tenant details `Users`, the `Status` cell is interactive like the `Level` cell.
2. Active users can be suspended from that cell.
3. Suspended users can be reactivated from that cell.
4. The current status appears selected in the menu, not disabled.
5. The menu does not misleadingly pre-focus the alternative option.
6. The last active admin cannot be suspended.
7. After success, the table reflects the new state without requiring a hard refresh.

## Repo rules to respect

- follow `AGENTS.md`
- use `apply_patch` for edits
- use discriminated unions for multi-outcome service results
- use service-owned args records where appropriate
- handlers orchestrate, services implement
- keep frontend patterns consistent with existing tenant tables
- do not reintroduce `Pending` tenant-user semantics
- remember the suspension target is `UserAccount`, not `User`

## Deliverable

Implement the feature end-to-end, including:

- backend endpoints + service logic
- generated client updates if contract changes
- frontend hook(s)
- tenant users table status dropdown UX
- confirmation flow
- translations
- tests
- verification commands

Do not stop at backend-only or frontend-only partial work.
