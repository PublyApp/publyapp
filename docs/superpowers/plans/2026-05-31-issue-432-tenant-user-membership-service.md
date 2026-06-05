# Issue 432 Tenant User Membership Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split tenant user company/membership workflows out of `UserService` into a focused `TenantUserMembershipService`, stacked on the user query service PR.

**Architecture:** `TenantUserMembershipService` owns staff-admin tenant membership/company assignment and tenant-account lifecycle workflows. Keep it independent with its own scoped `AppDbContext` and logger dependencies. Do not call `IUserService` or `IUserQueryService` from it. Preserve last-admin/default-profile/profile-link invariants and existing transaction boundaries.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #556:
- Current branch: `refactor/432-split-tenant-user-membership-service`
- Base branch for PR: `refactor/432-split-user-query-service`

## Scope

Move tenant membership/company workflows from `IUserService` / `UserService`:

- `AssignTenantUserCompaniesForStaffAsync`
- `BulkRemoveTenantUserCompaniesForStaffAsync`
- `BulkSuspendTenantUserCompaniesForStaffAsync`
- `BulkReactivateTenantUserCompaniesForStaffAsync`
- `RemoveUserFromTenantAsync`
- `UpdateTenantUserAsync`
- `SuspendTenantUserAsync`
- `ReactivateTenantUserAsync`

Move supporting args/results/failure records used by those workflows, without renaming public types:

- `RemoveUserFromTenantResult`
- `TenantUserCompanyIdsArgs`
- `AssignTenantUserCompaniesArgs`
- `TenantUserCompanyBulkActionFailedItem`
- `TenantUserCompanyBulkActionResult`
- `UpdateTenantUserDocument`
- `UpdateTenantUserResult`
- `SuspendTenantUserResult`
- `ReactivateTenantUserResult`

Move private helpers used only by these workflows, as needed:

- `AssignDefaultProfileToTenantAccountAsync`
- `GetOrCreateDefaultTenantProfileAsync`
- `GetTenantUserIdentityAssignmentErrorAsync`
- `BuildTenantUserCompanyBulkFailure`
- `GetRemoveTenantUserCompanyError`
- `GetSuspendTenantUserCompanyError`
- `GetReactivateTenantUserCompanyError`
- `BuildActiveTenantAdminAccountsQuery`
- `IsActiveTenantAdminAsync`
- `CountActiveTenantAdminsAsync`
- `TenantHasAnotherActiveAdminAsync`
- `RemoveUserAccountProfileLinksAsync`

Do not move tenant global identity workflows:
- `UpdateTenantUserIdentityForStaffAsync`
- `UpdateTenantUserEmailForStaffAsync`
- `SuspendTenantUserIdentityForStaffAsync`
- `ReactivateTenantUserIdentityForStaffAsync`

Do not move auth/user identity methods or staff user mutation methods.

## Files likely touched

Create:
- `apps/api/Modules/Users/Services/TenantUserMembershipService.cs`

Modify:
- `apps/api/Modules/Users/Services/UserService.cs`
- `apps/api/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/ReactivateTenantUserAsStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/TenantUserCompanyActionsForStaff.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` if any moved method assertions exist
- this plan file

## Behavior invariants

- Last-active-tenant-admin checks remain identical.
- Default tenant profile creation/assignment remains identical.
- Removing tenant user hard-deletes relevant profile-account links as before.
- Bulk operations preserve item ordering and failure reason mapping.
- Serializable transaction boundaries stay where they exist today.
- Mixed handlers may inject both `IUserQueryService` for preflight reads and `ITenantUserMembershipService` for membership mutations.
- No service-to-service dependencies and no handler DbContext access.

### Task 1: Extract membership service

- [x] Create `ITenantUserMembershipService` and `[Service(ServiceLifetime.Scoped)] TenantUserMembershipService` in `apps/api/Modules/Users/Services/TenantUserMembershipService.cs`.
- [x] Constructor injects `AppDbContext` and `ILogger<TenantUserMembershipService>` only.
- [x] Move the eight membership methods listed in Scope.
- [x] Move required public args/results/failure records and private helpers without renaming public types.
- [x] Remove moved methods from `IUserService` / `UserService`.
- [x] Keep tenant global identity workflows on `IUserService` for the next slice.

### Task 2: Update handlers

- [x] Update tenant membership/lifecycle handlers to inject/use `ITenantUserMembershipService`.
- [x] Update `TenantUserCompanyActionsForStaff.cs` to keep preflight reads on `IUserQueryService` and move bulk/company mutations to `ITenantUserMembershipService`.
- [x] Do not change HTTP result mapping, validators, route metadata, or audit behavior.

### Task 3: Update DI/specs

- [x] Add `(typeof(ITenantUserMembershipService), typeof(TenantUserMembershipService)),` to `ServiceAttributeRegistration.Spec.cs`.
- [x] Update `ServiceArgsRecordConvention.Spec.cs` only if it asserts moved methods on `IUserService`.

### Task 4: Verification and commit

Run:

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~TenantUserCompanyActionsForStaffSpec|FullyQualifiedName~RemoveUserFromTenantAsStaffSpec|FullyQualifiedName~UpdateTenantUserAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```

Then commit:

```bash
git add apps/api/Modules/Users apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs docs/superpowers/plans/2026-05-31-issue-432-tenant-user-membership-service.md
git commit -m "refactor(api): split tenant user membership service"
```
