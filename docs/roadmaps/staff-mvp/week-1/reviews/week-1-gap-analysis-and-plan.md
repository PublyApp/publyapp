# Staff MVP Week 1: Gap Analysis & Implementation Plan

**Document Date:** November 2, 2025  
**Status:** Week 1 Objectives NOT MET  
**Current Branch:** develop

---

## Executive Summary

**Verdict:** Week 1 objectives have **NOT been achieved**. The codebase has baseline staff functionality (authentication, basic CRUD), but none of the Week 1 foundational data model extensions or Owner bootstrap capabilities exist.

**Completion Status:** 0% of Week 1 objectives completed

---

## Week 1 Objectives Recap

From the Staff MVP Implementation Guide, Week 1 focuses on:

> **Objectives**: Extend data model for invitations/roles and seed Owner account.

**Required Deliverables:**
1. Five new entities for staff backoffice foundation
2. EF Core migration applying cleanly
3. Owner bootstrap from environment variables
4. Token signing utilities using Data Protection
5. Unit tests for token round-trip and expiration

---

## Current State Analysis

### ✅ What EXISTS (Baseline)

#### Backend
- **User & Account System**
  - `User` entity with email, password, status
  - `UserAccount` entity with `AccountScope.Staff`, `AccountScope.Tenant`, `AccountScope.Project`
  - `AccountLevel` enum with `Admin` and `User` levels
  - Factory methods: `UserAccount.CreateStaffAccount()`
  
- **Seeding Infrastructure**
  - `IEntitySeeder` interface with automatic discovery
  - Existing seeders: `UserSeeder`, `UserAccountSeeder`, `PermissionSeeder`, `TenantSeeder`
  - `UserAccountSeeder` creates two staff accounts: `staff-admin@example.com`, `staff-user@example.com`
  - Auto-discovery via reflection in `MainApiDbContext.OnConfiguring()`

- **Staff Features**
  - `Features/Staff/StaffUser/` - Staff member management
  - `Features/Staff/TenantAsStaff/` - Tenant administration APIs
  - `Features/Staff/ProfileAsStaff/` - Profile viewing for staff

- **Database Infrastructure**
  - PostgreSQL with EF Core 9
  - UUID v7 primary keys (database-generated)
  - Soft delete support via `BaseAttributes`
  - Tenant isolation via query filters
  - `MainApiDbContext` with automatic audit field tracking

#### Frontend
- **Staff Routes**
  - `/authed/staff/dashboard` - Dashboard page
  - `/authed/staff/tenants` - Tenant management
  - `/authed/staff/staff-members` - Staff member management
  - Staff layout component

- **Auth Routes**
  - `/auth/login` - Standard login
  - `/auth/signup` - User registration
  - `/auth/reset-password` - Password reset
  - `/auth/verify-email` - Email verification

### ❌ What's MISSING (Week 1 Gaps)

#### 1. New Entities (0/5 completed)

**Missing entities that must be created:**

- **`StaffInvitation`** - Track invitation lifecycle
  - Properties: Id, Email, Role, TokenHash, ExpiresAt, AcceptedAt, InvitedBy
  - Purpose: Enable invite-based onboarding
  
- **`StaffRoleAssignment`** - Explicit role system
  - Properties: StaffUserId, Role (Owner/Admin/Support), CreatedAt, RevokedAt
  - Purpose: Replace basic AccountLevel with granular roles
  
- **`StaffAuditEntry`** - Comprehensive audit logging
  - Properties: Id, StaffUserId, ActionType, TargetType, TargetId, Metadata (JSON), CreatedAt
  - Purpose: Track all staff actions for compliance
  
- **`StaffImpersonationToken`** - Secure tenant impersonation
  - Properties: Id, TenantId, StaffUserId, ExpiresAt, Reason, TokenHash
  - Purpose: Enable support team to access tenant sessions
  
- **`SystemNotice`** - Incident/maintenance banners
  - Properties: Id, Severity, Message, StartsAt, ExpiresAt, CreatedByStaffId
  - Purpose: Display operational notices to staff

#### 2. Database Migration

**Status:** NOT CREATED

- No migration exists for new entities
- Current migration: `20251101124145_Init.cs`
- Required: `AddStaffBackofficeFoundations` migration

#### 3. Owner Bootstrap

