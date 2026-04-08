# Status Model Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant lifecycle booleans from `User`, `Tenant`, `UserAccount`, `Invitation`, and `Project`, and standardize the domain on enum-only persisted lifecycle state.

**Architecture:** Persist exactly one lifecycle field per entity: `User.Status`, `Tenant.Status`, `UserAccount.Status`, `Invitation.Status`, and `Project.Status`. Keep effective UI/query concepts such as `GloballySuspended` and time-based `Expired` derived at read time instead of duplicating the same fact in booleans and enums. Migrate schema, domain logic, invitation flows, project activity flows, API filtering/sorting, and tenant-user UI in small verified steps.

**Tech Stack:** .NET 10, EF Core, PostgreSQL, FluentValidation, React 19, TanStack Query, MUI, generated TypeScript client

---

## File Map

**Primary backend files**
- Modify: `apps/api/Src/Modules/Users/Entities/User.cs`
- Modify: `apps/api/Src/Modules/Tenants/Entities/Tenant.cs`
- Modify: `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
- Modify: `apps/api/Src/Modules/Invitations/Entities/Invitation.cs`
- Modify: `apps/api/Src/Modules/Projects/Entities/Project.cs`
- Modify: `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- Create: `apps/api/Migrations/<timestamp>_UnifyStatusModel.cs`
- Modify: `apps/api/Migrations/MainApiDbContextModelSnapshot.cs`

**Primary backend logic files**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Services/AccountService.cs`
- Modify: `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- Modify: `apps/api/Src/Modules/Projects/Services/ProjectService.cs`
- Modify: `apps/api/Src/Modules/Users/Validation/UserValidationRules.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/ReactivateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.cs`
- Modify: `apps/api/Src/Modules/Projects/Handlers/**`

**Primary frontend files**
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
- Regenerate: `packages/client-ts/**`

**Integration test files**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.Spec.cs`
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.Spec.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.Spec.cs`
- Modify: `apps/api/Src/Modules/Projects/**/*.Spec.cs`

**Docs**
- Modify: `docs/misc/tenant-module-smoke-test-checklist.md`

---

### Task 1: Replace Entity Booleans With Enum-Only Domain State

**Files:**
- Modify: `apps/api/Src/Modules/Users/Entities/User.cs`
- Modify: `apps/api/Src/Modules/Tenants/Entities/Tenant.cs`
- Modify: `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
- Modify: `apps/api/Src/Modules/Invitations/Entities/Invitation.cs`
- Modify: `apps/api/Src/Modules/Projects/Entities/Project.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
- Test: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`

- [ ] **Step 1: Write the failing integration tests that lock the target status vocabulary**

Add or update assertions so the API layer only accepts and returns enum-based lifecycle state:

```csharp
[Fact]
public async Task ItShouldNotExposeUserStatusBannedAnywhereInTenantUserResponses() {
}

[Fact]
public async Task ItShouldRepresentInvitationLifecycleThroughStatusInsteadOfSeparateBooleans() {
}

[Fact]
public async Task ItShouldRepresentProjectActivityThroughStatusInsteadOfIsActive() {
}
```

- [ ] **Step 2: Run the focused spec slices to verify failure on the old model**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~FindInvitationsForTenantAsStaffSpec|FullyQualifiedName~Project"
```

Expected: at least one failure or compile failure once the new expectations are added.

- [ ] **Step 3: Remove the redundant booleans and introduce enum-only state**

Update the entities to this shape:

```csharp
// apps/api/Src/Modules/Users/Entities/User.cs
[Column("status")]
public UserStatus Status { get; set; } = UserStatus.Inactive;

public enum UserStatus {
	Inactive = 10,
	Pending = 20,
	Suspended = 30,
	Active = 40,
}
```

```csharp
// apps/api/Src/Modules/Tenants/Entities/Tenant.cs
[Column("status")]
public TenantStatus Status { get; set; } = TenantStatus.Pending;

public enum TenantStatus {
	Pending = 10,
	Active = 20,
	Suspended = 30,
}
```

```csharp
// apps/api/Src/Modules/Users/Entities/UserAccount.cs
[Column("status")]
public AccountStatus Status { get; set; } = AccountStatus.Active;

public enum AccountStatus {
	Active = 0,
	Suspended = 1,
	GloballySuspended = 2,
}
```

```csharp
// apps/api/Src/Modules/Invitations/Entities/Invitation.cs
[Column("status")]
public InvitationStatus Status { get; set; } = InvitationStatus.Pending;

[Column("accepted_at")]
public DateTime? AcceptedAt { get; set; }

[Column("revoked_at")]
public DateTime? RevokedAt { get; set; }

public enum InvitationStatus {
	Pending,
	Accepted,
	Expired,
	Revoked
}
```

