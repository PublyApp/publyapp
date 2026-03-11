# Tenants Module Smoke Test Checklist

Last updated: 2026-03-11

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
- [x] Staff can open `/staff/tenants` and reach the tenants list without loader or auth regressions.
- [x] Staff can open `/staff/tenants/:tenantId` and land on the sidebar layout, not the old horizontal-tabs layout.
- [x] Staff tenant detail sidebar shows working navigation for `General`, `Users`, `Profiles`, and `Billing`.
- [x] Invalid `tenantId` on staff detail shows the expected malformed-id or not-found fallback.
- [x] Unknown staff detail tab routes hit the fallback tab page instead of crashing.
- [x] Tenant-side routes still render after the shared sidebar/layout refactor.
- [x] Unknown `settings/*` and `account/*` tab routes use their section fallback page instead of crashing or falling through to the generic tenant 404. Tracked by `#267`.
- [x] Unauthorized access without session still returns `401` and logs the user out only in the intended centralized flow.
- [x] Forbidden staff/tenant scope mismatches still return `403` without triggering logout.
- [x] Suspended-tenant gating and error-handling paths still behave correctly on tenant-side navigation.

## Category 1: Bug Fixes

### 1.1 Fix #191, users tab shows tenant users instead of staff users
- Status: `DONE`
- [x] Staff tenant detail `Users` tab loads tenant-scoped users for the selected tenant.
- [x] Data changes when switching between two different tenants.
- [x] User rows show the expected tenant users, not global staff users.
- [x] Tenant-user pagination still works after the #191 fix.

### 1.2 General-tab error handling
- Status: `DONE`
- [x] General tab handles `404` tenant-not-found with the intended not-found view.
- [x] General tab handles malformed `tenantId` with the intended invalid-id path.
- [x] Non-404 API failures render the generic error content instead of a blank page.

## Category 2: Core CRUD and Enriched Tenant Data

### 2.1 Create tenant
- Status: `DONE`
- [ ] Staff can create a tenant from `/staff/tenants/new`.
- [ ] Required validation errors render correctly for invalid create payloads.
- [ ] Successful create returns the expected tenant details and lands in the expected UI state.
- [ ] Initial users are created/invited as expected during tenant creation.

### 2.2 Update tenant
- Status: `DONE`
- [ ] Staff can edit tenant `name`.
- [ ] Staff can edit tenant `maxUsers`.
- [ ] Saving the general form refreshes both detail and list data.
- [ ] Validation failures surface correctly in the form.

### 2.3 Delete tenant
- Status: `DONE`
- [ ] Delete is only available when tenant state allows deletion.
- [ ] Delete confirmation dialog opens and closes correctly.
- [ ] Successful delete removes the tenant from the list and redirects away from the detail page.
- [ ] Invalid delete attempts produce the expected API/UI error behavior.

### 2.4 Suspend tenant
- Status: `DONE`
- [ ] Active tenant can be suspended from the list row action.
- [ ] Active tenant can be suspended from the general-tab danger zone.
- [ ] Suspended tenant state is reflected in list and detail views after mutation.

### 2.5 Reactivate tenant
- Status: `DONE`
- [ ] Suspended tenant can be reactivated from the list row action.
- [ ] Suspended tenant can be reactivated from the general-tab danger zone.
- [ ] Reactivated tenant becomes active again in both detail and list views.

### 2.6 Enriched GET tenant response
- Status: `DONE`
- [ ] Staff detail view loads and renders `tenantId`.
- [ ] Staff detail view renders `name`.
- [ ] Staff detail view renders `code`.
- [ ] Staff detail view renders `logoUrl` or the expected avatar fallback.
- [ ] Staff detail view renders `maxUsers`.
- [ ] Staff detail view renders `usersCount`.
- [ ] Staff detail view renders `status`.
- [ ] Staff detail view renders `isSuspended`-driven actions.
- [ ] Staff detail view renders `createdAt`.
- [ ] Staff detail view renders `updatedAt`.

## Category 3: Tenant List Improvements

### 3.1 Search by tenant name/code
- Status: `DONE`
- [ ] Search input updates the URL state.
- [ ] Search filters the list by tenant name.
- [ ] Code-prefix search works where expected.
- [ ] Changing search resets cursor pagination correctly.

### 3.2 Filter by status
- Status: `DONE`
- [ ] Status dropdown updates the URL state.
- [ ] Filtering works for `active`.
- [ ] Filtering works for `pending`.
- [ ] Filtering works for `suspended`.
- [ ] Filtering works for `archived`.
- [ ] Search + status combined filtering works correctly.

### 3.3 Filter by suspension state
- Status: `PENDING`
- [ ] Explicit suspended-only toggle/filter exists and works, or this item is intentionally closed out with a product decision.

