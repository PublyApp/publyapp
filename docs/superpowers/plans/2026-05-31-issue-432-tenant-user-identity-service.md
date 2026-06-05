# Issue 432 Tenant User Identity Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split tenant global identity workflows out of `UserService` into a focused `TenantUserIdentityService`, stacked on the tenant membership service PR.

**Architecture:** `TenantUserIdentityService` owns staff-admin operations that mutate global `User` identity state for tenant users. Keep it independent with its own scoped `AppDbContext` and logger dependencies. Do not call `IUserService`, `IUserQueryService`, or `ITenantUserMembershipService` from it; duplicate small projection/query helpers as needed to preserve boundaries.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #557:
- Current branch: `refactor/432-split-tenant-user-identity-service`
- Base branch for PR: `refactor/432-split-tenant-user-membership-service`

## Scope

Move tenant global identity workflows from `IUserService` / `UserService`:

- `UpdateTenantUserIdentityForStaffAsync`
- `UpdateTenantUserEmailForStaffAsync`
- `SuspendTenantUserIdentityForStaffAsync`
- `ReactivateTenantUserIdentityForStaffAsync`

Move supporting args/results/documents/failure records used by those workflows without renaming public types.

Move private helpers used only by these workflows, as needed:

- `BuildLiveTenantUserIdentityMutationQuery`
- `ResolveSuspendTenantUserIdentityAfterNoRowsAsync`
- `ResolveReactivateTenantUserIdentityAfterNoRowsAsync`
- private tenant-user details projection helper currently retained for mutation responses
- active-admin helpers if still needed by these workflows and not already moved; do not introduce service dependency

Do not move:
- auth/login/token methods
- staff user mutation methods
- tenant membership/company workflows already moved to `TenantUserMembershipService`
- staff lifecycle/profile-assignment services

## Files likely touched

Create:
- `apps/api/Modules/Users/Services/TenantUserIdentityService.cs`

Modify:
- `apps/api/Modules/Users/Services/UserService.cs`
- `apps/api/Modules/Users/Handlers/Staff/UpdateTenantUserIdentityForStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/UpdateTenantUserEmailForStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/SuspendTenantUserIdentityForStaff.cs`
- `apps/api/Modules/Users/Handlers/Staff/ReactivateTenantUserIdentityForStaff.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` if moved method assertions exist
- this plan file

## Behavior invariants

- Global identity updates keep current email uniqueness behavior.
- Global suspend/reactivate behavior and result mapping remain unchanged.
- Last-active-admin protection for global suspend stays identical.
- Response DTO/projection contents remain unchanged.
- No service-to-service dependencies and no handler DbContext access.

### Task 1: Extract identity service

- [x] Create `ITenantUserIdentityService` and `[Service(ServiceLifetime.Scoped)] TenantUserIdentityService`.
- [x] Constructor injects `AppDbContext` and `ILogger<TenantUserIdentityService>` only if logger is used; otherwise inject `AppDbContext` only.
- [x] Move the four identity methods listed in Scope.
- [x] Move required public args/results/documents/failure records and private helpers without renaming public types.
- [x] Remove moved methods from `IUserService` / `UserService`.
- [x] Keep auth/user identity and staff user mutation workflows on `IUserService` for later cleanup.

### Task 2: Update handlers

- [x] Update the four tenant identity handlers to inject/use `ITenantUserIdentityService`.
- [x] Do not change HTTP result mapping, validators, route metadata, or audit behavior.

### Task 3: Update DI/specs

- [x] Add `(typeof(ITenantUserIdentityService), typeof(TenantUserIdentityService)),` to `ServiceAttributeRegistration.Spec.cs`.
- [x] Update `ServiceArgsRecordConvention.Spec.cs` only if it asserts moved methods on `IUserService`.

### Task 4: Verification and commit

Run:

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateTenantUserIdentityForStaffSpec|FullyQualifiedName~UpdateTenantUserEmailForStaffSpec|FullyQualifiedName~SuspendTenantUserIdentityForStaffSpec|FullyQualifiedName~ReactivateTenantUserIdentityForStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```

Then commit:

```bash
git add apps/api/Modules/Users apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs docs/superpowers/plans/2026-05-31-issue-432-tenant-user-identity-service.md
git commit -m "refactor(api): split tenant user identity service"
```
