# Issue 432 Invitation Revoke Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split invitation revocation workflows out of `InvitationService` into a focused `InvitationRevokeService` stacked on the invitation query-service PR.

**Architecture:** Keep `InvitationRevokeService` independent: it owns its own `AppDbContext` dependency and does not call `InvitationService` or `InvitationQueryService`. Revoke handlers should inject the narrower revoke interface. Handler-level audit logging remains in handlers and does not move into services.

**Tech Stack:** .NET 10, ASP.NET Minimal APIs, EF Core/PostgreSQL, PublyApp `[Service]` DI scanner, xUnit integration specs.

---

## Stack/base

This branch is stacked on PR #549:
- Current branch: `refactor/432-split-invitation-revoke-service`
- Base branch for PR: `refactor/432-split-invitation-services`
- Do not target this PR at `develop`, or the diff will include PR #549's query-service work.

## Scope

Move only these revoke workflows from `IInvitationService` / `InvitationService`:

- `RevokeInvitationForStaffAsync`
- `BulkRevokeStaffInvitationsAsync`
- `RevokeInvitationForTenantAsStaffAsync`
- private `RevokeInvitationInternalAsync`

Move only these revoke-owned records/constants:

- `RevokeInvitationForStaffResult`
- `BulkStaffInvitationActionFailureReasons`
- `BulkStaffInvitationActionFailedItem`
- `BulkStaffInvitationActionResult`
- `RevokeInvitationForTenantAsStaffResult`

Do not move creation, acceptance, delivery, query, or validation helpers in this PR.

## Files

Create:
- `apps/api/Modules/Invitations/Services/InvitationRevokeService.cs`

Modify:
- `apps/api/Modules/Invitations/Services/InvitationService.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/RevokeInvitationForStaff.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/RevokeInvitationForTenantAsStaff.cs`
- `apps/api/Modules/Invitations/Handlers/Staff/BulkRevokeStaffInvitations.cs`
- `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`
- `docs/superpowers/plans/2026-05-31-issue-432-invitation-revoke-service.md`

Do not edit:
- `docs/superpowers/plans/2026-05-31-issue-432-invitation-query-service.md`
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` unless compilation proves it is required.

## Behavior invariants

- Staff revoke only revokes `InvitationScope.Staff` invitations.
- Tenant-as-staff revoke only revokes `InvitationScope.Tenant` invitations for the supplied tenant ID.
- Already revoked invitations remain success/no-op.
- Accepted invitations fail as already accepted.
- Expired pending invitations can still be revoked.
- Bulk revoke de-duplicates requested IDs, preserves requested order for failed items, treats already revoked as success, saves once, and leaves audit logging in the handler.

### Task 1: Baseline and branch check

**Files:** none.

- [x] **Step 1: Verify stacked branch state**

```bash
git status --short --branch
git log --oneline -3
git diff --name-status refactor/432-split-invitation-services...HEAD
```

Expected: branch `refactor/432-split-invitation-revoke-service`; no unique code diff beyond this plan file before implementation.

### Task 2: Extract `InvitationRevokeService`

**Files:**
- Create: `apps/api/Modules/Invitations/Services/InvitationRevokeService.cs`
- Modify: `apps/api/Modules/Invitations/Services/InvitationService.cs`

- [x] **Step 1: Create service/interface file**

Create `IInvitationRevokeService` and `[Service(ServiceLifetime.Scoped)] public sealed class InvitationRevokeService : IInvitationRevokeService` in namespace `PublyApp.Api.Modules.Invitations.Services`.

Constructor:

```csharp
public InvitationRevokeService(AppDbContext dbContext, ILogger<InvitationRevokeService> logger) {
	_dbContext = dbContext;
	_logger = logger;
}
```

Required dependencies should stay limited to `AppDbContext` and logger.

- [x] **Step 2: Move revoke records/constants**

Move these records/constants from `InvitationService.cs` into `InvitationRevokeService.cs` without renaming them:

```csharp
public abstract record RevokeInvitationForStaffResult {
	public sealed record Success : RevokeInvitationForStaffResult;
	public sealed record NotFound : RevokeInvitationForStaffResult;
	public sealed record AlreadyAccepted : RevokeInvitationForStaffResult;
}

