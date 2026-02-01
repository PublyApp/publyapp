# Issue #167: Tenant Suspend/Reactivate Implementation Plan

> **Status:** Ready for Implementation
> **Branch:** `claude/analyze-issue-167-YayZK`

## Overview

Implement tenant suspend/reactivate functionality for staff administrators. When a tenant is suspended:
- Staff can suspend/reactivate tenants via the admin panel (list + details pages)
- Tenant users lose access to the suspended tenant (403 with specific translation key)
- Users with access to multiple tenants can still access their other (non-suspended) tenants
- Users with ALL tenants suspended see the tenant picker with disabled tenants + banner
- All actions are audit-logged

---

## Design Decisions

### D1: Status Restoration on Reactivation
**Decision:** Only allow suspending `Active` tenants. Reject suspending `Pending`/`Archived` tenants with a clear error.

**Rationale:** A `Pending` tenant hasn't finished onboarding, an `Archived` tenant is already "dead". Suspending them creates invalid states.

### D2: Dual Field Consistency (IsSuspended + Status)
**Decision:** Use BOTH fields, kept in sync via:
1. **Entity methods:** `Tenant.Suspend()` and `Tenant.Reactivate()` that update both fields atomically
2. **DB CHECK constraint:** `(is_suspended = true AND status = 30) OR (is_suspended = false AND status != 30)`

**Rationale:** Entity methods provide clean domain logic; DB constraint catches bugs from manual hotfixes or raw SQL.

**Note:** The CHECK constraint references enum numeric value `30` (Suspended). If enum values ever change, a migration must update the constraint too.

### D3: Race Condition Handling
**Decision:** Use atomic UPDATE with rows-affected check via `ExecuteUpdateAsync`:
```sql
UPDATE tenants SET is_suspended = true, status = 30, updated_at = NOW()
WHERE id = @id AND is_suspended = false AND status = 20 AND is_deleted = false
```
If 0 rows affected → return "already suspended" or "invalid state".

