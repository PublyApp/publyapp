# Review: Staff MVP Week 1 — Phase 3 (Database Integration)

Date: 2025-11-02
Author: Droid (Factory AI)

## Scope

Reviewed only the staged changes related to Phase 3 (excluding auto-generated EF Core migration files).

Files reviewed:
- `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- `apps/api/Src/Features/Common/Session/Session.cs`

## Summary of Changes Observed

- Registered new DbSets in `MainApiDbContext`:
  - `Invitation`, `AuditLog`, `SystemNotice`.
- Added database CHECK constraints for unified `Invitation` scope semantics (Staff/Tenant/Project), matching the plan.
- Configured explicit relationships for `Session`:
  - `Session.User` → `User` with `UserId` FK and user-side `Sessions` collection.
  - `Session.ImpersonatingStaffUser` → `User` with FK `ImpersonatingStaffUserId` and `DeleteBehavior.Restrict`.
- In `Session.cs`, added `[ForeignKey(nameof(ImpersonatingStaffUserId))]` on the `ImpersonatingStaffUser` navigation.

Overall, the implementation aligns with Phase 3 of the plan and integrates the new backoffice entities at the DbContext level.

## Concerns and Suggestions

1) Redundant FK configuration for `Session.ImpersonatingStaffUser`
- Both data annotation `[ForeignKey(nameof(ImpersonatingStaffUserId))]` and fluent configuration `.HasForeignKey(s => s.ImpersonatingStaffUserId)` are present.
- This is harmless but redundant; consider keeping a single source of truth (prefer Fluent API for consistency in the project).

2) Delete behavior for `ImpersonatingStaffUser`
- `OnDelete(DeleteBehavior.Restrict)` prevents hard-deleting a staff user while sessions reference it.
- Given the project defaults to soft deletes, this is acceptable. If `ForceHardDelete` is used on `User`, consider `DeleteBehavior.SetNull` to allow cleanup without FK violations while preserving historical session rows.

3) `Session.UserId` nullability
- `UserId` is currently nullable (`Guid?`). If all sessions must belong to a user (no anonymous sessions), consider making it non-nullable and enforcing it at the DB level in a later phase.

4) Naming consistency note (non-blocking)
- Code uses table name `sessions`, while some docs mention `session`. Ensure future docs/code stay consistent; no code change required.

## Verification Against Plan

- Invitation scope constraints match the plan’s CKs.
- New DbSets are present and wired up.
- Session relationships explicitly configured, including the impersonation link.

## Action Items (Non-blocking)

- Decide whether to keep only Fluent API for the `ImpersonatingStaffUser` FK mapping.
- Revisit `DeleteBehavior.Restrict` vs `SetNull` based on desired behavior for hard deletes.
- Confirm business rule for `Session.UserId` nullability and adjust in a subsequent migration if needed.

No blockers identified for Phase 3. Changes look consistent with the implementation plan.
