# D3 — Publication scheduling implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Epic D step 3 (#646, part of #631): the tenant schedule endpoint (date + IANA zone → instant, one `Publication` per chosen `SocialAccount`, status `Scheduled`), the edit endpoint (post text or instants; refused with a plain-words message while any publication is `InProgress`), the cancel endpoint (delete `Scheduled` publications → post back to draft), the recurring due-scan system job (every minute, claims due `Scheduled` rows with `FOR UPDATE SKIP LOCKED`, enqueues one job per publication with its idempotency key, sets `InProgress`), the tenant Queue page (upcoming publications, keyset, zone label, edit/cancel with `tenant.posts.publish`), the tenant Calendar page (by day, `Paused`/`Failed` visible with pills), zone round-trip proofs, full integration and architecture specs, and the e2e "schedule → appears in queue and calendar in the chosen zone → cancel → back in drafts" flow. Publish-now (D2) is out of scope here: schedule-only, all times in the future when scheduled by the user; a single `ScheduledAtUtc <= now` row is a legitimate past instant (e.g. a worker crash left it behind) that the due-scan still claims.

**Architecture:** New `apps/api/Modules/Publishing/Endpoints/...` plus `apps/api/Modules/Publishing/Jobs/DispatchDuePostsJob.cs` and a tenant `IPublicationService`; one published `system_job_definitions` row (`publishing.dispatch-due-posts.v1`, cron `0 * * * * ?`) reserved by Epic A's jobs design (`DispatchDuePostsJob`, every minute). The front's existing `authed/tenant/posts/queue.tsx` and `authed/tenant/posts/calendar.tsx` placeholders (#1141 tranche) are replaced with real `DataTable`/calendar surfaces bound to the new Kiota models. Jobs go through `IJobEnqueuer` only (Epic A §5.3 single trust boundary, already proven by D1). `Publication` lifecycle writes go through D1's `IPublicationStatusTransitionService` (already single-writer; D3 is a pure consumer, no rogue-writer changes). External idempotency uses D1's `PublicationIdempotencyKey` and the deterministic Bluesky record key suffix. Migrations are expand-only; an architectural test proves no inline `Status =` writes ever escape the transition service.

**Tech Stack:** .NET 10 / EF Core 10 + Npgsql, xUnit + FluentAssertions, Testcontainers ephemeral Postgres via `ApiFixture`, `just` recipes. Front: React 19, TanStack Start/Router, Base UI `Dialog`/`Drawer`/`Tabs`, Tailwind v4 (`cn` + `cva`), TanStack Query 5 + `@org/shared-ts/lib/query/create-hooks` (`buildTenantQueryOptions`/`buildTenantMutationOptions`, `scopedKey`), React Hook Form 7 + Zod 3 + `@hookform/resolvers`, Kiota `@org/client-ts` (regenerated from OpenAPI), dayjs only via `formatDateTime`/scheduling helpers (never direct dayjs in components), Vitest + Testing Library, Playwright (tags `@tenant-workspace @646`).

## Global constraints (blocking)

- Analyzers PUBLY0001–0008 are errors: `is null`/`is not null` pattern matching; never `?? throw`; never `!`; never `ToLower()` dispatch; wire DTOs carry no `Dto` suffix; handlers cache repeated getter results; services do not depend on other services (the publication service takes `AppDbContext` + `IJobEnqueuer` + `IPublicationStatusTransitionService` only, the latter is an infrastructure seam not a service-service dependency); tenant-scoped service methods use their `tenantId`; PublishPublicationJob in D1 is `*ForWorker*` style and is unchanged. Max 100 char lines; braces always; class methods stay methods.
- No disable/suppression comments, no `[Fact(Skip)]`, no ruleset/guard loosening, no sub-agents/workers.
- Migrations are **expand-only** (add a new system_job_definitions seed + a single column for `POST /posts/{id}/schedule` audit only when needed) and applied by the one-shot `migrate` service; locally `just db-add AddDispatchDuePostsSystemJob` (one migration, add-only). `just ci-migration-expand-contract` must stay green.
- `LastError` ≤ 2 KB sanitised via `SocialAccounts.Lib.LastErrorSanitiser.Sanitize` (reuse, F20). Never log secrets or session tokens.
- Heavy commands run under `~/ai-orchestration-playbook/tools/heavy.sh` (serialised host-wide); focused filters first, module suite once at the end, never > 20 min under the lock.
- "just api-check" in the brief = the repo's build+analyzers gate: `just build-api` (analyzers fire as build errors) plus `just ci-quality-dotnet` before push.
- Every commit: one task = one commit, push after every commit. Never touch develop.

## Reconciliation decision: where `tenant.posts.publish` lives

`PostPermissionsForTenant` on develop already declares a `PUBLISH` and a `SCHEDULE` permission (D1 added `SCHEDULE` to the catalog but no consumer). D3 reconciles to a single `tenant.posts.publish` for schedule / edit-instants / cancel (matching the spec's "edit / cancel with `tenant.posts.publish`" line and the brief's "with `tenant.posts.publish`" requirement). The dormant `SCHEDULE` permission is left in the catalog (no deletion in this PR — owner has not asked for it; removal is a separate paper-thin docs+seed follow-up), and a one-line note in the PR body states that D3 deliberately consolidates schedule and edit-instants behind `publish` per the spec, with `SCHEDULE` reserved for a future paper-thin cleanup. Stated again in the PR body.

## File structure

**Create (api)**
- `apps/api/Modules/Publishing/Routes.Publishing.cs` — route constants for the tenant scope.
- `apps/api/Modules/Publishing/Endpoints/PublicationEndpointsForTenant.cs` — minimal-API group, `WithTenantPermission` + `RequireRateLimiting` per endpoint.
- `apps/api/Modules/Publishing/Handlers/Tenant/SchedulePostForTenant.cs` — body `JsonElement` getters, `JsonElementRules.*` validator, `Results<Created<SchedulePostResponse>, AppValidationProblemHttpResult, AppNotFoundHttpResult>`. `body` (`accountIds: required Guid[]` ≥ 1, `scheduledAtLocal: required DateTime` (unspecified kind — caller chose "wall time in the zone"), `timeZone: required string` (IANA), `postId` on route). Service builds one `Publication` per `accountId`; no Bluesky call.
- `apps/api/Modules/Publishing/Handlers/Tenant/SchedulePostForTenant.Spec.cs` — co-located happy path + 422 cases + permission 403 + isolation.
- `apps/api/Modules/Publishing/Handlers/Tenant/EditPostScheduleForTenant.cs` — same body shape with `PatchField<>` for `body` and for the pair `(scheduledAtLocal, timeZone)`. Refuses with `TypedProblems.Conflict("…", "post-has-publication-in-progress")` (or whatever `ResponseKeys.PublicationInProgress` resolves to via `AppProblemDetails` translation key) when ANY publication of the post is `InProgress`; updates post body via `IPostService.UpdateForTenantAsync`; updates instant via direct publication write inside `IPublicationService` (still the transition service: `RescheduleToNowAsync` is for retry, so add a new `RescheduleToFutureAsync(publicationId, tenantId, schedule, ct)` that transitions `Scheduled → Scheduled` and updates `Schedule`/`LastError`).
- `apps/api/Modules/Publishing/Handlers/Tenant/EditPostScheduleForTenant.Spec.cs` — co-located happy path; 403; 404; 409 (in-progress refusal with translation key + plain-words description); patch field absent; project cross-tenant.
- `apps/api/Modules/Publishing/Handlers/Tenant/CancelPostScheduleForTenant.cs` — `DELETE /posts/{postId}/schedule`; deletes the `Scheduled` publications only (no `InProgress`, `Published`, `Failed`, or `Paused`); returns `Ok<ApiResponse>` with translation key `post-schedule-cancelled-success`.
- `apps/api/Modules/Publishing/Handlers/Tenant/CancelPostScheduleForTenant.Spec.cs` — co-located happy path; nothing-to-cancel 200; 403; 404; cross-tenant; partial (in-progress mixed → only the Scheduled rows removed; the InProgress ones untouched, audit log records the refusal-not).
- `apps/api/Modules/Publishing/Handlers/Tenant/FindScheduledPublicationsForTenant.cs` — `GET /publications` with `FromQuery` `from` (UTC), `to` (UTC), `cursor`, `size`, `status` (csv of `scheduled`/`in_progress`/`failed`/`paused` for Calendar; Queue defaults to `scheduled` only). Returns `FindScheduledPublicationsResponse` extending `CursorPaginatedResult<ScheduledPublicationListItem>`. Keyset by `(scheduled_at_utc, id)` ascending; the Calendar view is a single "month" window query (one query per page navigation; cursor still keyset-stable for that window).
- `apps/api/Modules/Publishing/Handlers/Tenant/FindScheduledPublicationsForTenant.Spec.cs` — covers window bounds, keyset correctness, tenant isolation, status filter, empty result, cursor-not-found 400, future-dated 0 rows, status csv parser.
- `apps/api/Modules/Publishing/Services/IPublicationService.cs` + `PublicationService.cs` — tenant-scoped: `ScheduleAsync(args, ct)`, `EditScheduleAsync(args, ct)`, `CancelScheduleAsync(tenantId, postId, ct)`, `FindScheduledAsync(tenantId, args, ct)`, `RescheduleToFutureAsync(publicationId, tenantId, schedule, ct)` (consumes transition service). Reads through D1's `IPublicationStatusTransitionService` for the only allowed status writes; never touches `.Status` directly. Each method takes the tenant id and the relevant ids.
- `apps/api/Modules/Publishing/Services/PublicationService.Spec.cs` — integration, multi-row happy + 422 + isolation + the "no rogue status writes" guarantee: spec directly scans `Publication` rows in the test DB and asserts the only `Status == X` writes came from the transition service (the architecture guard covers the source-scan side, this covers the runtime side).
- `apps/api/Modules/Publishing/Jobs/DispatchDuePostsJob.cs` — `IJobHandler` with `JobKey = "publishing.dispatch-due-posts.v1"`. Inside a `BeginTransactionAsync`: `SELECT … FOR UPDATE SKIP LOCKED LIMIT :batch` on `publications` where `Status = 10 (Scheduled) AND scheduled_at_utc <= now() AND is_deleted = false` ordered by `(scheduled_at_utc, id)`; for each claimed row, enqueue one `PublishPublicationPayload { PublicationId, IdempotencyKey }` via `IJobEnqueuer.EnqueueAsync(PublishingJobs.PublishPublicationV1, payload, new EnqueueOptions { IdempotencyKey = "<publication-idempotency-key>" })`, then `MarkInProgressAsync(publicationId, tenantId, ct)`. Commit. Return `JobOutcome.Succeeded`.
- `apps/api/Modules/Publishing/Jobs/DispatchDuePostsJob.Spec.cs` — seed three Scheduled rows (one past, one future, one in-progress); direct invocation via `HandleAsync`; assert: only the past one was claimed and enqueued exactly once; future untouched; in-progress untouched; the second concurrent scan sees zero rows (the SKIP LOCKED proof, see Task 6). Sanitised cause not relevant here (success path), but no secrets logged.
- `apps/api/Modules/Publishing/Jobs/DispatchDuePostsConcurrency.Spec.cs` — same fixture, two `Task.Run` calls racing the same `HandleAsync`; assert each enqueue list is a strict subset, their union is the seeded past rows, and no row was enqueued twice (count rows in the `job_queue` table where `job_type = 'publishing.publish-publication.v1'` and `idempotency_key = '<pub-key>'` — must be 1 per publication).
- `apps/api/Modules/Publishing/Jobs/PublishingJobs.cs` — JobDefinition catalog (parallel to D1's plan, but published ONLY here since D1's `PublishPublicationJobs` is not in the merged tree yet — see "D1 dependency" below):
  ```csharp
  public sealed record PublishPublicationPayload {
      public required Guid PublicationId { get; init; }
      public required string IdempotencyKey { get; init; }
  }
  public static class PublishingJobs {
      public static readonly JobDefinition<PublishPublicationPayload> PublishPublicationV1 =
          new() { JobType = "publishing.publish-publication.v1", Priority = 0, MaxAttempts = 3,
                  Validate = static p => { /* defence: idempotency key must equal PublicationIdempotencyKey.For(p.PublicationId) */ } };
  }
  ```
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` — published here in D3 (the D1 plan describes the same shape but the D1 branch is in flight; D3 publishes the handler against the transition service as the single status writer — see "D1 dependency" below). Handler flow matches D1 plan Task 6 exactly. (The brief says: "the in-flight D1 branch `origin/lane/wt-644` (its plan under docs/superpowers/plans, Publication entity, transition service, PublishPublicationJob)". D3 lands the handler in the merged tree because the D1 branch may not have published it yet at the time D3 lands.)
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.Spec.cs` — co-located; same shape as D1 Task 6 (happy / content / account / transient / already-exists / idempotency key stability / enqueue proof / rogue-writer guard for the new module).
- `apps/api/Modules/Publishing/Seeders/DispatchDuePostsSystemJobSeeder.cs` — wraps the existing `SystemJobDefinitionSeeder` registration path by adding a `SystemJobDefinition` row for `JobKey = "publishing.dispatch-due-posts.v1"`, cron `0 * * * * ?`, enabled true. Lives in the Publishing module to keep the feature co-located; registered in DI in Task 7.
- `apps/api/Modules/Publishing/Lib/PublicationZoneFormatter.cs` — single helper used by every wire DTO: `Format(PublicationSchedule, DateTime) → "2026-08-26 09:00 (Europe/Paris)"`. `TimeZoneInfo.FindSystemTimeZoneById` in spec context only (no DB call); `DateTime` is the row's `ScheduledAtUtc`; the formatter is the single point that knows the "instant + zone label" pattern (no second implementation in handlers, front helper, or e2e helper).
- `apps/api/Modules/Publishing/Jobs/ZoneIdempotency.Spec.cs` — covers the round-trip: given a wall-clock `"2026-08-26T09:00:00"` in zone `"Europe/Paris"`, the row stored has `scheduled_at_utc = 2026-08-26T07:00:00Z` and `scheduled_time_zone = "Europe/Paris"`. And given a row with that pair, the wire DTO prints back the same `2026-08-26 09:00 (Europe/Paris)` (DST: `2026-12-15T09:00:00 Europe/Paris → 08:00Z`; spec is asserted).

**Modify (api)**
- `apps/api/Data/DbContext/AppDbContext.cs` — no schema change in D3; the table, columns, and indexes shipped in D1 are reused as-is.
- `apps/api/Lib/AppPermissions.cs` — confirm `Posts.PUBLISH` is wired (already present from D1's plan; verify and add nothing if so).
- `apps/api/Lib/ServiceRegistration.cs` — add `services.AddScoped<IPublicationService, PublicationService>()` in the publishing DI block; register `DispatchDuePostsJob` and `PublishPublicationJobHandler` via `AddJobHandler<>` in the jobs block (call from `Program.Main` AFTER `JobsServiceRegistration.AddWorkerServices` returns, or extend that method to add publishing handlers — pick the path that keeps `AppRoleComposition.Spec` green).
- `apps/api/Program.cs` — `tenantGroup.MapPublicationEndpointsForTenant();` after the existing `MapPostEndpointsForTenant();` (so the existing handlers stay reachable at the same route, and the new routes join the same group).
- `apps/api/Modules/Jobs/Seeders/SystemJobDefinitionSeeder.cs` — call the new `DispatchDuePostsSystemJobSeeder.SeedAsync(db, ct)` from the public `SeedAsync` after the existing `GetDefinitions` materialization, OR keep the publishing seeder entirely separate and call it from `Program.Main` after the existing seeder — both options keep the `system_job_definitions` shape unchanged; choose the path that avoids a single mega-seeder and keeps the module boundary (this is the path the plan follows: a separate `DispatchDuePostsSystemJobSeeder` invoked from `Program.Main` alongside other seeder calls, NOT inlined into the existing seeder).
- `apps/api/Migrations/*_AddDispatchDuePostsSystemJob.cs` (+ designer/snapshot) — generated, add-only. The migration inserts the `system_job_definitions` row. EF Core cannot represent a row insert in a migration easily; the migration is a hand-written `migrationBuilder.Sql("INSERT INTO system_job_definitions …")` with the row matching the seeder's `GetDefinitions` defaults. Verified by reading the generated Designer + re-running the suite.
- `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` — already exists from D1; extend it in D3 with (a) the new endpoint guard assertion: every `MapPost*` route under `/posts` declared in `apps/api/Modules/Publishing/Endpoints/PublicationEndpointsForTenant.cs` is `WithTenantPermission` + `RequireRateLimiting`, (b) the `DispatchDuePostsJob` query targets the `(status, scheduled_at_utc)` index (SQL plan proof via `EXPLAIN` on a seeded fixture), (c) the no-rogue-writer source scan covers the new files. RED proof: plant a fake `MyService.Schedule` outside the publication service that does `ctx.Set<Publication>().Add(p); p.Status = PublicationStatus.Scheduled;` — the guard must FAIL naming the file. Restore byte-exact, green again.
- `apps/api/Lib/Architecture/ArchitectureGuard.Spec.cs` — the existing architecture discovery already enumerates modules; D3 only ADDS files under `apps/api/Modules/Publishing/**`; the discovery should pick them up automatically once they are committed. If a module is not yet discovered, add a tiny extension to `ArchitectureDiscovery.cs` declaring the new namespace; otherwise leave untouched.
- `apps/api/openapi.json` + `packages/client-ts/src/**` — regenerated by `just generate-client` after Task 8.
- `apps/api/Lib/ProblemResults/ResponseKeys.cs` — add the new `ResponseKeys.PublicationScheduleInProgress = "publication-schedule-in-progress"`, `ResponseKeys.PostScheduleCancelledSuccess = "post-schedule-cancelled-success"`, plus the `Publication` enum wire strings (already present from D1's `PublicationWire`).

**Create (front)**
- `apps/front/src/lib/query/tenant-publications.ts` — Kiota client wrapper for `GET /publications` (the queue/calendar list), `POST /posts/{postId}/schedule` (schedule), `PATCH /posts/{postId}/schedule` (edit), `DELETE /posts/{postId}/schedule` (cancel). Normalises timestamps to `Date`; exports `useScheduledPublicationsQuery`, `useSchedulePostMutation`, `useEditPostScheduleMutation`, `useCancelPostScheduleMutation`. Mirrors the `tenant-posts.ts` pattern (single `saveSchedule` writer reused for schedule + edit).
- `apps/front/src/lib/query/tenant-publications.test.ts` — co-located, mirrors the B2 unit-style tests for the helpers (`toScheduledPublicationRows`, `buildFindScheduledPublicationsQueryParameters`, zone formatter).
- `apps/front/src/lib/format/zone-date-time.ts` — front-side helper that takes `(utc, zone) → "2026-08-26 09:00 (Europe/Paris)"` using the shared `dayjs` setup; also `parseLocalWallTime(local, zone) → utc` for the schedule form. Single point of truth; the front helper exists because the API's wire payload is `(utc, zone)`, not the formatted string.
- `apps/front/src/lib/format/zone-date-time.test.ts` — co-located vitest; covers summer / winter DST boundaries (Europe/Paris 2026-03-29 and 2026-10-25).
- `apps/front/src/routes/authed/tenant/posts/queue.tsx` — REPLACE the placeholder with a real `DataTable` page: columns `excerpt` (link to `/tenant/posts/$postId/edit` like drafts), `account` (the social account display handle — fetch the account display via the new `useSocialAccountForProject` query, OR the schedule payload returns `accountDisplayHandle` directly — choose the latter to avoid a second round-trip), `scheduled_at` (formatted via `zone-date-time.ts`, zone label suffix), `status` (a `Badge` with the `scheduled` variant), `actions` (edit + cancel in a `DataTableRowActions` menu, gated on `tenant.posts.publish` from the front `usePermissions` hook). Search `q` matches excerpt; keyset pagination; size selector; `controller.cursor` and `controller.sort` per B2.
- `apps/front/src/routes/authed/tenant/posts/calendar.tsx` — REPLACE the placeholder with a month grid: 7 columns, 5–6 rows, day cell shows the publications for that day as small pills with the account handle and the local time; a `failed`/`paused` pill uses the destructive / muted variants; click on a pill navigates to the post edit page (owner rule: "Calendar: the same publications by day; click → the post"). Header has a `prev month` / `next month` pair (URL state, snake_case `from`/`to` like the B2 search param contract). The list is fetched once per month (the API caps `to - from` to 31 days via a server-side 422 with `response-message: "calendar-window-too-wide"`).
- `apps/front/src/routes/authed/tenant/posts/queue.test.tsx` — REPLACE the existing honest-coming-later assertions with real component tests: the page renders the table, the empty state, the zone label in the column header, the action menu items. The tests use the existing `createFileRoute` vi-mock pattern and a TanStack Query `QueryClientProvider` with a mock `useScheduledPublicationsQuery` returning a fixed payload.
- `apps/front/src/routes/authed/tenant/posts/calendar.test.tsx` — same shape, asserts the month grid renders and the previous/next month navigation updates the URL.
- `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` — extend with a **Publish on** block (Epic C visibility: checkboxes of accounts visible in the project, only with `tenant.socialaccounts.publish` permission). The drawer already saves the post; when at least one account is checked, it ALSO calls `POST /posts/{postId}/schedule` (or `/posts/{postId}/schedule` with `accountIds` + a `scheduledAtLocal` + `timeZone`). For the v1 "publish now" path, the drawer sets `scheduledAtLocal = now` and `timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone`. No-account-checked → save as draft only (the existing behaviour, plus an explicit hint in the UI). The schedule form UI is inside the drawer (date, time, zone prefilled). All React Hook Form + Zod.
- `apps/front/src/lib/format-date-time.ts` — already exists; extend the existing `formatDateTime` to accept an optional zone (default UTC) so the schedule list can use it.
- `apps/front/src/i18n/locales/en/posts.json` — add new keys: `queue-title`, `queue-empty-title`, `queue-empty-description`, `queue-column-excerpt`, `queue-column-account`, `queue-column-when`, `queue-column-status`, `queue-column-actions`, `queue-edit-action`, `queue-cancel-action`, `queue-cancel-confirm-title`, `queue-cancel-confirm-description`, `calendar-title`, `calendar-prev-month`, `calendar-next-month`, `calendar-empty-day`, `calendar-pill-status-scheduled`, `calendar-pill-status-in-progress`, `calendar-pill-status-failed`, `calendar-pill-status-paused`, `schedule-form-title`, `schedule-form-publish-on`, `schedule-form-no-accounts-hint`, `schedule-form-when-label`, `schedule-form-zone-label`, `schedule-form-zone-detected`, `schedule-form-submit-schedule`, `schedule-form-submit-publish-now`, `schedule-edit-refused-in-progress`, `schedule-cancel-success`, `schedule-cancel-failed`, `schedule-cancel-confirm`. Mirror the same keys in `fr/posts.json`. Every key is asserted by the i18n-namespaces test.
- `apps/front/e2e/tenant-posts-schedule.spec.ts` — Playwright e2e. Tags `@tenant-workspace @646`. Steps:
  1. Login as Acme admin via the existing auth helper.
  2. Visit `/tenant/posts/queue`; create a new draft post via the drawer, check the seeded Acme social account, pick "Schedule" with a wall time 5 minutes in the future, zone = the browser-detected zone.
  3. Assert the publication appears in the queue with the correct zone label and account handle.
  4. Visit `/tenant/posts/calendar`; assert the publication appears in the correct day cell with the `scheduled` pill.
  5. Open the queue row's cancel action; confirm; assert the post returns to drafts (the `drafts` query shows the post again; the queue row is gone).
  6. Verify the API received the expected body shape and headers (a request-counter sidecar assertion). The test is a single top-level `test.describe` with tags `@tenant-workspace` and `@646`.
- `apps/front/e2e/__tests__/e2e-tag-guard.test.ts` — already enforces domain + ticket tags; the new spec carries both. No change needed.

**Modify (front)**
- `apps/front/src/lib/query/tenant-posts.ts` — `invalidateTenantPosts` is a sibling helper; add `invalidateTenantPublications(qc, tenantId)` and call it from the new `useSchedulePostMutation.onSuccess` / `useEditPostScheduleMutation.onSuccess` / `useCancelPostScheduleMutation.onSuccess` so the queue, calendar, AND drafts lists refetch after a schedule change (drafts needs to re-render the derived `PostStatus`).
- `apps/front/src/lib/navigation/breadcrumb-contract.test.tsx` — the new queue/calendar pages register crumbs; this test is auto-extended and needs no source change.
- `apps/front/src/routes.ts` — the existing `route('/posts', 'authed/tenant/posts.tsx', [...])` already wires queue/calendar. No change.

## D1 dependency

D3 lands `PublishPublicationJobHandler` (and the `PublishingJobs` definition) because the D1 branch is in flight at the start of D3. The plan assumes that at the moment D3 begins implementation, the merged develop tree contains D1's `Publication` entity, `PublicationConfiguration`, `PublicationStatus`, `PublicationSchedule`, `PublicationIdempotencyKey`, `IPublicationStatusTransitionService` + impl + spec, `IPublishProvider`, `BlueskyPublishProvider`, and the `PublicationArchitecture.Spec` (no rogue writers). If any of those are still missing on develop at the time of implementation, Task 0 falls back to "rebase D1 first or replicate the missing surface" — the implementer pins the develop SHA in the PR body.

The D1 plan's `JobDefinition` and `JobHandler` for `publishing.publish-publication.v1` are NOT merged at the time D3 begins (D1's plan declares it but the branch is in flight and its merged state at the start of D3 implementation may or may not include them). D3 publishes them in the merged tree under `apps/api/Modules/Publishing/Jobs/PublishingJobs.cs` and `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` so the `DispatchDuePostsJob` has a handler to enqueue for. The D1 plan's spec asserts are reasserted in `PublishPublicationJobHandler.Spec.cs`; the architecture guard's no-rogue-writer assertion is extended to cover the new handler. (If the D1 branch merges the handler first, D3's Task 7 deletes the D3-published copy and re-imports from D1 to avoid drift — a single file move, captured in the PR body.)

## Task 0: Plan commit (this file)

- [x] Write this plan; commit `docs(superpowers): D3 implementation plan (publication scheduling — schedule, edit, cancel, due-scan, queue, calendar)`; push.

## Task 1: Tenant schedule endpoint + service

**Files:** `Services/IPublicationService.cs` + `PublicationService.cs`; `Handlers/Tenant/SchedulePostForTenant.cs` (+ Spec); `Routes.Publishing.cs`; `Endpoints/PublicationEndpointsForTenant.cs`; `ServiceRegistration.cs`; `Program.cs`; `AppPermissions.cs` (verify only).

- [ ] **Step 1 (RED):** `SchedulePostForTenant.Spec` integration spec (Testcontainers, co-located, mirrors the B2 pattern):
  ```csharp
  // happy: 1 active account, scheduledAtLocal=2099-08-26T09:00, zone=Europe/Paris → 1 Publication row, scheduled_at_utc=2099-08-26T07:00Z, scheduled_time_zone=Europe/Paris, status=Scheduled, idempotency_key set, postId FK set, TenantId == tenant.
  // multi: 2 active accounts in the same project → 2 Publication rows, both Scheduled, distinct ids, same postId.
  // account-not-in-project: 1 active account not attached to the post's project (project from another tenant OR no project) → 422 with translation key "publication-schedule-account-not-in-project" (or similar — define in ResponseKeys).
  // 422: empty accountIds; scheduledAtLocal in the past beyond a small drift (now-1min) for the v1 case; timeZone not IANA; postId malformed.
  // 403: member without tenant.posts.publish.
  // 404: postId missing for this tenant.
  // tenant isolation: account from another tenant's project → 422.
  // no Bluesky call: spec asserts no outbound HTTP (a fake IPublishProvider that records PublishAsync calls must show zero calls after schedule).
  ```

- [ ] **Step 2 (GREEN):**
  - `IPublicationService.ScheduleAsync(SchedulePublicationArgs args, CancellationToken ct)` where `SchedulePublicationArgs(tenantId, postId, accountIds[], scheduledAtLocal, timeZone, actorUserId)`. Computes UTC from `(scheduledAtLocal, timeZone)` via `TimeZoneInfo.FindSystemTimeZoneById(zone)` + `TimeZoneInfo.ConvertTimeToUtc`. Validates each account id (Active status; `VisibleIn.Visible(account, post.ProjectId)` when the post has a project; if the post has no project, only accounts with empty `SocialAccountProject` set are valid). Builds N `Publication` rows (no status writes — the default `Scheduled` is set on insert; the transition service is not involved here, only on transitions). Persists with the existing `_db.Publication.AddAsync`; emits an audit log via `IAuditLogService.LogAsync(new CreateAuditLogArgs(...))` with action `AuditActions.PublicationScheduled`. Returns `SchedulePublicationResult` with the new publication ids and the chosen `ScheduledAtUtc`.
  - `SchedulePostForTenant` handler: validates `Body` via `JsonElementRules.MustBeRequiredArrayOfNonEmptyGuids("accountIds", 1, 50)`, `MustBeLocalDateTime("scheduledAtLocal")`, `MustBeRequiredIanaZone("timeZone", PublicationSchedule.MaxTimeZoneLength)`; cross-checks post exists for tenant (via `IPostService.GetByIdForTenantAsync`); calls `IPublicationService.ScheduleAsync`; returns `TypedResults.Created((string?)null, new SchedulePostResponse { PostId, ScheduledAtUtc, TimeZone, AccountIds, PublicationIds })` with status 201.
  - Wire the route: `MapPost(Routes.Publishing.ForTenant.Schedule, SchedulePostForTenant.Handle)` with `.WithName("SchedulePostForTenant")`, `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])`, `.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)`.

- [ ] **Step 3:** Run focused filter `dotnet test --filter "FullyQualifiedName~SchedulePostForTenantSpec"`; expect green. Commit `feat(publishing): tenant schedule endpoint — date + IANA zone, one Publication per account`.

## Task 2: Tenant edit endpoint + service + transition (RescheduleToFuture)

**Files:** `Services/PublicationService.cs` (add `EditScheduleAsync`); `Services/IPublicationStatusTransitionService.cs` (add `RescheduleToFutureAsync`); `Handlers/Tenant/EditPostScheduleForTenant.cs` (+ Spec); `Endpoints/PublicationEndpointsForTenant.cs`; `Lib/PublicationZoneFormatter.cs`.

- [ ] **Step 1 (RED):** spec asserts:
  - happy: post with one Scheduled publication; PATCH with `{ body: "new text", scheduledAtLocal: future, timeZone: Europe/Paris }` → publication row has new `Schedule` (DST-aware: 2099-12-15T09:00 Europe/Paris = 08:00Z), `LastError = null`, `ExternalRecordId/Url = null`; post body updated; the new text is also used to derive `Post.Body`; audit log records `PostUpdated` + `PublicationRescheduled`.
  - edit only text: schedule omitted → publication rows untouched, only `post.Body` updated.
  - edit only schedule: body omitted → only the publication rows updated.
  - in-progress refusal: post with 1 InProgress publication; PATCH `{ body: "x" }` → 409 with `response-message: "publication-schedule-in-progress"` and a plain-words body (e.g., "Can't edit while a publication is in progress."). The text edit is REFUSED (not silently dropped): a 409 leaves the post and the publication untouched. The plain-words message is asserted.
  - 422: timeZone not IANA; scheduledAtLocal in the past beyond the drift.
  - 403: missing `tenant.posts.publish`.
  - 404: postId missing.
  - cross-tenant: 404.
  - accountIds not in PATCH (schedule is a per-post update, not a per-publication update — D4 adds a per-publication edit if needed; out of v1 here).

- [ ] **Step 2 (GREEN):**
  - Add `IPublicationStatusTransitionService.RescheduleToFutureAsync(publicationId, tenantId, PublicationSchedule, ct)`. Transition map: only `Scheduled → Scheduled` and `Paused → Scheduled` are allowed; the implementation clears `LastError`/`ExternalRecordId`/`ExternalUrl`, sets `Schedule`, preserves `IdempotencyKey`. Refusal: `InvalidOperationException` (transition guard pattern, same as D1).
  - `IPublicationService.EditScheduleAsync(EditPostScheduleArgs(args...))` orchestrates: (1) if `body` is present, call `IPostService.UpdateForTenantAsync` (which uses the existing D1 transition service; for `InProgress` posts, the post-level update must also refuse — the simplest invariant is "if any publication is `InProgress`, the whole edit is refused", enforced at this service method); (2) if `scheduledAtLocal` is present, reload all `Scheduled`/`Paused` publications for the post (tenant-scoped), then for each call `RescheduleToFutureAsync(publicationId, tenantId, schedule, ct)`. Audit log emits `PublicationRescheduled`.
  - `EditPostScheduleForTenant` handler: `PatchField<string>` for `body`, `PatchField<DateTime>` for `scheduledAtLocal`, `JsonElement` for `timeZone` (parsed only when `scheduledAtLocal` is present). Validator: any field present; at least one of body or scheduledAtLocal must be present; if any publication is `InProgress` return `TypedProblems.Conflict("Cannot edit a post while a publication is in progress.", ResponseKeys.PublicationScheduleInProgress)`.
  - Wire route `MapPatch(Routes.Publishing.ForTenant.EditSchedule, …)` with `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])`, rate limit `AuthenticatedDefault`.

- [ ] **Step 3:** Green; commit `feat(publishing): tenant edit endpoint — text and/or instants, refused while InProgress`.

## Task 3: Tenant cancel endpoint + service

**Files:** `Services/PublicationService.cs` (add `CancelScheduleAsync`); `Handlers/Tenant/CancelPostScheduleForTenant.cs` (+ Spec); `Endpoints/PublicationEndpointsForTenant.cs`.

- [ ] **Step 1 (RED):** spec asserts:
  - happy: post with 2 Scheduled publications; DELETE → both rows are hard-deleted; post remains with no publications; the queue and drafts list are consistent (drafts shows the post; queue is empty). Audit log records `PublicationScheduleCancelled` with details `{ postId, deletedCount, keptStatuses: [] }`.
  - nothing-to-cancel: post with 0 Scheduled publications (all in InProgress, all Published, or all Failed) → 200 with `ApiResponse` message "No scheduled publications to cancel."; the response body's `translationKey` is `post-schedule-cancel-noop` (a new ResponseKeys constant). Audit log records the no-op (so a future "undo" feature can replay the intent).
  - mixed: post with 1 Scheduled + 1 InProgress; DELETE → only the Scheduled row is hard-deleted; the InProgress row remains; the InProgress one is NOT a refused side-effect — the response is 200 with translation key `post-schedule-cancelled-success` and a body that says "Cancelled 1 scheduled publication; 1 in-progress kept."; audit log records `{ deletedCount: 1, keptStatuses: ["in_progress"] }`.
  - 403: missing `tenant.posts.publish`.
  - 404: postId missing or other tenant.
  - cross-tenant: 404 (never a 403 — owner rule, no leak of existence).
  - post is hard-deleted: returns 404 (the cancel service checks `post is null || post.IsDeleted`).

- [ ] **Step 2 (GREEN):**
  - `IPublicationService.CancelScheduleAsync(tenantId, postId, actorUserId, ct)`. Reloads the post tenant-scoped; returns `CancelScheduleResult.NotFound` if absent. Counts Scheduled publications for the post; deletes ONLY those (EF `Where(... Status == Scheduled).ExecuteDeleteAsync(ct)` — no entity tracking, no transition service involved; the deletion is a SQL DELETE, not a status change). Emits audit log with the kept/deleted counts.
  - `CancelPostScheduleForTenant` handler: `MapDelete(Routes.Publishing.ForTenant.CancelSchedule, …)` with the same permission + rate limit; returns `TypedResults.Ok(ApiResponse.Create(message, translationKey))` with the right translation key per outcome (cancelled / noop).
  - Wire the route.

- [ ] **Step 3:** Green; commit `feat(publishing): tenant cancel endpoint — delete Scheduled publications, post returns to draft`.

## Task 4: Find scheduled publications (queue + calendar list)

**Files:** `Services/PublicationService.cs` (add `FindScheduledAsync`); `Handlers/Tenant/FindScheduledPublicationsForTenant.cs` (+ Spec); `Lib/PublicationZoneFormatter.cs`; `Endpoints/PublicationEndpointsForTenant.cs`; `Routes.Publishing.cs`.

- [ ] **Step 1 (RED):** spec asserts:
  - happy: tenant with 3 Scheduled publications at instants T1 < T2 < T3; `GET /publications?from=T0&to=T4&status=scheduled` → 200, items ordered by `(scheduled_at_utc, id)` ascending, all three with `accountDisplayHandle` populated (joined from `SocialAccount.DisplayHandle`), all with `postBodyPreview` (280 chars), all with `postStatus = "scheduled"` (derived per D1's `PostStatusDerivation.Derive`).
  - window bound: from > to → 422 with translation key `publication-window-invalid`.
  - window too wide: `to - from > 31 days` → 422 with translation key `publication-window-too-wide`.
  - status filter: csv `scheduled,in_progress` → 2 statuses, 2 rows; invalid status in csv → 422.
  - empty window: 0 rows; 200 with empty array.
  - past-only: instant < now + ScheduledAtUtc ≤ now is INCLUDED (the spec §3 says "scheduled whose instant has passed" — a missed-by-worker publication must still surface in the queue, owner rule). Spec proves a row with `scheduled_at_utc = now - 5min` is included when status filter is `scheduled` (i.e. the due-scan hasn't picked it up yet — operator visibility).
  - keyset cursor: rows ordered by `(scheduled_at_utc, id)`, cursor opaque (base64 of the last `(scheduled_at_utc, id)`), next page returned correctly; cursor with a non-existent row → 400.
  - tenant isolation: a row with another tenant's TenantId never appears.
  - 403: missing `tenant.posts.publish`.
  - **zone round-trip** (D3 owner proof): seed a publication with `scheduled_at_utc = 2099-12-15T08:00:00Z` + `scheduled_time_zone = "Europe/Paris"` (DST: 2099-12-15 is winter, +1 = 09:00 local). Assert the wire payload `scheduledAtLocal` and `timeZone` are exactly `2099-12-15T09:00:00` and `Europe/Paris`. And the reverse: send a schedule request with `scheduledAtLocal = 2099-08-26T09:00:00, timeZone = Europe/Paris` (summer, +2) and assert the stored `scheduled_at_utc` is `2099-08-26T07:00:00Z`. The spec exercises BOTH directions and DST.

- [ ] **Step 2 (GREEN):**
  - `IPublicationService.FindScheduledAsync(FindScheduledPublicationsArgs(tenantId, fromUtc, toUtc, statuses[], cursor, limit, sortId, sortOrder), ct)`. Builds the LINQ query against `_db.Publication` joined to `Post` (for body preview + status) and `SocialAccount` (for display handle). Status filter via `Where(p => statuses.Contains(p.Status))`. Window filter `Where(p => p.ScheduledAtUtc >= fromUtc && p.ScheduledAtUtc < toUtc)`. Keyset: `if (cursor.HasValue) Where(p => p.ScheduledAtUtc > last.ScheduledAtUtc || (p.ScheduledAtUtc == last.ScheduledAtUtc && p.Id > last.Id))`. Order `By(p => p.ScheduledAtUtc).ThenBy(p => p.Id)`. Take `limit + 1` to compute the next cursor. Map to `ScheduledPublicationListItem` (id, postId, accountId, accountDisplayHandle, postBodyPreview, postStatus (string), scheduledAtUtc, scheduledAtLocal (DateTime in kind=Unspecified, derived via `TimeZoneInfo.ConvertTimeFromUtc`), timeZone, status, lastError, attempts, isEditable (true iff status == Scheduled || status == Paused)).
  - `FindScheduledPublicationsForTenant` handler: `[AsParameters] FindScheduledPublicationsQuery` with `from` (UTC, required), `to` (UTC, required), `status` (csv, default `scheduled`), `cursor` (optional), `size` (optional, capped at 100). Validates: window order, window width ≤ 31 days, status csv parser, cursor format, limit bounds. Calls the service. Returns `TypedResults.Ok(new FindScheduledPublicationsResponse { Data, NextCursor })`.
  - Wire route `MapGet(Routes.Publishing.ForTenant.Find, …)` with `.WithName("FindScheduledPublicationsForTenant")`, `.RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)`, `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])`.

- [ ] **Step 3:** Green; commit `feat(publishing): list scheduled publications (queue + calendar) with zone round-trip`.

## Task 5: Architecture guard extensions

**Files:** `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` (extend), `apps/api/Lib/Architecture/ArchitectureGuard.Spec.cs` (verify), `apps/api/Lib/Architecture/ArchitectureDiscovery.cs` (verify).

- [ ] **Step 1 (GREEN first):** extend the existing `PublicationArchitecture.Spec` with:
  - (a) every `Map*` invocation in `apps/api/Modules/Publishing/Endpoints/PublicationEndpointsForTenant.cs` has both `.WithTenantPermission(...)` and `.RequireRateLimiting(...)` (the source scan follows the `Map*(`-then-property-call pattern, same as `EndpointPermissionMetadataGuard`).
  - (b) the `DispatchDuePostsJob` query is the **only** direct `FOR UPDATE SKIP LOCKED` against `publications` in the codebase (the source scan excludes the job file itself, ensuring no second writer is added later).
  - (c) the `IPublicationService` is the only caller of `_db.Publication` for write operations other than the transition service; the source scan asserts no `db.Set<Publication>()` / `_db.Publication` mutation outside `PublicationService.cs` and `PublicationStatusTransitionService.cs`.

- [ ] **Step 2 (RED proof — rogue edit handler):** plant `apps/api/Modules/Posts/Services/RogueScheduleWriter.cs` (temp, uncommitted) doing `_db.Publication.First().Schedule = PublicationSchedule.Create(...); _db.SaveChangesAsync();` and a rogue `public static Task SetStatusDirect(Publication p) { p.Status = PublicationStatus.Scheduled; }`. Run the guard — MUST FAIL naming both the file and the line. Transcript to `.dump/mutation-rogue-schedule-writer.md`.

- [ ] **Step 3 (RED proof — concurrent due-scan with non-zero claim overlap):** plant a `apps/api/Modules/Publishing/Jobs/RogueDispatch.cs` that does the same `SELECT ... FOR UPDATE SKIP LOCKED` against `publications` and enqueues WITHOUT the idempotency key. Run `DispatchDuePostsConcurrency.Spec` after wiring the rogue into the same DI scope as a `BackgroundService` hook. MUST FAIL with the expected unique-violation (F13) when two scans race — the rogue's lack of idempotency key makes the assertion "second scan sees zero rows" false. Transcript to `.dump/mutation-dispatch-no-idempotency.md`.

- [ ] **Step 4:** delete the rogues (byte-exact absence), rerun the guard + the concurrency spec green. Commit `test(api): D3 architecture guard — no rogue schedule writers, no concurrent due-scan enqueue`.

## Task 6: DispatchDuePostsJob + system-job seeder

**Files:** `apps/api/Modules/Publishing/Jobs/DispatchDuePostsJob.cs` (+ Spec + Concurrency Spec); `apps/api/Modules/Publishing/Seeders/DispatchDuePostsSystemJobSeeder.cs`; `apps/api/Modules/Jobs/Seeders/SystemJobDefinitionSeeder.cs` (call into the new seeder — see File structure note); `apps/api/Migrations/*_AddDispatchDuePostsSystemJob.cs`; `apps/api/Modules/Publishing/Jobs/PublishingJobs.cs`; `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` (+ Spec) — see "D1 dependency" note above.

- [ ] **Step 1 (RED):** `DispatchDuePostsJob.Spec` integration spec (Testcontainers, direct invocation):
  - seed 3 publications: P1 (Scheduled, `scheduled_at_utc = now - 1min`), P2 (Scheduled, `scheduled_at_utc = now + 10min`), P3 (InProgress).
  - replace `IPublishProvider` with a no-op fake (the handler is not called here — we only assert the enqueue).
  - replace `IJobEnqueuer` with a recording fake that records `(JobType, Payload, IdempotencyKey)`.
  - call `await handler.HandleAsync(new JobContext { JobId = Guid.NewGuid() }, CancellationToken.None)`.
  - assert: the recording fake has exactly one enqueue: `("publishing.publish-publication.v1", PublishPublicationPayload(PublicationId = P1, IdempotencyKey = PublicationIdempotencyKey.For(P1)), IdempotencyKey = PublicationIdempotencyKey.For(P1))`.
  - P1 row now has `Status = InProgress`, `Attempts = 1` (the transition service bumped it).
  - P2, P3 unchanged.
  - No Bluesky call (no `IPublishProvider.PublishAsync` invocation).

- [ ] **Step 2 (RED — concurrent SKIP LOCKED proof):** `DispatchDuePostsConcurrency.Spec` seeds 50 past-due Scheduled rows + 5 future + 5 InProgress. Two `Task.Run` calls invoke `HandleAsync` concurrently with the same real DI scope (a `using var scope = _fixture.Factory.Services.CreateAsyncScope()` per concurrent call so each has its own context). The recording fake concatenates both enqueue lists. Assert:
  - union of enqueued publication ids == 50 past-due ids, no other rows.
  - for each publication, the count of enqueues with that `idempotency_key` is exactly 1.
  - the underlying `job_queue` table holds exactly 50 rows with `job_type = "publishing.publish-publication.v1"` (the partial unique index `ix_job_queue_job_type_idempotency_key` rejects the loser, F13).
  - no row has `Status = Scheduled` after both scans complete (every past-due row was claimed exactly once).

- [ ] **Step 3 (GREEN):** `DispatchDuePostsJob`:
  - `public const string JobKey = "publishing.dispatch-due-posts.v1";`
  - `public string JobType { get { return JobKey; } }`
  - `HandleAsync(JobContext, ct)`: `await using var tx = await _db.Database.BeginTransactionAsync(ct);` then `var claimed = await _db.Database.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM publications WHERE status = 10 AND is_deleted = false AND scheduled_at_utc <= now() ORDER BY scheduled_at_utc, id LIMIT {BatchSize} FOR UPDATE SKIP LOCKED").ToListAsync(ct);` (single statement, sub-millisecond on a seeded fixture). For each `id`: load the publication (tenant-scoped via `_db.Publication.Single(p => p.Id == id && !p.IsDeleted)`, fetch the idempotency key from the row), call `_enqueuer.EnqueueAsync(PublishingJobs.PublishPublicationV1, new PublishPublicationPayload(PublicationId, IdempotencyKey), new EnqueueOptions { IdempotencyKey = IdempotencyKey }, ct)`, then call `await _transition.MarkInProgressAsync(id, publication.TenantId, ct)`. Commit. Return `JobOutcome.Succeeded`. If `claimed.Count == 0`, return `JobOutcome.Succeeded` immediately.
  - `PublishingJobs.PublishPublicationV1.Validate` asserts `p.IdempotencyKey == PublicationIdempotencyKey.For(p.PublicationId)` (defence-in-depth: if the wire payload and the row's stored key drift, the enqueue refuses — the handler reloads the row and re-derives the canonical key before publishing).
  - `PublishPublicationJobHandler` (per D1 plan Task 6 — reasserted here so D3 lands it in the merged tree): `HandleAsync(JobContext, ct)` reloads the publication tenant-scoped via the row's own `TenantId` (job context has no HTTP tenant), returns `JobOutcome.Cancelled("publication not found")` if absent or terminal-already; else `MarkInProgressAsync` → `ISocialSessionProvider.OpenSessionAsync(publication.SocialAccountId)` → on `AccountFailure`, `MarkPausedAsync` + flip account to `NeedsReconnect` (Epic C) + `JobOutcome.Succeeded`; on `Transient`, `JobOutcome.Retry(Error = sanitised cause)`; on `Opened`, `IPublishProvider.PublishAsync(PublishRequest(PublicationId, IdempotencyKey, Post.Body, Schedule.Utc, Session))` → on `Published`/`AlreadyExistsTreatedAsPublished` mark Published + account `LastSuccessAt = now` + `JobOutcome.Succeeded`; on `ContentFailure` mark Failed + `JobOutcome.Succeeded` (no retry); on `TransientFailure` return `JobOutcome.Retry`; on `AccountFailure` return `JobOutcome.Succeeded` (the domain has reached a terminal state — `MarkPausedAsync` was called). Unknown exception bubbles → engine classifies Retry.

- [ ] **Step 4 (GREEN — seeder + migration):**
  - `DispatchDuePostsSystemJobSeeder` is an `IEntitySeeder` (`Order = 60`, after the existing `Order = 50` system-job seeder). On `SeedAsync`, it inserts the `system_job_definitions` row `{ JobKey = "publishing.dispatch-due-posts.v1", CronExpression = "0 * * * * ?", IsEnabled = true, Description = "Enqueue due scheduled publications for the worker (every minute, FOR UPDATE SKIP LOCKED)." }` using the same `INSERT ... ON CONFLICT (job_key) WHERE is_deleted = false DO NOTHING` pattern as the existing seeder.
  - Migration: a hand-written `migrationBuilder.Sql("INSERT INTO system_job_definitions (job_key, cron_expression, is_enabled, description) VALUES ('publishing.dispatch-due-posts.v1', '0 * * * * ?', true, '…')")` with the matching `Down(...)` removing the row. Verified by `dotnet ef migrations script` between the parent migration and the new one — only an INSERT, no DDL change.
  - Wire the seeder from `Program.Main` alongside other seeder invocations (or in `ServiceRegistration` if that's the pattern; match what the existing `SystemJobDefinitionSeeder` does).
  - Register the handlers: `builder.AddJobHandler<DispatchDuePostsJob>(DispatchDuePostsJob.JobKey);` and `builder.AddJobHandler<PublishPublicationJobHandler>(PublishingJobs.PublishPublicationV1.JobType);` inside `JobsServiceRegistration.AddWorkerServices` (or the equivalent path that keeps `AppRoleComposition.Spec` green).

- [ ] **Step 5:** run `DispatchDuePostsJob.Spec`, `DispatchDuePostsConcurrency.Spec`, `PublishPublicationJobHandler.Spec`, plus the existing `SystemJobDefinitionSeeder.Spec` (must stay green), then `just build-api`, then `just ci-migration-expand-contract`. Green; commit `feat(publishing): DispatchDuePostsJob + system-job seed — every minute, FOR UPDATE SKIP LOCKED, in-flight dedup`.

## Task 7: Front — list page (queue), calendar page, schedule/edit/cancel mutations

**Files:** the entire `apps/front/src/lib/query/tenant-publications.ts` family; `apps/front/src/lib/format/zone-date-time.ts`; `apps/front/src/routes/authed/tenant/posts/queue.tsx` (REPLACE); `apps/front/src/routes/authed/tenant/posts/calendar.tsx` (REPLACE); `apps/front/src/routes/authed/tenant/posts/queue.test.tsx` (REPLACE); `apps/front/src/routes/authed/tenant/posts/calendar.test.tsx` (REPLACE); `apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx` (extend with Publish on); `apps/front/src/i18n/locales/en/posts.json` + `fr/posts.json`; `apps/front/src/lib/query/tenant-posts.ts` (add `invalidateTenantPublications`); `apps/front/src/lib/format-date-time.ts` (extend to accept an optional zone).

- [ ] **Step 1 (RED — typecheck the new Kiota models):** after the API contract lands, `just generate-client`; the spec `pnpm --filter front typecheck` will fail because the existing `apps/front/src/lib/query/tenant-posts.ts` and the new `tenant-publications.ts` reference models that do not yet exist. The fix is to write the new module referencing the expected `client.publications.*` and `client.posts.byPostId(postId).schedule.*` paths (Kiota's autogenerated shape). The typecheck is RED by construction; the GREEN is `just generate-client` having produced the models + the new module being valid TS.

- [ ] **Step 2 (RED — front unit tests):** co-located vitest specs in `zone-date-time.test.ts`, `tenant-publications.test.ts`, `queue.test.tsx`, `calendar.test.tsx`. The tests use the existing `createFileRoute` vi-mock and a `QueryClientProvider` test helper. The first run expects: (a) the test imports succeed but the actual page renders `StateSurface` (empty state) when the query returns an empty payload, and renders the table headers when the query returns a fixed payload; (b) `zone-date-time.test.ts` asserts summer and winter round-trips; (c) `tenant-publications.test.ts` asserts the `buildFindScheduledPublicationsQueryParameters` helper maps `size` to `limit` and csv-encodes `status`.

- [ ] **Step 3 (GREEN):**
  - `tenant-publications.ts` mirrors `tenant-posts.ts` exactly. One `saveSchedule` writer reused for create + edit (mirroring the `savePost` pattern). Mutations call `invalidateTenantPublications(qc, tenantId)` AND `invalidateTenantPosts(qc, tenantId)` on success. Permission gate: the front reads `usePermissions()` (existing helper) and hides the action menu when `tenant.posts.publish` is missing.
  - `zone-date-time.ts`: `formatInZone(utc: Date | string, zone: string): string` returns the dayjs-format string with the zone in parentheses; `parseLocalWallTime(local: string, zone: string): Date` parses a wall time string with the given zone and returns a UTC `Date`. The `dayjs` import is the `shared-ts` wrapper, never the raw package (per `publy/no-direct-dayjs-in-components`).
  - `queue.tsx` (REPLACE): the same `DataTable` shape as drafts.tsx, with columns: excerpt (link to edit), account (display handle from the schedule payload), when (`formatInZone(scheduledAtUtc, timeZone)`), status (Badge variant by status), actions (edit + cancel). The data source is `useScheduledPublicationsQuery` with default `from = now()`, `to = now() + 7 days`, `status = "scheduled"`. Keyset pagination via the existing `useTableController` + `scopedKey`. The action menu uses the existing `DataTableRowActions`. Cancel action opens a `ConfirmDialog` with the post's body as the description.
  - `calendar.tsx` (REPLACE): a month grid component. State: `currentMonth: Date` (the first of the month). Compute `from = first of month`, `to = first of next month` (UTC). Query the publications for that window. Render a 7×N grid of day cells; each cell lists the publications for that day as `Pill` components with the time and account handle; pills link to the post edit. The `Paused` / `Failed` / `InProgress` pills use the destructive / muted / accent variants. `prev month` / `next month` buttons update `currentMonth` and write the new month to URL state (snake_case `from`/`to` query params for shareability). Empty state: a `StateSurface` "No scheduled publications this month."
  - `_create-post-drawer.tsx` (extend): add a "Publish on" block above the existing action bar. The block fetches the social accounts visible in the post's project (the spec lists a single account for v1; the model supports several). The block has a `Tabs` (or a `RadioGroup`) of three modes: "Save as draft" (default), "Publish now", "Schedule". The latter two enable the account list (checkboxes) and a date+time+zone picker. The "Publish on" block is only rendered when the user has the `tenant.socialaccounts.publish` permission AND the post has at least one visible social account; otherwise the block is hidden and the form reverts to "Save as draft only" with a hint. The submit calls `saveSchedule(input, { tenantId })` which dispatches `POST` or `PATCH` based on whether the post is a draft or already scheduled.
  - i18n: every new key in both `en/posts.json` and `fr/posts.json`. The i18n-namespaces test enforces both locales.

- [ ] **Step 4:** run `pnpm --filter front typecheck`; `pnpm --filter front test` (full unit suite); `pnpm --filter front check:design-system`; `just react-doctor --scope files`. All green. Commit `feat(front): queue + calendar pages wired to the scheduling API, with the schedule form in the create drawer`.

## Task 8: E2E "schedule → appears in queue and calendar in the chosen zone → cancel → back in drafts"

**Files:** `apps/front/e2e/tenant-posts-schedule.spec.ts`; `apps/front/e2e/__tests__/e2e-tag-guard.test.ts` (verify).

- [ ] **Step 1 (RED — spec written, e2e stack boot):** the spec uses the existing `apps/front/docker-compose.test.yml` (no change) and the existing `request-counter` sidecar (no change). The spec follows the existing `staff-tenants.spec.ts` pattern: `test.use({ storageState: 'acme-admin.json' })` (the storage state is generated by the existing `auth-screens.spec.ts` flow). Steps assert via the `request-counter` sidecar:
  1. GET `/posts` (drafts empty) — counter increments.
  2. POST `/posts` — counter increments.
  3. POST `/posts/{id}/schedule` with `accountIds=[<seeded-account>]`, `scheduledAtLocal=<now + 5min>`, `timeZone=<browser-detected zone>` — counter increments; the response payload's `scheduledAtUtc` is the wall time converted via the zone (asserted against the body's `now`).
  4. GET `/publications?from=<now-1min>&to=<now+1h>&status=scheduled` — the new publication appears; `accountDisplayHandle` matches the seeded account; `timeZone` matches the body.
  5. Visit `/tenant/posts/queue` — the table shows the row with the correct zone label.
  6. Visit `/tenant/posts/calendar` for the current month — the row's day cell has the publication pill.
  7. Open the row's action menu → click "Cancel" → confirm. POST `/posts/{id}/schedule` (DELETE) — counter increments.
  8. GET `/publications?from=<now-1min>&to=<now+1h>&status=scheduled` — the row is gone.
  9. GET `/posts?status=draft` — the post is back in drafts.
  10. Assert no secret in any captured response header (no `X-Session-Token` echoed).

- [ ] **Step 2 (RED — tag guard):** the e2e-tag-guard vitest reads the new spec and asserts `{ tag: ['@tenant-workspace', '@646'] }` is on the top-level `test.describe`. The first commit run with the new spec expects the guard to FAIL if the tag is missing; the GREEN is the spec carrying the tag.

- [ ] **Step 3 (GREEN):** run the spec via `pnpm --filter front test:e2e:tag "@tenant-workspace.*@646"` after the API and the docker compose stack are up. The e2e may need a small database seed for the Acme social account — add a `apps/front/e2e/seed/social-account.ts` helper that POSTs a Bluesky account via the existing social-accounts API (or directly through the DB if the API surface is gated) — copy the pattern from any existing e2e seed helper that creates tenant-level fixtures. The brief mandates "REAL roles/testids" — the spec uses `data-testid="tenant-posts-queue-table"`, `-new-post`, `-edit-...`, `-cancel-...` (named exactly like the existing drafts page), plus the queue row's `data-testid="tenant-posts-queue-row-{postId}"`. Confirm the testids exist in the new components before relying on them.

- [ ] **Step 4:** full e2e suite once under heavy.sh. Green. Commit `test(front): e2e — schedule → appears in queue and calendar in the chosen zone → cancel → back in drafts (REAL roles, REAL testids)`.

## Task 9: Gates + PR

- [ ] Run `pnpm --filter front typecheck`, `pnpm --filter front test`, `pnpm --filter front check:design-system`, `just react-doctor --scope files`.
- [ ] Run the API suite for the Publishing, Posts, and SocialAccounts modules once under heavy.sh (focused, < 20 min lock): `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj --filter "FullyQualifiedName~Publishing|FullyQualifiedName~PostTenantCrud|FullyQualifiedName~SocialAccount"`.
- [ ] `heavy.sh just build-api`; `just generate-client`; commit the regenerated `packages/client-ts/src/**` and `apps/api/openapi.json`.
- [ ] `heavy.sh just ci-migration-expand-contract`; `heavy.sh just ci-quality-dotnet`.
- [ ] `heavy.sh just ci-front` (full front gate).
- [ ] Write the PR body to `.dump/pr-body.md` with the structure from the brief: what the plan covers, explicit open questions for the owner (D1 dependency, `tenant.posts.publish` vs `tenant.posts.schedule` reconciliation, calendar window cap of 31 days), proofs list (§6 D3: two concurrent scans never enqueue the same row, edit during `InProgress` refused, cancel → draft, zone round-trips + DST, integration specs, architecture guard, e2e), the exact line `Model: Ox Alpha via Nous Portal (jcode), effort max`, `Unverified until CI: …`, "Anything in this brief that turned out to be wrong" (D1 dependency landing order, the existing `PostPermissionsForTenant.SCHEDULE` reconciliation note), and `Closes #<new-plan-issue>` / `Part of #<issue>`.
- [ ] Push the branch; open the PR against develop; poll `gh pr checks`; if "no checks reported" > 1 min, fetch origin develop, rebase keeping both intents, `--force-with-lease`.
- [ ] `.dump/DONE.md` with the tip SHA, the PR number, and the evidence paths (`.dump/mutation-rogue-schedule-writer.md`, `.dump/mutation-dispatch-no-idempotency.md`).
- [ ] Print `DONE`.

## Interfaces (named in code; each task is test-against-the-interface)

- `PublyApp.Api.Modules.Publishing.Services.IPublicationService`
  - `Task<SchedulePublicationResult> ScheduleAsync(SchedulePublicationArgs args, CancellationToken ct)`
  - `Task<EditPostScheduleResult> EditScheduleAsync(EditPostScheduleArgs args, CancellationToken ct)`
  - `Task<CancelPostScheduleResult> CancelScheduleAsync(Guid tenantId, Guid postId, Guid actorUserId, CancellationToken ct)`
  - `Task<FindScheduledPublicationsResult> FindScheduledAsync(FindScheduledPublicationsArgs args, CancellationToken ct)`
  - `Task<RescheduleOneResult> RescheduleToFutureAsync(Guid publicationId, Guid tenantId, PublicationSchedule schedule, CancellationToken ct)`
- `PublyApp.Api.Modules.Publishing.Services.IPublicationStatusTransitionService` (D1 ships; D3 extends)
  - `Task<bool> RescheduleToFutureAsync(Guid publicationId, Guid tenantId, PublicationSchedule schedule, CancellationToken ct)`
- `PublyApp.Api.Modules.Publishing.Jobs.PublishingJobs`
  - `static readonly JobDefinition<PublishPublicationPayload> PublishPublicationV1 { get; }` — `JobType = "publishing.publish-publication.v1"`, `Priority = 0`, `MaxAttempts = 3`, `Validate` asserts `payload.IdempotencyKey == PublicationIdempotencyKey.For(payload.PublicationId)`.
- `PublyApp.Api.Modules.Publishing.Jobs.DispatchDuePostsJob : IJobHandler`
  - `public const string JobKey = "publishing.dispatch-due-posts.v1";`
  - `public string JobType { get; }` returns `JobKey`.
  - `public Task<JobOutcome> HandleAsync(JobContext context, CancellationToken ct)`.
- `PublyApp.Api.Modules.Publishing.Jobs.PublishPublicationJobHandler : IJobHandler`
  - `public string JobType { get; }` returns `PublishingJobs.PublishPublicationV1.JobType`.
  - `public Task<JobOutcome> HandleAsync(JobContext context, CancellationToken ct)`.
- `PublyApp.Api.Modules.Publishing.Lib.PublicationZoneFormatter`
  - `public static string Format(PublicationSchedule schedule, DateTime utcInstant)`
  - `public static DateTime ToLocalWallTime(PublicationSchedule schedule, DateTime utcInstant)`
  - `public static DateTime ToUtcFromWallTime(DateTime wallTime, string zone)`
- `apps/front/src/lib/query/tenant-publications.ts`
  - `useScheduledPublicationsQuery(variables & { tenantId })` — TanStack Query wrapper around `client.publications.get`.
  - `useSchedulePostMutation()`, `useEditPostScheduleMutation()`, `useCancelPostScheduleMutation()`.
  - `saveSchedule(input, { tenantId })` — single writer reused for both create and edit.
  - `invalidateTenantPublications(qc, tenantId)`.
- `apps/front/src/lib/format/zone-date-time.ts`
  - `formatInZone(utc: Date | string, zone: string): string` returns `"YYYY-MM-DD HH:mm (Zone)"`.
  - `parseLocalWallTime(local: string, zone: string): Date` returns a UTC `Date`.

## Proofs the spec requires (per §6 D3)

- **D3.1** Two concurrent scans never enqueue the same row — `DispatchDuePostsConcurrency.Spec` Task 6 proves this (50 past-due rows, 2 concurrent handlers, exact-once enqueue per row).
- **D3.2** Edit during `InProgress` refused with a plain-words message — `EditPostScheduleForTenant.Spec` Task 2 proves this (the 409 case with the `ResponseKeys.PublicationScheduleInProgress` translation key and the human-readable body).
- **D3.3** Cancel → draft — `CancelPostScheduleForTenant.Spec` Task 3 proves this (deletion of Scheduled publications; post remains; drafts list shows it; queue is empty).
- **D3.4** Zone round-trips — `FindScheduledPublicationsForTenant.Spec` Task 4 proves this (summer + winter DST for both directions: write→store and read→wire). Plus `zone-date-time.test.ts` on the front.
- **D3.5** Architecture guard: no rogue schedule writers — `PublicationArchitecture.Spec` extension in Task 5 (RED proof planted, transcript captured).
- **D3.6** Architecture guard: no concurrent due-scan enqueue — Task 5 step 3 RED proof (rogue without idempotency key, transcript captured).
- **D3.7** Integration specs for every handler and service path: happy, isolation, each permission verb refused, each failure kind — Tasks 1, 2, 3, 4, 6.
- **D3.8** E2E "schedule → appears in queue and calendar in the chosen zone → cancel → back in drafts" with REAL roles/testids — Task 8.

## Self-review

1. **Spec coverage:** every §6 D3 proof has a Task + a spec or transcript; every §2 model constraint (status set, indexes, idempotency key) is enforced by an existing D1 spec (no D3 change to those); every §3 step has a task (Schedule = Task 1, due-scan = Task 6, Retry = out of D3 scope, Resume = out of D3 scope — both are C4/D4 work); every §4 screen is a task (Queue = Task 7, Calendar = Task 7, edit/cancel = Tasks 2 + 3).
2. **No placeholders:** every step names exact files, real signatures, real commands, real DTOs, real D1 paths to consume from.
3. **Type consistency:** the front Kiota client is regenerated in Task 8 BEFORE the front is typechecked; the API and front always compile against the same `openapi.json`. Every `Publication` status write goes through the D1 transition service. Every job enqueue goes through `IJobEnqueuer`. Every Bluesky call goes through `IPublishProvider`.
4. **Open questions for the owner** (carried into the PR body): D1 dependency landing order, `tenant.posts.publish` vs `tenant.posts.schedule`, calendar window cap of 31 days, and whether the "Publish now" button in the drawer is part of D3 or D2 (this plan treats "Publish now" as part of D3's drawer because the spec §3 says "publish now = schedule for now", but the milestone is D2's).
5. **Constraints honored:** expand-only migration (just one INSERT for the system_job_definitions row), no Bluesky network in any spec (always a fake `IPublishProvider`), no suppressions, analyzers respected, one commit per task pushed.
