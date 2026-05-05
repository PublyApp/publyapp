# Staff Profile Users Drawer Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `FindStaffUsers` to server-side `q` + cursor pagination, update all current consumers to the new contract, and refactor the staff profile users drawer to support fixed-header infinite search with optimistic assign/unassign.

**Architecture:** The backend keeps `/staff/users` as the canonical staff-user discovery endpoint but migrates it from offset pagination to the same cursor-paginated + search pattern already used by the stronger list endpoints. The frontend then updates every `useFindStaffUser` consumer to the new response/query shape and layers an infinite-query drawer flow on top, with optimistic cache updates for assign/unassign and per-row in-flight locking.

**Tech Stack:** .NET 10 minimal APIs, EF Core + PostgreSQL, React 19, TanStack Query, Material UI, Kiota-generated client, Material React Table.

---

## File Map

### Backend

- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs` if it already exists, otherwise add it
- Possibly modify: `apps/api/Src/Lib/CursorPaginatedResult.cs` only if the existing shared DTO cannot be reused directly

### Generated Contract

- Modify/generated: `packages/client-ts/src/models/index.ts`
- Modify/generated: `packages/client-ts/src/staff/users/index.ts`
- Modify/generated: any additional generated request builders touched by `just generate-client`

### Frontend shared hooks

- Modify: `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`

### Frontend consumers of `FindStaffUsers`

- Modify: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
- Modify: `apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx`
- Verify invalidation-only consumers still work:
  - `apps/front/src/routes/authed/staff/staff-users/new/components/new-staff-user-form.tsx`
  - `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx`

### Docs

- Modify if needed: `docs/misc/staff-user-profiles-permissions-smoke-test-checklist.md`

---

### Task 1: Convert `FindStaffUsers` to cursor pagination with `q`

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs`

- [ ] **Step 1: Write failing integration tests for `q`, cursor flow, and invalid sort**

Add/adjust tests in `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs` to cover:

```csharp
[Fact]
public async Task ItShouldFilterStaffUsersBySearchQuery() {
    // Arrange
    var first = await _fixture.CreateStaffUserAsync(email: "alpha.staff@example.com");
    var second = await _fixture.CreateStaffUserAsync(email: "beta.staff@example.com");

    // Act
    var response = await _client.GetAsync("/staff/users?limit=10&q=alpha");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);
    var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
    result!.Data.Should().ContainSingle(x => x.Email == "alpha.staff@example.com");
    result.Data.Should().NotContain(x => x.Email == "beta.staff@example.com");
}

[Fact]
public async Task ItShouldReturnNextCursorWhenMoreStaffUsersExist() {
    // Arrange: create enough staff users for two pages

    // Act
    var firstPage = await _client.GetAsync("/staff/users?limit=2&sort_id=created_at&sort_order=desc");
    var firstResult = await firstPage.Content.ReadFromJsonAsync<FindStaffUsersResponse>();

    var secondPage = await _client.GetAsync(
        $"/staff/users?limit=2&sort_id=created_at&sort_order=desc&cursor={firstResult!.NextCursor}"
    );

    // Assert
    firstResult.NextCursor.Should().NotBeNullOrWhiteSpace();
    secondPage.StatusCode.Should().Be(HttpStatusCode.OK);
}

[Fact]
public async Task ItShouldReturnBadRequestWhenSortIdIsInvalid() {
    var response = await _client.GetAsync("/staff/users?sort_id=not_real");
    response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
}
```

- [ ] **Step 2: Run the targeted test file and verify failure**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec"
```

Expected:

```text
FAIL - response shape/query behavior still matches offset-based implementation
```

- [ ] **Step 3: Change the handler request/response contract to cursor pagination**

Update `apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs` from `OffsetPaginatedQuery` to a cursor query object with `q`.

```csharp
public sealed class FindStaffUsersQuery : CursorPaginatedQuery {
	public string? Q { get; set; }
}

public sealed class FindStaffUsersQueryValidator
	: CursorPaginatedQueryValidator<FindStaffUsersQuery> {
	public FindStaffUsersQueryValidator() {
		RuleFor(x => x.Q)
			.MaximumLength(200);
	}
}

