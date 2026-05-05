# #177 Tenants Module - Implementation Plan (Phase 3-5 + Layout)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining work on the #177 Tenants Module: verify Phase 3 frontend integration, implement bulk actions/export, complete Phase 4 user management, Phase 5 tests, and Layout Alignment Phases 3-4.

**Architecture:** This plan covers multiple independent workstreams that can be executed in parallel where dependencies allow.

**Tech Stack:** .NET 10, React 19, Material React Table, TanStack Query, FluentValidation, PostgreSQL

---

## Gap Summary

| Phase | Status | Remaining |
|-------|--------|-----------|
| Phase 1 (Critical fixes) | ✅ DONE | - |
| Phase 2 (Missing CRUD) | ✅ DONE | - |
| Phase 3 (List improvements) | 🟡 PARTIAL | A1 verified, A2/A3 need bulk endpoints + export |
| Phase 4 (User management) | ❌ NOT STARTED | B1 done (backend exists), B3-B6 need backend + frontend |
| Phase 5 (Tests) | 🟡 PARTIAL | Create/Find tests |
| Layout Alignment | 🟡 PARTIAL | Phases 3-4 |

---

## WORKSTREAM A: Phase 3 - List Improvements

### Task A1: Verify Frontend Search/Filter Integration

**Goal:** Verify the Phase 3 Batch 1 backend changes are properly integrated in the frontend.

**Files to verify:**
- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

**Step 1: Check tenants-table.tsx**

Verify it has:
- nuqs `useQueryStates` for `q` and `status` filters
- Debounced search with cursor reset
- Status filter dropdown (MUI Select)
- `useTableState` with `paginationMode: 'cursor'`
- Column IDs in snake_case (`created_at`, `updated_at`)

**Step 2: Check staff-tenant.hooks.ts**

Verify `useFindTenants` accepts:
- `cursor?: string`
- `limit?: number`
- `sort?: { id: string; order: 'asc' | 'desc' }`
- `q?: string`
- `status?: string`

**Step 3: Manual test**

Run: `make dev-api && make dev-front`

Navigate to `/staff/tenants` and verify:
- Search box filters tenants by name
- Status dropdown filters by status (Active/Pending/Suspended/Archived)
- Cursor pagination works (load more)
- Sort by different columns works

---

### Task A2: Implement Bulk Actions

**Goal:** Add bulk suspend/reactivate/delete to tenant list via dedicated endpoints.

**Backend Required:**
> **CORRECTION (Round 2.5):** Create dedicated bulk endpoints instead of spamming the API with individual requests.
> **CORRECTION (Round 3):** Bulk endpoints need service methods on `ITenantAsStaffService` with transactional semantics and explicit per-item outcomes.

**Files to create:**
- `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkSuspendTenantsAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkReactivateTenantsAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/BulkDeleteTenantsAsStaff.cs`

**Prerequisites:**
- Add `BULK_SUSPEND`, `BULK_REACTIVATE`, `BULK_DELETE` permissions to seeder, OR reuse existing `SUSPEND`/`REACTIVATE`/`DELETE` permissions
- Add service methods: `BulkSuspendAsync`, `BulkReactivateAsync`, `BulkDeleteAsync` to `ITenantAsStaffService`
- **Audit Logging (Round 5):** Use `IAuditLogService.LogAsync()` with structured details payload (see existing bulk handlers)

**Step 1: Create bulk backend handlers**

Example for bulk suspend:

```csharp
// In TenantEndpointsForStaff.cs mapping:
group.MapPost("/bulk-suspend", HandleBulkSuspendTenantsAsStaff)
    .WithPermission([AppPermissions.Staff.Tenants.SUSPEND])  // Or BULK_SUSPEND if added
    .WithReqBodyValidation<BulkSuspendTenantsAsStaffBody>();

public static async Task<Results<Ok<BulkSuspendResult>, AppBadRequestHttpResult, AppProblemHttpResult>>
    HandleBulkSuspendTenantsAsStaff(
        [FromBody] BulkSuspendTenantsAsStaffBody body,
        [FromServices] ITenantAsStaffService tenantAsStaffService,
        [FromServices] ILogger<BulkSuspendTenantsAsStaff> logger,
        CancellationToken cancellationToken
    ) {
        // NOTE (Round 4): Validate tenant IDs first - don't parse directly
        // Use JsonElement validation pattern like existing bulk handlers
        var validIds = new List<Guid>();
        foreach (var id in body.TenantIds.EnumerateArray()) {
            if (id.TryGetGuid(out var guid)) {
                validIds.Add(guid);
            }
        }

        if (validIds.Count == 0) {
            return TypedProblems.BadRequest("No valid tenant IDs provided", ResponseKeys.BadRequest);
        }

        var result = await tenantAsStaffService.BulkSuspendAsync(
            validIds,
            body.Reason?.GetString(),
            cancellationToken);

        logger.LogInformation(
            "Bulk suspend completed: {Succeeded} succeeded, {Failed} failed",
            result.SucceededCount,
            result.FailedCount
        );

        return TypedResults.Ok(result);
    }
```

> **PREREQUISITE (Round 4):** Define `BulkSuspendResult` DTO with `SucceededCount`, `FailedCount`, and `FailedItems[]`.

**Step 2: Add frontend hooks**

```typescript
import { createStaffMutation } from '../../create-hooks';

export const useBulkSuspendTenants = createStaffMutation({
    mutationKeyFn: (client) => client.staff.tenants.bulkSuspend.post,
    mutationFn: async (
        client,
        variables: { tenantIds: string[]; reason?: string }
    ) => {
        const body: BulkSuspendTenantsAsStaffBody = {
            tenantIds: variables.tenantIds.map(id => createUntypedString(id)),
            reason: variables.reason ? createUntypedString(variables.reason) : undefined,
        };
        return client.staff.tenants.bulkSuspend.post(body);
    },
});
```

**Step 3: Add bulk action buttons to table**

In `tenants-table.tsx`, add toolbar buttons that call the bulk endpoints.

**Step 3: Add translations**

Modify: `packages/shared-ts/lib/i18n/json/common.en.json`

```json
{
    "bulk-actions": "Bulk actions",
    "bulk-suspend": "Suspend selected",
    "bulk-reactivate": "Reactivate selected",
    "selected-count": "{{count}} selected",
    "bulk-suspend-result": "{{succeeded}} suspended"
}
```

---

### Task A3: Implement Export

**Goal:** Add CSV/JSON export for tenant list.

**Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx`

**Step 1: Add export button**

```typescript
const handleExport = (format: 'csv' | 'json') => {
    const dataToExport = data?.data ?? [];

    if (format === 'csv') {
        const headers = ['Name', 'Code', 'Status', 'Users', 'Created'];
        const rows = dataToExport.map(t => [
            t.name, t.code, t.status, t.usersCount, t.createdAt
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        downloadFile(csv, 'tenants.csv', 'text/csv');
    } else {
        downloadFile(JSON.stringify(dataToExport, null, 2), 'tenants.json', 'application/json');
    }
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};
```

**Step 2: Add export button to toolbar**

```typescript
<Button onClick={() => handleExport('csv')} startIcon={<DownloadIcon />}>
    {t('export-csv')}
</Button>
```

**Step 3: Add translations**

```json
{
    "export": "Export",
    "export-csv": "Export CSV",
    "export-json": "Export JSON"
}
```

---

## WORKSTREAM B: Phase 4 - User Management

> **CORRECTION (Round 2):** Invitation "account level" semantics are underspecified - the plan must specify where this logic lives and how profiles/default profile are assigned for non-admin invites.
>
> **Key design decision needed (Round 2.5):**
> 1. If AccountLevel=Admin: Admin has ALL permissions over their scope - **no profile assignment needed**
> 2. If AccountLevel=User: assign default user profile (use existing profile lookup pattern)
> 3. Check email not already in use (mutual exclusivity: User cannot be both Staff and Tenant) - use `IInvitationService.UserExistsAsync()` and `PendingInvitationExistsAsync()`
> 4. Email sending/retry: Follow existing patterns in codebase (see `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs` and `InvitationService.cs`)

---

### Task B1: Show Account Level Column

**Goal:** Display user account level (Admin/User) in tenant-users-table.

**Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`

**Step 1: Check backend response**

> **CORRECTION (Round 2):** Account level already exists in backend response as `Level` field (not `AccountLevel`). Values are `Admin`/`User` (not `Admin`/`Member`).

The handler `FindTenantUsersAsStaff` already returns `Level` property (line 20, 138-141 in `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`).

**Step 2: Add column to table**

> **CORRECTION (Round 2):** Use `level` (not `accountLevel`) - matches backend response.

```typescript
columnHelper.accessor('level', {
    header: t('account-level'),
    Cell: ({ row }) => (
        <Chip
            label={row.original.level}
            color={row.original.level === 'Admin' ? 'primary' : 'default'}
        />
    ),
}),
```

---

### Task B2: Show Invitation Status

**Goal:** Display invitation status (Invited/Active/Suspended).

**Step 1: Check backend**

> **CORRECTION (Round 2):** Verify `FindTenantUsersAsStaff` returns invitation status. If the current implementation doesn't include it, determine if invitation status belongs in the tenant-user response or if there's a separate invitations endpoint to query.

**Step 2: Add column**

```typescript
columnHelper.accessor('invitationStatus', {
    header: t('invitation-status'),
    Cell: ({ row }) => {
        const status = row.original.invitationStatus;
        const color = status === 'Active' ? 'success'
            : status === 'Invited' ? 'warning'
            : 'error';
        return <Chip label={status} color={color} size="small" />;
    },
}),
```

---

### Task B3: Invite New User (Staff Side)

**Goal:** Add "Invite User" functionality from staff tenant detail.

**Backend Required:**
> **CORRECTION (Round 2):** Tenant invitations should NOT be added to `InvitationEndpointsForStaff.cs` - they belong in `UserEndpointsForTenantAsStaff.cs`.
- New endpoint: `POST /staff/tenants/{tenantId}/users/invitations`

**Files to create:**
- `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs`
- Map in: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`

**Frontend Files:**
- Modify: `apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx`
- Add hook: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

**Step 1: Create backend handler**

> **CORRECTION (Review Round 3):** Use correct `.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_TENANT])` - NOT `Permission.*`. NO route constraints.
> **CORRECTION (Round 5):** Follow existing `CreateStaffInvitation` pattern exactly - do not write new handler code.

Reference existing handler for complete implementation pattern:
- `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs`

**Prerequisites (Round 4/5):**
1. Define service method that maps account level to profile IDs (Admin → empty list, User → default profile)
2. Define response DTO (`InvitationCreated`) matching existing pattern
3. **Audit Logging (Round 5):** Use `IAuditLogService.LogAsync()` with structured details - follow existing pattern from `CreateStaffInvitation.cs`

**Validator requirement:** The request body does **not** contain `TenantId`; it comes from the route. Follow the existing `JsonElementRules.*` pattern used by `CreateStaffInvitationBodyValidator`.

**Step 1b: Create validator**

Create `CreateInvitationForTenantAsStaffValidator.cs`:

```csharp
public class CreateInvitationForTenantAsStaffValidator
    : AbstractValidator<CreateInvitationForTenantAsStaffBody> {
    public CreateInvitationForTenantAsStaffValidator() {
        RuleFor(x => x.Email)
            .MustBeRequiredEmail();

        RuleFor(x => x.AccountLevel)
            .MustBeRequiredString("AccountLevel")
            .Must(x => x?.GetString() == "Admin" || x?.GetString() == "User");
    }
}
```

Validation notes:
- Do **not** validate `tenantId` in the body validator. Parse and validate the route value inside the handler with `Guid.TryParse`.
- Keep `AccountLevel` values limited to `Admin` and `User`.
- Prefer shared `JsonElementRules.*` helpers over inline validation chains for `JsonElement` fields.

**Step 2: Add frontend hook**

> **CORRECTION (Review #1):** Use correct `mutationKeyFn` + `mutationFn` pattern. Account level is `Admin`/`User`.

```typescript
import { createStaffMutation } from '../../create-hooks';
import { createUntypedString } from '@microsoft/kiota-abstractions';

