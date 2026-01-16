# Issue #167: Tenant Suspend/Reactivate Implementation Plan

## Overview

Implement tenant suspend/reactivate functionality for staff to manage tenant status, including backend endpoints, permission enforcement, audit logging, and frontend UI.

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
| Frontend suspend UI | ❌ Missing | Need to create |

### Key Files to Modify

**Backend:**
- `apps/api/Src/Modules/Tenants/Permissions/TenantPermissionsForStaff.cs`
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
- `apps/api/Src/Modules/Tenants/Services/ITenantAsStaffService.cs`
- `apps/api/Src/Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs`
- `apps/api/Src/Lib/Routes/Routes.Tenants.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs` (add IsSuspended to response)

**Backend (New Files):**
- `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs`

**Frontend:**
- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

**Frontend (New Files):**
- `apps/front/src/routes/authed/staff/tenants/components/tenant-suspend-dialog.tsx`

**Translations:**
- `packages/shared/lib/i18n/json/en/response-message.json`
- `packages/shared/lib/i18n/json/fr/response-message.json`
- `packages/shared/lib/i18n/json/en/common.json`
- `packages/shared/lib/i18n/json/fr/common.json`

---

## Implementation Tasks

### Phase 1: Backend - Permissions & Routes

#### Task 1.1: Add Suspend/Reactivate Permissions

**File:** `apps/api/Src/Modules/Tenants/Permissions/TenantPermissionsForStaff.cs`

Add two new permissions:

```csharp
public Permission SUSPEND { get; }   // staff.tenants.suspend
public Permission REACTIVATE { get; } // staff.tenants.reactivate
```

**Changes:**
1. Add `SUSPEND` and `REACTIVATE` properties
2. Initialize in constructor with English/French translations
3. Ensure permissions are seeded on next app start

#### Task 1.2: Add Route Constants

**File:** `apps/api/Src/Lib/Routes/Routes.Tenants.cs`

Add route constants:

```csharp
public static class ForStaff {
    // ... existing routes
    public const string Suspend = "/{tenantId}/suspend";
    public const string Reactivate = "/{tenantId}/reactivate";
}
```

---

### Phase 2: Backend - Service Layer

#### Task 2.1: Add Service Interface Methods

**File:** `apps/api/Src/Modules/Tenants/Services/ITenantAsStaffService.cs`

```csharp
Task<Tenant?> SuspendTenantAsync(
    Guid tenantId,
    string? reason,
    CancellationToken cancellationToken = default
);

Task<Tenant?> ReactivateTenantAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
);

// Also update GetTenantByIdAsync to NOT filter suspended tenants for staff
Task<Tenant?> GetTenantByIdForStaffAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
);
```

#### Task 2.2: Implement Service Methods

**File:** `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

**SuspendTenantAsync:**
1. Find tenant by ID (include suspended)
2. Validate tenant exists
3. Validate tenant is not already suspended
4. Set `IsSuspended = true`
5. Optionally update `Status = TenantStatus.Suspended`
6. Save changes
7. Return updated tenant

**ReactivateTenantAsync:**
1. Find tenant by ID
2. Validate tenant exists
3. Validate tenant is currently suspended
4. Set `IsSuspended = false`
5. Restore `Status = TenantStatus.Active` (if it was Suspended)
6. Save changes
7. Return updated tenant

**GetTenantByIdForStaffAsync:**
- Same as `GetTenantByIdAsync` but WITHOUT the `IsTenantActive()` filter
- Staff needs to see suspended tenants

---

### Phase 3: Backend - Handlers

#### Task 3.1: Create SuspendTenantAsStaff Handler

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs`

