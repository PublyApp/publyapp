# Async full-result tenant-user export via worker jobs (Lane #286) — Implementation Plan

> **For agentic workers:** execute task-by-task, one commit per task, push after every commit. Steps use checkbox (`- [ ]`) syntax. Every task is TDD: the named spec goes RED first, then GREEN.

**Goal:** Close #286. Today the only shipped tenant-member export is `GET /staff/tenants/{tenantId}/users/export` (`ExportTenantUsersAsStaff.Handle`, `apps/api/Modules/Users/Handlers/Staff/ExportTenantUsersAsStaff.cs`): synchronous CSV streamed from the request, capped at `TENANT_USER_EXPORT_MAX_ROWS` (default 10000, `.env.example:118`) with a 400 "narrow your filters" when exceeded. The product decision recorded in #286 is explicit: the final behavior exports the **entire filtered result set**, runs **asynchronously as a worker job**, and gives the user a clear **export-job UX** instead of holding the request open. The blocker named in the issue ("future worker service") no longer exists: Epic A landed the durable job engine (`apps/api/Infrastructure/Jobs/` — `IJobEnqueuer`, `JobDefinition<T>`, `IJobHandler`, `JobQueueProcessor`, DLQ, Quartz scheduler) and A5 landed the operational dashboard over it.

**Architecture:** A new domain slice lives entirely in `apps/api/Modules/Users/` (the export is about tenant users; the Jobs module keeps hosting only cross-domain engine concerns, mirroring how `PublishingJobs` lives in `Modules/Publishing/Jobs` and `AuthEmailJobs` in `Modules/Auth/Jobs`). Four moving parts:

1. **Request entity.** `UserExportRequest` (`[Table("user_export_requests")]`, `BaseAttributes` + `ITenantEntity`): one row per requested export. Columns: `tenant_id`, `requested_by_user_id`, `status` (smallint: `Pending=10, Running=20, Completed=30, Failed=40`), `format` (smallint: `Csv=10, Json=20`), `filters_json` (jsonb — the **normalized** filter snapshot, see D4), `row_count` (int, null until completed), `error` (text, null unless failed — sanitised, plain words, owner rule 2026-08-22), `file_path` (text, null until completed — storage-relative), `file_expires_at` (timestamptz, null until completed), plus the `BaseAttributes` audit columns. Indexes: `ix_user_export_requests_tenant_created` on (`tenant_id`, `created_at desc`). Expand-only migration, applied by the one-shot `migrate` service.
2. **Job.** Definition catalog `Modules/Users/Jobs/TenantUserExportJobs.cs`: `JobDefinition<ExportTenantUsersPayload>` with `JobType = "users.export-tenant.v1"` (F14 versioned key), `Priority = 0` (bulk work, §4.1), `MaxAttempts = 3` (see D2 rationale), `Validate` rejecting empty `RequestId`/`TenantId` and unknown formats. Payload carries IDs only (`{"requestId":"…","tenantId":"…"}`) — the worker reloads the request row fresh at run time, exactly the staleness-proof pattern of `PasswordResetEmailPayload` (`Modules/Auth/Jobs/AuthEmailJobs.cs`). Handler `Modules/Users/Jobs/ExportTenantUsersJobHandler.cs`.
3. **Delivery.** The finished artifact is written through `IFileStorage.SaveAsync` and downloaded from the existing static-files mount: `Program.cs` serves `fileStorage.RootPath` at `RequestPath = "/files"` with `ServeUnknownFileTypes = false` — Task 7 extends the extension allowlist with `csv` and `json`. `SaveAsync` generates server-side UUID v7 names under `uploads/yyyy/MM/` (extension validated against `^[a-z0-9]{1,8}$`, traversal-proof per `LocalDiskFileStorage`). `ServedUploadPath.ExtractOrNull` only recognizes image extensions, so export blobs are invisible to upload reference accounting — zero coupling, verified by construction.
4. **UX.** The staff tenant-users page grows an export drawer (mirroring `routes/authed/staff/audit-logs/_audit-log-export-drawer.tsx` in placement and interaction): pick CSV or JSON, capture the active `q`/`status`/`level` URL state, POST the job, then poll. **Selected-rows export stays exactly as it is** (≤100 IDs, instant, synchronous) — the async path exists precisely for the case the sync path refuses: whole-filtered-result exports.

