# Issue 219 AsNoTracking Cursor Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `AsNoTracking()` consistently to read-only cursor-paginated API
queries without changing endpoint behavior or API contracts.

**Architecture:** This is a mechanical EF Core query cleanup. Cursor-paginated
services should build no-tracking query pipelines for read-only list rows,
cursor-value lookups, and secondary metadata reads used by those list DTOs.
Mutation flows, tracked update targets, endpoint contracts, and pagination
semantics stay unchanged.

**Tech Stack:** .NET 10, EF Core, Minimal APIs, xUnit integration specs,
Markdown docs.

---

## File Map

**API service files to modify**

- `apps/api/Src/Modules/Users/Services/UserService.cs`
  - Add no-tracking to cursor lookup queries and base list queries in
    `FindStaffUsersAsync` and `FindTenantUsersAsync`.
- `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`
  - Add no-tracking to cursor lookup queries, base list queries, and grouped
    metadata reads in `FindTenantProfilesAsync` and `FindStaffProfilesAsync`.
- `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
  - Add no-tracking to cursor lookup queries, base list queries, joins, and
    profile-name metadata reads in `FindStaffInvitationsAsync` and
    `FindTenantInvitationsAsync`.
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
  - Add no-tracking to cursor lookup queries, base list query, and user-count
    metadata read in `FindTenantsAsStaffAsync`.
- `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`
  - Add no-tracking to cursor lookup queries and base list query in `FindAsync`.
- `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
  - Add no-tracking to the `GetCursorValue` lookup in `FindAsync`; the main
    audit-log list query already uses `AsNoTracking()`.

**Documentation file to modify**

- `docs/guides/cursor-keyset-pagination-guide.md`
  - Update examples and checklist so future cursor-paginated read-only service
    methods include `AsNoTracking()` on base result queries and cursor lookups.

**Files not expected to change**

- No OpenAPI output.
- No generated TypeScript client.
- No EF migration.
- No frontend files.

## Decisions Locked In

- [ ] Scope stays API-only plus documentation.
- [ ] Add `AsNoTracking()` only to read-only query paths.
- [ ] Do not add `AsNoTracking()` to queries that return entities for mutation.
- [ ] Preserve all route behavior, response shapes, pagination ordering, and
      error handling.
- [ ] Prefer existing query syntax and local service style over refactoring.
- [ ] Run verification after implementation: `just build-api` and targeted API
      specs for cursor list endpoints.

## Task 1: Update User Cursor Queries

**Files:**

- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs`

- [ ] In `FindStaffUsersAsync`, add `.AsNoTracking()` to every
      `GetCursorValue` query over `_dbContext.UserAccount`.

Example target shape:

```csharp
from ua in _dbContext.UserAccount.AsNoTracking()
where ua.UserId == guid
    && ua.Scope == AccountScope.Staff
    && !ua.IsDeleted
    && !ua.User.IsDeleted
select new {
    ua.User.CreatedAt,
    ua.UserId,
}
```

- [ ] In `FindStaffUsersAsync`, add `.AsNoTracking()` to the base list query.

Example target shape:

```csharp
var baseQuery =
    from ua in _dbContext.UserAccount.AsNoTracking()
    where ua.Scope == AccountScope.Staff
        && !ua.IsDeleted
        && !ua.User.IsDeleted
    select ua;
```

- [ ] In `FindTenantUsersAsync`, add `.AsNoTracking()` to every
      `GetCursorValue` query over `_dbContext.UserAccount`.

- [ ] In `FindTenantUsersAsync`, add `.AsNoTracking()` to the base list query.

- [ ] Do not touch tracked queries used later in mutation flows.

## Task 2: Update Profile Cursor Queries

**Files:**

- Modify: `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`

- [ ] In `FindTenantProfilesAsync`, add `.AsNoTracking()` to every
      `_dbContext.Profile` cursor lookup query.

- [ ] In `FindTenantProfilesAsync`, add `.AsNoTracking()` to the base
      `_dbContext.Profile` list query.

- [ ] In `FindTenantProfilesAsync`, add `.AsNoTracking()` to the
      `_dbContext.UserAccountProfile` grouped count query.

- [ ] In `FindStaffProfilesAsync`, add `.AsNoTracking()` to every
      `_dbContext.Profile` cursor lookup query.

- [ ] In `FindStaffProfilesAsync`, add `.AsNoTracking()` to the base
      `_dbContext.Profile` list query.

- [ ] Keep profile create/update/delete and permission mutation queries tracked.

## Task 3: Update Invitation Cursor Queries

**Files:**

- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`

- [ ] In `FindStaffInvitationsAsync`, add `.AsNoTracking()` to every
      `_dbContext.Invitation` cursor lookup query.