**Status:** NOT IMPLEMENTED

**Missing components:**
- Environment variables not defined:
  - `STAFF_OWNER_EMAIL` - Owner account email
  - `STAFF_OWNER_BOOTSTRAP_CODE` - Secret code for Owner creation
- No Owner seeder in `UserAccountSeeder.cs`
- No Owner role in `StaffRoleAssignment`
- Current seeding only creates Admin/User accounts

#### 4. StaffAuthService

**Status:** NOT IMPLEMENTED

**Missing service:**
- No `StaffAuthService` class exists
- No Data Protection integration for token signing
- No token hashing utilities
- No invite token generation
- No magic-link token generation
- No impersonation token generation

#### 5. Unit Tests

**Status:** NO TEST INFRASTRUCTURE

**Findings:**
- Zero test files found in `apps/api/`
- No test project/directory
- No xUnit or NUnit packages referenced
- Testing guidelines mention "currently no automated tests are implemented"

---

## Detailed Implementation Plan for Week 1

### Phase 1: Environment & Bootstrap Setup (2-3 hours)

#### Task 1.1: Define Environment Variables

**File:** `.env.development` and `.env.production`

```bash
# Staff Owner Bootstrap
STAFF_OWNER_EMAIL=owner@publyapp.com
STAFF_OWNER_BOOTSTRAP_CODE=ChangeMe123!@3#Bootstrap
STAFF_MAGIC_LINK_SECRET=your-secure-secret-key-here
```

**File:** `apps/api/Src/Lib/AppEnvironment.cs`

Add properties:
```csharp
public static string STAFF_OWNER_EMAIL => GetRequiredEnvVar("STAFF_OWNER_EMAIL");
public static string STAFF_OWNER_BOOTSTRAP_CODE => GetRequiredEnvVar("STAFF_OWNER_BOOTSTRAP_CODE");
public static string STAFF_MAGIC_LINK_SECRET => GetRequiredEnvVar("STAFF_MAGIC_LINK_SECRET");
```

#### Task 1.2: Update AppSettings Validation

**File:** `apps/api/Src/Lib/AppSettings.cs`

Validate new variables at startup.

---

### Phase 2: Entity Creation (3-4 hours)

#### Task 2.1: Create StaffInvitation Entity

**File:** `apps/api/Src/Features/Staff/Entities/StaffInvitation.cs`

```csharp
using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Staff.Entities;

[Table("staff_invitations")]
public class StaffInvitation : BaseAttributes, INoTenantEntity {
    [Column("email")]
    public required string Email { get; set; }
    
    [Column("role")]
    public required StaffRole Role { get; set; }
    
    [Column("token_hash")]
    public required string TokenHash { get; set; }
    
    [Column("expires_at")]
    public required DateTime ExpiresAt { get; set; }
    
    [Column("accepted_at")]
    public DateTime? AcceptedAt { get; set; }
    
    [Column("invited_by_user_id")]
    public required Guid InvitedByUserId { get; set; }
    
    [JsonIgnore]
    public User InvitedByUser { get; set; } = null!;
}

public enum StaffRole {
    Owner = 100,
    Admin = 50,
    Support = 10
}
```

#### Task 2.2: Create StaffRoleAssignment Entity

**File:** `apps/api/Src/Features/Staff/Entities/StaffRoleAssignment.cs`

```csharp
[Table("staff_role_assignments")]
[Index(nameof(StaffUserId), nameof(Role), IsUnique = true)]
public class StaffRoleAssignment : BaseAttributes, INoTenantEntity {
    [Column("staff_user_id")]
    public required Guid StaffUserId { get; set; }
    
    [JsonIgnore]
    public User StaffUser { get; set; } = null!;
    
    [Column("role")]
    public required StaffRole Role { get; set; }
    
    [Column("revoked_at")]
    public DateTime? RevokedAt { get; set; }
    
    [Column("revoked_by_user_id")]
    public Guid? RevokedByUserId { get; set; }
    
    [JsonIgnore]
    public User? RevokedByUser { get; set; }
}
```

#### Task 2.3: Create StaffAuditEntry Entity

**File:** `apps/api/Src/Features/Staff/Entities/StaffAuditEntry.cs`

