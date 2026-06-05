# Issue 432 Tenant User Company Query Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Split tenant-user company read workflows out of `TenantUserQueryService` into a focused `TenantUserCompanyQueryService`.

## Stack/base

- Current branch: `refactor/432-split-tenant-user-company-query-service`
- Base branch for PR: `refactor/432-split-user-query-services-by-scope`

## Scope

Create:
- `ITenantUserCompanyQueryService`
- `[Service(ServiceLifetime.Scoped)] TenantUserCompanyQueryService`

Move from `ITenantUserQueryService` / `TenantUserQueryService`:
- `FindTenantUserCompaniesForStaffAsync`

Move associated types without renaming public types:
- `FindTenantUserCompaniesResult`
- `FindTenantUserCompaniesForStaffArgs`
- `FindTenantUserCompaniesForStaffFilters`
- `TenantUserCompanyData`

Keep tenant-user list/detail reads on `ITenantUserQueryService` / `TenantUserQueryService`:
- `FindTenantUsersAsync`
- `GetTenantUserByIdAsync`
- `GetTenantUserDetailsForStaffAsync`

Update handlers:
- `FindTenantUserCompaniesForStaff`
- `TenantUserCompanyActionsForStaff` preflight reads should use `ITenantUserCompanyQueryService`; mutations stay on `ITenantUserMembershipService`.

Update DI spec with `ITenantUserCompanyQueryService -> TenantUserCompanyQueryService`.

## Invariants

- No behavior/sorting/pagination/eligibility changes.
- No service-to-service dependencies.
- No handler DbContext access.

## Verification

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Users/Handlers apps/api/Modules/Auth/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUserCompaniesForStaffSpec|FullyQualifiedName~TenantUserCompanyActionsForStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```