export const useInviteTenantUser = createStaffMutation({
    mutationKeyFn: (client) =>
        client.staff.tenants.byTenantId('').users.invitations.post,
    mutationFn: async (
        client,
        variables: { tenantId: string; email: string; accountLevel: 'Admin' | 'User' }
    ) => {
        const body = {
            email: createUntypedString(variables.email),
            accountLevel: createUntypedString(variables.accountLevel),
        };

        return client.staff.tenants
            .byTenantId(variables.tenantId)
            .users
            .invitations
            .post(body);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: useFindTenantUsers.getKey() });
    },
});
```

**Step 3: Add invite button + dialog**

In `tenant-details-users-page.tsx`, add an "Invite User" button that opens a dialog with:
- Email input
- Account level dropdown (Admin/User - not Admin/Member)
- Submit button

---

### Task B4: Remove User from Tenant

**Goal:** Implement delete user from tenant functionality.

**Backend Required:**
> **NOTE (Review Round 2):** Use `IUserService` (not `IUserAsStaffService`). Service method should be added to `UserService`.
> **CORRECTION (Round 5):** Add `IAuditLogService.LogAsync()` for audit trail.
- New endpoint: `DELETE /staff/tenants/{tenantId}/users/{userId}`

**Files:**
- Backend: `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`
- Backend service: Modify `apps/api/Src/Modules/Users/Services/UserService.cs`
- Frontend: Modify `tenant-users-table.tsx`

**Prerequisites:**
- Define `RemoveUserFromTenantResult` discriminated union
- Define audit action name + details shape for removals, for example:
  - `AuditActions.TenantUserRemoved`
  - `{ TenantId, TenantUserId, RemovedByUserId, PreviousLevel }`

**Step 1: Create backend handler**

> **CORRECTION (Review #3):** Handler must include permission filter and logging. NO route constraints - validate ID via `Guid.TryParse`.

```csharp
// In UserEndpointsForTenantAsStaff.cs mapping:
endpoint
    .MapDelete("/{userId}", HandleRemoveUserFromTenantAsStaff)
    .WithPermission([AppPermissions.Staff.Users.DELETE_FOR_TENANT]);

public static async Task<Results<Ok, AppBadRequestHttpResult, AppProblemHttpResult>>
    HandleRemoveUserFromTenantAsStaff(
        [FromServices] IRequestAuthContext authContext,
        [FromRoute] string tenantId,
        [FromRoute] string userId,
        [FromServices] IUserService userService,
        [FromServices] IAuditLogService auditLogService,
        [FromServices] ILogger<RemoveUserFromTenantAsStaff> logger,
        CancellationToken cancellationToken
    ) {
        // Validate IDs via Guid.TryParse (no route constraints)
        if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
            return TypedProblems.BadRequest("Invalid tenantId", ResponseKeys.BadRequest);
        }
        if (!Guid.TryParse(userId, out var userIdGuid)) {
            return TypedProblems.BadRequest("Invalid userId", ResponseKeys.BadRequest);
        }

        var result = await userService.RemoveUserFromTenantAsync(
            tenantIdGuid, userIdGuid, cancellationToken);

        // NOTE (Round 4): Define RemoveUserFromTenantResult discriminated union
        // e.g., record Success; record NotFound;
        if (result is RemoveUserFromTenantResult.Success) {
            logger.LogInformation(
                "User {UserId} removed from tenant {TenantId}",
                userIdGuid, tenantIdGuid
            );

            var actorUserId = authContext.Account?.UserId;
            if (actorUserId is not null) {
                await auditLogService.LogAsync(
                    actorUserId.Value,
                    AuditActions.TenantUserRemoved,
                    userIdGuid,
                    new {
                        TenantId = tenantIdGuid,
                        TenantUserId = userIdGuid,
                        RemovedByUserId = actorUserId.Value
                    },
                    cancellationToken
                );
            }

            return TypedResults.Ok();
        }

        if (result is RemoveUserFromTenantResult.NotFound) {
            return TypedProblems.NotFound("User not found in tenant");
        }

        return TypedProblems.BadRequest("Failed to remove user", ResponseKeys.BadRequest);
    }
