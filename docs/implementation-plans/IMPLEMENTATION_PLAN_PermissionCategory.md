# Implementation Plan: Add PermissionCategory Entity with Scope Alignment

**Date**: 2025-11-11
**Feature**: One-to-Many relationship between PermissionCategory and Permission
**Key Requirement**: Permission scope MUST match Category scope (enforced at application, entity, and database levels)

---

## Table of Contents

1. [⚠️ CRITICAL: Common Mistakes to Avoid](#️-critical-common-mistakes-to-avoid)
2. [Overview](#overview)
3. [Database Schema Changes](#database-schema-changes)
4. [Entity Implementation](#entity-implementation)
5. [Code Changes](#code-changes)
6. [Migration Strategy](#migration-strategy)
7. [Seeding Strategy](#seeding-strategy)
8. [Validation & Constraints](#validation--constraints)
9. [Testing Checklist](#testing-checklist)

---

## ⚠️ CRITICAL: Common Mistakes to Avoid

**READ THIS FIRST** - These are real bugs found in previous implementations. Following these rules prevents critical runtime errors.

### 🔴 MISTAKE #1: Not Setting Foreign Key in Constructor

**❌ WRONG** (causes runtime errors):
```csharp
// In Permission constructor
Key = key;
Scope = scope;
Category = category;
// Note: PermissionCategoryId will be set automatically by EF Core ← THIS IS FALSE!
```

**✅ CORRECT**:
```csharp
Key = key;
Scope = scope;
PermissionCategoryId = category.GetRequiredId(); // ← MUST set FK explicitly
Category = category;
```

**Why**: EF Core does NOT auto-populate FK from navigation property during object construction. Object will be in invalid state until SaveChanges.

---

### 🔴 MISTAKE #2: Mutating Static readonly Objects

**❌ WRONG** (causes state pollution):
```csharp
// In PermissionSeeder
foreach (var permission in permissionsToAdd) {
    permission.Category = dbCategory;  // ← Mutating static object!
    permission.PermissionCategoryId = dbCategory.Id;
}
```

**✅ CORRECT**:
```csharp
// Work with database entities, not static definitions
var existingPermission = await dbContext.Permission.FindAsync(permission.Key);
if (existingPermission != null) {
    existingPermission.PermissionCategoryId = dbCategory.Id;  // ← Mutate DB entity, not static
}
```

**Why**: Static readonly objects are shared across application lifetime. Mutating them causes unpredictable behavior.

---

### 🔴 MISTAKE #3: Missing `required` Keywords

**❌ WRONG** (loses compile-time safety):
```csharp
public string Key { get; set; } = string.Empty;
public Guid PermissionCategoryId { get; set; }
```

**✅ CORRECT**:
```csharp
public required string Key { get; set; } = string.Empty;
public required Guid PermissionCategoryId { get; set; }
```

**Why**: Without `required`, you can create invalid objects. Always mark non-nullable properties as required.

---

### 🔴 MISTAKE #4: Not Initializing Timestamps in Constructor

**❌ WRONG** (object in invalid state):
```csharp
private PermissionCategory(string key, string name, string description, PermissionScope scope) {
    Key = key.ToUpper();
    Name = name;
    Description = description;
    Scope = scope;
    // CreatedAt, UpdatedAt, IsDeleted are not initialized!
}
```

**✅ CORRECT**:
```csharp
private PermissionCategory(string key, string name, string description, PermissionScope scope) {
    Key = key.ToUpper();
    Name = name;
    Description = description;
    Scope = scope;

    // Initialize BaseAttributes timestamps
    CreatedAt = DateTime.UtcNow;
    UpdatedAt = DateTime.UtcNow;
    IsDeleted = false;
    DeletedAt = null;
}
```

**Why**: Object should be valid immediately after construction, not just after SaveChanges.

---

### 🔴 MISTAKE #5: Incorrect Equals/GetHashCode Implementation

**❌ WRONG** (breaks Dictionary/HashSet usage):
```csharp
public override bool Equals(object? obj) {
    return obj is PermissionCategory other && Key == other.Key;  // Case-sensitive!
}

public override int GetHashCode() {
    return Key.GetHashCode();  // Case-sensitive hash!
}
```

**✅ CORRECT**:
```csharp
public override bool Equals(object? obj) {
    return obj is PermissionCategory other &&
           string.Equals(Key, other.Key, StringComparison.OrdinalIgnoreCase);
}

public override int GetHashCode() {
    return StringComparer.OrdinalIgnoreCase.GetHashCode(Key ?? string.Empty);
}
```

**Why**: Keys are normalized to uppercase, but comparisons should be case-insensitive for robustness.

---

### 🔴 MISTAKE #6: Complex SQL Pattern Matching in Migrations

**❌ WRONG** (fragile and hard to maintain):
```csharp
// In migration
migrationBuilder.Sql($@"
    UPDATE permissions
    SET permission_category_id = '{staffTenantsId}'
    WHERE key LIKE '%tenant%' AND scope = 0;
");
// More complex pattern matching...
```

**✅ CORRECT**:
```csharp
// In migration - simple fallback
migrationBuilder.Sql($@"
    UPDATE permissions
    SET permission_category_id = '{fallbackCategoryId}'
    WHERE permission_category_id IS NULL;
");
// Let PermissionSeeder handle proper assignment on app startup
```

**Why**: Migrations should only handle schema. Data logic belongs in seeders where it's testable and maintainable.

---

### 🔴 MISTAKE #7: Seeder Only Handles New Permissions

**❌ WRONG** (doesn't fix migration fallback assignments):
```csharp
public async Task SeedAsync(MainApiDbContext dbContext) {
    var existingKeys = await dbContext.Permission.Select(p => p.Key).ToHashSetAsync();
    var permissionsToAdd = definedPermissions.Where(p => !existingKeys.Contains(p.Key));

    // Only adds NEW permissions - doesn't update existing ones!
    await dbContext.Permission.AddRangeAsync(permissionsToAdd);
}
```

**✅ CORRECT**:
```csharp
public async Task SeedAsync(MainApiDbContext dbContext) {
    var existingPermissions = await dbContext.Permission
        .Include(p => p.Category)
        .ToDictionaryAsync(p => p.Key);

    foreach (var definedPermission in definedPermissions) {
        if (existingPermissions.TryGetValue(definedPermission.Key, out var existing)) {
            // UPDATE existing permission's category if needed
            if (existing.PermissionCategoryId != dbCategory.Id) {
                existing.PermissionCategoryId = dbCategory.Id;
                permissionsToUpdate.Add(existing);
            }
        } else {
            // ADD new permission
            permissionsToAdd.Add(definedPermission);
        }
    }
}
```

**Why**: Seeder must reassign existing permissions from migration fallback category to correct categories.

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
    public required string Key { get; set; } = string.Empty;  // ⚠️ MUST use 'required' keyword!

    [Column("name")]
    [MaxLength(500)]
    public required string Name { get; set; } = string.Empty;  // ⚠️ MUST use 'required' keyword!

    [Column("description")]
    public required string Description { get; set; } = string.Empty;  // ⚠️ MUST use 'required' keyword!

    [Column("scope")]
    public required PermissionScope Scope { get; set; }  // ⚠️ MUST use 'required' keyword!

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

        // ⚠️ CRITICAL: Initialize BaseAttributes timestamps (Mistake #4)
        // Object MUST be valid immediately after construction!
        CreatedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
        IsDeleted = false;
        DeletedAt = null;
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

    // ⚠️ CRITICAL: Equality by Key (case-insensitive for robustness) - Mistake #5
    // MUST use StringComparer for case-insensitive comparison!
    public override bool Equals(object? obj) {
        return obj is PermissionCategory other &&
               string.Equals(Key, other.Key, StringComparison.OrdinalIgnoreCase);
    }

    public override int GetHashCode() {
        return StringComparer.OrdinalIgnoreCase.GetHashCode(Key ?? string.Empty);
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

**CRITICAL IMPLEMENTATION NOTES**:
1. ✅ **DO** set `PermissionCategoryId` explicitly in constructor (line 330)
2. ✅ **DO** mark `PermissionCategoryId` as `required` (line 287)
3. ❌ **DON'T** rely on EF Core to auto-populate FK from navigation property
4. ❌ **DON'T** leave object in invalid state after construction

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
    public required Guid PermissionCategoryId { get; set; }  // ⚠️ MUST use 'required' keyword! (Mistake #3)

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
        // ⚠️ CRITICAL: MUST set PermissionCategoryId explicitly! (Mistake #1)
        // EF Core does NOT auto-populate FK from navigation property!
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

### Philosophy: Keep Migrations Simple

**IMPORTANT**: Migrations should only handle **schema changes**, not data population. This approach:
- Makes migrations easier to maintain and debug
- Avoids complex SQL logic in generated files
- Lets seeders handle data (where they belong)
- Makes rollbacks safer and more predictable
- Follows separation of concerns principle

### Step 5: Create Migration

**Command**:
```bash
dotnet ef migrations add AddPermissionCategoriesWithScopeConstraint --project apps/api
```

### Migration Implementation

**File**: `apps/api/Migrations/[timestamp]_AddPermissionCategoriesWithScopeConstraint.cs`

**Key Points**:
- Migration creates schema only
- Creates a single "fallback" category for existing permissions
- Seeders will reassign permissions to correct categories on app startup
- No complex SQL pattern matching needed

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
            // STEP 3: Create a temporary fallback category for data migration
            // Note: PermissionCategorySeeder will create proper categories and
            // PermissionSeeder will reassign permissions correctly on app startup
            // ====================================================================
            var fallbackCategoryId = Guid.NewGuid();
            var now = DateTime.UtcNow;

            migrationBuilder.InsertData(
                table: "permission_categories",
                columns: new[] { "id", "key", "name", "description", "scope", "created_at", "updated_at", "is_deleted", "deleted_at" },
                values: new object[]
                {
                    fallbackCategoryId,
                    "MIGRATION_FALLBACK",
                    "Migration Fallback Category",
                    "Temporary category for existing permissions during migration. Will be reassigned by seeders.",
                    0, // Staff scope (most existing permissions are staff scope)
                    now,
                    now,
                    false,
                    null
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
            // STEP 5: Assign all existing permissions to fallback category
            // Note: This is temporary. PermissionSeeder will reassign to correct
            // categories on next app startup based on PermissionEnum definitions.
            // ====================================================================
            migrationBuilder.Sql($@"
                UPDATE permissions
                SET permission_category_id = '{fallbackCategoryId}'
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

### Why This Approach Is Better

1. **Simplicity**: Migration only handles schema, one simple SQL statement for data
2. **Maintainability**: No complex pattern matching logic to debug
3. **Testability**: Seeders are easier to unit test than SQL in migrations
4. **Flexibility**: Easy to change category assignments without creating new migrations
5. **Safety**: Less risk of data corruption from pattern matching errors
6. **Separation of Concerns**: Schema changes in migrations, data in seeders

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

**Key Responsibilities**:
1. Add new permissions defined in PermissionEnum
2. Update category assignments for existing permissions (handles migration from fallback category)
3. Validate scope alignment before saving

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

        // Get all categories from database for validation and reference
        var categoriesFromDb = await dbContext.PermissionCategory
            .Where(c => !c.IsDeleted)
            .ToDictionaryAsync(c => c.Key, c => c, cancellationToken);

        // ⚠️ CRITICAL: Get existing permissions from database (Mistake #7)
        // We MUST handle both new AND existing permissions!
        // This reassigns existing permissions from fallback category to correct ones.
        var existingPermissions = await dbContext.Permission
            .Include(p => p.Category)
            .Where(p => !p.IsDeleted)
            .ToDictionaryAsync(p => p.Key, p => p, cancellationToken);

        var permissionsToAdd = new List<Permission>();
        var permissionsToUpdate = new List<Permission>();

        foreach (var definedPermission in definedPermissions) {
            // Get the actual category from database
            var categoryKey = definedPermission.Category.Key;
            if (!categoriesFromDb.TryGetValue(categoryKey, out var dbCategory)) {
                throw new InvalidOperationException(
                    $"Permission '{definedPermission.Key}' references non-existent category '{categoryKey}'. " +
                    $"Ensure PermissionCategorySeeder runs before PermissionSeeder."
                );
            }

            // Validate scope alignment
            if (dbCategory.Scope != definedPermission.Scope) {
                throw new InvalidOperationException(
                    $"Permission '{definedPermission.Key}' has scope {definedPermission.Scope} but is assigned to " +
                    $"category '{categoryKey}' with scope {dbCategory.Scope}. Scope mismatch detected!"
                );
            }

            if (existingPermissions.TryGetValue(definedPermission.Key, out var existingPermission)) {
                // ⚠️ CRITICAL: Permission exists - UPDATE database entity (Mistake #2)
                // We update the DB entity, NOT the static readonly object!
                if (existingPermission.PermissionCategoryId != dbCategory.Id) {
                    existingPermission.PermissionCategoryId = dbCategory.Id;
                    existingPermission.Category = dbCategory;
                    existingPermission.UpdatedAt = DateTime.UtcNow;
                    permissionsToUpdate.Add(existingPermission);
                }
            } else {
                // New permission - set correct category reference
                // Note: definedPermission here is a NEW object from static field
                // It's safe to set properties on it before adding to DB
                definedPermission.PermissionCategoryId = dbCategory.Id;
                definedPermission.Category = dbCategory;
                permissionsToAdd.Add(definedPermission);
            }
        }

        // Save changes
        if (permissionsToAdd.Count > 0) {
            await dbContext.Permission.AddRangeAsync(permissionsToAdd, cancellationToken);
        }

        if (permissionsToUpdate.Count > 0) {
            dbContext.Permission.UpdateRange(permissionsToUpdate);
        }

        if (permissionsToAdd.Count > 0 || permissionsToUpdate.Count > 0) {
            await dbContext.SaveChangesAsync(cancellationToken);
            Console.WriteLine($"Permissions seeded successfully. Added: {permissionsToAdd.Count}, Updated: {permissionsToUpdate.Count}");
        } else {
            Console.WriteLine("No permission changes needed.");
        }
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

## Key Architectural Decisions

### 1. Separation of Concerns: Schema vs Data

**Decision**: Migrations handle ONLY schema changes; seeders handle ALL data population.

**Rationale**:
- Migrations are generated files - complex logic makes them hard to maintain
- Seeders are testable, migrations are not
- Data logic belongs in application layer, not in SQL
- Easier to modify category assignments without new migrations
- Safer rollbacks

**Implementation**:
- Migration creates fallback category and assigns all existing permissions to it
- PermissionSeeder reassigns permissions to correct categories on app startup
- Simple, predictable, maintainable

### 2. Explicit Foreign Key Assignment

**Decision**: Always set `PermissionCategoryId` explicitly in constructor (line 330 of Permission.cs).

**Rationale**:
- EF Core does NOT auto-populate FK from navigation property during object construction
- Fail-fast principle - object should be valid immediately after construction
- Prevents runtime errors
- Makes code intent clear

**Anti-Pattern to Avoid**:
```csharp
// ❌ DON'T DO THIS
Category = category;
// PermissionCategoryId will be null here - WRONG!
```

**Correct Pattern**:
```csharp
// ✅ DO THIS
PermissionCategoryId = category.GetRequiredId();
Category = category;
```

### 3. Immutability of Static Objects

**Decision**: Never mutate static `readonly` Permission objects in PermissionSeeder.

**Rationale**:
- Static objects are shared across application lifetime
- Mutation causes state pollution
- Unpredictable behavior in multi-threaded scenarios
- Violates immutability principle

**Implementation**:
- PermissionSeeder loads permissions from static definitions
- Updates database entities (not static objects)
- Static objects remain immutable source of truth

### 4. Required Keywords for Compile-Time Safety

**Decision**: Use `required` keyword on all non-nullable properties.

**Implementation**:
```csharp
public required string Key { get; set; } = string.Empty;
public required Guid PermissionCategoryId { get; set; }
```

**Benefits**:
- Compile-time validation
- Prevents invalid object creation
- Clear API contract
- Better IDE support

### 5. Timestamp Initialization in Constructors

**Decision**: Initialize `CreatedAt` and `UpdatedAt` in entity constructors.

**Rationale**:
- Object should be valid immediately after construction
- While SaveChanges updates these, object shouldn't exist in invalid state
- Consistent with BaseAttributes contract
- Defensive programming

### 6. Case-Insensitive Equality for Keys

**Decision**: Use `StringComparer.OrdinalIgnoreCase` for equality comparisons.

**Rationale**:
- Keys are normalized to uppercase in constructor
- But comparisons should be resilient to case differences
- Prevents bugs in Dictionary/HashSet usage
- More robust than simple `==` operator

---

## Summary

This implementation plan provides:

1. **Complete entity structure** for PermissionCategory with proper initialization
2. **Updated Permission entity** with required FK and robust validation
3. **Three-layer scope validation** (factory, constructor, database)
4. **Clean migration strategy** - schema only, no complex SQL logic
5. **Smart seeding system** - handles both new and existing permissions
6. **Translation support** via Key property
7. **Comprehensive testing checklist** for validation
8. **Architectural best practices** - clear separation of concerns
9. **Type safety** with `required` keywords throughout
10. **Defensive programming** patterns to prevent common bugs

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

1. **⚠️ READ THE "COMMON MISTAKES TO AVOID" SECTION FIRST**
2. Review this plan thoroughly
3. Confirm all requirements are met
4. Begin implementation following the order in this document
5. Test each layer individually as implemented
6. Run full integration tests after completion

---

## ⚠️ IMPORTANT: This Plan Contains Lessons Learned

This implementation plan has been revised based on a **critical review of a previous implementation** that contained multiple bugs. See [REVIEW_PermissionCategory_Implementation.md](./REVIEW_PermissionCategory_Implementation.md) for detailed analysis.

**All warnings marked with ⚠️ throughout this document are based on REAL bugs found in production code.**

The mistakes documented at the top of this plan are NOT theoretical - they were actual issues that caused:
- Runtime errors (Mistake #1)
- State pollution and unpredictable behavior (Mistake #2)
- Loss of compile-time safety (Mistake #3)
- Objects in invalid states (Mistake #4)
- Dictionary/HashSet bugs (Mistake #5)
- Fragile migrations (Mistake #6)
- Incomplete data migration (Mistake #7)

**Follow this plan exactly** to avoid repeating these mistakes. Every warning comment in the code examples exists for a reason.
