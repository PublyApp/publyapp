# D4 — Queue + Calendar + History UI + Retry: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Epic D step 8 (#647, part of #631; spec: `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md` §D4): wire the tenant **Queue** page to the D2 `GET /publishing/publications` read extended with `from` / `to` date-window query parameters (Task 3), wire the tenant **Calendar** to the same date-windowed read in month form, wire the tenant **History** page to the D2 `GET /publishing/publications` keyset read as-is, add the **Retry** button on `Failed` rows (status pill + plain-words cause + next action) per spec §4, and route the retry through the existing `IPublicationStatusTransitionService.RescheduleToNowAsync` — never a direct status write (the `PublicationArchitecture.Spec` ratchet forbids it). The plan covers the architecture-guard extensions that pin the retry path to the transition service, the missing `ScheduledAtUtc` / `ScheduledTimeZone` columns on the D2 list DTO (Task 3.5 — D2 ships neither, so D4 must add them before the Queue/Calendar can render the scheduled time), and the `StatusPill` primitive (or the `Badge` reuse decision — Task 7 Step 0) that the three pages share.

**Architecture:** D4 is mostly a wiring pass. The retry endpoint is a new `POST /publications/{publicationId}/retry` route on the existing `Routes.Publishing.ForTenant` group (D2 PR #645, IN-FLIGHT on `origin/lane/wt-645b` — read branch, NOT develop; merged-on-develop version is NOT available) gated by `AppPermissions.Tenant.Posts.PUBLISH`; it calls a thin `RetryPublicationService.RetryAsync(args, ct)` that **only** re-issues the trust-boundary enqueue and **only** writes status through `IPublicationStatusTransitionService.RescheduleToNowAsync` (D1 PR #1433, on develop at `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179` on `origin/develop` — verified; D2/D3 may shift it ±5 lines, always `git show <branch>:PublicationStatusTransitionService.cs` to re-confirm). The Queue/Calendar/History pages consume the existing D2/D3 read endpoints through the regenerated Kiota client — D4 does not invent a new read shape. All UI failures are surfaced through `getFailureMessage(toApiFailure(error), …)` (the repo rule, enforced by `publy/no-manual-response-message-translation`).

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
- **Symbol honesty:** every symbol cited below exists on `origin/develop` (D1 + C2), on `origin/lane/wt-645b` (D2 history endpoint + Kiota regen + permission hook, **IN-FLIGHT — read branch, NOT develop**), on `origin/lane/wt-646b` (D3 schedule/edit/cancel + service, **IN-FLIGHT — read branch, NOT develop**), or is created by a task below. Branch state in the citations; never invent. Verify each `git show` with `git show origin/lane/wt-<branch>:<path>` BEFORE writing a citation, never from memory.

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

### From D2 — `origin/lane/wt-645b` (PR #645 IN-FLIGHT — read branch, NOT develop)

- `apps/api/Modules/Publishing/Routes.Publishing.cs` — `Routes.Publishing.ForTenant`: `Root = "/publishing"`, `FindPublications = "/publications"`. **D4 reuses this group; the retry route hangs off the same `Root`.** D3 also edits this file (D3 changes `Root` to `/posts`, see "Routes group resolution" below); the implementer resolves the conflict in D3's favour (D3 is the larger downstream branch and a precondition for D4's queue/calendar).
- `apps/api/Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs` — `MapPublishingEndpointsForTenant(this IEndpointRouteBuilder routes)` exposing `GET /publishing/publications` (D2 history). D4 calls `MapPublishingEndpointsForTenant` from the D2-discovered call site (`apps/api/Program.cs:321` on `origin/lane/wt-645b`).
- `apps/api/Modules/Publishing/Services/PublicationListService.cs` — `IPublicationListService.FindForTenantAsync(FindPublicationsArgs(TenantId, Cursor, Limit, Statuses), ct)` returning `FindPublicationsResult.Success(CursorPaginatedResult<PublicationListItem>)` (newest-first keyset on `(updated_at desc, id desc)`) or `CursorNotFound(string)`. The row DTO `PublicationListItem { Id, PostId, PostExcerpt, Status, SocialAccountId, AccountLabel, ExternalUrl?, LastError?, UpdatedAt }` is THE shape History renders. **D2's DTO carries NO `ScheduledAtUtc` / `ScheduledTimeZone` — D4 Task 3.5 extends the DTO + the SELECT mapper with the two fields + regenerates the Kiota client (API + front in one commit) BEFORE the Queue/Calendar/History tests can be written against a scheduled time. D4 does NOT silently edit the list DTO inside an unrelated task.**
- `apps/api/Modules/Publishing/Handlers/Tenant/FindPublicationsForTenant.cs` — `FindPublicationsQuery : CursorPaginatedQuery` with `[FromQuery(Name = "status")] public string? Status`; co-located `PublicationStatusCsv` (`origin/lane/wt-645b:42-130` — verified, NOT 25-128 as the previous draft claimed) with `Parse` + `GetValidationError` mapping wire tokens BACK to `PublicationStatus` via a series of `case var _ when string.Equals(token, "<status>", StringComparison.OrdinalIgnoreCase)` clauses (PUBLY0003 forbids `ToLower` dispatch; the explicit `switch` with `OrdinalIgnoreCase` is the D2 idiom — do not paraphrase as "explicit switch with StringComparer"). Validator inherits `CursorPaginatedQueryValidator<FindPublicationsQuery>` and adds a `status` rule. **D4 reuses the `status` filter — the `scheduled` token is what Queue uses, the `published`/`failed`/`paused` tokens are what History uses, and the calendar uses a date range on top of `status=scheduled,paused,failed`.**
- `apps/api/Modules/Publishing/Services/PublicationStatusCsv.Spec.cs` — round-trip pin against `PublicationWire.FormatStatus`. D4 reuses the file.
- `apps/front/src/lib/query/tenant-publications.ts` — `TENANT_PUBLICATIONS_QUERY_KEY`, `TENANT_PUBLICATION_STATUSES = ['scheduled','in_progress','published','failed','paused'] as const`, `TenantPublicationStatus`, `TenantPublicationsQueryVariables`, `buildFindTenantPublicationsQueryParameters`, `toTenantPublicationRows`, `tenantPublicationsQueryOptions`, `useTenantPublicationsQuery`. **D4 EXTENDS this file with the retry mutation (Task 6) and a status-filtered variant; the existing read stays untouched.**
- `apps/front/src/lib/query/tenant-permissions.ts` — `useTenantPermissions(tenantId)`, `hasTenantPermission(permissions, key)`, `SOCIAL_ACCOUNTS_PUBLISH = 'tenant.socialaccounts.publish'`. **D4 reuses the gate for the Retry button.**
- `packages/client-ts/src/publishing/publications/index.ts` — generated `client.publishing.publications.get({ queryParameters: buildFindTenantPublicationsQueryParameters(variables) })`. **D4 regen-adds the retry operation (`POST /publications/{publicationId}/retry`)**.
- `apps/api/Modules/Publishing/Services/PublishNowService.cs` — `IPublishNowService.PublishNowAsync(PublishNowArgs(TenantId, PostId, ActorUserId, SocialAccountIds), ct)`; this is the D2 publish-now writer (NOTE: not yet merged to develop — see Reconciliation 1). If merged, D4 does not consume it; D4 reuses the enqueue pattern only.