```csharp
[Table("staff_audit_entries")]
[Index(nameof(StaffUserId), nameof(CreatedAt))]
[Index(nameof(ActionType), nameof(CreatedAt))]
[Index(nameof(TargetType), nameof(TargetId))]
public class StaffAuditEntry : BaseAttributesNoKey, INoTenantEntity {
    [Column("staff_user_id")]
    public required Guid StaffUserId { get; set; }
    
    [JsonIgnore]
    public User StaffUser { get; set; } = null!;
    
    [Column("action_type")]
    public required StaffActionType ActionType { get; set; }
    
    [Column("target_type")]
    public required string TargetType { get; set; }  // "Tenant", "User", "StaffUser", etc.
    
    [Column("target_id")]
    public Guid? TargetId { get; set; }
    
    [Column("metadata")]
    [JsonPropertyName("metadata")]
    public string? Metadata { get; set; }  // JSON string
    
    [Column("ip_address")]
    public string? IpAddress { get; set; }
    
    [Column("user_agent")]
    public string? UserAgent { get; set; }
}

public enum StaffActionType {
    // Invitation actions
    InvitationCreated,
    InvitationAccepted,
    InvitationRevoked,
    
    // Role actions
    RoleAssigned,
    RoleRevoked,
    
    // Tenant actions
    TenantSuspended,
    TenantReactivated,
    TenantOnboardingReset,
    
    // Impersonation actions
    ImpersonationStarted,
    ImpersonationEnded,
    
    // Login actions
    LoginSucceeded,
    LoginFailed,
    
    // Other
    SystemNoticeCreated,
    SystemNoticeUpdated
}
```

#### Task 2.4: Create StaffImpersonationToken Entity

**File:** `apps/api/Src/Features/Staff/Entities/StaffImpersonationToken.cs`

```csharp
[Table("staff_impersonation_tokens")]
[Index(nameof(ExpiresAt))]
public class StaffImpersonationToken : BaseAttributes, INoTenantEntity {
    [Column("tenant_id")]
    public required Guid TenantId { get; set; }
    
    [JsonIgnore]
    public Tenant.Tenant Tenant { get; set; } = null!;
    
    [Column("staff_user_id")]
    public required Guid StaffUserId { get; set; }
    
    [JsonIgnore]
    public User StaffUser { get; set; } = null!;
    
    [Column("token_hash")]
    public required string TokenHash { get; set; }
    
    [Column("expires_at")]
    public required DateTime ExpiresAt { get; set; }
    
    [Column("reason")]
    public required string Reason { get; set; }
    
    [Column("used_at")]
    public DateTime? UsedAt { get; set; }
}
```

#### Task 2.5: Create SystemNotice Entity

**File:** `apps/api/Src/Features/Staff/Entities/SystemNotice.cs`

```csharp
[Table("system_notices")]
[Index(nameof(StartsAt), nameof(ExpiresAt))]
public class SystemNotice : BaseAttributes, INoTenantEntity {
    [Column("severity")]
    public required NoticeSeverity Severity { get; set; }
    
    [Column("message")]
    public required string Message { get; set; }
    
    [Column("starts_at")]
    public required DateTime StartsAt { get; set; }
    
    [Column("expires_at")]
    public DateTime? ExpiresAt { get; set; }
    
    [Column("created_by_staff_id")]
    public required Guid CreatedByStaffId { get; set; }
    
    [JsonIgnore]
    public User CreatedByStaff { get; set; } = null!;
}

public enum NoticeSeverity {
    Info = 0,
    Warning = 1,
    Critical = 2
}
```

---

### Phase 3: Database Integration (2 hours)

#### Task 3.1: Register Entities in DbContext

**File:** `apps/api/Src/Data/DbContext/MainApiDbContext.cs`

Add DbSet properties:
```csharp
// Staff backoffice entities
public DbSet<StaffInvitation> StaffInvitation { get; init; }
public DbSet<StaffRoleAssignment> StaffRoleAssignment { get; init; }
public DbSet<StaffAuditEntry> StaffAuditEntry { get; init; }
public DbSet<StaffImpersonationToken> StaffImpersonationToken { get; init; }
public DbSet<SystemNotice> SystemNotice { get; init; }
```

Add using statements:
```csharp
using MainApi.Src.Features.Staff.Entities;
```

#### Task 3.2: Create and Apply Migration

