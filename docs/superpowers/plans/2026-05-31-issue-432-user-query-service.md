# Issue 432 User Query Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split staff/tenant admin user read/projection workflows out of `UserService` into a focused `UserQueryService`, stacked on PR #547.

**Architecture:** `UserQueryService` owns read-only user list/get/projection queries for staff-admin surfaces. It must be independent with its own scoped `AppDbContext` dependency and no service-to-service dependencies. Auth/login/token lookup methods intentionally stay on `UserService` for a later semantic cleanup slice.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #547:
- Current branch: `refactor/432-split-user-query-service`
- Base branch for PR: `refactor/432-split-api-services`
- Do not target this PR at `develop`, or the diff will include PR #547.

## Scope

Move only staff/tenant admin read/projection workflows from `IUserService` / `UserService`:

- `GetStaffUserUserByIdAsync`
- `CountStaffUsersAsync`
- `FindStaffUsersAsync`
- `FindTenantUsersAsync`
- `GetTenantUserByIdAsync`
- `GetTenantUserDetailsForStaffAsync`
- `FindTenantUserCompaniesForStaffAsync`

Move query-only args/results/list DTO records needed by those methods without renaming public types:

- `StaffUserData`
- `FindStaffUsersResult`
- `FindStaffUsersFilters`
- `FindStaffUsersArgs`
- `FindTenantUsersResult`
- `FindTenantUsersAsStaffFilters`
- `FindTenantUsersAsStaffArgs`
- `TenantUserData`
- `TenantUserDetailsData`
- `TenantUserCompanyData`
- `FindTenantUserCompaniesForStaffArgs`
- `FindTenantUserCompaniesForStaffFilters`
- `FindTenantUserCompaniesResult`

Move query-only private helpers used by those methods:

- `TenantUserCompanyQueryRow`
- `GetTenantUserStatusRank`

Do not move:
- auth/login/token lookups (`GetUserByEmailAsync`, token lookup methods, `GetUserByIdAsync`)
- user creation/update methods
- staff user mutations
- tenant membership/company mutations
- tenant global identity mutations

## Files likely touched

Create:
- `apps/api/Modules/Users/Services/UserQueryService.cs`

Modify:
- `apps/api/Modules/Users/Services/UserService.cs`
- staff read handlers:
  - `apps/api/Modules/Users/Handlers/Staff/FindStaffUser.cs`
  - `apps/api/Modules/Users/Handlers/Staff/GetStaffUserById.cs`
  - `apps/api/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
  - `apps/api/Modules/Users/Handlers/Staff/GetTenantUserAsStaff.cs`
  - `apps/api/Modules/Users/Handlers/Staff/GetTenantUserByIdForStaff.cs`
  - `apps/api/Modules/Users/Handlers/Staff/FindTenantUserCompaniesForStaff.cs`
  - `apps/api/Modules/Users/Handlers/Staff/TenantUserCompanyActionsForStaff.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- this plan file

## Behavior invariants

- Preserve existing method names, including `GetStaffUserUserByIdAsync` typo.
- Preserve query filters, sorting, pagination/cursor logic, status projections, soft-delete filtering, and inclusion/exclusion of suspended users.
- Mixed read/write handlers may inject both `IUserQueryService` and `IUserService`; they must keep mutations on `IUserService`.
- Do not inject `IUserQueryService` into `UserService`; if remaining mutation methods need details projections, leave private helper queries in `UserService` or duplicate small query logic.
- No handler gains direct `AppDbContext` access.

### Task 1: Extract query service

- [x] Create `IUserQueryService` and `[Service(ServiceLifetime.Scoped)] UserQueryService` in `apps/api/Modules/Users/Services/UserQueryService.cs`.
- [x] Inject only `AppDbContext` in the new service constructor unless the moved code truly needs a logger.
- [x] Move the seven query methods listed in Scope from `UserService` to `UserQueryService`.
- [x] Move needed args/results/list DTO records and query-only private helpers to `UserQueryService.cs` without renaming public types.
- [x] Remove moved methods from `IUserService` and `UserService`.
- [x] Preserve any private helper equivalent still needed by mutation methods in `UserService` without service-to-service dependencies.

### Task 2: Update handlers

- [x] Update pure read handlers to inject/use `IUserQueryService` instead of `IUserService`.
- [x] Update `TenantUserCompanyActionsForStaff.cs` preflight reads to use `IUserQueryService` while keeping bulk mutations on `IUserService`.
- [x] Do not change HTTP response mapping, audit behavior, validators, or route metadata.

### Task 3: Update DI/specs

- [x] Add `(typeof(IUserQueryService), typeof(UserQueryService)),` to `ServiceAttributeRegistration.Spec.cs`.
- [x] Confirm `ServiceArgsRecordConvention.Spec.cs` does not need updates; if a moved method assertion exists, move it to `IUserQueryService`.

### Task 4: Verification and commit

Run:

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec|FullyQualifiedName~GetStaffUserByIdSpec|FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~GetTenantUserAsStaffSpec|FullyQualifiedName~GetTenantUserByIdForStaffSpec|FullyQualifiedName~FindTenantUserCompaniesForStaffSpec|FullyQualifiedName~TenantUserCompanyActionsForStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```

Then commit:

```bash
git add apps/api/Modules/Users apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs docs/superpowers/plans/2026-05-31-issue-432-user-query-service.md
git commit -m "refactor(api): split user query service"
```
