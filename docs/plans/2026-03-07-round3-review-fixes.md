# Round 3 Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, major, and minor issues identified in Round 3 deep review to make the tenant-user PATCH endpoint production-ready.

**Architecture:** Fix last-admin invariant consistency, remove isSuspended from PATCH, implement PatchField for avatarUrl, fix ResponseKeys, and use generated types in frontend.

**Tech Stack:** .NET 10, React 19, TanStack Query, FluentValidation, PatchField pattern

---

## Task 1: Fix Last-Admin Invariant Consistency

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs` (lines 751-763, 807-820, 827-841)

**Context:** Remove, demote, and suspend operations currently use different predicates for counting remaining admins. They should all count only ACTIVE (non-suspended) admins.

**Step 1: Fix RemoveUserFromTenantAsync admin count query**

Find the admin count query in `RemoveUserFromTenantAsync` (around lines 751-763) and add `&& !ua.IsSuspended`:

```csharp
// Current (wrong):
var adminCount = await (
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.Level == AccountLevel.Admin
        && !ua.IsDeleted
    select ua
).CountAsync(cancellationToken);

// Fixed:
var adminCount = await (
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.Level == AccountLevel.Admin
        && !ua.IsSuspended  // ADD THIS
        && !ua.IsDeleted
    select ua
).CountAsync(cancellationToken);
```

**Step 2: Fix UpdateTenantUserAsync demote admin count query**

Find the admin count query in `UpdateTenantUserAsync` for demotion (around lines 807-820) and add `&& !ua.IsSuspended`:

```csharp
// Current (wrong):
var adminCount = await (
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.Level == AccountLevel.Admin
        && ua.UserId != userId
        && !ua.IsDeleted
    select ua
).CountAsync(cancellationToken);

// Fixed:
var adminCount = await (
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.Level == AccountLevel.Admin
        && ua.UserId != userId
        && !ua.IsSuspended  // ADD THIS
        && !ua.IsDeleted
    select ua
).CountAsync(cancellationToken);
```

**Step 3: Verify suspend check already has !ua.IsSuspended**

The suspend check at lines 827-841 already has `&& !ua.IsSuspended`. Verify it's there.

**Step 4: Build to verify**

Run: `make build-api`
Expected: Build succeeds

**Step 5: Stage and note**

```bash
git add apps/api/Src/Modules/Users/Services/UserService.cs
# Don't commit yet - will commit with other fixes
```

---

## Task 2: Remove isSuspended from PATCH Contract

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`

**Context:** The isSuspended field is being removed from the PATCH contract. The list query doesn't include suspended accounts, so the edit wouldn't be usable anyway.

**Step 1: Update UpdateTenantUserAsStaffBody**

In `UpdateTenantUserAsStaff.cs`:

Remove `IsSuspended` property:
```csharp
// REMOVE these lines:
public JsonElement? IsSuspended { get; set; }
```

Remove `GetIsSuspended()` method:
```csharp
// REMOVE this method:
public bool? GetIsSuspended() {
    if (IsSuspended is null) return null;
    var element = IsSuspended.Value;
    if (element.ValueKind == JsonValueKind.Null) return null;
    if (element.ValueKind == JsonValueKind.True) return true;
    if (element.ValueKind == JsonValueKind.False) return false;
    return null;
}
```

Remove validation rule:
```csharp
// REMOVE this rule from the validator:
RuleFor(x => x.IsSuspended)
    .MustBeNullableBoolean("IsSuspended");
```

**Step 2: Update UpdateTenantUserDocument**

In `UserService.cs`:

Remove `IsSuspended` property from `UpdateTenantUserDocument` class:
```csharp
// REMOVE:
public bool? IsSuspended { get; set; }
```

**Step 3: Update UpdateTenantUserAsync method**

In `UserService.cs`:

Remove the isSuspended check block (around lines 827-843):
```csharp
// REMOVE this entire block:
if (document.IsSuspended is true && !account.IsSuspended) {
    var adminCount = await (
        from ua in _dbContext.UserAccount
        where ua.TenantId == tenantId
            && ua.Scope == AccountScope.Tenant
            && ua.Level == AccountLevel.Admin
            && ua.UserId != userId
            && !ua.IsSuspended
            && !ua.IsDeleted
        select ua
    ).CountAsync(cancellationToken);

    if (adminCount == 0) {
        return new UpdateTenantUserResult.CannotSuspendLastAdmin();
    }
}
```

Remove the isSuspended update (around lines 857-859):
```csharp
// REMOVE:
if (document.IsSuspended is not null) {
    account.IsSuspended = document.IsSuspended.Value;
}
```

**Step 4: Remove CannotSuspendLastAdmin result type**

