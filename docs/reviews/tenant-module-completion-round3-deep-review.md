# Deep Review: Tenant Module Completion - Round 3

## Executive Summary

Round 3 fixes the most visible round-2 contract drift:

- the OpenAPI document is now aligned with `UpdateTenantUserAsStaff`
- the generated client shape for `PATCH /staff/tenants/{tenantId}/users/{userId}` is now correct
- the frontend mutation hook was renamed to `useUpdateTenantUser`
- the response DTO naming is clearer with `TenantUserDetailsResult`
- the obsolete level-only service method was removed

Those are real improvements, and they remove the round-2 blocker that made the PATCH flow obviously inconsistent across backend, OpenAPI, and frontend.

The implementation is still not merge-ready. The biggest remaining problem is that the new "broader tenant-user PATCH" slice is only partially integrated into the surrounding tenant-user model:

- last-admin protection is still inconsistent across remove, demote, and suspend flows
- the broader PATCH contract claims to support `isSuspended`, but the tenant-user list/query model still filters suspended tenant accounts out of the result set
- nullable/clearable PATCH semantics are still not modeled correctly for `avatarUrl`
- there are still no integration tests for the new mutation paths or the last-admin invariants

Validation performed during this review:

- `dotnet build apps/api/MainApi.csproj -c Test` passed
- `make tsc-front` passed

I did not run `make test-api`, so all runtime confidence comments below distinguish between build health and behavioral coverage.

## Observations & Issues

### Critical Issues

#### 1. The "last admin" invariant is still broken when the remaining admin is suspended

Files:

- `apps/api/Src/Modules/Users/Services/UserService.cs`

Evidence:

- `RemoveUserFromTenantAsync()` counts all non-deleted admins, including suspended admins, before allowing removal at lines 751-763.
- `UpdateTenantUserAsync()` does the same for demotion at lines 807-820.
- The suspend path does **not** count suspended admins at lines 827-841.

Why this is critical:

The code now has three different definitions of "safe to leave behind":

- remove: any admin account that is not deleted
- demote: any admin account that is not deleted
- suspend: only an admin account that is not deleted **and not suspended**

That inconsistency creates a real integrity hole. Example:

1. Tenant has Admin A (active) and Admin B (suspended)
2. Staff removes or demotes Admin A
3. Operation succeeds because Admin B is still counted by remove/demote logic
4. Tenant is left with no active admin who can operate the tenant

This defeats the exact invariant the new code is trying to enforce.

Recommended fix:

- make all three admin-preservation checks use the same predicate
- if the intended invariant is "must always retain at least one active tenant admin", then remove/demote must also require `!ua.IsSuspended`
- add integration tests for:
  - remove active last admin when only suspended admin remains
  - demote active last admin when only suspended admin remains
  - suspend active last admin when only suspended admin remains

### Major Issues

#### 1. The broader PATCH contract is still only half-implemented because tenant-user listing does not model account suspension

Files:

- `apps/api/Src/Modules/Users/Services/UserService.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

Evidence:

- `UpdateTenantUserAsStaff` now supports `isSuspended`
- `UpdateTenantUserAsync()` can mutate `account.IsSuspended`
- `FindTenantUsersAsync()` excludes suspended tenant accounts entirely at lines 432-435 of the underlying query block and maps only `User.Status` into the list response
- `TenantUserItem` has `Status` and `Level`, but no `IsSuspended`
- the table only renders level/status, and "status" comes from `User.Status`, not tenant-account suspension

Why this matters:

The API now exposes tenant-account suspension as an editable field, but the surrounding read model still behaves as if tenant-user rows are only about global `User.Status`.

Practical impact:

- if a tenant account is suspended, that row will disappear from the staff tenant-users list
- the UI has no visible representation of tenant-account suspension
- the UI cannot naturally support unsuspending an account because the account is no longer in the list
- search/filter semantics become misleading because `status=suspended` is a user-status filter, not a tenant-account-suspension filter

This is not just "feature not exposed yet". The mutation broadens the domain model, but the read model still hides the new state.

Recommended fix:

- decide whether tenant-user suspension is a first-class state in this screen
- if yes:
  - include suspended accounts in the list query
  - add an account-suspension field to the result DTO
  - clarify whether `status` means user status, account suspension, or a combined display status
- if no:
  - remove `isSuspended` from the PATCH body for now and keep the slice focused on level/profile updates

#### 2. Nullable PATCH semantics are still not correct for `avatarUrl`

Files:

- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Services/UserService.cs`
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- comparison target: `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`