```

> **PREREQUISITE (Round 4):** Define `RemoveUserFromTenantResult` discriminated union in the service before implementing this handler.

**Step 2: Add frontend hook + wire to table**

> **CORRECTION (Review #1):** Use correct `mutationKeyFn` + `mutationFn` pattern.

```typescript
import { createStaffMutation } from '../../create-hooks';

export const useRemoveTenantUser = createStaffMutation({
    mutationKeyFn: (client) =>
        client.staff.tenants.byTenantId('').users.byUserId('').delete,
    mutationFn: async (
        client,
        variables: { tenantId: string; userId: string }
    ) => {
        return client.staff.tenants
            .byTenantId(variables.tenantId)
            .users
            .byUserId(variables.userId)
            .delete();
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: useFindTenantUsers.getKey() });
    },
});
```

**Step 3: Wire to delete button in table**

Replace toast stub with actual mutation call.

---

### Task B5: Change User Account Level

**Goal:** Allow staff to change user role (Admin/User).

> **CORRECTION (Round 2):** Uses `IUserService` (not `IUserAsStaffService`). Uses `.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])`.
> **CORRECTION (Round 5):** Add `IAuditLogService.LogAsync()` for audit trail.

**Backend Required:**
- New endpoint: `PATCH /staff/tenants/{tenantId}/users/{userId}`

**Files:**
- Handler: `apps/api/Src/Modules/Users/Handlers/Staff/UpdateUserLevelAsStaff.cs`
- Map in: `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs`

**Prerequisites:**
- Define `UpdateUserLevelResult` discriminated union
- Define audit action name + details shape for level changes, for example:
  - `AuditActions.TenantUserLevelUpdated`
  - `{ TenantId, TenantUserId, PreviousLevel, NewLevel, UpdatedByUserId }`

**Step 1: Create backend handler**

```csharp
// In UserEndpointsForTenantAsStaff.cs mapping:
endpoint
    .MapPatch("/{userId}", HandleUpdateUserLevelAsStaff)
    .WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
    .WithReqBodyValidation<UpdateUserLevelAsStaffBody>();

public static async Task<Results<Ok, AppBadRequestHttpResult, AppProblemHttpResult>>
    HandleUpdateUserLevelAsStaff(
        [FromServices] IRequestAuthContext authContext,
        [FromRoute] string tenantId,
        [FromRoute] string userId,
        [FromBody] UpdateUserLevelAsStaffBody body,
        [FromServices] IUserService userService,
        [FromServices] IAuditLogService auditLogService,
        [FromServices] ILogger<UpdateUserLevelAsStaff> logger,
        CancellationToken cancellationToken
    ) {
        // Validate IDs via Guid.TryParse
        if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
            return TypedProblems.BadRequest("Invalid tenantId", ResponseKeys.BadRequest);
        }
        if (!Guid.TryParse(userId, out var userIdGuid)) {
            return TypedProblems.BadRequest("Invalid userId", ResponseKeys.BadRequest);
        }

        var result = await userService.UpdateUserLevelAsync(
            tenantIdGuid,
            userIdGuid,
            body.AccountLevel?.GetString() ?? "User",
            cancellationToken);

        // NOTE (Round 4): Define UpdateUserLevelResult discriminated union
        if (result is UpdateUserLevelResult.Success) {
            var newLevel = body.AccountLevel?.GetString() ?? "User";

            logger.LogInformation(
                "User {UserId} level updated to {Level} in tenant {TenantId}",
                userIdGuid, newLevel, tenantIdGuid
            );

            var actorUserId = authContext.Account?.UserId;
            if (actorUserId is not null) {
                await auditLogService.LogAsync(
                    actorUserId.Value,
                    AuditActions.TenantUserLevelUpdated,
                    userIdGuid,
                    new {
                        TenantId = tenantIdGuid,
                        TenantUserId = userIdGuid,
                        NewLevel = newLevel,
                        UpdatedByUserId = actorUserId.Value
                    },
                    cancellationToken
                );
            }

            return TypedResults.Ok();
        }

        if (result is UpdateUserLevelResult.NotFound) {
            return TypedProblems.NotFound("User not found in tenant");
        }

        return TypedProblems.BadRequest("Failed to update user level", ResponseKeys.BadRequest);
    }
