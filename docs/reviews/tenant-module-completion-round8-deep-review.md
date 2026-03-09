# Deep Review: Tenant Module Completion - Round 8

## Executive Summary

Round 8 fixed the two Round 7 blockers in `UpdateStaffUser` itself: `status`
is now wired through the handler and service, and the endpoint now rejects an
empty PATCH body. The `CreateInvitationForTenantAsStaff` auth-context branch
was also corrected to use the repo's guard-clause pattern instead of returning
`Forbidden`.

I would still not merge this revision set as-is. The top blocker is not in the
production handler code anymore, but in the newly updated spec file:
`UpdateStaffUser.Spec.cs` currently fails the test-project compilation with
`CS0576` because it defines a namespace alias that conflicts with a type in the
same namespace. There is also a new contract edge case in the `status` PATCH
shape: `status: null` is treated as "present" by the empty-body guard, but the
service treats it as a no-op because `User.Status` is not nullable. That means
the new empty-body protection is still bypassable through a syntactically valid,
semantically empty request.

## Special Investigation Reports

### Investigation 0: `ToLower*()` Comparison / Dispatch Violations

Yes, the use at
`apps/api/Src/Modules/Users/Services/UserService.cs:243` is the same class of
mistake the repo standards warn against.

Why it is a problem:

1. The repo guide explicitly says not to use `ToLowerInvariant()` as a
   comparison strategy.
2. Lowercasing just to compare or dispatch creates an unnecessary temporary
   string.
3. It spreads case-normalization logic around the codebase instead of keeping
   parsing/comparison logic explicit and centralized.

Important distinction:

- I am **not** counting legitimate normalization uses such as storing emails in
  lowercase, generating lowercase codes, or formatting enum output as lowercase
  strings for API responses.
- I **am** counting the cases where the code lowercases input in order to
  compare, validate membership, or branch on it.

Confirmed production-code violations found repo-wide:

1. `apps/api/Src/Modules/Users/Services/UserService.cs:243-266`
   - Current code: `sortId.ToLowerInvariant() switch { ... }`
   - Why it is a violation: case-insensitive dispatch implemented by
     lowercasing first.
   - Recommended fix:
     - prefer a dictionary keyed with `StringComparer.OrdinalIgnoreCase`, or
     - use `if` / parser methods with `StringComparison.OrdinalIgnoreCase`
       where practical.

2. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:216-236`
   - Current code: `sortId.ToLower() switch { ... }`
   - Same issue as above, plus it uses `ToLower()` instead of
     `ToLowerInvariant()`.

3. `apps/api/Src/Modules/Invitations/Services/InvitationService.cs:542-560`
   - Current code:
     - `var normalizedStatus = status.Trim().ToLowerInvariant();`
     - `switch (normalizedStatus) { ... }`
   - Recommendation:
     - move status parsing into a small helper using
       `StringComparison.OrdinalIgnoreCase`, or
     - dispatch through a case-insensitive dictionary.

4. `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:52-58`
   - Current code: `part.ToLowerInvariant() switch { ... }`
   - Recommended fix:
     - use a parser helper on `Tenant` or a local method with
       `string.Compare(..., StringComparison.OrdinalIgnoreCase)`.

5. `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:75-82`
   - Current code:
     `AllowedStatuses.Contains(p.ToLowerInvariant())`
   - Recommended fix:
     - use `AllowedStatuses.Contains(p, StringComparer.OrdinalIgnoreCase)`, or
     - prebuild a `HashSet<string>(StringComparer.OrdinalIgnoreCase)`.

6. `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs:49-52`
   - Current code:
     `AllowedStatuses.Contains(raw.ToLowerInvariant())`
   - Recommended fix:
     - same as above, using a case-insensitive comparer instead of
       lowercasing input.

7. `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs:154-160`
   - Current code:
     - `var normalizedLevel = level.ToLowerInvariant();`
     - compares against `"admin"` / `"user"`
   - Recommended fix:
     - use `UserAccount.ParseAccountLevel(level)` directly, or
     - use `string.Compare(level, "admin", StringComparison.OrdinalIgnoreCase)`.

8. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs:107-108`
   - Current code:
     - `var value = element.GetString()?.ToLowerInvariant();`
     - `ValidSeverities.Contains(value)`
   - Recommended fix:
     - use `ValidSeverities.Contains(value, StringComparer.OrdinalIgnoreCase)`,
       or
     - delegate to `SystemNotice.ParseSeverity(...)`.

9. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:139-141`
   - Current code:
     - `var value = element.Value.GetString()?.ToLowerInvariant();`
     - `ValidSeverities.Contains(value)`
   - Recommended fix: same as create.

10. `apps/api/Src/Lib/DI/ServiceValidator.cs:154-157`
    - Current code:
      `if (service.Key != service.Key.ToLowerInvariant())`
    - This is internal validation code rather than user input, but it is still
      the same comparison anti-pattern.
    - Recommended fix:
      compare with `string.Equals(service.Key, service.Key.ToLowerInvariant(), StringComparison.Ordinal)`
      if you truly want exact lowercase enforcement, or use a dedicated
      character-policy helper.

Test-only occurrence worth cleaning up, but not a production blocker:

1. `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs:76`
   - Current code: `u.Email == email.ToLower()`
   - Recommendation:
     - either normalize the local variable once more explicitly, or
     - use `string.Equals(..., StringComparison.OrdinalIgnoreCase)` if the test
       intent is case-insensitive lookup.

Not reported as violations:

1. Email/code normalization for storage:
   - `User.Email` setter
   - `Tenant.Code` setter
   - invitation/account service email normalization before DB equality queries

2. Lowercasing enum output for API payloads:
   - system notice severity output

3. Lowercasing sort IDs once as canonical internal keys:
   - `effectiveSortId = (sortId ?? "...").ToLowerInvariant()`
   - I would still prefer case-insensitive dictionaries over this in new code,
     but I am treating the direct comparison/dispatch cases above as the higher
     confidence rule violations.

### Investigation 1: Empty-Body Guard Repo-Wide

Handlers reviewed as true PATCH/update endpoints:

1. `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
   - Current behavior: correctly rejects empty bodies with `"No fields to update"`.
   - Recommendation: keep.