Evidence:

- `UpdateTenantUserAsStaffBody` uses `JsonElement? AvatarUrl` at line 44
- `GetAvatarUrl()` returns `string?`, collapsing omitted and explicit `null`
- the handler's "No fields to update" guard at lines 124-133 also treats explicit `null` as absent
- `UpdateTenantUserDocument.AvatarUrl` is plain `string?`
- the frontend hook advertises a three-state `avatarUrl?: string | null`, and sends `createUntypedNull()` when `avatarUrl === null`
- `UpdateTenantAsStaff` already uses the repo's proper `PatchField<string?>` pattern for `LogoUrl`

Why this matters:

The current API surface promises behavior it cannot actually deliver:

- `undefined` means "omit"
- `null` looks like "clear"
- string means "set"

But on the backend, `null` and omitted both collapse into `null`, so:

- explicit clear of `avatarUrl` cannot be distinguished from omission
- a request with only `avatarUrl: null` can hit "No fields to update"
- the hook's apparent three-state API is misleading

This is the main architectural mismatch still left in the PATCH slice.

Recommended fix:

- adopt the same `PatchField<string?>` pattern already used by `UpdateTenantAsStaff`:
  - change `AvatarUrl` to non-nullable `JsonElement`
  - implement `GetAvatarUrl()` as `PatchField<string?>`
  - store `PatchField<string?>` in the service document/args
  - apply it with `if (document.AvatarUrl.IsPresent) { ... }`

#### 3. The frontend hook still bypasses the generated request type and its three-state typing is internally inconsistent

Files:

- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

Evidence:

- the hook builds `const body: Record<string, unknown> = {};` at line 229
- it then calls `.patch(body as never)` at line 260
- `firstName` and `lastName` are typed as `string | undefined`, but the code still branches on `=== null` at lines 232 and 238

Why this matters:

Round 3 fixed the OpenAPI/client generation, but the hook still opts out of that type safety at the last possible moment.

Consequences:

- future contract drift can reappear without TypeScript catching it
- the code advertises three-state handling for `firstName` and `lastName`, but the variable types do not allow `null`
- the current hook surface looks broader and more robust than it really is

Recommended fix:

- type the request body with the generated `UpdateTenantUserAsStaffBody`
- remove `Record<string, unknown>` and `as never`
- either:
  - make `firstName`/`lastName` truly three-state (`string | null | undefined`) if clearing is supported, or
  - remove the dead `=== null` branches if clearing is not supported

#### 4. There is still no mutation test coverage for the new tenant-user slice

Files:

- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`
- absence of corresponding `*.Spec.cs` files

Why this matters:

This round specifically changed:

- mutation contract shape
- service ownership
- last-admin invariants
- audit action usage

Yet there are still no integration specs covering the risky paths:

- update tenant user success
- update with no fields
- malformed route IDs
- cannot demote last active admin
- cannot suspend last active admin
- remove user success
- cannot remove last active admin

The fact that the suspended-admin invariant bug survived into round 3 is direct evidence that this test gap matters.

### Minor Issues

#### 1. Route-parameter failures still use `ResponseKeys.BadRequest` instead of `ResponseKeys.MalformedId`

Files:

- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`

Why this matters:

The route-parameter guide says malformed route IDs should use:

- HTTP 400
- `ResponseKeys.MalformedId`

The handlers correctly use `Guid.TryParse`, but they still emit `ResponseKeys.BadRequest`. This is not a runtime breaker, but it is inconsistent with the repo's documented error-contract convention and weakens translation-key semantics.

#### 2. `FindTenantUsersAsStaffQueryValidator` is better than before, but still does not fully follow query-validator conventions

File:

- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`

Why this matters:

- `Search` is explicitly annotated with `[FromQuery(Name = "q")]`, which is good
- `Status` is also annotated, which is good
- but the validator still uses inline `MaximumLength` and inline lowercase token checking
- the validator-conventions guide prefers shared predicates or a domain-local reusable rule when this pattern repeats

This is not a merge blocker, but it is still a weaker pattern than the repo is aiming for.

#### 3. Audit vocabulary is now broad, but the UI copy is still level-specific

Files:

- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
- `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

Why this matters:

The backend now correctly frames the endpoint as `TenantUserUpdated`, but the UI success/error messages still say "user level updated". That is harmless for the current screen because only level changes are surfaced, but it will drift immediately if the broader PATCH surface is used for profile or suspension changes.

### Questions & Clarifications

#### 1. Is tenant-account suspension supposed to be a first-class state in the staff tenant-users screen?

Current assumption:

- yes, because the backend PATCH contract now explicitly supports `isSuspended`

If that assumption is wrong, the safer design is to remove `isSuspended` from this slice until the read model and UI are ready for it.

#### 2. Can tenant staff intentionally clear `avatarUrl`, `firstName`, or `lastName`?

Current assumption:

- `avatarUrl` should be clearable
- `firstName` and `lastName` are less clear, but the hook is currently written as if clearability might be intended

That needs an explicit product/API decision, because the hook and handler are not aligned on it.

## Positive Aspects

- Round-2's main contract-sync blocker is resolved:
  - OpenAPI now documents `UpdateTenantUserAsStaff`
  - the response DTO is now `TenantUserDetailsResult`
  - the frontend hook name matches the broader slice
- Removing the obsolete level-only service method was the right cleanup step.
- The route mapping in `UserEndpointsForTenantAsStaff.cs` is clean and permission wiring is consistent.
- `UpdateTenantUserAsStaff` still respects the repo's core slice discipline:
  - route IDs validated in handler
  - no `DbContext` in handler
  - service owns mutation logic
  - audit logging happens after successful mutation
- `SectionPageWithDrawer` remains correctly fixed from the previous round.
- API build and frontend type-check both pass.

## Detailed File Reviews

### `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`

What is good:

- Handler structure is consistent with other slices.
- Route IDs are validated in-handler, not via route constraints.
- The success response returns an updated entity DTO, which matches repo guidance for PATCH endpoints.
- Audit logging is present and uses the broader `TenantUserUpdated` action.

Issues:

- `AvatarUrl` still uses `JsonElement?` instead of non-nullable `JsonElement` + `PatchField<string?>`.
- "No fields to update" uses getter results, so explicit `null` is indistinguishable from omission.
- Malformed route IDs use `ResponseKeys.BadRequest` instead of `ResponseKeys.MalformedId`.

Assessment against `UpdateStaffUser`:

- It is structurally similar to `UpdateStaffUser`, which is good.
- It is **not** as strong as `UpdateTenantAsStaff`, which already applies the repo's three-state PATCH pattern correctly for `LogoUrl`.

### `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`

What is good:

- The split handler file is cleaner than the previous combined file.
- The HTTP response shape is appropriate for a delete/action endpoint.
- Audit logging is straightforward and useful.

Issue:

- The handler itself is fine, but it depends on a service invariant that is still too weak for suspended-admin scenarios.

### `apps/api/Src/Modules/Users/Services/UserService.cs`

What is good:

- `UpdateTenantUserAsync()` is now the canonical tenant-user mutation path.
- The service correctly owns multi-entity mutation logic.
- It can now return richer outcomes than the old level-only path.

Issues:

- remove and demote still count suspended admins differently from suspend logic
- `AvatarUrl` cannot be cleared because the document model cannot distinguish omitted from explicit null
- invalid `document.Level` still degrades to `NotFound`, which is semantically weak even if validation normally blocks it

This file contains the main remaining merge blocker.

### `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`

What is good:

- Endpoint naming, summary, permission binding, and validator registration are all in good shape.
- The route shape `PATCH /{userId}` is appropriate.

Issue:

- No direct issue in the endpoint map itself. The main problems are deeper in the service/read-model consistency.

### `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`

What is good:

- Query DTO binding is much better than round 1.
- `[FromQuery(Name = "q")]` is correct.
- Cursor/sort handling remains structurally aligned with the rest of the repo.

Issues:

- The result DTO still only models user-global status plus level; it does not model tenant-account suspension.
- Malformed `tenantId` still uses `ResponseKeys.BadRequest` instead of `MalformedId`.
- Validation style is acceptable but not ideal compared with the repo's stronger validator conventions.

### `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

What is good:

- `TenantUserUpdated` is the right audit action for the broader PATCH slice.

Minor concern:

- `TenantUserLevelUpdated` still exists alongside `TenantUserUpdated`. That may be fine for backward compatibility, but the long-term ownership of these two audit verbs should be clarified.

### `apps/api/openapi/MainApi.json`