In `UserService.cs`:

Remove `CannotSuspendLastAdmin` from the `UpdateTenantUserResult` discriminated union if it exists. Check if `CannotSuspendLastAdmin` is used anywhere else before removing.

**Step 5: Update the handler**

In `UpdateTenantUserAsStaff.cs`:

Update the "no fields to update" check to remove `isSuspended`:
```csharp
// Current:
if (body.GetFirstName() is null
    && body.GetLastName() is null
    && body.GetAvatarUrl() is null
    && body.GetLevel() is null
    && body.GetIsSuspended() is null) {

// Fixed:
if (body.GetFirstName() is null
    && body.GetLastName() is null
    && body.GetAvatarUrl() is null
    && body.GetLevel() is null) {
```

Update the audit log to remove IsSuspended:
```csharp
// Current:
UpdatedFields = new {
    FirstName = body.GetFirstName() is not null,
    LastName = body.GetLastName() is not null,
    AvatarUrl = body.GetAvatarUrl() is not null,
    Level = body.GetLevel() is not null,
    IsSuspended = body.GetIsSuspended() is not null,
}

// Fixed:
UpdatedFields = new {
    FirstName = body.GetFirstName() is not null,
    LastName = body.GetLastName() is not null,
    AvatarUrl = body.GetAvatarUrl() is not null,
    Level = body.GetLevel() is not null,
}
```

Update the response to remove IsSuspended:
```csharp
// Current:
return TypedResults.Ok(
    new TenantUserDetailsResult {
        // ... existing fields
        IsSuspended = userData.Account.IsSuspended,
    }
);

// Fixed - remove IsSuspended from the result
```

**Step 6: Build to verify**

Run: `make build-api`
Expected: Build succeeds

**Step 7: Stage**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs apps/api/Src/Modules/Users/Services/UserService.cs
```

---

## Task 3: Implement PatchField for avatarUrl

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`

**Context:** Implement proper three-state PATCH semantics for avatarUrl using PatchField pattern (as used in UpdateTenantAsStaff for LogoUrl).

**Step 1: Update UpdateTenantUserAsStaffBody**

In `UpdateTenantUserAsStaff.cs`:

Change AvatarUrl to non-nullable JsonElement and update getter:

```csharp
// Current:
public JsonElement? AvatarUrl { get; set; }
public string? GetAvatarUrl() => AvatarUrl?.GetValueAsStringOrNull();

// Fixed:
public JsonElement AvatarUrl { get; init; }

public PatchField<string?> GetAvatarUrl() {
    return AvatarUrl.ValueKind switch {
        JsonValueKind.Undefined => PatchField<string?>.Absent(),
        JsonValueKind.Null => PatchField<string?>.Set(null),
        JsonValueKind.String => PatchField<string?>.Set(AvatarUrl.GetValueAsString()),
        _ => throw new InvalidOperationException("AvatarUrl must be a string, null, or omitted"),
    };
}
```

Make sure to add the import:
```csharp
using MainApi.Src.Lib;
```

**Step 2: Update UpdateTenantUserDocument**

In `UserService.cs`:

Change AvatarUrl to PatchField:

```csharp
// Current:
public string? AvatarUrl { get; set; }

// Fixed:
public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
```

**Step 3: Update UpdateTenantUserAsync method**

In `UserService.cs`:

Update how AvatarUrl is applied:

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

**Step 4: Update the handler**

In `UpdateTenantUserAsStaff.cs`:

Update the document creation:

```csharp
// Current:
var updateDocument = new UpdateTenantUserDocument {
    FirstName = body.GetFirstName(),
    LastName = body.GetLastName(),
    AvatarUrl = body.GetAvatarUrl(),
    Level = body.GetLevel(),
};

// Fixed - note GetAvatarUrl() now returns PatchField<string?>
var updateDocument = new UpdateTenantUserDocument {
    FirstName = body.GetFirstName(),
    LastName = body.GetLastName(),
    AvatarUrl = body.GetAvatarUrl(), // PatchField<string?>
    Level = body.GetLevel(),
};
```

**Step 5: Build to verify**

Run: `make build-api`
Expected: Build succeeds

**Step 6: Stage**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs apps/api/Src/Modules/Users/Services/UserService.cs
```

---

## Task 4: Fix ResponseKeys for Malformed Route IDs

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`

**Context:** Malformed route IDs should use ResponseKeys.MalformedId instead of ResponseKeys.BadRequest.

**Step 1: Update UpdateTenantUserAsStaff.cs**

Find and replace:

```csharp
// Current:
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.BadRequest
);

// Fixed:
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.MalformedId  // Changed from BadRequest
);
```