2. `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
   - Current behavior: correctly rejects empty bodies with `"No fields to update"`.
   - Recommendation: keep.

3. `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`
   - Current behavior: allows an empty body, builds `UpdateTenantAsStaffArgs`
     with all fields absent/null, and still calls the service.
   - Why guard is needed: `TenantAsStaffService.UpdateTenantAsync()` still
     writes `tenant.UpdatedAt = DateTime.UtcNow` even when no effective domain
     field changes were requested.
   - References:
     - `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs:108-116`
     - `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:698-707`
   - Recommendation: add the same empty-body guard pattern used in
     `UpdateStaffUser` / `UpdateTenantUserAsStaff`.

4. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
   - Current behavior: allows an empty body and still calls the service.
   - Why guard is needed: `SystemNoticeService.UpdateAsync()` updates
     `UpdatedAt` even if `Severity`, `Title`, `Message`, `StartsAt`, and
     `ExpiresAt` are all effectively absent.
   - References:
     - `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:212-222`
     - `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs:337-350`
   - Recommendation: add the same explicit `"No fields to update"` check.

Handlers that should be left as-is:

1. `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs`
   - Reason: the operation itself is meaningful even with an empty body because
     the path identifies the tenant and the optional body only carries `reason`.

2. `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs`
   - Reason: same as above; it is an action endpoint, not a field-patch
     endpoint.

3. Bulk action handlers
   - Reason: body content is required (`tenantIds`) and not optional patch
     semantics.

### Investigation 2: Guard Clause Repo-Wide

Repo-wide search for staff/tenant handlers returning `TypedProblems.Forbidden`
when `authContext.AccountStaff` or `authContext.AccountTenant` is null found
two live staff-endpoint violations:

1. `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs:75-82`
   - Current code:
     - `var account = authContext.AccountStaff;`
     - `if (account is null || account.Scope != AccountScope.Staff || account.Level != AccountLevel.Admin) { return TypedProblems.Forbidden(...); }`
   - Problem: the `account is null` branch is an impossible-state developer
     safety issue behind staff authorization, while the scope/level checks are
     authorization logic. Those two concerns are mixed together.
   - Recommended fix:
     - First guard `account is null` with `InvalidOperationException`.
     - Then keep the business permission check separately if still needed.

2. `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs:27-34`
   - Current code:
     - `var account = authContext.AccountStaff;`
     - `if (account is null || account.Scope != AccountScope.Staff || account.Level != AccountLevel.Admin) { return TypedProblems.Forbidden(...); }`
   - Problem: same conflation of impossible auth-context state with real
     authorization logic.
   - Recommended fix: same split-guard pattern as above.

No tenant-only handler using `authContext.AccountTenant` with this exact bad
pattern was found in the current module scan.

Not counted as direct matches for this investigation, but still worth noting:

1. `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkSuspendTenantsAsStaff.cs:101-116`
2. `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkReactivateTenantsAsStaff.cs:79-91`
3. `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkDeleteTenantsAsStaff.cs:79-90`
   - These do not return `Forbidden`, but they still silently skip audit logging
     when `AccountStaff` is null. That is softer than the earlier bug, but it is
     the same family of auth-context drift: behind `.WithPermission()`, missing
     `AccountStaff` should not degrade into "do nothing".

### Investigation 3: Switch Statements Analysis

The specific user concern in
`apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs:28-40`
should **not** be converted. That `LogoUrl.ValueKind switch` is the repo's
canonical `PatchField<string?>` implementation and is exactly the pattern
documented in `docs/guides/patchfield-pattern.md`.

Repo-wide switch analysis:

Switches that should stay:

1. `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs:28-40`
   - Keep. Canonical `PatchField` value-kind switch.

2. `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs:50-75`
3. `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs:29-62`
4. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:39-53`
5. `apps/api/Src/Lib/Extensions/JsonElementExtensions.cs`
   - Keep. These are all type-discrimination switches where the switch shape is
     clearer than nested `if` statements.

6. `apps/api/Src/Modules/Tenants/Entities/Tenant.cs:43-50`
7. `apps/api/Src/Modules/Users/Entities/User.cs:62-70`
8. `apps/api/Src/Modules/Users/Entities/UserAccount.cs:123-128`
   - Keep. Enum-to-description mapping helpers are a reasonable switch use.

9. `apps/api/Src/Lib/Seeding/BulkSeedCli.cs:17-21`
   - Keep. Small command dispatcher with three branches.

Switches that should be converted or at least reconsidered:

1. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:780-785`
   - `SuspendTenantError` -> error-message switch.
   - Recommendation: convert to guard-style `if` blocks for consistency with
     the repo's "guard clauses over switch on error enums" rule.

2. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:810-814`
   - `ReactivateTenantError` -> error-message switch.
   - Recommendation: convert to `if` blocks. This one is especially small and
     gains nothing from the switch.

3. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:839-843`
   - `DeleteTenantError` -> error-message switch.
   - Recommendation: convert to `if` blocks for the same reason.

Conditional / not worth touching right now:

1. `apps/api/Src/Modules/Users/Services/UserService.cs:243-266`
2. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:216-236`
3. `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:52-58`
   - These are multi-branch sort/value dispatchers rather than error handling.
     They are not ideal examples of the repo's preferred style, but converting
     them to `if` chains would not clearly improve readability.

### Investigation 4: Write Operation Response Standard Compliance

Strict compliance check against the line-669 "Write Operation Response Standard"
found no new create/update/delete violations in the main tenant-user round-8
files:

1. `UpdateStaffUser` returns `Ok<GetStaffUserByIdResult>`: correct.
2. `CreateInvitationForTenantAsStaff` returns `Created<InvitationCreatedForTenant>`:
   correct.
