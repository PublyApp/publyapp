# Issue 432 Invitation Query Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split read/query invitation workflows out of `InvitationService` into a focused `InvitationQueryService` while preserving handler behavior.

**Architecture:** Keep all database access in domain services under `apps/api/Modules/Invitations/Services`. Handlers may inject both the new query service and the remaining command service when a route needs read + mutation behavior, but services must not depend on each other. This PR intentionally avoids docs duplication from PR #547 and avoids acceptance/creation/revoke refactors.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Scope

This follow-up PR for issue #432 extracts only invitation query/read operations:

- `GetInvitationByTokenAsync`
- `GetStaffInvitationByIdAsync`
- `GetStaffInvitationDetailsAsync`
- `FindStaffInvitationsAsync`
- `FindTenantInvitationsAsync`

Do not split invitation creation, revocation, acceptance, delivery, or validation helpers in this PR.

## Files

Create:
- `apps/api/Modules/Invitations/Services/InvitationQueryService.cs`

Modify:
- `apps/api/Modules/Invitations/Services/InvitationService.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/GetStaffInvitation.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/GetStaffInvitationLink.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/ResendStaffInvitation.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs`
- `apps/api/Modules/Invitations/Handlers/Anonymous/GetInvitationDetails.cs`
- `apps/api/Modules/Invitations/Handlers/Anonymous/CheckInvitationToken.cs`
- `apps/api/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` only if method assertions reference moved methods
- `docs/superpowers/plans/2026-05-31-issue-432-invitation-query-service.md`

## Comment policy

Add focused comments only for invariants:
- `GetInvitationByTokenAsync` must keep tracking enabled because anonymous acceptance mutates the returned invitation later in the same scoped `AppDbContext`.
- Query services are read-focused but may include tracking where downstream mutation semantics require it.

Do not add comments narrating obvious queries, saves, or filters.

### Task 1: Baseline checks

**Files:**
- Read: `apps/api/Modules/Invitations/Services/InvitationService.cs`
- Read: changed handlers listed above

- [ ] **Step 1: Verify branch state**

```bash
git status --short --branch
```

Expected: branch `refactor/432-split-invitation-services`, no unrelated changes except this plan file.

- [ ] **Step 2: Run lightweight baseline architecture checks**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --filter "FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: pass.

### Task 2: Extract `InvitationQueryService`

**Files:**
- Create: `apps/api/Modules/Invitations/Services/InvitationQueryService.cs`
- Modify: `apps/api/Modules/Invitations/Services/InvitationService.cs`

- [ ] **Step 1: Create interface and service**

Create `IInvitationQueryService` and `[Service(ServiceLifetime.Scoped)] public sealed class InvitationQueryService : IInvitationQueryService` in namespace `PublyApp.Api.Modules.Invitations.Services`.

Constructor:

```csharp
public InvitationQueryService(AppDbContext dbContext, ILogger<InvitationQueryService> logger) {
	_dbContext = dbContext;
	_logger = logger;
}
```

Public methods to move exactly:
- `GetInvitationByTokenAsync`
- `GetStaffInvitationByIdAsync`
- `GetStaffInvitationDetailsAsync`
- `FindStaffInvitationsAsync`
- `FindTenantInvitationsAsync`

Keep query result/args records in `InvitationService.cs` for this PR unless compilation requires a neutral model file. Keeping result records in the same namespace avoids extra handler churn.

- [ ] **Step 2: Preserve token tracking invariant**

Add a short comment near `GetInvitationByTokenAsync` explaining that the method intentionally returns a tracked invitation because anonymous acceptance mutates it later in the same request scope.

- [ ] **Step 3: Remove moved methods from `IInvitationService` and `InvitationService`**

Remove the five public methods from the old interface/class after copying them to the new service.

### Task 3: Update handlers

**Files:**
- Modify all handlers listed in the Files section.

- [ ] **Step 1: Query-only staff handlers**

Update these to inject `IInvitationQueryService` instead of `IInvitationService`:
- `GetStaffInvitation.cs`
- `GetStaffInvitationLink.cs`
- `ResendStaffInvitation.cs`
- `FindStaffInvitations.cs`
- `FindInvitationsForTenantAsStaff.cs`
- `GetInvitationDetails.cs`

Do not change HTTP result mapping.

- [ ] **Step 2: Mixed anonymous handlers**

Update these to inject both services:
- `CheckInvitationToken.cs`: use `IInvitationQueryService` for `GetInvitationByTokenAsync`, keep `IInvitationService` for `UserExistsAsync`.
- `AcceptInvitation.cs`: use `IInvitationQueryService` for `GetInvitationByTokenAsync`, keep `IInvitationService` for `UserExistsAsync` and accept methods.

Do not move `UserExistsAsync` in this PR.

### Task 4: Update DI and architecture specs

**Files:**
- Modify: `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- Modify: `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` if needed

- [ ] **Step 1: Add DI expected service pair**

Add this pair to `ExpectedServices`:

```csharp
(typeof(IInvitationQueryService), typeof(InvitationQueryService)),
```

Keep `(typeof(IInvitationService), typeof(InvitationService))`.

- [ ] **Step 2: Update service args convention assertions**

If assertions currently target `IInvitationService.FindStaffInvitationsAsync`, update them to `IInvitationQueryService.FindStaffInvitationsAsync`. Keep creation/acceptance/bulk creation assertions on `IInvitationService`.

### Task 5: Verification and commit

**Files:** all changed files.

- [ ] **Step 1: Verify no handler DbContext access**

```bash
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Invitations/Handlers
```

Expected: no matches.

- [ ] **Step 2: Run targeted architecture tests**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --filter "FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: pass.

- [ ] **Step 3: Run targeted invitation behavior tests**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --no-restore --filter "FullyQualifiedName~FindStaffInvitationsSpec|FullyQualifiedName~FindInvitationsForTenantAsStaffSpec|FullyQualifiedName~GetInvitationDetailsSpec|FullyQualifiedName~AcceptInvitationSpec"
```

Expected: pass.

- [ ] **Step 4: Build API**

```bash
just build-api
```

Expected: pass with 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Modules/Invitations apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs docs/superpowers/plans/2026-05-31-issue-432-invitation-query-service.md
git commit -m "refactor(api): split invitation query service"
```
