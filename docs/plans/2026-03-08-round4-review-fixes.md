# Round 4 Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, major, and minor issues identified in Round 4 deep review.

**Architecture:** Fix frontend null handling, add transaction/locking for race conditions, add guard clauses for audit, upgrade UpdateStaffUser, and add integration tests.

**Tech Stack:** .NET 10, React 19, TanStack Query, FluentValidation, EF Core transactions

---

## Task 1: Fix Frontend firstName/lastName Types

**Files:**
- Modify: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

**Context:** Make firstName and lastName clearable to match backend validation.

**Step 1: Update the hook variables type**

In `staff-tenant.hooks.ts`, find the `useUpdateTenantUser` hook and update the variables type:

```typescript
// Current:
variables: {
    tenantId: string;
    userId: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string | null;
    level?: 'Admin' | 'User';
}

// Fixed:
variables: {
    tenantId: string;
    userId: string;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    level?: 'Admin' | 'User';
}
```

**Step 2: Run TypeScript check**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make tsc-front
```

Expected: No errors

---

## Task 2: Add Transaction + Locking for Last-Admin Invariant

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`

**Context:** Wrap the check + mutation in a transaction to prevent race conditions.

**Step 1: Update RemoveUserFromTenantAsync**

Add a transaction around the admin count check and the soft delete:

```csharp
// Find the method and add transaction
await using var transaction =
    await _dbContext.Database.BeginTransactionAsync(cancellationToken);

try {
    // Existing admin count check code here...

    // Soft delete
    userAccount.IsDeleted = true;
    userAccount.DeletedAt = DateTime.UtcNow;
    await _dbContext.SaveChangesAsync(cancellationToken);

    await transaction.CommitAsync(cancellationToken);
}
catch {
    await transaction.RollbackAsync(cancellationToken);
    throw;
}
```

**Step 2: Update UpdateTenantUserAsync demote path**

Add the same transaction pattern around the demote admin count check and level change.

**Step 3: Build to verify**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make build-api
```

Expected: Build succeeds

---

## Task 3: Add Guard Clause for Audit Logging

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`

**Context:** Throw exception if AccountStaff is null instead of silently skipping audit.

**Step 1: Update UpdateTenantUserAsStaff.cs**

Find the audit logging section and replace:

```csharp
// Current:
var actorUserId = authContext.AccountStaff?.UserId;
if (actorUserId is not null) {
    await auditLogService.LogAsync(...);
}

// Fixed:
var account = authContext.AccountStaff
    ?? throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has "
        + ".WithPermission() middleware."
    );

await auditLogService.LogAsync(
    account.UserId,
    AuditActions.TenantUserUpdated,
    ...
);
```

**Step 2: Update RemoveUserFromTenantAsStaff.cs**

Do the same fix for the remove handler.

**Step 3: Build to verify**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make build-api
```

Expected: Build succeeds

---

## Task 4: Upgrade UpdateStaffUser to PatchField

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`

**Context:** Apply the same PatchField pattern to UpdateStaffUser for consistency.

**Step 1: Update UpdateStaffUserBody**

In `UpdateStaffUser.cs`:

```csharp
// Current:
public JsonElement? AvatarUrl { get; set; }
public string? GetAvatarUrl() => AvatarUrl?.GetValueAsStringOrNull();

// Fixed:
public JsonElement AvatarUrl { get; init; }

public PatchField<string?> GetAvatarUrl() =>
    AvatarUrl.ValueKind switch {
        JsonValueKind.Undefined => PatchField<string?>.Absent(),
        JsonValueKind.Null => PatchField<string?>.Set(null),
        JsonValueKind.String => PatchField<string?>.Set(AvatarUrl.GetValueAsString()),
        _ => throw new InvalidOperationException("AvatarUrl must be a string, null, or omitted"),
    };
```

Make sure to add the import:
```csharp
using MainApi.Src.Lib;
```

**Step 2: Update UpdateUserDocument**

In `UserService.cs`:

```csharp
// Current:
public string? AvatarUrl { get; set; }

// Fixed:
public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
```

**Step 3: Update the service method that applies UpdateUserDocument**

In `UserService.cs`, find where AvatarUrl is applied and update:

```csharp
// Current:
if (document.AvatarUrl is not null) {
    user.AvatarUrl = document.AvatarUrl;
}

// Fixed:
if (document.AvatarUrl.IsPresent) {
    user.AvatarUrl = document.AvatarUrl.Value;
}
```

**Step 4: Build to verify**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make build-api
```

Expected: Build succeeds

**Step 5: Regenerate OpenAPI and client**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make build-api && make generate-client
```

---

## Task 5: Add Integration Tests

**Files:**
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`
- Create: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs`

**Context:** Add integration tests for the mutation paths.

**Step 1: Create UpdateTenantUserAsStaff.Spec.cs**

Follow the existing spec pattern. Minimum tests:

```csharp
public sealed class UpdateTenantUserAsStaffSpec : IClassFixture<ApiFixture> {
    [Fact]
    public async Task ItShouldUpdateLevelWhenValid() { }

    [Fact]
    public async Task ItShouldClearAvatarUrlWhenExplicitNull() { }

    [Fact]
    public async Task ItShouldReturnBadRequestWhenNoFields() { }

    [Fact]
    public async Task ItShouldReturnBadRequestWhenMalformedTenantId() { }

    [Fact]
    public async Task ItShouldReturnConflictWhenDemotingLastAdmin() { }
}
```

**Step 2: Create RemoveUserFromTenantAsStaff.Spec.cs**

```csharp
public sealed class RemoveUserFromTenantAsStaffSpec : IClassFixture<ApiFixture> {
    [Fact]
    public async Task ItShouldRemoveUserSuccessfully() { }

    [Fact]
    public async Task ItShouldReturnConflictWhenRemovingLastAdmin() { }
}
```

**Step 3: Run tests**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make test-api
```

Expected: Tests pass

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Fix frontend firstName/lastName types (make clearable) |
| 2 | Add transaction + locking for last-admin invariant |
| 3 | Add guard clause for audit logging |
| 4 | Upgrade UpdateStaffUser to PatchField |
| 5 | Add integration tests |
