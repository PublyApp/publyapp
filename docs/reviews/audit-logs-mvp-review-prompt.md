# Code Review: Audit Logs MVP (Staff Query Endpoints + Dashboard)

## Context

You are reviewing a full-stack implementation of an Audit Logs MVP feature for a multi-tenant SaaS platform (PublyApp). The feature adds **read-only** query endpoints and a staff dashboard page for viewing audit logs. The write model (AuditLog entity + AuditLogService) already existed.

This implementation was done by an AI coding assistant (Claude) based on a finalized implementation plan that went through 6 rounds of review. Your job is to do a **7th and final review pass** — this time on the actual code, not the plan.

## What was implemented

**4 API endpoints (staff-only, permission-gated):**
1. `GET /staff/audit-logs` — cursor-paginated list with filters (action, userId, targetId, startDate, endDate)
2. `GET /staff/audit-logs/{logId}` — single audit log detail
3. `GET /staff/audit-logs/actions` — list of distinct action keys (from reflection on `AuditActions` constants)
4. `GET /staff/audit-logs/export` — streaming CSV/JSON export with configurable row limit pre-check

**Backend architecture:**
- `AuditLogQueryService` (read-only service, separate from existing write `AuditLogService`)
- User resolution via left join + `IgnoreQueryFilters()` on User entity, with `"(deleted user)"/"(unknown)"` fallback
- `SortFieldHandler` pattern for extensible cursor pagination
- `FindAuditLogsResult` discriminated union for handler-level flow control
- Streaming export via `IAsyncEnumerable` + `AsAsyncEnumerable()` (no buffering)
- Export limit pre-check: `query.Take(limit + 1).CountAsync()` → 400 if exceeded

**27 integration tests** covering happy paths, filters, pagination, validation (422), auth (401/403), soft-deleted users, CSV/JSON format validation.

**Frontend:**
- Staff sidebar nav entry, route tree registration
- TanStack Query hooks (`useFindStaffAuditLogs`, `useGetStaffAuditLog`, `useGetStaffAuditLogActions`)
- List page with `MaterialReactTable` (cursor pagination), action filter dropdown
- Export button with CSV/JSON menu (fetches ArrayBuffer via Kiota client → Blob download)
- Detail page with card layout, formatted JSON details, skeleton loading, 404→empty state

## Your review scope

Act as a **staff-level (10x) engineer** doing a thorough PR review. You have access to:
1. The **implementation plan** (`audit-logs-mvp.md`) — the spec
2. The **project rules** (`AGENTS.md` + all referenced guide files) — the law
3. All **created and modified files** — the code under review
4. **Reference files** — existing patterns the code should follow

## Review checklist — be exhaustive

### 1. Bugs & Correctness
- Logic errors, off-by-one, null reference risks, race conditions
- SQL/LINQ query correctness (especially the left join + IgnoreQueryFilters projection)
- CSV escaping edge cases (newlines, quotes, commas, unicode, null fields)
- JSON export correctness (valid JSON array, proper null handling, date serialization)
- Cursor pagination correctness (boundary conditions, empty results, single result)
- Export pre-check race condition between `CountAsync` and actual stream
- Date parsing/validation edge cases (timezone handling, ISO 8601 variants)
- Route parameter parsing (Guid validation, route conflicts between /{logId} vs /actions vs /export)

### 2. Performance
- N+1 queries or unnecessary DB round-trips
- Missing `.AsNoTracking()` where appropriate for read-only queries
- Export streaming — is it truly zero-buffering end-to-end?
- `Take(limit + 1).CountAsync()` — is this the most efficient pre-check strategy?
- Reflection on `AuditActions` — is it called per-request or cached?
- Index utilization for the filter combinations (action + createdAt, userId + createdAt)
- Frontend: unnecessary re-renders, missing `useMemo`/`useCallback`, stale closure risks

### 3. Robustness & Edge Cases
- Empty audit log table (fresh install)
- Export with 0 results (headers-only CSV, empty JSON array)
- User with null FirstName AND null LastName (should fall back to email)
- Extremely long `Details` JSON field in export (CSV cell, JSON nesting)
- Concurrent export requests hitting the same limit
- What happens when the export stream throws mid-response?
- Frontend: what if the export fails mid-download? Error handling?
- Frontend: what if `getClientManager()` throws? Is the export button resilient?

### 4. AGENTS.md & Guide Compliance (be strict)
- **C# coding standards**: pattern matching for null checks, query syntax for DB LINQ, max 100 char lines, braces on all control flow, `is null`/`is not null` (never `== null`), services MUST NOT depend on other services, `[Service]` attribute, `{Action}{Domain}Args` naming
- **Module structure**: domain-first layout, handler folders by actor, endpoint group structure
- **Route design**: kebab-case, symmetry, route constants in `Routes.*`
- **Test conventions**: `*.Spec.cs` suffix, `ItShould{Expected}When{Scenario}` naming, co-located with source
- **Frontend standards**: MUI v6 only (no native HTML except `<pre>`?), `sx` prop for all styling, arrow components, Day.js via `format-time.ts` utilities, `QueryDisplay` for query states, no `Array.reduce()`
- **Error format**: RFC 7807 via `TypedProblems.*`, 401 only for invalid/missing session, 422 for validation with `errors` dictionary
- **OpenAPI/Kiota**: `JsonElement` nullability rules, no XML comments on generics

