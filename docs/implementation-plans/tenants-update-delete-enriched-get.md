# Implementation Plan: 2.1 PATCH Tenant, 2.2 DELETE Tenant, 2.3 Enriched GET

## Overview

Implement the three missing CRUD operations for the staff tenant module:
- **2.1** `PATCH /staff/tenants/{tenantId}` — Update tenant (name, logoUrl, maxUsers)
- **2.2** `DELETE /staff/tenants/{tenantId}` — Soft-delete tenant (must be suspended first)
- **2.3** Enrich the existing `GET /staff/tenants/{tenantId}` response with all tenant fields

Permissions `tenants:update` and `tenants:delete` are already defined and seeded.

---

## Decisions & Constraints

| Decision | Choice | Rationale |
|---|---|---|
| Delete precondition | Must be suspended first | Industry standard two-step safety net; prevents accidental deletion of active tenants |
| Cascade on delete | No cascade — soft-delete parent only | Tenant-scoped queries already filter by tenant; child data becomes unreachable |
| MaxUsers validation | Reject if new value < current user count | Prevents creating an over-limit inconsistent state |
| PatchField usage | `LogoUrl` uses `PatchField<string?>` | LogoUrl is nullable and clearable; Name/MaxUsers are required (not nullable) |
| Update response | Return full enriched tenant DTO | Reuse the same enriched DTO across GET and PATCH responses |
| Delete response | Return `ApiResponse` with message | Follows existing pattern (suspend/reactivate return entity, delete returns message) |
| Delete "not suspended" status code | 400 BadRequest (not 409) | Matches `SuspendTenantAsStaff` which returns 400 for `NotActiveStatus` (precondition not met). 409 is for "already in target state" like `AlreadySuspended`. |
| Empty PATCH body | Return 200 (no-op) | All fields optional; `{}` is valid — updates only `UpdatedAt`. Simpler than a "at least one field required" rule. |

---

## Shared: Enriched Tenant DTO (used by GET, PATCH, and list reference)

This enriched response DTO replaces the current `GetTenantAsStaffResult` (which only has `TenantId` + `Name`).

```csharp
// File: GetTenantAsStaff.cs (replace existing DTO)
public class GetTenantAsStaffResult {
    public Guid TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public int MaxUsers { get; set; }
    public string Status { get; set; } = string.Empty;
    public bool IsSuspended { get; set; }
    public int UsersCount { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

---

## Step 1: Backend — Enrich GET Response (2.3)

### 1.1 Add `CountTenantUsersAsync` to `TenantAsStaffService`

**File:** `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

Add to interface:
```csharp
Task<int> CountTenantUsersAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
);
```

Add implementation:
```csharp
public async Task<int> CountTenantUsersAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
) {
    var count =
        from ua in _dbContext.UserAccount
        where ua.TenantId == tenantId
            && ua.Scope == AccountScope.Tenant
            && !ua.IsDeleted
        select ua;

    return await count.CountAsync(cancellationToken);
}
```

### 1.2 Update `GetTenantAsStaff` Handler

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/GetTenantAsStaff.cs`

- Expand `GetTenantAsStaffResult` with all tenant fields (see shared DTO above)
- Inject `ITenantAsStaffService` (already injected)
- After fetching tenant, also call `CountTenantUsersAsync(tenantId)`
- Map all fields into the enriched response

```csharp
var usersCount = await tenantAsStaffService
    .CountTenantUsersAsync(tenantIdGuid, cancellationToken);

return TypedResults.Ok(new GetTenantAsStaffResult {
    TenantId = tenant.GetRequiredId(),
    Name = tenant.Name,
    Code = tenant.Code,
    LogoUrl = tenant.LogoUrl,
    MaxUsers = tenant.MaxUsers,
    Status = Tenant.GetStatusDescription(tenant.Status),
    IsSuspended = tenant.IsSuspended,
    UsersCount = usersCount,
    CreatedAt = tenant.CreatedAt,
    UpdatedAt = tenant.UpdatedAt,
});
```

### 1.3 Update Tests

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/GetTenantAsStaff.Spec.cs`

