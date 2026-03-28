# Tenants Module Smoke Test Checklist

Last updated: 2026-03-25

## Purpose

This checklist is the working smoke-test tracker for the Tenants module umbrella scope discussed in `voicetree-17-2/feature-audit-overview_3.md`.

It covers category `0` through `10`.

- `Status` means current implementation state inferred from the repo and voicetree notes.
- Checkboxes are intentionally left unchecked so this file can be used as the live test run sheet.
- Category `0` is treated as the cross-cutting shell/auth/navigation smoke gate because the source notes explicitly enumerate categories `1-10` but the request asked for `0-10`.

## Status Legend

- `DONE`: implemented in the current repo and should be smoke-tested.
- `PARTIAL`: partly implemented, ambiguous, or only partly covered.
- `PENDING`: not implemented or clearly incomplete.
- `MOCK/DEFERRED`: present as placeholder or mock UI, not real module completion.

## Suggested Test Preconditions

- Staff admin account with tenant permissions.
- Staff limited-permission account for permission gating checks.
- At least one active tenant, one suspended tenant, and one deletable suspended tenant.
- At least one tenant with multiple users, including a pending invitation.
- Frontend and API both running locally.

## Category 0: Cross-Cutting Shell, Routing, Auth, and Layout

- Status: `DONE/PARTIAL`
- [x] Opening `/staff/tenants` as an authorized staff user loads the tenants list without auth loops, loader crashes, or blank states.
- [x] Opening `/staff/tenants/:tenantId` lands on the current sidebar-based tenant detail shell, not the retired horizontal-tabs layout.
- [x] The tenant detail sidebar lets staff switch between `General`, `Users`, `Profiles`, and `Billing`, and each link resolves to the expected page.
- [x] Opening a malformed or unknown `tenantId` shows the intended invalid-id or not-found fallback instead of rendering broken detail content.
- [x] Opening an unknown staff detail tab route resolves to the staff fallback-tab page instead of crashing or showing an unrelated page.
- [x] Tenant-side pages still render correctly after the shared sidebar/layout refactor and do not regress because of the staff-side navigation changes.
- [x] Opening unknown `settings/*` or `account/*` tenant routes resolves to the section fallback page instead of crashing or falling through to the generic tenant 404. Tracked by `#267`.
- [x] Hitting tenant or staff pages without a valid session returns `401`, triggers the intended centralized logout flow, and does not create extra auth side effects.
- [x] Hitting a valid page with the wrong scope or insufficient permission returns `403` and does not trigger logout.
- [x] Suspended-tenant gating still blocks only the intended tenant-side paths and surfaces the expected suspended-state messaging.

## Category 1: Bug Fixes

### 1.1 Fix #191, users tab shows tenant users instead of staff users
- Status: `DONE`
- [x] Opening a tenant detail `Users` tab loads the selected tenant's users instead of staff-platform users.
- [x] Switching from one tenant to another refreshes the table and shows different tenant-scoped data.
- [x] Every row in the tenant users table belongs to the selected tenant and does not leak global staff users.
- [x] Tenant-user pagination still works after the #191 fix and continues loading tenant-scoped results on later pages.

### 1.2 General-tab error handling
- Status: `DONE`
- [x] A missing tenant on the general tab renders the intended `404` not-found state.
- [x] A malformed `tenantId` on the general tab renders the intended invalid-id state.
- [x] Non-404 API failures on the general tab render the generic error UI instead of a blank page or crashed component tree.

## Category 2: Core CRUD and Enriched Tenant Data

### 2.1 Create tenant
- Status: `DONE`
- [x] Submitting a valid form from `/staff/tenants/new` creates a tenant successfully.
- [x] Submitting an invalid create form surfaces the expected field or form validation errors in the UI.
- [x] After a successful create, the app lands in the expected post-create UI state and shows the newly created tenant details.
- [x] Creating a tenant with initial users produces the expected user creation and invitation outcomes.
- [x] An invited initial admin can accept the invitation and activate the newly created pending tenant.
- [x] An invited existing tenant/project user can sign in, return to the invitation URL, click `Join organization`, and join the new tenant successfully.

