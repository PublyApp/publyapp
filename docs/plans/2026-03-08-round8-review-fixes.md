# Round 8 Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Address ALL findings from Round 8 deep review - critical blocker, status null-semantics, empty-body guards, guard clauses, ToLower*() violations, and snake_case migration

**Architecture:** Fix UpdateStaffUser.Spec.cs alias, tighten status validation, add empty-body guards, convert to guard clauses, replace ToLower*() with case-insensitive comparers, migrate query params to snake_case

**Tech Stack:** .NET 10, FluentValidation, Entity Framework Core, Integration Tests

---

## Task 1: Fix CS0576 Namespace Conflict (Critical Blocker)

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs`

**Context:**
The alias `using GetStaffUserByIdResult = ...GetStaffUserByIdResult;` conflicts with the real type in the same namespace, causing CS0576 compilation error.

**Step 1: Delete the conflicting alias**

Remove lines 16-17 in UpdateStaffUser.Spec.cs:
```csharp
using GetStaffUserByIdResult =
    MainApi.Src.Modules.Users.Handlers.Staff.GetStaffUserByIdResult;
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 2: Fix Status Null-Semantics Bug

**Files:**
- Modify: `apps/api/Src/Modules/Users/Validation/UserValidationRules.cs`

**Context:**
The body validator explicitly allows `status: null` via `MustBeNullableUserStatus()`. But `User.Status` is not nullable, so sending `{ "status": null }` bypasses the empty-body guard but doesn't actually update the status. This creates a meaningless write.

**Step 1: Change MustBeNullableUserStatus to NOT allow null**

In UserValidationRules.cs, change the MustBeNullableUserStatus rule to reject null:

```csharp
public static IRuleBuilderOptions<T, JsonElement?>
    MustBeNullableUserStatus<T>(
        this IRuleBuilder<T, JsonElement?> ruleBuilder
    ) {
    return ruleBuilder
        .Must(e => {
            if (e is null) {
                return true; // field not provided - OK
            }
            var kind = e.Value.ValueKind;
            // REJECT null - User.Status is not nullable
            if (kind is JsonValueKind.Null) {
                return false;
            }
            if (kind != JsonValueKind.String) {
                return false;
            }
            var str = e.Value.GetString()
                ?? string.Empty;
            return User.ParseStatus(str) is not null;
        })
        .WithMessage(
            "Status must be a valid status"
        );
}
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 3: Add Empty-Body Guard to UpdateTenantAsStaff

**Files:**
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`

**Context:**
UpdateTenantAsStaff allows empty PATCH bodies and still calls the service, which bumps UpdatedAt. This should reject empty bodies like UpdateStaffUser and UpdateTenantUserAsStaff.

**Step 1: Add the empty-body guard after GUID validation**

After line 106 (after the GUID validation), add:

```csharp
// Guard against empty PATCH body
if (body.GetName() is null
    && !body.GetLogoUrl().IsPresent
    && body.GetMaxUsers() is null) {
    return TypedProblems.BadRequest(
        "No fields to update",
        ResponseKeys.BadRequest
    );
}
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 4: Add Empty-Body Guard to UpdateSystemNotice

**Files:**
- Modify: `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`

**Context:**
Same issue as UpdateTenantAsStaff - allows empty body and performs meaningless write.

**Step 1: Read the handler to understand its body structure**

Find the body DTO and understand what fields can be patched.

**Step 2: Add the empty-body guard**

Add a guard that checks if all patchable fields are absent/null.

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 5: Convert CreateStaffInvitation to Guard Clause Pattern

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs`

**Context:**
The handler uses `account is null || account.Scope != ...` mixed together. For staff-only endpoints, `account is null` is an impossible state that should throw, while scope/level checks are real authorization failures.

**Step 1: Split the guard into two parts**

Replace lines 75-82:

```csharp
// IMPOSSIBLE STATE: Staff endpoint without staff account
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has .WithPermission() middleware."
    );
}

// REAL AUTHORIZATION: Check permissions
if (account.Scope != AccountScope.Staff
    || account.Level != AccountLevel.Admin) {
    return TypedProblems.Forbidden(
        "User does not have the necessary permissions",
        ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
    );
}
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 6: Convert RevokeStaffInvitation to Guard Clause Pattern

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs`

