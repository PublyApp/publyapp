# Tenant Creation with Initial Users - Implementation Plan

## Executive Summary

This document outlines the implementation plan for enhancing tenant creation to support initial users, enforce business rules, and maintain ACID compliance.

## Business Rules

1. **At least 1 admin required**: Every tenant must have at least one user with account level "admin"
2. **MaxUsers enforcement**: The number of initial users must be <= MaxUsers (uses `DEFAULT_MAX_USERS_PER_TENANT` if MaxUsers is not provided)
3. **MaxUsers is optional**: If not provided, defaults to `DEFAULT_MAX_USERS_PER_TENANT` (not a ceiling - staff can specify any value)
4. **Initial users structure**: `{ email: string, accountLevel: string }` where accountLevel is "admin" or "user"
5. **Existing users handling**: See Design Decision #2 below
6. **ACID compliance**: All operations must be atomic - either everything succeeds or everything rolls back

## Design Decisions

### Decision #1: Direct User Creation vs Invitation Process

**RECOMMENDATION: Use the Invitation Process**

**Rationale:**
- ✅ **Security**: Users set their own passwords (no password generation/transmission)
- ✅ **Email Verification**: Confirms users own the email addresses
- ✅ **Audit Trail**: Invitation records provide complete traceability
- ✅ **Code Reuse**: Leverages existing `IInvitationService.CreateTenantInvitationAsync`
- ✅ **User Experience**: Users receive email notifications and control when they join
- ✅ **Lower Risk**: Avoids creating accounts for potentially invalid emails
- ✅ **Consistency**: Aligns with existing staff invitation pattern in `BulkCreateStaffInvitations.cs`

**Alternative Considered (Direct Creation):**
- ❌ Requires password generation and transmission (security risk)
- ❌ No email verification
- ❌ Requires immediate password reset flow
- ❌ More complex error handling for invalid emails

### Decision #2: Handling Existing Emails

**RECOMMENDATION: No database validation needed for brand new tenant**

**Why No Validation Needed:**

We're creating a **BRAND NEW** tenant. The `tenantId` is generated during creation. Therefore:

1. **Nobody can be a member yet** - The tenant didn't exist 2 seconds ago!
2. **No pending invitations exist** - Can't have invitations for a non-existent tenant!
3. **Existing users are fine** - Users can belong to multiple tenants

**What IS Validated (in FluentValidation Validator):**

1. ✅ **At least 1 admin required**
2. ✅ **InitialUsers count <= MaxUsers**
3. ✅ **No duplicate emails in the InitialUsers array**
4. ✅ **Valid email formats**
5. ✅ **Valid account levels** ("admin" or "user")

**Validation Strategy:**
```
INPUT VALIDATION (Validator - Step 2):
  - Check structure, duplicates, admin requirement
  - All validation happens BEFORE service layer

SERVICE LAYER (Step 4):
  - NO database validation needed
  - Just create tenant → profile → invitations
  - Everything in transaction
```

**Why This Works:**
- ✅ It's a brand new tenant - impossible to have conflicts
- ✅ Simpler, faster implementation
- ✅ All meaningful validation done in the validator
- ✅ Service layer focuses on creation, not validation

### Decision #3: ACID Compliance Strategy

**RECOMMENDATION: Database transaction wrapping all operations**

**Transaction Scope:**
```
BEGIN TRANSACTION
  1. Create Tenant with MaxUsers
  2. Create "Default profile" for tenant
  3. Create all tenant invitations with profiles
COMMIT TRANSACTION

(Outside transaction - fire and forget)
  4. Send invitation emails asynchronously
```

**Rollback Scenarios:**
- Any database constraint violation
- Any exception during tenant, profile, or invitation creation
- Network/connection failures during DB operations

**Why Email Sending is Outside Transaction:**
- Email failures shouldn't rollback database changes
- Retry logic can handle email delivery issues
- Existing pattern in `BulkCreateStaffInvitations.cs` (lines 298-305)

## Current State Analysis

### File: `CreateTenantAsStaff.cs`

**What Exists:**
- `CreateTenantAsStaffBody` with `Name`, `MaxUsers`, `InitialUsers` properties (JsonElement)
- `GetName()` method to parse Name
- Validator only validates `Name` (min 5 chars)
- Handler creates tenant with status `Pending`
- No transaction wrapping
- MaxUsers and InitialUsers are ignored

**What's Missing:**
- Parsing methods for `MaxUsers` (optional, nullable) and `InitialUsers`
- Validation for MaxUsers (optional, defaults to DEFAULT_MAX_USERS_PER_TENANT) and InitialUsers
- Business rule validation (at least 1 admin, count <= MaxUsers)
- Logic to apply default MaxUsers when not provided
- Invitation creation logic
- Transaction wrapping
- Email sending logic

## Implementation Plan

### Step 0: Add Number Extension Methods to JsonElementExtensions

**Location**: `apps/api/Src/Lib/Extensions/JsonElementExtensions.cs` (after line 77)

**Add Missing Extension Methods:**

```csharp
public static int GetValueAsInt32(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
    return element.ValueKind switch {
        JsonValueKind.Number => element.GetInt32(),
        _ => throw new InvalidOperationException($"{propertyName} must be a number")
    };
}

public static int? GetValueAsInt32OrNull(this JsonElement? element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
    return element?.ValueKind switch {
        null => null,
        JsonValueKind.Null => null,
        JsonValueKind.Undefined => null,
        JsonValueKind.Number => element?.GetInt32(),
        _ => throw new InvalidOperationException($"{propertyName} must be a number or null")
    };
}

public static int? GetValueAsInt32OrNull(this JsonElement element, [CallerArgumentExpression(nameof(element))] string? propertyName = null) {
    return element.ValueKind switch {
        JsonValueKind.Null => null,
        JsonValueKind.Undefined => null,
        JsonValueKind.Number => element.GetInt32(),
        _ => throw new InvalidOperationException($"{propertyName} must be a number or null")
    };
}
```

**Why**: This follows the existing pattern for `GetValueAsString()`, `GetValueAsBoolean()`, and `GetValueAsGuid()` in the same file.

