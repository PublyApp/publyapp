# Issue 432 User Query Scope Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split oversized `UserQueryService` into staff-user and tenant-user query services, stacked on the staff user core service PR.

**Architecture:** Query services remain independent and inject only `AppDbContext`. Shared tenant-user details projection can stay in `TenantUserDetailsQueries`. No service-to-service dependencies. No handler DbContext access.

## Stack/base

- Current branch: `refactor/432-split-user-query-services-by-scope`
- Base branch for PR: `refactor/432-split-staff-user-core-service`

## Scope

Create:
- `StaffUserQueryService.cs` with `IStaffUserQueryService`
- `TenantUserQueryService.cs` with `ITenantUserQueryService`

Move from `IUserQueryService` / `UserQueryService`:

Staff query methods:
- `GetStaffUserUserByIdAsync`
- `CountStaffUsersAsync`
- `FindStaffUsersAsync`

Tenant query methods:
- `FindTenantUsersAsync`
- `GetTenantUserByIdAsync`
- `GetTenantUserDetailsForStaffAsync`
- `FindTenantUserCompaniesForStaffAsync`

Then delete `IUserQueryService` / `UserQueryService` if no references remain.

Update handlers:
- Staff-user read handlers use `IStaffUserQueryService`.
- Tenant-user read/company handlers use `ITenantUserQueryService`.
- Mixed tenant company mutation handler uses `ITenantUserQueryService` for preflight reads and `ITenantUserMembershipService` for mutations.
- `TenantUserIdentityService` should keep using `TenantUserDetailsQueries` directly, not depend on a query service.

Update DI spec:
- Add `IStaffUserQueryService`/`StaffUserQueryService`.
- Add `ITenantUserQueryService`/`TenantUserQueryService`.
- Remove `IUserQueryService`/`UserQueryService` if deleted.

## Behavior invariants

- Query filters/sorts/cursors/projections unchanged.
- Tenant-user detail projection remains centralized in `TenantUserDetailsQueries`.
- No service-to-service dependencies.
- No handler direct DbContext access.

## Tasks

- [ ] Create staff query service and move staff query methods/types.
- [ ] Create tenant query service and move tenant query methods/types.
- [ ] Update handlers and DI/specs.
- [ ] Delete old user query service if unused.
- [ ] Run verification:

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec|FullyQualifiedName~GetStaffUserByIdSpec|FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~GetTenantUserAsStaffSpec|FullyQualifiedName~GetTenantUserByIdForStaffSpec|FullyQualifiedName~FindTenantUserCompaniesForStaffSpec|FullyQualifiedName~TenantUserCompanyActionsForStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```
