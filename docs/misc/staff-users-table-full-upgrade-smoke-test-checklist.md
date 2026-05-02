# Staff Users Table Full Upgrade Smoke Test Checklist

Use this checklist to manually validate the work from PR `#329` on branch `feat/280-staff-users-table-full-upgrade`.

Route under test:

- `/staff/staff-users`

Related surfaces:

- `/staff/staff-users/details/{userId}`
- `/staff/profiles/details/{profileId}/users`

## 1. Table Loading And Basic Rendering

- [x] The staff users list loads without an error state.
- [x] The first column shows user identity in a dense two-line layout: full name on the first line and email on the second line.
- [x] The status column renders valid labels only for the supported statuses: `Active`, `Pending`, and `Suspended`.
- [x] A newly created unverified staff user appears with `Pending` status.
- [x] No row renders a `Banned` status label.
- [x] The action column always renders the full row-action set; actions that do not apply to the current row are disabled and show a reason tooltip.

## 2. Search, Filter, Sort, And Cursor Pagination

- [x] Typing in the search field filters the list after debounce.
- [x] Clearing the search field restores the default result set.
- [x] The status filter accepts supported statuses and updates the list correctly.
- [x] Selecting multiple statuses filters correctly when more than one status is chosen.
- [x] Sorting by each supported column works without breaking pagination.
- [x] Advancing to the next cursor page works and does not duplicate rows from the previous page.

## 3. Selection Mode Locking

- [x] Selecting one or more rows enters selection mode.
- [x] While selection mode is active, search is visually disabled.
- [x] While selection mode is active, filter controls are visually disabled.
- [x] While selection mode is active, table sorting is visually disabled.
- [x] Clearing the selection exits selection mode and restores normal search/filter/sort controls.
- [x] If a search term was edited just before entering selection mode, the uncommitted debounced draft is discarded, and clearing the selection keeps the last committed URL search value.

## 4. Bulk Actions

- [x] Opening the bulk actions menu shows `Export selected`, `Suspend selected`, `Reactivate selected`, and `Delete selected`.
- [x] Bulk suspend works for active users and shows the correct success or partial-success toast.
- [x] Bulk reactivate works for suspended users and shows the correct success or partial-success toast.
- [x] Bulk delete only succeeds for suspended users and shows the correct success or partial-success toast.
- [x] After a successful bulk lifecycle action, the affected rows update correctly in the table.
- [x] After a successful bulk delete, deleted users disappear from the list.

## 5. Export

- [x] The page export action opens the export dialog.
- [x] In normal mode, exporting CSV downloads the current result set.
- [x] In normal mode, exporting JSON downloads the current result set.
- [x] In selection mode, exporting CSV downloads only the selected rows.
- [x] In selection mode, exporting JSON downloads only the selected rows.
- [x] Selecting `XLSX` shows the translated “coming soon” message and disables the export button.

## 6. Row Actions

- [x] For a pending user, the follow-up action is visible and works.
- [x] For a pending user, the verification-link copy action works when enabled by the feature flag.
- [x] Opening the status cell menu on an active user allows suspending the user after confirmation and updates the row status.
- [x] Opening the status cell menu on a suspended user allows reactivating the user after confirmation and updates the row status.
- [x] Opening the level cell menu allows changing between `Admin` and `User` and updates the row level.
- [x] Deleting a suspended user works and removes the row from the table.
- [x] The delete action is disabled for non-suspended users and shows the explanatory tooltip.
- [x] The quick preview action uses the `solar:list-bold` icon and opens a right drawer with the user's details.
- [x] The quick preview drawer includes a link to the correct staff-user details page.

## 7. Staff User Details Regression Checks

- [x] Suspending a user from the details page updates the details view and the list view consistently.
- [x] Reactivating a user from the details page updates the details view and the list view consistently.
- <s>[ ] Updating the user email from the details danger zone still works.</s>
- [x] Returning to the staff users list after a details-page lifecycle action shows fresh data, not stale cached data.

## 8. Staff Profile Users Regression Checks

- [x] In `/staff/profiles/details/{profileId}/users`, the table still renders assigned users correctly.
- [x] Suspending a user from the profile users table updates both the profile users table and the staff users list consistently.
- [x] Reactivating a user from the profile users table updates both surfaces consistently.
- [x] Unassigning a user from the profile users table still works and does not leave stale selection state behind.

## 9. API Permission Enforcement

- [x] A staff user without `list staff users` permission cannot call the staff-users list endpoint.
- [x] A staff user without `suspend staff users` permission cannot call suspend endpoints from row or bulk actions.
- [x] A staff user without `reactivate staff users` permission cannot call reactivate endpoints from row or bulk actions.
- [x] A staff user without `delete staff users` permission cannot call delete endpoints from row or bulk actions.
- [x] A staff user without `update email for staff users` permission cannot call the email-change endpoint.

## 10. Negative / Edge Cases

- [x] A bulk action with a mixed selection of valid and invalid targets reports partial success correctly.
- [x] After deleting a suspended user, refreshing the page does not bring the deleted user back into the list.
- [x] A deleted staff user is not accessible from the direct details URL.
- [x] A deleted staff user no longer resolves in the profiles endpoint for that user.