3. `RemoveUserFromTenantAsStaff` returns `Ok<ApiResponse>`: correct.

Repo-wide strict-response mismatches found:

1. `apps/api/Src/Modules/Auth/Handlers/VerifyEmailRequest.cs:42, 89, 112`
   - Current pattern: `Ok<VerifyEmailRequestResult>` where the DTO only carries
     a status string.
   - Why it violates the standard: this is an action-only endpoint; the guide
     says such endpoints should return `Ok<ApiResponse>` with message +
     `translationKey`.

2. `apps/api/Src/Modules/Auth/Handlers/ResetPassword.cs:83, 156`
   - Current pattern: `Ok<ResetPasswordResult>` with a `"success"` status
     payload.
   - Recommendation: `Ok<ApiResponse>` under the documented standard.

3. `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs:54-55, 129`
   - Current pattern: `Ok<TenantSuspendedResult>`.
   - Strict reading of the standard: this is action-only and could be
     `Ok<ApiResponse>`.
   - Product caveat: returning the post-action tenant state is useful, so this
     is a softer standards mismatch than the two auth handlers above.

4. `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs:22-23, 82`
   - Same assessment as suspend.

Not reported as direct violations:

1. Bulk tenant action handlers returning count/result DTOs
   - They technically diverge from the pure `ApiResponse` rule, but they carry
     materially useful batch result data (`succeededCount`, `failedItems`), so I
     would treat them as acceptable exceptions unless the team wants to tighten
     the standard.

### Investigation 5: Namespace Conflict Fix

Why the error occurs:

1. `UpdateStaffUser.Spec.cs` is declared in the namespace
   `MainApi.Src.Modules.Users.Handlers.Staff`.
2. That namespace already contains the real type
   `GetStaffUserByIdResult` from the production handler file.
3. The spec then adds:
   `using GetStaffUserByIdResult = MainApi.Src.Modules.Users.Handlers.Staff.GetStaffUserByIdResult;`
4. That alias has the exact same identifier as the existing namespace member.
5. When the compiler resolves
   `ReadFromJsonAsync<GetStaffUserByIdResult>()` at
   `UpdateStaffUser.Spec.cs:186-189` and `:220-223`, it sees a name collision
   between the alias and the actual type, causing `CS0576`.

Do not apply in this review, but the fix is straightforward:

1. Best fix: delete the alias entirely and use `GetStaffUserByIdResult`
   directly, because the type is already in the same namespace.
2. Alternative fix: rename the alias to something distinct, for example:
   `using StaffUserByIdResponse = MainApi.Src.Modules.Users.Handlers.Staff.GetStaffUserByIdResult;`
   and update the two `ReadFromJsonAsync<...>()` calls.

This is a real blocker, not a hypothetical cleanup item. The targeted test run
failed on March 8, 2026 with:

- `UpdateStaffUser.Spec.cs(186,16): error CS0576`
- `UpdateStaffUser.Spec.cs(187,23): error CS0576`
- `UpdateStaffUser.Spec.cs(220,16): error CS0576`
- `UpdateStaffUser.Spec.cs(221,23): error CS0576`

### Investigation 6: Snake_case Convention

This investigation turned up a broader architecture point: snake_case is
already used in the **database schema** (`[Column("created_at")]`,
`[Column("updated_at")]`, etc.), but it is **not** the repo's current public
API contract naming convention. The current API contract is mixed, and in most
places it is camelCase for JSON/query fields.

Important conclusion:

1. `CreatedAt` / `UpdatedAt` on entities and service documents are **not**
   snake_case violations in C# code. They are correct PascalCase .NET property
   names, and the database mapping is already snake_case:
   `apps/api/Src/Data/BaseAttributes.cs:10-20`.
2. If the team wants snake_case for the public API contract, that is a
   deliberate breaking-change program, not a local cleanup.

Concrete occurrences found:

Query parameter field names currently camelCase:

1. `apps/api/Src/Lib/CursorPaginatedQuery.cs:6-9`
   - Current: `Cursor`, `Limit`, `SortId`, `SortOrder`
   - Public query names become `cursor`, `limit`, `sortId`, `sortOrder`
   - If snake_case is desired, this would need to become explicit
     `[FromQuery(Name = "sort_id")]`, `[FromQuery(Name = "sort_order")]`, etc.

2. `apps/api/Src/Lib/PaginatedQuery.cs:6-9`
   - Same issue for offset pagination.

3. `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts:68-73`
4. `apps/front/src/lib/react-query/features/staff/staff-profile.hooks.ts`
5. `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`
6. `apps/front/src/lib/react-query/features/staff/staff-audit-log.hooks.ts`
   - Current query parameter names use `sortId`, `sortOrder`, `userId`,
     `tenantId`.
   - If snake_case is desired, all of these hooks and the generated client would
     need regeneration after backend changes.

Query parameter option values / sort IDs with mixed style:

1. `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs:133`
   - Error message advertises `created_at, updated_at, name, status`.
   - This is the cleaner style.

2. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs:217-235`
   - Legacy path still uses `createdat`, `updatedat`, `userscount`.
   - Recommendation if this code path stays public: migrate to
     `created_at`, `updated_at`, `users_count`.

3. `apps/api/Src/Modules/Users/Services/UserService.cs:244-265`
   - Uses `createdat`, `updatedat`, `firstname`, `lastname`.
   - Recommendation if you adopt snake_case externally:
     `created_at`, `updated_at`, `first_name`, `last_name`.

Body DTO and JSON response fields currently camelCase:

1. `packages/client-ts/src/models/index.ts:6079-6103`
   - `UpdateStaffUserBody` currently exposes `avatarUrl`, `firstName`,
     `lastName`, `status`.

2. `packages/client-ts/src/models/index.ts:6181-6189`
   - `UpdateTenantUserAsStaffBody` exposes `avatarUrl`, `firstName`,
     `lastName`.

3. `packages/client-ts/src/models/index.ts:3492-3506`
   - Staff-user response DTO uses `firstName`, `lastName`, `status`.

4. `packages/client-ts/src/models/index.ts:3514-3540`
   - Tenant response DTOs use `createdAt`, `updatedAt`, `tenantId`.

Recommendation:

1. Do **not** rename internal entity/document properties like `CreatedAt` to
   `created_at`; that would be unidiomatic C# and directly conflicts with the
   existing EF `[Column("created_at")]` mapping approach.
2. If you want snake_case in the **API contract**, treat it as a dedicated,
   cross-cutting contract migration:
   - query DTO `[FromQuery(Name = ...)]`
   - response/body serializer naming
   - OpenAPI regeneration
   - Kiota client regeneration
   - frontend hook updates
   - compatibility plan for existing clients

Definite recommendation:

1. Keep internal C# symbols PascalCase.
2. Standardize **public query parameter names** on `snake_case`.
3. Standardize **multi-word wire-format option values** on `snake_case`.
4. Do **not** use collapsed lowercase forms like `updatedat`.
5. Do **not** rename entity/service/document property names to `created_at` /
   `updated_at`.

Recommended target examples:

- C# property: `UpdatedAt`
- Query parameter: `updated_at`
- Sort parameter name: `sort_id`
- Sort option value: `updated_at`
- Query parameter: `user_id`

Avoid:

- `updatedat`
- `sortid`
- `userid`
- renaming C# properties to `updated_at`

### Recommended Snake_case Migration Plan

If you are willing to apply the contract cleanup immediately, this is the
sequence I recommend.

#### Scope decision

Apply snake_case to:

1. Query parameter names
2. Multi-word query option values
3. Multi-word body/query string enum-like values where they are part of the
   public wire contract

Do **not** apply it to:

1. C# entity properties
2. C# service args/documents
3. C# response/body DTO property names in source code unless you are also
   changing serializer/OpenAPI naming globally
4. EF column mappings, which are already correctly snake_case

#### Step 1: Normalize the shared pagination query contract first

This is the highest leverage change because many handlers inherit it.

Primary files:

1. `apps/api/Src/Lib/CursorPaginatedQuery.cs`
2. `apps/api/Src/Lib/PaginatedQuery.cs`
3. `apps/api/Src/Lib\Validation/CursorPaginatedQueryValidator.cs`
4. `apps/api/Src/Lib\Validation/OffsetPaginatedQueryValidator.cs`

Recommended changes:

1. Keep property names PascalCase:
   - `SortId`
   - `SortOrder`
2. Change wire names explicitly:
   - `[FromQuery(Name = "sort_id")]`
   - `[FromQuery(Name = "sort_order")]`
3. Leave `cursor`, `limit`, `page` as-is unless you want full explicit naming
   everywhere for consistency.

Example:

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
}
```

