# Implementation Plan: Issue #80 - Add Authorization Filters/Permission Checks

## Overview

This plan addresses GitHub Issue #80: "Add adequate authorization filter/permissions check on ALL endpoints." The issue identifies three main gaps in the current authorization system that need to be resolved.

---

## Gap 1: Staff Invitations - Missing Granular Permissions

### Current State
- Location: `apps/api/Src/Modules/Staff/InvitationsAsStaff/`
- Invitation endpoints currently have NO permission filters applied
- Only relies on being within the staff route group (requires staff account)
- No `InvitationAsStaffPermissions` class exists

### Required Changes

#### Step 1.1: Create `InvitationAsStaffPermissions` class

**File to create:** `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationAsStaffPermissions.cs`

Following the existing pattern from `ProfilesAsStaffPermissions.cs`, define:
- `CREATE` - for creating staff invitations (single and bulk)
- `LIST` - for listing/finding invitations
- `REVOKE` - for revoking/deleting invitations

```csharp
public class InvitationAsStaffPermissions : ISlicePermissions {
    public string KeyPrefix { get; } = "invitations";

    public Permission CREATE { get; }
    public Permission LIST { get; }
    public Permission REVOKE { get; }

    // Constructor with translations (English and French)
}
```

#### Step 1.2: Register permissions in `AppPermissions.cs`

**File to modify:** `apps/api/Src/Lib/AppPermissions.cs`

Add to `StaffScopePermissions`:
```csharp
public InvitationAsStaffPermissions Invitations { get; } = new InvitationAsStaffPermissions();
```

Add using statement:
```csharp
using MainApi.Src.Modules.Staff.InvitationsAsStaff;
```

#### Step 1.3: Add permission filters to invitation endpoints

**File to modify:** `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationEndpoints.cs`

| Endpoint | Current Filter | Required Filter |
|----------|----------------|-----------------|
| `POST /staff/invitations` (Create) | None | `.WithPermission([AppPermissions.Staff.Invitations.CREATE])` |
| `POST /staff/invitations/bulk` (BulkCreate) | None | `.WithPermission([AppPermissions.Staff.Invitations.CREATE])` |
| `GET /staff/invitations` (Find) | None | `.WithPermission([AppPermissions.Staff.Invitations.LIST])` |
| `DELETE /staff/invitations/{id}` (Revoke) | None | `.WithPermission([AppPermissions.Staff.Invitations.REVOKE])` |

---

## Gap 2: Tenant Scope Permissions - Empty Class

### Current State
- Location: `apps/api/Src/Lib/AppPermissions.cs` (line 27-30)
- `TenantScopePermissions` class is empty with a TODO comment
- No tenant-scoped resources are currently defined

### Analysis
This is a **placeholder for future work**. Tenant-scope permissions should be added as tenant-scoped endpoints are implemented. Since there are currently no tenant-scoped endpoints that require permission checks, this can remain as-is for now but should be noted for future development.

### Recommendation
- **No immediate action required** - keep the TODO as a reminder
- When tenant endpoints are added, follow the same pattern as staff permissions
- Example future structure:
```csharp
public class TenantScopePermissions : IScopePermissions {
    public string KeyPrefix { get; } = Permission.ScopeKeyPrefix.Tenant;
    // Future: Add tenant permission slices here
    // public TenantProjectPermissions Projects { get; } = new TenantProjectPermissions();
}
```

---

## Gap 3: Users As Staff - Endpoints Not Implemented

### Current State
- Location: `apps/api/Src/Modules/Staff/UsersAsStaff/`
- `UserAsStaffPermissions.cs` exists with 10 permissions defined (5 for staff, 5 for tenant)
- **NO endpoints are implemented** - only the permissions class exists
- No `UserAsStaffEndpoints.cs` file
- No handler files in a `Handlers/` subdirectory

### Required Changes

This is the largest component. Implementing full CRUD operations for managing users from the staff back-office.

#### Step 3.1: Create the endpoint registration file

**File to create:** `apps/api/Src/Modules/Staff/UsersAsStaff/UserAsStaffEndpoints.cs`

```csharp
public static class UserAsStaffEndpoints {
    public static IEndpointRouteBuilder MapUserAsStaffEndpoints(this IEndpointRouteBuilder routes) {
        var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Users.Root))
            .WithTags("Users As Staff");

        // Staff users endpoints
        // Tenant users endpoints

        return routes;
    }
}
```

#### Step 3.2: Add route paths

**File to modify:** `apps/api/Src/Lib/RoutePath.cs`

Add `Users` section under `Staff`:
```csharp
public static class Users {
    public static string Root { get; } = $"{Staff.Root}/users";
    public static string FindForStaff { get; } = $"{Root}/staff";
    public static string GetForStaff { get; } = $"{Root}/staff/{{userId}}";
    public static string CreateForStaff { get; } = $"{Root}/staff";
    public static string UpdateForStaff { get; } = $"{Root}/staff/{{userId}}";
    public static string DeleteForStaff { get; } = $"{Root}/staff/{{userId}}";
    public static string FindForTenant { get; } = $"{Root}/tenant/{{tenantId}}";
    public static string GetForTenant { get; } = $"{Root}/tenant/{{tenantId}}/{{userId}}";
    // etc.
}
```

