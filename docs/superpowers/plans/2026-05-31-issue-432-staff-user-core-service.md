# Issue 432 Staff User Core Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split remaining staff-scoped user mutations out of `UserService` into a focused `StaffUserCoreService`, stacked on the tenant identity service PR.

**Architecture:** `StaffUserCoreService` owns staff-admin user update/email mutation workflows only. Generic user creation remains on neutral `IUserService` / `UserService` so auth registration and staff creation do not depend on a staff-named service. Keep `StaffUserCoreService` independent with its own scoped `AppDbContext` and logger dependencies. Do not call `IUserService`, `IUserQueryService`, or any other domain service from it.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #558:
- Current branch: `refactor/432-split-staff-user-core-service`
- Base branch for PR: `refactor/432-split-tenant-user-identity-service`

## Scope

Move staff-admin user mutation workflows from `IUserService` / `UserService`:

- `UpdateStaffUserEmailAsync`
- `UpdateStaffUserByIdAsync`

Do not move generic user creation:
- `CreateUserAsync` and `CreateUserResult` stay on neutral `IUserService` / `UserService`.
- `PasswordRegister` remains unchanged/neutral in concept and injects `IUserService`, not `IStaffUserCoreService`.

Move supporting args/results/documents/failure records used by staff workflows without renaming public types, as needed:

- `UpdateStaffUserEmailResult`
- `UpdateUserByIdResult`
- `UpdateUserDocument`

Do not move auth/account repository methods:
- `GetUserByEmailAsync`
- `GetUserByEmailVerificationTokenAsync`
- `GetUserByPasswordResetTokenAsync`
- `UpdateUserAsync`
- `GetUserByIdAsync`
- `CreateUserAsync`

Those remaining methods form the small auth/account `UserService` and are intentionally left together unless final inspection shows they still violate issue #432.

## Files likely touched

Create:
- `apps/api/Modules/Users/Services/StaffUserCoreService.cs`

Modify:
- `apps/api/Modules/Users/Services/UserService.cs`
- `apps/api/Modules/Users/Handlers/Staff/CreateStaffUser.cs`
- `apps/api/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- `apps/api/Modules/Users/Handlers/Staff/UpdateStaffUserEmail.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` if moved method assertions exist
- this plan file

## Behavior invariants

- Staff/Tenant mutual exclusivity checks remain unchanged.
- Email uniqueness behavior remains unchanged.
- Staff account creation/reactivation behavior remains unchanged.
- Staff user update DTO/result mapping remains unchanged.
- No service-to-service dependencies and no handler DbContext access.

### Task 1: Extract staff core service

- [x] Create `IStaffUserCoreService` and `[Service(ServiceLifetime.Scoped)] StaffUserCoreService`.
- [x] Constructor injects `AppDbContext` and `ILogger<StaffUserCoreService>` only if logger is used; otherwise inject `AppDbContext` only.
- [x] Move the two staff core methods listed in Scope.
- [x] Move required public args/results/documents without renaming public types.
- [x] Keep generic `CreateUserAsync` / `CreateUserResult` on `IUserService` / `UserService`.
- [x] Remove moved staff methods from `IUserService` / `UserService`.
- [x] Leave auth/account repository methods on `IUserService` / `UserService`.

### Task 2: Update handlers

- [x] Update staff update/email handlers to inject/use `IStaffUserCoreService`.
- [x] Keep `PasswordRegister` and generic user creation call sites on `IUserService`.
- [x] Do not change HTTP result mapping, validators, route metadata, or audit behavior.

### Task 3: Update DI/specs

- [x] Add `(typeof(IStaffUserCoreService), typeof(StaffUserCoreService)),` to `ServiceAttributeRegistration.Spec.cs`.
- [x] Update `ServiceArgsRecordConvention.Spec.cs` only if it asserts moved methods on `IUserService`.

### Task 4: Verification

Run:

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~CreateStaffUserSpec|FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~UpdateStaffUserEmailSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```

Do not commit from this task; leave changes in the worktree for review.
