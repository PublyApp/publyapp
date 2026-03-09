# Deep Review: Round 9 - Code Quality & Consistency Improvements

## Executive Summary

The session improved several real issues: the `UpdateStaffUser.Spec.cs`
compile blocker is gone, the new snake_case pagination binding is working in app
code, the renamed offset pagination base types did not break builds or frontend
type-checking, and the empty-body guards/guard-clause direction are broadly
sound.

The branch is still not fully merge-ready. The main problem is that the
repo-wide cleanup was only partially completed: the cursor-based user/tenant
services still normalize `sortId` with `ToLowerInvariant()`, and two touched
handlers still bind route IDs as `Guid` instead of `string` + `Guid.TryParse`,
which violates the route-parameter contract and can still produce framework
binding errors instead of the repo's typed problem flow. There are also a few
adjacent parser/validator paths that should be moved onto entity or dedicated
parser methods if the team wants this convention to stick.

Verification performed:

- `make build-api` passed
- `make tsc-front` passed
- `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~FindTenantsAsStaffSpec|FullyQualifiedName~FindTenantUsersAsStaff|FullyQualifiedName~CreateStaffInvitation|FullyQualifiedName~RevokeStaffInvitation|FullyQualifiedName~UpdateTenantAsStaff|FullyQualifiedName~UpdateSystemNotice"` passed: 42/42
- The targeted test run still emitted the known `MSB3277` warning for
  `Microsoft.EntityFrameworkCore.Relational` `10.0.0` vs `10.0.1`

## Special Investigation Reports

### Investigation 1: Handler Method Patterns

**Short answer:** do not adopt a blanket "always cache every getter" rule, but
do cache body getter results when they are:

- used more than once
- doing normalization/parsing
- returning `PatchField<T>` or other semantic wrappers
- needed for both guard checks and downstream service/audit arguments

**Why caching helps**

- Avoids repeated parsing/normalization calls
- Makes the handler read like a single semantic snapshot of the request
- Prevents subtle drift where the guard check and the service call are built from
  repeated getter calls
- Makes debugging easier because the parsed values are visible in locals

**Why not make it universal**

- For single-use trivial getters, local variables add noise
- Some handlers stay clearer if the value is only used once inline

**Recommendation**

Adopt this rule:

> Cache request getter values in locals when the getter is used 2+ times or
> when it returns normalized/parsing-sensitive values (`PatchField<T>`,
> trimmed strings, parsed timestamps, enums).

**Concrete example**

`apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
currently calls `GetSeverity()`, `GetTitle()`, `GetMessage()`, `GetStartsAt()`,
and `GetExpiresAt()` across both the empty-body guard and the args creation.
That is not broken, but it is a good candidate for:

```csharp
var severityStr = body.GetSeverity();
var title = body.GetTitle();
var message = body.GetMessage();
var startsAt = body.GetStartsAt();
var expiresAt = body.GetExpiresAt();

if (severityStr is null
    && title is null
    && message is null
    && startsAt is null
    && !expiresAt.IsPresent) {
    ...
}
```

That pattern is worth adopting selectively across handlers.

### Investigation 2: Entity Parse Methods - Repo-Wide Analysis

The new `Tenant.ParseStatus(part)` change is good. The repo still has several
similar spots that should be refactored the same way.

1. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs:103-108`
   - Current pattern: lowercases a string and checks `ValidSeverities.Contains`.
   - Better pattern: `SystemNotice.ParseSeverity(element.GetValueAsString()) is not null`.
   - Reason: validation should share the same parser as handler/service logic.

2. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:129-141`
   - Current pattern: `GetString()?.ToLowerInvariant()` + `ValidSeverities.Contains`.
   - Better pattern: call `SystemNotice.ParseSeverity(...)`.
   - Reason: this is now duplicate parsing logic even though the entity already
     owns severity parsing.

3. `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs:154-160`
   - Current pattern: `var normalizedLevel = level.ToLowerInvariant();` then
     compare to `"admin"` / `"user"`.
   - Better pattern: `UserAccount.ParseAccountLevel(level)`.
   - Reason: account-level parsing already belongs to `UserAccount`; the handler
     should not re-encode the allowed values.

4. `apps/api/Src/Modules/Users/Services/UserService.cs:287-296`
   - Current pattern: `var effectiveSortId = (sortId ?? "id").ToLowerInvariant();`
     then lookup in a normal dictionary.
   - Better pattern: use `StringComparer.OrdinalIgnoreCase` on the dictionary,
     or an explicit parser/helper for allowed sort IDs.
   - Reason: still violates the repo's "no `ToLower*()` for dispatch" rule.

5. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:262-268`
   - Current pattern: same `ToLowerInvariant()` normalization before sort dispatch.
   - Better pattern: same as above.
   - Reason: same rule violation in the staff tenant cursor path.

6. `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs:174-178`
   - Current pattern: `var effectiveSortId = (sortId ?? "id").ToLowerInvariant();`
   - Better pattern: case-insensitive allowlist/dictionary.
   - Reason: same dispatch anti-pattern still exists in another cursor list
     service.

7. `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:443-545`
   - Current patterns:
     - `effectiveSortId = (sortId ?? "created_at").ToLowerInvariant()`
     - `normalizedStatus = status.Trim().ToLowerInvariant()` with manual `switch`
   - Better pattern:
     - case-insensitive sort handler dictionary
     - dedicated invitation-list-status parser/helper
   - Reason: both dispatch and status semantics are still hand-coded here.

8. `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs:23-25`
   - Current pattern: `return Format?.ToLowerInvariant();`
   - Better pattern: dedicated export-format parser/allowlist method.
   - Reason: this is another wire-format parser hidden behind lowercasing.

**General recommendation**

Use this ownership model:

- Entity parser methods for entity-backed enums or concepts:
  `Tenant.ParseStatus`, `User.ParseStatus`, `UserAccount.ParseAccountLevel`,
  `SystemNotice.ParseSeverity`
- Dedicated helper/parser types for wire-only concepts that are not real entity
  enums, such as export format or derived invitation-list status
- Case-insensitive dictionaries/sets instead of lowered-string dispatch

### Investigation 3: Round 8 Fixes Verification

1. **Empty-body guards**
   - `UpdateTenantAsStaff.cs`: implemented correctly at
     `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs:108-115`
   - `UpdateSystemNotice.cs`: implemented correctly at
     `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:198-207`
   - Verdict: fixed

2. **Guard clauses**
   - `CreateStaffInvitation.cs`: proper impossible-state guard is now separate
     from real permission logic at `:75-86`
   - `RevokeStaffInvitation.cs`: same split at `:27-38`
   - Verdict: fixed, but `RevokeStaffInvitation` still has a route-ID binding
     issue described below

3. **ToLower*() cleanup in the four targeted files**
   - `FindTenantsAsStaff.cs`: handler status parsing was improved and now uses
     `Tenant.ParseStatus(part)`
   - `FindTenantUsersAsStaff.cs`: handler status allowlist now uses
     `StringComparer.OrdinalIgnoreCase`
   - `UserService.cs`: **not fully fixed**; `FindTenantUsersAsync()` still uses
     `ToLowerInvariant()` for `effectiveSortId` at `:290-291`
   - `TenantAsStaffService.cs`: **not fully fixed**; `FindTenantsAsStaffAsync()`
     still uses `ToLowerInvariant()` for `effectiveSortId` at `:263-264`
   - Verdict: partial fix only

4. **Snake_case query params**
   - `CursorPaginatedQuery.cs` correctly exposes `cursor`, `limit`, `sort_id`,
     `sort_order`
   - `OffsetPaginatedQuery.cs` correctly exposes `page`, `limit`, `sort_id`,
     `sort_order`
   - Verdict: fixed

### Investigation 4: Switch Statements - Post-Refactoring

Most remaining `switch` usage is acceptable and should stay:

- `PatchField`/`JsonElement.ValueKind` switches
- enum-to-description switches such as `Tenant.GetStatusDescription`
- CLI argument switch in `BulkSeedCli`