#### Step 3.3: Create handler files

**Directory to create:** `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/`

**Files to create (FOR STAFF context):**
1. `FindUsersForStaff.cs` - List staff users with keyset pagination
2. `GetUserForStaff.cs` - Get a single staff user by ID
3. `CreateUserForStaff.cs` - Create a new staff user
4. `UpdateUserForStaff.cs` - Update a staff user
5. `DeleteUserForStaff.cs` - Soft delete a staff user

**Files to create (FOR TENANT context):**
1. `FindUsersForTenant.cs` - List tenant users (by tenant ID)
2. `GetUserForTenant.cs` - Get a single tenant user
3. `CreateUserForTenant.cs` - Create a new tenant user
4. `UpdateUserForTenant.cs` - Update a tenant user
5. `DeleteUserForTenant.cs` - Delete a tenant user

Each handler should follow the existing pattern from `StaffMember/Handlers/`:
- Request body/query validators using FluentValidation
- Discriminated union result types
- Service layer calls
- Proper error handling with `TypedProblems`

#### Step 3.4: Create/extend service layer

**Option A:** Extend existing `UserService.cs` and `AccountService.cs`
**Option B:** Create a dedicated `UserAsStaffService.cs` for staff-specific operations

Recommended: **Option A** - extend existing services since the base functionality already exists.

#### Step 3.5: Wire up endpoints in `Program.cs` or staff endpoint registration

Find where staff endpoints are registered and add:
```csharp
.MapUserAsStaffEndpoints()
```

---

## Implementation Order

### Phase 1: Staff Invitations Permissions (Estimated: Small scope)
1. Create `InvitationAsStaffPermissions.cs`
2. Register in `AppPermissions.cs`
3. Add `.WithPermission()` filters to `InvitationEndpoints.cs`
4. Run the app to trigger permission seeding
5. Test all invitation endpoints with non-admin user

### Phase 2: Users As Staff Endpoints (Estimated: Large scope)
1. Add route paths to `RoutePath.cs`
2. Create `UserAsStaffEndpoints.cs`
3. Create handlers one by one:
   - Start with `FindUsersForStaff.cs` and `GetUserForStaff.cs` (read operations)
   - Then `CreateUserForStaff.cs`
   - Then `UpdateUserForStaff.cs`
   - Then `DeleteUserForStaff.cs`
   - Repeat for tenant-scoped endpoints
4. Extend services as needed
5. Wire up in endpoint registration
6. Test all endpoints

### Phase 3: Tenant Scope Permissions (Future)
- Deferred until tenant-scoped endpoints are implemented
- Keep TODO comment as reminder

---

## Testing Checklist

### Manual Testing
- [ ] Non-admin user without invitation permissions cannot create/list/revoke invitations
- [ ] Non-admin user with `staff.invitations.create` CAN create invitations
- [ ] Non-admin user with `staff.invitations.list` CAN list invitations
- [ ] Non-admin user with `staff.invitations.revoke` CAN revoke invitations
- [ ] Admin users bypass all permission checks (existing behavior preserved)
- [ ] All new user endpoints require appropriate permissions

### Database Verification
- [ ] New permissions are seeded in the `permissions` table
- [ ] Permission keys follow pattern: `staff:invitations:create`, `staff:invitations:list`, `staff:invitations:revoke`

---

## Files Summary

### New Files to Create
1. `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationAsStaffPermissions.cs`
2. `apps/api/Src/Modules/Staff/UsersAsStaff/UserAsStaffEndpoints.cs`
3. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/FindUsersForStaff.cs`
4. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/GetUserForStaff.cs`
5. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/CreateUserForStaff.cs`
6. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/UpdateUserForStaff.cs`
7. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/DeleteUserForStaff.cs`
8. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/FindUsersForTenant.cs`
9. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/GetUserForTenant.cs`
10. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/CreateUserForTenant.cs`
11. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/UpdateUserForTenant.cs`
12. `apps/api/Src/Modules/Staff/UsersAsStaff/Handlers/DeleteUserForTenant.cs`

### Files to Modify
1. `apps/api/Src/Lib/AppPermissions.cs` - Register invitation permissions
2. `apps/api/Src/Modules/Staff/InvitationsAsStaff/InvitationEndpoints.cs` - Add permission filters
3. `apps/api/Src/Lib/RoutePath.cs` - Add user route paths
4. Staff endpoint registration file - Wire up UserAsStaffEndpoints

---

## Acceptance Criteria Mapping

| Criteria | How Addressed |
|----------|--------------|
| Every endpoint that modifies or reads sensitive data has appropriate permission checks | ✅ Gap 1 & Gap 3 implementation |
| Permissions follow the existing pattern: `{scope}.{resource}.{action}` | ✅ All new permissions use `staff:invitations:*` and existing `staff:users:*` patterns |
| Admin users bypass permission checks (existing behavior preserved) | ✅ No changes to `PermissionFilter.cs` - admin bypass is already implemented |
| All defined permissions have corresponding endpoints (or are removed if unused) | ✅ Gap 3 implements endpoints for existing `staff.users.*` permissions |