```csharp
// apps/api/Src/Modules/Projects/Entities/Project.cs
[Column("status")]
public ProjectStatus Status { get; set; } = ProjectStatus.Active;

public enum ProjectStatus {
	Inactive = 10,
	Active = 20,
}
```

Notes:
- `GloballySuspended` should remain derived, not independently written to `UserAccount` rows.
- `Expired` may remain a derived read-model status based on `Status == Pending && ExpiresAt <= now`.

- [ ] **Step 4: Run API build to catch all compile-time references to removed fields**

Run:

```powershell
dotnet build apps/api/MainApi.csproj -c Test
```

Expected: FAIL with references to removed `IsSuspended`, `IsAccepted`, `IsRevoked`, `IsActive`, and removed `UserStatus.Banned`.

- [ ] **Step 5: Commit the entity model transition**

```bash
git add apps/api/Src/Modules/Users/Entities/User.cs apps/api/Src/Modules/Tenants/Entities/Tenant.cs apps/api/Src/Modules/Users/Entities/UserAccount.cs apps/api/Src/Modules/Invitations/Entities/Invitation.cs apps/api/Src/Modules/Projects/Entities/Project.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs
git commit -m "refactor(api): replace lifecycle booleans with enum status fields"
```

### Task 2: Add EF Migration and Data Backfill

**Files:**
- Modify: `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- Create: `apps/api/Migrations/<timestamp>_UnifyStatusModel.cs`
- Modify: `apps/api/Migrations/MainApiDbContextModelSnapshot.cs`

- [ ] **Step 1: Write the migration generation target in the DbContext model**

Update column mappings and enum conversions in `MainApiDbContext.cs` so EF sees:

```csharp
builder.Entity<User>().Property(x => x.Status).HasConversion<string>();
builder.Entity<Tenant>().Property(x => x.Status).HasConversion<string>();
builder.Entity<UserAccount>().Property(x => x.Status).HasConversion<string>();
builder.Entity<Invitation>().Property(x => x.Status).HasConversion<string>();
builder.Entity<Project>().Property(x => x.Status).HasConversion<string>();
```

- [ ] **Step 2: Create the migration**

Run:

```powershell
make db-add NAME=UnifyStatusModel
```

Expected: a new migration file plus snapshot changes.

- [ ] **Step 3: Edit the migration so the data backfill is explicit and correct**

The migration should:

```csharp
migrationBuilder.Sql("""
UPDATE users
SET status = 'Suspended'
WHERE is_suspended = TRUE;
""");

migrationBuilder.Sql("""
UPDATE tenants
SET status = 'Suspended'
WHERE is_suspended = TRUE;
""");

migrationBuilder.AddColumn<string>(
	name: "status",
	table: "user_accounts",
	type: "text",
	nullable: false,
	defaultValue: "Active");

migrationBuilder.Sql("""
UPDATE user_accounts
SET status = CASE
	WHEN is_suspended = TRUE THEN 'Suspended'
	ELSE 'Active'
END;
""");

migrationBuilder.AddColumn<string>(
	name: "status",
	table: "invitations",
	type: "text",
	nullable: false,
	defaultValue: "Pending");

migrationBuilder.Sql("""
UPDATE invitations
SET status = CASE
	WHEN is_revoked = TRUE THEN 'Revoked'
	WHEN is_accepted = TRUE THEN 'Accepted'
	ELSE 'Pending'
END;
""");

migrationBuilder.AddColumn<string>(
	name: "status",
	table: "projects",
	type: "text",
	nullable: false,
	defaultValue: "Active");

migrationBuilder.Sql("""
UPDATE projects
SET status = CASE
	WHEN is_active = TRUE THEN 'Active'
	ELSE 'Inactive'
END;
""");