### 2.2 Update tenant
- Status: `DONE`
- [x] Editing the tenant `name` on the general tab and saving persists the new value.
- [x] Editing `maxUsers` on the general tab and saving persists the new value.
- [x] After a successful save, both the detail page and the tenants list reflect the updated values.
- [x] Submitting invalid update values keeps the form on screen and surfaces clear validation errors.

### 2.3 Delete tenant
- Status: `DONE`
- [x] The delete action is visible only when the tenant is in a deletable state.
- [x] The delete confirmation dialog opens when requested and closes cleanly on cancel.
- [x] A successful delete removes the tenant from the list and redirects away from the deleted tenant detail page.
- [x] A disallowed delete attempt returns the expected API problem response, keeps the tenant intact, and shows a single clear UI error.

### 2.4 Suspend tenant
- Status: `DONE`
- [x] Suspending an active tenant from the list row action succeeds and updates the row state after refresh or invalidation.
- [x] Suspending an active tenant from the general-tab danger zone succeeds and updates the detail page state immediately.
- [x] Once suspended, the tenant is shown as suspended in both the list and detail views.

### 2.5 Reactivate tenant
- Status: `DONE`
- [x] Reactivating a suspended tenant from the list row action succeeds and updates the row state after refresh or invalidation.
- [x] Reactivating a suspended tenant from the general-tab danger zone succeeds and updates the detail page state immediately.
- [x] Once reactivated, the tenant is shown as active again in both the list and detail views.

### 2.6 Enriched GET tenant response
- Status: `DONE`
- [x] The staff detail page renders the tenant ID value returned by the enriched GET response.
- [x] The staff detail page renders the tenant name returned by the enriched GET response.
- [x] The staff detail page renders the tenant code returned by the enriched GET response.
- [x] The staff detail page renders either `logoUrl` or the intended avatar fallback when no logo exists.
- [x] The staff detail page renders the configured `maxUsers` value.
- [x] The staff detail page renders the current `usersCount` value.
- [x] The staff detail page renders the current tenant `status`.
- [x] The staff detail page changes available actions based on the `isSuspended` state from the response.
- [x] The staff detail page renders `createdAt`.
- [x] The staff detail page renders `updatedAt`.

## Category 3: Tenant List Improvements

### 3.1 Search by tenant name/code
- Status: `DONE`
- [x] Typing in the tenant search input updates the URL state.
- [x] Searching by tenant name filters the list to matching tenants.
- [x] Searching by code prefix returns the expected tenant rows where that behavior is supported.
- [x] Changing the search term resets cursor pagination to the first page correctly.

### 3.2 Filter by status
- Status: `DONE`
- [x] Changing the status filter updates the URL state.
- [x] The status filter allows selecting multiple statuses at the same time and keeps the selected set visible in the input.
- [x] Filtering by `active` returns only active tenants.
- [x] Filtering by `pending` returns only pending tenants.
- [x] Filtering by `suspended` returns only suspended tenants.
- [x] Selecting multiple statuses returns tenants that match any of the selected statuses.
- [x] Combining search and status filters returns the expected intersection of both filters.

### 3.3 Filter by suspension state
- Status: `DONE`
- [x] There is an explicit product decision that no separate suspended-only control is needed because the status filter already supports `suspended`.

