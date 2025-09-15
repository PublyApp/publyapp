# Audit Tracking System

## Overview

The application implements automatic audit tracking for all entities that inherit from `BaseAttributes` or `BaseAttributesNoKey`. This system automatically manages creation, modification, and deletion timestamps without requiring manual intervention.

## Features

- ✅ **Automatic Timestamp Management**: `CreatedAt`, `UpdatedAt`, `IsDeleted`, `DeletedAt`
- ✅ **Soft Delete by Default**: All deletes become soft deletes automatically
- ✅ **Bulk Operation Support**: Efficient bulk updates and deletes with audit tracking
- ✅ **Zero Configuration**: Works automatically for all entities
- ✅ **Performance Optimized**: Minimal overhead with efficient SQL generation

## Base Classes

### BaseAttributesNoKey
For entities that need audit tracking without a primary key.

```csharp
public class BaseAttributesNoKey
{
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
}
```

### BaseAttributes
For entities with primary keys (most common).

```csharp
public class BaseAttributes : BaseAttributesNoKey
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
}
```

## Usage

### Standard Operations (Automatic)

#### Creating Entities
```csharp
var newUser = new User
{
    FirstName = "John",
    LastName = "Doe",
    Email = "john@example.com"
};

context.User.Add(newUser);
await context.SaveChangesAsync(); // CreatedAt and UpdatedAt set automatically
```

#### Updating Entities
```csharp
var user = await context.User.FirstAsync();
user.FirstName = "Jane";
await context.SaveChangesAsync(); // UpdatedAt set automatically
```

#### Deleting Entities (Soft Delete)
```csharp
var user = await context.User.FirstAsync();
context.User.Remove(user);
await context.SaveChangesAsync(); // Sets IsDeleted=true, DeletedAt=now, UpdatedAt=now
```

### Bulk Operations (With Audit Tracking)

#### Bulk Updates
```csharp
// Update multiple users with automatic UpdatedAt tracking
var updatedCount = await context.User.ExecuteUpdateWithAuditAsync(
    setters => setters.SetProperty(u => u.IsSuspended, true)
);

// Update multiple properties
var updatedCount2 = await context.User.ExecuteUpdateWithAuditAsync(
    setters => setters
        .SetProperty(u => u.IsSuspended, true)
        .SetProperty(u => u.IsVerified, false)
);
```

#### Bulk Soft Deletes
```csharp
// Soft delete all users with complete audit trail
var deletedCount = await context.User.ExecuteSoftDeleteAsync();

// Soft delete with conditions
var deletedCount2 = await context.User
    .Where(u => u.IsSuspended)
    .ExecuteUpdateAsync(setters => setters
        .SetProperty(u => u.IsDeleted, true)
        .SetProperty(u => u.DeletedAt, DateTime.UtcNow)
        .SetProperty(u => u.UpdatedAt, DateTime.UtcNow));
```

#### Force Hard Delete (Opt-Out)
```csharp
// This permanently deletes the record (bypasses soft delete)
context.ForceHardDelete(user);
await context.SaveChangesAsync(); // Actually deletes from database

// Or for multiple entities
context.ForceHardDeleteRange(usersToDelete);
await context.SaveChangesAsync();
```

## Database Schema

### Required Columns

All entities using audit tracking must have these columns:

```sql
-- Required audit columns
created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
deleted_at TIMESTAMP WITH TIME ZONE NULL
```

### Migration

To add the `deleted_at` column to existing tables:

```bash
dotnet ef migrations add AddDeletedAtColumn
dotnet ef database update
```

## Query Patterns

### Include Soft-Deleted Records
```csharp
var allUsers = await context.User
    .IgnoreQueryFilters()
    .ToListAsync();
```

### Exclude Soft-Deleted Records (Default)
```csharp
var activeUsers = await context.User.ToListAsync();
```

### Only Soft-Deleted Records
```csharp
var deletedUsers = await context.User
    .Where(u => u.IsDeleted)
    .ToListAsync();
```

## API Reference

### DbSet Extension Methods

#### ExecuteSoftDelete
```csharp
public static int ExecuteSoftDelete<TEntity>(this DbSet<TEntity> dbSet)
    where TEntity : BaseAttributesNoKey
```
Bulk soft delete with audit tracking (sets IsDeleted, DeletedAt, UpdatedAt).

#### ExecuteSoftDeleteAsync
```csharp
public static async Task<int> ExecuteSoftDeleteAsync<TEntity>(this DbSet<TEntity> dbSet, CancellationToken cancellationToken = default)
    where TEntity : BaseAttributesNoKey
```
Async bulk soft delete with audit tracking.

#### ExecuteUpdateWithAudit
```csharp
public static int ExecuteUpdateWithAudit<TEntity>(this DbSet<TEntity> dbSet, Func<SetPropertyCalls<TEntity>, SetPropertyCalls<TEntity>> setPropertyCalls)
    where TEntity : BaseAttributesNoKey
```
Bulk update with automatic UpdatedAt tracking.

#### ExecuteUpdateWithAuditAsync
```csharp
public static async Task<int> ExecuteUpdateWithAuditAsync<TEntity>(this DbSet<TEntity> dbSet, Func<SetPropertyCalls<TEntity>, SetPropertyCalls<TEntity>> setPropertyCalls, CancellationToken cancellationToken = default)
    where TEntity : BaseAttributesNoKey
```
Async bulk update with automatic UpdatedAt tracking.

## Best Practices

1. **Always inherit from BaseAttributes** for entities with primary keys
2. **Use ExecuteUpdateWithAudit** for bulk updates
3. **Use ExecuteSoftDelete** for bulk deletes
4. **Avoid mixing bulk operations with SaveChanges** in the same transaction
5. **Consider indexes** on `is_deleted` and `deleted_at` columns for performance

## Troubleshooting

### Audit Fields Not Updating
- Ensure entity inherits from `BaseAttributesNoKey`
- Check that `SaveChanges()` is being called

### Soft Deletes Not Working
- Use `ExecuteSoftDelete` instead of standard `ExecuteDelete`
- Verify entity inherits from `BaseAttributesNoKey`

### Performance Issues
- Use bulk operations for large datasets
- Consider adding database indexes on audit columns
