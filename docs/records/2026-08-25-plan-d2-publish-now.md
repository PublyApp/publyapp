# D2: Publish now + "Publish on" composer block + wired History — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Epic D step 6 (#645, part of #631) — the milestone "a customer really publishes on Bluesky". The publish-now endpoint (`POST /posts/{postId}/publish-now`) creates one `Publication` per chosen account with `ScheduledAtUtc = now`, enqueues one `publishing.publish-publication.v1` job per publication through `IJobEnqueuer`, and answers immediately (spec §1 decision 1: always through the job queue, one code path with D3 scheduling). The composer gains the "Publish on" block: checkboxes of the accounts visible in the project per the Epic C rule, shown only with `tenant.socialaccounts.publish`. The History page is wired to real `Published` (link to Bluesky) and `Failed` (cause in one sentence, Retry button = D4 stub noted) publications, and refreshes ("In progress…") by invalidating its query every few seconds while any publication is `InProgress`. Plus: permissions, rate limit, Kiota regen, integration specs (each failure kind → status + plain cause, isolation, permissions), architecture tests, the D2 adversarial mutation (remove the deterministic key → the "no duplicate after timeout" spec goes red), and ONE tagged e2e: "publish now (faked Bluesky) → appears in history with a link".

**Architecture:** Builds directly on D1's `Modules/Publishing` slice (`origin/lane/wt-644`: `Publication` entity, single `PublicationStatusTransitionService` writer, `IPublishProvider`, `BlueskyPublishProvider`, `PublishPublicationJobHandler`) and C2's `Modules/SocialAccounts` seam (`origin/lane/wt-641`: `ISocialSessionProvider`, `VisibleIn`, `socialaccounts.*` permissions). The publish-now ROUTE hangs off the existing posts resource (`Routes.Posts.ForTenant`, matching `PostEndpointsForTenant` on develop) but ALL publishing logic lives in the Publishing slice: a new `PublishNowService` owns creation of publications + enqueue; handlers orchestrate only (no DbContext in handlers). A new publications read endpoint (`GET /publications`, keyset newest-first) serves History. The frontend stays inside the landed B2 posts surfaces (`apps/front/src/routes/authed/tenant/posts/`). Bluesky is faked in EVERY spec — never the real network. Jobs go through `IJobEnqueuer` only (Epic A §5.3); external idempotency stays the deterministic Bluesky record key (Epic A §4.1).

**Tech Stack:** .NET 10 / EF Core 10 + Npgsql, xUnit + FluentAssertions, Testcontainers ephemeral Postgres via `ApiFixture`, Kiota-generated TS client (`packages/client-ts`, regenerated via `just generate-client`), TanStack Start + TanStack Query + Base UI wrappers (`apps/front`), Vitest component specs, Playwright e2e, `just` recipes (heavy commands under `~/ai-orchestration-playbook/tools/heavy.sh`).

## Global constraints (blocking)