Why start here:

1. It fixes many endpoints at once.
2. It gives frontend and OpenAPI a single stable contract baseline.

#### Step 2: Normalize handler-specific query names

Files already using custom query names should be reviewed one by one.

Examples from current code:

1. `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`
   - currently has `q` and `status`
   - recommendation:
     - keep `q` if you intentionally want a short search token
     - otherwise migrate to `search`
2. `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
   - same decision for `q` vs `search`
3. `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
   - strongly consider:
     - `user_id`
     - `target_id`
     - `start_date`
     - `end_date`

Example:

```csharp
public class ExportAuditLogsQuery {
    [FromQuery(Name = "format")]
    public string? Format { get; set; }

    [FromQuery(Name = "user_id")]
    public string? UserId { get; set; }

    [FromQuery(Name = "target_id")]
    public string? TargetId { get; set; }

    [FromQuery(Name = "start_date")]
    public string? StartDate { get; set; }

    [FromQuery(Name = "end_date")]
    public string? EndDate { get; set; }
}
```

#### Step 3: Normalize multi-word sort option values

This is the part that directly fixes ugly URL values like `updatedat`.

Files to prioritize:

1. `apps/api/Src/Modules/Users/Services/UserService.cs`
2. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
3. `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
4. `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
5. `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
6. `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`

Recommended canonical values:

- `created_at`
- `updated_at`
- `first_name`
- `last_name`
- `user_count` or `users_count` depending on the slice
- `accepted_at`
- `starts_at`

Important:

1. Update the actual service parser/dispatcher.
2. Update any handler error message listing allowed sort values.
3. Update tests that send sort IDs.
4. Update frontend hooks that pass `sort.id`.

Concrete examples to change:

1. `apps/api/Src/Modules/Users/Services/UserService.cs`
   - from: `createdat`, `updatedat`, `firstname`, `lastname`
   - to: `created_at`, `updated_at`, `first_name`, `last_name`

2. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
   - from: `createdat`, `updatedat`, `userscount`
   - to: `created_at`, `updated_at`, `users_count`

#### Step 4: Fix comparison/dispatch logic while touching those parsers

Do not migrate naming and keep the old `ToLower*()` pattern at the same time.
Use the migration to clean both concerns together.

Preferred patterns:

1. Case-insensitive dictionary:

```csharp
private static readonly Dictionary<string, string> SortAliases =
    new(StringComparer.OrdinalIgnoreCase) {
        ["created_at"] = "created_at",
        ["updated_at"] = "updated_at",
        ["first_name"] = "first_name",
        ["last_name"] = "last_name",
    };
