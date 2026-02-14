# Audit Logs MVP - Review Pass 9

### Critical (must fix before merge)
None.

### Important (should fix, creates tech debt if not)
1. **File**: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
   **Line(s)**: `108-124`, `319`
   **Issue**: `CachedActions` is exposed as `IReadOnlyList<string>` but still backed by a mutable `List<string>` instance returned by reference.
   **Why it matters**: Any in-process caller can downcast and mutate the cached global list, causing cross-request side effects and hard-to-trace behavior.
   **Suggested fix**: Store actions in a truly immutable runtime type (`ImmutableArray<string>` or `string[]` + `Array.AsReadOnly`) and return that immutable instance.

2. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
   **Line(s)**: `415-435`, `446-469`
   **Issue**: `SetExportMaxRows` still mutates global singleton state via reflection during test execution.
   **Why it matters**: With parallel test execution enabled, this can create test-order coupling and flaky failures if another export test runs while the override is active.
   **Suggested fix**: Isolate this test in a non-parallel collection (or disable parallelization for this class), or switch to a test-time config override mechanism that does not mutate global static/singleton state.

### Minor (nice to have, optional improvements)
1. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
   **Line(s)**: `192`
   **Issue**: Test method name `ItShouldNeutralizeFormulaTriggerCharsInCsv` does not follow the documented `ItShould{Expected}When{Scenario}` pattern.
   **Why it matters**: Minor convention drift; reduces naming consistency in the spec suite.
   **Suggested fix**: Rename to `ItShouldNeutralizeFormulaTriggerCharsWhenExportingCsv`.

### Observations (not issues, but worth noting)
1. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.cs`
   **Line(s)**: `364-400`
   **Issue**: None. `StartsWithFormulaTrigger` correctly closes the prior leading-whitespace/control-character bypass (`\t=...`, etc.) and composes correctly with existing CSV quoting.
   **Why it matters**: Security fix is effective for the bypass previously identified.
   **Suggested fix**: None.

2. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
   **Line(s)**: `190-278`
   **Issue**: None. New regression test exercises `=`, `+`, `-`, `@`, and `\t=` cases and validates sanitized CSV output.
   **Why it matters**: Protects against regressions on the formula-injection path.
   **Suggested fix**: None.

3. **File**: `apps/front/src/routes/authed/staff/audit-logs/list/parts/staff-audit-logs-table.tsx`, `apps/front/src/utils/format-time.ts`
   **Line(s)**: `31-35`, `1-3`
   **Issue**: None. Dayjs type usage in component is now routed through `format-time.ts`, removing direct `dayjs` import from the component.
   **Why it matters**: Aligns with frontend standards and keeps date-library wiring centralized.
   **Suggested fix**: None.

4. **Verification run**:
   - `dotnet test Tests/MainApi.IntegrationTests.csproj -c Test --filter "FullyQualifiedName~ExportAuditLogsSpec"` -> Passed `11/11`
   - `dotnet test Tests/MainApi.IntegrationTests.csproj -c Test --filter "FullyQualifiedName~GetAuditLogActionsSpec"` -> Passed `4/4`
   - `dotnet test Tests/MainApi.IntegrationTests.csproj -c Test --filter "FullyQualifiedName~AuditLogs"` -> Passed `33/33`
   - `make tsc-front` currently fails due pre-existing unrelated Zod typing errors in other frontend files (not caused by this delta).