**Commands:**
```bash
# Create migration
make db-add NAME=AddStaffBackofficeFoundations

# Review generated migration in apps/api/Migrations/

# Apply migration
make db-migrate
```

**Expected migration operations:**
- Create 5 new tables
- Create indexes on foreign keys and lookup fields
- Add foreign key constraints

---

### Phase 4: Owner Bootstrap Seeding (2-3 hours)

#### Task 4.1: Create Owner User Seeder

**File:** `apps/api/Src/Features/Staff/Entities/OwnerSeeder.cs`

```csharp
using MainApi.Src.Data;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.Entities;

public class OwnerSeeder : IEntitySeeder {
    private readonly ILogger<OwnerSeeder> _logger;
    
    public OwnerSeeder(ILogger<OwnerSeeder>? logger = null) {
        _logger = logger ?? CreateDefaultLogger();
    }
    
    private static ILogger<OwnerSeeder> CreateDefaultLogger() {
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        return loggerFactory.CreateLogger<OwnerSeeder>();
    }
    
    public int Order => 35;  // After UserSeeder (30), before UserAccountSeeder (40)
    
    public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
        var ownerEmail = AppEnvironment.STAFF_OWNER_EMAIL;
        var bootstrapCode = AppEnvironment.STAFF_OWNER_BOOTSTRAP_CODE;
        
        // Check if owner user exists
        var existingOwner = await dbContext.User
            .Where(u => u.Email == ownerEmail)
            .FirstOrDefaultAsync(cancellationToken);
            
        if (existingOwner is not null) {
            _logger.LogInformation("Owner user already exists: {Email}", ownerEmail);
            return;
        }
        
        // Create owner user
        var passwordService = new PasswordService();
        var ownerUser = new User {
            Email = ownerEmail,
            Password = passwordService.HashPassword(bootstrapCode),
            Status = UserStatus.Active,
            FirstName = "Platform",
            LastName = "Owner",
            IsVerified = true
        };
        
        await dbContext.User.AddAsync(ownerUser, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        
        _logger.LogInformation("Created Owner user: {Email}", ownerEmail);
    }
}
```

#### Task 4.2: Create Owner Account & Role Seeder

**File:** `apps/api/Src/Features/Staff/Entities/OwnerAccountSeeder.cs`

```csharp
public class OwnerAccountSeeder : IEntitySeeder {
    private readonly ILogger<OwnerAccountSeeder> _logger;
    
    public OwnerAccountSeeder(ILogger<OwnerAccountSeeder>? logger = null) {
        _logger = logger ?? CreateDefaultLogger();
    }
    
    private static ILogger<OwnerAccountSeeder> CreateDefaultLogger() {
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddConsole());
        return loggerFactory.CreateLogger<OwnerAccountSeeder>();
    }
    
    public int Order => 45;  // After UserAccountSeeder (40)
    
    public async Task SeedAsync(MainApiDbContext dbContext, CancellationToken cancellationToken = default) {
        var ownerEmail = AppEnvironment.STAFF_OWNER_EMAIL;
        
        // Get owner user
        var ownerUser = await dbContext.User
            .Where(u => u.Email == ownerEmail)
            .FirstOrDefaultAsync(cancellationToken);
            
        if (ownerUser is null || ownerUser.Id is null) {
            _logger.LogWarning("Owner user not found. Skipping Owner account creation.");
            return;
        }
        
        var ownerId = ownerUser.Id.Value;
        
        // Check if owner account exists
        var existingAccount = await dbContext.UserAccount
            .Where(ua => ua.UserId == ownerId && ua.Scope == AccountScope.Staff)
            .FirstOrDefaultAsync(cancellationToken);
            
        if (existingAccount is null) {
            var ownerAccount = UserAccount.CreateStaffAccount(ownerId, AccountLevel.Admin);
            await dbContext.UserAccount.AddAsync(ownerAccount, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Created Owner staff account");
        }
        
        // Check if owner role assignment exists
        var existingRole = await dbContext.StaffRoleAssignment
            .Where(sra => sra.StaffUserId == ownerId)
            .FirstOrDefaultAsync(cancellationToken);
            
        if (existingRole is null) {
            var ownerRole = new StaffRoleAssignment {
                StaffUserId = ownerId,
                Role = StaffRole.Owner,
                RevokedAt = null
            };
            await dbContext.StaffRoleAssignment.AddAsync(ownerRole, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Assigned Owner role");
        }
    }
}
```

