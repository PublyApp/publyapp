# Vertical Slice Design Principles

This document outlines the design principles for implementing features using Vertical Slice Architecture in PublyApp.

## Table of Contents
- [When to Create Separate Slices](#when-to-create-separate-slices)
- [When to Keep One Slice](#when-to-keep-one-slice)
- [Permission Enforcement Patterns](#permission-enforcement-patterns)
- [Implementation Examples](#implementation-examples)

---

## When to Create Separate Slices

Create **separate slices** when features differ by **business context** (who is performing the action):

### Example: Staff vs Tenant Management

```
apps/api/Src/Features/
├── Staff/
│   └── ProfileAsStaff/              # Staff managing profiles
└── Tenant/
    └── ProfileAsTenant/             # Tenants managing their profiles
```

**Create separate slices when:**
- ✅ Different user contexts (Staff vs Tenant vs Project)
- ✅ Different authorization middleware (StaffAuthMiddleware vs TenantAuthMiddleware)
- ✅ Different security boundaries (cross-tenant access vs single-tenant)
- ✅ Different API routes (`/staff/*` vs `/tenant/*`)
- ✅ Different business rules and workflows
- ✅ Different teams might own the features

**Key indicators:**
- Route prefix changes (`/staff/profiles` vs `/tenant/profiles`)
- Different middleware pipeline
- Different permission namespaces (`staff.profile.*` vs `tenant.profile.*`)

---

## When to Keep One Slice

Keep **one slice** when features differ only by **data attributes** or **scope parameters**:

### Example: Managing Different Profile Scopes

```
apps/api/Src/Features/Staff/ProfileAsStaff/
├── Handlers/
│   ├── FindStaffProfiles.cs         # Handles staff profiles
│   ├── FindTenantProfiles.cs        # Handles tenant profiles
│   ├── FindProjectProfiles.cs       # Handles project profiles
│   ├── UpdateProfile.cs             # Works for ANY scope
│   └── DeleteProfile.cs             # Works for ANY scope
├── ProfileAsStaffService.cs         # Single service for all scopes
└── ProfileAsStaffEndPoints.cs
```

**Keep one slice when:**
- ✅ Same business context (all operations by Staff users)
- ✅ Same authorization middleware
- ✅ Same base route prefix (`/staff/profiles/*`)
- ✅ Scope/type is just a filter parameter (like filtering by status or date)
- ✅ Similar CRUD operations across types
- ✅ Shared business logic

**Key indicators:**
- ProfileScope, Status, Type, or Category are enum discriminators
- Operations are identical except for filtering
- Service methods can be parameterized by scope

---

## Permission Enforcement Patterns

**Quick Decision Guide:**
- ✅ **Use Pattern 1** (Separate endpoints per scope) - Recommended for most cases
- ⚠️ **Use Pattern 2** (Dynamic permission check) - Only when scope cannot be in the route

---

### Pattern 1: Separate Endpoints per Scope (Recommended)

**Use for:** Any operation where you want permission enforcement at the route level without loading the entity first

**Benefits:**
- ✅ Permission checked before database query
- ✅ Route structure indicates expected scope
- ✅ No wasted database queries for unauthorized requests
- ✅ Clear, explicit API design

```csharp
// GetStaffProfileById.cs
public static async Task<Results<Ok<ProfileResponse>, NotFound>> HandleGetStaffProfileById(
    [FromServices] IProfileAsStaffService profileService,
    [FromRoute] string profileId,
    CancellationToken cancellationToken
) {
    if (!Guid.TryParse(profileId, out var profileIdGuid)) {
        return TypedResults.NotFound();
    }

    var profile = await profileService.GetProfileByIdAsync(profileIdGuid, ProfileScope.Staff, cancellationToken);
    if (profile is null) {
        return TypedResults.NotFound();
    }

    return TypedResults.Ok(new ProfileResponse(profile));
}

// GetTenantProfileById.cs
public static async Task<Results<Ok<ProfileResponse>, NotFound>> HandleGetTenantProfileById(
    [FromServices] IProfileAsStaffService profileService,
    [FromRoute] string tenantId,
    CancellationToken cancellationToken
) {
    if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
        return TypedResults.NotFound();
    }

    var profile = await profileService.GetProfileByTenantIdAsync(tenantIdGuid, cancellationToken);
    if (profile is null) {
        return TypedResults.NotFound();
    }

    return TypedResults.Ok(new ProfileResponse(profile));
}
```

**Endpoint registration (permission enforced at route level):**
```csharp
// GetStaffProfileById
group.MapGet(
    "/profiles/staff/{profileId}",
    GetStaffProfileById.HandleGetStaffProfileById
)
    .WithName("GetStaffProfileById")
    .WithPermission([ProfileAsStaffPermissions.GET_FOR_STAFF])
    .ProducesApiResponses(...);

// GetTenantProfileById
group.MapGet(
    "/profiles/tenants/{tenantId}",
    GetTenantProfileById.HandleGetTenantProfileById
)
    .WithName("GetTenantProfileById")
    .WithPermission([ProfileAsStaffPermissions.GET_FOR_TENANT])
    .ProducesApiResponses(...);
```

**Permission structure:**
```
staff.profile.list_for_staff    # List staff profiles
staff.profile.list_for_tenant   # List tenant profiles
staff.profile.list_for_project  # List project profiles
staff.profile.get_for_staff     # Get staff profile details
staff.profile.get_for_tenant    # Get tenant profile details
staff.profile.get_for_project   # Get project profile details
```

---

### Pattern 2: Dynamic Permission Check (When Scope Not in Route)

**Use for:** Operations where the scope cannot be determined from the route (e.g., single generic endpoint for all scopes)

**When to use:**
- Rare cases where you cannot include scope in the route
- Legacy endpoints that need to remain generic
- When frontend doesn't know the scope beforehand

**Note:** This pattern requires loading the entity first, which wastes a database query if the user lacks permission. **Pattern 1 is preferred.**

```csharp
// UpdateProfile.cs - Handler with dynamic permission check
public static async Task<Results<Ok<ApiResponse>, BadRequest<ApiResponse>, Forbidden>> HandleUpdateProfile(
    [FromServices] IAuthContext auth,
    [FromServices] IProfileAsStaffService profileService,
    [FromRoute] string profileId,
    [FromBody] UpdateProfileRequest request,
    CancellationToken cancellationToken
) {
    if (!Guid.TryParse(profileId, out var profileIdGuid)) {
        return TypedResults.BadRequest(ApiResponse.Create("Invalid profile ID", ResponseKeys.ValidationError));
    }

    // 1. Load the entity to check its scope
    var profile = await profileService.GetProfileByIdAsync(profileIdGuid, cancellationToken);
    if (profile is null) {
        return TypedResults.BadRequest(ApiResponse.Create("Profile not found", ResponseKeys.NotFound));
    }

    // 2. Check permission based on scope
    if (!HasUpdatePermissionForScope(auth, profile.ProfileScope)) {
        return TypedResults.Forbid();
    }

    // 3. Proceed with operation
    await profileService.UpdateProfileAsync(profileIdGuid, request, cancellationToken);

    return TypedResults.Ok(ApiResponse.Create("Profile updated", ResponseKeys.Success));
}

private static bool HasUpdatePermissionForScope(IAuthContext auth, ProfileScope scope) {
    return scope switch {
        ProfileScope.Staff => auth.HasPermission(ProfileAsStaffPermissions.UPDATE_FOR_STAFF),
        ProfileScope.Tenant => auth.HasPermission(ProfileAsStaffPermissions.UPDATE_FOR_TENANT),
        ProfileScope.Project => auth.HasPermission(ProfileAsStaffPermissions.UPDATE_FOR_PROJECT),
        _ => false
    };
}
```

**Endpoint registration (no filter, manual check):**
```csharp
group.MapPut(
    PathUtils.GetLastSegment(RoutePath.Staff.Profiles.Update),
    UpdateProfile.HandleUpdateProfile
)
    .WithName("UpdateProfile")
    .ProducesApiResponses(...);
    // No .WithPermission() - we check manually in handler
```

**Permission structure:**
```
staff.profile.create_for_staff      # Create staff profiles
staff.profile.create_for_tenant     # Create tenant profiles
staff.profile.create_for_project    # Create project profiles
staff.profile.update_for_staff      # Update staff profiles
staff.profile.update_for_tenant     # Update tenant profiles
staff.profile.update_for_project    # Update project profiles
staff.profile.delete_for_staff      # Delete staff profiles
staff.profile.delete_for_tenant     # Delete tenant profiles
staff.profile.delete_for_project    # Delete project profiles
```

**Benefits:**
- ✅ Granular permissions per scope
- ✅ Single handler (no duplication)
- ✅ Flexible conditional logic
- ✅ Clear audit trail

**Drawbacks:**
- ❌ Must load entity before checking permissions
- ❌ Wastes database query for unauthorized requests
- ❌ Less clear API design

---

## Implementation Examples

### Example 1: Service Layer with Parameterized Scope

```csharp
// ProfileAsStaffService.cs
public class ProfileAsStaffService : IProfileAsStaffService {
    private readonly MainApiDbContext _dbContext;
    private readonly IOptions<AppSettings> _appSettings;

    public ProfileAsStaffService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
        _dbContext = dbContext;
        _appSettings = appSettings;
    }

    // Generalized method for any scope
    public async Task<List<Profile>> FindProfilesByScopeAsync(
        ProfileScope scope,
        Guid? tenantId = null,      // Required for Tenant/Project scopes
        Guid? projectId = null,     // Required for Project scope
        int? page = null,
        int? limit = null,
        string? sortId = null,
        SortOrder? sortOrder = null,
        CancellationToken cancellationToken = default
    ) {
        var effectivePage = page ?? 1;
        var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
        var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;

        var query = from p in _dbContext.Profile
                    where p.ProfileScope == scope
                    select p;

        // Apply scope-specific filters
        if (tenantId.HasValue) {
            query = query.Where(p => p.TenantId == tenantId);
        }

        if (projectId.HasValue) {
            query = query.Where(p => p.ProjectId == projectId);
        }

        return await query
            .Skip((effectivePage - 1) * effectiveLimit)
            .Take(effectiveLimit)
            .ToListAsync(cancellationToken);
    }

    public async Task<Profile?> GetProfileByIdAsync(
        Guid profileId,
        CancellationToken cancellationToken = default
    ) {
        return await _dbContext.Profile
            .FirstOrDefaultAsync(p => p.Id == profileId, cancellationToken);
    }

    public async Task UpdateProfileAsync(
        Guid profileId,
        UpdateProfileRequest request,
        CancellationToken cancellationToken = default
    ) {
        await _dbContext.Profile
            .Where(p => p.Id == profileId)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(p => p.Name, request.Name)
                .SetProperty(p => p.Description, request.Description),
                cancellationToken
            );
    }
}
```

### Example 2: API Routes Structure

```
# Single slice, entity-centric routes (Pattern 1 - Recommended)

# Staff Profiles - Global roles for the staff system
GET    /staff/profiles/staff                        # FindStaffProfiles.cs - WithPermission(LIST_FOR_STAFF)
GET    /staff/profiles/staff/{profileId}            # GetStaffProfileById.cs - WithPermission(GET_FOR_STAFF)
POST   /staff/profiles/staff                        # CreateStaffProfile.cs - WithPermission(CREATE_FOR_STAFF)
PUT    /staff/profiles/staff/{profileId}            # UpdateStaffProfile.cs - WithPermission(UPDATE_FOR_STAFF)
DELETE /staff/profiles/staff/{profileId}            # DeleteStaffProfile.cs - WithPermission(DELETE_FOR_STAFF)

# Tenant Profiles - Roles for a specific tenant (ProfileScope.Tenant)
GET    /staff/profiles/tenants                      # FindTenantProfiles.cs - WithPermission(LIST_FOR_TENANT)
GET    /staff/profiles/tenants/{tenantId}           # GetTenantProfileById.cs - WithPermission(GET_FOR_TENANT)
POST   /staff/profiles/tenants/{tenantId}           # CreateTenantProfile.cs - WithPermission(CREATE_FOR_TENANT)
PUT    /staff/profiles/tenants/{tenantId}           # UpdateTenantProfile.cs - WithPermission(UPDATE_FOR_TENANT)
DELETE /staff/profiles/tenants/{tenantId}           # DeleteTenantProfile.cs - WithPermission(DELETE_FOR_TENANT)

# Project Profiles - Roles for a specific project (ProfileScope.Project)
GET    /staff/profiles/projects                     # FindProjectProfiles.cs - WithPermission(LIST_FOR_PROJECT)
GET    /staff/profiles/projects/{projectId}         # GetProjectProfileById.cs - WithPermission(GET_FOR_PROJECT)
POST   /staff/profiles/projects/{projectId}         # CreateProjectProfile.cs - WithPermission(CREATE_FOR_PROJECT)
PUT    /staff/profiles/projects/{projectId}         # UpdateProjectProfile.cs - WithPermission(UPDATE_FOR_PROJECT)
DELETE /staff/profiles/projects/{projectId}         # DeleteProjectProfile.cs - WithPermission(DELETE_FOR_PROJECT)
```

**Note on Route Structure:**
The routes follow an entity-centric pattern aligned with the ProfileAsStaff slice:
- All profile routes start with `/staff/profiles`
- Scope (staff/tenants/projects) is a path segment indicating the ProfileScope filter
- Symmetrical structure across all scopes
- TenantId/ProjectId in the route filters to a specific tenant/project's profile

### Example 3: Permission Helper Class

```csharp
// ProfilePermissionHelper.cs
public static class ProfilePermissionHelper {
    public static bool HasListPermission(IAuthContext auth, ProfileScope scope) {
        return scope switch {
            ProfileScope.Staff => auth.HasPermission(ProfileAsStaffPermissions.LIST_FOR_STAFF),
            ProfileScope.Tenant => auth.HasPermission(ProfileAsStaffPermissions.LIST_FOR_TENANT),
            ProfileScope.Project => auth.HasPermission(ProfileAsStaffPermissions.LIST_FOR_PROJECT),
            _ => false
        };
    }

    public static bool HasGetPermission(IAuthContext auth, ProfileScope scope) {
        return scope switch {
            ProfileScope.Staff => auth.HasPermission(ProfileAsStaffPermissions.GET_FOR_STAFF),
            ProfileScope.Tenant => auth.HasPermission(ProfileAsStaffPermissions.GET_FOR_TENANT),
            ProfileScope.Project => auth.HasPermission(ProfileAsStaffPermissions.GET_FOR_PROJECT),
            _ => false
        };
    }

    public static bool HasCreatePermission(IAuthContext auth, ProfileScope scope) {
        return scope switch {
            ProfileScope.Staff => auth.HasPermission(ProfileAsStaffPermissions.CREATE_FOR_STAFF),
            ProfileScope.Tenant => auth.HasPermission(ProfileAsStaffPermissions.CREATE_FOR_TENANT),
            ProfileScope.Project => auth.HasPermission(ProfileAsStaffPermissions.CREATE_FOR_PROJECT),
            _ => false
        };
    }

    public static bool HasUpdatePermission(IAuthContext auth, ProfileScope scope) {
        return scope switch {
            ProfileScope.Staff => auth.HasPermission(ProfileAsStaffPermissions.UPDATE_FOR_STAFF),
            ProfileScope.Tenant => auth.HasPermission(ProfileAsStaffPermissions.UPDATE_FOR_TENANT),
            ProfileScope.Project => auth.HasPermission(ProfileAsStaffPermissions.UPDATE_FOR_PROJECT),
            _ => false
        };
    }

    public static bool HasDeletePermission(IAuthContext auth, ProfileScope scope) {
        return scope switch {
            ProfileScope.Staff => auth.HasPermission(ProfileAsStaffPermissions.DELETE_FOR_STAFF),
            ProfileScope.Tenant => auth.HasPermission(ProfileAsStaffPermissions.DELETE_FOR_TENANT),
            ProfileScope.Project => auth.HasPermission(ProfileAsStaffPermissions.DELETE_FOR_PROJECT),
            _ => false
        };
    }
}
```

---

## Decision Tree

Use this decision tree when designing a new feature:

```
Is the operation performed by different user contexts (Staff vs Tenant)?
│
├─ YES → Create SEPARATE slices
│         (e.g., ProfileAsStaff vs ProfileAsTenant)
│
└─ NO → Is the difference just a data attribute/scope?
         │
         ├─ YES → Keep ONE slice, use scope parameter
         │         (e.g., ProfileAsStaff handles all ProfileScope values)
         │         │
         │         └─ Does the operation need granular permissions?
         │            │
         │            ├─ YES → Use Pattern 1: Separate endpoints per scope
         │            │         - Include scope in route (/profiles/staff/{id} vs /profiles/tenants/{id})
         │            │         - Permission enforced at route level with .WithPermission()
         │            │         - No database query until permission is verified
         │            │
         │            └─ NO  → Simple operations without scope sensitivity
         │
         └─ NO → Are business rules significantly different?
                  │
                  ├─ YES → Consider separate handlers with different logic
                  └─ NO  → Keep one slice with parameterized logic
```

---

## Key Takeaways

1. **Slice by business context, not by data type**
   - Context = who is performing the action (Staff, Tenant, Project user)
   - Data type = what they're acting upon (profile scope, status, category)

2. **Use scope/type as parameters within a slice**
   - ProfileScope, Status, Type enums are filters, not contexts

3. **Apply granular permissions with entity-centric routes (Pattern 1 - Recommended)**
   - Use entity-centric route structure: `/staff/profiles/{scope}/{id}`
   - Examples: `/staff/profiles/staff/{profileId}` or `/staff/profiles/tenants/{tenantId}`
   - Enforce permissions at route level with `.WithPermission()`
   - Avoids wasting database queries on unauthorized requests
   - Naming convention: `{action}_for_{scope}` (e.g., `update_for_tenant`, `get_for_staff`)

4. **Share service logic, separate handlers per scope**
   - Service methods should be parameterized by scope
   - Each scope has its own handler for better clarity
   - Handlers share the same service layer

5. **Only use dynamic permission checks (Pattern 2) when necessary**
   - Prefer Pattern 1 (scope in route) over Pattern 2 (load entity first)
   - Pattern 2 should only be used when scope cannot be determined from the route
   - Pattern 2 wastes a database query if user lacks permission

---

## References

- [CLAUDE.md](../CLAUDE.md) - Project conventions
- [apps/api/Src/Features/Staff/ProfileAsStaff/](../apps/api/Src/Features/Staff/ProfileAsStaff/) - Example implementation
- [apps/api/Src/Features/Common/Profile/Profile.cs](../apps/api/Src/Features/Common/Profile/Profile.cs) - Profile entity with scope enum