### From D3 — `origin/lane/wt-646b` (NOT yet merged; D4 reads branch, not develop)

- `apps/api/Modules/Publishing/Services/PublicationService.cs` — `IPublicationService` with `ScheduleAsync(SchedulePublicationArgs, ct)`, `EditScheduleAsync(EditPostScheduleArgs, ct)`, `CancelScheduleAsync(Guid tenantId, Guid postId, Guid actorUserId, ct)` (verified at `origin/lane/wt-646b:81-95`). **`IPublicationService` does NOT have `FindScheduledForTenantAsync`; D4 does NOT add one to that interface.** The date-windowed read lives in D4's NEW `IPublicationScheduledListService` (Task 3), which sits next to D2's `IPublicationListService` and does NOT touch D3's `PublicationService`. D4 reuses `CancelScheduleResult(DeletedCount, KeptCount)` shape and D3's `IPublicationStatusTransitionService.RescheduleToFutureAsync` (D3) is NOT used — retry uses D1's `RescheduleToNowAsync` (line 160-179 on develop).
- `apps/api/Modules/Publishing/Handlers/Tenant/CancelPostScheduleForTenant.cs` — `DELETE /posts/{postId}/schedule` → `ApiResponse` with `ResponseKeys.PostScheduleCancelledSuccess` or `ResponseKeys.PostScheduleCancelNoop`. D4 reuses the i18n key and the `CancelScheduleResult(DeletedCount, KeptCount)` shape.
- `apps/api/Modules/Publishing/Jobs/DispatchDuePostsJob.cs` — D3 declared but did not implement; the actual `IJobEnqueuer.EnqueueAsync<PublishPublicationPayload>(PublishingJobs.PublishPublicationV1, payload, new EnqueueOptions { IdempotencyKey = key }, ct)` call is the EXACT shape D4 reuses for the retry path (Task 1).
- `apps/api/Modules/Publishing/Entities/PublicationSchedule.cs` — value object `PublicationSchedule.Create(DateTime scheduledAtUtc, string timeZoneId)`; `MaxTimeZoneLength = 64`. D4 does not create a new value object for retry (retry sets `ScheduledAtUtc = DateTime.UtcNow` and the existing zone, see Task 1).
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
- `apps/front/src/i18n/locales/{en,fr}/posts.json` — D4 adds ONLY the new keys (`queue.*`, `calendar.*`, `retry.*`, `history.paused.tooltip`, `history.failed.cause`, `history.retry.*`). D2 PR #645 already ships `history`, `history-account-label`, `history-description`, `history-empty-title`, `history-post-label`, `history-status-label`, `history.in-progress`, `history.column.*` in BOTH `en` and `fr` (verified at `origin/lane/wt-645b:apps/front/src/i18n/locales/en/posts.json` and `…/fr/posts.json`); D4 does NOT duplicate them. The i18n-namespaces guard (`apps/front/e2e/__tests__/e2e-tag-guard.test.ts` + `apps/front/e2e/i18n-namespaces.spec.ts`) requires EN/FR parity for the new keys.
- `apps/front/src/lib/format-date-time.ts` — `formatDateTime(date, 'en' | 'fr')`. **D4 extends with `formatInZone(utc: Date, zone: string, lang)`** (D4 Task 7) so every screen shows the publication's `ScheduledTimeZone` label alongside the wall time.
- `apps/front/src/components/ui/state-view.tsx` + `state-surface.tsx` + `skeleton.tsx` — the loading/empty/error primitive; the e2e flow uses `tenant-posts-publish-in-progress` pill.
- `apps/front/src/lib/error-handling/api-failure.ts` + `getFailureMessage(toApiFailure(error), …)` — repo rule (enforced by `publy/no-manual-response-message-translation`).
- `apps/front/src/lib/api-client/client-manager.ts` — `getClientManager().getOrCreateClient(tenantId)` and `getOrCreateSessionClient()` (the permission hook uses session-scoped because scope-auth-data is session-tenant-only; reads and mutations use tenant-scoped).
- `apps/front/e2e/__tests__/e2e-tag-guard.test.ts` — every top-level `test.describe` needs one `@domain` + one `@<ticket>` tag; vocabulary per `docs/guides/e2e-tags.md`. D4 uses `@tenant-workspace @647` (the existing `@tenant-workspace` is in the vocabulary; `@647` is the D4 ticket).
- `apps/front/e2e/tenant-posts-schedule.spec.ts` — D3's e2e (Task 8, in the D3 plan). D4 reuses the `apps/front/e2e/docker-compose.test.yml` stack.
- **In-flight D3 front dependency (blocking):** the D3 plan declares `apps/front/src/lib/query/tenant-publications.ts` (+ test) on `docs/records/2026-08-25-plan-d3-publication-scheduling.md:78, 208` exporting `useScheduledPublicationsQuery` / `useSchedulePostMutation` / `useEditPostScheduleMutation` / `useCancelPostScheduleMutation` / `saveSchedule` / `invalidateTenantPublications`. **The file does NOT yet exist on `origin/lane/wt-646b`** (verified `git show origin/lane/wt-646b:apps/front/src/lib/query/tenant-publications.ts` returns "fatal: path does not exist"; the D3 plan only created the file in Task 7 per the D3 task list). D4's Queue page cancel action needs `useCancelPostScheduleMutation` (D3 plan task 7 creates it). **If D3's PR does not merge first, the Queue page RED phase blocks with "module not found"**. D4's implementer must rebase onto D3 OR import the cancel mutation from a D4-owned `tenant-publications-cancel.ts` wrapper that calls the same `DELETE /posts/{postId}/schedule` wire endpoint directly (Kiota-generated) — the D3 plan's cancel mutation is a thin wrapper around the same Kiota operation, so D4 can ship its own wrapper that names the same hook symbol.

### Already on develop (`origin/develop` @ `4de921331`)

- `apps/api/Modules/Posts/Endpoints/PostEndpointsForTenant.cs` — sibling mapping; the call site that already calls `MapPostEndpointsForTenant(...)` (one site, in `Program.cs`) is where D4 adds `MapPublishingEndpointsForTenant(routes);` if the merged D2 doesn't ship that line itself (per D2 plan Task 5). Locator: `grep -rn "MapPostEndpointsForTenant(" apps/api --include="*.cs" | grep -v Endpoints/PostEndpointsForTenant.cs`.
- `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` — `AuthenticatedDefault`, `HeavySearchList` (D4 uses both; the queue list is `HeavySearchList`, the retry POST is `AuthenticatedDefault`).
- `apps/api/Lib/Validation/{CursorPaginatedQueryValidator,JsonElementRules,PatchFieldPattern}.cs` — D4 reuses these.
- `apps/api/Modules/Permissions/Entities/Permission.cs:84` — `Permission.CreateTenantPermission(...)` composes every tenant key as `tenant.<key>`; full `tenant.`-prefixed keys are the wire value the gate reads.
- `apps/api/Localization/ResponseKeys.g.cs` — generated from `packages/shared-ts/src/lib/i18n/json/response-message.en.json` (line 2 `// Generated from response-message.en.json`); D4 adds `publication-retry-success` and `publication-scheduled-list-success` keys to BOTH `.en.json` and `.fr.json` and rebuild regenerates `ResponseKeys.g.cs`.