What is good:

- The round-2 contract drift is fixed.
- The PATCH operation now references `UpdateTenantUserAsStaffBody`.
- The success response now references `TenantUserDetailsResult`.

No blocking issue found in the generated spec itself for this round.

### `apps/api/Generated/ResponseKeys.g.cs`

What is good:

- The file reflects the newly introduced translation keys for tenant-user invariants.

No direct issue found here. The main remaining error-contract issue is usage of the wrong key in handlers, not generation.

### `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

What is good:

- The hook name now matches the broader backend slice.
- `level` is now the correct outgoing field name.
- `avatarUrl` and `isSuspended` support were added in the hook surface.

Issues:

- The hook still bypasses the generated request type with `Record<string, unknown>` and `as never`.
- `firstName` and `lastName` check for `null` even though their declared types do not allow it.
- The hook advertises `avatarUrl: null` as a supported clear operation, but the backend cannot honor that semantics yet.

### `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

What is good:

- It now uses `useUpdateTenantUser`.
- Query invalidation after mutation remains correct.
- The default sort id fix from round 2 is still correct.

Issues:

- The screen still behaves like a level-only management view even though the backend contract is broader.
- Success/error toasts are still level-specific, which will become misleading if this hook is reused for broader field edits.
- The table read model has no representation of tenant-account suspension.

## Comparison with Existing Patterns

### Compared with `UpdateStaffUser`

`UpdateTenantUserAsStaff` now matches `UpdateStaffUser` in the broad vertical-slice shape:

- body DTO + validator in handler file
- route parameter parsing in handler
- service-owned persistence logic
- updated entity returned on success

That is good.

Where it still falls short is that `UpdateStaffUser` is only an older baseline. The stronger current repo pattern for clearable PATCH fields is not `UpdateStaffUser`; it is `UpdateTenantAsStaff`.

### Compared with `UpdateTenantAsStaff`

`UpdateTenantAsStaff` is the more relevant comparison for Round 3 because it already demonstrates the repo's intended three-state PATCH pattern:

- clearable nullable field uses non-nullable `JsonElement`
- getter returns `PatchField<T?>`
- service layer applies field only when `IsPresent`

`UpdateTenantUserAsStaff` does not yet follow that pattern for `avatarUrl`, so it is still behind the repo's current standard.

### Compared with Other PATCH Handlers

The endpoint/HTTP shape is sound:

- `PATCH /{userId}` is appropriate
- success returns updated resource data
- body/query validation is registered via endpoint extensions

The remaining weaknesses are not REST issues. They are domain-model and consistency issues:

- ambiguous clearability
- incomplete read/write symmetry for suspension
- missing mutation tests

## Compliance Check

### AGENTS.md conventions

Compliant:

- domain-first module layout
- handler vs service separation
- update endpoint returns updated DTO
- route IDs are validated in handler, not constrained in route

Not fully compliant:

- malformed route IDs should use `ResponseKeys.MalformedId`, not `BadRequest`
- clearable nullable PATCH fields should use the `PatchField<T>` pattern

### C# coding standards

Compliant:

- no `DbContext` in handler
- flat guard-clause style
- no route constraints

Not fully compliant:

- `UpdateTenantUserAsStaff` does not follow the repo's documented PATCH-field pattern for clearable nullable fields

### Frontend coding standards

Compliant:

- MUI usage remains appropriate
- mutation hook still follows the `createStaffMutation` pattern

Not fully compliant:

- the hook bypasses generated typing with `Record<string, unknown>` and `as never`
- the broader backend state is not reflected in the current read-model/UI semantics

### API route conventions

Compliant:

- `PATCH /staff/tenants/{tenantId}/users/{userId}` is appropriate
- route parameters are unconstrained and parsed in handler

Not fully compliant:

- malformed route-parameter failures should use the documented `MalformedId` translation key

### Validation conventions

Compliant:

- query/body validators are co-located
- shared `JsonElementRules` are used for some fields

Not fully compliant:

- the new handler still uses inline validation for `Level`
- query validator style could be more reusable/shared if this pattern appears again

## Edge Cases Analysis

### No fields provided to PATCH

Current behavior:

- returns 400 `"No fields to update"`

Assessment:

- acceptable for a broad PATCH slice
- but explicit `avatarUrl: null` is currently misclassified as "no fields to update"

### Explicit `avatarUrl: null`

