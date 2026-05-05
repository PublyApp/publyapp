## Invitation Schema Migration Plan – Fix Invitation-Profile Relationship

### Problem Statement

**Current Schema (WRONG):**
```
Invitation {
    Id (PK)
    Email
    Token (Unique)
    ProfileId (FK) ← ONE profile per invitation
    ...
}
```

**Issues:**
1. ❌ Inviting someone to 2 profiles creates 2 separate `Invitation` entities with 2 different tokens
2. ❌ Which token do we send in the email? Both? One?
3. ❌ If they click token A, do they get both profiles or just one?
4. ❌ Poor UX - confusing for both sender and recipient
5. ❌ Violates business rule: users can have up to 5 profiles, invitations should too

**Correct Schema:**
```
Invitation {
    Id (PK)
    Email
    Token (Unique) ← ONE token per email
    ... (no ProfileId!)
}

InvitationProfile (junction table) {
    InvitationId (FK) ← Many-to-many
    ProfileId (FK)
}
```

**Benefits:**
1. ✅ One invitation per email → one token
2. ✅ Clear UX: send one email with one link
3. ✅ User accepts once → gets all assigned profiles
4. ✅ Matches business model: accounts can have multiple profiles

---

### Migration Strategy

**Approach:** Zero-downtime migration with backwards compatibility during transition.

**Timeline:**
1. **Phase 1:** Add new schema (non-breaking)
2. **Phase 2:** Migrate existing data
3. **Phase 3:** Update application code
4. **Phase 4:** Remove old schema (breaking)

---

### Phase 1: Add New Schema (Non-Breaking)

#### 1.1 Create Migration

File: `apps/api/Src/Data/Migrations/YYYYMMDDHHMMSS_AddInvitationProfilesJunctionTable.cs`

```csharp
using Microsoft.EntityFrameworkCore.Migrations;

public partial class AddInvitationProfilesJunctionTable : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Create junction table
        migrationBuilder.CreateTable(
            name: "invitation_profiles",
            columns: table => new
            {
                invitation_id = table.Column<Guid>(nullable: false),
                profile_id = table.Column<Guid>(nullable: false),
                created_at = table.Column<DateTime>(nullable: false, defaultValueSql: "GETUTCDATE()"),
                updated_at = table.Column<DateTime>(nullable: false, defaultValueSql: "GETUTCDATE()")
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_invitation_profiles", x => new { x.invitation_id, x.profile_id });
                table.ForeignKey(
                    name: "FK_invitation_profiles_invitations_invitation_id",
                    column: x => x.invitation_id,
                    principalTable: "invitations",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_invitation_profiles_profiles_profile_id",
                    column: x => x.profile_id,
                    principalTable: "profiles",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
            });

        // Create indexes
        migrationBuilder.CreateIndex(
            name: "IX_invitation_profiles_profile_id",
            table: "invitation_profiles",
            column: "profile_id");

        migrationBuilder.CreateIndex(
            name: "IX_invitation_profiles_invitation_id_profile_id",
            table: "invitation_profiles",
            columns: new[] { "invitation_id", "profile_id" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "invitation_profiles");
    }
}
```

**Note:** Keep `profile_id` column on `invitations` table for now (backwards compatibility).

---

### Phase 2: Migrate Existing Data

#### 2.1 Data Migration Script

File: `apps/api/Src/Data/Migrations/YYYYMMDDHHMMSS_MigrateInvitationProfilesToJunctionTable.cs`

```csharp
using Microsoft.EntityFrameworkCore.Migrations;

public partial class MigrateInvitationProfilesToJunctionTable : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Copy existing invitation-profile relationships to junction table
        migrationBuilder.Sql(@"
            INSERT INTO invitation_profiles (invitation_id, profile_id, created_at, updated_at)
            SELECT
                id as invitation_id,
                profile_id,
                created_at,
                updated_at
            FROM invitations
            WHERE profile_id IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM invitation_profiles ip
                WHERE ip.invitation_id = invitations.id
                AND ip.profile_id = invitations.profile_id
            )
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Cannot safely reverse this without data loss
        throw new NotSupportedException("Cannot reverse data migration");
    }
}
```

