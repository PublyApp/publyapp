# Tenant Profiles Module Completion

## Context

The tenant details `Profiles` tab is currently incomplete.

Today it has three structural problems:

- the frontend still renders a permission matrix that is mostly placeholder UI
- the backend only supports tenant-profile listing; create, get, update, delete, and permission editing are missing
- tenant-profile permissions are not backend-owned or backend-enforced yet

The current tab therefore gives the impression of completeness while still relying on stub actions, frontend-owned permission constants, and a UI shape that does not scale as the permission surface grows.

This design replaces that partial matrix experience with a complete tenant-profile management module that follows the repo's stronger staff-table patterns and establishes the first real tenant-scope permission model.

## Goals

- replace the matrix-first UI with a complete table-first tenant profiles surface
- make tenant profile create, get, update, delete, and permission editing real
- move tenant permission availability to a backend-owned catalog
- enforce the initial tenant permission set in real tenant navigation and access paths
- add audit logging for tenant-profile mutations
- update smoke tests and integration coverage so the tab is no longer treated as partial or placeholder

## Non-Goals

- add a separate tenant-profile details route in this phase
- design a broader tenant permission taxonomy beyond the current four coarse module-access permissions
- un-defer the tenant billing product itself
- un-defer the tenant activity tab or create a tenant-local audit-log UI

## Existing Foundations

Two relevant foundations already exist and should be reused rather than replaced:

- `GET /staff/tenants/{tenantId}/profiles` has already been upgraded to the repo's cursor-pagination pattern
- the staff profiles module already demonstrates the correct patterns for:
  - table completeness
  - preview drawers
  - permission catalog retrieval
  - profile CRUD
  - permission assignment endpoints

This work should extend those foundations to tenant profiles instead of inventing a separate model.

## Product Design

### Default Page Shape

The tenant details `Profiles` tab should use a standard list-page layout, not a permanent matrix.

The default surface is:

- a complete profiles table
- a right-side preview drawer for fast inspection
- a right-side create/edit drawer
- an explicit large compare drawer opened from selected rows

This keeps the default state optimized for management and scanning while still supporting deeper comparison when needed.

### Main Table

The main table should follow the repo's mature list-table conventions:

- search
- cursor pagination
- sorting on meaningful fields
- row selection
- selection mode actions
- export
- row actions

Recommended columns:

- profile
- description
- user accounts count
- default
- actions

The first entity column should follow the repo's neutral first-column icon treatment.

### Row Actions

Each row should always expose visible actions.

Recommended row actions:

- preview
- edit
- delete

Actions that are unavailable should remain visible but disabled with a clear explanation instead of disappearing.

### Selection Mode

Selection mode should use the same behavioral rules already established on stronger staff tables:

- sorting, filtering, and pagination controls lock while selection mode is active
- compare is available only when exactly `2` or `3` profiles are selected
- export works on the current selection
- bulk delete is available only when every selected row is deletable

The default tenant profile must remain selectable for compare and export, but it must block bulk delete when present in the selection.

### Preview Drawer

The preview drawer is read-only and optimized for quick inspection.

It should show:

- profile name
- description
- default badge
- user-account count
- permission badges or grouped permission list

There is no separate tenant-profile details route in this phase, so the preview drawer does not need a deep-link CTA.

### Create / Edit Drawer

Create and edit should share one drawer surface and one form model.

The drawer should include:

- name
- description
- grouped permission checklist or toggles

The drawer must not reuse the old matrix metaphor. Permission editing should be list- or group-based, consistent with the staff-profile permissions experience.

The default profile remains editable. Only deletion is blocked.

### Compare Drawer

Compare mode opens an explicit large right-side drawer.

It should support `2` to `3` selected profiles and present:

- profile metadata summary at the top
- permission comparison below
- clear visual emphasis on differences

This drawer may use a matrix-like read-only comparison layout because comparison is its explicit purpose. The main page should not.

## Frontend Architecture Notes

The implementation should follow the repo's React composition preferences:

- route components stay thin
- controller components own their own drawer or dialog state
- table-adjacent actions should avoid prop-drilling fine-grained state through the whole table
- local interaction state should be contained close to the component that owns it to avoid unnecessary sibling rerenders

This is especially important for:

- preview drawer state
- create/edit drawer state
- compare drawer state
- delete confirmation state
- export dialog state

## Backend Design

### Tenant Profile CRUD Surface

Tenant profiles should become a first-class staff-managed slice under:

- `GET /staff/tenants/{tenantId}/profiles`
- `POST /staff/tenants/{tenantId}/profiles`
- `GET /staff/tenants/{tenantId}/profiles/{profileId}`
- `PATCH /staff/tenants/{tenantId}/profiles/{profileId}`
- `DELETE /staff/tenants/{tenantId}/profiles/{profileId}`
- `GET /staff/tenants/{tenantId}/profiles/{profileId}/permissions`
- `POST /staff/tenants/{tenantId}/profiles/{profileId}/permissions/{permissionKey}`
- `DELETE /staff/tenants/{tenantId}/profiles/{profileId}/permissions/{permissionKey}`

Handlers, DTOs, and service methods should mirror the structure already used for staff profiles, but scoped to `Tenant` profiles only.

Malformed IDs must remain `400`, missing entities must remain `404`, and domain or validation failures must stay RFC 7807 compliant.

### Tenant Permission Catalog

Tenant permission availability must become backend-owned.

The canonical model should mirror the staff permission catalog pattern:

- define runtime tenant permissions in `AppPermissions.Tenant`
- seed matching `permissions` rows in the database
- expose a staff-readable tenant permission catalog endpoint

Recommended endpoint:

- `GET /staff/permissions/tenant`

The response shape should mirror the existing staff permission catalog:

- dictionary keyed by slice prefix
- each slice maps permission key to translated permission metadata

This keeps the frontend aligned with a backend source of truth and preserves a scalable grouping model as tenant permissions grow later.

### Canonical Permission Keys

Canonical tenant permission keys must follow the backend permission model and include the tenant scope prefix.

The current frontend-only values such as:

- `can_access_dashboard`
- `can_access_billing`
- `can_access_settings`
- `can_access_users`

must not remain the authoritative contract.

The completed backend contract should use the `modules` slice and these canonical tenant-scoped keys:

- `tenant.modules.access_dashboard`
- `tenant.modules.access_billing`
- `tenant.modules.access_settings`
- `tenant.modules.access_users`

After this completion, the frontend must stop using `TENANT_PROFILES_PERMISSIONS_ENUM` as the source of truth for editing or comparison. If the constant has no valid remaining use after the refactor, it should be removed.

### Tenant Permission Enforcement

Making tenant-profile permissions editable is not enough. The initial four coarse permissions must start affecting real tenant behavior in the same phase.

The initial permission set is:

- tenant dashboard access
- tenant billing access
- tenant settings access
- tenant users access

These permissions should be enforced through the existing backend-auth and frontend-navigation surfaces so that tenant profiles become meaningful immediately.

At minimum, the implementation should ensure:

- tenant auth or tenant bootstrap data exposes the effective tenant permission set
- tenant navigation visibility and gating respects those permissions
- tenant routes and data surfaces for the four modules respect those permissions

Billing keeps its current feature-flag behavior:

- if billing is feature-disabled, nobody gets access through permission alone
- if billing is feature-enabled, tenant permission enforcement still applies

### Default Profile Invariant

Every tenant must have exactly one active default tenant profile.

Rules:

- the default tenant profile is auto-created if missing
- the default tenant profile is editable
- the default tenant profile cannot be deleted
- delete attempts against the default tenant profile return a clear domain error

The existing partial unique index for active default tenant profiles should remain the invariant anchor.

### Delete Semantics

Delete should mirror the current staff-profile deletion strategy where appropriate:

- soft-delete the profile row
- remove assignment links so the deleted profile stops contributing to counts immediately
- remove profile-permission links so deleted profiles no longer affect permission resolution

For tenant profiles, default-profile protection is the additional rule on top of that base behavior.

### Audit Logging

Audit logging is in scope for the mutating tenant-profile actions.

Recommended new audit actions:

- `tenant.profile.created`
- `tenant.profile.updated`
- `tenant.profile.deleted`
- `tenant.profile.permissions.assigned`
- `tenant.profile.permissions.unassigned`
- `tenant.profile.bulk.deleted`

Audit logs should use the existing global audit-log system, not a new tenant activity UI.

Read actions are not audited:

- list
- preview
- compare
- search
- drawer open and close

Recommended audit `details` payload:

- `tenantId`
- `profileId`
- `profileName`
- `isDefault`
- changed fields for updates
- affected `permissionKey` for permission assignment changes
- counts where relevant for create or bulk delete

## Data and Migration Notes

This phase intentionally replaces the frontend-owned placeholder permission model with a backend-owned one.

If any development data already uses legacy unprefixed tenant permission keys, it must not be treated as the final contract.

Acceptable resolution:

- migrate legacy development rows to the canonical backend keys, or
- reset development data before verification if that is the team's preferred path

No production-compatibility workaround is required here because the old tenant-profile permission model was never completed or stabilized.

## Testing Design

### Backend Integration Coverage

Integration tests should cover:

- tenant profile list success and cursor-pagination failures
- get tenant profile by id
- create tenant profile
- update tenant profile basics
- delete tenant profile
- default-profile delete rejection
- list assigned permissions for a tenant profile
- assign tenant-profile permission
- unassign tenant-profile permission
- list available tenant permissions from the catalog endpoint
- tenant permission enforcement across the initial four tenant modules
- audit-log creation for tenant-profile mutations

### Frontend Smoke Coverage

The tenant module smoke checklist should be rewritten so Category 7 is no longer matrix-oriented.

Recommended assertions:

- the tenant profiles table loads real backend rows
- search, sorting, cursor pagination, export, and selection mode behave correctly
- preview drawer shows the real profile state
- create profile works end-to-end
- edit profile basics works end-to-end
- permission editing works end-to-end
- compare drawer shows selected profiles side by side and highlights differences
- delete works for non-default profiles
- delete is blocked for the default profile with a clear explanation
- tenant navigation and route access actually change according to assigned tenant-profile permissions

## Rollout Notes

The current matrix UI should be removed, not kept as a second presentation mode.

This phase completes the tenant profiles tab as a management surface and also establishes the first real tenant permission contract. That permission contract should then become the canonical basis for any future tenant-scope authorization refinements.

## Summary of Approved Decisions

- default UX is table-first, not matrix-first
- compare mode exists, but only as an explicit large drawer
- create and delete are real in this phase
- permission editing is real in this phase
- tenant permission availability is backend-owned
- the initial four coarse tenant permissions become truly enforced in this phase
- audit logging is included for mutating tenant-profile operations
- the tenant activity tab remains out of scope