- [ ] In `FindStaffInvitationsAsync`, add `.AsNoTracking()` to the base
      `_dbContext.Invitation` list query.

- [ ] In `FindStaffInvitationsAsync`, add `.AsNoTracking()` to the inviter
      `_dbContext.User` join source.

- [ ] In `FindStaffInvitationsAsync`, add `.AsNoTracking()` to the
      `_dbContext.InvitationProfile` and `_dbContext.Profile` sources used for
      profile-name metadata.

- [ ] Repeat the same read-only no-tracking updates in
      `FindTenantInvitationsAsync`.

- [ ] Leave invitation accept/revoke/create flows tracked.

## Task 4: Update Tenant, System Notice, and Audit Log Cursor Queries

**Files:**

- Modify: `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
- Modify: `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`
- Modify: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`

- [ ] In `FindTenantsAsStaffAsync`, add `.AsNoTracking()` to all
      `_dbContext.Tenant` cursor lookup queries.

- [ ] In `FindTenantsAsStaffAsync`, add `.AsNoTracking()` to the base tenant
      list query.

- [ ] In `FindTenantsAsStaffAsync`, add `.AsNoTracking()` to the
      `_dbContext.UserAccount` grouped user-count query.

- [ ] In `SystemNoticeService.FindAsync`, add `.AsNoTracking()` to all
      `_dbContext.SystemNotice` cursor lookup queries.

- [ ] In `SystemNoticeService.FindAsync`, add `.AsNoTracking()` to the base
      system-notice list query.

- [ ] In `AuditLogQueryService.FindAsync`, add `.AsNoTracking()` to the
      `_dbContext.AuditLog` cursor lookup query.

- [ ] Keep existing `AuditLogQueryService` main list query no-tracking; do not
      duplicate or restructure it.

## Task 5: Update Cursor Pagination Documentation

**Files:**

- Modify: `docs/guides/cursor-keyset-pagination-guide.md`

- [ ] Update the Step 3 implementation example so every `GetCursorValue` query
      uses `.AsNoTracking()`.

- [ ] Update the Step 3 base query example so it starts from
      `_dbContext.YourEntity.AsNoTracking()`.

- [ ] Add a Best Practice section before projection guidance:

```markdown
### 2. Use `AsNoTracking()` for Read-Only Cursor Queries

Cursor-paginated list methods are read-only. Add `AsNoTracking()` to the base
result query and to each `GetCursorValue` lookup query so EF Core does not track
entities that will never be updated. Apply the same rule to secondary metadata
queries used only to hydrate list DTOs.
```

- [ ] Update the Quick Reference Checklist with:

```markdown
- [ ] Added `AsNoTracking()` to read-only cursor lookup queries
- [ ] Added `AsNoTracking()` to the read-only base result query
```

- [ ] Renumber later Best Practice headings if needed.

## Task 6: Verify and Review

**Files:**

- No new files expected.

- [ ] Run API build:

```powershell
just build-api
```

Expected: build succeeds with 0 errors.

- [ ] Run targeted cursor list specs:

```powershell
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffUser|FullyQualifiedName~FindTenantUsersAsStaff|FullyQualifiedName~FindStaffProfiles|FullyQualifiedName~FindTenantProfilesAsStaff|FullyQualifiedName~FindStaffInvitations|FullyQualifiedName~FindInvitationsForTenantAsStaff|FullyQualifiedName~FindTenantsAsStaff|FullyQualifiedName~FindSystemNotices|FullyQualifiedName~FindAuditLogs"
```

Expected: targeted specs pass.

- [ ] Run a final grep check for cursor-paginated service methods that still
      build read-only base queries without `AsNoTracking()`:

```powershell
rg "CursorPaginatedResult<|new CursorSortFieldHandler|Take\\(effectiveLimit \\+ 1\\)|AsNoTracking\\(" apps/api/Src/Modules -g "*Service.cs" -n
```

Expected: every cursor list method reviewed in this plan has no-tracking on its
read-only cursor lookup and base list queries.

- [ ] Confirm no contract artifacts changed:

```powershell
git status --short
```

Expected: only service files and `docs/guides/cursor-keyset-pagination-guide.md`
changed, unless the build regenerates unchanged OpenAPI content.

## Residual Risks

- Integration tests cannot directly prove EF tracking state without adding
  instrumentation to service methods. Treat this as a performance/refactor
  change and rely on build plus existing cursor-list behavior specs.
- Some secondary read-only metadata queries are not cursor lookups, but they are
  part of cursor-list hydration. Including them keeps the issue's consistency
  goal intact without broadening into unrelated service methods.
