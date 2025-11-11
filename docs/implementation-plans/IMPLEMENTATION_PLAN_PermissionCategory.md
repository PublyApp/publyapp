# Implementation Plan: Add PermissionCategory Entity with Scope Alignment

**Date**: 2025-11-11
**Feature**: One-to-Many relationship between PermissionCategory and Permission
**Key Requirement**: Permission scope MUST match Category scope (enforced at application, entity, and database levels)

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema Changes](#database-schema-changes)
3. [Entity Implementation](#entity-implementation)
4. [Code Changes](#code-changes)
5. [Migration Strategy](#migration-strategy)
6. [Seeding Strategy](#seeding-strategy)
7. [Validation & Constraints](#validation--constraints)
8. [Testing Checklist](#testing-checklist)

---

## Overview

### Requirements Summary

- **Relationship**: 1 PermissionCategory → Many Permissions
- **Foreign Key**: Required (NOT NULL)
- **Properties**: Key, Name, Description, Scope (PermissionScope enum)
- **Translation**: Supported via Key (used as translation key)
- **Seeding**: Automatic from code definitions (similar to PermissionEnum)
- **Scope Alignment**: Categories MUST have same scope as their permissions
- **Service**: Entity and relations only (no service layer yet)

### Scope Alignment Enforcement (Critical)

**Three-Layer Protection:**

1. **Application Logic**: Factory methods validate scope match
2. **Entity Constructor**: Throws exception if scopes don't match
3. **Database Constraint**: CHECK constraint prevents invalid data

---

## Database Schema Changes

### New Table: `permission_categories`

```sql
CREATE TABLE permission_categories (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    key VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    scope INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE NULL,

    CONSTRAINT UQ_permission_categories_key UNIQUE (key)
);

CREATE INDEX IX_permission_categories_scope ON permission_categories(scope);
CREATE INDEX IX_permission_categories_key ON permission_categories(key);
```

### Modified Table: `permissions`

```sql
-- Add new column
ALTER TABLE permissions
ADD COLUMN permission_category_id UUID NOT NULL;

-- Add foreign key constraint
ALTER TABLE permissions
ADD CONSTRAINT FK_permissions_permission_categories_permission_category_id
FOREIGN KEY (permission_category_id)
REFERENCES permission_categories(id)
ON DELETE CASCADE;

-- Add CHECK constraint for scope alignment
ALTER TABLE permissions
ADD CONSTRAINT CK_Permission_CategoryScope_Match
CHECK (
    scope = (SELECT scope FROM permission_categories WHERE id = permission_category_id)
);

-- Add index on foreign key
CREATE INDEX IX_permissions_permission_category_id ON permissions(permission_category_id);
```

---

## Entity Implementation

### Step 1: Create PermissionCategory Entity

**File**: `apps/api/Src/Features/Common/Permission/PermissionCategory.cs`

```csharp
using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Permission;

[Table("permission_categories")]
[Index(nameof(Key), IsUnique = true)]
[Index(nameof(Scope))]
public class PermissionCategory : BaseAttributes, INoTenantEntity {
    [Column("key")]
    [MaxLength(255)]
    public required string Key { get; set; } = string.Empty;

    [Column("name")]
    [MaxLength(500)]
    public required string Name { get; set; } = string.Empty;

    [Column("description")]
    public required string Description { get; set; } = string.Empty;

    [Column("scope")]
    public required PermissionScope Scope { get; set; }

    // Navigation properties
    [JsonIgnore]
    public ICollection<Permission> Permissions { get; set; } = [];

    // Private constructor for EF Core
    private PermissionCategory() { }

    // Constructor with validation
    private PermissionCategory(string key, string name, string description, PermissionScope scope) {
        if (string.IsNullOrWhiteSpace(key)) {
            throw new ArgumentException("Key cannot be empty", nameof(key));
        }

        if (string.IsNullOrWhiteSpace(name)) {
            throw new ArgumentException("Name cannot be empty", nameof(name));
        }

        if (string.IsNullOrWhiteSpace(description)) {
            throw new ArgumentException("Description cannot be empty", nameof(description));
        }

        if (!Enum.IsDefined(scope)) {
            throw new ArgumentException("Invalid scope", nameof(scope));
        }

        Key = key.ToUpper(); // Normalize to uppercase for consistency
        Name = name;
        Description = description;
        Scope = scope;
    }

    // Factory methods
    public static PermissionCategory CreateStaffCategory(string key, string name, string description) {
        return new PermissionCategory(key, name, description, PermissionScope.Staff);
    }

    public static PermissionCategory CreateTenantCategory(string key, string name, string description) {
        return new PermissionCategory(key, name, description, PermissionScope.Tenant);
    }

    public static PermissionCategory CreateProjectCategory(string key, string name, string description) {
        return new PermissionCategory(key, name, description, PermissionScope.Project);
    }

    // Equality by Key (for seeders and comparisons)
    public override bool Equals(object? obj) {
        return obj is PermissionCategory other && Key == other.Key;
    }

    public override int GetHashCode() {
        return Key.GetHashCode();
    }
}

// ============================================================================
// Permission Category Enum - Define all categories here
// ============================================================================

public static class PermissionCategoryEnum {
    /// <summary>
    /// Get all categories via reflection (used by seeder)
    /// </summary>
    public static IEnumerable<PermissionCategory> GetAllCategories() {
        var categories = new List<PermissionCategory>();

        // Get all nested static classes
        var nestedTypes = typeof(PermissionCategoryEnum).GetNestedTypes();

        foreach (var nestedType in nestedTypes) {
            // Get all static readonly PermissionCategory fields
            var fields = nestedType.GetFields(
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.Static
            );

            foreach (var field in fields) {
                if (field.FieldType == typeof(PermissionCategory)) {
                    var category = field.GetValue(null) as PermissionCategory;
                    if (category != null) {
                        categories.Add(category);
                    }
                }
            }
        }

        return categories;
    }

    //--------------------------------------------------------------------------------------//
    //                                  Staff Categories                                    //
    //--------------------------------------------------------------------------------------//
    public static class Staff {
        public static readonly PermissionCategory TENANTS =
            PermissionCategory.CreateStaffCategory(
                "STAFF_TENANTS",
                "Tenant Management",
                "Permissions related to managing tenants in the system"
            );

        public static readonly PermissionCategory USERS =
            PermissionCategory.CreateStaffCategory(
                "STAFF_USERS",
                "User Management",
                "Permissions related to managing users in the system"
            );

        public static readonly PermissionCategory PROFILES =
            PermissionCategory.CreateStaffCategory(
                "STAFF_PROFILES",
                "Profile Management",
                "Permissions related to managing profiles and roles"
            );

        public static readonly PermissionCategory STAFF_MEMBERS =
            PermissionCategory.CreateStaffCategory(
                "STAFF_STAFF_MEMBERS",
                "Staff Member Management",
                "Permissions related to managing staff members"
            );
    }

    //--------------------------------------------------------------------------------------//
    //                                  Tenant Categories                                   //
    //--------------------------------------------------------------------------------------//
    public static class Tenant {
        // TODO: Add tenant categories as they are defined
    }

    //--------------------------------------------------------------------------------------//
    //                                  Project Categories                                  //
    //--------------------------------------------------------------------------------------//
    public static class Project {
        // TODO: Add project categories as they are defined
    }
}
```

### Step 2: Update Permission Entity

**File**: `apps/api/Src/Features/Common/Permission/Permission.cs`

```csharp
using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Permission;

[Table("permissions")]
[Index(nameof(PermissionCategoryId))] // NEW: Index on FK
public class Permission : BaseAttributesNoKey, INoTenantEntity {
    [Key]
    [Column("key")]
    public string Key { get; set; } = string.Empty;

    [Column("scope")]
    public PermissionScope Scope { get; set; }

    // NEW: Required foreign key to PermissionCategory
    [Column("permission_category_id")]
    public required Guid PermissionCategoryId { get; set; }

    // Navigation properties
    [JsonIgnore]
    public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];

    // NEW: Navigation property to PermissionCategory
    [JsonIgnore]
    public PermissionCategory Category { get; set; } = null!;

    // UPDATED: Constructor with category validation
    Permission(string key, PermissionScope scope, PermissionCategory category) {
        if (string.IsNullOrEmpty(key)) {
            throw new ArgumentException("Key cannot be empty", nameof(key));
        }

        if (!Enum.IsDefined(scope)) {
            throw new Exception("Invalid scope");
        }

        // NEW: Validate scope prefixes
        if (scope == PermissionScope.Tenant && !key.StartsWith(ScopeKeyPrefix.Tenant)) {
            throw new Exception("Tenant permission key must start with " + ScopeKeyPrefix.Tenant);
        } else if (scope == PermissionScope.Staff && !key.StartsWith(ScopeKeyPrefix.Staff)) {
            throw new Exception("Staff permission key must start with " + ScopeKeyPrefix.Staff);
        } else if (scope == PermissionScope.Project && !key.StartsWith(ScopeKeyPrefix.Project)) {
            throw new Exception("Project permission key must start with " + ScopeKeyPrefix.Project);
        }

        // CRITICAL: Validate category scope matches permission scope
        if (category == null) {
            throw new ArgumentNullException(nameof(category), "Category cannot be null");
        }

        if (category.Scope != scope) {
            throw new InvalidOperationException(
                $"Permission scope ({scope}) must match category scope ({category.Scope}). " +
                $"Cannot assign permission '{key}' to category '{category.Key}'."
            );
        }

        Key = key;
        Scope = scope;
        PermissionCategoryId = category.GetRequiredId();
        Category = category;
    }

    // UPDATED: Factory methods now require category parameter
    public static Permission CreateTenantPermission(string key, PermissionCategory category) {
        if (category.Scope != PermissionScope.Tenant) {
            throw new InvalidOperationException(
                $"Cannot create Tenant permission with category of scope {category.Scope}"
            );
        }
        return new Permission(
            string.Concat(ScopeKeyPrefix.Tenant, key.ToLower()),
            PermissionScope.Tenant,
            category
        );
    }

    public static Permission CreateStaffPermission(string key, PermissionCategory category) {
        if (category.Scope != PermissionScope.Staff) {
            throw new InvalidOperationException(
                $"Cannot create Staff permission with category of scope {category.Scope}"
            );
        }
        return new Permission(
            string.Concat(ScopeKeyPrefix.Staff, key.ToLower()),
            PermissionScope.Staff,
            category
        );
    }

    public static Permission CreateProjectPermission(string key, PermissionCategory category) {
        if (category.Scope != PermissionScope.Project) {
            throw new InvalidOperationException(
                $"Cannot create Project permission with category of scope {category.Scope}"
            );
        }
        return new Permission(
            string.Concat(ScopeKeyPrefix.Project, key.ToLower()),
            PermissionScope.Project,
            category
        );
    }

    public static class ScopeKeyPrefix {
        public static readonly string Staff = "staff:";
        public static readonly string Tenant = "tenant:";
        public static readonly string Project = "project:";
    }
}

public enum PermissionScope {
    Staff = 0,
    Tenant = 1,
    Project = 2
}
```

---

## Code Changes

### Step 3: Update PermissionEnum

**File**: `apps/api/Src/Lib/Filters/PermissionFilter.cs` (lines 165-205)

```csharp
public static class PermissionEnum {
    //--------------------------------------------------------------------------------------//
    //                                  Staff permissions                                   //
    //--------------------------------------------------------------------------------------//
    public static class Staff {
        // ==== TENANTS ====
        public static readonly Permission CAN_LIST_TENANTS =
            Permission.CreateStaffPermission(
                nameof(CAN_LIST_TENANTS),
                PermissionCategoryEnum.Staff.TENANTS
            );

        public static readonly Permission CAN_GET_TENANT =
            Permission.CreateStaffPermission(
                nameof(CAN_GET_TENANT),
                PermissionCategoryEnum.Staff.TENANTS
            );

        public static readonly Permission CAN_CREATE_TENANT =
            Permission.CreateStaffPermission(
                nameof(CAN_CREATE_TENANT),
                PermissionCategoryEnum.Staff.TENANTS
            );

        public static readonly Permission CAN_UPDATE_TENANT =
            Permission.CreateStaffPermission(
                nameof(CAN_UPDATE_TENANT),
                PermissionCategoryEnum.Staff.TENANTS
            );

        // ==== USERS ====
        public static readonly Permission CAN_LIST_USERS =
            Permission.CreateStaffPermission(
                nameof(CAN_LIST_USERS),
                PermissionCategoryEnum.Staff.USERS
            );

        public static readonly Permission CAN_GET_USER =
            Permission.CreateStaffPermission(
                nameof(CAN_GET_USER),
                PermissionCategoryEnum.Staff.USERS
            );

        public static readonly Permission CAN_CREATE_USER =
            Permission.CreateStaffPermission(
                nameof(CAN_CREATE_USER),
                PermissionCategoryEnum.Staff.USERS
            );

        public static readonly Permission CAN_UPDATE_USER =
            Permission.CreateStaffPermission(
                nameof(CAN_UPDATE_USER),
                PermissionCategoryEnum.Staff.USERS
            );

        // ==== PROFILES ====
        public static readonly Permission CAN_LIST_PROFILES =
            Permission.CreateStaffPermission(
                nameof(CAN_LIST_PROFILES),
                PermissionCategoryEnum.Staff.PROFILES
            );

        public static readonly Permission CAN_GET_PROFILE =
            Permission.CreateStaffPermission(
                nameof(CAN_GET_PROFILE),
                PermissionCategoryEnum.Staff.PROFILES
            );

        public static readonly Permission CAN_CREATE_PROFILE =
            Permission.CreateStaffPermission(
                nameof(CAN_CREATE_PROFILE),
                PermissionCategoryEnum.Staff.PROFILES
            );

        public static readonly Permission CAN_UPDATE_PROFILE =
            Permission.CreateStaffPermission(
                nameof(CAN_UPDATE_PROFILE),
                PermissionCategoryEnum.Staff.PROFILES
            );

        // ==== STAFF MEMBERS ====
        public static readonly Permission CAN_LIST_STAFF_MEMBERS =
            Permission.CreateStaffPermission(
                nameof(CAN_LIST_STAFF_MEMBERS),
                PermissionCategoryEnum.Staff.STAFF_MEMBERS
            );

        public static readonly Permission CAN_CREATE_STAFF_MEMBER =
            Permission.CreateStaffPermission(
                nameof(CAN_CREATE_STAFF_MEMBER),
                PermissionCategoryEnum.Staff.STAFF_MEMBERS
            );

        public static readonly Permission CAN_GET_STAFF_MEMBER =
            Permission.CreateStaffPermission(
                nameof(CAN_GET_STAFF_MEMBER),
                PermissionCategoryEnum.Staff.STAFF_MEMBERS
            );

        public static readonly Permission CAN_UPDATE_STAFF_MEMBER =
            Permission.CreateStaffPermission(
                nameof(CAN_UPDATE_STAFF_MEMBER),
                PermissionCategoryEnum.Staff.STAFF_MEMBERS
            );
    }

    //--------------------------------------------------------------------------------------//
    //                                  Tenant Permissions                                  //
    //--------------------------------------------------------------------------------------//
    public static class Tenant {
        // TODO: Add tenant permissions with their categories
    }
}
```

### Step 4: Update MainApiDbContext

**File**: `apps/api/Src/Data/DbContext/MainApiDbContext.cs`

Add the new DbSet property:

```csharp
public DbSet<PermissionCategory> PermissionCategory { get; init; }
```

The existing `OnModelCreating` method will automatically handle:
- UUID v7 generation for Id (since PermissionCategory extends BaseAttributes)
- Tenant scoping (since it implements INoTenantEntity)
- Index creation (from [Index] attributes)

No additional configuration needed in OnModelCreating.

---

## Migration Strategy

### Step 5: Create Migration

**Command**:
```bash
dotnet ef migrations add AddPermissionCategoriesWithScopeConstraint --project apps/api
```

### Migration Implementation

**File**: `apps/api/Migrations/[timestamp]_AddPermissionCategoriesWithScopeConstraint.cs`

```csharp
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations
{
    public partial class AddPermissionCategoriesWithScopeConstraint : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ====================================================================
            // STEP 1: Create permission_categories table
            // ====================================================================
            migrationBuilder.CreateTable(
                name: "permission_categories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
                    key = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    scope = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_permission_categories", x => x.id);
                });

            // ====================================================================
            // STEP 2: Create indexes on permission_categories
            // ====================================================================
            migrationBuilder.CreateIndex(
                name: "IX_permission_categories_key",
                table: "permission_categories",
                column: "key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_permission_categories_scope",
                table: "permission_categories",
                column: "scope");

            // ====================================================================
            // STEP 3: Seed default categories (required for existing permissions)
            // ====================================================================
            // Note: We need to seed categories here so existing permissions can reference them

            var staffTenantsId = Guid.NewGuid();
            var staffUsersId = Guid.NewGuid();
            var staffProfilesId = Guid.NewGuid();
            var staffStaffMembersId = Guid.NewGuid();
            var now = DateTime.UtcNow;

            migrationBuilder.InsertData(
                table: "permission_categories",
                columns: new[] { "id", "key", "name", "description", "scope", "created_at", "updated_at", "is_deleted", "deleted_at" },
                values: new object[,]
                {
                    {
                        staffTenantsId,
                        "STAFF_TENANTS",
                        "Tenant Management",
                        "Permissions related to managing tenants in the system",
                        0, // Staff scope
                        now,
                        now,
                        false,
                        null
                    },
                    {
                        staffUsersId,
                        "STAFF_USERS",
                        "User Management",
                        "Permissions related to managing users in the system",
                        0, // Staff scope
                        now,
                        now,
                        false,
                        null
                    },
                    {
                        staffProfilesId,
                        "STAFF_PROFILES",
                        "Profile Management",
                        "Permissions related to managing profiles and roles",
                        0, // Staff scope
                        now,
                        now,
                        false,
                        null
                    },
                    {
                        staffStaffMembersId,
                        "STAFF_STAFF_MEMBERS",
                        "Staff Member Management",
                        "Permissions related to managing staff members",
                        0, // Staff scope
                        now,
                        now,
                        false,
                        null
                    }
                });

            // ====================================================================
            // STEP 4: Add permission_category_id column (initially nullable)
            // ====================================================================
            migrationBuilder.AddColumn<Guid>(
                name: "permission_category_id",
                table: "permissions",
                type: "uuid",
                nullable: true);

            // ====================================================================
            // STEP 5: Assign categories to existing permissions based on key patterns
            // ====================================================================

            // Assign TENANTS category
            migrationBuilder.Sql($@"
                UPDATE permissions
                SET permission_category_id = '{staffTenantsId}'
                WHERE key LIKE '%tenant%' AND scope = 0;
            ");

            // Assign USERS category
            migrationBuilder.Sql($@"
                UPDATE permissions
                SET permission_category_id = '{staffUsersId}'
                WHERE key LIKE '%user%' AND scope = 0;
            ");

            // Assign PROFILES category
            migrationBuilder.Sql($@"
                UPDATE permissions
                SET permission_category_id = '{staffProfilesId}'
                WHERE key LIKE '%profile%' AND scope = 0;
            ");

            // Assign STAFF_MEMBERS category
            migrationBuilder.Sql($@"
                UPDATE permissions
                SET permission_category_id = '{staffStaffMembersId}'
                WHERE key LIKE '%staff%' AND scope = 0;
            ");

            // Any remaining unassigned permissions get STAFF_TENANTS as default
            migrationBuilder.Sql($@"
                UPDATE permissions
                SET permission_category_id = '{staffTenantsId}'
                WHERE permission_category_id IS NULL;
            ");

            // ====================================================================
            // STEP 6: Make permission_category_id NOT NULL
            // ====================================================================
            migrationBuilder.AlterColumn<Guid>(
                name: "permission_category_id",
                table: "permissions",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            // ====================================================================
            // STEP 7: Add foreign key constraint
            // ====================================================================
            migrationBuilder.AddForeignKey(
                name: "FK_permissions_permission_categories_permission_category_id",
                table: "permissions",
                column: "permission_category_id",
                principalTable: "permission_categories",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            // ====================================================================
            // STEP 8: Add index on foreign key
            // ====================================================================
            migrationBuilder.CreateIndex(
                name: "IX_permissions_permission_category_id",
                table: "permissions",
                column: "permission_category_id");

            // ====================================================================
            // STEP 9: Add CHECK constraint for scope alignment (CRITICAL)
            // ====================================================================
            migrationBuilder.Sql(@"
                ALTER TABLE permissions
                ADD CONSTRAINT CK_Permission_CategoryScope_Match
                CHECK (
                    scope = (SELECT scope FROM permission_categories WHERE id = permission_category_id)
                );
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop CHECK constraint
            migrationBuilder.Sql(@"
                ALTER TABLE permissions
                DROP CONSTRAINT IF EXISTS CK_Permission_CategoryScope_Match;
            ");

            // Drop foreign key
            migrationBuilder.DropForeignKey(
                name: "FK_permissions_permission_categories_permission_category_id",
                table: "permissions");

            // Drop index
            migrationBuilder.DropIndex(
                name: "IX_permissions_permission_category_id",
                table: "permissions");

            // Drop column
            migrationBuilder.DropColumn(
                name: "permission_category_id",
                table: "permissions");

            // Drop table
            migrationBuilder.DropTable(
                name: "permission_categories");
        }
    }
}
```

---

## Seeding Strategy

### Step 6: Create PermissionCategorySeeder

**File**: `apps/api/Src/Features/Common/Permission/PermissionCategorySeeder.cs`

```csharp
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Permission;

public class PermissionCategorySeeder : IEntitySeeder {
    // Order 9 - runs BEFORE PermissionSeeder (which is 10)
    public int Order => 9;

    public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
        Console.WriteLine("Seeding permission categories...");

        // Get all categories from PermissionCategoryEnum via reflection
        var definedCategories = PermissionCategoryEnum.GetAllCategories().ToList();

        if (definedCategories.Count == 0) {
            Console.WriteLine("No permission categories defined in PermissionCategoryEnum.");
            return;
        }

        // Get existing categories from database
        var existingCategories = await dbContext.PermissionCategory
            .Where(c => !c.IsDeleted)
            .ToDictionaryAsync(c => c.Key, c => c, cancellationToken);

        var categoriesToAdd = new List<PermissionCategory>();
        var categoriesToUpdate = new List<PermissionCategory>();

        foreach (var definedCategory in definedCategories) {
            if (existingCategories.TryGetValue(definedCategory.Key, out var existingCategory)) {
                // Update existing category if changed
                bool hasChanges = false;

                if (existingCategory.Name != definedCategory.Name) {
                    existingCategory.Name = definedCategory.Name;
                    hasChanges = true;
                }

                if (existingCategory.Description != definedCategory.Description) {
                    existingCategory.Description = definedCategory.Description;
                    hasChanges = true;
                }

                if (existingCategory.Scope != definedCategory.Scope) {
                    // Scope change is critical - log warning
                    Console.WriteLine($"WARNING: Scope changed for category '{definedCategory.Key}' " +
                                     $"from {existingCategory.Scope} to {definedCategory.Scope}. " +
                                     $"This may cause issues with existing permissions.");
                    existingCategory.Scope = definedCategory.Scope;
                    hasChanges = true;
                }

                if (hasChanges) {
                    existingCategory.UpdatedAt = DateTime.UtcNow;
                    categoriesToUpdate.Add(existingCategory);
                }
            } else {
                // New category - add it
                categoriesToAdd.Add(definedCategory);
            }
        }

        // Add new categories
        if (categoriesToAdd.Count > 0) {
            await dbContext.PermissionCategory.AddRangeAsync(categoriesToAdd, cancellationToken);
            Console.WriteLine($"Adding {categoriesToAdd.Count} new permission categories.");
        }

        // Update existing categories
        if (categoriesToUpdate.Count > 0) {
            dbContext.PermissionCategory.UpdateRange(categoriesToUpdate);
            Console.WriteLine($"Updating {categoriesToUpdate.Count} existing permission categories.");
        }

        // Save changes
        if (categoriesToAdd.Count > 0 || categoriesToUpdate.Count > 0) {
            await dbContext.SaveChangesAsync(cancellationToken);
            Console.WriteLine($"Permission categories seeded successfully. " +
                            $"Added: {categoriesToAdd.Count}, Updated: {categoriesToUpdate.Count}");
        } else {
            Console.WriteLine("No permission category changes needed.");
        }
    }
}
```

### Step 7: Update PermissionSeeder

**File**: `apps/api/Src/Features/Common/Permission/PermissionSeeder.cs`

```csharp
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Permission;

public class PermissionSeeder : IEntitySeeder {
    // Order 10 - runs AFTER PermissionCategorySeeder (which is 9)
    public int Order => 10;

    public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
        Console.WriteLine("Seeding permissions...");

        // Get all permissions from PermissionEnum via reflection
        var definedPermissions = GetAllPermissions().ToList();

        if (definedPermissions.Count == 0) {
            Console.WriteLine("No permissions defined in PermissionEnum.");
            return;
        }

        // Get existing permissions from database
        var existingPermissionKeys = await dbContext.Permission
            .Where(p => !p.IsDeleted)
            .Select(p => p.Key)
            .ToHashSetAsync(cancellationToken);

        // Filter out permissions that already exist
        var permissionsToAdd = definedPermissions
            .Where(p => !existingPermissionKeys.Contains(p.Key))
            .ToList();

        if (permissionsToAdd.Count == 0) {
            Console.WriteLine("No new permissions to add.");
            return;
        }

        // CRITICAL: Validate scope alignment before adding
        foreach (var permission in permissionsToAdd) {
            // Fetch the actual category from database to verify scope
            var category = await dbContext.PermissionCategory
                .FirstOrDefaultAsync(c => c.Id == permission.PermissionCategoryId, cancellationToken);

            if (category == null) {
                throw new InvalidOperationException(
                    $"Permission '{permission.Key}' references non-existent category ID '{permission.PermissionCategoryId}'. " +
                    $"Ensure PermissionCategorySeeder runs before PermissionSeeder."
                );
            }

            if (category.Scope != permission.Scope) {
                throw new InvalidOperationException(
                    $"Permission '{permission.Key}' has scope {permission.Scope} but is assigned to " +
                    $"category '{category.Key}' with scope {category.Scope}. Scope mismatch detected!"
                );
            }
        }

        // Add new permissions
        await dbContext.Permission.AddRangeAsync(permissionsToAdd, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);

        Console.WriteLine($"Successfully seeded {permissionsToAdd.Count} new permissions.");
    }

    private static IEnumerable<Permission> GetAllPermissions() {
        var permissions = new List<Permission>();

        // Get all nested static classes in PermissionEnum
        var nestedTypes = typeof(PermissionEnum).GetNestedTypes();

        foreach (var nestedType in nestedTypes) {
            // Get all static readonly Permission fields
            var fields = nestedType.GetFields(
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.Static
            );

            foreach (var field in fields) {
                if (field.FieldType == typeof(Permission)) {
                    var permission = field.GetValue(null) as Permission;
                    if (permission != null) {
                        permissions.Add(permission);
                    }
                }
            }
        }

        return permissions;
    }
}
```

### Step 8: Register Seeders

**File**: `apps/api/Program.cs` or wherever seeders are registered

Ensure both seeders are registered in the DI container:

```csharp
// Register entity seeders
builder.Services.AddTransient<IEntitySeeder, PermissionCategorySeeder>();
builder.Services.AddTransient<IEntitySeeder, PermissionSeeder>();
// ... other seeders
```

The seeders will execute in order based on their `Order` property:
1. PermissionCategorySeeder (Order = 9)
2. PermissionSeeder (Order = 10)

---

## Validation & Constraints

### Scope Alignment: Three-Layer Protection

#### Layer 1: Application Logic (Factory Methods)

```csharp
// In Permission.cs
public static Permission CreateStaffPermission(string key, PermissionCategory category) {
    if (category.Scope != PermissionScope.Staff) {
        throw new InvalidOperationException(
            $"Cannot create Staff permission with category of scope {category.Scope}"
        );
    }
    // ... rest of factory method
}
```

**Result**: Compile-time safety when creating permissions programmatically.

#### Layer 2: Entity Constructor Validation

```csharp
// In Permission constructor
if (category.Scope != scope) {
    throw new InvalidOperationException(
        $"Permission scope ({scope}) must match category scope ({category.Scope}). " +
        $"Cannot assign permission '{key}' to category '{category.Key}'."
    );
}
```

**Result**: Runtime validation catches mismatches during object creation.

#### Layer 3: Database CHECK Constraint

```sql
ALTER TABLE permissions
ADD CONSTRAINT CK_Permission_CategoryScope_Match
CHECK (
    scope = (SELECT scope FROM permission_categories WHERE id = permission_category_id)
);
```

**Result**: Database-level enforcement prevents invalid data even with direct DB access.

### Testing Scope Alignment

After implementation, verify all three layers:

```csharp
// Test 1: Factory method should reject mismatched scope
var tenantCategory = PermissionCategoryEnum.Tenant.SOME_CATEGORY;
try {
    var permission = Permission.CreateStaffPermission("TEST", tenantCategory);
    // Should NOT reach here
    throw new Exception("Factory method should have rejected scope mismatch!");
} catch (InvalidOperationException) {
    // Expected behavior
    Console.WriteLine("✓ Layer 1 (Factory) validation working");
}

// Test 2: Direct constructor should reject mismatched scope
try {
    var permission = new Permission("staff:test", PermissionScope.Staff, tenantCategory);
    // Should NOT reach here
    throw new Exception("Constructor should have rejected scope mismatch!");
} catch (InvalidOperationException) {
    // Expected behavior
    Console.WriteLine("✓ Layer 2 (Constructor) validation working");
}

// Test 3: Database constraint should reject mismatched scope
try {
    // Attempt to insert invalid data directly via SQL
    await dbContext.Database.ExecuteSqlRawAsync(@"
        INSERT INTO permissions (key, scope, permission_category_id, created_at, updated_at, is_deleted)
        VALUES ('staff:hack', 0,
            (SELECT id FROM permission_categories WHERE scope = 1 LIMIT 1),
            NOW(), NOW(), false
        )
    ");
    // Should NOT reach here
    throw new Exception("Database should have rejected scope mismatch!");
} catch (DbUpdateException) {
    // Expected behavior
    Console.WriteLine("✓ Layer 3 (Database) validation working");
}
```

---

## Testing Checklist

### Pre-Migration Testing

- [ ] Code compiles without errors
- [ ] All existing tests pass
- [ ] PermissionCategory entity created with correct properties
- [ ] Permission entity updated with FK and navigation property
- [ ] Factory methods updated to require category parameter
- [ ] PermissionCategoryEnum defined with at least 4 staff categories
- [ ] PermissionEnum updated with category references

### Migration Testing

- [ ] Migration generates successfully
- [ ] Migration Up() runs without errors
- [ ] Migration Down() rolls back cleanly
- [ ] CHECK constraint is created correctly
- [ ] All existing permissions are assigned categories
- [ ] No orphaned permissions (all have valid category_id)

### Post-Migration Testing

- [ ] PermissionCategorySeeder runs successfully
- [ ] PermissionSeeder runs successfully (after category seeder)
- [ ] All categories are seeded correctly
- [ ] All permissions are seeded with correct categories
- [ ] Can query permissions with `.Include(p => p.Category)`
- [ ] Can query categories with `.Include(c => c.Permissions)`

### Scope Alignment Testing

- [ ] Factory method rejects mismatched scope
- [ ] Constructor validates scope match
- [ ] Database constraint prevents invalid INSERT
- [ ] Database constraint prevents invalid UPDATE
- [ ] Seeder validates scope alignment before saving

### Integration Testing

- [ ] API endpoints still work with permission filters
- [ ] Permission checking works correctly
- [ ] No performance degradation (with proper indexes)
- [ ] Soft delete works on categories and permissions
- [ ] Cascade delete works (deleting category affects permissions)

---

## Translation Support

### Translation Keys

Categories can be translated using their Key property:

```json
{
  "permission_category.staff_tenants.name": "Tenant Management",
  "permission_category.staff_tenants.description": "Permissions related to managing tenants",
  "permission_category.staff_users.name": "User Management",
  "permission_category.staff_users.description": "Permissions related to managing users"
}
```

### API Response Example

```csharp
// In a controller/endpoint
var categories = await dbContext.PermissionCategory
    .Where(c => !c.IsDeleted)
    .Select(c => new {
        c.Id,
        c.Key,
        NameTranslationKey = $"permission_category.{c.Key.ToLower()}.name",
        DescriptionTranslationKey = $"permission_category.{c.Key.ToLower()}.description",
        c.Scope
    })
    .ToListAsync();
```

---

## Summary

This implementation plan provides:

1. **Complete entity structure** for PermissionCategory
2. **Updated Permission entity** with required FK and navigation
3. **Three-layer scope validation** (factory, constructor, database)
4. **Comprehensive migration** with data migration strategy
5. **Automatic seeding** from code definitions
6. **Translation support** via Key property
7. **Testing checklist** for thorough validation

### Key Files to Create/Modify

**New Files:**
- `apps/api/Src/Features/Common/Permission/PermissionCategory.cs`
- `apps/api/Src/Features/Common/Permission/PermissionCategorySeeder.cs`
- `apps/api/Migrations/[timestamp]_AddPermissionCategoriesWithScopeConstraint.cs`

**Modified Files:**
- `apps/api/Src/Features/Common/Permission/Permission.cs`
- `apps/api/Src/Features/Common/Permission/PermissionSeeder.cs`
- `apps/api/Src/Lib/Filters/PermissionFilter.cs`
- `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- `apps/api/Program.cs` (seeder registration)

### Estimated Implementation Time

- Entity creation and updates: 30-45 minutes
- Migration creation: 20-30 minutes
- Seeder creation and updates: 30-45 minutes
- Testing and validation: 45-60 minutes
- **Total**: 2-3 hours

---

## Next Steps

1. Review this plan thoroughly
2. Confirm all requirements are met
3. Begin implementation following the order in this document
4. Test each layer individually as implemented
5. Run full integration tests after completion
