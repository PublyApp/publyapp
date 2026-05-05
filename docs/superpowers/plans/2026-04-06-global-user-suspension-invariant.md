# Global User Suspension Invariant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the invariant that a globally suspended user cannot retain active memberships, while keeping tenant-user suspension/reactivation semantics correct and consistent across auth, picker, and list flows.

**Architecture:** Treat `User.Status` / `User.IsSuspended` as the top-level identity gate and `UserAccount.IsSuspended` as membership-local state that must never remain active when the parent user is globally suspended. The implementation should make global suspension cascade to all non-deleted accounts, keep reactivation explicit rather than implicit, and align all read paths to the same invariant.

**Tech Stack:** .NET 10, EF Core, Minimal APIs, FluentValidation, RFC 7807 problem results, xUnit integration tests with Testcontainers/Postgres.

---

## File Map

**Primary backend files**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
  - Global user update flow, staff-user queries, tenant-user queries, and tenant membership suspend/reactivate service methods.
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
  - Staff-facing PATCH contract for global status changes.
- Modify: `apps/api/Src/Modules/Users/Entities/User.cs`
  - Add clarifying invariant comment if needed near status/suspension semantics.
- Modify: `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
  - Add clarifying invariant comment if needed near membership suspension semantics.
- Modify: `apps/api/Src/Modules/Users/Services/AccountService.cs`
  - Picker and membership/account lookups that should consistently exclude globally suspended users from active flows.
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`
  - Confirm tenant-auth response behavior remains consistent for globally suspended identities.
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.cs`
  - Confirm picker output semantics stay aligned with the service-level invariant.
- Modify: `apps/api/Src/Modules/Auth/Services/SessionService.cs`
  - Confirm session validation still treats global suspension as a hard auth failure.

**Primary tests**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs`
  - Add integration coverage for global suspension cascade.
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
  - Add integration coverage proving globally suspended users do not surface as active tenant memberships.
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.Spec.cs`
  - Add coverage that globally suspended users do not receive active tenant picker entries.
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs`
  - Add or adjust coverage if tenant-auth should reject or hide globally suspended users consistently.
- Modify: `apps/api/Src/Modules/Auth/Handlers/PassWordLogin.Spec.cs`
  - Keep existing suspension behavior covered; add only if missing for the new invariant.

**Supporting docs**
- Modify: `docs/misc/2026-04-06-tenant-user-suspension-review-summary.md`
  - Append a short follow-up note after implementation if this plan is executed.

---

### Task 1: Document the invariant in the domain and service layer

**Files:**
- Modify: `apps/api/Src/Modules/Users/Entities/User.cs`
- Modify: `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Services/AccountService.cs`

- [ ] **Step 1: Add domain comments that make the invariant explicit**

Add short comments near the suspension fields so future edits do not reintroduce split-brain logic.

```csharp
// Global identity suspension dominates membership activity:
// a suspended user must not retain active staff/tenant/project accounts.
public bool IsSuspended { get; set; } = false;
```

```csharp
// Membership-local suspension is valid only for users whose global identity
// is not suspended. Global user suspension must cascade to all memberships.
public bool IsSuspended { get; set; } = false;
```

- [ ] **Step 2: Add a short service-level comment where tenant-user list semantics are defined**

In `FindTenantUsersAsync`, add a short comment above the base query:

```csharp
// Tenant-user status is derived from membership suspension, but globally
// suspended identities are excluded entirely because they cannot have active
// memberships under the domain invariant.
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/Src/Modules/Users/Entities/User.cs apps/api/Src/Modules/Users/Entities/UserAccount.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Services/AccountService.cs
git commit -m "docs(api): document global user suspension invariant"
```

