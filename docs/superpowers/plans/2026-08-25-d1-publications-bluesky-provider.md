# D1: Publication model + IPublishProvider + Bluesky create-record with a deterministic key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Epic D step 1 (#644, part of #631): the `Publication` entity per spec §2 with its expand-only migration, ONE state-transition service every `Publication.Status` write must go through (plus an architecture guard that fails on any rogue writer), the `IPublishProvider` seam, and `BlueskyPublishProvider` mapping Post + session → `com.atproto.repo.createRecord` with the deterministic record key derived from the publication idempotency key. The publish job (`PublishPublicationJob`) runs worker-side through `IJobEnqueuer` only and classifies failures into account / content / transient / already-exists. No UI, no endpoint (D2 adds publish-now), no due-scan (D3).

**Architecture:** New vertical slice `apps/api/Modules/Publishing` following the domain-first layout (`Entities/`, `Services/`, `Providers/`, `Jobs/`). The session seam is Epic C's `ISocialSessionProvider`, consumed at exactly the contract pinned by lane wt-641 (created here verbatim if absent on develop; the two lanes converge at rebase). Bluesky is faked in EVERY spec — never the real network. Jobs go through `IJobEnqueuer` only (Epic A §5.3 single trust boundary); external idempotency uses the deterministic Bluesky record key derived from the publication idempotency key (Epic A §4.1).

**Tech Stack:** .NET 10 / EF Core 10 + Npgsql, xUnit + FluentAssertions, Testcontainers ephemeral Postgres via `ApiFixture`, `just` recipes under `~/ai-orchestration-playbook/tools/heavy.sh`.

## Global constraints (blocking)

- Analyzers PUBLY0001–0008 are errors: `is null`/`is not null` pattern matching; never `?? throw`; never `!`; never `ToLower()` dispatch; wire DTOs carry no `Dto` suffix; handlers cache repeated getter results; services do not depend on other services (the transition service takes `AppDbContext` only); tenant-scoped service methods use their `tenantId`. Max 100 char lines; braces always; class methods stay methods.
- No disable/suppression comments, no `[Fact(Skip)]`, no ruleset/guard loosening, no sub-agents/workers.
- Migrations are **expand-only** (new table + indexes only) and applied by the one-shot `migrate` service; locally `just db-add AddPublications && just db-migrate`. `just ci-migration-expand-contract` must stay green.
- `LastError` ≤ 2 KB sanitised via `SocialAccounts.Lib.LastErrorSanitiser.Sanitize` (reuse, F20). Never log secrets or session tokens.
- Heavy commands run under `~/ai-orchestration-playbook/tools/heavy.sh` (serialised host-wide); focused filters first, module suite once at the end, never > 20 min under the lock.
- "just api-check" in the brief = the repo's build+analyzers gate: `just build-api` (analyzers fire as build errors) plus `just ci-quality-dotnet` before push.
- Every commit: one task = one commit, push after every commit. Never touch develop.

## Reconciliation decision: stored `Post.Status` vs derived status

The spec says post status is DERIVED from publications; B2's shipped code STORES `Post.Status` (draft|scheduled|published) and the drafts page filters on it. D1 owns NO endpoint and NO UI, so nothing reads `Post.Status` through publications yet. Decision: **keep `Post.Status` stored untouched in D1**; add the pure derivation function `PostStatusDerivation.Derive(IReadOnlyCollection<Publication>)` now (spec §2 vocabulary, unit-spec'd, unused by endpoints) so D2 can switch the drafts/list read paths to it and stop writing `Post.Status` without touching this slice. Stated again in the PR body.

## File structure