### D4: Error Responses
**Decision:** Distinct error codes for different failure modes:
- `404 Not Found` → Tenant doesn't exist (or deleted)
- `409 Conflict` → Tenant exists but is already suspended (or not suspended for reactivate)
- `400 Bad Request` → Tenant exists but is not in `Active` status (can't suspend `Pending`/`Archived`)

### D5: TenantAuthFilter for Suspended Tenants
**Decision:** Return `403 Forbidden` with distinct `translationKey: "tenant-suspended"`.

**Rationale:**
- Must NOT be `401` (frontend treats 401 as "logout now")
- Must NOT be `404` (need to distinguish "not found" from "suspended")
- Distinct translation key allows frontend to show specific message

### D6: User with All Tenants Suspended (UX)
**Decision:** Tenant picker shows ALL tenants (including suspended):
- Suspended tenants displayed but disabled with status badge/label
- Banner/alert explaining the situation
- Action button (link to support page, contact admin)

**Rationale:** User should see their tenants exist but are suspended, not wonder why they can't access anything.

### D7: Suspend Reason Storage
**Decision:** Store in audit log only (MVP). No dedicated column on Tenant entity.

### D8: Tenant Details Page
**Decision:** Include suspend/reactivate functionality on tenant details page, not just the list.

### D9: Information Disclosure Prevention
**Decision:** In TenantAuthFilter, check user membership BEFORE revealing "tenant-suspended" status.

**Rationale:** If we return "tenant-suspended" before checking membership, attackers can probe tenant IDs to discover which ones exist. Non-members should get generic 403 "no access", only members get the specific "tenant-suspended" message.

### D10: Background Jobs
**Decision:** Background jobs must enforce "tenant is active" at job entry points.

**Rationale:** HTTP filters don't protect scheduled tasks or queue workers. Jobs processing tenant data should check `Tenant.IsTenantActive()` and skip/fail gracefully for suspended tenants.

---

## Current State Analysis

### Existing Infrastructure

| Component | Status | Location |
|-----------|--------|----------|
| `Tenant.IsSuspended` field | ✅ Exists | `Modules/Tenants/Entities/Tenant.cs` |
| `TenantStatus.Suspended` enum | ✅ Exists | `Modules/Tenants/Entities/Tenant.cs` |
| `Tenant.IsTenantActive()` method | ✅ Exists | Returns `Status == Active && !IsSuspended` |
| `AuditActions.TenantSuspended` | ✅ Defined | `Modules/AuditLogs/Entities/AuditLog.cs` |
| `AuditActions.TenantReactivated` | ✅ Defined | `Modules/AuditLogs/Entities/AuditLog.cs` |
| Suspend/Reactivate endpoints | ❌ Missing | Need to create |
| Suspend/Reactivate permissions | ❌ Missing | Need to add |

### Critical Issues to Fix

**Issue 1: TenantAuthFilter returns 404 instead of 403 for suspended**
- `ITenantService.GetTenantByIdAsync` returns `null` for suspended tenants
- Fix: Add `GetTenantByIdIncludingSuspendedAsync` method

**Issue 2: GetTenantAuthData returns 404 for suspended**
- Same root cause as Issue 1
- Fix: Use new method, return 403 with `tenant-suspended` key

**Issue 3: GetRedirectCode blocks users with all tenants suspended**
- `GetUserTenantsAsync` filters out suspended → `TotalCount == 0` → "unauthorized"
- Fix: Use NEW `GetUserTenantsForPickerAsync` method (Phase 4.2), show tenant picker instead

**Issue 4: Tenant picker API only returns active tenants**
- Fix: Create new `/auth/tenants-for-picker` endpoint using `GetUserTenantsForPickerAsync`

---

## Implementation Tasks

### Phase 1: Database Migration

#### Task 1.1: Add CHECK Constraint with Data Cleanup

**File:** New migration

```csharp
protected override void Up(MigrationBuilder migrationBuilder) {
    // Step 1: Fix any inconsistent data BEFORE adding constraint
    migrationBuilder.Sql(@"
        UPDATE tenants SET status = 30, updated_at = NOW()
        WHERE is_suspended = true AND status != 30;
    ");
    migrationBuilder.Sql(@"
        UPDATE tenants SET is_suspended = true, updated_at = NOW()
        WHERE status = 30 AND is_suspended = false;
    ");

    // Step 2: Add the CHECK constraint
    migrationBuilder.Sql(@"
        ALTER TABLE tenants ADD CONSTRAINT chk_tenant_suspended_status
        CHECK ((is_suspended = true AND status = 30) OR (is_suspended = false AND status != 30));
    ");
}

protected override void Down(MigrationBuilder migrationBuilder) {
    migrationBuilder.Sql(@"
        ALTER TABLE tenants DROP CONSTRAINT IF EXISTS chk_tenant_suspended_status;
    ");
}
```

---

### Phase 2: Backend - Entity Methods

#### Task 2.1: Add Suspend/Reactivate Methods to Tenant Entity

**File:** `apps/api/Src/Modules/Tenants/Entities/Tenant.cs`

```csharp
public bool Suspend() {
    if (IsSuspended || Status != TenantStatus.Active) {
        return false;
    }
    IsSuspended = true;
    Status = TenantStatus.Suspended;
    return true;
}

public bool Reactivate() {
    if (!IsSuspended || Status != TenantStatus.Suspended) {
        return false;
    }
    IsSuspended = false;
    Status = TenantStatus.Active;
    return true;
}
```

---

### Phase 3: Backend - Permissions & Routes

#### Task 3.1: Add Permissions

**File:** `apps/api/Src/Modules/Tenants/Permissions/TenantPermissionsForStaff.cs`

```csharp
public Permission SUSPEND { get; }   // staff.tenants.suspend
public Permission REACTIVATE { get; } // staff.tenants.reactivate
```

#### Task 3.2: Add Route Constants

**File:** `apps/api/Src/Modules/Tenants/Routes.Tenants.cs`

```csharp
public static class ForStaff {
    public const string Suspend = "/{tenantId}/suspend";
    public const string Reactivate = "/{tenantId}/reactivate";
}
```

---

### Phase 4: Backend - Service Layer

#### Task 4.1: Add ITenantService Method for Suspended Tenant Handling

**File:** `apps/api/Src/Modules/Tenants/Services/TenantService.cs`

```csharp
// Add to interface
Task<Tenant?> GetTenantByIdIncludingSuspendedAsync(Guid tenantId, CancellationToken cancellationToken = default);

// Implementation - returns tenant even if suspended (but not if deleted)
public async Task<Tenant?> GetTenantByIdIncludingSuspendedAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
) {
    return await (
        from tenant in _dbContext.Tenant
        where tenant.Id == tenantId && !tenant.IsDeleted
        select tenant
    ).FirstOrDefaultAsync(cancellationToken);
}
```

#### Task 4.2: Add NEW GetUserTenantsForPickerAsync Method (Don't Modify Existing)

**File:** `apps/api/Src/Modules/Users/Services/AccountService.cs`

**IMPORTANT:** Per GPT review, do NOT modify the existing `GetUserTenantsAsync` signature to avoid breaking existing auth flows. Instead, create a new purpose-built method for the picker/redirect logic.

```csharp
// NEW result type for picker
public record UserTenantsForPickerResult {
    public required List<TenantForPicker> Tenants { get; init; }
    public required int TotalCount { get; init; }      // All tenants (including suspended)
    public required int ActiveCount { get; init; }     // Only active tenants
    public bool HasSuspendedTenants => TotalCount > ActiveCount;
}

public record TenantForPicker {
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required string Code { get; init; }
    public required string Status { get; init; }       // Display string for UI
    public required bool IsSuspended { get; init; }
    public required bool IsActive { get; init; }       // Computed: Status == Active && !IsSuspended
}

// NEW interface method
Task<UserTenantsForPickerResult> GetUserTenantsForPickerAsync(
    Guid userId,
    int limit = 50,
    CancellationToken cancellationToken = default
);

// Implementation - returns ALL tenants including suspended (for picker + redirect logic)
public async Task<UserTenantsForPickerResult> GetUserTenantsForPickerAsync(
    Guid userId,
    int limit = 50,
    CancellationToken cancellationToken = default
) {
    // Base query: all tenants the user is a member of (excluding deleted)
    var baseQuery =
        from ua in _dbContext.UserAccount
        join t in _dbContext.Tenant on ua.TenantId equals t.Id
        where ua.UserId == userId
            && ua.Scope == AccountScope.Tenant
            && ua.TenantId != null
            && !ua.IsDeleted && !ua.IsSuspended  // Account must be active
            && !t.IsDeleted                       // Tenant must not be deleted
        select new { ua, t };

    var totalCount = await baseQuery.CountAsync(cancellationToken);
    var activeCount = await baseQuery
        .Where(q => q.t.Status == TenantStatus.Active && !q.t.IsSuspended)
        .CountAsync(cancellationToken);

    var tenants = await baseQuery
        .OrderBy(q => q.t.Name)
        .Take(limit)
        .Select(q => new TenantForPicker {
            Id = q.t.Id!.Value,
            Name = q.t.Name,
            Code = q.t.Code,
            Status = Tenant.GetStatusDescription(q.t.Status),
            IsSuspended = q.t.IsSuspended,
            // Computed from enum - same logic as ActiveCount predicate
            IsActive = q.t.Status == TenantStatus.Active && !q.t.IsSuspended
        })
        .ToListAsync(cancellationToken);

    return new UserTenantsForPickerResult {
        Tenants = tenants,
        TotalCount = totalCount,
        ActiveCount = activeCount
    };
}
```

**Note:** The existing `GetUserTenantsAsync` remains unchanged and continues to return only active tenants.

#### Task 4.3: Add Suspend/Reactivate Service Methods

**File:** `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

```csharp
// Result types
public enum SuspendTenantError { NotFound, AlreadySuspended, NotActiveStatus }
public enum ReactivateTenantError { NotFound, NotSuspended }
public record SuspendTenantResult(Tenant? Tenant, SuspendTenantError? Error);
public record ReactivateTenantResult(Tenant? Tenant, ReactivateTenantError? Error);

// Interface additions
Task<SuspendTenantResult> SuspendTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
Task<ReactivateTenantResult> ReactivateTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
Task<Tenant?> GetTenantByIdForStaffAsync(Guid tenantId, CancellationToken cancellationToken = default);

// SuspendTenantAsync implementation (with EF tracking fix)
public async Task<SuspendTenantResult> SuspendTenantAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
) {
    var tenant = await (
        from t in _dbContext.Tenant.AsNoTracking()
        where t.Id == tenantId && !t.IsDeleted
        select t
    ).FirstOrDefaultAsync(cancellationToken);

    if (tenant is null) {
        return new SuspendTenantResult(null, SuspendTenantError.NotFound);
    }
    if (tenant.IsSuspended) {
        return new SuspendTenantResult(null, SuspendTenantError.AlreadySuspended);
    }
    if (tenant.Status != TenantStatus.Active) {
        return new SuspendTenantResult(null, SuspendTenantError.NotActiveStatus);
    }

    var rowsAffected = await _dbContext.Tenant
        .Where(t => t.Id == tenantId && !t.IsDeleted && !t.IsSuspended && t.Status == TenantStatus.Active)
        .ExecuteUpdateAsync(setters => setters
            .SetProperty(t => t.IsSuspended, true)
            .SetProperty(t => t.Status, TenantStatus.Suspended)
            .SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
            cancellationToken);

    if (rowsAffected == 0) {
        return new SuspendTenantResult(null, SuspendTenantError.AlreadySuspended);
    }

    var updatedTenant = await (
        from t in _dbContext.Tenant.AsNoTracking()
        where t.Id == tenantId
        select t
    ).FirstOrDefaultAsync(cancellationToken);

    return new SuspendTenantResult(updatedTenant, null);
}