### 3.4 Bulk actions
- Status: `DONE`
- [x] Selecting tenant rows enables bulk actions for the selected tenants.
- [x] When rows are selected, the table enters selection mode and keeps search, filters, sorting, and pagination visible but disabled with explanatory tooltips.
- [x] In selection mode, bulk actions are exposed through the overflow menu rather than a long inline button row.
- [x] Bulk suspend success, partial-success, and failure paths show action-specific toast feedback instead of generic `bulk action` wording.
- [x] Bulk reactivate success, partial-success, and failure paths show action-specific toast feedback instead of generic `bulk action` wording.
- [x] Bulk delete success, partial-success, and failure paths show action-specific toast feedback instead of generic `bulk action` wording.
- [x] Running bulk suspend opens confirmation, completes successfully, and suspends the intended tenants.
- [x] Running bulk reactivate opens confirmation, completes successfully, and reactivates the intended tenants.
- [x] Running bulk delete opens confirmation, completes successfully, and deletes only the tenants allowed by the backend rules.
- [x] Partial-success bulk results are communicated clearly in toast or result messaging.
- [x] After each bulk mutation, the tenant list invalidates and refreshes to reflect the new state.

### 3.5 Export tenant list
- Status: `PARTIAL`
- [x] CSV export downloads successfully for the current filtered page.
- [x] JSON export downloads successfully for the current filtered page.
- [x] Opening export shows the unified export dialog with a single `Export` action and a format chooser.
- [x] When tenant rows are selected, export targets the selected rows instead of the full current page.
- [x] The export dialog exposes `CSV`, `JSON`, and `XLSX`, and `XLSX` is clearly shown as not yet available rather than failing silently.
- [x] Exported fields and column meanings match the visible tenant data and stay stable across runs.
- [x] There is an explicit product decision that full export should eventually cover the entire filtered result set across all pages, but this is deferred until asynchronous worker-service export jobs exist; current page-only export is a temporary limitation, not the final product behavior.

### List-specific regression checks
- Status: `PARTIAL`
- [x] Sorting by `created_at` changes list ordering correctly.
- [x] Sorting by `updated_at` changes list ordering correctly.
- [x] Cursor pagination still works after changing sort order.
- [x] The row-level `Delete` action is fully functional for suspended tenants, stays visible but disabled for non-suspended tenants, and explains the constraint with a clear tooltip instead of behaving like a stub.

## Category 4: Staff Tenant Detail, General Tab

### 4.1 Wire edit form to PATCH
- Status: `DONE`
- [x] Saving changes from the general tab performs a real PATCH mutation and persists data instead of triggering a stub action.

### 4.2 Display tenant code
- Status: `DONE`
- [x] The code field is visible, read-only, and styled as non-editable.

### 4.3 Display status and suspension badge/state
- Status: `DONE`
- [x] The status badge or chip reflects the actual tenant state from the backend.
- [x] The danger-zone actions change correctly when the tenant moves between active and suspended states.

### 4.4 Display created/updated timestamps
- Status: `DONE`
- [x] Both timestamps render and use the shared time-formatting utilities rather than ad hoc formatting.

### 4.5 Logo upload integration
- Status: `DEFERRED`
- [x] The logo area is intentionally read-only in the current scope.
- [x] Real tenant logo upload/edit support is deferred to the broader file-upload work tracked in `#95`.

### 4.6 Suspend/reactivate from detail page
- Status: `DONE`
- [x] The general-tab danger zone exposes the correct action for the tenant's current state.
- [x] After suspending or reactivating from the detail page, the page state updates immediately to reflect the new status.

### 4.7 Delete from detail page
- Status: `DONE`
- [x] The detail-page delete action is visible only when deletion is allowed.
- [x] After a successful delete from the detail page, the app redirects away and the list data is invalidated.

## Category 5: Staff Tenant Detail, Users Tab

### 5.1 Show actual tenant users
- Status: `DONE`
- [x] The users table loads tenant-scoped user results for the selected tenant.
- [x] The users tab shows the intended empty state and error state when no data or failing data is returned.

### 5.2 Show user account level
- Status: `DONE`
- [x] The level column renders `Admin` and `User` correctly for the returned data.
- [x] The level visuals use the intended chip or badge distinction for the two account levels.

### 5.3 Show invitation status
- Status: `DONE`
- [x] Pending invited users are sufficiently represented by the current `status` column.
- [x] There is an explicit product decision that no separate invitation-status column is required in the tenant users table.