```

> **PREREQUISITE (Round 4):** Define `UpdateUserLevelResult` discriminated union in the service before implementing this handler.

**Frontend:**
- Add "Change Role" action in table row menu (values: Admin/User)

---

### Task B6: Search/Filter Tenant Users

**Goal:** Add search bar and filters to tenant users table.

> **CORRECTION (Round 2):** Cannot be "frontend-only" - `FindTenantUsersAsStaffQuery` currently supports cursor/sort/limit only (no `q`, no status filters). Requires backend query + service support.

**Backend Required:**
- Modify: `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs` - add `q` and `status` query params
- Modify: `apps/api/Src/Modules/Users/Services/UserService.cs` - add search/filter to `FindTenantUsersAsync`

**Frontend:**
- Modify: `tenant-users-table.tsx`

**Step 1: Add backend query support**

Modify `FindTenantUsersAsStaffQuery` to add:
```csharp
public class FindTenantUsersAsStaffQuery : CursorPaginatedQuery {
    public string? Q { get; set; }  // Search by name/email
    public string? Status { get; set; }  // Filter by status
}
```

**Step 2: Update service method**

Add search/filter logic to `UserService.FindTenantUsersAsync`.

**Step 3: Add frontend UI**

Follow the same pattern as tenants-table:
- Add nuqs state for search
- Add column with search input
- Wire to hook params

---

## WORKSTREAM C: Phase 5 - Integration Tests

### Task C1: Create Tenant Tests

> **CORRECTION (Review #2):** Tests use `TestAuthClient` with manual request construction, not `Client.PostAsStaffAsync()`.
> **CORRECTION (Round 2):** `CreateTenantAsStaffBody` requires `initialUsers` - the plan's test body omits it and includes `Code` which isn't part of the request.

**Files:**
- Create: `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs`

**Step 1: Write test**

```csharp
namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Xunit;

public sealed class CreateTenantAsStaffSpec
    : IClassFixture<ApiFixture> {
    private readonly HttpClient _http;
    private readonly TestAuthClient _authClient;

    public CreateTenantAsStaffSpec(ApiFixture fixture) {
        _http = fixture.HttpClient;
        _authClient = new TestAuthClient(_http);
    }

    [Fact]
    public async Task ItShouldCreateTenantWithValidData() {
        // Arrange
        var token = await _authClient.LoginAsStaffAdminAsync();

        // CORRECTION (Round 2): CreateTenantAsStaffBody requires initialUsers
        // Code is auto-generated, not part of request
        var request = new {
            Name = "New Tenant " + Guid.NewGuid().ToString("N")[..8],
            MaxUsers = 10,
            InitialUsers = new[] {
                new {
                    Email = "admin@" + Guid.NewGuid().ToString("N")[..8] + ".test",
                    FirstName = "Admin",
                    LastName = "User",
                    AccountLevel = "Admin"
                }
            }
        };

        var url = "/staff/tenants";
        var httpRequest = new HttpRequestMessage(HttpMethod.Post, url)
            .WithSessionToken(token);
        httpRequest.Content = JsonContent.Create(request);

        // Act
        using var response = await _http.SendAsync(httpRequest);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var result = await response.Content.ReadFromJsonAsync<CreateTenantAsStaffResponse>();
        result.Should().NotBeNull();
        result!.Name.Should().Be(request.Name);
    }
}
```

---

### Task C2: Find Tenants Tests

> **CORRECTION (Review #2):** Tests use `TestAuthClient` with manual request construction, not `Client.GetAsStaffAsync()`.

**Files:**
- Modify: `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs`

**Step 1: Add tests**

```csharp
[Fact]
public async Task ItShouldReturnTenantsWithPagination() {
    // Arrange - seed 3 tenants
    var token = await _authClient.LoginAsStaffAdminAsync();

    // Act
    var url = TenantTestHelper.GetFindUrl(limit: 2);
    var request = new HttpRequestMessage(HttpMethod.Get, url)
        .WithSessionToken(token);

    using var response = await _http.SendAsync(request);

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);
    var result = await response.Content.ReadFromJsonAsync<FindTenantsAsStaffResponse>();
    result.Should().NotBeNull();
    result!.Data.Should().HaveCount(2);
    result.NextCursor.Should().NotBeNullOrEmpty();
}

