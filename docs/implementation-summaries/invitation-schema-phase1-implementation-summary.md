# Phase 1 Implementation Summary: Invitation Schema Migration

## Overview

This document summarizes the implementation of Phase 1 of the [invitation-schema-migration-plan.md](../implementation-plans/invitation-schema-migration-plan.md), which migrates the Invitation-Profile relationship from one-to-many to many-to-many via a junction table.

## Problem Statement

The original `Invitation` entity had a single `ProfileId` property, creating a one-to-many relationship. This was flawed because:

- **Business requirement**: Users can have up to 5 profiles
- **UX problem**: Inviting someone with multiple profiles required creating multiple invitation entities for the same email
- **Confusion**: Which token should be sent to the user? Multiple tokens for one email is poor UX
- **Data integrity**: One email = one invitation (with multiple profiles)

## Solution

Introduce a junction table `InvitationProfile` to enable many-to-many relationship between Invitations and Profiles.

---

## Files Created

### 1. `apps/api/Src/Features/Common/Invitation/InvitationProfile.cs`

**Purpose**: New junction table entity linking invitations to multiple profiles.

**Initial Implementation (by Cursor)**:
```csharp
[Table("invitation_profiles")]
public class InvitationProfile : BaseAttributes, INoTenantEntity {
    [Column("invitation_id")]
    public required Guid InvitationId { get; set; }

    [Column("profile_id")]
    public required Guid ProfileId { get; set; }
}
```

**Problem Found**: Inheriting from `BaseAttributes` added unnecessary columns:
- `id` (uuid) - redundant for junction table
- `is_deleted`, `deleted_at` - soft delete not needed for junction tables

**Corrected Implementation**:
```csharp
[Table("invitation_profiles")]
public class InvitationProfile : INoTenantEntity {
    [Column("invitation_id")]
    public required Guid InvitationId { get; set; }

    [JsonIgnore]
    [ForeignKey(nameof(InvitationId))]
    public Invitation Invitation { get; set; } = null!;

    [Column("profile_id")]
    public required Guid ProfileId { get; set; }

    [JsonIgnore]
    [ForeignKey(nameof(ProfileId))]
    public ProfileEntity Profile { get; set; } = null!;

    // Timestamp columns (cannot inherit from BaseAttributes due to composite PK)
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
```

**Key Changes**:
- ❌ Removed `BaseAttributes` inheritance
- ✅ Kept `INoTenantEntity` interface (required by DbContext)
- ✅ Added manual timestamp columns
- ✅ Added navigation properties for EF Core relationships

**Why**: Junction tables should use composite primary key (invitation_id, profile_id) without a separate id column. This is the correct pattern for many-to-many relationships.

---

## Files Modified

### 2. `apps/api/Src/Features/Common/Invitation/Invitation.cs`

**Changes**:

#### Added junction table navigation
```csharp
// Multiple profiles via junction table
[JsonIgnore]
public ICollection<InvitationProfile> InvitationProfiles { get; set; } = new List<InvitationProfile>();

// Helper property for easy access
[NotMapped]
public List<Guid> ProfileIds => InvitationProfiles.Select(ip => ip.ProfileId).ToList();
```

#### Updated factory methods to accept multiple profiles

**New method**:
```csharp
public static Invitation CreateStaffInvitationWithProfiles(
    string email,
    List<Guid> profileIds,  // ✅ Changed from single Guid
    Guid invitedByUserId,
    DateTime expiresAt,
    string token
) {
    var invitation = new Invitation {
        Email = email.ToLowerInvariant(),
        Scope = InvitationScope.Staff,
        TenantId = null,
        ProjectId = null,
        InvitedByUserId = invitedByUserId,
        ExpiresAt = expiresAt,
        Token = token,
    };

    // Add profiles via junction table
    foreach (var profileId in profileIds) {
        invitation.InvitationProfiles.Add(new InvitationProfile {
            InvitationId = default!, // Will be set by EF Core when invitation is saved
            ProfileId = profileId
        });
    }

    return invitation;
}
```

**Similar updates made to**:
- `CreateTenantInvitationWithProfiles()`
- `CreateProjectInvitationWithProfiles()`

#### Marked old methods as obsolete
```csharp
[Obsolete("Use CreateStaffInvitationWithProfiles instead")]
public static Invitation CreateStaffInvitation(string email, Guid profileId, ...)

[Obsolete("Use CreateTenantInvitationWithProfiles instead")]
public static Invitation CreateTenantInvitation(string email, Guid tenantId, Guid profileId, ...)

[Obsolete("Use CreateProjectInvitationWithProfiles instead")]
public static Invitation CreateProjectInvitation(string email, Guid tenantId, Guid projectId, Guid profileId, ...)
```

---

### 3. `apps/api/Src/Features/Common/Invitation/InvitationService.cs`

**Changes**:

#### Updated CreateStaffInvitationAsync signature
```csharp
// New signature
public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
    string email,
    List<Guid> profileIds,  // ✅ Changed from Guid profileId
    Guid invitedByUserId,
    CancellationToken cancellationToken = default)
{
    // ... generates token
    var invitation = Invitation.CreateStaffInvitationWithProfiles(
        email,
        profileIds,  // ✅ Pass list of profiles
        invitedByUserId,
        expiresAt,
        token
    );
    // ... saves and returns
}

// Backward-compatible obsolete overload
[Obsolete("Use CreateStaffInvitationAsync with List<Guid> instead")]
public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
    string email,
    Guid profileId,
    Guid invitedByUserId,
    CancellationToken cancellationToken = default)
{
    return await CreateStaffInvitationAsync(
        email,
        new List<Guid> { profileId },  // Wrap in list
        invitedByUserId,
        cancellationToken
    );
}
```

**Similar updates made to**:
- `CreateTenantInvitationAsync()`
- `CreateProjectInvitationAsync()`

#### Updated FindStaffInvitationsAsync to load profiles

**Added profile name loading**:
```csharp
// Load profile names for each invitation via junction table
var invitationIds = results.Select(r => r.Invitation.GetRequiredId()).ToList();

var profileNamesQuery =
    from ip in _dbContext.InvitationProfile
    where invitationIds.Contains(ip.InvitationId)
    join p in _dbContext.Profile on ip.ProfileId equals p.Id
    select new {
        InvitationId = ip.InvitationId,
        ProfileName = p.Name
    };

var profileNames = await profileNamesQuery.ToListAsync(cancellationToken);

var profileNamesByInvitation = profileNames
    .GroupBy(pn => pn.InvitationId)
    .ToDictionary(
        g => g.Key,
        g => string.Join(", ", g.Select(x => x.ProfileName))
    );

// Attach profile names to DTOs
foreach (var result in results) {
    var invitationId = result.Invitation.GetRequiredId();
    result.ProfileName = profileNamesByInvitation.GetValueOrDefault(invitationId) ?? "Unknown";
}
```

#### Updated AcceptStaffInvitationAsync to assign all profiles

**Changed from single profile assignment to multiple**:
```csharp
// OLD: Single profile
// await _dbContext.UserAccountProfile.AddAsync(
//     new UserAccountProfile {
//         UserAccountId = account.GetRequiredId(),
//         ProfileId = invitation.ProfileId  // ❌ Single profile only
//     },
//     cancellationToken
// );

// NEW: All profiles from invitation
// Load invitation profiles
var invitationProfiles = await (
    from ip in _dbContext.InvitationProfile
    where ip.InvitationId == invitation.GetRequiredId()
    select ip
).ToListAsync(cancellationToken);

// Assign ALL profiles from the invitation
foreach (var invitationProfile in invitationProfiles) {
    await _dbContext.UserAccountProfile.AddAsync(
        new UserAccountProfile {
            UserAccountId = account.GetRequiredId(),
            ProfileId = invitationProfile.ProfileId  // ✅ Each profile
        },
        cancellationToken
    );
}
```

**Similar updates made to**:
- `AcceptTenantInvitationAsync()`
- `AcceptProjectInvitationAsync()`

---

### 4. `apps/api/Src/Data/DbContext/MainApiDbContext.cs`

**Changes**:

#### Added DbSet
```csharp
public DbSet<InvitationProfile> InvitationProfile { get; init; }
```

#### Configured junction table relationship
```csharp
// Configure InvitationProfile junction table
modelBuilder.Entity<InvitationProfile>(entity => {
    // Composite primary key
    entity.HasKey(e => new { e.InvitationId, e.ProfileId });

    // Invitation side
    entity.HasOne(e => e.Invitation)
        .WithMany(i => i.InvitationProfiles)
        .HasForeignKey(e => e.InvitationId)
        .OnDelete(DeleteBehavior.Cascade);  // Delete profiles when invitation deleted

    // Profile side
    entity.HasOne(e => e.Profile)
        .WithMany()
        .HasForeignKey(e => e.ProfileId)
        .OnDelete(DeleteBehavior.Restrict);  // Don't delete profile when invitation deleted
});
```

---

### 5. `apps/api/Src/Features/Staff/Invitations/Handlers/CreateStaffInvitation.cs`

**Changes**:

#### Updated to use new API
```csharp
// Create invitation via service
var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
    email,
    new List<Guid> { profileId },  // ✅ Wrap single profileId in list
    account.UserId,
    cancellationToken
);
```

---

## Database Migration

### 6. `apps/api/Migrations/20251129173120_Init.cs`

**Note**: This is a fresh migration created after dropping the database due to the InvitationProfile entity fix.

**invitation_profiles table schema**:
```sql
CREATE TABLE invitation_profiles (
    invitation_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,

    -- Composite primary key (no separate id!)
    CONSTRAINT pk_invitation_profiles
        PRIMARY KEY (invitation_id, profile_id),

    -- Foreign keys
    CONSTRAINT fk_invitation_profiles_invitations_invitation_id
        FOREIGN KEY (invitation_id)
        REFERENCES invitations (id)
        ON DELETE CASCADE,

    CONSTRAINT fk_invitation_profiles_profiles_profile_id
        FOREIGN KEY (profile_id)
        REFERENCES profiles (id)
        ON DELETE RESTRICT
);
```

