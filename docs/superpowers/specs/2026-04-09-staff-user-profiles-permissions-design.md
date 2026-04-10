# Staff User, Profiles, Permissions (Staff Scope Only)

Date: 2026-04-09
Status: Draft
Owner: Staff module

## Problem

Smoke test item `docs/misc/tenant-module-smoke-test-checklist.md` requires:

- A non-admin staff user who has the specific *tenant invitation revoke* permission can revoke a pending tenant invitation successfully.
- A non-admin staff user without that permission gets `403`.

Today the underlying data model exists (`UserAccountProfile` links + `ProfilePermission`), and staff/tenant-as-staff endpoints already enforce permissions via `.WithPermission(...)`.

What is missing is a complete, consistent "user -> profiles -> permissions" management surface (staff scope only), including:

- Assigning profiles to staff users from the staff user details page.
- Managing users assigned to a staff profile from the staff profile details page.
- Enforcing a hard maximum number of profiles per user account.

## Goals

- Allow assigning up to N staff profiles to a staff user account (N is configurable via environment).
- Support management from both perspectives:
  - User page: assign/unassign profiles for the user.
  - Profile page: see assigned users and assign/unassign users.
- Enforce rules in the API (not just UI).
- Keep business rules centralized and consistent.
- Preserve existing permission enforcement semantics:
  - Non-admin staff users can perform actions if their effective permissions allow it.

## Non-Goals (for this slice)

- Tenant scope and project scope profile assignment UIs.
- Reworking the permission system model (effective permissions computation stays as-is).
- Role-based "admin" semantics replacing permissions (permissions remain the authority).
- Performance re-architecture (no caching layer/outbox/etc here).

## Domain Model (Existing)

- `Profile` (scope = Staff/Tenant/Project)
- `ProfilePermission` links `ProfileId` -> `PermissionKey`
- `UserAccountProfile` links `UserAccountId` -> `ProfileId`
- Effective permissions are derived by joining:
  `UserAccountProfile -> ProfilePermission -> PermissionKey`

Important invariant:
- Only staff users should be linked to staff profiles.

## Hard Constraint: Max Profiles Per User Account

We enforce a hard limit on the number of profiles assigned to a single user account.

- Configuration:
  - Add env-configured setting in `AppEnvironment`:
    - `MAX_PROFILES_PER_USER` (integer)
  - Provide default = `5` when unset.
  - Validate range (e.g. `1..50`) in `AppEnvironmentValidator`.

- API behavior:
  - Any mutation that would result in more than `MAX_PROFILES_PER_USER` profile links for the target staff user account must return a validation problem:
    - HTTP: `422 Unprocessable Entity`
    - RFC 7807 body with:
      - `translationKey`: stable key (see below)
      - `errors`: field-scoped entry (e.g. `profileIds`)

## API Design

Principle:
- The canonical write model is "user-centric": assign profile IDs to a user account.
- The profile page can use profile-centric read endpoints for listing users, but writes still share the same service methods and validations.

### User-centric endpoints (Staff)

1) Get assigned + available staff profiles for a staff user.

- `GET /staff/users/{userId}/profiles`
- Permission: `AppPermissions.Staff.Users.GET_PROFILES_FOR_STAFF` (new)
- Response:
  - `assignedProfiles: [{ id, name, description? }]`
  - `availableProfiles: [{ id, name, description? }]`
  - `maxProfilesPerUser: number` (so UI can display the limit without duplicating env values)

2) Replace staff user profile assignments (set-based update).

- `PUT /staff/users/{userId}/profiles`
- Permission: `AppPermissions.Staff.Users.UPDATE_PROFILES_FOR_STAFF` (new)
- Body:
  - `profileIds: string[]` (UUIDs)
- Validations:
  - `profileIds` required (can be empty to remove all profiles)
  - `profileIds` unique
  - length <= `MAX_PROFILES_PER_USER`
  - each profile must exist, must be `ProfileScope.Staff`, must not be deleted
  - user must be a staff user account (mutual exclusivity still enforced)