Remaining candidates worth simplifying if touched again:

1. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:778-843`
   - three error-message switches in bulk suspend/reactivate/delete
   - not broken, but still the same "enum-to-string mapping in service" style
     previously called out
   - could become small helper methods or guarded `if` chains

2. `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:547-552` and
   following cases
   - the invitation status `switch` is still paired with lowered-string parsing
   - better replaced by a parser/helper and flat guarded branches

**Remaining `ToLower*()` rule violations relevant to this investigation**

- `UserService.FindTenantUsersAsync`
- `TenantAsStaffService.FindTenantsAsStaffAsync`
- `ProfileAsStaffService.FindStaffProfilesAsync`
- `InvitationService.FindStaffInvitationsAsync`
- `CreateSystemNotice` / `UpdateSystemNotice` severity validators
- `ExportAuditLogsQuery.GetFormat()`
- `CreateTenantAsStaff` initial-user account-level validation

### Investigation 5: "else if" Chains - Post-Refactoring

There are still `else if` chains in the repo, but most of the remaining ones are
appropriate because the branches are truly mutually exclusive or model a state
machine/classification path.

Examples where `else if` is still appropriate:

- `apps/api/Src/Data/DbContext/MainApiDbContext.cs:361-364`
  - entity interface classification is mutually exclusive
- `apps/api/Src/Modules/Permissions/Entities/Permission.cs:53-55`
  - scope-prefix validation is mutually exclusive by design
- `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
  - invitation scope branches are mutually exclusive

Remaining candidate that should still be cleaned up:

- `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs:145-160`
  - this validator still mixes nested `else if` flow with manual lowercasing
  - it should move to `UserAccount.ParseAccountLevel(level)` and a simple
    `if (parsedLevel is AccountLevel.Admin) { hasAdmin = true; }`

So the right rule is not "ban all `else if`". The better rule is:

> Use independent guard `if` blocks when branches are not semantically coupled.
> Keep `else if` when the branches are genuinely exclusive classifications or
> ordered fallback logic.

### Investigation 6: API Contract Consistency

**Runtime/code references**

- No remaining app/package code references to `PaginatedQuery` or
  `PaginatedResult` were found
- `apps/api/Src/Lib/PaginatedQuery.cs` and
  `apps/api/Src/Lib/PaginatedResult.cs` no longer exist
- `make build-api` and `make tsc-front` both passed
- No frontend/package references to the old names were found

**Remaining cleanup**

1. `docs/guides/validator-conventions.md:101`
   - still teaches `FindUsersQuery : PaginatedQuery`
2. `docs/guides/validator-conventions.md:220`
   - still references `PaginatedQuery` in query DTO guidance
3. `docs/guides/validator-conventions.md:350`
   - still says base query types are `PaginatedQuery`, `CursorPaginatedQuery`

**Additional note**

- `apps/api/Src/Lib/OffsetPaginatedResult.cs` currently has no usages in app
  code. That is not a bug, but it means the rename created a consistent type
  name without proving that the type is still needed.

### Investigation 7: Write Operation Response Standard

**Touched round-9 handlers**

- `CreateStaffInvitation` returns `Created<InvitationCreated>`: compliant
- `UpdateTenantAsStaff` returns `Ok<GetTenantAsStaffResult>`: compliant
- `UpdateSystemNotice` returns `Ok<SystemNoticeUpdated>`: compliant
- `RevokeStaffInvitation` returns `Ok<ApiResponse>`: compliant

**Repo-wide pre-existing deviations still present**

1. `apps/api/Src/Modules/Auth/Handlers/VerifyEmailRequest.cs:89` and `:112`
   - current: `Ok<VerifyEmailRequestResult>`
   - expected by standard: `Ok<ApiResponse>` because this is an action-only
     operation (send/re-send verification email)

2. `apps/api/Src/Modules/Auth/Handlers/ResetPassword.cs:156-158`
   - current: `Ok<ResetPasswordResult>`
   - expected by standard: `Ok<ApiResponse>` because this is an action-only
     password-reset completion endpoint