- Update `ItShouldReturnTenantWhenSuspended` to assert new fields
- Add `ItShouldReturnEnrichedTenantForActiveTenant` test

---

## Step 2: Backend — PATCH Tenant (2.1)

### 2.1 Add Route Constants

**File:** `apps/api/Src/Modules/Tenants/Routes.Tenants.cs`

```csharp
public const string Update = "/{tenantId}";
public static string UpdateFn(string tenantId) => $"/{tenantId}";
```

### 2.2 Add Service Methods

**File:** `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

**Result type** (discriminated union, follows existing pattern):
```csharp
public enum UpdateTenantError { NotFound, MaxUsersBelowCurrentCount }
public record UpdateTenantResult(Tenant? Tenant, UpdateTenantError? Error);
```

**Args record** (3+ params → use named record per C# coding standards):
```csharp
public record UpdateTenantAsStaffArgs(
    string? Name,
    PatchField<string?> LogoUrl,
    int? MaxUsers
);
```

**Interface addition:**
```csharp
Task<UpdateTenantResult> UpdateTenantAsync(
    Guid tenantId,
    UpdateTenantAsStaffArgs args,
    CancellationToken cancellationToken = default
);
```

**Implementation** (tracked entity approach — `ExecuteUpdateAsync` can't use conditional
`SetProperty` chains since the lambda must be an expression tree):
```csharp
public async Task<UpdateTenantResult> UpdateTenantAsync(
    Guid tenantId,
    UpdateTenantAsStaffArgs args,
    CancellationToken cancellationToken = default
) {
    var tenant = await (
        from t in _dbContext.Tenant
        where t.Id == tenantId && !t.IsDeleted
        select t
    ).FirstOrDefaultAsync(cancellationToken);

    if (tenant is null) {
        return new UpdateTenantResult(null, UpdateTenantError.NotFound);
    }

    // Validate MaxUsers against current user count
    if (args.MaxUsers is not null) {
        var currentUserCount = await CountTenantUsersAsync(
            tenantId, cancellationToken
        );
        if (args.MaxUsers.Value < currentUserCount) {
            return new UpdateTenantResult(
                null, UpdateTenantError.MaxUsersBelowCurrentCount
            );
        }
    }

    // Mutate tracked entity (no re-fetch needed — EF keeps it up-to-date)
    if (args.Name is not null) {
        tenant.Name = args.Name;
    }
    if (args.LogoUrl.IsPresent) {
        tenant.LogoUrl = args.LogoUrl.Value;
    }
    if (args.MaxUsers is not null) {
        tenant.MaxUsers = args.MaxUsers.Value;
    }
    tenant.UpdatedAt = DateTime.UtcNow;
    await _dbContext.SaveChangesAsync(cancellationToken);

    return new UpdateTenantResult(tenant, null);
}
```

> **Note:** Unlike suspend/reactivate (which are state transitions requiring atomic
> `ExecuteUpdateAsync` with WHERE clause for race safety), update is a general-purpose
> mutation without state-transition semantics. The tracked entity approach is simpler
> and saves a DB roundtrip (no re-fetch needed).

### 2.3 Add Translation Keys

**Files:**
- `packages/shared/lib/i18n/json/response-message.en.json`
- `packages/shared/lib/i18n/json/response-message.fr.json`

Add:
```json
"tenant-updated-success": "Tenant has been updated successfully",
"tenant-max-users-below-count": "Max users cannot be less than the current number of users",
"tenant-deleted-success": "Tenant has been deleted successfully",
"tenant-not-suspended-cannot-delete": "Only suspended tenants can be deleted"
```

Then run `make build-api` to regenerate `ResponseKeys.g.cs`.

### 2.4 Add Audit Action

**File:** `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`

```csharp
public const string TenantUpdated = "tenant.updated";
public const string TenantDeleted = "tenant.deleted";
```

### 2.5 Create Handler

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`