// ReactivateTenantAsync implementation (similar pattern)
public async Task<ReactivateTenantResult> ReactivateTenantAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
) {
    var tenant = await (
        from t in _dbContext.Tenant.AsNoTracking()
        where t.Id == tenantId && !t.IsDeleted
        select t
    ).FirstOrDefaultAsync(cancellationToken);

    if (tenant is null) {
        return new ReactivateTenantResult(null, ReactivateTenantError.NotFound);
    }
    if (!tenant.IsSuspended) {
        return new ReactivateTenantResult(null, ReactivateTenantError.NotSuspended);
    }

    var rowsAffected = await _dbContext.Tenant
        .Where(t => t.Id == tenantId && !t.IsDeleted && t.IsSuspended && t.Status == TenantStatus.Suspended)
        .ExecuteUpdateAsync(setters => setters
            .SetProperty(t => t.IsSuspended, false)
            .SetProperty(t => t.Status, TenantStatus.Active)
            .SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
            cancellationToken);

    if (rowsAffected == 0) {
        return new ReactivateTenantResult(null, ReactivateTenantError.NotSuspended);
    }

    var updatedTenant = await (
        from t in _dbContext.Tenant.AsNoTracking()
        where t.Id == tenantId
        select t
    ).FirstOrDefaultAsync(cancellationToken);

    return new ReactivateTenantResult(updatedTenant, null);
}