### Routes group resolution (after both D2 and D3 land)

D2 (`origin/lane/wt-645b:1-30`) sets `Routes.Publishing.ForTenant.Root = "/publishing"`. D3 (`origin/lane/wt-646b:1-30`) sets `Routes.Publishing.ForTenant.Root = "/posts"`. **The wire URL the implementer must produce is whichever group wins after both merge**; the final source of truth is `git show origin/develop:apps/api/Modules/Publishing/Routes.Publishing.cs` at the time D4 lands. The two branches conflict on the same constant — D3 is the larger downstream branch (it is a precondition for D4's Queue/Calendar) so the implementer resolves in D3's favour: D4 imports `using PublyApp.Api.Lib.Routes;` and reads `Routes.Publishing.ForTenant.Root` directly, never hard-codes a path. D4 adds its `Retry` constant as the LAST element of the existing `Routes.Publishing.ForTenant` class (after whichever `FindPublications` / `Schedule` constant is present) so the merge conflict stays trivial. D4 does NOT modify the `Root` value itself; if both D2's `/publishing` and D3's `/posts` merge side by side, the operator records the chosen value in the PR body.

---

## Reconciliation decisions (each restated in the PR body)

1. **Retry goes through the existing `RescheduleToNowAsync` (D1).** The D3 plan (read at `docs/records/2026-08-25-plan-d3-publication-scheduling.md:69`) declares `RescheduleToFutureAsync` (future instant, custom zone). D4 does NOT use it. Retry resets the publication to `Scheduled` at `DateTime.UtcNow`, clears `LastError`/`ExternalRecordId`/`ExternalUrl`, preserves `IdempotencyKey`, and preserves `ScheduledTimeZone` (the original zone, not a new one). This is the exact contract of D1's `RescheduleToNowAsync` (`apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179`). Per the spec §D4: "Retry (button, `tenant.posts.publish`): sets the publication back to `Scheduled` at now with the **same** idempotency key."
2. **Route placement.** The retry endpoint hangs off the existing `Routes.Publishing.ForTenant` group (D2 PR #645) as `POST /publications/{publicationId}/retry`. This is a new per-publication resource (D2's `FindPublications` is the list). Handlers orchestrate; ALL logic sits in a new `RetryPublicationService`. No extension into D3's `Routes.Tenant.Schedule` group (which is post-scoped, not publication-scoped).
3. **Queue read = D2 `GET /publishing/publications?status=scheduled` filtered to a forward window via a NEW `from` / `to` snake_case query pair (Task 3).** D3's plan declared a `GET /posts/{postId}/schedule` list and a separate `FindScheduledPublicationsForTenant` (D3 Task 4) — the D3 read is post-scoped, the D4 queue read is tenant-scoped (all scheduled publications across all posts, time-windowed). D4 reuses the same wire shape (`status=scheduled,paused` + cursor pagination) but with date-range constraints. Stated in PR body as a deliberate divergence from the D3 plan to avoid two parallel reads. **Task 3.5 (a D4-owned DTO extension) adds `ScheduledAtUtc` + `ScheduledTimeZone` to D2's `PublicationListItem` BEFORE the Queue/Calendar pages can render a scheduled time; the front Kiota client is regenerated in the same commit so the type narrows cleanly.**
4. **Calendar = same endpoint, month-window preset.** The Calendar page passes `from=YYYY-MM-01T00:00:00Z` and `to=YYYY-<month+1>-01T00:00:00Z` (clamped to the D3 31-day window) and re-uses the queue's `status=scheduled,paused,failed` filter; pills show status, click navigates to the post. No new endpoint.
5. **History read = D2 `GET /publishing/publications?status=published,failed,paused`** with the existing keyset cursor and the existing "In progress…" polling pattern from the D2 plan (Task 9 — but only as far as the polling logic; the new `in_progress` filter is the trigger). The PR body calls this out as a D4 reuse, not new.
6. **Retry is on `Failed` rows ONLY (spec §4 line 42: "History: Published (link to Bluesky) and Failed (cause + Retry)").** Spec §3.5 (line 34) defines Retry as "sets the publication back to `Scheduled` at now with the same idempotency key" with no source-state restriction, BUT spec §4 (the screen-level spec) only requires a Retry button on `Failed` rows. Spec §3.6 (line 35) is the **automatic** "on reconnect, `Paused` publications with a future instant return to `Scheduled`" path — NOT a manual button. Therefore the **Retry button is only rendered on `Failed` rows**; `Paused` rows render the cause + a "Reconnect the account to resume" tooltip that names the next action (Epic C, out of D4 scope for the banner service). The API still permits the `Paused → Scheduled` transition via `RescheduleToNowAsync` (the `AllowedSources` map at `origin/lane/wt-645b:81-85` of the transition service allows it), but D4 does NOT expose that path through a manual button. If a future product decision is to add manual resume, it lands as a new feature with its own spec, not a silent extension of D4.
7. **Architecture-guard extension is RED-proven.** D4 extends `PublicationArchitecture.Spec` with two new facts: (a) every `Map*` in `PublishingEndpointsForTenant.cs` has both `.WithTenantPermission` and `.RequireRateLimiting`, and (b) no file outside `Modules/Publishing/Services/PublicationStatusTransitionService.cs` writes `Publication.Status` via direct EF or raw SQL — the D1 ratchet already covers this for assignments, and D4 extends the SQL-token scan to `UPDATE publications ... WHERE` to forbid the obvious retry-by-write-bypass. RED transcript saved to `.dump/mutation-retry-bypass.md`. (The Roslyn semantic walk at line 462-535 already catches `p.Status = X` in any module file; D4 adds the SQL scan.)
8. **No new dependencies.** D4 reuses every existing API + front primitive. No `app-channel` subscriptions, no new tables, no new policies.
9. **Retry button visibility: server 403 wins.** There is no front permission hook for `tenant.posts.publish` on develop today (the D2 plan surfaced this; the permission gate in `tenant-permissions.ts` is `SOCIAL_ACCOUNTS_PUBLISH` only, set by the composer). D4 keeps the Retry button visible to all members and surfaces server 403 via `getFailureMessage(toApiFailure(error), 'mutation:retry-failed')` (the same fail-closed path D2 used for publish-now). Stated in PR body as an open owner question (mirrors D3's reconciliation note).
10. **Pruning the dead `queue` / `calendar` / `history` placeholders.** D4 replaces the `ReadOnlyBadge` placeholders on develop (`apps/front/src/routes/authed/tenant/posts/{queue,calendar,history}.tsx`; the "coming later" `StateSurface`) with real data tables / month grids, drops the `ReadOnlyBadge`, and removes the corresponding `*-coming-later-{title,description}` keys from `posts.json` ONLY in the locale whose placeholder the page used to be (English and French for the three pages). The i18n-namespaces spec + design-token guard pin this.
11. **Time-zone round-trip on Calendar + History is the D3 plan's Task 4 zone proof generalised.** D4 writes its own front `formatInZone(utc, zone, lang)` helper (Task 7) and pins the round-trip in `formatInZone.test.ts` for summer/winter DST (D3 plan §3.4).

## File structure

**Create — API (`apps/api`)**
- `Modules/Publishing/Routes.Publishing.cs` (extends D2) — add `Retry = "/publications/{publicationId}/retry"` (and `RetryFn(string publicationId)` string helper, mirroring `Routes.Posts.ForTenant.GetByIdFn`).
- `Modules/Publishing/Services/RetryPublicationService.cs` (+ `.Spec.cs`) — `IPublicationRetryService.RetryAsync(RetryPublicationArgs(tenantId, publicationId, actorUserId), ct)`; the only writer of retry-side `Publication.Status`; depends on `AppDbContext` + `IJobEnqueuer` + `IPublicationStatusTransitionService` (infrastructure seam, not service-service). **Interface name is `IPublicationRetryService` everywhere** (verb-first, matches `IPublicationListService` / `IPublishNowService` / `IPublicationScheduledListService`); the class registration uses `[Service(ServiceLifetime.Scoped)]` (same pattern as D1's `PublicationStatusTransitionService`). The earlier `IPublicationPublicationRetryService` was a doubled-prefix typo and is removed.
- `Modules/Publishing/Services/PublicationScheduledListService.cs` (+ `.Spec.cs`) — `IPublicationScheduledListService.FindScheduledForTenantAsync(FindScheduledPublicationsArgs(tenantId, fromUtc, toUtc, statuses, cursor, limit), ct)`; keyset `(scheduled_at_utc, id)`; **NEW** snake_case `from` / `to` query parameters on `FindPublicationsQuery` (extends D2's query DTO, no new handler).
- `Modules/Publishing/Handlers/Tenant/RetryPublicationForTenant.cs` (+ `.Spec.cs`) — `POST /publications/{publicationId}/retry` → `Results<Ok<ApiResponse>, AppBadRequestHttpResult, AppNotFoundHttpResult, AppConflictHttpResult, AppValidationProblemHttpResult>`; maps `RetryPublicationResult.{NotFound, NotRetriable(cause, errorKey), Retried(publicationId)}`.
- `Modules/Publishing/Handlers/Tenant/FindPublicationsForTenant.cs` (extends D2 PR #645 file) — add `[FromQuery(Name = "from")] public string? From` and `[FromQuery(Name = "to")] public string? To` snake_case fields + `GetFromUtc()` / `GetToUtc()` parsing via the existing `JsonElementRules.MustBeRequiredIsoDateTime` only on the wire strings (route: `JsonElement` equivalents via the D2 `string?` precedent; D4 reuses the same D2 validator harness). Validator extends the D2 validator with `from ≤ to` and `to - from ≤ 31 days` rules. **No new handler file** — the D2 `FindPublicationsForTenant` is the single read endpoint; the Queue/Calendar/History pages all call it with different query parameters.
- `Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs` (extends D2) — register `POST /publications/{publicationId}/retry` with `.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)` and `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH])` (a publish verb; spec §3.5).
- `Modules/Publishing/Services/RetryPublicationService.cs.Spec.cs` (co-located, Testcontainers via `ApiFixture`).
- `Modules/Publishing/Handlers/Tenant/RetryPublicationForTenant.Spec.cs` (co-located).
- `Modules/Publishing/Services/PublicationScheduledListService.cs.Spec.cs` (co-located).
- `Modules/AuditLogs/Entities/AuditLog.cs` — add ONE const to `AuditActions`:
  - `PublicationRetried = "publication.retried"` (the retry action; details carry the actor + the publication id + the sanitised prior `LastError` truncated to 280 chars so the audit log never carries secrets). Single const, NOT three — the "three consts" wording was a leftover from the D3 plan copy-paste.

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
- `src/routes/authed/tenant/posts/queue.tsx` (REWRITE from the develop placeholder — develop has the "coming later" stub at `apps/front/src/routes/authed/tenant/posts/queue.tsx`, NOT D2) + `queue.test.tsx` (NEW) — Task 7 Step 1. Tests pin: data table renders the `tenant-posts-queue-page` heading, the rows from `useTenantScheduledPublicationsQuery` with `status=scheduled,paused`, the time shown in the row's zone via `formatInZone`, the cancel link that calls the existing D3 `DELETE /posts/{postId}/schedule` mutation, the edit link that navigates to `/$postId/edit`, the "in progress…" pill, and the empty state via `StateSurface` with testid `tenant-posts-queue-empty` (kept as a real empty state, not "coming later"). Retry: NOT exposed on any queue row in D4 (the front Retry button is only on the History page's `Failed` rows per spec §4 line 42); the Queue page is for `Scheduled` and `Paused` rows, both of which the History page does not display. The `Paused` row in the Queue renders the cause + a "Reconnect the account" tooltip (spec §4 "next action" rule), not a Retry button.
- `src/routes/authed/tenant/posts/calendar.tsx` (REWRITE placeholder) + `calendar.test.tsx` (REWRITE) — Task 7 Step 2. Month grid, prev/next month URL state (`?from=YYYY-MM-01&to=YYYY-MM-31`, snake_case). Pills per day (max 3 visible, "+N more" overflow link to the queue with the same `from` / `to` URL state). The grid is a plain `div` month grid (no new dependency); pills are `StatusPill` from `apps/front/src/components/ui/status-pill.tsx` (D4 Task 7 Step 0 adds this primitive if not present; checked first via `git ls-files apps/front/src/components/ui/status-pill.tsx`).
- `src/routes/authed/tenant/posts/history.tsx` (EXTEND D2's wired page — D2 has the real `DataTable` + cause rendering + in-progress pill + a refetch-stub Retry button on `failed` rows at `origin/lane/wt-645b:1-256`) + `history.test.tsx` (EXTEND) — Task 7 Step 3. Tests pin: data table renders published rows with `tenant-posts-history-link` to `ExternalUrl` opening in a new tab, failed rows with `tenant-posts-history-cause` one-sentence + the `Retry` button (calls `useRetryPublicationMutation`, REPLACES D2's `query.refetch()` stub), paused rows with the cause + the "Reconnect the account" tooltip (Epic C, the banner service is out of D4 scope; D4 shows the cause + a `title` attribute that names the next action). Polling: while any row is `in_progress`, the query invalidates every 5 s via D2's `IN_PROGRESS_POLL_MS` (fake timers assert ≥2 refetches) and stops when none remain. `LogoutRedirect` only on 401 (repo rule).
- `src/components/ui/status-pill.tsx` (NEW primitive if absent) — tiny `StatusPill` mapping `TenantPublicationStatus → {label, tone, testId}`; tones: `scheduled` (neutral), `in_progress` (info), `published` (success), `failed` (danger), `paused` (warning). Testid: `tenant-posts-publication-pill-{status}`. Co-located test.
- `apps/front/e2e/tenant-posts-queue.spec.ts` (NEW) — tags `@tenant-workspace @647`; flow: schedule via D3's `POST /posts/{postId}/schedule` → poll queue → see row with the in-zone time → cancel via row menu → row gone. (Out of scope: full publish-now flow; D2's e2e covers that.)
- `apps/front/e2e/tenant-posts-calendar.spec.ts` (NEW) — tags `@tenant-workspace @647`; flow: schedule a row for next month → calendar pill shows on the right day in the right zone.
- `apps/front/e2e/tenant-posts-history-retry.spec.ts` (NEW) — tags `@tenant-workspace @647`; flow: force a `Failed` row via the seeded fake provider's "transient → failed after 3" path (D1's `PublishPublicationJobHandler` already proves this) → history page shows the row with the cause → click Retry → status flips to `scheduled` → queue shows it at-now → request-counter asserts no `X-Session-Token` echo.
- i18n: `apps/front/src/i18n/locales/{en,fr}/posts.json` — add ONLY the new keys (`queue.*`, `calendar.*`, `retry.*`, `history.paused.tooltip`, `history.failed.cause`, `history.retry.*`); remove the `*-coming-later-{title,description}` keys (per reconciliation 9) for the `queue` and `calendar` pages (the `history` page's coming-later keys are already removed by D2).

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
  - (b) Happy path on `Paused` (Epic C reconnect path: spec §3.6 says "on reconnect, `Paused` publications with a future instant return to `Scheduled`"). The API still permits `Paused → Scheduled` (the `AllowedSources` map at `origin/lane/wt-645b:81-85` of the transition service allows it) and D4's test pins it. **The Retry button on the front is NOT exposed on `Paused` rows** (spec §4 only requires the button on `Failed`; `Paused` rows render the cause + the "Reconnect the account" tooltip per the spec §4 "next action" rule). The API stays permissive so future product changes don't need a server change.
  - (c) `Scheduled` → `NotRetriable` with `cause = "This publication is already scheduled."` and `ErrorKey = "status"`. No row written, no job enqueued.
  - (d) `InProgress` → `NotRetriable` with `cause = "This publication is currently being published; wait for it to finish before retrying."` and `ErrorKey = "status"`. (The retry button is hidden while `in_progress` — see Task 6 — but the API stays fail-closed.)
  - (e) `Published` → `NotRetriable` with `cause = "This publication is already published. To post again, create a new publication."` and `ErrorKey = "status"`.
  - (f) Foreign-tenant `publicationId` → `NotFound`; no row written, no job enqueued (isolation).
  - (g) Unknown `publicationId` → `NotFound`; no row written.
  - (h) **Sanitisation proof (real RED):** seed a `LastError = "Bearer eyJabc123"` directly (bypassing `MarkFailedAsync` for the test setup) → the service captures `priorLastError = "Bearer eyJabc123"` BEFORE calling `RescheduleToNowAsync` (which clears `LastError` to null). The service then builds the audit `Details` from `priorLastError` via `LastErrorSanitiser.Sanitize(priorLastError)` — the sanitiser returns a string with the literal `eyJ` substring removed (verified by the unit test on the sanitiser itself). The spec asserts (i) the `AuditLog.Details` JSON column does NOT contain the literal `eyJabc123`, AND (ii) it DOES contain a human-readable prefix like `"Bearer [redacted]"` or the sanitiser's documented replacement. The RED: with the existing code, if the implementer forgets to call `LastErrorSanitiser.Sanitize(priorLastError)` and instead passes `priorLastError` raw, the assertion (i) goes RED with the substring present. The spec ALSO asserts the truncated length ≤ 280 chars.
  - (i) Audit: `AuditActions.PublicationRetried` row appears with `actorUserId`, `targetId = publicationId`, `details` carrying `TenantId`, `PublicationId`, and a truncated prior `LastError` (≤ 280 chars, sanitised by `LastErrorSanitiser`).
- [ ] **Step 2 (GREEN):** Implementation: `[Service(ServiceLifetime.Scoped)]` on the concrete class (see the class declaration below). Dependencies: `AppDbContext` + `IJobEnqueuer` + `IPublicationStatusTransitionService` (infrastructure seam, not service-service). Flow:
  1. Load tenant-scoped: `_dbContext.Publication.SingleOrDefaultAsync(p => p.Id == args.PublicationId && p.TenantId == args.TenantId && !p.IsDeleted, ct)`. If null → `NotFound`.
  2. Decide result kind from `publication.Status`:
     - `Failed` → continue (the front Retry button is only on `Failed` per spec §4; `Paused` is allowed here for the future Epic C reconnect path and the test pins it, but the button is not exposed in the front today).
     - `Scheduled` / `Published` / `InProgress` → `NotRetriable(plainCause, "status")`.
  3. Capture `priorStatus = publication.Status` and `priorLastError = publication.LastError` BEFORE the transition.
  4. Call `await _transitions.RescheduleToNowAsync(new ReschedulePublicationToNowArgs(args.PublicationId, args.TenantId), ct)` — the D1 method at `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179`. It does the `Failed → Scheduled` / `Paused → Scheduled` transition, clears `LastError` / `ExternalRecordId` / `ExternalUrl`, preserves `IdempotencyKey`, and sets `ScheduledAtUtc = DateTime.UtcNow`. If the method returns false (transition failed) → `NotFound` (the row was deleted between load and write — defensive).
  5. Enqueue: `var key = PublicationIdempotencyKey.For(args.PublicationId); await _jobEnqueuer.EnqueueAsync(PublishingJobs.PublishPublicationV1, new PublishPublicationPayload { PublicationId = args.PublicationId, IdempotencyKey = key }, new EnqueueOptions { IdempotencyKey = key }, ct);` — exact D2 plan pattern. `IJobEnqueuer` joins the caller's transaction by contract.
  6. Audit: `AddAuditEntry(args.ActorUserId, AuditActions.PublicationRetried, args.PublicationId, new { TenantId = args.TenantId, PublicationId = args.PublicationId, PriorStatus = PublicationWire.FormatStatus(priorStatus), PriorLastError = LastErrorSanitiser.Sanitize(priorLastError) is { Length: > 0 } sanitised ? sanitised[..Math.Min(280, sanitised.Length)] : null })`. The sanitiser returns a NON-NULL string (the repo contract; never `?.` null-skip — the row gets `null` for `Details.PriorLastError` only if the sanitiser produced an empty string). Mirror D3's `AddAuditEntry` (no `IAuditLogService` — same-transaction).
  7. `await _dbContext.SaveChangesAsync(ct);` → `Retried(args.PublicationId)`.
  8. The whole block from step 4 onward runs INSIDE the EF change tracker's implicit transaction; `_jobEnqueuer.EnqueueAsync` joins the caller's transaction by contract (`apps/api/Infrastructure/Jobs/IJobEnqueuer.cs`, on develop).

  Class declaration (with the required `[Service]` attribute):

  ```csharp
  [PublyApp.Api.Lib.DI.Service(ServiceLifetime.Scoped)]
  public sealed class RetryPublicationService : IPublicationRetryService {
      // ctor + flow as above
  }
  ```
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
  - `Retried` → `TypedResults.Ok(ApiResponse.Create("Publication queued for retry", ResponseKeys.PublicationRetrySuccess))`. The handler does NOT write a second audit row — the service-level `AddAuditEntry` in Task 1 case (i) is the single audit row for the retry action; writing a second one in the handler would double-count and trip staff dedup logic. The PR body calls this out as the deliberately single-audit design.
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

## Task 3.5: `PublicationListItem` DTO extension — `ScheduledAtUtc` + `ScheduledTimeZone`

**Files:** `apps/api/Modules/Publishing/Services/PublicationListService.cs` (extends D2 PR #645 file); `packages/client-ts/src/publishing/publications/index.ts` (regenerated).

D2's `PublicationListItem` (`origin/lane/wt-645b:18-28`) carries NO `ScheduledAtUtc` / `ScheduledTimeZone`. D4 cannot render a Queue row's scheduled time without those two fields, and D4 cannot render a Calendar pill in the right zone without `ScheduledTimeZone`. This task extends the DTO BEFORE the Queue/Calendar tests are written (Tasks 7 Step 1 + 7 Step 2 depend on it).

- [ ] **Step 1 (RED):** Extend `PublicationListService.ToListItem` (D2 file) to map the two new columns. The existing projection is `new PublicationRow { Publication = publication, PostBody = publication.Post.Body, AccountHandle = publication.SocialAccount.DisplayHandle }`; extend to `new PublicationRow { Publication = publication, PostBody = publication.Post.Body, AccountHandle = publication.SocialAccount.DisplayHandle, ScheduledAtUtc = publication.ScheduledAtUtc, ScheduledTimeZone = publication.ScheduledTimeZone }`. The `ToListItem` mapper (D2 file at the end of the service) gains two new fields: `ScheduledAtUtc = row.ScheduledAtUtc` and `ScheduledTimeZone = row.ScheduledTimeZone`. RED: a spec asserts the JSON wire shape carries both fields (Kiota regen produces the new TS fields; the test reads from the Kiota types).
- [ ] **Step 2 (GREEN):** `just build-api && just generate-client && pnpm --filter front typecheck`. The `PublicationListItem` Kiota model gains the two new fields; the front `TenantPublicationRow` mapper (D2 file at `origin/lane/wt-645b:apps/front/src/lib/query/tenant-publications.ts` around line 60) gains the two new fields. `git diff --stat packages/client-ts` shows ONLY generated churn.
- [ ] **Step 3:** Filter green; commit `feat(publishing): PublicationListItem — ScheduledAtUtc + ScheduledTimeZone for the queue/calendar; Kiota regen`; push. The commit message names the DTO extension explicitly so a reviewer reading the D2 PR notes sees the diff as a D4 surface, not a D2 surface.

## Task 4: Architecture-guard extensions + RED proofs

**Files:** `Lib/Architecture/PublicationArchitecture.Spec.cs` (extends D1 PR #1433 file).

- [ ] **Step 1 (GREEN first):** Add facts:
  - (a) Every `Map*` in `Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs` carries both a rate-limit policy and `WithTenantPermission` metadata — Roslyn-free source scan asserting each `group.Map(Get|Post|Patch|Delete)` block contains `.RequireRateLimiting(` and `.WithTenantPermission(` (technique of the existing single-writer scan, lines 462-535; mirror `EndpointPermissionMetadataGuard.Spec` on develop).
  - (b) **Strengthen `RawSqlPublicationUpdate` regex from the existing `\bUPDATE\s+(?:ONLY\s+)?"?publications"?\b` (line 791) to a NEW regex that ALSO flags `SET\s+status` against `publications` in production code: the old regex matches `UPDATE publications` and any `SET status = 20` literal that appears in the same string. The new regex is a SECOND `[GeneratedRegex]` named `RawSqlPublicationSetStatus` with the pattern `\bSET\s+status\b.*\bpublications\b` (case-insensitive), iterated across the same `SqlStringTokenKinds` token set the D1 scan already walks. Both the old and the new regexes run on every token; the rogue list records each match with its file:line. **Old regex (D1, line 791):** `\bUPDATE\s+(?:ONLY\s+)?"?publications"?\b` — flags `UPDATE publications` (the broad write). **New regex (D4):** `\bSET\s+status\b.*\bpublications\b` — flags the obvious retry-by-write-bypass like `"UPDATE publications SET status = 10"`. The D1 ratchet already catches `UPDATE publications`; the new regex catches the SET-status clause even in string literals that omit the `UPDATE` keyword (e.g. dynamic SQL fragments). The RED proof: a planted string `"SET status = 10 FROM publications WHERE id = @id"` in a production file (not a Spec, not a Migration) trips the new regex; the same string WITHOUT the new regex passes silently. Stated in PR body: the D1 ratchet already covers the obvious bypass; the new regex is a strengthening for the case where an implementer splits the write across two strings.
- [ ] **Step 2 (RED proof — rogue retry writer):** Plant a temp `Modules/Publishing/Handlers/Tenant/_RogueRetryWriter.cs` writing `dbContext.Publication.First().Status = PublicationStatus.Scheduled;` directly. Run the PublicationArchitecture scan → MUST FAIL naming the file:line. Transcript to `.dump/mutation-retry-bypass.md`. Delete, rerun green.
- [ ] **Step 3 (RED proof — rogue retry enqueue):** Plant a temp `Modules/Publishing/Handlers/Tenant/_RogueRetryEnqueue.cs` that calls `_jobEnqueuer.EnqueueAsync(PublishingJobs.PublishPublicationV1, payload, new EnqueueOptions(), ct)` WITHOUT `IdempotencyKey`. Run the `DispatchDuePostsConcurrency.Spec` style test (D3 plan Task 6 at `docs/records/2026-08-25-plan-d3-publication-scheduling.md:172`, the spec file lives at `apps/api/Modules/Publishing/Jobs/DispatchDuePostsConcurrency.Spec.cs` on `origin/lane/wt-646b` — D4 cites the D3 plan task that creates it; the spec file ITSELF ships with the D3 PR, not D4) for the retry path: two concurrent retries on the same `publicationId` would both enqueue without a key and duplicate. The `ux_job_queue_type_idempotency` unique index (D3's name; on develop if D3 merges) catches this — a concurrent retry spec goes RED naming the duplicate. **D4 DOES NOT create `DispatchDuePostsConcurrency.Spec.cs` in this PR** — it is D3's deliverable. D4's RED transcript in `.dump/mutation-retry-no-key.md` records the keyless enqueue and the duplicate outcome; the real spec file lands in the D3 PR. Restore byte-exact.
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

**Files:** `apps/front/src/components/ui/status-pill.tsx` (NEW, if absent — Task 7 Step 0); `apps/front/src/lib/format/zone-date-time.ts` + `.test.ts` (NEW); `apps/front/src/routes/authed/tenant/posts/queue.tsx` (REWRITE the develop placeholder); `apps/front/src/routes/authed/tenant/posts/calendar.tsx` (REWRITE the develop placeholder); `apps/front/src/routes/authed/tenant/posts/history.tsx` (EXTEND D2's wired page — D2 has the real `DataTable` + polling + cause rendering at `origin/lane/wt-645b`); `apps/front/src/routes/authed/tenant/posts/{queue,calendar,history}.test.tsx` (NEW for queue/calendar, EXTEND for history); `apps/front/src/i18n/locales/{en,fr}/posts.json` (adds queue/calendar/history/retry keys, removes coming-later keys).

- [ ] **Step 0 (only if `apps/front/src/components/ui/status-pill.tsx` is absent):** `git ls-files apps/front/src/components/ui/status-pill.tsx` first. If absent, evaluate Badge reuse first: the develop `Badge` primitive at `apps/front/src/components/ui/badge.tsx` (verified line 8-30) has variants `default / secondary / destructive / outline / ghost / link` (line 16-25 of `badge.variants.ts`). The D4 status set has 5 tones (`scheduled` neutral, `in_progress` info, `published` success, `failed` danger, `paused` warning). Three of those tones (`success`, `info`, `warning`) have no direct mapping to the existing Badge variants. **Decision: create the `StatusPill` primitive (NOT reuse Badge) because the existing variants are insufficient and the design-token guard forbids adding `success` / `warning` / `info` variants to the shared Badge (Badge is a cross-cutting primitive; status-specific tones belong with the status concept, not the badge concept).** The `StatusPill` is a small wrapper with a `tone` prop, the five `TenantPublicationStatus` values, and a testid `tenant-posts-publication-pill-{status}`. Co-located test asserts all five tones render. The pill is the SINGLE place status colors are decided (mirrors `apps/front/src/components/ui/badge.tsx` for badges — local primitive, no Tailwind tokens invented). Commit `feat(front): StatusPill primitive — five tones, no raw colors outside the pill`; push.
- [ ] **Step 1 — Queue page (RED then GREEN).** Tests:
  - renders the `tenant-posts-queue-page` heading.
  - rows show: excerpt (truncate 80), account label, status pill (tone per status), time via `formatInZone(row.scheduledAtUtc, row.scheduledTimeZone, 'en')` (the two fields come from Task 3.5's DTO extension).
  - empty state: `StateSurface` with testid `tenant-posts-queue-empty` (replaces the coming-later stub).
  - cancel action on a `Scheduled` row calls `useCancelPostScheduleMutation` (D3 plan task 7, see "In-flight D3 front dependency" above) with the post id; on success the row disappears.
  - edit action navigates to `/tenant/posts/{postId}/edit`.
  - in-progress row shows the `tenant-posts-publish-in-progress` pill.
  - 401 from the read query → `LogoutRedirect`; 403 → toast via `getFailureMessage`.
  - The whole page uses `useTableController` + `parseTenantPostListSearchParams` / `serializeTenantPostListSearchParams` (snake_case) just like `drafts.tsx`. `DEFAULT_SORT = { id: 'scheduled_at', order: 'asc' as const }`. `defaultSize = 20`.
  - **Component contract testids:** `tenant-posts-queue-page`, `tenant-posts-queue-table`, `tenant-posts-queue-empty`.
  - Implement: `apps/front/src/routes/authed/tenant/posts/queue.tsx` REPLACES the develop placeholder; keep the `tenant-posts-queue-page` testid (already used by D2's e2e shell).
  - i18n keys: `queue.title`, `queue.description`, `queue.empty.title`, `queue.empty.description`, `queue.column.excerpt`, `queue.column.account`, `queue.column.when`, `queue.column.status`, `queue.action.cancel`, `queue.action.edit`, `queue.cancel.confirm.title`, `queue.cancel.confirm.description`. EN + FR.
- [ ] **Step 2 — Calendar page (RED then GREEN).** Tests:
  - renders the `tenant-posts-calendar-page` heading.
  - URL state: `?from=YYYY-MM-01T00:00:00Z&to=YYYY-MM-31T23:59:59Z` (snake_case); prev/next month buttons update the URL state via `useNavigate({ search: ... })`.
  - each day cell shows pills for the rows whose `scheduled_at_utc` falls in that day IN THE ROW'S ZONE (the wire's `scheduled_at_utc` is UTC; `formatInZone` converts).
  - max 3 pills per cell; overflow link "+N more" navigates to the Queue page with the same `from` / `to` URL state.
  - clicking a pill navigates to `/tenant/posts/{postId}/edit`.
  - empty month shows a `StateSurface` with testid `tenant-posts-calendar-empty`.
  - out-of-window rows are not rendered (asserted via mock).
  - **Component contract testids:** `tenant-posts-calendar-page`, `tenant-posts-calendar-empty`, `tenant-posts-calendar-day-{YYYY-MM-DD}`, `tenant-posts-calendar-pill-{publicationId}`.
  - Implement: `apps/front/src/routes/authed/tenant/posts/calendar.tsx` REWRITES the develop placeholder; keep the `tenant-posts-calendar-page` testid.
  - i18n keys: `calendar.title`, `calendar.description`, `calendar.empty.title`, `calendar.empty.description`, `calendar.prev`, `calendar.next`, `calendar.more`, `calendar.today`. EN + FR.
- [ ] **Step 3 — History page (RED then GREEN).** Tests:
  - **D4 EXTENDS D2's `history.tsx` (does NOT replace; D2 already wired the read endpoint + the `tenant-posts-history-cause` testid + the `tenant-posts-publish-in-progress` pill + a refetch-stub Retry button on `failed` rows at `origin/lane/wt-645b` — verified line range 1-256).** D4's additions: (a) the `Retry` button calls `useRetryPublicationMutation()` instead of `query.refetch()`; (b) the in-progress polling uses the D2 `IN_PROGRESS_POLL_MS = 5_000` constant already in the file; (c) the failed row's existing `tenant-posts-history-cause` testid gains a sibling `tenant-posts-history-retry-{publicationId}` for the real Retry button; (d) `STATUS_LABEL_KEYS` (D2's `Record<string, string>`) gains a `failed` entry; (e) the `Paused` row's cause + `tenant-posts-history-paused-tooltip` are added (D2's stub does not handle `Paused`).
  - published row shows `tenant-posts-history-link` opening in a new tab with `href = ExternalUrl` (D2's behaviour; D4 keeps it).
  - failed row shows `tenant-posts-history-cause` (the `LastError` string) + a Retry button `tenant-posts-history-retry-{publicationId}` (D4 replaces D2's refetch stub with the real mutation).
  - **The Retry button is rendered ONLY on `Failed` rows** (spec §4 line 42: "History: Published (link to Bluesky) and Failed (cause + Retry)"). `Paused` rows render the cause + a `tenant-posts-history-paused-tooltip` naming the next action ("Reconnect the account to resume") — the Epic C reconnect banner is out of D4 scope; the tooltip names the next action in plain words.
  - in-progress row shows the `tenant-posts-publish-in-progress` pill (D2's behaviour; D4 keeps it).
  - polling: while any row is `in_progress`, the query invalidates every 5 s via D2's `IN_PROGRESS_POLL_MS` (fake timers assert ≥2 refetches) and stops when none remain.
  - fatal error → `LogoutRedirect` only on 401.
  - **Component contract testids (existing on D2 + D4's additions):** `tenant-posts-history-page` (D2), `tenant-posts-history-link` (D2), `tenant-posts-history-cause` (D2), `tenant-posts-history-retry-{publicationId}` (D4), `tenant-posts-history-paused-tooltip` (D4), `tenant-posts-history-empty` (D2).
  - Implement: `apps/front/src/routes/authed/tenant/posts/history.tsx` EXTENDS D2's wired page (does NOT replace; D2 has the real `DataTable` + polling + cause rendering at `origin/lane/wt-645b` — D4's edits layer the real Retry button on top, see Task 7 Step 3 above). Drop `ReadOnlyBadge` and the `coming-later` copy IF D2 did not already drop them (D2's `history.tsx` line 1-256 already removes the `ReadOnlyBadge`; D4 only re-asserts the invariant in the test).
  - i18n keys: `history.title`, `history.description`, `history.empty.title`, `history.empty.description`, `history.column.excerpt`, `history.column.account`, `history.column.when`, `history.column.status`, `history.action.open`, `history.action.retry`, `history.paused.tooltip`, `history.in_progress`, `history.failed.cause`, `history.retry.success`, `history.retry.conflict`, `history.retry.conflict.scheduled`, `history.retry.conflict.published`, `history.retry.conflict.in_progress`. The keys `history.title`, `history.description`, `history.empty.title`, `history.column.*`, `history.action.open` are ALREADY on D2; D4 only adds the ones it owns (the retry/paused/in_progress/failed.cause sub-tree). The implementer reuses the D2 keys verbatim and merges with the new ones.
- [ ] **Step 4 — `formatInZone` helper (RED then GREEN).** `apps/front/src/lib/format/zone-date-time.ts`:
  - `formatInZone(utc: Date, zone: string, lang: 'en' | 'fr')` returns `"2026-08-26 09:00 (Europe/Paris)"` in EN and `"26 août 2026 09:00 (Europe/Paris)"` in FR.
  - `parseLocalWallTime(local: string, zone: string)` returns a `Date` in UTC.
  - Tests pin DST summer/winter (`Europe/Paris` 2026-08-26 09:00 → 07:00Z; 2026-12-15 09:00 → 08:00Z) — the D3 plan's §3.4 zone round-trip cases generalised to the helper. Dayjs via the shared wrapper only (lint rule).
- [ ] **Step 5:** `pnpm --filter front typecheck && pnpm --filter front test && pnpm --filter front check:design-system && just react-doctor` green. Commit `feat(front): queue + calendar + history pages wired to the publishing API, retry button on failed rows, status pill primitive, formatInZone helper`; push.

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
- **D4.10** DTO carries scheduled-time — `PublicationListItem` extends with `ScheduledAtUtc` + `ScheduledTimeZone` in Task 3.5; the Queue and Calendar pages render `formatInZone(row.scheduledAtUtc, row.scheduledTimeZone, lang)` from those fields, not from `updatedAt`. The D2 PR #645 ships without the two fields; Task 3.5 is the explicit D4 surface that adds them and regenerates Kiota.

A traceability table linking each reconciliation decision to the spec line that drives it (added in the PR body per the round-1 MINOR finding):

| # | Reconciliation | Spec anchor | Code surface |
|---|---|---|---|
| 1 | Retry reuses `RescheduleToNowAsync` (D1) | spec §3.5 (line 34) | `RetryPublicationService` |
| 2 | Route placement: per-publication on the D2 group | spec §3.5 (line 34) | `Routes.Publishing.ForTenant.Retry` (Task 2) |
| 3 | Queue/Calendar share the D2 read + `from`/`to` window | spec §4 line 40-41 (no parallel reads) | `FindPublicationsForTenant` (Task 3) + Task 3.5 |
| 4 | Calendar reuses the queue's date-windowed read | spec §4 line 41 | `calendar.tsx` URL state (Task 7 Step 2) |
| 5 | History reuses the D2 read as-is, in-progress polling | spec §4 line 42 + §4 last bullet | `history.tsx` (Task 7 Step 3) |
| 6 | Architecture-guard extension is RED-proven | spec §6 D4 (line 68) | Task 4 + `.dump/mutation-retry-*.md` |
| 7 | No new dependencies | D4 brief | (all tasks) |
| 8 | Retry button on `Failed` ONLY; `Paused` rows get the tooltip | spec §3.5 (line 34, no source state) + §4 line 42 (Failed only) + §3.6 line 35 (auto reconnect) | `RetryPublicationService` (API permissive) + `history.tsx` (button on Failed only) |
| 9 | Pruning the dead placeholders | D4 brief (fold #178) | Task 7 + i18n cleanup |
| 10 | Time-zone round-trip pinned for DST | spec §3.4 (zone round-trip) | `formatInZone.test.ts` (Task 7 Step 4) |

## Anything in this brief that turned out to be wrong or missing

- The brief said "retry MUST go through the transition service (the Roslyn guard forbids direct Status writes)" — confirmed and concretised: the existing `RescheduleToNowAsync` (D1 PR #1433, `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs:160-179`) is the right method, NOT a new one. D3's planned `RescheduleToFutureAsync` is a different verb (reschedule to a future instant with a new zone); D4's retry is "to now with the original zone" and reuses the D1 method.
- The brief said "wire the queue, calendar (folds #178) and history pages to REAL Publication data" — concretised: the queue and calendar share one read endpoint (D4's `from` / `to` extension of D2's `GET /publishing/publications`); the history page uses the D2 endpoint as-is with a different status filter. No parallel reads.
- The brief said "status pills" — concretised: a new `StatusPill` primitive at `apps/front/src/components/ui/status-pill.tsx` is the SINGLE place the five tones are decided (mirrors the local primitive pattern of `apps/front/src/components/ui/badge.tsx`). No Tailwind tokens invented; the design-token guard pins the primitives.
- The brief said "retry failed publications" — concretised: retry is `Failed → Scheduled at now`. The Retry button is on `Failed` rows ONLY (spec §4 line 42: "History: Published (link to Bluesky) and Failed (cause + Retry)"). The API also permits `Paused → Scheduled` (the transition service's `AllowedSources` map at `origin/lane/wt-645b:81-85` of `PublicationStatusTransitionService.cs` allows it, and Task 1 case (b) pins it for future product work) but the front button is NOT exposed on `Paused` rows in D4 — those rows render the cause + a "Reconnect the account" tooltip (spec §3.6's reconnect path is the AUTOMATIC Epic C resume; it is not a manual button). If a future product decision adds a manual resume button, it lands as a new feature with its own spec, not a silent extension of D4.
- The brief said "every failure cause shown in plain words from the API's problem details" — concretised: the `LastError` column is sanitised at write time by D1's `MarkFailedAsync` / `MarkPausedAsync`; the API returns it as a problem-details extension field via the existing `LastError` column. The front never re-translates; it shows the API's text verbatim. The retry cause for `NotRetriable` is a human sentence per row (Task 1 case c/d/e).
- Missing in the brief but added in the plan: Task 4 (architecture guard extensions) and Task 0 (StatusPill primitive check). Both are non-optional.
- Round-1 inventions avoided: the queue does NOT use a brand-new DTO — it reuses D2's `PublicationListItem` (Task 3.5 extends it with `ScheduledAtUtc` + `ScheduledTimeZone`, the two fields the D2 list DTO is missing) so the history and the queue share the same row mapper. The retry endpoint does NOT invent a new transition method — it uses the existing `RescheduleToNowAsync`. The Calendar does NOT use a new endpoint — it reuses the queue's date-windowed list with month-clamped `from` / `to`.
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
