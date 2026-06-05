# Issue 432 Users Service Split PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the first cohesive slices out of `UserService`: staff user lifecycle actions and staff user profile assignment, while preserving behavior and tests.

**Architecture:** Keep the domain-first service boundary in `apps/api/Modules/Users/Services`. Handlers continue to orchestrate HTTP concerns only and must not inject `AppDbContext`. New services are independent siblings that inject `AppDbContext` directly rather than calling each other.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, xUnit integration/concurrency specs, PublyApp `[Service]` DI scanner.

---

## Scope for this PR

This PR intentionally handles only the first behavior-preserving slice of issue #432:

1. `StaffUserLifecycleService`
2. `StaffUserProfileAssignmentService`
3. Targeted handler injection updates
4. DI/architecture specs updates
5. Service split documentation updates

Do not split tenant user/company workflows, invitation services, or profile services in this PR.

## Files

Create:
- `apps/api/Modules/Users/Services/StaffUserLifecycleService.cs`
- `apps/api/Modules/Users/Services/StaffUserProfileAssignmentService.cs`

Modify:
- `apps/api/Modules/Users/Services/UserService.cs`
- `apps/api/Modules/Users/Handlers/Staff/SuspendStaffUser.cs`
- `apps/api/Modules/Users/Handlers/Staff/ReactivateStaffUser.cs`
- `apps/api/Modules/Users/Handlers/Staff/DeleteStaffUser.cs`
- `apps/api/Modules/Users/Handlers/Staff/BulkSuspendStaffUsers.cs`
- `apps/api/Modules/Users/Handlers/Staff/BulkReactivateStaffUsers.cs`
- `apps/api/Modules/Users/Handlers/Staff/BulkDeleteStaffUsers.cs`
- `apps/api/Modules/Users/Handlers/Staff/GetStaffUserProfiles.cs`
- `apps/api/Modules/Users/Handlers/Staff/UpdateStaffUserProfiles.cs`
- `apps/api/Modules/Users/Services/StaffUserLifecycleConcurrency.Spec.cs`
- `apps/api/Modules/Users/Services/BulkStaffUserLifecycleConcurrency.Spec.cs`
- `apps/api/Modules/Users/Services/UpdateStaffUserProfilesConcurrency.Spec.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `docs/guides/api-module-structure.md`
- `AGENTS.md` only if needed for a concise pointer

## Comment policy for this PR

Add focused comments only where they explain non-obvious invariants:
- lifecycle services intentionally include suspended staff users in read-after-write resolution so admins can reactivate/delete them safely;
- profile assignment locks the staff `UserAccount` before replacing junction rows to serialize with deletion;
- bulk operations dedupe requested IDs and preserve per-item failure reasons.

Do not add comments like “load user”, “save changes”, “bulk operations”, or XML summaries that restate method names.

### Task 1: Baseline and extraction tests

**Files:**
- Read/verify: `apps/api/Modules/Users/Services/StaffUserLifecycleConcurrency.Spec.cs`
- Read/verify: `apps/api/Modules/Users/Services/BulkStaffUserLifecycleConcurrency.Spec.cs`
- Read/verify: `apps/api/Modules/Users/Services/UpdateStaffUserProfilesConcurrency.Spec.cs`

- [ ] **Step 1: Run targeted baseline specs before moving code**

Run from repo root:

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserLifecycleConcurrencySpec|FullyQualifiedName~BulkStaffUserLifecycleConcurrencySpec|FullyQualifiedName~UpdateStaffUserProfilesConcurrencySpec"
```

Expected: either pass or reveal a pre-existing environment blocker. If Docker/Testcontainers is unavailable, record the blocker and continue with build/architecture verification.

- [ ] **Step 2: Verify current service registration guard baseline**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: pass or document pre-existing blocker.

### Task 2: Extract staff lifecycle service

**Files:**
- Create: `apps/api/Modules/Users/Services/StaffUserLifecycleService.cs`
- Modify: `apps/api/Modules/Users/Services/UserService.cs`
- Modify: staff lifecycle handlers/specs listed above
- Modify: `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`

- [ ] **Step 1: Create service interface and class**

Create `IStaffUserLifecycleService` and `[Service(ServiceLifetime.Scoped)] public sealed class StaffUserLifecycleService : IStaffUserLifecycleService` in namespace `PublyApp.Api.Modules.Users.Services`.

Constructor:

```csharp
public StaffUserLifecycleService(AppDbContext dbContext) {
	_dbContext = dbContext;
}
```

Public methods to move exactly:
- `SuspendStaffUserAsync`
- `ReactivateStaffUserAsync`
- `DeleteStaffUserAsync`
- `BulkSuspendStaffUsersAsync`
- `BulkReactivateStaffUsersAsync`
- `BulkDeleteStaffUsersAsync`

Private helpers to move exactly:
- `BuildLiveStaffUserQuery`
- `BuildLiveStaffUserMutationQuery`
- `FindLiveStaffUserAsync`
- `FindLiveStaffUserDeleteTargetAsync`
- `FindLiveStaffUserStatusesAsync`
- `ResolveSuspendStaffUserAfterNoRowsAsync`
- `ResolveReactivateStaffUserAfterNoRowsAsync`
- `ResolveDeleteStaffUserAfterNoRowsAsync`
- `LiveStaffUserStatus`
- `LiveStaffUserDeleteTarget`

Keep result records in `UserService.cs` for this PR unless compilation proves a cleaner shared model file is necessary.

- [ ] **Step 2: Remove lifecycle methods from `IUserService` and `UserService`**