```csharp
namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

// Request body DTO
public record UpdateTenantAsStaffBody {
    public JsonElement? Name { get; init; }
    public JsonElement LogoUrl { get; init; }     // Non-nullable for PatchField
    public JsonElement? MaxUsers { get; init; }

    public string? GetName() => Name.GetValueAsStringOrNull();

    public PatchField<string?> GetLogoUrl() =>
        LogoUrl.ValueKind switch {
            JsonValueKind.Undefined => PatchField<string?>.Absent(),
            JsonValueKind.Null => PatchField<string?>.Set(null),
            JsonValueKind.String => PatchField<string?>.Set(
                LogoUrl.GetValueAsString()
            ),
            _ => throw new InvalidOperationException(
                "LogoUrl must be a string, null, or omitted"
            ),
        };

    public int? GetMaxUsers() => MaxUsers?.GetValueAsInt32OrNull();
}

// Validator
// NOTE: Name and MaxUsers are required entity fields — reject null (only omit allowed).
// LogoUrl is nullable + clearable — accept null (PatchField handles it).
public class UpdateTenantAsStaffBodyValidator
    : AbstractValidator<UpdateTenantAsStaffBody> {
    public UpdateTenantAsStaffBodyValidator() {
        RuleFor(x => x.Name)
            .Must(e => e is null
                || e.Value.ValueKind == JsonValueKind.String)
            .WithMessage("Name must be a string")
            .DependentRules(() => {
                RuleFor(x => x.Name)
                    .Must(e => e is null
                        || (e.Value.GetString()?.Length ?? 0) >= 5)
                    .WithMessage("Name must be at least 5 characters");
            });

        RuleFor(x => x.LogoUrl)
            .Must(e =>
                e.ValueKind == JsonValueKind.Undefined
                || e.ValueKind == JsonValueKind.Null
                || e.ValueKind == JsonValueKind.String)
            .WithMessage("LogoUrl must be a string, null, or omitted");

        RuleFor(x => x.MaxUsers)
            .Must(e => e is null
                || e.Value.ValueKind == JsonValueKind.Number)
            .WithMessage("MaxUsers must be a number")
            .DependentRules(() => {
                RuleFor(x => x.MaxUsers)
                    .Must(e => e is null
                        || (e.Value.TryGetInt32(out var v) && v > 0))
                    .WithMessage("MaxUsers must be greater than 0");
            });
    }
}

// Handler
public static class UpdateTenantAsStaff {
    public static async Task<Results<
        Ok<GetTenantAsStaffResult>,
        AppBadRequestHttpResult,
        AppNotFoundHttpResult
    >> HandleUpdateTenantAsStaff(
        [FromRoute] string tenantId,
        [FromBody] UpdateTenantAsStaffBody body,
        [FromServices] ITenantAsStaffService tenantService,
        [FromServices] IAuditLogService auditLogService,
        [FromServices] IRequestAuthContext authContext,
        CancellationToken cancellationToken = default
    ) {
        if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
            return TypedProblems.BadRequest(
                "Invalid tenant ID",
                ResponseKeys.MalformedId
            );
        }

        var args = new UpdateTenantAsStaffArgs(
            Name: body.GetName(),
            LogoUrl: body.GetLogoUrl(),
            MaxUsers: body.GetMaxUsers()
        );

        var result = await tenantService.UpdateTenantAsync(
            tenantIdGuid, args, cancellationToken
        );

        if (result.Error is not null) {
            return result.Error switch {
                UpdateTenantError.NotFound =>
                    TypedProblems.NotFound(
                        "Tenant not found",
                        ResponseKeys.TenantNotFound
                    ),
                UpdateTenantError.MaxUsersBelowCurrentCount =>
                    TypedProblems.BadRequest(
                        "Max users cannot be less than the current number of users",
                        ResponseKeys.TenantMaxUsersBelowCount
                    ),
                _ => throw new InvalidOperationException(
                    $"Unknown error: {result.Error}"
                )
            };
        }

        var account = authContext.AccountStaff;
        if (account is null) {
            throw new InvalidOperationException(
                "Staff account not found in auth context. "
                + "Ensure the endpoint has "
                + ".WithPermission() middleware."
            );
        }

        var tenant = result.Tenant!;
        var usersCount = await tenantService
            .CountTenantUsersAsync(tenantIdGuid, cancellationToken);

        await auditLogService.LogAsync(
            account.UserId,
            AuditActions.TenantUpdated,
            tenantIdGuid,
            new {
                Name = args.Name,
                LogoUrl = args.LogoUrl.IsPresent
                    ? args.LogoUrl.Value : null,
                MaxUsers = args.MaxUsers,
            },
            cancellationToken
        );

        return TypedResults.Ok(new GetTenantAsStaffResult {
            TenantId = tenant.GetRequiredId(),
            Name = tenant.Name,
            Code = tenant.Code,
            LogoUrl = tenant.LogoUrl,
            MaxUsers = tenant.MaxUsers,
            Status = Tenant.GetStatusDescription(tenant.Status),
            IsSuspended = tenant.IsSuspended,
            UsersCount = usersCount,
            CreatedAt = tenant.CreatedAt,
            UpdatedAt = tenant.UpdatedAt,
        });
    }
}
```

