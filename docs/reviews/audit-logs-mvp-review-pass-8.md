### Critical (must fix before merge)

- **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
- **Line(s)**: `364-373`
- **Issue**: CSV injection neutralization is incomplete; it only checks the first raw character for `=`, `+`, `-`, `@`.
- **Why it matters**: Attackers can bypass this with leading control characters (for example `\t=...`) in fields like `Details`, which some spreadsheet parsers treat as formulas.
- **Suggested fix**: Check the first non-whitespace/control character (at least `\t`, `\r`, `\n`, and spaces), or defensively prefix `'` when the value starts with any of these plus a formula trigger.

### Important (should fix, creates tech debt if not)

- **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
- **Line(s)**: `325-360`
- **Issue**: `ItShouldReturn400WhenExportExceedsLimit` mutates `AppEnvironment.Instance` through reflection on the auto-property backing field.
- **Why it matters**: This is brittle (breaks if property implementation changes) and introduces global mutable state during test execution, which can create cross-test flakiness.
- **Suggested fix**: Inject/override config in test host setup instead of reflection (for example test-specific env override before app initialization, or a test configuration abstraction).

- **File**: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
- **Line(s)**: `108-123`, `314-318`
- **Issue**: `CachedActions` is a mutable `List<string>` shared across requests and returned directly.
- **Why it matters**: Any accidental mutation in future code affects all callers globally and can create hard-to-trace behavior.
- **Suggested fix**: Store as immutable/read-only (`ImmutableArray<string>` or `IReadOnlyList<string>`) and return an immutable view.

- **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
- **Line(s)**: `27-346`
- **Issue**: No explicit regression test for CSV formula neutralization.
- **Why it matters**: The security fix can regress silently.
- **Suggested fix**: Add an export CSV test with seeded values starting with `=`, `+`, `-`, `@`, and `\t=` and assert output is safely prefixed.

### Minor (nice to have, optional improvements)

- **File**: `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`
- **Line(s)**: `11`
- **Issue**: Direct `dayjs` import (`type { Dayjs }`) in a component.
- **Why it matters**: It is close to violating the frontend standard that components should not use Day.js directly.
- **Suggested fix**: Prefer a local type alias from picker props or isolate date value typing behind a small utility type to avoid direct Day.js imports in route components.

### Observations (not issues, but worth noting)

- No new correctness regressions found in the route constraint update (`/{logId:guid}`), export query forwarding, or sorting disable behavior.
- `build-api` passed and AuditLogs integration tests passed (`32/32`).
- `tsc-front` currently fails due pre-existing Zod typing issues outside this feature slice; no new type errors were isolated to the audit-logs delta from this run.
