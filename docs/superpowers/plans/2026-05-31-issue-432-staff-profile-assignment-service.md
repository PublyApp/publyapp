# Issue 432 Staff Profile Assignment Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split staff-profile user assignment workflows out of `ProfileAsStaffService` into a focused `StaffProfileUserAssignmentAsStaffService` stacked on the tenant-profile service PR.

**Architecture:** Keep `StaffProfileUserAssignmentAsStaffService` independent with its own scoped `AppDbContext` and logger dependencies. Handlers for staff-profile user listing/resolution/unassignment should inject the narrower interface. Do not move staff-profile core CRUD/permissions or staff-profile creation in this PR.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #553:
- Current branch: `refactor/432-split-staff-profile-assignment-service`
- Base branch for PR: `refactor/432-split-tenant-profile-service`

## Scope

Move only these staff-profile user assignment workflows from `IProfileAsStaffService` / `ProfileAsStaffService`:

- `FindStaffProfileUsersAsync`
- `ResolveStaffProfileUserAssignmentsAsync`
- `UnassignStaffProfileUsersAsync`

Move only the assignment args/results/list item records those methods need:

- `StaffProfileUserListItem`
- `FindStaffProfileUsersArgs`
- `FindStaffProfileUsersServiceResult`
- `StaffProfileUserAssignmentResolutionItem`
- `ResolveStaffProfileUserAssignmentsArgs`
- `ResolveStaffProfileUserAssignmentsServiceResult`
- `UnassignStaffProfileUsersArgs`
- `UnassignStaffProfileUsersServiceResult`

Do not move staff-profile core CRUD, permissions, tenant-profile workflows, or staff-profile creation.

## Files

Create:
- `apps/api/Modules/Profiles/Services/StaffProfileUserAssignmentAsStaffService.cs`

Modify:
- `apps/api/Modules/Profiles/Services/ProfileAsStaffService.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/FindStaffProfileUsers.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/ResolveStaffProfileUserAssignments.cs`
- `apps/api/Modules/Profiles/Handlers/Staff/UnassignStaffProfileUsers.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `docs/superpowers/plans/2026-05-31-issue-432-staff-profile-assignment-service.md`

## Behavior invariants

- User assignment resolution remains read-only.
- Unassignment still hard-deletes profile/account junction rows as before.
- Query sorting/pagination/result shapes remain unchanged.
- Handlers keep HTTP result mapping and permission behavior.

### Task 1: Extract assignment service

- [x] Create `IStaffProfileUserAssignmentAsStaffService` and `[Service(ServiceLifetime.Scoped)] StaffProfileUserAssignmentAsStaffService` with `AppDbContext` + `ILogger<StaffProfileUserAssignmentAsStaffService>`.
- [x] Move the three assignment methods and their args/results/list item records without renaming public types.
- [x] Remove the moved methods from `IProfileAsStaffService`, leaving staff core/creation methods there.

### Task 2: Update handlers

- [x] Update `FindStaffProfileUsers.cs`, `ResolveStaffProfileUserAssignments.cs`, and `UnassignStaffProfileUsers.cs` to inject/use `IStaffProfileUserAssignmentAsStaffService`.
- [x] Do not change response mapping or route behavior.

### Task 3: Update DI/specs

- [x] Add `(typeof(IStaffProfileUserAssignmentAsStaffService), typeof(StaffProfileUserAssignmentAsStaffService)),` to `ServiceAttributeRegistration.Spec.cs`.
- [x] Update `ServiceArgsRecordConvention.Spec.cs` only if it has assertions for moved methods.

### Task 4: Verification and commit

Run:

```bash
git diff --check
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Profiles/Handlers
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffProfileUsersSpec|FullyQualifiedName~ResolveStaffProfileUserAssignmentsSpec|FullyQualifiedName~UnassignStaffProfileUsersSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
just build-api
```

Then commit:

```bash
git add apps/api/Modules/Profiles apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs docs/superpowers/plans/2026-05-31-issue-432-staff-profile-assignment-service.md
git commit -m "refactor(api): split staff profile assignment service"
```