**Create**
- `apps/api/Modules/Publishing/Entities/Publication.cs` — entity (BaseAttributes + ITenantEntity).
- `apps/api/Modules/Publishing/Entities/PublicationStatus.cs` — enum Scheduled=10, InProgress=20, Published=30, Failed=40, Paused=50.
- `apps/api/Modules/Publishing/Entities/PublicationSchedule.cs` — value object (ScheduledAtUtc, ScheduledTimeZone IANA) with validation.
- `apps/api/Modules/Publishing/Entities/PublicationConfiguration.cs` — table, CK status, unique `(post_id, social_account_id)` partial on not-deleted, indexes `ix_publications_status_scheduled_at` and `ix_publications_tenant_scheduled_at_id`.
- `apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.cs` — deterministic key from the publication id.
- `apps/api/Modules/Publishing/Lib/PostStatusDerivation.cs` — pure function (see reconciliation above).
- `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` — the ONLY writer of `Publication.Status`.
- `apps/api/Modules/Publishing/Providers/IPublishProvider.cs` — seam: `PublishAsync(PublishRequest) → PublishResult`.
- `apps/api/Modules/Publishing/Providers/PublishRequest.cs`, `PublishResult.cs` — request/result records incl. failure classification (Account/Content/Transient/AlreadyExists).
- `apps/api/Modules/Publishing/Providers/BlueskyPublishProvider.cs` — maps to `com.atproto.repo.createRecord`, deterministic `rkey`.
- `apps/api/Modules/SocialAccounts/Services/ISocialSessionProvider.cs` — EXACT contract from the brief (lane wt-641 convergence).
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobs.cs` — payload record + `JobDefinition` catalog ("publishing.publish-publication.v1", priority 0 bulk, MaxAttempts 3).
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` — the run path (InProgress → provider → terminal states).

**Modify**
- `apps/api/Data/DbContext/AppDbContext.cs` — add `DbSet<Publication> Publication`.
- `apps/api/Lib/ServiceRegistration.cs` — register the transition service scoped, `BlueskyPublishProvider` as `IPublishProvider` singleton, handler registration via `AddJobHandler` in the jobs block.
- `apps/api/Migrations/*_AddPublications.cs` (+ designer/snapshot) — generated.

