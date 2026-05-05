# Round 6 Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all Round 6 deep review findings - fix transaction atomicity, MalformedId violations, UpdateStaffUser PatchField, remove obsolete placeholders, strengthen tests

**Architecture:** Make UpdateTenantUserAsync fully atomic, fix remaining MalformedId violations, convert UpdateStaffUser FirstName/LastName to PatchField, cleanup test files

**Tech Stack:** .NET 10, FluentValidation, Entity Framework Core, Integration Tests

---

## Task 1: Fix UpdateTenantUserAsync Transaction Atomicity

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs:786-890` (UpdateTenantUserAsync method)

**Context:**
The current implementation opens a transaction only for the last-admin invariant check, commits it, then saves profile changes separately. This breaks atomicity - if the second save fails, the request partially applies.

**Step 1: Read the current UpdateTenantUserAsync implementation**

Find the method and understand its current structure:
- Where is the transaction started?
- Where is it committed?
- Where are profile fields saved?

**Step 2: Refactor to make atomic**

The goal: keep invariant check AND all mutations under the same transaction/save cycle.

Current (broken) pattern:
```csharp
// Inside transaction
account.Level = newLevel;
await SaveChangesAsync();
await transaction.CommitAsync();

// AFTER transaction - NOT atomic!
if (document.FirstName.IsPresent) { ... }
if (document.LastName.IsPresent) { ... }
if (document.AvatarUrl.IsPresent) { ... }
await SaveChangesAsync();
```

New pattern:
```csharp
var needsAdminInvariantTransaction =
    document.Level is not null
    && account.Level == AccountLevel.Admin
    && newLevel != AccountLevel.Admin;

await using var transaction =
    needsAdminInvariantTransaction
        ? await _dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken
        )
        : null;

try {
    if (needsAdminInvariantTransaction) {
        // Count active admins
        if (adminCount == 0) {
            return new UpdateTenantUserResult.CannotDemoteLastAdmin();
        }
    }

    // Apply ALL changes: account level + user profile fields
    if (document.Level is not null) {
        account.Level = newLevel.Value;
    }
    if (document.FirstName.IsPresent) {
        user.FirstName = document.FirstName.Value;
    }
    if (document.LastName.IsPresent) {
        user.LastName = document.LastName.Value;
    }
    if (document.AvatarUrl.IsPresent) {
        user.AvatarUrl = document.AvatarUrl.Value;
    }

    account.UpdatedAt = DateTime.UtcNow;
    user.UpdatedAt = DateTime.UtcNow;

    await _dbContext.SaveChangesAsync(cancellationToken);

    if (transaction is not null) {
        await transaction.CommitAsync(cancellationToken);
    }
}
catch {
    if (transaction is not null) {
        await transaction.RollbackAsync(cancellationToken);
    }
    throw;
}
```

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 2: Fix MalformedId Violations Repo-Wide

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs:67-71`
- Modify: `apps/api/Src/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs:38-39`

**Step 1: Fix CreateInvitationForTenantAsStaff**

Find and fix the tenantId validation:

```csharp
// Change from:
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.BadRequest
);

// To:
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.MalformedId
);
```

**Step 2: Fix FindTenantProfilesAsStaff**

Find and fix the tenantId validation:

```csharp
// Change from:
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.BadRequest
);

// To:
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.MalformedId
);
```

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 3: Convert UpdateStaffUser FirstName/LastName to PatchField

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs` (UpdateUserDocument)

**Context:**
UpdateStaffUser currently mixes two PATCH models: AvatarUrl uses PatchField, but FirstName/LastName use the old JsonElement? pattern. We need consistency.

**Step 1: Update the body DTO**

Change:
```csharp
public JsonElement? FirstName { get; set; }
public JsonElement? LastName { get; set; }
```

To:
```csharp
public JsonElement FirstName { get; init; }
public JsonElement LastName { get; init; }
```

**Step 2: Update the getters**

Change:
```csharp
public string? GetFirstName() => FirstName?.GetValueAsStringOrNull();
public string? GetLastName() => LastName?.GetValueAsStringOrNull();
```

To:
```csharp
public PatchField<string?> GetFirstName() =>
    FirstName.ValueKind switch {
        JsonValueKind.Undefined => PatchField<string?>.Absent(),
        JsonValueKind.Null => PatchField<string?>.Set(null),
        JsonValueKind.String => PatchField<string?>.Set(FirstName.GetValueAsString()),
        _ => throw new InvalidOperationException("FirstName must be a string, null, or omitted"),
    };

