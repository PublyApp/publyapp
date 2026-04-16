# Implementation Plan: Staff User, Profiles, Permissions (Staff Scope Only)

Date: 2026-04-09
Branch: `feat/staff-user-profiles-permissions`

This plan implements the design in:
- `docs/superpowers/specs/2026-04-09-staff-user-profiles-permissions-design.md`

## Phase 0: Scaffolding / Config

1. Make `MAX_PROFILES_PER_USER` an environment-configured setting:
   - Update `apps/api/Src/Lib/AppEnvironment.cs`:
     - Add `MAX_PROFILES_PER_USER` to the validated env-backed settings (int).
     - Keep default = 5 when env var not set.
   - Update `AppEnvironmentValidator` with a safe range (e.g. 1..50).
   - Update `.env.development` (or `.env.development.example` if secrets policy requires) to document the setting.

2. Ensure `GetTenantAuthData` (and any other consumer) reads the new setting name consistently.

## Phase 1: Backend API (User-centric profile assignment)

3. Add routes under the Users module:
   - `GET /staff/users/{userId}/profiles`
   - `PUT /staff/users/{userId}/profiles`

4. Add service methods in `Users` domain (or a small dedicated staff-facing service) to:
   - load staff user account by `userId`
   - load existing assigned staff profiles
   - validate profile ids (exist, staff scope, not deleted)
   - enforce `MAX_PROFILES_PER_USER`
   - update `UserAccountProfile` links with minimal writes (diff old/new)

5. Add new `AppPermissions` keys:
   - `staff.users.get_profiles_for_staff`
   - `staff.users.update_profiles_for_staff`

6. Add integration tests:
   - violation returns `422` with stable translationKey and field errors
   - success updates assignments correctly

## Phase 2: Backend API (Profile-centric users list + assign/unassign)

7. Add routes under the Profiles module:
   - `GET /staff/profiles/{profileId}/users` (real data replacing UI placeholder)
   - optional:
     - `POST /staff/profiles/{profileId}/users:assign`
     - `POST /staff/profiles/{profileId}/users:unassign`

8. Add `AppPermissions` keys:
   - `staff.profiles.list_users_for_staff_profile`
   - `staff.profiles.assign_users_for_staff_profile`
   - `staff.profiles.unassign_users_for_staff_profile`

9. Add integration tests for list + assignment operations, including max constraint enforcement.

## Phase 3: Frontend (Staff user page: assign profiles)

10. Add a "Profiles" section to `apps/front/src/routes/authed/staff/staff-users/details/...`:
   - Query: `GET /staff/users/{userId}/profiles`
   - UI: multi-select list with max N
   - Mutation: `PUT /staff/users/{userId}/profiles`
   - Error handling: `toApiFailure` + `getFailureMessage(...)`

11. Ensure client generation stays in sync:
   - Run `make build-api`
   - Run `make generate-client`
   - Run `make tsc-front`

## Phase 4: Frontend (Staff profile details: users tab)

12. Replace placeholder empty table in:
   - `apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx`
   with real query + pagination.

13. Add assign/unassign UX:
   - simplest: drawer with user picker and assign/unassign actions
   - more advanced: bulk selection in the table

## Phase 5: Wiring profile permissions UI (Optional but Recommended)

14. Replace mocked `PERMISSIONS_DATA` and `Math.random()` switch state with real data:
   - `GET /staff/permissions` for the available keys + translations
   - profile-specific get/update endpoints for profile permission membership

15. Add integration tests for toggling permissions.

## Phase 6: Smoke Test Checklist Updates

16. Update `docs/misc/tenant-module-smoke-test-checklist.md`:
   - Add explicit steps asserting non-admin staff user can revoke tenant invitation when they have only the precise permission.
   - Add explicit steps asserting missing permission yields `403`.

## Verification Checklist (Before Merge)

- `make build-api`
- `make generate-client`
- `make tsc-front`
- `make test-api`
- Manual smoke:
  - Create staff profile with revoke-for-tenant permission
  - Assign it to non-admin staff user
  - Log in as that user and revoke a pending tenant invitation

