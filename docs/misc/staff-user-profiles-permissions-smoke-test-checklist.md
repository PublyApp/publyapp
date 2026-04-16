# Smoke Test Checklist: Staff User Profiles and Permissions (Staff Scope)

Date: 2026-04-09
Branch: `feat/staff-user-profiles-permissions`

This checklist covers the work done so far:
- Staff user profiles assignment (user-centric): `GET/PUT /staff/users/{userId}/profiles`
- Staff profile users list (profile-centric): `GET /staff/profiles/{profileId}/users`
- Staff profile search supports `q` (server-side search): `GET /staff/profiles?q=...`

## Setup

- [x] Run API: `just dev-api`
- [x] Run Frontend: `just dev-front`
- [x] Open API docs: `http://localhost:5000/scalar/v1`
- [x] Open frontend: `http://localhost:5050`
- [x] Confirm you can login as a staff admin (seeded admin is fine).
- [x] Confirm you have a non-admin staff user you can login with (seeded staff user is fine).

## Staff User Details: Assign Profiles (Frontend)

- [x] Login as staff admin.
- [x] Go to Staff Users list.
- [x] Open a specific staff user details page.
- [x] Confirm the page renders the new "Profiles" section (card).
- [x] Confirm the section loads without errors and shows currently assigned profiles (may be empty).
- [x] Confirm the UI shows the max profiles limit (value comes from API).

### Typeahead Search

- [x] In the Profiles autocomplete, type a partial profile name.
- [x] Confirm results update based on server-side search (it should not require loading all profiles).
- [x] Confirm clearing the search still keeps assigned profiles visible.

### Replace-Set Update Semantics

- [x] Assign 1 profile to the user.
- [x] Confirm a success toast appears.
- [x] Refresh the page and confirm the assignment persists.
- [x] Add a second profile (now 2 selected).
- [x] Confirm the API behaves as replace-set (selected = full desired set).
- [x] Remove one profile (back to 1 selected).
- [x] Refresh the page and confirm only the remaining profile is assigned.
- [x] Remove all profiles (empty selection).
- [x] Refresh the page and confirm no profiles are assigned.

### Max Profiles Per User (Hard API Constraint)

- [x] Determine the current max from the UI (or via `GET /staff/users/{userId}/profiles`).
- [x] Try selecting `max + 1` profiles in the UI.
- [x] Confirm the UI prevents the selection and shows an error toast.
- [x] Using Scalar, call `PUT /staff/users/{userId}/profiles` with `profileIds` length `max + 1`.
- [x] Confirm the API returns `422` RFC7807 Validation Problem with translationKey `max-profiles-per-user-exceeded`.

## Staff User Details: Danger Zone (Frontend + API)

These are high-impact operations and are intentionally *not* part of the general “edit staff user” PATCH.

### Suspend / Reactivate Staff User

- [x] Login as staff admin.
- [x] Go to a Staff User details page.
- [x] Confirm there is a “Danger zone” card at the bottom of the right column.
- [x] Click “Suspend” and confirm the dialog copy is clear and requires confirmation.
- [x] Confirm a success toast appears.
- [x] Confirm the user status displays as `Suspended` on the details page.
- [x] Confirm the suspended user still appears in the Staff Users list (not silently hidden).
- [x] In Scalar: call `POST /staff/users/{userId}/suspend` for the same user.
- [x] Confirm calling suspend again returns `409` (Conflict) with translationKey `staff-user-already-suspended`.
- [x] Click “Reactivate” and confirm a success toast appears.
- [x] Confirm status returns to `Active` (or the expected active status) in the UI.
- [x] In Scalar: call `POST /staff/users/{userId}/reactivate` when the user is already active.
- [x] Confirm it returns `409` (Conflict) with translationKey `staff-user-not-suspended`.

### Change Email (Dedicated High-Risk Flow)

- [ ] Go to a Staff User details page.
- [ ] Confirm the email is displayed read-only in the sidebar metadata (copyable is fine), and is not editable in the general form.
- [ ] Click “Change email” in Danger Zone.
- [ ] Confirm the dialog requires entering the new email twice and blocks submit when the values do not match.
- [ ] Change the email to a unique email and confirm a success toast appears.
- [ ] Refresh the page and confirm the email persists and matches the new value.
- [ ] Attempt to change the email to an email that already exists on another user.
- [ ] Confirm the API returns `422` RFC7807 Validation Problem with translationKey `email-already-in-use` and `errors.email[]` present.
- [ ] Confirm the UI shows a translated user-facing message (not a raw translation key).