### 3.4 Bulk actions
- Status: `DONE`
- [ ] Row selection works across the tenant list.
- [ ] Bulk suspend opens confirmation and suspends selected tenants.
- [ ] Bulk reactivate opens confirmation and reactivates selected tenants.
- [ ] Bulk delete opens confirmation and deletes selected tenants where allowed.
- [ ] Partial-success responses are surfaced clearly in toast messaging.
- [ ] List query invalidates and refreshes after each bulk mutation.

### 3.5 Export tenant list
- Status: `PARTIAL`
- [ ] CSV export works for the current filtered page.
- [ ] JSON export works for the current filtered page.
- [ ] Exported columns/fields are accurate and stable.
- [ ] Decide whether page-only export is acceptable or whether full filtered export is still outstanding.

### List-specific regression checks
- Status: `PARTIAL`
- [ ] Column sorting works for `created_at`.
- [ ] Column sorting works for `updated_at`.
- [ ] Cursor pagination works after sorting changes.
- [ ] List row `Delete` action is either fully wired or explicitly removed from the UI. Current code suggests this row action is still a stub.

## Category 4: Staff Tenant Detail, General Tab

### 4.1 Wire edit form to PATCH
- Status: `DONE`
- [ ] Editing and saving from the general tab performs a real PATCH, not a stub action.

### 4.2 Display tenant code
- Status: `DONE`
- [ ] Code field is visible and read-only as intended.

### 4.3 Display status and suspension badge/state
- Status: `DONE`
- [ ] Status chip/badge shows the correct tenant state.
- [ ] Danger-zone action set changes correctly based on suspension state.

### 4.4 Display created/updated timestamps
- Status: `DONE`
- [ ] Both timestamps render in the expected format using shared formatting utilities.

### 4.5 Logo upload integration
- Status: `PENDING`
- [ ] Verify whether the logo area is intentionally read-only.
- [ ] If upload/edit was expected for module completion, track it as still outstanding.

### 4.6 Suspend/reactivate from detail page
- Status: `DONE`
- [ ] General-tab danger zone exposes the correct action for the current state.
- [ ] Mutation result is reflected immediately in the page state.

### 4.7 Delete from detail page
- Status: `DONE`
- [ ] Delete is available only when allowed.
- [ ] Post-delete redirect and list invalidation behave correctly.

## Category 5: Staff Tenant Detail, Users Tab

### 5.1 Show actual tenant users
- Status: `DONE`
- [ ] Users table loads tenant-scoped results.
- [ ] Empty state and error state are correct.

### 5.2 Show user account level
- Status: `DONE`
- [ ] Level column renders `Admin` and `User` correctly.
- [ ] Level badges/chips use the intended visual distinction.

### 5.3 Show invitation status
- Status: `PARTIAL`
- [ ] Confirm whether pending invited users are sufficiently represented by the existing `status` column.
- [ ] If a separate invitation-status column is still required, track it as unfinished.

### 5.4 Invite new user to tenant
- Status: `DONE`
- [ ] Invite drawer opens from the users page CTA.
- [ ] Email validation works in the invite form.
- [ ] Account level selection works in the invite form.
- [ ] Successful invite closes the drawer and surfaces success feedback.
- [ ] Newly invited user appears in the list after refresh/invalidation.

### 5.5 Remove user from tenant
- Status: `DONE`
- [ ] Remove action opens confirmation.
- [ ] Successful remove invalidates and refreshes the tenant users query.
- [ ] Error path surfaces the expected failure feedback.

### 5.6 Change user account level
- Status: `DONE`
- [ ] Change-role menu opens.
- [ ] Promoting a user to `Admin` works.
- [ ] Demoting a user to `User` works.
- [ ] Query invalidates and the new level is visible after mutation.

### 5.7 Search/filter tenant users
- Status: `DONE/PARTIAL`
- [ ] Search input filters tenant users.
- [ ] Status filter works for `active`.
- [ ] Status filter works for `pending`.
- [ ] Status filter works for `suspended`.
- [ ] Search/filter changes reset pagination correctly.
- [ ] Verify sort ids for tenant users are valid; current table still defaults to `createdat`, which looks inconsistent with snake_case conventions.

### Users-tab regression checks
- Status: `PARTIAL`
- [ ] Pending users can still receive verification follow-up email.
- [ ] Copy verification link behavior is intentionally disabled or fully supported.
- [ ] Drawer/details interaction from a user row still works.

## Category 6: Billing Tab

- Status: `MOCK/DEFERRED`
- [ ] Staff tenant billing tab clearly indicates mock or coming-soon state.
- [ ] No real billing workflow is incorrectly implied as complete.
- [ ] Mock plan, payment method, invoice, and usage widgets do not block navigation or throw errors.
- [ ] If billing is considered out of scope for tenant module completion, mark this category as deferred rather than failed.

## Category 7: Profiles

