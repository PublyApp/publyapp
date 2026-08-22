# Epic D — Publishing & scheduling (Bluesky first): design

Date: 2026-08-22. Status: approved by the owner in a brainstorming session. Companion of `2026-08-22-epic-c-social-accounts-design.md` (Epic C). Builds on Epic A (jobs infrastructure, `docs/implementation-plans/jobs-worker-infrastructure.md`) and Epic B1 (Post entity, PR #1158).

## 1. Decisions taken with the owner

| # | Question | Decision |
|---|---|---|
| 1 | "Publish now": synchronous or through the job queue? | **Always through the job queue**: publish now = schedule for now. One code path; the API answers immediately; the screen refreshes. |
| 2 | Cancelling a scheduled post | **Back to draft** (no "cancelled" status). |
| 3 | Editing a scheduled post | **Allowed** (text or date); refused with a clear message only while a publication is `InProgress`. |
| 4 | One post → one account or several? | **Several**: a `Publication` row per (post, account), each with its own status, link and error. The v1 screen may offer one; the model is ready. |
| 5 | Which 9:00? | **Per-post time zone**: selector prefilled from the browser, changeable; the exact instant (UTC) and the IANA zone are stored and the zone is shown everywhere. **No recurrence in v1.** |
| 6 | When publishing fails | **Bounded automatic retries for transient errors** (3 attempts, ~1/5/15 min backoff), then `Failed` with the cause and a **Retry** button; **no retry** for content errors; account errors pause (Epic C). **Never a duplicate publication** (deterministic Bluesky record key). **Never published late without an explicit action.** |
| 7 | Product principle (cross-cutting) | **Every failure shows its cause to the user in plain words** — posts, uploads, connections, jobs. Backend rule in `AGENTS.md`; UI rule in `DESIGN.md` (error states). |

## 2. Model

- `Post` (B1) keeps content and project.
- `Publication`: `PostId`, `SocialAccountId`, `Status` (`Scheduled` | `InProgress` | `Published` | `Failed` | `Paused`), `ScheduledAtUtc`, `ScheduledTimeZone` (IANA), `ExternalRecordId` + `ExternalUrl` once published, `LastError` (≤ 2 KB, sanitised, human-readable), `Attempts`, `IdempotencyKey` (deterministic from the publication id; used as the Bluesky record key so a retry after a timeout collides instead of duplicating), timestamps. Unique `(PostId, SocialAccountId)`. Indexes for the due-scan `(Status, ScheduledAtUtc)` and the tenant lists `(TenantId, ScheduledAtUtc, Id)` (keyset).
- Post status is **derived** from its publications (draft if none; scheduled if all scheduled; published if all published; partial if mixed; failed if any failed) — never stored separately.
- Publish now = create publications with `ScheduledAtUtc = now`. Cancel = delete the `Scheduled` publications (post becomes draft). Edit = update post and/or instants; refused if any publication is `InProgress`.

## 3. Execution path (jobs infrastructure)

1. **Schedule**: the API writes the publication(s) as `Scheduled`. No Bluesky call in the request.
2. **Due scan**: a recurring job (every minute; the `DispatchDuePostsJob` reserved by the Epic A design) selects `Scheduled` publications whose instant has passed, claims them (`FOR UPDATE SKIP LOCKED`, so two scans never enqueue the same one), enqueues one job per publication with its idempotency key, and sets `InProgress`.
3. **Run**: the worker obtains a Bluesky session through Epic C's `ISocialSessionProvider` (credential type unknown to it), creates the record with the deterministic key, stores id + URL → `Published`; updates the account's `LastSuccessAt`.
4. **Failures** (classified by the provider into three kinds, each with a human-readable cause):
   - *account* (credentials refused, suspended): no retry; publication `Paused`, account `NeedsReconnect`, banner (Epic C);
   - *content* (too long, invalid media): no retry; `Failed` with the cause;
   - *transient* (network, 5xx, rate limit): jobs-infra retry, 3 attempts with backoff; then `Failed` with the cause and the job dead-lettered (staff dashboard, A5);
   - *already exists* (record with that key exists — typically after a timeout): treated as success; the record is read back and the link stored.
5. **Retry** (button, `tenant.posts.publish`): sets the publication back to `Scheduled` at now with the **same** idempotency key.
6. **Resume after pause** (Epic C): on reconnect, `Paused` publications with a future instant return to `Scheduled`; past instants stay `Paused` with the "date passed — reschedule or publish now" warning.

## 4. Screens (tenant workspace, existing shells)

- **Compose / draft** (B2): post form + "Publish on" block (checkboxes of the accounts visible in the project per Epic C rule, only with `tenant.socialaccounts.publish`), then **Publish now** and **Schedule** (date, time, time zone prefilled). No account checked → save as draft only.
- **Queue**: upcoming publications, sorted by instant, with account, text preview, time shown in the chosen zone (+ zone label), status, **edit / cancel** (`tenant.posts.publish`). Keyset pagination.
- **Calendar**: the same publications by day; click → the post. `Paused` and `Failed` stay visible with their pill.
- **History**: `Published` (link to Bluesky) and `Failed` (cause + **Retry**), newest first.
- Every failed or paused publication shows the cause in one sentence and the next action (Retry / Reconnect the account / Reschedule).
- Refresh: after publish now the screen shows "In progress…" and invalidates its query every few seconds while a publication is `InProgress` (no websocket in v1).

Out of v1: recurrence, Bluesky render preview, shared drafts/comments, multiple images (B3 = one image).

## 5. Delivery order (B, C, D interleaved)

1. **B2** compose + drafts wired to Post CRUD
2. **C1-bis** social-account foundations (rework of #1159)
3. **C2** Bluesky connect (API) → 4. **C3** Integrations screen
5. **D1** `Publication` model + `IPublishProvider` + Bluesky "create record" with deterministic key — no UI
6. **D2** publish now + "Publish on" block + history — **the milestone: a customer really publishes on Bluesky**
7. **D3** scheduling: date/zone, due-scan job, queue + calendar, edit/cancel
8. **C4/D4** pause & resume, retry, dead-letter visibility for staff (A5 link)
9. **B3** single-image upload (transverse; can slot in after D2)

Each step = one PR readable in ~30 minutes, adversarial cross-family review, owner merge.

## 6. Quality bar (owner requirement, applies to every PR of B/C/D)

- **Integration specs** (Testcontainers Postgres, co-located `*.Spec.cs`) for every handler and service path: happy path, tenant/project isolation, each permission verb refused, each failure kind, and the proofs listed below. Bluesky is always faked (`IPublishProvider`/session provider test doubles); never the real network.
- **Architecture tests**: extend `apps/api/Lib/Architecture/*` for the new modules — slice boundaries (no DbContext in handlers, services own queries), every endpoint permissioned and rate-limited, entity configuration conventions, handler contracts; add a guard that every `Publication` status transition goes through the single state-transition service (no ad-hoc status writes).
- **E2E** (Playwright, tagged per #1168): "publish now (faked Bluesky) → appears in history with a link"; "schedule → appears in queue and calendar in the chosen zone → cancel → back in drafts".
- **Code shape**: boring and explicit — small vertical slices, one function for each rule that must not be duplicated (account visibility, idempotency key, failure classification, status derivation), interfaces at the seams (`IPublishProvider`, `ISocialSessionProvider`, `IJobEnqueuer`), value objects where the domain has them (time zone + instant pair, idempotency key), no reflection tricks, no suppressions; follows `AGENTS.md`, the pagination/rate-limit/lint guides and the analyzers everywhere.
- **Performance & resilience stated in the PR**: an index for every query path, keyset pagination, bounded retries, idempotent re-execution, due-scan safe under concurrency, bounded `LastError`.
- **Proofs per PR** — D1: same key for the same publication every time; "already exists" = success; provider ignores credential type. D2: publish now creates publication + job; worker → `Published` + link; content error → `Failed` no retry; account error → `Paused` + `NeedsReconnect`; transient → retried then `Failed` after 3; **adversarial mutation**: remove the deterministic key → the "no duplicate after timeout" spec must go red. D3: due-scan takes only past instants and only once under two concurrent scans; edit during `InProgress` refused; cancel → draft; zone round-trips. D4: retry reuses the key; resume respects "date passed". Every PR: no secret in any output; isolation; permissions; the mutation it chose, shown red then green in the body.

## 7. Hard repo constraints that apply
Same as Epic C §7, plus: jobs go through `job_queue`/`IJobEnqueuer` only (single trust boundary, Epic A §5.3); external idempotency via deterministic Bluesky record key is mandatory (Epic A §4.1); failure text is sanitised per rule F20; migrations via the one-shot `migrate` service.