Remove the six public lifecycle methods and lifecycle-only private helpers from `UserService.cs` after copying them to the new service.

- [ ] **Step 3: Update staff lifecycle handlers**

Update these handlers to inject `IStaffUserLifecycleService` instead of `IUserService`:
- `SuspendStaffUser.cs`
- `ReactivateStaffUser.cs`
- `DeleteStaffUser.cs`
- `BulkSuspendStaffUsers.cs`
- `BulkReactivateStaffUsers.cs`
- `BulkDeleteStaffUsers.cs`

Do not change HTTP result mapping.

- [ ] **Step 4: Update lifecycle specs**

In:
- `StaffUserLifecycleConcurrency.Spec.cs`
- `BulkStaffUserLifecycleConcurrency.Spec.cs`

Replace `UserService` type parameters/constructors with `StaffUserLifecycleService`; construct it with `AppDbContext` only.

- [ ] **Step 5: Update DI expected service list**

Add `(typeof(IStaffUserLifecycleService), typeof(StaffUserLifecycleService))` to `ExpectedServices` in `ServiceAttributeRegistration.Spec.cs`.

- [ ] **Step 6: Run lifecycle verification**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserLifecycleConcurrencySpec|FullyQualifiedName~BulkStaffUserLifecycleConcurrencySpec|FullyQualifiedName~ServiceAttributeRegistrationSpec"
```

### Task 3: Extract staff profile assignment service

**Files:**
- Create: `apps/api/Modules/Users/Services/StaffUserProfileAssignmentService.cs`
- Modify: `apps/api/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Modules/Users/Handlers/Staff/GetStaffUserProfiles.cs`
- Modify: `apps/api/Modules/Users/Handlers/Staff/UpdateStaffUserProfiles.cs`
- Modify: `apps/api/Modules/Users/Services/UpdateStaffUserProfilesConcurrency.Spec.cs`
- Modify: `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`

- [ ] **Step 1: Create service interface and class**

Create `IStaffUserProfileAssignmentService` and `[Service(ServiceLifetime.Scoped)] public sealed class StaffUserProfileAssignmentService : IStaffUserProfileAssignmentService` in namespace `PublyApp.Api.Modules.Users.Services`.

Public methods to move exactly:
- `GetStaffUserProfilesAsync`
- `UpdateStaffUserProfilesAsync`

Private helper to move exactly:
- `LockLiveStaffUserAccountForProfileUpdateAsync`

Add a short comment near the locking helper explaining that the staff account lock serializes profile replacement against staff-user deletion.

- [ ] **Step 2: Remove profile assignment methods from `IUserService` and `UserService`**

Remove the two public profile assignment methods and profile-assignment-only helper from `UserService.cs` after copying them.

- [ ] **Step 3: Update handlers**

Update:
- `GetStaffUserProfiles.cs`
- `UpdateStaffUserProfiles.cs`

to inject `IStaffUserProfileAssignmentService` instead of `IUserService`.

- [ ] **Step 4: Update profile assignment concurrency spec**

In `UpdateStaffUserProfilesConcurrency.Spec.cs`:
- use `StaffUserProfileAssignmentService` for `UpdateStaffUserProfilesAsync`;
- use `StaffUserLifecycleService` for concurrent `DeleteStaffUserAsync`;
- construct both services with `AppDbContext` only.

- [ ] **Step 5: Update DI expected service list**

Add `(typeof(IStaffUserProfileAssignmentService), typeof(StaffUserProfileAssignmentService))` to `ExpectedServices`.

- [ ] **Step 6: Run profile assignment verification**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserProfilesConcurrencySpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

### Task 4: Documentation update

**Files:**
- Modify: `docs/guides/api-module-structure.md`
- Modify: `AGENTS.md` only if the existing concise summary needs a pointer

- [ ] **Step 1: Add `Domain Service Split Rules` to docs**

Add a section after `Infrastructure Services Placement Rules` in `docs/guides/api-module-structure.md` covering:
- services own database access/business rules/transactions;
- handlers must not inject/use `AppDbContext`;
- services must not depend on other domain/application services;
- split by cohesive business capability, not one service per handler;
- good names: `StaffUserLifecycleService`, `StaffUserProfileAssignmentService`, `TenantUserCompanyService`, `InvitationQueryService`;
- bad names: `UserHelper`, `UserManager`, `UserService2`, `CommonService`, `SuspendStaffUserService`.

- [ ] **Step 2: Keep AGENTS.md concise**

If AGENTS.md already points to `docs/guides/api-module-structure.md`, do not duplicate the full rules. Add at most one short sentence if needed.

### Task 5: Final verification and review prep

**Files:** all changed files.

- [ ] **Step 1: Verify no handlers gained direct DbContext access**

```bash
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
```

Expected: no new matches for this PR.

- [ ] **Step 2: Run API build**

```bash
just build-api
```

Expected: exit 0.

- [ ] **Step 3: Run targeted tests**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~StaffUserLifecycleConcurrencySpec|FullyQualifiedName~BulkStaffUserLifecycleConcurrencySpec|FullyQualifiedName~UpdateStaffUserProfilesConcurrencySpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: exit 0, unless environment blocker is documented.

- [ ] **Step 4: Optional broader test if Docker/Testcontainers are available**

```bash
just test-api
```

Expected: exit 0.

- [ ] **Step 5: Review diff for comment quality**

Ensure added comments explain invariants/why, not obvious code narration.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/guides/api-module-structure.md apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Modules/Users

git commit -m "refactor(api): split staff user services"
```