migrationBuilder.DropColumn(name: "is_suspended", table: "user_accounts");
migrationBuilder.DropColumn(name: "is_suspended", table: "users");
migrationBuilder.DropColumn(name: "is_suspended", table: "tenants");
migrationBuilder.DropColumn(name: "is_accepted", table: "invitations");
migrationBuilder.DropColumn(name: "is_revoked", table: "invitations");
migrationBuilder.DropColumn(name: "is_active", table: "projects");
```

- [ ] **Step 4: Build the API to validate the migration compiles**

Run:

```powershell
dotnet build apps/api/MainApi.csproj -c Test
```

Expected: PASS

- [ ] **Step 5: Commit the schema transition**

```bash
git add apps/api/Src/Data/DbContext/MainApiDbContext.cs apps/api/Migrations
git commit -m "feat(api): migrate status model to enum-only persistence"
```

### Task 3: Rewrite Backend Domain Logic To Use Enum Status Only

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Users/Services/AccountService.cs`
- Modify: `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- Modify: `apps/api/Src/Modules/Projects/Services/ProjectService.cs`
- Modify: `apps/api/Src/Modules/Users/Validation/UserValidationRules.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.cs`
- Modify: `apps/api/Src/Modules/Projects/Handlers/**`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs`
- Test: `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.Spec.cs`
- Test: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.Spec.cs`
- Test: `apps/api/Src/Modules/Projects/**/*.Spec.cs`

- [ ] **Step 1: Write the failing integration tests for global user suspension, invitation status semantics, and project activity**

Add focused specs that prove:

```csharp
[Fact]
public async Task ItShouldBlockLoginWhenUserStatusIsSuspended() {
}

[Fact]
public async Task ItShouldAllowLoginAgainWhenUserStatusReturnsToActive() {
}

[Fact]
public async Task ItShouldPersistAcceptedInvitationStatusWhenInvitationIsAccepted() {
}

[Fact]
public async Task ItShouldPersistRevokedInvitationStatusWhenInvitationIsRevoked() {
}

[Fact]
public async Task ItShouldTreatInactiveProjectsAsUnavailableThroughProjectStatus() {
}
```

- [ ] **Step 2: Run the focused specs to verify failure**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~PasswordLoginSpec|FullyQualifiedName~AcceptInvitationSpec|FullyQualifiedName~RevokeInvitationSpec|FullyQualifiedName~Project"
```

Expected: FAIL if the old boolean-based logic is still referenced.

- [ ] **Step 3: Replace boolean checks and assignments with enum-based logic**

Examples of the target shape:

```csharp
var isGloballySuspended = user.Status == UserStatus.Suspended;
var isTenantSuspended = tenant.Status == TenantStatus.Suspended;
var isProjectActive = project.Status == ProjectStatus.Active;
```

```csharp
if (invitation.Status != InvitationStatus.Pending) {
	return new RevokeInvitationResult.InvalidStatus();
}

invitation.Status = InvitationStatus.Revoked;
invitation.RevokedAt = _clock.UtcNow;
```

Remove all production references to:
- `user.IsSuspended`
- `tenant.IsSuspended`
- `userAccount.IsSuspended`
- `invitation.IsAccepted`
- `invitation.IsRevoked`
- `project.IsActive`
- `UserStatus.Banned`

- [ ] **Step 4: Run backend build to discover any remaining stragglers**

Run:

```powershell
dotnet build apps/api/MainApi.csproj -c Test
```

Expected: PASS

- [ ] **Step 5: Commit the domain-logic conversion**

```bash
git add apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Services/AccountService.cs apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs apps/api/Src/Modules/Invitations/Services/InvitationService.cs apps/api/Src/Modules/Projects/Services/ProjectService.cs apps/api/Src/Modules/Users/Validation/UserValidationRules.cs apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.cs apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.cs apps/api/Src/Modules/Projects/Handlers apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.Spec.cs apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.Spec.cs apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.Spec.cs apps/api/Src/Modules/Projects
git commit -m "refactor(api): drive lifecycle behavior from enum status only"
```

### Task 4: Rebuild Tenant-User Effective Status Querying, Filtering, and Sorting

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`

- [ ] **Step 1: Write the failing tenant-user list regression tests**

Add integration coverage for the final behavior:

```csharp
[Fact]
public async Task ItShouldReturnGloballySuspendedTenantUsersInTheDefaultList() {
}

[Fact]
public async Task ItShouldFilterByGloballySuspendedStatus() {
}

[Fact]
public async Task ItShouldSortByEffectiveStatusWithoutServerError() {
}
```

- [ ] **Step 2: Run the focused spec slice to verify failure**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec"
```

Expected: FAIL

- [ ] **Step 3: Rework the query to derive effective status from enum fields**

Use a translatable shape inside EF queries:

```csharp
var query =
	from ua in _dbContext.UserAccounts
	where ua.TenantId == args.TenantId
	where ua.Scope == AccountScope.Tenant
	where !ua.IsDeleted
	where !ua.User.IsDeleted
	select new {
		User = ua.User,
		Account = ua,
		EffectiveStatusRank =
			ua.User.Status == UserStatus.Suspended ? 2 :
			ua.Status == AccountStatus.Suspended ? 1 :
			0
	};
```