### 5.4 Invite new user to tenant
- Status: `DONE`
- [ ] Clicking the invite CTA opens the invite drawer from the users tab.
- [ ] The invite form validates email correctly.
- [ ] The invite form lets staff choose the intended account level.
- [ ] A successful invite closes the drawer and shows clear success feedback.
- [ ] After refresh or query invalidation, the newly invited user appears in the tenant users list.

### 5.5 Remove user from tenant
- Status: `DONE`
- [ ] Clicking remove opens a confirmation step before mutation.
- [ ] A successful remove invalidates the tenant users query and removes the user from the refreshed list.
- [ ] A failing remove attempt keeps the user in place and shows the expected error feedback.

### 5.6 Change user account level
- Status: `DONE`
- [ ] Opening the change-role action exposes the role update menu.
- [ ] Promoting a tenant user to `Admin` succeeds and the new level appears after invalidation or refresh.
- [ ] Demoting a tenant user to `User` succeeds and the new level appears after invalidation or refresh.
- [ ] The query invalidates after a successful role change and the visible table state matches the backend result.

### 5.7 Search/filter tenant users
- Status: `DONE/PARTIAL`
- [ ] Typing in the users search input filters the tenant users list.
- [ ] Filtering by `active` returns only active tenant users.
- [ ] Filtering by `pending` returns only pending tenant users.
- [ ] Filtering by `suspended` returns only suspended tenant users.
- [ ] Changing search or filter values resets pagination correctly.
- [ ] The users table uses valid backend sort IDs and does not send invalid sort parameters.

### Users-tab regression checks
- Status: `PARTIAL`
- [ ] Pending users can still receive the intended verification follow-up email flow.
- [ ] Copy-verification-link behavior is either intentionally unavailable or fully supported end to end.
- [ ] Opening user details or drawer interactions from a row still works after the tenant-users refactors.

## Category 6: Billing Tab

- Status: `MOCK/DEFERRED`
- [ ] The staff tenant billing tab is reachable and clearly communicates that it is mock or coming soon.
- [ ] The billing tab does not imply that real billing workflows are complete when they are not.
- [ ] Mock plan, payment method, invoice, and usage widgets render without blocking navigation or throwing errors.
- [ ] If billing is out of scope for tenant module completion, this category remains explicitly marked deferred rather than silently failed.

## Category 7: Profiles

### 7.1 Verify permission/profile display
- Status: `PARTIAL`
- [ ] The tenant profiles table loads real backend profile data rather than placeholder-only content.
- [ ] The permissions matrix shown in the UI matches the backend profile data for the selected tenant.

### 7.2 Create new profile
- Status: `PENDING`
- [ ] The create-profile CTA either opens a real creation flow or remains explicitly marked pending; it is not left as an implied feature with placeholder drawer content.

### 7.3 Delete profile
- Status: `PENDING`
- [ ] The delete-profile action either performs a real mutation or remains explicitly marked pending; it is not left as a visible toast stub that looks complete.

## Category 8: Activity Tab / Audit Trail

- Status: `PENDING/DEFERRED`
- [ ] There is a clear product decision on whether a tenant activity tab should exist in the current navigation.
- [ ] If activity is in scope, tenant-scoped audit log data loads correctly for the selected tenant.
- [ ] If activity is intentionally deferred to issue `#172`, this category stays explicitly deferred and its absence is not treated as a regression.

## Category 9: Backend and Automated Coverage

### 9.1 Tenant usage metrics endpoint
- Status: `PENDING`
- [ ] There is a clear answer on whether a tenant usage metrics endpoint exists and is wired anywhere in the current module scope.

### 9.2 Staff endpoint for tenant users
- Status: `DONE`
- [ ] `GET /staff/tenants/{tenantId}/users` is covered for success, malformed ID, bad cursor, invalid sort, unauthenticated, and unauthorized scenarios.