public PatchField<string?> GetLastName() =>
    LastName.ValueKind switch {
        JsonValueKind.Undefined => PatchField<string?>.Absent(),
        JsonValueKind.Null => PatchField<string?>.Set(null),
        JsonValueKind.String => PatchField<string?>.Set(LastName.GetValueAsString()),
        _ => throw new InvalidOperationException("LastName must be a string, null, or omitted"),
    };
```

**Step 3: Update the validator**

Change:
```csharp
RuleFor(x => x.FirstName)
    .MustBeNullableNonEmptyString("FirstName");

RuleFor(x => x.LastName)
    .MustBeNullableNonEmptyString("LastName");
```

To:
```csharp
RuleFor(x => x.FirstName)
    .MustBePatchFieldString("FirstName");

RuleFor(x => x.LastName)
    .MustBePatchFieldString("LastName");
```

**Step 4: Update the UpdateUserDocument**

Find `UpdateUserDocument` class and change:
```csharp
public string? FirstName { get; set; }
public string? LastName { get; set; }
```

To:
```csharp
public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
```

**Step 5: Update the service method**

Find where `UpdateUserDocument` is applied in `UpdateStaffUserByIdAsync` or related method:

Change:
```csharp
if (document.FirstName is not null) {
    user.FirstName = document.FirstName;
}
if (document.LastName is not null) {
    user.LastName = document.LastName;
}
```

To:
```csharp
if (document.FirstName.IsPresent) {
    user.FirstName = document.FirstName.Value;
}
if (document.LastName.IsPresent) {
    user.LastName = document.LastName.Value;
}
```

**Step 6: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 4: Remove Obsolete Commented-Out Placeholders

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs`
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs`

**Step 1: Remove UpdateTenantUserAsStaff placeholder**

Find and delete lines 249-254:
```csharp
// NOTE: "last admin" test skipped - requires isolated tenant state
// [Fact]
// public async Task
// ItShouldReturnConflictWhenDemotingLastAdmin() { }
```

**Step 2: Remove RemoveUserFromTenantAsStaff placeholder**

Find and delete lines 78-81:
```csharp
// NOTE: "last admin" test skipped - requires isolated tenant state
// [Fact]
// public async Task
// ItShouldReturnConflictWhenRemovingLastAdmin() { }
```

**Step 3: Remove CreateTenantAsStaff placeholder**

Find and delete the stale placeholder (around lines 23-26).

**Step 4: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 5: Strengthen Malformed-ID Tests

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs`

**Context:**
The tests currently assert HTTP 400 but not the translation key. We need to add the key assertion.

**Step 1: Update UpdateTenantUserAsStaff spec**

Find the test that checks for invalid tenantId (around line 185) and add translation key assertion:

```csharp
var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
problem.Should().NotBeNull();
problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId.Key);
```

**Step 2: Update RemoveUserFromTenantAsStaff spec**

Find the test that checks for invalid tenantId and add translation key assertion.

**Step 3: Run tests**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~RemoveUserFromTenantAsStaffSpec"`
Expected: ALL PASS

---

## Task 6: Run Full Test Suite Verification

**Step 1: Run all tenant-user related tests**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~RemoveUserFromTenantAsStaffSpec|FullyQualifiedName~CreateInvitationForTenantAsStaffSpec"`
Expected: ALL PASS

**Step 2: Run full API build**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

**Step 3: Run frontend type check**

Run: `make tsc-front`
Expected: PASS