- [ ] **Step 4: Run the focused spec slice and API build**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec"
dotnet build MainApi.csproj -c Test
```

Expected: PASS

- [ ] **Step 5: Commit tenant-user query semantics**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs
git commit -m "feat(api): derive tenant user status from enum-only lifecycle fields"
```

### Task 5: Rebuild Invitation List and Action Semantics Around Enum Status

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.cs`
- Test: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`
- Test: `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.Spec.cs`
- Test: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.Spec.cs`

- [ ] **Step 1: Write failing invitation regression tests**

Add tests that prove:

```csharp
[Fact]
public async Task ItShouldReportExpiredForPendingInvitationPastExpiryWithoutPersistingExpiredAsStatus() {
}

[Fact]
public async Task ItShouldReturnAcceptedInvitationStatusAfterAcceptance() {
}

[Fact]
public async Task ItShouldReturnRevokedInvitationStatusAfterRevocation() {
}
```

- [ ] **Step 2: Run the focused invitation slice to verify failure**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec|FullyQualifiedName~AcceptInvitationSpec|FullyQualifiedName~RevokeInvitationSpec"
```

Expected: FAIL

- [ ] **Step 3: Rework invitation read/write logic to use `Invitation.Status`**

Target rules:

```csharp
var effectiveStatus = Invitation.GetEffectiveStatus(invitation.Status, invitation.ExpiresAt, _clock.UtcNow);
```

Accept/revoke flows must only write `Status`, `AcceptedAt`, and `RevokedAt`.

- [ ] **Step 4: Run the focused invitation slice**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec|FullyQualifiedName~AcceptInvitationSpec|FullyQualifiedName~RevokeInvitationSpec"
```

Expected: PASS

- [ ] **Step 5: Commit invitation lifecycle alignment**

```bash
git add apps/api/Src/Modules/Invitations/Services/InvitationService.cs apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.cs apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.Spec.cs apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.Spec.cs
git commit -m "refactor(api): unify invitation lifecycle on enum status"
```

### Task 6: Update Tenant-User Mutation Flows To Use Membership Status Enum

**Files:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/ReactivateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Test: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs`

- [ ] **Step 1: Write failing mutation specs against the enum-based membership model**

Add tests that prove:

```csharp
[Fact]
public async Task ItShouldPersistTenantUserLevelChangeWhenAccountStatusIsActive() {
}

[Fact]
public async Task ItShouldSuspendTenantMembershipWithoutRemovingTheRowFromTheList() {
}

[Fact]
public async Task ItShouldReactivateSuspendedTenantMembership() {
}
```

- [ ] **Step 2: Run the focused spec slice to verify failure**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec"
```

Expected: FAIL

- [ ] **Step 3: Convert the mutation flows to read/write `UserAccount.Status`**

Target implementation shape:

```csharp
if (account.Status == AccountStatus.Suspended) {
	return new SuspendTenantUserResult.AlreadySuspended();
}

account.Status = AccountStatus.Suspended;
```

```csharp
if (account.Status != AccountStatus.Suspended) {
	return new ReactivateTenantUserResult.NotSuspended();
}

account.Status = AccountStatus.Active;
```

- [ ] **Step 4: Run the focused spec slice**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec"
```

Expected: PASS

- [ ] **Step 5: Commit the tenant-user mutation conversion**

```bash
git add apps/api/Src/Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/ReactivateTenantUserAsStaff.cs apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.Spec.cs
git commit -m "refactor(api): use account status enum for tenant user mutations"
```

### Task 7: Verify Auth, Picker, and Project Lookup Semantics Under Enum-Only Status

**Files:**
- Modify: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`
- Modify: `apps/api/Src/Modules/Users/Services/AccountService.cs`
- Modify: `apps/api/Src/Modules/Projects/Services/ProjectService.cs`
- Test: `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.Spec.cs`
- Test: `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs`
- Test: `apps/api/Src/Modules/Projects/**/*.Spec.cs`

- [ ] **Step 1: Write the failing auth/picker/project regression tests**

Add coverage for:

```csharp
[Fact]
public async Task ItShouldExcludeGloballySuspendedUsersFromTenantPickerEvenWhenMembershipStatusIsActive() {
}

[Fact]
public async Task ItShouldRejectTenantAuthWhenUserStatusIsSuspendedEvenWhenMembershipStatusIsActive() {
}