- Response:
  - `200 Ok` with:
    - `assignedProfiles: [...]` (post-update)
    - `maxProfilesPerUser`

Notes:
- Prefer set replacement over add/remove endpoints to avoid racey partial updates and to keep idempotence.

### Profile-centric endpoints (Staff)

3) List users assigned to a staff profile.

- `GET /staff/profiles/{profileId}/users`
- Permission: `AppPermissions.Staff.Profiles.LIST_USERS_FOR_STAFF_PROFILE` (new)
- Query:
  - cursor pagination (consistent with staff lists) or offset pagination (match existing list conventions in the repo for this UI)
  - optional search by email/name
- Response:
  - paginated list with user item fields required by UI

4) Assign/unassign users to a staff profile.

We still centralize validation via the user-centric service method. API options:

Option A (recommended): bulk patch by user ids using user-centric semantics.
- `POST /staff/profiles/{profileId}/users:assign`
- `POST /staff/profiles/{profileId}/users:unassign`

Option B: provide only read on profile page and do writes by calling `PUT /staff/users/{userId}/profiles` (less elegant for bulk).

Recommendation:
- Provide assign/unassign endpoints for profile page UX, but implement them by:
  - loading the target user's current profile set
  - applying add/remove
  - reusing the same "replace set" validation function

## Permissions (New Keys)

We introduce explicit permissions for profile assignment operations instead of piggybacking on generic user/profile update permissions.

Proposed permission keys (final names must follow existing `AppPermissions` conventions):

- `staff.users.get_profiles_for_staff`
- `staff.users.update_profiles_for_staff`
- `staff.profiles.list_users_for_staff_profile`
- `staff.profiles.assign_users_for_staff_profile`
- `staff.profiles.unassign_users_for_staff_profile`

Staff Owner should have all of them by default (seeding).

## Error / Problem Details Conventions

- All validation errors: `422` via `TypedProblems.ValidationProblem(...)`.
- All not-found conditions: `404` via `TypedProblems.NotFound(...)`.
- All permission failures: `403` by the permission filter (do not return `401`).

Stable translation keys needed:

- `max-profiles-per-user-exceeded`
- `profile-not-found`
- `profile-not-staff-scope`
- `user-not-found`
- `user-not-staff`

## Frontend UX

### Staff User Details Page

Add a "Profiles" section:

- Multi-select / toggle list of staff profiles.
- Selected chips show currently assigned staff profiles.
- Enforce max selection client-side using `maxProfilesPerUser` from API response.
- On save, call `PUT /staff/users/{userId}/profiles`.
- Errors surfaced using the repo’s standard `toApiFailure` + `getFailureMessage` pattern.

### Staff Profile Details Page

Basics tab:
- Keep the existing toggle-list UI, but wire it to real data:
  - permissions list from backend `GET /staff/permissions` (already exists)
  - current profile permission state from backend (to be implemented if missing)
  - mutations to add/remove permissions on a profile (to be implemented if missing)

Users tab:
- Replace the placeholder empty table with real data from:
  - `GET /staff/profiles/{profileId}/users`
- Add assign/unassign actions:
  - bulk select users and assign/unassign
  - or a drawer with user picker

## Testing Strategy (Integration Tests Only)

Backend integration tests (must have):

- `PUT /staff/users/{userId}/profiles`:
  - rejects > max with `422` + expected `translationKey` + `errors.profileIds`
  - rejects non-staff profiles
  - rejects unknown profile ids
  - succeeds with empty list (unassign all)

- Effective permissions:
  - Create profile containing `staff.invitations.revoke_for_tenant`
  - Assign it to a non-admin staff user
  - Verify the user can revoke a pending tenant invitation via tenant-scoped revoke route

Frontend smoke tests (checklist additions):
- Assigning profile to non-admin staff user enables revoke action.
- Removing profile disables revoke action and yields `403` on forced attempt.

## Rollout Notes

- This slice intentionally supports breaking the UI/UX work into:
  - backend endpoints first,
  - then user page,
  - then profile users tab,
  - then profile permissions wiring.

