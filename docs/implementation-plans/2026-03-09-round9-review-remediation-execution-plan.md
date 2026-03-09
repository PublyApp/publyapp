# Execution Plan: Round 9 Review Remediation

## Purpose

This plan is for an execution-oriented AI coding agent. It is intentionally
prescriptive. Follow it step by step.

Primary source review:

- `docs/reviews/deep-review-round9-code-quality-improvements.md`

Related context reviews that informed the current state:

- `docs/reviews/tenant-module-completion-round8-deep-review.md`
- `docs/reviews/tenant-module-completion-round7-deep-review.md`
- `docs/reviews/tenant-module-completion-round6-deep-review.md`

This plan assumes the current objective is:

> Fully remediate the remaining actionable findings from the round-9 deep review
> and close the consistency gaps it identified, without introducing new contract
> regressions.

---

## Non-Negotiable Rules

1. Address **every** item in this plan. Do not silently skip “minor” items.
2. Do not `git add`, `git stage`, `git commit`, or rewrite git history.
3. Do not guess on ambiguous product decisions. If a real product/API decision
   is needed, stop and ask the user.
4. Follow all repo rules in:
   - `AGENTS.md`
   - `docs/guides/csharp-coding-standards.md`
   - `docs/guides/api-route-parameters.md`
   - `docs/guides/project-conventions.md`
   - `docs/guides/validator-conventions.md`
   - `docs/guides/patchfield-pattern.md`
5. Use `apply_patch` for edits.
6. If an API contract changes, regenerate affected generated artifacts and verify
   the frontend still type-checks.
7. Before declaring completion, re-open the review and prove that every finding
   is resolved.
8. Apply the handler body-getter caching rule in this plan where it improves
   correctness/readability:
   - if a body getter is used 2+ times, cache it in a local variable
   - if a body getter returns normalized/parsing-sensitive values
     (`PatchField<T>`, trimmed strings, parsed timestamps, parsed enums), cache
     it in a local variable before guard checks and service calls
   - do not keep repeating the same getter inline across empty-body guards,
     parser branches, args construction, and audit payload creation

---

## Executive Summary of Required Work

There are 5 main workstreams:

1. Finish the incomplete `ToLower*()` cleanup in the important cursor services.
2. Fix remaining route-ID binding violations in touched handlers.
3. Complete the parser ownership cleanup so parsing logic lives in the correct
   entity or helper layer.
4. Update stale docs/guides introduced by the pagination rename.
5. Add or strengthen regression tests for the fixed behaviors.

Do these in the order given below.

---

## Workstream A: Finish the `ToLower*()` Cleanup

### Goal

Eliminate remaining uses of `ToLower()` / `ToLowerInvariant()` as
comparison/dispatch strategy in the code paths explicitly called out by the
round-9 review.

### Files

1. `apps/api/Src/Modules/Users/Services/UserService.cs`
2. `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
3. `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
4. `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
5. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs`
6. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
7. `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
8. `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs`

### Required Changes

#### A1. `UserService.cs`

Target method:

- `FindTenantUsersAsync(...)`

Current problem:

- `effectiveSortId = (sortId ?? "id").ToLowerInvariant();`

Required fix:

- Replace lowered-string dispatch with a case-insensitive handler lookup.

Recommended implementation:

```csharp
var effectiveSortId = sortId ?? "id";

var sortFieldHandlers =
    new Dictionary<string, SortFieldHandler>(
        StringComparer.OrdinalIgnoreCase
    ) {
        ["id"] = ...,
        ["email"] = ...,
        ...
    };
