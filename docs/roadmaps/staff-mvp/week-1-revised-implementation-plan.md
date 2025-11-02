# Staff MVP Week 1: Revised Implementation Plan (Pragmatic Approach)

**Document Version:** 2.1 (Simplified)  
**Date:** November 2, 2025  
**Status:** READY FOR IMPLEMENTATION  
**Estimated Time:** 8.5-12.5 hours (~2 focused work days)

---

## 🤖 Instructions for AI Coding Assistants

**CRITICAL:** Before implementing ANY code in this plan:

1. **Read the coding guidelines:**
   - Review `CLAUDE.md` in the project root
   - Review C# coding rules in `.cursor/rules/` folder:
     - `csharp-null-checking.mdc` - Use `is`/`is not` patterns
     - `csharp-linq-query-syntax.mdc` - Use query syntax for DB queries
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
   - Use `BaseAttributes` for all entities (automatic audit tracking)
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
STAFF_OWNER_BOOTSTRAP_CODE=ChangeMe123!@3#lol
```

**File:** `.env.production` (if exists, otherwise document for deployment)

Add:
```bash
# Staff Owner Bootstrap (CHANGE THESE IN PRODUCTION!)
STAFF_OWNER_EMAIL=owner@yourdomain.com
STAFF_OWNER_BOOTSTRAP_CODE=<generate-secure-random-string>
```

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

```csharp
using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Staff.Audit;

/// <summary>
/// Generic audit log for tracking staff actions.
/// </summary>
[Table("audit_logs")]
[Index(nameof(UserId), nameof(CreatedAt))]
[Index(nameof(Action), nameof(CreatedAt))]
[Index(nameof(TargetId))]
public class AuditLog : BaseAttributesNoKey, INoTenantEntity {
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
            UserAgent = httpContext?.Request.Headers.UserAgent.ToString()
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

### Phase 5: Verification & Testing (1-2 hours)

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
SELECT name, description, profile_scope FROM profiles 
WHERE profile_scope = 0 
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

#### Task 5.2: Remove Test Endpoints

**IMPORTANT:** After testing, remove or comment out the test endpoints before committing!

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
- [ ] **Manual testing** completed and verified
- [ ] **Test endpoints** removed before commit

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

1. **No email sending** - Invitation tokens must be shared manually for now
2. **No admin UI** - Services exist but no frontend yet (Week 2-3)
3. **Basic token security** - No rate limiting on validation attempts
4. **No unit tests** - Add in Week 2

### Future Enhancements (Later Weeks)

- Week 2: Staff invitation/authentication endpoints
- Week 2: Frontend pages for invitation acceptance
- Week 3: Email integration for sending invitations
- Week 4: Admin UI for managing invitations and viewing audit logs
- Week 5: Advanced audit log filtering and export
- Week 6: Rate limiting and brute-force protection

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
- Verify profiles exist in database: `SELECT * FROM profiles WHERE profile_scope = 0;`
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
| Phase 5: Testing | 1-2h | Low |
| **Total** | **8.5-12.5h** | **Medium** |

**Realistic estimate:** 1.5-2 focused work days (assuming 4-6 hours/day)

---

## Next Steps (Week 2 Preview)

Once Week 1 is complete, Week 2 will focus on:

1. **Invitation Endpoints:**
   - `POST /staff/invitations` - Create invitation (Owner/Admin only)
   - `GET /staff/invitations` - List invitations
   - `POST /staff/invitations/{token}/accept` - Accept invitation
   - `POST /staff/invitations/{id}/revoke` - Revoke invitation

2. **Authentication Flow:**
   - Staff login page
   - Invitation acceptance page
   - Staff dashboard with session info

3. **Frontend Integration:**
   - React components for invitation management
   - Audit log viewer
   - System notice banner

---

**Document Status:** ✅ READY FOR IMPLEMENTATION

**Next Action:** Review this plan, answer pre-implementation questions, then begin Phase 1.

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
├── id (uuid, PK)
├── user_id (uuid, FK)
├── action (varchar)
├── target_id (uuid)
├── details (jsonb)
├── ip_address (varchar)
├── user_agent (text)
└── created_at

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
