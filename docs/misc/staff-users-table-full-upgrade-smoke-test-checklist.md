# Staff Users Table Full Upgrade Smoke Test Checklist

Use this checklist to manually validate the work from PR `#329` on branch `feat/280-staff-users-table-full-upgrade`.

Route under test:
- `/staff/staff-users`

Related surfaces:
- `/staff/staff-users/details/{userId}`
- `/staff/profiles/details/{profileId}/users`

## 1. Table Loading And Basic Rendering

- [ ] The staff users list loads without an error state.
- [ ] The first column shows user identity in a dense two-line layout: full name on the first line and email on the second line.
- [ ] The status column renders valid labels only for the supported statuses: `Active`, `Pending`, `Suspended`, and `Inactive`.
- [ ] No row renders a `Banned` status label.
- [ ] The action column renders the expected actions for a regular active user.

## 2. Search, Filter, Sort, And Cursor Pagination

- [ ] Typing in the search field filters the list after debounce.
- [ ] Clearing the search field restores the default result set.
- [ ] The status filter accepts supported statuses and updates the list correctly.
- [ ] Selecting multiple statuses filters correctly when more than one status is chosen.
- [ ] Sorting by each supported column works without breaking pagination.
- [ ] Advancing to the next cursor page works and does not duplicate rows from the previous page.

## 3. Selection Mode Locking

- [ ] Selecting one or more rows enters selection mode.
- [ ] While selection mode is active, search is visually disabled.
- [ ] While selection mode is active, filter controls are visually disabled.
- [ ] While selection mode is active, table sorting is visually disabled.
- [ ] Clearing the selection exits selection mode and restores normal search/filter/sort controls.
- [ ] If a search term was edited just before entering selection mode, clearing the selection restores the correct search behavior without applying a stale value.

## 4. Bulk Actions

- [ ] Opening the bulk actions menu shows `Export selected`, `Suspend selected`, `Reactivate selected`, and `Delete selected`.
- [ ] Bulk suspend works for active users and shows the correct success or partial-success toast.
- [ ] Bulk reactivate works for suspended users and shows the correct success or partial-success toast.
- [ ] Bulk delete only succeeds for suspended users and shows the correct success or partial-success toast.
- [ ] After a successful bulk lifecycle action, the affected rows update correctly in the table.
- [ ] After a successful bulk delete, deleted users disappear from the list.

## 5. Export

- [ ] The page export action opens the export dialog.
- [ ] In normal mode, exporting CSV downloads the current result set.
- [ ] In normal mode, exporting JSON downloads the current result set.
- [ ] In selection mode, exporting CSV downloads only the selected rows.
- [ ] In selection mode, exporting JSON downloads only the selected rows.
- [ ] Selecting `XLSX` shows the translated “coming soon” message and disables the export button.

## 6. Row Actions

- [ ] For a pending user, the follow-up action is visible and works.
- [ ] For a pending user, the verification-link copy action works when enabled by the feature flag.
- [ ] Suspending an active user works and updates the row status.
- [ ] Reactivating a suspended user works and updates the row status.
- [ ] Deleting a suspended user works and removes the row from the table.
- [ ] The delete action is disabled for non-suspended users and shows the explanatory tooltip.
- [ ] The details action opens the correct staff-user details page.

## 7. Staff User Details Regression Checks

- [ ] Suspending a user from the details page updates the details view and the list view consistently.
- [ ] Reactivating a user from the details page updates the details view and the list view consistently.
- [ ] Updating the user email from the details danger zone still works.
- [ ] Returning to the staff users list after a details-page lifecycle action shows fresh data, not stale cached data.

## 8. Staff Profile Users Regression Checks

- [ ] In `/staff/profiles/details/{profileId}/users`, the table still renders assigned users correctly.
- [ ] Suspending a user from the profile users table updates both the profile users table and the staff users list consistently.
- [ ] Reactivating a user from the profile users table updates both surfaces consistently.
- [ ] Unassigning a user from the profile users table still works and does not leave stale selection state behind.

## 9. Permission Checks

- [ ] A staff user without `list staff users` permission cannot access the list page.
- [ ] A staff user without `suspend staff users` permission cannot call suspend endpoints from row or bulk actions.
- [ ] A staff user without `reactivate staff users` permission cannot call reactivate endpoints from row or bulk actions.
- [ ] A staff user without `delete staff users` permission cannot call delete endpoints from row or bulk actions.
- [ ] A staff user without `update email for staff users` permission cannot use the email change action from the details page.

## 10. Negative / Edge Cases

- [ ] A bulk action with a mixed selection of valid and invalid targets reports partial success correctly.
- [ ] After deleting a suspended user, refreshing the page does not bring the deleted user back into the list.
- [ ] A deleted staff user is not accessible from the direct details URL.
- [ ] A deleted staff user no longer resolves in the profiles endpoint for that user.
