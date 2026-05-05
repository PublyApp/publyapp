# Tenant Profiles Module Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the staff-managed tenant profiles module end-to-end: backend CRUD, tenant permission catalog, permission enforcement, audit logging, frontend table/drawer UX, and automated/manual verification.

**Architecture:** Reuse the established staff-profile and mature staff-table patterns instead of inventing a tenant-specific variant. Tenant profiles stay under the `Profiles` module, tenant permission catalog stays under the `Permissions` module, tenant permission definitions become real runtime `AppPermissions.Tenant` entries, and the frontend consumes backend-owned permission metadata rather than the old shared enum.

**Tech Stack:** .NET 10 minimal APIs, EF Core/Postgres, React 19, React Router v7, TanStack Query, Kiota client generation, Material React Table, i18next, API integration tests.

---

## File Structure

### Backend: permissions foundation

**Modify**

- `apps/api/Src/Lib/AppPermissions.cs`
- `apps/api/Src/Modules/Permissions/Entities/Permission.cs`
- `apps/api/Src/Modules/Permissions/Seeders/PermissionSeeder.cs`
- `apps/api/Src/Modules/Permissions/Endpoints/PermissionEndpointsForStaff.cs`
- `apps/api/Src/Modules/Permissions/Routes.Permissions.cs`
- `apps/api/Src/Modules/Permissions/Services/PermissionAsStaffService.cs`

**Create**

- `apps/api/Src/Modules/Tenants/Permissions/TenantModulePermissionsForTenant.cs`
- `apps/api/Src/Modules/Permissions/Handlers/Staff/FindTenantPermissions.cs`
- `apps/api/Src/Modules/Permissions/Handlers/Staff/FindTenantPermissions.Spec.cs`

### Backend: tenant profile CRUD + permission membership

**Modify**

- `apps/api/Src/Modules/Profiles/Routes.Profiles.cs`
- `apps/api/Src/Modules/Profiles/Endpoints/ProfileEndpointsForStaff.cs`
- `apps/api/Src/Modules/Profiles/Entities/Profile.cs`
- `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
- `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

**Create**

- `apps/api/Src/Modules/Profiles/Handlers/Staff/GetTenantProfileByIdAsStaff.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/CreateTenantProfileAsStaff.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/UpdateTenantProfileAsStaff.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/DeleteTenantProfileAsStaff.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/FindTenantProfilePermissionsAsStaff.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/AssignTenantProfilePermissionAsStaff.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/UnassignTenantProfilePermissionAsStaff.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/GetTenantProfileByIdAsStaff.Spec.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/CreateTenantProfileAsStaff.Spec.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/UpdateTenantProfileAsStaff.Spec.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/DeleteTenantProfileAsStaff.Spec.cs`
- `apps/api/Src/Modules/Profiles/Handlers/Staff/TenantProfilePermissionsAsStaff.Spec.cs`

### Backend: tenant auth / permission enforcement

**Modify**

- `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`
- `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs`
- tenant endpoints currently representing the four coarse modules as they exist today:
  - dashboard surface handlers/routes
  - billing surface handlers/routes
  - settings surface handlers/routes
  - users surface handlers/routes

**Note**

- the exact handler files depend on the existing tenant routes present in the repo at execution time; do not invent new route groups if a route already exists and only needs gating.

### Frontend: tenant profiles tab

**Modify**

- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profiles-table.tsx`
- `apps/front/src/routes/authed/_layout/authed-layout.tsx`
- `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx`
- tenant route pages/layouts for dashboard, billing, settings, and users if they need page-level gating
- relevant i18n files under `apps/front/public/locales/*`

**Create**

- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profile-preview-drawer.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profile-form-drawer.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profiles-compare-drawer.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profiles-export-dialog-controller.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profiles-selection-actions.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profile-delete-action.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profile-preview-action.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profile-edit-action.tsx`
- `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profile-compare-action.tsx`

### Generated and docs

**Modify**

- `apps/api/openapi/MainApi.json`
- `packages/client-ts/**` generated outputs touched by `just generate-client`
- `docs/misc/tenant-module-smoke-test-checklist.md`

---

## Phase 0: Consistency Guardrails

### Task 0.1: Reconfirm the implementation rules before code

**Files:**

- Read: `AGENTS.md`
- Read: `docs/guides/api-module-structure.md`
- Read: `docs/guides/api-route-design.md`
- Read: `docs/guides/csharp-coding-standards.md`
- Read: `docs/guides/frontend-coding-standards.md`
- Read: `docs/guides/ai-agent-preferences.md`
- Read: `docs/guides/list-pages-search-filter-cursor-pagination.md`

- [ ] Re-read the repo rules that govern this work
- [ ] Note the non-negotiables in the execution thread before touching code:
  - use `just`, not `make`
  - no worktrees
  - use backend-owned permission catalogs, not frontend hardcoded editing sources
  - keep table controller state self-contained
  - do not regress React Doctor rules or the repo’s table composition rules

### Task 0.2: Freeze naming and key conventions

**Files:**

- Read: `docs/superpowers/specs/2026-04-22-tenant-profiles-module-completion-design.md`
- Modify: execution notes only; no code yet

- [ ] Lock the canonical tenant permission keys before implementation:
  - `tenant.modules.access_dashboard`
  - `tenant.modules.access_billing`
  - `tenant.modules.access_settings`
  - `tenant.modules.access_users`
- [ ] Treat those keys as the only valid end-state contract
- [ ] Do not carry forward the old `can_access_*` keys except as a temporary migration concern if existing development data requires cleanup

**Checkpoint:** stop for a quick review if new files or route names deviate from this naming.

---

## Phase 1: Backend Tenant Permission Foundation

### Task 1.1: Add real tenant runtime permissions

**Files:**

- Modify: `apps/api/Src/Lib/AppPermissions.cs`
- Create: `apps/api/Src/Modules/Tenants/Permissions/TenantModulePermissionsForTenant.cs`

- [ ] Add a tenant-scope slice under `AppPermissions.Tenant`
- [ ] Define a `modules` slice with four `Permission.CreateTenantPermission(...)` entries
- [ ] Add English and French translations for all four permissions
- [ ] Keep the permission class in a module-consistent folder and namespace

### Task 1.2: Expose tenant permission catalog to staff tooling

**Files:**

- Modify: `apps/api/Src/Modules/Permissions/Routes.Permissions.cs`
- Modify: `apps/api/Src/Modules/Permissions/Endpoints/PermissionEndpointsForStaff.cs`
- Modify: `apps/api/Src/Modules/Permissions/Services/PermissionAsStaffService.cs`
- Create: `apps/api/Src/Modules/Permissions/Handlers/Staff/FindTenantPermissions.cs`

- [ ] Add a staff-readable route for tenant permission catalog retrieval
- [ ] Reuse the same response shape as staff permissions:
  - `Dictionary<string, Dictionary<string, PermissionAsStaffItem>>`
- [ ] Add a dedicated service method that reflects `AppPermissions.Tenant` and resolves only DB-seeded permission rows
- [ ] Reuse existing language handling conventions from `FindStaffPermissions`

### Task 1.3: Add integration coverage for tenant permission catalog

**Files:**

- Create: `apps/api/Src/Modules/Permissions/Handlers/Staff/FindTenantPermissions.Spec.cs`

- [ ] Cover success
- [ ] Cover translated labels
- [ ] Cover authorization failure
- [ ] Assert the catalog returns the canonical `tenant.modules.*` keys, not the old frontend-only `can_access_*` keys

### Task 1.4: Verify seeding path

**Files:**

- Read/confirm: `apps/api/Src/Modules/Permissions/Seeders/PermissionSeeder.cs`

- [ ] Confirm the reflection-based seeder picks up the new tenant scope slice automatically
- [ ] Leave the seeder logic unchanged unless the reflection path proves insufficient during implementation

**Checkpoint:** run targeted backend verification for the permissions slice before starting profile CRUD.

Run:

```powershell
just build-api
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantPermissions"
```

Expected:

- API builds
- new tenant permission catalog spec passes

---

## Phase 2: Backend Tenant Profile CRUD

### Task 2.1: Expand tenant profile routes

**Files:**

- Modify: `apps/api/Src/Modules/Profiles/Routes.Profiles.cs`
- Modify: `apps/api/Src/Modules/Profiles/Endpoints/ProfileEndpointsForStaff.cs`

- [ ] Add route constants and endpoint mappings for:
  - get by id
  - create
  - patch
  - delete
  - list assigned permissions
  - assign permission
  - unassign permission
- [ ] Keep route naming symmetric with the staff-profile slice
- [ ] Use `*AsStaff` handler names for tenant profile operations

### Task 2.2: Extend `ProfileAsStaffService` with tenant-profile operations

**Files:**

- Modify: `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`

- [ ] Add args/result records where 3+ parameters or multiple outcomes justify them
- [ ] Implement tenant-profile get by id
- [ ] Implement tenant-profile create with per-tenant unique name validation
- [ ] Implement tenant-profile update for name/description
- [ ] Implement tenant-profile delete with default-profile guard
- [ ] Implement tenant-profile permission list and membership writes
- [ ] Keep the existing `GetOrCreateDefaultTenantProfileAsync` invariant as the source of truth
- [ ] Reuse service-level query-syntax LINQ and staff-slice conventions already used elsewhere in the file

### Task 2.3: Define default-profile delete behavior

**Files:**

- Modify: `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
- Modify: handlers created in this phase

- [ ] Return a stable domain failure when attempting to delete the default tenant profile
- [ ] Surface it as RFC 7807 with a stable `translationKey`
- [ ] Keep row action visible but disabled on the frontend, while still guarding on the backend

### Task 2.4: Implement mutation handlers

**Files:**

- Create: `apps/api/Src/Modules/Profiles/Handlers/Staff/GetTenantProfileByIdAsStaff.cs`
- Create: `apps/api/Src/Modules/Profiles/Handlers/Staff/CreateTenantProfileAsStaff.cs`
- Create: `apps/api/Src/Modules/Profiles/Handlers/Staff/UpdateTenantProfileAsStaff.cs`
- Create: `apps/api/Src/Modules/Profiles/Handlers/Staff/DeleteTenantProfileAsStaff.cs`
- Create: `apps/api/Src/Modules/Profiles/Handlers/Staff/FindTenantProfilePermissionsAsStaff.cs`
- Create: `apps/api/Src/Modules/Profiles/Handlers/Staff/AssignTenantProfilePermissionAsStaff.cs`
- Create: `apps/api/Src/Modules/Profiles/Handlers/Staff/UnassignTenantProfilePermissionAsStaff.cs`

- [ ] Use route-level malformed-ID validation
- [ ] Keep handlers orchestration-only; no direct DbContext access
- [ ] Use `TypedProblems.*` for all failures
- [ ] Cache parsed/trimmed body getters in locals when they are reused

### Task 2.5: Add CRUD integration tests

**Files:**

- Create:
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/GetTenantProfileByIdAsStaff.Spec.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/CreateTenantProfileAsStaff.Spec.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/UpdateTenantProfileAsStaff.Spec.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/DeleteTenantProfileAsStaff.Spec.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/TenantProfilePermissionsAsStaff.Spec.cs`

- [ ] Cover success cases
- [ ] Cover malformed `tenantId` and malformed `profileId`
- [ ] Cover not found cases
- [ ] Cover duplicate-name validation
- [ ] Cover default-profile delete rejection
- [ ] Cover permission assignment and unassignment
- [ ] Cover authorization failures

**Checkpoint:** pause after API CRUD + permission membership tests pass. This is the first major review checkpoint.

Run:

```powershell
just build-api
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~TenantProfile"
```

Expected:

- new tenant profile CRUD specs pass

---

## Phase 3: Backend Audit Logging

### Task 3.1: Add tenant-profile audit action constants

**Files:**

- Modify: `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

- [ ] Add:
  - `tenant.profile.created`
  - `tenant.profile.updated`
  - `tenant.profile.deleted`
  - `tenant.profile.permissions.assigned`
  - `tenant.profile.permissions.unassigned`
  - `tenant.profile.bulk.deleted`

### Task 3.2: Emit audit logs from tenant-profile mutations

**Files:**

- Modify:
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/CreateTenantProfileAsStaff.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/UpdateTenantProfileAsStaff.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/DeleteTenantProfileAsStaff.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/AssignTenantProfilePermissionAsStaff.cs`
  - `apps/api/Src/Modules/Profiles/Handlers/Staff/UnassignTenantProfilePermissionAsStaff.cs`

- [ ] Inject `IAuditLogService`
- [ ] Log only mutating actions, never reads
- [ ] Include structured `details`:
  - `tenantId`
  - `profileId`
  - `profileName`
  - `isDefault`
  - `permissionKey` where relevant
  - changed fields for updates

### Task 3.3: Add audit-log assertions to mutation specs

**Files:**

- Modify the tenant-profile specs added in Phase 2

- [ ] Assert that successful mutations create the expected audit action
- [ ] Do not add read-side audit expectations

**Checkpoint:** review audit-log action names before frontend work begins.

---

## Phase 4: Tenant Auth Data and Real Permission Enforcement

### Task 4.1: Keep `GetTenantAuthData` as the bootstrap source of effective tenant permissions

**Files:**

- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs`

- [ ] Ensure the tenant auth payload continues returning the user’s effective tenant permission keys
- [ ] Update specs so the canonical keys asserted are `tenant.modules.*`
- [ ] Preserve the existing security behavior around invalid or unauthorized tenant IDs

### Task 4.2: Enforce the four coarse permissions on tenant surfaces

**Files:**

- Modify: tenant route handlers and/or route guards representing:
  - dashboard
  - billing
  - settings
  - users

- [ ] Add or tighten backend permission checks for the four coarse tenant modules
- [ ] Reuse existing authorization filters where possible instead of inventing ad hoc checks
- [ ] Keep billing gated by both feature flag and permission
- [ ] Ensure a missing permission yields `403`, not logout-triggering `401`

### Task 4.3: Add integration coverage for tenant permission enforcement

**Files:**

- Modify or create specs adjacent to the affected tenant handlers

- [ ] Cover allowed access when the profile grants the permission
- [ ] Cover forbidden access when the permission is missing
- [ ] Cover billing’s combined feature-flag and permission behavior

**Checkpoint:** stop here if tenant permission enforcement requires broader product decisions than the approved four-module scope.

---

## Phase 5: Client Generation and Frontend Hooks

### Task 5.1: Regenerate the client after backend contract changes

**Files:**

- Generated: `apps/api/openapi/MainApi.json`
- Generated: `packages/client-ts/**`

- [ ] Run OpenAPI generation and Kiota client generation after backend endpoints are complete

Run:

```powershell
just build-api
just generate-client
```

Expected:

- OpenAPI reflects tenant profile CRUD and tenant permission catalog endpoints
- generated client exposes the new routes and models

### Task 5.2: Add staff-side tenant profile hooks

**Files:**

- Modify: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

- [ ] Keep `useFindTenantProfiles`
- [ ] Add:
  - `useGetTenantProfileById`
  - `useCreateTenantProfile`
  - `useUpdateTenantProfile`
  - `useDeleteTenantProfile`
  - `useFindTenantPermissions`
  - `useFindTenantProfilePermissions`
  - `useAssignTenantProfilePermission`
  - `useUnassignTenantProfilePermission`
- [ ] Match the existing error-handling and Kiota untyped-node patterns used in `staff-profile.hooks.ts`

### Task 5.3: Keep frontend API error handling consistent

**Files:**

- Modify: any new tenant-profile mutation call sites

- [ ] Route every local mutation failure through:
  - `toApiFailure(error)`
  - `getFailureMessage(...)`
- [ ] Do not translate response keys manually at the call site

---

## Phase 6: Frontend Tenant Profiles Tab

### Task 6.1: Replace the matrix with a real table-first page

**Files:**

- Modify: `apps/front/src/routes/authed/staff/tenants/details/profiles/tenant-details-profiles-page.tsx`
- Rewrite: `apps/front/src/routes/authed/staff/tenants/details/profiles/parts/tenant-profiles-table.tsx`
- Create supporting controllers/components under the same `parts/` directory

- [ ] Remove matrix rendering and `TENANT_PROFILES_PERMISSIONS_ENUM`-driven columns
- [ ] Build a real table with:
  - search
  - cursor pagination
  - sorting
  - export
  - row selection
  - selection actions
- [ ] Keep component state local to the drawer/action controllers rather than the entire table root when possible

### Task 6.2: Add row actions and preview drawer

**Files:**

- Create:
  - `tenant-profile-preview-drawer.tsx`
  - `tenant-profile-preview-action.tsx`
  - `tenant-profile-edit-action.tsx`
  - `tenant-profile-delete-action.tsx`

- [ ] Add consistent right-side drawer layering above the app sidebar
- [ ] Show metadata and grouped permissions in the preview drawer
- [ ] Keep actions always visible; disable when unavailable instead of hiding

### Task 6.3: Add create/edit form drawer

**Files:**

- Create: `tenant-profile-form-drawer.tsx`

- [ ] Share one form surface for create and edit
- [ ] Fetch available tenant permissions from the backend catalog endpoint
- [ ] Fetch assigned permission keys separately for edit mode
- [ ] Use a grouped/list-based permission editor, not a matrix
- [ ] Use skeletons for loading states, not generic spinners

### Task 6.4: Add compare drawer and selection actions

**Files:**

- Create:
  - `tenant-profiles-compare-drawer.tsx`
  - `tenant-profiles-selection-actions.tsx`
  - `tenant-profile-compare-action.tsx`

- [ ] Allow compare only for `2` or `3` selected rows
- [ ] Open a large right-side drawer
- [ ] Highlight permission differences
- [ ] Lock query controls during selection mode, matching the other advanced staff tables

### Task 6.5: Add export and bulk delete behavior

**Files:**

- Create: `tenant-profiles-export-dialog-controller.tsx`
- Modify: `tenant-profiles-table.tsx`

- [ ] Follow the existing export dialog pattern already used on staff tables
- [ ] Use the same format-selection UI as the mature tables
- [ ] Support export of current page or explicit selection
- [ ] Add bulk delete for deletable rows only
- [ ] Block delete when the selection includes the default profile and explain why

### Task 6.6: Frontend verification for the tab

Run:

```powershell
just tsc-front
```

Then run the React Doctor skill against the touched React files.

Expected:

- typecheck passes
- no React Doctor regressions remain

**Checkpoint:** stop for UX review here before tenant-side permission gating changes are finalized in the frontend.

---

## Phase 7: Frontend Tenant Navigation and Page Gating

### Task 7.1: Use tenant auth data as the frontend source of granted tenant permissions

**Files:**

- Modify:
  - `apps/front/src/routes/authed/_layout/authed-layout.tsx`
  - `apps/front/src/lib/react-query/features/common/auth.hooks.ts`
  - `apps/front/src/routes/authed/tenant/_layout/tenant-layout.tsx`

- [ ] Keep `useGetTenantAuthData` as the fetched source of tenant permission keys
- [ ] Thread the effective permission set into tenant nav visibility and page gating
- [ ] Reuse the dashboard layout’s established `checkPermissions` hook points instead of introducing unrelated custom nav infrastructure

### Task 7.2: Gate the four coarse tenant modules in the UI

**Files:**

- Modify:
  - tenant layout nav items
  - tenant route pages/layouts for dashboard, billing, settings, and users

- [ ] Hide or disable nav entries when permission is missing, using the pattern that best matches the existing tenant UX
- [ ] Render a `403` view for direct access to forbidden pages
- [ ] Keep behavior consistent with backend permission denial

### Task 7.3: Remove frontend dependence on the old tenant permission enum

**Files:**

- Modify or remove: any usages of `TENANT_PROFILES_PERMISSIONS_ENUM`

- [ ] Ensure editing, preview, comparison, and gating all consume backend-issued permission metadata or keys
- [ ] Remove the old constant if it no longer serves a legitimate purpose

---

## Phase 8: Smoke Checklist and Verification

### Task 8.1: Rewrite Category 7 in the tenant smoke checklist

**Files:**

- Modify: `docs/misc/tenant-module-smoke-test-checklist.md`

- [ ] Replace matrix-centric assertions with table-first assertions
- [ ] Add explicit checks for:
  - preview drawer
  - create/edit/delete
  - permission editing
  - compare drawer
  - default-profile delete protection
  - permission-driven tenant navigation and route access

### Task 8.2: Run full verification

Run:

```powershell
just build-api
just generate-client
just tsc-front
just test-api
```

Expected:

- backend builds
- client regenerates cleanly
- frontend typechecks
- API integration tests pass

### Task 8.3: Manual smoke

- [ ] Create a non-default tenant profile
- [ ] Assign and unassign permissions in the form drawer
- [ ] Preview and compare profiles
- [ ] Delete a non-default profile
- [ ] Attempt to delete the default profile and verify visible disablement + backend guard
- [ ] Log in as a tenant user whose profiles grant only a subset of the four permissions
- [ ] Verify tenant navigation and direct route access match those granted permissions

---

## Review Checkpoints

- After Phase 2: backend CRUD + permission endpoints
- After Phase 4: real tenant permission enforcement semantics
- After Phase 6: staff-side tenant profiles UX
- After Phase 8: full verification before merge

## Recommended Commit Boundaries

- `feat(api): add tenant permission catalog for tenant profiles`
- `feat(api): add tenant profile CRUD and permission management`
- `feat(api): enforce tenant module permissions in auth and tenant routes`
- `feat(front): rebuild tenant profiles tab with table, drawers, and compare mode`
- `docs(test): update tenant module smoke checklist for completed profiles module`
