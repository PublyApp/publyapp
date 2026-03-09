# Deep Review: Tenant Module Completion - Round 5

## Executive Summary

Round 5 is a meaningful improvement over Round 4.

The revision set fixed several real issues:

- the staff mutation handlers now use the expected auth-context guard clause
- `UpdateStaffUser` now matches the `PatchField<string?>` avatar URL pattern
- the validator duplication around clearable URLs was reduced with `MustBePatchFieldUrl`
- targeted integration specs now exist for the tenant-user PATCH and DELETE endpoints
- frontend typings are closer to the intended three-state PATCH story

That said, I still do not think this is merge-ready.

The biggest remaining problem is that the new `firstName` / `lastName` contract is misleading end to end: the frontend now advertises them as clearable with `null`, but the backend still treats `null` exactly like omission. A client can now send `{ firstName: null }`, but the handler/service path cannot apply that change and may even return `"No fields to update"`. That is a real API-contract bug, not just a documentation gap.

The second remaining issue is that the new transaction wrapping is directionally right but still not strong enough to guarantee the last-admin invariant under concurrent requests. `BeginTransactionAsync(cancellationToken)` uses the provider default isolation level, which is not the same as serializing competing admin mutations. The current code also loads the target row before the transaction starts.

The third issue is that the new specs improve coverage, but they still stop short of the riskiest behavioral paths: last-admin invariant tests are still commented out, there is no verification of the `MalformedId` translation key, and there is no test proving that the new `firstName` / `lastName` `null` story actually works.

Validation performed during this review:

- `dotnet build apps/api/MainApi.csproj -c Test` passed
- `make tsc-front` passed
- `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~RemoveUserFromTenantAsStaffSpec"` passed (`16` tests)

Note from test execution:

- the targeted API test run emitted an `MSB3277` warning about `Microsoft.EntityFrameworkCore.Relational` `10.0.0` vs `10.0.1` resolution in `MainApi.Tests.csproj`

## Observations & Issues

### Critical Issues

#### 1. `firstName` / `lastName` are still not actually clearable, despite the new frontend contract

Files:

- [UpdateTenantUserAsStaff.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs#L40)
- [UserService.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L855)
- [staff-tenant.hooks.ts](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts#L219)

Evidence:

- The frontend hook now exposes:
  - `firstName?: string | null`
  - `lastName?: string | null`
- The hook sends explicit JSON `null` for those fields.
- The backend still models them as `JsonElement?` plus `GetValueAsStringOrNull()`.
- `GetValueAsStringOrNull()` collapses both `Undefined` and `Null` to `null`.
- The handler then uses:
  - `body.GetFirstName() is null`
  - `body.GetLastName() is null`
  to decide whether any fields were provided.
- The service only updates when `document.FirstName is not null` / `document.LastName is not null`.

Why this matters:

This is now a false contract.

The frontend and generated request shape imply three states for `firstName` and `lastName`:

- omitted -> no change
- string -> set value
- `null` -> clear value

But the backend only supports two effective states:

- omitted or `null` -> both collapse to no change
- string -> set value

That means a request like:

```json
{ "firstName": null }
```

does not clear the field. If that is the only field sent, the handler can reject it as `"No fields to update"`.

This is a user-facing correctness bug and an API contract regression.

Recommended fix:

- If first and last name are intentionally clearable, convert them to the same `PatchField<string?>` pattern as `avatarUrl`
- If they are not intentionally clearable, revert the frontend types to `string | undefined` and stop sending `null`

Current recommendation:

- pick one contract and make all three layers agree:
  - body DTO
  - service document
  - frontend hook

### Major Issues

#### 1. The last-admin invariant is still not concurrency-safe enough

Files:

- [UserService.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L730)
- [UserService.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Services/UserService.cs#L786)

Evidence:

- `RemoveUserFromTenantAsync()` fetches the target account before the transaction begins.
- `UpdateTenantUserAsync()` fetches the target account and user before the transaction begins.
- Both methods use:

```csharp
await _dbContext.Database.BeginTransactionAsync(cancellationToken);
```

with no explicit isolation level.

Why this matters:

Round 5 added transactions, which is a good direction, but this does not yet prove the race is prevented.

Two concerns remain:

1. Default isolation is provider-default, typically `ReadCommitted`, which does not serialize the invariant check against another concurrent remove/demote request.
2. The target entity is loaded before the transaction begins, so the transaction does not fully own the read set that the later mutation depends on.

In practical terms, the code is now better structured for a fix, but it still does not convincingly guarantee:

- no two concurrent removals can both pass
- no two concurrent demotions can both pass
- a remove and demote racing each other cannot leave zero active admins

Recommended fix:

- start the transaction before loading the relevant tenant-account rows
- use an isolation/locking strategy strong enough for invariant protection
- in PostgreSQL/EF terms, the safest application-layer direction is `IsolationLevel.Serializable` or an explicit locking strategy on the tenant admin set

The repo already uses `IsolationLevel.Serializable` in multiple seeding flows, so there is precedent for explicit isolation when correctness matters.

#### 2. The new tests still do not cover the invariant that motivated the transaction change

Files:

- [UpdateTenantUserAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs#L249)
- [RemoveUserFromTenantAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs#L77)
- [ApiFixture.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Lib/Testing/Fixtures/ApiFixture.cs#L11)

Evidence:

- Both new spec files include commented placeholders for the last-admin tests rather than real tests.
- The comment says isolated tenant state is required.
- `ApiFixture` already gives each test class its own cloned database, so isolation at class scope already exists.

Why this matters:

Round 5 explicitly claimed to fix:

- transaction handling for last-admin safety

but the tests still avoid the exact behavior that justified that change.

Without these cases, the review cannot confirm:

- `CannotDemoteLastAdmin`
- `CannotRemoveLastAdmin`
- whether the transaction logic really protects the invariant

The spec suite is now better than Round 4, but it is still incomplete where the business rule is most important.

Recommended fix:

- add real invariant tests instead of commented placeholders
- create per-test tenant/user setup inside each class-specific database
- do not rely on global seed state for the last-admin cases

#### 3. `UpdateStaffUser` still violates the route-parameter guide for malformed IDs

Files:

- [UpdateStaffUser.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs#L81)
- [api-route-parameters.md](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/docs/guides/api-route-parameters.md#L31)

Evidence:

- `UpdateStaffUser` now uses the improved `PatchField` avatar URL pattern.
- But its route guard still returns `ResponseKeys.BadRequest` instead of `ResponseKeys.MalformedId`.

Why this matters:

This file was directly touched in Round 5 specifically to align with repo patterns.
Leaving the malformed-ID response key unchanged keeps the slice partially out of compliance and creates another inconsistent error contract.

This is not a functional blocker by itself, but it is exactly the sort of drift the repo guides exist to prevent.

### Minor Issues

#### 1. `MustBePatchFieldUrl` is a good addition, but its message is too generic for invalid URLs

File:

- [JsonElementRules.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Lib/Validation/JsonElementRules.cs#L193)

Why this matters:

The extension currently returns one message:

- `"AvatarUrl must be a string, null, or omitted"`

That message is accurate for wrong JSON kinds, but less helpful when the value is a string that is simply not a valid HTTP(S) URL.

This is minor. The validator behavior is sound, and the extraction is worthwhile.

Recommended improvement:

- either keep this as-is for now for simplicity
- or split it into:
  - kind validation message
  - URL-format validation message

#### 2. The new specs assert status codes, but not the response keys that were part of the Round 4 fix

Files:

- [UpdateTenantUserAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs#L185)
- [RemoveUserFromTenantAsStaff.Spec.cs](C:/Users/radan/Documents/_RADAN/Dev/PublyApp/publyapp-2/apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs#L82)

Why this matters:

Round 4 specifically corrected malformed route IDs to use `ResponseKeys.MalformedId`.
The new tests check `400`, but they do not verify the translation key that motivated the earlier review finding.

This is minor because the handlers currently look correct, but the tests should pin the contract more precisely.

#### 3. The API test project has an EF Core dependency-resolution warning

Evidence:

- targeted test run emitted `MSB3277`
- conflict between `Microsoft.EntityFrameworkCore.Relational` `10.0.0` and `10.0.1`

Why this matters:

This is not caused by the tenant-user work itself, but it is worth recording. Dependency skew in test infrastructure tends to become more expensive if it is ignored.

## Questions & Clarifications

### 1. Are `firstName` and `lastName` supposed to be clearable?

Current assumption:

- Round 5 intended them to be clearable, because the frontend hook was widened to `string | null | undefined`

If that assumption is wrong, the frontend type change should be reverted immediately.

### 2. Is application-layer serializable isolation acceptable for the last-admin invariant, or does the team want a database-enforced guarantee?

Current assumption:

- application-layer protection is acceptable for now, but it must be strong enough to make concurrent admin mutations safe

## Positive Aspects

- The auth-context guard clause is now correct and aligned with the repo’s C# style guidance.
- `UpdateStaffUser` finally matches the repo’s documented `PatchField<string?>` pattern for clearable nullable strings.
- `MustBePatchFieldUrl` is a worthwhile extraction and should help prevent validator drift in future PATCH slices.
- The new tenant-user spec files are real progress; the review no longer has to say “there are no tests at all.”
- The frontend hook now uses generated request types instead of the earlier `Record<string, unknown>` + escape-hatch approach.
- The round-5 changes build cleanly, type-check cleanly, and the targeted mutation specs pass.

## Detailed File Reviews

### `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`

What is good:

- auth-context guard clause is now correct
- `avatarUrl` still follows the right `PatchField` pattern
- malformed route IDs correctly use `ResponseKeys.MalformedId`
- audit logging payload is structured and consistent

Remaining issue:

- `FirstName` and `LastName` still use `JsonElement?` + `GetValueAsStringOrNull()`, so they cannot support the newly advertised clearable semantics
- the `"No fields to update"` guard now misclassifies explicit `null` for those two fields as “no change”

### `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`

What is good:

- guard clause is fixed
- route-ID handling remains correct
- handler stays thin and delegates mutation semantics to the service

Remaining issue:

- correctness still depends on the service’s transaction/isolation strategy, which is not yet strong enough

### `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`

What is good:

- `avatarUrl` is now properly upgraded to `PatchField<string?>`
- validator uses the shared URL rule

Remaining issue:

- malformed `userId` still returns `ResponseKeys.BadRequest`, not `ResponseKeys.MalformedId`

### `apps/api/Src/Modules/Users/Services/UserService.cs`

What is good:

- tenant-user and staff-user documents now agree on `avatarUrl` semantics
- transaction boundaries were at least introduced around the last-admin checks

Remaining issues:

- transaction starts too late and with an unspecified isolation level
- `firstName` and `lastName` remain two-state semantics in both the document and service logic

### `apps/api/Src/Lib/Validation/JsonElementRules.cs`

What is good:

- `MustBePatchFieldUrl` is a sensible shared rule
- it encodes the repo’s three-state PATCH expectations in one place

Remaining issue:

- message quality could be improved for invalid-string URLs

### `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`

What is good:

- covers success path for level update
- covers explicit `avatarUrl: null`
- covers no-fields, malformed IDs, authz failures, and not-found

Remaining issues:

- does not test `CannotDemoteLastAdmin`
- does not test `firstName: null` / `lastName: null`
- does not assert `translationKey`

### `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.Spec.cs`

What is good:

- covers success path, malformed IDs, not-found, and authz failures

Remaining issues:

- does not test `CannotRemoveLastAdmin`
- does not assert `translationKey`

### `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

What is good:

- hook shape is cleaner than in earlier rounds
- `avatarUrl` three-state handling is correct

Remaining issue:

- `firstName` and `lastName` are now declared three-state fields, but the backend does not honor that contract

## Comparison with Existing Patterns

### Compared with `UpdateStaffUser`

Round 5 correctly brought `UpdateStaffUser` closer to the `PatchField` pattern used elsewhere. That was the right direction and should be preserved.

The inconsistency now is different:

- `UpdateStaffUser` and `UpdateTenantUserAsStaff` both support `avatarUrl` correctly
- `UpdateTenantUserAsStaff` now exposes `firstName` and `lastName` as clearable from the frontend, but neither slice implements them as clearable fields on the backend

### Compared with `UpdateTenantAsStaff`

`UpdateTenantAsStaff` is still the stronger PATCH reference:

- clearable field uses non-nullable `JsonElement`
- getter returns `PatchField<T?>`
- service applies only when `IsPresent`
- auth-context guard is mandatory
- malformed ID uses `ResponseKeys.MalformedId`

If tenant-user first/last name really need clearability, they should follow the same pattern.

### Compared with `RemoveUserFromTenantAsStaff`

The two tenant-user mutation handlers now align well in handler shape and auth/audit guarding. The remaining mismatch is mostly in the service layer and tests, not the endpoint layer.

## Compliance Check

- `AGENTS.md` conventions:
  - Mostly compliant
  - Remaining gaps: `UpdateStaffUser` malformed-ID response key; false clearability contract for first/last name

- C# coding standards:
  - Guard-clause rule is followed
  - `PatchField` rule is followed for `avatarUrl`
  - Remaining gap: if first/last name are meant to be clearable, they still do not follow the documented `PatchField` pattern

- Frontend coding standards:
  - Hook pattern is consistent
  - Generated request type use is correct
  - Remaining gap: hook types claim backend semantics that are not actually supported

- API route conventions:
  - Tenant-user handlers are compliant
  - `UpdateStaffUser` still deviates on malformed ID response key

- Validation conventions:
  - Shared validator extraction is a good improvement
  - validator behavior is sound

- PatchField pattern:
  - correctly applied to `avatarUrl`
  - not yet applied to `firstName` / `lastName` despite the new frontend contract

- No `?? throw` rule:
  - compliant in the reviewed changes

## Edge Cases Analysis

### `firstName: null` or `lastName: null`

Current behavior:

- frontend can send it
- backend collapses it to `null`
- handler treats it like “field absent”
- service does not clear the column

Assessment:

- incorrect if clearability is intended

### `avatarUrl: null`

Current behavior:

- correctly clears the value

Assessment:

- correct

### Malformed route IDs

Current behavior:

- tenant-user PATCH and DELETE return `400`
- staff-user PATCH still uses wrong translation key

Assessment:

- mostly correct, one remaining inconsistency

### Last-admin invariant under concurrent requests

Current behavior:

- wrapped in a transaction
- isolation strength not explicit
- target row loaded before transaction

Assessment:

- improved, but not yet convincingly safe

### Transaction failure scenarios

Current behavior:

- remove and demote paths roll back in `catch`

Assessment:

- structurally correct
- still needs stronger isolation for the business invariant itself

## Recommendations

### Immediate Actions

1. Fix the `firstName` / `lastName` contract now.

Two valid choices:

- `Choice A`: make them truly clearable with `PatchField<string?>`
- `Choice B`: revert the frontend hook back to `string | undefined`

Do not keep the current mixed contract.

2. Strengthen the last-admin transaction logic.

Recommended direction:

- begin the transaction before loading the target account
- use `IsolationLevel.Serializable` or an equivalent locking strategy
- make the invariant check and the mutation share the same transactional read/write boundary

3. Finish the tests that justify the transaction change.

Add:

- `CannotDemoteLastAdmin`
- `CannotRemoveLastAdmin`
- `firstName: null`
- `lastName: null`
- `translationKey == MalformedId` for malformed route IDs

4. Fix `UpdateStaffUser` malformed-ID response key.

Change:

```csharp
ResponseKeys.BadRequest
```

to:

```csharp
ResponseKeys.MalformedId
```

### Future Improvements

1. Improve `MustBePatchFieldUrl` to emit more specific messages for wrong kind vs invalid URL string.
2. Resolve the EF Core package skew warning in the API test project.
3. Consider extracting a reusable `MustBeNullableEnumString(...)` helper for string-backed patch enums like `Level`.

## Code Examples

### Example 1: Make `firstName` truly clearable

Handler DTO:

```csharp
public JsonElement FirstName { get; init; }

public PatchField<string?> GetFirstName() =>
    FirstName.ValueKind switch {
        JsonValueKind.Undefined =>
            PatchField<string?>.Absent(),
        JsonValueKind.Null =>
            PatchField<string?>.Set(null),
        JsonValueKind.String =>
            PatchField<string?>.Set(
                FirstName.GetValueAsString()
            ),
        _ => throw new InvalidOperationException(
            "FirstName must be a string, null, or omitted"
        ),
    };
```

Service document:

```csharp
public PatchField<string?> FirstName { get; set; }
    = PatchField<string?>.Absent();
```

Service application:

```csharp
if (document.FirstName.IsPresent) {
    user.FirstName = document.FirstName.Value;
}
```

### Example 2: Make the last-admin transaction actually protective

Directionally stronger than the current code:

```csharp
await using var transaction =
    await _dbContext.Database.BeginTransactionAsync(
        IsolationLevel.Serializable,
        cancellationToken
    );

var account = await (
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.UserId == userId
        && ua.Scope == AccountScope.Tenant
        && !ua.IsDeleted
    select ua
).FirstOrDefaultAsync(cancellationToken);

if (account is null) {
    await transaction.RollbackAsync(cancellationToken);
    return new RemoveUserFromTenantResult.NotFound();
}

var remainingActiveAdmins = await (
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.Level == AccountLevel.Admin
        && ua.UserId != userId
        && !ua.IsSuspended
        && !ua.IsDeleted
    select ua
).CountAsync(cancellationToken);
```

### Example 3: Tighten the malformed-ID test contract

```csharp
var problem = await response.Content
    .ReadFromJsonAsync<AppProblemDetails>();

problem.Should().NotBeNull();
problem!.TranslationKey.Should().Be(
    ResponseKeys.MalformedId.Key
);
```

### Example 4: Fix `UpdateStaffUser` malformed-ID response key

Current:

```csharp
return TypedProblems.BadRequest(
    "Invalid user ID",
    ResponseKeys.BadRequest
);
```

Better:

```csharp
return TypedProblems.BadRequest(
    "Invalid user ID",
    ResponseKeys.MalformedId
);
```

## Final Assessment

Round 5 is better than Round 4. The auth guard, validator extraction, `UpdateStaffUser` `PatchField` alignment, and new spec files are all good changes.

I still would not merge this as-is.

Current answer to "Can this be merged as-is?":

- No, not yet.

The blockers are narrower now:

- `firstName` / `lastName` clearability is still a false contract
- last-admin transaction handling is still not strong enough to prove concurrency safety
- the new specs still do not cover the exact invariant cases that justified the transaction change