```

Then keep:

```csharp
if (!sortFieldHandlers.TryGetValue(
    effectiveSortId,
    out SortFieldHandler? handler
)) {
    return new FindTenantUsersResult.InvalidSortId(
        effectiveSortId
    );
}
```

Do **not** lower `sortId` first.

#### A2. `TenantAsStaffService.cs`

Target method:

- `FindTenantsAsStaffAsync(...)`

Current problem:

- `effectiveSortId = (sortId ?? "created_at").ToLowerInvariant();`

Required fix:

- Same pattern as above: case-insensitive dictionary, no lowering.

Also review:

- keep `codePrefix = search.ToLowerInvariant()` if it is for query
  normalization for storage/query semantics rather than dispatch
- do **not** remove legitimate normalization that is not comparison/dispatch

#### A3. `ProfileAsStaffService.cs`

Target method:

- `FindStaffProfilesAsync(...)`

Current problem:

- same lowered-string sort dispatch pattern

Required fix:

- convert to case-insensitive dictionary/lookup, same as A1/A2

#### A4. `InvitationService.cs`

Target method:

- `FindStaffInvitationsAsync(...)`

Current problems:

- lowered-string sort dispatch
- lowered-string status dispatch

Required fix:

1. Replace sort dispatch with a case-insensitive dictionary.
2. Replace manual lowered-string status `switch` with one of:
   - a dedicated parser/helper method returning a strongly named internal status
   - or guarded `if` blocks using `StringComparison.OrdinalIgnoreCase`

Preferred structure:

```csharp
if (string.Equals(status, "pending", StringComparison.OrdinalIgnoreCase)) {
    ...
}
if (string.Equals(status, "accepted", StringComparison.OrdinalIgnoreCase)) {
    ...
}
...
```

Better long-term structure:

- create a small helper for invitation list filter semantics if reused

#### A5. `CreateSystemNotice.cs` and `UpdateSystemNotice.cs`

Current problem:

- validators still do `GetString()?.ToLowerInvariant()` + `Contains`

Required fix:

- use `SystemNotice.ParseSeverity(...) is not null` in validators instead of
  manually lowercasing and checking arrays

Example:

```csharp
private bool BeValidSeverity(JsonElement element) {
    if (element.ValueKind != JsonValueKind.String) {
        return false;
    }

    var value = element.GetString();
    if (value is null) {
        return false;
    }

    return SystemNotice.ParseSeverity(value) is not null;
}
```

#### A6. `ExportAuditLogs.cs`

Current problem:

- `GetFormat()` lowercases the format directly

Required fix:

- introduce explicit format parsing instead of lowercasing

Preferred:

```csharp
public string? GetFormat() {
    if (Format is null) {
        return null;
    }

    if (string.Equals(Format, "csv", StringComparison.OrdinalIgnoreCase)) {
        return "csv";
    }
    if (string.Equals(Format, "json", StringComparison.OrdinalIgnoreCase)) {
        return "json";
    }

    return Format;
}
```

If there is already or should be an audit-export format parser, centralize it.

#### A7. `CreateTenantAsStaff.cs`

Current problem:

- manual `level.ToLowerInvariant()` and string comparisons for account level

Required fix:

- replace with `UserAccount.ParseAccountLevel(level)`

Preferred pattern:

```csharp
var parsedLevel = UserAccount.ParseAccountLevel(level);
if (parsedLevel is null) {
    context.AddFailure(...);
}
if (parsedLevel is AccountLevel.Admin) {
    hasAdmin = true;
}
```

This also removes a remaining nested `else if` chain naturally.

---

## Workstream A2.5: Apply the Body Getter Caching Pattern

### Goal

Adopt the requested handler pattern improvement so parsed/normalized body values
are stored once and reused, instead of calling the same body DTO getters
multiple times inline.

### Scope Rule

Do this for handlers touched by this remediation plan and any directly related
handler you edit in the same slice.

### Files to inspect first

1. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
2. `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`
3. `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
4. `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`

### Required Pattern

If a getter is used more than once, cache it:

```csharp
var severityStr = body.GetSeverity();
var title = body.GetTitle();
var message = body.GetMessage();
var startsAt = body.GetStartsAt();
var expiresAt = body.GetExpiresAt();
```