[Fact]
public async Task ItShouldExcludeInactiveProjectsFromLookupsThatExpectActiveProjects() {
}
```

- [ ] **Step 2: Run the focused spec slices to verify failure**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetUserTenantsForPickerSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~Project"
```

Expected: FAIL

- [ ] **Step 3: Rework helpers to use enum-only semantics**

Target checks:

```csharp
var isUserGloballyActive = user.Status != UserStatus.Suspended;
var isMembershipActive = account.Status == AccountStatus.Active;
var isProjectActive = project.Status == ProjectStatus.Active;
```

- [ ] **Step 4: Run the focused auth/picker/project slice**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetUserTenantsForPickerSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~Project"
```

Expected: PASS

- [ ] **Step 5: Commit the auth/picker/project alignment**

```bash
git add apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs apps/api/Src/Modules/Users/Services/AccountService.cs apps/api/Src/Modules/Projects/Services/ProjectService.cs apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.Spec.cs apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.Spec.cs apps/api/Src/Modules/Projects
git commit -m "fix(api): align auth picker and project activity with enum-only status model"
```

### Task 8: Update Frontend Tenant-Users UI and Regenerate the Client

**Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
- Regenerate: `packages/client-ts/**`

- [ ] **Step 1: Update the frontend type expectations and UI options**

Target UI changes:

```tsx
const statusOptions = [
	{ label: tCommon('active'), value: 'active' },
	{ label: tCommon('suspended'), value: 'suspended' },
	{ label: tCommon('globally-suspended'), value: 'globally_suspended' },
];
```

- [ ] **Step 2: Regenerate the TypeScript client**

Run:

```powershell
make build-api
make generate-client
```

Expected: PASS

- [ ] **Step 3: Run frontend verification**

Run:

```powershell
make tsc-front
```

Then run:

```powershell
cd apps/front
npx -y react-doctor@latest . --verbose --diff
```

Expected:
- `make tsc-front` PASS
- `react-doctor` may still report unrelated pre-existing repo issues, but no new ones from this slice

- [ ] **Step 4: Commit the frontend alignment**

```bash
git add apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx packages/client-ts
git commit -m "feat(front): reflect enum-only tenant user status model"
```

### Task 9: Update Smoke Checklist and Run Final Focused Regression Pack

**Files:**
- Modify: `docs/misc/tenant-module-smoke-test-checklist.md`

- [ ] **Step 1: Update the smoke checklist**

Add or adjust unchecked assertions for:

```md
- [ ] A tenant user globally suspended at the `User` level still appears in the tenant `Users` list.
- [ ] A globally suspended tenant user is rendered as `Globally suspended`.
- [ ] Tenant-level level/status controls are disabled for globally suspended rows.
- [ ] Filtering by `globally_suspended` returns only globally suspended users.
- [ ] Filtering by `suspended` returns only globally active users whose membership is suspended.
- [ ] Filtering by `active` returns only globally active users whose membership is active.
- [ ] A suspended tenant still cannot be treated as active once `Tenant.Status == Suspended`.
- [ ] A globally suspended user cannot authenticate even if a membership row remains `Active`.
- [ ] An accepted invitation is represented by invitation status, not a separate boolean flag.
- [ ] A revoked invitation is represented by invitation status, not a separate boolean flag.
- [ ] An expired invitation still renders as `Expired` when pending and past `ExpiresAt`.
- [ ] An inactive project is represented through `Project.Status`, not `IsActive`.
```

- [ ] **Step 2: Run the final focused regression pack**

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec|FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~GetUserTenantsForPickerSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~PasswordLoginSpec"
```

Run:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec|FullyQualifiedName~AcceptInvitationSpec|FullyQualifiedName~RevokeInvitationSpec|FullyQualifiedName~Project"
```

Run:

```powershell
cd ../..
dotnet build apps/api/MainApi.csproj -c Test
make build-api
make tsc-front
```

Expected: PASS

- [ ] **Step 3: Commit docs and final stabilization**

```bash
git add docs/misc/tenant-module-smoke-test-checklist.md
git commit -m "docs: update smoke coverage for unified status model"
```

## Self-Review

- Spec coverage: the plan covers entity-model unification, invitation lifecycle unification, project lifecycle unification, migration, backend write/read paths, auth/picker invariants, frontend tenant-user management, and smoke checklist updates.
- Placeholder scan: no `TODO`/`TBD` placeholders remain; every task has concrete files and commands.
- Type consistency: the plan consistently uses enum-only persisted state, with effective `GloballySuspended` and time-based `Expired` treated as derived rather than duplicated persisted facts where appropriate.