**Specs**
- `apps/api/Modules/Publishing/Entities/PublicationEntity.Spec.cs` — EF model assertions (constraints/indexes/value object columns).
- `apps/api/Modules/Publishing/Entities/PublicationSchedule.Spec.cs` — VO validation.
- `apps/api/Modules/Publishing/Lib/PublicationIdempotencyKey.Spec.cs` — determinism + format.
- `apps/api/Modules/Publishing/Lib/PostStatusDerivation.Spec.cs` — draft/scheduled/published/partial/failed.
- `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.Spec.cs` — integration: each legal transition, each illegal refusal, LastError bound, LastSuccessAt side effect, tenant isolation (foreign tenant → row not found), Attempts increment.
- `apps/api/Modules/Publishing/Providers/BlueskyPublishProvider.Spec.cs` — request shape (nsid/collection/rkey/repo), classification of the four failure kinds, already-exists → read-back → success with id+url, credential-source blindness.
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.Spec.cs` — integration: happy path Published+link+LastSuccessAt; content → Failed no retry; account → Paused + account NeedsReconnect; transient → JobOutcome.Retry ×3 then Failed + dead-letter; already-exists after timeout → single record, no duplicate; same key every time; enqueued-through-IJobEnqueuer-only proof.
- `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` — guard: only `PublicationStatusTransitionService` may write `.Status` on a `Publication` (source scan over `apps/api/Modules/**` excluding the service file itself); EF model assertions mirroring PostArchitectureSpec style; service-methods-use-tenantId check.

---

## Task 0: Plan commit (this file)

- [x] Write this plan; commit `docs(superpowers): D1 implementation plan (publications, IPublishProvider, deterministic Bluesky rkey)`; push.

## Task 1: Publication entity + schedule value object + migration (expand-only)

**Files:** Entities listed above; `AppDbContext.cs` DbSets; migration.

- [ ] **Step 1 (RED):** Write `PublicationEntity.Spec` asserting table `publications`, CK `CK_Publication_Status` = `"status IN (10, 20, 30, 40, 50)"`, unique index `ux_publications_post_account` (filter `is_deleted = false`), indexes `ix_publications_status_scheduled_at` (Status, ScheduledAtUtc) and `ix_publications_tenant_scheduled_at_id` (TenantId, ScheduledAtUtc, Id), and `PublicationSchedule` mapped columns (`scheduled_at_utc`, `scheduled_time_zone`). Run focused filter — expect compile failure (types missing).
- [ ] **Step 2 (GREEN):** Implement entity/enum/VO/configuration + DbSet. Entity fields: TenantId, PostId, SocialAccountId, Status (default Scheduled), Schedule (VO: ScheduledAtUtc timestamptz, ScheduledTimeZone text), ExternalRecordId?, ExternalUrl?, LastError? (≤2 KB sanitised), Attempts (int), IdempotencyKey (string, set once from `PublicationIdempotencyKey.For(publication)` on insert), audit cols. FKs: Post cascade, SocialAccount restrict (publications survive an account removal for history; account rows are never hard-deleted today), Tenant cascade.
- [ ] **Step 3:** `heavy.sh just db-add AddPublications` then `heavy.sh just db-migrate`. Verify generated migration contains ONLY additive operations (CreateTable + CreateIndex).
- [ ] **Step 4:** Rerun spec green. Commit `feat(api): Publication entity, schedule value object, expand-only migration`.

## Task 2: Deterministic idempotency key

**Files:** `Lib/PublicationIdempotencyKey.cs` + spec.

- [ ] **Step 1 (RED):** Spec: same publication id → byte-identical key every call; distinct ids → distinct keys; format matches `^[0-9a-f]{32}$` (hex, lowercase, URL/at-proto safe); works pre-persist (id passed explicitly).
- [ ] **Step 2 (GREEN):** `PublicationIdempotencyKey.For(Guid publicationId)` = lowercase hex MD5 of the id bytes (deterministic, collision-safe for UUIDv7 inputs, no randomness). Used BOTH as job enqueue idempotency key AND as the Bluesky record key suffix.
- [ ] **Step 3:** Green; commit `feat(publishing): deterministic publication idempotency key`.

## Task 3: Single state-transition service

**Files:** `Services/PublicationStatusTransitionService.cs` + integration spec.

- [ ] **Step 1 (RED):** Integration spec (`IClassFixture<ApiFixture>`, direct DbContext seeding like EmailLogRetentionHandlerSpec): legal transitions succeed and persist (Scheduled→InProgress; InProgress→Published clearing LastError and setting ExternalRecordId/ExternalUrl when given; InProgress→Failed with sanitised cause ≤2 KB; InProgress→Paused with cause; any→Scheduled retry path keeping IdempotencyKey stable); illegal transitions throw `InvalidOperationException` (e.g. Scheduled→Published, Published→anything, Failed→InProgress); Attempts increments on InProgress entry; foreign-tenant id → "not found" failure (row untouched, no exception leak of other tenants' data); a >2 KB raw cause lands truncated+redacted.
- [ ] **Step 2 (GREEN):** Service methods: `MarkInProgressAsync(Guid publicationId, Guid tenantId, CancellationToken)`; `MarkPublishedAsync(id, tenantId, string externalRecordId, string externalUrl, CancellationToken)`; `MarkFailedAsync(id, tenantId, string cause, CancellationToken)`; `MarkPausedAsync(id, tenantId, string cause, CancellationToken)`; `RescheduleToNowAsync(id, tenantId, CancellationToken)`. Each loads with `TenantId == tenantId && !IsDeleted` predicate, guards the current state against a static allowed-transition map, writes ONLY via `_db.Publication`, saves. Sanitisation through `LastErrorSanitiser.Sanitize`.
- [ ] **Step 3:** Green; commit `feat(publishing): single Publication status-transition service`.

## Task 4: Architecture guard + RED rogue-writer proof

**Files:** `Lib/Architecture/PublicationArchitecture.Spec.cs`.

- [ ] **Step 1 (GREEN first):** Guard asserts (a) EF-model constraints/indexes as Task 1, (b) source scan: across all `apps/api/Modules/**/*.cs` EXCEPT the transition service, no occurrence of the write patterns `.Status =` on identifiers named `*publication*` (case-insensitive line scan with the same Roslyn-free technique as PostArchitectureSpec), (c) transition-service methods carrying `Guid tenantId` reference `TenantId ==`.
- [ ] **Step 2 (RED proof):** Plant `RoguePublicationWriter.cs` (temp file, uncommitted) doing `publication.Status = PublicationStatus.Published;` inside `apps/api/Modules/Posts/Services/`. Run the guard filter — MUST FAIL naming the file. Transcript captured to `.dump/mutation-rogue-writer.md`.
- [ ] **Step 3:** Delete the rogue (byte-exact absence restored, md5 of tree section recorded), rerun guard green. Commit `test(api): Publication architecture guard — single status-writer ratchet`.

## Task 5: ISocialSessionProvider contract + IPublishProvider + BlueskyPublishProvider

**Files:** SocialAccounts seam file; Providers files + specs.

- [ ] **Step 1 (RED):** `BlueskyPublishProvider.Spec`: fake `ISocialSessionProvider` returning `Opened(new SocialSession("did:plc:x", "@h.test", "jwt-token", "https://pds.example"))`; a recording fake transport captures the request. Assert: POST to `{PdsHost}/xrpc/com.atproto.repo.createRecord`; body repo = session.Did; collection = `app.bsky.feed.post`; rkey = `pub-{key}` where key = `PublicationIdempotencyKey.For(publicationId)` (deterministic); text = post body; createdAt = scheduled instant formatted `o`. Failure mapping: transport returns 400 InvalidRequest "text too long" → Content; 401/403 invalid credentials → Account; 5xx/timeout/network → Transient; 400 with `DuplicateRecord`/existing-rkey semantics (or the documented already-exists signal) → AlreadyExists. AlreadyExists → provider issues get-record read-back (`app.bsky.feed.getPosts`) and returns Success with the EXISTING record's uri/cid. Credential blindness: run the SAME assertions against a second fake session provider that yields `Opened` from a totally different credential source — identical results.
- [ ] **Step 2 (GREEN):** `IPublishProvider.PublishAsync(PublishRequest, CancellationToken)` where PublishRequest carries PublicationId, IdempotencyKey, PostBody, Schedule, Session. `PublishResult`: `abstract record` with `Published(string RecordId, string RecordUrl)`, `AlreadyExistsTreatedAsPublished(string RecordId, string RecordUrl)` (handler treats both as success), `AccountFailure(string Cause)`, `ContentFailure(string Cause)`, `TransientFailure(string Cause)`. BlueskyPublishProvider uses `HttpClient` factory (`IHttpClientFactory`), NEVER logs tokens, sanitises causes. Session comes ONLY from the injected `ISocialSessionProvider.OpenSessionAsync(socialAccountId)` result — `Opened` proceeds, `AccountFailure`/`Transient` surface as their own kinds.
- [ ] **Step 3:** Also create `ISocialSessionProvider.cs` verbatim from the brief (it does not exist on develop — verified). Green; commit `feat(publishing): IPublishProvider seam + Bluesky createRecord provider with deterministic rkey`.

## Task 6: PublishPublicationJob through IJobEnqueuer + handler

**Files:** `Jobs/PublishPublicationJobs.cs`, `Jobs/PublishPublicationJobHandler.cs`, ServiceRegistration wiring, handler spec.

- [ ] **Step 1 (RED):** Handler spec (direct invocation, real test DB): seed tenant/post/account/publication(Scheduled) + fake `IPublishProvider` + fake session provider resolved through DI scope replacement (`RemoveAll<IPublishProvider>` in a custom ApiFactory subclass like existing specs do for IEmailSender). Cases: (a) happy: outcome Success, publication Published with id/url, account LastSuccessAt stamped; (b) content failure: provider ContentFailure → MarkFailed → publication Failed, plain-words cause persisted, job NOT retried (Success outcome consumed after terminal domain state — engine deletes); (c) account failure: publication Paused AND social_accounts.status == NeedsReconnect (20) with LastError recorded; (d) transient: provider throws TransientFailure-shaped result → handler returns `JobOutcome.Retry` (engine backoff; definition MaxAttempts=3) and publication stays InProgress with attempts incremented; final attempt exhausted → handler marks Failed and returns PermanentFailure so the engine dead-letters (assert OnTerminalFailure path leaves publication Failed); (e) timeout duplicate: simulate crash-after-create by pre-inserting the record server-side in the fake (second publish attempt with same rkey) → AlreadyExists → read-back → Published with the SAME single record — no duplicate rows in the fake store; (f) enqueue proof: `IJobEnqueuer.EnqueueAsync(PublishPublicationJobs.V1, payload, new EnqueueOptions { IdempotencyKey = key })` writes one job_queue row with job_type `publishing.publish-publication.v1` and the publication key; a second enqueue with the same key violates the partial unique index (in-flight dedup, F13).
- [ ] **Step 2 (GREEN):** Payload `PublishPublicationPayload { required Guid PublicationId; required string IdempotencyKey; }` (ids only; handler reloads fresh). Definition: JobType `publishing.publish-publication.v1`, Priority 0, MaxAttempts 3, Validate rejecting empty key mismatch vs `PublicationIdempotencyKey.For(PublicationId)` (defense-in-depth: the key IS derivable — payload carries it to make the wire contract explicit per brief). Handler flow: load publication (tenant-scoped via its own TenantId column read directly — job context has no HTTP tenant) → not found/terminal-already ⇒ Cancelled no-op; else MarkInProgress → OpenSessionAsync → AccountFailure ⇒ MarkPaused + account NeedsReconnect + return Success (domain-terminal, no retry); Transient ⇒ return Retry(Error=sanitised cause); Opened ⇒ provider.PublishAsync → Published/AlreadyExists ⇒ MarkPublished + account LastSuccessAt + Success; ContentFailure ⇒ MarkFailed + Success (no retry); TransientFailure ⇒ Retry. Unknown exceptions bubble → engine classifies Retry.
- [ ] **Step 3:** Register in `AddEmailJobHandlers`-style block (worker composition) + `IPublishProvider`/transition service registrations in producer-shared DI; `AppRoleCompositionSpec` unaffected (no hosted services added). Green; commit `feat(publishing): PublishPublicationJob — worker-side publish through the trusted enqueue boundary`.

## Task 7: Adversarial mutation — remove the deterministic key

- [ ] **Step 1:** Mutate `BlueskyPublishProvider.cs`: replace `rkey = "pub-" + PublicationIdempotencyKey.For(request.PublicationId)` with a random suffix (`Guid.NewGuid():N`). md5sum before.
- [ ] **Step 2:** Run `ItShouldNotCreateADuplicateWhenTheRecordAlreadyExistsAfterATimeout` (spec e) — MUST go red (duplicate created instead of read-back). Full transcript (command + output) to `.dump/mutation-deterministic-key.md`.
- [ ] **Step 3:** Restore byte-exact (git checkout of the file), verify md5 equals the original, rerun spec green. Transcript updated with restore proof. No commit (tree unchanged).

## Task 8: Gates + PR

- [ ] Run full Publishing-module suite + Posts + SocialAccounts suites once under heavy.sh (focused, < 20 min lock).
- [ ] `heavy.sh just build-api`; `just generate-client` NOT needed (no endpoint/contract change — verify OpenAPI diff empty; if the doc generation changes openapi.json, commit it); `just ci-migration-expand-contract`; front typecheck untouched.
- [ ] Write PR body from `.dump/pr-body.md`: what/why plain words, proofs list (§6 D1 + guard RED + mutation red→green transcript inline), reconciliation decision on Post.Status, `Model: Ox Alpha via Nous Portal (jcode), effort max`, `Unverified until CI: …`, section "Anything in this brief that turned out to be wrong" (heavy.sh/api-check naming, missing ISocialSessionProvider on develop), `Closes #644`.
- [ ] Push branch; open PR against develop; poll `gh pr checks` — if "no checks reported" > 1 min: fetch origin develop, rebase keeping both intents, `--force-with-lease`.
- [ ] `.dump/DONE.md` with tip SHA, PR number, evidence paths; print `DONE`.

## Self-review

1. **Spec coverage:** §6 D1 proofs map — same key every time (Task 2 spec + Task 6 f), already-exists = success + link stored (Task 5 + Task 6 e), provider ignores credential source (Task 5 blindness case), single-writer guard proven RED with planted rogue (Task 4), each failure kind lands right status with plain cause (Tasks 3/5/6), account failure sets NeedsReconnect (Task 6 c), adversarial mutation removes deterministic key → no-duplicate spec red (Task 7).
2. **No placeholders:** every step names exact files, real signatures, real commands.
3. **Constraints honored:** expand-only migration, faked Bluesky everywhere, no suppressions, analyzers respected, one commit per task pushed.