### 2.6 Map Endpoint

**File:** `apps/api/Src/Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs`

Add after the GET mapping:
```csharp
group.MapPatch(
    Routes.Tenants.ForStaff.Update,
    UpdateTenantAsStaff.HandleUpdateTenantAsStaff
)
    .WithName("UpdateTenant")
    .WithSummary("Update a tenant")
    .WithReqBodyValidation<UpdateTenantAsStaffBody>()
    .WithPermission([AppPermissions.Staff.Tenants.UPDATE]);
```

### 2.7 Write Tests

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.Spec.cs`

Test cases:
- `ItShouldUpdateTenantNameSuccessfully`
- `ItShouldClearLogoUrlWhenSetToNull`
- `ItShouldReturn200ForEmptyPatchBody` — sends `{}`, verifies 200 with unchanged data (only `UpdatedAt` changes)
- `ItShouldReturnNotFoundForNonExistentId`
- `ItShouldReturnBadRequestForMalformedId`
- `ItShouldReturnBadRequestWhenMaxUsersBelowCurrentCount`
- `ItShouldExcludeDeletedUsersFromCount` — verifies `CountTenantUsersAsync` excludes soft-deleted users and staff-scoped accounts (creates users with mixed states, asserts count accuracy)
- `ItShouldReturnUnauthorizedWithoutSession`
- `ItShouldReturnForbiddenForNonStaffUser`
- `ItShouldReturnForbiddenForStaffWithoutPermission`

---

## Step 3: Backend — DELETE Tenant (2.2)

### 3.1 Add Route Constants

**File:** `apps/api/Src/Modules/Tenants/Routes.Tenants.cs`

```csharp
public const string Delete = "/{tenantId}";
public static string DeleteFn(string tenantId) => $"/{tenantId}";
```

### 3.2 Add Service Methods

**File:** `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`

**Result type:**
```csharp
public enum DeleteTenantError { NotFound, NotSuspended }
public record DeleteTenantResult(Tenant? Tenant, DeleteTenantError? Error);
```

**Interface addition:**
```csharp
Task<DeleteTenantResult> DeleteTenantAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
);
```

**Implementation** (atomic `ExecuteUpdateAsync` for soft delete):
```csharp
public async Task<DeleteTenantResult> DeleteTenantAsync(
    Guid tenantId,
    CancellationToken cancellationToken = default
) {
    var tenant = await (
        from t in _dbContext.Tenant.AsNoTracking()
        where t.Id == tenantId && !t.IsDeleted
        select t
    ).FirstOrDefaultAsync(cancellationToken);

    if (tenant is null) {
        return new DeleteTenantResult(null, DeleteTenantError.NotFound);
    }

    if (!tenant.IsSuspended) {
        return new DeleteTenantResult(null, DeleteTenantError.NotSuspended);
    }

    // Atomic soft-delete with WHERE clause (race-condition safe)
    var rowsAffected = await _dbContext.Tenant
        .Where(t =>
            t.Id == tenantId
            && !t.IsDeleted
            && t.IsSuspended)
        .ExecuteUpdateAsync(
            setters => setters
                .SetProperty(t => t.IsDeleted, true)
                .SetProperty(t => t.DeletedAt, DateTime.UtcNow)
                .SetProperty(t => t.Status, TenantStatus.Archived)
                .SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
            cancellationToken
        );

    if (rowsAffected == 0) {
        // Race condition: state changed between read and update
        return new DeleteTenantResult(null, DeleteTenantError.NotSuspended);
    }

    return new DeleteTenantResult(tenant, null);
}
```

### 3.3 Create Handler

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/DeleteTenantAsStaff.cs`