**Context:**
Same issue as CreateStaffInvitation.

**Step 1: Split the guard into two parts**

Replace lines 27-35:

```csharp
// IMPOSSIBLE STATE: Staff endpoint without staff account
var account = authContext.AccountStaff;
if (account is null) {
    throw new InvalidOperationException(
        "Staff account not found in auth context. "
        + "Ensure the endpoint has .WithPermission() middleware."
    );
}

// REAL AUTHORIZATION: Check permissions
if (account.Scope != AccountScope.Staff
    || account.Level != AccountLevel.Admin) {
    return TypedProblems.Forbidden(
        "User does not have the necessary permissions",
        ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
    );
}
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 7: Fix ToLower*() Violations - UserService

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`

**Context:**
Lines 242-265 use `sortId.ToLowerInvariant() switch` for case-insensitive dispatch. Should use case-insensitive dictionary instead.

**Step 1: Replace the ToLowerInvariant() switch with case-insensitive dictionary**

Replace lines 241-266 with:

```csharp
if (sortId is not null) {
    var sortIdLower = sortId.ToLowerInvariant();
    query = sortIdLower switch {
        "created_at" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(x => x.User.CreatedAt)
            : query.OrderByDescending(x => x.User.CreatedAt),
        "updated_at" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(x => x.User.UpdatedAt)
            : query.OrderByDescending(x => x.User.UpdatedAt),
        "email" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(x => x.User.Email)
            : query.OrderByDescending(x => x.User.Email),
        "first_name" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(x => x.User.FirstName)
            : query.OrderByDescending(x => x.User.FirstName),
        "last_name" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(x => x.User.LastName)
            : query.OrderByDescending(x => x.User.LastName),
        "status" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(x => x.User.Status)
            : query.OrderByDescending(x => x.User.Status),
        "level" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(x => x.Level)
            : query.OrderByDescending(x => x.Level),
        _ => query
    };
}
```

Note: Changed sort option values from `createdat`/`updatedat`/`firstname`/`lastname` to `created_at`/`updated_at`/`first_name`/`last_name`.

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 8: Fix ToLower*() Violations - TenantAsStaffService

**Files:**
- Modify: `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

**Context:**
Lines 216-236 use `sortId.ToLower() switch` and use non-standard sort values (`createdat`, `updatedat`, `userscount`).

**Step 1: Replace ToLower() with ToLowerInvariant() and fix sort values**

Replace lines 215-236 with:

```csharp
if (sortId is not null) {
    var sortIdLower = sortId.ToLowerInvariant();
    query = sortIdLower switch {
        "created_at" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(t => t.Tenant.CreatedAt)
            : query.OrderByDescending(t => t.Tenant.CreatedAt),
        "updated_at" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(t => t.Tenant.UpdatedAt)
            : query.OrderByDescending(t => t.Tenant.UpdatedAt),
        "code" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(t => t.Tenant.Code)
            : query.OrderByDescending(t => t.Tenant.Code),
        "name" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(t => t.Tenant.Name)
            : query.OrderByDescending(t => t.Tenant.Name),
        "status" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(t => t.Tenant.Status)
            : query.OrderByDescending(t => t.Tenant.Status),
        "users_count" => effectiveSortOrder == SortOrder.Asc
            ? query.OrderBy(t => t.UsersCount)
            : query.OrderByDescending(t => t.UsersCount),
        _ => query
    };
}
```

**Step 2: Also fix line 266**

Change:
```csharp
var effectiveSortId = (sortId ?? "created_at").ToLowerInvariant();
```

**Step 3: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 9: Fix ToLower*() Violations - FindTenantsAsStaff

**Files:**
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`

**Context:**
Lines 52 and 80 use ToLowerInvariant() for case-insensitive operations.

**Step 1: Replace ToLowerInvariant() with case-insensitive approaches**

