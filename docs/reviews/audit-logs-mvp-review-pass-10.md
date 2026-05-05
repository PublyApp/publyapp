# Audit Logs MVP - Review Pass 10

### Critical (must fix before merge)
None.

### Important (should fix, creates tech debt if not)
1. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
   **Line(s)**: `15-20`
   **Issue**: `[Collection("AuditLogExport")]` alone does not prevent this class from running in parallel with other collections, so the reflection-based mutation of `AppEnvironment.Instance.AUDIT_LOG_EXPORT_MAX_ROWS` is still globally racy.
   **Why it matters**: The original flakiness risk remains if any other class hits export logic while this test temporarily overrides the singleton value.
   **Suggested fix**: Add a `CollectionDefinition` with `DisableParallelization = true` for this collection (or move this spec to a known non-parallel collection) so the override cannot overlap with tests outside the class.

### Minor (nice to have, optional improvements)
None.

### Observations (not issues, but worth noting)
1. **File**: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
   **Line(s)**: `1`, `109-124`, `319-321`
   **Issue**: None. `CachedActions` is now truly immutable at runtime via `ImmutableArray<string>` and no longer downcast-mutable.
   **Why it matters**: Closes the mutability hole from pass 9.
   **Suggested fix**: None.

2. **File**: `apps/api/Src/Modules/AuditLogs/Handlers/Staff/ExportAuditLogs.Spec.cs`
   **Line(s)**: `197`
   **Issue**: None. Method renamed to `ItShouldNeutralizeFormulaTriggerCharsWhenExportingCsv`, now compliant with `ItShould{Expected}When{Scenario}` naming.
   **Why it matters**: Test naming convention is now aligned.
   **Suggested fix**: None.

3. **File**: `apps/api/Src/Modules/AuditLogs/Services/AuditLogQueryService.cs`
   **Line(s)**: `319-321`
   **Issue**: Optional micro-optimization only: `Task.FromResult<IReadOnlyList<string>>(CachedActions)` creates a new completed `Task` per call.
   **Why it matters**: Negligible in this endpoint; not a correctness issue.
   **Suggested fix**: Optional static cached task if you want zero per-call allocations.

4. **Verification run**:
   - `dotnet test Tests/MainApi.IntegrationTests.csproj -c Test --filter "FullyQualifiedName~ExportAuditLogsSpec"` -> Passed `11/11`
