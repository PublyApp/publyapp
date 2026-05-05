# Round 7 Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all Round 7 deep review findings - fix UpdateStaffUser status contract, add empty-body guard, strengthen test assertions, fix guard clause

**Architecture:** Fix UpdateStaffUser contract issues, add no-fields guard, strengthen tests, fix CreateInvitationForTenantAsStaff guard clause

**Tech Stack:** .NET 10, FluentValidation, Entity Framework Core, Integration Tests

---

## Task 1: Fix UpdateStaffUser Status Contract (Remove Unused Field)

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- Modify: `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`

**Context:**
UpdateStaffUser validates `Status` in the body, but never applies it to the document. This is a false API contract. Per the review, we should remove it since it's not being used.

**Step 1: Remove Status from handler body DTO**

In UpdateStaffUser.cs, find and remove:
```csharp
public JsonElement? Status { get; set; }
```

And remove the getter:
```csharp
public string? GetStatus() => Status?.GetValueAsStringOrNull();
```

**Step 2: Remove Status from validator**

Find and remove the Status validation rule in UpdateStaffUserBodyValidator.

**Step 3: Remove Status from frontend hook**

In staff-user.hooks.ts, remove status from the mutation variables type.

**Step 4: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 2: Add Empty-Body Guard to UpdateStaffUser

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`

**Context:**
Unlike UpdateTenantUserAsStaff, UpdateStaffUser allows empty PATCH and treats it as success. We need to add a "No fields to update" guard.

**Step 1: Read the handler to find where to add the guard**

Find the location after GUID validation and before calling the service.

**Step 2: Add the no-fields guard**

Add after the GUID validation:

```csharp
if (body.GetEmail() is null
    && !body.GetFirstName().IsPresent
    && !body.GetLastName().IsPresent
    && !body.GetAvatarUrl().IsPresent
    && body.GetAccountLevel() is null) {
    return TypedProblems.BadRequest(
        "No fields to update",
        ResponseKeys.BadRequest
    );
}
```

Note: We removed Status, so it's not in the check anymore.

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 3: Strengthen Malformed UserId Test Assertions

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs`

**Context:**
The malformed userId tests assert HTTP 400 but not the translation key. We need to add the key assertion.

**Step 1: Update UpdateTenantUserAsStaff spec**

Find the test for malformed userId and add:
```csharp
var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
problem.Should().NotBeNull();
problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId.Key);
```

**Step 2: Update RemoveUserFromTenantAsStaff spec**

Find the test for malformed userId and add the same assertion.

**Step 3: Run tests**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~RemoveUserFromTenantAsStaffSpec"`
Expected: ALL PASS

---

## Task 4: Fix CreateInvitationForTenantAsStaff Guard Clause

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs`

**Context:**
The handler uses a Forbidden fallback when AccountStaff is null, but for a staff endpoint guarded by .WithPermission(), this should be a guard-clause failure.

**Step 1: Find the current pattern**

Look for:
```csharp
var account = authContext.AccountStaff;
if (account is null) {
    return TypedProblems.Forbidden(...);
}
```

**Step 2: Replace with guard clause**

Change to:
```csharp
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has .WithPermission() middleware."
    );
}
```

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 5: Run Full Test Suite Verification

**Step 1: Run related tests**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~RemoveUserFromTenantAsStaffSpec|FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~CreateInvitationForTenantAsStaffSpec"`
Expected: ALL PASS

**Step 2: Run full API build**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

**Step 3: Run frontend type check**

Run: `make tsc-front`
Expected: PASS