Then use those locals consistently for:

- empty-body guards
- parser calls
- args-record construction
- audit payload creation

### Minimum expected conversions

#### `UpdateSystemNotice.cs`

Cache:

- `body.GetSeverity()`
- `body.GetTitle()`
- `body.GetMessage()`
- `body.GetStartsAt()`
- `body.GetExpiresAt()`

Use the cached values in:

- the empty-body guard
- `SystemNotice.ParseSeverity(...)`
- `UpdateSystemNoticeArgs`
- audit payload

#### `UpdateTenantAsStaff.cs`

Cache:

- `body.GetName()`
- `body.GetLogoUrl()`
- `body.GetMaxUsers()`

Use the cached values in:

- the empty-body guard
- `UpdateTenantAsStaffArgs`
- audit payload

#### `UpdateStaffUser.cs`

Cache:

- `body.GetEmail()`
- `body.GetFirstName()`
- `body.GetLastName()`
- `body.GetAvatarUrl()`
- `body.GetAccountLevel()`
- `body.GetStatus()`

Use the cached values in:

- the empty-body guard
- `UpdateUserDocument`

#### `UpdateTenantUserAsStaff.cs`

If this file still repeats body getters, apply the same pattern there too.

### Important constraint

This is not a blanket “cache every getter everywhere” rule. Apply it when:

- the getter is called 2+ times, or
- the getter returns semantic wrapper values such as `PatchField<T>`

Do not add noisy locals for trivial single-use values.

---

## Workstream B: Fix Remaining Route-ID Binding Violations

### Goal

Bring touched handlers into full compliance with
`docs/guides/api-route-parameters.md`.

### Files

1. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
2. `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs`

### Required Changes

#### B1. `UpdateSystemNotice.cs`

Current problem:

- handler binds `[FromRoute] Guid noticeId`

Required fix:

1. Change route param to:

```csharp
[FromRoute] string noticeId
```

2. Parse inside handler:

```csharp
if (!Guid.TryParse(noticeId, out var noticeIdGuid)) {
    return TypedProblems.BadRequest(
        "Invalid noticeId",
        ResponseKeys.MalformedId
    );
}
```

3. Use `noticeIdGuid` everywhere after that.

4. Update the typed result union to include `AppBadRequestHttpResult` if not
   already present in the correct shape.

#### B2. `RevokeStaffInvitation.cs`

Current problem:

- handler binds `[FromRoute] Guid invitationId`

Required fix:

1. Change route param to string.
2. Parse with `Guid.TryParse`.
3. Return:

```csharp
return TypedProblems.BadRequest(
    "Invalid invitationId",
    ResponseKeys.MalformedId
);
```

4. Use the parsed Guid for the service/audit call.
5. Ensure the result union includes `AppBadRequestHttpResult`.

---

## Workstream C: Complete the Parser Ownership Cleanup

### Goal

Move enum/string parsing to the correct owner so handlers/validators/services do
not each re-encode the same rules.

### Files

1. `apps/api/Src/Modules/SystemNotices/Entities/SystemNotice.cs`
2. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs`
3. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
4. `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
5. `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs`

### Required Changes

#### C1. Verify existing entity parse methods

Confirm these exist and are used:

- `Tenant.ParseStatus(...)`
- `SystemNotice.ParseSeverity(...)`
- `User.ParseStatus(...)`
- `UserAccount.ParseAccountLevel(...)`

If any parsing logic duplicates them, replace the duplication.

#### C2. Ensure validators use entity parsers when validating enum-like strings

Apply this specifically to severity/account-level/status validation where
possible.

#### C3. Do not over-generalize

Do **not** move pure request-shape validation or `JsonElement.ValueKind` checks
into entities. Only move semantic parsing/meaning.

---

## Workstream D: Fix Docs and Naming Drift

### Goal

Align documentation with the renamed offset pagination types and the new wire
naming rules.

### Files