**Verification Query (run manually after migration):**
```sql
-- Ensure all invitations have at least one profile in junction table
SELECT i.id, i.email, i.profile_id, COUNT(ip.profile_id) as junction_count
FROM invitations i
LEFT JOIN invitation_profiles ip ON i.id = ip.invitation_id
WHERE i.profile_id IS NOT NULL
GROUP BY i.id, i.email, i.profile_id
HAVING COUNT(ip.profile_id) = 0;

-- Should return 0 rows
```

---

### Phase 3: Update Application Code

#### 3.1 Create New Entity

File: `apps/api/Src/Features/Common/Invitation/InvitationProfile.cs`

```csharp
using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Data;

namespace MainApi.Src.Features.Common.Invitation;

[Table("invitation_profiles")]
public class InvitationProfile : BaseAttributes
{
    [Column("invitation_id")]
    public required Guid InvitationId { get; set; }

    [ForeignKey(nameof(InvitationId))]
    public Invitation Invitation { get; set; } = null!;

    [Column("profile_id")]
    public required Guid ProfileId { get; set; }

    [ForeignKey(nameof(ProfileId))]
    public Profile.Profile Profile { get; set; } = null!;
}
```

#### 3.2 Update Invitation Entity

File: `apps/api/Src/Features/Common/Invitation/Invitation.cs`

```csharp
// REMOVE this property (Phase 4 - after code migration complete)
[Column("profile_id")]
[Obsolete("Use InvitationProfiles navigation property instead. This will be removed in next version.")]
public Guid? ProfileId { get; set; }  // Nullable during transition

// ADD these properties
public ICollection<InvitationProfile> InvitationProfiles { get; set; } = new List<InvitationProfile>();

// Helper property for easy access
[NotMapped]
public List<Guid> ProfileIds => InvitationProfiles.Select(ip => ip.ProfileId).ToList();
```

#### 3.3 Update DbContext

File: `apps/api/Src/Data/DbContext/MainApiDbContext.cs`

```csharp
public class MainApiDbContext : DbContext
{
    // Add new DbSet
    public DbSet<InvitationProfile> InvitationProfile { get; set; } = null!;

    // Existing DbSets...
    public DbSet<Invitation> Invitation { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure InvitationProfile
        modelBuilder.Entity<InvitationProfile>(entity =>
        {
            entity.HasKey(e => new { e.InvitationId, e.ProfileId });

            entity.HasOne(e => e.Invitation)
                  .WithMany(i => i.InvitationProfiles)
                  .HasForeignKey(e => e.InvitationId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Profile)
                  .WithMany()
                  .HasForeignKey(e => e.ProfileId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // Existing configurations...
    }
}
```

#### 3.4 Update Factory Methods

File: `apps/api/Src/Features/Common/Invitation/Invitation.cs`

**OLD (deprecated):**
```csharp
[Obsolete("Use CreateStaffInvitationWithProfiles instead")]
public static Invitation CreateStaffInvitation(
    string email,
    Guid profileId,  // Single profile
    Guid invitedByUserId,
    DateTime expiresAt,
    string token
) {
    // ... existing implementation
}
```

**NEW:**
```csharp
public static Invitation CreateStaffInvitationWithProfiles(
    string email,
    List<Guid> profileIds,  // Multiple profiles
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
            ProfileId = profileId
        });
    }

    return invitation;
}
```

#### 3.5 Update Service Methods

File: `apps/api/Src/Features/Common/Invitation/InvitationService.cs`

**Update signature:**
```csharp
public async Task<(Invitation Invitation, string Token)> CreateStaffInvitationAsync(
    string email,
    List<Guid> profileIds,  // Changed from single Guid to List<Guid>
    Guid invitedByUserId,
    CancellationToken cancellationToken = default
) {
    var token = CryptoUtils.RandomString(_appSettings.Value.INVITATION_TOKEN_LENGTH);
    var expiresAt = DateTime.UtcNow.AddDays(7);

    var invitation = Invitation.CreateStaffInvitationWithProfiles(
        email,
        profileIds,
        invitedByUserId,
        expiresAt,
        token
    );

    invitation.ValidateInvitationType();

    await _dbContext.Invitation.AddAsync(invitation, cancellationToken);
    await _dbContext.SaveChangesAsync(cancellationToken);

    _logger.LogInformation(
        "Created staff invitation for {Email} with {ProfileCount} profiles by user {InvitedByUserId}",
        email,
        profileIds.Count,
        invitedByUserId
    );

    return (invitation, token);
}
```