**Key Points**:
- ✅ Composite primary key (invitation_id, profile_id)
- ✅ No separate id column
- ✅ No is_deleted or deleted_at columns
- ✅ Cascade delete when invitation deleted
- ✅ Restrict delete when profile deleted (don't orphan invitations)

---

## Issues Found and Fixed

### Issue 1: InvitationProfile inheriting from BaseAttributes

**Problem**:
Cursor's initial implementation had `InvitationProfile` inheriting from `BaseAttributes`, which added:
- `id` column (uuid) - redundant for junction table
- `is_deleted`, `deleted_at` columns - soft delete not needed

**Migration showed**:
```csharp
columns: table => new {
    invitation_id = ...,
    profile_id = ...,
    created_at = ...,
    updated_at = ...,
    is_deleted = ...,        // ❌ Unnecessary
    deleted_at = ...,        // ❌ Unnecessary
    id = table.Column<Guid>(type: "uuid", nullable: true, defaultValueSql: "uuidv7()")  // ❌ Unnecessary
}
```

**Fix Applied**:
1. Removed `BaseAttributes` inheritance
2. Kept `INoTenantEntity` interface (required by DbContext)
3. Added manual timestamp columns
4. Dropped database and regenerated migration

**Result**: Clean junction table with only necessary columns.

### Issue 2: DbContext required INoTenantEntity

**Problem**:
After removing `BaseAttributes`, compilation failed because DbContext requires all entities to implement one of:
- `ITenantEntity`
- `IOptionalTenantEntity`
- `INoTenantEntity`

**Error**:
```
Unable to create a 'DbContext' of type 'MainApiDbContext'.
The exception 'InvitationProfile must implement ITenantEntity, IOptionalTenantEntity, or INoTenantEntity' was thrown
```

**Fix Applied**:
Kept the `INoTenantEntity` interface while removing `BaseAttributes`:
```csharp
public class InvitationProfile : INoTenantEntity {
    // No BaseAttributes
}
```

---

## Testing Performed

1. **Database drop and recreation**: Verified clean schema generation
2. **Migration application**: Confirmed migration applied successfully
3. **Composite PK verification**: Inspected generated SQL to confirm composite primary key

---

## Current State

✅ **Phase 1 Complete**

All Phase 1 changes have been implemented and staged in git:

- ✅ InvitationProfile junction table created with correct schema
- ✅ Invitation entity updated with InvitationProfiles navigation
- ✅ Factory methods updated to accept List<Guid> profileIds
- ✅ Old single-profile methods marked as obsolete
- ✅ InvitationService updated to use new schema
- ✅ AcceptInvitationAsync updated to assign all profiles
- ✅ FindInvitationsAsync updated to load profile names via junction
- ✅ DbContext configured with composite PK
- ✅ Fresh migration generated with correct schema

---

## Next Steps (Future Phases)

### Phase 2: Update Invitation Creation Endpoints
- Update POST endpoints to accept `List<Guid> profileIds` in request body
- Update validators to validate profile list
- Update handlers to use new service methods
- Mark old endpoints as deprecated

### Phase 3: Update Invitation Acceptance
- Already handled in Phase 1 (AcceptInvitationAsync assigns all profiles)

### Phase 4: Remove Deprecated Code
- Remove obsolete factory methods
- Remove obsolete service method overloads
- Remove old single-profile endpoints

---

## Related Documentation

- Original plan: [invitation-schema-migration-plan.md](../implementation-plans/invitation-schema-migration-plan.md)
- Related plan: [bulk-staff-invitations-endpoint-plan-revised.md](../implementation-plans/bulk-staff-invitations-endpoint-plan-revised.md)

---

## Junction Table Pattern Established

This implementation establishes the **correct pattern** for junction tables in this codebase:

### ✅ Correct Pattern (InvitationProfile)
```csharp
[Table("table_name")]
public class JunctionTable : INoTenantEntity {  // No BaseAttributes!
    [Column("foreign_key_1")]
    public required Guid ForeignKey1 { get; set; }

    [Column("foreign_key_2")]
    public required Guid ForeignKey2 { get; set; }

    // Manual timestamps
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // DbContext configuration:
    // entity.HasKey(e => new { e.ForeignKey1, e.ForeignKey2 });
}
```

### ❌ Flawed Pattern (Legacy - needs refactoring)

The following junction tables still use the old pattern and should be refactored in the future (see GitHub issue #123):

1. **UserAccountProfile** - has separate id PK instead of composite (user_account_id, profile_id)
2. **ProfilePermission** - has separate id PK instead of composite (profile_id, permission_key)

---

## Summary

Phase 1 successfully migrated the Invitation-Profile relationship from one-to-many to many-to-many. The implementation:

- Fixes the fundamental UX problem (one invitation per email, multiple profiles)
- Follows database design best practices (composite PK for junction tables)
- Maintains backward compatibility with obsolete method overloads
- Establishes the correct junction table pattern for future development
- All changes are staged and ready for commit
