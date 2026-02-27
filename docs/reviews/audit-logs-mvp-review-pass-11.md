# Audit Logs MVP - Review Pass 11

### Critical (must fix before merge)
None.

### Important (should fix, creates tech debt if not)
None.

### Minor (nice to have, optional improvements)
None.

### Observations (not issues, but worth noting)
1. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
   **Line(s)**: `19-26`
   **Issue**: None. The `CollectionDefinition` + `DisableParallelization = true` wiring is correct and now actually enforces non-overlap with other test collections.
   **Why it matters**: This closes the remaining flakiness risk from singleton mutation in `SetExportMaxRows`.
   **Suggested fix**: None.

2. **File**: `apps/api/Tests/AssemblyInfo.cs`
   **Line(s)**: `3`
   **Issue**: None. Assembly parallelism (`MaxParallelThreads = 4`) is compatible with a collection-specific `DisableParallelization = true`; xUnit will serialize that collection while leaving others parallelizable outside that window.
   **Why it matters**: Confirms the fix works with current test runner settings.
   **Suggested fix**: None.

3. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
   **Line(s)**: `15-23`
   **Issue**: None. Co-locating the marker class in this spec file is acceptable for a single-consumer collection and keeps context local.
   **Why it matters**: No structural or lifecycle regressions introduced.
   **Suggested fix**: None.

4. **Validation**:
   - `dotnet test Tests/MainApi.IntegrationTests.csproj -c Test --filter "FullyQualifiedName~ExportAuditLogsSpec"` -> Passed `11/11`
   - `make tsc-front` still fails with pre-existing, unrelated Zod typing errors in auth/address/staff form files; no errors point to audit-log files changed in passes 10-11.

## Verdict
Merge-ready.