```csharp
namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

public static class DeleteTenantAsStaff {
    public static async Task<Results<
        Ok<ApiResponse>,
        AppBadRequestHttpResult,
        AppNotFoundHttpResult
    >> HandleDeleteTenantAsStaff(
        [FromRoute] string tenantId,
        [FromServices] ITenantAsStaffService tenantService,
        [FromServices] IAuditLogService auditLogService,
        [FromServices] IRequestAuthContext authContext,
        CancellationToken cancellationToken = default
    ) {
        if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
            return TypedProblems.BadRequest(
                "Invalid tenant ID",
                ResponseKeys.MalformedId
            );
        }

        var result = await tenantService.DeleteTenantAsync(
            tenantIdGuid, cancellationToken
        );

        if (result.Error is not null) {
            return result.Error switch {
                DeleteTenantError.NotFound =>
                    TypedProblems.NotFound(
                        "Tenant not found",
                        ResponseKeys.TenantNotFound
                    ),
                DeleteTenantError.NotSuspended =>
                    TypedProblems.BadRequest(
                        "Only suspended tenants can be deleted",
                        ResponseKeys.TenantNotSuspendedCannotDelete
                    ),
                _ => throw new InvalidOperationException(
                    $"Unknown error: {result.Error}"
                )
            };
        }

        var account = authContext.AccountStaff;
        if (account is null) {
            throw new InvalidOperationException(
                "Staff account not found in auth context. "
                + "Ensure the endpoint has "
                + ".WithPermission() middleware."
            );
        }

        var tenant = result.Tenant!;

        await auditLogService.LogAsync(
            account.UserId,
            AuditActions.TenantDeleted,
            tenantIdGuid,
            new { TenantName = tenant.Name },
            cancellationToken
        );

        return TypedResults.Ok(
            ApiResponse.Create(
                "Tenant deleted successfully",
                ResponseKeys.TenantDeletedSuccess
            )
        );
    }
}
```

### 3.4 Map Endpoint

**File:** `apps/api/Src/Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs`

```csharp
group.MapDelete(
    Routes.Tenants.ForStaff.Delete,
    DeleteTenantAsStaff.HandleDeleteTenantAsStaff
)
    .WithName("DeleteTenant")
    .WithSummary("Soft-delete a suspended tenant")
    .WithPermission([AppPermissions.Staff.Tenants.DELETE]);
```

### 3.5 Write Tests

**File:** `apps/api/Src/Modules/Tenants/Handlers/Staff/DeleteTenantAsStaff.Spec.cs`

