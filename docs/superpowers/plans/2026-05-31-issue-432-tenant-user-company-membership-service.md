# Issue 432 Tenant User Company Membership Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Split tenant-user company mutation workflows out of `TenantUserMembershipService` into a focused `TenantUserCompanyMembershipService`.

## Stack/base

- Current branch: `refactor/432-split-tenant-user-company-membership-service`
- Base branch for PR: `refactor/432-split-tenant-user-company-query-service`

## Scope

Create:
- `ITenantUserCompanyMembershipService`
- `[Service(ServiceLifetime.Scoped)] TenantUserCompanyMembershipService`

Move from `ITenantUserMembershipService` / `TenantUserMembershipService`:
- `AssignTenantUserCompaniesForStaffAsync`
- `BulkRemoveTenantUserCompaniesForStaffAsync`
- `BulkSuspendTenantUserCompaniesForStaffAsync`
- `BulkReactivateTenantUserCompaniesForStaffAsync`

Move associated types without renaming public types:
- `TenantUserCompanyIdsArgs`
- `AssignTenantUserCompaniesArgs`
- `TenantUserCompanyBulkActionFailedItem`
- `TenantUserCompanyBulkActionResult`

Keep tenant-user lifecycle/profile membership workflows on `ITenantUserMembershipService` / `TenantUserMembershipService`:
- `RemoveUserFromTenantAsync`
- `UpdateTenantUserAsync`
- `SuspendTenantUserAsync`
- `ReactivateTenantUserAsync`
- `UpdateTenantUserDocument`
- related result records

Update handlers:
- `TenantUserCompanyActionsForStaff` mutation services should use `ITenantUserCompanyMembershipService`; query preflights stay on `ITenantUserCompanyQueryService`.

Update DI spec with `ITenantUserCompanyMembershipService -> TenantUserCompanyMembershipService`.

## Invariants

- Company assignment/removal/suspend/reactivate behavior unchanged.
- No service-to-service dependencies.
- No handler DbContext access.
- Shared tenant-user lifecycle operations may live in an internal non-DI helper that operates on `AppDbContext`; do not register it as a service.

## Verification

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~TenantUserCompanyActionsForStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```
