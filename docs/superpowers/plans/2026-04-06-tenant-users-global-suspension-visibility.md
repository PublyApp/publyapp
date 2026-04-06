# Tenant Users Global Suspension Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep globally suspended users visible in each tenant `Users` list where they still have a membership, while making the global suspension state visually dominant and all tenant-level controls non-actionable.

**Architecture:** Refine the tenant-user read model instead of changing auth/session invariants. The backend will stop excluding globally suspended identities from the tenant-users list, compute an effective three-state tenant-user status, and expose a new wire value for filtering; the frontend will render that status distinctly, disable tenant-level controls/actions for globally suspended rows, and update smoke coverage accordingly.

**Tech Stack:** .NET 10, EF Core, Minimal APIs, React 19, TanStack Query, Material React Table, MUI v6, generated TypeScript client, integration tests.

---

## File Map

**Backend**
- Modify: `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
  - widen tenant-user status helper semantics beyond the raw membership `IsSuspended` boolean
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
  - change tenant-user query/read-model semantics
  - change status filtering and status sorting precedence
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
  - accept/serialize the new effective tenant-user status contract
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
  - integration coverage for all effective status/filter scenarios
- Regenerate if needed: `apps/api/openapi/MainApi.json`

**Frontend**
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
  - status filter options, status chip rendering, disabled controls/tooltips, disabled row actions
- Modify if required by generated types: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
  - only if generated wire value changes require hook type alignment
- Regenerate: `packages/client-ts/**`

**Docs**
- Modify: `docs/misc/tenant-module-smoke-test-checklist.md`
  - add/adjust smoke assertions for the new visible globally suspended behavior

---

### Task 1: Introduce an Explicit Effective Tenant-User Status Model

**Files:**
- Modify: `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`

- [ ] **Step 1: Write the failing integration tests for the new effective status contract**

Add these cases in `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs` before changing implementation:

```csharp
[Fact]
public async Task ItShouldReturnGloballySuspendedStatusWhenUserIsGloballySuspendedAndMembershipIsActive() {
	var app = _fixture.CreateApp();
	await app.LoginAsStaff();

	await using var scope = _fixture.Services.CreateAsyncScope();
	var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

	var membership =
		await (
			from ua in dbContext.UserAccount
			where ua.TenantId == SeedConstants.Tenants.AcmeTenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.User.Email == SeedConstants.Tenants.AcmeUserEmail
			select ua
		).FirstAsync();

	membership.IsSuspended = false;

	var user =
		await (
			from u in dbContext.User
			where u.Email == SeedConstants.Tenants.AcmeUserEmail
			select u
		).FirstAsync();

	user.IsSuspended = true;
	user.Status = UserStatus.Suspended;

	await dbContext.SaveChangesAsync();

	var response = await app.Client.GetAsync(
		$"/staff/tenants/{SeedConstants.Tenants.AcmeTenantId}/users"
	);

	response.StatusCode.ShouldBe(HttpStatusCode.OK);
	var body = await response.Content.ReadFromJsonAsync<FindTenantUsersAsStaffResult>();
	body.ShouldNotBeNull();
	body.Data.ShouldContain(x =>
		x.Email == SeedConstants.Tenants.AcmeUserEmail
		&& x.Status == "GloballySuspended"
	);
}

[Fact]
public async Task ItShouldReturnOnlyGloballySuspendedUsersWhenStatusFilterIsGloballySuspended() {
	var app = _fixture.CreateApp();
	await app.LoginAsStaff();

	var response = await app.Client.GetAsync(
		$"/staff/tenants/{SeedConstants.Tenants.AcmeTenantId}/users?status=globally_suspended"
	);

	response.StatusCode.ShouldBe(HttpStatusCode.OK);
	var body = await response.Content.ReadFromJsonAsync<FindTenantUsersAsStaffResult>();
	body.ShouldNotBeNull();
	body.Data.ShouldAllBe(x => x.Status == "GloballySuspended");
}
```

Also add the remaining matrix cases from the spec:
- globally active + membership active => `Active`
- globally active + membership suspended => `Suspended`
- globally suspended + membership suspended => `GloballySuspended`
- `active` filter excludes globally suspended users
- `suspended` filter excludes globally suspended users

- [ ] **Step 2: Run the focused tenant-users integration spec and verify it fails**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec"
```

Expected:
- FAIL because the current implementation either omits globally suspended rows or still returns only `Active` / `Suspended`

- [ ] **Step 3: Add a dedicated effective-status abstraction in `UserAccount`**

Update `apps/api/Src/Modules/Users/Entities/UserAccount.cs` so tenant-user display/filter logic has an explicit three-state model instead of overloading the raw membership boolean:

```csharp
public enum AccountStatus {
	Active = 0,
	Suspended = 1,
	GloballySuspended = 2,
}

public static AccountStatus? ParseTenantUserStatus(string statusString) {
	var isGloballySuspended = string.Equals(
		statusString,
		"globally_suspended",
		StringComparison.OrdinalIgnoreCase
	) || string.Equals(
		statusString,
		nameof(AccountStatus.GloballySuspended),
		StringComparison.OrdinalIgnoreCase
	);
	if (isGloballySuspended) {
		return AccountStatus.GloballySuspended;
	}

	var isSuspended = string.Equals(
		statusString,
		nameof(AccountStatus.Suspended),
		StringComparison.OrdinalIgnoreCase
	);
	if (isSuspended) {
		return AccountStatus.Suspended;
	}

	var isActive = string.Equals(
		statusString,
		nameof(AccountStatus.Active),
		StringComparison.OrdinalIgnoreCase
	);
	if (isActive) {
		return AccountStatus.Active;
	}

	return null;
}

public static AccountStatus GetTenantUserStatus(
	bool isUserGloballySuspended,
	bool isMembershipSuspended
) {
	if (isUserGloballySuspended) {
		return AccountStatus.GloballySuspended;
	}

	if (isMembershipSuspended) {
		return AccountStatus.Suspended;
	}

	return AccountStatus.Active;
}

public static string GetTenantUserStatusDescription(AccountStatus status) {
	return status switch {
		AccountStatus.Active => nameof(AccountStatus.Active),
		AccountStatus.Suspended => nameof(AccountStatus.Suspended),
		AccountStatus.GloballySuspended => nameof(AccountStatus.GloballySuspended),
		_ => "Unknown",
	};
}
```

Keep the existing raw membership helper methods only if they are still needed elsewhere; otherwise replace callers in later tasks.

- [ ] **Step 4: Run the API build to catch type/signature fallout early**

Run:

```powershell
dotnet build apps/api/MainApi.csproj -c Test
```

Expected:
- Either PASS, or targeted compiler errors only in `FindTenantUsersAsStaff.cs` / `UserService.cs` because callers still use the old helper signatures

- [ ] **Step 5: Commit the status abstraction groundwork**

```bash
git add apps/api/Src/Modules/Users/Entities/UserAccount.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs
git commit -m "refactor(api): add explicit tenant user status model"
```

---

### Task 2: Update Tenant-User Query, Filtering, Sorting, and Handler Serialization

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`

- [ ] **Step 1: Make the focused tenant-users spec the red bar for query semantics**

Re-run the same spec before implementation so the failure is still real on the current branch state:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec"
```

Expected:
- FAIL on the new globally suspended visibility/status/filter expectations

- [ ] **Step 2: Update `FindTenantUsersAsync` to include globally suspended users and compute effective status**

In `apps/api/Src/Modules/Users/Services/UserService.cs`, change the base query so it still excludes deleted rows but no longer excludes globally suspended users from the tenant-users list:

```csharp
var query =
	from ua in _dbContext.UserAccount
	where ua.TenantId == tenantId
		&& ua.Scope == AccountScope.Tenant
		&& !ua.IsDeleted
		&& !ua.User.IsDeleted
	select ua;
```

Then update filter handling to reason about the effective tenant-user status instead of only `ua.IsSuspended`:

```csharp
if (args.Filters?.Status is { Count: > 0 } statuses) {
	var includeActive = statuses.Contains(AccountStatus.Active);
	var includeSuspended = statuses.Contains(AccountStatus.Suspended);
	var includeGloballySuspended = statuses.Contains(AccountStatus.GloballySuspended);

	query = query.Where(ua =>
		(includeGloballySuspended && ua.User.IsSuspended)
		|| (includeSuspended && !ua.User.IsSuspended && ua.IsSuspended)
		|| (includeActive && !ua.User.IsSuspended && !ua.IsSuspended)
	);
}
```

Also update status sorting rank to follow the approved precedence:

```csharp
static int GetTenantUserStatusRank(bool isUserGloballySuspended, bool isMembershipSuspended) {
	if (isUserGloballySuspended) {
		return 2;
	}

	if (isMembershipSuspended) {
		return 1;
	}

	return 0;
}
```

Use that same rank in the status sort field handler for:
- cursor value lookup
- cursor filter comparison
- ordering

- [ ] **Step 3: Update handler parsing/validation/serialization to use the new effective status**

In `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`:

1. change the query parser to use the new helper:

```csharp
public IReadOnlySet<AccountStatus>? GetStatusesOrNull() {
	...
	foreach (var part in parts) {
		AccountStatus? parsed = UserAccount.ParseTenantUserStatus(part);
		if (parsed is { } status) {
			statuses.Add(status);
		}
	}
	...
}
```

2. update validator allowed values:

```csharp
private static readonly HashSet<string> AllowedStatuses =
	new(
		[
			"active",
			"suspended",
			"globally_suspended",
		],
		StringComparer.OrdinalIgnoreCase
	);
```

3. serialize the effective status from both booleans:

```csharp
Status = UserAccount.GetTenantUserStatusDescription(
	UserAccount.GetTenantUserStatus(
		tu.User.IsSuspended,
		tu.Account.IsSuspended
	)
),
```

- [ ] **Step 4: Run the focused integration spec and make it green**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec"
```

Expected:
- PASS for all tenant-users matrix/filter cases

- [ ] **Step 5: Run the broader API regression pack that can be affected by this read-model change**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~GetUserTenantsForPickerSpec"
```

Expected:
- PASS
- no auth/picker regressions, since those invariants stay strict even though tenant-users list visibility changes

- [ ] **Step 6: Commit the backend read-model change**

```bash
git add apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs
git commit -m "feat(api): expose globally suspended tenant users in tenant lists"
```

---

### Task 3: Regenerate the Client and Update the Tenant Users Table UX

**Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
- Regenerate: `packages/client-ts/**`
- Test/verify: `make generate-client`, `make tsc-front`

- [ ] **Step 1: Regenerate the client immediately after the backend contract change**

Run:

```powershell
make build-api
make generate-client
```

Expected:
- OpenAPI/client regeneration succeeds
- generated tenant-users status wire values include the new `globally_suspended` contract if emitted in the schema/client

- [ ] **Step 2: Update the tenant users table filter and status rendering**

In `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`:

1. add the new filter option:

```tsx
const statusOptions = useMemo(() => {
	return [
		{ label: t('active'), value: USER_STATUS_ENUM.ACTIVE },
		{ label: t('suspended'), value: USER_STATUS_ENUM.SUSPENDED },
		{
			label: t('globally-suspended', {
				defaultValue: 'Globally suspended',
			}),
			value: 'globally_suspended',
		},
	];
}, [t]);
```

2. update `StatusCell` display precedence and chip color:

```tsx
const isGloballySuspended = status === 'GloballySuspended' || status === 'globally_suspended';

if (isGloballySuspended) {
	label = t('globally-suspended', {
		defaultValue: 'Globally suspended',
	});
	color = 'error';
}
```

3. disable the status control entirely for globally suspended rows and show the required tooltip:

```tsx
const globallySuspendedReason = t('globally-suspended-row-disabled', {
	defaultValue:
		'This user is globally suspended. Reactivate the user globally before managing tenant membership.',
});

if (isGloballySuspended) {
	return (
		<Tooltip title={globallySuspendedReason} placement="top" arrow>
			<Box component="span">
				<ButtonBase disabled sx={{ gap: 0.5, px: 0.5, py: 0.25, borderRadius: 1 }}>
					<Label variant="soft" color="error">
						{label}
					</Label>
					<Iconify icon="eva:arrow-ios-downward-fill" width={16} />
				</ButtonBase>
			</Box>
		</Tooltip>
	);
}
```

- [ ] **Step 3: Disable level changes and all row actions for globally suspended rows**

Still in `tenant-users-table.tsx`:

1. in `LevelCell`, detect globally suspended rows from `props.row.original.status` and render a disabled trigger with the same tooltip:

```tsx
const isGloballySuspended =
	props.row.original.status === 'GloballySuspended'
	|| props.row.original.status === 'globally_suspended';
```

2. in `UserActionsCell`, render every action button but disabled, not hidden:

```tsx
const isGloballySuspended =
	user.status === 'GloballySuspended' || user.status === 'globally_suspended';

<FollowUpAction user={user} disabled={isGloballySuspended} disabledReason={globallySuspendedReason} />
<UserDetailsDrawerAction user={user} disabled={isGloballySuspended} disabledReason={globallySuspendedReason} />
<RemoveUserAction user={user} disabled={isGloballySuspended} disabledReason={globallySuspendedReason} />
```

3. details drawer action must also be disabled because the approved design says all row actions are disabled for globally suspended rows.

Do not reintroduce hidden actions. Keep them visible but muted/disabled with the same explanation.

- [ ] **Step 4: Run frontend verification**

Run:

```powershell
pnpm exec biome check apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx
make tsc-front
```

Expected:
- Biome passes on the edited table file
- TypeScript passes after the client regeneration and UI update

- [ ] **Step 5: Run React-specific verification**

Run:

```powershell
cd apps/front
npx -y react-doctor@latest . --verbose --diff
```

Expected:
- no new issues introduced by this change
- if the existing known repo warning in `new-staff-profile-form.tsx` still appears, note it explicitly as pre-existing

- [ ] **Step 6: Commit the frontend/status UX change**

```bash
git add apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx packages/client-ts
git commit -m "feat(front): show globally suspended tenant users as read-only rows"
```

---

### Task 4: Update Smoke Coverage and Run Final End-to-End Verification

**Files:**
- Modify: `docs/misc/tenant-module-smoke-test-checklist.md`
- Verify: API tests + frontend checks

- [ ] **Step 1: Update the smoke checklist to match the new intended behavior**

In `docs/misc/tenant-module-smoke-test-checklist.md`, replace the earlier “globally suspended users are omitted” assumptions with explicit unchecked assertions like:

```md
- [ ] Globally suspended users remain visible in the tenant `Users` list.
- [ ] A globally suspended + membership-active user is shown as `Globally suspended`.
- [ ] A globally suspended + membership-suspended user is also shown as `Globally suspended`.
- [ ] The tenant-user status filter includes `Globally suspended`.
- [ ] Filtering by `globally_suspended` returns only globally suspended rows.
- [ ] Filtering by `active` excludes globally suspended rows.
- [ ] Filtering by `suspended` excludes globally suspended rows.
- [ ] The status control is disabled for globally suspended rows with a tooltip explaining that global reactivation is required.
- [ ] The level control is disabled for globally suspended rows with the same explanation.
- [ ] All row actions remain visible but disabled for globally suspended rows.
```

Leave them unchecked.

- [ ] **Step 2: Run the final focused regression pack**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~GetUserTenantsForPickerSpec|FullyQualifiedName~PasswordLoginSpec"
```

Expected:
- PASS

Then run:

```powershell
dotnet build apps/api/MainApi.csproj -c Test
make tsc-front
```

Expected:
- both PASS

- [ ] **Step 3: Commit docs/final verification**

```bash
git add docs/misc/tenant-module-smoke-test-checklist.md
git commit -m "docs: cover globally suspended tenant-user visibility"
```

---

## Self-Review

### Spec coverage
- Goal satisfied by Task 2 + Task 3: globally suspended rows become visible and dominant in the tenant-users read/UI model
- Backend design covered by Task 1 + Task 2
- Frontend design covered by Task 3
- Testing strategy covered by Task 1, Task 2, and Task 4
- Smoke checklist update covered by Task 4

### Placeholder scan
- No `TODO` / `TBD`
- every code-changing step includes concrete code to write
- every verification step includes exact commands and expected outcomes

### Type consistency
- plan consistently uses `AccountStatus`
- parse/description helper names stay consistent:
  - `ParseTenantUserStatus`
  - `GetTenantUserStatus`
  - `GetTenantUserStatusDescription`
- wire value uses `globally_suspended` in filters and generated client, while display text remains `Globally suspended`

---

Plan complete and saved to `docs/superpowers/plans/2026-04-06-tenant-users-global-suspension-visibility.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