---

### Phase 5: Token Signing Service (4-5 hours)

#### Task 5.1: Create StaffAuthService

**File:** `apps/api/Src/Features/Staff/Auth/StaffAuthService.cs`

```csharp
using Microsoft.AspNetCore.DataProtection;
using System.Security.Cryptography;
using System.Text;

namespace MainApi.Src.Features.Staff.Auth;

public interface IStaffAuthService {
    string GenerateInviteToken(string email, StaffRole role);
    (string Email, StaffRole Role)? ValidateInviteToken(string token);
    
    string GenerateMagicLinkToken(string email);
    string? ValidateMagicLinkToken(string token);
    
    string GenerateImpersonationToken(Guid tenantId, Guid staffUserId);
    (Guid TenantId, Guid StaffUserId)? ValidateImpersonationToken(string token);
    
    string HashToken(string token);
}

public class StaffAuthService : IStaffAuthService {
    private readonly IDataProtector _inviteProtector;
    private readonly IDataProtector _magicLinkProtector;
    private readonly IDataProtector _impersonationProtector;
    private readonly TimeProvider _timeProvider;
    
    public StaffAuthService(
        IDataProtectionProvider dataProtection,
        TimeProvider? timeProvider = null
    ) {
        _inviteProtector = dataProtection.CreateProtector("StaffInvite");
        _magicLinkProtector = dataProtection.CreateProtector("StaffMagicLink");
        _impersonationProtector = dataProtection.CreateProtector("StaffImpersonation");
        _timeProvider = timeProvider ?? TimeProvider.System;
    }
    
    // Invite tokens: email|role|expiresAt
    public string GenerateInviteToken(string email, StaffRole role) {
        var expiresAt = _timeProvider.GetUtcNow().AddDays(7).UtcDateTime;
        var payload = $"{email}|{(int)role}|{expiresAt:o}";
        return _inviteProtector.Protect(payload);
    }
    
    public (string Email, StaffRole Role)? ValidateInviteToken(string token) {
        try {
            var payload = _inviteProtector.Unprotect(token);
            var parts = payload.Split('|');
            if (parts.Length != 3) return null;
            
            var email = parts[0];
            var role = (StaffRole)int.Parse(parts[1]);
            var expiresAt = DateTime.Parse(parts[2]);
            
            if (_timeProvider.GetUtcNow().UtcDateTime > expiresAt) {
                return null;  // Expired
            }
            
            return (email, role);
        } catch {
            return null;
        }
    }
    
    // Magic link tokens: email|expiresAt
    public string GenerateMagicLinkToken(string email) {
        var expiresAt = _timeProvider.GetUtcNow().AddMinutes(15).UtcDateTime;
        var payload = $"{email}|{expiresAt:o}";
        return _magicLinkProtector.Protect(payload);
    }
    
    public string? ValidateMagicLinkToken(string token) {
        try {
            var payload = _magicLinkProtector.Unprotect(token);
            var parts = payload.Split('|');
            if (parts.Length != 2) return null;
            
            var email = parts[0];
            var expiresAt = DateTime.Parse(parts[1]);
            
            if (_timeProvider.GetUtcNow().UtcDateTime > expiresAt) {
                return null;  // Expired
            }
            
            return email;
        } catch {
            return null;
        }
    }
    
    // Impersonation tokens: tenantId|staffUserId|expiresAt
    public string GenerateImpersonationToken(Guid tenantId, Guid staffUserId) {
        var expiresAt = _timeProvider.GetUtcNow().AddHours(1).UtcDateTime;
        var payload = $"{tenantId}|{staffUserId}|{expiresAt:o}";
        return _impersonationProtector.Protect(payload);
    }
    
    public (Guid TenantId, Guid StaffUserId)? ValidateImpersonationToken(string token) {
        try {
            var payload = _impersonationProtector.Unprotect(token);
            var parts = payload.Split('|');
            if (parts.Length != 3) return null;
            
            var tenantId = Guid.Parse(parts[0]);
            var staffUserId = Guid.Parse(parts[1]);
            var expiresAt = DateTime.Parse(parts[2]);
            
            if (_timeProvider.GetUtcNow().UtcDateTime > expiresAt) {
                return null;  // Expired
            }
            
            return (tenantId, staffUserId);
        } catch {
            return null;
        }
    }
    
    // Hash token for database storage (SHA256)
    public string HashToken(string token) {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
```