Test cases:
- `ItShouldSoftDeleteSuspendedTenant`
- `ItShouldReturnBadRequestWhenTenantNotSuspended`
- `ItShouldReturnNotFoundForNonExistentId`
- `ItShouldReturnBadRequestForMalformedId`
- `ItShouldReturnNotFoundForAlreadyDeletedTenant` — requires multi-step setup: create → suspend → delete → try delete again. Each test class gets its own DB clone so no cleanup is needed, but the helper methods should encapsulate the setup chain.
- `ItShouldReturnUnauthorizedWithoutSession`
- `ItShouldReturnForbiddenForNonStaffUser`
- `ItShouldReturnForbiddenForStaffWithoutPermission`

---

## Step 4: Generate TypeScript Client

After all backend changes:

```bash
make build-api && make generate-client && make tsc-front
```

This generates:
- Updated `GetTenantAsStaffResult` with all enriched fields
- New `UpdateTenantAsStaffBody` type
- New PATCH and DELETE client methods on `client.staff.tenants.byTenantId()`

---

## Step 5: Frontend — Wire Update Form (2.1)

### 5.1 Add Mutation Hook

**File:** `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

```typescript
export const useUpdateTenant = createStaffMutation({
    mutationKeyFn: (client) =>
        client.staff.tenants.byTenantId('').patch,
    mutationFn: async (
        client,
        variables: {
            tenantId: string;
            name?: string;
            logoUrl?: string | null; // undefined=omit, string=set, null=clear
            maxUsers?: number;
        },
    ) => {
        const body: UpdateTenantAsStaffBody = {};
        if (variables.name !== undefined) {
            body.name = createUntypedString(variables.name)
                as typeof body.name;
        }
        if (variables.maxUsers !== undefined) {
            body.maxUsers = createUntypedNumber(variables.maxUsers)
                as typeof body.maxUsers;
        }
        // logoUrl three-state: undefined → omit (no change),
        // string → set value, null → clear (send explicit null)
        if (variables.logoUrl !== undefined) {
            body.logoUrl = (
                variables.logoUrl === null
                    ? createUntypedNull()
                    : createUntypedString(variables.logoUrl)
            ) as typeof body.logoUrl;
        }

        const result = await client.staff.tenants
            .byTenantId(variables.tenantId)
            .patch(body);
        if (_.isNil(result)) {
            throw new Error('useUpdateTenant: result is nil');
        }
        return result;
    },
});
```

> **Note:** `createUntypedNull` is from `@microsoft/kiota-abstractions`.
> The `logoUrl` three-state maps to the backend `PatchField<string?>`:
> - Field omitted from body → `PatchField.IsPresent = false` → no change
> - Field set to a string → `PatchField.IsPresent = true, Value = "url"` → set value
> - Field set to `null` → `PatchField.IsPresent = true, Value = null` → clear to null

### 5.2 Rewire General Tab Page

**File:** `apps/front/src/routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx`

Current state: all fields are disabled read-only `<TextField>` with no form. The page already has `ErrorView` with `NotFoundView` for 404/malformed-id and `ErrorContent` for other errors (from the 1.2 fix). **Preserve the existing `ErrorView` wrapper as-is.**

**Form schema** (Zod):
```typescript
const updateTenantSchema = z.object({
    name: z.string().min(5),
    maxUsers: z.number().int().positive(),
    // logoUrl handled separately (file upload / future)
});
```

**Form initialization** — use `useForm({ values })` for auto-sync with async query data:
```typescript
const form = useForm<UpdateTenantFormValues>({
    resolver: zodResolver(updateTenantSchema),
    values: data ? {
        name: data.name,
        maxUsers: data.maxUsers,
    } : undefined,
});
```

> RHF v7.43+ `values` option auto-resets the form when query data changes (no `useEffect` + `reset()` needed).

**Mutation wiring** — use `withFormValidation` to map server validation errors to form fields:
```typescript
const { mutate: updateTenant, isPending: isUpdating } =
    useUpdateTenant(
        withFormValidation(form.setError, {
            meta: { showSuccessToast: true },
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: useGetTenant.getKey(tenantId),
                });
                queryClient.invalidateQueries({
                    queryKey: useFindTenants.getKey(),
                });
            },
        }),
    );