public static class BulkStaffInvitationActionFailureReasons {
	public const string NotFound = "not_found";
	public const string AlreadyAccepted = "already_accepted";
}

public record BulkStaffInvitationActionFailedItem(
	Guid InvitationId,
	string Reason
);

public record BulkStaffInvitationActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffInvitationActionFailedItem> FailedItems
);

public abstract record RevokeInvitationForTenantAsStaffResult {
	public sealed record Success : RevokeInvitationForTenantAsStaffResult;
	public sealed record NotFound : RevokeInvitationForTenantAsStaffResult;
	public sealed record AlreadyAccepted : RevokeInvitationForTenantAsStaffResult;
}
```

- [x] **Step 3: Move revoke methods exactly**

Move these public methods and the private helper from `InvitationService` to `InvitationRevokeService`:

- `RevokeInvitationForStaffAsync`
- `BulkRevokeStaffInvitationsAsync`
- `RevokeInvitationForTenantAsStaffAsync`
- `RevokeInvitationInternalAsync`

Keep method bodies behavior-preserving except logger generic type names.

- [x] **Step 4: Remove interface members from `IInvitationService`**

Remove revoke methods from `IInvitationService`; keep creation, acceptance, validation, and mark-accepted methods there.

### Task 3: Update revoke handlers

**Files:**
- Modify: `apps/api/Modules/Invitations/Handlers/Staff/RevokeInvitationForStaff.cs`
- Modify: `apps/api/Modules/Invitations/Handlers/Staff/RevokeInvitationForTenantAsStaff.cs`
- Modify: `apps/api/Modules/Invitations/Handlers/Staff/BulkRevokeStaffInvitations.cs`

- [x] **Step 1: Inject `IInvitationRevokeService`**

Replace `IInvitationService invitationService` parameters with `IInvitationRevokeService invitationRevokeService` in the three revoke handlers.

- [x] **Step 2: Update calls only**

Replace calls as follows:

```csharp
invitationService.RevokeInvitationForStaffAsync(...)
```

becomes:

```csharp
invitationRevokeService.RevokeInvitationForStaffAsync(...)
```

Apply equivalent substitutions for bulk revoke and tenant-as-staff revoke. Do not change audit logging or response mapping.

### Task 4: Update DI spec

**Files:**
- Modify: `apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs`

- [x] **Step 1: Add expected service pair**

Add this tuple adjacent to invitation service registrations:

```csharp
(typeof(IInvitationRevokeService), typeof(InvitationRevokeService)),
```

Keep the existing query and core invitation service entries.

### Task 5: Verification and commit

**Files:** all changed files.

- [x] **Step 1: Verify clean stacked diff**

```bash
git diff --name-status refactor/432-split-invitation-services...HEAD
```

Expected: only revoke-service extraction files plus this plan.

- [x] **Step 2: Verify no handler DbContext access**

```bash
git grep -n "FromServices.*AppDbContext\|FromServices.*MainApiDbContext" -- apps/api/Modules/Invitations/Handlers
```

Expected: no matches.

- [x] **Step 3: Run targeted DI/architecture specs**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~ServiceAttributeRegistrationSpec|FullyQualifiedName~ServiceArgsRecordConventionSpec"
```

Expected: pass.

- [x] **Step 4: Run targeted revoke specs**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~RevokeInvitationForTenantAsStaffSpec|FullyQualifiedName~BulkRevokeStaffInvitationsSpec"
```

Expected: pass.

- [x] **Step 5: Build API**

```bash
just build-api
```

Expected: pass with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/Modules/Invitations/Services/InvitationRevokeService.cs \
  apps/api/Modules/Invitations/Services/InvitationService.cs \
  apps/api/Modules/Invitations/Handlers/Staff/RevokeInvitationForStaff.cs \
  apps/api/Modules/Invitations/Handlers/Staff/RevokeInvitationForTenantAsStaff.cs \
  apps/api/Modules/Invitations/Handlers/Staff/BulkRevokeStaffInvitations.cs \
  apps/api/Lib/DI/ServiceAttributeRegistration.Spec.cs \
  docs/superpowers/plans/2026-05-31-issue-432-invitation-revoke-service.md

git commit -m "refactor(api): split invitation revoke service"
```