### Task 2: Make global user suspension cascade to all memberships

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs`

- [ ] **Step 1: Write the failing integration test for cascade-on-suspend**

Add a test that:
- creates a user with at least one tenant account
- globally suspends the user through the staff update endpoint
- verifies the user record is suspended
- verifies all non-deleted user accounts are now suspended too

```csharp
[Fact]
public async Task ItShouldSuspendAllUserAccountsWhenGloballySuspendingUser() {
	// arrange
	// create a user with tenant membership(s)

	// act
	// PATCH /staff/users/{userId} with { "status": "Suspended" }

	// assert
	// response 200
	// db: user.IsSuspended == true
	// db: every non-deleted account for that user has IsSuspended == true
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserSpec.ItShouldSuspendAllUserAccountsWhenGloballySuspendingUser"
```

Expected: FAIL because the global user update path does not currently cascade suspension to all `UserAccount` rows.

- [ ] **Step 3: Implement the minimal cascade in the global update flow**

In `UserService.UpdateStaffUserByIdAsync(...)`, detect a transition to suspended and atomically update all non-deleted accounts for that user:

```csharp
var parsedStatus =
	document.Status.IsPresent && document.Status.Value is not null
		? User.ParseStatus(document.Status.Value)
		: null;

var isTransitioningToSuspended = parsedStatus == UserStatus.Suspended;

// After the user row update succeeds:
if (isTransitioningToSuspended) {
	await _dbContext.UserAccount
		.Where(ua => ua.UserId == userId && !ua.IsDeleted && !ua.IsSuspended)
		.ExecuteUpdateAsync(setters => setters
			.SetProperty(ua => ua.IsSuspended, true)
			.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow),
			cancellationToken);
}
```

Keep reactivation explicit: do **not** automatically unsuspend memberships when the global user is reactivated.

- [ ] **Step 4: Add a second integration test proving reactivation does not blindly reactivate memberships**

```csharp
[Fact]
public async Task ItShouldNotReactivateAllUserAccountsWhenGloballyReactivatingUser() {
	// arrange
	// start with user + suspended memberships

	// act
	// PATCH /staff/users/{userId} with { "status": "Active" }

	// assert
	// user becomes globally active
	// previously suspended memberships remain suspended
}
```

- [ ] **Step 5: Run the focused update-staff-user test class**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserSpec"
```

Expected: PASS for the new cascade and non-blind-reactivation coverage.

- [ ] **Step 6: Commit**

```bash
git add apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs
git commit -m "feat(api): cascade global user suspension to memberships"
```

