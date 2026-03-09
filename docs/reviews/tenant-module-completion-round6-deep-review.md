# Deep Review: Tenant Module Completion - Round 6

## Executive Summary
Round 6 fixed the most visible regression from Round 5: tenant-user `firstName` / `lastName` now use real `PatchField<string?>` semantics, the malformed-ID key in `UpdateStaffUser` is corrected, the new tenant-user mutation specs are real, and the serializable transaction is directionally correct for the last-admin invariant.

The tenant-user slice is close, but I would still not merge as-is. The main blocker is that `UpdateTenantUserAsync()` is only partially transactional: when a request demotes an admin and also updates profile fields, the level change is committed inside the serializable transaction and the profile changes are saved later in a second save cycle. That breaks request atomicity. Repo-wide, the malformed-route-ID convention is still violated in two handlers, and `UpdateStaffUser` still mixes old nullable-`JsonElement?` patch semantics for `FirstName` / `LastName` with a newer `PatchField` model for `AvatarUrl`.

## Special Investigation Reports

### Investigation 1: ResponseKeys.MalformedId Violations
I scanned handler files under `apps/api/Src/Modules/*/Handlers/` for `Guid.TryParse` guards and separated route-ID checks from cursor/query parsing. I found **2 live route-parameter violations**.

| File | Current code | Why it violates the guide | Recommended fix |
| --- | --- | --- | --- |
| `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs:67-71` | `tenantId` route guard returns `ResponseKeys.BadRequest` | `docs/guides/api-route-parameters.md` requires malformed route IDs to return `400` with `ResponseKeys.MalformedId` | Change the translation key only |
| `apps/api/Src/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs:38-39` | `tenantId` route guard returns `ResponseKeys.BadRequest` | Same rule | Change the translation key only |

Current examples:

```csharp
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.BadRequest
);
```

Recommended:

```csharp
return TypedProblems.BadRequest(
    "Invalid tenantId",
    ResponseKeys.MalformedId
);
```

Notes:
- I did **not** count cursor parsing in `FindTenantsAsStaff`, `FindTenantUsersAsStaff`, `FindStaffInvitations`, `FindAuditLogs`, `FindSystemNotices`, or `FindStaffProfiles` as violations. Those are query/cursor errors, not malformed route IDs.
- I did **not** count `Auth/Handlers/GetVerificationLink.cs`, because that is query-string validation rather than a route-parameter slice.

### Investigation 2: Pull-Then-Save Anti-Pattern
I reviewed update/delete-style service methods that fetch entities and then call `SaveChangesAsync`. Not every tracked update should become `ExecuteUpdateAsync`; the key is whether the method needs current in-memory entity state, multi-entity coordination, or change-tracked graph behavior.

#### Should be converted

| File / Method | Current pattern | Recommendation | Why |
| --- | --- | --- | --- |
| `apps/api/Src/Modules/Projects/Services/ProjectService.cs:63-68` `DeleteProjectAsync` | Load project, set `IsActive = false`, save | Convert to `ExecuteUpdateAsync` | Simple single-row soft delete with no need to materialize the entity |
| `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:331-370` `RevokeInvitationAsync` | `FindAsync`, set `IsRevoked` / `RevokedAt`, save | Convert to `ExecuteUpdateAsync` | Straight state transition on one row; no graph work |
| `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:895-929` `MarkInvitationAsAcceptedAsync` | `FindAsync`, set `IsAccepted` / `AcceptedAt`, save | Convert to `ExecuteUpdateAsync` | Same as above |

Suggested pattern:

```csharp
var rowsAffected = await _dbContext.Invitation
    .Where(inv => inv.Id == invitationId && !inv.IsAccepted && !inv.IsRevoked)
    .ExecuteUpdateAsync(
        setters => setters
            .SetProperty(inv => inv.IsAccepted, true)
            .SetProperty(inv => inv.AcceptedAt, DateTime.UtcNow),
        cancellationToken
    );
```

#### Keep as tracked-entity updates

| File / Method | Keep as-is? | Reason |
| --- | --- | --- |
| `apps/api/Src/Modules/Users/Services/UserService.cs:790-884` `UpdateTenantUserAsync` | Yes | Multi-entity update (`User` + `UserAccount`) plus last-admin business rule |
| `apps/api/Src/Modules/Users/Services/UserService.cs:731-787` `RemoveUserFromTenantAsync` | Yes | Business-rule count check plus soft delete inside a transaction |
| `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:684-710` `UpdateTenantAsync` | Yes | Needs current tenant state and `MaxUsers` vs current count validation |
| `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs:322-362` `UpdateAsync` | Yes | Patch-style conditional field updates with clearable `ExpiresAt`, and it returns the mutated entity |
| `apps/api/Src/Modules/Users/Services/UserService.cs:615-688` `UpdateStaffUserByIdAsync` | Already converted appropriately | Uses `ExecuteUpdateAsync` for both `User` and `UserAccount` updates |