For line 52 (status parsing switch):
- Replace `part.ToLowerInvariant()` with case-insensitive matching using `string.Compare(part, "pending", StringComparison.OrdinalIgnoreCase) == 0`

For line 80 (AllowedStatuses.Contains):
- Change `AllowedStatuses` to use `HashSet<string>(StringComparer.OrdinalIgnoreCase)`
- Remove the `.ToLowerInvariant()` call

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 10: Fix ToLower*() Violations - FindTenantUsersAsStaff

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`

**Context:**
Line 51 uses ToLowerInvariant() for AllowedStatuses.Contains.

**Step 1: Replace with case-insensitive HashSet**

Change:
```csharp
private static readonly string[] AllowedStatuses = ["active", "pending", "suspended"];
```

To:
```csharp
private static readonly HashSet<string> AllowedStatuses =
    new(["active", "pending", "suspended"], StringComparer.OrdinalIgnoreCase);
```

And change line 51 from:
```csharp
|| AllowedStatuses.Contains(raw.ToLowerInvariant())
```
To:
```csharp
|| AllowedStatuses.Contains(raw)
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 11: Add Snake_Case Query Parameters - CursorPaginatedQuery

**Files:**
- Modify: `apps/api/Src/Lib/CursorPaginatedQuery.cs`

**Context:**
Query parameters need explicit snake_case names for the API contract.

**Step 1: Add [FromQuery(Name = "...")] attributes**

```csharp
public class CursorPaginatedQuery {
    [FromQuery(Name = "cursor")]
    public string? Cursor { get; set; }

    [FromQuery(Name = "limit")]
    public string? Limit { get; set; }

    [FromQuery(Name = "sort_id")]
    public string? SortId { get; set; }

    [FromQuery(Name = "sort_order")]
    public string? SortOrder { get; set; }
    // ... rest of the class
}
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 12: Add Snake_Case Query Parameters - PaginatedQuery

**Files:**
- Modify: `apps/api/Src/Lib/PaginatedQuery.cs`

**Context:**
Same as CursorPaginatedQuery for offset pagination.

**Step 1: Add [FromQuery(Name = "...")] attributes**

```csharp
public class PaginatedQuery {
    [FromQuery(Name = "page")]
    public string? Page { get; set; }

    [FromQuery(Name = "limit")]
    public string? Limit { get; set; }

    [FromQuery(Name = "sort_id")]
    public string? SortId { get; set; }

    [FromQuery(Name = "sort_order")]
    public string? SortOrder { get; set; }
    // ... rest of the class
}
```

**Step 2: Run build to verify**

Run: `dotnet build apps/api/MainApi.csproj -c Test`
Expected: BUILD SUCCEEDED

---

## Task 13: Regenerate API Client

**Step 1: Build API and generate client**

Run: `make build-api && make generate-client`
Expected: SUCCESS

**Step 2: Run frontend type check**

Run: `make tsc-front`
Expected: PASS

---

## Task 14: Run Full Test Suite

**Step 1: Run API tests**

Run: `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test`
Expected: ALL PASS

---

## Summary of Changes

| Task | Description | Files Modified |
|------|-------------|----------------|
| 1 | CS0576 fix | UpdateStaffUser.Spec.cs |
| 2 | Status null-semantics | UserValidationRules.cs |
| 3 | Empty-body guard | UpdateTenantAsStaff.cs |
| 4 | Empty-body guard | UpdateSystemNotice.cs |
| 5 | Guard clause | CreateStaffInvitation.cs |
| 6 | Guard clause | RevokeStaffInvitation.cs |
| 7 | ToLower*() + snake_case | UserService.cs |
| 8 | ToLower*() + snake_case | TenantAsStaffService.cs |
| 9 | ToLower*() | FindTenantsAsStaff.cs |
| 10 | ToLower*() | FindTenantUsersAsStaff.cs |
| 11 | Snake_case query params | CursorPaginatedQuery.cs |
| 12 | Snake_case query params | PaginatedQuery.cs |
| 13 | Regenerate client | (build + generate) |
| 14 | Run tests | (test suite) |
