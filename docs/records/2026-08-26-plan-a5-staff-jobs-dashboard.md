# A5 — Staff job-visibility dashboard (Lane #636) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Epic A delivery step 5 (closing #1454, part of #636 / #194): staff-only endpoints + UI over the existing jobs infrastructure — list and inspect `job_queue` runs, list and requeue the dead-letter queue, and list/enable/disable/trigger-now the `system_job_definitions` rows that drive the dashboard-configurable recurring system jobs. Every surface is staff-permission-gated, rate-limited, and emits audit rows for every mutation.

**Architecture:** The A5 slice is a read+limited-mutation layer on top of the existing jobs tables (`job_queue`, `job_dead_letter`, `system_job_definitions`, `system_job_occurrences`). It does not change the engine or its contract: the queue, lease, DLQ, and `SyncSystemJobsJob` reconcile stay exactly as they are. New code lives in three places:

- A new query service (`IJobQueueQueryService`, `IDeadLetterQueryService`, `ISystemJobDefinitionQueryService`) for the three cursor-paginated list endpoints — kept separate from the existing `JobDeadLetterService` because the query side and the mutation side have different consumers and different result shapes.
- A new mutation service for requeue + enable/disable + trigger-now, owning the only sanctioned writes to DLQ/system_job_definitions from the staff surface (the existing `JobDeadLetterService.ResolveUnclassifiedAsync` is the model: discriminated-union result, single-statement conditional updates, evidence event row, audit).
- New handlers + endpoints under `apps/api/Modules/Jobs/Handlers/Staff/` + `apps/api/Modules/Jobs/Endpoints/` (mirroring the K-1 layout in `ResolveDeadLetterUnclassifiedForStaff.cs:58-141` and `JobDeadLetterEndpointsForStaff.cs`).
- A new front `apps/front/src/routes/authed/staff/jobs.tsx` layout with three sibling pages (queue, dead-letter, system-jobs) and a per-run detail panel, all on the existing `DataTable` + cursor pagination + URL search-param patterns proven in `authed/staff/audit-logs.tsx` and `authed/staff/audit-logs/_list-search-params.ts`.

The trigger-now path calls the existing `EnqueueSystemJobJob.EnqueueOccurrenceAsync` (`apps/api/Infrastructure/Jobs/Quartz/EnqueueSystemJobJob.cs:69-147`) — the same one the cron trigger uses — so the staff-issued enqueue goes through the exact same fencing and ledger-row insert the scheduler does, instead of becoming a parallel write path.

**Tech stack:** .NET 10 minimal APIs, EF Core 10, xUnit + FluentAssertions + Testcontainers via `ApiFixture`, React 19 (TanStack Start, Base UI, Tailwind v4), TanStack Query + the auto-generated Kiota client, `react-i18next` with a new `staff-jobs` namespace.

## Global Constraints (from #636 / #194 / jobs-infra v4 / `AGENTS.md` "Transparent failure causes")