## Design decisions (with alternatives)

**D1 — One job type, IDs-only payload.** Alternatives: (a) embedding filters in the payload was rejected: the request row is the single source of truth for status/progress/artifact, and a payload copy invites drift; (b) a generic "query export" engine was rejected as speculative: one concrete job type ships the behavior the issue asks for.

**D2 — MaxAttempts 3, priority 0.** An export is user-initiated: three attempts span roughly the period during which the requester still cares, versus the ~2h-of-retries default of 10 (`JobBackoff.DefaultMaxAttempts`); each retry re-runs a heavy scan, so ten attempts would hammer the database for a request nobody is waiting on anymore. The failed end state is always visible on the request row (D6), never only in the DLQ.

**D3 — Idempotency and dedup.** At-least-once execution is the engine contract. The handler guards re-runs: a request already `Completed` yields `JobOutcome.Cancelled("already-completed")` (never rewrites the file), a request already `Failed` stays failed. Enqueue passes `EnqueueOptions.IdempotencyKey = $"users-export:{tenantId}:{format}:{sha256(canonical-filters)[..32]}"` so the engine's per-job_type partial unique index collapses duplicate in-flight submissions; the POST handler additionally looks up an active (`Pending`/`Running`) request with the same tenant/format/filter-hash first and returns it instead of enqueuing (200 with the existing request), so the UI cannot stack duplicates by double-clicking. Permanent "never twice" semantics are intentionally NOT claimed: requesting the same export again after completion is legitimate.

**D4 — Filter snapshot is normalized, typed JSON.** `filters_json` stores `{"search":string|null,"statuses":[wire],"levels":[wire]}` — the output of the same normalizers the sync path uses (`TenantUserFilterQuery.NormalizeSearch/ParseStatuses/ParseLevels`), never raw query strings, and never `ids` (selection export stays synchronous). The worker rebuilds `ExportTenantUsersArgs` from this snapshot, so the export reflects exactly what the user saw. Sort order is fixed (`created_at desc, user_id desc` — the existing `FindExportRowsAsync` ordering), deliberately independent of the list page's sort: an export is a dataset, not a screenshot.

**D5 — Paging in the worker.** New service method `FindExportRowsPageAsync(tenantId, args, afterCreatedAt, afterUserId, pageSize)` on `ITenantUserQueryService` continuing the existing keyset (`orderby ua.User.CreatedAt descending, ua.UserId descending`), page size 1000, looped to exhaustion. Alternative: one unbounded `Take(cap)` query was rejected — a 250k-row materialization holds memory and a connection for minutes; keyset paging stays resumable and cancellation-friendly.

**D6 — Status transitions and failure causes.** All writes to the request row go through ONE service (`Modules/Users/Services/UserExportRequestService.cs`, `[Service(ServiceLifetime.Scoped)]`, discriminated-union results like `FindTenantUsersResult`): single-statement conditional UPDATEs (`WHERE id = $1 AND status = $expected`) make lost-lease re-runs safe. `OnTerminalFailureAsync` flips the request to `Failed` inside the engine's terminal transaction with `LastError` carried into `error` — a dead-lettered export ALWAYS pairs with a visible failed request row, satisfying the transparent-failure rule (plain words, sanitised via the engine's `JobErrorSanitizer` bounding). Row-count safety valve: `USER_EXPORT_JOB_MAX_ROWS` (default 250000) — exceeding it fails the job with a cause naming the cap and the next action ("narrow your filters"), never a silent truncation.