```csharp
namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

// Request DTO
public record SuspendTenantAsStaffBody {
    public JsonElement? Reason { get; init; }  // Optional suspension reason
}

// Response DTO
public record TenantSuspended {
    public required Guid TenantId { get; init; }
    public required string Name { get; init; }
    public required bool IsSuspended { get; init; }
}

// Validator
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

// Handler
public static class SuspendTenantAsStaff {
    public static async Task<Results<
        Ok<TenantSuspended>,
        AppBadRequestHttpResult,
        AppNotFoundHttpResult
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

        var tenant = await tenantService.SuspendTenantAsync(tenantId, reason, cancellationToken);

        if (tenant is null) {
            return TypedProblems.NotFound(
                "Tenant not found or already suspended",
                ResponseKeys.TenantNotFoundOrAlreadySuspended
            );
        }

        // Audit log
        await auditLogService.LogAsync(
            authContext.UserId!.Value,
            AuditActions.TenantSuspended,
            tenantId,
            new { TenantName = tenant.Name, Reason = reason },
            cancellationToken
        );

        return TypedResults.Ok(new TenantSuspended {
            TenantId = tenant.GetRequiredId(),
            Name = tenant.Name,
            IsSuspended = tenant.IsSuspended
        });
    }
}
```

#### Task 3.2: Create ReactivateTenantAsStaff Handler

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs`

Similar structure to suspend handler but:
- No request body needed (or optional note field)
- Calls `ReactivateTenantAsync`
- Logs `AuditActions.TenantReactivated`

#### Task 3.3: Update FindTenantsAsStaff Response

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs`

Add `IsSuspended` to `TenantAsStaffItem` response DTO:

```csharp
public record TenantAsStaffItem {
    // ... existing fields
    public required bool IsSuspended { get; init; }  // Add this
}
```

Update the query to include `IsSuspended` in the projection.

---

### Phase 4: Backend - Endpoint Registration

#### Task 4.1: Register New Endpoints

**File:** `apps/api/Src/Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs`

```csharp
// POST /staff/tenants/{tenantId}/suspend
group.MapPost(Routes.Tenants.ForStaff.Suspend, SuspendTenantAsStaff.HandleSuspendTenantAsStaff)
    .WithName("SuspendTenant")
    .WithSummary("Suspend a tenant")
    .WithReqBodyValidation<SuspendTenantAsStaffBody>()
    .WithPermission([AppPermissions.Staff.Tenants.SUSPEND]);

// POST /staff/tenants/{tenantId}/reactivate
group.MapPost(Routes.Tenants.ForStaff.Reactivate, ReactivateTenantAsStaff.HandleReactivateTenantAsStaff)
    .WithName("ReactivateTenant")
    .WithSummary("Reactivate a suspended tenant")
    .WithPermission([AppPermissions.Staff.Tenants.REACTIVATE]);
```

---

### Phase 5: Backend - Translations

#### Task 5.1: Add Response Message Translations

**File:** `packages/shared/lib/i18n/json/en/response-message.json`

```json
{
  "tenant-not-found-or-already-suspended": "Tenant not found or already suspended",
  "tenant-not-found-or-not-suspended": "Tenant not found or not currently suspended",
  "tenant-suspended-successfully": "Tenant suspended successfully",
  "tenant-reactivated-successfully": "Tenant reactivated successfully"
}
```

**File:** `packages/shared/lib/i18n/json/fr/response-message.json`

```json
{
  "tenant-not-found-or-already-suspended": "Locataire non trouvé ou déjà suspendu",
  "tenant-not-found-or-not-suspended": "Locataire non trouvé ou pas actuellement suspendu",
  "tenant-suspended-successfully": "Locataire suspendu avec succès",
  "tenant-reactivated-successfully": "Locataire réactivé avec succès"
}
```

---

### Phase 6: Frontend - API Hooks

#### Task 6.1: Add Mutation Hooks

**File:** `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

```typescript
// Suspend tenant mutation
export const useSuspendTenant = createStaffMutation({
    mutationKeyFn: (client) => client.staff.tenants.byTenantId('').suspend.post,
    mutationFn: async (client, variables: { tenantId: string; reason?: string }) => {
        const result = await client.staff.tenants
            .byTenantId(variables.tenantId)
            .suspend
            .post({
                reason: variables.reason
                    ? createUntypedString(variables.reason)
                    : undefined,
            });
        if (_.isNil(result)) throw new Error('useSuspendTenant: result is nil');
        return result;
    },
});

