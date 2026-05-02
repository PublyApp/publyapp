# Status Model Unification Design

Date: 2026-04-06

## Goal

Remove redundant boolean lifecycle flags from core entities and make status modeling consistent across:

- `User`
- `Tenant`
- `UserAccount`
- `Invitation`
- `Project`

The target model is enum-first, with each entity owning exactly one persisted lifecycle field.

## Approved Design

### User

`User` keeps a single persisted `Status` enum and drops `IsSuspended`.

Target `UserStatus` values:

- `Pending`
- `Active`
- `Suspended`

`Inactive` and `Banned` are removed because they are not modeled as materially
different lifecycle states. New unverified users use `Pending`, and global
blocking uses `Suspended`.

Rules:

- Global identity suspension is represented only by `User.Status == Suspended`.
- Any logic currently reading or writing `User.IsSuspended` must move to `User.Status`.
- Global suspension continues to dominate membership activity, but that dominance is derived from `User.Status`, not stored twice.

### Tenant

`Tenant` keeps a single persisted `Status` enum and drops `IsSuspended`.

Target `TenantStatus` values remain:

- `Pending`
- `Active`
- `Suspended`

Rules:

- Tenant suspension is represented only by `Tenant.Status == Suspended`.
- Any logic currently reading or writing `Tenant.IsSuspended` must move to `Tenant.Status`.
- Helper methods such as `Suspend()`, `Reactivate()`, and `IsTenantActive(...)` should continue to exist if useful, but must derive entirely from `Status`.

### UserAccount

`UserAccount` replaces `IsSuspended` with a persisted `Status` enum.

Target `AccountStatus` values:

- `Active`
- `Suspended`

Rules:

- `UserAccount.Status` represents membership-local state only.
- `GloballySuspended` is not persisted on `UserAccount`.
- If a globally suspended user must be shown differently in tenant user management, that is an effective read-model status derived from:
  - `User.Status`
  - `UserAccount.Status`

This avoids duplicating one global fact across multiple membership rows.

### Invitation

`Invitation` moves to the same enum-first model and stops splitting lifecycle facts across booleans plus derived status helpers.

Current persisted fields:

- `IsAccepted`
- `AcceptedAt`
- `IsRevoked`
- `RevokedAt`
- `ExpiresAt`

Current enum concept:

- `Pending`
- `Accepted`
- `Expired`
- `Revoked`

Target design:

- keep one persisted `Status` enum
- keep timestamps like `AcceptedAt` and `RevokedAt` as event metadata
- remove `IsAccepted`
- remove `IsRevoked`

Target `InvitationStatus` values remain:

- `Pending`
- `Accepted`
- `Expired`
- `Revoked`

Rules:

- `Pending`, `Accepted`, and `Revoked` are persisted states
- `Expired` may remain derived from `Status == Pending && ExpiresAt <= now` if that keeps the model simpler, or it may be persisted if the migration/runtime needs that stability
- choose one approach and apply it consistently everywhere; do not keep the current hybrid of booleans plus enum reconstruction

Recommended option:

- persist `Pending`, `Accepted`, and `Revoked`
- treat `Expired` as a derived read-model status based on `ExpiresAt`

Why:

- `Expired` is time-based and can become true without a write
- persisting it creates background-sync pressure for no strong benefit
- `AcceptedAt` and `RevokedAt` remain useful audit metadata even when booleans are removed

### Project

`Project` should move from a boolean activity flag to an enum lifecycle field so it follows the same modeling rule as the other entities.

Current persisted field:

- `IsActive`

Target design:

- replace `IsActive` with `Status`

Target `ProjectStatus` values:

- `Active`
- `Inactive`

Rules:

- `Project` does not need a richer lifecycle enum unless a real product requirement appears
- the point of the refactor is consistency: persisted lifecycle should be represented by an enum, not a boolean
- if project suspension/archive semantics are later introduced, they should extend `ProjectStatus`, not reintroduce more booleans