```

**Save button** — disable when form is clean or submitting:
```typescript
<Button
    type="submit"
    disabled={!form.formState.isDirty || isUpdating}
    loading={isUpdating}
>
    {t('save-changes')}
</Button>
```

### 5.3 Display Enriched Tenant Data

In the General tab content:

**Editable fields** (inside the form):
- **Name** — `<TextField>` registered with RHF (editable)
- **MaxUsers** — `<TextField type="number">` registered with RHF (editable)

**Read-only fields** (use `InputProps={{ readOnly: true }}` instead of `disabled` to preserve normal styling):
- **Code** — `<TextField InputProps={{ readOnly: true }}>` (never editable)
- **Status** — Status chip/label (read-only, styled like list page)
- **Users Count** — `<TextField InputProps={{ readOnly: true }}>` showing `{usersCount} / {maxUsers}`
- **Created At** — formatted via `fDateTime` from `format-time.ts`
- **Updated At** — formatted via `fDateTime` from `format-time.ts`

---

## Step 6: Frontend — Wire Delete Button (2.2)

### 6.1 Add Mutation Hook

**File:** `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

```typescript
export const useDeleteTenant = createStaffMutation({
    mutationKeyFn: (client) =>
        client.staff.tenants.byTenantId('').delete,
    mutationFn: async (
        client,
        variables: { tenantId: string },
    ) => {
        const result = await client.staff.tenants
            .byTenantId(variables.tenantId)
            .delete();
        if (_.isNil(result)) {
            throw new Error('useDeleteTenant: result is nil');
        }
        return result;
    },
});
```

### 6.2 Wire Danger Zone Buttons

**File:** `apps/front/src/routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx`

The Danger Zone card shows **context-dependent buttons** based on tenant state:

**When tenant is Active (`!isSuspended`):**
- **Suspend button** — calls `useSuspendTenant`
- On success → invalidate `useGetTenant` query (page re-renders with updated state)

**When tenant is Suspended (`isSuspended`):**
- **Reactivate button** — calls existing `useReactivateTenant` hook
- On success → invalidate `useGetTenant` query
- **Delete button** — opens `ConfirmDialog`

**ConfirmDialog pattern** — follows existing codebase pattern (see `tenants-table.tsx`). The `action` prop receives a Button element; cancel is rendered automatically by ConfirmDialog:

```tsx
<ConfirmDialog
    title={t('confirm-delete-tenant-title')}
    content={t('confirm-delete-tenant-message')}
    action={
        <Button
            color="error"
            onClick={() => deleteTenant(
                { tenantId },
                {
                    onSuccess: () => {
                        queryClient.invalidateQueries({
                            queryKey: useFindTenants.getKey(),
                        });
                        navigate(PATH_STAFF.tenants.list);
                    },
                },
            )}
            disabled={isDeleting}
        >
            {t('delete')}
        </Button>
    }
/>
```

> **Query invalidation:** `useFindTenants` must be invalidated after delete so the list page doesn't show the deleted tenant from stale cache. Navigation happens in `onSuccess` after invalidation.

---

## Step 7: i18n Translation Keys

### Response messages (backend → auto-generated)
Already covered in Step 2.3. After adding to JSON files and building, `ResponseKeys.g.cs` auto-generates.

### Frontend UI strings
**File:** `packages/shared/lib/i18n/json/en.json` (and `fr.json`)