// Reactivate tenant mutation
export const useReactivateTenant = createStaffMutation({
    mutationKeyFn: (client) => client.staff.tenants.byTenantId('').reactivate.post,
    mutationFn: async (client, variables: { tenantId: string }) => {
        const result = await client.staff.tenants
            .byTenantId(variables.tenantId)
            .reactivate
            .post();
        if (_.isNil(result)) throw new Error('useReactivateTenant: result is nil');
        return result;
    },
});
```

---

### Phase 7: Frontend - UI Components

#### Task 7.1: Create Suspend Confirmation Dialog

**File:** `apps/front/src/routes/authed/staff/tenants/components/tenant-suspend-dialog.tsx`

```tsx
type TenantSuspendDialogProps = {
    open: boolean;
    onClose: () => void;
    tenant: { id: string; name: string } | null;
    onSuccess?: () => void;
};

const TenantSuspendDialog = ({ open, onClose, tenant, onSuccess }: TenantSuspendDialogProps) => {
    const { t } = useTranslation('common');
    const [reason, setReason] = useState('');

    const { mutate: suspendTenant, isPending } = useSuspendTenant({
        onSuccess: () => {
            onClose();
            onSuccess?.();
        },
    });

    const handleConfirm = () => {
        if (!tenant) return;
        suspendTenant({ tenantId: tenant.id, reason: reason || undefined });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('suspend_tenant')}</DialogTitle>
            <DialogContent>
                <Typography sx={{ mb: 2 }}>
                    {t('suspend_tenant_confirmation', { name: tenant?.name })}
                </Typography>
                <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label={t('reason_optional')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('enter_suspension_reason')}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={isPending}>
                    {t('cancel')}
                </Button>
                <Button
                    onClick={handleConfirm}
                    color="error"
                    variant="contained"
                    disabled={isPending}
                >
                    {isPending ? <CircularProgress size={20} /> : t('suspend')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
```

#### Task 7.2: Update Tenants Table

**File:** `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

**Changes:**

1. **Add IsSuspended to status display:**
```tsx
const StatusCell = ({ row }) => {
    const { status, isSuspended } = row.original;

    // Suspended takes priority
    if (isSuspended) {
        return <Label variant="soft" color="error">{t('suspended')}</Label>;
    }

    // Normal status display
    let color: LabelColor = 'default';
    if (status === TENANT_STATUS_ENUM.ACTIVE) color = 'success';
    else if (status === TENANT_STATUS_ENUM.PENDING) color = 'warning';
    // ... etc

    return <Label variant="soft" color={color}>{statusText}</Label>;
};
```

2. **Add suspend/reactivate action buttons:**
```tsx
const ActionsCell = ({ row }) => {
    const { id, name, isSuspended } = row.original;
    const suspendDialog = useBoolean();

    const { mutate: reactivate, isPending: isReactivating } = useReactivateTenant({
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: useFindTenants.getKey() });
        },
    });

    return (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
            {/* View button */}
            <IconButton href={paths.staff.tenants.details.general(id)}>
                <Iconify icon="solar:eye-bold" />
            </IconButton>

            {/* Suspend/Reactivate button */}
            {isSuspended ? (
                <IconButton
                    onClick={() => reactivate({ tenantId: id })}
                    disabled={isReactivating}
                    sx={{ color: 'success.main' }}
                    title={t('reactivate')}
                >
                    <Iconify icon="solar:play-circle-bold" />
                </IconButton>
            ) : (
                <IconButton
                    onClick={suspendDialog.onTrue}
                    sx={{ color: 'warning.main' }}
                    title={t('suspend')}
                >
                    <Iconify icon="solar:pause-circle-bold" />
                </IconButton>
            )}

            {/* Suspend dialog */}
            <TenantSuspendDialog
                open={suspendDialog.value}
                onClose={suspendDialog.onFalse}
                tenant={{ id, name }}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: useFindTenants.getKey() });
                }}
            />
        </Box>
    );
};
```

---

### Phase 8: Frontend - Translations

#### Task 8.1: Add Common Translations

**File:** `packages/shared/lib/i18n/json/en/common.json`

```json
{
  "suspend": "Suspend",
  "reactivate": "Reactivate",
  "suspended": "Suspended",
  "suspend_tenant": "Suspend Tenant",
  "suspend_tenant_confirmation": "Are you sure you want to suspend {{name}}? Users will not be able to access this tenant.",
  "reason_optional": "Reason (optional)",
  "enter_suspension_reason": "Enter reason for suspension..."
}
```

**File:** `packages/shared/lib/i18n/json/fr/common.json`

```json
{
  "suspend": "Suspendre",
  "reactivate": "Réactiver",
  "suspended": "Suspendu",
  "suspend_tenant": "Suspendre le locataire",
  "suspend_tenant_confirmation": "Êtes-vous sûr de vouloir suspendre {{name}}? Les utilisateurs ne pourront plus accéder à ce locataire.",
  "reason_optional": "Raison (facultatif)",
  "enter_suspension_reason": "Entrez la raison de la suspension..."
}
```

---

## Testing Checklist

### Backend Tests (Manual)
- [ ] POST `/staff/tenants/{id}/suspend` with valid tenant ID
- [ ] POST `/staff/tenants/{id}/suspend` with already suspended tenant (expect 400/404)
- [ ] POST `/staff/tenants/{id}/suspend` with non-existent tenant (expect 404)
- [ ] POST `/staff/tenants/{id}/reactivate` with suspended tenant
- [ ] POST `/staff/tenants/{id}/reactivate` with active tenant (expect 400/404)
- [ ] Verify audit logs are created for both actions
- [ ] Verify permissions are enforced (403 without permission)
- [ ] GET `/staff/tenants` returns `isSuspended` field

### Frontend Tests (Manual)
- [ ] Tenant list shows correct status badge (Active vs Suspended)
- [ ] Suspend button appears for active tenants
- [ ] Reactivate button appears for suspended tenants
- [ ] Suspend dialog opens and accepts reason input
- [ ] Confirm suspend action updates UI
- [ ] Reactivate action updates UI
- [ ] Success toasts appear after actions
- [ ] Error handling works (network errors, permission denied)

---

## Rollout Steps

1. **Backend deployment:**
   - Deploy API changes
   - Run database migrations (if any)
   - Permissions auto-seed on startup

2. **Generate client:**
   ```bash
   make build-api
   make generate-client
   ```

3. **Frontend deployment:**
   - Deploy frontend changes

4. **Verification:**
   - Test in staging environment
   - Verify audit logs in database
   - Test permission enforcement

---

## Design Decisions

### Q: Should suspending a tenant also suspend all user accounts?
**Decision:** No. The `IsSuspended` flag on tenant level is sufficient. The `Tenant.IsTenantActive()` check already prevents access. User-level suspension is a separate concern.

### Q: Should we use `TenantStatus.Suspended` or just `IsSuspended`?
**Decision:** Use `IsSuspended` as the primary flag since `IsTenantActive()` already checks it. The `TenantStatus` enum can optionally be updated for reporting/filtering purposes, but `IsSuspended` is the authoritative field.

### Q: HTTP method for suspend/reactivate?
**Decision:** Use `POST` as these are actions/commands, not idempotent updates. Following REST conventions for non-CRUD operations.

### Q: Should suspend reason be stored?
**Decision:** Store in audit log details (JSON), not as a separate database column. This keeps the Tenant entity clean while maintaining full audit trail.

---

## Files Summary

| Action | File |
|--------|------|
| **Modify** | `apps/api/Src/Modules/Tenants/Permissions/TenantPermissionsForStaff.cs` |
| **Modify** | `apps/api/Src/Modules/Tenants/Services/ITenantAsStaffService.cs` |
| **Modify** | `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs` |
| **Modify** | `apps/api/Src/Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs` |
| **Modify** | `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.cs` |
| **Modify** | `apps/api/Src/Lib/Routes/Routes.Tenants.cs` |
| **Create** | `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs` |
| **Create** | `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs` |
| **Modify** | `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts` |
| **Modify** | `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx` |
| **Create** | `apps/front/src/routes/authed/staff/tenants/components/tenant-suspend-dialog.tsx` |
| **Modify** | `packages/shared/lib/i18n/json/en/response-message.json` |
| **Modify** | `packages/shared/lib/i18n/json/fr/response-message.json` |
| **Modify** | `packages/shared/lib/i18n/json/en/common.json` |
| **Modify** | `packages/shared/lib/i18n/json/fr/common.json` |