Additional note:
- `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs:365-389` `DeleteAsync` is also a pull-then-remove path, but the right optimization there would be `ExecuteDeleteAsync`, not `ExecuteUpdateAsync`.

### Investigation 3: PatchField Pattern Usage
I scanned update handlers and related documents for `JsonElement?`-based PATCH bodies. Most remaining cases are optional-but-not-clearable fields, so `PatchField<T>` is **not** automatically required. I found **one clear live gap** and **two “watch but do not convert blindly” cases**.

#### Should use PatchField

| File / Field | Current type | Why it should change | Recommended conversion |
| --- | --- | --- | --- |
| `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs:21-22` `LastName`, `FirstName` | `JsonElement?` with `GetValueAsStringOrNull()` | They map to nullable entity fields (`User.FirstName`, `User.LastName`), but the current contract still collapses explicit `null` to omission. That is the exact ambiguity `PatchField<T>` exists to solve. | Convert both body fields to non-nullable `JsonElement`, add `PatchField<string?>` getters, move `UpdateUserDocument.FirstName/LastName` to `PatchField<string?>`, and update the frontend hook if clearing is meant to be supported |

#### Not PatchField candidates by default

| File / Field | Why not |
| --- | --- |
| `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs:20,22` `Name`, `MaxUsers` | These are optional updates, but not clearable nullable domain fields |
| `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:21-24` `Severity`, `Title`, `Message`, `StartsAt` | `Title`, `Message`, and `StartsAt` are required domain fields on `SystemNotice`; if null should be rejected, not interpreted as “clear” |
| `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs:47` `Level` | Optional enum-like update, not a clearable nullable field |

Important nuance:
- `UpdateStaffUser` is currently internally inconsistent. `AvatarUrl` correctly uses `PatchField<string?>`, while `FirstName` / `LastName` still use nullable `JsonElement?` plus `MustBeNullableNonEmptyString`.
- The frontend hook for staff users still exposes `firstName?: string` / `lastName?: string` only, so the client does not currently advertise clearing. That reduces blast radius, but the backend contract is still ambiguous for raw API callers.

### Investigation 4: Commented-Out Test Placeholders
The old placeholders are now obsolete:

| File | Placeholder | Status |
| --- | --- | --- |
| `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs:250-253` | `ItShouldReturnConflictWhenDemotingLastAdmin()` | Obsolete, because the real test now exists at `:316-349` as `ItShouldReturnBadRequestWhenDemotingLastAdmin()` |
| `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs:78-81` | `ItShouldReturnConflictWhenRemovingLastAdmin()` | Obsolete, because the real test now exists at `:83-119` as `ItShouldReturnBadRequestWhenRemovingLastAdmin()` |
| `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs:23-26` | `ItShouldReturnSuccessOrConflictWhenValidBodyProvided()` | Obsolete as a commented placeholder. Even if this scenario still needs coverage, the comment block should be replaced with a real spec or deleted. Leaving it commented creates false “known gap” noise without executable coverage. |

They should be deleted. They no longer document a missing case; they contradict the file’s actual coverage and create noise for future reviewers.

Why the “requires isolated tenant state” comment is outdated:
- `apps/api/Src/Lib/Testing/Fixtures/ApiFixture.cs` creates a **fresh cloned database per test class**.
- Tests in the **same class** share that DB and can see each other’s writes.
- The new last-admin tests work because they target a seeded tenant (`TechStart`) whose starting state is already suitable for the invariant check inside that isolated class database.

Safe cleanup:
1. Delete the commented-out placeholder block in each spec file.
2. Keep the real tests.
3. For `CreateTenantAsStaff.Spec.cs`, either add the missing happy-path/conflict spec now or remove the placeholder entirely and track the missing case in a review/plan document instead of source comments.
4. Strengthen malformed-ID tests to assert `TranslationKey == ResponseKeys.MalformedId`, not just status `400`.

## Observations & Issues

### Critical Issues
None in the tenant-user slice after the Round 6 fixes.

### Major Issues
1. `UpdateTenantUserAsync()` is not fully atomic when a request changes both `Level` and profile fields. The admin-demotion path opens a serializable transaction, saves and commits the account-level change, and then the method later mutates `User.FirstName` / `LastName` / `AvatarUrl` and calls `SaveChangesAsync()` again outside that transaction. If the second save fails, the PATCH request partially applies. [UserService.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L815) [UserService.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L849) [UserService.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L876)