## Effective Read-Model Status

Some UI and query paths still need an effective tenant-user status with precedence.

That effective status remains a derived concept:

- if `User.Status == Suspended` => `GloballySuspended`
- else if `UserAccount.Status == Suspended` => `Suspended`
- else => `Active`

This effective value may continue to be used for:

- tenant user list display
- tenant user filtering
- tenant user sorting
- action enablement / disablement

But it must not be persisted as a third `UserAccount` state.

## Why This Design

### Redundancy removed

Today the model duplicates suspension in booleans and enums:

- `User.Status` + `User.IsSuspended`
- `Tenant.Status` + `Tenant.IsSuspended`
- `UserAccount.IsSuspended` while neighboring entities use enums

That duplication creates drift risk and forces unnecessary synchronization logic.

### Better domain boundaries

Each entity owns one persisted lifecycle field:

- `User.Status` => global identity lifecycle
- `Tenant.Status` => tenant lifecycle
- `UserAccount.Status` => membership lifecycle
- `Invitation.Status` => invitation lifecycle
- `Project.Status` => project lifecycle

This is clearer than storing the same fact in both a lifecycle enum and a boolean flag.

### Derived precedence stays possible

The system still needs the concept of a globally suspended membership row in some read paths, but that should stay derived, not duplicated in storage.

## Non-Goals

- No introduction of new membership states such as `Pending`, `Removed`, or `Revoked`
- No redefinition of invitation lifecycle; invitations remain separate from user accounts
- No attempt to preserve `Banned` unless a later product decision creates a real distinct behavior for it
- No attempt to persist `GloballySuspended` on `UserAccount`

## Migration Implications

The implementation will need to handle:

- schema migration from `is_suspended` booleans to enum-backed status fields
- schema migration from invitation acceptance/revocation booleans to enum-backed status fields
- schema migration from `projects.is_active` to enum-backed status
- data migration rules:
  - `User.IsSuspended == true` => `User.Status = Suspended`
  - `Tenant.IsSuspended == true` => `Tenant.Status = Suspended`
  - `UserAccount.IsSuspended == true` => `UserAccount.Status = Suspended`
  - `Invitation.IsRevoked == true` => `Invitation.Status = Revoked`
  - `Invitation.IsAccepted == true` => `Invitation.Status = Accepted`
  - otherwise `Invitation.Status = Pending`
  - `Project.IsActive == true` => `Project.Status = Active`
  - `Project.IsActive == false` => `Project.Status = Inactive`
- cleanup of old helper methods and parser/description helpers
- updates to filters, sorting, auth checks, picker queries, and UI logic

## Compatibility Rules

After implementation:

- no production code should read or write `User.IsSuspended`
- no production code should read or write `Tenant.IsSuspended`
- no production code should read or write `UserAccount.IsSuspended`
- no production code should reference `UserStatus.Banned`
- no production code should read or write `Invitation.IsAccepted`
- no production code should read or write `Invitation.IsRevoked`
- no production code should read or write `Project.IsActive`

All such logic should be expressed through enum status values and explicit derived helpers.

## Testing Expectations

The implementation plan must cover:

- integration tests for user global suspension/reactivation
- integration tests for tenant suspension/reactivation
- integration tests for tenant-user list effective status semantics
- regression coverage for filtering and sorting by effective status
- regression coverage for auth and picker behavior when `User.Status == Suspended`
- integration tests for invitation list/filter/status semantics after the boolean removal
- integration tests for invitation acceptance/revocation flows with enum-backed persisted status
- integration tests for project activity lookups after `Project.IsActive` removal

## Open Decisions Resolved

- `UserAccount` will not persist `GloballySuspended`
- `UserStatus.Banned` will be removed
- the system will standardize on enum-based lifecycle state across all five entities
- `Invitation` will stop persisting `IsAccepted` / `IsRevoked`
- `Project` will stop persisting `IsActive`
