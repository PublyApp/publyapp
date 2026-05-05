# Cursor Sort Field Handler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated per-service cursor sort handler classes with one shared `CursorSortFieldHandler<TEntity>` helper.

**Architecture:** Add one small generic helper under `MainApi.Src.Lib`. Keep each service's sort handler dictionary inside its current method because cursor lookup delegates capture scoped/request values such as `_dbContext`, `cancellationToken`, `tenantId`, and `args.TenantId`. Replace only the duplicated helper type, not the existing EF keyset expressions.

**Tech Stack:** .NET 10, C#, EF Core, minimal APIs, existing cursor/keyset pagination patterns, `just`

---

## File Map

**Create**
- `apps/api/Src/Lib/CursorSortFieldHandler.cs`
  Shared generic cursor sort handler type.

**Modify**
- `apps/api/Src/Modules/Users/Services/UserService.cs`
  Replace two `SortFieldHandler` dictionaries and remove the nested `SortFieldHandler`.
- `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
  Replace two `SortFieldHandler` dictionaries and remove the nested `SortFieldHandler`.
- `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
  Replace two `SortFieldHandler` dictionaries and remove the nested `SortFieldHandler`.
- `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
  Replace the `SortFieldHandler` dictionary and remove the nested `SortFieldHandler`.
- `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`
  Replace the `SortFieldHandler` dictionary and remove the nested `SortFieldHandler`.
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
  Replace the `TenantSortFieldHandler` dictionary and remove the nested `TenantSortFieldHandler`.
- `docs/guides/cursor-keyset-pagination-guide.md`
  Update examples to use `CursorSortFieldHandler<TEntity>` and remove private helper guidance.

**Reference**
- `docs/superpowers/specs/2026-05-02-cursor-sort-field-handler-design.md`
  Approved design and scope decisions.

## Task 1: Add The Shared Helper

**Files:**
- Create: `apps/api/Src/Lib/CursorSortFieldHandler.cs`

- [ ] **Step 1: Confirm the current duplicate helper inventory**

Run:

```powershell
rg -n "private class SortFieldHandler|private class TenantSortFieldHandler|new SortFieldHandler|new TenantSortFieldHandler|Dictionary<string, SortFieldHandler>|Dictionary<string, TenantSortFieldHandler>" apps/api/Src
```

Expected:

```text
Matches in UserService.cs, InvitationService.cs, ProfileAsStaffService.cs,
AuditLogQueryService.cs, SystemNoticeService.cs, and TenantAsStaffService.cs.
No CursorSortFieldHandler matches yet.
```

- [ ] **Step 2: Create `CursorSortFieldHandler.cs`**

Add this exact file:

```csharp
namespace MainApi.Src.Lib;

