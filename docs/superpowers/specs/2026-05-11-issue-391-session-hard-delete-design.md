# Issue 391 Session Hard Delete Design

## Context

Issue #391 removes soft-delete state from `sessions`. The current `Session` entity
inherits `BaseAttributes`, which adds `is_deleted` and `deleted_at` columns and makes
normal EF deletes flow through the soft-delete path in `MainApiDbContext`.

That lifecycle is wrong for sessions because each row contains bearer credential
material. A revoked or expired session should be physically removed instead of
preserved as a soft-deleted row. This applies to normal sessions and impersonation
sessions. Impersonation history belongs in audit logs, not in retained session tokens.

## Goals

- Remove `is_deleted` and `deleted_at` from the `sessions` table.
- Keep `sessions` as active credential state only.
- Preserve the existing session columns that are still needed:
  - `id`
  - `created_at`
  - `updated_at`
  - `user_id`
  - `token`
  - `expires_at`
  - impersonation columns
- Preserve current authentication semantics:
  - missing, invalid, and expired sessions still return `401`.
  - expired presented sessions are hard-deleted.
  - frontend logout behavior does not change.
- Keep impersonation accountability in `audit_logs`.

## Non-Goals

- Do not add scheduled cleanup for expired sessions; issue #389 owns that.
- Do not change frontend logout semantics.
- Do not introduce historical impersonation reporting beyond the existing audit log.
- Do not change soft-delete behavior for normal business/domain entities.

## Design

`Session` should stop inheriting `BaseAttributes`. It should define the properties it
needs directly, including `Id`, `CreatedAt`, and `UpdatedAt`, while omitting
`IsDeleted` and `DeletedAt`.

`MainApiDbContext` should keep UUID v7 generation for `Session.Id`. The implementation
can do this with explicit `Session` model configuration rather than a new reusable base
class unless the code naturally benefits from one during implementation. The narrow
issue scope does not require a broader timestamped-entity abstraction.

Timestamp behavior should remain equivalent for active session rows:

- New sessions receive `created_at` and `updated_at`.
- Modified sessions refresh `updated_at`.
- Deleted sessions are physically deleted.

Because `Session` no longer participates in `BaseAttributesNoKey` tracking, it will not
be converted to a soft delete by `UpdateAuditFields`.

## Auth Query Changes

`SessionService.GetSessionByToken()` should stop filtering by `!s.IsDeleted` because
the property will no longer exist. The lookup remains token-based and still joins to
`User` so deleted, suspended, or unverified users are rejected at runtime.

The expired-presented-session path should continue using `ExecuteDeleteAsync()` with a
predicate on token and expiry. The delete predicate should not reference `IsDeleted`.

## Impersonation

Impersonation sessions use the same `sessions` table and should follow the same
lifecycle:

- while active, the impersonation columns describe the active credential state.
- when expired or revoked, the row is hard-deleted.
- historical accountability remains in `audit_logs`.

No separate impersonation history table is needed for this issue.

## Migration

Add an EF migration that drops:

- `sessions.is_deleted`
- `sessions.deleted_at`

The model snapshot should reflect that `Session` no longer has those properties, while
retaining all other session columns, indexes, and relationships.

## Testing

Verification should include:

- Auth tests that cover login/session use and expired presented session deletion.
- Impersonation-related tests, if present and runnable, to confirm session creation and
  validation still work.
- `just build-api` to verify EF model, migrations, OpenAPI generation, and API build.

If the API contract does not change, client generation is not required.
