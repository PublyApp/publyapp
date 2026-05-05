# Round 5 Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all Round 5 deep review findings - convert firstName/lastName to PatchField pattern, strengthen transaction isolation, add invariant tests, and fix response key

**Architecture:** Convert firstName/lastName to use PatchField<string?> pattern matching avatarUrl semantics. Add IsolationLevel.Serializable to transaction. Add CannotDemoteLastAdmin and CannotRemoveLastAdmin tests. Fix UpdateStaffUser response key.

**Tech Stack:** .NET 10, FluentValidation, Entity Framework Core, Integration Tests

---

## Task 1: Convert firstName/lastName to PatchField Pattern in Handler

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs:40-63`

**Step 1: Update the body DTO**

Modify `UpdateTenantUserAsStaffBody` to use non-nullable JsonElement and return PatchField:

```csharp
// Change from:
public JsonElement? FirstName { get; set; }
public JsonElement? LastName { get; set; }

// To:
public JsonElement FirstName { get; init; }
public JsonElement LastName { get; init; }

// Update getters:
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

**Step 2: Update the "No fields to update" check**

Change from:
```csharp
if (body.GetFirstName() is null
    && body.GetLastName() is null
    && !body.GetAvatarUrl().IsPresent
    && body.GetLevel() is null)
```

To:
```csharp
if (!body.GetFirstName().IsPresent
    && !body.GetLastName().IsPresent
    && !body.GetAvatarUrl().IsPresent
    && body.GetLevel() is null)
```

**Step 3: Update the document creation**

Change from:
```csharp
var updateDocument = new UpdateTenantUserDocument {
    FirstName = body.GetFirstName(),
    LastName = body.GetLastName(),
    AvatarUrl = body.GetAvatarUrl(),
    Level = body.GetLevel(),
};
```

To:
```csharp
var updateDocument = new UpdateTenantUserDocument {
    FirstName = body.GetFirstName(),
    LastName = body.GetLastName(),
    AvatarUrl = body.GetAvatarUrl(),
    Level = body.GetLevel(),
};
```

**Step 4: Update the audit log payload**

Change from:
```csharp
UpdatedFields = new {
    FirstName = body.GetFirstName() is not null,
    LastName = body.GetLastName() is not null,
    AvatarUrl = body.GetAvatarUrl().IsPresent,
    Level = body.GetLevel() is not null,
}
```

To:
```csharp
UpdatedFields = new {
    FirstName = body.GetFirstName().IsPresent,
    LastName = body.GetLastName().IsPresent,
    AvatarUrl = body.GetAvatarUrl().IsPresent,
    Level = body.GetLevel() is not null,
}
```

**Step 5: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 2: Convert firstName/lastName to PatchField Pattern in Service Document

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs:65-70`

**Step 1: Update UpdateTenantUserDocument**

Change from:
```csharp
public class UpdateTenantUserDocument {
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
    public string? Level { get; set; }
}
```

To:
```csharp
public class UpdateTenantUserDocument {
    public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
    public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
    public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
    public string? Level { get; set; }
}
```

**Step 2: Update service application logic**

Change from:
```csharp
// Update user profile fields
if (document.FirstName is not null) {
    user.FirstName = document.FirstName;
}
if (document.LastName is not null) {
    user.LastName = document.LastName;
}
```

To:
```csharp
// Update user profile fields
if (document.FirstName.IsPresent) {
    user.FirstName = document.FirstName.Value;
}
if (document.LastName.IsPresent) {
    user.LastName = document.LastName.Value;
}
```

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 3: Strengthen Transaction Isolation Level

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs:750-751` (RemoveUserFromTenantAsync)
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs:820-821` (UpdateTenantUserAsync)

**Step 1: Add IsolationLevel.Serializable to RemoveUserFromTenantAsync**

Add using for IsolationLevel:
```csharp
using System.Data;
```

Change from:
```csharp
await using var transaction =
    await _dbContext.Database.BeginTransactionAsync(cancellationToken);
```

To:
```csharp
await using var transaction =
    await _dbContext.Database.BeginTransactionAsync(
        IsolationLevel.Serializable,
        cancellationToken
    );
```

**Step 2: Add IsolationLevel.Serializable to UpdateTenantUserAsync**

Change from:
```csharp
await using var transaction =
    await _dbContext.Database.BeginTransactionAsync(cancellationToken);