1. `docs/guides/validator-conventions.md`
2. Any other docs that still instruct `PaginatedQuery` in active guidance files

### Required Changes

#### D1. `validator-conventions.md`

Update all active guidance references:

- `PaginatedQuery` → `OffsetPaginatedQuery`
- any mention of `PaginatedQueryValidator` → `OffsetPaginatedQueryValidator`
- any sentence that says base query types are `PaginatedQuery` and
  `CursorPaginatedQuery` → update to `OffsetPaginatedQuery` and
  `CursorPaginatedQuery`

Do not spend time cleaning archived review docs or old plan history unless they
are active guides that future agents are expected to follow.

---

## Workstream E: Add and Strengthen Regression Tests

### Goal

Prove the fixes with executable tests, not just code changes.

### Files to inspect and update

1. `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs`
2. `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.Spec.cs`
3. `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.Spec.cs`
4. Add/create spec files for:
   - `CreateStaffInvitation` if missing
   - `RevokeStaffInvitation` if missing

### Required Tests

#### E1. `UpdateStaffUser.Spec.cs`

Add a regression spec for:

- `status: null` returns `422` validation failure

Assert:

- status code = 422
- validation problem exists
- error key is for `status` or the expected request-body field key

#### E2. `UpdateTenantAsStaff.Spec.cs`

Add or verify a test for:

- empty PATCH body returns `400`
- problem `translationKey` is the expected one
- detail/message matches `"No fields to update"` pattern

If a similar test exists, strengthen it to assert the translation key as well.

#### E3. `UpdateSystemNotice.Spec.cs`

Add or verify tests for:

1. empty PATCH body returns `400`
2. malformed `noticeId` returns `400`
3. malformed route-ID problem uses `ResponseKeys.MalformedId`

#### E4. `CreateStaffInvitation` specs

If there is no spec file yet, create one.

Required tests:

1. malformed profile or route input paths if applicable
2. impossible-state guard is not directly testable through HTTP, so do not try
   to unit test the thrown guard unless the repo already has a pattern for that
3. permission-path behavior still returns `403` for real auth failure

Focus on externally visible behavior only.

#### E5. `RevokeStaffInvitation` specs

If there is no spec file yet, create one.

Required tests:

1. malformed `invitationId` returns `400`
2. translation key is `MalformedId`
3. valid unknown ID returns `404`
4. permission failure returns `403`

---

## Workstream F: Re-Check Write Response Standard

### Goal

Do not open a new huge refactor. Only ensure touched handlers remain compliant.

### Files

1. `CreateStaffInvitation.cs`
2. `UpdateTenantAsStaff.cs`
3. `UpdateSystemNotice.cs`
4. `RevokeStaffInvitation.cs`

### Required Check

Confirm:

- creates return `Created<TResult>`
- updates return `Ok<TResult>`
- delete/action-only handlers return `Ok<ApiResponse>`

If any touched file violates this, fix it now.

Do **not** broaden this into refactoring unrelated auth endpoints in this pass
unless the user explicitly asks for repo-wide response-standard cleanup.

---

## Workstream G: Query/Offset Rename Consistency Check

### Goal

Ensure the offset pagination rename is complete enough to avoid future drift.

### Files

1. `apps/api/Src/Lib/OffsetPaginatedQuery.cs`
2. `apps/api/Src/Lib/OffsetPaginatedResult.cs`
3. `apps/api/Src/Lib/Validation/OffsetPaginatedQueryValidator.cs`
4. `apps/api/Src/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs`
5. any remaining app code references found by search

### Required Actions

1. Search for:

```powershell
rg -n "\bPaginatedQuery\b|\bPaginatedResult\b" apps packages docs
```

2. Ensure app code has no remaining runtime references to the old names.
3. If only docs/reviews/plans remain, update only active guide files.
4. Decide whether `OffsetPaginatedResult<T>` is intended to stay:
   - if it is a planned base type, leave it
   - if it is truly unused and unnecessary, ask the user before deleting it