// GetTenantByIdForStaffAsync - staff can see suspended tenants
public async Task<Tenant?> GetTenantByIdForStaffAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
) {
    return await (
        from tenant in _dbContext.Tenant
        where tenant.Id == tenantId && !tenant.IsDeleted
        select tenant
    ).FirstOrDefaultAsync(cancellationToken);
}
```

---

### Phase 5: Backend - Handlers

#### Task 5.1: Create SuspendTenantAsStaff Handler

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs`

```csharp
namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public record SuspendTenantAsStaffBody {
    public JsonElement? Reason { get; init; }
}

public record TenantSuspendedResult {
    public required Guid TenantId { get; init; }
    public required string Name { get; init; }
    public required bool IsSuspended { get; init; }
    public required string Status { get; init; }
}

public class SuspendTenantAsStaffBodyValidator : AbstractValidator<SuspendTenantAsStaffBody> {
    public SuspendTenantAsStaffBodyValidator() {
        RuleFor(x => x.Reason)
            .Must(x => x is null || x.Value.ValueKind == JsonValueKind.String)
            .WithMessage("Reason must be a string");
        When(x => x.Reason is not null && x.Reason.Value.ValueKind == JsonValueKind.String, () => {
            RuleFor(x => x.Reason)
                .Must(x => x!.Value.GetString()!.Length <= 500)
                .WithMessage("Reason must be 500 characters or less");
        });
    }
}

public static class SuspendTenantAsStaff {
    public static async Task<Results<
        Ok<TenantSuspendedResult>,
        AppBadRequestHttpResult,
        AppNotFoundHttpResult,
        AppConflictHttpResult
    >> HandleSuspendTenantAsStaff(
        Guid tenantId,
        [FromServices] ITenantAsStaffService tenantService,
        [FromServices] IAuditLogService auditLogService,
        [FromServices] IRequestAuthContext authContext,
        [FromBody] SuspendTenantAsStaffBody request,
        CancellationToken cancellationToken = default
    ) {
        var reason = request.Reason?.ValueKind == JsonValueKind.String
            ? request.Reason.Value.GetString()
            : null;

        var result = await tenantService.SuspendTenantAsync(tenantId, cancellationToken);

        if (result.Error is not null) {
            return result.Error switch {
                SuspendTenantError.NotFound => TypedProblems.NotFound(
                    "Tenant not found", ResponseKeys.TenantNotFound),
                SuspendTenantError.AlreadySuspended => TypedProblems.Conflict(
                    "Tenant is already suspended", ResponseKeys.TenantAlreadySuspended),
                SuspendTenantError.NotActiveStatus => TypedProblems.BadRequest(
                    "Only active tenants can be suspended", ResponseKeys.TenantNotActiveCannotSuspend),
                _ => throw new InvalidOperationException($"Unknown error: {result.Error}")
            };
        }

        var tenant = result.Tenant!;

        await auditLogService.LogAsync(
            authContext.UserId!.Value,
            AuditActions.TenantSuspended,
            tenantId,
            new { TenantName = tenant.Name, Reason = reason },
            cancellationToken
        );

        return TypedResults.Ok(new TenantSuspendedResult {
            TenantId = tenant.GetRequiredId(),
            Name = tenant.Name,
            IsSuspended = tenant.IsSuspended,
            Status = Tenant.GetStatusDescription(tenant.Status)
        });
    }
}
```