### 5. Better Alternatives
- Could any design decision have been made differently with a clearly better outcome?
- Is the discriminated union (`FindAuditLogsResult`) justified, or is it over-engineering for this use case?
- Should the export use a different approach (e.g., `Results.Stream()` instead of writing to `HttpContext.Response` directly)?
- Is reflection on `AuditActions` the right approach vs. a static readonly list?
- Should the frontend export use a mutation hook instead of raw `getClientManager()`?
- Would `nuqs` URL state for filters be better than local `useState` for the action filter?

### 6. Test Coverage Gaps
- List every scenario from the plan's test matrix that is NOT covered by the 27 tests
- Are there missing negative test cases? (e.g., export with malformed format, export exceeds limit)
- Is the soft-deleted user test truly verifying the left join + IgnoreQueryFilters behavior?
- Should there be a test for the `"(deleted user)"` fallback path? (Note: FK ON DELETE CASCADE makes this impossible in integration tests — is the comment adequate?)
- Are there missing frontend test considerations?

### 7. Security
- Can a non-staff user access any of these endpoints?
- Is the `Details` JSON field safely rendered in the frontend (XSS via innerHTML)?
- Does the CSV export handle formula injection (`=`, `+`, `-`, `@` prefix)?
- Are query parameters properly validated before hitting the database?
- Is `X-Session-Token` properly enforced on all 4 endpoints?

### 8. Blindspots — What Would a 10x Engineer Catch?
- Anything that "works today but will bite you tomorrow"
- Maintenance traps, hidden coupling, or fragile assumptions
- Missing observability (logging, metrics, tracing)
- Missing OpenAPI documentation annotations (descriptions, examples, response codes)
- i18n completeness (are all user-visible strings translated?)
- Accessibility concerns on the frontend
- Missing error boundaries or fallback UI

## Output format

Structure your review as:

### 🔴 Critical (must fix before merge)
### 🟡 Important (should fix, creates tech debt if not)
### 🟢 Minor (nice to have, optional improvements)
### 💡 Observations (not issues, but worth noting)

For each finding:
- **File**: exact file path
- **Line(s)**: line number(s) if applicable
- **Issue**: concise description
- **Why it matters**: impact (bug, perf, security, maintainability, compliance)
- **Suggested fix**: concrete code change or approach

Be ruthless. Don't praise what works — only flag what doesn't or could be better. If you find nothing in a category, say so explicitly rather than inventing issues.

---

## Files to attach

### Implementation plan
- `docs/implementation-plans/audit-logs-mvp.md`

### Rules & guides
- `AGENTS.md`
- `docs/guides/csharp-coding-standards.md`
- `docs/guides/api-module-structure.md`
- `docs/guides/api-route-design.md`
- `docs/guides/api-integration-tests.md`
- `docs/guides/test-conventions.md`
- `docs/guides/cursor-keyset-pagination-guide.md`
- `docs/guides/frontend-architecture.md`
- `docs/guides/frontend-coding-standards.md`
- `docs/guides/project-conventions.md`
- `docs/guides/openapi-kiota-safeguards.md`

### Created files (backend)
- `apps/api/Src/Modules/AuditLogs/Permissions/AuditLogPermissionsForStaff.cs`
- `apps/api/Src/Modules/AuditLogs/Routes.AuditLogs.cs`
- `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
- `apps/api/Src/Modules/AuditLogs/Endpoints/AuditLogEndpointsForStaff.cs`

### Created files (tests)
- `apps/api/Src/Lib/Testing/Helpers/AuditLogTestHelper.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/FindAuditLogs.Spec.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogById.Spec.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.Spec.cs`
- `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`

### Created files (frontend)
- `apps/front/src/routes/_tree/staff/parts/staff-audit-logs.routes.ts`
- `apps/front/src/lib/react-query/features/staff/staff-audit-log.hooks.ts`
- `apps/front/src/routes/authed/staff/audit-logs/list/staff-audit-logs-list-page.tsx`
- `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`
- `apps/front/src/routes/authed/staff/audit-logs/list/parts/audit-logs-export-button.tsx`
- `apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`

### Modified files
- `apps/api/Src/Lib/AppPermissions.cs`
- `apps/api/Src/Lib/AppEnvironment.cs`
- `apps/api/Program.cs`
- `packages/shared/lib/constants.ts`
- `apps/front/src/routes/_tree/staff/staff.routes.ts`
- `apps/front/src/routes/authed/staff/_layout/staff-layout.tsx`
- `packages/shared/lib/i18n/json/common.en.json`
- `packages/shared/lib/i18n/json/common.fr.json`

### Reference files (for context on existing patterns)
- `apps/api/Src/Modules/AuditLogs/Entities/AuditLog.cs`
- `apps/api/Src/Modules/AuditLogs/Services/AuditLogService.cs` (existing write service)
- `apps/api/Src/Modules/Users/Entities/User.cs`
- `apps/api/Src/Data/DbContext/MainApiDbContext.cs`
- `apps/api/Src/Lib/CursorPaginatedQuery.cs`
- `apps/api/Src/Lib/CursorPaginatedQueryValidator.cs`
- `apps/api/Src/Lib/CursorPaginatedResult.cs`
- `apps/api/Src/Data/BaseAttributes.cs`
- `apps/api/Src/Lib/ProblemResults/TypedProblems.cs`
- `apps/api/Src/Lib/DI/ServiceAttribute.cs`
