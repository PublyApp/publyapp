# Endpoint Path Restructuring Plan

## Goal

Restructure API routes from the current `/staff/[resource]/[scope]` pattern to the new `/staff/tenants/{tenantId}/[resource]` pattern for tenant-scoped resources.

## Current vs New Structure

### Current (Before)

```
/staff/users/staff                     # Staff members
/staff/users/tenant/{tenantId}         # Tenant users (staff managing)
/staff/invitations/staff               # Staff invitations
/staff/invitations/tenant/{tenantId}   # Tenant invitations (staff managing)
/staff/profiles                        # Staff profiles
/staff/profiles/tenant/{tenantId}      # Tenant profiles (staff viewing)
/staff/permissions                     # Permissions
/staff/tenants                         # Tenants
```

### New (After)

```
/staff/users                           # Staff members
/staff/tenants/{tenantId}/users        # Tenant users (staff managing)
/staff/invitations                     # Staff invitations
/staff/tenants/{tenantId}/invitations  # Tenant invitations (staff managing)
/staff/profiles                        # Staff profiles
/staff/tenants/{tenantId}/profiles     # Tenant profiles (staff viewing)
/staff/permissions                     # Permissions (unchanged)
/staff/tenants                         # Tenants (unchanged)
```

## Implementation Steps

### Phase 1: Update Route Constants

#### 1.1 Routes.cs (base) - DONE
- `Routes.Staff.Root = "/staff"`
- `Routes.Tenant.Root = "/"`

#### 1.2 Routes.Users.cs
- Remove `Base` constant (no longer shared)
- `ForStaff.Root` = `/staff/users` (direct, no nesting)
- Rename `ForTenant` to `ForTenantAsStaff`
- `ForTenantAsStaff.Root` = `/staff/tenants/{tenantId}/users`

#### 1.3 Routes.Invitations.cs
- Remove `Base` constant
- `ForStaff.Root` = `/staff/invitations`
- Rename `ForTenant` to `ForTenantAsStaff`
- `ForTenantAsStaff.Root` = `/staff/tenants/{tenantId}/invitations`

#### 1.4 Routes.Profiles.cs
- Remove `Base` constant
- `ForStaff.Root` = `/staff/profiles`
- Rename `ForTenant` to `ForTenantAsStaff`
- `ForTenantAsStaff.Find` = `/staff/tenants/{tenantId}/profiles`

#### 1.5 Routes.Tenants.cs - Unchanged
- Already at `/staff/tenants`

#### 1.6 Routes.Permissions.cs - Unchanged
- Already at `/staff/permissions`

### Phase 2: Update Endpoint Files

#### 2.1 UserEndpointsForStaff.cs
- Change `MapGroup` to use `Routes.Users.ForStaff.Root` directly (relative to staff group)
- Remove `PathUtils.GetLastSegment()` usage - use simple relative paths

#### 2.2 InvitationEndpointsForStaff.cs
- Same pattern as above

#### 2.3 ProfileEndpointsForStaff.cs
- Same pattern as above

### Phase 3: Verify

1. Build API: `make build-api`
2. Check OpenAPI spec is correct
3. Regenerate client: `make generate-client`

## Key Insight

The `staffGroup` in Program.cs already has `/staff` prefix. Endpoint files register relative paths:
- Old: `MapGroup("/users")` + `MapPost("/staff/")` → `/staff/users/staff`
- New: `MapGroup("/users")` + `MapPost("/")` → `/staff/users`

For tenant-scoped routes under staff, we need:
- `MapGroup("/tenants/{tenantId}/users")` → `/staff/tenants/{tenantId}/users`

This means tenant-scoped endpoints need their own endpoint registration, separate from staff-only endpoints.

## Files to Modify

1. `apps/api/Src/Modules/Users/Routes.Users.cs`
2. `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`
3. `apps/api/Src/Modules/Profiles/Routes.Profiles.cs`
4. `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForStaff.cs`
5. `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs`
6. `apps/api/Src/Modules/Profiles/Endpoints/ProfileEndpointsForStaff.cs`