## Staff Profiles: Find/Search (API)

- [x] In Scalar: call `GET /staff/profiles?limit=20&sort_id=name&sort_order=asc`.
- [x] Confirm you get `data[]` + `nextCursor`.
- [x] Call `GET /staff/profiles?q=<part_of_name>&limit=20&sort_id=name&sort_order=asc`.
- [x] Confirm results are filtered by `q` (name/description).

## Staff Profile Details: Basics + Permissions (Frontend + API)

This covers the new staff profile details UI:
- Basics form (PATCH name/description)
- Permissions matrix (GET assigned permission keys + per-key toggle POST/DELETE)

### Basics: Update Staff Profile

- [x] Login as staff admin.
- [x] Go to Staff Profiles list.
- [x] Open a specific staff profile details page.
- [x] In the Basics tab, change the profile name.
- [x] Confirm the “Save changes” button is disabled until the form is dirty.
- [x] Click “Save changes” and confirm a success toast appears (translated).
- [x] Refresh the page and confirm the updated name persists.
- [x] Clear the description (empty it) and save.
- [x] Refresh and confirm the description is cleared (null/empty).
- [x] Try setting the name to 1 character and confirm validation returns `422` (RFC7807 validation problem).
- [x] Try changing the name to an existing staff profile name and confirm `400` with translationKey `profile-name-already-exists`.

### Permissions: Assigned Keys + Toggle

- [x] In the same profile details Basics tab, scroll to the Permissions section.
- [x] Toggle a permission ON.
- [x] Confirm the switch flips immediately (optimistic UI) and only that row is temporarily disabled during the request.
- [x] Refresh and confirm the permission remains ON.
- [x] Toggle the same permission OFF, refresh, confirm it remains OFF.
- [x] Toggle the same permission ON twice quickly.
- [x] Confirm there is no duplicate behavior and no errors (POST is idempotent).

### API Validation / Idempotency

- [x] In Scalar: call `GET /staff/profiles/{profileId}/permissions`.
- [x] Confirm the response is `permissionKeys[]` (raw keys) and is sorted.
- [x] In Scalar: call `POST /staff/profiles/{profileId}/permissions/{permissionKey}` twice.
- [x] Confirm both return `204` and the permission is present in `GET .../permissions`.
- [x] In Scalar: call `DELETE /staff/profiles/{profileId}/permissions/{permissionKey}` twice.
- [x] Confirm both return `204` and the permission is absent from `GET .../permissions`.
- [x] Confirm a malformed `profileId` returns `400` (translationKey `malformed-id`).
- [x] Confirm an unknown `profileId` returns `404`.

## Staff Profile Details: Users Tab (Frontend + API)

This covers the profile-centric assignment drawer built on the canonical
cursor-paginated `GET /staff/users` contract plus the existing
`GET /staff/profiles/{profileId}/users` list.

### Users List + Assignment Drawer

- [x] Ensure you have a staff profile (create one in UI or via Scalar `POST /staff/profiles`).
- [x] Ensure at least one staff user has that profile assigned (use the staff user details Profiles UI).
- [x] Open that profile details page and go to the `Users` tab.
- [x] Confirm the existing assigned users table loads without errors.
- [x] Click `Assign user` and confirm the right drawer opens.
- [x] Confirm the drawer header stays fixed while only the results list scrolls.
- [x] In the drawer search box, type a partial user name or email.
- [x] Confirm results are filtered server-side (not client-side) and update after debounce.
- [x] Clear the search and confirm the list resets correctly.
- [x] Scroll near the bottom of the drawer list.
- [x] Confirm the next page loads automatically (infinite loading) without losing the current results.
- [x] On an unassigned user row, click the assign icon button.
- [x] Confirm the row updates immediately, the main users table refreshes, and the user appears in the profile users list after settle.
- [x] On an assigned user row in the drawer, click the unassign icon button.
- [x] Confirm the row updates immediately, the main users table refreshes, and the user disappears from the profile users list after settle.
- [x] Click assign/unassign repeatedly on different rows in quick succession.
- [x] Confirm only the affected rows show pending state, no duplicate action occurs, and the final server state matches the last successful clicks.

