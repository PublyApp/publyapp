# Audit Logs MVP — Final Code Review (Pass 7)

### Critical (must fix before merge)

1.
**File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`  
**Line(s)**: `364-375`  
**Issue**: CSV escaping does not prevent spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes).  
**Why it matters**: Security risk. Exported CSV opened in Excel/Sheets can execute attacker-controlled formulas from audit fields (`Details`, `UserAgent`, etc.).  
**Suggested fix**: In `EscapeCsv`, first neutralize formula-leading characters (e.g., prefix `'` when first char is one of `=+-@`), then apply current quote/comma/newline escaping.

2.
**File**: `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`  
**Line(s)**: `66-90`, `202-231`  
**Issue**: MVP filters are missing on the staff page (no user autocomplete, no date range, no target filter wired to query variables).  
**Why it matters**: This is a spec miss vs finalized plan; staff cannot perform mandatory filtering workflows in UI.
**Suggested fix**: Add filter controls for `userId`, `startDate`, `endDate` (and `targetId` if kept in API contract), bind them into `useFindStaffAuditLogs` variables, and reset cursor pagination when they change.

3.
**File**: `apps/front/src/routes/authed/staff/audit-logs/list/parts/audit-logs-export-button.tsx`  
**Line(s)**: `12-14`, `52-55`  
**Issue**: Export only forwards `action`; it ignores the rest of active list filters.  
**Why it matters**: Users export a different dataset than what they are viewing, which is correctness-breaking for audit workflows.  
**Suggested fix**: Pass all active list filters (`userId`, `startDate`, `endDate`, `targetId`) into the export button props and include them in export query params.

4.
**File**: `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`  
**Line(s)**: `126-130`  
**Issue**: `userName` column remains sortable, but backend only supports `sortId=created_at`.  
**Why it matters**: User can click sort on unsupported columns and trigger `400 Invalid sortId` responses.  
**Suggested fix**: Explicitly disable sorting on all non-supported columns (`enableSorting: false`), leaving only `created_at` sortable.

### Important (should fix, creates tech debt if not)

1.
**File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs`  
**Line(s)**: `26-350`  
**Issue**: Missing `ItShouldReturnForbiddenForStaffWithoutPermission` case (only non-staff 403 is covered).  
**Why it matters**: Does not verify `.WithPermission()` path for staff accounts, only `.WithStaffAuthorization()`.
**Suggested fix**: Add a staff user without `staff.audit_logs.list` and assert 403.

2.
**File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.Spec.cs`  
**Line(s)**: `30-209`  
**Issue**: Missing `ItShouldReturnForbiddenForStaffWithoutPermission` case for `staff.audit_logs.get`.  
**Why it matters**: Permission gate coverage is incomplete.  
**Suggested fix**: Add explicit 403 test for staff lacking `GET` permission.

3.
**File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.Spec.cs`  
**Line(s)**: `26-96`  
**Issue**: Missing `ItShouldReturnForbiddenForStaffWithoutPermission` case (actions endpoint uses LIST permission).  
**Why it matters**: Regression risk on permission middleware wiring.  
**Suggested fix**: Add explicit staff-without-permission test.

4.
**File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`  
**Line(s)**: `25-268`  
**Issue**: Missing two key tests from plan matrix: `ItShouldReturn400WhenExportExceedsLimit` and staff-without-permission 403 for export.  
**Why it matters**: Export safety limit and permission gate are unverified.  
**Suggested fix**: Add both scenarios (using temp env override / seeded row count for limit test).

5.
**File**: `apps/api/Src/Lib/AppEnvironment.cs`  
**Line(s)**: `154`, `298-368`  
**Issue**: `AUDIT_LOG_EXPORT_MAX_ROWS` is parsed but never validated for sane bounds (`>= 1`).  
**Why it matters**: `0`/negative values can lead to broken/undefined export behavior at runtime.  
**Suggested fix**: Add validator rule (e.g., `InclusiveBetween(1, 1_000_000)` or at least `GreaterThan(0)`).

6.
**File**: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`  
**Line(s)**: `175-177`, `260-263`, `324-327`, `352-355`  
**Issue**: Read queries are tracking entities (`AsNoTracking()` not used).  
**Why it matters**: Unnecessary change-tracker overhead on high-read endpoints (list/export/actions/details).  
**Suggested fix**: Add `.AsNoTracking()` on read-only `AuditLog`/`User` query roots.

7.
**File**: `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`  
**Line(s)**: `35-43`, `124-154`  
**Issue**: `targetId` is in row model but not rendered in table columns.  
**Why it matters**: MVP list requirements include target visibility; this removes key audit context.  
**Suggested fix**: Add a `targetId` column (monospace, truncated/tooltip if needed).

### Minor (nice to have, optional improvements)

1.
**File**: `apps/api/Src/Modules/AuditLogs/Routes.AuditLogs.cs`  
**Line(s)**: `10`  
**Issue**: `GetById` route lacks GUID constraint (`/{logId}` instead of `/{logId:guid}`).  
**Why it matters**: Current static route ordering avoids collision, but constraint is safer and self-documenting.  
**Suggested fix**: Change constant to `"/{logId:guid}"`.

2.
**File**: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`  
**Line(s)**: `295-314`  
**Issue**: Reflection over `AuditActions` runs every request and is not cached.  
**Why it matters**: Small but unnecessary per-request overhead.  
**Suggested fix**: Compute once into static readonly cached list (deduped + sorted).

3.
**File**: `apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`  
**Line(s)**: `85`, `329`  
**Issue**: Hardcoded user-visible English strings (`"Bad Request"`, `"Log ID is required"`, `"ID:"`).  
**Why it matters**: i18n inconsistency in a localized app.  
**Suggested fix**: Move these to translation keys in `common.en.json` / `common.fr.json` and use `t(...)`.

4.
**File**: `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`  
**Line(s)**: `320-327`  
**Issue**: Icon-only action button has no explicit `aria-label`.  
**Why it matters**: Accessibility regression for screen readers.  
**Suggested fix**: Add `aria-label={t('view-details')}` on the `IconButton`.

### Observations (not issues, but worth noting)

1.
**File**: `apps/api` build/test pipeline  
**Line(s)**: N/A  
**Issue**: `make build-api` passes cleanly.  
**Why it matters**: Backend compiles and OpenAPI generation succeeds.
**Suggested fix**: None.

2.
**File**: `apps/front` type-check pipeline  
**Line(s)**: N/A  
**Issue**: `make tsc-front` currently fails on pre-existing `server/app.ts` missing `virtual:react-router/server-build` module (not introduced by this feature).  
**Why it matters**: Frontend CI signal is noisy; feature-specific regressions can be masked.  
**Suggested fix**: Fix or isolate the existing `tsc-front` baseline issue separately.

3.
**File**: `apps/api` integration tests  
**Line(s)**: N/A  
**Issue**: Audit logs integration tests were executed with Docker and passed (`27/27`).  
**Why it matters**: Runtime behavior for the implemented audit-log endpoints is now verified in integration scope.  
**Suggested fix**: None.