#### Task 5.2: Register Service in DI

**File:** `apps/api/Src/Extensions/ServiceCollectionExtensions.cs` (or Program.cs)

```csharp
// Add Data Protection
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(AppEnvironment.DATA_PROTECTION_KEY_PATH))
    .SetApplicationName("PublyApp");

// Register staff auth service
builder.Services.AddSingleton<IStaffAuthService, StaffAuthService>();
builder.Services.AddSingleton(TimeProvider.System);
```

---

### Phase 6: Unit Testing Infrastructure (5-6 hours)

#### Task 6.1: Create Test Project

**Commands:**
```bash
cd apps/api
dotnet new xunit -n Tests
cd Tests
dotnet add package Microsoft.EntityFrameworkCore.InMemory
dotnet add package FluentAssertions
dotnet add package Moq
```

**Update solution:**
```bash
dotnet sln add apps/api/Tests/Tests.csproj
```

#### Task 6.2: Create StaffAuthService Tests

**File:** `apps/api/Tests/Features/Staff/Auth/StaffAuthServiceTests.cs`

```csharp
using FluentAssertions;
using MainApi.Src.Features.Staff.Auth;
using MainApi.Src.Features.Staff.Entities;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace PublyApp.Api.Tests.Features.Staff.Auth;

public class StaffAuthServiceTests {
    private readonly IStaffAuthService _service;
    private readonly FakeTimeProvider _timeProvider;
    
    public StaffAuthServiceTests() {
        var services = new ServiceCollection();
        services.AddDataProtection();
        var provider = services.BuildServiceProvider();
        
        _timeProvider = new FakeTimeProvider(new DateTimeOffset(2025, 11, 1, 12, 0, 0, TimeSpan.Zero));
        _service = new StaffAuthService(
            provider.GetRequiredService<IDataProtectionProvider>(),
            _timeProvider
        );
    }
    
    [Fact]
    public void GenerateInviteToken_ShouldReturnNonEmptyString() {
        // Arrange
        var email = "test@example.com";
        var role = StaffRole.Admin;
        
        // Act
        var token = _service.GenerateInviteToken(email, role);
        
        // Assert
        token.Should().NotBeNullOrEmpty();
    }
    
    [Fact]
    public void ValidateInviteToken_WithValidToken_ShouldReturnEmailAndRole() {
        // Arrange
        var email = "test@example.com";
        var role = StaffRole.Support;
        var token = _service.GenerateInviteToken(email, role);
        
        // Act
        var result = _service.ValidateInviteToken(token);
        
        // Assert
        result.Should().NotBeNull();
        result.Value.Email.Should().Be(email);
        result.Value.Role.Should().Be(role);
    }
    
    [Fact]
    public void ValidateInviteToken_WithExpiredToken_ShouldReturnNull() {
        // Arrange
        var email = "test@example.com";
        var token = _service.GenerateInviteToken(email, StaffRole.Admin);
        
        // Advance time by 8 days (invite expires after 7 days)
        _timeProvider.Advance(TimeSpan.FromDays(8));
        
        // Act
        var result = _service.ValidateInviteToken(token);
        
        // Assert
        result.Should().BeNull();
    }
    
    [Fact]
    public void ValidateInviteToken_WithInvalidToken_ShouldReturnNull() {
        // Act
        var result = _service.ValidateInviteToken("invalid-token");
        
        // Assert
        result.Should().BeNull();
    }
    
    [Fact]
    public void GenerateMagicLinkToken_ShouldReturnNonEmptyString() {
        // Arrange
        var email = "test@example.com";
        
        // Act
        var token = _service.GenerateMagicLinkToken(email);
        
        // Assert
        token.Should().NotBeNullOrEmpty();
    }
    
    [Fact]
    public void ValidateMagicLinkToken_WithValidToken_ShouldReturnEmail() {
        // Arrange
        var email = "test@example.com";
        var token = _service.GenerateMagicLinkToken(email);
        
        // Act
        var result = _service.ValidateMagicLinkToken(token);
        
        // Assert
        result.Should().Be(email);
    }
    
    [Fact]
    public void ValidateMagicLinkToken_WithExpiredToken_ShouldReturnNull() {
        // Arrange
        var email = "test@example.com";
        var token = _service.GenerateMagicLinkToken(email);
        
        // Advance time by 20 minutes (magic link expires after 15 minutes)
        _timeProvider.Advance(TimeSpan.FromMinutes(20));
        
        // Act
        var result = _service.ValidateMagicLinkToken(token);
        
        // Assert
        result.Should().BeNull();
    }
    
    [Fact]
    public void HashToken_ShouldProduceDeterministicHash() {
        // Arrange
        var token = "test-token-12345";
        
        // Act
        var hash1 = _service.HashToken(token);
        var hash2 = _service.HashToken(token);
        
        // Assert
        hash1.Should().Be(hash2);
        hash1.Should().NotBeNullOrEmpty();
        hash1.Length.Should().Be(64);  // SHA256 hex string length
    }
    
    [Fact]
    public void HashToken_DifferentTokens_ShouldProduceDifferentHashes() {
        // Arrange
        var token1 = "token-1";
        var token2 = "token-2";
        
        // Act
        var hash1 = _service.HashToken(token1);
        var hash2 = _service.HashToken(token2);
        
        // Assert
        hash1.Should().NotBe(hash2);
    }
    
    [Fact]
    public void GenerateImpersonationToken_ShouldReturnNonEmptyString() {
        // Arrange
        var tenantId = Guid.NewGuid();
        var staffUserId = Guid.NewGuid();
        
        // Act
        var token = _service.GenerateImpersonationToken(tenantId, staffUserId);
        
        // Assert
        token.Should().NotBeNullOrEmpty();
    }
    
    [Fact]
    public void ValidateImpersonationToken_WithValidToken_ShouldReturnTenantAndStaffId() {
        // Arrange
        var tenantId = Guid.NewGuid();
        var staffUserId = Guid.NewGuid();
        var token = _service.GenerateImpersonationToken(tenantId, staffUserId);
        
        // Act
        var result = _service.ValidateImpersonationToken(token);
        
        // Assert
        result.Should().NotBeNull();
        result.Value.TenantId.Should().Be(tenantId);
        result.Value.StaffUserId.Should().Be(staffUserId);
    }
    
    [Fact]
    public void ValidateImpersonationToken_WithExpiredToken_ShouldReturnNull() {
        // Arrange
        var tenantId = Guid.NewGuid();
        var staffUserId = Guid.NewGuid();
        var token = _service.GenerateImpersonationToken(tenantId, staffUserId);
        
        // Advance time by 2 hours (impersonation token expires after 1 hour)
        _timeProvider.Advance(TimeSpan.FromHours(2));
        
        // Act
        var result = _service.ValidateImpersonationToken(token);
        
        // Assert
        result.Should().BeNull();
    }
}

// Test helper for time manipulation
public class FakeTimeProvider : TimeProvider {
    private DateTimeOffset _currentTime;
    
    public FakeTimeProvider(DateTimeOffset startTime) {
        _currentTime = startTime;
    }
    
    public override DateTimeOffset GetUtcNow() => _currentTime;
    
    public void Advance(TimeSpan duration) {
        _currentTime = _currentTime.Add(duration);
    }
}
```

