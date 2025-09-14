# PostgreSQL Migration Guide

This document covers the migration from MongoDB to PostgreSQL and provides essential information for working with PostgreSQL in this project.

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Database Schema](#database-schema)
3. [UUID v7 Implementation](#uuid-v7-implementation)
4. [Entity Framework Core Setup](#entity-framework-core-setup)
5. [Development Workflow](#development-workflow)
6. [Common PostgreSQL Commands](#common-postgresql-commands)
7. [Troubleshooting](#troubleshooting)

## Migration Overview

### What Changed

- **Database**: MongoDB → PostgreSQL
- **ID Type**: String ObjectId → UUID v7 (Guid)
- **ORM**: MongoDB Driver → Entity Framework Core
- **Data Access**: Custom Collections → Repository Pattern

### Benefits of PostgreSQL

- **ACID Compliance**: Full transaction support
- **Better Performance**: Optimized for complex queries
- **Rich Data Types**: Arrays, JSON, UUID, etc.
- **SQL Standard**: Standard SQL queries
- **Mature Ecosystem**: Extensive tooling and community

## Database Schema

### Tables Created

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `users` | User accounts | UUID v7 primary key, email verification |
| `sessions` | User sessions | Token-based authentication |
| `tenants` | Multi-tenant support | Tenant isolation |
| `products` | Product catalog | Tenant-scoped products |
| `permissions` | Global permission keys | Staff/tenant/both scope |
| `profiles` | Unified profile system | Staff and tenant profiles |
| `profile_permissions` | Profile → permission mapping | Relational permissions |
| `user_accounts` | Unified account system | Staff and tenant accounts |
| `user_account_profiles` | Account → profile assignments | Replaces array fields |
| `profile_staff` | Staff profiles (legacy) | **DEPRECATED** - use `profiles` |
| `profile_tenant` | Tenant profiles (legacy) | **DEPRECATED** - use `profiles` |
| `user_account_staff` | Staff accounts (legacy) | **DEPRECATED** - use `user_accounts` |
| `user_account_tenant` | Tenant accounts (legacy) | **DEPRECATED** - use `user_accounts` |

### Schema Features

- **UUID v7 Primary Keys**: All tables use time-ordered UUIDs
- **Audit Fields**: `created_at`, `updated_at`, `is_deleted` on all entities
- **Multi-tenancy**: Foreign key relationships for tenant isolation
- **Unified Permission System**: Single source of truth for all permissions
- **Relational Design**: No array fields - proper foreign key relationships
- **Scope-based Permissions**: Staff, tenant, or both permission scopes
- **Proper Indexing**: Foreign key indexes for performance

### New Unified Permission and Account Systems

The new schema replaces array-based permissions and separate account tables with a proper relational design:

```sql
-- Global permissions table
permissions (key, description, scope)
├── scope: 'staff', 'tenant', or 'both'

-- Unified profiles table
profiles (id, tenant_id, name, profile_type)
├── tenant_id: NULL for staff profiles, tenant ID for tenant profiles
├── profile_type: 'staff' or 'tenant'

-- Profile → permission mapping
profile_permissions (profile_id, permission_key)
├── Many-to-many relationship between profiles and permissions

-- Unified accounts table
user_accounts (id, user_id, tenant_id, account_type, hierarchy_level, is_suspended)
├── account_type: 'staff' or 'tenant'
├── tenant_id: NULL for staff accounts, tenant ID for tenant accounts
├── Replaces separate user_account_staff and user_account_tenant tables

-- Account → profile assignments
user_account_profiles (account_id, profile_id)
├── Replaces the ProfileIds array fields
├── Links accounts to their assigned profiles
```

**Benefits:**
- **Single Source of Truth**: All permission keys and account types defined once
- **Type Safety**: Foreign key constraints prevent invalid permissions and account types
- **Flexible**: Staff can have both staff and tenant permissions
- **Unified**: Single account table handles both staff and tenant accounts
- **Queryable**: Easy to find all users with specific permissions or account types
- **Maintainable**: No array manipulation or duplicate table logic in application code
- **Consistent**: Same patterns for both staff and tenant entities

## UUID v7 Implementation

### What is UUID v7?

UUID v7 is a time-ordered UUID that includes:
- **Timestamp**: 48-bit timestamp (milliseconds since Unix epoch)
- **Random Data**: 74 bits of random data
- **Version**: Version 7 identifier
- **Variant**: Standard UUID variant bits

### Benefits

- **Time-Ordered**: Naturally sortable by creation time
- **Globally Unique**: No collision risk across distributed systems
- **No Sequential Exposure**: Better security than auto-incrementing integers
- **Database Agnostic**: Works consistently across different systems

### Usage in Code

```csharp
// Generate new UUID v7
public Guid Id { get; set; } = Guid.CreateVersion7();

// Example UUID v7 format
// 01234567-89ab-7def-0123-456789abcdef
```

## Entity Framework Core Setup

### Local Tools Installation

We use local EF tools instead of global installation:

```bash
# Install EF tools locally (already done)
dotnet tool install dotnet-ef

# Use the tools
dotnet tool run dotnet-ef migrations add MigrationName
dotnet tool run dotnet-ef database update
```

### Why Local Tools?

- **Project Isolation**: Each project can have its own tool versions
- **Team Consistency**: Everyone uses the same tool version
- **CI/CD Friendly**: Build pipelines use exact same tools
- **Version Control**: Tool versions tracked in `.config/dotnet-tools.json`

### Migration Commands

```bash
# Create a new migration
dotnet tool run dotnet-ef migrations add MigrationName

# Apply migrations to database
dotnet tool run dotnet-ef database update

# Remove last migration (if not applied)
dotnet tool run dotnet-ef migrations remove

# Generate SQL script (without applying)
dotnet tool run dotnet-ef migrations script

# Update database to specific migration
dotnet tool run dotnet-ef database update MigrationName
```

## Permission System Migration

### From Array-Based to Relational Permissions

The new unified permission system replaces the old array-based approach:

**Before (Array-based + Separate Tables):**
```csharp
// Old approach - arrays in entities and separate tables
public class ProfileStaff : BaseAttributes
{
    public List<string> Permissions { get; set; } = new();
}

public class UserAccountStaff : BaseAttributes
{
    public List<Guid> ProfileIds { get; set; } = new();
}

public class UserAccountTenant : BaseAttributes
{
    public Guid TenantId { get; set; }
    // Separate table for tenant accounts
}
```

**After (Unified Relational):**
```csharp
// New approach - unified entities with proper relationships
public class Permission : BaseAttributes
{
    public string Key { get; set; }
    public PermissionScope Scope { get; set; }
}

public class UserAccount : BaseAttributes
{
    public Guid UserId { get; set; }
    public Guid TenantId { get; set; }  // NULL for staff accounts
    public AccountType AccountType { get; set; }  // Staff or Tenant
    public AccountHierarchyLevel HierarchyLevel { get; set; }
}

public class ProfilePermission : BaseAttributes
{
    public Guid ProfileId { get; set; }
    public string PermissionKey { get; set; }
}
```

### Migration Steps

Since you started fresh with no existing data, the unified system is already in place:

1. **Database Schema Created:**
   ```bash
   dotnet tool run dotnet-ef database update
   ```
   ✅ **COMPLETED** - Your database now has the unified permission and account system

2. **Next Steps:**
   - Use `PermissionService` for new permission queries
   - Use `PermissionFilterV2` for new authorization logic
   - Create profiles and permissions using the new unified entities

### Migration Complete ✅

**All obsolete classes have been removed and the system is now fully unified:**

- ❌ `ProfileStaff` → ✅ `Profile` with `ProfileType.Staff`
- ❌ `ProfileTenant` → ✅ `Profile` with `ProfileType.Tenant`
- ❌ `UserAccountStaff` → ✅ `UserAccount` with `AccountType.Staff`
- ❌ `UserAccountTenant` → ✅ `UserAccount` with `AccountType.Tenant`

**Database cleanup completed:**
- Obsolete tables removed from database
- All code updated to use unified entities
- Permission system fully migrated to relational design

## Development Workflow

### Setting Up Environment

1. **Install PostgreSQL**:
   ```bash
   # Using Docker (recommended)
   docker run --name postgres-pdfvite \
     -e POSTGRES_PASSWORD=password \
     -e POSTGRES_DB=pdfvite_db \
     -p 5432:5432 \
     -d postgres:15
   ```

2. **Set Environment Variables**:
   Create `.env.local` in `apps/api/`:
   ```
   POSTGRES_CONNECTION_STRING=Host=localhost;Database=pdfvite_db;Username=postgres;Password=password
   FRONT_URL=http://localhost:3000
   ```

3. **Apply Migrations**:
   ```bash
   cd apps/api
   dotnet tool run dotnet-ef database update
   ```

### Making Schema Changes

1. **Modify Entity Models**: Update your C# entity classes
2. **Create Migration**: `dotnet tool run dotnet-ef migrations add DescriptionOfChange`
3. **Review Migration**: Check the generated migration file
4. **Apply Migration**: `dotnet tool run dotnet-ef database update`
5. **Test Changes**: Verify the changes work as expected

### Example: Adding a New Field

```csharp
// 1. Add property to entity
public class User : BaseAttributes, INoTenantEntity
{
    // ... existing properties
    [Column("phone_number")]
    public string? PhoneNumber { get; set; }
}

// 2. Create migration
dotnet tool run dotnet-ef migrations add AddPhoneNumberToUser

// 3. Apply migration
dotnet tool run dotnet-ef database update
```

## Common PostgreSQL Commands

### Connecting to Database

```bash
# Using psql command line
psql -h localhost -U postgres -d pdfvite_db

# Using Docker
docker exec -it postgres-pdfvite psql -U postgres -d pdfvite_db
```

### Useful SQL Queries

```sql
-- List all tables
\dt

-- Describe table structure
\d users

-- List all databases
\l

-- Show current database
SELECT current_database();

-- Show table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Show active connections
SELECT * FROM pg_stat_activity;

-- Show database locks
SELECT * FROM pg_locks;
```

### Backup and Restore

```bash
# Backup database
pg_dump -h localhost -U postgres pdfvite_db > backup.sql

# Restore database
psql -h localhost -U postgres pdfvite_db < backup.sql

# Using Docker
docker exec postgres-pdfvite pg_dump -U postgres pdfvite_db > backup.sql
docker exec -i postgres-pdfvite psql -U postgres pdfvite_db < backup.sql
```

## Troubleshooting

### Common Issues

#### 1. "relation does not exist" Error
```bash
# Solution: Apply migrations
dotnet tool run dotnet-ef database update
```

#### 2. Connection String Issues
```bash
# Check environment variables
echo $POSTGRES_CONNECTION_STRING

# Verify PostgreSQL is running
docker ps | grep postgres
```

#### 3. Migration Conflicts
```bash
# Remove last migration (if not applied)
dotnet tool run dotnet-ef migrations remove

# Or reset database (DESTRUCTIVE)
dotnet tool run dotnet-ef database drop
dotnet tool run dotnet-ef database update
```

#### 4. UUID Generation Issues
```csharp
// Ensure you're using the correct method
public Guid Id { get; set; } = Guid.CreateVersion7(); // ✅ Correct
public Guid Id { get; set; } = Guid.NewGuid();       // ❌ Wrong (UUID v4)
```

### Performance Tips

1. **Use Indexes**: Foreign keys are automatically indexed
2. **Batch Operations**: Use `AddRange()` for multiple inserts
3. **Connection Pooling**: EF Core handles this automatically
4. **Query Optimization**: Use `AsNoTracking()` for read-only queries

### Monitoring

```sql
-- Check slow queries
SELECT query, mean_time, calls
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check table statistics
SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables;
```

## Best Practices

### Entity Design

1. **Always inherit from BaseAttributes**: Provides audit fields
2. **Use proper column names**: Snake_case for database, PascalCase for C#
3. **Implement proper interfaces**: ITenantEntity or INoTenantEntity
4. **Use appropriate data types**: UUID for IDs, proper PostgreSQL types

### Migration Best Practices

1. **Review migrations**: Always check generated SQL before applying
2. **Test migrations**: Test on development data first
3. **Backup before major changes**: Always backup production data
4. **Use descriptive names**: Migration names should describe the change

### Security

1. **Use parameterized queries**: EF Core handles this automatically
2. **Validate input**: Use FluentValidation for DTOs
3. **Use connection strings**: Never hardcode credentials
4. **Enable SSL**: Use SSL connections in production

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Entity Framework Core Documentation](https://docs.microsoft.com/en-us/ef/core/)
- [UUID v7 Specification](https://datatracker.ietf.org/doc/html/draft-ietf-uuidrev-rfc4122bis)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)

---

*This guide was created during the MongoDB to PostgreSQL migration. Keep it updated as the project evolves.*
