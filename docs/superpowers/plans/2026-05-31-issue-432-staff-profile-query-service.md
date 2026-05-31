# Issue 432 Staff Profile Query Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Split staff-profile read/query workflows out of oversized `StaffProfileAsStaffService` into a focused query service.

**Architecture:** `StaffProfileQueryAsStaffService` owns staff-profile read models and permission-key reads. `StaffProfileAsStaffService` keeps staff-profile mutations: create/update/delete/bulk-delete/set-permission. Services remain independent and inject their own `AppDbContext`; no service-to-service dependencies.

## Stack/base

- Current branch: `refactor/432-split-staff-profile-query-service`
- Base branch for PR: `refactor/432-split-staff-profile-core-service`

## Scope

Create:
- `IStaffProfileQueryAsStaffService`
- `[Service(ServiceLifetime.Scoped)] StaffProfileQueryAsStaffService`

Move from `IStaffProfileAsStaffService` / `StaffProfileAsStaffService`:
- `FindStaffProfilesAsync`
- `GetStaffProfileByIdAsync`
- `FindStaffProfilePermissionKeysAsync`

Move associated read DTOs/results without renaming public types:
- `StaffProfileItem`
- `FindStaffProfilesResult`
- `FindStaffProfilesArgs`
- `GetStaffProfileByIdServiceResult`
- `FindStaffProfilePermissionKeysResult`

Keep on `IStaffProfileAsStaffService` / `StaffProfileAsStaffService`:
- `UpdateStaffProfileAsync`
- `SetStaffProfilePermissionAsync`
- `CreateStaffProfileAsync`
- `DeleteStaffProfileAsync`
- `BulkDeleteStaffProfilesAsync`

Update handlers:
- `FindStaffProfiles`
- `GetStaffProfileById`
- `FindStaffProfilePermissions`

Update DI spec:
- Add `IStaffProfileQueryAsStaffService` -> `StaffProfileQueryAsStaffService`.

## Invariants

- No query behavior, sorting, pagination, permission filtering, or response mapping changes.
- No handler `DbContext` access.
- No service-to-service dependencies.

## Verification

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Profiles/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffProfilesSpec|FullyQualifiedName~GetStaffProfileByIdSpec|FullyQualifiedName~FindStaffProfilePermissionsSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```