[Fact]
public async Task ItShouldFilterBySearch() {
    // Arrange - tenants: "Alpha Corp", "Beta Inc", "Gamma LLC"
    var token = await _authClient.LoginAsStaffAdminAsync();

    // Act
    var url = TenantTestHelper.GetFindUrl(q: "alpha");
    var request = new HttpRequestMessage(HttpMethod.Get, url)
        .WithSessionToken(token);

    using var response = await _http.SendAsync(request);

    // Assert
    var result = await response.Content.ReadFromJsonAsync<FindTenantsAsStaffResponse>();
    result.Should().NotBeNull();
    result!.Data.Should().OnlyContain(t =>
        t.Name.Contains("Alpha", StringComparison.OrdinalIgnoreCase));
}

[Fact]
public async Task ItShouldFilterByStatus() {
    // Arrange - active and suspended tenants
    var token = await _authClient.LoginAsStaffAdminAsync();

    // Act
    var url = TenantTestHelper.GetFindUrl(status: "suspended");
    var request = new HttpRequestMessage(HttpMethod.Get, url)
        .WithSessionToken(token);

    using var response = await _http.SendAsync(request);

    // Assert
    var result = await response.Content.ReadFromJsonAsync<FindTenantsAsStaffResponse>();
    result.Should().NotBeNull();
    result!.Data.Should().OnlyContain(t => t.Status == "Suspended");
}
```

---

## WORKSTREAM D: Layout Alignment - Phases 3-4

> **CORRECTION (Round 5):** This workstream is mostly ALREADY DONE. Current code uses react-hook-form, Field.*, SettingsPageHeader, and SidebarSettingsLayout. Skip or verify only.

### Task D1: Phase 3 - Staff General Tab Redesign

**Status:** Already implemented. Current page uses react-hook-form + Field.* + SettingsPageHeader.

**Verification step only:** Verify current implementation is working correctly. No redesign work should be scheduled from this plan unless verification finds a concrete regression.

Verification checklist:
- Confirm the page still uses `react-hook-form` with the project `Form` / `Field.*` wrappers.
- Confirm the page header uses `SettingsPageHeader`.
- Confirm danger-zone actions still match current backend capabilities.
- Confirm date/time formatting still uses the shared formatting utilities.
- If a real UX gap is found, create a **new** follow-up task with before/after screenshots and keep it separate from this completion plan.

---

### Task D2: Phase 4 - Consolidate Tenant Layouts

**Status:** Already done. Both tenant settings and account layouts already use `SidebarSettingsLayout`.

**Verification step only:** Spot-check both layouts and confirm they still share `SidebarSettingsLayout` and render the expected navigation items.

---

## EXECUTION ORDER

### Recommended Order

1. **Week 1: Phase 3 Completion**
   - A1: Verify frontend search/filter (1h)
   - A2: Bulk actions (2h)
   - A3: Export (1h)

2. **Week 2: Phase 4 User Management**
   - B1: Account level column (0.5h) - backend already returns `Level` field
   - B2: Invitation status (1h)
   - B3: Invite user (4h) - requires new endpoint + validator + service logic
   - B4: Remove user (2h)
   - B5: Change level (2h)
   - B6: Search/filter (4h) - requires backend query params + service support

3. **Week 3: Phase 5 Tests**
   - C1: Create tests (2h)
   - C2: Find tests (2h)

4. **Week 4: Verification-only checks**
   - D1: Verify current staff general tab implementation still matches standards (0.5h)
   - D2: Verify shared layout usage is still intact (0.25h)

### Parallel Opportunities

- A2, A3 can run in parallel (both modify tenants-table.tsx)
- B1, B2 can run in parallel (both add columns - B1 already done)
- B3, B4, B5 require backend first, then frontend (backend can be parallel)
- C1, C2 are independent test files

---

## FILES SUMMARY

> **IMPORTANT (Round 3):** After ANY backend route changes, run:
> ```bash
> make build-api && make generate-client && make tsc-front
> ```
> Then update frontend hooks to match the generated client paths.

### Backend (New)
- `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/RemoveUserFromTenantAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateUserLevelAsStaff.cs`

### Backend (Modify)
- `apps/api/Src/Modules/Users/Services/UserService.cs` - add methods (NOT UserAsStaffService)
- `apps/api/Src/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs` - map endpoints (NOT InvitationEndpointsForStaff)

### Frontend (New)
- None

### Frontend (Modify)
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts` - bulk hooks
- `apps/front/src/routes/authed/staff/tenants/list/parts/tenants-table.tsx` - bulk + export
- `apps/front/src/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx` - columns + actions
- `apps/front/src/routes/authed/staff/tenants/details/users/tenant-details-users-page.tsx` - invite dialog
- `packages/shared-ts/lib/i18n/json/common.en.json` - translations

