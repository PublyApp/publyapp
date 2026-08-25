# D3 — Publication scheduling implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Prerequisites / cross-branch dependencies (blocking)

D3 consumes foundation symbols that are **NOT on `develop`** (`bfe5cf0b3` at review time; re-verify at implementation start). They live on **`origin/lane/wt-644` (D1, PR pending)**. This plan is executable **only after D1 merges into develop**. Do not start before; if any symbol below is still missing from the merged tree at implementation start, STOP and land/rebase D1 first — never replicate D1 surface here.

Consumed from `lane/wt-644` (paths verified via `git ls-tree` / `git show` on `origin/lane/wt-644` = `565c7ecfa`):

| Symbol | Exact file (wt-644) |
|---|---|
| `Publication` entity (+ `PublicationWire.FormatStatus`) | `apps/api/Modules/Publishing/Entities/Publication.cs` |
| `PublicationConfiguration` | `apps/api/Modules/Publishing/Entities/PublicationConfiguration.cs` |
| `PublicationStatus` (`Scheduled=10, InProgress=20, Published=30, Failed=40, Paused=50`) | `apps/api/Modules/Publishing/Entities/PublicationStatus.cs` |
| `PublicationSchedule` (sealed record; `ScheduledAtUtc`, `ScheduledTimeZone`, `MaxTimeZoneLength = 64`) | `apps/api/Modules/Publishing/Entities/PublicationSchedule.cs` |
| `IPublicationStatusTransitionService` + `PublicationStatusTransitionService` (single file; `MarkInProgressAsync/MarkPublishedAsync/MarkFailedAsync/MarkPausedAsync/RescheduleToNowAsync(publicationId, tenantId, …, ct)` each returning `Task<bool>`) | `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` |
| `PublishingJobs.PublishPublicationV1` (`JobType = "publishing.publish-publication.v1"`, `MaxAttempts = 3`, `Validate` asserts `IdempotencyKey == PublicationIdempotencyKey.For(PublicationId)`) + `PublishPublicationPayload` | `apps/api/Modules/Publishing/Jobs/PublishingJobs.cs` |
| `PublishPublicationJobHandler` (worker handler; reloads row, `MarkInProgressAsync` → `ISocialSessionProvider.OpenSessionAsync` → classified outcomes) | `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` (+ `.Spec.cs`) |
| `IPublishProvider` / `BlueskyPublishProvider` / `PublishRequest` / `PublishResult` (`Published`, `AlreadyExistsTreatedAsPublished`, `AccountFailure`, `ContentFailure`, `TransientFailure`) | `apps/api/Modules/Publishing/Providers/*.cs` |
| `PublicationIdempotencyKey.For(Guid)` | `apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs` |
| `PostStatusDerivation.Derive(IReadOnlyCollection<Publication>) → DerivedPostStatus` | `apps/api/Modules/Publishing/Lib/PostStatusDerivation.cs` |
| `PublicationArchitecture.Spec` (no-rogue-writer source scan) | `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` |

Everything else this plan names was verified on `develop` via `git ls-files` / `git grep` and is cited with its real path below.

Round-1 corrections applied here: `DispatchDuePostsJob` was claimed "reserved by Epic A" — **no reservation exists in either tree**; D3 creates it (Task 6) on top of the REAL jobs infrastructure `apps/api/Infrastructure/Jobs/*` (`IJobEnqueuer`, `IJobHandler`, `JobDefinition<T>`, `JobsServiceRegistration`). The nonexistent `docs/implementation-plans/jobs-worker-infrastructure.md` reference is removed. `PublishPublicationJobHandler`/`PublishingJobs` were previously "published by D3 as a copy" — wrong: they already exist on wt-644, so D3 consumes them (see table). Specs are cited by their real post-prune `docs/records/` paths.

