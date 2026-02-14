# Audit Logs MVP Implementation Plan

**Issue:** #171 — feat(staff): Audit logs MVP (query endpoints + staff dashboard page)

---

## Section A: Assumptions

1. **Read-only domain.** The audit log write model (`AuditLogService.LogAsync`) already exists and works. This plan covers **query endpoints + frontend** only — no new write paths.
2. **Platform-scoped.** `AuditLog` implements `INoTenantEntity`; all logs are visible to staff with the correct permission. No tenant-scoped filtering is needed (staff sees everything).
3. **User resolution.** The `AuditLog.User` navigation property exists. All query methods use a projected select with left join + `IgnoreQueryFilters()` to resolve the user's display name + email into the response DTO, so the frontend doesn't need a second call.
4. **Details field is opaque JSON.** The `Details` column stores serialized JSON. The detail view renders it as formatted JSON — no schema-specific rendering per action type for MVP.
5. **Export uses streaming.** The export endpoint streams CSV/JSON via `IAsyncEnumerable` to avoid loading the full result set into memory. The row limit is configurable via `AppEnvironment`.
6. **No new DB migration.** The `audit_logs` table and its indexes already exist. No schema changes required.
7. **Cursor pagination** follows the existing `CursorPaginatedQuery` pattern (cursor = entity ID, keyset pagination with tie-breaker on `Id`).
8. **Existing `ResponseKeys`** (`BadRequest`, `NotFound`, `Forbidden`) are sufficient — no new response-message i18n keys are required for API errors.
9. **Permission co-requisite.** The user filter autocomplete on the frontend calls the existing `FindStaffUsers` endpoint, which requires `staff.users.list` permission. Staff who have `audit_logs.list` should also be granted `staff.users.list` — this is a documented administrative dependency, not enforced in code.

---

## Section B: API Contract Proposal

### B1. `GET /staff/audit-logs` — Find Audit Logs