### Step 1: Extend `CreateTenantAsStaffBody` Class

**Location**: `apps/api/Src/Modules/Staff/TenantsAsStaff/Handlers/CreateTenantAsStaff.cs` (lines 13-27)

**Add Parsing Methods:**

```csharp
using MainApi.Src.Lib.Extensions; // Add this import

public class CreateTenantAsStaffBody {
    public JsonElement Name { get; set; }
    public JsonElement MaxUsers { get; set; }
    public JsonElement InitialUsers { get; set; }

    public string GetName() { /* existing - already uses GetValueAsString() pattern */ }

    // NEW: Parse MaxUsers using extension method (nullable - defaults to DEFAULT_MAX_USERS_PER_TENANT)
    public int? GetMaxUsers() {
        return MaxUsers.GetValueAsInt32OrNull();
    }

    // NEW: Parse InitialUsers
    public record InitialUserItem(string Email, string AccountLevel);

    public List<InitialUserItem> GetInitialUsers() {
        if (InitialUsers.ValueKind != JsonValueKind.Array) {
            throw new Exception("InitialUsers must be an array");
        }

        var users = new List<InitialUserItem>();
        foreach (var item in InitialUsers.EnumerateArray()) {
            var email = item.GetProperty("email").GetValueAsString();
            var accountLevel = item.GetProperty("accountLevel").GetValueAsString();

            users.Add(new InitialUserItem(email, accountLevel));
        }

        return users;
    }
}
```

**Note**: Now using `GetValueAsInt32()` and `GetValueAsString()` extension methods consistently.

### Step 2: Extend Validation Rules

**Location**: `CreateTenantAsStaffBodyValidator` class (lines 29-42)

**Add Comprehensive Validation:**

```csharp
public class CreateTenantAsStaffBodyValidator : AbstractValidator<CreateTenantAsStaffBody> {
    public CreateTenantAsStaffBodyValidator(IOptions<AppSettings> appSettings) {
        // Existing Name validation...

        // NEW: MaxUsers validation (optional - defaults to DEFAULT_MAX_USERS_PER_TENANT if not provided)
        RuleFor(x => x.MaxUsers)
            .Must(m => m.ValueKind == JsonValueKind.Number ||
                       m.ValueKind == JsonValueKind.Null ||
                       m.ValueKind == JsonValueKind.Undefined)
            .WithMessage("MaxUsers must be a number, null, or undefined")
            .DependentRules(() => {
                RuleFor(x => x.MaxUsers)
                    .Must(m => {
                        if (m.ValueKind != JsonValueKind.Number) return true;
                        var value = m.GetInt32();
                        return value > 0;
                    })
                    .WithMessage("MaxUsers must be greater than 0 when provided");
            });

        // NEW: InitialUsers validation
        RuleFor(x => x.InitialUsers)
            .NotEmpty().WithMessage("InitialUsers is required")
            .Custom((element, context) => {
                if (element.ValueKind != JsonValueKind.Array) {
                    context.AddFailure("InitialUsers must be an array");
                    return;
                }

                var array = element.EnumerateArray().ToList();

                if (array.Count == 0) {
                    context.AddFailure("At least one initial user is required");
                    return;
                }

                // Validate doesn't exceed MaxUsers (use default if not provided)
                var body = context.InstanceToValidate as CreateTenantAsStaffBody;
                var maxUsers = body?.MaxUsers.ValueKind == JsonValueKind.Number
                    ? body.MaxUsers.GetInt32()
                    : appSettings.Value.DEFAULT_MAX_USERS_PER_TENANT;

                if (array.Count > maxUsers) {
                    context.AddFailure(
                        $"InitialUsers count ({array.Count}) cannot exceed MaxUsers ({maxUsers})"
                    );
                    return;
                }

                // Track for duplicate detection and admin check
                var emailOccurrences = new Dictionary<string, List<int>>(StringComparer.OrdinalIgnoreCase);
                var hasAdmin = false;

                // Validate each item
                for (var i = 0; i < array.Count; i++) {
                    var item = array[i];

                    if (item.ValueKind != JsonValueKind.Object) {
                        context.AddFailure($"initialUsers[{i}]", "Must be an object");
                        continue;
                    }

                    // Validate email
                    if (!item.TryGetProperty("email", out var emailElement)) {
                        context.AddFailure($"initialUsers[{i}].email", "Email is required");
                    } else if (emailElement.ValueKind != JsonValueKind.String) {
                        context.AddFailure($"initialUsers[{i}].email", "Must be a string");
                    } else {
                        var email = emailElement.GetString();
                        if (string.IsNullOrWhiteSpace(email)) {
                            context.AddFailure($"initialUsers[{i}].email", "Email is required");
                        } else if (!IsValidEmail(email)) {
                            context.AddFailure($"initialUsers[{i}].email", "Invalid email format");
                        } else {
                            // Track duplicates
                            if (!emailOccurrences.TryGetValue(email, out var indices)) {
                                indices = new List<int>();
                                emailOccurrences[email] = indices;
                            }
                            indices.Add(i);
                        }
                    }

                    // Validate accountLevel
                    if (!item.TryGetProperty("accountLevel", out var levelElement)) {
                        context.AddFailure($"initialUsers[{i}].accountLevel", "AccountLevel is required");
                    } else if (levelElement.ValueKind != JsonValueKind.String) {
                        context.AddFailure($"initialUsers[{i}].accountLevel", "Must be a string");
                    } else {
                        var level = levelElement.GetString();
                        if (string.IsNullOrWhiteSpace(level)) {
                            context.AddFailure($"initialUsers[{i}].accountLevel", "AccountLevel is required");
                        } else {
                            var normalizedLevel = level.ToLowerInvariant();
                            if (normalizedLevel != "admin" && normalizedLevel != "user") {
                                context.AddFailure(
                                    $"initialUsers[{i}].accountLevel",
                                    "AccountLevel must be 'admin' or 'user'"
                                );
                            } else if (normalizedLevel == "admin") {
                                hasAdmin = true;
                            }
                        }
                    }
                }

                // Check for duplicates
                var duplicates = emailOccurrences.Where(kvp => kvp.Value.Count > 1).Select(kvp => kvp.Key).ToList();
                if (duplicates.Count > 0) {
                    context.AddFailure("InitialUsers", $"Duplicate emails: {string.Join(", ", duplicates)}");
                }

                // Check for at least one admin
                if (!hasAdmin) {
                    context.AddFailure("InitialUsers", "At least one user with accountLevel 'admin' is required");
                }
            });
    }

    private static bool IsValidEmail(string email) {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try {
            return System.Net.Mail.MailAddress.TryCreate(email, out _);
        } catch {
            return false;
        }
    }
}
```

