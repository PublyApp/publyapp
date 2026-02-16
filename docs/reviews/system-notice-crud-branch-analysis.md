# System Notice CRUD Endpoints - Branch Analysis

**Branch:** `claude/system-notice-crud-endpoints-ZmhH4`
**Issue:** [#169](https://github.com/radandevist/publyapp/issues/169)
**Analysis Date:** 2026-02-12

---

## Executive Summary

The branch contains a near-complete backend implementation of all 6 endpoints from issue #169. The vertical slice architecture is well-followed and the overall code quality is good. However, the branch has **2 blocking issues** (app won't work as-is), **3 bugs** (logic errors that would cause incorrect behavior), and **several compliance/quality improvements** to align with current codebase conventions.

---

## 1. What Is Already Done

### Fully Implemented (11 files)

| Component | File | Status |
|-----------|------|--------|
| Entity | `Entities/SystemNotice.cs` | Complete |
| Service (interface + impl) | `Services/SystemNoticeService.cs` | Complete (with bugs) |
| Routes | `Routes.SystemNotices.cs` | Complete |
| Permissions | `Permissions/SystemNoticePermissionsForStaff.cs` | Complete |
| Endpoints (Staff) | `Endpoints/SystemNoticeEndpointsForStaff.cs` | Complete |
| Endpoints (Anonymous) | `Endpoints/SystemNoticeEndpointsAnonymous.cs` | Complete |
| Handler: Create | `Handlers/Staff/CreateSystemNotice.cs` | Complete |
| Handler: Find | `Handlers/Staff/FindSystemNotices.cs` | Complete |
| Handler: GetById | `Handlers/Staff/GetSystemNoticeById.cs` | Complete |
| Handler: Update | `Handlers/Staff/UpdateSystemNotice.cs` | Complete (with bug) |
| Handler: Delete | `Handlers/Staff/DeleteSystemNotice.cs` | Complete |
| Handler: GetActive | `Handlers/Anonymous/GetActiveSystemNotices.cs` | Complete |

### Supporting Changes (already done)

- AuditActions: `SystemNoticeCreated`, `SystemNoticeUpdated`, `SystemNoticeDeleted` in `AuditLog.cs`
- AppPermissions: `SystemNotices` registered in `StaffScopePermissions`
- DbContext: `DbSet<SystemNotice>` exists in `MainApiDbContext`
- Database migration: Table `system_notices` with indexes already in migration `20260204033830_Init`
- Translation keys: EN + FR in `response-message.en.json` / `response-message.fr.json`
- ResponseKeys: Auto-generated constants exist (`SystemNoticeCreatedSuccessfully`, etc.)
- Anonymous endpoint: Registered in `Program.cs` line 40

### Acceptance Criteria Mapping

| Criteria | Status |
|----------|--------|
| Staff can create notices with severity, title, message, and date range | Handler exists, not wired |
| Staff can list, update, and delete notices | Handlers exist, not wired |
| Public endpoint returns only currently active notices | Registered and working |
| All CRUD operations are audit logged | Create/Update/Delete log audits |

---

## 2. Blocking Issues (Must Fix)

### BLOCKER-1: Staff endpoints not registered in Program.cs

**Location:** `apps/api/Program.cs`

The anonymous endpoint is registered (line 40), but the staff endpoint group mapping is completely missing. All 5 staff endpoints (Create, Find, GetById, Update, Delete) are unreachable.

**Fix:** Add to the staff group section in `Program.cs`:
```csharp
staffGroup.MapSystemNoticeEndpointsForStaff();
```

### BLOCKER-2: SystemNoticeService not registered in DI

**Location:** `Services/SystemNoticeService.cs`

The service class has no `[Service]` attribute and is not manually registered in `ServiceRegistration.cs`. Any attempt to resolve `ISystemNoticeService` will throw at runtime.

The codebase has migrated to the `[Service]` attribute pattern (e.g., `AuditLogService` uses `[Service(ServiceLifetime.Scoped)]`).

**Fix:** Add the attribute to the service class:
```csharp
[Service(ServiceLifetime.Scoped)]
public class SystemNoticeService : ISystemNoticeService {
```

---

## 3. Bugs

### BUG-1: Soft-deleted notices returned in Find and GetById queries

**Location:** `Services/SystemNoticeService.cs` - `FindAsync()` (line 112) and `GetByIdAsync()` (line 137)

The DbContext does **not** apply a global query filter for soft deletes on `INoTenantEntity` entities. The global query filter only exists for tenant-scoped entities (`ITenantEntity`). This means:

- `FindAsync()` returns soft-deleted notices in the list
- `GetByIdAsync()` returns soft-deleted notices by ID
- Only `GetActiveAsync()` correctly filters `where n.IsDeleted == false`

**Fix:** Add `where n.IsDeleted == false` to `FindAsync` and `GetByIdAsync`:
```csharp
// FindAsync
var baseQuery =
    from n in _dbContext.SystemNotice
    where n.IsDeleted == false
    orderby n.CreatedAt descending
    select n;

// GetByIdAsync
var noticeQuery =
    from n in _dbContext.SystemNotice
    where n.Id == id && n.IsDeleted == false
    select n;
```

### BUG-2: UpdateAsync unconditionally overwrites ExpiresAt

**Location:** `Services/SystemNoticeService.cs` - `UpdateAsync()` (line 178)

For a PATCH endpoint, the service must distinguish between "field not sent" (keep existing value) and "field explicitly set to null" (clear it). Currently:

```csharp
// Line 178: Always sets ExpiresAt, even when not provided in request
notice.ExpiresAt = expiresAt;
```

If a client sends `{ "title": "New Title" }` without including `expiresAt`, the handler passes `expiresAt = null` to the service, which then clears any existing expiration date.

**Fix:** The `UpdateAsync` signature needs a way to distinguish "not provided" from "explicitly null". Options:
- **Option A:** Add a boolean flag `bool clearExpiresAt = false`
- **Option B:** Change the handler to only call UpdateAsync with values that were actually in the request body
- **Option C:** Use a wrapper type like `Optional<DateTime?>`

The simplest fix (Option A):
```csharp
// Service signature
Task<SystemNotice?> UpdateAsync(
    Guid id,
    NoticeSeverity? severity,
    string? title,
    string? message,
    DateTime? startsAt,
    DateTime? expiresAt,
    bool clearExpiresAt,
    CancellationToken cancellationToken = default);

// Service implementation
if (expiresAt.HasValue) {
    notice.ExpiresAt = expiresAt.Value;
} else if (clearExpiresAt) {
    notice.ExpiresAt = null;
}
// else: keep existing value

// Handler: detect explicit null vs absent
bool clearExpiresAt = body.ExpiresAt is not null
    && body.ExpiresAt.Value.ValueKind == JsonValueKind.Null;
```

### BUG-3: DeleteAsync manually sets soft-delete fields (redundant + bypasses audit tracking)

**Location:** `Services/SystemNoticeService.cs` - `DeleteAsync()` (lines 203-205)

```csharp
// Current: manual soft delete
notice.IsDeleted = true;
notice.DeletedAt = DateTime.UtcNow;
```

The DbContext's `SaveChangesAsync` override already converts `EntityState.Deleted` to soft-delete automatically (setting `IsDeleted = true`, `DeletedAt`, and `UpdatedAt`). The manual approach:
1. Bypasses the centralized audit tracking (doesn't update `UpdatedAt`)
2. Uses `DateTime.UtcNow` separately from the centralized `now` timestamp

**Fix:** Use the standard EF Core removal pattern:
```csharp
_dbContext.SystemNotice.Remove(notice);
await _dbContext.SaveChangesAsync(cancellationToken);
```

The DbContext override will automatically convert this to a soft delete with proper timestamps.

---

## 4. Compliance Issues

### COMPLIANCE-1: Translation keys not used in NotFound responses

**Location:** Multiple handlers

The handlers use generic `ResponseKeys.NotFound` instead of the domain-specific `ResponseKeys.SystemNoticeNotFound` that was created for this purpose:

```csharp
// Current (GetSystemNoticeById.cs:38, UpdateSystemNotice.cs:165, DeleteSystemNotice.cs:38)
return TypedProblems.NotFound("System notice not found", ResponseKeys.NotFound);

// Should use:
return TypedProblems.NotFound("System notice not found", ResponseKeys.SystemNoticeNotFound);
```

Similarly, the success translation keys (`SystemNoticeCreatedSuccessfully`, etc.) are defined but never used by the handlers. The Create handler doesn't include a success message in its response. This is acceptable since the handler returns the created entity directly, but worth noting for consistency.

### COMPLIANCE-2: Redundant auth context null checks in staff handlers

**Location:** `CreateSystemNotice.cs:106-112`, `UpdateSystemNotice.cs:112-118`, `DeleteSystemNotice.cs:25-31`

Three handlers check `authContext.AccountStaff is null` and return Forbidden, but the endpoint registration already uses `.WithPermission()` which implies the staff auth middleware runs before the handler. The `PermissionFilter` + `StaffAuthFilter` chain would have already rejected unauthenticated requests.

This is a defensive pattern that adds no value (the auth context is guaranteed non-null by the middleware pipeline) and inflates the return type with `AppForbiddenHttpResult`. This adds unnecessary TypedProblems result variants to OpenAPI documentation.

**Recommendation:** Remove the redundant null checks and `AppForbiddenHttpResult` from the return type, matching the pattern used in `GetSystemNoticeById` and `FindSystemNotices` (which correctly don't check it, since they also have `.WithPermission()`).

Note: `FindSystemNotices` still has `AppForbiddenHttpResult` in its return type even though it doesn't check auth context — this should also be removed if it's not used.

### COMPLIANCE-3: Response DTOs in wrong location

**Location:** `Services/SystemNoticeService.cs` (lines 44-60)

Per AGENTS.md rules: "Each handler file must be self-contained with ALL related code in ONE file" including DTOs. The response DTOs `SystemNoticeListItem` and `ActiveSystemNotice` are defined in the service file instead of in their respective handler files.

While there's a practical reason (both are used across handlers and the service), the canonical approach would be either:
- Define them in the handler that primarily uses them and import from there
- Create a shared DTOs file only if genuinely cross-cutting

This is a minor violation but worth noting for consistency.

### COMPLIANCE-4: XML doc comments on Routes file

**Location:** `Routes.SystemNotices.cs` (lines 6-11)

The Routes file has XML doc comments (`/// <summary>`). While not technically forbidden, no other Routes file in the codebase uses XML comments on route constants. These add visual noise without value since route paths are self-documenting.

---

## 5. Performance Considerations

### PERF-1: FindAsync executes two queries (COUNT + data)

**Location:** `Services/SystemNoticeService.cs` - `FindAsync()` (lines 117-122)

```csharp
var totalCount = await baseQuery.CountAsync(cancellationToken);
var notices = await baseQuery.Skip(...).Take(...).ToListAsync(cancellationToken);
```

This executes two separate database queries. For a low-volume admin-only table like system notices, this is acceptable. However, these could be parallelized with `Task.WhenAll` for marginal improvement:

```csharp
var countTask = baseQuery.CountAsync(cancellationToken);
var noticesTask = baseQuery.Skip(...).Take(...).ToListAsync(cancellationToken);
await Task.WhenAll(countTask, noticesTask);
var totalCount = countTask.Result;
var notices = noticesTask.Result;
```

**Verdict:** Low priority. System notices is a small table managed by admins.

### PERF-2: In-memory IsActive() evaluation for list items

**Location:** `Services/SystemNoticeService.cs` - `FindAsync()` (line 130)

```csharp
IsActive = n.IsActive(),
```

The `IsActive()` method runs in-memory after materializing entities. This is fine for the current implementation since the entities are already loaded. However, this could be computed in the query itself to avoid unnecessary property access, and would also work if you ever wanted to project directly from the query.

**Verdict:** Not a problem at current scale.

### PERF-3: GetActiveAsync has optimal query design

The `GetActiveAsync` method correctly pushes all filtering to the database (no in-memory filtering), projects directly to DTOs in the query, and orders by severity (critical first). This is well-designed.

### PERF-4: Anonymous endpoint has no caching

The `GET /notices/active` endpoint is public and likely called on every page load. There's no response caching configured. For a production deployment with many users, this could generate significant DB load for data that changes infrequently.

**Recommendation (future):** Consider adding output caching or a short TTL cache:
```csharp
group.MapGet(...).CacheOutput(policy => policy.Expire(TimeSpan.FromMinutes(1)));
```

---

## 6. What Is Missing (from Issue Requirements)

### Not yet implemented:

1. **Frontend implementation** - No React routes, hooks, or UI components. The issue only specifies backend tasks, so this may be intentional.

2. **Client generation** - After fixing the blockers and building the API, `make generate-client` needs to run to produce the TypeScript client types.

3. **Integration tests** - No test files exist for the SystemNotices module. The codebase has test infrastructure (`Testcontainers`), so adding tests for the CRUD endpoints would be valuable.

---

## 7. What Should Be Dropped

Nothing needs to be dropped. All implemented components align with the issue requirements. The scope is correct.

---

## 8. Summary of Required Actions

### Priority 1: Blockers (app won't work)
1. Add `staffGroup.MapSystemNoticeEndpointsForStaff()` to `Program.cs`
2. Add `[Service(ServiceLifetime.Scoped)]` attribute to `SystemNoticeService`

### Priority 2: Bugs (incorrect behavior)
3. Add `IsDeleted == false` filter to `FindAsync` and `GetByIdAsync` queries
4. Fix `UpdateAsync` ExpiresAt handling to distinguish "not provided" from "explicitly null"
5. Replace manual soft-delete in `DeleteAsync` with `_dbContext.SystemNotice.Remove(notice)`

### Priority 3: Compliance (repo conventions)
6. Use `ResponseKeys.SystemNoticeNotFound` instead of `ResponseKeys.NotFound`
7. Remove redundant `authContext.AccountStaff is null` checks from Create/Update/Delete handlers
8. Remove unused `AppForbiddenHttpResult` from return types of handlers that don't need it
9. Remove XML doc comments from `Routes.SystemNotices.cs`

### Priority 4: Post-fix steps
10. Run `make build-api` to regenerate OpenAPI spec
11. Run `make generate-client` to update TypeScript client
12. Run `make tsc-front` to verify no type errors

---

## 9. File-by-File Diff Summary

| File | Action Needed |
|------|---------------|
| `Program.cs` | Add staff endpoint mapping |
| `Services/SystemNoticeService.cs` | Add `[Service]` attribute, fix soft-delete filter in Find/GetById, fix ExpiresAt in Update, fix Delete method |
| `Handlers/Staff/CreateSystemNotice.cs` | Remove redundant auth check + AppForbiddenHttpResult |
| `Handlers/Staff/UpdateSystemNotice.cs` | Remove redundant auth check + AppForbiddenHttpResult, fix ExpiresAt null handling |
| `Handlers/Staff/DeleteSystemNotice.cs` | Remove redundant auth check + AppForbiddenHttpResult |
| `Handlers/Staff/FindSystemNotices.cs` | Remove unused AppForbiddenHttpResult from return type |
| `Handlers/Staff/GetSystemNoticeById.cs` | Use `ResponseKeys.SystemNoticeNotFound` |
| `Routes.SystemNotices.cs` | Remove XML doc comments (minor) |
| `Endpoints/SystemNoticeEndpointsForStaff.cs` | No changes needed |
| `Endpoints/SystemNoticeEndpointsAnonymous.cs` | No changes needed |
| `Permissions/SystemNoticePermissionsForStaff.cs` | No changes needed |
| `Entities/SystemNotice.cs` | No changes needed |