Default assumption for this plan:

- keep `OffsetPaginatedResult<T>` unless the user explicitly asks for cleanup

---

## Detailed Step-by-Step Execution Order

Follow this exact order:

1. Read:
   - `AGENTS.md`
   - `docs/reviews/deep-review-round9-code-quality-improvements.md`
   - the files listed in Workstreams A-G
2. Implement Workstream A.
3. Implement Workstream B.
4. Implement Workstream C.
5. Implement Workstream D.
6. Implement Workstream E.
7. Perform Workstream F verification.
8. Perform Workstream G search and cleanup.
9. Run verification commands.
10. Re-read the round-9 review and confirm each finding is now resolved.
11. Write a completion report mapping each review finding to the code/test/doc
    change that resolved it.

---

## Required Verification Commands

Run all of these after implementation:

```powershell
make build-api
make tsc-front
dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~FindTenantsAsStaffSpec|FullyQualifiedName~FindTenantUsersAsStaff|FullyQualifiedName~CreateStaffInvitation|FullyQualifiedName~RevokeStaffInvitation|FullyQualifiedName~UpdateTenantAsStaff|FullyQualifiedName~UpdateSystemNotice"
rg -n "ToLower\(|ToLowerInvariant\(" apps/api -g "*.cs"
rg -n "\bPaginatedQuery\b|\bPaginatedResult\b" apps packages docs
```

Interpretation:

- `build-api` must pass
- `tsc-front` must pass
- targeted API tests must pass
- `ToLower*()` search results must be manually reviewed so only legitimate
  normalization remains
- old pagination names should not remain in active app code/guides

If API contract files change, also run:

```powershell
make generate-client
make tsc-front
```

Use this only if your code changes actually modify OpenAPI-visible contracts.

---

## Done Criteria

You are done only if all of the following are true:

1. No remaining actionable findings from
   `deep-review-round9-code-quality-improvements.md` are left unresolved.
2. The cursor-based user/tenant services no longer use `ToLowerInvariant()` for
   sort dispatch.
3. `UpdateSystemNotice` and `RevokeStaffInvitation` use string route IDs plus
   `Guid.TryParse`.
4. Parsing duplication called out in this plan has been removed or explicitly
   minimized through entity parsers/helpers.
5. `validator-conventions.md` no longer teaches the old `PaginatedQuery` name.
6. The required regression tests exist and pass.
7. `make build-api` passes.
8. `make tsc-front` passes.
9. The targeted API test filter passes.
10. Your final report maps each original review finding to a concrete fix.

---

## Final Report Format Required From the Executing Agent

When finished, report in this exact structure:

### Resolved Findings

For each review finding:

- `Finding:`
- `Resolution:`
- `Files changed:`
- `Verification:`

### Additional Cleanups Completed

- doc fixes
- parser consistency fixes
- test additions

### Remaining Items

- only include genuine blockers or user decisions

### Commands Run

- list exact verification commands run

---

## Important Guardrails

- Do not expand this into a repo-wide beautification pass.
- Do not rewrite unrelated modules just because you found older style issues.
- Do fix all issues directly connected to the review’s identified cleanup area.
- If you discover a new bug while implementing these exact fixes, include it in
  the final report, but do not derail the plan unless it blocks the work.

---

## Default Assumptions To Use Unless Blocked

Use these assumptions so you do not need to ask unnecessary questions:

1. Keep internal C# property/class names idiomatic (`PascalCase`).
2. Keep query parameter wire names in `snake_case`.
3. Keep JSON body/response naming unchanged unless contract changes are required.
4. Prefer entity parser methods over handler-local string parsing.
5. Prefer case-insensitive dictionaries/sets over lowered-string dispatch.
6. Keep `OffsetPaginatedResult<T>` unless the user explicitly asks to remove it.

If a decision is needed beyond these assumptions, ask the user directly.