Add if not already present:
```json
"code": "Code",
"status": "Status",
"users-count": "Users count",
"created-at": "Created at",
"updated-at": "Updated at",
"confirm-delete-tenant-title": "Delete tenant",
"confirm-delete-tenant-message": "Are you sure you want to delete this tenant? This action cannot be easily undone.",
"tenant-must-be-suspended-to-delete": "Tenant must be suspended before it can be deleted",
"tenant-updated-successfully": "Tenant updated successfully",
"tenant-deleted-successfully": "Tenant deleted successfully"
```

---

## Execution Order

| # | Task | Depends On | Files Changed |
|---|------|-----------|---------------|
| 1 | Add `CountTenantUsersAsync` service method | — | `TenantAsStaffService.cs` |
| 2 | Enrich GET response (2.3) | 1 | `GetTenantAsStaff.cs`, `GetTenantAsStaff.Spec.cs` |
| 3 | Add translation keys (en + fr) | — | `response-message.en.json`, `response-message.fr.json` |
| 4 | Add audit actions | — | `AuditLog.cs` |
| 5 | Add route constants (Update + Delete) | — | `Routes.Tenants.cs` |
| 6 | Implement `UpdateTenantAsync` service | 1 | `TenantAsStaffService.cs` |
| 7 | Create `UpdateTenantAsStaff` handler | 3, 4, 5, 6 | `UpdateTenantAsStaff.cs` |
| 8 | Map PATCH endpoint | 7 | `TenantEndpointsForStaff.cs` |
| 9 | Write update tests | 8 | `UpdateTenantAsStaff.Spec.cs` |
| 10 | Implement `DeleteTenantAsync` service | — | `TenantAsStaffService.cs` |
| 11 | Create `DeleteTenantAsStaff` handler | 3, 4, 5, 10 | `DeleteTenantAsStaff.cs` |
| 12 | Map DELETE endpoint | 11 | `TenantEndpointsForStaff.cs` |
| 13 | Write delete tests | 12 | `DeleteTenantAsStaff.Spec.cs` |
| 14 | `make build-api && make generate-client` | 2, 8, 12 | Generated client files |
| 15 | Add frontend hooks (`useUpdateTenant`, `useDeleteTenant`) | 14 | `staff-tenant.hooks.ts` |
| 16 | Wire General tab with update form + enriched data | 14, 15 | `tenant-details-general-page.tsx` |
| 17 | Wire Danger Zone (suspend + delete buttons) | 15, 16 | `tenant-details-general-page.tsx` |
| 18 | Add frontend i18n keys | — | `en.json`, `fr.json` |
| 19 | `make tsc-front && make check-write` | 16, 17, 18 | — |
| 20 | Run `make test-api` | 9, 13 | — |

---

## Files Changed Summary

### Backend (new files)
- `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.Spec.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/DeleteTenantAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/DeleteTenantAsStaff.Spec.cs`

### Backend (modified files)
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs` — new methods + result types
- `apps/api/Src/Modules/Tenants/Handlers/Staff/GetTenantAsStaff.cs` — enriched response
- `apps/api/Src/Modules/Tenants/Handlers/Staff/GetTenantAsStaff.Spec.cs` — updated tests
- `apps/api/Src/Modules/Tenants/Endpoints/TenantEndpointsForStaff.cs` — new mappings
- `apps/api/Src/Modules/Tenants/Routes.Tenants.cs` — new route constants
- `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs` — new audit actions

### Shared (modified files)
- `packages/shared/lib/i18n/json/response-message.en.json` — new response keys
- `packages/shared/lib/i18n/json/response-message.fr.json` — new response keys
- `packages/shared/lib/i18n/json/en.json` — new UI strings
- `packages/shared/lib/i18n/json/fr.json` — new UI strings

### Frontend (modified files)
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts` — new hooks
- `apps/front/src/routes/authed/staff/tenants/details/general/tenant-details-general-page.tsx` — update form + danger zone

### Auto-generated (do not edit manually)
- `apps/api/Generated/ResponseKeys.g.cs` — rebuilt by `make build-api`
- `packages/js-client/` — rebuilt by `make generate-client`
