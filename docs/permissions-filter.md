# PermissionFilter Documentation

The `PermissionFilter` is a flexible endpoint filter that provides permission-based access control for staff members in the PublyApp API. It supports both simple permission requirements and complex custom logic.

## Table of Contents

- [Overview](#overview)
- [Basic Usage](#basic-usage)
- [Constructor Requirements](#constructor-requirements)
- [Custom Permission Logic](#custom-permission-logic)
- [Helper Methods](#helper-methods)
- [Advanced Examples](#advanced-examples)
- [Best Practices](#best-practices)
- [Permission Management](#permission-management)

## Overview

The filter operates on two levels:
1.**Admin Bypass**: Users with `AccountLevel.Admin` automatically bypass all permission checks

2.**Permission Validation**: For non-admin users, permissions are validated based on their assigned profiles

### Key Features

- ✅ **Type-safe**: Uses `Permission` class for compile-time safety
- ✅ **Flexible**: Supports simple AND logic or complex custom logic
- ✅ **Performant**: Only queries database when necessary
- ✅ **Comprehensive Logging**: Detailed debug logs for troubleshooting
- ✅ **Admin Override**: Admins automatically pass all permission checks
- ✅ **Composable**: Helper methods for building complex permission rules

## Basic Usage

### Simple Permission Requirements

For endpoints that require users to have ALL specified permissions:

```csharp
// Single permission
app.MapGet("/staff/tenants", GetTenants)
   .WithPermission(PermissionEnum.CAN_ACCESS_TENANTS_LIST);

// Multiple permissions (user must have ALL)
app.MapPost("/staff/tenants", CreateTenant)
   .WithPermission(
       PermissionEnum.CAN_ACCESS_TENANTS_LIST,
       PermissionEnum.CAN_CREATE_TENANT
   );

// No permissions required (just authenticated staff) - Use custom logic instead
app.MapGet("/staff/profile", GetProfile)
   .WithPermission(_ => true);
```

### Direct Construction

You can also construct the filter directly:

```csharp
app.MapDelete("/staff/tenants/{id}", DeleteTenant)
   .AddEndpointFilter(new PermissionFilter(new[] {
       PermissionEnum.CAN_ACCESS_TENANTS_LIST,
       PermissionEnum.CAN_DELETE_TENANT
   }));
```

**Note**: Direct construction requires explicit array creation since the constructor parameters are now required and validated.

## Constructor Requirements

The `PermissionFilter` constructors now enforce strict parameter validation:

### Permission Array Constructor

```csharp
public PermissionFilter(Permission[] requiredPermissions)
```

**Requirements:**

- ❌ `null` values are not allowed (throws `ArgumentNullException`)
- ❌ Empty arrays are not allowed (throws `ArgumentException`)
- ✅ Must provide at least one valid permission

```csharp
// ✅ Valid - Single permission
new PermissionFilter(new[] { PermissionEnum.CAN_ACCESS_TENANTS_LIST });

// ✅ Valid - Multiple permissions
new PermissionFilter(new[] {
    PermissionEnum.CAN_ACCESS_TENANTS_LIST,
    PermissionEnum.CAN_CREATE_TENANT
});

// ❌ Invalid - Will throw ArgumentNullException
new PermissionFilter(null);

// ❌ Invalid - Will throw ArgumentException
new PermissionFilter(new Permission[0]);
```

### Custom Logic Constructor

```csharp
public PermissionFilter(Func<HashSet<string>, bool> customPermissionChecker)
```

**Requirements:**

- ❌ `null` values are not allowed (throws `ArgumentNullException`)
- ✅ Must provide a valid function that accepts `HashSet<string>` and returns `bool`

```csharp
// ✅ Valid - Custom logic
new PermissionFilter(permissions => permissions.Contains("custom-permission"));

// ✅ Valid - Always allow (for authenticated-only endpoints)
new PermissionFilter(_ => true);

// ❌ Invalid - Will throw ArgumentNullException
new PermissionFilter((Func<HashSet<string>, bool>)null);
```

## Custom Permission Logic

For complex permission requirements, use custom logic with lambda functions:

### Custom Lambda Function

```csharp
// Custom logic: permission_a OR (permission_b AND permission_d)
app.MapGet("/complex-endpoint", GetComplexData)
   .WithPermission(userPermissions =>
       userPermissions.Contains("permission-a") ||
       (userPermissions.Contains("permission-b") && userPermissions.Contains("permission-d"))
   );
```

### Business Logic Examples

```csharp
// Role-based access with fallback permissions
app.MapPut("/admin-endpoint", AdminFunction)
   .WithPermission(userPermissions =>
   {
       // Super admin can do anything
       if (userPermissions.Contains("super-admin")) return true;

       // Admin needs specific permission
       if (userPermissions.Contains("admin"))
           return userPermissions.Contains("can-manage-system");

       // Regular users need multiple permissions
       return userPermissions.Contains("can-access-tenants") &&
              userPermissions.Contains("can-modify-settings");
   });

// Context-aware permissions
app.MapPost("/conditional-access", ConditionalEndpoint)
   .WithPermission(userPermissions =>
   {
       // Different requirements based on time, user load, etc.
       bool isMaintenanceMode = /* check maintenance status */;

       if (isMaintenanceMode)
           return userPermissions.Contains("maintenance-access");

       return userPermissions.Contains("regular-access");
   });
```

## Helper Methods

The `PermissionLogic` class provides helper methods for common permission patterns:

### OR Logic (Any Permission)

```csharp
// User needs ANY of these permissions
app.MapGet("/flexible-endpoint", GetData)
   .WithPermission(
       PermissionLogic.AnyOf(
           PermissionEnum.CAN_ACCESS_TENANTS_LIST,
           PermissionEnum.CAN_ACCESS_USERS_LIST
       )
   );
```

### AND Logic (All Permissions)

```csharp
// User needs ALL of these permissions (same as default behavior)
app.MapPost("/secure-endpoint", SecureAction)
   .WithPermission(
       PermissionLogic.AllOf(
           PermissionEnum.CAN_ACCESS_TENANTS_LIST,
           PermissionEnum.CAN_CREATE_TENANT
       )
   );
```

### Combining Logic

```csharp
// Complex combination: (permission_a OR permission_b) AND permission_c
app.MapPut("/advanced-endpoint", AdvancedAction)
   .WithPermission(
       PermissionLogic.AndAlso(
           PermissionLogic.AnyOf(
               PermissionEnum.CAN_ACCESS_TENANTS_LIST,
               PermissionEnum.CAN_ACCESS_USERS_LIST
           ),
           PermissionLogic.HasPermission("can-modify-data")
       )
   );
```

### Individual Permission Checks

```csharp
// Check single permission by string key
app.MapGet("/single-check", SingleCheck)
   .WithPermission(
       PermissionLogic.HasPermission("custom-permission-key")
   );

// Check single permission by Permission object
app.MapGet("/object-check", ObjectCheck)
   .WithPermission(
       PermissionLogic.HasPermission(PermissionEnum.CAN_ACCESS_TENANTS_LIST)
   );
```

## Advanced Examples

### Reusable Permission Checkers

Create reusable permission logic for consistency across endpoints:

```csharp
public static class CustomPermissionCheckers
{
    public static readonly Func<HashSet<string>, bool> CanManageUsers =
        PermissionLogic.OrElse(
            PermissionLogic.HasPermission("super-admin"),
            PermissionLogic.AllOf(
                PermissionEnum.CAN_ACCESS_USERS_LIST,
                PermissionEnum.CAN_CREATE_USER,
                PermissionEnum.CAN_UPDATE_USER
            )
        );

    public static readonly Func<HashSet<string>, bool> CanAccessReports =
        PermissionLogic.OrElse(
            PermissionLogic.HasPermission("admin"),
            PermissionLogic.AndAlso(
                PermissionLogic.HasPermission("can-view-reports"),
                PermissionLogic.AnyOf(
                    PermissionEnum.CAN_ACCESS_TENANTS_LIST,
                    PermissionEnum.CAN_ACCESS_USERS_LIST
                )
            )
        );

    public static readonly Func<HashSet<string>, bool> CanModifySystem =
        userPermissions =>
        {
            // Complex business logic
            bool hasAdminAccess = userPermissions.Contains("admin");
            bool hasMaintenanceAccess = userPermissions.Contains("maintenance-access");
            bool hasCriticalPermissions = userPermissions.Contains("can-modify-critical-settings");

            // Admin OR (maintenance access AND critical permissions)
            return hasAdminAccess || (hasMaintenanceAccess && hasCriticalPermissions);
        };
}

// Usage
app.MapPost("/users", CreateUser)
   .WithPermission(CustomPermissionCheckers.CanManageUsers);

app.MapGet("/reports", GetReports)
   .WithPermission(CustomPermissionCheckers.CanAccessReports);

app.MapPut("/system/settings", UpdateSystemSettings)
   .WithPermission(CustomPermissionCheckers.CanModifySystem);
```

### Environment-Based Logic

```csharp
public static class EnvironmentPermissionCheckers
{
    public static Func<HashSet<string>, bool> CreateEnvironmentChecker(bool isProduction)
    {
        return userPermissions =>
        {
            if (isProduction)
            {
                // Stricter requirements in production
                return userPermissions.Contains("admin") &&
                       userPermissions.Contains("production-access");
            }
            else
            {
                // More lenient in development
                return userPermissions.Contains("developer-access") ||
                       userPermissions.Contains("admin");
            }
        };
    }
}

// Usage
bool isProduction = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Production";

app.MapPost("/deploy", DeployApplication)
   .WithPermission(EnvironmentPermissionCheckers.CreateEnvironmentChecker(isProduction));
```

## Best Practices

### 1. Use Predefined Permissions

Always use permissions from `PermissionEnum` when possible for consistency:

```csharp
// ✅ Good
.WithPermission(PermissionEnum.CAN_ACCESS_TENANTS_LIST)

// ❌ Avoid
.WithPermission(userPermissions => userPermissions.Contains("can-access-tenants-list"))
```

### 2. Create Reusable Logic

For complex permissions used across multiple endpoints, create reusable checkers:

```csharp
// ✅ Good - Reusable
public static class PermissionCheckers
{
    public static readonly Func<HashSet<string>, bool> CanManageData = /* logic */;
}

// ❌ Avoid - Duplicating logic across endpoints
```

### 3. Document Complex Logic

Always document complex permission logic:

```csharp
// ✅ Good
app.MapPost("/complex-operation", ComplexOperation)
   .WithPermission(userPermissions =>
   {
       // Business rule: Admin OR (has tenant access AND either user management OR report access)
       bool isAdmin = userPermissions.Contains("admin");
       bool hasTenantAccess = userPermissions.Contains("can-access-tenants");
       bool canManageUsers = userPermissions.Contains("can-manage-users");
       bool canViewReports = userPermissions.Contains("can-view-reports");

       return isAdmin || (hasTenantAccess && (canManageUsers || canViewReports));
   });
```

### 4. Test Permission Logic

Create unit tests for complex permission logic:

```csharp
[Test]
public void CustomPermissionChecker_ShouldAllowAdminAccess()
{
    var userPermissions = new HashSet<string> { "admin" };
    var result = CustomPermissionCheckers.CanManageUsers(userPermissions);
    Assert.IsTrue(result);
}

[Test]
public void CustomPermissionChecker_ShouldRequireMultiplePermissions()
{
    var userPermissions = new HashSet<string> { "can-access-users" };
    var result = CustomPermissionCheckers.CanManageUsers(userPermissions);
    Assert.IsFalse(result);
}
```

## Permission Management

### Available Permissions

Current predefined permissions in `PermissionEnum`:

```csharp
// Tenant Management
PermissionEnum.CAN_ACCESS_TENANTS_LIST
PermissionEnum.CAN_CREATE_TENANT

// User Management
PermissionEnum.CAN_ACCESS_USERS_LIST
```

### Adding New Permissions

To add new permissions:

1.Add to `PermissionEnum`:

```csharp
public static class PermissionEnum
{
    // ... existing permissions ...

    // ==== NEW CATEGORY ====
    public static readonly Permission CAN_ACCESS_REPORTS = new Permission { Key = "can-access-reports" };
    public static readonly Permission CAN_EXPORT_DATA = new Permission { Key = "can-export-data" };
}
```

2.Update database profiles to include the new permission keys in their `Permissions` array.

### Profile Structure

Staff permissions are managed through the `ProfileStaff` entity:

```csharp
public class ProfileStaff : BaseAttributes, INoTenantEntity
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public List<string>? Permissions { get; set; }  // Permission keys stored here
}
```

Users are assigned to profiles via `UserAccountStaff.ProfileIds`, and the filter aggregates all permissions from assigned profiles.

## Response Codes

The filter returns different HTTP status codes based on the situation:

- **200 OK**: User has required permissions, request proceeds
- **401 Unauthorized**: User has no profiles assigned (no `ProfileIds`)
- **403 Forbidden**: User lacks required permissions
- **500 Internal Server Error**: Configuration issues (e.g., missing `StaffAuthMiddleware`)

## Dependencies

The filter requires these middlewares to be configured before it:

1. `SessionAuthMiddleware` - Handles basic authentication
2. `StaffAuthMiddleware` - Validates staff membership and sets `AuthContext.AccountStaff`

Make sure these are properly configured in your middleware pipeline.

## Troubleshooting

### Common Issues

1. **Filter not working**: Ensure `StaffAuthMiddleware` is configured before the filter
2. **Always forbidden**: Check that user has assigned profiles with correct permissions
3. **Performance issues**: Consider caching user permissions for frequently accessed endpoints
4. **ArgumentNullException on startup**: Ensure constructor parameters are not null
5. **ArgumentException on startup**: Ensure permission arrays are not empty (must have at least one permission)

### Debug Logging

The filter provides detailed debug logging. Enable debug level logging to see:

- User permission checks
- Missing permissions
- Custom checker results

```json
{
  "Logging": {
    "LogLevel": {
      "MainApi.Src.Lib.Filters.PermissionFilter": "Debug"
    }
  }
}
```

---

For more examples and advanced usage patterns, refer to the test files and implementation in `api/Src/Lib/Filters/PermissionFilter.cs`.