### Step 3: Extend `ITenantAsStaffService` Interface

**Location**: `apps/api/Src/Modules/Staff/TenantsAsStaff/TenantAsStaffService.cs` (lines 20-31)

**Add New Method:**

```csharp
public interface ITenantAsStaffService {
    // Existing methods...

    // NEW: Create tenant with initial users via invitations
    Task<CreateTenantWithInitialUsersResult> CreateTenantWithInitialUsersAsync(
        string name,
        int maxUsers,
        List<(string Email, AccountLevel AccountLevel)> initialUsers,
        Guid invitedByUserId,
        CancellationToken cancellationToken = default
    );
}

public record CreateTenantWithInitialUsersResult {
    public required Tenant Tenant { get; init; }
    public required List<(string Email, string Token, AccountLevel Level)> InvitationTokens { get; init; }
}
```

### Step 4: Implement Service Method

**Location**: `TenantAsStaffService` class (after line 46)

**Implementation:**

```csharp
public async Task<CreateTenantWithInitialUsersResult> CreateTenantWithInitialUsersAsync(
    string name,
    int maxUsers,
    List<(string Email, AccountLevel AccountLevel)> initialUsers,
    Guid invitedByUserId,
    CancellationToken cancellationToken = default
) {
    await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

    try {
        // 1. Create tenant
        var tenant = new CommonTenantNs.Tenant {
            Name = name,
            Code = CryptoUtils.RandomString(10).ToLower(),
            Status = CommonTenantNs.TenantStatus.Pending,
            MaxUsers = maxUsers
        };

        var savedTenant = await _dbContext.Tenant.AddAsync(tenant, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
        var tenantId = savedTenant.Entity.GetRequiredId();

        // 2. Create "Default profile" for non-admin users
        var defaultProfile = Profile.CreateTenantProfile(
            tenantId,
            name: "Default profile",
            description: "Default profile with no permissions"
        );
        var savedDefaultProfile = await _dbContext.Profile.AddAsync(defaultProfile, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);
        var defaultProfileId = savedDefaultProfile.Entity.GetRequiredId();

        // 3. Create invitations with appropriate profiles
        // NOTE: No need to validate existing users/memberships for a BRAND NEW tenant!
        // All validation is done in the validator (duplicates, admin requirement, etc.)
        var invitationTokens = new List<(string Email, string Token, AccountLevel Level)>();
        var expiresAt = DateTime.UtcNow.AddDays(7);

        foreach (var (email, accountLevel) in initialUsers) {
            var token = CryptoUtils.RandomString(_appSettings.Value.INVITATION_TOKEN_LENGTH);

            // Determine profile IDs based on account level
            List<Guid> profileIds;
            if (accountLevel == AccountLevel.Admin) {
                // Admin users don't need profiles (they have all rights)
                profileIds = new List<Guid>();
            } else {
                // Non-admin users need at least 1 profile (app requirement)
                // Assign the default profile
                profileIds = new List<Guid> { defaultProfileId };
            }

            var invitation = Invitation.CreateTenantInvitationWithProfiles(
                email,
                tenantId,
                profileIds,
                invitedByUserId,
                expiresAt,
                token
            );

            // Store the account level in the invitation
            invitation.AccountLevel = accountLevel;

            invitation.ValidateInvitationType();
            _dbContext.Invitation.Add(invitation);

            invitationTokens.Add((email, token, accountLevel));
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new CreateTenantWithInitialUsersResult {
            Tenant = savedTenant.Entity,
            InvitationTokens = invitationTokens
        };

    } catch {
        await transaction.RollbackAsync(cancellationToken);
        throw;
    }
}
```