### Tests (New)
- `apps/api/Src/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs`

### Tests (Modify)
- `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs`

---

## NOTES

- **Backend endpoints already exist:** Suspend, Reactivate, Delete
- **Frontend hooks already exist:** useSuspendTenant, useReactivateTenant, useDeleteTenant
- **Shared components already extracted (Phase 1-2):** SettingsNav, SidebarSettingsLayout, FormRow
- **Phase 3 Batch 1 already done:** Backend cursor pagination + search/filter

---

## CURRENT IMPLEMENTATION DECISIONS

This section replaces the old cumulative review appendix. Everything below is authoritative for implementation.

### Backend/API rules
- Use route-level permissions with `AppPermissions.Staff.Users.CREATE_FOR_TENANT`, `UPDATE_FOR_TENANT`, and `DELETE_FOR_TENANT`.
- Do not use route constraints for IDs. Parse `tenantId`, `userId`, and cursor values with `Guid.TryParse` inside handlers.
- Keep request-body validation on `JsonElementRules.*` helpers. Do not write inline FluentValidation chains for `JsonElement` fields unless there is no shared rule available.
- B3 should mirror the structure of `CreateStaffInvitation.cs`: route validation, auth/context usage, service orchestration, `IAuditLogService.LogAsync(...)`, and `Created<InvitationCreated>` response shape.
- B4/B5 must record audit-log entries, not just operational `ILogger` messages.

### Frontend rules
- Use generated client paths only; after backend route changes run `make build-api && make generate-client && make tsc-front`.
- Hook examples should follow `createStaffMutation` conventions and keep cache invalidation at the component level if that is the established pattern in the target file.
- D1 and D2 are verification-only tasks. Do not re-implement those layouts from this plan.

### Testing rules
- Use `TestAuthClient`, `WithSessionToken()`, and `JsonContent.Create(...)`.
- For new backend routes, add coverage for success, invalid ID, authorization failure, and audit-sensitive edge cases such as partial-failure bulk operations.

### Execution note
- Do not commit as part of this plan execution unless explicitly requested.