#### Task 6.3: Run Tests

**Commands:**
```bash
dotnet test apps/api/Tests/Tests.csproj
```

**Expected results:**
- 12 tests passing
- 0 failures
- Coverage of token generation, validation, expiration, and hashing

---

## Acceptance Criteria Checklist

### ✅ Completion Criteria

- [ ] **Entities Created** - All 5 entities exist with proper attributes
- [ ] **Migration Applied** - `AddStaffBackofficeFoundations` migration runs cleanly
- [ ] **DbContext Updated** - All entities registered with DbSets
- [ ] **Owner Bootstrap** - Environment variables read and Owner created on seed
- [ ] **StaffAuthService** - Service generates and validates all token types
- [ ] **Token Hashing** - SHA256 hashing for database persistence
- [ ] **Unit Tests** - Minimum 10 tests covering token lifecycle
- [ ] **Tests Pass** - All unit tests green in CI/CD
- [ ] **Documentation Updated** - CLAUDE.md reflects new entities and services

---

## Estimated Timeline

| Phase | Tasks | Time Estimate | Priority |
|-------|-------|---------------|----------|
| Phase 1: Environment Setup | 1.1-1.2 | 2-3 hours | P0 |
| Phase 2: Entity Creation | 2.1-2.5 | 3-4 hours | P0 |
| Phase 3: Database Integration | 3.1-3.2 | 2 hours | P0 |
| Phase 4: Owner Bootstrap | 4.1-4.2 | 2-3 hours | P0 |
| Phase 5: Token Service | 5.1-5.2 | 4-5 hours | P0 |
| Phase 6: Unit Tests | 6.1-6.3 | 5-6 hours | P1 |

