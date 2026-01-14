# API Domain-First Audit

Date: 2026-01-14

This is a filesystem/code audit of `apps/api/Src/Modules/**` against the canonical rules in:

- `AGENTS.md:88` (Backend Architecture: domain-first VSA)
- `AGENTS.md:118` (API Module Structure Rules)
- `AGENTS.md:226` (Vertical Slice Design Principles)

## Snapshot Summary

The repo is currently in a **hybrid** state:

- **Domain-first modules (already migrated):**
  - `apps/api/Src/Modules/Auth/`
  - `apps/api/Src/Modules/Users/`
  - `apps/api/Src/Modules/Invitations/`

- **Legacy modules (still present):**
  - `apps/api/Src/Modules/Shared/` → `Permissions`, `Profiles`, `Projects`, `Tenants`
  - `apps/api/Src/Modules/Staff/` → `AuditLogs`, `Impersonations`, `PermissionsAsStaff`, `ProfilesAsStaff`, `TenantsAsStaff`, `SystemNotices`
  - `apps/api/Src/Modules/Tenant/` exists but is empty

## Mapping: Route Groups → Endpoint Modules

`apps/api/Program.cs` currently maps:

- `app.MapAuthEndpoints();` → `Modules/Auth`
- `app.MapInvitationEndpointsAnonymous();` → `Modules/Invitations`
- `staffGroup.MapStaffUserEndpoints();` → `Modules/Users`
- `staffGroup.MapInvitationEndpointsForStaff();` → `Modules/Invitations`

Still legacy (needs migration to domain-first):

- `staffGroup.MapPermissionAsStaffEndpoints();` → `Modules/Staff/PermissionsAsStaff`
- `staffGroup.MapProfileAsStaffEndpoints();` → `Modules/Staff/ProfilesAsStaff`
- `staffGroup.MapTenantAsStaffEndpoints();` → `Modules/Staff/TenantsAsStaff`

## Findings vs Rules

### 1) Domain-first: ✅ partially applied

`Auth`, `Users`, `Invitations` follow the domain-first structure and compile cleanly.

However, `Shared/*` and `Staff/*` still contain real slices, so the repository is not yet in a domain-first “single-home-per-domain” state.

### 2) Namespace discipline (`IDE0130`): ✅ enforced

The build enforces folder/namespace alignment, and the code currently builds successfully. Any moves must keep namespaces aligned to path.

### 3) Domain boundaries: ⚠️ still split across legacy folders

The domain-first modules still depend on legacy `Shared/*` domains:

- `Modules/Users` depends on `Modules/Shared/Tenants` + `Modules/Shared/Projects` (via `UserAccount` navigations).
- `Modules/Invitations` depends on `Modules/Shared/Profiles`, `Modules/Shared/Tenants`, `Modules/Shared/Projects`.

This is expected mid-migration, but it means the next migrations should target:

1) `Permissions` (Shared → Domain)
2) `Profiles` (Shared + Staff/ProfilesAsStaff → Domain)
3) `Tenants` (Shared + Staff/TenantsAsStaff → Domain)
4) `Projects` (Shared → Domain)

### 4) Permission enforcement: ✅ mostly route-defined, ⚠️ some handler-level checks remain

Repo-wide rule is “permission is defined by the route (Pattern 1)”.

✅ Good: Many staff endpoints use `.WithPermission([...])`:

- `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs`
- `apps/api/Src/Modules/Users/Endpoints/StaffUseEndpoints.cs`
- `apps/api/Src/Modules/Staff/ProfilesAsStaff/ProfileAsStaffEndpoints.cs`
- `apps/api/Src/Modules/Staff/TenantsAsStaff/TenantAsStaffEndpoints.cs`
- `apps/api/Src/Modules/Staff/PermissionsAsStaff/PermissionAsStaffEndpoints.cs`

⚠️ Remaining “admin-only” handler checks exist in:

- `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs`
- `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs`
- `apps/api/Src/Modules/Staff/TenantsAsStaff/TenantAsStaffService.cs`

Decision needed:

- If “Admin only” is a *policy* you want enforced by permission assignment, remove handler checks and rely on `.WithPermission(...)`.
- If “Admin only” is a *hard* requirement (must be account level Admin), keep the checks (but then “permission defined by route” is not sufficient by itself).

### 5) Empty/unmapped placeholders: ✅ removed

These were empty files that were not mapped/used and added noise:

- `apps/api/Src/Modules/Users/Endpoints/USerEndpointsAnonymous.cs`
- `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenant.cs`
- `apps/api/Src/Modules/Invitations/Permissions/InvitationPermissionsForTenant.cs`

They should be reintroduced only when the corresponding routes exist.

## Action Plan (Recommended)

1) Migrate `Shared/Permissions` → `Modules/Permissions` (entity/service/seeder), then move staff permission endpoints into the same domain.
2) Migrate `Shared/Profiles` + `Staff/ProfilesAsStaff` → `Modules/Profiles` (keep staff handlers under `Handlers/Staff`).
3) Migrate `Shared/Tenants` + `Staff/TenantsAsStaff` → `Modules/Tenants`.
4) Migrate `Shared/Projects` → `Modules/Projects`.
5) Re-home staff-only domains into their own domain modules:
   - `Staff/AuditLogs` → `Modules/AuditLogs`
   - `Staff/SystemNotices` → `Modules/SystemNotices`
   - `Staff/Impersonations` → `Modules/Impersonations` (or merge into Auth if that’s your preference)

After each slice migration:
- Run `dotnet build apps/api/MainApi.csproj` and keep `IDE0130`/`IDE0005` clean.