- Analyzers PUBLY0001–0008 are errors: `is null`/`is not null` pattern matching; never `?? throw`; never the null-forgiving operator `!`; never `ToLower()` dispatch; wire DTOs carry no `Dto` suffix; handlers cache repeated body-getter results; services do not depend on other services (the publish-now service takes `AppDbContext` + `IJobEnqueuer` infrastructure only); staff/tenant-scoped service methods take their `tenantId`. Max 100 char lines; braces always on control flow.
- No disable/suppression comments, no `[Fact(Skip)]`, no ruleset/guard loosening, no sub-agents/workers (`opencode`/`claude`/`codex` blocked, exit 86).
- Migrations are **expand-only** (new tables/indexes only) applied by the one-shot `migrate` service; locally `just db-add <Name> && just db-migrate`; `just ci-migration-expand-contract` stays green.
- `LastError` ≤ 2 KB sanitised via `PublyApp.Api.Modules.SocialAccounts.Lib.LastErrorSanitiser.Sanitize` (reuse F20 — exists on develop). Never log secrets or session tokens. Every failure surfaced carries a human-readable cause and, where one exists, the next action (owner product rule 2026-08-22).
- Errors are RFC 7807 via `TypedProblems.*`; `422` validation problems carry stable `errors` keys; malformed GUID in route → 400 via `Guid.TryParse`; entity not found → 404. Success shapes: action-only success → `200 Ok<ApiResponse>` with message + translationKey; list success → 200 with items + next cursor.
- URL/query parameter names snake_case (`account_ids` body field may be camelCase JSON; query params `cursor`, `size`, `sort_id`, `sort_order`); wire option values snake_case (`published`, `failed`, `in_progress` via `PublicationWire.FormatStatus` — `origin/lane/wt-644`).
- Heavy commands run under `~/ai-orchestration-playbook/tools/heavy.sh` (serialised host-wide); focused test filters first, module suites once near the end, never > 20 min under the lock.
- One task = one commit, push after EVERY commit (provider deaths are frequent tonight). Never touch develop. Secrets never in output. The plan file itself lives flat under `docs/records/` (never recreate `docs/superpowers/` — pruned by #1357; docs-archive CI rejects it).
- **Symbol honesty:** every symbol cited below exists on `origin/develop` (a.k.a. current `lane/wt-645` base `a9653b1b0`), on `origin/lane/wt-644` (D1), or on `origin/lane/wt-641` (C2) — the branch is named next to each citation. Nothing may be invented; anything D2 needs that exists on neither develops in-task before use.

## Prerequisites — in-flight work this plan builds on (READ from remote branches, NEVER merge)

### From D1 — `origin/lane/wt-644` (rebase target before implementation; every symbol below verified on that branch)

- `apps/api/Modules/Publishing/Entities/Publication.cs` — `[Table("publications")]`, `BaseAttributes` + `ITenantEntity`; columns `tenant_id`, `post_id`, `social_account_id`, `status`, `scheduled_at_utc`, `scheduled_time_zone`, `external_record_id`, `external_url`, `last_error`, `attempts`, `idempotency_key`; navigations `Post`, `SocialAccount`, `Tenant`; plus `PublicationWire.FormatStatus(PublicationStatus)` returning `"scheduled" | "in_progress" | "published" | "failed" | "paused"`.
- `apps/api/Modules/Publishing/Entities/PublicationStatus.cs` — enum `Scheduled=10, InProgress=20, Published=30, Failed=40, Paused=50`.
- `apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs` — `static string For(Guid publicationId)` (SHA-256 truncated to 128 bits, lowercase hex). Deterministic; doubles as the Bluesky record key suffix.
- `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` — `IPublicationStatusTransitionService` with `Task<bool> MarkInProgressAsync(Guid publicationId, Guid tenantId, CancellationToken)`, `MarkPublishedAsync(id, tenantId, string externalRecordId, string externalUrl, CancellationToken)`, `MarkFailedAsync(id, tenantId, string cause, CancellationToken)`, `MarkPausedAsync(id, tenantId, string cause, CancellationToken)`, `RescheduleToNowAsync(id, tenantId, CancellationToken)`; `[Service(ServiceLifetime.Scoped)]`; tenant-scoped loads; illegal transitions throw.
- `apps/api/Modules/Publishing/Jobs/PublishingJobs.cs` — `PublishPublicationPayload { required Guid PublicationId; required string IdempotencyKey; }`; `PublishingJobs.PublishPublicationV1` : `JobDefinition<PublishPublicationPayload>` with `JobType = "publishing.publish-publication.v1"` (const `PublishPublicationV1JobType`), Priority 0, MaxAttempts 3, Validate rejecting key/id mismatch.
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` — worker run path: load → terminal-check → `MarkInProgressAsync` → `OpenSessionAsync` → provider → classified outcomes; `OnTerminalFailureAsync` flags the account on DLQ.
- `apps/api/Modules/Publishing/Providers/{IPublishProvider,PublishRequest,PublishResult}.cs` — seam used by the job (D2 touches none of these except in specs/mutation).
- `apps/api/Migrations/20260825143511_AddPublications.cs` — expand-only publications table + indexes (`ix_publications_status_scheduled_at`, `ix_publications_tenant_scheduled_at_id`, unique partial `ux_publications_post_account`).
- `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` — single-status-writer ratchet (D2 must not trip it; D2 writes status ONLY through the transition service).
- `apps/api/Modules/Publishing/Lib/PostStatusDerivation.cs` — `DerivedPostStatus Derive(IReadOnlyCollection<Publication>)` (unused by endpoints yet; NOT wired by D2 — kept for D3, stated in the PR body).

### From C2 — `origin/lane/wt-641`

- `apps/api/Modules/SocialAccounts/Services/ISocialSessionProvider.cs` — `OpenSessionAsync(Guid socialAccountId, CancellationToken)` → `SocialSessionResult { Opened(SocialSession), AccountFailure(string), Transient(string) }` (consumed by D1's job handler, not by D2 code directly).
- `apps/api/Modules/SocialAccounts/Lib/VisibleIn.cs` — `static bool Visible(SocialAccount account, Guid projectId)`: Active AND (no project links OR linked to the project). THE account-visibility rule for the composer block.
- `apps/api/Modules/SocialAccounts/Permissions/SocialAccountPermissionsForTenant.cs` — verbs `socialaccounts.view` / `socialaccounts.manage` / `socialaccounts.publish` (key prefix `socialaccounts`).
- `apps/api/Lib/RateLimiting/ApiRateLimitPolicies.cs` — added `ApiRateLimitPolicies.SocialConnect` (session-fingerprint partition). D2 reuses the existing `AuthenticatedDefault` / `HeavySearchList` policies (both exist on develop) for its new routes.

### Already landed on develop (`origin/develop` @ `a9653b1b0`)

- `apps/api/Modules/Posts/` — `Routes.Posts.cs` (`Routes.Posts.ForTenant.Root = "/posts"`, `GetById = "/{postId}"`), `Endpoints/PostEndpointsForTenant.cs` (group `.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)`, `.WithTenantPermission([...])` pattern), `Handlers/Tenant/*` (handler shape: static `Handle`, body DTO + validator siblings, `Results<Created<T>, AppValidationProblemHttpResult>`), `Permissions/PostPermissionsForTenant.cs` (`posts.view/create/edit/publish/schedule/delete` — `PUBLISH` already seeded), `Services/PostService.cs`, `Validation/PostValidationRules.cs`.
- `apps/api/Modules/SocialAccounts/Entities/*` on develop — `SocialAccount` (+`Projects` links), `SocialAccountProject`, `SocialAccountStatus`, plus `Lib/{LastErrorSanitiser,VisibleIn}.cs` and `Services/SocialAccountService.cs` (entities/service landed; the session SEAM and permission class arrive with C2's branch — named above).
- Jobs infrastructure `apps/api/Infrastructure/Jobs/` (Epic A): `IJobEnqueuer`, `JobDefinition<T>`, `JobContext`, `JobOutcome`, `AddJobHandler` — as consumed verbatim by D1's `PublishingJobs.cs`/`PublishPublicationJobHandler.cs` above.
- Front: `apps/front/src/routes/authed/tenant/posts/` — `drafts.tsx` (`data-testid="tenant-posts-drafts-page"`, new-post trigger `tenant-posts-new-post`), `_create-post-drawer.tsx` (`tenant-posts-create-drawer`, `tenant-posts-create-body`, `tenant-posts-create-save`), `$postId/edit.tsx` (`tenant-post-edit-page`, `tenant-post-edit-body`, `tenant-post-edit-save`, `tenant-post-edit-move-to-bin`), `history.tsx` (placeholder page `tenant-posts-history-page` / `tenant-posts-history-empty` with `ReadOnlyBadge` — D2 replaces its content), `queue.tsx` / `calendar.tsx` (placeholders, untouched by D2), `lib/query/tenant-posts.ts` (`savePost`, `invalidateTenantPosts`).
- Testing: `apps/api/Lib/Testing/Fixtures/` `ApiFixture` (Testcontainers Postgres), co-located `*.Spec.cs` conventions, `docs/guides/api-integration-tests.md`; e2e harness + tag vocabulary per `docs/guides/e2e-tags.md` (#1168).

---
## Reconciliation decisions (each restated in the PR body)

1. **Stored `Post.Status` stays untouched in D2.** D1 shipped `PostStatusDerivation` (`origin/lane/wt-644`, `Lib/PostStatusDerivation.cs`) precisely so read paths could stop trusting the stored column; switching the B2 drafts/list queries over is a product-visible behavior change that belongs to D3 with the queue/calendar rework. D2 writes publications only; drafts pages keep working as today.
2. **Route placement.** Publish-now hangs off the existing posts resource (`Routes.Posts.ForTenant`, `origin/develop`) as `POST /posts/{postId}/publish-now`; the two NEW read resources (history list, composer publish targets) live in the Publishing slice under a new `Routes.Publishing.ForTenant` group rooted at `/publishing`. Handlers orchestrate; ALL logic sits in Publishing services.
3. **Republish to a live (post, account) pair** (previous `Scheduled`/`InProgress`/`Published` row still alive) is refused with `422` `TypedProblems.ValidationProblem` naming the offending account ids under the stable key `accountIds` — no new problem-type invented; the unique partial index `ux_publications_post_account` (`origin/lane/wt-644`) remains the backstop.
4. **E2E Bluesky fake:** an env-gated `FakeBlueskyPublishProvider` (registered only when `PUBLISHING_FAKE_PROVIDER=1` on a non-Production host, checked via `apps/api/Lib/AppEnvironment.cs` patterns) answers every publish with success and a deterministic `https://bsky.app/profile/{handle}/post/{rkey}` URL. Flagged as an open question for the owner in the PR body.
5. **Retry button** renders as a disabled D4 stub with an explanatory title (honest coming-later, B2 convention — see `ReadOnlyBadge` usage in `history.tsx`, `origin/develop`).

## File structure

**Create — API (`apps/api`)**
- `Modules/Publishing/Routes.Publishing.cs` — `Routes.Publishing.ForTenant`: `Root = "/publishing"`, `FindPublications = "/publications"`, `GetPublishTargets = "/publish-targets"` (mirrors `Routes.Posts.cs` style, `origin/develop`).
- `Modules/Publishing/Endpoints/PublishingEndpointsForTenant.cs` — maps the three routes with rate-limit policies + `.WithTenantPermission(...)`.
- `Modules/Publishing/Services/PublishNowService.cs` (+ interface in-file, D1 style) — publications creation + `IJobEnqueuer` enqueue in one transaction.
- `Modules/Publishing/Services/PublicationListService.cs` (+ interface in-file) — keyset newest-first history query.
- `Modules/Publishing/Services/PublishTargetService.cs` (+ interface in-file) — visible-in-project Active accounts via `SocialAccounts.Lib.VisibleIn.Visible` (`origin/develop`).
- `Modules/Publishing/Handlers/Tenant/PublishNowForTenant.cs`, `FindPublicationsForTenant.cs`, `GetPublishTargetsForTenant.cs`.
- `Modules/Publishing/Providers/Fakes/FakeBlueskyPublishProvider.cs` — env-gated (reconciliation 4).
- Specs co-located: `*.Spec.cs` beside each of the above (Testcontainers `ApiFixture` per `docs/guides/api-integration-tests.md`).

**Modify — API**
- Endpoint registration site: the production call site of `MapPostEndpointsForTenant(` (exactly one; locate with `grep -rn "MapPostEndpointsForTenant(" apps/api --include=*.cs | grep -v Endpoints/`) gains `MapPublishingEndpointsForTenant(routes);` on the adjacent line.
- `Modules/AuditLogs/Entities/AuditActions` (wherever `PostCreated`/`PostDeleted` constants live — same file): add `PublishNowStarted`.
- `packages/shared-ts/src/lib/i18n/json/response-message.en.json`: add `"publish-now-success"`; rebuild regenerates `ResponseKeys.g.cs` (header: "Generated from response-message.en.json").
- `Lib/Architecture/PublicationArchitecture.Spec.cs` (`origin/lane/wt-644`): extend with endpoint-permission/rate-limit and no-DbContext-in-Publishing-handlers assertions.

**Create — front (`apps/front`)**
- `src/lib/query/tenant-publications.ts` + `.test.ts` — history query + `publishNow` mutation + `invalidateTenantPublications` (modeled on `src/lib/query/tenant-posts.ts`, `origin/develop`).
- `src/routes/authed/tenant/posts/_publish-on-block.tsx` + `_publish-on-block.test.tsx` — the "Publish on" checkbox block.
- Rewrite `src/routes/authed/tenant/posts/history.tsx` (placeholder today, `origin/develop`) + its `history.test.tsx`.
- Edit `src/routes/authed/tenant/posts/_create-post-drawer.tsx` and `$postId/edit.tsx`: embed the block + **Publish now** button.
- `apps/front/e2e/tenant-posts-publish-now.spec.ts`.

---

## Task 1: `PublishNowService` — create publications + enqueue through `IJobEnqueuer`

**Files:** `Services/PublishNowService.cs` + `Services/PublishNowService.Spec.cs`.

**Interfaces block (Task 2 depends on exactly these):**

```csharp
public interface IPublishNowService {
	Task<PublishNowResult> PublishNowAsync(PublishNowArgs args, CancellationToken cancellationToken);
}
public sealed record PublishNowArgs(
	Guid TenantId, Guid PostId, Guid ActorUserId,
	IReadOnlyList<Guid> SocialAccountIds
);
public abstract record PublishNowResult {
	public sealed record Created(IReadOnlyList<Guid> PublicationIds) : PublishNowResult;
	// Accounts already holding a live publication for this post (422 upstream).
	public sealed record LivePublicationsExist(IReadOnlyList<Guid> AccountIds) : PublishNowResult;
	public sealed record PostNotFound : PublishNowResult;
	public sealed record AccountsNotFound(IReadOnlyList<Guid> AccountIds) : PublishNowResult;
}
```

- [ ] **Step 1 (RED):** `PublishNowService.Spec` (IClassFixture<ApiFixture>, direct DbContext seeding like D1's `PublicationStatusTransitionService.Spec`, `origin/lane/wt-644`). Cases: (a) two account ids → two `Publication` rows `Scheduled`, `ScheduledAtUtc` within 5 s of `DateTime.UtcNow`, zone = server IANA local zone string, `IdempotencyKey == PublicationIdempotencyKey.For(id)` per row (wt-644 helper); (b) exactly one `job_queue` row per publication, `job_type = PublishingJobs.PublishPublicationV1JobType`, payload key matches, `EnqueueOptions.IdempotencyKey` equals the derived key (query `job_queue` directly); (c) repeat call with one overlapping account → `LivePublicationsExist` carrying that account, the OTHER account still created; (d) foreign-tenant post id → `PostNotFound` and zero rows written anywhere; (e) mixed valid/foreign account ids → `AccountsNotFound` listing the foreign ones, zero rows written; (f) rolled-back transaction removes enqueued jobs (make the second `EnqueueAsync` throw via a duplicate-key payload trick or a failing fake — assert no `publications` row survives).
- [ ] **Step 2 (GREEN):** Implementation: `[Service(ServiceLifetime.Scoped)]` (D1 pattern, `PublyApp.Api.Lib.DI`). Dependencies: `AppDbContext` + `IJobEnqueuer` ONLY (infrastructure, not another domain service). Flow: load post tenant-scoped (`TenantId == args.TenantId && !IsDeleted`); load candidate accounts tenant-scoped; filter through `VisibleIn.Visible(account, post.ProjectId ?? throw-free fallback)` — for a projectless post every Active tenant account qualifies (Epic C rule, `origin/develop` `Lib/VisibleIn.cs`); partition out ids with a live publication (`Status in {Scheduled,InProgress,Paused} || Status == Published` all count — the partial unique index filters only deleted) via a single `WHERE post_id && social_account_id ANY` EF query; if none remain → `LivePublicationsExist`; else per surviving account: `new Publication { TenantId, PostId, SocialAccountId, Status = Scheduled, ScheduledAtUtc = DateTime.UtcNow, ScheduledTimeZone = TimeZoneInfo.Local.Id, IdempotencyKey = PublicationIdempotencyKey.For(Guid.CreateVersion7()) }` — NOTE: the row id is generated BEFORE insert (`Guid.CreateVersion7()`, pattern proven in `apps/api/Infrastructure/Jobs/JobQueueProcessor.cs` line 910, `origin/develop`) so the key derives from the true id; assign it to `publication.Id` too. Enqueue INSIDE the save transaction: `_db.Add(...)` then per row `await _jobEnqueuer.EnqueueAsync(PublishingJobs.PublishPublicationV1, new PublishPublicationPayload { PublicationId = id, IdempotencyKey = key }, new EnqueueOptions { IdempotencyKey = key }, ct)` then one `SaveChangesAsync` — `IJobEnqueuer` joins the caller's transaction by contract (`Infrastructure/Jobs/IJobEnqueuer.cs` doc comment, `origin/develop`).
- [ ] **Step 3:** Run `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~PublishNowServiceSpec"` green. Commit `feat(publishing): PublishNowService — scheduled publications + trusted enqueue in one transaction`; push.

## Task 2: `POST /posts/{postId}/publish-now` endpoint

**Files:** `Handlers/Tenant/PublishNowForTenant.cs`; `Routes.Posts.cs` + `Endpoints/PostEndpointsForTenant.cs` (both exist, `origin/develop`; the endpoints file lives under `Endpoints/` — `apps/api/Modules/Posts/Endpoints/PostEndpointsForTenant.cs`); `AuditActions` member; `response-message.en.json` key.

**Interfaces block (front Task 6 relies on the wire shape):**

```
201-less action contract: 200 Ok<ApiResponse>{ message, key: "publish-now-success" }
Errors: 400 malformed postId (ResponseKeys.MalformedId) · 404 post not found
(ResponseKeys.NotFound) · 422 ValidationProblem errors.accountIds[] for
LivePublicationsExist / AccountsNotFound · 403 via PermissionFilter middleware.
```

- [ ] **Step 1 (RED):** `PublishNowForTenant.Spec` (ApiFixture + session-token HTTP calls per the integration-tests guide): happy path asserts 200 + `key=="publish-now-success"` + 2 rows + 2 job_queue rows (service already proven); wrong tenant's postId → 404 and NOTHING created (isolation); unknown account id → 422 with `errors["accountIds"]`; missing `tenant.posts.publish` → 403; missing `socialaccounts.publish` → 403; malformed guid → 400. Body DTO: `JsonElement AccountIds` validated `.MustBeRequiredGuidArray(fieldName: "accountIds", itemName: "accountId", maxCount: 20)` (`Lib/Validation/JsonElementRules.cs` line 621, `origin/develop`), read via the `BulkRevokeStaffInvitationsBody.GetInvitationIds()` enumeration pattern (`origin/develop`, Invitations handler).
- [ ] **Step 2 (GREEN):** Handler clones `CreatePostForTenant.Handle` scaffolding (`origin/develop`): parse tenantId from `authContext.TenantId`, `Guid.TryParse(postId)` → 400, resolve `IPublishNowService`, map result kinds: `Created` → audit `AuditActions.PublishNowStarted` (Details: TenantId, PostId, accountIds, publicationIds) + `TypedResults.Ok(ApiResponse.Create("Publishing started", ResponseKeys.PublishNowSuccess))`; `PostNotFound` → `TypedProblems.NotFound("Post not found", ResponseKeys.NotFound)`; `LivePublicationsExist`/`AccountsNotFound` → `TypedProblems.ValidationProblem(...)` with stable `accountIds` key. Route: add `public const string PublishNow = "/{postId}/publish-now";` to `Routes.Posts.ForTenant`; map in `Endpoints/PostEndpointsForTenant` on the existing group (inherits `AuthenticatedDefault` rate limit, matching sibling mutations) with `.WithTenantPermission([AppPermissions.Tenant.Posts.PUBLISH, AppPermissions.Tenant.SocialAccounts.PUBLISH])` — the SocialAccounts property arrives with the C2/D1 rebase (diff verified on `origin/lane/wt-641` commit fb4f03c7b); until rebased this line cannot compile, which Task 2 assumes (implementation starts post-rebase). Add `"publish-now-success": "Publishing started"` to `response-message.en.json`; build regenerates `ResponseKeys.g.cs`.
- [ ] **Step 3:** Filter green; commit `feat(publishing): publish-now endpoint — immediate 202-equivalent through the job queue`; push.

## Task 3: History read — `GET /publishing/publications` (keyset, newest first)

**Files:** `Routes.Publishing.cs`, `Services/PublicationListService.cs` + spec, `Handlers/Tenant/FindPublicationsForTenant.cs` + spec, `Endpoints/PublishingEndpointsForTenant.cs`.

**Interfaces block (front Task 6/8 rely on):**

```csharp
// AGENTS.md OpenAPI-Kiota rule ([AsParameters] query DTOs): multi-value
// filters are a CSV `string?` + parser method — never JsonElement?, never
// List<T>?. Precedent read verbatim from origin/develop:
// Modules/AuditLogs/Handlers/Staff/FindAuditLogs.cs (string? Actions +
// AuditLogActionsCsv.Parse/GetValidationError).
public sealed class FindPublicationsQuery : CursorPaginatedQuery {
	[FromQuery(Name = "status")] public string? Status { get; set; }   // csv: published,in_progress,paused
	[FromQuery(Name = "size")]  public int? Size { get; set; }

	public IReadOnlyList<PublicationStatus>? GetStatusList() {
		return PublicationStatusCsv.Parse(Status);
	}
} // validator inherits CursorPaginatedQueryValidator<FindPublicationsQuery>
public sealed record PublicationListItem {
	public required Guid Id { get; init; }          // publication id
	public required Guid PostId { get; init; }
	public required string PostExcerpt { get; init; }   // first 280 chars of post body
	public required string Status { get; init; }        // PublicationWire.FormatStatus
	public required Guid SocialAccountId { get; init; }
	public required string AccountLabel { get; init; }  // handle/display name
	public string? ExternalUrl { get; init; }
	public string? LastError { get; init; }
	public required DateTime UpdatedAt { get; init; }   // terminal-state instant proxy
	public required string NextCursor { get; init; }
}
```

- [ ] **Step 1 (RED):** Spec: seeds published+failed+scheduled mix across two tenants; asserts newest-first `(UpdatedAt desc, Id desc)` keyset via `query.GetCursor()` (pattern: `FindPostsForTenant.Handle`, `origin/develop`); tenant isolation (foreign rows invisible); `status=published,failed` (ONE comma-separated value) parses through `PublicationStatusCsv.Parse` — tokens are the snake_case wire values of `PublicationWire.FormatStatus` (`origin/lane/wt-644`, `Publication.cs`), so parsing maps `"in_progress" → PublicationStatus.InProgress` via an explicit switch with `StringComparer.OrdinalIgnoreCase` (PUBLY0003 forbids ToLower dispatch); unknown token (`?status=bogus`) → 422 with stable `status` errors key; `LastError` surfaced verbatim (already sanitised at write time); excerpt capped at 280 chars.
- [ ] **Step 2 (GREEN):** Service: single EF query joining `Publication`→`Post`→`SocialAccount`, keyset predicate `(p.UpdatedAt < c) || (p.UpdatedAt == c && p.Id < cursorId)`, `Take(size + 1)`; handler maps to items, `NextCursor` from the last row. Validator: inherit `CursorPaginatedQueryValidator<FindPublicationsQuery>` and add `RuleFor(x => x.Status).Custom(...)` reusing a `PublicationStatusCsv.GetValidationError(raw)` twin of `AuditLogActionsCsv.GetValidationError` (failure keyed under the wire name `status`) — byte-for-byte shape of `FindAuditLogsQueryValidator`, `origin/develop`. Endpoint on the `/publishing` group: `.RequireRateLimiting(ApiRateLimitPolicies.HeavySearchList)` + `.WithTenantPermission([AppPermissions.Tenant.Posts.VIEW])` (mirror of FindPosts, `origin/develop`). Register `MapPublishingEndpointsForTenant` at the discovered call site (File structure note).
- [ ] **Step 3:** Green; commit `feat(publishing): keyset publications history endpoint`; push.

## Task 4: Composer targets — `GET /publishing/publish-targets`

**Files:** `Services/PublishTargetService.cs` + spec; `Handlers/Tenant/GetPublishTargetsForTenant.cs` + spec; endpoint mapping (same file as Task 3).

**Interfaces block:** `GET /publishing/publish-targets?project_id={guid?}` → `{ items: [{ id, label, provider }] }` where `label` = account display name/handle and `provider = "bluesky"` (`SocialProvider` values, `origin/develop` entity).

- [ ] **Step 1 (RED):** Spec: Active account linked to project A + Active account linked nowhere + NeedsReconnect account + Revoked account + foreign-tenant account; query with `project_id=A` → exactly the first two, in stable `created_at, id` order; without `project_id` → all Active tenant accounts; permission: caller WITHOUT `socialaccounts.publish` → 403 even WITH `posts.view` (block-gating verb per brief).
- [ ] **Step 2 (GREEN):** Service loads tenant-scoped accounts `.Include(a => a.Projects)` and applies `VisibleIn.Visible(account, projectId)` per id (THE single-source rule — no re-implementation; `origin/develop` `Modules/SocialAccounts/Lib/VisibleIn.cs`). Query param `project_id` snake_case per repo rule; nullable-guid parse mirrors `CreatePostBody.GetProjectId()` (`GetValueAsGuidOrNull`, `origin/develop`). Endpoint: `AuthenticatedDefault` + `.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.PUBLISH])`.
- [ ] **Step 3:** Green; commit `feat(publishing): visible publish-targets endpoint for the composer block`; push.

## Task 5: Architecture-guard extension + RED proof

**Files:** `Lib/Architecture/PublicationArchitecture.Spec.cs` (extends the wt-644 file after rebase).

- [ ] **Step 1 (GREEN first):** Add facts: (a) every `Map*` inside `PublishingEndpointsForTenant` carries both a rate-limit policy and `WithTenantPermission` metadata — Roslyn-free source scan asserting each `group.Map(Get|Post)` block contains `.RequireRateLimiting(` and `.WithTenantPermission(` (technique of the existing single-writer scan, `origin/lane/wt-644`); (b) no file under `Modules/Publishing/Handlers/**` mentions `AppDbContext` (handlers orchestrate; services own queries); (c) `PublishNowService` still depends only on `AppDbContext`+`IJobEnqueuer` (constructor-parameter scan).
- [ ] **Step 2 (RED proof):** Plant `Modules/Publishing/Endpoints/_RogueUnpermissionedEndpoint.cs` (temp, uncommitted) mapping a route without permission metadata → guard fact (a) MUST fail naming the file. Transcript to `.dump/mutation-unpermissioned-endpoint.md`. Delete, rerun green.
- [ ] **Step 3:** Commit `test(api): publishing architecture ratchet — permissioned, rate-limited, DbContext-free handlers`; push.

## Task 6: Kiota regen + front data layer

**Files:** generated `packages/client-ts/**`; new `apps/front/src/lib/query/tenant-publications.ts` + test.

- [ ] **Step 1:** `just build-api && just generate-client && pnpm --filter front typecheck` (AGENTS mandate after contract change). Verify `packages/client-ts` gained `publishNow`, `findPublications`, `getPublishTargets` operations and `git diff --stat packages/client-ts` shows ONLY generated churn.
- [ ] **Step 2 (RED):** `tenant-publications.test.ts` mirrors `staff-audit-logs.ts`'s parameter builder pattern (`origin/develop`): typed query variables `{ statuses?: Array<'published'|'in_progress'|'paused'>; cursor?: string; size?: number }`, `buildFindTenantPublicationsQueryParameters` joining them into the ONE primitive CSV param the Kiota client types as `status?: string` (exactly how `buildFindStaffAuditLogsQueryParameters` joins `actions` — the generated builder carries a primitive because the DTO keeps it `string?`, see `packages/client-ts/src/staff/auditLogs/index.ts` `AuditLogsRequestBuilderGetQueryParameters.actions?: string`), key factories `TENANT_PUBLICATIONS_QUERY_KEY = ['tenant-publications']`, `publishNowMutation` calling the Kiota op via the same client acquisition `tenant-posts.ts` uses (`getClientManager`, `origin/develop`), `invalidateTenantPublications(qc)`. Tests fail before implementation exists.
- [ ] **Step 3 (GREEN):** Implement; tests green; commit `feat(front): tenant-publications query layer over regenerated client`; push.

## Task 7: Composer "Publish on" block + Publish now action

**Files:** `_publish-on-block.tsx` + `_publish-on-block.test.tsx`; edits to `_create-post-drawer.tsx`, `$postId/edit.tsx`; posts i18n resources (locate the file carrying `history-coming-later-title` with `grep -rl history-coming-later-title apps/front/src` — add keys beside those).

- [ ] **Component contract (Tasks 8/e2e rely on these testids):** `tenant-posts-publish-on-block`, per-account checkbox `tenant-posts-publish-target-{id}`, `tenant-posts-publish-now` submit button, `tenant-posts-publish-in-progress` pill.
- [ ] **Step 1 (RED):** Tests: renders nothing (returns null) when `useTenantAccountProfile`-shaped permission data lacks `socialaccounts.publish` (discover the exact permissions hook the tenant workspace already loads: `grep -n "permissions" apps/front/src/lib/query/auth.ts`, `origin/develop` — `GetScopeAuthDataTenant.Permissions: List<string>` is the wire source, `apps/api/Modules/Auth/Handlers/GetScopeAuthData.cs`); renders one checked box per visible target otherwise; unchecked-all disables Publish now; clicking Publish now fires `publishNow` mutation with checked ids then navigates to `/tenant/posts/history`; mutation failure surfaces through `getFailureMessage(toApiFailure(error))` (repo rule, no manual translation).
- [ ] **Step 2 (GREEN):** Implement with `Field.Checkbox`-style Base UI wrappers + `Button` (`components/ui/*`, Tailwind via `cn()`); drawer/edit page embed `<PublishOnBlock projectId={form projectId} />` above the action bar; arrow-function components, no IIFE, no dayjs direct import.
- [ ] **Step 3:** `pnpm --filter front exec vitest run src/routes/authed/tenant/posts/_publish-on-block.test.tsx` green; commit `feat(front): Publish on block + publish-now action in composer`; push.

## Task 8: History page wired + "In progress…" polling

**Files:** rewrite `history.tsx`; update `history.test.tsx`.

- [ ] **Step 1 (RED):** Tests (pattern: C2's `integrations.test.tsx` mocking style, `origin/lane/wt-641`): published row shows link (`data-testid="tenant-posts-history-link"`, href = `ExternalUrl`) opening in new tab; failed row shows one-sentence cause `tenant-posts-history-cause` + disabled Retry stub (`title` explains D4); in-progress row shows `tenant-posts-publish-in-progress`; while any row is `in_progress`, query invalidates every 5 s (fake timers assert ≥2 refetches) and stops when none remain; fatal error → `LogoutRedirect` only on 401 (repo logout semantics).
- [ ] **Step 2 (GREEN):** Implement with the existing shells (`WorkspacePageHeader`, `Card`, table primitives as drafts.tsx uses); drop `ReadOnlyBadge`; keep `tenant-posts-history-page` testid (e2e anchor from B2).
- [ ] **Step 3:** Vitest green; `pnpm --filter front typecheck`; `just react-doctor`; commit `feat(front): history page wired to real publications with live refresh`; push.

## Task 9: D2 adversarial mutation — remove the deterministic key

- [ ] **Step 1:** `md5sum apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs` (pre-mutation, recorded in transcript). Mutate `For` to `Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant()[..16];` (randomness replaces derivation).
- [ ] **Step 2:** Run `dotnet test ... --filter "FullyQualifiedName~PublishPublicationJobHandlerSpec.ItShouldTreatAlreadyExistsAsSuccessWithTheExistingRecordAndNoDuplicate"` (exact method verified on `origin/lane/wt-644` line 189) — MUST go red: the second attempt creates a duplicate instead of colliding. Full transcript → `.dump/mutation-deterministic-key-d2.md`.
- [ ] **Step 3:** `git checkout -- apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs`; md5 matches; rerun green. Tree unchanged; no commit; transcript updated with restore proof.

## Task 10: Gates + tagged e2e + PR

- [ ] **E2E:** `apps/front/e2e/tenant-posts-publish-now.spec.ts`, `test.describe('tenant posts publish now', { tag: ['@tenant-workspace', '@645'] })` (@tenant-workspace exists in the vocabulary, `docs/guides/e2e-tags.md`; adding a narrower `@publishing` domain would require editing the tag-guard vocabulary — left as an owner question). Flow: login via `helpers/login.ts` → drafts page (`tenant-posts-drafts-page`) → open drawer (`tenant-posts-new-post`) → type into `tenant-posts-create-body` → check `tenant-posts-publish-target-*` → click `tenant-posts-publish-now` → expect redirect to history (`tenant-posts-history-page`) → poll until `tenant-posts-history-link` visible with an `https://bsky.app/profile/...` href (fake provider from reconciliation 4 makes the worker succeed deterministically). Assert ZERO duplicate links (idempotency visible end-to-end).
- [ ] **Gates under `heavy.sh`:** full Publishing + Posts + Invitations(spec sanity) suites; `just build-api`; `just ci-front`; `just ci-migration-expand-contract`; `just knip`.
- [ ] **PR body** from the checklist in `.dump/brief.md` (no `.dump/pr-body.md` exists in this worktree — reconstructed faithfully): coverage summary, proofs list (§6 D2: publish now → publication+job; worker → Published+link; content → Failed no retry; account → Paused+NeedsReconnect [D1-proven, cited]; transient → retried then Failed; mutation red→green inline), reconciliation decisions, open questions (fake-provider env switch; `@publishing` tag vocabulary; stored Post.Status retirement timing), `Part of #645`, `Closes #<plan-tracking-issue>`, `Model: Ox Alpha via Nous Portal (jcode), effort max`, `Unverified until CI:` list.
- [ ] Final push; `.dump/DONE.md` with tip SHA, PR URL, evidence paths; print `DONE`.

## Self-review

1. **Spec coverage (§6 D2):** publish now creates publication+job (T1/T2 specs, job_queue assertions); worker→Published+link (D1 handler spec cited wt-644 line 154; e2e proves it live through the fake); content error→Failed no retry (D1 T6b cited; D2 T2 asserts plain cause reaches `last_error` through `MarkFailedAsync`); account→Paused+NeedsReconnect (D1-cited; D2 history shows Paused pill via `PublicationWire`); transient→retry×3→Failed (D1 line 355 cited); isolation (T2 d/e, T3, T4 specs); permissions each verb refused (T2/T4); architecture guards incl. endpoint permission/rate-limit + DbContext-free handlers (T5); adversarial mutation deterministic-key removal (T9, exact red spec named); one tagged e2e with REAL B2 testids (T10); "In progress…" invalidation loop (T8); Retry=D4 stub noted honestly (T8, reconciliation 5).
2. **No placeholders:** every step names real files/signatures; the two deliberate discoveries (endpoint-registration call site; front permissions hook) ship with the exact grep that resolves them.
3. **Type consistency:** `PublishPublicationPayload`/`PublishingJobs`/transition-service signatures match `origin/lane/wt-644` byte-for-byte as read; wire status strings match `PublicationWire.FormatStatus`; query params stay snake_case; no `Dto` suffixes on wire types.
