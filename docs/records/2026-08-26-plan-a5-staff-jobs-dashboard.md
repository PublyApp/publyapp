# A5 — Staff job-visibility dashboard (Lane #636) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Epic A delivery step 5 (closing #1454, part of #636 / #194): staff-only endpoints + UI over the existing jobs infrastructure — list and inspect `job_queue` runs, list and requeue the dead-letter queue, and list/enable/disable/trigger-now the `system_job_definitions` rows that drive the dashboard-configurable recurring system jobs. Every surface is staff-permission-gated, rate-limited, and emits audit rows for every mutation.

**Architecture:** The A5 slice is a read+limited-mutation layer on top of the existing jobs tables (`job_queue`, `dead_letter_jobs` → `job_dead_letter`, `system_job_definitions`, `system_job_occurrences`). It does not change the engine or its contract: the queue, lease, DLQ, and `SyncSystemJobsJob` reconcile stay exactly as they are. New code lives in three places:

- A new query service (`IJobQueueQueryService`, `IDeadLetterQueryService`, `ISystemJobDefinitionQueryService`) for the three cursor-paginated list endpoints — kept separate from the existing `JobDeadLetterService` because the query side and the mutation side have different consumers and different result shapes.
- A new mutation service for requeue + enable/disable + trigger-now, owning the only sanctioned writes to DLQ/system_job_definitions from the staff surface (the existing `JobDeadLetterService.ResolveUnclassifiedAsync` is the model: discriminated-union result, single-statement conditional updates, evidence event row, audit).
- New handlers + endpoints under `apps/api/Modules/Jobs/Handlers/Staff/` + `apps/api/Modules/Jobs/Endpoints/` (mirroring the K-1 layout in `ResolveDeadLetterUnclassifiedForStaff.cs:58-141` and `JobDeadLetterEndpointsForStaff.cs`).
- A new front `apps/front/src/routes/authed/staff/jobs.tsx` layout with three sibling pages (queue, dead-letter, system-jobs) and a per-run detail panel, all on the existing `DataTable` + cursor pagination + URL search-param patterns proven in `authed/staff/audit-logs.tsx` and `authed/staff/audit-logs/_list-search-params.ts`.

The trigger-now path calls the existing `EnqueueSystemJobJob.EnqueueOccurrenceAsync` (`apps/api/Infrastructure/Jobs/Quartz/EnqueueSystemJobJob.cs:69-147`) — the same one the cron trigger uses — so the staff-issued enqueue goes through the exact same fencing and ledger-row insert the scheduler does, instead of becoming a parallel write path.

**Tech stack:** .NET 10 minimal APIs, EF Core 10, xUnit + FluentAssertions + Testcontainers via `ApiFixture`, React 19 (TanStack Start, Base UI, Tailwind v4), TanStack Query + the auto-generated Kiota client, `react-i18next` with a new `staff-jobs` namespace.

## Global Constraints (from #636 / #194 / jobs-infra v4 / `AGENTS.md` "Transparent failure causes")

1. **Out of scope (per brief).** No tenant-facing views, no new job types, no engine changes, no schema changes. A5 reads + limited-mutates the existing tables; the engine's lease model, the `JobQueueProcessor`, the `SyncSystemJobsJob` reconcile, and the `SystemJobDisableProtection` K-3 privacy protection stay untouched.
2. **Staff-only surface.** Every new route is under `Routes.Staff.Root` and gated by `WithPermission([AppPermissions.Staff.Jobs.<VERB>])` exactly as `JobDeadLetterEndpointsForStaff.cs:26` does. No `.WithTenantPermission` here — staff scope only.
3. **Permissions are split per verb (no god-mode).** Four staff permissions, one per action: `staff.jobs.view` (list queue + DLQ + system jobs + read a run), `staff.jobs.requeue` (requeue one DLQ row), `staff.jobs.system_job_update` (enable/disable + edit cron on a system_job_definition), `staff.jobs.system_job_trigger` (trigger-now a system_job_definition). Cross-checked against `JobsPermissionsForStaff.cs:6-22` and `AppPermissions.cs:44` so the K-1 `RESOLVE` stays the model.
4. **Rate limiting.** Reads → `ApiRateLimitPolicies.HeavySearchList` (the policy `audit-logs` already uses). DLQ requeue + system-job enable/disable → `ApiRateLimitPolicies.AuthenticatedDefault`. System-job trigger-now → a new dedicated `SystemJobTrigger` policy (a real enqueue into `job_queue`; it must not share the general bucket). `staff.jobs.view` and the non-mutating triggers must never be a quieter bucket than `staff.audit-logs.view`. All four policies land in `ApiRateLimitPolicies` constants + `ApiRateLimitSettings` + `ApiRateLimitOptionsSetup` + env wiring (existing quartet) + `ComprehensiveRateLimiting.Spec` compile fix.
5. **Wire conventions.** camelCase JSON fields, snake_case query params, JSON `application/problem+json` errors via `TypedProblems.*`, `{Action}{Domain}Args` records for any 3+-param service method (Architecture guard at `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`). No route constraints on ID parameters (`apps/api/Lib/Architecture/RouteConstraintGuard.Spec.cs`) — `Guid.TryParse` in the handler, 404 for malformed ids.
6. **C# coding standards (PUBLY0001–0008):** no `!`, no `?? throw`, no `ToLowerInvariant()` for dispatch, cached `JsonElement` getters, no `Dto` suffix on wire types, handler entrypoint `Handle`, contract types are top-level siblings, handlers hold no `DbContext`, services depend on `DbContext` + infrastructure only, staff handlers MUST use the `*ForStaff*` service method variants (PUBLY0007).
7. **Audit.** New `AuditActions` constants: `job.dead_letter.requeued` (target = the new `job_queue.id`, details = source dead-letter id + job_type), `job.system_job.enabled` and `job.system_job.disabled` (target = `system_job_definitions.id`, details = job_key + prior value + new value), `job.system_job.cron_updated` (target = id, details = job_key + prior cron + new cron), `job.system_job.triggered` (target = id, details = job_key + new `job_queue.id` + schedule_epoch rotated). All five constants go into `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` next to the existing `JobDeadLetterTriageResolved` (line 86). The audit action whitelist is auto-discovered by `AuditActionsRegistry` (`AuditActionsRegistry.cs:12-26`), so the spec-extension task in `GetAuditLogActions.Spec` must re-pin.
8. **Transparent failure causes (owner product rule, 2026-08-22).** A `Failed` DLQ row carries its `last_error` in plain words — already true; the staff `GetById` endpoint must surface it unchanged (no truncation that loses cause, no reformatting that hides the actionable line). A `Conflict` 409 names the actual current state. A `NotFound` 404 distinguishes "no such id" from "id exists but is not your concern" (staff scope makes the latter impossible, so a single 404 is fine). Trigger-now must surface "system job is disabled" / "system job has no live schedule epoch" / "system job's cron failed to parse" as distinct typed results — never a generic 500.
9. **Privacy K-3 protection stays.** `SystemJobDisableProtection.IsDisableProtected(jobKey)` (`apps/api/Modules/Jobs/SystemJobDisableProtection.cs:30-32`) is the only authority on whether a disable attempt is honoured. A5's enable/disable handler MUST call it and return a 409 (`job-system-job-disable-protected`) listing the protected key — never a silent revert. Trigger-now on a disabled definition is fine (operator override); the reconcile will simply re-disable on the next 60s pass; that is documented in the handler spec.
10. **i18n parity.** New `apps/front/src/i18n/locales/en/staff-jobs.json` + `fr/staff-jobs.json`, EN+FR identical shape. Namespaces registered in `i18n.namespaces.ts` and asserted by `i18n.namespaces.test.ts`. The new namespace is listed under `staff-audit-logs.tsx` style `staticData.i18nNamespaces: ['staff-jobs']`.
11. **No hosted service added** (`AppRoleCompositionSpec` unaffected). `trigger-now` is a request/response endpoint — no new background work, no new Quartz trigger, no new NOTIFY channel.
12. **No disable comments, no `// TODO`, no `!` in production code, no `?? throw` in production code.** All enforced by the existing Roslyn analyzers.
13. **OpenAPI snake_case guard + Kiota:** `just build-api && just generate-client && pnpm --filter front typecheck` runs after every endpoint change. `[AsParameters]` query DTOs use CSV `string?` + parser methods for multi-value filters (jobs queue: status; jobs system-jobs: `is_enabled`) — see `apps/api/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs:17-48` for the established pattern.
14. **Migrations:** none required. A5 reads + limited-mutates the existing tables. If implementation proves otherwise, `just db-add JobsA5 && just db-migrate`.