3. `apps/api/Src/Modules/Auth/Handlers/GetVerificationLink.cs:75`
   - current: `Ok<GetVerificationLinkResult>`
   - this is a less clear case because the endpoint returns generated data, not
     merely a success message; if kept, it should be explicitly treated as a
     data-returning utility endpoint rather than an "action-only" endpoint

## Observations & Issues

### Critical Issues

None.

### Major Issues

1. **The repo-wide `ToLower*()` cleanup is still incomplete in the main cursor
   paths.**
   - `apps/api/Src/Modules/Users/Services/UserService.cs:290-291`
   - `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:263-264`
   - These were explicitly part of the session cleanup theme and still violate
     the rule that future agents are now supposed to follow.

2. **Two touched handlers still violate the route-parameter contract by binding
   route IDs directly as `Guid`.**
   - `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:185`
   - `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs:20`
   - The repo guide says route IDs must be `string` + `Guid.TryParse` so malformed
     IDs return typed RFC 7807 `BadRequest` with `ResponseKeys.MalformedId`.

3. **The parser-refactor story is not finished, so the new `Tenant.ParseStatus`
   improvement is still isolated rather than systemic.**
   - `CreateSystemNotice` and `UpdateSystemNotice` validators still duplicate
     severity parsing
   - `CreateTenantAsStaff` still duplicates account-level parsing
   - `InvitationService` and `ProfileAsStaffService` still hand-roll parser/
     dispatch behavior

### Minor Issues

1. `docs/guides/validator-conventions.md` still teaches the old
   `PaginatedQuery` name even though the codebase now uses `OffsetPaginatedQuery`.

2. `OffsetPaginatedResult<T>` is currently unused in app code. This is not
   wrong, but it means the rename cleaned naming consistency without proving
   runtime value yet.

3. The new guard-clause fixes for `CreateStaffInvitation` and
   `RevokeStaffInvitation` do not appear to have dedicated integration specs.

4. The new `status` null-semantics fix in `UserValidationRules` does not appear
   to have a focused regression spec that asserts `422` for `status: null`.

5. `UpdateSystemNotice` and `UpdateTenantAsStaff` now have empty-body guards,
   but I did not find explicit regression tests asserting the `"No fields to update"`
   path in those spec files.

## Recommendations

### Immediate Actions

1. Finish the `ToLower*()` cleanup in:
   - `UserService.FindTenantUsersAsync`
   - `TenantAsStaffService.FindTenantsAsStaffAsync`
   - and, if you want the rule to be durable, the adjacent remaining parser/
     dispatch sites listed in Investigation 2

2. Fix route-ID binding in:
   - `UpdateSystemNotice`
   - `RevokeStaffInvitation`
   by changing `[FromRoute] Guid ...` to `[FromRoute] string ...` plus
   `Guid.TryParse` and `ResponseKeys.MalformedId`

3. Update `docs/guides/validator-conventions.md` to rename `PaginatedQuery`
   references to `OffsetPaginatedQuery`

4. Add regression specs for:
   - `UpdateStaffUser` rejecting `status: null`
   - `UpdateTenantAsStaff` empty PATCH body
   - `UpdateSystemNotice` empty PATCH body
   - malformed route IDs for `UpdateSystemNotice` and `RevokeStaffInvitation`

### Future Improvements

1. Create a small shared parser strategy for wire-only concepts such as export
   format and invitation-list status instead of scattering lowercased strings.

2. Where getters are reused multiple times, adopt the "cache normalized body
   values once" pattern for readability and semantic consistency.

3. Consider whether `OffsetPaginatedResult<T>` should be adopted by any live
   offset endpoint or removed until needed.

## Final Assessment

Not yet.

The session moved the codebase in the right direction, and the app still builds,
type-checks, and passes the targeted tests. But the cleanup is incomplete in the
exact areas the session set out to standardize: two core cursor services still
use `ToLowerInvariant()` for dispatch, and two touched handlers still violate the
route-ID binding contract. Fix those, update the stale validator guide, and add
the small regression tests above, and this becomes merge-ready.
