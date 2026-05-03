# Cursor Sort Field Handler Design

Date: 2026-05-02

Issue: https://github.com/radandevist/publyapp/issues/221

## Goal

Remove duplicated cursor-pagination sort handler classes by introducing one shared
generic helper named `CursorSortFieldHandler<TEntity>`.

## Approved Design

Create a new shared helper in `apps/api/Src/Lib/`:

```csharp
namespace MainApi.Src.Lib;

public sealed class CursorSortFieldHandler<TEntity>(
	Func<Guid, Task<object?>> getCursorValue,
	Func<IQueryable<TEntity>, object?, bool, IQueryable<TEntity>> applyFilter,
	Func<IQueryable<TEntity>, bool, IQueryable<TEntity>> applyOrdering
) {
	public Func<Guid, Task<object?>> GetCursorValue { get; } = getCursorValue;

	public Func<IQueryable<TEntity>, object?, bool, IQueryable<TEntity>>
		ApplyFilter { get; } = applyFilter;

	public Func<IQueryable<TEntity>, bool, IQueryable<TEntity>>
		ApplyOrdering { get; } = applyOrdering;
}
```

The helper stays deliberately small. It only captures the three operations all
current cursor-pagination sort handlers already share:

- fetch the cursor sort value by cursor entity ID
- apply the keyset filter for the selected sort field
- apply ordering for the selected sort field

Each service keeps its existing sort-field dictionary and EF expressions local.
The refactor should not try to infer keyset filters or ordering from expression
trees.

## Affected Code

Replace these local helper classes with `CursorSortFieldHandler<TEntity>`:

- `apps/api/Src/Modules/Users/Services/UserService.cs`
  - `CursorSortFieldHandler<UserAccount>`
- `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
  - `CursorSortFieldHandler<Invitation>`
- `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
  - `CursorSortFieldHandler<Profile>`
- `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
  - `CursorSortFieldHandler<AuditLog>`
- `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`
  - `CursorSortFieldHandler<SystemNotice>`
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
  - `CursorSortFieldHandler<Tenant>`

Update `docs/guides/cursor-keyset-pagination-guide.md` so future examples use
the shared helper instead of documenting a private nested `SortFieldHandler`.

## Behavior

This is a no-behavior-change refactor.

The following must stay the same:

- supported `sort_id` values
- default sort IDs and sort directions
- cursor-not-found behavior
- invalid-sort behavior
- keyset tie-breaker logic
- returned data shape
- `nextCursor` behavior

## Non-Goals

- No API contract change
- No generated TypeScript client change
- No database migration
- No route or handler changes unless needed for compilation
- No attempt to introduce a broader cursor pagination framework
- No attempt to remove `object?` cursor values in this pass
- No attempt to move sort handler dictionaries to static members in this pass

## Documentation Rules

Do not add XML comments to the generic helper. The API project currently avoids
XML comments on public generic OpenAPI-facing types because of the documented
.NET 10 OpenAPI generic-type issue. This helper is not an API contract type, but
keeping it comment-free avoids repeating that risk pattern.

The cursor pagination guide should describe:

- the shared `CursorSortFieldHandler<TEntity>` type
- where it lives
- that services remain responsible for field-specific EF expressions
- that tie-breaker direction must continue to match primary sort direction

## Testing Expectations

The implementation plan should verify compilation and representative cursor
pagination behavior:

- `just build-api`
- targeted specs for affected list endpoints where practical:
  - `FindStaffUser.Spec.cs`
  - `FindTenantUsersAsStaff.Spec.cs`
  - `FindInvitationsForTenantAsStaff.Spec.cs`
  - `FindAuditLogs.Spec.cs`
  - `FindSystemNotices.Spec.cs`
  - `FindTenantsAsStaff.Spec.cs`

If Docker is unavailable for integration specs, `just build-api` is the minimum
required verification, and the skipped integration verification must be called
out clearly.

## Implementation Notes

The tenant service currently has `TenantSortFieldHandler.ApplyOrdering` typed as
`IOrderedQueryable<Tenant>`. The shared helper should use
`IQueryable<TEntity>` as the return type for consistency with the other five
handlers. Existing tenant ordering lambdas can still return ordered queries
because `IOrderedQueryable<Tenant>` is assignable to `IQueryable<Tenant>`.

The implementation should use explicit generic type names in dictionaries, for
example:

```csharp
var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<UserAccount>>(
	StringComparer.OrdinalIgnoreCase
) {
	["created_at"] = new CursorSortFieldHandler<UserAccount>(
		getCursorValue: async guid => {
			// existing cursor lookup logic stays here
		},
		applyFilter: (q, cursorValue, asc) => {
			// existing keyset filter logic stays here
		},
		applyOrdering: (q, asc) => {
			// existing ordering logic stays here
		}
	)
};
```

Use the existing dictionary comparers exactly as they are today unless a local
file already needs adjustment for compilation. This refactor should not change
sort ID case-sensitivity semantics.

Keep sort handler dictionaries inside their current service methods. Although
the current dictionaries and handler instances are allocated per method call,
the `getCursorValue` delegates capture scoped or request-specific values such as
`_dbContext`, `cancellationToken`, `tenantId`, and `args.TenantId`. Moving these
maps to static members would require a separate handler signature redesign that
passes request state explicitly. That is outside this refactor.

## Open Decisions Resolved

- The shared helper will be named `CursorSortFieldHandler<TEntity>`.
- The current six duplicate/near-duplicate helper classes are in scope.
- The cursor pagination guide is in scope.
- Per-method handler dictionaries stay per-method for now.
- Broader keyset pagination abstraction is out of scope.