**D7 — Retention.** Files expire (`file_expires_at = completed_at + USER_EXPORT_FILE_RETENTION_DAYS`, default 7 days) because they are unauthenticated-at-the-mount, UUID-guessed-only artifacts containing PII. New system job `user-export-file-retention` (handler `Modules/Users/Jobs/ExportFileRetentionHandler.cs`): deletes expired blobs via `IFileStorage.DeleteAsync`, then prunes request rows older than `USER_EXPORT_REQUEST_RETENTION_DAYS` (default 30; the durable history is the audit log, per the junction/history rule in AGENTS.md). Seeded in `SystemJobDefinitionSeeder.GetDefinitions()` daily at 04:30 (staggered after the 04:00/04:15 sweeps), which `SyncSystemJobsJob` reconciles automatically. Honest consequence, flagged for owner review: anything served under `/files` is bearer-URL (unchanged from today's logos/avatars); exports rely on UUID-v7 unguessability plus short expiry. If private signed downloads are ever wanted, that is an `IFileStorage` contract extension for the whole mount, filed separately as follow-up lv2.

**D8 — Permissions, rate limit, audit.** POST/GET routes sit on the existing users group with `.WithPermission([AppPermissions.Staff.Users.LIST_FOR_TENANT])` — the exact gate the sync export uses today; splitting a dedicated `users.export_for_staff` permission multiplies seeder churn without a security boundary gain (the data read is the same bulk read). Creation reuses the existing `ApiRateLimitPolicies.TenantExport` bucket (it exists for precisely this resource family, `Lib/RateLimiting/EndpointRateLimitAssignments.Spec.cs` pins assignments); reads use `HeavySearchList`. Audit: ONE row, `AuditActions.TenantUserExported` (constant already exists, `Modules/AuditLogs/Entities/AuditLog.cs:109`), written by the worker on completion with details `{requestId, rowCount, filters, format}` — the audited event is the PII bulk-read having happened; the request row itself records intent/request. The sync path's audit stays untouched.

**Wire conventions:** camelCase JSON fields, snake_case query params; `POST` success → 201 `Created<UserExportRequestResult>`; poll/list → 200; malformed tenant GUID → 400 `TypedProblems.BadRequest`; unknown request id → 404; invalid body → 422 with stable keys. `UserExportRequestResult`: `{id, status, format, rowCount, error, fileUrl, fileExpiresAt, createdAt, updatedAt}` — `fileUrl` present only when `Completed` and unexpired, `error` present only when `Failed` (cause in plain words, next action included).

## Global constraints (blocking)

- Analyzers PUBLY0001–0008 are errors: `is null`/`is not null`; never `?? throw`; never the null-forgiving operator; never `ToLower()` dispatch; no `Dto` suffix on wire types; cache body-getter results used twice; handlers orchestrate, services implement (handlers inject services only, never `DbContext`); staff paths use `*ForStaff*` service variants where applicable; max 100-char lines; braces always.
- No disable/suppression comments, no guard/allowlist loosening, no `test.skip`, no retries-as-evidence. Class methods stay methods (never arrows). Boring SOLID/DDD structure.
- Migrations expand-only; `just ci-migration-expand-contract` stays green; `just db-add AddUserExportRequests && just db-migrate` locally.
- Heavy commands run under `~/ai-orchestration-playbook/tools/heavy.sh`, focused filters first, full suite once near the end, never >20 min under the lock.
- After endpoint changes: `just build-api && just generate-client && pnpm --filter front typecheck`; commit the regenerated `packages/client-ts`; a second regen must be zero-diff.
- Front: i18n EN+FR in `common` (the tenant-users page's namespace), `<Trans>` render-guard spec for any new `<Trans>` site, design-system/z-index/knip guards green, react-doctor clean on touched files.
- New env vars are OPTIONAL with defaults (quoted into `.env.example`): `USER_EXPORT_JOB_MAX_ROWS="250000"`, `USER_EXPORT_FILE_RETENTION_DAYS="7"`, `USER_EXPORT_REQUEST_RETENTION_DAYS="30"`, wired through `AppEnvironment` with FluentValidation bounds like `TENANT_USER_EXPORT_MAX_ROWS` (`AppEnvironment.cs:524`). No required var ⇒ no Dockerfile/compose/workflow changes.
- Symbol honesty: every symbol cited here exists on `origin/develop` @ `e13ee04a7` (verified 2026-08-26). Follow-ups discovered mid-implementation get issues labeled `follow-up lv2`, not scope creep.

## File structure

**Create — API**
- `apps/api/Modules/Users/Entities/UserExportRequest.cs` (+ `UserExportRequestStatus.cs`, `UserExportFormat.cs`)
- `apps/api/Migrations/*_AddUserExportRequests.cs` (via `just db-add`)
- `apps/api/Modules/Users/Jobs/TenantUserExportJobs.cs`, `ExportTenantUsersJobHandler.cs` (+ `*.Spec.cs`), `ExportFileRetentionHandler.cs` (+ `*.Spec.cs`)
- `apps/api/Modules/Users/Services/UserExportRequestService.cs` (+ `*.Spec.cs`), `UserExportRequestFilterSnapshot.cs` (canonical serialize/deserialize + hash)
- `apps/api/Modules/Users/Handlers/Staff/CreateTenantUserExportJobForStaff.cs`, `FindTenantUserExportJobsForStaff.cs`, `GetTenantUserExportJobForStaff.cs` (+ `*.Spec.cs`)

**Modify — API**
- `apps/api/Modules/Users/Services/TenantUserQueryService.cs` — add `FindExportRowsPageAsync` (keyset continuation; existing methods untouched)
- `apps/api/Infrastructure/Jobs/JobsServiceRegistration.cs` — `builder.AddJobHandler<ExportTenantUsersJobHandler>(TenantUserExportJobs.ExportTenantUsersV1.JobType)` beside the other worker handlers
- `apps/api/Modules/Jobs/Seeders/SystemJobDefinitionSeeder.cs` — retention entry in `GetDefinitions()`
- `apps/api/Program.cs` — allowlist `csv`/`json` in the `/files` static-file options
- `apps/api/Lib/AppEnvironment.cs` + `.env.example` — the three optional vars
- `apps/api/Modules/Users/Routes.Users.cs` — `ForTenantAsStaff.ExportJobs = "/export-jobs"`, `ExportJob = "/export-jobs/{requestId}"`
- `apps/api/Modules/Users/Endpoints/UserEndpointsForTenantAsStaff.cs` — three routes (POST → `TenantExport`, GETs → `HeavySearchList`)
- `apps/api/Lib/RateLimiting/EndpointRateLimitAssignments.Spec.cs` — pin the two new assignments
- `apps/api/openapi.json` + `packages/client-ts/**` — regenerated, committed

**Create — Front**
- `apps/front/src/routes/authed/staff/tenants/$tenantId/_users-export-drawer.tsx` (+ `*.test.tsx`) — format choice, filter recap, submit; lists recent jobs with live status, download link, plain-words errors
- `apps/front/src/lib/query/staff-tenant-users.ts` — `useCreateTenantUserExportJobMutation`, `useTenantUserExportJobsQuery` (refetchInterval while any `pending`/`running`)

**Modify — Front**
- `$tenantId/users.tsx` — render the drawer trigger in `toolbarEnd` beside `TenantUsersFilterMenus`
- `apps/front/src/i18n/locales/en/common.json` + `fr/common.json` — new keys, identical shape
- `apps/front/e2e/staff-tenant-details.spec.ts` — async-export flow spec

---

## Task 1: Entity, enums, migration

- [ ] **RED.** `apps/api/Modules/Users/Entities/UserExportRequest.Spec.cs` (real Postgres via `ApiFixture`, direct `DbContext` use like `DeadLetterRetentionHandler.Spec.cs`):

```csharp
[Fact]
public async Task ItShouldRoundTripAnExportRequestWithStatusAndFilters() {
	using var scope = _fixture.Factory.Services.CreateScope();
	var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
	var request = new UserExportRequest {
		TenantId = _tenantId,
		RequestedByUserId = _userId,
		Status = UserExportRequestStatus.Pending,
		Format = UserExportFormat.Csv,
		FiltersJson = "{\"search\":null,\"statuses\":[],\"levels\":[]}",
	};
	db.UserExportRequests.Add(request);
	await db.SaveChangesAsync();

	request.GetRequiredId().Should().NotBe(Guid.Empty);
	var reloaded = await db.UserExportRequests.SingleAsync(r => r.Id == request.Id);
	reloaded.Status.Should().Be(UserExportRequestStatus.Pending);
	reloaded.FilePath.Should().BeNull();
	reloaded.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromMinutes(1));
}
```

Plus a second fact inserting `Status = (UserExportRequestStatus)99` expecting the CHECK constraint to throw. Run `dotnet test --filter "FullyQualifiedName~UserExportRequestSpec"`: FAIL to compile (types missing). RED.

- [ ] **GREEN.** Entity inherits `BaseAttributes`, implements `ITenantEntity`; enums with the values above; `DbSet` on `AppDbContext`; snake_case mappings + `ck_user_export_requests_status_bounds`/`format_bounds` CHECKs mirroring `SystemJobDefinitionConfiguration`; `just db-add AddUserExportRequests && just db-migrate`; spec green.

## Task 2: Filter snapshot + job definition catalog

- [ ] **RED.** `UserExportRequestFilterSnapshot.Spec.cs`: round-trip `{"search":" acme ","statuses":["active"],"levels":[]}` → normalized `{search:"acme", statuses:[Active]}`; unknown wire value throws; `CanonicalJson()` is stable across key order; `StableHash()` differs per distinct snapshot. `TenantUserExportJobs.Spec.cs`: `JobType` is `"users.export-tenant.v1"`; `ValidatePayload` rejects empty `RequestId`/`TenantId`; `MaxAttempts` is 3; `Priority` is 0.
- [ ] **GREEN.** Records + catalog exactly as D1/D2/D4. `AddJobHandler` registration lands in Task 4 (the handler type must exist first).

## Task 3: Keyset paging in the query service

- [ ] **RED.** Extend the existing `TenantUserQueryService` specs: insert 25 users; `FindExportRowsPageAsync(pageSize: 10)` three times with the continuation tuple returns all 25 exactly once, stable `createdAt desc, userId desc` order; search/status filters hold across page boundaries (mirror `ApplyExportFilters` expectations).
- [ ] **GREEN.** Add the method + `AfterCreatedAt`/`AfterUserId` continuation parameters (D5); existing `FindExportRowsAsync` untouched so the sync endpoint and its specs do not move.

## Task 4: Request service + worker handler

- [ ] **RED.** `UserExportRequestService.Spec.cs` (real PG): conditional transition `Pending→Running` succeeds once and reports `Stale` on the second attempt; `Completed(rowCount, filePath, expiresAt)` and `Failed(cause)` write their payloads; unknown id → `NotFound`. `ExportTenantUsersJobHandler.Spec.cs` (worker-side, real storage root from the test environment): seeds a `Pending` request + 12 users → run → outcome `Success`, request `Completed`, `row_count == 12`, file exists under storage root, CSV starts with the `WriteCsvAsync` header line, JSON parses to a 12-element array; a request whose filters match zero users completes with `row_count == 0` and a valid empty artifact; a `Completed` re-run → `Cancelled("already-completed")` and the artifact bytes unchanged; a handler exception → `Retry` classification and the row still `Running` (lease model owns recovery); `OnTerminalFailureAsync` flips the row to `Failed` with the context's `LastError`; exceeding `USER_EXPORT_JOB_MAX_ROWS` → `PermanentFailure` with the cap named in the cause.
- [ ] **GREEN.** Implement service + handler per D3/D5/D6; register via `AddJobHandler` in `JobsServiceRegistration.AddWorkerServices`. This is the mutation-sensitive core: **adversarial mutation for the PR — delete the `row_count`/`file_path` persistence in the completion transition; `ItShouldCompleteWithRowCountFilePathAndArtifactWhenUsersMatch` must go RED, restore, GREEN.**

## Task 5: POST export-job endpoint

- [ ] **RED.** `EndpointRateLimitAssignments.Spec.cs` addition first (assignment missing → RED). `CreateTenantUserExportJobForStaff.Spec.cs` on `ApiFixture` + `TestAuthClient`: staff with `LIST_FOR_TENANT` → 201 with `status == "pending"` and no `fileUrl`; unprivileged staff → 403; malformed tenant id → 400; `format: "pdf"` → 422 stable key `format`; `q` > 200 chars → 422; duplicate POST while the first is pending returns the SAME request id (dedup, D3); audit row absent at creation (audit fires on completion, D8).
- [ ] **GREEN.** Handler + `Body` DTO (`{format, q?, status?, level?}`) + validator reusing `TenantUserFilterQuery` allowed sets; service enqueue inside the request transaction via `IJobEnqueuer` (a rolled-back write takes its job with it); endpoint metadata (`.WithName`, rate limit, `.WithPermission`, `ProducesAppProblem`). Then `just build-api && just generate-client`.

## Task 6: Poll + list endpoints

- [ ] **RED.** `FindTenantUserExportJobsForStaff.Spec.cs` + `GetTenantUserExportJobForStaff.Spec.cs`: newest-first list scoped to the tenant; another tenant's request id → 404 (no existence leak); `fileUrl` present only when completed and unexpired; failed row exposes `error` in plain words; expired artifact hides the link.
- [ ] **GREEN.** Handlers read through `UserExportRequestService`; second `just generate-client` is zero-diff; `pnpm --filter front typecheck` green.

## Task 7: Static-file allowlist + retention sweep

- [ ] **RED.** `ExportFileRetentionHandler.Spec.cs`: completed request past `file_expires_at` with a seeded blob → blob gone, row pruned past request-retention; young file untouched; `Pending` rows never touched. Integration fact: `GET /files/uploads/.../<seeded>.csv` returns 200 before expiry (proves the allowlist change) — pair with the Program.cs allowlist edit in this task.
- [ ] **GREEN.** Allowlist `csv|json` in the `StaticFileOptions` content-type provider; handler (batched, `DateTime.UtcNow` SQL-side predicate like `DeadLetterRetentionHandler`); `SystemJobDefinitionSeeder` entry (cron `0 30 4 * * ?`); seeder defaults spec updated; env vars wired + `.env.example` quoted.

## Task 8: Front export drawer + hooks + i18n

- [ ] **RED.** `_users-export-drawer.test.tsx`: renders trigger `data-testid="staff-tenant-users-export-trigger"`; choosing CSV submits `{format:"csv"}` capturing current `q`/`status`/`level`; pending job shows progress state and polls; completed shows enabled download anchor with `fileUrl`; failed shows the backend `error` verbatim (transparent cause, no manual `response-message` translation); selection-mode locks the trigger with the shared locked title (bulk-action conventions). i18n key-coverage test drives the EN/FR additions RED first.
- [ ] **GREEN.** Component on the ui-wrapper layer, hooks in `staff-tenant-users.ts` with refetchInterval while any job is `pending`/`running`; `users.tsx` mounts the drawer; EN+FR keys identical shape. Full `pnpm --filter front test` + typecheck + lint + react-doctor on touched files.

## Task 9: e2e

- [ ] `staff-tenant-details.spec.ts`: tagged describe per `docs/guides/e2e-tags.md`; intercept `POST **/export-jobs` → 201, poll → `completed` with a `fileUrl`, assert the download request fires; second test: poll → `failed` with `error` surfaced in the drawer. CI front-e2e green is the evidence (local e2e stack stays off per the verification policy).

## Task 10: Full gates + PR

- [ ] Under `heavy.sh`: module specs, then full `just test-api`; quote totals in the PR body. `just knip`, design-system/z-index guards, `just ci` before pushing.
- [ ] PR body (from `.dump/pr-body.md`): triage result (this plan = outcome c), decisions D1–D8 with alternatives, the named adversarial mutation, suite totals, `Part of #286` (implementation phases close it via their own PRs), `Model: Ox Alpha via Nous Portal (jcode), effort max`, `Unverified until review`.

## Phase issues (opened alongside this plan, all referencing #286)

1. **Phase 1 — Backend: request model, job, endpoints, retention** (Tasks 1–7) — label `backend`, `users`.
2. **Phase 2 — Frontend export-job UX + i18n** (Task 8) — label `frontend`, `staff-users`.
3. **Phase 3 — e2e coverage** (Task 9) — label `frontend`.

Each phase lands as its own PR referencing #286; Phase 3's merge closes #286.
