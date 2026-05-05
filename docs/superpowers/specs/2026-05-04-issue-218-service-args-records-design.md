# Issue 218 Service Args Records Design

## Context

Issue #218 asks for service methods with 3 or more domain parameters to use the
`{Action}{Domain}Args` record pattern from `docs/guides/csharp-coding-standards.md`.
The issue description is partially stale: `UserService.FindTenantUsersAsync` already
uses `FindTenantUsersAsStaffArgs`, with `tenantId` kept separate as a route identifier.

The remaining need is an internal API cleanup. No route contract, database schema, or
generated TypeScript client should change.

## Scope

Refactor the remaining service methods that still expose 3 or more loose domain
parameters:

- `InvitationService` creation, staff find, accept, and bulk-create methods.
- `SystemNoticeService.FindAsync`.
- `ProfileAsStaffService.CreateStaffProfileAsync`.
- `ImpersonationService.CreateImpersonationSessionAsync`.
- `AuditLogService.LogAsync`.

Methods with 1 or 2 domain parameters stay as-is. Entity IDs remain separate only when
they are the route identity of the operation, such as `UpdateAsync(Guid id, args)`.
The audit-log method is included even though it has broad call-site churn.

## Design

Each args record lives in the same service file as the service method it feeds. Records
use PascalCase properties and preserve the existing domain values without changing
behavior. Handlers construct args records inline at the point where they already have
validated body, query, route, and auth data.

For query/list methods, args records group cursor, limit, sort, and filter values:

- `FindStaffInvitationsArgs`
- `FindSystemNoticesArgs`

For commands, args records group the domain input while preserving existing service
results:

- `CreateStaffInvitationArgs`
- `CreateTenantInvitationArgs`
- `AcceptStaffInvitationArgs`
- `AcceptTenantInvitationArgs`
- `BulkCreateStaffInvitationsArgs`
- `CreateStaffProfileArgs`
- `CreateImpersonationSessionArgs`
- `CreateAuditLogArgs`

## Data Flow

Handlers continue to validate HTTP input and authorize requests. They then construct
service args records and call the service. Services unpack args into locals where this
keeps existing query and mutation code readable.

`AuditLogService.LogAsync` call sites change from positional arguments to named args
object construction. This is intentionally noisier but removes the highest-risk
positional signature in the current service layer.

## Testing

Add an architecture spec that checks the targeted service signatures use the expected
args records. Run that spec red before implementation. After implementation, run the
same spec, focused affected handler specs when practical, and `just build-api`.

Because this is an internal refactor, no frontend typecheck or client generation is
required unless the build shows an OpenAPI contract drift.