#### 3.6 Update Queries That Load Profiles

**Update pending invitation check:**
```csharp
public async Task<bool> PendingInvitationExistsAsync(
    string email,
    InvitationScope scope,
    CancellationToken cancellationToken = default
) {
    var normalizedEmail = email.ToLowerInvariant();
    var invitationQuery =
        from inv in _dbContext.Invitation
        where inv.Email == normalizedEmail
            && inv.Scope == scope
            && inv.IsAccepted == false
            && inv.IsRevoked == false
            && inv.ExpiresAt > DateTime.UtcNow
        select inv;

    return await invitationQuery.AnyAsync(cancellationToken);
}
```
**Note:** No change needed - doesn't load profiles.

**Update invitation listing:**
```csharp
public async Task<List<InvitationListItem>> FindStaffInvitationsAsync(
    CancellationToken cancellationToken = default
) {
    var invitationsQuery =
        from inv in _dbContext.Invitation
        where inv.Scope == InvitationScope.Staff
        join inviter in _dbContext.User on inv.InvitedByUserId equals inviter.Id
        orderby inv.CreatedAt descending
        select new {
            Invitation = inv,
            InviterName = $"{inviter.FirstName} {inviter.LastName}",
            // Load profiles via junction table
            ProfileNames = (from ip in _dbContext.InvitationProfile
                           join p in _dbContext.Profile on ip.ProfileId equals p.Id
                           where ip.InvitationId == inv.Id
                           select p.Name).ToList()
        };

    var results = await invitationsQuery.ToListAsync(cancellationToken);

    return results.Select(r => new InvitationListItem {
        Id = r.Invitation.GetRequiredId(),
        Email = r.Invitation.Email,
        Scope = "Staff",
        ProfileName = string.Join(", ", r.ProfileNames),  // Comma-separated
        ExpiresAt = r.Invitation.ExpiresAt,
        IsAccepted = r.Invitation.IsAccepted,
        IsRevoked = r.Invitation.IsRevoked,
        CreatedAt = r.Invitation.CreatedAt,
        InvitedByName = r.InviterName
    }).ToList();
}
```

#### 3.7 Update Acceptance Flow

File: `apps/api/Src/Features/Common/Invitation/InvitationService.cs`

```csharp
public async Task<UserEntity> AcceptStaffInvitationAsync(
    Invitation invitation,
    string firstName,
    string lastName,
    string passwordHash,
    CancellationToken cancellationToken = default
) {
    await using var tx = await _dbContext.Database
        .BeginTransactionAsync(cancellationToken);
    try {
        // Create user
        var user = new UserEntity {
            Email = invitation.Email,
            Password = passwordHash,
            FirstName = firstName,
            LastName = lastName,
            Status = UserStatus.Active,
            IsVerified = true
        };
        await _dbContext.User.AddAsync(user, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        // Create staff account
        var account = UserAccount.CreateStaffAccount(
            user.GetRequiredId(),
            AccountLevel.User
        );
        await _dbContext.UserAccount.AddAsync(account, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        // Load invitation profiles
        var invitationProfiles = await _dbContext.InvitationProfile
            .Where(ip => ip.InvitationId == invitation.GetRequiredId())
            .ToListAsync(cancellationToken);

        // Assign ALL profiles from the invitation
        foreach (var invitationProfile in invitationProfiles) {
            await _dbContext.UserAccountProfile.AddAsync(
                new UserAccountProfile {
                    UserAccountId = account.GetRequiredId(),
                    ProfileId = invitationProfile.ProfileId
                },
                cancellationToken
            );
        }

        // Mark invitation as accepted
        invitation.IsAccepted = true;
        invitation.AcceptedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        await tx.CommitAsync(cancellationToken);

        _logger.LogInformation(
            "Staff invitation accepted: User {UserId} created with {ProfileCount} profiles from invitation {InvitationId}",
            user.GetRequiredId(),
            invitationProfiles.Count,
            invitation.GetRequiredId()
        );

        return user;
    } catch {
        throw;
    }
}
```