public sealed class FindStaffUsersResult {
	public required List<StaffUserItem> Data { get; set; }
	public string? NextCursor { get; set; }
}
```

Then route the handler through the new service args:

```csharp
var result = await userService.FindStaffUsersAsync(
	new FindStaffUsersArgs(
		Cursor: findStaffUsersQuery.GetCursorGuidOrDefault(),
		Limit: findStaffUsersQuery.GetLimit(),
		SortId: findStaffUsersQuery.GetSortId(),
		SortOrder: findStaffUsersQuery.GetSortOrder(),
		Filters: new FindStaffUsersFilters(findStaffUsersQuery.Q)
	),
	cancellationToken
);
```

- [ ] **Step 4: Implement cursor search logic in `UserService`**

Add args/result records and a cursor-paginated query path in `apps/api/Src/Modules/Users/Services/UserService.cs`, following the same `SortFieldHandler` style already used by cursor-paginated staff endpoints.

```csharp
public sealed record FindStaffUsersFilters(
	string? Search
);

public sealed record FindStaffUsersArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindStaffUsersFilters? Filters
);

public abstract record FindStaffUsersServiceResult {
	public sealed record Success(
		CursorPaginatedResult<StaffUserData> Data
	) : FindStaffUsersServiceResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindStaffUsersServiceResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindStaffUsersServiceResult;
}
```

The query body should include server-side search and cursor ordering:

```csharp
var baseQuery =
	from ua in _dbContext.UserAccount
	where ua.Scope == AccountScope.Staff
		&& !ua.IsDeleted
		&& !ua.User.IsDeleted
	select ua;

if (args.Filters?.Search is { } search) {
	var trimmed = search.Trim();
	var pattern = $"%{trimmed}%";
	baseQuery = baseQuery.Where(ua =>
		EF.Functions.ILike(ua.User.Email, pattern)
		|| (ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern))
		|| (ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern))
	);
}
```

Map handler output to:

```csharp
return TypedResults.Ok(new FindStaffUsersResult {
	Data = success.Data.Data.Select(x => new StaffUserItem {
		Id = x.User.GetRequiredId(),
		Email = x.User.Email,
		FirstName = x.User.FirstName,
		LastName = x.User.LastName,
		AvatarUrl = x.User.AvatarUrl,
		Status = User.GetStatusDescription(x.User.Status),
		Level = UserAccount.GetLevelDescription(x.AccountLevel),
	}).ToList(),
	NextCursor = success.Data.NextCursor,
});
```

- [ ] **Step 5: Re-run the targeted API tests**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec"
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit backend contract change**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Handlers/Staff/FindStaffUser.Spec.cs
git commit -m "feat(api): add cursor search to staff users endpoint"
```

### Task 2: Regenerate client and update shared staff-user hooks

**Files:**
- Modify/generated: `packages/client-ts/src/models/index.ts`
- Modify/generated: `packages/client-ts/src/staff/users/index.ts`
- Modify: `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`

- [ ] **Step 1: Regenerate the TypeScript client from the upgraded contract**

Run:

```bash
just build-api
just generate-client
```

Expected:

```text
Build succeeded
client generation completed
```

- [ ] **Step 2: Update `useFindStaffUser` to the new query/response shape**

In `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`, change the query params and add an infinite-query variant for the drawer.

```ts
type FindStaffUsersQuery = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
	q?: string;
};

export const useFindStaffUser = createStaffQuery({
	queryKeyFn: (client) => client.staff.users.get,
	fetcher: async (client, params: FindStaffUsersQuery) => {
		const result = await client.staff.users.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
				q: params.q,
			},
		});
		if (isNil(result)) {
			throw new Error('useFindStaffUser: result is nil');
		}
		return result;
	},
});
```

If the shared hook helper supports infinite queries already, add:

```ts
export const useInfiniteFindStaffUsers = createStaffInfiniteQuery({
	queryKeyFn: (client) => client.staff.users.get,
	fetcher: async (client, params: FindStaffUsersQuery) => {
		return await client.staff.users.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
				q: params.q,
			},
		});
	},
	getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
});
```

- [ ] **Step 3: Run frontend typecheck for the hook breakage**

Run:

```bash
just tsc-front
```

Expected:

```text
FAIL - staff user list and profile drawer still expect `staffUsers` / `count`
```

- [ ] **Step 4: Commit regenerated client + hook update**

```bash
git add packages/client-ts apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts
git commit -m "refactor(front): align staff user hooks with cursor pagination"
```

### Task 3: Upgrade the main staff-users table to the new canonical contract

**Files:**
- Modify: `apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx`
- Verify invalidations in:
  - `apps/front/src/routes/authed/staff/staff-users/new/components/new-staff-user-form.tsx`
  - `apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx`

- [ ] **Step 1: Replace offset table state usage with cursor list-page state**

Update the table page to stop relying on `page`/`rowCount` and use the repo’s cursor list-page pattern already used in stronger tables.

Key changes:

```ts
const { filterStates, setFilterStates, debouncedQ } = useCursorListState({
	defaultSorting,
	defaultLimit: DEFAULT_PAGE_SIZE,
});

const { data, isPending } = useFindStaffUser({
	variables: {
		cursor: filterStates.cursor || undefined,
		limit: filterStates.limit,
		sort: {
			id: filterStates.sortId,
			order: filterStates.sortOrder,
		},
		q: filterStates.q || undefined,
	},
});
```

And map rows from:

```ts
const dataTable = useMemo(() => {
	return _.map(data?.data, StaffUserRowDataMapper);
}, [data]);
```

- [ ] **Step 2: Add server-side search input handling to the staff users list if missing**

If the current staff users table does not yet expose `q`, add the same debounced search state pattern used elsewhere in the repo instead of keeping this endpoint underpowered.

```ts
useEffect(() => {
	setFilterStates({ q: debouncedQ, cursor: '' });
}, [debouncedQ, setFilterStates]);
```

- [ ] **Step 3: Update pagination mechanics to next-cursor instead of row count**

Wire the table or page container so advancing pages reads from `nextCursor` rather than `count`.

```ts
const nextCursor = data?.nextCursor ?? null;
// use this to enable/disable next navigation in the page state wrapper
```

- [ ] **Step 4: Re-run frontend typecheck**

Run:

```bash
just tsc-front
```

Expected:

```text
PASS or remaining failures isolated to the profile users drawer
```

- [ ] **Step 5: Commit the list upgrade**

```bash
git add apps/front/src/routes/authed/staff/staff-users/list/parts/staff-users-table.tsx apps/front/src/routes/authed/staff/staff-users/new/components/new-staff-user-form.tsx apps/front/src/routes/authed/staff/staff-users/details/components/staff-user-update-form.tsx
git commit -m "refactor(front): migrate staff users list to cursor search"
```

### Task 4: Refactor the profile users drawer for fixed header + infinite server search

**Files:**
- Modify: `apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx`
- Possibly create only if needed for file size: `apps/front/src/routes/authed/staff/profiles/details/users/components/profile-user-assignment-drawer.tsx`

- [ ] **Step 1: Write the failing UI shape change in the component**

Split the drawer layout into fixed header + scrollable list region. Keep this in the same file unless the file becomes unreasonable.

```tsx
<Drawer ...>
	<Box sx={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
		<Box sx={{ p: 3, borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}>
			{/* title + helper text + search */}
		</Box>

		<Scrollbar sx={{ minHeight: 0 }}>
			<Box sx={{ p: 2 }}>
				{/* infinite list */}
			</Box>
		</Scrollbar>
	</Box>
</Drawer>
```

- [ ] **Step 2: Replace client-side filtering with server-driven infinite search**

Remove the `filteredUsers` `useMemo` branch that filters locally, and instead use the infinite query hook:

```ts
const [search, setSearch] = useState('');
const deferredSearch = useDeferredValue(search);

const usersQuery = useInfiniteFindStaffUsers({
	variables: {
		limit: 20,
		sort: { id: 'created_at', order: 'desc' },
		q: deferredSearch || undefined,
	},
	enabled: !!profileId,
});

const drawerUsers = useMemo(() => {
	return usersQuery.data?.pages.flatMap((page) => page.data ?? []) ?? [];
}, [usersQuery.data]);
```

- [ ] **Step 3: Add infinite-scroll fetch-next trigger**

Use a sentinel element at the bottom of the scroll area.

```tsx
const sentinelRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
	if (!sentinelRef.current || !usersQuery.hasNextPage || usersQuery.isFetchingNextPage) {
		return;
	}

	const observer = new IntersectionObserver((entries) => {
		if (entries[0]?.isIntersecting) {
			void usersQuery.fetchNextPage();
		}
	});

	observer.observe(sentinelRef.current);
	return () => observer.disconnect();
}, [usersQuery.fetchNextPage, usersQuery.hasNextPage, usersQuery.isFetchingNextPage]);
```

- [ ] **Step 4: Replace text buttons with subtle icon actions**

Swap row action buttons:

```tsx
<Tooltip title={alreadyAssigned ? t('unassign') : t('assign')}>
	<span>
		<IconButton
			size="small"
			color={alreadyAssigned ? 'warning' : 'primary'}
			disabled={!userId || isRowPending}
			onClick={() => onToggleAssignment(user)}
		>
			<Iconify icon={alreadyAssigned ? 'solar:minus-circle-bold' : 'solar:add-circle-bold'} />
		</IconButton>
	</span>
</Tooltip>
```

- [ ] **Step 5: Run typecheck to surface only optimistic-state gaps**

Run:

```bash
just tsc-front
```

Expected:

```text
FAIL - if optimistic helper/cache typing still needs to be finished
```

- [ ] **Step 6: Commit the drawer search/layout refactor**

