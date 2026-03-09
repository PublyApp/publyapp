# Deep Review: Round 10 - Verification Of Round 9 Fixes

## Executive Summary

Most of the claimed Round 9 cleanup was implemented correctly. The previously
flagged user and tenant cursor services no longer use `ToLowerInvariant()` for
sort dispatch, the two route-ID handlers now use `string` + `Guid.TryParse`,
the snake_case pagination binding is intact, and the touched build/type-check
and targeted API tests all pass.

The branch is still not fully finished from a repo-consistency perspective.
The biggest remaining gap is that the same `ToLower*()`-for-dispatch pattern
still exists in adjacent cursor services that were part of the same cleanup
theme, especially `AuditLogQueryService` and `SystemNoticeService`. Those are
not immediate regressions in the touched tenant/user slices, but they are still
violations of the now-documented repository rule.

## Observations & Issues

### Critical Issues

None.

### Major Issues

1. The `ToLower*()` dispatch cleanup is still inconsistent repo-wide.
   - `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs:138-142`
   - `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs:143-147`
   - Both services still normalize `sortId` with `ToLowerInvariant()` before a
     default case-sensitive dictionary lookup.
   - This is functionally workable, but it still violates the repo rule:
     "Never use `ToLower()` / `ToLowerInvariant()` as a comparison or dispatch
     strategy."
   - Recommended fix: match the newer service pattern used in
     `UserService`, `TenantAsStaffService`, `ProfileAsStaffService`, and
     `InvitationService` by keeping `effectiveSortId` unchanged and creating the
     handler dictionary with `StringComparer.OrdinalIgnoreCase`.

2. `CreateTenantAsStaff` still treats the impossible "staff endpoint without
   staff account" state as a normal `400` instead of using the repo's guard
   clause pattern.
   - `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs:192-195`
   - Current behavior:
     `return TypedProblems.BadRequest("Unauthorized", ResponseKeys.Unauthorized);`
   - This is inconsistent with the newer standard applied elsewhere in the same
     session: staff-only endpoints should throw on missing `AccountStaff`
     because `.WithPermission()` should already have guaranteed the auth shape.
   - Recommended fix: replace this with the same explicit
     `InvalidOperationException` guard used in `CreateStaffInvitation`,
     `RevokeStaffInvitation`, and `UpdateSystemNotice`.

### Minor Issues

1. `CreateSystemNoticeBodyValidator` still carries an unused
   `ValidSeverities` array after moving validation to `SystemNotice.ParseSeverity`.
   - `apps/api/Src/Modules/SystemNotices/Handlers/Staff/CreateSystemNotice.cs:46-47`
   - This is harmless but stale.

2. `UpdateSystemNoticeBodyValidator` has the same stale `ValidSeverities` array.
   - `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs:58-59`

3. `validator-conventions.md` is now aligned with `OffsetPaginatedQuery`, but it
   still teaches lowercase token examples using property labels like `UserId`
   and `StartDate` in validation messages. Not wrong, just slightly behind the
   broader wire-format naming cleanup.

## Verification Notes

Verified directly in code:

- `apps/api/Src/Modules/Users/Services/UserService.cs`
  - `FindTenantUsersAsync()` now uses a dictionary with
    `StringComparer.OrdinalIgnoreCase`
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
  - `FindTenantsAsStaffAsync()` now uses the same pattern
- `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
  - `FindStaffProfilesAsync()` also uses the same pattern
- `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
  - sort dispatch is fixed and status parsing now uses
    `StringComparison.OrdinalIgnoreCase`
- `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
  - route ID binding fixed to `string` + `Guid.TryParse`
  - body getter caching applied
- `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs`
  - route ID binding fixed to `string` + `Guid.TryParse`
  - impossible-state guard clause applied
- `docs/guides/validator-conventions.md`
  - `PaginatedQuery` references updated to `OffsetPaginatedQuery`

## Comparer Question

### Why use `StringComparer.OrdinalIgnoreCase` in one service but not the others?

There is no good architectural reason for that inconsistency.

These are two different implementation styles for the same goal:

1. **Preferred style**
   - keep `sortId` unchanged
   - create the dictionary with `StringComparer.OrdinalIgnoreCase`
   - call `TryGetValue(sortId, out ...)`

2. **Older style**
   - lowercase `sortId` first with `ToLowerInvariant()`
   - use a default case-sensitive dictionary
   - call `TryGetValue(loweredSortId, out ...)`

The first style is better in this repo because:

- it follows the documented rule against `ToLower*()` for dispatch
- it avoids allocating a normalized string just to do lookup
- it preserves the original input value for error/reporting paths
- it is easier to standardize across services

So for the exact files you asked about:

- `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs:183-185`
  - correct, preferred pattern
- `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs:138-142`
  - older pattern, should be migrated
- `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs:143-147`
  - older pattern, should be migrated

## Final Assessment

Not quite finished.

The tenant/user cleanup itself is now in much better shape and the claimed
round-9 fixes mostly hold up under verification. The remaining work is smaller
and mostly consistency-driven, but it should still be completed:

- migrate `AuditLogQueryService` and `SystemNoticeService` off
  `ToLowerInvariant()` sort dispatch
- align `CreateTenantAsStaff` with the repo's guard-clause pattern
- remove the stale `ValidSeverities` arrays from the system-notice validators

After that, this cleanup round would be in a much cleaner "done" state.
