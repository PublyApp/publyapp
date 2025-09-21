# Database Migration and Seeding Deployment Guide

This document outlines the industry-standard approaches for applying migrations and seeds to production databases in the PDFVite application.

## 🎯 **Industry Standard Approaches**

### **1. SQL Scripts (Most Common)**

Generate idempotent migration scripts that can be safely applied to production:

```bash
# Generate idempotent migration script
dotnet ef migrations script --idempotent -o production-migration.sql

# Generate script from specific migration to latest
dotnet ef migrations script 20240101000000_InitialCreate --idempotent -o migration.sql
```

**Benefits:**

- ✅ DBA can review before execution
- ✅ Version controlled
- ✅ Can be tested in staging first
- ✅ Idempotent (safe to run multiple times)

### **2. Migration Bundles (EF Core 6+)**

Create self-contained executables for environments without .NET SDK:

```bash
# Create self-contained executable
dotnet ef migrations bundle --self-contained --target-runtime linux-x64

# Deploy and run
./efbundle.exe --connection "YourProductionConnectionString"
```

**Benefits:**

- ✅ No .NET SDK required on production server
- ✅ Self-contained executable
- ✅ Can include custom logic

### **3. CI/CD Pipeline Integration**

Example GitHub Actions / Azure DevOps workflow:

```yaml
# Example CI/CD Pipeline
- name: Generate Migration Script
  run: dotnet ef migrations script --idempotent -o migration.sql

- name: Deploy to Staging
  run: |
    # Apply to staging first
    sqlcmd -S staging-server -d database -i migration.sql

- name: Deploy to Production
  run: |
    # Apply to production after staging validation
    sqlcmd -S prod-server -d database -i migration.sql
```

## 🚫 **What NOT to Do in Production**

### **Avoid Runtime Migrations**

```csharp
// ❌ DON'T do this in production
protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
{
    // This can cause concurrency issues in load-balanced environments
    optionsBuilder.UseSeeding((context, _) => {
        context.Database.Migrate(); // Dangerous!
    });
}
```

**Risks:**

- **Concurrency Issues**: Multiple instances might attempt to apply migrations simultaneously
- **Error Handling**: Failures during migration can lead to application downtime
- **Security Concerns**: Application requires elevated database permissions

## 🎯 **Recommended Production Workflow**

### **For PDFVite Application:**

#### **1. Development Phase:**

```bash
# Create migrations locally
dotnet ef migrations add AddNewFeature
dotnet ef database update
```

#### **2. Staging Deployment:**

```bash
# Generate script for staging
dotnet ef migrations script --idempotent -o staging-migration.sql

# Apply to staging
sqlcmd -S staging-server -d pdfvite_staging -i staging-migration.sql
```

#### **3. Production Deployment:**

```bash
# Generate final script
dotnet ef migrations script --idempotent -o production-migration.sql

# Review with DBA/team
# Apply during maintenance window
sqlcmd -S prod-server -d pdfvite_prod -i production-migration.sql
```

## 🔧 **Seeding Implementation**

### **Current Implementation**

Our `Seeder` class uses EF Core's `UseSeeding`/`UseAsyncSeeding` methods:

```csharp
// In MainApiDbContext.cs
optionsBuilder.UseSeeding((context, _) => {
    var dbContext = (MainApiDbContext)context;
    Seeder.SeedAll(dbContext);
});

optionsBuilder.UseAsyncSeeding(async (context, _, cancellationToken) => {
    var dbContext = (MainApiDbContext)context;
    await Seeder.SeedAllAsync(dbContext);
});
```

### **Seeding Behavior**

Seeding happens automatically when:

- Database is created (`EnsureCreated`)
- Migrations are applied
- `dotnet ef database update` is run

**For Production:**

- ✅ Seeding happens automatically with migrations
- ✅ No additional deployment steps needed
- ✅ Idempotent (checks for existing data before inserting)

## 📋 **Best Practices Summary**

### **Migration Best Practices:**

1. **Never use `context.Database.Migrate()` in production code**
2. **Always generate and review SQL scripts before production**
3. **Test migrations in staging environment first**
4. **Use idempotent scripts for safety**
5. **Integrate with CI/CD pipelines**
6. **Have rollback plans ready**
7. **Schedule migrations during maintenance windows**
8. **Monitor database performance during/after migrations**

### **Seeding Best Practices:**

1. **Use `UseSeeding`/`UseAsyncSeeding` for automatic seeding**
2. **Implement both sync and async versions (as we do)**
3. **Check for existing data before inserting (idempotent)**
4. **Keep seeding logic separate from business logic**
5. **Use meaningful seed data for development/testing**

## 🚀 **Deployment Checklist**

### **Pre-Deployment:**

- [ ] Generate migration script with `--idempotent` flag
- [ ] Review generated SQL script
- [ ] Test migration in staging environment
- [ ] Verify seeding works correctly
- [ ] Prepare rollback plan

### **During Deployment:**

- [ ] Schedule maintenance window
- [ ] Backup production database
- [ ] Apply migration script
- [ ] Verify application functionality
- [ ] Monitor database performance

### **Post-Deployment:**

- [ ] Run smoke tests
- [ ] Monitor application logs
- [ ] Verify all features work correctly
- [ ] Update deployment documentation

## 🔄 **Rollback Strategy**

### **Migration Rollback:**

```bash
# Generate rollback script
dotnet ef migrations script 20240101000000_PreviousMigration --idempotent -o rollback.sql

# Apply rollback
sqlcmd -S prod-server -d pdfvite_prod -i rollback.sql
```

### **Seeding Rollback:**

Since our seeding is idempotent, it's generally safe to re-run. However, for data that needs to be removed:

```csharp
// Add cleanup methods to Seeder class if needed
public static async Task CleanupSeedDataAsync(MainApiDbContext dbContext)
{
    // Remove specific seed data if necessary
    var seedUsers = await dbContext.User
        .Where(u => u.Email.Contains("@example.com"))
        .ToListAsync();

    dbContext.User.RemoveRange(seedUsers);
    await dbContext.SaveChangesAsync();
}
```

## 📚 **Additional Resources**

- [EF Core Migrations Documentation](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
- [EF Core Data Seeding Documentation](https://learn.microsoft.com/en-us/ef/core/modeling/data-seeding)
- [EF Core Production Considerations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying)

## 🏷️ **Version History**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-21 | Initial documentation created |