**Implementation Notes**:
- Creates "Default profile" (no permissions) for each tenant
- Admin invitations: AccountLevel = Admin, no profiles assigned
- User invitations: AccountLevel = User, assigned the "Default profile"
- AccountLevel stored directly in invitation entity
- No database validation needed (it's a brand new tenant - nobody can be a member yet!)
- All validation happens in the FluentValidation validator (duplicates, admin requirement, etc.)
- Total: **4 database round trips** regardless of number of initial users

### Step 5: Update Handler

**Location**: `HandleCreateTenantAsStaff` method (lines 55-76)

**Strategy**: This implementation **REPLACES** the existing handler completely.

**Why Replace Instead of Adding a New Endpoint?**
- The old handler only creates tenants with Name (ignores MaxUsers and InitialUsers)
- InitialUsers are now **required** per business rules (at least 1 admin needed)
- Having both paths would create confusion about which endpoint to use
- The new implementation is a superset of the old functionality

**Backward Compatibility**:
- The API contract changes: `InitialUsers` becomes a required field
- `MaxUsers` is optional - defaults to `DEFAULT_MAX_USERS_PER_TENANT` (100) if not provided
- Clients must update to provide `InitialUsers` when creating tenants
- This is a **breaking change** but necessary to enforce business rules (at least 1 admin required)

**Implementation:**

```csharp
public static async Task<Results<
    Ok<CreateTenantAsStaffResult>,
    BadRequest<ApiResponse>
>> HandleCreateTenantAsStaff(
    [FromBody] CreateTenantAsStaffBody createTenantBody,
    [FromServices] ITenantAsStaffService tenantAsStaffService,
    [FromServices] IEmailService emailService,
    [FromServices] IAuthContext authContext,
    [FromServices] IOptions<AppSettings> appSettings,
    [FromServices] ILoggerFactory loggerFactory,
    CancellationToken cancellationToken
) {
    var logger = loggerFactory.CreateLogger(nameof(CreateTenantAsStaff));

    // Get authenticated staff user
    var staffAccount = authContext.AccountStaff;
    if (staffAccount is null) {
        return TypedResults.BadRequest(
            ApiResponse.Create("Unauthorized", ResponseKeys.Unauthorized)
        );
    }

    // Parse request
    var tenantName = createTenantBody.GetName();
    var maxUsers = createTenantBody.GetMaxUsers();
    var initialUsersItems = createTenantBody.GetInitialUsers();

    // Apply default MaxUsers if not provided
    var effectiveMaxUsers = maxUsers ?? appSettings.Value.DEFAULT_MAX_USERS_PER_TENANT;

    // Convert to service layer types
    var initialUsers = initialUsersItems
        .Select(u => {
            var level = UserAccount.ParseAccountLevel(u.AccountLevel);
            if (level is null) {
                throw new InvalidOperationException($"Invalid account level: {u.AccountLevel}");
            }
            return (u.Email, level.Value);
        })
        .ToList();

    try {
        // Create tenant with initial users
        var result = await tenantAsStaffService.CreateTenantWithInitialUsersAsync(
            tenantName,
            effectiveMaxUsers,
            initialUsers,
            staffAccount.UserId,
            cancellationToken
        );

        // Send invitation emails asynchronously (fire and forget)
        _ = Task.Run(async () => {
            await SendTenantInvitationEmailsAsync(
                emailService,
                logger,
                result.Tenant.Name,
                result.InvitationTokens,
                cancellationToken
            );
        }, cancellationToken);

        logger.LogInformation(
            "Created tenant {TenantId} with {UserCount} initial user invitations",
            result.Tenant.GetRequiredId(),
            result.InvitationTokens.Count
        );

        return TypedResults.Ok(new CreateTenantAsStaffResult {
            Id = result.Tenant.GetRequiredId(),
            Name = result.Tenant.Name
        });

    } catch (InvalidOperationException ex) {
        // Business logic validation failures
        logger.LogWarning(ex, "Tenant creation validation failed");
        return TypedResults.BadRequest(
            ApiResponse.Create(ex.Message, ResponseKeys.ValidationError)
        );
    }
}

// NEW: Email sending helper with retry logic
private static async Task SendTenantInvitationEmailsAsync(
    IEmailService emailService,
    ILogger logger,
    string tenantName,
    List<(string Email, string Token, AccountLevel Level)> invitationTokens,
    CancellationToken cancellationToken
) {
    const int maxConcurrency = 5;
    using var semaphore = new SemaphoreSlim(maxConcurrency);

    var tasks = invitationTokens.Select(async (invitation) => {
        await semaphore.WaitAsync(cancellationToken);
        try {
            await SendEmailWithRetryAsync(
                async () => {
                    await emailService.SendTenantInvitationEmailAsync(
                        invitation.Email,
                        tenantName,
                        invitation.Token,
                        invitation.Level
                    );
                },
                logger,
                invitation.Email,
                cancellationToken
            );
        } finally {
            semaphore.Release();
        }
    });

    await Task.WhenAll(tasks);
}

/// <summary>
/// Sends an email with exponential backoff retry logic using Polly.
/// Pattern from BulkCreateStaffInvitations.cs
/// </summary>
private static async Task SendEmailWithRetryAsync(
    Func<Task> sendEmailAction,
    ILogger logger,
    string email,
    CancellationToken cancellationToken
) {
    var context = new Context {
        ["logger"] = logger,
        ["email"] = email
    };

    var retryPolicy = Policy
        .Handle<Exception>()
        .WaitAndRetryAsync(
            retryCount: 3,
            sleepDurationProvider: retryAttempt =>
                TimeSpan.FromSeconds(Math.Pow(2, retryAttempt - 1)),
            onRetry: (exception, timeSpan, retryCount, ctx) => {
                var log = (ILogger)ctx["logger"];
                var emailAddr = (string)ctx["email"];

                log.LogWarning(
                    exception,
                    "Failed to send tenant invitation email to {Email} (attempt {Attempt}/3), " +
                    "retrying in {Delay}ms",
                    emailAddr,
                    retryCount,
                    timeSpan.TotalMilliseconds
                );
            }
        );

    try {
        await retryPolicy.ExecuteAsync(
            async (ctx, ct) => {
                await sendEmailAction();
            },
            context,
            cancellationToken
        );

        logger.LogInformation(
            "Successfully sent tenant invitation email to {Email}",
            email
        );
    } catch (Exception ex) {
        logger.LogError(
            ex,
            "Failed to send tenant invitation email to {Email} after 3 attempts",
            email
        );
        // Don't rethrow - email failures shouldn't break the main operation
    }
}
```

**Note**: Requires `using Polly;` at the top of the file.

### Step 6: Additional Infrastructure Needed

#### A. Email Service Method

**Location**: `IEmailService` interface

```csharp
Task SendTenantInvitationEmailAsync(
    string recipientEmail,
    string tenantName,
    string invitationToken,
    AccountLevel accountLevel
);
```

#### B. Profile-to-AccountLevel Mapping

**Architectural Decision**:

**For Admin Users**:
- Admin users have ALL rights over their tenant/org
- They don't need profiles (they bypass the profile permission system)
- Store `AccountLevel.Admin` in the invitation, assign NO profiles

**For Non-Admin Users**:
- Regular users need at least 1 profile to use the app (app requirement)
- Create a "Default profile" (tenant-scoped, no permissions)
- Store `AccountLevel.User` in the invitation, assign the default profile

**Implementation Strategy**:

1. **Extend Invitation table** - Add `account_level` column (nullable int)
2. **Create "Default profile"** during tenant creation:
   - Name: "Default profile"
   - Scope: Tenant
   - Permissions: None (empty)
   - Purpose: Satisfy app requirement that users must have ≥1 profile

3. **Invitation Creation Logic**:
   ```
   For each initial user:
     If accountLevel == "admin":
       → Store AccountLevel.Admin in invitation
       → Assign NO profiles (empty list)
     Else if accountLevel == "user":
       → Store AccountLevel.User in invitation
       → Assign "Default profile" ID
   ```

4. **Invitation Acceptance**:
   - Read stored AccountLevel from invitation
   - Create UserAccount with that level
   - Assign stored profiles (if any) to the account

#### C. AppSettings Configuration

**No new configuration needed** - The system uses the existing `DEFAULT_MAX_USERS_PER_TENANT` constant from `AppSettings.cs`.

The system already has:
```csharp
public int DEFAULT_MAX_USERS_PER_TENANT { get; set; } = 100;
```

**Usage**: This constant is used as a **fallback/default value** when `MaxUsers` is not provided in the request body. It is **NOT** used as a ceiling to limit tenant creation. Staff members can create tenants with any reasonable `MaxUsers` value - the default is only applied when the field is omitted or null.

### Step 7: Database Migration and Entity Updates

#### A. Add Migration

**Create Migration**: `AddAccountLevelToInvitations`

```csharp
public partial class AddAccountLevelToInvitations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "account_level",
            table: "invitations",
            type: "integer",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "account_level",
            table: "invitations");
    }
}
```

#### B. Update Invitation Entity

**Location**: `apps/api/Src/Modules/Shared/Invitations/Invitation.cs` (after line 56)

**Add Property:**

```csharp
[Column("account_level")]
public AccountLevel? AccountLevel { get; set; }
```

**Why nullable**:
- Staff and Project invitations don't use AccountLevel (only Tenant invitations do)
- Existing invitations in DB won't have this value
- When null, the system falls back to profile-based permissions only

#### C. Create AcceptTenantInvitation Handler

**Location**: `apps/api/Src/Modules/Shared/Invitations/Handlers/AcceptTenantInvitation.cs` (new file)

**Purpose**: Handle tenant invitation acceptance with AccountLevel support

**Key Differences from Staff Invitation**:
- Validates `InvitationScope.Tenant` (not Staff)
- Reads `AccountLevel` from invitation (with fallback to `User` for legacy invitations)
- Creates tenant-scoped account (not staff account)
- Assigns profiles from `InvitationProfiles` junction table

**Complete Implementation**:

```csharp
using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Modules.Shared.Auth;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Staff.AuditLogs;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Shared.Invitation.Handlers;

public record AcceptTenantInvitationBody {
    public required JsonElement FirstName { get; init; }
    public required JsonElement LastName { get; init; }
    public required JsonElement Password { get; init; }
}

public record TenantInvitationAccepted {
    public required Guid UserId { get; init; }
    public required Guid TenantId { get; init; }
    public required string SessionToken { get; init; }
    public required DateTime SessionExpiresAt { get; init; }
    public required double SessionExpiresInMs { get; init; }
}

public class AcceptTenantInvitationBodyValidator : AbstractValidator<AcceptTenantInvitationBody> {
    public AcceptTenantInvitationBodyValidator() {
        RuleFor(x => x.FirstName)
            .Must(e => e.ValueKind == JsonValueKind.String)
            .WithMessage("FirstName must be a string")
            .Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
            .WithMessage("FirstName is required");

        RuleFor(x => x.LastName)
            .Must(e => e.ValueKind == JsonValueKind.String)
            .WithMessage("LastName must be a string")
            .Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
            .WithMessage("LastName is required");

        RuleFor(x => x.Password)
            .Must(e => e.ValueKind == JsonValueKind.String)
            .WithMessage("Password must be a string")
            .Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
            .WithMessage("Password is required")
            .Must(e => e.GetString()!.Length >= 8)
            .WithMessage("Password must be at least 8 characters");
    }
}

public static class AcceptTenantInvitation {
    public static async Task<Results<
        Ok<TenantInvitationAccepted>,
        NotFound<ApiResponse>,
        BadRequest<ApiResponse>
    >> HandleAcceptTenantInvitation(
        [FromRoute] string token,
        [FromBody] AcceptTenantInvitationBody request,
        [FromServices] IInvitationService invitationService,
        [FromServices] ISessionService sessionService,
        [FromServices] IUserService userService,
        [FromServices] IAccountService accountService,
        [FromServices] IAuditLogService auditLogService,
        [FromServices] ILogger<AcceptTenantInvitation> logger,
        CancellationToken cancellationToken = default
    ) {
        // Validate invitation exists and is for tenant scope
        var invitation = await invitationService.GetInvitationByTokenAsync(
            token,
            cancellationToken
        );

        if (invitation is null || invitation.Scope != InvitationScope.Tenant) {
            return TypedResults.NotFound(
                ApiResponse.Create("Invitation not found", ResponseKeys.NotFound)
            );
        }

        if (invitation.TenantId is null) {
            logger.LogError(
                "Tenant invitation {InvitationId} has no TenantId",
                invitation.GetRequiredId()
            );
            return TypedResults.BadRequest(
                ApiResponse.Create(
                    "Invalid invitation: missing tenant",
                    ResponseKeys.ValidationError
                )
            );
        }

        // Check if user already exists
        var userExists = await invitationService.UserExistsAsync(
            invitation.Email,
            cancellationToken
        );
        if (userExists) {
            return TypedResults.BadRequest(
                ApiResponse.Create(
                    "User already exists",
                    ResponseKeys.UserAlreadyExists
                )
            );
        }

        // Extract values after validation
        var firstName = request.FirstName.GetString()!;
        var lastName = request.LastName.GetString()!;
        var password = request.Password.GetString()!;

        // Get AccountLevel from invitation (fallback to User for legacy invitations)
        var accountLevel = invitation.AccountLevel ?? AccountLevel.User;
        var tenantId = invitation.TenantId.Value;

        // Hash password
        var passwordHash = PasswordUtils.HashPassword(password);

        // Create user
        var user = new User {
            Email = invitation.Email,
            Password = passwordHash,
            FirstName = firstName,
            LastName = lastName,
            IsVerified = true // Email verified through invitation flow
        };

        var userResult = await userService.CreateUserAsync(user, cancellationToken);

        if (userResult is not CreateUserResult.Success successUserResult) {
            logger.LogError(
                "Failed to create user for invitation {InvitationId}: {@Result}",
                invitation.GetRequiredId(),
                userResult
            );
            return TypedResults.BadRequest(
                ApiResponse.Create(
                    "Failed to create user",
                    ResponseKeys.FailedToCreateUser
                )
            );
        }

        var userId = successUserResult.User.GetRequiredId();

        // Create tenant account with the AccountLevel from invitation
        var accountResult = await accountService.CreateTenantAccountAsync(
            userId,
            tenantId,
            accountLevel,
            cancellationToken
        );

        if (accountResult is not CreateTenantAccountResult.Success accountSuccess) {
            logger.LogError(
                "Failed to create tenant account for invitation {InvitationId}: {@Result}",
                invitation.GetRequiredId(),
                accountResult
            );
            return TypedResults.BadRequest(
                ApiResponse.Create(
                    "Failed to create account",
                    ResponseKeys.FailedToCreateAccount
                )
            );
        }

        var account = accountSuccess.Account;

        // Assign profiles from invitation (admin users have no profiles)
        if (invitation.InvitationProfiles.Any()) {
            foreach (var invitationProfile in invitation.InvitationProfiles) {
                await accountService.AssignProfileToAccountAsync(
                    account.GetRequiredId(),
                    invitationProfile.ProfileId,
                    cancellationToken
                );
            }

            logger.LogInformation(
                "Assigned {ProfileCount} profiles to account {AccountId}",
                invitation.InvitationProfiles.Count,
                account.GetRequiredId()
            );
        }

        // Mark invitation as accepted
        await invitationService.MarkInvitationAsAcceptedAsync(
            invitation.GetRequiredId(),
            cancellationToken
        );

        // Create session
        var session = await sessionService.CreateSessionForUser(
            successUserResult.User,
            cancellationToken
        );

        // Audit log
        await auditLogService.LogAsync(
            userId,
            AuditActions.TenantInvitationAccepted,
            invitation.GetRequiredId(),
            new {
                Email = invitation.Email,
                TenantId = tenantId,
                AccountLevel = accountLevel.ToString()
            },
            cancellationToken
        );

        return TypedResults.Ok(new TenantInvitationAccepted {
            UserId = userId,
            TenantId = tenantId,
            SessionToken = session.Token,
            SessionExpiresAt = session.ExpiresAt,
            SessionExpiresInMs = (session.ExpiresAt - DateTime.UtcNow).TotalMilliseconds
        });
    }
}
```

**Key Implementation Notes**:

1. **Service Layer Pattern**: Uses services (not DbContext) following the "handlers don't use DbContext" rule
2. **AccountLevel Handling**: Reads from `invitation.AccountLevel` with fallback to `User` for legacy invitations
3. **Profile Assignment**: Only assigns profiles if `InvitationProfiles` is not empty (admin users have no profiles)
4. **Required Services**:
   - `IInvitationService`: Get and mark invitation as accepted
   - `IUserService`: Create user
   - `IAccountService`: Create tenant account and assign profiles
   - `ISessionService`: Create session for login
   - `IAuditLogService`: Log acceptance event
5. **Audit Action**: Add `AuditActions.TenantInvitationAccepted` constant to your audit actions enum

**Service Methods Needed** (if they don't exist):

```csharp
// In IAccountService
Task<CreateTenantAccountResult> CreateTenantAccountAsync(
    Guid userId,
    Guid tenantId,
    AccountLevel accountLevel,
    CancellationToken cancellationToken
);

Task AssignProfileToAccountAsync(
    Guid accountId,
    Guid profileId,
    CancellationToken cancellationToken
);

// In IInvitationService
Task MarkInvitationAsAcceptedAsync(
    Guid invitationId,
    CancellationToken cancellationToken
);
```

## Testing Strategy

### Unit Tests

1. **Validator Tests**:
   - Test all validation rules
   - Test edge cases (empty arrays, missing fields, invalid email formats)
   - Test admin requirement enforcement
   - Test MaxUsers <= InitialUsers validation

2. **Service Tests**:
   - Test successful tenant creation with invitations
   - Test default profile creation
   - Test AccountLevel assignment (admin users = no profiles, regular users = default profile)
   - Test transaction rollback on any database failure

3. **Handler Tests**:
   - Test successful flow
   - Test error responses
   - Test email sending (mock)

### Integration Tests

1. **Happy Path**:
   - Create tenant with 3 users (2 admins, 1 user)
   - Verify tenant created with correct MaxUsers
   - Verify 3 invitations created
   - Verify emails sent

2. **Validation Failures**:
   - Try with 0 admins → should fail (validator rejects)
   - Try with InitialUsers > MaxUsers → should fail (validator rejects)
   - Try with duplicate emails in array → should fail (validator rejects)
   - Try with invalid email format → should fail (validator rejects)
   - Try with invalid accountLevel → should fail (validator rejects)

3. **ACID Compliance**:
   - Simulate failure after tenant creation → verify rollback
   - Simulate database connection loss → verify rollback

## Migration Path

### Phase 1: Core Implementation ✅ THIS PLAN
- Implement validation (in FluentValidation validator)
- Implement invitation-based user creation
- ✅ Support inviting existing users (they get invitations to the new tenant)
- ✅ No database validation needed (it's a brand new tenant!)
- ACID transaction wrapping

### Phase 2: Enhanced Features (Future)
- Support partial success (create what's possible, report what failed)
- Support different invitation types (immediate vs. scheduled)
- Bulk resend invitations

### Phase 3: Advanced Features (Future)
- Bulk tenant creation
- Template-based initial users
- Custom invitation expiration
- Role/profile templates

## Risks and Mitigations

### Risk 1: Profile System Complexity ✅ RESOLVED
**Risk**: Current system uses Profiles, not AccountLevel directly
**Mitigation**:
- ✅ Extend Invitation table to store AccountLevel
- ✅ Create "Default profile" (no permissions) for each tenant
- ✅ Admin users: AccountLevel.Admin, no profiles (bypass permission system)
- ✅ Non-admin users: AccountLevel.User, assigned default profile (satisfy app requirement)

### Risk 2: Email Delivery Failures
**Risk**: Invitations created but emails not sent
**Mitigation**:
- Email sending outside transaction
- Retry logic with exponential backoff
- Admin dashboard to resend invitations
- Log all email failures

### Risk 3: Partial Failures
**Risk**: Some operations might fail mid-transaction
**Mitigation**:
- All validations in validator (structure, duplicates, admin requirement)
- Transaction wraps all database operations (tenant → profile → invitations)
- Automatic rollback on any exception
- Email sending outside transaction (failure won't rollback DB changes)

### Risk 4: Database Constraints
**Risk**: Database constraint violations during creation
**Mitigation**:
- Tenant code uniqueness enforced by index
- Transaction will rollback automatically on constraint violations
- Clear error logging for debugging

## Success Criteria

1. ✅ All business rules enforced by validator
2. ✅ ACID compliance maintained
3. ✅ Invitation emails sent successfully
4. ✅ Clear error messages for all failure scenarios
5. ✅ Transaction rollback on any failure
6. ✅ Audit logging of all operations
7. ✅ Integration tests passing
8. ✅ No N+1 query issues

## Dependencies and Prerequisites

1. **Existing Systems**:
   - `IInvitationService` (already exists) ✅
   - `IEmailService` (needs new method: SendTenantInvitationEmailAsync) ⚠️
   - `Profile` system (will create default profile per tenant) ✅
   - `Polly` package (already used for retry logic) ✅

2. **New Components**:
   - Email template for tenant invitations ⚠️
   - Database migration: `AddAccountLevelToInvitations` ⚠️
   - `GetValueAsInt32()` extension methods ⚠️
   - `AcceptTenantInvitation` handler (or update existing) ⚠️

3. **Configuration**:
   - `DEFAULT_MAX_USERS_PER_TENANT` in AppSettings (already exists) ✅
   - Invitation expiration: 7 days (already configured) ✅
   - Email retry attempts: 3 (already configured via Polly) ✅

**Legend**: ✅ Already exists | ⚠️ Needs implementation

## Estimated Complexity

- **Validation Layer**: Medium (comprehensive but straightforward)
- **Service Layer**: High (transaction management, profile mapping complexity)
- **Handler Layer**: Low (orchestration only)
- **Testing**: High (many edge cases and scenarios)

**Total Estimated Effort**: 2-3 days for experienced developer

## Implementation Checklist

### Core Implementation
- [ ] **Step 0**: Add `GetValueAsInt32()` extension methods to JsonElementExtensions.cs
- [ ] **Step 1**: Extend CreateTenantAsStaffBody parsing methods (GetMaxUsers, GetInitialUsers)
- [ ] **Step 2**: Implement comprehensive validation (MaxUsers, InitialUsers, admin requirement)
- [ ] **Step 3**: Extend ITenantAsStaffService interface (CreateTenantWithInitialUsersAsync)
- [ ] **Step 4**: Implement service method with:
  - [ ] Transaction wrapping
  - [ ] Default profile creation
  - [ ] Profile assignment (admin = none, user = default)
  - [ ] AccountLevel storage in invitation
  - [ ] No database validation (it's a new tenant!)
- [ ] **Step 5**: Update handler with:
  - [ ] Polly retry logic for emails
  - [ ] Concurrency control (SemaphoreSlim)
  - [ ] Fire-and-forget email sending

### Infrastructure & Database
- [ ] **Step 6A**: Add IEmailService.SendTenantInvitationEmailAsync method
- [ ] **Step 6C**: ~~Add MAX_USERS_PER_TENANT to AppSettings~~ (Not needed - uses existing DEFAULT_MAX_USERS_PER_TENANT)
- [ ] **Step 7A**: Create database migration (AddAccountLevelToInvitations)
- [ ] **Step 7B**: Update Invitation entity (add AccountLevel property)
- [ ] **Step 7C**: Create AcceptTenantInvitation handler to:
  - [ ] Read AccountLevel from invitation
  - [ ] Set account level when creating UserAccount
  - [ ] Assign invitation profiles to UserAccountProfile

### Testing & Deployment
- [ ] Add unit tests for validator (all validation rules, edge cases)
- [ ] Add unit tests for service (transaction, rollback, batch queries)
- [ ] Add integration tests:
  - [ ] Happy path (2 admins, 1 user) - all new users
  - [ ] Happy path with existing users (should create invitations)
  - [ ] Admin requirement enforcement (reject if 0 admins)
  - [ ] MaxUsers enforcement (reject if initialUsers > maxUsers)
  - [ ] Duplicate emails in array (reject)
  - [ ] ACID rollback scenarios
  - [ ] Default profile created correctly
  - [ ] Admin users have no profiles assigned
  - [ ] Non-admin users have default profile assigned
- [ ] Create email template for tenant invitations
- [ ] Update API documentation
- [ ] Code review
- [ ] Run database migration
- [ ] Deploy and monitor

### Post-Deployment Verification
- [ ] Verify tenant creation works end-to-end
- [ ] Verify invitations accepted correctly
- [ ] Verify admin users can access everything
- [ ] Verify non-admin users have limited access (default profile)
- [ ] Monitor database performance (no N+1 queries)
- [ ] Monitor email delivery success rate

---

## Quick Reference Summary

### Key Architectural Decisions

1. **User Creation Strategy**: Invitation-based (not direct creation)
   - Users set their own passwords
   - Email verification built-in
   - Better security and audit trail

2. **MaxUsers Field Behavior**: Optional with fallback
   - If provided: Use the specified value (no ceiling enforced)
   - If omitted/null: Defaults to `DEFAULT_MAX_USERS_PER_TENANT` (100)
   - Staff can create tenants with any MaxUsers value (e.g., 500, 1000, etc.)

3. **Account Level Storage**: In `invitations` table
   - Add `account_level` column (nullable int)
   - Populated for tenant invitations only

4. **Profile Assignment Strategy**:
   ```
   Admin users:
     - AccountLevel = Admin
     - Profiles = [] (empty - they bypass the permission system)

   Non-admin users:
     - AccountLevel = User
     - Profiles = ["Default profile"] (satisfies app requirement)
   ```

5. **Default Profile**: Created automatically per tenant
   - Name: "Default profile"
   - Permissions: None
   - Purpose: Satisfy app requirement that users need ≥1 profile

### Database Impact

**Tables Modified**: 1
- `invitations`: Add `account_level` column (int, nullable)

**Tables Created**: 0 (uses existing tables)

**New Profiles Per Tenant**: 1 ("Default profile")

### Performance Characteristics

**Database Round Trips** (for N initial users):
1. Create tenant → SaveChanges
2. Create default profile → SaveChanges
3. Create N invitations (no DB calls in loop) → Single SaveChanges
4. Commit transaction

**Total**: 4 database operations (independent of N)

**Email Sending**:
- Fire-and-forget (outside transaction)
- Max 5 concurrent emails (SemaphoreSlim)
- 3 retry attempts per email (Polly)
- Exponential backoff (1s, 2s, 4s)

### Example Request/Response

**Request Example 1** (with MaxUsers specified):
```json
POST /api/staff/tenants

{
  "name": "Acme Corporation",
  "maxUsers": 50,
  "initialUsers": [
    { "email": "admin@acme.com", "accountLevel": "admin" },
    { "email": "manager@acme.com", "accountLevel": "admin" },
    { "email": "user@acme.com", "accountLevel": "user" }
  ]
}
```

**Request Example 2** (MaxUsers omitted - uses default):
```json
POST /api/staff/tenants

{
  "name": "Small Startup",
  "initialUsers": [
    { "email": "founder@startup.com", "accountLevel": "admin" }
  ]
}
```
In this case, `maxUsers` will default to `DEFAULT_MAX_USERS_PER_TENANT` (100).

**Response** (Success):
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "name": "Acme Corporation"
}
```

**Database State After** (Example 1):
- 1 tenant created (status: Pending, maxUsers: 50)
- 1 profile created ("Default profile", tenant-scoped, no permissions)
- 3 invitations created:
  - admin@acme.com: AccountLevel=Admin, Profiles=[]
  - manager@acme.com: AccountLevel=Admin, Profiles=[]
  - user@acme.com: AccountLevel=User, Profiles=[Default profile]
- 3 emails sent (async)

### Common Gotchas

1. **Don't forget**: Add `using MainApi.Src.Lib.Extensions;` for `GetValueAsInt32()`
2. **Don't forget**: Add `using Polly;` for retry logic
3. **Don't forget**: Inject `IOptions<AppSettings>` in the handler to access DEFAULT_MAX_USERS_PER_TENANT
4. **MaxUsers is optional**: It's a fallback/default, NOT a ceiling. Staff can create tenants with any MaxUsers value
5. **Transaction scope**: No database validation needed - it's a brand new tenant!
6. **Profile creation**: Must happen BEFORE invitation creation (need the ID)
7. **SaveChanges timing**: 3 separate calls required (tenant → profile → invitations)
8. **Email failures**: Don't rethrow - log and continue
9. **Admin users**: Empty profile list is intentional, not a bug
10. **Existing users**: Completely fine! They'll get invitations to the new tenant
11. **All validation in validator**: Duplicates, admin requirement, maxUsers - all in Step 2

### Validation Examples

**✅ ALLOWED - Existing user invited to new tenant:**
```
User alice@example.com exists in Tenant A
→ Create Tenant B with alice@example.com in initialUsers
→ SUCCESS: Alice gets invitation to join Tenant B (can belong to multiple tenants)
```

**❌ REJECTED - Duplicate in initialUsers array:**
```
Create Tenant A with initialUsers:
  - bob@example.com (admin)
  - bob@example.com (user)  ← DUPLICATE!
→ ERROR (Validator): "Duplicate emails: bob@example.com"
```

**✅ ALLOWED - New user:**
```
User charlie@example.com doesn't exist yet
→ Create Tenant B with charlie@example.com in initialUsers
→ SUCCESS: Charlie gets invitation, will create account on acceptance
```

**❌ REJECTED - No admin:**
```
Create Tenant A with initialUsers:
  - user1@example.com (user)
  - user2@example.com (user)  ← All users, no admin!
→ ERROR (Validator): "At least one user with accountLevel 'admin' is required"
```

**✅ ALLOWED - MaxUsers exceeds DEFAULT_MAX_USERS_PER_TENANT:**
```
Create Tenant A with maxUsers: 500 (DEFAULT is 100)
  - admin@example.com (admin)
  - ... (up to 500 users total)
→ SUCCESS: DEFAULT_MAX_USERS_PER_TENANT is a fallback, not a ceiling
```

**✅ ALLOWED - MaxUsers omitted:**
```
Create Tenant A without specifying maxUsers
  - admin@example.com (admin)
→ SUCCESS: maxUsers defaults to DEFAULT_MAX_USERS_PER_TENANT (100)
```

### Files to Modify

Core Changes:
- `JsonElementExtensions.cs` - Add GetValueAsInt32()
- `CreateTenantAsStaff.cs` - All 3 classes (Body, Validator, Handler)
- `TenantAsStaffService.cs` - Interface + implementation
- `Invitation.cs` - Add AccountLevel property
- ~~`AppSettings.cs`~~ (Not needed - uses existing DEFAULT_MAX_USERS_PER_TENANT)

New Files:
- Migration file: `AddAccountLevelToInvitations.cs`
- Handler: `AcceptTenantInvitation.cs` (new file)
- Email template: (format depends on your email system)

### Implementation Time Estimate

- Step 0-2 (Extensions + Body + Validation): 3-4 hours
- Step 3-4 (Service layer): 4-6 hours
- Step 5 (Handler + retry logic): 2-3 hours
- Step 6-7 (Infrastructure + migration): 2-3 hours
- Testing: 4-6 hours
- **Total**: 15-22 hours (2-3 days)