1. **Out of scope (per brief).** No tenant-facing views, no new job types, no engine changes, no schema changes. A5 reads + limited-mutates the existing tables; the engine's lease model, the `JobQueueProcessor`, the `SyncSystemJobsJob` reconcile, and the `SystemJobDisableProtection` K-3 privacy protection stay untouched.
2. **Staff-only surface.** Every new route is under `Routes.Staff.Root` and gated by `WithPermission([AppPermissions.Staff.Jobs.<VERB>])` exactly as `JobDeadLetterEndpointsForStaff.cs:13-26` does. No `.WithTenantPermission` here — staff scope only.
3. **Permissions are split per verb (no god-mode).** Four staff permissions, one per action: `staff.jobs.view` (list queue + DLQ + system jobs + read a run), `staff.jobs.requeue` (requeue one DLQ row), `staff.jobs.system_job_update` (enable/disable + edit cron on a system_job_definition), `staff.jobs.system_job_trigger` (trigger-now a system_job_definition). Cross-checked against `JobsPermissionsForStaff.cs:6-22` and `AppPermissions.cs:44` so the K-1 `RESOLVE` stays the model. The new permissions are additive: existing staff accounts with `staff.jobs.resolve` are NOT auto-granted the new keys (each is its own grant per the seeder convention).
4. **Rate limiting.** Reads → `ApiRateLimitPolicies.HeavySearchList` (the policy `audit-logs` already uses). DLQ requeue + system-job enable/disable → `ApiRateLimitPolicies.AuthenticatedDefault`. System-job trigger-now → a new dedicated `SystemJobTrigger` policy (a real enqueue into `job_queue`; it must not share the general bucket). `staff.jobs.view` and the non-mutating triggers must never be a quieter bucket than `staff.audit-logs.view`. All four policies land in `ApiRateLimitPolicies` constants + `ApiRateLimitSettings` (a new positional record parameter — constructor changes ripple to every call site; see the "constructor-extension step" in Task 2) + `ApiRateLimitOptionsSetup` + `ApiRateLimiterStore` + env wiring (existing quartet) + `ComprehensiveRateLimiting.Spec` compile fix.
5. **Wire conventions.** camelCase JSON fields, snake_case query params, JSON `application/problem+json` errors via `TypedProblems.*`, `{Action}{Domain}Args` records for any 3+-param service method (Architecture guard at `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`). No route constraints on ID parameters (`apps/api/Lib/Architecture/RouteConstraintGuard.Spec.cs`) — `Guid.TryParse` in the handler, 404 for malformed ids.
6. **C# coding standards (PUBLY0001–0008):** no `!`, no `?? throw`, no `ToLowerInvariant()` for dispatch, cached `JsonElement` getters, no `Dto` suffix on wire types, handler entrypoint `Handle`, contract types are top-level siblings, handlers hold no `DbContext`, services depend on `DbContext` + infrastructure only, staff handlers MUST use the `*ForStaff*` service method variants (PUBLY0007).
7. **Audit.** New `AuditActions` constants: `job.dead_letter.requeued` (target = the new `job_queue.id`, details = source dead-letter id + job_type), `job.system_job.enabled` and `job.system_job.disabled` (target = `system_job_definitions.id`, details = job_key + prior value + new value), `job.system_job.cron_updated` (target = id, details = job_key + prior cron + new cron), `job.system_job.triggered` (target = id, details = job_key + new `job_queue.id` + schedule_epoch from the boundary — the boundary reads the CURRENT epoch, the audit captures what it used). All five constants go into `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` immediately after `JobDeadLetterTriageResolved` (which lives at line 86 of that file). The audit action whitelist is auto-discovered by `AuditActionsRegistry` (`AuditActionsRegistry.cs:12-26`), so no manual whitelist pin is needed; `AuditActionsRegistrySpec.ItShouldExposeAllAuditActionConstantsSortedAlphabetically` already asserts the registry's shape and the new constants are picked up automatically.
8. **Transparent failure causes (owner product rule, 2026-08-22).** A `Failed` DLQ row carries its `last_error` in plain words — already true; the staff `GetById` endpoint must surface it unchanged (no truncation that loses cause, no reformatting that hides the actionable line). A `Conflict` 409 names the actual current state. A `NotFound` 404 distinguishes "no such id" from "id exists but is not your concern" (staff scope makes the latter impossible, so a single 404 is fine). Trigger-now must surface "system job is disabled" / "system job has no live schedule epoch" / "system job's cron failed to parse" as distinct typed results — never a generic 500.
9. **Privacy K-3 protection stays.** `SystemJobDisableProtection.IsDisableProtected(jobKey)` (`apps/api/Modules/Jobs/SystemJobDisableProtection.cs:30-32`) is the only authority on whether a disable attempt is honoured. A5's enable/disable handler MUST call it and return a 409 (`job-system-job-disable-protected`) listing the protected key — never a silent revert. Trigger-now on a disabled definition is fine (operator override); the reconcile will simply re-disable on the next 60s pass; that is documented in the handler spec.
10. **i18n parity.** New `apps/front/src/i18n/locales/en/staff-jobs.json` + `fr/staff-jobs.json`, EN+FR identical shape. Namespaces registered in `apps/front/src/lib/i18n.namespaces.ts` (the file is hand-maintained — confirmed by reading the file) under `FEATURE_I18N_NAMESPACES` and asserted by `i18n-key-coverage.test.ts` (the test's path is `i18n-key-coverage.test.ts`, no dash in some grep results is fine — the assertion is shape-based, not name-based). The new namespace is listed in the `staff-jobs.tsx` route file's `staticData.i18nNamespaces: ['staff-jobs']`.
11. **No hosted service added** (`AppRoleCompositionSpec` unaffected). `trigger-now` is a request/response endpoint — no new background work, no new Quartz trigger, no new NOTIFY channel.
12. **No disable comments, no `// TODO`, no `!` in production code, no `?? throw` in production code.** All enforced by the existing Roslyn analyzers.
13. **OpenAPI snake_case guard + Kiota:** `just build-api && just generate-client && pnpm --filter front typecheck` runs after every endpoint change. `[AsParameters]` query DTOs use CSV `string?` + parser methods for multi-value filters (jobs queue: status; jobs system-jobs: `is_enabled`) — see `apps/api/Modules/Invitations/Handlers/Staff/FindStaffInvitations.cs:17-48` for the established pattern.
14. **Migrations:** none required. A5 reads + limited-mutates the existing tables. If implementation proves otherwise, `just db-add JobsA5 && just db-migrate`.

## File Structure

**Create — API (handlers, services, endpoints, routes, tests)**

- `apps/api/Modules/Jobs/Services/JobQueueQueryService.cs` — read-only keyset list of `JobQueueItem` with status/job_name/tenant_id filters and one get-by-id. Result `JobQueueListItem` (id, job_type, status, priority, attempts, max_attempts, locked_by, locked_until, last_error redacted, next_attempt_at, created_at, updated_at, tenant_id, actor_user_id, correlation_id). `IJobQueueQueryService` interface, `[Service(ServiceLifetime.Scoped)]`.
- `apps/api/Modules/Jobs/Services/DeadLetterQueryService.cs` — read-only keyset list of `JobDeadLetter` with external_state_status/job_type/tenant_id filters, plus `GetByIdAsync` (full envelope) and `RequeueAsync` (mutation: single-statement conditional INSERT into `job_queue` mirroring the engine's lease contract, plus evidence event `JobDeadLetterEvents.Requeued` and audit). Result `DeadLetterListItem` (id, original_job_id, job_type, attempts, last_error, external_state_status, triaged_at, failed_at, tenant_id, has_payload — boolean, payload is **never** in the list). Get-by-id returns the full payload, but with `payload_redacted: true` for known sensitive job types per the allowlist (see `payload_redaction` policy below).
- `apps/api/Modules/Jobs/Services/SystemJobDefinitionQueryService.cs` — list + get-by-id (read), `UpdateEnabledAsync` (mutation), `UpdateCronAsync` (mutation, validates the new cron via `Quartz.CronExpression.IsValidExpression`), `TriggerNowAsync` (mutation, calls `IEnqueueSystemJobBoundary.EnqueueNowAsync`). `UpdateCronAsync` writes the new cron but does NOT rotate `schedule_epoch` — rotation is reserved for the next `SyncSystemJobsJob.ReconcileAsync` pass (see Task 6 for the full rationale and the no-double-rotation spec).
- `apps/api/Modules/Jobs/Services/JobQueueQueryService.Spec.cs`, `DeadLetterQueryService.Spec.cs`, `SystemJobDefinitionQueryService.Spec.cs` — direct-service specs (no HTTP). Verify keyset ordering, filter combinations, requeue's conditional transition, cron update, trigger-now enqueue + ledger row, K-3 protected disable returns the typed result.
- `apps/api/Modules/Jobs/Handlers/Staff/FindJobQueueItemsForStaff.cs` — `GET /staff/jobs/queue` (keyset pagination; snake_case query: `status`, `job_type`, `tenant_id`, `cursor`, `size`, `sort_id`, `sort_order`).
- `apps/api/Modules/Jobs/Handlers/Staff/GetJobQueueItemForStaff.cs` — `GET /staff/jobs/queue/{id}` (one row, full envelope, no payload field — staff list page links to the DLQ row for payload inspection).
- `apps/api/Modules/Jobs/Handlers/Staff/FindDeadLettersForStaff.cs` — `GET /staff/jobs/dead-letter` (keyset pagination; snake_case query: `external_state_status`, `job_type`, `tenant_id`, `cursor`, `size`, `sort_id`, `sort_order`).
- `apps/api/Modules/Jobs/Handlers/Staff/GetDeadLetterForStaff.cs` — `GET /staff/jobs/dead-letter/{id}` (full envelope, `payload` field present but redacted per policy, `events` array of `JobDeadLetterEvent` rows for this id).
- `apps/api/Modules/Jobs/Handlers/Staff/RequeueDeadLetterForStaff.cs` — `POST /staff/dead-letter/{id}/requeue` (body: optional note ≤500 chars; returns 200 with `{job_id, message, key}` or 404/409 typed). **This route lives in the EXISTING K-1 `MapGroup` rooted at `Routes.Jobs.ForStaff.Root = "/dead-letter"` (the K-1 `resolve-unclassified` route already lives here) so the historical path `/staff/dead-letter/{id}/requeue` is created without moving any existing path.** See Task 7b for the path layout, and the release-note line in Task 14.
- `apps/api/Modules/Jobs/Handlers/Staff/FindSystemJobDefinitionsForStaff.cs` — `GET /staff/jobs/system-jobs` (keyset pagination; snake_case query: `is_enabled`, `cursor`, `size`, `sort_id`, `sort_order`).
- `apps/api/Modules/Jobs/Handlers/Staff/GetSystemJobDefinitionForStaff.cs` — `GET /staff/jobs/system-jobs/{id}` (full envelope + recent `system_job_occurrences` ledger rows: top 25 by `scheduled_fire_at` desc).
- `apps/api/Modules/Jobs/Handlers/Staff/UpdateSystemJobDefinitionEnabledForStaff.cs` — `PATCH /staff/jobs/system-jobs/{id}/enabled` (body `{is_enabled: bool}`; 409 on protected key).
- `apps/api/Modules/Jobs/Handlers/Staff/UpdateSystemJobDefinitionCronForStaff.cs` — `PATCH /staff/jobs/system-jobs/{id}/cron` (body `{cron_expression: string}`; 422 on parse failure; writes the new cron, lets the next reconcile rotate the schedule_epoch).
- `apps/api/Modules/Jobs/Handlers/Staff/TriggerSystemJobDefinitionForStaff.cs` — `POST /staff/jobs/system-jobs/{id}/trigger` (no body; 200 with `{job_id, scheduled_fire_at, schedule_epoch, message, key}`; 404/200-noop typed).
- `apps/api/Modules/Jobs/Handlers/Staff/*Spec.cs` — endpoint specs on `ApiFixture` for each handler (happy path + 404 + 403 unprivileged + 400 malformed + the per-handler typed failure). **Note:** the spec file for the K-1 handler is `apps/api/Modules/Jobs/Handlers/Staff/ResolveDeadLetterUnclassified.Spec.cs` (the FILE is named without the `ForStaff` suffix even though the CLASS is `ResolveDeadLetterUnclassifiedForStaffSpec`); mirror that convention for the A5 spec files.
- `apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.cs` — two new `MapGroup`s, one per resource, each gets its own `RequireRateLimiting` policy and its own `WithTags("Staff Jobs")`:
  - `MapJobQueueEndpointsForStaff` under `/staff/jobs/queue` (the `Routes.Jobs.ForStaff.JobsRoot + Routes.Jobs.ForStaff.Queue.Root` constant) — `HeavySearchList`.
  - `MapSystemJobDefinitionEndpointsForStaff` under `/staff/jobs/system-jobs` (the `Routes.Jobs.ForStaff.JobsRoot + Routes.Jobs.ForStaff.SystemJobs.Root` constant) — `HeavySearchList` for reads, `AuthenticatedDefault` for enable/disable + cron, **`SystemJobTrigger`** (new) for trigger-now.
  - Note: the `MapDeadLetterEndpointsForStaff` reads (GET) under `/staff/jobs/dead-letter` is a third group; the EXISTING `JobDeadLetterEndpointsForStaff.cs` group at `Routes.Jobs.ForStaff.Root = "/dead-letter"` is EXTENDED (not duplicated) to add the new `Requeue` route — this avoids re-rooting the K-1 surface.
- `apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.Spec.cs` — single integration spec verifying all 10 routes are reachable on a real staff session and that an unprivileged staff account gets 403 on each (10 routes: 5 reads + 4 mutations + 1 requeue that lives in the extended K-1 group).
- `apps/api/Modules/Jobs/Routes.Jobs.cs` — extend with two new sub-routes (read as a partial-class addition). The existing K-1 constants at lines 7-14 are PRESERVED UNCHANGED (the `Root = "/dead-letter"` constant at line 8 must NOT be moved, per the brief's non-negotiable fix #1). New nested classes:
  - `Routes.Jobs.ForStaff.JobsRoot` (constant `"/jobs"`) — a NEW root for the A5 surfaces, leaving the K-1 root at `/dead-letter` exactly where it is. Implemented as a new const in the `ForStaff` class (not as a redefinition of `Root`).
  - `Routes.Jobs.ForStaff.Queue` (Root `"/queue"`, `/{queueItemId}`).
  - `Routes.Jobs.ForStaff.DeadLetter` (Root `"/dead-letter"`, `/{deadLetterId}`). This is a NEW nested class with a `Root` constant that joins with `JobsRoot` to form `/jobs/dead-letter` for the new DLQ READS. The K-1 `Root = "/dead-letter"` constant lives in `ForStaff` directly, not in `ForStaff.DeadLetter`.
  - `Routes.Jobs.ForStaff.SystemJobs` (Root `"/system-jobs"`, `/{systemJobId}`, `/{systemJobId}/enabled`, `/{systemJobId}/cron`, `/{systemJobId}/trigger`).
- `apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs` — add the four new permission properties (VIEW, REQUEUE, SYSTEM_JOB_UPDATE, SYSTEM_JOB_TRIGGER). Rename `RESOLVE` to `RESOLVE` still — do not rename, do not move, do not change its key string. The new permissions are additive: existing staff accounts with `staff.jobs.resolve` are NOT auto-granted the new keys (each is its own grant per the seeder convention).
- `apps/api/Modules/Jobs/Handlers/Staff/PayloadRedaction.cs` — single shared helper: `Redact(string jobType, string payloadJson) -> string` (replaces the `payload` value with `{"redacted":true,"reason":"..."}` for sensitive job types). Allowlist-based, FAIL-CLOSED. Lives in the handlers folder next to its only consumer, not the service (the service returns the raw row; the handler is the redaction boundary). See Task 7f for the allowlist shape and the unit spec.
- `apps/api/Modules/Jobs/Handlers/Staff/PayloadRedaction.Spec.cs` — unit spec for the policy table.

**Create — i18n + response keys**

- `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` — new keys: `job-queue-item-not-found`, `dead-letter-requeue-success`, `dead-letter-requeue-conflict`, `system-job-definition-not-found`, `system-job-definition-update-success`, `system-job-cron-invalid`, `system-job-disable-protected`, `system-job-trigger-success`, `system-job-trigger-noop`. The `dead-letter-not-found`, `dead-letter-not-unclassified`, and `dead-letter-resolved-success` keys from K-1 are reused where applicable.
- `apps/api/Localization/ResponseKeys.g.cs` — regenerated via `just generate-response-keys` (existing script).

**Create — Front**

- `apps/front/src/i18n/locales/en/staff-jobs.json` + `fr/staff-jobs.json` — page titles, table headers, status labels, action labels, empty/no-match copy, drawer copy. EN + FR identical shape; `i18n-key-coverage.test.ts` will assert parity.
- `apps/front/src/lib/i18n.namespaces.ts` — add `'staff-jobs'` to `FEATURE_I18N_NAMESPACES` (mirror how `staff-audit-logs` is registered).
- `apps/front/src/lib/query/staff-jobs.ts` — TanStack Query hooks: `useStaffJobQueueQuery`, `useStaffJobQueueItemQuery`, `useStaffDeadLettersQuery`, `useStaffDeadLetterQuery`, `useStaffRequeueDeadLetterMutation`, `useStaffSystemJobDefinitionsQuery`, `useStaffSystemJobDefinitionQuery`, `useStaffUpdateSystemJobEnabledMutation`, `useStaffUpdateSystemJobCronMutation`, `useStaffTriggerSystemJobMutation`. Row types: `StaffJobQueueRow`, `StaffDeadLetterRow`, `StaffSystemJobDefinitionRow`. Mirrors the shape of `staff-audit-logs.ts`.
- `apps/front/src/lib/query/staff-jobs.test.ts` — minimal hook-level coverage (cursor reset, filter object shape, mutation invalidation scoping).
- `apps/front/src/routes/authed/staff/jobs.tsx` — staff layout under `/staff/jobs/*` with three sibling index pages (sub-routes are sibling route files: `authed/staff/jobs/queue.tsx`, `authed/staff/jobs/dead-letter.tsx`, `authed/staff/jobs/system-jobs.tsx` + per-run detail drawers handled inline as sheet-overlays). Mirrors the `authed/staff/dashboard.tsx` layout: `route('/staff/jobs', 'authed/staff/jobs.tsx', [index('.../queue.tsx'), route('/dead-letter', '.../dead-letter.tsx'), route('/system-jobs', '.../system-jobs.tsx')])`. (See the explanatory note in Task 9 — the layout route is used because the three pages share i18n state, sidebar selection, and a top-level page header. The cited `audit-logs` is a flat registration, not a layout; the A5 jobs subtree mirrors `dashboard.tsx` instead because it has three sibling pages with shared chrome.)
- `apps/front/src/routes/authed/staff/jobs/queue.tsx` — list page, DataTable, cursor pagination, filters (status, job_type, tenant_id), "Inspect" link opens a side drawer showing the row + last_error in plain words + a "View DLQ row" link when `attempts >= max_attempts`.
- `apps/front/src/routes/authed/staff/jobs/dead-letter.tsx` — list page, same shape, plus a "Requeue" action button per row (gated on `staff.jobs.requeue`), a side drawer for one row (full payload with redaction banner, evidence events list), and the requeue confirm dialog.
- `apps/front/src/routes/authed/staff/jobs/system-jobs.tsx` — list page, columns: job_key, cron_expression, is_enabled toggle (gated on `staff.jobs.system_job_update`), last_enqueued_at, "Trigger now" button (gated on `staff.jobs.system_job_trigger`), "Edit cron" inline form (gated on `staff.jobs.system_job_update`). Side drawer: one row + recent `system_job_occurrences` ledger.
- `apps/front/src/routes/authed/staff/jobs/_list-search-params.ts` — snake_case URL state (mirrors `_list-search-params.ts` of audit-logs verbatim style).
- `apps/front/src/routes/authed/staff/jobs/_columns.tsx` (queue), `_columns-dead-letter.tsx`, `_columns-system-jobs.tsx` — column definitions, per-row action wiring.
- `apps/front/src/routes/authed/staff/jobs/_redaction-banner.tsx` — the warning banner shown above any redacted payload (an `IconAlertTriangle` + a localized sentence "Sensitive payload hidden from staff view").
- `apps/front/src/routes/authed/staff/jobs/_system-job-edit-cron-drawer.tsx`, `_requeue-confirm.tsx` — mutation drawers.
- `apps/front/src/routes/authed/staff/jobs.test.tsx` + `_list-search-params.test.ts` + `_columns-*.test.tsx` — page-level smoke + URL-state round-trip + column sanity.
- `apps/front/src/routes.ts` — register `/staff/jobs` + three children. Update `routeTree.gen.ts` via the build (no manual edit).
- `apps/front/e2e/staff-jobs.spec.ts` — the e2e proof spec. **The file lives at `apps/front/e2e/staff-jobs.spec.ts` (NOT `apps/e2e/tests/...` — there is no `apps/e2e/` directory in this tree).** Runs via `pnpm --filter front exec playwright test` (the command in `apps/front/e2e/README.md:19`). The `test.describe('@staff @1454')` shape is mandated by the e2e tag guard `apps/front/e2e/__tests__/e2e-tag-guard.test.ts`.

**Modify**

- `apps/api/Lib/AppPermissions.cs:44` — `JobsPermissionsForStaff Jobs { get; } = new();` stays; the `JobsPermissionsForStaff` class itself grows four new permission properties (Task 1).
- `apps/api/Modules/AuditLogs/Entities/AuditLog.cs:86` — add the five new audit action constants immediately after `JobDeadLetterTriageResolved` (which is the constant at line 86; the new ones start at line 87+).
- `apps/api/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs` — NO edit required. The existing `ItShouldExposeAllAuditActionConstantsSortedAlphabetically` test (line 10) already asserts the registry's shape via reflection; the new constants flow through automatically. The verdict-r1 finding about "Task 1 step 1's failing test file is ambiguous (or)" is addressed here: this is the ONE test file the implementer extends (via a new `ItShouldExposeTheJobsA5AuditActions` method that asserts the five new keys), and it is the SINGLE file in the failing-test step.
- `apps/api/Lib/RateLimiting/ApiRateLimitSettings.cs` — add a `SystemJobTrigger` window record parameter (a new positional argument in the record's constructor; constructor changes ripple to every call site — see Task 2 for the exact migration path).
- `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` — add `SystemJobTrigger` const.
- `apps/api/Lib/RateLimiting/ApiRateLimiterStore.cs` — register the new policy.
- `apps/api/Lib/RateLimiting/ApiRateLimitOptionsSetup.cs` — partition the new policy (session-fingerprint keyed, like the others).
- `apps/api/Lib/RateLimiting/ComprehensiveRateLimiting.Spec.cs` — extend the settings construction sites (compile-level fix + one assertion if the spec enumerates policies).
- `apps/api/Lib/AppEnvironment.cs` — `SYSTEM_JOB_TRIGGER_RATE_LIMIT_PERMIT_LIMIT` (default 30) and `SYSTEM_JOB_TRIGGER_RATE_LIMIT_WINDOW_SECONDS` (default 60) with FluentValidation bounds.
- `apps/api/Lib/ServiceRegistration.cs` — register the three new query services + the trigger-now consumer (`IEnqueueSystemJobBoundary` is a tiny new seam in `Infrastructure/Jobs/` so the service depends on infrastructure, not on the Quartz `IJob` directly — see the seam below).
- `apps/api/Infrastructure/Jobs/IEnqueueSystemJobBoundary.cs` — new seam: `Task<EnqueueSystemJobBoundaryResult> EnqueueNowAsync(string jobKey, CancellationToken ct)`. The implementation reads the CURRENT `schedule_epoch` from `system_job_definitions` exactly the way `EnqueueSystemJobJob.EnqueueOccurrenceAsync` does at lines 81-88 of `EnqueueSystemJobJob.cs`:

  ```sql
  SELECT schedule_epoch AS "Value"
  FROM system_job_definitions
  WHERE job_key = $1 AND is_deleted = false AND is_enabled = true
  FOR UPDATE
  ```

  Then it calls the engine's `EnqueueOccurrenceAsync(jobKey, scheduledFireAt = DateTime.UtcNow, scheduleEpoch = currentScheduleEpoch, ct)`. The boundary does NOT rotate the epoch; rotation is reserved for `SyncSystemJobsJob` (see Task 6). The seam is a thin `IJob`-free wrapper over `EnqueueSystemJobJob.EnqueueOccurrenceAsync` so the staff service depends on `Infrastructure/`, allowed by the `ServiceDependencyBoundaryGuard`.
- `apps/api/Infrastructure/Jobs/EnqueueSystemJobBoundary.cs` — the implementation. The `EnqueueSystemJobBoundaryResult` discriminated union: `Enqueued(Guid jobId, DateTime scheduledFireAt, Guid scheduleEpoch)`, `NotFound` (no such key), `NoOp` (key exists but `is_enabled = false` — the engine's `EnqueueOccurrenceAsync` rejects the enqueue as a soft no-op; the handler returns 200 with the `system-job-trigger-noop` key, per the PR body's contract). The disabled-key detection happens BOTH at the boundary (so the boundary can short-circuit without writing) AND inside `EnqueueOccurrenceAsync` (so a racing toggle between read and enqueue is still safe).
- `apps/api/Infrastructure/Jobs/EnqueueSystemJobBoundary.Spec.cs` — fence-conditioned single-statement tests: (a) trigger-now an enabled key → 1 ledger + 1 queue + `last_enqueued_at` updated; (b) trigger-now a disabled key → `NoOp` (the boundary's own `is_enabled = true` filter plus the engine's own filter; zero rows); (c) trigger-now an unknown key → `NotFound`, zero rows; (d) trigger-now on a key whose definition's `schedule_epoch` was just rotated by a concurrent cron update → the boundary reads the CURRENT epoch, the enqueue lands under the new epoch, and the old Quartz trigger (if any) becomes a no-op until the next reconcile; the spec is one assertion: the inserted `job_queue.id` matches the inserted `system_job_occurrences.enqueued_job_id`, and the definition's `last_enqueued_at` advances.
- `apps/front/src/routes.ts` — register the new `/staff/jobs` subtree (Task 9).
- `apps/front/src/lib/i18n.namespaces.ts` — register `staff-jobs` (Task 9).

---

## Task 1: Jobs permissions slice (VIEW, REQUEUE, SYSTEM_JOB_UPDATE, SYSTEM_JOB_TRIGGER)

**Files:** Modify `apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs`; Modify `apps/api/Modules/AuditLogs/Entities/AuditLog.cs`; Modify `apps/api/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs` (add a single new `[Fact]` method); Modify `apps/api/Modules/Jobs/Entities/JobDeadLetterEvents.cs` (add the `Requeued` constant).

- [ ] **Step 1: Write the failing registry assertion.** Add ONE new `[Fact]` method to `apps/api/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs` (this is the ONLY test file for this step; the verdict-r1 "or" ambiguity is removed by naming it explicitly here). The new method asserts the five new keys are in `AuditActionsRegistry.All`. RED because the constants don't exist yet:

```csharp
[Fact]
public void ItShouldExposeTheJobsA5AuditActions() {
    AuditActionsRegistry.All.Should().Contain("job.dead_letter.requeued");
    AuditActionsRegistry.All.Should().Contain("job.system_job.enabled");
    AuditActionsRegistry.All.Should().Contain("job.system_job.disabled");
    AuditActionsRegistry.All.Should().Contain("job.system_job.cron_updated");
    AuditActionsRegistry.All.Should().Contain("job.system_job.triggered");
}
```

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AuditActionsRegistry" -v normal`
Expected: FAIL (5 missing-constant errors). RED.

- [ ] **Step 2: Add the five audit-action constants.** Modify `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` — insert the new constants IMMEDIATELY AFTER the existing `JobDeadLetterTriageResolved` (line 86). The new constants start at line 87 of the file:

```csharp
// A5 (#636): DLQ requeue + system_job_definitions dashboard mutations.
public const string JobDeadLetterRequeued = "job.dead_letter.requeued";
public const string JobSystemJobEnabled = "job.system_job.enabled";
public const string JobSystemJobDisabled = "job.system_job.disabled";
public const string JobSystemJobCronUpdated = "job.system_job.cron_updated";
public const string JobSystemJobTriggered = "job.system_job.triggered";
```

Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~AuditActionsRegistry"` → green. The existing `ItShouldExposeAllAuditActionConstantsSortedAlphabetically` (line 10) and `ItShouldReturnTrueWhenActionIsKnown` (line 22) tests continue to pass — the constants are picked up via reflection by `AuditActionsRegistry.cs:12-26`.

- [ ] **Step 3: Add the `Requeued` event constant.** Modify `apps/api/Modules/Jobs/Entities/JobDeadLetterEvents.cs` by adding a single constant. The current file has `MissingConfirmed` (line 11) and `UnclassifiedFlagged` (line 14). Add:

```csharp
/// <summary>A row was requeued back into job_queue by a staff operator (A5, #636).</summary>
public const string Requeued = "dead_letter.requeued";
```

The new constant lives in the same family as the K-1 strings; the value pair `event_value → resulting_external_state_status` is intentionally not in the design's 1:1 event-vocabulary table (this is a requeue, not a status transition) — the DLQ row's status does not change. Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~DeadLetterResolutionCatalog"` → green (the catalog spec is read in Task 5 to confirm whether the new event needs adding to its expected set; if it does, add it, else do nothing).

- [ ] **Step 4: Implement the four new permission properties in `JobsPermissionsForStaff`.** Add to `apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs` (the current file is 23 lines; the `RESOLVE` block at lines 11-21 stays exactly as it is, untouched):

```csharp
public Permission VIEW { get; }
public Permission REQUEUE { get; }
public Permission SYSTEM_JOB_UPDATE { get; }
public Permission SYSTEM_JOB_TRIGGER { get; }

public JobsPermissionsForStaff() {
    // existing RESOLVE block stays (lines 12-21 in the source file)
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

Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindStaffPermissions"` → green. The existing `FindStaffPermissionsSpec` (file `apps/api/Modules/Permissions/Handlers/Staff/FindStaffPermissions.Spec.cs`, 78 lines) tests only the HTTP layer (auth + ok), not key enumeration. **Confirm by reading the file** before writing the assertion: if a key-enumeration spec does NOT exist, add a one-line `Assert.Contains("staff.jobs.system_job_trigger", ...)` to a new `[Fact]` in the same file. (This was the verdict's "if the spec does not enumerate by key, add a one-line" hand-wave; the implementer MUST read the file first to know which it is.)

- [ ] **Step 5: Commit.**

```bash
git add apps/api/Modules/Jobs/Permissions/JobsPermissionsForStaff.cs \
        apps/api/Modules/AuditLogs/Entities/AuditLog.cs \
        apps/api/Modules/AuditLogs/Entities/AuditActionsRegistry.Spec.cs \
        apps/api/Modules/Jobs/Entities/JobDeadLetterEvents.cs
git commit -m "feat(jobs): A5 staff jobs dashboard permissions + audit actions (#636)"
```

## Task 2: Rate-limit policy `SystemJobTrigger` (env, settings, store, options, spec)

**Files:** Modify `apps/api/Lib/RateLimiting/*` (the existing quartet) + `apps/api/Lib/AppEnvironment.cs` + `apps/api/Lib/RateLimiting/ComprehensiveRateLimiting.Spec.cs`.

- [ ] **Step 1: Add env vars to `AppEnvironment.cs`.** Mirror the existing `SOCIAL_CONNECT_RATE_LIMIT_PERMIT_LIMIT` pair exactly. Default 30 permits / 60 s window — a trigger is a real enqueue, so it should be per-minute, not per-hour. FluentValidation bounds: `1 <= permit_limit <= 1000`, `1 <= window_seconds <= 3600`.

- [ ] **Step 2: Extend `ApiRateLimitSettings.cs` + `ApiRateLimitPolicies.cs`.** Add `SystemJobTrigger` window record parameter to `ApiRateLimitSettings` (mirror `SocialConnect` verbatim shape). Add the constant to `ApiRateLimitPolicies`. Add the store entry in `ApiRateLimiterStore.cs` (partitioned by session fingerprint, like the others). Add the `ApiRateLimitOptionsSetup.cs` partition line.

  **Constructor-extension step (CRITICAL):** `ApiRateLimitSettings` is a record. Adding a positional argument to its constructor WILL break every call site that constructs it. There are at least three: `ApiRateLimitSettings.FromEnvironment` (the canonical one), `ComprehensiveRateLimiting.Spec` (test), and any other `.Specs` or test fixture. The implementer must:
  1. Read `ApiRateLimitSettings.cs` end-to-end and list every construction site with `git grep -n "new ApiRateLimitSettings"` and `git grep -n "ApiRateLimitSettings("`.
  2. Update each site to pass the new `SystemJobTrigger` window record argument.
  3. The default for the new window is `new RateLimitWindowSettings(30, 60)` in `FromEnvironment` (the env-derived values), and any test construction site uses the same `new RateLimitWindowSettings(30, 60)`.
  4. Run `dotnet test` to flush every compile error before continuing.

- [ ] **Step 3: Failing compile-fix spec.** Run `ComprehensiveRateLimiting.Spec`; it will fail to compile because the new window is required by the `ApiRateLimitSettings` constructor. Update the construction sites in the spec to pass the new argument. Run again → green.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Lib/RateLimiting apps/api/Lib/AppEnvironment.cs
git commit -m "feat(jobs): A5 SystemJobTrigger rate-limit policy (#636)"
```

## Task 3: `IEnqueueSystemJobBoundary` (infrastructure seam) + spec

**Files:** Create `apps/api/Infrastructure/Jobs/IEnqueueSystemJobBoundary.cs`, `EnqueueSystemJobBoundary.cs`, `EnqueueSystemJobBoundary.Spec.cs`.

- [ ] **Step 1: Write the failing boundary spec.** Five cases (the verdict's MAJOR finding 8 about 9-vs-10 endpoint count is addressed here — the boundary has 5 RED cases, not 3):

```csharp
[Fact]
public async Task ItShouldEnqueueOneQueueRowAndOneLedgerRowForAnEnabledKey() { ... }

[Fact]
public async Task ItShouldReturnNoOpForADisabledKeyWithoutEnqueuing() { ... }
// Verdict-r1 fix: the boundary MUST filter on is_enabled = true (the engine
// already does at EnqueueSystemJobJob.cs:85, but the boundary must too so
// a NoOp is signalled BEFORE the engine transaction).

[Fact]
public async Task ItShouldReturnNotFoundForAnUnknownKey() { ... }

[Fact]
public async Task ItShouldReadTheCurrentScheduleEpoch() { ... }
// The boundary reads schedule_epoch FOR UPDATE from system_job_definitions
// (same SQL as EnqueueSystemJobJob.cs:81-88) and passes the CURRENT epoch
// to EnqueueOccurrenceAsync — never a rotated one, never a default.

[Fact]
public async Task ItShouldNotRotateTheScheduleEpoch() { ... }
// Proves that the boundary does NOT call Guid.NewGuid() on the
// schedule_epoch. Read the epoch from the definition row before
// and after the boundary call; assert they are equal.
```

Run: `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~EnqueueSystemJobBoundary"` → red (the interface does not exist).

- [ ] **Step 2: Implement the interface and class.** The implementation:

**is_enabled race bound (#1458 follow-up 3):** the boundary's own `is_enabled = false` short-circuit (step 3) is a cheap pre-check WITHOUT the row lock; the authoritative check is the engine's `SELECT ... FOR UPDATE ... AND is_enabled = true` inside its transaction. Worst case: a disable commits between the boundary's unlocked pre-read and the engine's locked re-check → the engine refuses and zero rows land (bounded, not leaked). The residual worst case across BOTH checks is ONE extra occurrence enqueued for a fire instant claimed just before a disable commits; the `system_job_occurrences` composite key (`ON CONFLICT (job_key, scheduled_fire_at) DO NOTHING`) makes that occurrence unrepeatable. Spec case (e) pins the disabled-key zero-row outcome; the engine's fence tests pin the locked re-check.

1. Begin a transaction.
2. `SELECT schedule_epoch FROM system_job_definitions WHERE job_key = $1 AND is_deleted = false FOR UPDATE` (the same projection `EnqueueSystemJobJob.cs:81-88` uses, but WITHOUT `is_enabled = true` here — see step 3). Zero rows → return `BoundaryResult.NotFound`.
3. **If `is_enabled = false`**, return `BoundaryResult.NoOp` (the verdict-r1 disabled-key finding #2). This is the boundary's own short-circuit; the engine ALSO has the filter at `EnqueueSystemJobJob.cs:85` (`AND is_enabled = true`), so even if the boundary skipped step 3, the engine would refuse. The two checks together are belt-and-suspenders.
4. Call `EnqueueSystemJobJob.EnqueueOccurrenceAsync(jobKey, scheduledFireAt: DateTime.UtcNow, scheduleEpoch: <epoch from step 2>, cancellationToken: ct)`. This is the SAME call the cron trigger uses; it does the ledger insert, the queue insert, the `last_enqueued_at` update, and the commit. The boundary does NOT write to `system_job_definitions` itself.
5. Return `BoundaryResult.Enqueued(jobId, scheduledFireAt, scheduleEpoch)`.

The `schedule_epoch` is NOT rotated here — the engine's `EnqueueSystemJobJob.cs:90-95` only refuses if the epoch doesn't match, but the boundary reads the CURRENT epoch so the enqueue always lands under the live schedule. Rotation only happens on `cron_updated` (Task 6). Document this in a class-level XML comment.

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

- [ ] **Step 2: Implement `IJobQueueQueryService` + class.** Cursor pagination on `(CreatedAt DESC, Id DESC)`. Filter validation is in the validator (Task 7d); the service trusts its `FindJobQueueItemsArgs`. Get-by-id is a single `AsNoTracking` select returning a `JobQueueItemDetail` (adds nothing to the row — same column set; the front end just renders a different page).

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
2. Conditional UPDATE: `UPDATE job_dead_letter SET requeued_as_job_id = $newJobId, requeued_at = now() WHERE id = $1 AND requeued_as_job_id IS NULL RETURNING id`. Zero rows affected → `Result.AlreadyRequeued` (a concurrent resolver won; the handler maps this to 409). The `requeued_as_job_id IS NULL` predicate is the race guard — once a row has been requeued, the column is non-null and any later attempt returns zero affected rows. **Note:** the `requeued_as_job_id` and `requeued_at` columns may need to be added to `job_dead_letter`. The verdict's "no migration" assumption holds if they already exist (read the entity's `JobDeadLetter.cs` and the K-1 `JobDeadLetterConfiguration.cs` before writing this — if they do not, add a `JobsA5` migration with `just db-add JobsA5`).
3. `INSERT INTO job_queue (job_type, payload, priority, max_attempts, idempotency_key, tenant_id, actor_user_id, correlation_id, requeued_from_dead_letter_id) VALUES (...)` with the dead-letter's envelope. The `requeued_from_dead_letter_id` column on `job_queue` already exists per the entity comment at `JobQueueItem.cs:97-103` — A5 writes the first requeue through it.
4. `INSERT INTO job_dead_letter_events (dead_letter_id, event, detected_by, prior_status, new_status, details) VALUES ($1, 'dead_letter.requeued', 'operator', <prior external_state_status>, <prior external_state_status>, '{"note": "...", "new_job_id": "..."}')`. The `event` value is the new `JobDeadLetterEvents.Requeued` constant (Task 1 step 3).
5. Commit.
6. Return `Result.Requeued(newJobId, originalJobId)`.

The audit call is the handler's job (Task 7), not the service's — same separation as `JobDeadLetterService.ResolveUnclassifiedAsync` (`JobDeadLetterService.cs:42-47`: "Domain service for job_dead_letter triage" — owns the DB transition, not the audit log).

- [ ] **Step 3: Run → green.** Commit.

```bash
git add apps/api/Modules/Jobs/Services/DeadLetterQueryService.cs \
        apps/api/Modules/Jobs/Services/DeadLetterQueryService.Spec.cs
git commit -m "feat(jobs): A5 DeadLetterQueryService (list + get + requeue) (#636)"
```

## Task 6: `SystemJobDefinitionQueryService` + spec (with the no-double-rotation contract)

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
public async Task ItShouldUpdateCronWritingTheNewCronWithoutRotatingTheScheduleEpoch() { ... }
// Verdict-r1 MAJOR fix #4: UpdateCronAsync does NOT rotate schedule_epoch.
// Assert: read schedule_epoch before the cron update, read it after, assert
// equality. The engine's SyncSystemJobsJob.SyncOneAsync (lines 263-274) is the
// ONLY writer of schedule_epoch on cron mismatch; the staff service must
// let that path do its job. Rotating here would leave the live Quartz
// trigger's JobDataMap carrying the OLD epoch while the DB carries the NEW
// one — the next cron fire would be rejected as "system_job.fire_rejected"
// (EnqueueSystemJobJob.cs:90-95) for up to 60s.

[Fact]
public async Task ItShouldRefuseAnInvalidCronExpression() { ... } // returns typed InvalidCron with the reason

[Fact]
public async Task ItShouldTriggerNowEnqueuingOneQueueRow() { ... } // delegates to IEnqueueSystemJobBoundary
```

Run: red.

- [ ] **Step 2: Implement the service.** All four mutations use a single-statement conditional UPDATE pattern (mirror the engine's `EnqueueSystemJobJob.cs:100-107` style). The cron validation uses `Quartz.CronExpression.IsValidExpression(newCron)` (the same library the engine already trusts at `SyncSystemJobsJob.cs:82`). The schedule_epoch is NOT touched by `UpdateCronAsync` — the implementation does a plain `UPDATE system_job_definitions SET cron_expression = $1, updated_at = now() WHERE id = $2 AND is_deleted = false RETURNING schedule_epoch` and returns the unchanged epoch. The next `SyncSystemJobsJob` pass detects the cron mismatch in `SyncOneAsync` (lines 263-274), rotates the epoch, deletes the old trigger, and installs a new one with the new epoch — the staff service stays out of that path.

  **60s warm-up constraint (verdict-r1 MEDIUM fix #3):** the `TriggerNowAsync` path documents that a freshly-seeded `system_job_definition` with no live Quartz trigger yet (the 60s `SyncSystemJobsJob` has not run) will use the seeder's `schedule_epoch` default (the value produced by `gen_random_uuid()` at insert time per `SystemJobDefinitionConfiguration.cs:14`). The enqueue lands under that epoch. The first reconcile then sees cron match, does not rotate, and installs a trigger with the same epoch. Until that reconcile runs, the enqueued occurrence is the only record of the trigger-now — there is no trigger to drive future fires. This is documented in the handler spec, not fixed (the alternative would be to call Quartz directly from the staff service, which crosses the boundary the plan explicitly avoids).

- [ ] **Step 3: Run → green.** Commit.

```bash
git add apps/api/Modules/Jobs/Services/SystemJobDefinitionQueryService.cs \
        apps/api/Modules/Jobs/Services/SystemJobDefinitionQueryService.Spec.cs
git commit -m "feat(jobs): A5 SystemJobDefinitionQueryService (list + get + update + trigger) (#636)"
```

## Task 7: Routes, endpoints, handlers, validators, i18n keys

**Files:** Modify `apps/api/Modules/Jobs/Routes.Jobs.cs`; Create `apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.cs` + the ten handlers (4 list+get, 1 mutation requeue, 1 list+get, 3 system-job mutations, 1 trigger) and their co-located `*Spec.cs` files; Modify `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json`; run `just generate-response-keys`; Modify `apps/api/Modules/Jobs/Handlers/Staff/PayloadRedaction.cs` + `PayloadRedaction.Spec.cs`.

### 7a. Route constants (KEEPING K-1 IN PLACE)

**Critical — the brief's non-negotiable fix #1.** The existing K-1 constants at `apps/api/Modules/Jobs/Routes.Jobs.cs:7-14` are PRESERVED UNCHANGED. `Routes.Jobs.ForStaff.Root = "/dead-letter"` at line 8 stays; the K-1 `ResolveUnclassified` route at `/staff/dead-letter/{id}/resolve-unclassified` is never moved. The new constants are ADDED below the existing block:

```csharp
public static class Jobs {
    public static class ForStaff {
        // K-1 (#863): operator triage of an Unclassified dead-lettered job.
        public const string Root = "/dead-letter";                 // KEEP — K-1
        public const string ResolveUnclassified = "/{deadLetterId}/resolve-unclassified";  // KEEP — K-1
        public static string ResolveUnclassifiedFn(string deadLetterId) {
            return $"/{deadLetterId}/resolve-unclassified";        // KEEP — K-1
        }

        // A5 (#636): new sub-route for the staff jobs dashboard. Sibling root
        // — does NOT replace K-1's /dead-letter. The new DLQ list/get reads
        // live at /staff/jobs/dead-letter/* (joined with JobsRoot) and the
        // new requeue POST lives in the EXISTING K-1 MapGroup at
        // /staff/dead-letter/{id}/requeue (so it does not move). See
        // Task 7b for the path layout.
        public const string JobsRoot = "/jobs";

        public static class Queue {
            public const string Root = "/queue";
            public const string GetById = "/{queueItemId}";
            public static string GetByIdFn(string queueItemId) => $"/{queueItemId}";
        }

        public static class DeadLetter {
            // A5 DLQ READS (list, get-by-id). The K-1 requeue POST lives
            // in the EXISTING MapGroup at /dead-letter; this is the
            // sibling for the list/get surfaces only.
            public const string Root = "/dead-letter";
            public const string GetById = "/{deadLetterId}";
            public static string GetByIdFn(string deadLetterId) => $"/{deadLetterId}";
        }

        public static class SystemJobs {
            public const string Root = "/system-jobs";
            public const string GetById = "/{systemJobId}";
            public static string GetByIdFn(string systemJobId) => $"/{systemJobId}";
            public const string UpdateEnabled = "/{systemJobId}/enabled";
            public const string UpdateCron = "/{systemJobId}/cron";
            public const string Trigger = "/{systemJobId}/trigger";
        }
    }
}
```

### 7b. Endpoint group (THREE groups, no path moves)

**Critical — the brief's non-negotiable fix #1, again.** Three new `MapGroup`s for the A5 surfaces, all joined with `Routes.Jobs.ForStaff.JobsRoot = "/jobs"`, plus an EXTENSION of the existing K-1 `MapGroup` for the requeue route. The K-1 `MapGroup` is NOT re-rooted.

**Same-path groups are intentional (#1458 follow-up 4).** Below, `sysGroup` (HeavySearchList), `sysMutationGroup` (AuthenticatedDefault), and `triggerGroup` (SystemJobTrigger) deliberately build THREE `MapGroup`s over the SAME `/staff/jobs/system-jobs` path prefix with DIFFERENT `RequireRateLimiting` policies — each policy applies to only the routes registered through its own group variable. Do NOT "deduplicate" them into one group: merging would put the reads and the trigger into one rate-limit bucket, and the trigger must not share the general bucket (Global Constraint 4).

```csharp
// apps/api/Modules/Jobs/Endpoints/JobVisibilityEndpointsForStaff.cs
public static class JobVisibilityEndpointsForStaff {
    public static IEndpointRouteBuilder MapJobVisibilityEndpointsForStaff(
        this IEndpointRouteBuilder routes
    ) {
        // /staff/jobs/queue — reads only, heavy-search list.
        // The group is at /staff/jobs/queue (the new JobsRoot + Queue.Root).
        var queueGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.JobsRoot, Routes.Jobs.ForStaff.Queue.Root)
        )
            .RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
            .WithTags("Staff Jobs");

        queueGroup.MapGet(Routes.Jobs.ForStaff.Queue.GetById, GetJobQueueItemForStaff.Handle)
            .WithName("StaffJobQueueGetById")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        queueGroup.MapGet("/", FindJobQueueItemsForStaff.Handle)
            .WithName("StaffJobQueueFind")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        // /staff/jobs/dead-letter — READS (list, get-by-id) only, heavy-search list.
        // The POST /staff/dead-letter/{id}/requeue lives in the EXTENDED K-1 group
        // (see below) — it is NOT added here so the requeue path stays at the K-1
        // root, /staff/dead-letter/.
        var dlqReadsGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.JobsRoot, Routes.Jobs.ForStaff.DeadLetter.Root)
        )
            .RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
            .WithTags("Staff Jobs");

        dlqReadsGroup.MapGet(Routes.Jobs.ForStaff.DeadLetter.GetById, GetDeadLetterForStaff.Handle)
            .WithName("StaffDeadLetterGetById")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        dlqReadsGroup.MapGet("/", FindDeadLettersForStaff.Handle)
            .WithName("StaffDeadLetterFind")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        // /staff/jobs/system-jobs — reads, updates, trigger.
        var sysGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.JobsRoot, Routes.Jobs.ForStaff.SystemJobs.Root)
        )
            .RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)
            .WithTags("Staff Jobs");

        sysGroup.MapGet(Routes.Jobs.ForStaff.SystemJobs.GetById, GetSystemJobDefinitionForStaff.Handle)
            .WithName("StaffSystemJobDefinitionGetById")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        sysGroup.MapGet("/", FindSystemJobDefinitionsForStaff.Handle)
            .WithName("StaffSystemJobDefinitionFind")
            .WithPermission([AppPermissions.Staff.Jobs.VIEW]);

        var sysMutationGroup = routes.MapGroup(
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.JobsRoot, Routes.Jobs.ForStaff.SystemJobs.Root)
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
            PathUtils.Join(Routes.Staff.Root, Routes.Jobs.ForStaff.JobsRoot, Routes.Jobs.ForStaff.SystemJobs.Root)
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

Extend the existing `JobDeadLetterEndpointsForStaff.cs` (the K-1 group at `Routes.Jobs.ForStaff.Root = "/dead-letter"`, `apps/api/Modules/Jobs/Endpoints/JobDeadLetterEndpointsForStaff.cs:13-29`) by adding the requeue route to its existing `group`. **No new MapGroup is created for the requeue path** — that would clash with the K-1 group. The requeue POST therefore lives at `/staff/dead-letter/{id}/requeue` (the K-1 root, sibling to `/staff/dead-letter/{id}/resolve-unclassified`):

```csharp
group.MapPost(Routes.Jobs.ForStaff.DeadLetter.Requeue, RequeueDeadLetterForStaff.Handle)
    .WithName("RequeueDeadLetter")
    .WithSummary("Requeue a dead-lettered job back into job_queue")
    .WithReqBodyValidation<RequeueDeadLetterForStaffBody>()
    .WithPermission([AppPermissions.Staff.Jobs.REQUEUE]);
```

(Where `Routes.Jobs.ForStaff.DeadLetter.Requeue` is a NEW constant in the A5 nested class — `public const string Requeue = "/{deadLetterId}/requeue";` and `public static string RequeueFn(string deadLetterId) => $"/{deadLetterId}/requeue";`. The constant is added in Task 7a above.)

### 7c. Handlers (10 total)

For each of the ten handlers, follow the K-1 template (`ResolveDeadLetterUnclassifiedForStaff.cs:58-141`) exactly:

- Body / Query / Result / Response / Item types are top-level siblings in the handler file (never nested).
- `Handle` is the entrypoint.
- `Guid.TryParse` for every `{id}` parameter; malformed → 404 (`ResponseKeys.DeadLetterNotFound` reuse is fine — the brief asks for "no such id", and a single 404 is consistent).
- `authContext.AccountStaff` null-check (mirror lines 81-88).
- Service result → `TypedProblems.*` mapping, with the actual current state in the 409 detail (mirror lines 101-115).
- Audit call in the handler (mirror lines 119-132).
- 200 response carries `Message` + `Key` (the transparent-failure rule).

Wire contracts (each row = one `Handle` method's response shape). The handler table distinguishes `NotFound` (404) from `NoOp` (200) per the verdict-r1 MEDIUM fix #2 — the disabled-key case surfaces as 200 with the `system-job-trigger-noop` key, not 404:

| Handler | Verb | Success body | Failure shapes |
|---|---|---|---|
| `FindJobQueueItemsForStaff.Handle` | `GET /staff/jobs/queue` | `200 FindJobQueueItemsResponse : CursorPaginatedResult<JobQueueListItem>` | `400` bad cursor / sort_id |
| `GetJobQueueItemForStaff.Handle` | `GET /staff/jobs/queue/{id}` | `200 JobQueueItemDetail` | `404` |
| `FindDeadLettersForStaff.Handle` | `GET /staff/jobs/dead-letter` | `200 FindDeadLettersResponse : CursorPaginatedResult<DeadLetterListItem>` | `400` |
| `GetDeadLetterForStaff.Handle` | `GET /staff/jobs/dead-letter/{id}` | `200 DeadLetterDetail { ..., payload: string \| { redacted: true, reason: string }, events: JobDeadLetterEvent[] }` | `404` |
| `RequeueDeadLetterForStaff.Handle` | `POST /staff/dead-letter/{id}/requeue` | `200 DeadLetterRequeuedResponse { job_id, message, key }` | `404`, `409` already-requeued |
| `FindSystemJobDefinitionsForStaff.Handle` | `GET /staff/jobs/system-jobs` | `200 FindSystemJobDefinitionsResponse : CursorPaginatedResult<SystemJobDefinitionListItem>` | `400` |
| `GetSystemJobDefinitionForStaff.Handle` | `GET /staff/jobs/system-jobs/{id}` | `200 SystemJobDefinitionDetail { ..., recent_occurrences: SystemJobOccurrence[] }` | `404` |
| `UpdateSystemJobDefinitionEnabledForStaff.Handle` | `PATCH /staff/jobs/system-jobs/{id}/enabled` | `200 SystemJobDefinitionUpdatedResponse { id, is_enabled, message, key }` | `404`, `409` protected-key |
| `UpdateSystemJobDefinitionCronForStaff.Handle` | `PATCH /staff/jobs/system-jobs/{id}/cron` | `200 SystemJobDefinitionUpdatedResponse { id, cron_expression, schedule_epoch, message, key }` | `404`, `422` invalid cron |
| `TriggerSystemJobDefinitionForStaff.Handle` | `POST /staff/jobs/system-jobs/{id}/trigger` | `200 SystemJobTriggeredResponse { job_id, scheduled_fire_at, schedule_epoch, message, key }` | `200` with key `system-job-trigger-noop` for disabled key, `404` for unknown id |

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

### 7f. `PayloadRedaction` (allowlist-based, FAIL-CLOSED)

**Critical — the brief's non-negotiable fix #6 (verdict-r1 MAJOR finding #5).** The redactor is a small static class. The sensitive job types live in an allowlist with explicit families:

Sensitive families (#1458 follow-up 2 — real job keys use DASHES, so both spellings are covered):

- `email.` prefix AND `email-` prefix — any job_type starting with `email.` (`email.tenant-invitation.v1`, `email.password-reset.v1`, `email.verify-email.v1`, `email.staff-invitation.v1`) or `email-` (`email-log-retention`, `email-prepared-sends-retention`), where payloads carry email bodies and recipient lists.
- `socialaccount.` / `social-account-` — the social-accounts job family in both spellings (even though no system job exists in this family yet, the boundary is here to protect any future worker that may add one).
- `messaging.` — the prepared-send state job family, which carries token-bearing prepared bytes per the K-3 retention sweep.

The allowlist is fail-closed: a job_type that does NOT match a known-safe pattern is **fully redacted** by default. The redactor's contract:

- The `PayloadRedaction.Redact(jobType, payloadJson)` method returns the original `payloadJson` only if the job_type matches a known-safe pattern — the explicit safe-list is a constant naming the REAL seeded, payload-free system job keys: `session-cleanup`, `email-log-retention`, `job-dead-letter-retention`, `system-job-occurrence-retention`, `upload-orphan-reclaim`.
- For any job_type that is NOT in the safe-list, the method returns the redacted envelope `{"redacted": true, "reason": "sensitive-payload-staff-redacted"}`. This is the fail-closed default.
- A `null` or empty `payloadJson` returns `""` unchanged.

The redactor's unit spec is `PayloadRedactionSpec.cs` and covers:

```csharp
[Fact]
public void ItShouldRedactEmailDotJobTypes() { ... } // email.tenant-invitation.v1 → redacted
[Fact]
public void ItShouldRedactEmailDashJobTypes() { ... } // email-prepared-sends-retention → redacted
[Fact]
public void ItShouldRedactSocialAccountJobTypes() { ... } // socialaccount.foo AND social-account-foo → redacted
[Fact]
public void ItShouldRedactMessagingJobTypes() { ... } // messaging.foo → redacted
[Fact]
public void ItShouldRedactUnknownJobTypesByDefault() { ... } // bogus.unknown → redacted (FAIL-CLOSED)
[Fact]
public void ItShouldPassThroughSafeSeededJobKeys() { ... } // upload-orphan-reclaim, session-cleanup, job-dead-letter-retention, system-job-occurrence-retention, email-log-retention → raw payload
[Fact]
public void ItShouldReturnEmptyForNullOrEmptyPayload() { ... } // null/"" → ""
```

- [ ] **Step 1: Write the failing payload-redaction spec.** Six cases.
- [ ] **Step 2: Implement `PayloadRedaction.Redact`.** Six test cases.
- [ ] **Step 3: Commit each layer:**

```bash
git commit -m "feat(jobs): A5 Routes + Endpoints + Requeue + payload redaction (#636)"
git commit -m "feat(jobs): A5 handlers + i18n + redaction policy (#636)"
```

(Per-implementation commits per layer; not one mega-commit.)

## Task 8: Endpoint integration specs (one per handler + the 10-route group spec)

**Files:** Create one `*.Spec.cs` per handler in `apps/api/Modules/Jobs/Handlers/Staff/` + `JobVisibilityEndpointsForStaff.Spec.cs` + `SystemJobTriggerRateLimit.Spec.cs`.

**Critical — the brief's non-negotiable fix #8 (verdict-r1 MAJOR finding about 9 vs 10).** The group spec covers ALL TEN A5 routes, not nine. Route count breakdown:

1. `GET /staff/jobs/queue` (`FindJobQueueItemsForStaff.Handle`)
2. `GET /staff/jobs/queue/{id}` (`GetJobQueueItemForStaff.Handle`)
3. `GET /staff/jobs/dead-letter` (`FindDeadLettersForStaff.Handle`)
4. `GET /staff/jobs/dead-letter/{id}` (`GetDeadLetterForStaff.Handle`)
5. `POST /staff/dead-letter/{id}/requeue` (`RequeueDeadLetterForStaff.Handle` — lives in the K-1 group)
6. `GET /staff/jobs/system-jobs` (`FindSystemJobDefinitionsForStaff.Handle`)
7. `GET /staff/jobs/system-jobs/{id}` (`GetSystemJobDefinitionForStaff.Handle`)
8. `PATCH /staff/jobs/system-jobs/{id}/enabled` (`UpdateSystemJobDefinitionEnabledForStaff.Handle`)
9. `PATCH /staff/jobs/system-jobs/{id}/cron` (`UpdateSystemJobDefinitionCronForStaff.Handle`)
10. `POST /staff/jobs/system-jobs/{id}/trigger` (`TriggerSystemJobDefinitionForStaff.Handle`)

- [ ] **Step 1: One spec per handler, all on `ApiFixture`.** Mirror `ResolveDeadLetterUnclassifiedForStaffSpec.cs` (the K-1 spec, 438 lines, the file is `apps/api/Modules/Jobs/Handlers/Staff/ResolveDeadLetterUnclassified.Spec.cs` even though the class is `ResolveDeadLetterUnclassifiedForStaffSpec` — match the same convention for the A5 files): tests the happy path (200 with the expected body shape), 404 unknown id, 404 malformed id, 403 unprivileged staff, 409 conflict per handler, and the audit row for mutations. Use `TestAuthClient.LoginAsStaffAdminAsync()` for the happy path; create an unprivileged staff user via the same `CreateUnprivilegedStaffUserAsync` helper (copy from `ResolveDeadLetterUnclassified.Spec.cs:345-371`).

- [ ] **Step 2: `JobVisibilityEndpointsForStaff.Spec.cs`** — the **10-route** reachability spec. Login as staff admin, GET each of the 10 routes with a known seeded definition → 200 for reads, 200 for the trigger (one row inserted), PATCH cron + PATCH enabled each → 200, POST requeue → 200. Then an unprivileged staff user, walk all 10 → 403. The test name is `ItShouldReachAllTenStaffJobsRoutesForStaffAdminAndForbiddenForUnprivileged`.

- [ ] **Step 3: `SystemJobTriggerRateLimit.Spec.cs`** — the rate-limit test: 31st trigger within 60s on the same session → 429 (the policy default is 30 / 60s, so the 31st must be refused). **Partition key (#1458 follow-up 5): the validated session fingerprint** (`ApiRateLimitPartitionKeys.GetSessionFingerprint` — the hashed validated session id stamped by session auth, falling back to `unauthenticated:<hashed client ip>` before validation). Two different staff sessions therefore have independent 30-permit budgets; the spec drives 31 requests through ONE session token and asserts the 31st is 429 while a second session's request still passes. Mirror the `ComprehensiveRateLimiting.Spec` style for constructing settings.

- [ ] **Step 4: Run `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test` → all green. Commit.**

```bash
git add apps/api/Modules/Jobs/Handlers/Staff
git commit -m "test(jobs): A5 endpoint specs (handlers + rate-limit + 10-route group) (#636)"
```

## Task 9: Kiota regeneration + front routes

**Files:** Modify `apps/front/src/routes.ts`; run `just build-api && just generate-client`; create `apps/front/src/lib/i18n.namespaces.ts` update (the file is hand-maintained — add the `staff-jobs` entry to `FEATURE_I18N_NAMESPACES`).

- [ ] **Step 1: `just build-api && just generate-client && pnpm --filter front typecheck`** — this generates the ten new route methods + their typed responses in `packages/client-ts/`. The `pnpm typecheck` step surfaces any missing client method or schema drift. Commit `packages/client-ts/`.

- [ ] **Step 2: Register the front routes.** In `apps/front/src/routes.ts`, add inside the `/staff` group (mirror how `staff/audit-logs` is registered as a flat route, NOT a layout — but A5's `staff/jobs` subtree mirrors `staff/dashboard` which IS a layout with three sibling index pages; the A5 design is a layout because the three pages share i18n state, sidebar selection, and a top-level page header, which the flat `audit-logs` page does not have). The verdict-r1 MINOR finding about "mirrors the audit-logs surface exactly" is partially correct — the list page mirrors `audit-logs.tsx`, but the route tree mirrors `staff/dashboard.tsx` because the subtree has three sibling pages with shared chrome.

```typescript
route('/staff/jobs', 'authed/staff/jobs.tsx', [
    index('authed/staff/jobs/queue.tsx'),
    route('/dead-letter', 'authed/staff/jobs/dead-letter.tsx'),
    route('/system-jobs', 'authed/staff/jobs/system-jobs.tsx'),
]),
```

The nested layout route is used (instead of the flat pattern from `staff/audit-logs`) because the three pages need a shared header, shared sidebar, and shared i18n state — exactly the pattern `staff/dashboard.tsx` already uses. A flat registration would force the implementer to duplicate that chrome in every page; the layout is the right tool.

- [ ] **Step 3: Register the namespace.** In `apps/front/src/lib/i18n.namespaces.ts` (hand-maintained, confirmed by reading the file — it has no generated marker, only the explicit `FEATURE_I18N_NAMESPACES` array):

```typescript
export const FEATURE_I18N_NAMESPACES = [
    'auth',
    'account',
    'settings',
    'organizations',
    'posts',
    'staff-tenant-profiles',
    'staff-users',
    'staff-invitations',
    'staff-audit-logs',
    'staff-jobs', // A5 (#636)
    'landing',
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

- [ ] **Step 2: Implement the hooks.** Mirror `staff-audit-logs.ts`:
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

- [ ] **Step 3: Implement `_columns-*.tsx` files.** Three column files, one per page. Each is a `makeXxxColumns(t, locale)` factory (no arrow components — methods stay methods, per `publy/arrow-function-components` at `error` severity in front). Action buttons are gated on per-permission booleans derived from the auth payload (see Step 3.5 below for the derivation).

- [ ] **Step 3.5: Per-action permission derivation (CRITICAL — verdict-r1 MINOR finding #5, corrected by #1458 follow-up 1).** There is NO `useStaffJobPermissions()` helper today. The implementer MUST derive per-action gating from a REAL auth payload — and #1458's literal replacement must itself be read carefully:

  - #1458 names `client.staff.permissions.scopes.staff.get({queryParameters: {language}})` as the real front call. That endpoint EXISTS (`GET /staff/permissions/scopes/staff`, consumed by `apps/front/src/lib/query/staff-profiles.ts:509`), but its payload is the PERMISSION CATALOG: `PermissionAsStaffService.FindStaffPermissionsAsync` reflects over EVERY property of `AppPermissions.Staff` and filters only to permissions defined in the database — it lists all definable permissions for any staff session and knows nothing about who is GRANTED them. Gating UI actions on it would show every button to everyone. Do NOT use it for gating.
  - The payload that DOES carry the caller's effective permission keys is `GET /auth/scope-auth-data?scope=staff` (`GetScopeAuthData.cs`): it returns `GetScopeAuthDataStaff` whose `Permissions: List<string>` is flattened from the staff user's profiles at lines 119-123. In the regenerated Kiota client this is `client.auth.scopeAuthData.get({ queryParameters: { scope: 'staff' } })` (`packages/client-ts/src/auth/scopeAuthData/`). NOTE: Kiota collapses the handler's `Ok<GetScopeAuthDataStaff> | Ok<GetScopeAuthDataTenant>` union into the `GetScopeAuthDataTenant` model — that model already carries `code`, `profiles`, `accountLevel`, `isAdmin`, and `permissions?: string[]`, so the staff shape round-trips through it (check `code === 'staff'` defensively). If `just generate-client` produces a differently-shaped accessor, READ the regenerated files and adapt — do not guess.
  - A small `useStaffJobPermissions()` hook is created in `apps/front/src/routes/authed/staff/jobs/_permissions.ts` that wraps the scope-auth-data query and returns `{ canView, canRequeue, canUpdateSystemJob, canTriggerSystemJob }` booleans via `(data?.permissions ?? []).includes('staff.jobs.view')` etc. The hook is a thin adapter over the real effective-permission payload, not an invention.
  - While editing this file, verify the generated accessor names with `git grep -n "scopeAuthData" packages/client-ts/src/auth/index.ts` before writing the hook.

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

**Files:** Create `apps/front/e2e/staff-jobs.spec.ts`. **CRITICAL — the brief's non-negotiable fix #3 (verdict-r1 MAJOR finding).** The file lives at `apps/front/e2e/staff-jobs.spec.ts` (NOT `apps/e2e/tests/...` — there is no `apps/e2e/` directory in this tree). Runs via `pnpm --filter front exec playwright test` (per `apps/front/e2e/README.md:19`). The e2e tag guard at `apps/front/e2e/__tests__/e2e-tag-guard.test.ts` enforces the `test.describe('@staff @1454')` shape.

- [ ] **Step 1: e2e happy path.** Staff admin lands on `/staff/jobs`, sees the queue tab, switches to dead-letter, opens one row, clicks Requeue, sees the success toast, refreshes the queue tab and sees the new run. Switches to system-jobs, opens a definition, edits the cron, sees the schedule_epoch change. Clicks Trigger now on an enabled key, sees the success toast, refreshes the queue tab and sees the new run.

- [ ] **Step 2: e2e 403 path.** An unprivileged staff user lands on `/staff/jobs`, sees the queue tab but the Requeue / Trigger / Edit-cron actions are all missing (per the bulk-action convention — "bulk-action items on list-page selection menus always render — never disabled, never conditionally hidden by per-row eligibility; ineligible clicks show an i18n toast" applies; per-row action buttons follow the same "render, gate the click" pattern, mirroring the audit-logs export button which is shown but disabled when the list is empty). Direct navigation to a mutation URL returns the 403 error view (per the design tokens rule + the convention that mutation URLs are not deep-linkable for the unprivileged).

- [ ] **Step 3: e2e K-3 protected key.** Staff admin opens the system-jobs tab, locates the `email-prepared-sends-retention` definition (it's seeded by `SystemJobDefinitionSeeder.cs:140-154`; the dashed spelling matches the handler's real `JobKey` constant — #1458 follow-up 2), toggles the enabled switch → server returns 409 with the `system-job-disable-protected` key → the i18n toast shows the localized sentence; the row's enabled state is unchanged.

- [ ] **Step 4: mutation evidence.** For the PR body: temporarily comment out the `SystemJobDisableProtection.IsDisableProtected` check in `UpdateSystemJobDefinitionEnabledForStaff.Handle`, run the e2e K-3 step, capture the failure, revert, capture the pass into `.dump/mutation-check.md`.

- [ ] **Step 5: Run `pnpm --filter front test:e2e:tag @1454` (filtered by the ticket tag the e2e tag guard enforces; full local e2e is optional per the brief). Commit.**

```bash
git add apps/front/e2e/staff-jobs.spec.ts .dump/mutation-check.md
git commit -m "test(jobs): A5 e2e proof + K-3 mutation evidence (#636)"
```

## Task 13: Architecture guards + final gates

- [ ] **Step 1: Run all architecture guards.** `dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~Architecture|FullyQualifiedName~EndpointPermission|FullyQualifiedName~ServiceArgsRecord|FullyQualifiedName~RouteConstraint|FullyQualifiedName~AppRoleComposition|FullyQualifiedName~EntityConfiguration"` → all green. The `ServiceArgsRecordConvention` guard must auto-discover the new service methods and confirm their 3+-param ones use `{Action}{Domain}Args` records. If any new method is 3+ params positional, refactor it to an args record and re-run.

- [ ] **Step 2: Run the full API suite.** `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test` (using `~/ai-orchestration-playbook/tools/heavy.sh just test-api` per the verification policy). All green. If a Roslyn analyzer fires (PUBLY0001–0008), fix forward — never disable the rule, never add a suppression comment.

- [ ] **Step 3: Run all front gates.** `pnpm --filter front test` (includes design-system, z-index, i18n parity, trans-render, anti-slop, react-doctor scoped) → all green. `just react-doctor --scope files --blocking warning` (HARD gate per AGENTS.md).

- [ ] **Step 4: Run `just knip`** for unused-dependency drift on the API and the front.

- [ ] **Step 5: Run the local CI mirror.** `just ci` (per the brief: front-e2e runs on the PR in CI, not locally; the local CI mirror covers the rest). All green.

## Task 14: PR + DONE

- [ ] **Step 1: Write `.dump/pr-body.md`.** Mirror the house style: What (one paragraph), Fix-per-area (numbered list of the three API layers + the three front pages + the e2e proof), Verification (concrete commands + the mutation evidence path), `Closes #1454`, refs #636, refs #194, "Model:" line stating the lane's model. The PR body MUST add a "Round 2" section listing each verdict-r1 finding → what changed (see brief).

  **Release-note snippet (CRITICAL — verdict-r1 MEDIUM finding about K-1 backward-compat).** The PR body MUST include this line for the 6. release notes (the K-1 endpoint group at `/staff/dead-letter/*` is extended, not moved):

  > The A5 staff jobs dashboard adds three new endpoint groups at `/staff/jobs/queue`, `/staff/jobs/dead-letter`, and `/staff/jobs/system-jobs`. The existing K-1 endpoint at `/staff/dead-letter/{id}/resolve-unclassified` is unchanged, and the new POST `/staff/dead-letter/{id}/requeue` lives in the same K-1 group (sibling to `resolve-unclassified`), so no K-1 path is moved. The new DLQ list/get surfaces live under `/staff/jobs/dead-letter/*` (read-only), the new requeue lives under `/staff/dead-letter/{id}/requeue` (mutation, K-1 group). One new rate-limit policy: `SystemJobTrigger` (default 30 permits / 60 s, env-overridable).

- [ ] **Step 2: `gh pr create --draft --base develop --head lane/wt-636p --title "feat(jobs): A5 staff job-visibility dashboard (#636)" --body-file .dump/pr-body.md`.** Confirm the PR URL.

- [ ] **Step 3: Mark the PR ready.** `gh pr ready <pr-number>` (or `gh pr edit --ready`).

- [ ] **Step 4: Poll CI to green.** If `gh pr checks` reports "no checks reported on the branch" for more than a minute after the push, the PR is CONFLICTING with develop: `git fetch origin develop && git rebase origin/develop` (keep both intents, re-read every conflicted file), push with `--force-with-lease`, then wait for the checks.

- [ ] **Step 5: Write `.dump/DONE.md`** with the tip SHA, the PR URL, the green CI run URL, and the mutation evidence path. Print **DONE**.