```bash
git add apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx
git commit -m "feat(front): add infinite server search to profile user drawer"
```

### Task 5: Add optimistic assign/unassign with race-safe cache updates

**Files:**
- Modify: `apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx`
- Modify if needed: `apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts`

- [ ] **Step 1: Centralize assign/unassign profile-set mutation logic**

Move the read-modify-write flow into small helper functions inside the page component so row rendering stays dumb.

```ts
const buildNextProfileIds = (currentIds: string[], profileId: string, shouldAssign: boolean) => {
	if (shouldAssign) {
		return Array.from(new Set([...currentIds, profileId]));
	}
	return currentIds.filter((id) => id !== profileId);
};
```

- [ ] **Step 2: Add optimistic mutation state with per-user in-flight guards**

Track row-local pending IDs:

```ts
const [pendingUserIds, setPendingUserIds] = useState<Set<string>>(new Set());

const markPending = (userId: string, isPending: boolean) => {
	setPendingUserIds((prev) => {
		const next = new Set(prev);
		if (isPending) next.add(userId);
		else next.delete(userId);
		return next;
	});
};
```

- [ ] **Step 3: Add TanStack Query optimistic updates**

For each toggle:

```ts
await queryClient.cancelQueries({ queryKey: useFindStaffProfileUsers.getKey({ profileId, ...apiVariables }) });
await queryClient.cancelQueries({ queryKey: useGetStaffUserProfiles.getKey({ userId }) });

const previousProfileUsers = queryClient.getQueryData(...);
const previousUserProfiles = queryClient.getQueryData(...);

queryClient.setQueryData(...optimisticallyAddOrRemoveUserFromProfileUsersList...);
queryClient.setQueryData(...optimisticallyAddOrRemoveProfileFromUserProfilesSummary...);
```

On failure:

```ts
queryClient.setQueryData(profileUsersKey, previousProfileUsers);
queryClient.setQueryData(userProfilesKey, previousUserProfiles);
```

On settle:

```ts
queryClient.invalidateQueries({ queryKey: useFindStaffProfileUsers.getKey({ profileId, ...apiVariables }) });
queryClient.invalidateQueries({ queryKey: useGetStaffUserProfiles.getKey({ userId }) });
queryClient.invalidateQueries({ queryKey: useFindStaffUser.getKey() });
```

- [ ] **Step 4: Re-run typecheck and targeted smoke verification**

Run:

```bash
just tsc-front
```

Expected:

```text
PASS
```

Then manually verify:

```text
- assign a user from the drawer
- unassign the same user from the drawer
- assign/unassign two different rows quickly
- confirm header stays fixed while the list scrolls
```

- [ ] **Step 5: Commit optimistic assignment flow**

```bash
git add apps/front/src/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx apps/front/src/lib/react-query/features/staff/staff-user.hooks.ts
git commit -m "feat(front): add optimistic profile user assignment drawer actions"
```

### Task 6: Update smoke coverage and run final verification

**Files:**
- Modify if needed: `docs/misc/staff-user-profiles-permissions-smoke-test-checklist.md`

- [ ] **Step 1: Add smoke-test bullets for the new drawer behavior**

Add bullets covering:

```md
- [ ] In the profile users drawer, typing in search triggers server-side user search.
- [ ] Scrolling the drawer list loads additional staff users from the server.
- [ ] The drawer header stays fixed while the results list scrolls.
- [ ] Clicking assign immediately reflects the user as assigned in the drawer and in the profile users list.
- [ ] Clicking unassign immediately removes the profile assignment in the drawer and in the profile users list.
- [ ] Rapid assign/unassign across multiple rows does not leave stale row state.
```

- [ ] **Step 2: Run final verification commands**

Run:

```bash
just build-api
just generate-client
just tsc-front
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec"
```

Expected:

```text
all commands pass
```

- [ ] **Step 3: Commit docs + final verification state**

```bash
git add docs/misc/staff-user-profiles-permissions-smoke-test-checklist.md
git commit -m "docs: cover staff profile drawer search and assignment smoke tests"
```

---

## Self-Review

- Spec coverage checked:
  - backend `q` + cursor pagination: Task 1
  - no backward compatibility path: Tasks 2 and 3 update all consumers
  - fixed header + scrollable list: Task 4
  - subtle icon actions: Task 4
  - immediate unassign: Tasks 4 and 5
  - optimistic updates + race handling: Task 5
  - smoke verification: Task 6
- Placeholder scan checked: no `TODO`/`TBD` implementation holes intentionally left in the plan
- Type consistency checked: the plan consistently uses `data` + `nextCursor` for `FindStaffUsers`

