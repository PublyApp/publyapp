# Issue 432 Staff Profile Core Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the `ProfileAsStaffService` split by moving the remaining staff-profile core workflows into a clearly named focused service, leaving only compatibility types or deleting the old oversized service if it becomes empty.

**Architecture:** Keep the final staff-profile service independent with its own scoped `AppDbContext` and logger dependencies. No service-to-service dependencies. Handlers keep HTTP mapping and audit behavior. This branch is stacked on the previous tenant-profile and staff-profile assignment slices.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #554:
- Current branch: `refactor/432-split-staff-profile-core-service`
- Base branch for PR: `refactor/432-split-staff-profile-assignment-service`

## Scope

Move remaining staff-profile core workflows from `IProfileAsStaffService` / `ProfileAsStaffService` into `StaffProfileAsStaffService`:

- `FindStaffProfilesAsync`
- `GetStaffProfileByIdAsync`
- `CreateStaffProfileAsync`
- `UpdateStaffProfileAsync`
- `DeleteStaffProfileAsync`
- `BulkDeleteStaffProfilesAsync`
- `FindStaffProfilePermissionKeysAsync`
- `SetStaffProfilePermissionAsync`

Move remaining staff-profile args/results/list records those methods need, without renaming public records unless required by compiler/type conflicts.

If `ProfileAsStaffService.cs` becomes only the old interface and shared bulk result records, prefer deleting/renaming the old interface and leaving shared records in a small neutral file such as `ProfileBulkActionResults.cs`. Do not leave a misleading `[Service] ProfileAsStaffService` shell.

## Files likely touched

Create/rename as needed:
- `apps/api/Modules/Profiles/Services/StaffProfileAsStaffService.cs`
- `apps/api/Modules/Profiles/Services/ProfileBulkActionResults.cs` if shared records need a neutral home

Modify:
- `apps/api/Modules/Profiles/Services/ProfileAsStaffService.cs` (likely remove or shrink/delete)
- Staff-profile core handlers under `apps/api/Modules/Profiles/Handlers/Staff/`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`
- this plan file

## Behavior invariants

- No new staff-default workflow is introduced; this slice only moves existing staff-profile core workflows.
- Staff-profile name uniqueness/soft-delete behavior remains unchanged.
- Staff-profile permission assignment/unassignment behavior remains unchanged.
- Bulk delete behavior and failed-item ordering remain unchanged.
- User/profile assignment service and tenant-profile service stay independent.
- No handler gains direct DbContext access.

### Task 1: Extract final staff-profile service

- [x] Create `IStaffProfileAsStaffService` and `[Service(ServiceLifetime.Scoped)] StaffProfileAsStaffService` with `AppDbContext` + `ILogger<StaffProfileAsStaffService>`.
- [x] Move the eight staff-profile core methods listed in Scope from `ProfileAsStaffService`.
- [x] Move remaining staff-profile args/results/list records and private helpers required by those methods.
- [x] Remove `IProfileAsStaffService` / `ProfileAsStaffService` if no longer needed; otherwise leave only non-service neutral shared records.
- [x] Keep `BulkProfileActionResult` / `BulkProfileActionFailedItem` available to both tenant-profile and staff-profile services, preferably in a neutral records file.

### Task 2: Update handlers and specs

- [x] Update staff-profile core handlers to inject/use `IStaffProfileAsStaffService` instead of `IProfileAsStaffService`.
- [x] Keep staff-profile assignment handlers on `IStaffProfileUserAssignmentAsStaffService`.
- [x] Keep tenant-profile handlers on `ITenantProfileAsStaffService`.
- [x] Confirm no default staff-profile setup updates are needed because no default staff-profile workflow exists on this branch.

### Task 3: Update DI/architecture specs

- [x] Add `(typeof(IStaffProfileAsStaffService), typeof(StaffProfileAsStaffService)),` to `ServiceAttributeRegistration.Spec.cs`.
- [x] Remove old `(typeof(IProfileAsStaffService), typeof(ProfileAsStaffService))` if the old service/interface is deleted.
- [x] Move `CreateStaffProfileAsync` args-record convention assertion from `IProfileAsStaffService` to `IStaffProfileAsStaffService`.

### Task 4: Verification and commit

Run:

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Profiles/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~CreateStaffProfileAsStaffSpec|FullyQualifiedName~FindStaffProfilesAsStaffSpec|FullyQualifiedName~GetStaffProfileByIdAsStaffSpec|FullyQualifiedName~UpdateStaffProfileAsStaffSpec|FullyQualifiedName~DeleteStaffProfileAsStaffSpec|FullyQualifiedName~BulkDeleteStaffProfilesAsStaffSpec|FullyQualifiedName~StaffProfilePermissionsAsStaffSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```

Then commit:

```bash
git add apps/api/Modules/Profiles apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs docs/superpowers/plans/2026-05-31-issue-432-staff-profile-core-service.md
git commit -m "refactor(api): split staff profile core service"
```