**Total:** 18-23 hours (~3-4 days of focused development)

---

## Risk Mitigation

### Technical Risks

1. **Data Protection Key Persistence**
   - **Risk:** Keys not persisting between deployments
   - **Mitigation:** Configure persistent storage in production (Azure Key Vault, AWS Secrets Manager)

2. **Migration Conflicts**
   - **Risk:** Concurrent development causing migration conflicts
   - **Mitigation:** Create migration on dedicated branch, merge quickly

3. **Test Flakiness**
   - **Risk:** Time-dependent tests failing intermittently
   - **Mitigation:** Use FakeTimeProvider for deterministic testing

### Process Risks

1. **Scope Creep**
   - **Risk:** Adding Week 2 features prematurely
   - **Mitigation:** Strictly follow Week 1 definition; defer endpoints to Week 2

2. **Production Secrets**
   - **Risk:** Bootstrap code committed to repo
   - **Mitigation:** Use `.env.production` (gitignored), document rotation procedure

---

## Next Steps After Week 1

Once Week 1 is complete, proceed to **Week 2: Authentication flows & middleware hardening**:

- Invite creation endpoint (`POST /staff/invitations`)
- Magic-link request/consumption endpoints
- Update `StaffAuthenticationMiddleware`
- Frontend auth pages (`/auth/staff/login`, `/auth/staff/invite`)
- Cypress/Playwright E2E tests

---

## Appendix: File Tree After Week 1

```
apps/api/Src/
├── Features/
│   └── Staff/
│       ├── Entities/
│       │   ├── StaffInvitation.cs          ← NEW
│       │   ├── StaffRoleAssignment.cs      ← NEW
│       │   ├── StaffAuditEntry.cs          ← NEW
│       │   ├── StaffImpersonationToken.cs  ← NEW
│       │   ├── SystemNotice.cs             ← NEW
│       │   ├── OwnerSeeder.cs              ← NEW
│       │   └── OwnerAccountSeeder.cs       ← NEW
│       ├── Auth/
│       │   └── StaffAuthService.cs         ← NEW
│       ├── StaffUser/
│       ├── TenantAsStaff/
│       └── ProfileAsStaff/
├── Data/
│   └── DbContext/
│       └── MainApiDbContext.cs             ← MODIFIED (add DbSets)
├── Lib/
│   ├── AppEnvironment.cs                   ← MODIFIED (add env vars)
│   └── AppSettings.cs                      ← MODIFIED (add validation)
└── Migrations/
    └── YYYYMMDDHHMMSS_AddStaffBackofficeFoundations.cs  ← NEW

apps/api/Tests/                              ← NEW
├── Features/
│   └── Staff/
│       └── Auth/
│           └── StaffAuthServiceTests.cs    ← NEW
└── Tests.csproj                            ← NEW

.env.development                             ← MODIFIED (add staff vars)
```

---

## Questions & Decisions Required

Before starting implementation:

1. **Owner Email:** What production email should be used for `STAFF_OWNER_EMAIL`?
2. **Bootstrap Code:** Should Owner be able to change password after first login?
3. **Data Protection Keys:** Where should keys be persisted in production (file system, Key Vault)?
4. **Token Expiration Times:** Are defaults acceptable (7d invite, 15m magic link, 1h impersonation)?
5. **Test Coverage Target:** Is 80%+ code coverage expected for Week 1?

---

**Document Status:** READY FOR IMPLEMENTATION  
**Next Action:** Review plan with stakeholders, then begin Phase 1