```

2. Parser helper with `StringComparison.OrdinalIgnoreCase`
3. Existing entity parse methods like `User.ParseStatus(...)`

Avoid:

```csharp
sortId.ToLowerInvariant() switch { ... }
AllowedStatuses.Contains(raw.ToLowerInvariant())
```

#### Step 5: Decide whether JSON body/response property names are in scope

My recommendation for this migration:

1. Do **not** change JSON property names in this pass unless you explicitly want
   a full API-contract naming migration.
2. Limit the immediate migration to query parameter names and query option
   values.

Reason:

1. Query-name cleanup gives you the readability win you care about in URLs.
2. Changing JSON field names is broader, more disruptive, and touches generated
   client models far more aggressively.

So for now:

- keep JSON fields like `firstName`, `avatarUrl`, `updatedAt`
- change URL/query shapes like `sort_id=updated_at`

That gives a pragmatic mixed contract:

- JSON: camelCase
- URL query params and option values: snake_case

This is acceptable and common.

#### Step 6: Regenerate the contract immediately after backend changes

Required commands:

```bash
make build-api
make generate-client
make tsc-front
```

Why:

1. Query parameter names are part of OpenAPI.
2. Kiota-generated request builders and query parameter types will change.
3. Frontend hooks must compile against the new generated contract.

#### Step 7: Update frontend hook/query usage

Areas to update after client regeneration:

1. `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`
2. `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
3. `apps/front/src/lib/react-query/features/staff/staff-profile.hooks.ts`
4. `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`
5. `apps/front/src/lib/react-query/features/staff/staff-audit-log.hooks.ts`
6. any table/filter utilities constructing `sort.id`

What to update:

1. outgoing query parameter names if the generated client changes them
2. `sort.id` constants and table column sort IDs
3. tests or story/demo data that still use legacy `updatedat`

#### Step 8: Update integration tests and any hard-coded URLs

Priority files:

1. `*.Spec.cs` files that call list/find/export endpoints with query strings
2. frontend tests if any
3. helper utilities building URLs manually

Examples to search:

- `sortId`
- `sortOrder`
- `updatedat`
- `createdat`
- `firstname`
- `lastname`
- `userscount`

#### Step 9: Compatibility strategy

If there are no external consumers yet:

1. Break cleanly now.
2. Update all internal callers in one PR.
3. Do not keep legacy aliases.

If external consumers may exist:

1. Temporarily accept both old and new names.
2. Emit only the new names in docs/examples/client code.
3. Remove old aliases in a later cleanup.

For internal-only code, my recommendation is:

- do the clean break now
- avoid dual-format support unless you have a real migration consumer

#### Step 10: Recommended first-wave exact changes

If I were implementing this immediately, I would do the first PR in this order:

1. Shared query base types:
   - `CursorPaginatedQuery.cs`
   - `PaginatedQuery.cs`
2. Sort option canonicalization:
   - `UserService.cs`
   - `TenantAsStaffService.cs`
   - `ProfileAsStaffService.cs`
   - `InvitationService.cs`
3. Handler/query DTO explicit names:
   - `FindTenantsAsStaff.cs`
   - `FindTenantUsersAsStaff.cs`
   - `ExportAuditLogs.cs`
4. Fix `ToLower*()` comparison/dispatch violations while in those files
5. Regenerate client
6. Update frontend hooks and sort IDs
7. Update tests

#### Step 11: Concrete policy I recommend for the repo

Write this down as the rule:

- Internal .NET symbols remain PascalCase.
- Database columns remain snake_case via EF `[Column(...)]`.
- JSON body/response fields remain camelCase unless a separate full-contract
  migration is approved.
- URL/query parameter names and multi-word query option values use `snake_case`.
- Case-insensitive matching must use parser helpers, case-insensitive
  dictionaries, or `StringComparison.OrdinalIgnoreCase`, never
  `ToLowerInvariant()` for comparison/dispatch.

## Observations & Issues

### Critical Issues

1. `UpdateStaffUser.Spec.cs` currently breaks the test project with `CS0576`.
   The alias `using GetStaffUserByIdResult = ...GetStaffUserByIdResult;`
   conflicts with the real type in the same namespace. This is a hard merge
   blocker because `dotnet test` cannot compile the spec project. References:
   `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs:16`,
   `:186-189`, `:220-223`.

### Major Issues