public sealed class CursorSortFieldHandler<TEntity>(
	Func<Guid, Task<object?>> getCursorValue,
	Func<IQueryable<TEntity>, object?, bool, IQueryable<TEntity>> applyFilter,
	Func<IQueryable<TEntity>, bool, IQueryable<TEntity>> applyOrdering
) {
	public Func<Guid, Task<object?>> GetCursorValue { get; } = getCursorValue;

	public Func<IQueryable<TEntity>, object?, bool, IQueryable<TEntity>>
		ApplyFilter { get; } = applyFilter;

	public Func<IQueryable<TEntity>, bool, IQueryable<TEntity>>
		ApplyOrdering { get; } = applyOrdering;
}
```

- [ ] **Step 3: Build after adding the helper**

Run:

```powershell
just build-api
```

Expected: PASS. The new public generic helper has no XML comments, so it does not add OpenAPI generic documentation risk.

- [ ] **Step 4: Commit the shared helper**

Run:

```powershell
git add apps/api/Src/Lib/CursorSortFieldHandler.cs
git commit -m "refactor(api): add cursor sort field handler"
```

## Task 2: Replace Service-Local Helper Types

**Files:**
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- Modify: `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
- Modify: `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`
- Modify: `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

- [ ] **Step 1: Update `UserService.cs`**

Apply these replacements in `apps/api/Src/Modules/Users/Services/UserService.cs`:

```text
Dictionary<string, SortFieldHandler>
```

becomes:

```text
Dictionary<string, CursorSortFieldHandler<UserAccount>>
```

```text
new SortFieldHandler(
```

becomes:

```text
new CursorSortFieldHandler<UserAccount>(
```

```text
out SortFieldHandler? handler
```

becomes:

```text
out CursorSortFieldHandler<UserAccount>? handler
```

Delete the nested helper block that starts with:

```csharp
private class SortFieldHandler(
	Func<Guid, Task<object?>> getCursorValue,
```

and ends immediately before:

```csharp
public async Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
```

- [ ] **Step 2: Update `InvitationService.cs`**

Apply these replacements in `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`:

```text
Dictionary<string, SortFieldHandler>
```

becomes:

```text
Dictionary<string, CursorSortFieldHandler<Invitation>>
```

```text
new SortFieldHandler(
```

becomes:

```text
new CursorSortFieldHandler<Invitation>(
```

```text
out SortFieldHandler? handler
```

becomes:

```text
out CursorSortFieldHandler<Invitation>? handler
```

Delete the nested helper block that starts with:

```csharp
private class SortFieldHandler {
	public Func<Guid, Task<object?>> GetCursorValue { get; }
```

and ends immediately before:

```csharp
private async Task<RevokeInvitationForStaffResult> RevokeInvitationInternalAsync(
```

- [ ] **Step 3: Update `ProfileAsStaffService.cs`**

Apply these replacements in `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`:

```text
Dictionary<string, SortFieldHandler>
```

becomes:

```text
Dictionary<string, CursorSortFieldHandler<Profile>>
```

```text
new SortFieldHandler(
```

becomes:

```text
new CursorSortFieldHandler<Profile>(
```

```text
out SortFieldHandler? handler
```

becomes:

```text
out CursorSortFieldHandler<Profile>? handler
```

Delete the nested helper block that starts with:

```csharp
/// <summary>
/// Handler for a specific sort field in keyset pagination.
```

and ends at the final closing brace immediately before the service class closing brace:

```csharp
	}
}
```

After deletion, the file must still end with one closing brace for `ProfileAsStaffService`.

- [ ] **Step 4: Update `AuditLogQueryService.cs`**

Apply these replacements in `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`:

```text
Dictionary<string, SortFieldHandler>
```

becomes:

```text
Dictionary<string, CursorSortFieldHandler<AuditLog>>
```

```text
new SortFieldHandler(
```

becomes:

```text
new CursorSortFieldHandler<AuditLog>(
```

```text
out SortFieldHandler? handler
```

becomes:

```text
out CursorSortFieldHandler<AuditLog>? handler
```

Delete the nested helper block that starts with:

```csharp
private class SortFieldHandler {
	public Func<Guid, Task<object?>>
```

and ends immediately before the service class closing brace:

```csharp
	}
}
```

- [ ] **Step 5: Update `SystemNoticeService.cs`**

Apply these replacements in `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`:

```text
Dictionary<string, SortFieldHandler>
```

becomes:

```text
Dictionary<string, CursorSortFieldHandler<SystemNotice>>
```

```text
new SortFieldHandler(
```

becomes:

```text
new CursorSortFieldHandler<SystemNotice>(
```

```text
out SortFieldHandler? handler
```

becomes:

```text
out CursorSortFieldHandler<SystemNotice>? handler
```

Delete the nested helper block that starts with:

```csharp
private class SortFieldHandler {
	public Func<Guid, Task<object?>> GetCursorValue { get; }
```

and ends immediately before the service class closing brace:

```csharp
	}
}
```

- [ ] **Step 6: Update `TenantAsStaffService.cs`**

Apply these replacements in `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`:

```text
Dictionary<string, TenantSortFieldHandler>
```

becomes:

```text
Dictionary<string, CursorSortFieldHandler<Tenant>>
```

```text
new TenantSortFieldHandler(
```

becomes:

```text
new CursorSortFieldHandler<Tenant>(
```

```text
out TenantSortFieldHandler? handler
```

becomes:

```text
out CursorSortFieldHandler<Tenant>? handler
```

Delete the nested helper block that starts with:

```csharp
// SortFieldHandler for Tenant entity only
private class TenantSortFieldHandler {
```

and ends immediately before:

```csharp
public async Task<CreateTenantWithInitialUsersResult> CreateTenantWithInitialUsersAsync(
```

The existing `applyOrdering` lambdas may keep returning `IOrderedQueryable<Tenant>`; the shared helper accepts them because `IOrderedQueryable<Tenant>` is assignable to `IQueryable<Tenant>`.

- [ ] **Step 7: Confirm no service-local helper references remain**

Run:

```powershell
rg -n "private class SortFieldHandler|private class TenantSortFieldHandler|new SortFieldHandler|new TenantSortFieldHandler|Dictionary<string, SortFieldHandler>|Dictionary<string, TenantSortFieldHandler>|out SortFieldHandler|out TenantSortFieldHandler" apps/api/Src
```

Expected: no matches.

Run:

```powershell
rg -n "CursorSortFieldHandler" apps/api/Src/Lib apps/api/Src/Modules
```

Expected: matches in `CursorSortFieldHandler.cs` and the six service files.

- [ ] **Step 8: Build after service migration**

Run:

```powershell
just build-api
```

Expected: PASS.

- [ ] **Step 9: Commit the service migration**

Run:

```powershell
git add apps/api/Src/Modules/Users/Services/UserService.cs apps/api/Src/Modules/Invitations/Services/InvitationService.cs apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs
git commit -m "refactor(api): use shared cursor sort handlers"
```

## Task 3: Update Cursor Pagination Documentation

**Files:**
- Modify: `docs/guides/cursor-keyset-pagination-guide.md`

- [ ] **Step 1: Replace the service example dictionary type**

In the Step 3 service example, replace the old dictionary declaration:

```csharp
var sortFieldHandlers = new Dictionary<string, SortFieldHandler> {
```

with:

```csharp
var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<YourEntity>>(
    StringComparer.OrdinalIgnoreCase
) {
```

- [ ] **Step 2: Replace example constructor names**

In the same example code block, replace each constructor:

```csharp
new SortFieldHandler(
```

with:

```csharp
new CursorSortFieldHandler<YourEntity>(
```

- [ ] **Step 3: Remove obsolete `getOffset` arguments from the guide example**

Delete each `getOffset` argument block from the Step 3 service example. The final `id` example entry must have exactly these three named arguments:

```csharp
["id"] = new CursorSortFieldHandler<YourEntity>(
    getCursorValue: async (guid) => {
        var entity = await _dbContext.YourEntity.FindAsync(guid);
        return entity?.Id;
    },
    applyFilter: (q, cursorValue, isAsc) => {
        var cursorGuid = (Guid?)cursorValue;
        if (cursorGuid is null) return q;
        return isAsc
            ? q.Where(e => e.Id > cursorGuid)
            : q.Where(e => e.Id < cursorGuid);
    },
    applyOrdering: (q, isAsc) => isAsc
        ? q.OrderBy(e => e.Id)
        : q.OrderByDescending(e => e.Id)
),
```

The `name`, `created_at`, and `related_count` example entries must also keep only `getCursorValue`, `applyFilter`, and `applyOrdering`.

- [ ] **Step 4: Replace the private helper section**

Replace this section heading and private class block:

```markdown
// STEP 3.8: Define SortFieldHandler Helper Class
```

through the closing brace of the private helper class.

with this note:

```csharp
// CursorSortFieldHandler<TEntity> lives in MainApi.Src.Lib.
// Do not define a private SortFieldHandler helper in each service.
```

- [ ] **Step 5: Update guide wording and checklist entries**

Replace these phrases:

```text
SortFieldHandler
```

with:

```text
CursorSortFieldHandler<TEntity>
```

only where the guide is naming the helper type or checklist item. Do not change prose that refers generically to sort fields.

The quick reference checklist entry must read:

```markdown
- [ ] Implemented `CursorSortFieldHandler<TEntity>` entries for each sortable field
```

- [ ] **Step 6: Update complete example paths**

Replace the stale complete example paths:

```markdown
- Service: `apps/api/Src/Features/Staff/ProfileAsStaff/ProfileAsStaffService.cs`
- Handler: `apps/api/Src/Features/Staff/ProfileAsStaff/Handlers/FindStaffProfiles.cs`
```

with:

```markdown
- Service: `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
- Handler: `apps/api/Src/Modules/Profiles/Handlers/Staff/FindStaffProfiles.cs`
```

- [ ] **Step 7: Confirm the guide no longer teaches private helper classes**

Run:

```powershell
rg -n "private class SortFieldHandler|new SortFieldHandler|Dictionary<string, SortFieldHandler>|getOffset" docs/guides/cursor-keyset-pagination-guide.md
```

Expected: no matches.

Run:

```powershell
rg -n "CursorSortFieldHandler" docs/guides/cursor-keyset-pagination-guide.md
```

Expected: matches in the implementation guide and quick reference checklist.

- [ ] **Step 8: Commit the documentation update**

Run:

```powershell
git add docs/guides/cursor-keyset-pagination-guide.md
git commit -m "docs: use shared cursor sort handler in guide"
```

## Task 4: Verify Behavior And Scope

**Files:**
- Review: all files modified in Tasks 1-3

- [ ] **Step 1: Verify no API contract generation is needed**

Run:

```powershell
git diff --name-only HEAD~3..HEAD
```

Expected changed paths are limited to:

```text
apps/api/Src/Lib/CursorSortFieldHandler.cs
apps/api/Src/Modules/Users/Services/UserService.cs
apps/api/Src/Modules/Invitations/Services/InvitationService.cs
apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs
apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs
apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs
apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs
docs/guides/cursor-keyset-pagination-guide.md
```

No handler DTO, endpoint route, OpenAPI schema, migration, or frontend client file should be changed.

- [ ] **Step 2: Run final API build**

Run:

```powershell
just build-api
```

Expected: PASS.

- [ ] **Step 3: Run affected integration specs when Docker is available**

Run each command from `apps/api`:

```powershell
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUserSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindAuditLogsSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindSystemNoticesSpec"
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantsAsStaffSpec"
```

Expected: PASS for each command. If Docker is unavailable, record that these were skipped because the test suite requires Testcontainers/Postgres.

- [ ] **Step 4: Check for whitespace or patch formatting issues**

Run:

```powershell
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit verification notes only if implementation changed after prior commits**

If a verification fix changed code or docs, commit it:

```powershell
git add apps/api/Src docs/guides/cursor-keyset-pagination-guide.md
git commit -m "fix(api): clean up cursor sort handler migration"
```

If no files changed, do not create an empty commit.

## Self-Review

- Spec coverage: the plan adds `CursorSortFieldHandler<TEntity>`, migrates all six duplicate helper variants, updates the cursor pagination guide, keeps per-method dictionaries, and avoids API/client/database changes.
- Placeholder scan: no banned placeholder markers or undefined implementation tasks remain.
- Type consistency: every service maps to the entity type from the approved design: `UserAccount`, `Invitation`, `Profile`, `AuditLog`, `SystemNotice`, and `Tenant`.
- Verification coverage: the plan requires `just build-api`, duplicate-reference scans, documentation scans, and targeted affected integration specs when Docker is available.