#### Task 5.2: Create ReactivateTenantAsStaff Handler

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs`

Similar structure but:
- No request body needed
- Calls `ReactivateTenantAsync`
- Maps `NotFound` → 404, `NotSuspended` → 409
- Logs `AuditActions.TenantReactivated`

#### Task 5.3: Update FindTenantsAsStaff Response

Add `IsSuspended` to `TenantAsStaffItem` response DTO.

---

### Phase 6: Backend - TenantAuthFilter Update

**File:** `apps/api/Src/Lib/Filters/TenantAuthFilter.cs`

**CRITICAL (D9 - Security):** Check membership FIRST, before loading tenant, to prevent tenant ID probing. Non-members always get generic 403 regardless of whether tenant exists.

```csharp
// SECURITY: Check membership FIRST - before even loading the tenant
// This prevents attackers from probing tenant IDs (they always get 403, never 404)
var tenantAccount = await accountService.GetUserTenantAccountAsync(
    userId, tenantId, httpContext.RequestAborted
);

if (tenantAccount is null) {
    // User is not a member - give generic 403
    // DON'T reveal whether tenant exists, is suspended, or anything else
    return TypedProblems.Forbidden("User does not have access to this tenant", ResponseKeys.Forbidden);
}

// User IS a member - now we can safely load tenant details
var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(tenantId, httpContext.RequestAborted);

if (tenant is null) {
    // Tenant was deleted - member loses access
    return TypedProblems.Forbidden("User does not have access to this tenant", ResponseKeys.Forbidden);
}

// Check if tenant is suspended - only members see this specific message
if (tenant.IsSuspended) {
    return TypedProblems.Forbidden(
        "This tenant has been suspended",
        ResponseKeys.TenantSuspended  // translationKey: "tenant-suspended"
    );
}

// Check tenant is in a valid state (Active only at this point)
if (tenant.Status != TenantStatus.Active) {
    // Pending/Archived - treat as inaccessible
    return TypedProblems.Forbidden("User does not have access to this tenant", ResponseKeys.Forbidden);
}

// Store account in context for downstream handlers
authContext.AccountTenant = tenantAccount;
```

**Key security property:** Non-members ALWAYS get the same generic 403, whether the tenant exists, is suspended, is deleted, or never existed. Only members get specific error messages.

---

### Phase 7: Backend - GetTenantAuthData Update

**File:** `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`

**CRITICAL (D9 - Security):** Same membership-first pattern as TenantAuthFilter. This endpoint can also be used for probing if we reveal tenant status before checking membership.

```csharp
// SECURITY: Check membership FIRST - before revealing any tenant info
var tenantAccount = await accountService.GetUserTenantAccountAsync(
    userId, tenantId, cancellationToken
);

if (tenantAccount is null) {
    // User is not a member - give generic 403 (don't reveal if tenant exists)
    return TypedProblems.Forbidden("User does not have access to this tenant", ResponseKeys.Forbidden);
}

// User IS a member - now safe to load tenant details
var tenant = await tenantService.GetTenantByIdIncludingSuspendedAsync(tenantId, cancellationToken);

if (tenant is null) {
    // Tenant was deleted - member loses access
    return TypedProblems.Forbidden("User does not have access to this tenant", ResponseKeys.Forbidden);
}

// Check if tenant is suspended - only members see this specific message
if (tenant.IsSuspended) {
    return TypedProblems.Forbidden(
        "This tenant has been suspended",
        ResponseKeys.TenantSuspended
    );
}

// Check tenant is in a valid state
if (tenant.Status != TenantStatus.Active) {
    return TypedProblems.Forbidden("User does not have access to this tenant", ResponseKeys.Forbidden);
}

// Continue with auth data response...
```

---

### Phase 8: Backend - GetRedirectCode Update

**File:** `apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs`

```csharp
// Use the NEW picker method (don't modify existing GetUserTenantsAsync)
var tenantsResult = await accountService.GetUserTenantsForPickerAsync(
    userId, limit: 50, cancellationToken: cancellationToken
);

