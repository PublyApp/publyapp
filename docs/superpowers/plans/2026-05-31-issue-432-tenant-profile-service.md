# Issue 432 Tenant Profile Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Split tenant-profile staff workflows out of `ProfileAsStaffService` into a focused `TenantProfileAsStaffService` stacked on the invitation-service split chain.

**Architecture:** Keep `TenantProfileAsStaffService` independent with its own scoped `AppDbContext` and logger dependencies. Handlers that operate on tenant profiles should inject the narrower tenant-profile interface; no service should call another service. This slice must not change staff-profile core or staff-profile user-assignment workflows.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #552:
- Current branch: `refactor/432-split-tenant-profile-service`
- Base branch for PR: `refactor/432-split-invitation-acceptance-service`
- Do not target this PR at `develop`, or the diff will include the invitation-service stack.

## Scope

Move only tenant-profile staff workflows from `IProfileAsStaffService` / `ProfileAsStaffService`:

- `GetOrCreateDefaultTenantProfileAsync`
- `FindTenantProfilesAsync`
- `GetTenantProfileByIdAsync`
- `CreateTenantProfileAsync`
- `UpdateTenantProfileAsync`
- `DeleteTenantProfileAsync`
- `BulkDeleteTenantProfilesAsync`
- `FindTenantProfilePermissionKeysAsync`
- `SetTenantProfilePermissionAsync`

Move tenant-profile-only args/results/helpers with those methods. If a type is shared with staff-profile bulk workflows, keep it in the existing namespace in a neutral/shared file or leave it where compilation and scope are cleanest; do not rename public records.

Do not move staff-profile core CRUD, staff-profile permissions, staff-profile user assignment, or staff-profile creation in this PR.

## Files

Create:
- `apps/api/Modules/Profiles/Services/TenantProfileAsStaffService.cs`

Modify expected handler consumers:
- `apps/api/Modules/Profiles/Handlers/Staff/CreateTenantProfileAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/FindTenantProfilesAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/GetTenantProfileByIdAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/UpdateTenantProfileAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/DeleteTenantProfileAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/BulkDeleteTenantProfilesAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/FindTenantProfilePermissionsAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/AssignTenantProfilePermissionAsStaff.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/UnassignTenantProfilePermissionAsStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs`

Modify service/spec files:
- `apps/api/Modules/Profiles/Services/ProfileAsStaffService.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` if assertions reference moved methods
- `docs/superpowers/plans/2026-05-31-issue-432-tenant-profile-service.md`

## Behavior invariants

- Tenant-profile operations keep explicit tenant ID path semantics.
- Default tenant profile creation stays idempotent and transaction/unique-violation behavior is preserved.
- Tenant profile name uniqueness/soft-delete rules are unchanged.
- Tenant profile permission assignment/unassignment behavior is unchanged.
- Bulk delete semantics and failed-item ordering are unchanged.
- Handlers continue to own HTTP result mapping and audit logging.

### Task 1: Extract tenant-profile service

**Files:**
- Create: `apps/api/Modules/Profiles/Services/TenantProfileAsStaffService.cs`
- Modify: `apps/api/Modules/Profiles/Services/ProfileAsStaffService.cs`

- [x] **Step 1: Create service/interface file**

Create `ITenantProfileAsStaffService` and `[Service(ServiceLifetime.Scoped)] public sealed class TenantProfileAsStaffService : ITenantProfileAsStaffService` in namespace `PublyApp.Api.Modules.Profiles.Services`.

Constructor:

```csharp
public TenantProfileAsStaffService(AppDbContext dbContext, ILogger<TenantProfileAsStaffService> logger) {
	_dbContext = dbContext;
	_logger = logger;
}
```

- [x] **Step 2: Move tenant-profile methods**

Move the nine tenant-profile methods listed in Scope from `ProfileAsStaffService` to `TenantProfileAsStaffService`.

- [x] **Step 3: Move tenant-profile types/helpers**

Move tenant-profile args/results and tenant-specific helpers needed by those methods without renaming public records. Keep shared bulk result types available to both old and new services if staff-profile methods still need them.

- [x] **Step 4: Remove moved methods from `IProfileAsStaffService`**

Remove tenant-profile methods from `IProfileAsStaffService`; keep staff-profile methods there.

### Task 2: Update handlers/spec setup consumers

**Files:** handlers listed above.

- [x] **Step 1: Update tenant-profile handlers**

Replace `IProfileAsStaffService profileService` with `ITenantProfileAsStaffService tenantProfileService` for tenant-profile route handlers and update method calls only.

- [x] **Step 2: Update cross-module tenant invitation handler**

Update `CreateInvitationForTenantAsStaff.cs` to inject/use `ITenantProfileAsStaffService` for `GetOrCreateDefaultTenantProfileAsync`.

- [x] **Step 3: Update specs that directly resolve the old interface**

If specs directly resolve `IProfileAsStaffService` for tenant default-profile setup, switch those setup calls to `ITenantProfileAsStaffService`.

### Task 3: Update DI/architecture specs

**Files:**
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` if needed

- [x] **Step 1: Add DI expected service pair**

Add:

```csharp
(typeof(ITenantProfileAsStaffService), typeof(TenantProfileAsStaffService)),
```

- [x] **Step 2: Update args-record assertions if moved methods are asserted**

If any positive assertions reference tenant-profile methods on `IProfileAsStaffService`, move those assertions to `ITenantProfileAsStaffService`. Keep staff-profile assertions on `IProfileAsStaffService`.

### Task 4: Verification and commit

- [x] **Step 1: Verify stacked diff**

```bash
git diff --name-status refactor/432-split-invitation-acceptance-service...HEAD
```

Expected: only tenant-profile service extraction files plus this plan.

- [x] **Step 2: Verify no handler DbContext access**

```bash
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Profiles/Handlers apps/api/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs
```

Expected: no matches.

- [x] **Step 3: Run targeted tenant-profile specs**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~CreateTenantProfileAsStaffSpec|FullyQualifiedName~GetTenantProfileByIdAsStaffSpec|FullyQualifiedName~UpdateTenantProfileAsStaffSpec|FullyQualifiedName~DeleteTenantProfileAsStaffSpec|FullyQualifiedName~BulkDeleteTenantProfilesAsStaffSpec|FullyQualifiedName~TenantProfilePermissionsAsStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: pass.

- [x] **Step 4: Build API**

```bash
just build-api
```

Expected: pass with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Modules/Profiles apps/api/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs docs/superpowers/plans/2026-05-31-issue-432-tenant-profile-service.md

git commit -m "refactor(api): split tenant profile service"
```