---

### Phase 4: Remove Old Schema (Breaking Change)

**Wait until:** All code is updated and deployed to production.

#### 4.1 Create Final Migration

File: `apps/api/Src/Data/Migrations/YYYYMMDDHHMMSS_RemoveProfileIdFromInvitations.cs`

```csharp
using Microsoft.EntityFrameworkCore.Migrations;

public partial class RemoveProfileIdFromInvitations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Drop index first
        migrationBuilder.DropIndex(
            name: "IX_invitations_profile_id",
            table: "invitations");

        // Drop foreign key
        migrationBuilder.DropForeignKey(
            name: "FK_invitations_profiles_profile_id",
            table: "invitations");

        // Drop column
        migrationBuilder.DropColumn(
            name: "profile_id",
            table: "invitations");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Add column back
        migrationBuilder.AddColumn<Guid>(
            name: "profile_id",
            table: "invitations",
            nullable: true);

        // Re-create foreign key
        migrationBuilder.CreateIndex(
            name: "IX_invitations_profile_id",
            table: "invitations",
            column: "profile_id");

        migrationBuilder.AddForeignKey(
            name: "FK_invitations_profiles_profile_id",
            table: "invitations",
            column: "profile_id",
            principalTable: "profiles",
            principalColumn: "id",
            onDelete: ReferentialAction.Restrict);
    }
}
```

#### 4.2 Remove Obsolete Code

- Remove `ProfileId` property from `Invitation` entity
- Remove `CreateStaffInvitation` (single profile) factory method
- Update all references to use new `CreateStaffInvitationWithProfiles`

---

### Testing Strategy

#### Phase 1 Testing
- ✅ Migration runs without errors
- ✅ Junction table created with correct schema
- ✅ Foreign keys and indexes in place
- ✅ Existing invitations still work

#### Phase 2 Testing
- ✅ Data migration script runs successfully
- ✅ Verification query returns 0 rows (all data migrated)
- ✅ Junction table has same number of rows as invitations with non-null profile_id

#### Phase 3 Testing
- ✅ Can create new invitations with multiple profiles
- ✅ Invitation listing shows all profiles (comma-separated)
- ✅ Acceptance flow assigns all profiles to user account
- ✅ Single token per email (not one per profile)
- ✅ Old invitations (using profile_id) still work

#### Phase 4 Testing
- ✅ Migration runs successfully
- ✅ profile_id column removed from invitations table
- ✅ All invitation functionality still works
- ✅ No references to obsolete code remain

---

### Rollback Strategy

**Phase 1-3:** Safe - old column still exists, can revert code
**Phase 4:** Risky - column is dropped

**Before Phase 4:**
1. Ensure 100% of code uses new junction table
2. Monitor production for 1-2 weeks
3. Verify no queries reference old profile_id column
4. Take database backup before running Phase 4 migration

---

### Impact Assessment

**Database:**
- New table: `invitation_profiles`
- Temporary state: Both old `profile_id` column and new junction table exist
- Final state: Only junction table remains

**API Changes:**
- `CreateStaffInvitation` signature changes from `Guid profileId` to `List<Guid> profileIds`
- Response DTOs may need updating if they expose profile information
- Invitation listing returns comma-separated profile names instead of single name

**Frontend Changes:**
- Invitation creation form can select multiple profiles
- Single invitation email/token for multiple profiles
- Display all profiles in invitation list

**Performance:**
- Additional JOIN required to load profiles
- Offset by better UX and reduced invitation entity count

---

### Success Criteria

- ✅ One invitation per email (not one per profile)
- ✅ One token per email
- ✅ Users get all assigned profiles upon acceptance
- ✅ Clear UX for multi-profile invitations
- ✅ Zero data loss during migration
- ✅ No breaking changes until Phase 4
- ✅ All tests passing at each phase

---

This migration plan ensures a safe, phased transition from the flawed one-to-many design to the correct many-to-many design.