// No tenants at all (not even suspended) → unauthorized
if (tenantsResult.TotalCount == 0) {
    return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "unauthorized" });
}

// Exactly 1 ACTIVE tenant → redirect directly to that tenant
if (tenantsResult.ActiveCount == 1) {
    // Use the pre-computed IsActive flag (same logic as ActiveCount)
    // This avoids fragile string comparison and ensures consistency
    var activeTenant = tenantsResult.Tenants.First(t => t.IsActive);
    return TypedResults.Ok(new GetRedirectCodeResult {
        RedirectCode = activeTenant.Id.ToString()
    });
}

// Multiple active tenants OR has suspended tenants → show picker
// This ensures users with ALL tenants suspended see the picker (not "unauthorized")
return TypedResults.Ok(new GetRedirectCodeResult { RedirectCode = "tenant-picker" });
```

---

### Phase 9: Backend - Tenant Picker Endpoint

**File:** `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.cs`

```csharp
// Response DTO (matches service result)
public class GetUserTenantsForPickerResponse {
    public List<TenantForPickerItem> Tenants { get; set; } = [];
    public int TotalCount { get; set; }
    public int ActiveCount { get; set; }
    public bool HasSuspendedTenants { get; set; }
}

public class TenantForPickerItem {
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool IsSuspended { get; set; }
    public bool IsActive { get; set; }  // Pre-computed: can user access this tenant?
}

public static class GetUserTenantsForPicker {
    public static async Task<Ok<GetUserTenantsForPickerResponse>> HandleGetUserTenantsForPicker(
        IRequestAuthContext authContext,
        [FromServices] IAccountService accountService,
        CancellationToken cancellationToken
    ) {
        if (authContext.UserId is not Guid userId) {
            throw new Exception("GetUserTenantsForPicker must be behind SessionAuthFilter");
        }

        // Use the NEW dedicated picker method
        var result = await accountService.GetUserTenantsForPickerAsync(
            userId, limit: 50, cancellationToken
        );

        return TypedResults.Ok(new GetUserTenantsForPickerResponse {
            Tenants = result.Tenants.Select(t => new TenantForPickerItem {
                Id = t.Id,
                Name = t.Name,
                Code = t.Code,
                Status = t.Status,
                IsSuspended = t.IsSuspended,
                IsActive = t.IsActive
            }).ToList(),
            TotalCount = result.TotalCount,
            ActiveCount = result.ActiveCount,
            HasSuspendedTenants = result.HasSuspendedTenants
        });
    }
}
```

Register in `apps/api/Src/Modules/Auth/Endpoints/AuthEndpoints.cs`:
```csharp
group.MapGet("/tenants-for-picker", GetUserTenantsForPicker.HandleGetUserTenantsForPicker)
    .WithName("GetUserTenantsForPicker")
    .WithSummary("Get all user tenants for picker including suspended")
    .WithSessionAuthentication();
```

---

### Phase 10: Backend - Endpoint Registration

**File:** `apps/api/Src/Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs`

```csharp
group.MapPost(Routes.Tenants.ForStaff.Suspend, SuspendTenantAsStaff.HandleSuspendTenantAsStaff)
    .WithName("SuspendTenant")
    .WithReqBodyValidation<SuspendTenantAsStaffBody>()
    .WithPermission([AppPermissions.Staff.Tenants.SUSPEND]);

group.MapPost(Routes.Tenants.ForStaff.Reactivate, ReactivateTenantAsStaff.HandleReactivateTenantAsStaff)
    .WithName("ReactivateTenant")
    .WithPermission([AppPermissions.Staff.Tenants.REACTIVATE]);
```

---

### Phase 11: Backend - Translations

**File:** `packages/shared/lib/i18n/json/en/response-message.json`
```json
{
  "tenant-not-found": "Tenant not found",
  "tenant-already-suspended": "Tenant is already suspended",
  "tenant-not-active-cannot-suspend": "Only active tenants can be suspended",
  "tenant-not-suspended": "Tenant is not currently suspended",
  "tenant-suspended": "This tenant has been suspended"
}
```

---

### Phase 12: Frontend - API Hooks

**File:** `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

