# Fix: AuditLog Should Inherit from BaseAttributes

**Issue:** `AuditLog` currently inherits from `BaseAttributesNoKey` and manually defines an `Id` property. This is inconsistent with the project's architecture for Guid primary key entities.

**Date:** November 2, 2025  
**Status:** Needs Fix  
**Priority:** Low (Works but inconsistent)

---

## Background

### Current Architecture Pattern

The project uses **database-generated UUID v7** for all Guid primary keys:

```csharp
// From MainApiDbContext.cs OnModelCreating()
if (typeof(BaseAttributes).IsAssignableFrom(entityType.ClrType)) {
    modelBuilder.Entity(entityType.ClrType)
        .Property("Id")
        .HasDefaultValueSql("uuidv7()");
}
```

### Base Class Usage Rules

**Use `BaseAttributes`:**
- ✅ For entities with **Guid primary key**
- ✅ Database auto-generates UUID v7
- ✅ Examples: `User`, `Tenant`, `Profile`, `UserAccount`, `Invitation`, `SystemNotice`, `Session`

**Use `BaseAttributesNoKey`:**
- ✅ For entities with **non-Guid primary key** (string, composite, etc.)
- ✅ Entity manually defines primary key
- ✅ Example: `Permission` (uses string primary key `[Key] public string Key`)

---

## The Problem

**Current Implementation (Inconsistent):**
```csharp
// apps/api/Src/Features/Staff/Audit/AuditLog.cs
public class AuditLog : BaseAttributesNoKey, INoTenantEntity {
    [Key]
    [Column("id")]
    public Guid Id { get; set; }  // ❌ Manually defined Guid PK
    
    public required Guid UserId { get; set; }
    public required string Action { get; set; }
    // ... rest of properties
}
```

**Why This Is Wrong:**
1. ❌ `AuditLog` has a **Guid primary key** → Should use `BaseAttributes`
2. ❌ Manually defining `Id` bypasses database UUID v7 generation
3. ❌ Inconsistent with other Guid PK entities (User, Tenant, Profile, etc.)
4. ❌ Follows `Permission` pattern (which uses **string PK**, not Guid)

---

## The Fix

**Change `AuditLog` to inherit from `BaseAttributes`:**

### File to Modify
`apps/api/Src/Features/Staff/Audit/AuditLog.cs`

### Changes Required

**REMOVE these lines:**
```csharp
public class AuditLog : BaseAttributesNoKey, INoTenantEntity {
    [Key]
    [Column("id")]
    public Guid Id { get; set; }  // ❌ REMOVE
```

**REPLACE with:**
```csharp
public class AuditLog : BaseAttributes, INoTenantEntity {
    // ✅ Id inherited from BaseAttributes
    // ✅ Database auto-generates UUID v7
```

### Complete Corrected File

```csharp
using MainApi.Src.Data;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using UserEntity = MainApi.Src.Features.Common.User.User;

namespace MainApi.Src.Features.Staff.Audit;

[Table("audit_logs")]
[Index(nameof(UserId), nameof(CreatedAt))]
[Index(nameof(Action), nameof(CreatedAt))]
[Index(nameof(TargetId))]
public class AuditLog : BaseAttributes, INoTenantEntity {  // ✅ CHANGED
    // ✅ REMOVED: [Key] [Column("id")] public Guid Id { get; set; }
    // Id now comes from BaseAttributes (nullable Guid?)
    // Database generates UUID v7 automatically

    [Column("user_id")]
    public required Guid UserId { get; set; }
    [JsonIgnore]
    public UserEntity User { get; set; } = null!;

    [Column("action")]
    public required string Action { get; set; }

    [Column("target_id")]
    public Guid? TargetId { get; set; }

    [Column("details")]
    public string? Details { get; set; }

    [Column("ip_address")]
    public string? IpAddress { get; set; }

    [Column("user_agent")]
    public string? UserAgent { get; set; }
}

public static class AuditActions {
    public const string InvitationCreated = "invitation.created";
    public const string InvitationAccepted = "invitation.accepted";
    public const string InvitationRevoked = "invitation.revoked";
    public const string TenantSuspended = "tenant.suspended";
    public const string TenantReactivated = "tenant.reactivated";
    public const string ImpersonationStarted = "impersonation.started";
    public const string ImpersonationEnded = "impersonation.ended";
    public const string LoginSucceeded = "auth.login.succeeded";
    public const string LoginFailed = "auth.login.failed";
    public const string SystemNoticeCreated = "system.notice.created";
    public const string SystemNoticeUpdated = "system.notice.updated";
}
```

