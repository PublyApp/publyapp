# D4 — Queue + Calendar + History UI + Retry: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Epic D step 8 (#647, part of #631; spec: `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md` §D4): wire the tenant **Queue** page to the D3 `GET /posts/{postId}/schedule` list (formerly `GET /publishing/publications`), wire the tenant **Calendar** to the same list in month-window form, wire the tenant **History** page to the D2 `GET /publishing/publications` keyset read, add the **Retry** button on `Failed` and `Paused` rows (status pill + plain-words cause + next action), and route the retry through the existing `IPublicationStatusTransitionService.RescheduleToNowAsync` — never a direct status write (the `PublicationArchitecture.Spec` ratchet forbids it). The plan also covers the missing `GET /publishing/scheduled-publications` (or its D3 renumbering) read endpoint that D3's plan listed but did not implement, and the architecture-guard extensions that pin the retry path to the transition service.

**Architecture:** D4 is mostly a wiring pass. The retry endpoint is a new `POST /publications/{publicationId}/retry` route on the existing `Routes.Publishing.ForTenant` group (D2 PR #645, merged to develop at commit `4de921331`) gated by `AppPermissions.Tenant.Posts.PUBLISH`; it calls a thin `RetryPublicationService.RetryAsync(args, ct)` that **only** re-issues the trust-boundary enqueue and **only** writes status through `IPublicationStatusTransitionService.RescheduleToNowAsync` (D1 PR #1433, on develop at `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179`). The Queue/Calendar/History pages consume the existing D2/D3 read endpoints through the regenerated Kiota client — D4 does not invent a new read shape. All UI failures are surfaced through `getFailureMessage(toApiFailure(error), …)` (the repo rule, enforced by `publy/no-manual-response-message-translation`).

**Tech Stack:** .NET 10 / EF Core 10 + Npgsql, xUnit + FluentAssertions, Testcontainers via `ApiFixture`. Front: React 19, TanStack Start/Router/Query 5, Base UI wrappers (`apps/front/src/components/ui/*`), Tailwind v4, RHF + Zod, Kiota client regenerated via `just generate-client`, dayjs via shared wrapper only (`publy/no-direct-dayjs-in-components`), Playwright (e2e tags `@tenant-workspace @647`).

## Global constraints (blocking)

- Analyzers PUBLY0001–0008 are errors: `is null`/`is not null` pattern matching; never `?? throw`; never `!`; never `ToLower()` dispatch; wire DTOs carry no `Dto` suffix; handlers cache repeated body-getter results; services depend only on DbContext + infrastructure seams (`IPublicationStatusTransitionService` is an infrastructure seam, not a service-service dependency — same stance as the D3 plan). Max 100 char lines; braces always on control flow.
- No disable/suppression comments, no `[Fact(Skip)]`, no ruleset/guard loosening, no sub-agents/workers (`opencode`/`claude`/`codex` blocked at exit 86 — captain 2026-08-23 15:30). The Go subscription is reserved for reviews.
- **Zero new migrations** in D4. All required tables/indexes exist on develop:
  - `publications` table + `ux_publications_post_account` (partial), `ix_publications_status_scheduled_at`, `ix_publications_tenant_scheduled_at_id` — `apps/api/Migrations/20260825143511_AddPublications.cs` (D1 PR #1433, on develop).
  - `social_accounts` + `social_account_projects` — C2 PR #1439, on develop.
  `just ci-migration-expand-contract` stays green trivially.
- `LastError` ≤ 2 KB sanitised via `SocialAccounts.Lib.LastErrorSanitiser.Sanitize` (`apps/api/Modules/SocialAccounts/Lib/LastErrorSanitiser.cs`; already on develop, used by the transition service). Never log secrets or session tokens. Every failure surfaced carries a human-readable cause and, where one exists, the next action (owner product rule 2026-08-22).
- Errors are RFC 7807 via `TypedProblems.*`; `422` validation problems carry stable `errors` keys; malformed GUID in route → 400 via `Guid.TryParse`; entity not found → 404. Success shapes: action-only success → `200 Ok<ApiResponse>` with message + translationKey; list success → 200 with items + next cursor.
- URL/query parameter names snake_case (`cursor`, `limit`, `status`, `from`, `to`, `month`, `retry` body field may be camelCase JSON; the **only** body field is the empty `{}` or a per-publication override bag).
- Heavy commands run under `~/ai-orchestration-playbook/tools/heavy.sh` (serialised host-wide); focused test filters first, module suites once near the end, never > 20 min under the lock (captain 2026-08-23 15:30).
- One task = one commit, push after EVERY commit (provider deaths are frequent tonight). Never touch develop. Secrets never in output. The plan file itself lives flat under `docs/records/` (never recreate `docs/superpowers/` — pruned by #1357; docs-archive CI rejects it).
- **Symbol honesty:** every symbol cited below exists on `origin/develop` (D1 + C2), on `origin/lane/wt-645b` (D2 history endpoint + Kiota regen + permission hook, all merged via PR #645), on `origin/lane/wt-646b` (D3 schedule/edit/cancel + service), or is created by a task below. Branch state in the citations; never invent.

## Prerequisites — in-flight work this plan builds on (READ from remote branches, NEVER merge)

### From D1 — `origin/develop` (commit `4de921331`)

- `apps/api/Modules/Publishing/Entities/Publication.cs` — `[Table("publications")]`, `BaseAttributes` + `ITenantEntity`; columns `tenant_id`, `post_id`, `social_account_id`, `status`, `scheduled_at_utc`, `scheduled_time_zone`, `external_record_id`, `external_url`, `last_error`, `attempts`, `idempotency_key`; navigations `Post`, `SocialAccount`, `Tenant`; plus `PublicationWire.FormatStatus(PublicationStatus)` returning `"scheduled" | "in_progress" | "published" | "failed" | "paused"`. Read at line 87-99.
- `apps/api/Modules/Publishing/Entities/PublicationStatus.cs` — enum `Scheduled=10, InProgress=20, Published=30, Failed=40, Paused=50`.
- `apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs` — `static string For(Guid publicationId)` (SHA-256 truncated to 128 bits, lowercase hex). Deterministic; doubles as the Bluesky record key suffix.
- `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` — `IPublicationStatusTransitionService` with `MarkInProgressAsync/MarkPublishedAsync/MarkFailedAsync/MarkPausedAsync/RescheduleToNowAsync` (line 160-179) each returning `Task<bool>`; `[Service(ServiceLifetime.Scoped)]`; tenant-scoped loads; illegal transitions throw. **The retry path goes through `RescheduleToNowAsync` (line 160-179) — no new transition method needed.**
- `apps/api/Modules/Publishing/Jobs/PublishingJobs.cs` — `PublishPublicationPayload { required Guid PublicationId; required string IdempotencyKey; }`; `PublishingJobs.PublishPublicationV1 : JobDefinition<PublishPublicationPayload>` with `JobType = "publishing.publish-publication.v1"` (const `PublishPublicationV1JobType`), Priority 0, MaxAttempts 3, Validate rejecting key/id mismatch.
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` — worker run path: load → terminal-check → `MarkInProgressAsync` → `OpenSessionAsync` → provider → classified outcomes; `OnTerminalFailureAsync` flags the account on DLQ.
- `apps/api/Modules/Publishing/Providers/{IPublishProvider,PublishRequest,PublishResult}.cs` — seam used by the job (D4 touches none of these).
- `apps/api/Modules/Publishing/Lib/PostStatusDerivation.cs` — `DerivedPostStatus Derive(IReadOnlyCollection<Publication>)` (D1; unused by endpoints yet).
- `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` — single-status-writer ratchet (line 326-369 `ItShouldLetOnlyTheTransitionServiceWritePublicationStatus`). D4 must not trip it; D4 writes status ONLY through the transition service (or through a SQL DELETE, which the scan excludes).
- `apps/api/Migrations/20260825143511_AddPublications.cs` — publications table + indexes.

### From D2 — `origin/lane/wt-645b` (PR #645 landed; the merged-on-develop version reads identically — verified by `git diff origin/develop origin/lane/wt-645b -- apps/api/Modules/Publishing/Services/PublicationListService.cs apps/api/Modules/Publishing/Handlers/Tenant/FindPublicationsForTenant.cs` is empty)

- `apps/api/Modules/Publishing/Routes.Publishing.cs` — `Routes.Publishing.ForTenant`: `Root = "/publishing"`, `FindPublications = "/publications"`, `GetPublishTargets = "/publish-targets"`. **D4 reuses this group; the retry route hangs off the same `Root`.**
- `apps/api/Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs` — `MapPublishingEndpointsForTenant(this IEndpointRouteBuilder routes)` exposing `GET /publishing/publications` (D2 history). D4 calls `MapPublishingEndpointsForTenant` from the D2-discovered call site.
- `apps/api/Modules/Publishing/Services/PublicationListService.cs` — `IPublicationListService.FindForTenantAsync(FindPublicationsArgs(TenantId, Cursor, Limit, Statuses), ct)` returning `FindPublicationsResult.Success(CursorPaginatedResult<PublicationListItem>)` (newest-first keyset on `(updated_at desc, id desc)`) or `CursorNotFound(string)`. The row DTO `PublicationListItem { Id, PostId, PostExcerpt, Status, SocialAccountId, AccountLabel, ExternalUrl?, LastError?, UpdatedAt }` is THE shape History renders.
- `apps/api/Modules/Publishing/Handlers/Tenant/FindPublicationsForTenant.cs` — `FindPublicationsQuery : CursorPaginatedQuery` with `[FromQuery(Name = "status")] public string? Status`; co-located `PublicationStatusCsv` (line 25-128) with `Parse` + `GetValidationError` mapping wire tokens BACK to `PublicationStatus` via an explicit switch with `StringComparer.OrdinalIgnoreCase` (PUBLY0003 forbids ToLower dispatch). Validator inherits `CursorPaginatedQueryValidator<FindPublicationsQuery>` and adds a `status` rule. **D4 reuses the `status` filter — the `scheduled` token is what Queue uses, the `published`/`failed`/`paused` tokens are what History uses, and the calendar uses a date range on top of `status=scheduled,paused,failed`.**
- `apps/api/Modules/Publishing/Services/PublicationStatusCsv.Spec.cs` — round-trip pin against `PublicationWire.FormatStatus`. D4 reuses the file.
- `apps/front/src/lib/query/tenant-publications.ts` — `TENANT_PUBLICATIONS_QUERY_KEY`, `TENANT_PUBLICATION_STATUSES = ['scheduled','in_progress','published','failed','paused'] as const`, `TenantPublicationStatus`, `TenantPublicationsQueryVariables`, `buildFindTenantPublicationsQueryParameters`, `toTenantPublicationRows`, `tenantPublicationsQueryOptions`, `useTenantPublicationsQuery`. **D4 EXTENDS this file with the retry mutation (Task 6) and a status-filtered variant; the existing read stays untouched.**
- `apps/front/src/lib/query/tenant-permissions.ts` — `useTenantPermissions(tenantId)`, `hasTenantPermission(permissions, key)`, `SOCIAL_ACCOUNTS_PUBLISH = 'tenant.socialaccounts.publish'`. **D4 reuses the gate for the Retry button.**
- `packages/client-ts/src/publishing/publications/index.ts` — generated `client.publishing.publications.get({ queryParameters: buildFindTenantPublicationsQueryParameters(variables) })`. **D4 regen-adds the retry operation (`POST /publications/{publicationId}/retry`)**.
- `apps/api/Modules/Publishing/Services/PublishNowService.cs` — `IPublishNowService.PublishNowAsync(PublishNowArgs(TenantId, PostId, ActorUserId, SocialAccountIds), ct)`; this is the D2 publish-now writer (NOTE: not yet merged to develop — see Reconciliation 1). If merged, D4 does not consume it; D4 reuses the enqueue pattern only.

### From D3 — `origin/lane/wt-646b` (NOT yet merged; D4 reads branch, not develop)

- `apps/api/Modules/Publishing/Services/PublicationService.cs` — `IPublicationService` with `ScheduleAsync(SchedulePublicationArgs, ct)`, `EditScheduleAsync(EditPostScheduleArgs, ct)`, `CancelScheduleAsync(Guid tenantId, Guid postId, Guid actorUserId, ct)`. **D4 reuses the same service for a new read method `FindScheduledForTenantAsync(FindScheduledPublicationsArgs(tenantId, fromUtc, toUtc, statuses, cursor, limit, ct))` and the `CancelScheduleAsync` returns the deleted count D4 needs for the "Cancelled N" message.** Read at lane/wt-646b:1-520.
- `apps/api/Modules/Publishing/Handlers/Tenant/FindScheduledPublicationsForTenant.cs` — D3 declared but did not implement; D4 Task 3 implements it.
- `apps/api/Modules/Publishing/Handlers/Tenant/CancelPostScheduleForTenant.cs` — `DELETE /posts/{postId}/schedule` → `ApiResponse` with `ResponseKeys.PostScheduleCancelledSuccess` or `ResponseKeys.PostScheduleCancelNoop`. D4 reuses the i18n key and the `CancelScheduleResult(DeletedCount, KeptCount)` shape.
- `apps/api/Modules/Publishing/Jobs/DispatchDuePostsJob.cs` — D3 declared but did not implement; the actual `IJobEnqueuer.EnqueueAsync<PublishPublicationPayload>(PublishingJobs.PublishPublicationV1, payload, new EnqueueOptions { IdempotencyKey = key }, ct)` call is the EXACT shape D4 reuses for the retry path (Task 4).
- `apps/api/Modules/Publishing/Entities/PublicationSchedule.cs` — value object `PublicationSchedule.Create(DateTime scheduledAtUtc, string timeZoneId)`; `MaxTimeZoneLength = 64`. D4 does not create a new value object for retry (retry sets `ScheduledAtUtc = DateTime.UtcNow` and the existing zone, see Task 4).
- The D3 plan also introduces `IPublicationStatusTransitionService.RescheduleToFutureAsync(publicationId, tenantId, PublicationSchedule, ct)`. **D4 does not consume that method** — retry uses the existing `RescheduleToNowAsync` (D1) which preserves the original zone and clears external refs (line 160-179 on develop). If D3's `RescheduleToFutureAsync` merges first, D4 still calls `RescheduleToNowAsync`.

### From C2 — `origin/develop`

- `apps/api/Modules/SocialAccounts/Lib/VisibleIn.cs` — `static bool Visible(SocialAccount account, Guid projectId)`: Active AND (no project links OR linked to the project).
- `apps/api/Modules/SocialAccounts/Permissions/SocialAccountPermissionsForTenant.cs` — `socialaccounts.view|manage|publish` (full tenant keys via `Permission.CreateTenantPermission`). Pinned by `FindTenantPermissions.Spec.cs:78` carrying `tenant.socialaccounts.publish`.
- `apps/api/Modules/SocialAccounts/Lib/LastErrorSanitiser.cs` — sanitise failure causes, ≤ 2 KB.
- `apps/api/Modules/SocialAccounts/Entities/SocialAccount.cs` — `DisplayHandle` is the label the queue/calendar/history rows carry.

### Front conventions on develop

- `apps/front/src/routes/authed/tenant/posts/drafts.tsx` — `DataTable` + `useTableController` + `parseTenantPostListSearchParams`/`serializeTenantPostListSearchParams` (snake_case search params, keyset cursor) pattern; `tenant-posts-drafts-page` / `tenant-posts-drafts-table` / `tenant-posts-new-post` testids.
- `apps/front/src/lib/query/tenant-posts.ts` — `useTenantPostsQuery`, `useSavePostMutation`, `useDeleteTenantPostMutation`, `invalidateTenantPosts(qc, tenantId)`. **D4 mirrors this shape in `tenant-publications.ts`** (existing on develop via D2 PR #645).
- `apps/front/src/components/table/data-table.tsx` + `data-table-states.tsx` + `use-table-controller.ts` — the shared list primitives; Queue and History use them. Calendar uses a different primitive (month grid; D4 picks `apps/front/src/components/ui/calendar.tsx` if present, else a plain `div` grid — D4 Task 7 Step 1 first checks the inventory).
- `apps/front/src/lib/url-state/table-search-params.ts` — typed `TableSearchParamInput`; `parseTenantPostListSearchParams` / `serializeTenantPostListSearchParams` (snake_case).
- `apps/front/src/i18n/locales/{en,fr}/posts.json` — D4 adds `queue.*`, `calendar.*`, `history.*`, `retry.*` keys to BOTH locales; the i18n-namespaces guard (`apps/front/e2e/__tests__/e2e-tag-guard.test.ts` + `apps/front/e2e/i18n-namespaces.spec.ts`) requires parity.
- `apps/front/src/lib/format-date-time.ts` — `formatDateTime(date, 'en' | 'fr')`. **D4 extends with `formatInZone(utc: Date, zone: string, lang)`** (D4 Task 7) so every screen shows the publication's `ScheduledTimeZone` label alongside the wall time.
- `apps/front/src/components/ui/state-view.tsx` + `state-surface.tsx` + `skeleton.tsx` — the loading/empty/error primitive; the e2e flow uses `tenant-posts-publish-in-progress` pill.
- `apps/front/src/lib/error-handling/api-failure.ts` + `getFailureMessage(toApiFailure(error), …)` — repo rule (enforced by `publy/no-manual-response-message-translation`).
- `apps/front/src/lib/api-client/client-manager.ts` — `getClientManager().getOrCreateClient(tenantId)` and `getOrCreateSessionClient()` (the permission hook uses session-scoped because scope-auth-data is session-tenant-only; reads and mutations use tenant-scoped).
- `apps/front/e2e/__tests__/e2e-tag-guard.test.ts` — every top-level `test.describe` needs one `@domain` + one `@<ticket>` tag; vocabulary per `docs/guides/e2e-tags.md`. D4 uses `@tenant-workspace @647` (the existing `@tenant-workspace` is in the vocabulary; `@647` is the D4 ticket).
- `apps/front/e2e/tenant-posts-schedule.spec.ts` — D3's e2e (Task 8, in the D3 plan). D4 reuses the `apps/front/e2e/docker-compose.test.yml` stack.

### Already on develop (`origin/develop` @ `4de921331`)

- `apps/api/Modules/Posts/Endpoints/PostEndpointsForTenant.cs` — sibling mapping; the call site that already calls `MapPostEndpointsForTenant(...)` (one site, in `Program.cs`) is where D4 adds `MapPublishingEndpointsForTenant(routes);` if the merged D2 doesn't ship that line itself (per D2 plan Task 5). Locator: `grep -rn "MapPostEndpointsForTenant(" apps/api --include="*.cs" | grep -v Endpoints/PostEndpointsForTenant.cs`.
- `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` — `AuthenticatedDefault`, `HeavySearchList` (D4 uses both; the queue list is `HeavySearchList`, the retry POST is `AuthenticatedDefault`).
- `apps/api/Lib/Validation/{CursorPaginatedQueryValidator,JsonElementRules,PatchFieldPattern}.cs` — D4 reuses these.
- `apps/api/Modules/Permissions/Entities/Permission.cs:84` — `Permission.CreateTenantPermission(...)` composes every tenant key as `tenant.<key>`; full `tenant.`-prefixed keys are the wire value the gate reads.
- `apps/api/Localization/ResponseKeys.g.cs` — generated from `packages/shared-ts/src/lib/i18n/json/response-message.en.json` (line 2 `// Generated from response-message.en.json`); D4 adds `publication-retry-success` and `publication-scheduled-list-success` keys to BOTH `.en.json` and `.fr.json` and rebuild regenerates `ResponseKeys.g.cs`.

---

## Reconciliation decisions (each restated in the PR body)

1. **Retry goes through the existing `RescheduleToNowAsync` (D1).** The D3 plan (read at `docs/records/2026-08-25-plan-d3-publication-scheduling.md:69`) declares `RescheduleToFutureAsync` (future instant, custom zone). D4 does NOT use it. Retry resets the publication to `Scheduled` at `DateTime.UtcNow`, clears `LastError`/`ExternalRecordId`/`ExternalUrl`, preserves `IdempotencyKey`, and preserves `ScheduledTimeZone` (the original zone, not a new one). This is the exact contract of D1's `RescheduleToNowAsync` (`apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179`). Per the spec §D4: "Retry (button, `tenant.posts.publish`): sets the publication back to `Scheduled` at now with the **same** idempotency key."
2. **Route placement.** The retry endpoint hangs off the existing `Routes.Publishing.ForTenant` group (D2 PR #645) as `POST /publications/{publicationId}/retry`. This is a new per-publication resource (D2's `FindPublications` is the list). Handlers orchestrate; ALL logic sits in a new `RetryPublicationService`. No extension into D3's `Routes.Tenant.Schedule` group (which is post-scoped, not publication-scoped).
3. **Queue read = D2 `GET /publishing/publications?status=scheduled` filtered to a forward window via a NEW `from` / `to` snake_case query pair (Task 3).** D3's plan declared a `GET /posts/{postId}/schedule` list and a separate `FindScheduledPublicationsForTenant` (D3 Task 4) — the D3 read is post-scoped, the D4 queue read is tenant-scoped (all scheduled publications across all posts, time-windowed). D4 reuses the same wire shape (`status=scheduled,paused` + cursor pagination) but with date-range constraints. Stated in PR body as a deliberate divergence from the D3 plan to avoid two parallel reads.
4. **Calendar = same endpoint, month-window preset.** The Calendar page passes `from=YYYY-MM-01T00:00:00Z` and `to=YYYY-<month+1>-01T00:00:00Z` (clamped to the D3 31-day window) and re-uses the queue's `status=scheduled,paused,failed` filter; pills show status, click navigates to the post. No new endpoint.
5. **History read = D2 `GET /publishing/publications?status=published,failed,paused`** with the existing keyset cursor and the existing "In progress…" polling pattern from the D2 plan (Task 9 — but only as far as the polling logic; the new `in_progress` filter is the trigger). The PR body calls this out as a D4 reuse, not new.
6. **Architecture-guard extension is RED-proven.** D4 extends `PublicationArchitecture.Spec` with two new facts: (a) every `Map*` in `PublishingEndpointsForTenant.cs` has both `.WithTenantPermission` and `.RequireRateLimiting`, and (b) no file outside `Modules/Publishing/Services/PublicationStatusTransitionService.cs` writes `Publication.Status` via direct EF or raw SQL — the D1 ratchet already covers this for assignments, and D4 extends the SQL-token scan to `UPDATE publications ... WHERE` to forbid the obvious retry-by-write-bypass. RED transcript saved to `.dump/mutation-retry-bypass.md`. (The Roslyn semantic walk at line 462-535 already catches `p.Status = X` in any module file; D4 adds the SQL scan.)
7. **No new dependencies.** D4 reuses every existing API + front primitive. No `app-channel` subscriptions, no new tables, no new policies.
8. **Retry button visibility: server 403 wins.** There is no front permission hook for `tenant.posts.publish` on develop today (the D2 plan surfaced this; the permission gate in `tenant-permissions.ts` is `SOCIAL_ACCOUNTS_PUBLISH` only, set by the composer). D4 keeps the Retry button visible to all members and surfaces server 403 via `getFailureMessage(toApiFailure(error), 'mutation:retry-failed')` (the same fail-closed path D2 used for publish-now). Stated in PR body as an open owner question (mirrors D3's reconciliation note).
9. **Pruning the dead `queue` / `calendar` / `history` placeholders.** D4 replaces the `ReadOnlyBadge` placeholders on develop (`apps/front/src/routes/authed/tenant/posts/{queue,calendar,history}.tsx`; the "coming later" `StateSurface`) with real data tables / month grids, drops the `ReadOnlyBadge`, and removes the corresponding `*-coming-later-{title,description}` keys from `posts.json` ONLY in the locale whose placeholder the page used to be (English and French for the three pages). The i18n-namespaces spec + design-token guard pin this.
10. **Time-zone round-trip on Calendar + History is the D3 plan's Task 4 zone proof generalised.** D4 writes its own front `formatInZone(utc, zone, lang)` helper (Task 7) and pins the round-trip in `formatInZone.test.ts` for summer/winter DST (D3 plan §3.4).

## File structure

**Create — API (`apps/api`)**
- `Modules/Publishing/Routes.Publishing.cs` (extends D2) — add `Retry = "/publications/{publicationId}/retry"` (and `RetryFn(string publicationId)` string helper, mirroring `Routes.Posts.ForTenant.GetByIdFn`).
- `Modules/Publishing/Services/RetryPublicationService.cs` (+ `.Spec.cs`) — `IPublicationPublicationRetryService.RetryAsync(RetryPublicationArgs(tenantId, publicationId, actorUserId), ct)`; the only writer of retry-side `Publication.Status`; depends on `AppDbContext` + `IJobEnqueuer` + `IPublicationStatusTransitionService` (infrastructure seam, not service-service).
- `Modules/Publishing/Services/PublicationScheduledListService.cs` (+ `.Spec.cs`) — `IPublicationScheduledListService.FindScheduledForTenantAsync(FindScheduledPublicationsArgs(tenantId, fromUtc, toUtc, statuses, cursor, limit), ct)`; keyset `(scheduled_at_utc, id)`; **NEW** snake_case `from` / `to` query parameters on `FindPublicationsQuery` (extends D2's query DTO, no new handler).
- `Modules/Publishing/Handlers/Tenant/RetryPublicationForTenant.cs` (+ `.Spec.cs`) — `POST /publications/{publicationId}/retry` → `Results<Ok<ApiResponse>, AppBadRequestHttpResult, AppNotFoundHttpResult, AppConflictHttpResult, AppValidationProblemHttpResult>`; maps `RetryPublicationResult.{NotFound, NotRetriable(cause, errorKey), Retried(publicationId)}`.
- `Modules/Publishing/Handlers/Tenant/FindPublicationsForTenant.cs` (extends D2 PR #645 file) — add `[FromQuery(Name = "from")] public string? From` and `[FromQuery(Name = "to")] public string? To` snake_case fields + `GetFromUtc()` / `GetToUtc()` parsing via the existing `JsonElementRules.MustBeRequiredIsoDateTime` only on the wire strings (route: `JsonElement` equivalents via the D2 `string?` precedent; D4 reuses the same D2 validator harness). Validator extends the D2 validator with `from ≤ to` and `to - from ≤ 31 days` rules. **No new handler file** — the D2 `FindPublicationsForTenant` is the single read endpoint; the Queue/Calendar/History pages all call it with different query parameters.
- `Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs` (extends D2) — register `POST /publications/{publicationId}/retry` with `.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)` and `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])` (a publish verb; spec §3.5).
- `Modules/Publishing/Services/RetryPublicationService.cs.Spec.cs` (co-located, Testcontainers via `ApiFixture`).
- `Modules/Publishing/Handlers/Tenant/RetryPublicationForTenant.Spec.cs` (co-located).
- `Modules/Publishing/Services/PublicationScheduledListService.cs.Spec.cs` (co-located).
- `Modules/AuditLogs/Entities/AuditLog.cs` — add three consts to `AuditActions`:
  - `PublicationRetried = "publication.retried"` (the retry action; details carry the actor + the publication id + the prior `LastError` truncated to 280 chars so the audit log never carries secrets).

**Modify — API**
- `apps/api/Modules/Publishing/Services/PublicationStatusCsv.Spec.cs` (D2 file) — no change; D4 reuses.
- `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` (D1 file) — NO change. D4 calls `RescheduleToNowAsync`; the D1 method's `AllowedSources` already permits `Failed → Scheduled` and `Paused → Scheduled` (line 81-85) — confirmed by reading the map.
- `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` — extend with two facts (Task 5): (a) every `Map*` in `PublishingEndpointsForTenant.cs` has both `.WithTenantPermission` and `.RequireRateLimiting` (extends the D2 architecture ratchet, mirrors `EndpointPermissionMetadataGuard.Spec`); (b) raw-SQL scan also flags `UPDATE publications` (the existing token scan at line 510-525 already covers `UPDATE`; D4 strengthens the regex to `UPDATE\s+publications\b` so the existing detector names the file:line).
- `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` — add `publication-retry-success` and `publication-scheduled-list-success` keys; build regenerates `ResponseKeys.g.cs`.
- `apps/api/Program.cs` — verify the call site of `MapPostEndpointsForTenant` already has `MapPublishingEndpointsForTenant(routes);` (D2 PR #645 added it). If not present, add it (one line).
- `apps/api/openapi.json` + `packages/client-ts/src/**` — regenerated by `just build-api && just generate-client`.

**Create — Front (`apps/front`)**
- `src/lib/query/tenant-publications.ts` (extends D2 file) — add `useRetryPublicationMutation()` (Task 6), `buildFindTenantScheduledPublicationsQueryParameters(variables)` joining `from` + `to` (Task 6), and a `useTenantScheduledPublicationsQuery` wrapper for the Queue/Calendar pages. Keep the existing `useTenantPublicationsQuery` for History untouched.
- `src/lib/format/zone-date-time.ts` (+ `.test.ts`) — `formatInZone(utc: Date, zone: string, lang: 'en' | 'fr'): string` returning `"2026-08-26 09:00 (Europe/Paris)"`; `parseLocalWallTime(local: string, zone: string): Date`; dayjs via the shared wrapper ONLY (lint rule `publy/no-direct-dayjs-in-components`).
- `src/routes/authed/tenant/posts/queue.tsx` (REWRITE placeholder) + `queue.test.tsx` (REWRITE) — Task 7 Step 1. Tests pin: data table renders the `tenant-posts-queue-page` heading, the rows from `useTenantScheduledPublicationsQuery` with `status=scheduled,paused`, the time shown in the row's zone via `formatInZone`, the cancel link that calls the existing D3 `DELETE /posts/{postId}/schedule` mutation, the edit link that navigates to `/$postId/edit`, the "in progress…" pill, and the empty state via `StateSurface` with testid `tenant-posts-queue-empty` (kept as a real empty state, not "coming later"). Tenant isolation: a foreign-tenant row is invisible. Retry on a `Paused` row calls `useRetryPublicationMutation`; on success the queue invalidates both the queue and the history queries.
- `src/routes/authed/tenant/posts/calendar.tsx` (REWRITE placeholder) + `calendar.test.tsx` (REWRITE) — Task 7 Step 2. Month grid, prev/next month URL state (`?from=YYYY-MM-01&to=YYYY-MM-31`, snake_case). Pills per day (max 3 visible, "+N more" overflow link to the queue with the same `from` / `to` URL state). The grid is a plain `div` month grid (no new dependency); pills are `StatusPill` from `apps/front/src/components/ui/status-pill.tsx` (D4 Task 7 Step 0 adds this primitive if not present; checked first via `git ls-files apps/front/src/components/ui/status-pill.tsx`).
- `src/routes/authed/tenant/posts/history.tsx` (REPLACE D2 placeholder wire — D2 PR #645 only added the read endpoint; the page itself is still the "coming later" stub on develop, REPLACE) + `history.test.tsx` (REWRITE) — Task 7 Step 3. Tests pin: data table renders published rows with `tenant-posts-history-link` to `ExternalUrl` opening in a new tab, failed rows with `tenant-posts-history-cause` one-sentence + the `Retry` button (calls `useRetryPublicationMutation`), paused rows with the cause + the "Reconnect the account" tooltip (Epic C, the banner service is out of D4 scope; D4 shows the cause + a `title` attribute that names the next action). Polling: while any row is `in_progress`, the query invalidates every 5 s (fake timers assert ≥2 refetches) and stops when none remain. `LogoutRedirect` only on 401 (repo rule).
- `src/components/ui/status-pill.tsx` (NEW primitive if absent) — tiny `StatusPill` mapping `TenantPublicationStatus → {label, tone, testId}`; tones: `scheduled` (neutral), `in_progress` (info), `published` (success), `failed` (danger), `paused` (warning). Testid: `tenant-posts-publication-pill-{status}`. Co-located test.
- `apps/front/e2e/tenant-posts-queue.spec.ts` (NEW) — tags `@tenant-workspace @647`; flow: schedule via D3's `POST /posts/{postId}/schedule` → poll queue → see row with the in-zone time → cancel via row menu → row gone. (Out of scope: full publish-now flow; D2's e2e covers that.)
- `apps/front/e2e/tenant-posts-calendar.spec.ts` (NEW) — tags `@tenant-workspace @647`; flow: schedule a row for next month → calendar pill shows on the right day in the right zone.
- `apps/front/e2e/tenant-posts-history-retry.spec.ts` (NEW) — tags `@tenant-workspace @647`; flow: force a `Failed` row via the seeded fake provider's "transient → failed after 3" path (D1's `PublishPublicationJobHandler` already proves this) → history page shows the row with the cause → click Retry → status flips to `scheduled` → queue shows it at-now → request-counter asserts no `X-Session-Token` echo.
- i18n: `apps/front/src/i18n/locales/{en,fr}/posts.json` — add `queue.*`, `calendar.*`, `history.*`, `retry.*` keys; remove the `*-coming-later-{title,description}` keys (per reconciliation 9).

**Modify — Front**
- `apps/front/src/lib/query/tenant-publications.ts` (D2 file) — add the retry mutation + scheduled-list helpers.
- `apps/front/src/lib/format-date-time.ts` — extend `formatDateTime` with optional zone (delegates to `formatInZone`).
- `apps/front/src/routes/authed/tenant/posts/drafts.tsx` — if D2 adds a "Publish now" affordance (D2 plan Task 8), D4 does not modify the drafts page; the D2 page change is owned by D2.
- `apps/front/src/routes/authed/tenant/posts/$postId/edit.tsx` — D4 does not modify (D3 owns the edit page; D4 only reads the schedule pair via the D3 endpoint).
- `apps/front/src/i18n/locales/{en,fr}/posts.json` — add new keys; remove the coming-later keys.
- `packages/client-ts/src/publishing/{publications,retry}/index.ts` — generated; `client.publishing.publications.byPublicationId(publicationId).retry.post({})` after regen.

---

## Task 1: `RetryPublicationService` — retry the publication through the transition service

**Files:** `Services/RetryPublicationService.cs` + `Services/RetryPublicationService.Spec.cs`.

**Interfaces block (Tasks 2, 4, 5, 6 depend on exactly these):**

```csharp
public interface IPublicationRetryService {
	Task<RetryPublicationResult> RetryAsync(
		RetryPublicationArgs args,
		CancellationToken cancellationToken = default
	);
}

public sealed record RetryPublicationArgs(
	Guid TenantId,
	Guid PublicationId,
	Guid ActorUserId
);

public abstract record RetryPublicationResult {
	/// <summary>The publication is now Scheduled at now with a fresh enqueue.</summary>
	public sealed record Retried(Guid PublicationId) : RetryPublicationResult;

	/// <summary>Unknown publication id, or another tenant's row — 404.</summary>
	public sealed record NotFound() : RetryPublicationResult;

	/// <summary>Cannot retry: still Scheduled, Published, or InProgress (409 conflict,
	/// 409 typed). The cause is in plain words per the transparent-failure rule.</summary>
	public sealed record NotRetriable(string Cause, string ErrorKey)
		: RetryPublicationResult;
}
```

- [ ] **Step 1 (RED):** `RetryPublicationService.Spec` (IClassFixture<ApiFixture>, direct DbContext seeding like D1's `PublicationStatusTransitionService.Spec`). Cases:
  - (a) Happy path on `Failed`: publication moves to `Scheduled`, `LastError` cleared, `ExternalRecordId`/`ExternalUrl` cleared, `IdempotencyKey` UNCHANGED, `ScheduledAtUtc` ≈ now (within 5 s), `ScheduledTimeZone` UNCHANGED; exactly one `job_queue` row enqueued of `job_type = PublishingJobs.PublishPublicationV1JobType` with `EnqueueOptions.IdempotencyKey == PublicationIdempotencyKey.For(publicationId)` and payload `PublicationId` matches; the job is in the same transaction as the status write (assert by reading both `publications.status = Scheduled` and the `job_queue` row count in the same fixture snapshot — they are committed together via `_dbContext.SaveChangesAsync` + the `IJobEnqueuer` enqueue).
  - (b) Happy path on `Paused` (Epic C needs resume): same outcome as (a); this is the "resume after reconnect" path the spec §3.6 calls out.
  - (c) `Scheduled` → `NotRetriable` with `cause = "This publication is already scheduled."` and `ErrorKey = "status"`. No row written, no job enqueued.
  - (d) `InProgress` → `NotRetriable` with `cause = "This publication is currently being published; wait for it to finish before retrying."` and `ErrorKey = "status"`. (The retry button is hidden while `in_progress` — see Task 6 — but the API stays fail-closed.)
  - (e) `Published` → `NotRetriable` with `cause = "This publication is already published. To post again, create a new publication."` and `ErrorKey = "status"`.
  - (f) Foreign-tenant `publicationId` → `NotFound`; no row written, no job enqueued (isolation).
  - (g) Unknown `publicationId` → `NotFound`; no row written.
  - (h) Sanitisation: seed a `LastError = "Bearer eyJabc123"` directly (bypassing `MarkFailedAsync` for the test setup) → after `RetryAsync` the row's `LastError` is null (it was cleared by `RescheduleToNowAsync`); and audit-log `Details` does not carry the bearer string (assertion that the spec only logs the sanitised cause).
  - (i) Audit: `AuditActions.PublicationRetried` row appears with `actorUserId`, `targetId = publicationId`, `details` carrying `TenantId`, `PublicationId`, and a truncated prior `LastError` (≤ 280 chars, sanitised by `LastErrorSanitiser`).
- [ ] **Step 2 (GREEN):** Implementation: `[Service(ServiceLifetime.Scoped)]`. Dependencies: `AppDbContext` + `IJobEnqueuer` + `IPublicationStatusTransitionService` (infrastructure seam, not service-service). Flow:
  1. Load tenant-scoped: `_dbContext.Publication.SingleOrDefaultAsync(p => p.Id == args.PublicationId && p.TenantId == args.TenantId && !p.IsDeleted, ct)`. If null → `NotFound`.
  2. Decide result kind from `publication.Status`:
     - `Failed` / `Paused` → continue.
     - `Scheduled` / `Published` / `InProgress` → `NotRetriable(plainCause, "status")`.
  3. Capture `priorStatus = publication.Status` and `priorLastError = publication.LastError` BEFORE the transition.
  4. Call `await _transitions.RescheduleToNowAsync(new ReschedulePublicationToNowArgs(args.PublicationId, args.TenantId), ct)` — the D1 method at `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179`. It does the `Failed → Scheduled` / `Paused → Scheduled` transition, clears `LastError` / `ExternalRecordId` / `ExternalUrl`, preserves `IdempotencyKey`, and sets `ScheduledAtUtc = DateTime.UtcNow`. If the method returns false (transition failed) → `NotFound` (the row was deleted between load and write — defensive).
  5. Enqueue: `var key = PublicationIdempotencyKey.For(args.PublicationId); await _jobEnqueuer.EnqueueAsync(PublishingJobs.PublishPublicationV1, new PublishPublicationPayload { PublicationId = args.PublicationId, IdempotencyKey = key }, new EnqueueOptions { IdempotencyKey = key }, ct);` — exact D2 plan pattern. `IJobEnqueuer` joins the caller's transaction by contract.
  6. Audit: `AddAuditEntry(args.ActorUserId, AuditActions.PublicationRetried, args.PublicationId, new { TenantId = args.TenantId, PublicationId = args.PublicationId, PriorStatus = PublicationWire.FormatStatus(priorStatus), PriorLastError = LastErrorSanitiser.Sanitize(priorLastError)?.Substring(0, Math.Min(280, priorLastError.Length)) })`. Mirror D3's `AddAuditEntry` (no `IAuditLogService` — same-transaction).
  7. `await _dbContext.SaveChangesAsync(ct);` → `Retried(args.PublicationId)`.
  8. The whole block from step 4 onward runs INSIDE the EF change tracker's implicit transaction; `_jobEnqueuer.EnqueueAsync` joins the caller's transaction by contract (`apps/api/Infrastructure/Jobs/IJobEnqueuer.cs`, on develop).
- [ ] **Step 3:** Run `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~RetryPublicationServiceSpec"` green. Commit `feat(publishing): RetryPublicationService — Failed/Paused → Scheduled at now, same idempotency key, trusted enqueue`; push.

## Task 2: `POST /publications/{publicationId}/retry` endpoint

**Files:** `Handlers/Tenant/RetryPublicationForTenant.cs`; `Routes.Publishing.cs` (extends D2); `Endpoints/PublishingEndpointsForTenant.cs` (extends D2); `AuditLog.cs` (adds `PublicationRetried`); `response-message.{en,fr}.json` (adds `publication-retry-success`).

**Interfaces block (front Task 6 relies on the wire shape):**

```
200 Ok<ApiResponse>{ message, key: "publication-retry-success" }
Errors: 400 malformed publicationId (ResponseKeys.MalformedId) ·
404 publication not found (ResponseKeys.NotFound) ·
409 conflict: cannot retry in current state (key = "status", cause = plain words) ·
403 via PermissionFilter middleware.
```

- [ ] **Step 1 (RED):** `RetryPublicationForTenant.Spec` (ApiFixture + session-token HTTP calls):
  - happy (Failed row): 200 + `key == "publication-retry-success"` + DB confirms `status=Scheduled, scheduled_at_utc ≈ now, last_error = NULL, external_record_id = NULL, external_url = NULL, idempotency_key UNCHANGED` + exactly one new `job_queue` row.
  - happy (Paused row): same.
  - Scheduled / InProgress / Published → 409 with `errors["status"]` carrying the plain-words cause.
  - missing `tenant.posts.publish` → 403.
  - malformed guid → 400.
  - foreign-tenant `publicationId` → 404, nothing enqueued.
  - Bearer-style token in `LastError` pre-retry → audit row's `Details` column does NOT contain the literal `eyJ…` (sanitisation proof for the audit path).
- [ ] **Step 2 (GREEN):** Handler clones the D3 `EditPostScheduleForTenant.Handle` scaffolding (lane/wt-646b). Parse `publicationId` from route → `Guid.TryParse` → 400; resolve `IPublicationRetryService`; map result kinds:
  - `Retried` → audit `AuditActions.PublicationRetried` (D4's `AddAuditEntry` already wrote the row in the same transaction; this second line is the redundant-but-honest second audit for staff) → `TypedResults.Ok(ApiResponse.Create("Publication queued for retry", ResponseKeys.PublicationRetrySuccess))`.
  - `NotFound` → `TypedProblems.NotFound("Publication not found", ResponseKeys.NotFound)`.
  - `NotRetriable(cause, key)` → `TypedProblems.Conflict(cause, ResponseKeys.PublicationRetryConflict, new Dictionary<string, string[]> { [errorKey] = [cause] })`. (The `PublicationRetryConflict` translation key is NEW — add to both `.en.json` and `.fr.json`; the message is the cause.)
  - Route: `public const string Retry = "/publications/{publicationId}/retry";` added to `Routes.Publishing.ForTenant` (extends D2 PR #645's `Routes.Publishing.cs`); map in `Endpoints/PublishingEndpointsForTenant` with `.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)` + `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])`. The publish verb is correct here: retry = re-publish (spec §3.5). Add `"publication-retry-success": "Publication queued for retry"`, `"publication-retry-conflict": "Cannot retry this publication"`, and `"publication-retry-bearer-redacted": "Bearer [redacted]"` to `response-message.en.json` (and `fr.json`).
- [ ] **Step 3:** Filter green; commit `feat(publishing): retry endpoint — Failed/Paused → Scheduled at now, same key`; push.

## Task 3: `GET /publishing/publications` extension — `from` / `to` date window

**Files:** `Handlers/Tenant/FindPublicationsForTenant.cs` (extends D2 PR #645 file); `Services/PublicationScheduledListService.cs` (NEW — used by the handler for the date-window filter); `Services/PublicationListService.cs` (extends D2); validator inside `FindPublicationsForTenant.cs`.

- [ ] **Step 1 (RED):** Extend `FindPublicationsForTenant.Spec` (D2 file) with:
  - happy with `from=2099-08-01T00:00:00Z&to=2099-08-31T23:59:59Z&status=scheduled` → only the rows in the window (keyset over `(scheduled_at_utc, id)`, not the history's `(updated_at, id)`).
  - `from > to` → 422 with `errors["from"]` (stable key).
  - window > 31 days → 422 with `errors["to"]` and message `"Date range cannot exceed 31 days."`.
  - tenant isolation: a foreign-tenant row in the window is invisible.
  - keyset cursor across the window: page 1 + page 2 covers all rows, no duplicates, no misses.
  - status filter `status=scheduled,paused,failed` is the calendar's exact filter; assert all three return.
- [ ] **Step 2 (GREEN):** Extend `FindPublicationsQuery` (D2 file) with `[FromQuery(Name = "from")] public string? From` + `[FromQuery(Name = "to")] public string? To`. Parser methods `GetFromUtc()` / `GetToUtc()` use `DateTime.TryParseExact(..., "o", InvariantCulture, RoundtripKind, out var dt)` to avoid the locale trap (PUBLY0003). The handler re-routes the date-windowed read to a new `IPublicationScheduledListService.FindScheduledForTenantAsync(FindScheduledPublicationsArgs(tenantId, fromUtc, toUtc, statuses, cursor, limit), ct)` that does the keyset `(scheduled_at_utc, id)` predicate. The validator inherits `CursorPaginatedQueryValidator<FindPublicationsQuery>` and adds:
  - `RuleFor(x => x.From).MustBeNullableIsoDateTime("from")`
  - `RuleFor(x => x.To).MustBeNullableIsoDateTime("to")`
  - `RuleFor(x => x).Custom((query, ctx) => { var from = query.GetFromUtc(); var to = query.GetToUtc(); if (from is not null && to is not null && from > to) { ctx.AddFailure("from", "Date range is invalid (from is after to)."); return; } if (from is not null && to is not null && (to.Value - from.Value).TotalDays > 31) { ctx.AddFailure("to", "Date range cannot exceed 31 days."); } })` — byte-for-byte shape of the D3 `FindScheduledPublicationsQueryValidator` (lane/wt-646b) for the `publication-window-invalid` / `publication-window-too-wide` keys.
  - The `status` rule from D2 is preserved.
  - The endpoint stays `HeavySearchList` (D2 default for the find route).
- [ ] **Step 3:** Filter green; commit `feat(publishing): scheduled-publications date-window list — Queue + Calendar share one read`; push.

## Task 4: Architecture-guard extensions + RED proofs

**Files:** `Lib/Architecture/PublicationArchitecture.Spec.cs` (extends D1 PR #1433 file).

- [ ] **Step 1 (GREEN first):** Add facts:
  - (a) Every `Map*` in `Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs` carries both a rate-limit policy and `WithTenantPermission` metadata — Roslyn-free source scan asserting each `group.Map(Get|Post|Patch|Delete)` block contains `.RequireRateLimiting(` and `.WithTenantPermission(` (technique of the existing single-writer scan, lines 462-535; mirror `EndpointPermissionMetadataGuard.Spec` on develop).
  - (b) Strengthen `RawSqlPublicationUpdate` regex from `\bUPDATE\s+(?:ONLY\s+)?"?publications"?\b` (line 791) to `\bUPDATE\s+(?:ONLY\s+)?"?publications"?\b` **AND** add the same scan for `SET\s+status` against `publications` — flag any `UPDATE publications ... SET status = ...` in production code (the D1 scan already flags `UPDATE publications`; the SET-status clause is the obvious bypass for retry). Stated in PR body: the D1 ratchet ALREADY flags the bypass via the token scan, so this is a strengthening for clarity.
- [ ] **Step 2 (RED proof — rogue retry writer):** Plant a temp `Modules/Publishing/Handlers/Tenant/_RogueRetryWriter.cs` writing `dbContext.Publication.First().Status = PublicationStatus.Scheduled;` directly. Run the PublicationArchitecture scan → MUST FAIL naming the file:line. Transcript to `.dump/mutation-retry-bypass.md`. Delete, rerun green.
- [ ] **Step 3 (RED proof — rogue retry enqueue):** Plant a temp `Modules/Publishing/Handlers/Tenant/_RogueRetryEnqueue.cs` that calls `_jobEnqueuer.EnqueueAsync(PublishingJobs.PublishPublicationV1, payload, new EnqueueOptions(), ct)` WITHOUT `IdempotencyKey`. Run the `DispatchDuePostsConcurrency.Spec` style test (D3 Task 6, lane/wt-646b) for the retry path: two concurrent retries on the same `publicationId` would both enqueue without a key and duplicate. The `ux_job_queue_type_idempotency` unique index (D3's name; on develop if D3 merges) catches this — a concurrent retry spec goes RED naming the duplicate. Transcript to `.dump/mutation-retry-no-key.md`. Restore byte-exact.
- [ ] **Step 4:** Guards + concurrency spec green again. Commit `test(api): D4 architecture ratchet — every endpoint permissioned, every retry writer goes through the transition service, no keyless retry enqueue`; push.

## Task 5: Kiota regen (D4 endpoint)

- [ ] **Step 1:** `just build-api && just generate-client && pnpm --filter front typecheck` (AGENTS mandate after contract change). Verify `packages/client-ts` gained `client.publishing.publications.byPublicationId(publicationId).retry.post({})` and `git diff --stat packages/client-ts` shows ONLY generated churn. If the operation lands under a different path (Kiota sometimes renames), update `tenant-publications.ts` in Task 6 to match.
- [ ] **Step 2:** No commit from the regen alone — it's part of the next commit.

## Task 6: Front data layer — `useRetryPublicationMutation` + scheduled-list helper

**Files:** `apps/front/src/lib/query/tenant-publications.ts` (extends D2 file); `apps/front/src/lib/query/tenant-publications.test.ts` (extends D2 file).

- [ ] **Step 1 (RED):** `tenant-publications.test.ts` (D2 file) gains:
  - (a) `buildFindTenantScheduledPublicationsQueryParameters({ from: Date, to: Date, statuses?: string[] })` joins to the wire `{ status?: string, cursor?: string, limit?: string, from?: string, to?: string }` with the `from` / `to` values as ISO 8601 UTC strings (round-trip stable). The `status` param joins statuses into a single CSV string exactly like D2's `buildFindTenantPublicationsQueryParameters`.
  - (b) `useTenantScheduledPublicationsQuery({ tenantId, from, to, statuses?, cursor?, limit? })` calls `client.publishing.publications.get({ queryParameters: ... })` exactly as the D2 `useTenantPublicationsQuery` does.
  - (c) `useRetryPublicationMutation()` calls `client.publishing.publications.byPublicationId(publicationId).retry.post({})` (the Kiota op shape from Task 5); the mutation key is `[...TENANT_PUBLICATIONS_QUERY_KEY, 'retry']`; on success it invalidates BOTH the queue query key (`['tenant-scheduled-publications', tenantId, ...]`) AND the history query key (`['tenant-publications', tenantId, ...]`) so a Retry on the History page makes the row disappear from History and appear in the Queue at-now.
  - (d) Failure path: when the server returns 409 with `status` error key, the mutation surfaces the error via `toApiFailure` and the test asserts the standard mutation error path; the front DOES NOT translate `response-message` keys at the call site (lint rule).
- [ ] **Step 2 (GREEN):** Implement. The retry mutation uses `createUntypedObject({})` for the empty body (Kiota's empty-body pattern; mirror D2 PR #645's `savePost` body construction in `tenant-posts.ts`). Invalidation helper `invalidateTenantPublicationsAll(qc, tenantId)` invalidates BOTH the queue and history query keys.
- [ ] **Step 3:** `pnpm --filter front exec vitest run src/lib/query/tenant-publications.test.ts` green; `pnpm --filter front typecheck`. Commit `feat(front): useRetryPublicationMutation + scheduled-list helper over regenerated client`; push.

## Task 7: Front pages — Queue, Calendar, History wired to real data

**Files:** `apps/front/src/components/ui/status-pill.tsx` (NEW, if absent — Task 7 Step 0); `apps/front/src/lib/format/zone-date-time.ts` + `.test.ts` (NEW); `apps/front/src/routes/authed/tenant/posts/{queue,calendar,history}.tsx` (REWRITE placeholders); `apps/front/src/routes/authed/tenant/posts/{queue,calendar,history}.test.tsx` (REWRITE); `apps/front/src/i18n/locales/{en,fr}/posts.json` (adds queue/calendar/history/retry keys, removes coming-later keys).

- [ ] **Step 0 (only if `apps/front/src/components/ui/status-pill.tsx` is absent):** `git ls-files apps/front/src/components/ui/status-pill.tsx` first. If absent, create a minimal `StatusPill` primitive with a `tone` prop, the five `TenantPublicationStatus` values, and a testid `tenant-posts-publication-pill-{status}`. Co-located test asserts all five tones render. The pill is the SINGLE place status colors are decided (mirrors `apps/front/src/components/ui/badge.tsx` for badges — local primitive, no Tailwind tokens invented). Commit `feat(front): StatusPill primitive — five tones, no raw colors outside the pill`; push.
- [ ] **Step 1 — Queue page (RED then GREEN).** Tests:
  - renders the `tenant-posts-queue-page` heading.
  - rows show: excerpt (truncate 80), account label, status pill (tone per status), time via `formatInZone(updatedAt, row.scheduledTimeZone, 'en')`.
  - empty state: `StateSurface` with testid `tenant-posts-queue-empty` (replaces the coming-later stub).
  - cancel action on a `Scheduled` row calls the D3 `useCancelPostScheduleMutation` (D3 task 3) with the post id; on success the row disappears.
  - edit action navigates to `/tenant/posts/{postId}/edit`.
  - retry action on a `Paused` row calls `useRetryPublicationMutation`; on success the row disappears from the queue and reappears at-now (asserted via two query refetches).
  - in-progress row shows the `tenant-posts-publish-in-progress` pill.
  - tenant isolation: a row whose `tenantId` does not match the resolved tenant is NEVER rendered (mock the query to return a row with a foreign `tenantId` and assert it is filtered).
  - 401 from the read query → `LogoutRedirect`; 403 → toast via `getFailureMessage`.
  - The whole page uses `useTableController` + `parseTenantPostListSearchParams` / `serializeTenantPostListSearchParams` (snake_case) just like `drafts.tsx`. `DEFAULT_SORT = { id: 'scheduled_at', order: 'asc' as const }`. `defaultSize = 20`.
  - **Component contract testids:** `tenant-posts-queue-page`, `tenant-posts-queue-table`, `tenant-posts-queue-empty`, `tenant-posts-queue-retry-{publicationId}`.
  - Implement: `apps/front/src/routes/authed/tenant/posts/queue.tsx` REPLACES the placeholder; keep the `tenant-posts-queue-page` testid (already used by D2's e2e shell).
  - i18n keys: `queue.title`, `queue.description`, `queue.empty.title`, `queue.empty.description`, `queue.column.excerpt`, `queue.column.account`, `queue.column.when`, `queue.column.status`, `queue.action.cancel`, `queue.action.edit`, `queue.action.retry`, `queue.cancel.confirm.title`, `queue.cancel.confirm.description`. EN + FR.
- [ ] **Step 2 — Calendar page (RED then GREEN).** Tests:
  - renders the `tenant-posts-calendar-page` heading.
  - URL state: `?from=YYYY-MM-01T00:00:00Z&to=YYYY-MM-31T23:59:59Z` (snake_case); prev/next month buttons update the URL state via `useNavigate({ search: ... })`.
  - each day cell shows pills for the rows whose `scheduled_at_utc` falls in that day IN THE ROW'S ZONE (the wire's `scheduled_at_utc` is UTC; `formatInZone` converts).
  - max 3 pills per cell; overflow link "+N more" navigates to the Queue page with the same `from` / `to` URL state.
  - clicking a pill navigates to `/tenant/posts/{postId}/edit`.
  - empty month shows a `StateSurface` with testid `tenant-posts-calendar-empty`.
  - out-of-window rows are not rendered (asserted via mock).
  - **Component contract testids:** `tenant-posts-calendar-page`, `tenant-posts-calendar-empty`, `tenant-posts-calendar-day-{YYYY-MM-DD}`, `tenant-posts-calendar-pill-{publicationId}`.
  - Implement: `apps/front/src/routes/authed/tenant/posts/calendar.tsx` REPLACES the placeholder; keep the `tenant-posts-calendar-page` testid.
  - i18n keys: `calendar.title`, `calendar.description`, `calendar.empty.title`, `calendar.empty.description`, `calendar.prev`, `calendar.next`, `calendar.more`, `calendar.today`.
- [ ] **Step 3 — History page (RED then GREEN).** Tests:
  - published row shows `tenant-posts-history-link` opening in a new tab with `href = ExternalUrl`.
  - failed row shows `tenant-posts-history-cause` (the `LastError` string) + a Retry button `tenant-posts-history-retry-{publicationId}`.
  - paused row shows the cause + a tooltip `tenant-posts-history-paused-tooltip` naming the next action ("Reconnect the account to resume") — the Epic C reconnect banner is out of D4 scope; the tooltip names the next action in plain words.
  - in-progress row shows the `tenant-posts-publish-in-progress` pill.
  - polling: while any row is `in_progress`, the query invalidates every 5 s (fake timers assert ≥2 refetches) and stops when none remain.
  - fatal error → `LogoutRedirect` only on 401.
  - **Component contract testids:** `tenant-posts-history-page`, `tenant-posts-history-link`, `tenant-posts-history-cause`, `tenant-posts-history-retry-{publicationId}`, `tenant-posts-history-paused-tooltip`, `tenant-posts-history-empty`.
  - Implement: `apps/front/src/routes/authed/tenant/posts/history.tsx` REPLACES the placeholder; keep `tenant-posts-history-page` testid. Drop `ReadOnlyBadge` and the `coming-later` copy.
  - i18n keys: `history.title`, `history.description`, `history.empty.title`, `history.empty.description`, `history.column.excerpt`, `history.column.account`, `history.column.when`, `history.column.status`, `history.action.open`, `history.action.retry`, `history.paused.tooltip`, `history.in_progress`, `history.failed.cause`, `history.retry.success`, `history.retry.conflict`, `history.retry.conflict.scheduled`, `history.retry.conflict.published`, `history.retry.conflict.in_progress`.
- [ ] **Step 4 — `formatInZone` helper (RED then GREEN).** `apps/front/src/lib/format/zone-date-time.ts`:
  - `formatInZone(utc: Date, zone: string, lang: 'en' | 'fr')` returns `"2026-08-26 09:00 (Europe/Paris)"` in EN and `"26 août 2026 09:00 (Europe/Paris)"` in FR.
  - `parseLocalWallTime(local: string, zone: string)` returns a `Date` in UTC.
  - Tests pin DST summer/winter (`Europe/Paris` 2026-08-26 09:00 → 07:00Z; 2026-12-15 09:00 → 08:00Z) — the D3 plan's §3.4 zone round-trip cases generalised to the helper. Dayjs via the shared wrapper only (lint rule).
- [ ] **Step 5:** `pnpm --filter front typecheck && pnpm --filter front test && pnpm --filter front check:design-system && just react-doctor` green. Commit `feat(front): queue + calendar + history pages wired to the publishing API, retry button on failed/paused, status pill primitive, formatInZone helper`; push.

## Task 8: E2E — schedule → queue + calendar → history → retry

**Files:** `apps/front/e2e/tenant-posts-queue.spec.ts`; `apps/front/e2e/tenant-posts-calendar.spec.ts`; `apps/front/e2e/tenant-posts-history-retry.spec.ts` (all NEW); e2e tag-guard verify only.

- [ ] **Step 1 (specs written):** storage-state login; each spec seeds via the API directly (the test stack can hit the API). The fake provider is the D2 `FakeBlueskyPublishProvider` (registered on develop when `PUBLISHING_FAKE_PROVIDER=1`, the D2 plan's reconciliation 4). The e2e stack boot is out of D4 scope (sandbox cannot boot compose); specs are written and the tag-guard asserts the tags.
- [ ] **Step 2:** tag-guard passes with `@tenant-workspace @647` (vocabulary per `docs/guides/e2e-tags.md`).
- [ ] **Step 3 (run when stack bootable):**
  - `pnpm --filter front test:e2e:tag "@tenant-workspace.*@647"` against the compose stack.
  - `tenant-posts-queue.spec.ts`: schedule a post for +5 min via the API → poll `/tenant/posts/queue` → see the row with the in-zone time → cancel via row menu → row gone.
  - `tenant-posts-calendar.spec.ts`: schedule a post for next month → calendar pill shows on the right day in the right zone.
  - `tenant-posts-history-retry.spec.ts`: force a `Failed` row via the fake provider's "transient → failed after 3" path (D1's `PublishPublicationJobHandler` already proves this) → history page shows the row with the cause → click Retry → status flips to `scheduled` → queue shows it at-now → request-counter asserts no `X-Session-Token` echo.
- [ ] **Step 4:** commit `test(front): e2e — queue + calendar + history-retry, in-zone, retry reuses the key`; push.

## Task 9: Gates + delivery

- [ ] `pnpm --filter front typecheck/test/check:design-system`; `just react-doctor`; focused API suites (Publishing/Posts/SocialAccounts) under `heavy.sh`; `heavy.sh just build-api && just generate-client`; `just ci-migration-expand-contract`; `just ci-quality-dotnet`; `just ci-front`.
- [ ] Verify `just ci-drift` stays green (no workflow drift).
- [ ] PR body refreshed with: D4 plain-words summary, task list, reconciliation decisions 1-10, proofs (D4.1 retry reuses the key; D4.2 resume respects "date passed" — see Task 5 RED transcripts; D4.3 architecture ratchet extends the single-writer guarantee; D4.4 every Queue/Calendar/History failure shows the cause in plain words; D4.5 no new migrations; D4.6 401-only logout), `Part of #647`, `Closes #1453` (the plan issue, per the brief), `Model: MiniMax M3 (GMI Cloud via OpenRouter, jcode) — plan only`, `Unverified until CI:` list (the e2e specs require the compose stack; sandbox cannot boot it).
- [ ] `.dump/DONE.md` with tip SHA, PR URL, evidence paths; print `DONE`.

---

## Interfaces (consumed signatures copied from the real files)

- **[dev, D1]** `IPublicationStatusTransitionService` (`apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs`): `Task<bool> MarkInProgressAsync(MarkPublicationInProgressArgs(PublicationId, TenantId), ct)`; `MarkPublishedAsync(MarkPublicationPublishedArgs(PublicationId, TenantId, ExternalRecordId, ExternalUrl), ct)`; `MarkFailedAsync(MarkPublicationFailedArgs(PublicationId, TenantId, Cause), ct)`; `MarkPausedAsync(MarkPublicationPausedArgs(PublicationId, TenantId, Cause), ct)`; `RescheduleToNowAsync(ReschedulePublicationToNowArgs(PublicationId, TenantId), ct)` — D4 calls this last one only.
- **[dev, D1]** `PublishingJobs.PublishPublicationV1 : JobDefinition<PublishPublicationPayload>`; `PublishPublicationPayload { Guid PublicationId; string IdempotencyKey; }` (Validate already rejects key mismatch).
- **[dev]** `IJobEnqueuer.EnqueueAsync<TPayload>(JobDefinition<TPayload>, TPayload payload, EnqueueOptions? options = null, CancellationToken ct) → Task<Guid>`; `EnqueueOptions { string? IdempotencyKey; … }`. `IJobEnqueuer` joins the caller's transaction by contract.
- **[dev]** `IAuditLogService.LogAsync(CreateAuditLogArgs(Guid UserId, string Action, Guid? TargetId = null, object? Details = null), ct)`. D4 does NOT use this for the same-transaction audit; it uses the in-process `AddAuditEntry` pattern of D3 (D3's `PublicationService.AddAuditEntry`, lane/wt-646b).
- **[D2 PR #645]** `IPublicationListService.FindForTenantAsync(FindPublicationsArgs(TenantId, Cursor, Limit, Statuses), ct)`; `PublicationListItem { Id, PostId, PostExcerpt, Status, SocialAccountId, AccountLabel, ExternalUrl?, LastError?, UpdatedAt }`; `FindPublicationsResult.{Success, CursorNotFound}`; `PublicationStatusCsv.Parse` / `GetValidationError`; route `GET /publishing/publications`.
- **[D3 lane/wt-646b]** `IPublicationService.ScheduleAsync / EditScheduleAsync / CancelScheduleAsync(tenantId, postId, actorUserId, ct) → CancelScheduleResult(DeletedCount, KeptCount)?`; D4 reuses `CancelScheduleResult` shape.
- **[D4-new]** `IPublicationRetryService.RetryAsync(RetryPublicationArgs(tenantId, publicationId, actorUserId), ct) → RetryPublicationResult.{Retried, NotFound, NotRetriable(cause, errorKey)}`.
- **[D4-new]** `IPublicationScheduledListService.FindScheduledForTenantAsync(FindScheduledPublicationsArgs(tenantId, fromUtc, toUtc, statuses, cursor, limit), ct)` — keyset `(scheduled_at_utc, id)`.
- **[D4-new, front]** `formatInZone(utc: Date, zone: string, lang: 'en' | 'fr')`; `parseLocalWallTime(local: string, zone: string)`; `useRetryPublicationMutation()`; `buildFindTenantScheduledPublicationsQueryParameters`; `useTenantScheduledPublicationsQuery`; `invalidateTenantPublicationsAll(qc, tenantId)`.

## Proofs the spec requires (per §6 D4)

- **D4.1** retry reuses the key — `RetryPublicationService.Spec` (Task 1 case (a) asserts `idempotency_key` UNCHANGED after retry); the "remove the key" mutant from D2's Task 10 still goes RED on `BlueskyPublishProviderSpec.ItShouldNotCreateADuplicateWhenTheRecordAlreadyExistsAfterATimeout` (D1 file at `apps/api/Modules/Publishing/Providers/BlueskyPublishProvider.Spec.cs`); D4 does NOT re-prove that — it reuses the D1 + D2 proofs.
- **D4.2** retry produces a fresh enqueue with the same key → a duplicate `Retry` on the same publication is a no-op at the job_queue level (the `ux_job_queue_type_idempotency` unique index deduplicates); a Retry on a different publication is a separate enqueue. `RetryPublicationService.Spec` (Task 1) covers the no-op via a second retry on the same id within the same test (asserts only one new `job_queue` row).
- **D4.3** no rogue retry writer — `PublicationArchitecture.Spec` extension (Task 4), RED transcript `.dump/mutation-retry-bypass.md`.
- **D4.4** no keyless concurrent retry enqueue — RED transcript `.dump/mutation-retry-no-key.md`.
- **D4.5** every retry path surfaces the cause in plain words — `RetryPublicationForTenant.Spec` (Task 2) asserts the 409 response's `errors["status"]` for each non-retriable state with a human sentence.
- **D4.6** integration specs for every handler/service path (Tasks 1, 2, 3).
- **D4.7** e2e flow with real tags/testids (Task 8).
- **D4.8** transparent failure causes — Queue / Calendar / History use the standard `getFailureMessage(toApiFailure(error), …)` path; never translate `response-message` keys at the call site (lint rule `publy/no-manual-response-message-translation`).
- **D4.9** permission gate mirrors D2 — `useTenantPermissions(tenantId).hasPermission(SOCIAL_ACCOUNTS_PUBLISH)` is used by the D2 composer block; D4's Retry button is gated on the existing server 403 (reconciliation 8), and the front surfaces the failure via the standard mutation error path.

## Anything in this brief that turned out to be wrong or missing

- The brief said "retry MUST go through the transition service (the Roslyn guard forbids direct Status writes)" — confirmed and concretised: the existing `RescheduleToNowAsync` (D1 PR #1433, `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179`) is the right method, NOT a new one. D3's planned `RescheduleToFutureAsync` is a different verb (reschedule to a future instant with a new zone); D4's retry is "to now with the original zone" and reuses the D1 method.
- The brief said "wire the queue, calendar (folds #178) and history pages to REAL Publication data" — concretised: the queue and calendar share one read endpoint (D4's `from` / `to` extension of D2's `GET /publishing/publications`); the history page uses the D2 endpoint as-is with a different status filter. No parallel reads.
- The brief said "status pills" — concretised: a new `StatusPill` primitive at `apps/front/src/components/ui/status-pill.tsx` is the SINGLE place the five tones are decided (mirrors the local primitive pattern of `apps/front/src/components/ui/badge.tsx`). No Tailwind tokens invented; the design-token guard pins the primitives.
- The brief said "retry failed publications" — concretised: retry is `Failed → Scheduled at now` AND `Paused → Scheduled at now` (Epic C's resume path, spec §3.6). The retry button is on BOTH `Failed` (with the cause) AND `Paused` (with the reconnect tooltip). The state machine is the existing one in `PublicationStatusTransitionService.AllowedSources` (line 81-85: `Scheduled` ← `{Scheduled, Paused, Failed}`).
- The brief said "every failure cause shown in plain words from the API's problem details" — concretised: the `LastError` column is sanitised at write time by D1's `MarkFailedAsync` / `MarkPausedAsync`; the API returns it as a problem-details extension field via the existing `LastError` column. The front never re-translates; it shows the API's text verbatim. The retry cause for `NotRetriable` is a human sentence per row (Task 1 case c/d/e).
- Missing in the brief but added in the plan: Task 4 (architecture guard extensions) and Task 0 (StatusPill primitive check). Both are non-optional.
- Round-1 inventions avoided: the queue does NOT use a brand-new DTO — it reuses D2's `PublicationListItem` with an additional date-window constraint, so the history and the queue share the same row mapper. The retry endpoint does NOT invent a new transition method — it uses the existing `RescheduleToNowAsync`. The Calendar does NOT use a new endpoint — it reuses the queue's date-windowed list with month-clamped `from` / `to`.
- The brief mentioned "fold #178" — the calendar has been a placeholder since the B2 tranche; folding is implicit in the file structure (REPLACE the placeholder file). Stated in the PR body.

## Unverified until CI

- Regenerated Kiota client compiling against every new mutation/query under `apps/front/src/lib/query/`.
- The e2e specs passing against the real compose stack (sandbox cannot boot it; CI's `front-e2e` workflow runs them).
- Regenerated `openapi.json` carrying the retry route with expected 200/400/404/409 problem responses.
- The `DispatchDuePostsConcurrency.Spec`-style concurrent retry proof (Task 4 Step 3) only exists as a RED transcript in the sandbox; the spec file itself is added in CI.

Model: MiniMax M3 (GMI Cloud via OpenRouter, jcode) — plan only

Closes #1453
Part of #647
Part of #631