```typescript
export const useSuspendTenant = createStaffMutation({
    mutationKeyFn: (client) => client.staff.tenants.byTenantId('').suspend.post,
    mutationFn: async (client, variables: { tenantId: string; reason?: string }) => {
        const result = await client.staff.tenants
            .byTenantId(variables.tenantId)
            .suspend.post({
                reason: variables.reason ? createUntypedString(variables.reason) as any : undefined,
            });
        if (_.isNil(result)) throw new Error('useSuspendTenant: result is nil');
        return result;
    },
});

export const useReactivateTenant = createStaffMutation({
    mutationKeyFn: (client) => client.staff.tenants.byTenantId('').reactivate.post,
    mutationFn: async (client, variables: { tenantId: string }) => {
        const result = await client.staff.tenants.byTenantId(variables.tenantId).reactivate.post();
        if (_.isNil(result)) throw new Error('useReactivateTenant: result is nil');
        return result;
    },
});
```

**File:** `apps/front/src/lib/react-query/features/auth/auth.hooks.ts`

```typescript
export const useGetUserTenantsForPicker = createAuthQuery({
    queryKeyFn: (client) => client.auth.tenantsForPicker.get,
    fetcher: async (client) => {
        const result = await client.auth.tenantsForPicker.get();
        if (_.isNil(result)) throw new Error('useGetUserTenantsForPicker: result is nil');
        return result;
    },
});
```

---

### Phase 13: Frontend - Tenants Table Update