Current behavior:

- frontend can send it
- backend cannot distinguish it from omitted
- likely results in no-op behavior or "No fields to update" when sent alone

Assessment:

- this is not correct three-state PATCH semantics

### Demote/remove when only suspended admin remains

Current behavior:

- remove and demote can succeed
- suspend guard is stricter than remove/demote guard

Assessment:

- this is the highest-risk behavioral edge case left

### Suspended tenant accounts in the list

Current behavior:

- tenant-account suspension is editable in PATCH
- suspended tenant accounts are filtered out from listing

Assessment:

- creates read/write asymmetry and undermines operability

### Concurrent admin mutations

Current behavior:

- no explicit transaction/locking around the last-admin checks in remove/update tenant-user flows

Assessment:

- there is still some race-risk if two staff operators mutate admin accounts concurrently
- this is a follow-up concern, but the logic should first be made semantically correct in the single-request case

## Recommendations

### Immediate Actions

1. Fix the last-admin invariant so remove, demote, and suspend all use the same "remaining active admin" rule.
2. Decide whether `isSuspended` belongs in this slice right now.
3. Implement real three-state PATCH semantics for `avatarUrl`, or remove the frontend/backend claim that clearing is supported.
4. Replace `Record<string, unknown>` and `as never` in `useUpdateTenantUser` with the generated request type.
5. Add integration tests for tenant-user update/remove mutations and the admin-preservation invariants.
6. Switch malformed route-ID responses to `ResponseKeys.MalformedId`.

### Future Improvements

1. If the product will expose broader tenant-user editing soon, introduce a proper tenant-user edit form instead of leaving the route broader than the UI.
2. Clarify the long-term distinction between global user `Status` and tenant-account suspension state in staff-facing tables and filters.
3. Consider consolidating common enum-validation helpers for PATCH handlers if more broad update slices are added.

## Code Examples

### Example 1: Fix the clearable `avatarUrl` pattern

Current:

```csharp
public JsonElement? AvatarUrl { get; set; }
public string? GetAvatarUrl() => AvatarUrl?.GetValueAsStringOrNull();
```

Better:

```csharp
public JsonElement AvatarUrl { get; init; }

public PatchField<string?> GetAvatarUrl() =>
    AvatarUrl.ValueKind switch {
        JsonValueKind.Undefined => PatchField<string?>.Absent(),
        JsonValueKind.Null => PatchField<string?>.Set(null),
        JsonValueKind.String => PatchField<string?>.Set(
            AvatarUrl.GetValueAsString()
        ),
        _ => throw new InvalidOperationException(
            "AvatarUrl must be a string, null, or omitted"
        ),
    };
```

Then in the service:

```csharp
if (document.AvatarUrl.IsPresent) {
    user.AvatarUrl = document.AvatarUrl.Value;
}
```

### Example 2: Make admin-preservation logic consistent

Current demote/remove checks count suspended admins differently from the suspend check.

Better direction:

```csharp
var remainingActiveAdminCount = await (
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.Level == AccountLevel.Admin
        && ua.UserId != userId
        && !ua.IsSuspended
        && !ua.IsDeleted
    select ua
).CountAsync(cancellationToken);

if (remainingActiveAdminCount == 0) {
    return new UpdateTenantUserResult.CannotDemoteLastAdmin();
}
```

Use the same predicate in remove and suspend flows.

### Example 3: Stop bypassing the generated request type in the hook

Current:

```ts
const body: Record<string, unknown> = {};
// ...
return client.staff.tenants
  .byTenantId(variables.tenantId)
  .users.byUserId(variables.userId)
  .patch(body as never);
```

Better:

```ts
const body: UpdateTenantUserAsStaffBody = {};
// populate typed fields
return client.staff.tenants
  .byTenantId(variables.tenantId)
  .users.byUserId(variables.userId)
  .patch(body);
```

## Final Assessment

Round 3 is materially better than Round 2. The end-to-end PATCH contract sync issue is fixed, and the refactor is directionally much healthier.

The implementation is still **not** ready to merge as-is.

The blocker is no longer contract generation. The blocker is domain correctness:

- last-admin protection still has a real hole
- the broader PATCH model still has no coherent read-model/UI story for `isSuspended`
- clearable nullable PATCH semantics remain incomplete
- the mutation paths still are not covered by integration tests

Current answer to "Can this be merged as-is?":

- No, not yet.
