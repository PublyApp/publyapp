# Issue 432 Invitation Acceptance Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split invitation acceptance/account-provisioning workflows out of `InvitationService` into a focused `InvitationAcceptanceService` stacked on the invitation revoke-service PR.

**Architecture:** Keep `InvitationAcceptanceService` independent with its own scoped `AppDbContext` dependency and no service-to-service dependencies. The anonymous handler keeps token lookup, session validation, password hashing, account conflict checks, session creation, and audit logging; the new service owns only the acceptance/provisioning transactions.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #551:
- Current branch: `refactor/432-split-invitation-acceptance-service`
- Base branch for PR: `refactor/432-split-invitation-revoke-service`
- Do not target this PR at `develop`, or the diff will include query/revoke-service work.

## Scope

Move only these acceptance/provisioning workflows from `IInvitationService` / `InvitationService`:

- `AcceptStaffInvitationAsync`
- `AcceptTenantInvitationAsync`
- `AcceptTenantInvitationForExistingUserAsync`
- `MarkInvitationAsAcceptedAsync`

Move only these acceptance args records:

- `AcceptStaffInvitationArgs`
- `AcceptTenantInvitationArgs`

Do not move creation, validation, query, revoke, session, audit, password hashing, or account-conflict precheck logic.

## Files

Create:
- `apps/api/Modules/Invitations/Services/InvitationAcceptanceService.cs`

Modify:
- `apps/api/Modules/Invitations/Services/InvitationService.cs`
- `apps/api/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`
- `docs/superpowers/plans/2026-05-31-issue-432-invitation-acceptance-service.md`

Do not edit prior stack plans.

## Behavior invariants

- `InvitationQueryService.GetInvitationByTokenAsync` must stay tracking-enabled.
- `AcceptInvitation` passes the tracked `Invitation` entity into the acceptance service in the same request scope.
- The new acceptance service must be scoped and must inject the same scoped `AppDbContext` type, not a factory/new scope.
- Existing transaction boundaries inside acceptance methods must remain intact.
- Audit/session side effects stay in the handler after the acceptance transaction commits.
- Existing account conflict/session-token checks stay in the handler.

### Task 1: Extract acceptance service

**Files:**
- Create: `apps/api/Modules/Invitations/Services/InvitationAcceptanceService.cs`
- Modify: `apps/api/Modules/Invitations/Services/InvitationService.cs`

- [x] **Step 1: Create service/interface file**

Create `IInvitationAcceptanceService` and `[Service(ServiceLifetime.Scoped)] public sealed class InvitationAcceptanceService : IInvitationAcceptanceService` in namespace `PublyApp.Api.Modules.Invitations.Services`.

Constructor:

```csharp
public InvitationAcceptanceService(AppDbContext dbContext, ILogger<InvitationAcceptanceService> logger) {
	_dbContext = dbContext;
	_logger = logger;
}
```

- [x] **Step 2: Move args records**

Move these records unchanged from `InvitationService.cs` into `InvitationAcceptanceService.cs`:

```csharp
public sealed record AcceptStaffInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);

public sealed record AcceptTenantInvitationArgs(
	Invitation Invitation,
	string FirstName,
	string LastName,
	string PasswordHash
);
```

- [x] **Step 3: Move acceptance methods exactly**

Move these public methods from `InvitationService` to `InvitationAcceptanceService`:

- `AcceptStaffInvitationAsync`
- `AcceptTenantInvitationAsync`
- `AcceptTenantInvitationForExistingUserAsync`
- `MarkInvitationAsAcceptedAsync`

Keep method bodies behavior-preserving except logger generic type names.

- [x] **Step 4: Remove interface members from `IInvitationService`**

Remove the four acceptance methods from `IInvitationService`; keep creation and validation helpers there.

### Task 2: Update anonymous acceptance handler

**Files:**
- Modify: `apps/api/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`

- [x] **Step 1: Inject `IInvitationAcceptanceService`**

Add `IInvitationAcceptanceService invitationAcceptanceService` beside the existing `IInvitationQueryService` and `IInvitationService` parameters.

Keep `IInvitationService` for `UserExistsAsync`.

- [x] **Step 2: Route acceptance calls to new service**

Replace only these calls:

```csharp
invitationService.AcceptTenantInvitationForExistingUserAsync(...)
invitationService.AcceptStaffInvitationAsync(...)
invitationService.AcceptTenantInvitationAsync(...)
```

with:

```csharp
invitationAcceptanceService.AcceptTenantInvitationForExistingUserAsync(...)
invitationAcceptanceService.AcceptStaffInvitationAsync(...)
invitationAcceptanceService.AcceptTenantInvitationAsync(...)
```

Do not alter response mapping, audit logging, session creation, password hashing, or account conflict checks.

### Task 3: Update specs/architecture guards

**Files:**
- Modify: `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- Modify: `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`

- [x] **Step 1: Add DI expected service pair**

Add this tuple adjacent to invitation service registrations:

```csharp
(typeof(IInvitationAcceptanceService), typeof(InvitationAcceptanceService)),
```

- [x] **Step 2: Update args-record convention assertions**

Move positive assertions for these methods from `IInvitationService` to `IInvitationAcceptanceService`:

- `AcceptStaffInvitationAsync`
- `AcceptTenantInvitationAsync`

Keep creation assertions on `IInvitationService`.

### Task 4: Verification and commit

**Files:** all changed files.

- [x] **Step 1: Verify clean stacked diff**

```bash
git diff --name-status refactor/432-split-invitation-revoke-service...HEAD
```

Expected: only acceptance-service extraction files plus this plan.

- [x] **Step 2: Verify no handler DbContext access**

```bash
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Invitations/Handlers
```

Expected: no matches.

- [x] **Step 3: Run targeted DI/architecture + acceptance specs**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AcceptInvitationSpec|FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: pass.

- [x] **Step 4: Build API**

```bash
just build-api
```

Expected: pass with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Modules/Invitations/Services/InvitationAcceptanceService.cs \
  apps/api/Modules/Invitations/Services/InvitationService.cs \
  apps/api/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs \
  apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs \
  apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs \
  docs/superpowers/plans/2026-05-31-issue-432-invitation-acceptance-service.md

git commit -m "refactor(api): split invitation acceptance service"
```