**File:** `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

- Add `isSuspended` to `TenantRowData`
- Update `StatusCell` to show "Suspended" badge
- Update `TenantActionsCell` with suspend/reactivate buttons

---

### Phase 14: Frontend - Suspend Dialog

**File:** `apps/front/src/routes/authed/staff/tenants/components/tenant-suspend-dialog.tsx`

Dialog with optional reason textarea, confirm/cancel buttons.

---

### Phase 15: Frontend - Tenant Picker Update

**File:** `apps/front/src/routes/authed/tenant/_portal/tenant-portal-page.tsx`

- Use `useGetUserTenantsForPicker`
- Show suspended tenants as disabled with badge
- Show banner when `hasSuspendedTenants`
- Add support link

---

### Phase 16: Frontend - Error Handling for tenant-suspended

Handle `translationKey === 'tenant-suspended'` in global error handler:
- Do NOT logout (it's 403, not 401)
- Redirect to tenant picker or show specific message
- Clear the "tenant hint" cookie/localStorage for that tenant to prevent redirect loops

```typescript
// In global error handler or QueryClient config
if (failure.kind === 'problem' && failure.translationKey === 'tenant-suspended') {
    // Clear the cached tenant hint to prevent redirect loops
    clearTenantHint();
    // Navigate to tenant portal (which shows picker when needed)
    // Uses FRONT_PATH_NAMES.tenant()._root - same route as REDIRECT_CODE.TENANT_PICKER
    router.navigate(FRONT_PATH_NAMES.tenant()._root);
    return; // Don't show generic error toast
}
```

---

### Phase 17: Frontend - Cache Invalidation Strategy

After suspend/reactivate mutations, invalidate relevant caches:

```typescript
const { mutate: suspendTenant } = useSuspendTenant({
    onSuccess: () => {
        // Invalidate staff tenant queries
        queryClient.invalidateQueries({ queryKey: useFindTenants.getKey() });
        queryClient.invalidateQueries({ queryKey: useGetTenant.getKey({ tenantId }) });

        // Invalidate picker/auth data (in case staff is also testing as tenant user)
        queryClient.invalidateQueries({ queryKey: useGetUserTenantsForPicker.getKey() });
        queryClient.invalidateQueries({ queryKey: useGetUserAuthData.getKey() });
    },
});
```

**Optimistic update (optional):** Update the row immediately in the table for snappier UX, then reconcile on server response.

---

## Testing Checklist

### Backend
- [ ] POST `/staff/tenants/{id}/suspend` with Active tenant → 200
- [ ] POST `/staff/tenants/{id}/suspend` with already suspended → 409
- [ ] POST `/staff/tenants/{id}/suspend` with Pending tenant → 400
- [ ] POST `/staff/tenants/{id}/reactivate` with suspended → 200
- [ ] POST `/staff/tenants/{id}/reactivate` with active → 409
- [ ] TenantAuthFilter: suspended tenant (member) → 403 with `tenant-suspended` (NOT 404)
- [ ] TenantAuthFilter: non-existent tenant (non-member) → 403 generic (NOT 404)
- [ ] TenantAuthFilter: suspended tenant (non-member) → 403 generic (same as non-existent - no info leak)
- [ ] TenantAuthFilter: deleted tenant (former member) → 403 generic
- [ ] GetTenantAuthData: suspended tenant → 403 with `tenant-suspended`
- [ ] GetRedirectCode: all tenants suspended → "tenant-picker" (NOT "unauthorized")
- [ ] GetRedirectCode: single active tenant (user has Pending + Active) → redirects to Active tenant only
- [ ] GetUserTenantsForPicker: returns suspended tenants with `isSuspended: true`
- [ ] Audit logs created for suspend/reactivate
- [ ] Permissions enforced (403 without permission)
- [ ] DB CHECK constraint prevents invalid state

### Frontend
- [ ] Tenant list shows correct status badge
- [ ] Suspend/Reactivate buttons appear based on status
- [ ] Suspend dialog accepts reason
- [ ] Tenant picker shows suspended tenants disabled with banner
- [ ] 403 `tenant-suspended` shows specific message (no logout)
- [ ] Mid-session suspension redirects to picker (no infinite loop)
- [ ] Cache invalidation works after suspend/reactivate

### Background Jobs (Future)
- [ ] Jobs check `Tenant.IsTenantActive()` at entry point
- [ ] Jobs gracefully skip/fail for suspended tenants

---

## Files Summary

### Backend
| Action | File | Notes |
|--------|------|-------|
| Create | Migration for CHECK constraint | Includes data cleanup + Down migration |
| Modify | `Modules/Tenants/Entities/Tenant.cs` | Add `Suspend()` and `Reactivate()` methods |
| Modify | `Modules/Tenants/Permissions/TenantPermissionsForStaff.cs` | Add SUSPEND, REACTIVATE permissions |
| Modify | `Modules/Tenants/Routes.Tenants.cs` | Add route constants |
| Modify | `Modules/Tenants/Services/TenantService.cs` | Add `GetTenantByIdIncludingSuspendedAsync` |
| Modify | `Modules/Tenants/Services/TenantAsStaffService.cs` | Add suspend/reactivate service methods |
| Modify | `Modules/Users/Services/AccountService.cs` | Add NEW `GetUserTenantsForPickerAsync` (don't modify existing) |
| Create | `Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs` | |
| Create | `Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs` | |
| Modify | `Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs` | Add `IsSuspended` to response |
| Modify | `Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs` | Register new endpoints |
| Modify | `Lib/Filters/TenantAuthFilter.cs` | Security: check membership before revealing suspended |
| Modify | `Modules/Auth/Handlers/GetTenantAuthData.cs` | Return 403 for suspended tenants |
| Modify | `Modules/Auth/Handlers/GetRedirectCode.cs` | Use new picker method |
| Create | `Modules/Auth/Handlers/GetUserTenantsForPicker.cs` | New endpoint for picker |
| Modify | `Modules/Auth/Endpoints/AuthEndpoints.cs` | Register picker endpoint |

### Frontend
| Action | File | Notes |
|--------|------|-------|
| Modify | `lib/react-query/features/staff/staff-tenant.hooks.ts` | Add mutation hooks |
| Modify | `lib/react-query/features/auth/auth.hooks.ts` | Add picker query hook |
| Modify | `routes/authed/staff/tenants/list/parts/tenants-table.tsx` | Add status + action buttons |
| Modify | `routes/authed/staff/tenants/details/...` | Add suspend/reactivate to details page |
| Create | `routes/authed/staff/tenants/components/tenant-suspend-dialog.tsx` | Confirmation dialog |
| Modify | `routes/authed/tenant/_portal/tenant-portal-page.tsx` | Update picker with suspended tenants |
| Modify | Global error handler | Handle `tenant-suspended` translation key |

### Translations
| File |
|------|
| `packages/shared/lib/i18n/json/en/response-message.json` |
| `packages/shared/lib/i18n/json/fr/response-message.json` |
| `packages/shared/lib/i18n/json/en/common.json` |
| `packages/shared/lib/i18n/json/fr/common.json` |

---

## Rollout Steps

1. **Database migration:** Run migration (data cleanup + CHECK constraint)
2. **Backend deployment:** Deploy API changes, permissions auto-seed
3. **Generate client:** `make build-api && make generate-client`
4. **Frontend deployment:** Deploy frontend changes
5. **Verification:** Run through testing checklist

### Rollback Plan

**If issues arise after deployment:**

1. **Backend rollback:** Revert API code; endpoints will 404
2. **Database rollback:** Run `Down` migration to drop CHECK constraint
   - **Note:** Data cleanup (syncing IsSuspended + Status) is NOT reversible, but this is safe since it only fixes inconsistent data
3. **Frontend rollback:** Revert frontend code

**Partial rollback (backend only):**
- Backend enforcement can be rolled back independently
- Frontend UI will just not show suspend/reactivate buttons (harmless)