**Query parameters** (extends `CursorPaginatedQuery`):

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `cursor` | string (Guid) | No | — | Cursor for keyset pagination |
| `limit` | int | No | env default | Page size |
| `sortId` | string | No | `created_at` | Sort field: `created_at` |
| `sortOrder` | string | No | `desc` | `asc` or `desc` |
| `userId` | string (Guid) | No | — | Filter by acting user |
| `action` | string | No | — | Filter by action key (exact match) |
| `targetId` | string (Guid) | No | — | Filter by target resource ID |
| `startDate` | string (ISO 8601) | No | — | Filter: `CreatedAt >= startDate` |
| `endDate` | string (ISO 8601) | No | — | Filter: `CreatedAt <= endDate` |

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userName": "John Doe",
      "userEmail": "john@example.com",
      "action": "invitation.created",
      "targetId": "uuid|null",
      "ipAddress": "192.168.1.1|null",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ],
  "nextCursor": "uuid|null"
}
```

### B2. `GET /staff/audit-logs/{logId}` — Get Audit Log by ID

**Path parameter:** `logId` (Guid)

**Response** `200 OK`:
```json
{
  "id": "uuid",
  "userId": "uuid",
  "userName": "John Doe",
  "userEmail": "john@example.com",
  "action": "invitation.created",
  "targetId": "uuid|null",
  "details": "{\"email\":\"invited@example.com\"}|null",
  "ipAddress": "192.168.1.1|null",
  "userAgent": "Mozilla/5.0...|null",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

**Error responses:**
- `404` — Audit log not found

### B3. `GET /staff/audit-logs/actions` — Get Distinct Action Keys

No parameters.

**Response** `200 OK`:
```json
{
  "actions": [
    "invitation.created",
    "invitation.accepted",
    "tenant.suspended",
    "auth.login.succeeded"
  ]
}
```

> Implementation: Returns hardcoded values from `AuditActions` static constants (reflection over `const string` fields). No DB query — avoids a full-table `DISTINCT` scan. The list includes all defined action keys regardless of whether logs with that action exist in the database.

### B4. `GET /staff/audit-logs/export` — Export Audit Logs

**Query parameters** (same filters as B1, minus cursor/limit/sort):

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | `csv` or `json` |
| `userId` | string (Guid) | No | Filter by acting user |
| `action` | string | No | Filter by action key |
| `targetId` | string (Guid) | No | Filter by target resource ID |
| `startDate` | string (ISO 8601) | No | Filter: `CreatedAt >= startDate` |
| `endDate` | string (ISO 8601) | No | Filter: `CreatedAt <= endDate` |

**Response:**
- `200 OK` with `Content-Type: text/csv` or `application/json`
- `Content-Disposition: attachment; filename="audit-logs-{timestamp}.{ext}"`
- Body: streamed file content

**Safety:** Configurable row limit via `AppEnvironment.AUDIT_LOG_EXPORT_MAX_ROWS` (optional env var, default: 10,000; startup does not fail if unset). The export query fetches `limit + 1` rows — if more than `limit` rows are returned, reject with `400 BadRequest` before streaming (no `COUNT(*)` scan). The response body is streamed via `IAsyncEnumerable` — rows are never fully materialized in memory.

### B5. Permission Keys

| Permission Key | Constant | Description |
|----------------|----------|-------------|
| `staff.audit_logs.list` | `AppPermissions.Staff.AuditLogs.LIST` | List/find audit logs |
| `staff.audit_logs.get` | `AppPermissions.Staff.AuditLogs.GET` | View audit log detail |
| `staff.audit_logs.export` | `AppPermissions.Staff.AuditLogs.EXPORT` | Export audit logs |

---

## Section C: Backend Plan

### Phase 1 — Permissions + Routes + Service Interface

**Step 1: Create audit log permissions**
- **Create** `apps/api/Src/Modules/AuditLogs/Permissions/AuditLogPermissionsForStaff.cs`
  - Implement `ISlicePermissions`
  - `KeyPrefix = "audit_logs"`
  - Define `LIST`, `GET`, `EXPORT` permissions
  - English + French translations

**Step 2: Register permissions in AppPermissions**
- **Modify** `apps/api/Src/Lib/AppPermissions.cs`
  - Add `using MainApi.Src.Modules.AuditLogs.Permissions;`
  - Add `AuditLogPermissionsForStaff AuditLogs` property to `StaffScopePermissions`

**Step 3: Create route constants**
- **Create** `apps/api/Src/Modules/AuditLogs/Routes.AuditLogs.cs`
  - Namespace: `MainApi.Src.Lib.Routes` (with IDE0130 pragma)
  - `partial class Routes` → `static class AuditLogs` → `static class ForStaff`
  - Constants: `Root = "/audit-logs"`, `Find = "/"`, `GetById = "/{logId}"`, `Actions = "/actions"`, `Export = "/export"`

### Phase 2 — Service Layer (Query Methods)

**Step 4: Create query service interface and implementation**
- **Create** `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
  - Separate from the existing write-side `AuditLogService` to maintain single responsibility
  - Interface `IAuditLogQueryService` with methods:
    - `FindAsync(FindAuditLogsArgs)` → `FindAuditLogsResult`
    - `GetByIdAsync(Guid id)` → `AuditLogDetail?` (projected select with left-join user resolution)
    - `GetDistinctActionsAsync()` → `List<string>`
    - `ExportExceedsLimitAsync(ExportAuditLogsArgs)` → `bool` (lightweight `SELECT COUNT(1) ... LIMIT N+1` check)
    - `ExportAsync(ExportAuditLogsArgs)` → `IAsyncEnumerable<AuditLogExportItem>`

**DTOs defined in service file:**

```
FindAuditLogsArgs: cursor, limit, sortId, sortOrder, userId?, action?, targetId?, startDate?, endDate?

FindAuditLogsResult (discriminated union):
  - Success(CursorPaginatedResult<AuditLogListItem>)
  - CursorNotFound(string)
  - InvalidSortId(string)

AuditLogListItem: Id, UserId, UserName, UserEmail, Action, TargetId, IpAddress, CreatedAt

AuditLogDetail: Id, UserId, UserName, UserEmail, Action, TargetId, Details, IpAddress, UserAgent, CreatedAt

AuditLogExportItem: Id, UserName, UserEmail, Action, TargetId, Details, IpAddress, UserAgent, CreatedAt
```

**Implementation details:**
- `FindAsync`: Follow `SystemNoticeService.FindAsync` pattern with `SortFieldHandler`
  - Only `created_at` as sortable field for MVP (simplicity)
  - Apply filters via LINQ `.Where()` clauses before cursor logic
  - Join with `User` entity to project `UserName` and `UserEmail`. Use a **left join** (LINQ `join ... into ... from ... in ... .DefaultIfEmpty()` or `GroupJoin`) with `.IgnoreQueryFilters()` on the `User` DbSet so that soft-deleted users still resolve with their real name/email (the `IsDeleted` global filter is bypassed). The `"(deleted user)"` / `"(unknown)"` fallback only applies when the join yields no match at all (hard-deleted row or orphaned FK). Both DTO fields stay non-nullable — no contract change needed.
- `GetByIdAsync`: Projected select with the same left-join + `IgnoreQueryFilters()` approach as `FindAsync`. No `.Include()` — keep a single consistent query strategy across all methods.
- `GetDistinctActionsAsync`: Reflect over `AuditActions` static `const string` fields, deduplicate and sort alphabetically, return as `List<string>` (no DB query — avoids full table DISTINCT scan; returns all possible actions regardless of whether they have occurred; stable sort prevents flaky tests/UI)
- `ExportExceedsLimitAsync`: Runs `query.Take(limit + 1).CountAsync()` — if count > limit, return true. This is a lightweight indexed count that stops as soon as it exceeds the cap (not a full `COUNT(*)` scan).
- `ExportAsync`: Returns `IAsyncEnumerable<AuditLogExportItem>`. Reuse filter logic from `FindAsync`, no cursor, order by `CreatedAt desc`, `.Take(limit)`. Stream rows via EF Core's `AsAsyncEnumerable()` so nothing is buffered in memory.

### Phase 3 — Handlers + Endpoints

**Step 5: Create Find handler**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`
  - `FindAuditLogsQuery` extends `CursorPaginatedQuery` with additional filter properties:
    - `[FromQuery] string? UserId`, `[FromQuery] string? Action`, `[FromQuery] string? TargetId`
    - `[FromQuery] string? StartDate`, `[FromQuery] string? EndDate`
  - `FindAuditLogsQueryValidator` extends `CursorPaginatedQueryValidator<FindAuditLogsQuery>`
    - Add rules: `UserId` must be valid Guid if provided, dates must be valid ISO 8601, `startDate <= endDate` when both provided
  - `FindAuditLogsResponse` extends `CursorPaginatedResult<AuditLogListItem>`
  - Handler: parse query, call service, map result

**Step 6: Create GetById handler**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.cs`
  - `AuditLogDetail` response record
  - `[FromRoute] Guid logId`
  - Return `Ok<AuditLogDetail>` or `NotFound`

**Step 7: Create GetActions handler**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.cs`
  - Simple response: `GetAuditLogActionsResponse { List<string> Actions }`
  - Call service, return list

**Step 8: Create Export handler**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
  - `ExportAuditLogsQuery` with filter params + `[FromQuery] string Format` (csv/json)
  - `ExportAuditLogsQueryValidator` validates format is `csv` or `json` (→ `422` on invalid), dates are valid ISO 8601, `startDate <= endDate` when both provided
  - Handler flow:
    1. Run a lightweight pre-check: `SELECT COUNT(1) FROM audit_logs WHERE <filters> LIMIT N+1` (uses indexed `COUNT` capped at `limit + 1` — not a full table scan, stops counting as soon as it exceeds the limit). If over limit, return `400` before streaming.
    2. Set `Content-Type` and `Content-Disposition` headers
    3. Stream results via `IAsyncEnumerable` to `HttpResponse.Body` using `StreamWriter` (CSV) or `Utf8JsonWriter` (JSON)
  - Uses `IResult` pattern — write directly to `HttpContext.Response` to enable true streaming

**Step 9: Create endpoints file**
- **Create** `apps/api/Src/Modules/AuditLogs/Endpoints/AuditLogEndpointsForStaff.cs`
  - `MapAuditLogEndpointsForStaff(this IEndpointRouteBuilder routes)`
  - Group: `routes.MapGroup(Routes.AuditLogs.ForStaff.Root).WithTags("Staff Audit Logs")`
  - Map routes:
    - `GET Find` → `HandleFindAuditLogs` + `.WithReqQueryValidation<>()` + `.WithPermission([LIST])`
    - `GET GetById` → `HandleGetAuditLogById` + `.WithPermission([GET])`
    - `GET Actions` → `HandleGetAuditLogActions` + `.WithPermission([LIST])`
    - `GET Export` → `HandleExportAuditLogs` + `.WithReqQueryValidation<>()` + `.WithPermission([EXPORT])`

**Step 10: Register in Program.cs**
- **Modify** `apps/api/Program.cs`
  - Add `using MainApi.Src.Modules.AuditLogs.Endpoints;`
  - Add `staffGroup.MapAuditLogEndpointsForStaff();` after existing staff endpoint registrations

### Phase 4 — Client Generation

**Step 11: Build API + generate client**
- Run `make build-api && make generate-client`
- Run `make tsc-front` to verify no TS errors

---

## Section D: Frontend Plan

### Phase 5 — Route + Navigation Wiring

**Step 12: Add path constants**
- **Modify** `packages/shared/lib/constants.ts`
  - Add `auditLogs: 'audit-logs'` to `RESOURCE` object
  - Add to `FRONT_PATH_NAMES.staff`:
    ```
    auditLogs: {
      root: makePath(ROOTS.STAFF, RESOURCE.auditLogs),
      details: (logId = '') =>
        makePath(ROOTS.STAFF, RESOURCE.auditLogs, logId),
    },
    ```

**Step 13: Create route definition**
- **Create** `apps/front/src/routes/_tree/staff/parts/staff-audit-logs.routes.ts`
  - Index route → `routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx`
  - Detail route → `routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`

**Step 14: Register in staff route tree**
- **Modify** `apps/front/src/routes/_tree/staff/staff.routes.ts`
  - Import `staffAuditLogsRoutes`
  - Spread into the layout children array

**Step 15: Add sidebar nav entry**
- **Modify** `apps/front/src/routes/authed/staff/_layout/staff-layout.tsx`
  - Add `audit-logs` item under the `platform` subheader section:
    ```
    {
      title: t('audit-logs'),
      path: FRONT_PATH_NAMES.staff.auditLogs.root,
      icon: ICONS.history,
      deepActiveMatch: true,
    },
    ```

### Phase 6 — Query Hooks

**Step 16: Create TanStack Query hooks**
- **Create** `apps/front/src/lib/react-query/features/staff/staff-audit-logs.hooks.ts`
  - `useFindAuditLogs` — `createStaffQuery` for the list endpoint
  - `useGetAuditLog` — `createStaffQuery` for the detail endpoint
  - `useGetAuditLogActions` — `createStaffQuery` for the actions endpoint

### Phase 7 — List Page + Table

**Step 17: Create list page**
- **Create** `apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx`
  - `DashboardContent` + `CustomBreadcrumbs`
  - SEO meta via `getServerLoader`
  - Render `StaffAuditLogsTable` component
  - Breadcrumbs action slot: Export button

**Step 18: Create table component**
- **Create** `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`
  - `MaterialReactTable` with `useMRTTable('minimal-cursor')`
  - Columns: Timestamp, User (name+email), Action (Label chip), Target ID, IP Address
  - `useTableState({ paginationMode: 'cursor' })` for cursor pagination
  - Filter controls above table:
    - Action select dropdown (populated from `useGetAuditLogActions`)
    - Date range pickers (start/end date via MUI DatePicker)
    - User autocomplete (MUI `Autocomplete` with debounced search querying the existing `FindStaffUsers` endpoint by name/email, resolves to `userId` for the API call)
  - Row click navigates to detail page

**Step 19: Create export button component**
- **Create** `apps/front/src/routes/authed/staff/audit-logs/list/parts/audit-logs-export-button.tsx`
  - Dropdown button with CSV/JSON options
  - On click: call export endpoint with current filters, trigger browser download
  - Loading state during export

### Phase 8 — Detail Page

**Step 20: Create detail page**
- **Create** `apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`
  - `useParams()` to get `logId`
  - `useGetAuditLog` hook
  - `QueryDisplay` with loading/error/empty slots
  - Content: Card layout with:
    - Action (Label chip)
    - User (name + email, link to staff user page)
    - Timestamp (formatted date + relative time)
    - Target ID
    - IP Address
    - User Agent
    - Details (JSON formatted in `<Box component="pre">` — no raw HTML elements per MUI-only rule)
  - Back button to list page

---

## Section E: Tests Plan

### API Integration Tests

All spec files co-located with handlers following `*.Spec.cs` convention.

**E1. `FindAuditLogs.Spec.cs`**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs`
- Scenarios:
  - `ItShouldReturnOkWithDefaultPagination` — no filters, verify response shape
  - `ItShouldReturnNextCursorWhenMoreResultsExist` — create entries, request with `limit=2`
  - `ItShouldFilterByAction` — create entries with different actions, filter by one
  - `ItShouldFilterByUserId` — filter by specific user
  - `ItShouldFilterByDateRange` — create entries, filter by startDate/endDate
  - `ItShouldReturnBadRequestForInvalidCursor` — pass invalid Guid as cursor
  - `ItShouldReturn422WhenStartDateAfterEndDate` — inverted date range → 422
  - `ItShouldReturn422WhenStartDateIsMalformed` — `startDate=not-a-date` → 422
  - `ItShouldReturn422WhenUserIdIsNotValidGuid` — `userId=abc` → 422
  - `ItShouldReturnUnauthorizedWithoutSession` — no token → 401
  - `ItShouldReturnForbiddenForNonStaffUser` — tenant user token → 403 (tests `WithStaffAuthorization`)
  - `ItShouldReturnForbiddenForStaffWithoutPermission` — staff user lacking `audit_logs.list` permission → 403 (tests `WithPermission`)

**E2. `GetAuditLogById.Spec.cs`**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.Spec.cs`
- Scenarios:
  - `ItShouldReturnOkWithValidId` — create log entry, fetch by ID, verify all fields
  - `ItShouldReturnRealUserFieldsWhenUserIsSoftDeleted` — soft-delete the acting user, fetch log, verify real `userName`/`userEmail` still resolve (not fallback values)
  - _(No integration test for orphaned FK fallback — the FK is `ON DELETE CASCADE`, so hard-deleting a user cascades to their audit logs. The `"(deleted user)"` / `"(unknown)"` fallback is defensive code; cover it with a unit test on the projection/mapping logic with `user = null` if desired.)_
  - `ItShouldReturnNotFoundForInvalidId` — random Guid → 404
  - `ItShouldReturnUnauthorizedWithoutSession` — 401
  - `ItShouldReturnForbiddenForNonStaffUser` — 403
  - `ItShouldReturnForbiddenForStaffWithoutPermission` — 403

**E3. `GetAuditLogActions.Spec.cs`**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.Spec.cs`
- Scenarios:
  - `ItShouldReturnOkWithActionsList` — verify returns non-empty, alphabetically sorted list of known action keys
  - `ItShouldReturnUnauthorizedWithoutSession` — 401
  - `ItShouldReturnForbiddenForNonStaffUser` — 403
  - `ItShouldReturnForbiddenForStaffWithoutPermission` — 403

**E4. `ExportAuditLogs.Spec.cs`**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
- Scenarios:
  - `ItShouldReturnCsvWithValidFormat` — verify Content-Type and Content-Disposition headers
  - `ItShouldReturnJsonWithValidFormat` — verify JSON array response
  - `ItShouldReturn422ForInvalidFormat` — `format=xml` → 422
  - `ItShouldApplyFiltersToExport` — filter by action, verify filtered results in output
  - `ItShouldReturn400WhenExportExceedsLimit` — seed entries exceeding limit, verify 400
  - `ItShouldReturn422WhenStartDateIsMalformed` — `startDate=xyz` → 422
  - `ItShouldReturn422WhenTargetIdIsNotValidGuid` — `targetId=abc` → 422
  - `ItShouldReturnUnauthorizedWithoutSession` — 401
  - `ItShouldReturnForbiddenForNonStaffUser` — 403
  - `ItShouldReturnForbiddenForStaffWithoutPermission` — 403

### Test Helper

- **Create** `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs`
  - `CreateAuditLogAsync(HttpClient, ...)` — or directly via `IAuditLogService.LogAsync` using a scoped service from the test fixture
  - Since audit logs are created as side effects of other operations, tests may need to either:
    - Perform an action that generates audit logs (e.g., create an invitation) and then query
    - Or inject `IAuditLogService` directly to seed test entries
  - Utility method: `GetFindUrl(params)` — build query string for the find endpoint

### Frontend Tests

- Smoke-level route render tests (verify pages mount without errors)
- File: `apps/front/src/routes/authed/staff/audit-logs/__tests__/` (if test infra supports it)
- Alternatively: E2E tests via Playwright if configured (post-MVP consideration)

---

## Section F: PR Plan

### PR 1: Backend — Permissions + Routes + Service (smallest, reviewable first)
**Files:**
- **Create** `apps/api/Src/Modules/AuditLogs/Permissions/AuditLogPermissionsForStaff.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Routes.AuditLogs.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
- **Modify** `apps/api/Src/Lib/AppPermissions.cs`
- **Modify** `apps/api/Src/Lib/AppEnvironment.cs` — add `AUDIT_LOG_EXPORT_MAX_ROWS` (optional int env var, default 10000; startup does not fail if unset)

**Commit boundaries:**
1. `feat(api): add audit log permissions for staff`
2. `feat(api): add audit log route constants`
3. `feat(api): add audit log query service`

### PR 2: Backend — Handlers + Endpoints + Registration
**Files:**
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Endpoints/AuditLogEndpointsForStaff.cs`
- **Modify** `apps/api/Program.cs`

**Commit boundaries:**
1. `feat(api): add find audit logs handler with cursor pagination and filters`
2. `feat(api): add get audit log by id handler`
3. `feat(api): add get audit log actions handler`
4. `feat(api): add export audit logs handler (csv/json)`
5. `feat(api): register audit log staff endpoints`

### PR 3: Backend — Integration Tests
**Files:**
- **Create** `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.Spec.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.Spec.cs`
- **Create** `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`

**Commit boundaries:**
1. `test(api): add audit log test helper`
2. `test(api): add find audit logs integration tests`
3. `test(api): add get/actions/export audit log integration tests`

### PR 4: Frontend — Route + Nav + Query Hooks + Pages
**Files:**
- **Modify** `packages/shared/lib/constants.ts`
- **Create** `apps/front/src/routes/_tree/staff/parts/staff-audit-logs.routes.ts`
- **Modify** `apps/front/src/routes/_tree/staff/staff.routes.ts`
- **Modify** `apps/front/src/routes/authed/staff/_layout/staff-layout.tsx`
- **Create** `apps/front/src/lib/react-query/features/staff/staff-audit-logs.hooks.ts`
- **Create** `apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx`
- **Create** `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`
- **Create** `apps/front/src/routes/authed/staff/audit-logs/list/parts/audit-logs-export-button.tsx`
- **Create** `apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`

**Commit boundaries:**
1. `feat(front): add audit logs path constants and route tree entry`
2. `feat(front): add audit logs sidebar nav item`
3. `feat(front): add audit logs TanStack Query hooks`
4. `feat(front): add audit logs list page with filterable table`
5. `feat(front): add audit log detail page`
6. `feat(front): add audit logs export button`

> **Alternative:** PRs 1-3 can be merged into a single backend PR if the team prefers fewer PRs. The commit boundaries still provide clear review units.

---

## Section G: Open Questions

All questions resolved:

1. ~~**Export row limit.**~~ **Resolved:** configurable via `AppEnvironment.AUDIT_LOG_EXPORT_MAX_ROWS` (default: 10,000).
2. ~~**Action keys source.**~~ **Resolved:** hardcoded from `AuditActions` constants (no DB query). Returns all possible action keys.
3. ~~**User name resolution.**~~ **Resolved:** `User` entity has `FirstName` (nullable), `LastName` (nullable), `Email` (required). The DTO projects `userName` as `"{FirstName} {LastName}".Trim()` with fallback to `Email` when both name fields are null. `userEmail` is always included separately. For hard-deleted or orphaned user rows (left join yields no match), `userName` falls back to `"(deleted user)"` and `userEmail` to `"(unknown)"`. Soft-deleted users resolve normally via `IgnoreQueryFilters()`.

---

## Risks / Edge Cases / Performance Notes

### Performance
- **Find query with filters:** The composite indexes `(UserId, CreatedAt)` and `(Action, CreatedAt)` cover the most common filter+sort combinations. Date range filters on `CreatedAt` are well-indexed.
- **Export uses streaming from day 1.** `IAsyncEnumerable` + `AsAsyncEnumerable()` ensures rows flow from DB to HTTP response without buffering. The row limit is pre-checked via a capped count (`query.Take(limit + 1).CountAsync()`) — not a full `COUNT(*)` scan. If over limit, the export is rejected with `400` before any data is sent.
- **Actions endpoint:** Hardcoding from `AuditActions` constants avoids a `DISTINCT` scan on a potentially large table.

### Edge Cases
- **Empty audit log table:** New installations will have an empty table. The list endpoint should return `{ data: [], nextCursor: null }` gracefully.
- **Deleted users:** Soft-deleted users resolve normally via `IgnoreQueryFilters()` — their real name/email are shown. The FK is `ON DELETE CASCADE`, so hard-deleting a user cascades to their audit logs (orphaned rows shouldn't occur in practice). The `"(deleted user)"` / `"(unknown)"` fallback is defensive code for the left-join no-match path.
- **Invalid date formats:** The validator must reject malformed `startDate`/`endDate` values with a clear 422 error.
- **Inverted date range:** If `startDate > endDate`, the validator rejects with 422 — don't silently swap or return empty results.
- **Export with no results:** Return an empty CSV (headers only) or empty JSON array — not a 404.
- **Export limit race condition:** A tiny race exists between the `limit + 1` pre-check and the actual stream — rows inserted in that window could make the result set slightly over limit while the response returns truncated `Take(limit)` data. Acceptable for MVP; a single-query strategy (e.g., streaming with inline count) can be added post-MVP if needed.

### Security
- **Permission enforcement:** All 4 endpoints require staff auth + specific permission. No anonymous/tenant access.
- **Details field exposure:** The `Details` JSON may contain sensitive info (emails, IPs). This is acceptable for staff-only access. Post-MVP, consider field-level redaction.

---

## MVP Definition of Done Checklist

### Backend
- [ ] `AuditLogPermissionsForStaff` created with LIST, GET, EXPORT permissions (EN + FR translations)
- [ ] Permissions registered in `AppPermissions.Staff.AuditLogs`
- [ ] Route constants defined in `Routes.AuditLogs.ForStaff`
- [ ] `AppEnvironment.AUDIT_LOG_EXPORT_MAX_ROWS` configurable (default 10,000)
- [ ] `AuditLogQueryService` implements find (cursor pagination + filters), getById, getActions, export (streamed via `IAsyncEnumerable`)
- [ ] `FindAuditLogs` handler with query validation
- [ ] `GetAuditLogById` handler
- [ ] `GetAuditLogActions` handler
- [ ] `ExportAuditLogs` handler with CSV/JSON format support
- [ ] All endpoints registered in `AuditLogEndpointsForStaff` with correct permissions
- [ ] Endpoints mapped in `Program.cs` under `staffGroup`
- [ ] `make build-api` passes
- [ ] `make generate-client` produces updated TypeScript client
- [ ] `make tsc-front` passes after client generation

### Tests
- [ ] Integration tests for FindAuditLogs (pagination, filters, auth, permissions)
- [ ] Integration tests for GetAuditLogById (happy path, not found, auth)
- [ ] Integration tests for GetAuditLogActions (happy path, auth)
- [ ] Integration tests for ExportAuditLogs (CSV, JSON, invalid format, filters, auth)
- [ ] `make test-api` passes

### Frontend
- [ ] `auditLogs` resource and path constants added
- [ ] Staff audit logs route defined and registered in route tree
- [ ] Sidebar nav item added under "platform" section
- [ ] TanStack Query hooks for find, getById, getActions
- [ ] List page with cursor-paginated table
- [ ] Filter controls: action dropdown, date range, user autocomplete (search by name/email)
- [ ] Export button (CSV/JSON download)
- [ ] Detail page with full audit log information including formatted JSON details
- [ ] `make tsc-front` passes
- [ ] `make check-write` passes (Biome lint + formatting)

### Final
- [ ] All 4 PRs merged (or single PR if preferred)
- [ ] Scalar docs at `/scalar/v1` show new audit log endpoints
- [ ] Manual smoke test: navigate to `/staff/audit-logs`, verify table loads, filters work, export downloads, detail page renders
