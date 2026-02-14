# Audit Logs MVP — Review Pass 8 (Post-Fix Review)

## Context — where we are

Hey, so you already did a thorough pass 7 review on the Audit Logs MVP implementation. You found 4 critical, 7 important, and 4 minor issues. We went through and addressed **every single one** of them. This is pass 8 — your job now is to review the fixes themselves and catch anything we might have introduced or missed while fixing.

Think of this as a "did the surgery go well?" check. We fixed the patient, but did we leave a sponge inside?

## What was fixed (the delta)

Here's what changed since your last review:

### Critical fixes

1. **CSV formula injection** (`ExportAuditLogs.cs`) — `EscapeCsv` now prefixes a single quote `'` when the first character is `=`, `+`, `-`, or `@` before applying the existing quote/comma/newline escaping.

2. **Missing date range filters on the frontend** (`staff-audit-logs-table.tsx`) — Added two `DatePicker` components (from `@mui/x-date-pickers`) for `startDate` and `endDate`, bound to `useFindStaffAuditLogs` variables. Uses `startOf('day')` / `endOf('day')` for ISO conversion. Resets cursor pagination on change. Uses `maxDate`/`minDate` cross-constraints. Clearable.

3. **Export button now forwards all active filters** (`audit-logs-export-button.tsx`) — The props type was extended with `startDate?: string` and `endDate?: string`. These get passed into the Kiota client's `queryParameters`.

4. **Disabled sorting on unsupported columns** (`staff-audit-logs-table.tsx`) — Added `enableSorting: false` to `userName` column. Only `created_at` remains sortable.

### Important fixes

5. **Added `AsNoTracking()` on all 4 read query roots** (`AuditLogQueryService.cs`) — Applied to `FindAsync`, `GetByIdAsync`, `ExportExceedsLimitAsync`, and `ExportAsync`.

6. **Cached `AuditActions` reflection** (`AuditLogQueryService.cs`) — Moved to a `private static readonly List<string> CachedActions` computed once at class load via static field initializer. `GetDistinctActionsAsync` now just returns `Task.FromResult(CachedActions)`.

7. **Added `AUDIT_LOG_EXPORT_MAX_ROWS` validation** (`AppEnvironment.cs`) — Added `InclusiveBetween(1, 1_000_000)` in `AppEnvironmentValidator`.

8. **Added `targetId` column to table** (`staff-audit-logs-table.tsx`) — New `TargetIdCell` with monospace font, truncation via `textOverflow: 'ellipsis'`, and full GUID in a `Tooltip`. Shows `-` when empty.

9. **Added GUID route constraint** (`Routes.AuditLogs.cs`) — Changed `"/{logId}"` to `"/{logId:guid}"`.

10. **Added 6 new integration tests across all 4 spec files:**
    - `ItShouldReturnForbiddenForStaffWithoutPermission` on FindAuditLogs, GetAuditLogById, GetAuditLogActions, ExportAuditLogs (logs in as `StaffUserEmail` — a staff user with no permissions)
    - `ItShouldReturn400WhenExportExceedsLimit` on ExportAuditLogs — uses reflection to temporarily set the backing field of `AUDIT_LOG_EXPORT_MAX_ROWS` to 2, seeds 3 logs with a unique action, asserts 400, then restores the original value in a `finally` block

### Minor fixes

11. **Fixed hardcoded English strings** (`staff-audit-log-details-page.tsx`) — `"Bad Request"` → `t('bad-request')`, `"Log ID is required"` → `t('log-id-required')`. Added `log-id-required` key to both `common.en.json` and `common.fr.json`.

12. **Added `aria-label`** (`staff-audit-logs-table.tsx`) — `aria-label={t('view-details')}` on the icon-only `IconButton` in `ActionsCell`.

## What I want you to review

Go through the same rigorous checklist as before, but **focused on the changes** (not the unchanged code). Specifically:

### 1. Did we introduce new bugs?

- Is the formula injection fix correct? Does the `'` prefix play well with the existing quoting logic? What happens if the value is `=cmd|...` and also contains a comma? Does the order (prefix first, then quote) produce the right output?
- Is the `DatePicker` → ISO string conversion correct? `startOf('day').toISOString()` and `endOf('day').toISOString()` — does this handle timezones correctly? The backend parses with `DateTimeStyles.RoundtripKind`. Will a user in UTC+5 get surprising results?
- Is `CachedActions` thread-safe? It's a `static readonly List<string>` — is it safe to return the same reference from `Task.FromResult` to concurrent callers? (Hint: nobody mutates it, but verify.)
- Does the `{logId:guid}` constraint break anything? Are there any existing routes, tests, or frontend paths that pass non-GUID values?

### 2. Is the export-exceeds-limit test solid?

This is the most complex new test. It uses reflection to set a private backing field (`<AUDIT_LOG_EXPORT_MAX_ROWS>k__BackingField`). Scrutinize this:
- Is this approach fragile? What happens if the property becomes a non-auto property later?
- Is the `finally` block sufficient for cleanup, or could a parallel test read the modified value?
- Is the unique action filter (`test.export.limit.{guid}`) sufficient to isolate from other seeded data?
- Could there be a race condition with the `ExportExceedsLimitAsync` check and the actual export?

### 3. Performance

- The `DatePicker` components — are they causing unnecessary re-renders? Each change calls `resetCursorPagination?.()` and `setStartDate(...)` — that's two state updates. Is that fine or should they be batched?
- Is `startOf('day').toISOString()` and `endOf('day').toISOString()` recomputed on every render? It's derived from state, not memoized. Should it be?
- The `CachedActions` static field initializer — any concern with it running during assembly load? Could it fail if `AuditActions` class hasn't been loaded yet?