**Goal:** Land Epic D step 3 (#646, part of #631; spec: `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md`): the tenant schedule endpoint (date + IANA zone → instant, one `Publication` per chosen `SocialAccount`, status `Scheduled`), the edit endpoint (post text or instants; refused with a plain-words message while any publication is `InProgress`), the cancel endpoint (delete `Scheduled` publications → post back to draft), the recurring due-scan system job (every minute, claims due `Scheduled` rows with `FOR UPDATE SKIP LOCKED`, enqueues one `publishing.publish-publication.v1` job per publication with its idempotency key, sets `InProgress`), the tenant Queue page, the tenant Calendar page, zone round-trip proofs, integration + architecture specs, and the e2e flow. Publish-now (D2) stays out of scope.

**Architecture:** New `apps/api/Modules/Publishing/**` endpoints/service/job plus a `system_job_definitions` row added to the EXISTING seeder. The front's existing `authed/tenant/posts/queue.tsx` and `calendar.tsx` placeholders (#1141 tranche) are replaced. Jobs go through `IJobEnqueuer` only (`apps/api/Infrastructure/Jobs/IJobEnqueuer.cs`; single trust boundary proven by `JobEnqueueBoundary.Spec.cs`). `Publication` lifecycle writes go through D1's `IPublicationStatusTransitionService`. Migrations: **none** — D3 makes no schema change; the due-scan cadence is config seeded by the seeder, never a migration (repo doctrine documented in `apps/api/Modules/Jobs/Seeders/SystemJobDefinitionSeeder.cs`).

**Tech Stack:** .NET 10 / EF Core 10 + Npgsql, xUnit + FluentAssertions, Testcontainers via `ApiFixture`. Front: React 19, TanStack Start/Router, Base UI wrappers (`apps/front/src/components/ui/*`), Tailwind v4, TanStack Query 5 + `@org/shared-ts/lib/query/create-hooks`, RHF + Zod, Kiota client regenerated, dayjs only via helpers, Playwright (tags `@tenant-workspace @646`).

## Global constraints (blocking)

- Analyzers PUBLY0001–0008 are errors; guard clauses; no `?? throw`, no `!`, no `ToLower()` dispatch; handlers cache repeated getter results; services depend only on DbContext + infrastructure seams (`IPublicationStatusTransitionService` is an infrastructure seam, not a service-service dependency). Max 100 char lines; braces always.
- No disable/suppression comments, no `[Fact(Skip)]`, no ruleset/guard loosening, no sub-agents/workers.
- Expand-only: D3 adds zero migrations. `just ci-migration-expand-contract` stays green trivially.
- `LastError` ≤ 2 KB sanitised via `SocialAccounts.Lib.LastErrorSanitiser.Sanitize` (`apps/api/Modules/SocialAccounts/Lib/LastErrorSanitiser.cs`). Never log secrets or session tokens.
- Heavy commands run under `~/ai-orchestration-playbook/tools/heavy.sh`; focused filters first; never > 20 min under the lock.
- "api-check" = `just build-api` + `just ci-quality-dotnet`.
- One task = one commit, push after every commit. Never touch develop.

## Reconciliation decision: which permission gates schedule/edit/cancel

The REAL posts permission set lives in `apps/api/Modules/Posts/Permissions/PostPermissionsForTenant.cs` (develop): `VIEW`/`CREATE`/`EDIT`/`PUBLISH`/`SCHEDULE`/`DELETE` — all scoped `posts.*` (keys assembled from `KeyPrefix` + separator in that file; read the constant file, never guess the literal string). There is **no** `tenant.socialaccounts.publish` permission in any tree — round 1 was right. D3 gates schedule + edit + cancel on `AppPermissions.Tenant.Posts.PUBLISH` (route-level `.WithTenantPermission([...Posts.PUBLISH])`) and leaves the dormant `SCHEDULE` constant untouched (removal is a separate owner-approved cleanup). Stated in the PR body.

Front gating caveat (verified): the front has **no `usePermissions` hook today** (`apps/front/src/lib/query/auth.ts` `CurrentUser` carries no permission keys). D3 therefore relies on server-side 403s surfaced through the standard `getFailureMessage(toApiFailure(error), …)` path for v1, and lists "surface permission keys on the tenant session" as an open owner question — the UI hides nothing pre-emptively rather than inventing a permission source.

## File structure

Branches: **[dev]** = exists on `develop` (verified `git ls-files`), modify freely; **[D1]** = exists on `lane/wt-644` only, consume only (see prerequisites); **[new]** = created by a D3 task below.

**Create (api) — all [new] unless noted**
- `apps/api/Modules/Publishing/Routes.Publishing.cs` — constants nested under the existing `Routes.Tenant` partial (`apps/api/Lib/Routes/Routes.cs` [dev]): `Schedule = "posts/{postId}/schedule"` reused by POST/PATCH/DELETE, `Find = "publications"`.
- `apps/api/Modules/Publishing/Endpoints/PublicationEndpointsForTenant.cs` — `MapPublicationEndpointsForTenant(this IEndpointRouteBuilder)` mirroring `MapPostEndpointsForTenant` (`apps/api/Modules/Posts/Endpoints/PostEndpointsForTenant.cs` [dev]); every route gets `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])` (extension in `apps/api/Lib/Filters/TenantPermissionFilter.cs` [dev]) + `.RequireRateLimiting(ApiRateLimitPolicies.*)` (`apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` [dev]).
- `apps/api/Modules/Publishing/Handlers/Tenant/SchedulePostForTenant.cs` (+ `.Spec.cs`) — body `JsonElement`: `accountIds` validated with the EXISTING `JsonElementRules.MustBeRequiredGuidArray` (requires ≥ 1; `apps/api/Lib/Validation/JsonElementRules.cs` [dev]); `scheduledAtLocal` with the EXISTING `JsonElementRules.MustBeRequiredIsoDateTime` [dev] (wall time parsed Unspecified; past-drift rule enforced in the service); `timeZone` with `MustBeRequiredTimezone` **[new — see Task 1 Step 0]** bounded by `PublicationSchedule.MaxTimeZoneLength`. Returns `Results<Created<SchedulePostResponse>, AppValidationProblemHttpResult, AppNotFoundHttpResult>`.
- `apps/api/Modules/Publishing/Handlers/Tenant/EditPostScheduleForTenant.cs` (+ `.Spec.cs`) — `PatchField<string>` body, `PatchField<DateTime>` scheduledAtLocal (`JsonElementRules.MustBePatchFieldIsoDateTime` [dev]), timeZone present only with the pair (`MustBePatchFieldTimezone` [dev] — declared in `apps/api/Modules/Tenants/Validation/TenantValidationRules.cs`, NOT in `JsonElementRules.cs`; see the Modify list below). In-progress refusal via `TypedProblems.Conflict(...)` (`apps/api/Lib/ProblemResults/TypedProblems.cs` [dev]) with translation key `publication-schedule-in-progress` (added to `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` [dev]; `ResponseKeys.g.cs` regenerates on build — never hand-edit it).
- `apps/api/Modules/Publishing/Handlers/Tenant/CancelPostScheduleForTenant.cs` (+ `.Spec.cs`) — hard-deletes `Scheduled` rows only; `Ok<ApiResponse>` with key `post-schedule-cancelled-success` / noop key `post-schedule-cancel-noop` (same JSON mechanism).
- `apps/api/Modules/Publishing/Handlers/Tenant/FindScheduledPublicationsForTenant.cs` (+ `.Spec.cs`) — `GET publications`, `[AsParameters]` query DTO (scalar `string?` fields, csv status parser — no `List<T>?` per OpenAPI safeguards), keyset `(scheduled_at_utc, id)`, window ≤ 31 days else 422 `publication-window-too-wide`, response extends the cursor-paginated shape (`apps/api/Lib/Validation/CursorPaginatedQueryValidator.cs` [dev] for the query validator).
- `apps/api/Modules/Publishing/Services/IPublicationService.cs` + `PublicationService.cs` (+ `.Spec.cs`) — methods take `tenantId` always; reads join `SocialAccount.DisplayHandle` (`apps/api/Modules/SocialAccounts/Entities/SocialAccount.cs` [dev]) and visibility via `VisibleIn` (`apps/api/Modules/SocialAccounts/Lib/VisibleIn.cs` [dev]); audit via `IAuditLogService.LogAsync(CreateAuditLogArgs(UserId, Action, TargetId, Details))` (`apps/api/Modules/AuditLogs/Services/AuditLogService.cs` [dev]).
- `apps/api/Modules/Publishing/Jobs/DispatchDuePostsJob.cs` (+ `.Spec.cs` + `DispatchDuePostsConcurrency.Spec.cs`) — **[new]** implements `IJobHandler` (`apps/api/Infrastructure/Jobs/IJobHandler.cs` [dev]: `string JobType`, `Task<JobOutcome> HandleAsync(JobContext, CancellationToken)`). Enqueues via `IJobEnqueuer.EnqueueAsync<TPayload>(definition, payload, EnqueueOptions { IdempotencyKey }, ct)` [dev]. Consumes `PublishingJobs.PublishPublicationV1` **[D1]** and the transition service **[D1]**.
- `apps/api/Modules/Publishing/Lib/PublicationZoneFormatter.cs` (+ zone round-trip cases inside the Find spec) — single formatter `"2026-08-26 09:00 (Europe/Paris)"`.

**Modify (api)**
- `apps/api/Lib/Validation/JsonElementRules.cs` + `JsonElementRules.Spec.cs` **[dev]** — ADD `MustBeRequiredTimezone` (required-string variant of the existing `MustBePatchFieldTimezone` logic: `TimeZoneInfo.TryFindSystemTimeZoneById`, length ≤ 64), with spec cases. (Round 1 finding fixed: `MustBeRequiredIanaZone` did not exist; the timezone validators actually live split between `JsonElementRules` patch variants and `apps/api/Modules/Tenants/Validation/TenantValidationRules.cs` `MustBeNullableTimezone`/`MustBePatchFieldTimezone` **[dev]** — D3 adds only the missing REQUIRED one.)
- `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` **[dev]** — ADD three consts to the `AuditActions` class (this is where the constants live — e.g. `PostUpdated = "post.updated"` — and `AuditActionsRegistry` picks new literals up by reflection): `PublicationScheduled = "publication.scheduled"`, `PublicationRescheduled = "publication.rescheduled"`, `PublicationScheduleCancelled = "publication.schedule.cancelled"`. Extend `AuditActionsRegistry.Spec.cs` coverage.
- `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` **[D1→merged]** — ADD `Task<bool> RescheduleToFutureAsync(Guid publicationId, Guid tenantId, PublicationSchedule schedule, CancellationToken ct)` to the interface + impl (allowed: `Scheduled → Scheduled`, `Paused → Scheduled`; clears `LastError`/`ExternalRecordId`/`ExternalUrl`, sets the pair, preserves `IdempotencyKey`; same guard pattern as `RescheduleToNowAsync`). This is the ONE deliberate edit into a D1-owned file — it extends, never rewrites, and `PublicationArchitecture.Spec` must stay green.
- `apps/api/Modules/Jobs/Seeders/SystemJobDefinitionSeeder.cs` **[dev]** — ADD the row `{ JobKey = "publishing.dispatch-due-posts.v1", CronExpression = "0 * * * * ?", IsEnabled = true, Description = … }` to `GetDefinitions()` (idempotent insert-on-conflict already implemented there). **NO migration** — the seeder doc-comment forbids seeding via migrations; extend `SystemJobDefinitionSeeder.Spec.cs`.
- `apps/api/Infrastructure/Jobs/JobsServiceRegistration.cs` **[dev]** — register `DispatchDuePostsJob` via `builder.AddJobHandler<DispatchDuePostsJob>(DispatchDuePostsJob.JobType)` alongside the existing registrations (pattern at line ~104); keeps `AppRoleComposition.Spec` green.
- `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` **[D1→merged]** — extend: (a) every Map* in `PublicationEndpointsForTenant.cs` has `.WithTenantPermission` + `.RequireRateLimiting` (pattern of `EndpointPermissionMetadataGuard.Spec.cs` [dev]); (b) `DispatchDuePostsJob` is the only `FOR UPDATE SKIP LOCKED` against `publications`; (c) the rogue-writer scan covers the new module files.
- `apps/api/Program.cs` **[dev]** — `tenantGroup.MapPublicationEndpointsForTenant();` after the existing `tenantGroup.MapPostEndpointsForTenant();` (line ~318).
- `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` **[dev]** — new response-message keys (regenerated `ResponseKeys.g.cs`).
- `packages/client-ts/src/**` + `apps/api/openapi.json` **[dev]** — regenerated only by `just build-api && just generate-client`.

**Create (front) — targets verified on develop**
- `apps/front/src/lib/query/tenant-publications.ts` (+ test) [new] — mirrors `apps/front/src/lib/query/tenant-posts.ts` [dev]: `useScheduledPublicationsQuery` / `useSchedulePostMutation` / `useEditPostScheduleMutation` / `useCancelPostScheduleMutation`, single `saveSchedule` writer, invalidations of both posts and publications queries.
- `apps/front/src/lib/format/zone-date-time.ts` (+ test) [new] — `formatInZone(utc, zone)`, `parseLocalWallTime(local, zone)`; dayjs via shared wrapper only (`publy/no-direct-dayjs-in-components`).
- `apps/front/src/routes/authed/tenant/posts/queue.tsx` (+ `queue.test.tsx`) **[dev, REPLACE placeholder]** — DataTable (`apps/front/src/components/table/data-table.tsx` [dev]) columns excerpt/account/when/status/actions; cancel uses `ConfirmDialog` [dev].
- `apps/front/src/routes/authed/tenant/posts/calendar.tsx` (+ `calendar.test.tsx`) **[dev, REPLACE placeholder]** — month grid, pills, prev/next month URL state (snake_case `from`/`to`).
- `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` **[dev, extend]** — "Publish on" checkboxes + Schedule sub-form; submit calls `saveSchedule`. Permission caveat above applies.
- `apps/front/e2e/tenant-posts-schedule.spec.ts` [new] — tags `@tenant-workspace @646` (vocabulary per closed tag guard `apps/front/e2e/__tests__/e2e-tag-guard.test.ts` [dev]); follows `apps/front/e2e/staff-tenants.spec.ts` + `request-counter.spec.ts` patterns [dev]; stack `apps/front/docker-compose.test.yml` [dev].
- i18n: `apps/front/src/i18n/locales/en/posts.json` + `fr/posts.json` [dev] — queue/calendar/schedule keys, both locales, asserted by the i18n-namespaces test.

**Modify (front)**
- `apps/front/src/lib/query/tenant-posts.ts` **[dev]** — add `invalidateTenantPublications(qc, tenantId)` sibling helper next to the existing invalidators.
- `apps/front/src/lib/format-date-time.ts` **[dev]** — extend `formatDateTime` with optional zone.
- `apps/front/src/routes.ts` **[dev]** — verify only; `/posts` wiring already exists. `breadcrumb-contract.test.tsx` auto-covers new crumbs.

## Task 0: Plan commit (this file)

- [x] Plan written at `docs/records/2026-08-25-plan-d3-publication-scheduling.md` (post-prune location; `docs/superpowers/` no longer exists on develop). Round-2 corrections committed.

## Task 1: Tenant schedule endpoint + service

**Files:** service + handler + spec (Create list), `Routes.Publishing.cs`, `Program.cs`, `JsonElementRules` (timezone validator).

- [ ] **Step 0:** add `JsonElementRules.MustBeRequiredTimezone` + spec cases (RED then GREEN). Commit together with Step 3.
- [ ] **Step 1 (RED):** `SchedulePostForTenant.Spec` (Testcontainers, co-located): happy (1 active account, `scheduledAtLocal = 2099-08-26T09:00:00`, zone `Europe/Paris` → row `scheduled_at_utc = 2099-08-26T07:00:00Z`, `scheduled_time_zone = Europe/Paris`, `status = Scheduled`, `idempotency_key = PublicationIdempotencyKey.For(id)`, `TenantId` set); multi-account → N rows distinct ids; account-not-in-project → 422 key `publication-schedule-account-not-in-project`; 422 empty `accountIds`, past instant beyond drift, bad zone, malformed postId; 403 member without Posts `PUBLISH`; 404 unknown postId; cross-tenant isolation; zero `IPublishProvider` calls (fake recorder).
- [ ] **Step 2 (GREEN):** `IPublicationService.ScheduleAsync(SchedulePublicationArgs(tenantId, postId, accountIds, scheduledAtLocal, timeZone, actorUserId), ct)` computes UTC via `TimeZoneInfo.FindSystemTimeZoneById` + `ConvertTimeToUtc`, validates accounts (`Active`, `VisibleIn.Visible(account, post.ProjectId)`), inserts N `Publication` rows (default `Scheduled` on insert; no transition needed), audit `AuditActions.PublicationScheduled`. Handler wires `MapPost(Routes.Tenant.Schedule, …)` + `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])` + `.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)`.
- [ ] **Step 3:** `dotnet test --filter "FullyQualifiedName~SchedulePostForTenant"` green under heavy.sh. Commit `feat(publishing): tenant schedule endpoint — date + IANA zone, one Publication per account`.

## Task 2: Tenant edit endpoint + RescheduleToFutureAsync

**Files:** `PublicationStatusTransitionService.cs` [D1→merged, extend], `PublicationService.cs`, `EditPostScheduleForTenant.cs` (+ Spec), endpoints, i18n JSON.

- [ ] **Step 1 (RED):** spec asserts: happy text+instant PATCH (DST winter case: `2099-12-15T09:00 Europe/Paris → 08:00Z`), `LastError` cleared, external refs cleared, audit `PostUpdated` + `PublicationRescheduled`; text-only; schedule-only; in-progress refusal 409 key `publication-schedule-in-progress` + plain-words description, post untouched; 422 bad zone / past instant; 403; 404; cross-tenant 404; no `accountIds` in PATCH (per-publication edit is D4).
- [ ] **Step 2 (GREEN):** add `RescheduleToFutureAsync` to interface+impl [extends D1 file]; `EditScheduleAsync` refuses the WHOLE edit if any publication is `InProgress`, else updates post body via the existing post update path and calls `RescheduleToFutureAsync` per `Scheduled`/`Paused` row. Handler: `MapPatch(Routes.Tenant.Schedule, …)`, `TypedProblems.Conflict` on refusal.
- [ ] **Step 3 (GREEN — construct the value object):** `PublicationSchedule` is a sealed record whose constructor is PRIVATE (wt-644 verified); its only entry point is `PublicationSchedule.Create(DateTime scheduledAtUtc, string timeZoneId)` — it rejects non-UTC/Unspecified kinds, blank zones, ids over `MaxTimeZoneLength` = 64 or failing `ZonePattern`, and ids unresolvable via `TimeZoneInfo.FindSystemTimeZoneById` (all `ArgumentException` with a plain-words message), and returns a UTC-normalized instance. In `EditScheduleAsync`, BEFORE any transition call: enforce the past-drift rule explicitly on the raw pair (as `ScheduleAsync` does → 422 keyed `["scheduledAtLocal"]`), then compute the instant exactly like the schedule endpoint and build the object ONCE:

```csharp
DateTime instant;
try {
	instant = TimeZoneInfo.FindSystemTimeZoneById(
		timeZone.Value.Trim()
	).ConvertTimeToUtc(scheduledAtLocal.Value);
} catch (TimeZoneNotFoundException) {
	return EditPostScheduleResult.InvalidSchedule(
		$"'{timeZone.Value}' is not an IANA time zone identifier.",
		"timeZone"
	);
}

PublicationSchedule schedule;
try {
	schedule = PublicationSchedule.Create(
		instant, timeZone.Value.Trim()
	);
} catch (ArgumentException ex) {
	// Plain-words cause surfaced verbatim (owner rule:
	// transparent failure causes).
	return EditPostScheduleResult.InvalidSchedule(
		ex.Message, "timeZone"
	);
}
```

`InvalidSchedule(string cause, string errorKey)` carries the cause and the stable error key (`"timeZone"` here, `"scheduledAtLocal"` for the past-drift rejection); the handler maps it to 422 `TypedProblems.ValidationProblem(cause, ResponseKeys.UnprocessableEntity, new Dictionary<string, string[]> { [errorKey] = [cause] })` — the same result-union + errors-dictionary shape as `UpdatePostForTenant` [dev]. Pass that single `schedule` instance to every `RescheduleToFutureAsync(publicationId, tenantId, schedule, ct)` call. Step 1's bad-zone / bad-instant RED cases assert these 422 bodies.
- [ ] **Step 4:** green. Commit `feat(publishing): tenant edit endpoint — text and/or instants, refused while InProgress`.

## Task 3: Tenant cancel endpoint

**Files:** `PublicationService.cs`, `CancelPostScheduleForTenant.cs` (+ Spec), endpoints, i18n JSON.

- [ ] **Step 1 (RED):** happy (2 Scheduled deleted, drafts shows post, queue empty, audit `PublicationScheduleCancelled` with counts); nothing-to-cancel 200 noop key; mixed (1 Scheduled + 1 InProgress → only Scheduled deleted, response states kept count); 403; 404; cross-tenant 404; deleted post 404.
- [ ] **Step 2 (GREEN):** `CancelScheduleAsync(tenantId, postId, actorUserId, ct)`; EF `ExecuteDeleteAsync` on `Status == Scheduled` only (SQL DELETE, not a status transition — the architecture scan excludes deletes). `MapDelete(Routes.Tenant.Schedule, …)`.
- [ ] **Step 3:** green. Commit `feat(publishing): tenant cancel endpoint — delete Scheduled publications, post returns to draft`.

## Task 4: Find scheduled publications (queue + calendar)

**Files:** `PublicationService.cs`, `FindScheduledPublicationsForTenant.cs` (+ Spec), `PublicationZoneFormatter.cs`, endpoints.

- [ ] **Step 1 (RED):** ordering by `(scheduled_at_utc, id)`; `accountDisplayHandle` from `SocialAccount.DisplayHandle`; `postBodyPreview` ≤ 280 chars; `postStatus` derived via `PostStatusDerivation.Derive` **[D1]**; window bounds (`from > to` → 422 `publication-window-invalid`; > 31 days → 422 `publication-window-too-wide`); status csv filter incl. invalid value 422; empty result; past-due still listed under `scheduled` (operator visibility before the scan claims it); keyset cursor incl. unknown cursor → 400; tenant isolation; 403; zone round-trip BOTH directions + DST summer/winter (wire `scheduledAtLocal` + `timeZone` ⇄ stored pair).
- [ ] **Step 2 (GREEN):** `FindScheduledAsync(FindScheduledPublicationsArgs(tenantId, fromUtc, toUtc, statuses, cursor, limit), ct)`; `[AsParameters]` scalar query DTO; `MapGet(Routes.Tenant.Find, …)` + `HeavySearchList`.
- [ ] **Step 3:** green. Commit `feat(publishing): list scheduled publications (queue + calendar) with zone round-trip`.

## Task 5: Architecture guard extensions

**Files:** `PublicationArchitecture.Spec.cs` [D1→merged, extend].

- [ ] **Step 1 (GREEN first):** assertions (a)/(b)/(c) as listed in Modify above.
- [ ] **Step 2 (RED proof — rogue writer):** plant temp `_db.Publication` writer outside the allowed files → guard FAILS naming file+line. Transcript `.dump/mutation-rogue-schedule-writer.md`. Restore byte-exact.
- [ ] **Step 3 (RED proof — enqueue without idempotency key):** plant rogue scanner skipping `EnqueueOptions.IdempotencyKey` → concurrency spec fails on the `ux_job_queue_type_idempotency` unique violation. Transcript `.dump/mutation-dispatch-no-idempotency.md`. Restore byte-exact.
- [ ] **Step 4:** guards + concurrency spec green again. Commit `test(api): D3 architecture guard — no rogue schedule writers, no keyless due-scan enqueue`.

## Task 6: DispatchDuePostsJob + seeder row

**Files:** `DispatchDuePostsJob.cs` (+ 2 specs) [new]; `SystemJobDefinitionSeeder.cs` [dev]; `JobsServiceRegistration.cs` [dev]. Consumes `PublishingJobs.PublishPublicationV1`, `PublicationIdempotencyKey`, `MarkInProgressAsync` **[D1]**. **No migration** (doctrine: seeds are config, never migrations). Index name for proofs: **`ux_job_queue_type_idempotency`** (unique on `(job_type, idempotency_key)` filtered `idempotency_key IS NOT NULL` — `apps/api/Migrations/20260716182713_HardenJobQueueEnvelope.cs` [dev]; round-1 name was wrong).

- [ ] **Step 1 (RED):** `DispatchDuePostsJob.Spec`: seed P1 past/Scheduled, P2 future, P3 InProgress; recording fake `IJobEnqueuer`; assert exactly one enqueue `(publishing.publish-publication.v1, payload(P1, key=P1), IdempotencyKey=key(P1))`, P1 → `InProgress` via transition service, P2/P3 untouched, zero provider calls.
- [ ] **Step 2 (RED):** `DispatchDuePostsConcurrency.Spec`: 50 past-due rows, two concurrent `HandleAsync` via separate DI scopes; union of enqueues == 50, exactly-once per key, 50 `job_queue` rows of that `job_type`, no `Scheduled` left among them.
- [ ] **Step 3 (GREEN):** implement the job: `JobType = "publishing.dispatch-due-posts.v1"`; one transaction; raw SQL `SELECT id FROM publications WHERE status = 10 AND is_deleted = false AND scheduled_at_utc <= now() ORDER BY scheduled_at_utc, id LIMIT @p FOR UPDATE SKIP LOCKED`; per claimed row enqueue via `PublishingJobs.PublishPublicationV1` with `EnqueueOptions.IdempotencyKey = PublicationIdempotencyKey.For(id)` then `MarkInProgressAsync(id, publication.TenantId, ct)`; commit; `JobOutcome.Succeeded` (empty claim → immediate success).
- [ ] **Step 4 (GREEN):** seeder row in `GetDefinitions()` + spec extension; register `AddJobHandler<DispatchDuePostsJob>` in `JobsServiceRegistration`. `PublishPublicationJobHandler` is **already registered by D1** on its branch — do NOT double-register; verify after merge.
- [ ] **Step 5:** focused suites + `just build-api` + `just ci-migration-expand-contract` green. Commit `feat(publishing): DispatchDuePostsJob — every-minute due scan, SKIP LOCKED, keyed enqueue`.

## Task 7: Front — queue, calendar, drawer schedule form

**Files:** per Create/Modify (front) lists above.

- [ ] **Step 1:** after Tasks 1–4 land the contract: `just build-api && just generate-client`; `pnpm --filter front typecheck` red until `tenant-publications.ts` compiles against regenerated models.
- [ ] **Step 2 (RED):** unit specs: `zone-date-time.test.ts` (summer/winter DST), `tenant-publications.test.ts` (query-param mapping, csv status), `queue.test.tsx` + `calendar.test.tsx` (render, empty state, month navigation URL writes) using the existing route vi-mock + QueryClientProvider test patterns.
- [ ] **Step 3 (GREEN):** implement modules/pages/drawer/i18n per file list. Actions rely on server 403 (no front permission hook exists — see reconciliation caveat).
- [ ] **Step 4:** `pnpm --filter front typecheck && pnpm --filter front test && pnpm --filter front check:design-system && just react-doctor` green. Commit `feat(front): queue + calendar pages wired to the scheduling API, schedule form in the drawer`.

## Task 8: E2E

**Files:** `apps/front/e2e/tenant-posts-schedule.spec.ts` [new]; tag-guard verify only.

- [ ] **Step 1 (spec written):** storage-state login; drawer schedule (+5 min, detected zone); assert queue row + calendar pill in-zone; cancel via row menu; drafts restored; request-counter asserts each call landed and no `X-Session-Token` echoed.
- [ ] **Step 2:** tag guard passes with `@tenant-workspace @646`.
- [ ] **Step 3 (run when stack bootable):** `pnpm --filter front test:e2e:tag "@tenant-workspace.*@646"` against the compose stack; seed the Acme social account via an e2e helper if needed.
- [ ] **Step 4:** commit `test(front): e2e — schedule → queue + calendar in-zone → cancel → drafts`.

## Task 9: Gates + delivery

- [ ] `pnpm --filter front typecheck/test/check:design-system`; `just react-doctor`; focused API suites (Publishing/Posts/SocialAccounts) under heavy.sh; `heavy.sh just build-api && just generate-client`; `just ci-migration-expand-contract`; `just ci-quality-dotnet`; `just ci-front`.
- [ ] PR body refreshed (round-2 changes section); tracking issue #1431 updated (location + D1 dependency).
- [ ] `.dump/DONE-r2.md` with tip SHA; print DONE.

## Interfaces (consumed signatures copied from the real files)

- **[D1]** `IPublicationStatusTransitionService` (`…/Services/PublicationStatusTransitionService.cs`, wt-644): `Task<bool> MarkInProgressAsync(Guid publicationId, Guid tenantId, CancellationToken ct)`; `MarkPublishedAsync(…, string externalRecordId, string externalUrl, CancellationToken ct)`; `MarkFailedAsync(…, string cause, …)`; `MarkPausedAsync(…, string cause, …)`; `RescheduleToNowAsync(Guid, Guid, CancellationToken)`. D3 adds `RescheduleToFutureAsync(Guid publicationId, Guid tenantId, PublicationSchedule schedule, CancellationToken ct)`; the `PublicationSchedule` argument is built once per edit via `PublicationSchedule.Create(...)` (Task 2 Step 3).
- **[D1]** `PublishingJobs.PublishPublicationV1 : JobDefinition<PublishPublicationPayload>`; `PublishPublicationPayload { Guid PublicationId; string IdempotencyKey; }` (`Validate` already rejects key mismatch).
- **[dev]** `IJobEnqueuer.EnqueueAsync<TPayload>(JobDefinition<TPayload>, TPayload payload, EnqueueOptions? options = null, CancellationToken ct) → Task<Guid>`; `EnqueueOptions { string? IdempotencyKey; … }`.
- **[dev]** `IAuditLogService.LogAsync(CreateAuditLogArgs(Guid UserId, string Action, Guid? TargetId = null, object? Details = null), ct)`.
- **[D3-new]** `IPublicationService`: `ScheduleAsync(SchedulePublicationArgs, ct)`, `EditScheduleAsync(EditPostScheduleArgs, ct)`, `CancelScheduleAsync(Guid tenantId, Guid postId, Guid actorUserId, ct)`, `FindScheduledAsync(FindScheduledPublicationsArgs, ct)`.
- **[D3-new]** front `tenant-publications.ts`: `useScheduledPublicationsQuery`, `useSchedulePostMutation`, `useEditPostScheduleMutation`, `useCancelPostScheduleMutation`, `saveSchedule(input, { tenantId })`, `invalidateTenantPublications(qc, tenantId)`.

## Proofs the spec requires (per §6 D3)

- **D3.1** exact-once concurrent dispatch — `DispatchDuePostsConcurrency.Spec` (Task 6, index `ux_job_queue_type_idempotency`).
- **D3.2** edit during `InProgress` refused, plain words — `EditPostScheduleForTenant.Spec` (Task 2).
- **D3.3** cancel → draft — `CancelPostScheduleForTenant.Spec` (Task 3).
- **D3.4** zone round-trips both directions + DST — Find spec + `zone-date-time.test.ts` (Tasks 4, 7).
- **D3.5** no rogue schedule writers — `PublicationArchitecture.Spec` extension, RED transcript `.dump/mutation-rogue-schedule-writer.md` (Task 5).
- **D3.6** no keyless concurrent enqueue — RED transcript `.dump/mutation-dispatch-no-idempotency.md` (Task 5).
- **D3.7** integration specs for every handler/service path (Tasks 1–4, 6).
- **D3.8** e2e flow with real tags/testids (Task 8).

## Anything in this brief that turned out to be wrong

- The brief pointed at `docs/superpowers/plans/` + `docs/superpowers/specs/` — pruned by #1357 (merge `86f3acbb4`); plans/specs live flat in `docs/records/` (`docs/README.md`, "Everything else"). This plan sits at `docs/records/2026-08-25-plan-d3-publication-scheduling.md`; the Epic D spec is `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md`.
- The brief cited `docs/implementation-plans/jobs-worker-infrastructure.md` and a "reserved" `DispatchDuePostsJob` — neither exists on develop nor on wt-644's merged-tree surface; the reservation claim was unverifiable. D3 creates the job (Task 6) over the real `apps/api/Infrastructure/Jobs/*` infrastructure.
- Round-1 inventions replaced: `JsonElementRules.MustBeRequiredArrayOfNonEmptyGuids/MustBeLocalDateTime/MustBeRequiredIanaZone` → existing `MustBeRequiredGuidArray`/`MustBeRequiredIsoDateTime`/patch timezone validators + one new `MustBeRequiredTimezone` with tests (Task 1 Step 0); `AuditActions.PublicationScheduled/…` → Task-level addition to the `AuditActions` class in `AuditLog.cs`; `tenant.socialaccounts.publish` → real Posts permission set (`PostPermissionsForTenant`, `PUBLISH`); index name → `ux_job_queue_type_idempotency`; `PostStatusDerivation.Derive` → declared D1 dependency.
- The seeder-based cadence replaces round 1's planned migration: repo doctrine (`SystemJobDefinitionSeeder.cs` doc comment) forbids seeding `system_job_definitions` via migrations.

## Unverified until CI

- Regenerated Kiota client compiling against every new query module under `apps/front/src/lib/query/`.
- The e2e spec passing against the real compose stack (sandbox cannot boot it).
- Regenerated `openapi.json` carrying the new routes with expected 422/409 problem responses.

Model: MiniMax M3 (GMI Cloud via OpenRouter, jcode) — rounds 2-3 by Ox Alpha via Nous Portal (jcode)

Closes #1431

Part of #646