2. Repo-wide route-ID convention is still violated in two active handlers: `CreateInvitationForTenantAsStaff` and `FindTenantProfilesAsStaff` still return `ResponseKeys.BadRequest` for malformed `tenantId` route values instead of `ResponseKeys.MalformedId`. [CreateInvitationForTenantAsStaff.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs#L67) [FindTenantProfilesAsStaff.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs#L38)

3. `UpdateStaffUser` still has a false three-state contract for `FirstName` and `LastName`. The handler validator accepts JSON `null`, but the body getter collapses `null` into omission, and the service document still uses `string?` rather than `PatchField<string?>`. That means the repo now has two different semantics for the same kind of nullable profile field. [UpdateStaffUser.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs#L21) [UpdateStaffUser.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs#L49) [staff-user.hooks.ts](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts#L93)

### Minor Issues
1. The malformed-ID tests added in Round 6 still assert only HTTP `400`, not the translation key that was specifically fixed in earlier rounds. [UpdateTenantUserAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs#L186) [RemoveUserFromTenantAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs#L122)

2. The obsolete commented-out placeholder tests should be removed now that real last-admin tests exist, and the create-tenant spec still has a stale commented placeholder for a valid-body success/conflict case. That source comment should become a real test or be deleted. [UpdateTenantUserAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs#L250) [RemoveUserFromTenantAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs#L78) [CreateTenantAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs#L23)

3. The targeted test run still emits `MSB3277` for `Microsoft.EntityFrameworkCore.Relational` `10.0.0` vs `10.0.1`. It did not break the tenant slice, but it is worth cleaning up to keep build output actionable.

### Questions & Clarifications
1. Is `UpdateStaffUser` supposed to support clearing `FirstName` / `LastName`, or should null be rejected there? The current backend contract implies “null is allowed” while the frontend hook still implies “strings only”.

2. Is it acceptable to scope the malformed-ID repo-wide cleanup into this tenant-module PR, or should that be a follow-up hygiene PR? The fixes are tiny, but they are outside the direct tenant-user files.

## Positive Aspects
- Round 6 correctly converted tenant-user `FirstName` / `LastName` to `PatchField<string?>`. That aligns the slice with the repo’s documented PATCH-field pattern.
- `IsolationLevel.Serializable` is the right isolation direction for protecting the last-admin invariant.
- The guard-clause pattern for missing `AccountStaff` now matches repo guidance.
- `MustBePatchFieldString` is a worthwhile validator extraction and improves consistency with `MustBePatchFieldUrl`.
- The new tests for clearing `firstName` and for last-admin rejection are meaningful improvements, and they passed in the targeted run.

## Detailed File Reviews

### `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
Good:
- `FirstName`, `LastName`, and `AvatarUrl` now use the correct non-nullable `JsonElement` + `PatchField<string?>` getter pattern.
- The malformed route-ID handling now uses `ResponseKeys.MalformedId`.

Concerns:
- The handler is now better than `UpdateStaffUser` for nullable-field semantics, which creates a cross-slice inconsistency.
- `GetFirstName()`, `GetLastName()`, and `GetAvatarUrl()` are recomputed multiple times. That is not a correctness bug, but it would be cleaner to materialize them once before the “No fields to update” check and reuse them for the document and audit payload.

### `apps/api/Src/Modules/Users/Services/UserService.cs`
Good:
- The tenant-user document now uses `PatchField<string?>` for profile fields.
- The last-admin count consistently excludes suspended and deleted admins.

Major issue:
- The demotion path commits inside the serializable transaction before the rest of the user-profile mutation is saved. This should be one unit of work when a single PATCH request includes both categories of changes.

Recommended shape:

```csharp
await using var transaction =
    needsLastAdminProtection
        ? await _dbContext.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken
        )
        : null;

// do invariant check if needed
// mutate account + user fields
await _dbContext.SaveChangesAsync(cancellationToken);

if (transaction is not null) {
    await transaction.CommitAsync(cancellationToken);
}
```

### `apps/api/Src/Lib/Validation/JsonElementRules.cs`
Good:
- `MustBePatchFieldString()` is a useful addition and matches the repo’s `PatchField` guidance.

Minor improvement:
- If this helper becomes common, consider mirroring the stricter style used elsewhere in the repo by splitting “JSON kind invalid” and “string empty” into separate messages. Right now the single message is acceptable, but not especially diagnostic.

### `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
Good:
- The malformed-ID key is fixed.
- `AvatarUrl` is now consistent with the repo’s clearable-field pattern.

Remaining gap:
- `FirstName` and `LastName` are still on the older nullable-`JsonElement?` path, so the handler now mixes two PATCH-field models in the same DTO.

### `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
Good:
- `useUpdateTenantUser` now matches the tenant-user backend’s three-state semantics for `firstName`, `lastName`, and `avatarUrl`.
- The hook uses the generated `UpdateTenantUserAsStaffBody` type directly, which is a real improvement over the earlier `Record<string, unknown>` cast.

### Spec files
Good:
- The new tests cover the fixes that actually mattered this round: null-clearing and last-admin rejection.

Still missing polish:
- The malformed-ID tests should assert the translation key.
- The old placeholder comments should be removed.

## Comparison with Existing Patterns
- `UpdateTenantUserAsStaff` now matches the repo’s `PatchField` guidance more closely than `UpdateStaffUser`.
- `UpdateTenantAsStaff` remains the better reference for “single request, single document, save once” PATCH behavior.
- `UpdateStaffUserByIdAsync` is currently the better reference for how to collapse simple updates into `ExecuteUpdateAsync`.

## Compliance Check
- `AGENTS.md` conventions: mostly compliant; route-ID response-key hygiene is still incomplete repo-wide.
- C# coding standards: guard clauses are used correctly, and no `?? throw` regression is visible in the reviewed files.
- Frontend coding standards: the reviewed hook code is consistent with the existing TanStack Query / generated-client style.
- API route conventions: tenant-user route shape is correct; two repo-wide malformed-ID translation-key violations remain outside the direct slice.
- Validation conventions: the new shared validator helper is a positive step.
- PatchField pattern: tenant-user slice now complies; `UpdateStaffUser.FirstName` / `LastName` still lag.

## Edge Cases Analysis
- No fields provided: correctly returns `400`.
- `firstName: null` / `lastName: null` in tenant-user PATCH: now works correctly.
- `avatarUrl: null` in tenant-user PATCH: still works correctly.
- Malformed route IDs in the tenant-user slice: now correctly return `MalformedId`.
- Combined `level + profile-field` PATCH: currently not atomic because the demotion path can commit before later profile updates are saved.
- Transaction failure: the demotion sub-transaction rolls back correctly, but the second save remains outside that transactional unit.

## Recommendations

### Immediate Actions
1. Make `UpdateTenantUserAsync()` fully atomic when a request changes both `Level` and any profile fields. Keep the invariant check and all mutations under the same transaction / save cycle.
2. Fix the remaining malformed-route-ID violations in `CreateInvitationForTenantAsStaff` and `FindTenantProfilesAsStaff`.
3. Remove the obsolete commented-out placeholder tests, including the stale create-tenant placeholder.
4. Strengthen malformed-ID specs to assert `TranslationKey == ResponseKeys.MalformedId`.

### Future Improvements
1. Convert `UpdateStaffUser.FirstName` / `LastName` to `PatchField<string?>` if clearing should be supported.
2. Convert simple state-change methods like `RevokeInvitationAsync`, `MarkInvitationAsAcceptedAsync`, and `DeleteProjectAsync` to `ExecuteUpdateAsync`.
3. Clean up the EF Core `10.0.0` vs `10.0.1` package skew.

## Code Examples

### 1. Make tenant-user PATCH atomic

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

if (needsAdminInvariantTransaction) {
    // count active admins here
}

// apply account + user changes here
await _dbContext.SaveChangesAsync(cancellationToken);

if (transaction is not null) {
    await transaction.CommitAsync(cancellationToken);
}
```

### 2. Fix remaining malformed-ID violations

```csharp
if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
    return TypedProblems.BadRequest(
        "Invalid tenantId",
        ResponseKeys.MalformedId
    );
}
```

### 3. Remove obsolete placeholders

Before:

```csharp
// NOTE: "last admin" test skipped - requires isolated tenant state
// [Fact]
// public async Task
// ItShouldReturnConflictWhenDemotingLastAdmin() { }
```

After:

```csharp
// deleted; real last-admin coverage now exists in this file
```

For the create-tenant spec, do not keep this:

```csharp
// Skipped - requires more complex setup with seeding
// [Fact]
// public async Task
// ItShouldReturnSuccessOrConflictWhenValidBodyProvided()
```

Either replace it with an executable test or remove it and track the missing scenario outside the source file.

### 4. Bring `UpdateStaffUser` fully onto PatchField

```csharp
public JsonElement FirstName { get; init; }
public JsonElement LastName { get; init; }

public PatchField<string?> GetFirstName() => ...
public PatchField<string?> GetLastName() => ...
```

And in the document:

```csharp
public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
```

## Final Assessment
Not yet.

The direct tenant-user fixes are strong, but the current `UpdateTenantUserAsync()` implementation can still partially commit a single PATCH request when it mixes admin-level changes with profile-field changes. That is a real correctness issue. After that is fixed, the remaining work is mostly hygiene: two repo-wide malformed-ID response-key fixes, placeholder cleanup, stronger malformed-ID assertions, and the longer-tail `UpdateStaffUser` PatchField alignment.