### Task 3: Align tenant-user read paths with the invariant

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`

- [ ] **Step 1: Write the failing integration test for globally suspended users in tenant list**

Add a test that creates:
- a tenant membership that is locally not suspended
- a parent user that is globally suspended

Then verify the tenant users list does not surface that row as an active membership.

```csharp
[Fact]
public async Task ItShouldExcludeGloballySuspendedUsersFromTenantUsersList() {
	// arrange
	// tenant membership active, parent user globally suspended

	// act
	// GET /staff/tenants/{tenantId}/users

	// assert
	// suspended identity is absent from the returned list
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec.ItShouldExcludeGloballySuspendedUsersFromTenantUsersList"
```

Expected: FAIL if the current query still exposes the inconsistent state.

- [ ] **Step 3: Make the tenant-user base query consistent**

Ensure `FindTenantUsersAsync(...)` keeps:

```csharp
where ua.TenantId == tenantId
	&& ua.Scope == AccountScope.Tenant
	&& !ua.IsDeleted
	&& !ua.User.IsDeleted
	&& !ua.User.IsSuspended
```

Retain membership-status filtering on `ua.IsSuspended` only for users whose parent identity is not globally suspended.

- [ ] **Step 4: Add integration coverage for mixed membership/global cases**

Add one more test that proves:
- locally suspended + globally active user is still visible in the list as `Suspended`
- globally suspended + locally unsuspended user is excluded from the list entirely

```csharp
[Fact]
public async Task ItShouldShowMembershipSuspensionOnlyForGloballyActiveUsers() {
	// assert one row visible as Suspended, one inconsistent row excluded
}
```

- [ ] **Step 5: Run the tenant-user list spec class**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec"
```

Expected: PASS, including the earlier tenant-membership suspension tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs
git commit -m "fix(api): enforce global suspension in tenant user queries"
```

### Task 4: Align tenant/account lookup helpers and picker flows

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/AccountService.cs`
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.cs`
- Test: `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.Spec.cs`

- [ ] **Step 1: Write the failing picker integration test**

Add a test showing that a globally suspended user should not receive active tenant picker entries even if their `UserAccount` row was left unsuspended by legacy data.

```csharp
[Fact]
public async Task ItShouldExcludeGloballySuspendedUsersFromTenantPickerResults() {
	// arrange inconsistent legacy data
	// act GET /auth/tenants-for-picker
	// assert returned tenant list excludes those memberships
}
```

- [ ] **Step 2: Run the focused picker test to verify it fails**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetUserTenantsForPickerSpec.ItShouldExcludeGloballySuspendedUsersFromTenantPickerResults"
```

Expected: FAIL if the picker query still uses account/tenant activity only.

- [ ] **Step 3: Align `AccountService` active-membership queries**

For active-membership style helpers such as:
- `GetUserStaffAccountAsync`
- `GetUserTenantAccountAsync`
- `IsUserStaffUserAsync`
- `IsUserMemberOfTenantAsync`
- `IsUserMemberOfActiveTenantAsync`
- `FindUserTenantAccountsAsync`
- `GetUserTenantsAsync`
- `GetUserTenantsForPickerAsync`

ensure the active-path queries also require:

```csharp
&& !ua.User.IsDeleted
&& !ua.User.IsSuspended
```

Keep existence-only mutual-exclusivity helpers unchanged where the existing comment explicitly says suspended accounts still count.

- [ ] **Step 4: Run the picker spec class**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetUserTenantsForPickerSpec"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Src/Modules/Users/Services/AccountService.cs apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.cs apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.Spec.cs
git commit -m "fix(api): exclude globally suspended users from active account lookups"
```

### Task 5: Verify auth/session behavior stays coherent

**Files:**
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs`
- Modify: `apps/api/Src/Modules/Auth/Handlers/PassWordLogin.Spec.cs`
- Inspect only unless required: `apps/api/Src/Modules/Auth/Services/SessionService.cs`
- Inspect only unless required: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`

- [ ] **Step 1: Audit existing auth coverage before adding code**

Read the current specs first. If they already prove that globally suspended users:
- cannot log in
- cannot obtain authenticated tenant auth data

then do not add redundant code changes.

- [ ] **Step 2: Add missing integration test only if coverage is absent**

If missing, add:

```csharp
[Fact]
public async Task ItShouldRejectTenantAuthForGloballySuspendedUser() {
	// arrange suspended user with legacy tenant membership
	// act GET /auth/tenant-auth-data
	// assert request is rejected consistently with current auth policy
}
```

- [ ] **Step 3: Run the focused auth specs**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~PassWordLoginSpec|FullyQualifiedName~GetTenantAuthDataSpec"
```

Expected: PASS without changing established 401/403 semantics incorrectly.

- [ ] **Step 4: Commit**

```bash
git add apps/api/Src/Modules/Auth/Handlers/PassWordLogin.Spec.cs apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs
git commit -m "test(api): cover auth behavior for globally suspended users"
```

### Task 6: Run the full focused regression pack

**Files:**
- No code changes required unless regressions appear

- [ ] **Step 1: Run the full focused backend regression pack**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec|FullyQualifiedName~GetUserTenantsForPickerSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~PassWordLoginSpec"
```

Expected: PASS.

- [ ] **Step 2: Run the API build**

Run:

```bash
dotnet build apps/api/MainApi.csproj -c Test
```

Expected: PASS.

- [ ] **Step 3: Append a short outcome note to the existing review summary**

Append a short paragraph to:

```text
docs/misc/2026-04-06-tenant-user-suspension-review-summary.md
```

describing that global suspension now cascades to memberships and that active account lookups exclude globally suspended identities.

- [ ] **Step 4: Commit**

```bash
git add docs/misc/2026-04-06-tenant-user-suspension-review-summary.md
git commit -m "docs(api): record global user suspension invariant follow-up"
```

---

## Self-Review

- Spec coverage: the plan covers the write path (`UpdateStaffUser`/`UserService`), tenant-user reads, account/picker reads, and auth/session validation.
- Placeholder scan: no `TODO`/`TBD` placeholders remain; each task names exact files and commands.
- Type consistency: the plan consistently treats global suspension as `User.IsSuspended` / `User.Status == Suspended` and membership suspension as `UserAccount.IsSuspended`.

