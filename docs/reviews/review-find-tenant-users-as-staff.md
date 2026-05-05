# FindTenantUsersAsStaff - Full Review

## Scope
- Reviewed staged changes for:
`apps/api/Program.cs`
`apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`
`apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
`apps/api/Src/Modules/Users/Services/UserService.cs`
`apps/api/openapi/MainApi.json`
`apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
`apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
`packages/js-client/src/*` (generated)
- Cross-checked against `AGENTS.md` + referenced guides.
- Validation commands run:
```powershell
dotnet build apps/api/MainApi.csproj -c Test
cd apps/front; pnpm -s tsc --noEmit
```
Both passed.

## Findings

### [CORRECTNESS] Nullable Keyset Pagination Is Incorrect for `firstname` / `lastname`
- **Severity**: Bug
- **File**: `apps/api/Src/Modules/Users/Services/UserService.cs`
- **Line(s)**: `~329-420`
- **Description**: The keyset filters for nullable string sorts use `CompareTo(name)` with `string?` cursor values. With `DESC` and `NULL` cursor values, rows can be skipped or pagination can terminate early. This breaks keyset correctness guarantees.
- **Suggestion**: Immediate safe fix is to remove nullable sort fields from this endpoint until null-safe keyset logic is implemented and tested.
- **Example**:
```csharp
// Safe short-term allow-list (non-nullable/comparable fields only)
var sortFieldHandlers = new Dictionary<string, SortFieldHandler> {
	["id"] = BuildIdHandler(tenantId),
	["email"] = BuildEmailHandler(tenantId),
	["status"] = BuildStatusHandler(tenantId),
	["level"] = BuildLevelHandler(tenantId),
	["createdat"] = BuildCreatedAtHandler(tenantId),
};
```

### [FRONTEND QUALITY] Links Point to a Non-Registered Route
- **Severity**: Bug
- **File**: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
- **Line(s)**: `~198`, `~358`
- **Description**: Links were switched to `FRONT_PATH_NAMES.staff.tenantUsers.details(userId)`, but there is no route registration for that path in the staff route tree. Clicking detail links will navigate to a non-existent page.
- **Suggestion**: Either add a matching route/page or revert links to an existing route until the page exists.
- **Example (safe now)**:
```tsx
const userDetailsLink = FRONT_PATH_NAMES.staff.staffUsers.details(userId);

<MenuItem
	component={RouterLink}
	href={FRONT_PATH_NAMES.staff.staffUsers.details(userId)}
	onClick={() => menuActions.onClose()}
>
```

### [ROBUSTNESS] Cursor Error (`400`) Has No Recovery UX
- **Severity**: Bug
- **File**: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
- **Line(s)**: `~117-132`, `~173-183`
- **Description**: Backend returns `400` for stale/deleted cursor (`CursorNotFound`). The table has no explicit error state or reset path, so users can get stuck.
- **Suggestion**: Use `QueryDisplay` for error state and offer reset-to-first-page + retry.
- **Example**:
```tsx
import QueryDisplay from '@/front/components/query-display';
import Alert from '@mui/material/Alert';

const { resetCursorPagination } = useTableState({ paginationMode: 'cursor', ... });

<QueryDisplay
	query={tenantUsersQuery}
	ErrorSlot={() => (
		<Alert
			severity="error"
			action={
				<Button
					onClick={() => {
						resetCursorPagination?.();
						tenantUsersQuery.refetch();
					}}
				>
					Reset pagination
				</Button>
			}
		>
			Unable to load this page. The cursor may be stale.
		</Alert>
	)}
>
	{() => <MaterialReactTable table={table} />}
</QueryDisplay>
```

### [CODE QUALITY & CONTRACT] Malformed `tenantId` Uses NotFound Semantics in a BadRequest
- **Severity**: Improvement
- **File**: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- **Line(s)**: `~52-55`
- **Description**: For malformed GUID, status is `400` (correct), but detail/key are `"Tenant not found"` + `ResponseKeys.NotFound` (semantically mismatched).
- **Suggestion**: Keep malformed route id semantics strictly BadRequest.
- **Example**:
```csharp
if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
	return TypedProblems.BadRequest(
		"Invalid tenantId",
		ResponseKeys.BadRequest
	);
}
```

### [ARCHITECTURE COMPLIANCE] Service Method Should Use Args Record
- **Severity**: Improvement
- **File**: `apps/api/Src/Modules/Users/Services/UserService.cs`
- **Line(s)**: `~69-76`, `~235-243`
- **Description**: `FindTenantUsersAsync` takes 5+ domain parameters directly. Repo rule recommends `{Action}{Domain}Args` for service methods with 3+ domain parameters.
- **Suggestion**: Introduce `FindTenantUsersArgs` and pass one argument object from handler.
- **Example**:
```csharp
public record FindTenantUsersArgs(
	Guid TenantId,
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder
);

Task<FindTenantUsersResult> FindTenantUsersAsync(
	FindTenantUsersArgs args,
	CancellationToken cancellationToken = default
);
```

```csharp
var serviceResult = await userService.FindTenantUsersAsync(
	new FindTenantUsersArgs(
		TenantId: tenantIdGuid,
		Cursor: cursorGuid,
		Limit: limit,
		SortId: sortId,
		SortOrder: sortOrder
	),
	cancellationToken
);
```

### [PERFORMANCE] Query Tracks Full Entities and Materializes More Than Needed
- **Severity**: Improvement
- **File**: `apps/api/Src/Modules/Users/Services/UserService.cs`
- **Line(s)**: `~583-623`
- **Description**: The list query does not use `AsNoTracking()` and projects to `StaffUserData` with full `User` entity references. For read-only pagination endpoints this increases memory/tracking overhead.
- **Suggestion**: Add `AsNoTracking()` and project directly to a lean read model.
- **Example**:
```csharp
var results = await orderedQuery
	.AsNoTracking()
	.Select(ua => new TenantUserListRow {
		UserId = ua.UserId,
		Email = ua.User.Email,
		FirstName = ua.User.FirstName,
		LastName = ua.User.LastName,
		AvatarUrl = ua.User.AvatarUrl,
		Status = ua.User.Status,
		AccountLevel = ua.Level
	})
	.Take(effectiveLimit + 1)
	.ToListAsync(cancellationToken);
```

### [PERFORMANCE] Sort Handler Dictionary Recreated per Request + Missing CancellationTokens in Cursor Lookups
- **Severity**: Improvement
- **File**: `apps/api/Src/Modules/Users/Services/UserService.cs`
- **Line(s)**: `~250`, `~261`, `~292`, `~341`, `~393`, `~445`, `~491`, `~535`
- **Description**: A large dictionary/lambda graph is rebuilt each call; cursor lookup queries omit `cancellationToken`.
- **Suggestion**: Keep handler selection lightweight and pass cancellation token into all async EF calls.
- **Example**:
```csharp
// Always pass cancellation token:
var item = await (
	from x in _dbContext.UserAccount
	where x.UserId == guid
		&& x.TenantId == tenantId
		&& x.Scope == AccountScope.Tenant
	select new { x.User.Email, x.UserId }
).FirstOrDefaultAsync(cancellationToken);
```

### [SECURITY] Tenant Access Policy Is Implicit, Not Explicit
- **Severity**: Improvement
- **File**: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`
- **Line(s)**: `~21`
- **Description**: Endpoint permission is correct (`LIST_FOR_TENANT`), but code does not explicitly state whether staff with this permission may access all tenants or only assigned tenants.
- **Suggestion**: Make policy explicit in code. If tenant-restricted, add tenant-scope authorization check before querying.
- **Example**:
```csharp
var canAccessTenant = await tenantAccessService.CanStaffAccessTenantAsync(
	staffUserId: account.UserId,
	tenantId: tenantIdGuid,
	cancellationToken: cancellationToken
);

if (!canAccessTenant) {
	return TypedProblems.Forbidden(
		"You cannot access this tenant.",
		ResponseKeys.Forbidden
	);
}
```

### [TESTING] Missing Integration Spec for New Endpoint
- **Severity**: Improvement
- **File**: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
- **Line(s)**: `N/A (missing)`
- **Description**: No integration test coverage was added for this feature.
- **Suggestion**: Add a spec file covering happy path + pagination + auth + error contract.
- **Example**:
```csharp
public sealed class FindTenantUsersAsStaffSpec : IClassFixture<ApiFixture> {
	[Fact]
	public async Task ItShouldReturnOkWithDefaultCursorPagination() { }

	[Fact]
	public async Task ItShouldReturnNextCursorWhenMoreResultsExist() { }

	[Fact]
	public async Task ItShouldReturnBadRequestWhenTenantIdIsMalformed() { }

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorIsMalformed() { }

	[Fact]
	public async Task ItShouldReturnBadRequestWhenCursorRecordNoLongerExists() { }

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() { }

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() { }
}
```

### [ANYTHING ELSE] Unrelated `.mcp.json` Change in Same Feature Set
- **Severity**: Nit
- **File**: `.mcp.json`
- **Line(s)**: `N/A`
- **Description**: Unrelated config changes make feature review and revert/cherry-pick harder.
- **Suggestion**: Keep `.mcp.json` in a separate commit unless required for feature behavior.
- **Example**:
```powershell
# keep feature PR focused
git restore --staged .mcp.json
```

## Additional Notes
- Route shape `/staff/tenants/{tenantId}/users` is consistent with route design guide.
- Endpoint registration and permission wiring are correct.
- OpenAPI + Kiota regeneration appears consistent with endpoint contract.
- Frontend hook (`createStaffQuery`) usage is structurally correct.

## Summary
- **Overall assessment**: **Needs Work**
- Main blockers are correctness/UX issues around cursor behavior and route navigation.

## Critical Bugs Before Merge
1. Fix nullable keyset sorting behavior for `firstname`/`lastname` or remove these sorts for now.
2. Fix broken tenant-user details links (route mismatch).
3. Add visible recovery flow for stale cursor (`400`) on tenant users table.

## Top 5 Improvements (by impact)
1. Add integration tests for this endpoint (cursor + auth + error contract).
2. Normalize malformed `tenantId` response semantics (`BadRequest` detail/key).
3. Refactor service signature to args record (`FindTenantUsersArgs`).
4. Optimize read query (`AsNoTracking` + lean projection).
5. Add explicit tenant access policy enforcement (or explicit comment + test if global access is intended).

## Compliance Score Against AGENTS/GUIDES
- **Backend**: 13/16 followed in changed code.
  - Misses: args-record convention, malformed route-id error semantics, nullable keyset correctness.
- **Frontend**: 8/10 followed in changed code.
  - Misses: query-state display/recovery, route alignment for details navigation.