```

To:
```csharp
await using var transaction =
    await _dbContext.Database.BeginTransactionAsync(
        IsolationLevel.Serializable,
        cancellationToken
    );
```

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 4: Fix UpdateStaffUser Malformed-ID Response Key

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs:81-92`

**Step 1: Change ResponseKeys.BadRequest to ResponseKeys.MalformedId**

Change from:
```csharp
return TypedProblems.BadRequest(
    "Invalid user ID",
    ResponseKeys.BadRequest
);
```

To:
```csharp
return TypedProblems.BadRequest(
    "Invalid user ID",
    ResponseKeys.MalformedId
);
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 5: Add CannotDemoteLastAdmin Test

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`

**Step 1: Read existing spec file to find test structure**

**Step 2: Add test for CannotDemoteLastAdmin**

Add this test method to the spec class:

```csharp
[Fact]
public async Task ItShouldReturnBadRequestWhenDemotingLastAdmin()
{
    // Arrange: Create a tenant with only one admin
    var tenant = await Fixture.CreateTenantAsync();
    var adminUser = await Fixture.CreateUserAsync();
    await Fixture.CreateUserAccountAsync(
        tenantId: tenant.Id,
        userId: adminUser.Id,
        level: AccountLevel.Admin
    );

    // Act
    var response = await AppClient.PatchAsStaffAsync(
        $"/staff/tenants/{tenant.Id}/users/{adminUser.Id}",
        new { level = "User" }
    );

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
    problem.Should().NotBeNull();
    problem!.TranslationKey.Should().Be(ResponseKeys.CannotDemoteLastAdmin.Key);
}
```

**Step 3: Run the test**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec.ItShouldReturnBadRequestWhenDemotingLastAdmin"`
Expected: PASS

---

## Task 6: Add CannotRemoveLastAdmin Test

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs`

**Step 1: Read existing spec file to find test structure**

**Step 2: Add test for CannotRemoveLastAdmin**

Add this test method to the spec class:

```csharp
[Fact]
public async Task ItShouldReturnBadRequestWhenRemovingLastAdmin()
{
    // Arrange: Create a tenant with only one admin
    var tenant = await Fixture.CreateTenantAsync();
    var adminUser = await Fixture.CreateUserAsync();
    await Fixture.CreateUserAccountAsync(
        tenantId: tenant.Id,
        userId: adminUser.Id,
        level: AccountLevel.Admin
    );

    // Act
    var response = await AppClient.DeleteAsStaffAsync(
        $"/staff/tenants/{tenant.Id}/users/{adminUser.Id}"
    );

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
    problem.Should().NotBeNull();
    problem!.TranslationKey.Should().Be(ResponseKeys.CannotRemoveLastAdmin.Key);
}
```

**Step 3: Run the test**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~RemoveUserFromTenantAsStaffSpec.ItShouldReturnBadRequestWhenRemovingLastAdmin"`
Expected: PASS

---

## Task 7: Add firstName/lastName Null-Clear Test

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`

**Step 1: Add test for clearing firstName with null**

Add this test method:

```csharp
[Fact]
public async Task ItShouldClearFirstNameWhenNullIsProvided()
{
    // Arrange: Create tenant with user
    var tenant = await Fixture.CreateTenantAsync();
    var user = await Fixture.CreateUserAsync();
    var userAccount = await Fixture.CreateUserAccountAsync(
        tenantId: tenant.Id,
        userId: user.Id,
        firstName: "John",
        lastName: "Doe"
    );

    // Act: Send explicit null to clear firstName
    var response = await AppClient.PatchAsStaffAsync(
        $"/staff/tenants/{tenant.Id}/users/{user.Id}",
        new { firstName = null }
    );

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);
    var result = await response.Content.ReadFromJsonAsync<TenantUserDetailsResult>();
    result.Should().NotBeNull();
    result!.FirstName.Should().BeNull();
    result.LastName.Should().Be("Doe");
}
```

**Step 2: Run the test**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec.ItShouldClearFirstNameWhenNullIsProvided"`
Expected: PASS

---

## Task 8: Run Full Test Suite

**Step 1: Run all tenant-user related tests**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~RemoveUserFromTenantAsStaffSpec"`
Expected: ALL PASS

**Step 2: Run full API build**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

**Step 3: Run frontend type check**

Run: `make tsc-front`
Expected: PASS