## File Structure

**Create — API (handlers, services, endpoints, routes, tests)**

- `apps/api/Modules/Jobs/Services/JobQueueQueryService.cs` — read-only keyset list of `JobQueueItem` with status/job_name/tenant_id filters and one get-by-id. Result `JobQueueListItem` (id, job_type, status, priority, attempts, max_attempts, locked_by, locked_until, last_error redacted, next_attempt_at, created_at, updated_at, tenant_id, actor_user_id, correlation_id). `IJobQueueQueryService` interface, `[Service(ServiceLifetime.Scoped)]`.
- `apps/api/Modules/Jobs/Services/DeadLetterQueryService.cs` — read-only keyset list of `JobDeadLetter` with external_state_status/job_type/tenant_id filters, plus `GetByIdAsync` (full envelope) and `RequeueAsync` (mutation: single-statement conditional INSERT into `job_queue` mirroring the engine's lease contract, plus evidence event `JobDeadLetterEvents.Requeued` and audit). Result `DeadLetterListItem` (id, original_job_id, job_type, attempts, last_error, external_state_status, triaged_at, failed_at, tenant_id, has_payload — boolean, payload is **never** in the list). Get-by-id returns the full payload, but with `payload_redacted: true` for known sensitive job types (initial list: any `email.*` job_type — see `payload_redaction` policy below).
- `apps/api/Modules/Jobs/Services/SystemJobDefinitionQueryService.cs` — list + get-by-id (read), `UpdateEnabledAsync` (mutation), `UpdateCronAsync` (mutation, validates the new cron via the existing Quartz `CronExpression.IsValidExpression` from the engine's `SyncSystemJobsJob.cs`), `TriggerNowAsync` (mutation, calls `EnqueueSystemJobJob.EnqueueOccurrenceAsync`). `UpdateCronAsync` rotates the `schedule_epoch` so the next reconcile re-creates the live trigger — same pattern as the existing engine code at `SyncSystemJobsJob.cs:62+`.
- `apps/api/Modules/Jobs/Services/JobQueueQueryService.Spec.cs`, `DeadLetterQueryService.Spec.cs`, `SystemJobDefinitionQueryService.Spec.cs` — direct-service specs (no HTTP). Verify keyset ordering, filter combinations, requeue's conditional transition, cron rotation, trigger-now enqueue + ledger row, K-3 protected disable returns the typed result.
- `apps/api/Modules/Jobs/Handlers/Staff/FindJobQueueItemsForStaff.cs` — `GET /staff/jobs/queue` (keyset pagination; snake_case query: `status`, `job_type`, `tenant_id`, `cursor`, `size`, `sort_id`, `sort_order`).
- `apps/api/Modules/Jobs/Handlers/Staff/GetJobQueueItemForStaff.cs` — `GET /staff/jobs/queue/{id}` (one row, full envelope, no payload field — staff list page links to the DLQ row for payload inspection).
- `apps/api/Modules/Jobs/Handlers/Staff/FindDeadLettersForStaff.cs` — `GET /staff/jobs/dead-letter` (keyset pagination; snake_case query: `external_state_status`, `job_type`, `tenant_id`, `cursor`, `size`, `sort_id`, `sort_order`).
- `apps/api/Modules/Jobs/Handlers/Staff/GetDeadLetterForStaff.cs` — `GET /staff/jobs/dead-letter/{id}` (full envelope, `payload` field present but redacted per policy, `events` array of `JobDeadLetterEvent` rows for this id).
- `apps/api/Modules/Jobs/Handlers/Staff/RequeueDeadLetterForStaff.cs` — `POST /staff/jobs/dead-letter/{id}/requeue` (body: optional note ≤500 chars; returns 200 with `{job_id, message, key}` or 404/409 typed).
- `apps/api/Modules/Jobs/Handlers/Staff/FindSystemJobDefinitionsForStaff.cs` — `GET /staff/jobs/system-jobs` (keyset pagination; snake_case query: `is_enabled`, `cursor`, `size`, `sort_id`, `sort_order`).
- `apps/api/Modules/Jobs/Handlers/Staff/GetSystemJobDefinitionForStaff.cs` — `GET /staff/jobs/system-jobs/{id}` (full envelope + recent `system_job_occurrences` ledger rows: top 25 by `scheduled_fire_at` desc).
- `apps/api/Modules/Jobs/Handlers/Staff/UpdateSystemJobDefinitionEnabledForStaff.cs` — `PATCH /staff/jobs/system-jobs/{id}/enabled` (body `{is_enabled: bool}`; 409 on protected key).
- `apps/api/Modules/Jobs/Handlers/Staff/UpdateSystemJobDefinitionCronForStaff.cs` — `PATCH /staff/jobs/system-jobs/{id}/cron` (body `{cron_expression: string}`; 422 on parse failure; rotates `schedule_epoch`).
- `apps/api/Modules/Jobs/Handlers/Staff/TriggerSystemJobDefinitionForStaff.cs` — `POST /staff/jobs/system-jobs/{id}/trigger` (no body; 200 with `{job_id, scheduled_fire_at, schedule_epoch, message, key}`; 404/409 typed).
- `apps/api/Modules/Jobs/Handlers/Staff/*Spec.cs` — endpoint specs on `ApiFixture` for each handler (happy path + 404 + 403 unprivileged + 400 malformed + the per-handler typed failure).
- `apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.cs` — the `MapGroup` of all nine routes (mirror `JobDeadLetterEndpointsForStaff.cs:9-29`). Three groups, one per resource, so each gets its own `RequireRateLimiting` policy and its own `WithTags("Staff Jobs")`:
  - `MapJobQueueEndpointsForStaff` under `/jobs/queue` — `HeavySearchList`.
  - `MapJobDeadLetterEndpointsForStaff` under `/jobs/dead-letter` — `HeavySearchList` for reads, `AuthenticatedDefault` for `requeue`. The existing `JobDeadLetterEndpointsForStaff.cs` group is extended, not duplicated — the K-1 `resolve-unclassified` route stays in place, the new `requeue` route is added next to it.
  - `MapSystemJobDefinitionEndpointsForStaff` under `/jobs/system-jobs` — `HeavySearchList` for reads, `AuthenticatedDefault` for enable/disable + cron, **`SystemJobTrigger`** (new) for trigger-now.
- `apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.Spec.cs` — single integration spec verifying all nine routes are reachable on a real staff session and that an unprivileged staff account gets 403 on each.
- `apps/api/Modules/Jobs/Routes.Jobs.cs` — extend with the new sub-routes (read as a partial-class addition next to the existing K-1 constants at line 7-14). One nested class per resource: `Routes.Jobs.ForStaff.Queue`, `Routes.Jobs.ForStaff.DeadLetter` (the existing Root `/dead-letter` constant at line 8 is preserved), `Routes.Jobs.ForStaff.SystemJobs`.
- `apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs` — add the three new permissions (VIEW, REQUEUE, SYSTEM_JOB_UPDATE, SYSTEM_JOB_TRIGGER). Rename `RESOLVE` to `RESOLVE` still — do not rename, do not move, do not change its key string. The new permissions are additive: existing staff accounts with `staff.jobs.resolve` are NOT auto-granted the new keys (each is its own grant per the seeder convention).
- `apps/api/Modules/Jobs/Handlers/Staff/PayloadRedaction.cs` — single shared helper: `Redact(string jobType, string payloadJson) -> string` (replaces the `payload` value with `{"redacted":true,"reason":"..."}` for sensitive job types). Lives in the handlers folder next to its only consumer, not the service (the service returns the raw row; the handler is the redaction boundary).
- `apps/api/Modules/Jobs/Handlers/Staff/PayloadRedaction.Spec.cs` — unit spec for the policy table.

**Create — i18n + response keys**

- `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` — new keys: `job-queue-item-not-found`, `dead-letter-not-found` (already present, reuse), `dead-letter-requeue-success`, `dead-letter-requeue-conflict`, `system-job-definition-not-found`, `system-job-definition-trigger-success`, `system-job-cron-invalid`, `system-job-disable-protected`, `system-job-disabled-cannot-trigger` (the spec only — this is a soft warning, not a hard error; the operator can override and the reconcile will re-disable). The `dead-letter-not-unclassified` and `dead-letter-resolved-success` keys from K-1 are reused for the K-2 conflict surface where applicable.
- `apps/api/Localization/ResponseKeys.g.cs` — regenerated via `just generate-response-keys` (existing script).

**Create — Front**

- `apps/front/src/i18n/locales/en/staff-jobs.json` + `fr/staff-jobs.json` — page titles, table headers, status labels, action labels, empty/no-match copy, drawer copy. EN + FR identical shape; `i18n-key-coverage.test.ts` will assert parity.
- `apps/front/src/i18n/locales/en/staff-jobs.test.ts` + `fr/staff-jobs.test.ts` — minimal "loads without missing key" sanity.
- `apps/front/src/lib/i18n.namespaces.ts` — register `staff-jobs` (mirrors how `staff-audit-logs` is registered).
- `apps/front/src/lib/query/staff-jobs.ts` — TanStack Query hooks: `useStaffJobQueueQuery`, `useStaffJobQueueItemQuery`, `useStaffDeadLettersQuery`, `useStaffDeadLetterQuery`, `useStaffRequeueDeadLetterMutation`, `useStaffSystemJobDefinitionsQuery`, `useStaffSystemJobDefinitionQuery`, `useStaffUpdateSystemJobEnabledMutation`, `useStaffUpdateSystemJobCronMutation`, `useStaffTriggerSystemJobMutation`. Row types: `StaffJobQueueRow`, `StaffDeadLetterRow`, `StaffSystemJobDefinitionRow`. Mirrors the shape of `staff-audit-logs.ts:1-80`.
- `apps/front/src/lib/query/staff-jobs.test.ts` — minimal hook-level coverage (cursor reset, filter object shape, mutation invalidation scoping).
- `apps/front/src/routes/authed/staff/jobs.tsx` — staff layout under `/staff/jobs/*` with three sibling index pages (sub-routes are sibling route files: `authed/staff/jobs/queue.tsx`, `authed/staff/jobs/dead-letter.tsx`, `authed/staff/jobs/system-jobs.tsx` + per-run detail drawers handled inline as sheet-overlays). Mirrors the `authed/staff/dashboard.tsx` layout: `route('/staff/jobs', 'authed/staff/jobs.tsx', [index('.../queue.tsx'), route('/dead-letter', '.../dead-letter.tsx'), route('/system-jobs', '.../system-jobs.tsx')])`.
- `apps/front/src/routes/authed/staff/jobs/queue.tsx` — list page, DataTable, cursor pagination, filters (status, job_type, tenant_id), "Inspect" link opens a side drawer showing the row + last_error in plain words + a "View DLQ row" link when `attempts >= max_attempts`.
- `apps/front/src/routes/authed/staff/jobs/dead-letter.tsx` — list page, same shape, plus a "Requeue" action button per row (gated on `staff.jobs.requeue`), a side drawer for one row (full payload with redaction banner, evidence events list), and the requeue confirm dialog.
- `apps/front/src/routes/authed/staff/jobs/system-jobs.tsx` — list page, columns: job_key, cron_expression, is_enabled toggle (gated on `staff.jobs.system_job_update`), last_enqueued_at, "Trigger now" button (gated on `staff.jobs.system_job_trigger`), "Edit cron" inline form (gated on `staff.jobs.system_job_update`). Side drawer: one row + recent `system_job_occurrences` ledger.
- `apps/front/src/routes/authed/staff/jobs/_list-search-params.ts` — snake_case URL state (mirrors `_list-search-params.ts` of audit-logs verbatim style).
- `apps/front/src/routes/authed/staff/jobs/_columns.tsx` (queue), `_columns-dead-letter.tsx`, `_columns-system-jobs.tsx` — column definitions, per-row action wiring.
- `apps/front/src/routes/authed/staff/jobs/_redaction-banner.tsx` — the warning banner shown above any redacted payload (an `IconAlertTriangle` + a localized sentence "Sensitive payload hidden from staff view").
- `apps/front/src/routes/authed/staff/jobs/_system-job-edit-cron-drawer.tsx`, `_requeue-confirm.tsx` — mutation drawers.
- `apps/front/src/routes/authed/staff/jobs.test.tsx` + `_list-search-params.test.ts` + `_columns-*.test.tsx` — page-level smoke + URL-state round-trip + column sanity.
- `apps/front/src/routes.ts` — register `/staff/jobs` + three children. Update `routeTree.gen.ts` via the build (no manual edit).

**Modify**

- `apps/api/Lib/AppPermissions.cs:44` — `JobsPermissionsForStaff Jobs { get; } = new();` stays; the `JobsPermissionsForStaff` class itself grows four new permission properties (Task 1).
- `apps/api/Modules/AuditLogs/Entities/AuditLog.cs:86` — add the five new audit action constants (Task 2).
- `apps/api/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.Spec.cs` — extend the expected set with the five new keys (sorted position) so the registry auto-discovery spec stays green.
- `apps/api/Lib/RateLimiting/ApiRateLimitSettings.cs` — add `SystemJobTrigger` window record.
- `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` — add `SystemJobTrigger` const.
- `apps/api/Lib/RateLimiting/ApiRateLimiterStore.cs` — register the new policy.
- `apps/api/Lib/RateLimiting/ApiRateLimitOptionsSetup.cs` — partition the new policy (session-fingerprint keyed, like the others).
- `apps/api/Lib/RateLimiting/ComprehensiveRateLimiting.Spec.cs` — extend the settings construction sites (compile-level fix + one assertion if the spec enumerates policies).
- `apps/api/Lib/AppEnvironment.cs` — `SYSTEM_JOB_TRIGGER_RATE_LIMIT_PERMIT_LIMIT` (default 30) and `SYSTEM_JOB_TRIGGER_RATE_LIMIT_WINDOW_SECONDS` (default 60) with FluentValidation bounds.
- `apps/api/Lib/ServiceRegistration.cs` — register the three new query services + the trigger-now consumer (`IEnqueueSystemJobBoundary` is a tiny new seam in `Infrastructure/Jobs/` so the service depends on infrastructure, not on the Quartz `IJob` directly — see the seam below).
- `apps/api/Infrastructure/Jobs/IEnqueueSystemJobBoundary.cs` — new seam: `Task<EnqueueSystemJobBoundaryResult> EnqueueNowAsync(string jobKey, CancellationToken ct)`. Wraps `EnqueueSystemJobJob.EnqueueOccurrenceAsync` with `scheduled_fire_at = DateTime.UtcNow` and the definition's CURRENT `schedule_epoch` (read with `FOR UPDATE`, NOT rotated). The boundary depends on `AppDbContext` + the engine's `EnqueueSystemJobJob`; the service depends on the boundary (which is in `Infrastructure/`, allowed by the `ServiceDependencyBoundaryGuard`). Rotation is reserved for `UpdateCronAsync` (Task 6) because the cron changed and the live trigger must be replaced — a staff trigger-now is firing under the existing schedule, not replacing it.
- `apps/api/Infrastructure/Jobs/EnqueueSystemJobBoundary.cs` — the implementation.
- `apps/api/Infrastructure/Jobs/EnqueueSystemJobBoundary.Spec.cs` — fence-conditioned single-statement test: trigger-now a non-existent key → 0 ledger rows + 0 queue rows; trigger-now a disabled key → 0 rows (because the engine's `EnqueueOccurrenceAsync` checks `is_enabled` at `EnqueueSystemJobJob.cs:84-87`); trigger-now a real key → exactly 1 ledger + 1 queue + definition's `last_enqueued_at` updated.
- `apps/front/src/routes.ts` — register the new `/staff/jobs` subtree (Task 9).
- `apps/front/src/lib/i18n.namespaces.ts` — register `staff-jobs` (Task 9).

---

## Task 1: Jobs permissions slice (VIEW, REQUEUE, SYSTEM_JOB_UPDATE, SYSTEM_JOB_TRIGGER)

**Files:** Modify `apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs`; Modify `apps/api/Modules/AuditLogs/Handlers/Staff/GetAuditLogActions.Spec.cs` if it enumerates by key prefix (it does NOT — it asserts against the registry, so the new keys flow through automatically once the constants exist).

- [ ] **Step 1: Write the failing registry assertion.** Add to `apps/api/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs` (or a new test class) an assertion that `AuditActionsRegistry.All` contains the four new keys. The new keys are not yet defined, so the test compiles-fails (or runtime-fails if the strings are missing).

```csharp
[Fact]
public void ItShouldExposeTheJobsA5AuditActions() {
    Assert.Contains("job.dead_letter.requeued", AuditActionsRegistry.All);
    Assert.Contains("job.system_job.enabled", AuditActionsRegistry.All);
    Assert.Contains("job.system_job.disabled", AuditActionsRegistry.All);
    Assert.Contains("job.system_job.cron_updated", AuditActionsRegistry.All);
    Assert.Contains("job.system_job.triggered", AuditActionsRegistry.All);
}
```

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AuditActionsRegistry" -v normal`
Expected: FAIL (5 unresolved name errors or 5 missing-constant errors). RED.

- [ ] **Step 2: Add the five audit-action constants.** Modify `apps/api/Modules/AuditLogs/Entities/AuditLog.cs:86` (one line below `JobDeadLetterTriageResolved`):

```csharp
// A5 (#636): DLQ requeue + system_job_definitions dashboard mutations.
public const string JobDeadLetterRequeued = "job.dead_letter.requeued";
public const string JobSystemJobEnabled = "job.system_job.enabled";
public const string JobSystemJobDisabled = "job.system_job.disabled";
public const string JobSystemJobCronUpdated = "job.system_job.cron_updated";
public const string JobSystemJobTriggered = "job.system_job.triggered";
```

Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AuditActionsRegistry"` → green.

- [ ] **Step 3: Implement the four new permission properties in `JobsPermissionsForStaff`.** Add to `apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs:6-22`, keeping `RESOLVE` exactly as it is:

```csharp
public Permission VIEW { get; }
public Permission REQUEUE { get; }
public Permission SYSTEM_JOB_UPDATE { get; }
public Permission SYSTEM_JOB_TRIGGER { get; }

public JobsPermissionsForStaff() {
    // existing RESOLVE block stays
    RESOLVE = Permission
        .CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "resolve" }))
        .SetTranslation(SupportedLanguage.English, new PermissionTranslation {
            Name = "Resolve dead-letter triage",
            Description = "Resolve the external-state triage of a dead-lettered job"
        })
        .SetTranslation(SupportedLanguage.French, new PermissionTranslation {
            Name = "Resoudre le triage des jobs echoues",
            Description = "Resoudre le triage d'etat externe d'un job arrive en dead-letter"
        });

    VIEW = Permission
        .CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" }))
        .SetTranslation(SupportedLanguage.English, new PermissionTranslation {
            Name = "View jobs dashboard",
            Description = "List job queue runs, dead-letter rows, and system job definitions"
        })
        .SetTranslation(SupportedLanguage.French, new PermissionTranslation {
            Name = "Voir le tableau de bord des jobs",
            Description = "Lister les executions de la file, les entrees dead-letter, et les jobs systeme"
        });

    REQUEUE = Permission
        .CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "requeue" }))
        .SetTranslation(SupportedLanguage.English, new PermissionTranslation {
            Name = "Requeue dead-lettered job",
            Description = "Requeue a dead-lettered job back into job_queue with its original envelope"
        })
        .SetTranslation(SupportedLanguage.French, new PermissionTranslation {
            Name = "Remettre en file un job dead-letter",
            Description = "Remettre en file un job dead-letter avec son enveloppe d'origine"
        });

    SYSTEM_JOB_UPDATE = Permission
        .CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "system_job_update" }))
        .SetTranslation(SupportedLanguage.English, new PermissionTranslation {
            Name = "Update system job definition",
            Description = "Enable, disable, or change the cron of a system_job_definition row"
        })
        .SetTranslation(SupportedLanguage.French, new PermissionTranslation {
            Name = "Mettre a jour une definition de job systeme",
            Description = "Activer, desactiver, ou modifier la cron d'une ligne system_job_definition"
        });

    SYSTEM_JOB_TRIGGER = Permission
        .CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "system_job_trigger" }))
        .SetTranslation(SupportedLanguage.English, new PermissionTranslation {
            Name = "Trigger a system job now",
            Description = "Enqueue a system_job_definition's handler into job_queue outside its cron"
        })
        .SetTranslation(SupportedLanguage.French, new PermissionTranslation {
            Name = "Declencher un job systeme maintenant",
            Description = "Mettre en file le handler d'une system_job_definition hors de sa cron"
        });
}
```

Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffPermissions"` → green. The existing `FindStaffPermissions` spec enumerates the registered staff permission keys (read it before writing; the four new `staff.jobs.{view,requeue,system_job_update,system_job_trigger}` keys land in their sorted positions). If the spec does not enumerate by key, add a one-line `Assert.Contains("staff.jobs.system_job_trigger", PermissionSeed.AllKeys)` style assertion.

- [ ] **Step 3.5: Add `JobDeadLetterEvents.Requeued` constant.** Modify `apps/api/Modules/Jobs/Entities/JobDeadLetterEvents.cs` (the existing K-1 class) by adding `public const string Requeued = "requeued";`. The `DeadLetterQueryService.RequeueAsync` (Task 5) is the only writer; the constant exists so future readers and audits can grep for it instead of magic strings. No new spec required — `DeadLetterResolutionCatalog.Spec.cs` enumerates the resolution-catalog strings; if it asserts on the full set, add `Requeued` to the expected list, else do nothing. Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~DeadLetterResolutionCatalog"` → green.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs \
        apps/api/Modules/AuditLogs/Entities/AuditLog.cs \
        apps/api/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs
git commit -m "feat(jobs): A5 staff jobs dashboard permissions + audit actions (#636)"
```

## Task 2: Rate-limit policy `SystemJobTrigger` (env, settings, store, options, spec)

**Files:** Modify `apps/api/Lib/RateLimiting/*` (the existing quartet) + `apps/api/Lib/AppEnvironment.cs` + `apps/api/Lib/RateLimiting/ComprehensiveRateLimiting.Spec.cs`.

- [ ] **Step 1: Add env vars to `AppEnvironment.cs`.** Mirror the existing `SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT` pair exactly. Default 30 permits / 60 s window — a trigger is a real enqueue, so it should be per-minute, not per-hour. FluentValidation bounds: `1 <= permit_limit <= 1000`, `1 <= window_seconds <= 3600`.

- [ ] **Step 2: Extend `ApiRateLimitSettings.cs` + `ApiRateLimitPolicies.cs`.** Add `SystemJobTrigger` window record (mirror `SocialConnect` verbatim shape). Add the constant to `ApiRateLimitPolicies`. Add the store entry in `ApiRateLimiterStore.cs` (partitioned by session fingerprint, like the others). Add the `ApiRateLimitOptionsSetup.cs` partition line.

- [ ] **Step 3: Failing compile-fix spec.** Run `ComprehensiveRateLimiting.Spec`; it will fail to compile because the new window is required by the `ApiRateLimitSettings` constructor. Update the construction sites in the spec to pass the new argument. Run again → green.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Lib/RateLimiting apps/api/Lib/AppEnvironment.cs
git commit -m "feat(jobs): A5 SystemJobTrigger rate-limit policy (#636)"
```

## Task 3: `IEnqueueSystemJobBoundary` (infrastructure seam) + spec

**Files:** Create `apps/api/Infrastructure/Jobs/IEnqueueSystemJobBoundary.cs`, `EnqueueSystemJobBoundary.cs`, `EnqueueSystemJobBoundary.Spec.cs`.

- [ ] **Step 1: Write the failing boundary spec.** Three cases:

```csharp
[Fact]
public async Task ItShouldEnqueueOneQueueRowAndOneLedgerRowForAnEnabledKey() {
    // seed a system_job_definition, call EnqueueNowAsync, assert 1 ledger + 1 queue + last_enqueued_at updated
}

[Fact]
public async Task ItShouldEnqueueNothingForADisabledKey() {
    // seed a system_job_definition with is_enabled=false, call EnqueueNowAsync, assert 0 rows in both
}

[Fact]
public async Task ItShouldEnqueueNothingForAnUnknownKey() {
    // call with a key that has no row, assert 0 rows in both
}
```

Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~EnqueueSystemJobBoundary"` → red (the interface does not exist).

- [ ] **Step 2: Implement the interface and class.** The implementation:

1. Begin a transaction.
2. `SELECT ... FOR UPDATE` the definition row by `job_key` (`is_deleted = false`); zero rows → return `BoundaryResult.NotFound`.
3. Insert into `system_job_occurrences` (`job_key`, `scheduled_fire_at = now()`); if 0 rows (rare — would only happen with a duplicate `scheduled_fire_at` at the same nanosecond), return `BoundaryResult.NoOp` (typed result so the handler can surface a 200 with a `noop` key rather than a 500).
4. Construct `JobQueueItem { JobType = jobKey }`, save changes to assign the id.
5. `UPDATE system_job_occurrences SET enqueued_job_id = ...` + `UPDATE system_job_definitions SET last_enqueued_at = now()`.
6. Commit.
7. Return `BoundaryResult.Enqueued(jobId, scheduledFireAt, scheduleEpoch)`.

The `schedule_epoch` is NOT rotated here — the existing live trigger's `schedule_epoch` is still valid; the boundary just inserts an extra occurrence with `scheduled_fire_at = now()`. Rotation only happens on `cron_updated` (Task 7). Document this in a class-level XML comment.

- [ ] **Step 3: Run the spec → green.** Run the architecture guards: `EndpointPermissionMetadataGuard`, `RouteConstraintGuard`, `ServiceArgsRecordConvention` (the boundary's single `EnqueueNowAsync(string jobKey, CancellationToken ct)` is two params — no args record needed). All green. Commit.

```bash
git add apps/api/Infrastructure/Jobs
git commit -m "feat(jobs): A5 EnqueueSystemJobBoundary seam for staff trigger-now (#636)"
```

## Task 4: `JobQueueQueryService` + spec

**Files:** Create `apps/api/Modules/Jobs/Services/JobQueueQueryService.cs`, `JobQueueQueryService.Spec.cs`.

- [ ] **Step 1: Write the failing service spec.** Cases (direct service against fixture DB):

```csharp
[Fact]
public async Task ItShouldListQueueItemsInCreatedAtDescOrder() { ... }

[Fact]
public async Task ItShouldFilterByStatusCsv() { ... }

[Fact]
public async Task ItShouldFilterByJobTypeAndTenantId() { ... }

[Fact]
public async Task ItShouldKeysetPaginateOnCreatedAt() { ... }

[Fact]
public async Task ItShouldGetOneById() { ... }

[Fact]
public async Task ItShouldReturnNotFoundForUnknownId() { ... }
```

Run: red.

- [ ] **Step 2: Implement `IJobQueueQueryService` + class.** Cursor pagination on `(CreatedAt DESC, Id DESC)`. Filter validation is in the validator (Task 5); the service trusts its `FindJobQueueItemsArgs`. Get-by-id is a single `AsNoTracking` select returning a `JobQueueItemDetail` (adds nothing to the row — same column set; the front end just renders a different page).

- [ ] **Step 3: Run → green.** Commit.

```bash
git add apps/api/Modules/Jobs/Services/JobQueueQueryService.cs \
        apps/api/Modules/Jobs/Services/JobQueueQueryService.Spec.cs
git commit -m "feat(jobs): A5 JobQueueQueryService (list + get) (#636)"
```

## Task 5: `DeadLetterQueryService` + spec (read + requeue)

**Files:** Create `apps/api/Modules/Jobs/Services/DeadLetterQueryService.cs`, `DeadLetterQueryService.Spec.cs`.

- [ ] **Step 1: Write the failing service spec.** Cases:

```csharp
[Fact]
public async Task ItShouldListDeadLetterRowsInFailedAtDescOrder() { ... }

[Fact]
public async Task ItShouldFilterByExternalStateStatusCsv() { ... } // K-1 used the int directly; A5 reuses the int codes 0..6

[Fact]
public async Task ItShouldFilterByJobTypeAndTenantId() { ... }

[Fact]
public async Task ItShouldKeysetPaginateOnFailedAt() { ... }

[Fact]
public async Task ItShouldGetOneByIdWithEvents() { ... }

[Fact]
public async Task ItShouldReturnNotFoundForUnknownId() { ... }

[Fact]
public async Task ItShouldRequeueAnExistingRowInsertingOneJobQueueRowAndOneEvent() { ... }

[Fact]
public async Task ItShouldLoseTheRequeueRaceCleanlyOnDoubleRequeue() { ... } // 2nd requeue of same DLQ id returns AlreadyRequeued
```

Run: red.

- [ ] **Step 2: Implement the service.** The requeue path runs inside a single transaction:

1. `SELECT id, job_type, payload, priority, max_attempts, idempotency_key, tenant_id, actor_user_id, correlation_id, requeued_from_dead_letter_id, external_state_status, triaged_at FROM job_dead_letter WHERE id = $1 FOR UPDATE`; zero rows → `Result.NotFound`. The `FOR UPDATE` lock prevents two concurrent requeues from racing past the conditional check in step 2.
2. Conditional UPDATE: `UPDATE job_dead_letter SET requeued_as_job_id = $newJobId, requeued_at = now() WHERE id = $1 AND requeued_as_job_id IS NULL RETURNING id`. Zero rows affected → `Result.AlreadyRequeued` (a concurrent resolver won; the handler maps this to 409). The `requeued_as_job_id IS NULL` predicate is the race guard — once a row has been requeued, the column is non-null and any later attempt returns zero affected rows.
3. `INSERT INTO job_queue (job_type, payload, priority, max_attempts, idempotency_key, tenant_id, actor_user_id, correlation_id, requeued_from_dead_letter_id) VALUES (...)` with the dead-letter's envelope. The `requeued_from_dead_letter_id` column on `job_queue` already exists per the K-1 design at `JobQueueItem.cs:97-103` — A5 writes the first requeue through it, no migration needed.
4. `INSERT INTO job_dead_letter_events (dead_letter_id, event, detected_by, prior_status, new_status, details) VALUES ($1, 'requeued', 'operator', <prior external_state_status>, <prior external_state_status>, '{"note": "...", "new_job_id": "..."}')`. The `event` value is a new constant on `JobDeadLetterEvents` (Task 1.5, sibling edit): add `public const string Requeued = "requeued";` to the existing `JobDeadLetterEvents` class at `apps/api/Modules/Jobs/Entities/JobDeadLetterEvents.cs`.
5. Commit.
6. Return `Result.Requeued(newJobId, originalJobId)`.

The audit call is the handler's job (Task 7), not the service's — same separation as `JobDeadLetterService.ResolveUnclassifiedAsync` (`JobDeadLetterService.cs:48-49`: "Domain service for job_dead_letter triage" — owns the DB transition, not the audit log).

- [ ] **Step 3: Run → green.** Commit.

```bash
git add apps/api/Modules/Jobs/Services/DeadLetterQueryService.cs \
        apps/api/Modules/Jobs/Services/DeadLetterQueryService.Spec.cs
git commit -m "feat(jobs): A5 DeadLetterQueryService (list + get + requeue) (#636)"
```

## Task 6: `SystemJobDefinitionQueryService` + spec

**Files:** Create `apps/api/Modules/Jobs/Services/SystemJobDefinitionQueryService.cs`, `SystemJobDefinitionQueryService.Spec.cs`.

- [ ] **Step 1: Write the failing service spec.** Cases:

```csharp
[Fact]
public async Task ItShouldListEnabledAndDisabledDefinitions() { ... }

[Fact]
public async Task ItShouldFilterByIsEnabled() { ... } // bool? — null = both

[Fact]
public async Task ItShouldGetOneByIdWithRecentOccurrences() { ... }

[Fact]
public async Task ItShouldReturnNotFoundForUnknownId() { ... }

[Fact]
public async Task ItShouldEnableADisabledDefinition() { ... }

[Fact]
public async Task ItShouldRefuseToDisableAProtectedKey() { ... } // K-3: SystemJobDisableProtection.IsDisableProtected == true → typed ProtectedKey

[Fact]
public async Task ItShouldDisableAnUnprotectedKey() { ... }

[Fact]
public async Task ItShouldUpdateCronRotatingTheScheduleEpoch() { ... }

[Fact]
public async Task ItShouldRefuseAnInvalidCronExpression() { ... } // returns typed InvalidCron with the reason

[Fact]
public async Task ItShouldTriggerNowEnqueuingOneQueueRow() { ... } // delegates to IEnqueueSystemJobBoundary
```

Run: red.

- [ ] **Step 2: Implement the service.** All four mutations use a single-statement conditional UPDATE pattern (mirror the engine's `EnqueueSystemJobJob.cs:100-107` style). The cron validation uses `Quartz.CronExpression.IsValidExpression(newCron)` — the same library the engine already trusts. The schedule_epoch rotation is `gen_random_uuid()` (the column default at `SystemJobDefinitionConfiguration.cs:14`); on update, the service sets it explicitly to a new `Guid.NewGuid()` so the next reconcile (`SyncSystemJobsJob`) sees a fresh epoch and re-creates the live trigger with the new cron.

- [ ] **Step 3: Run → green.** Commit.

```bash
git add apps/api/Modules/Jobs/Services/SystemJobDefinitionQueryService.cs \
        apps/api/Modules/Jobs/Services/SystemJobDefinitionQueryService.Spec.cs
git commit -m "feat(jobs): A5 SystemJobDefinitionQueryService (list + get + update + trigger) (#636)"
```

## Task 7: Routes, endpoints, handlers, validators, i18n keys

**Files:** Modify `apps/api/Modules/Jobs/Routes.Jobs.cs`; Create `apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.cs` + the ten handlers (4 list+get, 1 mutation requeue, 1 list+get, 3 system-job mutations, 1 trigger) and their co-located `*Spec.cs` files; Modify `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json`; run `just generate-response-keys`; Modify `apps/api/Modules/Jobs/Handlers/Staff/PayloadRedaction.cs` + `PayloadRedaction.Spec.cs`.

### 7a. Route constants

Append to `apps/api/Modules/Jobs/Routes.Jobs.cs:7-14`:

```csharp
public static class Queue {
    public const string Root = "/queue";
    public const string GetById = "/{queueItemId}";
    public static string GetByIdFn(string queueItemId) => $"/{queueItemId}";
}

public static class DeadLetter {
    // existing Root is "/dead-letter" at line 8 — keep it
    public const string GetById = "/{deadLetterId}";
    public static string GetByIdFn(string deadLetterId) => $"/{deadLetterId}";
    public const string Requeue = "/{deadLetterId}/requeue";
    public static string RequeueFn(string deadLetterId) => $"/{deadLetterId}/requeue";
    // existing ResolveUnclassified stays
}

public static class SystemJobs {
    public const string Root = "/system-jobs";
    public const string GetById = "/{systemJobId}";
    public static string GetByIdFn(string systemJobId) => $"/{systemJobId}";
    public const string UpdateEnabled = "/{systemJobId}/enabled";
    public const string UpdateCron = "/{systemJobId}/cron";
    public const string Trigger = "/{systemJobId}/trigger";
}
```

### 7b. Endpoint group

Create `apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.cs` with three groups. Extend the existing `JobDeadLetterEndpointsForStaff.cs` group to include the new `Requeue` route (do NOT create a second `MapGroup` for the same `/dead-letter` path — that would clash).

```csharp
public static class JobVisibilityEndpointsForStaff {
    public static IEndpointRouteBuilder MapJobVisibilityEndpointsForStaff(
        this IEndpointRouteBuilder routes
    ) {
        // /staff/jobs/queue — reads only, heavy-search list
        var queueGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.Root, Routes.Jobs.ForStaff.Queue.Root)
        )
            .RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
            .WithTags("Staff Jobs");

        queueGroup.MapGet(Routes.Jobs.ForStaff.Queue.GetById, FindJobQueueItemsForStaff.GetById)
            .WithName("StaffJobQueueGetById")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        queueGroup.MapGet("/", FindJobQueueItemsForStaff.Handle)
            .WithName("StaffJobQueueFind")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        // /staff/jobs/system-jobs — reads, updates, trigger
        var sysGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.Root, Routes.Jobs.ForStaff.SystemJobs.Root)
        )
            .RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
            .WithTags("Staff Jobs");

        sysGroup.MapGet(Routes.Jobs.ForStaff.SystemJobs.GetById, FindSystemJobDefinitionsForStaff.GetById)
            .WithName("StaffSystemJobDefinitionGetById")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        sysGroup.MapGet("/", FindSystemJobDefinitionsForStaff.Handle)
            .WithName("StaffSystemJobDefinitionFind")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        var sysMutationGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.Root, Routes.Jobs.ForStaff.SystemJobs.Root)
        )
            .RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
            .WithTags("Staff Jobs");

        sysMutationGroup.MapPatch(Routes.Jobs.ForStaff.SystemJobs.UpdateEnabled, UpdateSystemJobDefinitionEnabledForStaff.Handle)
            .WithName("StaffSystemJobDefinitionUpdateEnabled")
            .WithReqBodyValidation<UpdateSystemJobDefinitionEnabledForStaffBody>()
            .WithPermission([AppPermissions.Staff.Jobs.SYSTEM_JOB_UPDATE]);

        sysMutationGroup.MapPatch(Routes.Jobs.ForStaff.SystemJobs.UpdateCron, UpdateSystemJobDefinitionCronForStaff.Handle)
            .WithName("StaffSystemJobDefinitionUpdateCron")
            .WithReqBodyValidation<UpdateSystemJobDefinitionCronForStaffBody>()
            .WithPermission([AppPermissions.Staff.Jobs.SYSTEM_JOB_UPDATE]);

        // Trigger is its own rate-limit bucket — it produces real job_queue work.
        var triggerGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.Root, Routes.Jobs.ForStaff.SystemJobs.Root)
        )
            .RequireRateLimiting(ApiRateLimitPolicies.SystemJobTrigger)
            .WithTags("Staff Jobs");

        triggerGroup.MapPost(Routes.Jobs.ForStaff.SystemJobs.Trigger, TriggerSystemJobDefinitionForStaff.Handle)
            .WithName("StaffSystemJobDefinitionTrigger")
            .WithPermission([AppPermissions.Staff.Jobs.SYSTEM_JOB_TRIGGER]);

        return routes;
    }
}
```

Extend the existing `JobDeadLetterEndpointsForStaff.cs` by adding the requeue route to its `group`:

```csharp
group.MapPost(Routes.Jobs.ForStaff.DeadLetter.Requeue, RequeueDeadLetterForStaff.Handle)
    .WithName("RequeueDeadLetter")
    .WithSummary("Requeue a dead-lettered job back into job_queue")
    .WithReqBodyValidation<RequeueDeadLetterForStaffBody>()
    .WithPermission([AppPermissions.Staff.Jobs.REQUEUE]);
```

### 7c. Handlers

For each of the ten handlers, follow the K-1 template (`ResolveDeadLetterUnclassifiedForStaff.cs:58-141`) exactly:

- Body / Query / Result / Response / Item types are top-level siblings in the handler file (never nested).
- `Handle` is the entrypoint.
- `Guid.TryParse` for every `{id}` parameter; malformed → 404 (`ResponseKeys.DeadLetterNotFound` reuse is fine — the brief asks for "no such id", and a single 404 is consistent).
- `authContext.AccountStaff` null-check (mirror lines 81-88).
- Service result → `TypedProblems.*` mapping, with the actual current state in the 409 detail (mirror lines 101-115).
- Audit call in the handler (mirror lines 119-132).
- 200 response carries `Message` + `Key` (the transparent-failure rule).

Wire contracts (each row = one `Handle` method's response shape):

| Handler | Verb | Success body | Failure shapes |
|---|---|---|---|
| `FindJobQueueItemsForStaff.Handle` | `GET /queue` | `200 FindJobQueueItemsResponse : CursorPaginatedResult<JobQueueListItem>` | `400` bad cursor / sort_id |
| `FindJobQueueItemsForStaff.GetById` | `GET /queue/{id}` | `200 JobQueueItemDetail` | `404` |
| `FindDeadLettersForStaff.Handle` | `GET /dead-letter` | `200 FindDeadLettersResponse : CursorPaginatedResult<DeadLetterListItem>` | `400` |
| `FindDeadLettersForStaff.GetById` | `GET /dead-letter/{id}` | `200 DeadLetterDetail { ..., payload: string \| { redacted: true, reason: string }, events: JobDeadLetterEvent[] }` | `404` |
| `RequeueDeadLetterForStaff.Handle` | `POST /dead-letter/{id}/requeue` | `200 DeadLetterRequeuedResponse { job_id, message, key }` | `404`, `409` already-requeued |
| `FindSystemJobDefinitionsForStaff.Handle` | `GET /system-jobs` | `200 FindSystemJobDefinitionsResponse : CursorPaginatedResult<SystemJobDefinitionListItem>` | `400` |
| `FindSystemJobDefinitionsForStaff.GetById` | `GET /system-jobs/{id}` | `200 SystemJobDefinitionDetail { ..., recent_occurrences: SystemJobOccurrence[] }` | `404` |
| `UpdateSystemJobDefinitionEnabledForStaff.Handle` | `PATCH /system-jobs/{id}/enabled` | `200 SystemJobDefinitionUpdatedResponse { id, is_enabled, message, key }` | `404`, `409` protected-key |
| `UpdateSystemJobDefinitionCronForStaff.Handle` | `PATCH /system-jobs/{id}/cron` | `200 SystemJobDefinitionUpdatedResponse { id, cron_expression, schedule_epoch, message, key }` | `404`, `422` invalid cron |
| `TriggerSystemJobDefinitionForStaff.Handle` | `POST /system-jobs/{id}/trigger` | `200 SystemJobTriggeredResponse { job_id, scheduled_fire_at, schedule_epoch, message, key }` | `404` |

### 7d. Validators

For each query that takes CSV filters (`status`, `external_state_status`, `job_type`):

- `status`: a single `JobQueueStatus` enum value (Pending=0, Processing=1); CSV allowed; validator whitelists the names — same shape as `FindStaffInvitationsQueryValidator.cs:68-84`.
- `external_state_status`: CSV of ints 0..6 (the `ExternalStateStatus` enum from K-1).
- `job_type`: free text (truncated to 200 chars to bound the WHERE clause).
- `tenant_id`: nullable guid (mirror `FindAuditLogsQuery.GetUserId()` shape at `FindAuditLogs.cs:35-39`).
- `is_enabled`: nullable bool.

### 7e. i18n keys

Add to both `response-message.en.json` and `.fr.json`:

```json
{
  "job-queue-item-not-found": "Job queue item not found",
  "dead-letter-requeue-success": "Dead-letter job requeued",
  "dead-letter-requeue-conflict": "Dead-letter job has already been requeued",
  "system-job-definition-not-found": "System job definition not found",
  "system-job-definition-update-success": "System job definition updated",
  "system-job-cron-invalid": "Cron expression is invalid",
  "system-job-disable-protected": "This system job cannot be disabled because its retention cadence is a privacy control",
  "system-job-trigger-success": "System job enqueued",
  "system-job-trigger-noop": "System job is disabled and was not enqueued"
}
```

Run `just generate-response-keys`; the new `TranslationKey` properties land in `ResponseKeys.g.cs`. The `publy/no-manual-response-message-translation` lint rule on the front (per AGENTS.md) will check the corresponding i18n resources; that test runs in `pnpm --filter front test`.

### 7f. `PayloadRedaction`

The redactor is a small static class. The "sensitive job type" set for v1 is `email.*` (any job_type starting with `email.`) plus any job_type explicitly listed in a `SensitiveJobTypes` set the handler reads from config. For now: just the prefix match, with a `Set<string>{"email."}` constant. The front banner is a localized sentence.

- [ ] **Step 1: Write the failing payload-redaction spec** (`PayloadRedactionSpec.cs`): `email.foo` → payload replaced; `socialaccount.foo` → payload returned unchanged; `null/empty` payload → empty string returned.

- [ ] **Step 2: Implement `PayloadRedaction.Redact`.** Three test cases.

- [ ] **Step 3: Commit each layer:**

```bash
git commit -m "feat(jobs): A5 Routes + Endpoints + Requeue + payload redaction (#636)"
git commit -m "feat(jobs): A5 handlers + i18n + redaction policy (#636)"
```

(Per-implementation commits per layer; not one mega-commit.)

## Task 8: Endpoint integration specs (one per handler + the 9-route group spec)

**Files:** Create one `*.Spec.cs` per handler in `apps/api/Modules/Jobs/Handlers/Staff/` + `JobVisibilityEndpointsForStaff.Spec.cs` + `SystemJobTriggerRateLimit.Spec.cs`.

- [ ] **Step 1: One spec per handler, all on `ApiFixture`.** Mirror `ResolveDeadLetterUnclassifiedForStaffSpec.cs:31-438`: tests the happy path (200 with the expected body shape), 404 unknown id, 404 malformed id, 403 unprivileged staff, 409 conflict per handler, and the audit row for mutations. Use `TestAuthClient.LoginAsStaffAdminAsync()` for the happy path; create an unprivileged staff user via the same `CreateUnprivilegedStaffUserAsync` helper (copy from `ResolveDeadLetterUnclassifiedForStaffSpec.cs:345-371`).

- [ ] **Step 2: `JobVisibilityEndpointsForStaff.Spec.cs`** — the 9-route reachability spec. Login as staff admin, GET each of the 9 routes with a known seeded definition → 200 for reads, 200 for the trigger (one row inserted), PATCH cron + PATCH enabled each → 200, POST requeue → 200. Then an unprivileged staff user, walk all 9 → 403.

- [ ] **Step 3: `SystemJobTriggerRateLimit.Spec.cs`** — the rate-limit test: 31st trigger within 60s on the same session → 429 (the policy default is 30 / 60s, so the 31st must be refused). Use the existing `ComprehensiveRateLimiting.Spec` style for partitioning by session fingerprint.

- [ ] **Step 4: Run `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test` → all green. Commit.**

```bash
git add apps/api/Modules/Jobs/Handlers/Staff
git commit -m "test(jobs): A5 endpoint specs (handlers + rate-limit + group) (#636)"
```

## Task 9: Kiota regeneration + front routes

**Files:** Modify `apps/front/src/routes.ts`; run `just build-api && just generate-client`; create `apps/front/src/lib/i18n.namespaces.ts` update (or co-located registration if the file is auto-generated from a manifest — check `i18n.namespaces.ts` for the current shape; if it's hand-maintained, add the `staff-jobs` entry; if it's auto-generated, regenerate).

- [ ] **Step 1: `just build-api && just generate-client && pnpm --filter front typecheck`** — this generates the nine new route methods + their typed responses in `packages/client-ts/`. The `pnpm typecheck` step surfaces any missing client method or schema drift. Commit `packages/client-ts/`.

- [ ] **Step 2: Register the front routes.** In `apps/front/src/routes.ts`, add inside the `/staff` group (mirror how `staff/audit-logs` is registered):

```typescript
route('/staff/jobs', 'authed/staff/jobs.tsx', [
    index('authed/staff/jobs/queue.tsx'),
    route('/dead-letter', 'authed/staff/jobs/dead-letter.tsx'),
    route('/system-jobs', 'authed/staff/jobs/system-jobs.tsx'),
]),
```

- [ ] **Step 3: Register the namespace.** In `apps/front/src/lib/i18n.namespaces.ts` (hand-maintained today — confirm with `grep -n "staff-audit-logs" i18n.namespaces.ts`):

```typescript
export const I18N_NAMESPACES = [
    ...GLOBAL_I18N_NAMESPACES,
    'auth',
    'staff-users',
    'staff-invitations',
    'staff-audit-logs',
    'staff-jobs', // A5 (#636)
    'staff-tenant-profiles',
] as const;
```

- [ ] **Step 4: Commit.**

```bash
git add apps/front/src/routes.ts apps/front/src/lib/i18n.namespaces.ts packages/client-ts
git commit -m "feat(front): A5 staff jobs routes + i18n namespace + client gen (#636)"
```

## Task 10: Front query hooks (`staff-jobs.ts`)

**Files:** Create `apps/front/src/lib/query/staff-jobs.ts` + `staff-jobs.test.ts`.

- [ ] **Step 1: Write the failing test file** with the same hook-level coverage as `staff-audit-logs.test.ts` (cursor reset, filter object shape, mutation invalidation scoping). Test must compile-fail because the hooks do not exist.

- [ ] **Step 2: Implement the hooks.** Mirror `staff-audit-logs.ts:1-80`:
- `useStaffJobQueueQuery({status, jobType, tenantId, sortId, sortOrder, cursor, size})` → uses `client.staff.jobs.queue.get(...)` from the regenerated Kiota client.
- `useStaffJobQueueItemQuery({id})` → `client.staff.jobs.queue.byQueueItemId(id).get()` (or whatever the regenerated method name is — read the regenerated `packages/client-ts/` to confirm; do not guess).
- ...and the same shape for the DLQ + system-jobs hooks.
- Mutations: `useMutation` with `buildStaffMutationOptions`; on success, invalidate `[...STAFF_JOB_QUEUES_QUERY_KEY]` (and the other two siblings).
- The mutation input shape uses `createUntypedString()` / `createUntypedArray()` for any array fields (per the OpenAPI safeguards doc).

- [ ] **Step 3: Run `pnpm --filter front test` → green. Commit.**

```bash
git add apps/front/src/lib/query/staff-jobs.ts apps/front/src/lib/query/staff-jobs.test.ts
git commit -m "feat(front): A5 staff jobs query hooks (#636)"
```

## Task 11: Front list pages (queue, dead-letter, system-jobs) + drawers

**Files:** Create the four route files, the three column files, the two drawer files, the search-params file, the redaction banner, and their `.test.ts` / `.test.tsx` siblings.

- [ ] **Step 1: Write the failing page tests.** Smoke tests for each page (renders empty state, renders no-match state, renders an error state on a failed query, renders one row when the query returns one row, navigates to a drawer on row click, fires the requeue mutation on confirm, fires the trigger mutation on confirm, refuses the disable toggle on a protected key with a 409 toast). One file per page + a `*Spec.tsx` per drawer.

- [ ] **Step 2: Implement `_list-search-params.ts`** — the URL-state shape, parsed/serialized, snake_case fields (`status`, `job_type`, `tenant_id`, `is_enabled`, `cursor`, `size`, `sort_id`, `sort_order`). Mirror `authed/staff/audit-logs/_list-search-params.ts` exactly.

- [ ] **Step 3: Implement `_columns-*.tsx` files.** Three column files, one per page. Each is a `makeXxxColumns(t, locale)` factory (no arrow components — methods stay methods, per `publy/arrow-function-components` at `error` severity in front). Action buttons are gated on the `useStaffAuth()` permissions returned by the auth payload (the existing `staff-audit-logs` page does not gate per action because audit-logs is read-only; this is the first page to gate per-action, so write a small `useStaffJobPermissions()` helper that surfaces `{ canRequeue, canUpdateSystemJob, canTriggerSystemJob }` booleans from the existing auth payload's permission list — confirm the auth payload's shape with a `grep -n "permissions" apps/api/Modules/Auth/Handlers/Staff/FindAuthStateForStaff.cs` before implementing; if the shape does not include per-permission booleans, add them there as part of this task).

- [ ] **Step 4: Implement the three list pages.** Each follows `authed/staff/audit-logs.tsx:1-307` exactly: `Route.useNavigate`, `parseXxxListSearchParams`, `useTableController`, `useXxxQuery`, `toXxxRows`, `DataTable`, `LogoutRedirect` on auth failure, `state-view.tsx` for empty/no-match, `state-surface.tsx` for loading skeletons, design tokens (no raw colors), `publy-data-table-filter-button` for the filter triggers. The DLQ page adds a "Requeue" action column gated on `canRequeue`. The system-jobs page adds an inline `Switch` for the enabled toggle (gated on `canUpdateSystemJob`) and a "Trigger now" button (gated on `canTriggerSystemJob`) and an "Edit cron" link that opens `_system-job-edit-cron-drawer.tsx`.

- [ ] **Step 5: Implement the drawers.**
- `_redaction-banner.tsx` — `IconAlertTriangle` + localized sentence.
- `_requeue-confirm.tsx` — confirm dialog with optional note input (≤500 chars, validated).
- `_system-job-edit-cron-drawer.tsx` — form with a single `cron_expression` field, server-side 422 surfaces as a form error.
- Per-row detail drawer (one per page): uses `Sheet` (Base UI) or `Dialog` (Base UI); renders the full row, the events list (DLQ only), the recent occurrences (system-jobs only), and the redaction banner when the payload is redacted.

- [ ] **Step 6: Run all front gates:**
- `pnpm --filter front check:design-system` — design tokens only.
- `pnpm --filter front check:zindex` — z-index tokens only.
- `pnpm --filter front typecheck` — strict TypeScript.
- `pnpm --filter front test` — Vitest (includes i18n parity, trans-render guard, z-index live-tree, anti-slop no-known-value-widening, ApiFailure discriminated-union coverage in the staff-jobs mutation hooks).
- `just react-doctor --scope files` — the front files added in this PR must produce zero findings.

Every local mutation handler in the three new pages MUST derive its user-facing error text through `getFailureMessage(toApiFailure(error), ...)`, never by translating `response-message` keys at the call site — the `publy/no-manual-response-message-translation` lint rule is enforced at `error` severity per `AGENTS.md` "Frontend Coding Standards". The dictionary contract is the `ApiFailure` discriminated union from `apps/front/src/lib/api-client/`.

- [ ] **Step 7: Commit.**

```bash
git add apps/front/src/routes/authed/staff/jobs.tsx \
        apps/front/src/routes/authed/staff/jobs
git commit -m "feat(front): A5 staff jobs list pages + drawers (#636)"
```

## Task 12: e2e proof spec + mutation evidence

**Files:** Create `apps/e2e/tests/staff-jobs.spec.ts` (or whatever the e2e harness path is — confirm with `find apps/e2e -name "*.spec.ts" | head` before writing).

- [ ] **Step 1: e2e happy path.** Staff admin lands on `/staff/jobs`, sees the queue tab, switches to dead-letter, opens one row, clicks Requeue, sees the success toast, refreshes the queue tab and sees the new run. Switches to system-jobs, opens a definition, edits the cron, sees the schedule_epoch change. Clicks Trigger now on an enabled key, sees the success toast, refreshes the queue tab and sees the new run.

- [ ] **Step 2: e2e 403 path.** An unprivileged staff user lands on `/staff/jobs`, sees the queue tab but the Requeue / Trigger / Edit-cron actions are all missing (per the bulk-action convention — "bulk-action items on list-page selection menus always render — never disabled, never conditionally hidden by per-row eligibility; ineligible clicks show an i18n toast" applies; per-row action buttons follow the same "render, gate the click" pattern, mirroring the audit-logs export button which is shown but disabled when the list is empty). Direct navigation to a mutation URL returns the 403 error view (per the design tokens rule + the convention that mutation URLs are not deep-linkable for the unprivileged).

- [ ] **Step 3: e2e K-3 protected key.** Staff admin opens the system-jobs tab, locates the `email-prepared-sends-retention` definition (it's seeded by `SystemJobDefinitionSeeder.cs:140-154`), toggles the enabled switch → server returns 409 with the `system-job-disable-protected` key → the i18n toast shows the localized sentence; the row's enabled state is unchanged.

- [ ] **Step 4: mutation evidence.** For the PR body: temporarily comment out the `SystemJobDisableProtection.IsDisableProtected` check in `UpdateSystemJobDefinitionEnabledForStaff.Handle`, run the e2e K-3 step, capture the failure, revert, capture the pass into `.dump/mutation-check.md`.

- [ ] **Step 5: Run `pnpm --filter e2e test` (if the e2e harness is local — the brief allows CI to run the front e2e 4/4; the local e2e is optional). Commit.**

```bash
git add apps/e2e/tests/staff-jobs.spec.ts .dump/mutation-check.md
git commit -m "test(jobs): A5 e2e proof + K-3 mutation evidence (#636)"
```

## Task 13: Architecture guards + final gates

- [ ] **Step 1: Run all architecture guards.** `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~Architecture|FullyQualifiedName~EndpointPermission|FullyQualifiedName~ServiceArgsRecord|FullyQualifiedName~RouteConstraint|FullyQualifiedName~AppRoleComposition|FullyQualifiedName~EntityConfiguration"` → all green. The `ServiceArgsRecordConvention` guard must auto-discover the new service methods and confirm their 3+-param ones use `{Action}{Domain}Args` records. If any new method is 3+ params positional, refactor it to an args record and re-run.

- [ ] **Step 2: Run the full API suite.** `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test` (using `~/ai-orchestration-playbook/tools/heavy.sh just test-api` per the verification policy). All green. If a Roslyn analyzer fires (PUBLY0001–0008), fix forward — never disable the rule, never add a suppression comment.

- [ ] **Step 3: Run all front gates.** `pnpm --filter front test` (includes design-system, z-index, i18n parity, trans-render, anti-slop, react-doctor scoped) → all green. `just react-doctor --scope files --blocking warning` (HARD gate per AGENTS.md).

- [ ] **Step 4: Run `just knip`** for unused-dependency drift on the API and the front.

- [ ] **Step 5: Run the local CI mirror.** `just ci` (per the brief: front-e2e runs on the PR in CI, not locally; the local CI mirror covers the rest). All green.

## Task 14: PR + DONE

- [ ] **Step 1: Write `.dump/pr-body.md`.** Mirror the house style: What (one paragraph), Fix-per-area (numbered list of the three API layers + the three front pages + the e2e proof), Verification (concrete commands + the mutation evidence path), `Closes #1454`, refs #636, refs #194, "Model:" line stating the lane's model.

- [ ] **Step 2: `gh pr create --draft --base develop --head lane/wt-636p --title "feat(jobs): A5 staff job-visibility dashboard (#636)" --body-file .dump/pr-body.md`.** Confirm the PR URL.

- [ ] **Step 3: Mark the PR ready.** `gh pr ready <pr-number>` (or `gh pr edit --ready`).

- [ ] **Step 4: Poll CI to green.** If `gh pr checks` reports "no checks reported on the branch" for more than a minute after the push, the PR is CONFLICTING with develop: `git fetch origin develop && git rebase origin/develop` (keep both intents, re-read every conflicted file), push with `--force-with-lease`, then wait for the checks.

- [ ] **Step 5: Write `.dump/DONE.md`** with the tip SHA, the PR URL, the green CI run URL, and the mutation evidence path. Print **DONE**.