1. The new `status` contract in `UpdateStaffUser` still has a null-semantics
   bug. The body validator explicitly allows `status: null` via
   `MustBeNullableUserStatus()`:
   `apps/api/Src/Modules/Users/Validation/UserValidationRules.cs:50-73`.
   The handler then treats `body.GetStatus().IsPresent` as a real field for the
   empty-body guard:
   `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs:117-126`.
   But the service update path ignores `null` and preserves the old value:
   `apps/api/Src/Modules/Users/Services/UserService.cs:627`.

   Consequence:
   - `{ "status": null }` is accepted
   - it bypasses `"No fields to update"`
   - it performs a meaningless write by bumping `UpdatedAt`
   - but it does not actually update `Status`

   Recommendation:
   - either reject `null` for `Status` entirely, since `User.Status` is not a
     clearable nullable field
   - or change the empty-body guard to treat `status: null` as absent
   - and add an explicit spec for this case

2. Two other real PATCH handlers still accept empty bodies and should be brought
   to the same standard established in this review chain:
   - `UpdateTenantAsStaff`
   - `UpdateSystemNotice`

3. Two staff-only invitation handlers still use the older
   `TypedProblems.Forbidden()` branch for `AccountStaff is null` instead of the
   repo's impossible-state guard clause:
   - `CreateStaffInvitation`
   - `RevokeStaffInvitation`

4. The codebase still has several case-insensitive comparison/dispatch paths
   implemented with `ToLower*()` normalization first. The user-called-out case
   in `UserService.cs:243` is valid, and the same issue appears in tenant
   search/filter validators, tenant creation validation, invitation status
   filtering, and system-notice severity validation. See
   `Investigation 0: ToLower*() Comparison / Dispatch Violations`.

### Minor Issues

1. Strict write-response standard compliance is still mixed in older action
   endpoints, especially:
   - `VerifyEmailRequest`
   - `ResetPassword`
   - tenant suspend/reactivate handlers if you interpret the standard literally

2. Public contract naming remains mixed between camelCase and snake_case-style
   sort IDs. The codebase is not on a coherent snake_case API contract today.

3. The bulk tenant handlers still silently skip audit logging when
   `AccountStaff` is missing instead of failing loudly as an impossible state:
   - `BulkSuspendTenantsAsStaff`
   - `BulkReactivateTenantsAsStaff`
   - `BulkDeleteTenantsAsStaff`

## Recommendations

### Immediate Actions

1. Fix the `CS0576` alias conflict in
   `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs`.
   This is the top merge blocker.

2. Tighten `UpdateStaffUser.Status` semantics:
   - disallow `null` in validation, or
   - treat `null` as absent in the empty-body guard and document it,
   - then add an integration test for `{ "status": null }`.

3. Add `"No fields to update"` guards to:
   - `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`
   - `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`

4. Convert `CreateStaffInvitation` and `RevokeStaffInvitation` to the repo's
   split pattern:
   - `AccountStaff is null` -> `InvalidOperationException`
   - real authorization failure -> `TypedProblems.Forbidden(...)`

5. Replace the confirmed `ToLower*()` comparison/dispatch violations with
   case-insensitive comparers or parser helpers, starting with:
   - `apps/api/Src/Modules/Users/Services/UserService.cs`
   - `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
   - `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`
   - `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`

### Future Improvements

1. Decide whether the public API contract is intentionally camelCase or whether
   you want a real snake_case migration. Do not apply ad hoc renames inside C#
   entity/service code.

2. Normalize older action-only endpoints to `ApiResponse` if the team wants
   strict adherence to the write-response table in
   `docs/guides/csharp-coding-standards.md`.

3. Convert the small error-message switches in `TenantAsStaffService` to
   guard-style `if` blocks for consistency with the repo's error-handling
   guidance.

## Final Assessment

Not yet.

The intended Round 8 production fixes mostly landed, and `UpdateStaffUser` is
much closer to the repo standard than it was in Round 7. But the current branch
still has a real compile blocker in `UpdateStaffUser.Spec.cs`, and the new
`status` support still has a null-semantics hole that lets a semantically empty
PATCH slip past the guard. Fix those two issues first, then this slice is
likely ready for a final confirmation pass.