### 4. AGENTS.md & Guide Compliance

Be strict. Check:
- **C# standards**: Is the `EscapeCsv` fix using pattern matching correctly? Is the `CachedActions` field following naming conventions? Are the new test methods following `ItShould{Expected}When{Scenario}` naming?
- **Frontend standards**: Is importing `DatePicker` from `@mui/x-date-pickers/DatePicker` OK per the rules? Is importing `type { Dayjs }` from `dayjs` a violation of the "never import dayjs directly" rule? Or is a type-only import acceptable since it doesn't use dayjs functionality?
- **i18n**: Are the new translation keys (`log-id-required`) following kebab-case convention? Is the French translation accurate?
- **Test conventions**: Are the new test method names following the naming pattern? Are they co-located correctly?

### 5. Edge cases we might have missed

- What happens if both `startDate` and `endDate` are set to the same day? Does `startOf('day')` to `endOf('day')` correctly include the full day?
- What if the user clears one date but not the other? Does the API handle a startDate with no endDate (and vice versa)?
- The `TargetIdCell` — what if `targetId` is an empty string (not null/undefined)? The mapper maps `log.targetId || ''` — does `''` pass the `if (!targetId)` check?
- Export button: if `startDate` is set but `endDate` is undefined, does the Kiota client send `endDate=undefined` as a literal string or omit it?

### 6. Better alternatives

- For the formula injection fix: is `'` prefix the industry standard approach? Would a tab prefix be better? Should we also handle `\t`, `\r`, `\n` at the start of a cell?
- For the export-exceeds-limit test: is there a cleaner way than reflection on the backing field? Could we inject `AppEnvironment` as a scoped service in tests? Or use a test-specific override?
- For the date filters: should we use `nuqs` for URL-synced state instead of `useState`? That way the filter state survives page navigation.
- For the `CachedActions`: since it returns a `List<string>` (mutable), should it return `IReadOnlyList<string>` to prevent accidental mutation by callers?

### 7. Test coverage — are the new tests actually testing what they claim?

- The `StaffWithoutPermission` tests — do they actually hit the `PermissionFilter` path? Or does `StaffAuthFilter` short-circuit first? Verify the auth flow: `StaffAuthFilter` checks that the user IS staff (passes for `StaffUserEmail`), then `PermissionFilter` checks they have the specific permission (fails for `StaffUserEmail` who has no permissions). Is this the correct flow?
- The export-exceeds-limit test — does it actually exercise the `ExportExceedsLimitAsync` code path? Or could the 400 come from validation?

### 8. Anything else a 10x engineer would catch

- Hidden coupling, fragile assumptions, things that work today but will bite tomorrow
- Did we forget to update the OpenAPI spec annotations for the new route constraint?
- Are there any frontend TypeScript type errors we might have introduced?
- Is the `DatePicker` `clearable` field API correct for `@mui/x-date-pickers` v8?

## Output format

Same as before:

### Critical (must fix before merge)
### Important (should fix, creates tech debt if not)
### Minor (nice to have, optional improvements)
### Observations (not issues, but worth noting)

For each finding:
- **File**: exact file path
- **Line(s)**: line number(s) if applicable
- **Issue**: concise description
- **Why it matters**: impact
- **Suggested fix**: concrete approach

If a category has nothing, say so explicitly. Don't invent issues, but don't go easy on us either.

---

## Files to attach

### Changed files (the delta — this is what you're reviewing)

**Backend:**
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs` (formula injection fix)
- `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs` (AsNoTracking + cached reflection)
- `apps/api/Src/Modules/AuditLogs/Routes.AuditLogs.cs` (GUID constraint)
- `apps/api/Src/Lib/AppEnvironment.cs` (export max rows validation)

**Tests:**
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.Spec.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.Spec.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`

**Frontend:**
- `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`
- `apps/front/src/routes/authed/staff/audit-logs/list/parts/audit-logs-export-button.tsx`
- `apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`

**i18n:**
- `packages/shared/lib/i18n/json/common.en.json`
- `packages/shared/lib/i18n/json/common.fr.json`

### Reference files (for context, unchanged)
- `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs`
- `apps/api/Src/Lib/Testing/Fixtures/TestConstants.cs`
- `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`
- `apps/api/Src/Modules/AuditLogs/Permissions/AuditLogPermissionsForStaff.cs`
- `apps/api/Src/Modules/AuditLogs/Endpoints/AuditLogEndpointsForStaff.cs`
- `apps/api/Src/Lib/Filters/PermissionFilter.cs`
- `apps/api/Src/Lib/Filters/StaffAuthFilter.cs`
- `apps/front/src/lib/react-query/features/staff/staff-audit-log.hooks.ts`
- `apps/front/src/utils/format-time.ts`

### Rules & guides (for compliance checking)
- `AGENTS.md`
- `docs/guides/csharp-coding-standards.md`
- `docs/guides/api-module-structure.md`
- `docs/guides/api-route-design.md`
- `docs/guides/api-integration-tests.md`
- `docs/guides/test-conventions.md`
- `docs/guides/frontend-coding-standards.md`
- `docs/guides/project-conventions.md`
- `docs/guides/openapi-kiota-safeguards.md`

### Previous review (for context on what was fixed)
- `docs/reviews/audit-logs-mvp-final-code-review.md`