### 9.3 Staff-side tenant user management endpoints
- Status: `DONE/PARTIAL`
- [ ] The tenant invite endpoint works end to end.
- [ ] The tenant user update endpoint works end to end.
- [ ] The tenant user delete endpoint works end to end.
- [ ] If the invite endpoint still lacks automated coverage, that gap is explicitly tracked.
- [x] The shared tenant invitation accept endpoint is covered for both new-account acceptance and existing-account join.

### 9.4 Tenant archival/data-retention logic
- Status: `PENDING`
- [ ] There is a clear answer on whether archival or data-retention semantics exist beyond suspended and deleted tenant flows.

### 9.5 Create endpoint tests
- Status: `DONE`
- [ ] `CreateTenantAsStaff.Spec.cs` passes and still matches the current create-tenant contract.

### 9.6 Find endpoint tests
- Status: `DONE/PARTIAL`
- [ ] `FindTenantsAsStaff.Spec.cs` passes for pagination, cursor flow, search, and multi-status filtering.
- [ ] If bulk or export behavior needs dedicated API coverage, that missing coverage is explicitly tracked.

### 9.7 Update/Delete/Get tests
- Status: `DONE`
- [ ] The update-tenant spec passes.
- [ ] The delete-tenant spec passes.
- [ ] The enriched get-tenant spec passes.
- [ ] The suspend and reactivate specs pass.

### 9.8 Tenant-user tests
- Status: `PARTIAL`
- [ ] `FindTenantUsersAsStaff.Spec.cs` passes.
- [ ] `RemoveUserFromTenantAsStaff.Spec.cs` passes.
- [ ] `UpdateTenantUserAsStaff.Spec.cs` passes.
- [ ] If tenant-user search and filter coverage is missing, that gap is explicitly tracked.
- [ ] If the staff-side invite endpoint still lacks a spec, that gap is explicitly tracked.

### 9.9 Bulk action tests
- Status: `PENDING`
- [ ] Automated coverage for bulk suspend, bulk reactivate, and bulk delete endpoints either exists and passes or remains explicitly tracked as missing.

## Category 10: Tenant-Side Self-Service

### 10.1 Tenant settings page content
- Status: `MOCK/DEFERRED`
- [ ] The tenant `Settings > General` page is reachable and visually intact after layout consolidation.
- [ ] Any disabled or mock form fields are clearly intentional and communicated as such.

### 10.2 Tenant admin user management
- Status: `MOCK/DEFERRED`
- [ ] The tenant `Settings > Members` page is reachable.
- [ ] If the page is still placeholder-only, that mock state is explicit and not misleadingly treated as complete.

### 10.3 Tenant profile/branding self-edit
- Status: `MOCK/DEFERRED`
- [ ] The tenant `Settings > Roles` page is reachable.
- [ ] If role or profile editing is still placeholder-only, that state is explicit and not misleadingly treated as complete.

### 10.4 Invitation acceptance flow
- Status: `DONE/PARTIAL`
- [x] A brand-new invited user can accept a valid invitation by creating an account from the invitation page.
- [x] An existing invited user is prompted to sign in, returned to the invitation URL, and can complete acceptance with the `Join organization` CTA.
- [ ] There is an explicit product decision on whether existing-user acceptance should remain a manual post-login confirmation or become auto-complete after login. Tracked by `#269`.

## Practical Completion Gate

Before declaring the Tenants module umbrella complete, at minimum all of the following should be true:

- [ ] All Category 0 shell, auth, routing, and layout smoke checks pass.
- [ ] Categories 1 and 2 pass fully.
- [ ] Category 3 has an explicit decision on item `3.3` and on row-level delete behavior.
- [ ] Category 4 passes except for any consciously deferred logo-upload scope.
- [ ] Category 5 has an explicit decision on whether invitation status needs separate UX.
- [ ] Categories 6, 8, and 10 are either implemented or formally declared deferred.
- [ ] Category 7 has an explicit decision on profile create and delete scope.
- [ ] Category 9 automated-coverage gaps are either closed or explicitly acknowledged, especially for invite and bulk-action specs.