---

## Rationale

### Why BaseAttributes is Correct

1. **Consistency**: All other Guid PK entities use `BaseAttributes`
   - User, Tenant, Profile, UserAccount, Invitation, SystemNotice, Session
   
2. **Database-Generated IDs**: Architecture delegates ID generation to PostgreSQL
   - UUID v7 provides timestamp-ordered IDs (better than GUID.NewGuid())
   - No need to generate IDs in application code
   
3. **Nullable Guid? is Intentional**: 
   - `null` before entity is saved to database
   - Database fills with UUID v7 on INSERT
   - Application checks `entity.IsNew()` to determine if persisted

### Why Permission Uses BaseAttributesNoKey

`Permission` is the **exception**, not the rule:
```csharp
public class Permission : BaseAttributesNoKey {
    [Key]
    [Column("key")]
    public string Key { get; set; }  // STRING primary key
}
```

Permission uses a **string** as primary key (e.g., `"staff:invitation.create"`), so it can't use the automatic UUID v7 generation that only works with Guid columns.

---

## Impact Assessment

**Breaking Changes:** None  
**Migration Required:** No (only affects application code, not database schema)  
**Risk Level:** Very Low

**Why Safe:**
- Database schema remains unchanged (still has `id uuid` column)
- Existing data not affected
- Only changes how application code defines the entity
- UUID v7 generation will work correctly after fix

---

## Implementation Steps

1. **Modify the file:**
   - Open `apps/api/Src/Features/Staff/Audit/AuditLog.cs`
   - Change `BaseAttributesNoKey` to `BaseAttributes`
   - Remove the manual `[Key] [Column("id")] public Guid Id { get; set; }` line
   - Remove unused `using System.ComponentModel.DataAnnotations;` if present

2. **Verify compilation:**
   ```bash
   make build-api
   ```

3. **Check for any service code that depends on manual Id:**
   ```bash
   # Search for direct Id assignments in AuditLogService
   # There shouldn't be any - database generates the Id
   ```

4. **Update staged changes:**
   ```bash
   git add apps/api/Src/Features/Staff/Audit/AuditLog.cs
   ```

5. **Amend the commit (if Phase 2 already committed):**
   ```bash
   git commit --amend --no-edit
   ```
   
   Or create a new commit:
   ```bash
   git commit -m "fix(audit): change AuditLog to inherit from BaseAttributes
   
   - Use BaseAttributes instead of BaseAttributesNoKey for consistency
   - Remove manual Id property to leverage database UUID v7 generation
   - Aligns with architecture pattern for Guid primary key entities"
   ```

---

## Verification

**After making the change, verify:**

1. **Code compiles successfully:**
   ```bash
   make build-api
   # Should succeed with no errors
   ```

2. **AuditLog follows same pattern as other entities:**
   ```bash
   # Compare with similar entities
   # User, Tenant, Profile, Invitation, SystemNotice all use BaseAttributes
   ```

3. **No references to manual Id assignment:**
   ```bash
   # In AuditLogService.cs, ensure no code like:
   # auditLog.Id = Guid.NewGuid();  // ❌ Should not exist
   ```

---

## Reference: Base Class Comparison

```csharp
// BaseAttributesNoKey - Use for NON-Guid primary keys
public class BaseAttributesNoKey {
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    // ⚠️ NO Id property
}

// BaseAttributes - Use for Guid primary keys
public class BaseAttributes : BaseAttributesNoKey {
    [Key]
    [Column("id")]
    public Guid? Id { get; set; }  // Nullable: null before save, DB fills it
    
    public bool IsNew() => Id is null || Id == Guid.Empty;
    public Guid GetRequiredId() { /* throws if null */ }
}
```

---

## Summary

**Current State:** ❌ `AuditLog` uses `BaseAttributesNoKey` + manual Guid Id  
**Desired State:** ✅ `AuditLog` uses `BaseAttributes` (Id auto-generated by DB)  
**Reason:** Consistency with architecture pattern for Guid primary key entities  
**Effort:** Minimal (2-line change)  
**Risk:** Very Low (no database changes)

---

## Questions?

If you have questions about this change:
- Review `apps/api/Src/Data/BaseAttributes.cs` for base class definitions
- Review `apps/api/Src/Data/DbContext/MainApiDbContext.cs` for UUID v7 configuration
- Compare with other entities: `User.cs`, `Tenant.cs`, `Profile.cs`, `Invitation.cs`
- Compare with `Permission.cs` to see the exception (string PK)

---

**End of Document**