### 7.1 Verify permission/profile display
- Status: `PARTIAL`
- [ ] Staff tenant profiles table loads real profile data.
- [ ] Permissions matrix aligns with profile data from the backend.

### 7.2 Create new profile
- Status: `PENDING`
- [ ] Profiles CTA opens a real create flow, or this remains explicitly pending. Current drawer content is placeholder text.

### 7.3 Delete profile
- Status: `PENDING`
- [ ] Delete action performs a real mutation, or this remains explicitly pending. Current delete action appears to be a toast stub.

## Category 8: Activity Tab / Audit Trail

- Status: `PENDING/DEFERRED`
- [ ] Confirm whether a tenant activity tab should exist in the current navigation.
- [ ] If activity is in scope, verify tenant-scoped audit log data loads correctly.
- [ ] If activity is intentionally deferred to issue `#172`, leave this category marked deferred and do not treat its absence as a regression.

## Category 9: Backend and Automated Coverage

### 9.1 Tenant usage metrics endpoint
- Status: `PENDING`
- [ ] Confirm whether tenant usage metrics exists and is wired anywhere. Current notes still treat this as outstanding.

### 9.2 Staff endpoint for tenant users
- Status: `DONE`
- [ ] `GET /staff/tenants/{tenantId}/users` works for success, malformed id, bad cursor, invalid sort, unauthenticated, and unauthorized scenarios.

### 9.3 Staff-side tenant user management endpoints
- Status: `DONE/PARTIAL`
- [ ] Tenant invite endpoint works end to end.
- [ ] Tenant user update endpoint works end to end.
- [ ] Tenant user delete endpoint works end to end.
- [ ] Add explicit automated coverage if invite endpoint still lacks specs.

### 9.4 Tenant archival/data-retention logic
- Status: `PENDING`
- [ ] Confirm whether archival semantics are implemented beyond suspended/deleted flows.

### 9.5 Create endpoint tests
- Status: `DONE`
- [ ] `CreateTenantAsStaff.Spec.cs` passes and still matches the current contract.

### 9.6 Find endpoint tests
- Status: `DONE/PARTIAL`
- [ ] `FindTenantsAsStaff.Spec.cs` passes for pagination, cursor, search, and multi-status filtering.
- [ ] Add coverage if bulk-related behavior or export-related expectations require API tests.

### 9.7 Update/Delete/Get tests
- Status: `DONE`
- [ ] Update tenant spec passes.
- [ ] Delete tenant spec passes.
- [ ] Enriched get-tenant spec passes.
- [ ] Suspend/reactivate specs pass.

### 9.8 Tenant-user tests
- Status: `PARTIAL`
- [ ] `FindTenantUsersAsStaff.Spec.cs` passes.
- [ ] `RemoveUserFromTenantAsStaff.Spec.cs` passes.
- [ ] `UpdateTenantUserAsStaff.Spec.cs` passes.
- [ ] Add coverage for tenant-user search/filter if not already present.
- [ ] Add coverage for staff-side invite endpoint if not already present.

### 9.9 Bulk action tests
- Status: `PENDING`
- [ ] Add or verify automated coverage for bulk suspend/reactivate/delete endpoints. Current repo does not show matching spec files.

## Category 10: Tenant-Side Self-Service

### 10.1 Tenant settings page content
- Status: `MOCK/DEFERRED`
- [ ] Tenant `Settings > General` page is reachable and visually intact after layout consolidation.
- [ ] Disabled/mock form fields are intentional and communicated as such.

### 10.2 Tenant admin user management
- Status: `MOCK/DEFERRED`
- [ ] Tenant `Settings > Members` page is reachable.
- [ ] Confirm the page is still mock/placeholder and not falsely treated as complete.

### 10.3 Tenant profile/branding self-edit
- Status: `MOCK/DEFERRED`
- [ ] Tenant `Settings > Roles` page is reachable.
- [ ] Confirm role/profile editing is still placeholder and not falsely treated as complete.

### 10.4 Invitation acceptance flow
- Status: `PENDING/DEFERRED`
- [ ] Confirm whether invitation acceptance is implemented elsewhere under issue `#144`.
- [ ] If still deferred, keep it out of module-complete acceptance criteria.

## Practical Completion Gate

Before declaring the Tenants module umbrella complete, at minimum all of the following should be true:

- [ ] Category 0 cross-cutting shell/auth/layout checks pass.
- [ ] Categories 1 and 2 pass fully.
- [ ] Category 3 has an explicit decision on `3.3` and row-level delete behavior.
- [ ] Category 4 passes except any consciously deferred logo-upload work.
- [ ] Category 5 has an explicit decision on separate invitation-status UX.
- [ ] Categories 6, 8, and 10 are either implemented or formally declared deferred.
- [ ] Category 7 has an explicit decision on profile create/delete scope.
- [ ] Category 9 automated coverage gaps are acknowledged or closed, especially invite and bulk-action specs.
