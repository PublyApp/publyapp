# Staff MVP Week 1: Revised Implementation Plan (Pragmatic Approach)

> Note (2026-01): This plan predates the RFC 7807 ProblemDetails migration. Any error-response examples using `ApiResponse`, `JsonHttpResult<ApiResponse>`, or `.ProducesApiResponses(...)` should be updated to `TypedProblems.*` + `App*HttpResult` (validation errors are `422` `ValidationProblemDetails`).

**Document Version:** 3.2 (Complete Vertical Slice with Full Frontend)
**Date:** November 5, 2025
**Status:** READY FOR IMPLEMENTATION (Frontend Included in Week 1)
**Estimated Time:** 19-26 hours (~3-4 focused work days)
**Review Status:** ✅ Updated to include complete frontend implementation in Week 1

---

## 🤖 Instructions for AI Coding Assistants

**CRITICAL:** Before implementing ANY code in this plan:

1. **Read the coding guidelines:**
   - Review `CLAUDE.md` in the project root
   - Review C# coding rules in `AGENTS.md`:
     - Null checking: Use `is`/`is not` patterns
     - LINQ queries: Use query syntax for DB queries
     - `csharp-async.mdc` - Async/await best practices
   - Follow ALL conventions specified in these documents

2. **Understand the existing architecture:**
   - This project uses Vertical Slice Architecture
   - Profile system = Role system (DO NOT create separate role tables)
   - Session system already exists (extend it, don't duplicate)
   - EF Core 9 with automatic seeding via `IEntitySeeder`

3. **Coding standards (from CLAUDE.md):**
   - Use `is`/`is not` for null checks (NEVER `==`/`!=`)
   - Use LINQ query syntax for database queries (NOT method syntax)
   - Always add `CancellationToken` parameters to async methods
   - **CRITICAL: Base class selection**
     - Use `BaseAttributes` for entities with **Guid primary key** (database auto-generates UUID v7)
     - Use `BaseAttributesNoKey` for entities with **non-Guid primary key** (string, composite, etc.)
     - Example: AuditLog uses `BaseAttributes` (Guid PK), Permission uses `BaseAttributesNoKey` (string PK)
   - Implement correct tenant interface: `ITenantEntity`, `IOptionalTenantEntity`, or `INoTenantEntity`

4. **After making changes:**
   - Run `make check-write` for linting/formatting
   - Run `make tsc-front` for TypeScript checks
   - Run `make generate-client` after API changes
   - Test migrations with `make db-migrate`

5. **Ask before:**
   - Adding new packages/dependencies
   - Changing existing entity structures
   - Modifying authentication flows

---

## Executive Summary

This simplified plan respects the existing architecture and follows minimal seeding principles:

**✅ INCLUDE:**
1. **Unified Invitation system** - Single table with scope discriminator (Staff/Tenant/Project)
2. **Owner bootstrap** - Extend existing seeders (UserSeeder + UserAccountSeeder)
3. **Simplified Audit Logging** - Generic, flexible tracking system
4. **Session-based Impersonation** - Extend existing Session entity
5. **System Notices** - Operational alerts/banners
6. **Staff Profile creation** - Structure only (no assignments in seeders)

**❌ EXCLUDE:**
7. ~~StaffRoleAssignment~~ - Use existing Profile system
8. ~~StaffImpersonationToken~~ - Extend Session instead
9. ~~OwnerSeeder~~ - Extend existing seeders instead
10. ~~UserAccountProfileSeeder~~ - No relationship seeding (runtime only)
11. ~~StaffInvitation~~ - Use generic Invitation table with scope instead

**⏭️ DEFER:**
11. Magic-link authentication (use password login for now)
12. Unit testing infrastructure (add in Week 2)

**Key Principle:** Seed structure, not relationships. Owner gets `AccountLevel.Admin` which bypasses permissions anyway.

---

## Architecture Decisions

**Key Architectural Principles:**
1. **Minimal Seeding** - Seed structure, not relationships
2. **Unified Entity Pattern** - Single table with scope discriminator (Profile, UserAccount, Invitation)
3. **Database-Generated IDs** - PostgreSQL UUID v7 for all Guid primary keys
4. **Session Extension** - Extend existing Session for impersonation (no new table)
5. **Generic Audit Logging** - String-based actions for flexibility

### Decision 0: Minimal Seeding Principle ✅

**Rationale:** Seeders create operational necessities, not example data or relationships.

**What to seed:**
- ✅ Structure: Entities needed for the app to function
- ✅ Owner account: Required for production access
- ✅ Profiles: Options for UI dropdowns

**What NOT to seed:**
- ❌ Relationships: UserAccountProfile assignments
- ❌ Example data: Dev/test accounts handled separately
- ❌ Permissions: Admin level bypasses checks anyway

**Key insight:** Owner with `AccountLevel.Admin` bypasses permission checks, so profile assignment is unnecessary overhead.

### Decision 1: Use Profile System for Staff Roles ✅

**Rationale:** Project already has sophisticated RBAC via `Profile` + `ProfilePermission` + `UserAccountProfile`.

**Implementation:**
- Create staff profiles during seeding: "Staff Owner", "Staff Admin", "Staff Support" (structure only)
- Profile assignments happen at runtime when inviting staff
- Query staff roles: `JOIN UserAccountProfile -> Profile`
- Owner bypasses this entirely with `AccountLevel.Admin`

**Benefits:**
- Consistent authorization across all scopes (Staff/Tenant/Project)
- Reuse existing permission system
- No duplicate role tables
- Seeders stay minimal and focused

### Decision 2: Extend Session for Impersonation ✅

**Rationale:** Session entity already tracks user sessions - just add impersonation metadata.

**Implementation:**
- Add fields to `Session`: `IsImpersonation`, `ImpersonatingStaffUserId`, `ImpersonationReason`, `ImpersonationExpiresAt`
- Reuse existing session expiration logic
- Filter sessions by `IsImpersonation` flag

**Benefits:**
- No new table
- Automatic cleanup via session management
- Simpler queries

### Decision 3: Simplified Audit Logging ✅

**Rationale:** Complex `StaffAuditEntry` with enums is over-engineered. Start simple.

**Implementation:**
- Generic `AuditLog` entity with string-based actions
- JSON metadata for flexibility
- Can enhance with enums later if needed

**Benefits:**
- Faster to implement
- More flexible (add new actions without migrations)
- Good enough for MVP

### Decision 4: Unified Invitation Table ✅

**Rationale:** Follow existing architectural pattern of single table with scope discriminator.

**Implementation:**
- Single `Invitation` entity with `InvitationScope` enum (Staff/Tenant/Project)
- Implements `IOptionalTenantEntity` (like UserAccount)
- Validation method ensures scope constraints (like UserAccount.ValidateAccountType())
- Token-based invite acceptance
- Revocable before acceptance

**Benefits:**
- ✅ Consistent with UserAccount and Profile patterns
- ✅ Future-proof for tenant/project invitations
- ✅ Single InvitationService handles all scopes
- ✅ No duplicate tables or logic per scope
- ✅ Control who can become staff (audit trail)
- ✅ Can revoke invite before acceptance

**Follows principle:** One logical entity = One table with scope discriminator

### Decision 5: Database-Generated UUID v7 Primary Keys ✅

**Rationale:** Delegate ID generation to PostgreSQL for consistency and performance.

**Architecture:**
```csharp
// MainApiDbContext.OnModelCreating()
if (typeof(BaseAttributes).IsAssignableFrom(entityType.ClrType)) {
    modelBuilder.Entity(entityType.ClrType)
        .Property("Id")
        .HasDefaultValueSql("uuidv7()");  // Database generates UUID v7
}
```

**Base Class Selection Rules:**

| Use Case | Base Class | Primary Key | Example Entities |
|----------|------------|-------------|------------------|
| **Guid PK** | `BaseAttributes` | `Guid?` (nullable, DB fills) | User, Tenant, Profile, Invitation, AuditLog, SystemNotice |
| **Non-Guid PK** | `BaseAttributesNoKey` + manual PK | String, composite, etc. | Permission (`string Key`) |

**Why nullable Guid?:**
- `null` indicates entity hasn't been saved yet (call `entity.IsNew()`)
- Database fills with UUID v7 on INSERT
- UUID v7 provides timestamp-ordered IDs (better than random GUIDs)

**Implementation Pattern:**
```csharp
// ✅ CORRECT - Guid primary key
public class AuditLog : BaseAttributes, INoTenantEntity {
    // Id inherited from BaseAttributes (Guid?)
    // Database auto-generates UUID v7
}

// ✅ CORRECT - Non-Guid primary key
public class Permission : BaseAttributesNoKey, INoTenantEntity {
    [Key]
    public string Key { get; set; }  // Manual string PK
}

// ❌ WRONG - Don't manually define Guid Id for BaseAttributes entities
public class SomeEntity : BaseAttributesNoKey {
    [Key]
    public Guid Id { get; set; }  // Bypasses UUID v7 generation
}
```

**Benefits:**
- ✅ Consistent ID generation across all entities
- ✅ Timestamp-ordered UUIDs improve database performance
- ✅ No application code needed to generate IDs
- ✅ Database guarantees uniqueness

---

## Week 1 Implementation Tasks

### Phase 1: Environment & Seeding Setup (1.5 hours)

**Approach:** Extend existing seeders rather than creating new ones. Owner is just another user with Admin level - no special treatment needed beyond reading from environment variables.

#### Task 1.1: Add Environment Variables

**File:** `.env.development`

Add to end of file:
```bash
# Staff Owner Bootstrap
STAFF_OWNER_EMAIL=owner@publyapp.local
# Note: STAFF_OWNER_BOOTSTRAP_CODE is for production use, not development seeding
# Development seeding uses a fixed password for convenience
STAFF_OWNER_BOOTSTRAP_CODE=ChangeMe123!@3#lol
```

**File:** `.env.production` (if exists, otherwise document for deployment)

Add:
```bash
# Staff Owner Bootstrap (CHANGE THESE IN PRODUCTION!)
# The Owner account will be created during database seeding
# STAFF_OWNER_BOOTSTRAP_CODE can be used for first-time password reset (future feature)
STAFF_OWNER_EMAIL=owner@yourdomain.com
STAFF_OWNER_BOOTSTRAP_CODE=<generate-secure-random-string>
```

**Important:** The `STAFF_OWNER_BOOTSTRAP_CODE` is defined for future use (e.g., password reset on first login). Currently, development seeding uses a fixed password for convenience. In production, you should implement a secure password reset mechanism using this code.

**File:** `apps/api/Src/Lib/AppEnvironment.cs`

Add properties:
```csharp
public static string STAFF_OWNER_EMAIL => GetRequiredEnvVar("STAFF_OWNER_EMAIL");
public static string STAFF_OWNER_BOOTSTRAP_CODE => GetRequiredEnvVar("STAFF_OWNER_BOOTSTRAP_CODE");
```

#### Task 1.2: Extend UserSeeder to Include Owner

**File:** `apps/api/Src/Features/Common/User/UserSeeder.cs`

**Modify the existing `SeedAsync` method** to include Owner from environment:

```csharp
public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
    var seedPassword = GetSeedPassword();

    // Seed all users (staff and tenant users)
    var allUsers = new List<(string Email, UserStatus Status, string? FirstName, string? LastName)>();

    // ADDED: Owner from environment (production-critical)
    var ownerEmail = AppEnvironment.STAFF_OWNER_EMAIL;
    if (!string.IsNullOrEmpty(ownerEmail)) {
        allUsers.Add((ownerEmail, UserStatus.Active, "Platform", "Owner"));
    }

    // Existing example users (dev/testing)
    allUsers.AddRange(new[] {
        // Staff users
        ("staff-admin@example.com", UserStatus.Active, "Staff", "Admin"),
        ("staff-user@example.com", UserStatus.Active, "Staff", "User"),
        // Tenant users
        ("admin-acme@example.com", UserStatus.Active, "Admin", "Acme"),
        ("user-acme@example.com", UserStatus.Active, "User", "Acme"),
        // ... rest of existing users
    });

    // Rest of existing logic remains unchanged...
    var existingUserEmailsQuery =
        from u in dbContext.User
        where allUsers.Select(au => au.Email).Contains(u.Email)
        select u.Email;

    // ... continue with existing implementation
}
```

#### Task 1.3: Extend UserAccountSeeder to Include Owner Account

**File:** `apps/api/Src/Features/Common/Account/UserAccountSeeder.cs`

**Modify the existing `SeedAsync` method** to create Owner account:

```csharp
public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
    // Define staff accounts to create
    var staffAccountsData = new List<(string Email, AccountLevel Level)>();

    // ADDED: Owner account from environment (production-critical)
    var ownerEmail = AppEnvironment.STAFF_OWNER_EMAIL;
    if (!string.IsNullOrEmpty(ownerEmail)) {
        staffAccountsData.Add((ownerEmail, AccountLevel.Admin));
    }

    // Existing example accounts (dev/testing)
    staffAccountsData.AddRange(new[] {
        ("staff-admin@example.com", AccountLevel.Admin),
        ("staff-user@example.com", AccountLevel.User)
    });

    // Rest of existing logic remains unchanged...
    var staffEmails = staffAccountsData.Select(sa => sa.Email).ToList();

    // ... continue with existing implementation
}
```

**Note:** Add using statement at top of file if not present:
```csharp
using MainApi.Src.Lib;
```

#### Task 1.4: Create Staff Profiles Seeder

**File:** `apps/api/Src/Features/Staff/StaffProfileSeeder.cs`

**IMPORTANT:** This seeder only creates profile records for UI selection. It does NOT assign profiles to any users. Profile assignments happen at runtime when inviting staff or through manual assignment.

```csharp
using System.Data;
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Profile;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff;

/// <summary>
/// Seeds Staff profiles (Owner, Admin, Support) for use in UI dropdowns and future assignments.
/// DOES NOT assign profiles to users - assignments happen at runtime.
/// </summary>
public class StaffProfileSeeder : IEntitySeeder {
    private readonly ILogger<StaffProfileSeeder> _logger;

    public StaffProfileSeeder(ILogger<StaffProfileSeeder>? logger = null) {
        _logger = logger ?? CreateDefaultLogger();
    }

    private static ILogger<StaffProfileSeeder> CreateDefaultLogger() {
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        return loggerFactory.CreateLogger<StaffProfileSeeder>();
    }

    public int Order => 35;  // After PermissionSeeder (33), before UserAccountSeeder (40)

    public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
        // Define staff profiles (structure only, no assignments)
        var staffProfiles = new List<(string Name, string Description, int DisplayOrder)> {
            ("Staff Owner", "Platform owner with full system access", 100),
            ("Staff Admin", "Platform administrator with management access", 50),
            ("Staff Support", "Support team with limited access", 10)
        };

        // Check existing profiles
        var profileNames = staffProfiles.Select(p => p.Name).ToList();
        var existingProfilesQuery =
            from p in dbContext.Profile
            where profileNames.Contains(p.Name) && p.ProfileScope == ProfileScope.Staff
            select p.Name;
        var existingProfileNames = await existingProfilesQuery.ToListAsync(cancellationToken);

        // Create new profiles
        var newProfiles = staffProfiles
            .Where(sp => !existingProfileNames.Contains(sp.Name))
            .Select(sp => new Profile {
                Name = sp.Name,
                Description = sp.Description,
                ProfileScope = ProfileScope.Staff,
                TenantId = null,
                ProjectId = null,
                DisplayOrder = sp.DisplayOrder
            })
            .ToList();

        if (newProfiles.Count == 0) {
            _logger.LogInformation("Staff profiles already exist; skipping creation.");
            return;
        }

        // Use transaction if not already in one
        var existingTransaction = dbContext.Database.CurrentTransaction;
        var shouldManageTransaction = existingTransaction is null;

        if (shouldManageTransaction) {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            try {
                await dbContext.Profile.AddRangeAsync(newProfiles, cancellationToken);
                await dbContext.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                _logger.LogInformation("Seeded {Count} staff profiles (structure only, no assignments).", newProfiles.Count);
            } catch (Exception) {
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        } else {
            await dbContext.Profile.AddRangeAsync(newProfiles, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Seeded {Count} staff profiles (structure only, no assignments).", newProfiles.Count);
        }

        // NOTE: Permissions can be assigned to profiles in a future seeder if needed
        // For now, AccountLevel.Admin bypasses permission checks anyway
    }
}
```

**Key Points:**
- Owner user gets `AccountLevel.Admin` which bypasses permission checks
- Profile assignment happens at runtime when creating staff via invitations
- Seeders follow principle: create structure, not relationships

---

### Phase 2: New Entities (3-4 hours)

#### Task 2.1: Create Invitation Entity (Unified, Scope-Based)

**Directory:** `apps/api/Src/Features/Common/Invitation/`

**File:** `apps/api/Src/Features/Common/Invitation/Invitation.cs`

**IMPORTANT:** This follows the same pattern as `UserAccount` and `Profile` - single table with scope discriminator.

```csharp
using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Invitation;

/// <summary>
/// Unified invitation table for all scopes (Staff, Tenant, Project).
/// Follows the same pattern as UserAccount and Profile.
/// </summary>
[Table("invitations")]
[Index(nameof(Email), nameof(Scope), nameof(IsAccepted))]
[Index(nameof(InvitedByUserId))]
[Index(nameof(ExpiresAt))]
[Index(nameof(TenantId), nameof(Scope))]
public class Invitation : BaseAttributes, IOptionalTenantEntity {
    [Column("email")]
    public required string Email { get; set; }

    [Column("scope")]
    public InvitationScope Scope { get; set; } = InvitationScope.Tenant;

    [Column("tenant_id")]
    public Guid? TenantId { get; set; }  // Nullable for staff invitations
    [JsonIgnore]
    public Tenant.Tenant? Tenant { get; set; }

    [Column("project_id")]
    public Guid? ProjectId { get; set; }  // Nullable for staff/tenant invitations
    [JsonIgnore]
    public Project.Project? Project { get; set; }

    [Column("token_hash")]
    public required string TokenHash { get; set; }

    [Column("expires_at")]
    public required DateTime ExpiresAt { get; set; }

    [Column("is_accepted")]
    public bool IsAccepted { get; set; } = false;

    [Column("accepted_at")]
    public DateTime? AcceptedAt { get; set; }

    [Column("is_revoked")]
    public bool IsRevoked { get; set; } = false;

    [Column("revoked_at")]
    public DateTime? RevokedAt { get; set; }

    [Column("invited_by_user_id")]
    public required Guid InvitedByUserId { get; set; }

    [JsonIgnore]
    public User.User InvitedByUser { get; set; } = null!;

    [Column("profile_id")]
    public required Guid ProfileId { get; set; }  // Profile already has scope

    [JsonIgnore]
    public Profile.Profile Profile { get; set; } = null!;

    // Computed properties for easy identification (like UserAccount)
    public bool IsStaffInvitation => Scope == InvitationScope.Staff && TenantId == null && ProjectId == null;
    public bool IsTenantInvitation => Scope == InvitationScope.Tenant && TenantId != null && ProjectId == null;
    public bool IsProjectInvitation => Scope == InvitationScope.Project && TenantId != null && ProjectId != null;

    // Factory methods for type-safe creation (like UserAccount)
    public static Invitation CreateStaffInvitation(string email, Guid profileId, Guid invitedByUserId, DateTime expiresAt, string tokenHash) {
        return new Invitation {
            Email = email.ToLowerInvariant(),
            Scope = InvitationScope.Staff,
            TenantId = null,
            ProjectId = null,
            ProfileId = profileId,
            InvitedByUserId = invitedByUserId,
            ExpiresAt = expiresAt,
            TokenHash = tokenHash
        };
    }

    public static Invitation CreateTenantInvitation(string email, Guid tenantId, Guid profileId, Guid invitedByUserId, DateTime expiresAt, string tokenHash) {
        return new Invitation {
            Email = email.ToLowerInvariant(),
            Scope = InvitationScope.Tenant,
            TenantId = tenantId,
            ProjectId = null,
            ProfileId = profileId,
            InvitedByUserId = invitedByUserId,
            ExpiresAt = expiresAt,
            TokenHash = tokenHash
        };
    }

    public static Invitation CreateProjectInvitation(string email, Guid tenantId, Guid projectId, Guid profileId, Guid invitedByUserId, DateTime expiresAt, string tokenHash) {
        return new Invitation {
            Email = email.ToLowerInvariant(),
            Scope = InvitationScope.Project,
            TenantId = tenantId,
            ProjectId = projectId,
            ProfileId = profileId,
            InvitedByUserId = invitedByUserId,
            ExpiresAt = expiresAt,
            TokenHash = tokenHash
        };
    }

    // Validation (like UserAccount.ValidateAccountType)
    public void ValidateInvitationType() {
        switch (Scope) {
            case InvitationScope.Staff:
                if (TenantId != null || ProjectId != null) {
                    throw new InvalidOperationException("Staff invitations cannot have TenantId or ProjectId");
                }
                break;
            case InvitationScope.Tenant:
                if (TenantId == null || ProjectId != null) {
                    throw new InvalidOperationException("Tenant invitations must have TenantId but not ProjectId");
                }
                break;
            case InvitationScope.Project:
                if (TenantId == null || ProjectId == null) {
                    throw new InvalidOperationException("Project invitations must have both TenantId and ProjectId");
                }
                break;
        }
    }

    /// <summary>
    /// Check if invitation is valid for acceptance.
    /// </summary>
    public bool CanBeAccepted() {
        return !IsAccepted
               && !IsRevoked
               && !IsDeleted
               && ExpiresAt > DateTime.UtcNow;
    }
}

public enum InvitationScope {
    Staff = 0,
    Tenant = 1,
    Project = 2
}
```

#### Task 2.2: Create AuditLog Entity

**Directory:** `apps/api/Src/Features/Staff/Audit/`

**File:** `apps/api/Src/Features/Staff/Audit/AuditLog.cs`

**IMPORTANT - Base Class Selection:**

This project uses **database-generated UUID v7** for all Guid primary keys (configured in `MainApiDbContext.OnModelCreating()`). Follow these rules:

- ✅ **Use `BaseAttributes`**: For entities with **Guid primary key** (database auto-generates UUID v7)
  - Examples: User, Tenant, Profile, Invitation, SystemNotice, Session, **AuditLog**

- ✅ **Use `BaseAttributesNoKey`**: For entities with **non-Guid primary key** (string, composite, etc.)
  - Example: Permission (uses string primary key: `public string Key`)

**Why AuditLog uses BaseAttributes:**
- AuditLog has a Guid primary key → Should use `BaseAttributes`
- Database automatically generates UUID v7 on INSERT
- The nullable `Guid?` in BaseAttributes is intentional (null before save, DB fills it)
- Consistent with all other Guid PK entities in the codebase

```csharp
using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Staff.Audit;

/// <summary>
/// Generic audit log for tracking staff actions.
/// Uses BaseAttributes for automatic Guid primary key (database-generated UUID v7).
/// </summary>
[Table("audit_logs")]
[Index(nameof(UserId), nameof(CreatedAt))]
[Index(nameof(Action), nameof(CreatedAt))]
[Index(nameof(TargetId))]
public class AuditLog : BaseAttributes, INoTenantEntity {
    // Id inherited from BaseAttributes (Guid? - database generates UUID v7)

    [Column("user_id")]
    public required Guid UserId { get; set; }

    [JsonIgnore]
    public User.User User { get; set; } = null!;

    [Column("action")]
    public required string Action { get; set; }  // e.g., "tenant.suspend", "invitation.create"

    [Column("target_id")]
    public Guid? TargetId { get; set; }  // Optional: ID of affected entity

    [Column("details")]
    public string? Details { get; set; }  // JSON metadata

    [Column("ip_address")]
    public string? IpAddress { get; set; }

    [Column("user_agent")]
    public string? UserAgent { get; set; }
}

/// <summary>
/// Common action constants for consistency.
/// </summary>
public static class AuditActions {
    // Invitation actions
    public const string InvitationCreated = "invitation.created";
    public const string InvitationAccepted = "invitation.accepted";
    public const string InvitationRevoked = "invitation.revoked";

    // Tenant actions
    public const string TenantSuspended = "tenant.suspended";
    public const string TenantReactivated = "tenant.reactivated";

    // Impersonation actions
    public const string ImpersonationStarted = "impersonation.started";
    public const string ImpersonationEnded = "impersonation.ended";

    // Auth actions
    public const string LoginSucceeded = "auth.login.succeeded";
    public const string LoginFailed = "auth.login.failed";

    // System actions
    public const string SystemNoticeCreated = "system.notice.created";
    public const string SystemNoticeUpdated = "system.notice.updated";
}
```

#### Task 2.3: Create SystemNotice Entity

**Directory:** `apps/api/Src/Features/Staff/Notice/`

**File:** `apps/api/Src/Features/Staff/Notice/SystemNotice.cs`

```csharp
using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Staff.Notice;

/// <summary>
/// System-wide notices/alerts displayed to staff members.
/// </summary>
[Table("system_notices")]
[Index(nameof(StartsAt), nameof(ExpiresAt))]
[Index(nameof(Severity))]
public class SystemNotice : BaseAttributes, INoTenantEntity {
    [Column("severity")]
    public required NoticeSeverity Severity { get; set; }

    [Column("title")]
    public required string Title { get; set; }

    [Column("message")]
    public required string Message { get; set; }

    [Column("starts_at")]
    public required DateTime StartsAt { get; set; }

    [Column("expires_at")]
    public DateTime? ExpiresAt { get; set; }  // Null = never expires

    [Column("created_by_staff_id")]
    public required Guid CreatedByStaffId { get; set; }

    [JsonIgnore]
    public User.User CreatedByStaff { get; set; } = null!;

    /// <summary>
    /// Check if notice is currently active.
    /// </summary>
    public bool IsActive() {
        var now = DateTime.UtcNow;
        return !IsDeleted
               && StartsAt <= now
               && (ExpiresAt is null || ExpiresAt > now);
    }
}

public enum NoticeSeverity {
    Info = 0,
    Warning = 1,
    Critical = 2
}
```

#### Task 2.4: Extend Session Entity for Impersonation

**File:** `apps/api/Src/Features/Common/Session/Session.cs`

Add these properties to existing `Session` class:

```csharp
// Add to existing Session entity

[Column("is_impersonation")]
public bool IsImpersonation { get; set; } = false;

[Column("impersonating_staff_user_id")]
public Guid? ImpersonatingStaffUserId { get; set; }

[JsonIgnore]
public User? ImpersonatingStaffUser { get; set; }

[Column("impersonation_reason")]
public string? ImpersonationReason { get; set; }

[Column("impersonation_expires_at")]
public DateTime? ImpersonationExpiresAt { get; set; }

/// <summary>
/// Check if impersonation session is still valid.
/// </summary>
public bool IsImpersonationValid() {
    return IsImpersonation
           && ImpersonationExpiresAt.HasValue
           && ImpersonationExpiresAt.Value > DateTime.UtcNow;
}
```

---

### Phase 3: Database Integration (1-2 hours)

#### Task 3.1: Register Entities in DbContext

**File:** `apps/api/Src/Data/DbContext/MainApiDbContext.cs`

Add using statements at top:
```csharp
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Staff.Audit;
using MainApi.Src.Features.Staff.Notice;
```

Add DbSet properties after existing DbSets:
```csharp
// Unified invitation system (Staff/Tenant/Project)
public DbSet<Invitation> Invitation { get; init; }

// Staff backoffice entities
public DbSet<AuditLog> AuditLog { get; init; }
public DbSet<SystemNotice> SystemNotice { get; init; }
```

Add database-level constraints in `OnModelCreating` method (similar to UserAccount):
```csharp
// Database-level invitation scope constraints
modelBuilder.Entity<Invitation>()
    .ToTable(t => t.HasCheckConstraint("CK_Invitation_Staff_Constraints",
        "(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"));

modelBuilder.Entity<Invitation>()
    .ToTable(t => t.HasCheckConstraint("CK_Invitation_Tenant_Constraints",
        "(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"));

modelBuilder.Entity<Invitation>()
    .ToTable(t => t.HasCheckConstraint("CK_Invitation_Project_Constraints",
        "(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"));
```

#### Task 3.2: Create and Apply Migration

**Commands to run:**

```bash
# Step 1: Create migration
make db-add NAME=AddStaffBackofficeFoundations

# Step 2: Review the generated migration file in apps/api/Migrations/
# Verify it creates:
#   - staff_invitations table
#   - audit_logs table
#   - system_notices table
#   - Adds columns to session table (is_impersonation, etc.)

# Step 3: Apply migration
make db-migrate

# Step 4: Verify seeding works
# The Owner should be created automatically after migration
```

**Expected migration should create:**
1. `invitations` table with indexes and CHECK constraints (like user_accounts)
2. `audit_logs` table with indexes
3. `system_notices` table with indexes
4. Add 4 columns to `session` table for impersonation
5. Foreign key constraints

---

### Phase 4: Core Services (2-3 hours)

#### Task 4.1: Create InvitationService (Unified, Scope-Aware)

**File:** `apps/api/Src/Features/Common/Invitation/InvitationService.cs`

**IMPORTANT:** This service handles ALL invitation scopes (Staff/Tenant/Project), not just staff.

```csharp
using System.Security.Cryptography;
using System.Text;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Profile;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Invitation;

public interface IInvitationService {
    // Staff invitation
    Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
        string email,
        Guid profileId,
        Guid invitedByUserId,
        CancellationToken cancellationToken = default);

    // Tenant invitation (future)
    Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
        string email,
        Guid tenantId,
        Guid profileId,
        Guid invitedByUserId,
        CancellationToken cancellationToken = default);

    // Common validation
    Task<Invitation?> ValidateInvitationTokenAsync(
        string token,
        CancellationToken cancellationToken = default);

    Task<bool> RevokeInvitationAsync(
        Guid invitationId,
        CancellationToken cancellationToken = default);
}

public class InvitationService : IInvitationService {
    private readonly MainApiDbContext _dbContext;
    private readonly ILogger<InvitationService> _logger;

    public InvitationService(
        MainApiDbContext dbContext,
        ILogger<InvitationService> logger
    ) {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
        string email,
        Guid profileId,
        Guid invitedByUserId,
        CancellationToken cancellationToken = default
    ) {
        var (token, tokenHash) = GenerateToken();
        var expiresAt = DateTime.UtcNow.AddDays(7);

        // Use factory method for type safety
        var invitation = Invitation.CreateStaffInvitation(
            email,
            profileId,
            invitedByUserId,
            expiresAt,
            tokenHash
        );

        invitation.ValidateInvitationType();

        await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Created staff invitation for {Email} by user {InvitedBy}",
            email,
            invitedByUserId
        );

        return (invitation, token);
    }

    public async Task<(Invitation Invitation, string Token)> CreateTenantInvitationAsync(
        string email,
        Guid tenantId,
        Guid profileId,
        Guid invitedByUserId,
        CancellationToken cancellationToken = default
    ) {
        var (token, tokenHash) = GenerateToken();
        var expiresAt = DateTime.UtcNow.AddDays(7);

        // Use factory method for type safety
        var invitation = Invitation.CreateTenantInvitation(
            email,
            tenantId,
            profileId,
            invitedByUserId,
            expiresAt,
            tokenHash
        );

        invitation.ValidateInvitationType();

        await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Created tenant invitation for {Email} in tenant {TenantId} by user {InvitedBy}",
            email,
            tenantId,
            invitedByUserId
        );

        return (invitation, token);
    }

    public async Task<Invitation?> ValidateInvitationTokenAsync(
        string token,
        CancellationToken cancellationToken = default
    ) {
        var tokenHash = HashToken(token);

        var invitation = await (
            from inv in _dbContext.Invitation
            where inv.TokenHash == tokenHash
            select inv
        ).FirstOrDefaultAsync(cancellationToken);

        if (invitation is null) {
            return null;
        }

        if (!invitation.CanBeAccepted()) {
            _logger.LogWarning(
                "Invitation {Id} cannot be accepted (expired or revoked)",
                invitation.Id
            );
            return null;
        }

        return invitation;
    }

    public async Task<bool> RevokeInvitationAsync(
        Guid invitationId,
        CancellationToken cancellationToken = default
    ) {
        var invitation = await _dbContext.Invitation
            .FindAsync(new object[] { invitationId }, cancellationToken);

        if (invitation is null) {
            return false;
        }

        invitation.IsRevoked = true;
        invitation.RevokedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Revoked invitation {Id}", invitationId);
        return true;
    }

    private static (string Token, string TokenHash) GenerateToken() {
        var tokenBytes = new byte[32];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(tokenBytes);
        var token = Convert.ToBase64String(tokenBytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');

        var tokenHash = HashToken(token);
        return (token, tokenHash);
    }

    private static string HashToken(string token) {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
```

#### Task 4.2: Create AuditLogService

**File:** `apps/api/Src/Features/Staff/Audit/AuditLogService.cs`

```csharp
using System.Text.Json;
using MainApi.Src.Data.DbContext;
using Microsoft.AspNetCore.Http;

namespace MainApi.Src.Features.Staff.Audit;

public interface IAuditLogService {
    Task LogAsync(
        Guid userId,
        string action,
        Guid? targetId = null,
        object? details = null,
        CancellationToken cancellationToken = default);
}

public class AuditLogService : IAuditLogService {
    private readonly MainApiDbContext _dbContext;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly ILogger<AuditLogService> _logger;

    public AuditLogService(
        MainApiDbContext dbContext,
        IHttpContextAccessor httpContextAccessor,
        ILogger<AuditLogService> logger
    ) {
        _dbContext = dbContext;
        _httpContextAccessor = httpContextAccessor;
        _logger = logger;
    }

    public async Task LogAsync(
        Guid userId,
        string action,
        Guid? targetId = null,
        object? details = null,
        CancellationToken cancellationToken = default
    ) {
        var httpContext = _httpContextAccessor.HttpContext;

        var auditLog = new AuditLog {
            UserId = userId,
            Action = action,
            TargetId = targetId,
            Details = details is not null ? JsonSerializer.Serialize(details) : null,
            IpAddress = httpContext?.Connection.RemoteIpAddress?.ToString(),
            UserAgent = httpContext?.Request.Headers["User-Agent"].ToString()  // Use indexer for reliability
        };

        await _dbContext.AuditLog.AddAsync(auditLog, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Audit: {Action} by user {UserId} on target {TargetId}",
            action,
            userId,
            targetId
        );
    }
}
```

#### Task 4.3: Create ImpersonationService

**File:** `apps/api/Src/Features/Staff/Impersonation/ImpersonationService.cs`

```csharp
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Staff.Audit;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.Impersonation;

public interface IImpersonationService {
    Task<Session> CreateImpersonationSessionAsync(
        Guid tenantId,
        Guid staffUserId,
        string reason,
        int durationMinutes = 60,
        CancellationToken cancellationToken = default);

    Task<bool> ValidateImpersonationSessionAsync(
        string sessionToken,
        CancellationToken cancellationToken = default);
}

public class ImpersonationService : IImpersonationService {
    private readonly MainApiDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly ILogger<ImpersonationService> _logger;

    public ImpersonationService(
        MainApiDbContext dbContext,
        IAuditLogService auditLogService,
        ILogger<ImpersonationService> logger
    ) {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _logger = logger;
    }

    public async Task<Session> CreateImpersonationSessionAsync(
        Guid tenantId,
        Guid staffUserId,
        string reason,
        int durationMinutes = 60,
        CancellationToken cancellationToken = default
    ) {
        // Get tenant's first user account to impersonate
        var tenantUserAccount = await (
            from ua in _dbContext.UserAccount
            where ua.TenantId == tenantId
               && ua.Scope == AccountScope.Tenant
               && ua.IsSuspended == false
            orderby ua.Level descending
            select ua
        ).FirstOrDefaultAsync(cancellationToken);

        if (tenantUserAccount is null) {
            throw new InvalidOperationException($"No active user account found for tenant {tenantId}");
        }

        // Create impersonation session
        var session = new Session {
            UserId = tenantUserAccount.UserId,
            UserAccountId = tenantUserAccount.Id!.Value,
            Token = GenerateSessionToken(),
            ExpiresAt = DateTime.UtcNow.AddMinutes(durationMinutes),
            IsImpersonation = true,
            ImpersonatingStaffUserId = staffUserId,
            ImpersonationReason = reason,
            ImpersonationExpiresAt = DateTime.UtcNow.AddMinutes(durationMinutes)
        };

        await _dbContext.Session.AddAsync(session, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        // Log audit
        await _auditLogService.LogAsync(
            staffUserId,
            AuditActions.ImpersonationStarted,
            tenantId,
            new { Reason = reason, Duration = durationMinutes },
            cancellationToken
        );

        _logger.LogInformation(
            "Staff user {StaffUserId} started impersonation session for tenant {TenantId}",
            staffUserId,
            tenantId
        );

        return session;
    }

    public async Task<bool> ValidateImpersonationSessionAsync(
        string sessionToken,
        CancellationToken cancellationToken = default
    ) {
        var session = await (
            from s in _dbContext.Session
            where s.Token == sessionToken && s.IsImpersonation == true
            select s
        ).FirstOrDefaultAsync(cancellationToken);

        return session is not null && session.IsImpersonationValid();
    }

    private static string GenerateSessionToken() {
        return Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
    }
}
```

#### Task 4.4: Register Services in DI

**File:** `apps/api/Src/Program.cs` or `ServiceCollectionExtensions.cs`

Add service registrations:
```csharp
// Unified invitation service (handles Staff/Tenant/Project)
builder.Services.AddScoped<IInvitationService, InvitationService>();

// Staff services
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<IImpersonationService, ImpersonationService>();

// Required for audit logging
builder.Services.AddHttpContextAccessor();
```

---

### Phase 5: API Endpoints & Handlers (3-4 hours)

**Approach:** Following Vertical Slice Architecture, create endpoint handlers with proper validation, authorization, and response formatting.

#### Task 5.1: Create Invitation DTOs and Validators

**Directory:** `apps/api/Src/Features/Staff/Invitations/`

**File:** `apps/api/Src/Features/Staff/Invitations/InvitationDtos.cs`

```csharp
namespace MainApi.Src.Features.Staff.Invitations;

// Request DTOs
public record CreateStaffInvitationRequest {
    public required string Email { get; init; }
    public required Guid ProfileId { get; init; }
}

public record AcceptInvitationRequest {
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Password { get; init; }
}

// Response DTOs
public record InvitationResponse {
    public required Guid Id { get; init; }
    public required string Email { get; init; }
    public required string Scope { get; init; }
    public required string ProfileName { get; init; }
    public required DateTime ExpiresAt { get; init; }
    public required bool IsAccepted { get; init; }
    public required bool IsRevoked { get; init; }
    public required DateTime CreatedAt { get; init; }
    public string? InvitedByName { get; init; }
}

public record InvitationTokenResponse {
    public required Guid InvitationId { get; init; }
    public required string Token { get; init; }
    public required DateTime ExpiresAt { get; init; }
}

public record InvitationDetailsResponse {
    public required string Email { get; init; }
    public required string ProfileName { get; init; }
    public required DateTime ExpiresAt { get; init; }
}
```

**File:** `apps/api/Src/Features/Staff/Invitations/InvitationValidators.cs`

```csharp
using FluentValidation;

namespace MainApi.Src.Features.Staff.Invitations;

public class CreateStaffInvitationRequestValidator : AbstractValidator<CreateStaffInvitationRequest> {
    public CreateStaffInvitationRequestValidator() {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(255);

        RuleFor(x => x.ProfileId)
            .NotEmpty();
    }
}

public class AcceptInvitationRequestValidator : AbstractValidator<AcceptInvitationRequest> {
    public AcceptInvitationRequestValidator() {
        RuleFor(x => x.FirstName)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(x => x.LastName)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(255);
    }
}
```

#### Task 5.2: Create Invitation Request Handlers

**File:** `apps/api/Src/Features/Staff/Invitations/Handlers/CreateStaffInvitation.cs`

```csharp
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Staff.Audit;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ApiResponse;
using MainApi.Src.Lib.Auth;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public static class CreateStaffInvitation {
    public static async Task<Results<Ok<InvitationTokenResponse>, BadRequest<ApiResponse>, Forbidden<ApiResponse>>> Handle(
        [FromServices] IAuthContext authContext,
        [FromServices] MainApiDbContext dbContext,
        [FromServices] IInvitationService invitationService,
        [FromServices] IAuditLogService auditLogService,
        [FromBody] CreateStaffInvitationRequest request,
        CancellationToken cancellationToken = default
    ) {
        // Authorization: Staff Admin or Owner only
        if (authContext.Account?.Scope != AccountScope.Staff || authContext.Account?.Level < AccountLevel.Admin) {
            return TypedResults.Forbidden(
                ApiResponse.Create("Forbidden", ResponseKeys.Forbidden)
            );
        }

        // Validate profile exists and is Staff scope
        var profileQuery =
            from p in dbContext.Profile
            where p.Id == request.ProfileId && p.ProfileScope == ProfileScope.Staff
            select p;
        var profile = await profileQuery.FirstOrDefaultAsync(cancellationToken);

        if (profile is null) {
            return TypedResults.BadRequest(
                ApiResponse.Create("Profile not found", ResponseKeys.ProfileNotFound)
            );
        }

        // Check if user already exists
        var existingUserQuery =
            from u in dbContext.User
            where u.Email == request.Email.ToLowerInvariant()
            select u;
        var existingUser = await existingUserQuery.FirstOrDefaultAsync(cancellationToken);

        if (existingUser is not null) {
            return TypedResults.BadRequest(
                ApiResponse.Create("User already exists", ResponseKeys.UserAlreadyExists)
            );
        }

        // Check for pending invitation
        var pendingInvitationQuery =
            from inv in dbContext.Invitation
            where inv.Email == request.Email.ToLowerInvariant()
               && inv.Scope == InvitationScope.Staff
               && !inv.IsAccepted
               && !inv.IsRevoked
               && inv.ExpiresAt > DateTime.UtcNow
            select inv;
        var pendingInvitation = await pendingInvitationQuery.FirstOrDefaultAsync(cancellationToken);

        if (pendingInvitation is not null) {
            return TypedResults.BadRequest(
                ApiResponse.Create("Pending invitation exists", ResponseKeys.PendingInvitationExists)
            );
        }

        // Create invitation
        var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
            request.Email,
            request.ProfileId,
            authContext.User!.GetRequiredId(),
            cancellationToken
        );

        // Audit log
        await auditLogService.LogAsync(
            authContext.User.GetRequiredId(),
            AuditActions.InvitationCreated,
            invitation.GetRequiredId(),
            new { Email = request.Email, ProfileId = request.ProfileId, Scope = "Staff" },
            cancellationToken
        );

        // Return typed response directly (not wrapped in ApiResponse<T>)
        var response = new InvitationTokenResponse {
            InvitationId = invitation.GetRequiredId(),
            Token = token,
            ExpiresAt = invitation.ExpiresAt
        };

        return TypedResults.Ok(response);
    }
}
```

**File:** `apps/api/Src/Features/Staff/Invitations/Handlers/GetInvitationDetails.cs`

```csharp
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Lib.ApiResponse;
using MainApi.Localization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public static class GetInvitationDetails {
    public static async Task<Results<Ok<InvitationDetailsResponse>, NotFound<ApiResponse>, BadRequest<ApiResponse>>> Handle(
        [FromRoute] string token,
        [FromServices] MainApiDbContext dbContext,
        [FromServices] IInvitationService invitationService,
        CancellationToken cancellationToken = default
    ) {
        // Validate token
        var invitation = await invitationService.ValidateInvitationTokenAsync(token, cancellationToken);

        if (invitation is null) {
            return TypedResults.NotFound(
                ApiResponse.Create("Invitation not found or expired", ResponseKeys.NotFound)
            );
        }

        // Get profile details (use LINQ query syntax)
        var profileQuery =
            from p in dbContext.Profile
            where p.Id == invitation.ProfileId
            select p;
        var profile = await profileQuery.FirstOrDefaultAsync(cancellationToken);

        if (profile is null) {
            return TypedResults.BadRequest(
                ApiResponse.Create("Profile not found", ResponseKeys.ProfileNotFound)
            );
        }

        // Return typed response directly
        var response = new InvitationDetailsResponse {
            Email = invitation.Email,
            ProfileName = profile.Name,
            ExpiresAt = invitation.ExpiresAt
        };

        return TypedResults.Ok(response);
    }
}
```

**File:** `apps/api/Src/Features/Staff/Invitations/Handlers/AcceptInvitation.cs`

```csharp
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Staff.Audit;
using MainApi.Src.Lib.ApiResponse;
using MainApi.Src.Lib.Extensions;
using MainApi.Localization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public static class AcceptInvitation {
    public static async Task<Results<Ok<SessionResponse>, NotFound<ApiResponse>, BadRequest<ApiResponse>>> Handle(
        [FromRoute] string token,
        [FromBody] AcceptInvitationRequest request,
        [FromServices] MainApiDbContext dbContext,
        [FromServices] IInvitationService invitationService,
        [FromServices] IAuditLogService auditLogService,
        [FromServices] ISessionService sessionService,
        [FromServices] IPasswordService passwordService,
        HttpContext httpContext,
        CancellationToken cancellationToken = default
    ) {
        // Validate invitation token and ensure Staff scope
        var invitation = await invitationService.ValidateInvitationTokenAsync(token, cancellationToken);

        if (invitation is null || invitation.Scope != InvitationScope.Staff) {
            return TypedResults.NotFound(
                ApiResponse.Create("Invitation not found or expired", ResponseKeys.NotFound)
            );
        }

        // Check if user already exists (use LINQ query syntax)
        var existingUserQuery =
            from u in dbContext.User
            where u.Email == invitation.Email
            select u;
        var existingUser = await existingUserQuery.FirstOrDefaultAsync(cancellationToken);

        if (existingUser is not null) {
            return TypedResults.BadRequest(
                ApiResponse.Create("User already exists", ResponseKeys.UserAlreadyExists)
            );
        }

        // Use transaction for consistency
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        try {
            // Create user with verified status (CRITICAL: must be true for session auth)
            var user = new User {
                Email = invitation.Email,
                Password = passwordService.HashPassword(request.Password),
                FirstName = request.FirstName,
                LastName = request.LastName,
                Status = UserStatus.Active,
                IsVerified = true  // CRITICAL: SessionService checks this flag
            };
            await dbContext.User.AddAsync(user, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);

            // Create staff account
            var account = UserAccount.CreateStaffAccount(user.GetRequiredId(), AccountLevel.User);
            await dbContext.UserAccount.AddAsync(account, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);

            // Assign profile to account
            var userAccountProfile = new UserAccountProfile {
                UserAccountId = account.GetRequiredId(),
                ProfileId = invitation.ProfileId
            };
            await dbContext.UserAccountProfile.AddAsync(userAccountProfile, cancellationToken);

            // Mark invitation as accepted
            invitation.IsAccepted = true;
            invitation.AcceptedAt = DateTime.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);

            // Create session (correct signature: takes User entity)
            var session = await sessionService.CreateSessionForUser(user, cancellationToken);

            // Audit log
            await auditLogService.LogAsync(
                user.GetRequiredId(),
                AuditActions.InvitationAccepted,
                invitation.GetRequiredId(),
                new { Email = invitation.Email },
                cancellationToken
            );

            await transaction.CommitAsync(cancellationToken);

            // Return typed response directly (not wrapped in ApiResponse<T>)
            var response = new SessionResponse {
                Token = session.Token,
                ExpiresAt = session.ExpiresAt,
                User = new UserResponse {
                    Id = user.GetRequiredId(),
                    Email = user.Email,
                    FirstName = user.FirstName,
                    LastName = user.LastName
                }
            };

            return TypedResults.Ok(response);
        } catch {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }
}
```

**File:** `apps/api/Src/Features/Staff/Invitations/Handlers/ListStaffInvitations.cs`

```csharp
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ApiResponse;
using MainApi.Src.Lib.Auth;
using MainApi.Src.Lib.Extensions;
using MainApi.Localization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public static class ListStaffInvitations {
    public static async Task<Results<Ok<List<InvitationResponse>>, Forbidden<ApiResponse>>> Handle(
        [FromServices] IAuthContext authContext,
        [FromServices] MainApiDbContext dbContext,
        CancellationToken cancellationToken = default
    ) {
        // Authorization: Staff only
        if (authContext.Account?.Scope != AccountScope.Staff) {
            return TypedResults.Forbidden(
                ApiResponse.Create("Forbidden", ResponseKeys.Forbidden)
            );
        }

        // Query invitations with profile and inviter details
        var invitationsQuery =
            from inv in dbContext.Invitation
            where inv.Scope == InvitationScope.Staff
            join profile in dbContext.Profile on inv.ProfileId equals profile.Id
            join inviter in dbContext.User on inv.InvitedByUserId equals inviter.Id
            orderby inv.CreatedAt descending
            select new InvitationResponse {
                Id = inv.GetRequiredId(),
                Email = inv.Email,
                Scope = "Staff",
                ProfileName = profile.Name,
                ExpiresAt = inv.ExpiresAt,
                IsAccepted = inv.IsAccepted,
                IsRevoked = inv.IsRevoked,
                CreatedAt = inv.CreatedAt.Value,
                InvitedByName = $"{inviter.FirstName} {inviter.LastName}"
            };

        var invitations = await invitationsQuery.ToListAsync(cancellationToken);

        // Return typed response directly
        return TypedResults.Ok(invitations);
    }
}
```

**File:** `apps/api/Src/Features/Staff/Invitations/Handlers/RevokeInvitation.cs`

```csharp
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Staff.Audit;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ApiResponse;
using MainApi.Src.Lib.Auth;
using MainApi.Src.Lib.Extensions;
using MainApi.Localization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

public static class RevokeInvitation {
    public static async Task<Results<Ok, NotFound<ApiResponse>, Forbidden<ApiResponse>>> Handle(
        [FromRoute] Guid invitationId,
        [FromServices] IAuthContext authContext,
        [FromServices] IInvitationService invitationService,
        [FromServices] IAuditLogService auditLogService,
        CancellationToken cancellationToken = default
    ) {
        // Authorization: Staff Admin or Owner only
        if (authContext.Account?.Scope != AccountScope.Staff || authContext.Account?.Level < AccountLevel.Admin) {
            return TypedResults.Forbidden(
                ApiResponse.Create("Forbidden", ResponseKeys.Forbidden)
            );
        }

        var success = await invitationService.RevokeInvitationAsync(invitationId, cancellationToken);

        if (!success) {
            return TypedResults.NotFound(
                ApiResponse.Create("Invitation not found", ResponseKeys.NotFound)
            );
        }

        // Audit log
        await auditLogService.LogAsync(
            authContext.User!.GetRequiredId(),
            AuditActions.InvitationRevoked,
            invitationId,
            null,
            cancellationToken
        );

        // Success responses without payload can return Ok() directly
        return TypedResults.Ok();
    }
}
```

#### Task 5.3: Create Endpoint Mappings

**File:** `apps/api/Src/Features/Staff/Invitations/InvitationEndpoints.cs`

**CRITICAL:** Anonymous endpoints (details, accept) must be mapped **outside** the staff group to avoid `StaffAuthMiddleware` blocking them.

```csharp
using MainApi.Src.Features.Staff.Invitations.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Features.Staff.Invitations;

public static class InvitationEndpoints {
    public static void MapStaffInvitationEndpoints(this IEndpointRouteBuilder app) {
        // ANONYMOUS endpoints - mapped outside staff group to bypass middleware
        var anonymousGroup = app.MapGroup("/invitations")
            .WithTags("Invitations (Anonymous)");

        // Get invitation details by token (anonymous - for acceptance page)
        anonymousGroup.MapGet("/{token}/details", GetInvitationDetails.Handle)
            .WithName("GetInvitationDetails");

        // Accept invitation (anonymous - creates user + session)
        anonymousGroup.MapPost("/{token}/accept", AcceptInvitation.Handle)
            .WithName("AcceptInvitation");

        // AUTHENTICATED endpoints - mapped under /staff (protected by StaffAuthMiddleware)
        var staffGroup = app.MapGroup(RoutePath.Staff.Invitations.Root)
            .WithTags("Staff Invitations")
            .RequireAuthorization();

        // Create staff invitation (Admin/Owner only)
        staffGroup.MapPost("/", CreateStaffInvitation.Handle)
            .WithName("CreateStaffInvitation");

        // List staff invitations (Staff only)
        staffGroup.MapGet("/", ListStaffInvitations.Handle)
            .WithName("ListStaffInvitations");

        // Revoke invitation (Admin/Owner only)
        staffGroup.MapDelete("/{invitationId:guid}", RevokeInvitation.Handle)
            .WithName("RevokeInvitation");
    }
}
```

**Important Notes:**
- Anonymous endpoints at `/invitations/*` - no authentication required
- Authenticated endpoints at `/staff/invitations/*` - protected by `StaffAuthMiddleware`
- This prevents 401 errors when users try to accept invitations

#### Task 5.4: Add Route Constants

**File:** `apps/api/Src/Lib/RoutePath.cs`

Add inside the `Staff` class (following the PathUtils.Join pattern used throughout the codebase):
```csharp
public static class Invitations {
    public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/invitations");
    public static readonly string Create = PathUtils.Join(Root, "/");
    public static readonly string List = PathUtils.Join(Root, "/");
    public static readonly string Revoke = PathUtils.Join(Root, "/{invitationId}");
}

// Anonymous routes (outside staff group)
public static class AnonymousInvitations {
    public const string Root = "/invitations";
    public static readonly string Details = PathUtils.Join(Root, "/{token}/details");
    public static readonly string Accept = PathUtils.Join(Root, "/{token}/accept");
}
```

**Note:** Anonymous invitation routes are defined separately since they're not under the `/staff` group.

#### Task 5.5: Register Endpoints in Program.cs

**File:** `apps/api/Src/Program.cs`

Add after other endpoint mappings:
```csharp
// Staff invitation endpoints
app.MapStaffInvitationEndpoints();
```

#### Task 5.6: Add Translation Keys

**File:** `packages/shared/lib/i18n/json/en/response-message.json`

Add:
```json
{
  "staff": {
    "invitations": {
      "created": "Invitation sent successfully",
      "accepted": "Welcome! Your account has been created",
      "revoked": "Invitation revoked successfully",
      "not_found": "Invitation not found",
      "not_found_or_expired": "Invitation not found or has expired",
      "user_already_exists": "A user with this email already exists",
      "pending_invitation_exists": "A pending invitation already exists for this email",
      "profile_not_found": "Profile not found",
      "create": {
        "forbidden": "You do not have permission to create invitations"
      },
      "list": {
        "forbidden": "You do not have permission to view invitations"
      },
      "revoke": {
        "forbidden": "You do not have permission to revoke invitations"
      }
    }
  }
}
```

---

### Phase 6: Frontend Implementation (4-5 hours)

**Approach:** Create React pages for invitation acceptance and staff invitation management following the project's patterns.

#### Task 6.1: Generate TypeScript API Client

After implementing Phase 5 endpoints:

```bash
# Build API to generate OpenAPI spec
make build-api

# Generate TypeScript client
make generate-client
```

#### Task 6.2: Create Invitation Acceptance Page

**File:** `apps/front/app/routes/auth/accept-invitation/route.tsx`

```tsx
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router";
import { getClientManager } from "~/lib/js-client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const acceptInvitationSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters").max(255),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AcceptInvitationForm = z.infer<typeof acceptInvitationSchema>;

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const anonClient = clientManager.anonymousClient;  // Correct API: anonymousClient property

  // Fetch invitation details
  const { data: invitationData, isLoading, error } = useQuery({
    queryKey: ["invitation", token],
    queryFn: async () => {
      if (!token) throw new Error("No invitation token");
      // Use Kiota client pattern - actual path depends on generated client
      const response = await anonClient.invitations.byToken(token).details.get();
      return response;
    },
    enabled: !!token,
  });

  // Accept invitation mutation
  const acceptMutation = useMutation({
    mutationFn: async (data: AcceptInvitationForm) => {
      if (!token) throw new Error("No invitation token");
      // Use Kiota client pattern
      const response = await anonClient.invitations.byToken(token).accept.post({
        body: {
          firstName: data.firstName,
          lastName: data.lastName,
          password: data.password,
        },
      });
      return response;
    },
    onSuccess: (response) => {
      // Create authenticated client and set it (correct API)
      if (response?.token) {
        const authedClient = clientManager.createApiClient(response.token);
        clientManager.setApiClient(authedClient);
      }
      toast.success(t("auth.invitation_accepted"));
      navigate("/staff/dashboard");
    },
    onError: (error: any) => {
      toast.error(error.message || t("errors.generic"));
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInvitationForm>({
    resolver: zodResolver(acceptInvitationSchema),
  });

  const onSubmit = (data: AcceptInvitationForm) => {
    acceptMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !invitationData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("auth.invitation_invalid")}</CardTitle>
            <CardDescription>
              {t("auth.invitation_invalid_description")}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.accept_invitation")}</CardTitle>
          <CardDescription>
            {t("auth.accept_invitation_description", {
              email: invitationData.email,
              role: invitationData.profileName,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("auth.first_name")}</Label>
              <Input
                id="firstName"
                {...register("firstName")}
                disabled={acceptMutation.isPending}
              />
              {errors.firstName && (
                <p className="text-sm text-red-500">{errors.firstName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">{t("auth.last_name")}</Label>
              <Input
                id="lastName"
                {...register("lastName")}
                disabled={acceptMutation.isPending}
              />
              {errors.lastName && (
                <p className="text-sm text-red-500">{errors.lastName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                {...register("password")}
                disabled={acceptMutation.isPending}
              />
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                {t("auth.confirm_password")}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                {...register("confirmPassword")}
                disabled={acceptMutation.isPending}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-500">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending
                ? t("common.loading")
                : t("auth.create_account")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Task 6.3: Create Staff Invitations Management Page

**File:** `apps/front/app/routes/staff/invitations/route.tsx`

```tsx
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getClientManager } from "~/lib/js-client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Copy, UserPlus } from "lucide-react";

const createInvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  profileId: z.string().uuid("Invalid profile"),
});

type CreateInvitationForm = z.infer<typeof createInvitationSchema>;

export default function StaffInvitationsPage() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const apiClient = clientManager.apiClient;  // Correct API: apiClient property
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);

  // Fetch staff profiles
  const { data: profiles } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      // Use Kiota client pattern
      const response = await apiClient.staff.profiles.get();
      return response || [];
    },
  });

  // Fetch invitations
  const { data: invitations, isLoading } = useQuery({
    queryKey: ["staff-invitations"],
    queryFn: async () => {
      // Use Kiota client pattern
      const response = await apiClient.staff.invitations.get();
      return response || [];
    },
  });

  // Create invitation mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateInvitationForm) => {
      // Use Kiota client pattern
      const response = await apiClient.staff.invitations.post({
        body: data,
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-invitations"] });
      setInvitationToken(data?.token || null);
      toast.success(t("staff.invitation_created"));
      form.reset();
    },
    onError: (error: any) => {
      toast.error(error.message || t("errors.generic"));
    },
  });

  // Revoke invitation mutation
  const revokeMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      // Use Kiota client pattern - byInvitationId style
      await apiClient.staff.invitations.byInvitationId(invitationId).delete();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-invitations"] });
      toast.success(t("staff.invitation_revoked"));
    },
    onError: (error: any) => {
      toast.error(error.message || t("errors.generic"));
    },
  });

  const form = useForm<CreateInvitationForm>({
    resolver: zodResolver(createInvitationSchema),
  });

  const onSubmit = (data: CreateInvitationForm) => {
    createMutation.mutate(data);
  };

  const copyInvitationLink = () => {
    if (!invitationToken) return;
    const invitationUrl = `${window.location.origin}/auth/accept-invitation/${invitationToken}`;
    navigator.clipboard.writeText(invitationUrl);
    toast.success(t("staff.invitation_link_copied"));
  };

  const getStatusBadge = (invitation: any) => {
    if (invitation.isAccepted) {
      return <Badge variant="success">{t("staff.accepted")}</Badge>;
    }
    if (invitation.isRevoked) {
      return <Badge variant="destructive">{t("staff.revoked")}</Badge>;
    }
    if (new Date(invitation.expiresAt) < new Date()) {
      return <Badge variant="secondary">{t("staff.expired")}</Badge>;
    }
    return <Badge variant="default">{t("staff.pending")}</Badge>;
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t("staff.invitations")}</h1>
          <p className="text-muted-foreground">
            {t("staff.invitations_description")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              {t("staff.invite_staff")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("staff.invite_staff_member")}</DialogTitle>
              <DialogDescription>
                {t("staff.invite_staff_description")}
              </DialogDescription>
            </DialogHeader>

            {invitationToken ? (
              <div className="space-y-4">
                <p className="text-sm text-green-600">
                  {t("staff.invitation_created_success")}
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}/auth/accept-invitation/${invitationToken}`}
                  />
                  <Button onClick={copyInvitationLink} variant="outline">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setInvitationToken(null);
                    setDialogOpen(false);
                  }}
                >
                  {t("common.done")}
                </Button>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    {...form.register("email")}
                    disabled={createMutation.isPending}
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profileId">{t("staff.profile")}</Label>
                  <Select
                    onValueChange={(value) => form.setValue("profileId", value)}
                    disabled={createMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("staff.select_profile")} />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles?.map((profile: any) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.profileId && (
                    <p className="text-sm text-red-500">
                      {form.formState.errors.profileId.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending
                    ? t("common.loading")
                    : t("staff.send_invitation")}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("staff.invitation_history")}</CardTitle>
          <CardDescription>
            {t("staff.invitation_history_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>{t("common.loading")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("auth.email")}</TableHead>
                  <TableHead>{t("staff.profile")}</TableHead>
                  <TableHead>{t("staff.invited_by")}</TableHead>
                  <TableHead>{t("staff.status")}</TableHead>
                  <TableHead>{t("staff.expires")}</TableHead>
                  <TableHead>{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations?.map((invitation: any) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>{invitation.profileName}</TableCell>
                    <TableCell>{invitation.invitedByName}</TableCell>
                    <TableCell>{getStatusBadge(invitation)}</TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(invitation.expiresAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                    <TableCell>
                      {!invitation.isAccepted && !invitation.isRevoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeMutation.mutate(invitation.id)}
                          disabled={revokeMutation.isPending}
                        >
                          {t("staff.revoke")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Task 6.4: Add Routes

**File:** `apps/front/app/routes.ts`

Add routes:
```typescript
// Auth routes
{
  path: "/auth/accept-invitation/:token",
  lazy: () => import("./routes/auth/accept-invitation/route"),
},

// Staff routes (authenticated)
{
  path: "/staff/invitations",
  lazy: () => import("./routes/staff/invitations/route"),
},
```

#### Task 6.5: Add Translation Keys

**File:** `packages/shared/lib/i18n/json/en/common.json`

Add:
```json
{
  "staff": {
    "invitations": "Invitations",
    "invitations_description": "Manage staff member invitations",
    "invite_staff": "Invite Staff",
    "invite_staff_member": "Invite Staff Member",
    "invite_staff_description": "Send an invitation to join the staff team",
    "invitation_created": "Invitation created successfully",
    "invitation_created_success": "Invitation has been created. Share this link with the invitee:",
    "invitation_link_copied": "Invitation link copied to clipboard",
    "invitation_revoked": "Invitation revoked successfully",
    "invitation_history": "Invitation History",
    "invitation_history_description": "View all sent invitations and their status",
    "profile": "Profile",
    "select_profile": "Select a profile",
    "invited_by": "Invited By",
    "status": "Status",
    "expires": "Expires",
    "accepted": "Accepted",
    "revoked": "Revoked",
    "expired": "Expired",
    "pending": "Pending",
    "revoke": "Revoke",
    "send_invitation": "Send Invitation"
  },
  "auth": {
    "accept_invitation": "Accept Invitation",
    "accept_invitation_description": "You've been invited to join as {role}. Email: {email}",
    "invitation_invalid": "Invalid Invitation",
    "invitation_invalid_description": "This invitation link is invalid or has expired.",
    "invitation_accepted": "Account created successfully! Welcome aboard.",
    "first_name": "First Name",
    "last_name": "Last Name",
    "password": "Password",
    "confirm_password": "Confirm Password",
    "create_account": "Create Account"
  }
}
```

---

### Phase 7: End-to-End Testing & Verification (2-3 hours)

#### Task 5.1: Manual Testing Checklist

**Database Verification:**
```bash
# Connect to PostgreSQL
make dev-db

# Verify tables exist
\dt

# Expected tables:
# - invitations (unified for Staff/Tenant/Project)
# - audit_logs
# - system_notices
# - session (with new columns for impersonation)

# Verify Owner was created
SELECT email, first_name, last_name, is_verified FROM users
WHERE email = '<STAFF_OWNER_EMAIL>';

# Verify Owner has staff account with Admin level
SELECT ua.scope, ua.level, ua.is_suspended FROM user_accounts ua
JOIN users u ON ua.user_id = u.id
WHERE u.email = '<STAFF_OWNER_EMAIL>' AND ua.scope = 0;
-- Expected: scope=0 (Staff), level=50 (Admin), is_suspended=false

# Verify staff profiles exist (but no assignments yet)
SELECT name, description, scope FROM profiles
WHERE scope = 0
ORDER BY display_order DESC;
-- Expected: Staff Owner, Staff Admin, Staff Support

# Check session table has new columns
\d session
-- Should see: is_impersonation, impersonating_staff_user_id,
--              impersonation_reason, impersonation_expires_at
```

**Service Testing:**
Create a simple test endpoint temporarily:

**File:** `apps/api/Src/Features/Staff/TestEndpoints.cs`

```csharp
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Staff.Audit;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff;

public static class TestEndpoints {
    public static void MapStaffTestEndpoints(this IEndpointRouteBuilder app) {
        var group = app.MapGroup("/staff/test");

        // Test staff invitation creation
        group.MapPost("/invitation", async (
            [FromServices] IInvitationService invitationService,
            [FromServices] IAuditLogService auditLogService,
            [FromBody] TestInviteRequest request
        ) => {
            var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
                request.Email,
                request.ProfileId,
                request.InvitedByUserId
            );

            await auditLogService.LogAsync(
                request.InvitedByUserId,
                AuditActions.InvitationCreated,
                invitation.Id,
                new { Email = request.Email, Scope = "Staff" }
            );

            return Results.Ok(new { InvitationId = invitation.Id, Token = token, Scope = invitation.Scope });
        });

        // Test invitation validation (works for any scope)
        group.MapGet("/invitation/{token}", async (
            [FromRoute] string token,
            [FromServices] IInvitationService invitationService
        ) => {
            var invitation = await invitationService.ValidateInvitationTokenAsync(token);
            return invitation is not null ? Results.Ok(invitation) : Results.NotFound();
        });
    }
}

public record TestInviteRequest(string Email, Guid ProfileId, Guid InvitedByUserId);
```

**Test with curl or Postman:**
```bash
# Create invitation
curl -X POST http://localhost:5000/staff/test/invitation \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","profileId":"<staff-admin-profile-id>","invitedByUserId":"<owner-user-id>"}'

# Validate invitation (use token from previous response)
curl http://localhost:5000/staff/test/invitation/<TOKEN>
```

#### Task 7.2: Complete Invitation Flow Testing

**End-to-end test of the complete invitation system:**

1. **Staff creates invitation (as Owner):**
   - Log in as Owner (`owner@publyapp.local`)
   - Navigate to `/staff/invitations`
   - Click "Invite Staff" button
   - Fill form: email + select "Staff Admin" profile
   - Copy invitation link from dialog

2. **Accept invitation (as new staff member):**
   - Open invitation link in incognito/private window
   - Verify invitation details are displayed
   - Fill acceptance form (name, password)
   - Click "Create Account"
   - Verify redirect to staff dashboard with active session

3. **Verify invitation status updated:**
   - Return to Owner session
   - Refresh invitations page
   - Verify invitation shows "Accepted" status

4. **Test revoke flow:**
   - Create another invitation
   - Click "Revoke" button
   - Verify status changes to "Revoked"
   - Attempt to open invitation link
   - Verify error message appears

#### Task 7.3: Frontend Integration Verification

```bash
# Run TypeScript checks
make tsc-front

# Verify no type errors in new components
# Expected: No errors in:
# - apps/front/app/routes/auth/accept-invitation/route.tsx
# - apps/front/app/routes/staff/invitations/route.tsx
```

#### Task 7.4: API Documentation Check

```bash
# Start API
make dev-api

# Open Scalar documentation
open http://localhost:5000/scalar/v1

# Verify endpoints appear:
# - POST /staff/invitations
# - GET /staff/invitations
# - GET /staff/invitations/{token}/details
# - POST /staff/invitations/{token}/accept
# - DELETE /staff/invitations/{invitationId}
```

---

## Acceptance Criteria

### ✅ Must Be Completed

- [ ] **Environment variables** defined in `.env.development`
- [ ] **UserSeeder** modified to include Owner from environment
- [ ] **UserAccountSeeder** modified to create Owner account with Admin level
- [ ] **Staff profiles** created by StaffProfileSeeder (structure only, no assignments)
- [ ] **Owner user** can log in with bootstrap credentials
- [ ] **Invitation entity** exists with scope discriminator (Staff/Tenant/Project)
- [ ] **Database constraints** ensure scope-based validation (like UserAccount)
- [ ] **AuditLog entity** exists with proper indexes
- [ ] **SystemNotice entity** exists with proper indexes
- [ ] **Session entity** extended with impersonation fields
- [ ] **Migration** created and applied successfully
- [ ] **Services** registered in DI container
- [ ] **InvitationService** can create staff invitations (future: tenant/project)
- [ ] **InvitationService** can validate invitations for any scope
- [ ] **AuditLogService** can log actions
- [ ] **ImpersonationService** can create impersonation sessions
- [ ] **API endpoints** created with proper handlers and validators
- [ ] **Translation keys** added for API responses
- [ ] **Frontend pages** created for invitation acceptance and management
- [ ] **Routes** registered in React Router
- [ ] **TypeScript client** regenerated after API changes
- [ ] **End-to-end testing** completed (create → accept → verify flow)
- [ ] **API documentation** verified in Scalar

---

## Post-Implementation Checklist

After completing all tasks:

1. **Code Quality:**
   ```bash
   make check-write  # Lint and format
   make tsc-front    # TypeScript checks (if frontend changes)
   ```

2. **Database Integrity:**
   ```bash
   make db-migrate   # Ensure migrations apply cleanly
   ```

3. **Verify Seeding:**
   - Drop and recreate database: `make db-reset`
   - Verify Owner is created automatically
   - Verify staff profiles exist

4. **Update Documentation:**
   - Update `CLAUDE.md` with new entities and services
   - Document environment variables in deployment docs

5. **Commit Changes:**
   ```bash
   git status
   git add .
   git commit -m "feat(staff): implement Week 1 foundations (invitations, audit, impersonation)

   - Add unified Invitation entity with scope discriminator (Staff/Tenant/Project)
   - Follow UserAccount/Profile pattern: single table with scope enum
   - Add database constraints for scope-based validation
   - Add AuditLog entity for compliance tracking
   - Add SystemNotice entity for operational alerts
   - Extend Session entity with impersonation support
   - Extend UserSeeder and UserAccountSeeder for Owner bootstrap
   - Create StaffProfileSeeder for profile structure (no assignments)
   - Add InvitationService (handles all scopes), AuditLogService, ImpersonationService
   - Follow minimal seeding principle: structure only, no relationships

   Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
   ```

---

## Known Limitations & Future Enhancements

### Current Limitations

1. **No email sending** - Invitation tokens must be shared manually (copy/paste link)
2. **Basic token security** - No rate limiting on validation attempts
3. **No unit tests** - Add in Week 2

### Future Enhancements (Later Weeks)

- Week 2: Email integration for sending invitations automatically
- Week 2: Unit testing infrastructure for all services and handlers
- Week 3: Advanced audit log filtering and export functionality
- Week 3: Admin UI for viewing detailed audit logs and analytics
- Week 4: Tenant management UI (suspend, reactivate, view details)
- Week 4: System notices management UI for staff
- Week 5: Rate limiting and brute-force protection
- Week 6: Impersonation UI for staff to access tenant accounts

---

## Troubleshooting

### Migration Fails

**Issue:** Migration creation fails or doesn't detect changes

**Solution:**
```bash
# Clean and rebuild
make build-api

# Try migration again
make db-add NAME=AddStaffBackofficeFoundations
```

### Owner Not Created

**Issue:** Owner user doesn't appear after migration

**Solution:**
```bash
# Check environment variables are set
echo $STAFF_OWNER_EMAIL
# Should output the email address

# Verify UserSeeder picks up the environment variable
# Look for log message: "Created Owner user: <email>"

# Force seeding
make db-reset  # This will drop and recreate, triggering seeders

# Manually verify in database
psql -h localhost -p 5454 -U publyapp_user -d publyapp_db
SELECT email, first_name, last_name FROM users WHERE email = '<STAFF_OWNER_EMAIL>';

# Check staff account exists
SELECT ua.*, u.email FROM user_accounts ua
JOIN users u ON ua.user_id = u.id
WHERE u.email = '<STAFF_OWNER_EMAIL>' AND ua.scope = 0 AND ua.level = 50;
```

**Common causes:**
- `STAFF_OWNER_EMAIL` not defined in `.env.development`
- Email validation fails (check format)
- UserSeeder runs but doesn't include env check logic
- UserAccountSeeder runs before UserSeeder completes

### Foreign Key Constraint Errors

**Issue:** Cannot create invitation because profile doesn't exist

**Solution:**
- Ensure `StaffProfileSeeder` (order 35) runs before creating invitations
- Verify profiles exist in database: `SELECT * FROM profiles WHERE scope = 0;`
- Check seeder execution order in logs
- Profile IDs must exist before calling `InvitationService.CreateStaffInvitationAsync()`

### Scope Constraint Violations

**Issue:** Cannot insert invitation - CHECK constraint failed

**Solution:**
```bash
# Check constraint error usually means scope doesn't match tenant_id/project_id
# Examples:
# - Staff invitation must have tenant_id=NULL and project_id=NULL
# - Tenant invitation must have tenant_id NOT NULL and project_id=NULL

# Use factory methods to ensure correct structure:
var invitation = Invitation.CreateStaffInvitation(...);  # Correct
# vs
var invitation = new Invitation { Scope = InvitationScope.Staff, TenantId = someId };  # WRONG

# Always call ValidateInvitationType() before saving
invitation.ValidateInvitationType();
```

### Session Impersonation Not Working

**Issue:** Cannot query impersonation sessions

**Solution:**
- Verify migration added columns to `session` table
- Check column names match: `is_impersonation`, `impersonating_staff_user_id`, etc.
- Ensure EF Core is using latest model snapshot

---

## Questions Before Implementation

Before you begin, please confirm:

1. **Owner Email:** What should `STAFF_OWNER_EMAIL` be set to in production?
2. **Invitation Duration:** Is 7 days acceptable for invitation expiry?
3. **Impersonation Duration:** Is 60 minutes acceptable for impersonation sessions?
4. **Audit Retention:** How long should audit logs be kept?
5. **Notice UI:** Where should system notices be displayed in the staff portal?

---

## Estimated Timeline

| Phase | Hours | Complexity |
|-------|-------|------------|
| Phase 1: Environment & Seeding | 1.5h | Low |
| Phase 2: New Entities | 3-4h | Medium |
| Phase 3: Database Integration | 1-2h | Low |
| Phase 4: Core Services | 2-3h | Medium |
| **Phase 5: API Endpoints & Handlers** | **3-4h** | **Medium-High** |
| **Phase 6: Frontend Implementation** | **4-5h** | **Medium-High** |
| Phase 7: End-to-End Testing | 2-3h | Medium |
| **Total** | **19-26h** | **Medium-High** |

**Realistic estimate:** 3-4 focused work days (assuming 5-7 hours/day)

**Note:** This is now a complete vertical slice with fully functional invitation system including backend services, API endpoints, and user interface.

---

## Next Steps (Week 2 Preview)

Once Week 1 is complete (including full invitation UI), Week 2 will focus on:

1. **Email Integration:**
   - Set up email service (SendGrid/Mailgun/AWS SES)
   - Email templates for invitations with branded design
   - Automated invitation emails (replace manual copy/paste workflow)
   - Email verification and bounce handling

2. **Unit Testing Infrastructure:**
   - xUnit test project setup
   - Integration tests for invitation flow
   - Service layer unit tests
   - Test data builders and fixtures
   - Mock authentication context for testing

3. **Tenant Management UI:**
   - List tenants page with search and filters
   - Tenant details page with activity history
   - Suspend/reactivate tenant actions with confirmation
   - Tenant usage metrics and statistics
   - Tenant activity monitoring dashboard

4. **Audit Log Viewer UI:**
   - Filterable audit log page (by user, action, date range)
   - Export audit logs (CSV/JSON)
   - Real-time activity feed with WebSocket updates
   - Audit log detail modal with full context

5. **System Notices Management UI:**
   - Create/edit system notices form
   - Notice banner component for staff portal
   - Notice scheduling with start/end dates
   - Notice preview and testing

6. **Impersonation UI:**
   - Impersonate tenant button in tenant list/details
   - Impersonation banner showing current context and exit option
   - Impersonation session timer and auto-logout
   - Impersonation audit trail display

---

**Document Status:** ✅ READY FOR IMPLEMENTATION

**Next Action:** Review this plan, answer pre-implementation questions, then begin Phase 1.

---

## ADDENDUM: Phase 4 Completion Fixes (2025-11-02)

**Status:** Post-Implementation Review Consensus
**Refs:** `docs/reviews/staff-mvp-week1-phase4-rejoinder.md`

After implementing Phase 4 core services, GPT 5 and Claude conducted a code review and reached consensus on these minimal, safe improvements:

### Required Fixes (30-45 minutes)

1. **Add Unique Index on TokenHash** ✅ CRITICAL
   - **File:** `Invitation.cs`
   - **Change:** Add `[Index(nameof(TokenHash), IsUnique = true)]`
   - **Impact:** Prevents O(n) table scans on invitation validation
   - **Migration:** `make db-add NAME=AddInvitationTokenHashUniqueIndex`

2. **Make RevokeInvitationAsync Idempotent** ✅ IMPORTANT
   - **File:** `InvitationService.cs`
   - **Change:** Add guards for already-revoked (no-op success) and accepted (return false)
   - **Impact:** State-transition invariant; prevents data corruption
   - **Lines:** +15 lines of guard logic

3. **Standardize Token Generation** ✅ CONSISTENCY
   - **File:** `ImpersonationService.cs`
   - **Change:** Replace GUID concatenation with `CryptoUtils.RandomString(32)`
   - **Impact:** Matches SessionService pattern; same entropy (256 bits)
   - **Lines:** +1 using, -1/+1 method body

4. **Add Account Selection Tie-Breaker** ✅ DETERMINISM
   - **File:** `ImpersonationService.cs`
   - **Change:** `orderby ua.Level descending, ua.CreatedAt ascending`
   - **Impact:** Deterministic behavior when multiple accounts have same level
   - **Lines:** Modify 1 line

5. **Parse Tenant Header Conditionally** (Optional)
   - **File:** `AppServicesConfig.cs`
   - **Change:** Return `Guid?` and apply `UseTenantId` only when header parses
   - **Impact:** Removes hard-coded GUID; graceful degradation
   - **Lines:** +10, -5

### Deferred to Phase 5 (Endpoint Layer)

- **Profile scope validation** - Endpoint handlers will validate with proper error messages
- **Authorization checks** - Already correct per vertical slice (belongs in handlers/filters)
- **Audit details serialization** - Current fail-fast is appropriate for MVP

### Implementation Plan

See detailed step-by-step instructions in:
- `docs/implementation-plans/phase4-fixes-final.md`

### Updated Task 4.1 Code (InvitationService)

Replace the `RevokeInvitationAsync` method in Phase 4 Task 4.1 with:

```csharp
public async Task<bool> RevokeInvitationAsync(
    Guid invitationId,
    CancellationToken cancellationToken = default
) {
    var invitation = await _dbContext.Invitation
        .FindAsync(new object[] { invitationId }, cancellationToken);

    if (invitation is null) {
        return false;
    }

    // Idempotent: already revoked is a no-op success
    if (invitation.IsRevoked) {
        _logger.LogInformation(
            "Invitation {InvitationId} is already revoked; no-op",
            invitationId
        );
        return true;
    }

    // State-transition invariant: cannot revoke accepted invitations
    if (invitation.IsAccepted) {
        _logger.LogWarning(
            "Attempt to revoke accepted invitation {InvitationId} blocked",
            invitationId
        );
        return false;
    }

    invitation.IsRevoked = true;
    invitation.RevokedAt = DateTime.UtcNow;

    await _dbContext.SaveChangesAsync(cancellationToken);

    _logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
    return true;
}
```

### Updated Task 4.3 Code (ImpersonationService)

**Add using directive:**
```csharp
using MainApi.Src.Lib.Utils;
```

**Update account selection query (around line 35):**
```csharp
var tenantAccountQuery =
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.IsSuspended == false
    orderby ua.Level descending, ua.CreatedAt ascending  // Added tie-breaker
    select ua;
```

**Update token generation (around line 85):**
```csharp
private static string GenerateSessionToken() {
    return CryptoUtils.RandomString(32);  // Matches SessionService
}
```

### Updated Task 2.1 Code (Invitation Entity)

Add unique index attribute after existing indexes:

```csharp
[Table("invitations")]
[Index(nameof(Email), nameof(Scope), nameof(IsAccepted))]
[Index(nameof(InvitedByUserId))]
[Index(nameof(ExpiresAt))]
[Index(nameof(TenantId), nameof(Scope))]
[Index(nameof(TokenHash), IsUnique = true)]  // ADDED: Performance critical
public class Invitation : BaseAttributes, IOptionalTenantEntity {
```

### Verification After Fixes

```bash
# Code quality
make check-write

# Create and apply migration
make db-add NAME=AddInvitationTokenHashUniqueIndex
make db-migrate

# Verify index in database
make dev-db
\d invitations  # Should show unique index on token_hash
```

---

## Appendix: Quick Reference

### New Files Created

```
apps/api/Src/Features/
├── Common/
│   └── Invitation/
│       ├── Invitation.cs                  # Entity (unified for all scopes)
│       └── InvitationService.cs           # Service (handles Staff/Tenant/Project)
└── Staff/
    ├── StaffProfileSeeder.cs              # Creates staff profiles (structure only)
    ├── Audit/
    │   ├── AuditLog.cs                    # Entity
    │   └── AuditLogService.cs             # Service
    ├── Notice/
    │   └── SystemNotice.cs                # Entity
    └── Impersonation/
        └── ImpersonationService.cs        # Service
```

### Modified Files

```
apps/api/Src/
├── Features/
│   └── Common/
│       ├── User/UserSeeder.cs             # MODIFIED: Add Owner from env
│       ├── Account/UserAccountSeeder.cs   # MODIFIED: Add Owner account
│       ├── Session/Session.cs             # MODIFIED: Add impersonation fields
│       └── Invitation/                    # NEW folder
│           ├── Invitation.cs              # NEW: Unified invitation entity
│           └── InvitationService.cs       # NEW: Handles all scopes
├── Data/DbContext/MainApiDbContext.cs     # MODIFIED: Register entities + constraints
├── Lib/AppEnvironment.cs                  # MODIFIED: Add env vars
└── Program.cs                             # MODIFIED: Register services

.env.development                           # MODIFIED: Add STAFF_OWNER_* vars
```

### Database Tables

```sql
invitations (unified for all scopes)
├── id (uuid, PK)
├── email (varchar)
├── scope (int)                            # 0=Staff, 1=Tenant, 2=Project
├── tenant_id (uuid, FK, nullable)         # Null for Staff
├── project_id (uuid, FK, nullable)        # Null for Staff/Tenant
├── token_hash (varchar)
├── expires_at (timestamp)
├── is_accepted (boolean)
├── accepted_at (timestamp)
├── is_revoked (boolean)
├── revoked_at (timestamp)
├── invited_by_user_id (uuid, FK)
├── profile_id (uuid, FK)
├── created_at, updated_at, is_deleted, deleted_at
└── CHECK constraints (like user_accounts):
    ├── CK_Invitation_Staff_Constraints
    ├── CK_Invitation_Tenant_Constraints
    └── CK_Invitation_Project_Constraints

audit_logs
├── id (uuid, PK)                          # Auto-generated UUID v7 by database
├── user_id (uuid, FK)
├── action (varchar)
├── target_id (uuid)
├── details (jsonb)
├── ip_address (varchar)
├── user_agent (text)
└── created_at, updated_at, is_deleted, deleted_at  # From BaseAttributes

system_notices
├── id (uuid, PK)
├── severity (int)
├── title (varchar)
├── message (text)
├── starts_at (timestamp)
├── expires_at (timestamp)
├── created_by_staff_id (uuid, FK)
└── created_at, updated_at, is_deleted, deleted_at

session (MODIFIED - added columns)
├── ... existing columns ...
├── is_impersonation (boolean)              # NEW
├── impersonating_staff_user_id (uuid, FK)  # NEW
├── impersonation_reason (text)             # NEW
└── impersonation_expires_at (timestamp)    # NEW
```