Do the same for userId validation.

**Step 2: Update RemoveUserFromTenantAsStaff.cs**

Find and replace the same pattern.

**Step 3: Update FindTenantUsersAsStaff.cs**

Find and replace the same pattern for tenantId validation.

**Step 4: Build to verify**

Run: `make build-api`
Expected: Build succeeds

**Step 5: Stage**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs
```

---

## Task 5: Fix Frontend Hook Typing

**Files:**
- Modify: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

**Context:** Replace Record<string, unknown> and as never with the generated UpdateTenantUserAsStaffBody type.

**Step 1: Update the hook to use generated type**

First, check what's exported from the generated client:

```bash
grep -n "export.*UpdateTenantUserAsStaffBody" /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/packages/client-ts/src/models/index.ts
```

**Step 2: Update the hook**

Replace the hook implementation:

```typescript
// Current:
export const useUpdateTenantUser = createStaffMutation({
    mutationKeyFn: (client) =>
        client.staff.tenants.byTenantId('').users.byUserId('').patch,
    mutationFn: async (
        client,
        variables: {
            tenantId: string;
            userId: string;
            firstName?: string;
            lastName?: string;
            avatarUrl?: string | null;
            level?: 'Admin' | 'User';
            isSuspended?: boolean;
        }
    ) => {
        const body: Record<string, unknown> = {};
        // ... builds body with Record
        return client.staff.tenants
            .byTenantId(variables.tenantId)
            .users.byUserId(variables.userId)
            .patch(body as never);
    },
});

// Fixed:
import { UpdateTenantUserAsStaffBody } from '@org/client-ts/src/models';

export const useUpdateTenantUser = createStaffMutation({
    mutationKeyFn: (client) =>
        client.staff.tenants.byTenantId('').users.byUserId('').patch,
    mutationFn: async (
        client,
        variables: {
            tenantId: string;
            userId: string;
            firstName?: string;
            lastName?: string;
            avatarUrl?: string | null;
            level?: 'Admin' | 'User';
        }
    ) => {
        const body: UpdateTenantUserAsStaffBody = {};
        if (variables.firstName !== undefined) {
            body.firstName = variables.firstName === null
                ? createUntypedNull()
                : createUntypedString(variables.firstName) as never;
        }
        if (variables.lastName !== undefined) {
            body.lastName = variables.lastName === null
                ? createUntypedNull()
                : createUntypedString(variables.lastName) as never;
        }
        if (variables.avatarUrl !== undefined) {
            body.avatarUrl = variables.avatarUrl === null
                ? createUntypedNull()
                : createUntypedString(variables.avatarUrl) as never;
        }
        if (variables.level !== undefined) {
            body.level = createUntypedString(variables.level) as never;
        }

        const result = await client.staff.tenants
            .byTenantId(variables.tenantId)
            .users.byUserId(variables.userId)
            .patch(body);

        if (_.isNil(result)) {
            throw new Error('useUpdateTenantUser: result is nil');
        }
        return result;
    },
});
```

Note: Removed `isSuspended` from variables since we removed it from the backend.

**Step 3: Run TypeScript check**

Run: `make tsc-front`
Expected: No errors

**Step 4: Stage**

```bash
git add apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts
```

---

## Task 6: Rebuild Contracts and Verify

**Files:**
- Auto-generated: `apps/api/openapi/MainApi.json`
- Auto-generated: `packages/client-ts/src/models/index.ts`
- Auto-generated: `packages/client-ts/src/staff/tenants/item/users/item/index.ts`

**Step 1: Rebuild API**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make build-api
```

Expected: Build succeeds, OpenAPI regenerated

**Step 2: Regenerate client**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make generate-client
```

Expected: Client regenerated

**Step 3: TypeScript check**

```bash
cd /c/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2 && make tsc-front
```

Expected: No errors

**Step 4: Stage auto-generated files**

```bash
git add apps/api/openapi/MainApi.json packages/client-ts/src/
```

---

## Task 7: Final Commit

**Step 1: Commit all changes**

```bash
git commit -m "fix: address Round 3 review findings

- Fix last-admin invariant: count only active (non-suspended) admins
- Remove isSuspended from PATCH contract (not usable in current UI)
- Implement PatchField for avatarUrl (three-state semantics)
- Use MalformedId for malformed route IDs
- Use generated types in frontend hook"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Fix last-admin invariant (count only active admins) |
| 2 | Remove isSuspended from PATCH contract |
| 3 | Implement PatchField for avatarUrl |
| 4 | Fix ResponseKeys.MalformedId usage |
| 5 | Use generated types in frontend hook |
| 6 | Rebuild and verify |
| 7 | Commit |
