# Smoke Test Checklist: Staff User Profiles and Permissions (Staff Scope)

Date: 2026-04-09
Branch: `feat/staff-user-profiles-permissions`

This checklist covers the work done so far:
- Staff user profiles assignment (user-centric): `GET/PUT /staff/users/{userId}/profiles`
- Staff profile users list (profile-centric): `GET /staff/profiles/{profileId}/users`
- Staff profile search supports `q` (server-side search): `GET /staff/profiles?q=...`

## Setup

- [x] Run API: `make dev-api`
- [x] Run Frontend: `make dev-front`
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

## Staff Profile Details: Users Tab Backend Endpoint (API)

This is the new endpoint that Phase 4 (frontend) will consume.

- [ ] Ensure you have a staff profile (create one in UI or via Scalar `POST /staff/profiles`).
- [ ] Ensure at least one staff user has that profile assigned (use the staff user details Profiles UI).
- [ ] In Scalar: call `GET /staff/profiles/{profileId}/users?limit=50&sort_id=created_at&sort_order=desc`.
- [ ] Confirm response includes `users[]` and `count`.
- [ ] Confirm at least one expected user appears (by email).
- [ ] Confirm searching works: `GET /staff/profiles/{profileId}/users?q=<email_part>&limit=50`.
- [ ] Confirm sorting works for supported sort_id values: `created_at`, `email`, `first_name`, `last_name`, `status`.
- [ ] Confirm invalid `sort_id` returns `400` (BadRequest problem).
- [ ] Confirm malformed `profileId` returns `400` (translationKey `malformed-id`).
- [ ] Confirm unknown `profileId` returns `404`.

## Permission Enforcement (Backend)

### Endpoint Access Controls

- [ ] Login as non-admin staff user (a user that does not have the new permissions).
- [ ] Try `GET /staff/users/{userId}/profiles` in Scalar using that user’s session.
- [ ] Confirm `403` (must not be `401`).
- [ ] Try `PUT /staff/users/{userId}/profiles` similarly.
- [ ] Confirm `403`.
- [ ] Try `GET /staff/profiles/{profileId}/users` similarly.
- [ ] Confirm `403`.

### Danger Zone Permissions

- [ ] Login as non-admin staff user (no explicit user danger-zone permissions).
- [ ] In Scalar, try `POST /staff/users/{userId}/suspend`.
- [ ] Confirm `403` (must not be `401`).
- [ ] In Scalar, try `POST /staff/users/{userId}/reactivate`.
- [ ] Confirm `403`.
- [ ] In Scalar, try `PATCH /staff/users/{userId}/email`.
- [ ] Confirm `403`.

### Smoke Scenario for Tenant Invitation Revoke (End-to-End Permission)

This validates the original motivation: profile assignment produces effective permissions.

- [ ] Create a staff profile that contains the specific permission needed to revoke tenant invitations.
- [ ] Assign that staff profile to a non-admin staff user via the staff user details Profiles UI.
- [ ] Login as that non-admin staff user.
- [ ] Go to a tenant details Invitations tab (or the staff invitations surface, depending on where revoke lives).
- [ ] Revoke a pending tenant invitation.
- [ ] Confirm it succeeds (200) and the invitation status becomes revoked.
- [ ] Remove the profile from that user (as staff admin).
- [ ] Login again as the same non-admin staff user.
- [ ] Try to revoke another pending tenant invitation.
- [ ] Confirm it fails with `403`.

## Data Integrity Quick Checks (Optional)

- [ ] Verify `UserAccountProfile` junction rows are created/removed logically when assignments change.
- [ ] Verify no tenant/project scoped profiles can be assigned to staff users (API must reject with `422` translationKey `profile-not-staff-scope`).
- [ ] Verify Danger Zone actions generate audit log entries (suspend/reactivate/email change).