### Users Tab Backend Endpoint

- [x] In Scalar: call `GET /staff/profiles/{profileId}/users?limit=50&sort_id=created_at&sort_order=desc`.
- [x] Confirm response includes `users[]` and `count`.
- [x] Confirm at least one expected user appears (by email).
- [x] Confirm searching works: `GET /staff/profiles/{profileId}/users?q=<email_part>&limit=50`.
- [x] Confirm sorting works for supported sort_id values: `created_at`, `email`, `first_name`, `last_name`, `status`.
- [x] Confirm invalid `sort_id` returns `400` (BadRequest problem).
- [x] Confirm malformed `profileId` returns `400` (translationKey `malformed-id`).
- [x] Confirm unknown `profileId` returns `404`.

### Canonical Staff Users Endpoint Used By The Drawer

- [x] In Scalar: call `GET /staff/users?limit=20&sort_id=created_at&sort_order=desc`.
- [x] Confirm the response uses the canonical cursor contract: `data[]` + `nextCursor`.
- [x] Call `GET /staff/users?q=<email_part>&limit=20&sort_id=created_at&sort_order=desc`.
- [x] Confirm `q` filters by name/email on the server.
- [x] Call the next page using the returned `nextCursor`.
- [x] Confirm the next page continues correctly without duplicates from the previous page.

## Permission Enforcement (Backend)

### Endpoint Access Controls

- [x] Login as non-admin staff user (a user that does not have the new permissions).
- [x] Try `GET /staff/users/{userId}/profiles` in Scalar using that user’s session.
- [x] Confirm `403` (must not be `401`).
- [x] Try `PUT /staff/users/{userId}/profiles` similarly.
- [x] Confirm `403`.
- [x] Try `GET /staff/profiles/{profileId}/users` similarly.
- [x] Confirm `403`.
- [x] Try `PATCH /staff/profiles/{profileId}` similarly.
- [x] Confirm `403`.
- [x] Try `GET /staff/profiles/{profileId}/permissions` similarly.
- [x] Confirm `403`.
- [x] Try `POST /staff/profiles/{profileId}/permissions/{permissionKey}` similarly.
- [x] Confirm `403`.
- [x] Try `DELETE /staff/profiles/{profileId}/permissions/{permissionKey}` similarly.
- [x] Confirm `403`.

### Danger Zone Permissions

- [x] Login as non-admin staff user (no explicit user danger-zone permissions).
- [x] In Scalar, try `POST /staff/users/{userId}/suspend`.
- [x] Confirm `403` (must not be `401`).
- [x] In Scalar, try `POST /staff/users/{userId}/reactivate`.
- [x] Confirm `403`.
- [x] In Scalar, try `PATCH /staff/users/{userId}/email`.
- [x] Confirm `403`.

### Smoke Scenario for Tenant Invitation Revoke (End-to-End Permission)

This validates the original motivation: profile assignment produces effective permissions.

- [x] Create a staff profile that contains the specific permission needed to revoke tenant invitations.
- [x] Assign that staff profile to a non-admin staff user via the staff user details Profiles UI.
- [x] Login as that non-admin staff user.
- [x] Go to a tenant details Invitations tab (or the staff invitations surface, depending on where revoke lives).
- [x] Revoke a pending tenant invitation.
- [x] Confirm it succeeds (200) and the invitation status becomes revoked.
- [x] Remove the profile from that user (as staff admin).
- [x] Login again as the same non-admin staff user.
- [x] Try to revoke another pending tenant invitation.
- [x] Confirm it fails with `403`.

## Data Integrity Quick Checks (Optional)

- [ ] Verify `UserAccountProfile` junction rows are created/removed logically when assignments change.
- [ ] Verify no tenant/project scoped profiles can be assigned to staff users (API must reject with `422` translationKey `profile-not-staff-scope`).
- [ ] Verify Danger Zone actions generate audit log entries (suspend/reactivate/email change).
