# Issue 432 Tenant Profile Query Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split tenant-profile read/query workflows out of oversized `TenantProfileAsStaffService` into a focused query service.

**Architecture:** `TenantProfileQueryAsStaffService` owns tenant-profile list/detail/permission-key reads. `TenantProfileAsStaffService` keeps default profile, create/update/delete/bulk-delete/set-permission workflows. Services remain independent and inject their own `AppDbContext`; no service-to-service dependencies.

## Stack/base

- Current branch: `refactor/432-split-tenant-profile-query-service`
- Base branch for PR: `refactor/432-split-staff-profile-query-service`

## Scope

Create:
- `ITenantProfileQueryAsStaffService`
- `[Service(ServiceLifetime.Scoped)] TenantProfileQueryAsStaffService`

Move from `ITenantProfileAsStaffService` / `TenantProfileAsStaffService`:
- `FindTenantProfilesAsync`
- `GetTenantProfileByIdAsync`
- `FindTenantProfilePermissionKeysAsync`

Move associated read DTOs/results without renaming public types:
- `TenantProfileItem`
- `FindTenantProfilesResult`
- `FindTenantProfilesArgs`
- `GetTenantProfileByIdArgs`
- `GetTenantProfileByIdResult`
- `FindTenantProfilePermissionKeysArgs`
- `FindTenantProfilePermissionKeysResult`

Keep on `ITenantProfileAsStaffService` / `TenantProfileAsStaffService`:
- `GetOrCreateDefaultTenantProfileAsync`
- `CreateTenantProfileAsync`
- `UpdateTenantProfileAsync`
- `DeleteTenantProfileAsync`
- `BulkDeleteTenantProfilesAsync`
- `SetTenantProfilePermissionAsync`

Update handlers:
- `FindTenantProfilesAsStaff`
- `GetTenantProfileByIdAsStaff`
- `FindTenantProfilePermissionsAsStaff`

Update DI spec:
- Add `ITenantProfileQueryAsStaffService` -> `TenantProfileQueryAsStaffService`.

## Invariants

- No query behavior, sorting, pagination, permission filtering, tenant scoping, or response mapping changes.
- No handler `DbContext` access.
- No service-to-service dependencies.

## Verification

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Profiles/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantProfilesAsStaffSpec|FullyQualifiedName~GetTenantProfileByIdAsStaffSpec|FullyQualifiedName~FindTenantProfilePermissionsAsStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```
