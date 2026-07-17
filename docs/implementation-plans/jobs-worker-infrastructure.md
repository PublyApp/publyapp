# Background Jobs & Worker Infrastructure — Design

> Status: **design, ratified 2026-07-16; revised same night; merge-challenge
> round 1 remediated 2026-07-17** (single-lane ruling + sol@high audit
> absorption + PR #852 challenge round 1 — see Ratification record, §11). Closes
> the #632 gap (the #194 design was referenced but never committed).
>
> **Authoritative scope.** This document is **implementation-authoritative for
> the Epic A core — Phases 2A-R (#633 engine remediation), 2B (#634
> `APP_ROLE`/leadership/Quartz), and 2C-R1/R2 (#809/#810/#811 email fold-in)**:
> another agent must be able to implement those phases from the sections below
> without re-deriving decisions. **Phase 3 (#635) and Phase 4 (#636) are
> design-direction**, not full build packets: §5.3/§7/§10 give their ratified
> contracts (system-job catalog, retention windows, observability signals,
> DLQ-requeue) and concrete first-job shapes, but each still requires its own
> build spec (concrete endpoints, DTOs, remaining cron defaults, UI) before
> implementation. Where a later-phase mechanism is a *dependency* of the core
> (e.g. the DLQ-requeue contract §4.2/§5.1, the system-job dispatch contract
> §4.3/§5.3), it is specified to build-grade here so nothing in 2A–2C is left
> under-derived.
>
> Scope note: **design only.** No application code is introduced by the doc
> itself; every file path below is a build target for a phase. Audit finding
> numbers (F1–F24) reference `.dump/exec/jobs-infra/audit-findings.md`; PR #852
> round-1 challenge findings (C1–C17) reference
> `.dump/exec/jobs-infra/doc-challenge-r1-findings.md`. Both are cited inline
> where the design absorbs them.

---

## 1. Context & goals

PublyApp needs durable, crash-safe background execution. Consumers already filed
against this infrastructure:

| Consumer | Issue | Nature |
| --- | --- | --- |
| Scheduled post publishing | #646 (D3, part of #631) | Quartz due-scan → enqueue → publish; **future**, this design accommodates it, does not build it |
| Expired-session cleanup | #389 | recurring system job, batched hard-delete |
| Expired-invitation status set | #425 | recurring system job |
| Audit-log export → background | #213 | on-demand job, file output + notify email |
| Full-result tenant export | #286 | on-demand job, file output + notify email |
| Invitation email delivery | #291 | shipped as a typed outbox in #806; **folds into `job_queue` as email jobs** (this design) |
| Password-reset email delivery | #809 | fire-and-forget → transactional email job |

### What shipped in #806

PR #806 landed a **production invitation-email outbox**, entirely in-process
inside `apps/api` as a `BackgroundService`:

- `invitation_email_outbox` table (`Modules/Invitations/Entities/InvitationEmailOutbox.cs`),
  inheriting `BaseAttributes`.
- `InvitationEmailOutboxDispatcher` (`Infrastructure/Messaging/Email/`): a
  `BackgroundService` that claims rows with a **single-statement
  `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)`**, sends, and applies
  retry/backoff. Public `ClaimBatchAsync` / `ProcessBatchAsync` / `SendOneAsync`
  for deterministic specs (its own "LAW 2" rationale).
- `IInvitationEmailOutboxSignal` (a `SemaphoreSlim`): lets in-process writers
  wake the dispatcher immediately; poll interval (5 s) is the correctness
  fallback.
- A send-time eligibility recheck (revoked/accepted/expired → `Cancelled`), plus
  synchronous cancellation from revoke/accept paths.

Three residual bugs were filed and deferred: **#809** (password-reset still
fire-and-forget), **#810** (retryable failure ignores backoff — row sits
`Processing` until the 5-min lease expires because the pending predicate can't
see `NextAttemptAt`), **#811** (revoke/accept can race the eligibility check and
still send). The audit additionally surfaced a **live pre-existing bug (F3)**:
`ResendEmailAdapter` maps provider failures to `EmailResult.Success = false`,
and every `EmailService` method **discards that result** — a rejected send is
indistinguishable from a delivered one today. §5.4 specifies the corrected
contract; it lands in Phase 2C.

The outbox's *claim pattern, host-lifetime discipline, and spec discipline* are
the template for this design's engine. Its *table and dispatcher* are retired by
it: emails become jobs on the generic queue (§2 D2), the bugs above are fixed in
the engine and the email job handlers (§5), and delivery history moves to
`email_log` (§4.4).

### What this design adds

1. A **generic `job_queue`** (JSON payload) for **all** background work —
   scheduled jobs, on-demand jobs, and transactional emails — with a
   `JobQueueProcessor` modeled on the shipped dispatcher's claim pattern,
   hardened with **lease fencing tokens and renewal** (F1).
2. **Quartz.NET with manual lifecycle** and `pg_try_advisory_lock` leader
   election so exactly one worker replica schedules recurring triggers.
3. **Role-based hosting** (`APP_ROLE`) so the same image runs as `api`, `worker`,
   or `all` — the worker role runs a **genuine Generic Host with no HTTP
   server** (F17).
4. **Cross-process wake** (`LISTEN`/`NOTIFY` on `job_queue`) to replace the
   in-process semaphore, which cannot span the api→worker process boundary once
   roles are separated.
5. The **email fold-in**: `invitation_email_outbox` migrates into `job_queue`
   email jobs via an **expand/contract rollout** (F4) and is dropped; an
   append-only **`email_log`** records terminal delivery outcomes from day one;
   the #810/#811 fixes land in the engine and the email handlers; #809
   (password-reset) becomes a transactional email job behind a
   transaction-owning Auth service (F6).
6. A **trusted enqueue boundary** (`IJobEnqueuer` + job-definition catalog,
   F15), a **typed outcome taxonomy** (F12), **versioned payloads** (F14), and
   an **observability & operations contract** (§7, F21).

---

## 2. Ratified decisions (2026-07-16 — FIXED)

These were ratified by the owner. Design around them; do not relitigate. D2 was
**revised by the owner later the same night** (see Ratification record, §11);
the text below is the current ruling.

### D1 — Role-based hosting (one codebase, one image)

One Docker image. An `APP_ROLE` env var (surfaced via `AppEnvironment`) decides
composition at startup:

- `api` — maps HTTP endpoints; registers **no** job hosted-services.
- `worker` — registers Quartz + `JobQueueProcessor` + the cross-process
  listener; runs **no HTTP server at all** (Generic Host, §3.2 — F17).
- `all` — both. This is the **`Development`/`Testing` default when `APP_ROLE`
  is unset**; every production-like environment **must** set the role
  explicitly — an unset `APP_ROLE` there is a fail-fast boot error, never a
  silent `all` (§3.1 — C6/F24).

Rationale: a single build/publish/migration story; horizontal scaling of the
worker independently of the api; no premature project split. The
`packages/shared-cs` + `apps/worker` extraction (#317) is **deferred** — recorded
as a follow-up (§10, Follow-ups), *not* part of this build order. The engine
therefore lives inside `apps/api` today and runs as the worker role of the same
assembly.

> This is a deliberate deviation from the `apps/jobs` / `apps/worker` shape
> sketched in `docs/guides/dotnet-project-layout.md` and `AGENTS.md`. Those
> remain the *eventual* target (triggered by #317); until then, "worker" is a
> **role of `PublyApp.Api`**, not a separate project.

### D2 — Single lane: emails are jobs on `job_queue`, history in `email_log` (REVISED 2026-07-16, supersedes the two-lane ruling)

The earlier two-lane ruling (typed `EmailOutbox` + generic `job_queue`) is
**reversed**. There is **one queue**: transactional emails ride `job_queue` as
email jobs, exactly like every other job.

- **No typed `email_outbox` table, no rename migration.** The rationale the
  owner endorsed: under pure Postgres (D3), a `job_queue` insert is **already
  transactional with the domain write** — the textbook outbox justification (a
  durable staging table because the queue lives in another system) evaporates
  when the queue *is* a table in the same database. Two lanes would duplicate
  claim/lease/backoff/recovery/DLQ/dashboard machinery forever; and future
  side-effects (webhooks, Epic D provider publishing) would make
  typed-table-per-concern proliferate.
- **Domain logic survives as handler logic, not as typed columns.** The
  invitation eligibility recheck (the property the typed table existed to
  protect) lives in the email job handlers, which reload domain state by ID at
  send time (§5.4) — a *stronger* guarantee than denormalized columns, and the
  designed #811 fix.
- **`email_log` from day one** (owner mandate, paraphrased: *"I want the correct
  way of doing things from now"* — deferral explicitly rejected). An
  **append-only delivery record** written by email job handlers on terminal
  outcomes — submitted-to-provider, cancelled-ineligible, permanently-failed —
  carrying kind, recipient, related entity IDs (`invitation_id`, `user_id`),
  provider message id, error, and timestamps. The queue stays delete-on-success;
  **history lives in `email_log`**, cleanly separated from execution state.
  Schema in §4.4.

Consequences: superseded open questions O1 (rename+extend) and O4
(password-reset on the typed outbox) are void — password-reset (#809) becomes
an email job; the shipped `invitation_email_outbox` migrates into `job_queue` +
`email_log` via expand/contract and is **dropped** (§4.6).

### D3 — Pure Postgres, no broker (from #194, reconfirmed)

- Quartz.NET, **manual lifecycle**, **RAM job store** (no `qrtz_*` tables — see
  §5 rationale).
- `pg_try_advisory_lock` leader election for the scheduler across worker replicas.
- Lease-model claiming: `FOR UPDATE SKIP LOCKED` + a `locked_until` lease with a
  **fencing token** (F1).
- **Delete-on-success** + a **dead-letter** table for terminal failures.
- `system_job_definitions` for dashboard-configurable system jobs, reconciled by
  `SyncSystemJobsJob`.

No RabbitMQ, no Redis. Postgres is the single source of truth.

---

## 3. Process topology (`APP_ROLE` composition root)

### 3.1 Config surface

Add to `AppEnvironment` (`apps/api/Lib/AppEnvironment.cs`):

- `APP_ROLE` — optional string, parsed to an `AppRole` enum
  `{ Api, Worker, All }`. Parse case-insensitively via an explicit map (never
  `ToLower()` — PUBLY0003). Reject any unrecognized value at startup with the
  same fail-fast `InvalidOperationException` path the other vars use, and add a
  validator rule.
- **Environment-gated default (C6/F24).** `All` is the default **only in the
  `Development` and `Testing` host environments**. In every other environment
  (`Production`, `Staging`, and any non-dev/test `ASPNETCORE_ENVIRONMENT`) a
  missing/blank `APP_ROLE` is a **fail-fast startup error** — the validator
  refuses to boot rather than silently composing the worker surface into a
  process an operator intended as API-only. This closes the "global `All`
  fallback" hole: `All` can never *leak* into a production process by omission;
  it is only ever an explicit local-dev or fixture choice. (The role parse is
  environment-aware: `GetOptionalAppRole` returns `All` as the default only when
  `IsDevelopment || IsTesting`, else it treats absence as invalid.)
- Expose `AppEnvironment.Role` plus convenience `IsApiRole` / `IsWorkerRole`
  computed the same way as the existing `IsDevelopment` accessors.
- **`All` is reserved for local development and worker-specific integration
  fixtures (C6/F24).** Every tooling/CI/deployment context that runs the app and
  assumes an API-only process must pin `APP_ROLE=api` explicitly. The complete
  enumerated entrypoint set (all must be pinned, verified by a checklist in
  Phase 2B's gate):
  1. the Dockerfile's build-time OpenAPI-generation env block (§3.3);
  2. `apps/front-2/docker-compose.test.yml`'s api service (front-2 E2E);
  3. the **OpenAPI-drift / client-generation workflow** (`just build-api` +
     `just generate-client`, and its CI job) — `dotnet build` runs the app to
     emit the OpenAPI document, so the build env must export `APP_ROLE=api`;
  4. any CI job that boots the app for a purpose other than the worker
     integration fixtures (which run `all` deliberately, §3.3).
  Because these run under `Development`/`Testing` host environments, the pin is
  belt-and-braces there (the env-gated default would give `All`, but these
  callers want `api`); under any production-like environment the fail-fast rule
  above is the backstop.

Optional worker-tuning vars (all optional, sane defaults, so `all`/dev needs no
new config):

| Var | Default | Purpose |
| --- | --- | --- |
| `JOB_QUEUE_BATCH_SIZE` | 20 | rows claimed per processor tick (matches the shipped outbox) |
| `JOB_QUEUE_POLL_SECONDS` | 5 | fallback poll interval (matches the shipped outbox) |
| `JOB_LEASE_SECONDS` | 300 | claim lease / renewal target / stale-reclaim cutoff |
| `JOB_QUEUE_DRAIN_BUDGET_SECONDS` | 60 | max continuous drain per wake before yielding one loop iteration (F10) |
| `EMAIL_LOG_RETENTION_DAYS` | 180 | retention sweep window for `email_log` (F20; O7) |
| `JOB_DEAD_LETTER_RETENTION_DAYS` | 90 | retention sweep window for `job_dead_letter` (F20; O7) |
| `EMAIL_PREPARED_SEND_RETENTION_DAYS` | 7 | orphan-floor age for `email_prepared_sends` behind the live-state anti-join (§4.5/§7.3; O7; R2-11) — validated ≥ 1 |
| `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS` | 30 | prune window for the `system_job_occurrences` ledger (§4.3/§7.3; O9) — validated ≥ 1 |
| `SCHEDULER_LEADER_LOCK_KEY` | (constant, not env) | see §5.2 |

### 3.2 Composition — exactly what each role wires

**The worker role runs a genuine Generic Host (F17).** `WebApplicationBuilder`
registers Kestrel and `Run()` starts it even with zero mapped routes — "zero
endpoints" is *not* "serves no HTTP". Therefore:

- `Api` / `All` → `WebApplication.CreateBuilder` as today.
- `Worker` → `Host.CreateApplicationBuilder` (Microsoft.Extensions.Hosting
  Generic Host): **no Kestrel is ever registered**, `ASPNETCORE_URLS` is inert,
  nothing listens on any port.
- To make both hosts share one composition, the registration extensions
  (`AddInfraServices`, `AddAppServices`, `JobsServiceRegistration.AddWorkerServices`)
  retarget **`IHostApplicationBuilder`** (implemented by both builder types)
  instead of `WebApplicationBuilder`. Only `AddWebServices` + the middleware/
  endpoint pipeline remain `WebApplicationBuilder`-specific.
- **Shared DI prerequisites move out of web-only registration (F17):**
  `AddHttpContextAccessor()` moves from `AddWebServices` into the shared infra
  registration, because the `AddDbContext` tenant-resolution factory requires
  `IHttpContextAccessor`. In the worker host the accessor simply yields a null
  `HttpContext` → tenant id resolves null — correct for background execution.
  Any other web-registered service that a shared component depends on gets the
  same treatment; the `AppRoleComposition` spec (§9) fails the build if the
  worker graph cannot resolve.

Role-gated composition matrix:

| Concern | `api` | `worker` | `all` |
| --- | --- | --- | --- |
| Kestrel/HTTP host + endpoint maps (`MapAuthEndpoints`, staff/tenant groups, `/files`, `/health`) | ✅ | ❌ (Generic Host — no HTTP server exists) | ✅ |
| `AddDbContext<AppDbContext>` + infra singletons (email, storage) + `IHttpContextAccessor` | ✅ | ✅ | ✅ |
| `JobQueueProcessor` hosted service | ❌ | ✅ | ✅ |
| `SchedulerLeaderService` (+ Quartz) hosted service | ❌ | ✅ | ✅ |
| Cross-process `JobQueueListener` (§5.5 wake) | ❌ | ✅ | ✅ |
| Worker liveness heartbeat writer | ❌ | ✅ | ✅ |
| Job **producers** (`IJobEnqueuer` + domain services) | ✅ | ✅ | ✅ |

Note the last row: producers (an invitation handler enqueuing an email job) run
in **`api`**; the consumer (`JobQueueProcessor`) runs in **`worker`**. In `all`
they coexist in one process. This is the crux of §5.5's cross-process-wake
problem.

**Transitional legacy dispatcher — worker-only, not shared (C5).** During the
R1 window the shipped `InvitationEmailOutboxDispatcher` keeps running as a
drainer (§4.6). It is a `BackgroundService` and therefore a **job hosted
service** — so it must obey the same rule as the new engine: registered **only in
worker-only composition** (`JobsServiceRegistration.AddWorkerServices`), **never**
in the shared `AddInfraServices`. Registering it in shared infra would run it in
the **`api`** role too, violating D1 ("api registers no job hosted-services") and
double-claiming the outbox from both roles. **The move belongs to Phase 2B, not
2C-R1 (R2-6).** Phase 2B is the release that *introduces the role split* and the
`AddWorkerServices`/`AddInfraServices` restructure — so **2B itself** relocates
the legacy dispatcher's registration from shared infra into `AddWorkerServices`.
That way 2B can ship independently and still satisfy D1 (api has zero job hosted
services the instant the role split exists); 2C-R1 merely **retains** the
already-worker-only dispatcher and adds the new email jobs; R2 deletes it
entirely. Assigning the move to the parallel 2C-R1 packet (the round-1 placement)
would let 2B ship with the dispatcher still in shared infra — exactly the D1
violation the current 634 tip demonstrates. This is the one bounded transitional
exception to "no legacy engine in `api`," and it is closed by 2B.

**The composition spec inspects *every* `IHostedService`, not one namespace
(C5).** `AppRoleComposition.Spec.cs` (§9) enumerates **all** registered
`IHostedService` descriptors in the `Api`-role graph and asserts the set is empty
of job/worker services — including the legacy dispatcher — rather than filtering
to the `Infrastructure.Jobs` namespace. A worker service that leaks into `api`
under any namespace fails the build.

Implementation shape: `Infrastructure/Jobs/JobsServiceRegistration.cs` exposes
`AddWorkerServices(this IHostApplicationBuilder)`; `Program.Main` branches on
`AppEnvironment.Role` — `Worker` builds the Generic Host (infra + app + worker
services, no web pipeline), `Api` builds the web app without
`AddWorkerServices`, `All` builds the web app with it. Keeping worker
registrations in their own extension file (not inline in
`ServiceRegistration.AddInfraServices`) is also what lets the phases be
developed with minimal contention on `ServiceRegistration.cs` (§10).

### 3.3 Local dev

`all` is the default under the `Development` host environment; `just dev-api`
runs one process that is both api and worker, exactly as today. No new dev
workflow. Testcontainers integration tests run under `all` too, under the
`Testing` environment (the test host starts the worker hosted services, as it
started the shipped outbox dispatcher before the fold-in) — these are the
"worker-specific integration fixtures" the `all` default exists for.
**Everything that is not local dev or a worker fixture pins `APP_ROLE=api`
explicitly (C6/F24)** — the full enumerated list is in §3.1: the Dockerfile
build-time OpenAPI env block, `apps/front-2/docker-compose.test.yml`, the
`just build-api`/`generate-client` OpenAPI-drift workflow and its CI job, and
any other CI app-boot. Under production-like environments an unset `APP_ROLE`
fails fast (§3.1), so nothing can silently inherit `all`.

### 3.4 Dokploy deployment sketch

Same GHCR image, **two services**, differing only by env. Deploy **immutable
image tags** (release SHA / semver), never `:latest` (F14 — a mixed-version
fleet must be an explicit, inspectable state, not an accident of pull timing).
Add to `dokploy.yml` alongside `publyapp-api`:

```yaml
  publyapp-worker:
    image: ghcr.io/radandevist/publyapp/api:${RELEASE_TAG}   # same image as api, immutable tag
    # NO container_name: fixed names prevent `--scale` beyond one replica (F19).
    restart: unless-stopped
    stop_grace_period: 45s        # > host ShutdownTimeout (30 s) so drain wins over SIGKILL (F19)
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - APP_ROLE=worker
      - POSTGRES_CONNECTION_STRING=${POSTGRES_CONNECTION_STRING}
      - FRONT_URL=${FRONT_URL}
      # + RESEND_API_KEY, STAFF_OWNER_*, etc. (same required set as api)
    # Same named volume as the api service: worker-produced export files
    # (#213/#286, Phase 3) must be visible to the api's /files static serving —
    # without this the worker writes to its own ephemeral filesystem (F18).
    volumes:
      - publyapp-api-storage:/app/.artifacts/storage
    networks: [publyapp-network]
    # NO dokploy.domain / dokploy.port labels — worker serves no HTTP.
    healthcheck:
      test: ["CMD", "dotnet", "PublyApp.Api.dll", "--worker-health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

The existing `publyapp-api` service adds `APP_ROLE=api` and the same
`stop_grace_period: 45s`. A shared named volume is the v1 answer for exports;
object storage with durable metadata is the designed escalation if/when the
fleet spans hosts (§10 Follow-ups). Migrations continue to run via the existing
`migrate` image stage (§4) — **only one migration runner**, unchanged; neither
role runs `database update` at boot.

### 3.5 Worker health / liveness (no HTTP)

Because the worker serves no HTTP, the `/health` endpoint is unavailable there.
**Recommendation: a file-heartbeat + in-image CLI probe.**

- A lightweight `WorkerHeartbeatService : BackgroundService` touches a heartbeat
  file (e.g. `.artifacts/worker-alive`, under the already-writable `.artifacts`
  tree) every ~10 s, and only after a successful `SELECT 1` against Postgres
  (so the probe reflects DB reachability, not just "process alive").
- The container `healthcheck` runs the same assembly with a `--worker-health`
  arg (dispatched in `Program.Main` before host build, next to the existing
  `BulkSeedCli.TryRun`): exit 0 iff the heartbeat file exists and its mtime is
  within a freshness window (e.g. 60 s), else exit 1.

Why not a "non-API" health HTTP port: any bound HTTP listener contradicts D1
("serves no HTTP") and re-introduces the surface we split off. A file heartbeat
+ CLI probe needs no socket, runs entirely inside the container, and reflects
both liveness and DB connectivity. (Alternative considered: a Postgres
`worker_heartbeats` row + SQL probe — rejected as heavier for no gain, since the
probe and worker share a container and a filesystem.)

**Liveness is not observability.** The heartbeat cannot detect a growing due
backlog, a dead listener, a retry storm, or DLQ growth — those are §7's job
(F21).

### 3.6 Graceful shutdown

- Hosted services honor the host `stoppingToken`; on SIGTERM the host stops them
  cooperatively. Set `HostOptions.ShutdownTimeout` = 30 s; the container
  `stop_grace_period` (45 s, §3.4) is deliberately **longer**, so Docker's
  SIGKILL never preempts the host's own shutdown wait (F19 — Compose defaults to
  10 s, which would kill mid-shutdown).
- **Cancellation semantics stated honestly (C8).** `BackgroundService` cancels
  its `stoppingToken` the instant `StopAsync` runs — it does **not** hand
  in-flight work a separate grace budget, and this design does not pretend
  otherwise. The processor therefore does exactly this on stop:
  1. **Stops claiming** — the drain/poll loop's condition (`while
     (!stoppingToken.IsCancellationRequested)`) exits, and no new batch is
     claimed.
  2. **Cancels the in-flight handler immediately.** Each handler runs on a token
     linked to `stoppingToken`, so on shutdown it is cancelled at once; a
     cancellation whose source is the host token is classified as
     *abandon* (never a burned attempt, never DLQ — §5.1) and the row is
     **proactively released** to `Pending` (conditioned on its fencing token) so
     a restart resumes it immediately.
  3. **A handler that had already *returned* still commits.** Once a handler has
     produced its `JobOutcome`, the engine applies that outcome with
     `CancellationToken.None` (the bookkeeping is a bounded single statement), so
     a completed run is never discarded — nor its row leaked as leased — by a
     shutdown arriving between handler-return and the transition SQL.
  4. **Rows the batch loop never reached** (claimed-but-not-yet-dispatched) are
     released in a `finally` on `CancellationToken.None`.
  If the process dies before any of these releases run, the lease + fencing
  token still guarantee safe reclaim after `locked_until` passes (§6) — release
  is an optimization for restart latency, not a correctness dependency.

  > **Deliberate divergence from the challenge's suggested remedy (C8).** The
  > round-1 finding proposed an intake-stop token plus a separate force-cancel
  > *deadline* that lets in-flight handlers run to completion first. This design
  > instead **cancels in-flight work immediately and re-runs it after restart**,
  > because execution is at-least-once and every handler is idempotent (§6):
  > waiting out slow handlers (e.g. a 30 s provider call) inside the shutdown
  > window buys nothing an idempotent re-run doesn't already provide, and it
  > risks colliding with the 30 s `ShutdownTimeout`. The finding's actual defect
  > — the doc claiming a grace budget that `BackgroundService` cannot deliver —
  > is fixed by the honest semantics above; the two-token machinery is
  > intentionally not adopted.
- `SchedulerLeaderService` stands down within the same window: it calls
  `scheduler.Standby()` (confirmed no-further-firing) **before** releasing the
  advisory lock, then `Shutdown(waitForJobsToComplete: true)`; the lock releases
  on connection close. An unconfirmed standby aborts the release with the lock
  still held (fail-closed — §5.2), never a silent stand-down that could leave two
  schedulers live.
- Execution is at-least-once by design; handlers are idempotent (§6).

---

## 4. Schemas (DDL-level)

Conventions applied throughout: **snake_case columns, UUIDv7 PKs**
(`defaultValueSql: "uuidv7()"`, as in the shipped outbox migration), `timestamptz`.
All tables are created via **EF Core migrations** (the DDL below is the intended
shape, authoritative for column/index names).

**Database-time rule (F11), total:** every safety-relevant timestamp
(`next_attempt_at`, `locked_until`, `created_at`, `updated_at`, `failed_at`,
`occurred_at`) is **generated or computed in SQL from database `now()`** —
column defaults plus SQL-side arithmetic in the engine's statements. Entity
classes carry **no C# initializers** on these columns (no
`= DateTime.UtcNow`); EF maps them as database-generated/never-written where
applicable, so a skewed app clock cannot influence scheduling. See §6.

### 4.0 `BaseAttributes` stance for infra tables (explicit)

`BaseAttributes` brings `id` + `created_at` + `updated_at` + **`is_deleted` +
`deleted_at`**, and `AppDbContext.UpdateAuditFields` **auto-converts an EF
`Delete` into a soft-delete** for any `BaseAttributesNoKey` entity unless
force-hard-delete is requested.

| Table | Inherits `BaseAttributes`? | Why |
| --- | --- | --- |
| `job_queue` | **No** | Delete-on-success is a *hard* delete; the soft-delete conversion actively fights it, and `is_deleted`/`deleted_at` are dead weight on a high-churn table. Claim/complete go through **raw SQL** (bypassing `UpdateAuditFields` entirely), so the audit override buys nothing — and the DB-time rule (F11) forbids the app-side timestamp writes `UpdateAuditFields` performs. |
| `job_dead_letter` | **No** | Append-only audit trail; never soft-deleted. Explicit `id` + `created_at`/`failed_at`, DB defaults. |
| `system_job_definitions` | **Yes** | Low-churn config edited from the dashboard; `updated_at` tracking is wanted, and operational disable uses an explicit `is_enabled` flag (not deletion), so the soft-delete default is harmless. |
| `email_log` | **No** | Append-only delivery record, written once at a terminal outcome and never mutated or deleted (except by the retention sweep); `updated_at`/soft-delete are meaningless — same stance as `job_dead_letter`. |
| `email_prepared_sends` | **No** | Short-lived scratch keyed by job id (F7); inserted once, hard-deleted at the terminal outcome or by the retention sweep. |

### 4.1 `job_queue`

```sql
CREATE TABLE job_queue (
    id              uuid        NOT NULL DEFAULT uuidv7(),
    job_type        text        NOT NULL,                 -- versioned dispatch key, e.g. 'email.tenant-invitation.v1' (F14)
    payload         jsonb       NOT NULL DEFAULT '{}',
    status          integer     NOT NULL DEFAULT 0,        -- 0 Pending, 1 Processing
    priority        integer     NOT NULL DEFAULT 0,        -- higher = sooner
    attempts        integer     NOT NULL DEFAULT 0,
    max_attempts    integer     NOT NULL DEFAULT 10,       -- per-definition override (F12)
    next_attempt_at timestamptz NOT NULL DEFAULT now(),    -- scheduling + backoff live here; SQL-computed only (F11)
    locked_until    timestamptz NULL,                      -- lease; NULL when unclaimed
    locked_by       text        NULL,                      -- claiming worker/replica id
    lock_token      uuid        NULL,                      -- fencing token: new value per claim (F1)
    last_error      text        NULL,                      -- bounded + sanitized (F20): type + message, ≤2 KB, never payload/token echo
    idempotency_key text        NULL,                      -- optional in-flight dedup, scoped per job_type (F13)
    tenant_id       uuid        NULL,                      -- provenance envelope (F15)
    actor_user_id   uuid        NULL,                      --   "
    correlation_id  text        NULL,                      --   " (trace/correlation)
    requeued_from_dead_letter_id uuid NULL,                -- DLQ requeue lineage (F16/C9); NULL for originally-enqueued jobs
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),    -- set via SQL in every engine transition
    CONSTRAINT pk_job_queue PRIMARY KEY (id),
    CONSTRAINT ck_job_queue_max_attempts CHECK (max_attempts BETWEEN 1 AND 50),   -- F15: no unbounded retries
    CONSTRAINT ck_job_queue_priority     CHECK (priority BETWEEN 0 AND 1000)
);

-- Claim hot path: PENDING-ONLY partial index the claim query can use as one
-- ordered scan (F22 — stale-lease reset is a separate statement, §5.1).
CREATE INDEX ix_job_queue_claim
    ON job_queue (priority DESC, next_attempt_at, created_at, id)
    WHERE status = 0;

-- Stale-lease reset path (inline reset + RecoverStaleJobsJob).
CREATE INDEX ix_job_queue_reclaim
    ON job_queue (locked_until)
    WHERE status = 1;

-- In-flight dedup, scoped so unrelated job types can never collide (F13).
CREATE UNIQUE INDEX ux_job_queue_type_idempotency
    ON job_queue (job_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
```

```sql
-- High-churn maintenance (F21): delete-on-success produces sustained dead
-- tuples; default autovacuum triggers are scaled to table size and will lag a
-- small hot table. Aggressive per-table settings + HOT-update headroom:
ALTER TABLE job_queue SET (
    autovacuum_vacuum_scale_factor = 0.0,
    autovacuum_vacuum_threshold    = 500,
    autovacuum_analyze_scale_factor = 0.0,
    autovacuum_analyze_threshold   = 500,
    fillfactor = 90
);
```

There is deliberately **no `Succeeded`/`Failed` status**: success deletes the
row, terminal failure copies it to `job_dead_letter` and deletes it. Only
`Pending`/`Processing` are ever persisted (§6).

**Priority & fairness stance (F22):** email jobs enqueue at priority 100, bulk
work at 0, and the claim orders `priority DESC`. With two classes and low
transactional-email volume, starvation of bulk work is not a v1 risk worth
machinery; the tripwire is §7's `oldest_due_age` metric split by priority class
— if it alerts, the designed response is **priority aging** (effective priority
grows with wait time in the claim's ORDER BY), added then, not speculatively.
The claim plan is validated with `EXPLAIN (ANALYZE, BUFFERS)` at
production-like cardinality as part of Phase 2A-R's gate (F22).

**Idempotency durability (F13):** `ux_job_queue_type_idempotency` provides
**in-flight dedup only** — success deletes the row and the key with it. That is
the intended semantic for "don't double-enqueue while one is queued/running"
(e.g. a scheduler tick re-enqueueing a still-running sweep). **Permanent**
"never execute this logical work twice" dedup is owned by a **domain outcome
marker** the handler writes in its own transaction (e.g. a future
`scheduled_posts.published_at`, or `email_log`'s unique `job_id` for emails —
§4.4): the enqueue-side key dedups the queue, the domain marker dedups the
world. A job definition whose consumer has no natural outcome marker must add
one (or a dedicated dedup ledger table) as part of that consumer's design —
this is a stated obligation on every future job definition, not an engine
afterthought.

**External side effects need more than a domain marker (C10/F13).** A domain
outcome marker (`scheduled_posts.published_at`) dedups *within the database*, but
it **cannot be committed atomically with a call to an external provider** — a
crash after the provider accepts but before the marker commits re-runs the job
and publishes twice. So **every job with an external, non-transactional side
effect** (email, webhook, Epic D provider publishing) must satisfy the stronger
contract the email handlers model (§4.5/§5.4): a **stable provider idempotency
identity** (or a reconciliation protocol), an **immutable prepared request**
persisted before the call, and a **persisted receipt** after it — so a retry
either dedups at the provider or is reconciled against the recorded receipt, with
the domain marker only the local fast-path. This is a hard obligation on the
job's design, not the engine's. For **#646 / Epic D Bluesky publishing** the later
D3 design **must** use a deterministic record key (a client-chosen `rkey`, so a
re-`createRecord` collides instead of duplicating) or an equivalent
list-records/conflict reconciliation before write; `published_at` alone is
explicitly **insufficient** and is flagged as such here so D3 cannot inherit the
gap.

### 4.2 `job_dead_letter`

DLQ rows preserve the **full envelope + lineage** so a requeue reproduces the
original job faithfully (F16):

```sql
CREATE TABLE job_dead_letter (
    id              uuid        NOT NULL DEFAULT uuidv7(),
    original_job_id uuid        NOT NULL,       -- lineage
    job_type        text        NOT NULL,       -- versioned type, as enqueued
    payload         jsonb       NOT NULL,
    priority        integer     NOT NULL,       -- envelope preserved (F16)
    max_attempts    integer     NOT NULL,       --   "
    idempotency_key text        NULL,           --   "
    tenant_id       uuid        NULL,           --   " (provenance)
    actor_user_id   uuid        NULL,           --   "
    correlation_id  text        NULL,           --   "
    enqueued_at     timestamptz NOT NULL,       -- original job_queue.created_at
    attempts        integer     NOT NULL,
    last_error      text        NULL,           -- bounded + sanitized (F20)
    locked_by       text        NULL,           -- which worker exhausted it
    requeued_from_dead_letter_id uuid NULL,     -- lineage IN: the prior DLQ row this job was requeued from (F16/C9)
    requeued_as_job_id           uuid NULL,     -- lineage OUT: the job_queue.id a staff requeue produced from this row (set on requeue)
    requeued_at                  timestamptz NULL, -- when this row was requeued
    failed_at       timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_job_dead_letter PRIMARY KEY (id)
);

CREATE INDEX ix_job_dead_letter_job_type ON job_dead_letter (job_type, failed_at);
-- Follow the requeue chain backward/forward across re-dead-letterings (F16/C9).
CREATE INDEX ix_job_dead_letter_requeued_from
    ON job_dead_letter (requeued_from_dead_letter_id)
    WHERE requeued_from_dead_letter_id IS NOT NULL;
```

> Named `job_dead_letter` (per the ratified schema list), **renaming #194's
> `dead_letter_jobs`** for a consistent `job_` prefix across the engine tables.

**Requeue contract (F16/C9 — binds Phase 4, specified build-grade here).**
Requeue is **server-side only** and does **not** go through the typed
`IJobEnqueuer.EnqueueAsync<TPayload>` path — that path derives priority /
`max_attempts` from the *definition* and re-stamps provenance from the *current
request*, so it cannot faithfully restore a stored envelope (C9). Instead the
engine exposes a dedicated privileged operation:

```csharp
// Infrastructure/Jobs — engine-only; never callable by producers.
Task<Guid> RequeueDeadLetterAsync(Guid deadLetterId, RequeueContext ctx, CancellationToken ct);
```

Its contract, all in **one transaction**:

- **Load** the `job_dead_letter` row by id.
- **Single-use guard, atomic (R2-7).** Requeue is conditioned on the DLQ row not
  already having been requeued: the stamp is
  `UPDATE job_dead_letter SET requeued_as_job_id = {newId}, requeued_at = now()
  WHERE id = {deadLetterId} AND requeued_as_job_id IS NULL` with an
  affected-row-count check. **Zero rows ⇒ already requeued ⇒ the whole operation
  aborts** (clear error, no new job). Without this, once the first requeued job
  completes and releases its `(job_type, idempotency_key)` in-flight key, the same
  ancestor DLQ row could mint a *second* job and overwrite its own
  `requeued_as_job_id` — the guard makes an ancestor requeueable **exactly once**.
- **Re-failures requeue from their own new DLQ row, never the ancestor (R2-7).**
  If a requeued job fails again it dead-letters into a **new** DLQ row carrying
  `requeued_from_dead_letter_id = {ancestor}`; a further requeue operates on
  *that* new row (again once), walking the chain forward — the ancestor is never
  requeued repeatedly.
- **Validate dispatchability + payload through a type-erased registration
  (R2-7).** `RequeueDeadLetterAsync` handles an *arbitrary stored `job_type` +
  JSON string*; it cannot call the generic `JobDefinition<TPayload>` directly. It
  resolves the `job_type` in the unified **`JobRegistration`** registry (§5.1),
  whose entry exposes a **non-generic `ValidatePayloadJson(string json)`** (a
  closure bound to the concrete `TPayload` that runs the canonical `JobJson`
  deserialize + the F2 required-member/empty-ID checks) alongside the handler
  factory. An unregistered/retired `job_type` **fails with a clear error** (no
  undispatchable enqueue); a payload that fails `ValidatePayloadJson` is
  **rejected, not resurrected**.
- **Restore the approved envelope verbatim** into a new `job_queue` row —
  `payload`, `job_type`, `priority`, `max_attempts`, `idempotency_key`,
  `tenant_id`, `actor_user_id`, `correlation_id` all copied from the DLQ row
  (**nothing client-supplied, no re-stamp from the staff requester**), with
  `attempts = 0`, `status = Pending`, `next_attempt_at = now()`.
- **Chain the lineage (C9):** the new row's `requeued_from_dead_letter_id` is
  set to `deadLetterId`. `JobDeadLetter.FromJob` **copies
  `requeued_from_dead_letter_id` forward**, so a requeued job that dead-letters
  again preserves the full chain back to the original failure (the
  `ix_job_dead_letter_requeued_from` index walks it).
- **Audit atomically** — an immutable `AuditLog` entry (existing machinery)
  recording actor, DLQ id, and new job id commits in the same transaction as
  the insert; a failed enqueue rolls the audit back and vice-versa.

Guards: a dedicated high-gravity permission (`staff:jobs:dead-letter:requeue`);
**no client payload override and no payload editing surface** (an editable
payload would be an arbitrary-work execution primitive). Raw payloads are
**viewable** in the dashboard only under a *separate* read permission, since DLQ
payloads may reference tenant data (F20). A `NOTIFY job_queue` fires at commit
so the requeued row is picked up immediately (§5.5).

**Retention (F20):** DLQ rows older than `JOB_DEAD_LETTER_RETENTION_DAYS`
(default 90; O7) are hard-deleted by the retention sweep system job (§7.3).

### 4.3 `system_job_definitions`

```sql
CREATE TABLE system_job_definitions (
    id               uuid        NOT NULL DEFAULT uuidv7(),
    job_key          text        NOT NULL,     -- stable id, e.g. 'session-cleanup'
    cron_expression  text        NOT NULL,     -- Quartz cron
    is_enabled       boolean     NOT NULL DEFAULT true,
    description      text        NULL,
    last_enqueued_at timestamptz NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    is_deleted       boolean     NOT NULL DEFAULT false,   -- BaseAttributes
    deleted_at       timestamptz NULL,
    CONSTRAINT pk_system_job_definitions PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ux_system_job_definitions_job_key
    ON system_job_definitions (job_key)
    WHERE is_deleted = false;
```

`SyncSystemJobsJob` reconciles `is_enabled = true AND is_deleted = false` rows
into the leader's in-memory Quartz scheduler every 60 s. Operators disable a job
by flipping `is_enabled`, not by deleting.

**`job_key` is a stable dashboard identity, not a queue `job_type` (C4).** Every
`job_queue.job_type` is versioned (§4.1/F14); `system_job_definitions.job_key` is
deliberately **not** — it is the durable, dashboard-editable name an operator
sees (`session-cleanup`), stable across payload-version bumps. The two are bridged
by the **`SystemJobCatalog`** (§5.3): `job_key` → the versioned `JobDefinition`
(e.g. `session-cleanup` → `job_type = system.session-cleanup.v1`) plus its payload
factory and cron policy. A `job_key` with **no catalog entry** is rejected: the
seeder never creates one, and `SyncSystemJobsJob` **skips and warns** (does not
schedule) any enabled row whose `job_key` is not in the catalog, so a stray DB row
can never schedule an undispatchable job. This is why the schema stores only
`job_key`/`cron_expression`/`is_enabled` and no payload or `job_type` column — the
catalog owns that mapping in code, versioned with the handlers.

**`system_job_occurrences` — durable occurrence identity (R2-1).** Recurring
dedup **cannot** live in `job_queue.idempotency_key`: success *deletes* the queue
row, so a delayed duplicate firing of the same scheduled tick after the first job
completed would see no row and enqueue again. The occurrence identity therefore
lives in its **own durable table that outlives queue deletion**:

```sql
CREATE TABLE system_job_occurrences (
    job_key           text        NOT NULL,   -- system_job_definitions.job_key
    scheduled_fire_at timestamptz NOT NULL,   -- the trigger's SCHEDULED fire time (UTC), quantized to cron granularity
    enqueued_job_id   uuid        NULL,       -- the job_queue.id enqueued for this occurrence (informational)
    enqueued_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_system_job_occurrences PRIMARY KEY (job_key, scheduled_fire_at)
);

-- Retention prune walks past occurrences by time (R2-1; O9).
CREATE INDEX ix_system_job_occurrences_scheduled_fire_at
    ON system_job_occurrences (scheduled_fire_at);
```

The `(job_key, scheduled_fire_at)` **primary key** is the permanent occurrence
identity. `EnqueueSystemJobJob` writes this row **in the same transaction** as the
`IJobEnqueuer` enqueue (§5.3): `INSERT … ON CONFLICT (job_key, scheduled_fire_at)
DO NOTHING` — **zero rows inserted ⇒ this occurrence was already enqueued** (even
if that earlier job has since completed and been deleted), so the transaction
enqueues nothing and commits a no-op. This is durable, restart-surviving dedup the
queue key cannot provide. The table is pruned to a bounded window by a retention
sweep (§7.3; default 30 days — long enough to dedup any re-fire, short enough not
to accumulate — O9).

### 4.4 `email_log` (append-only delivery record — day one)

Written by email job handlers (and the engine's terminal-failure hook, §5.4) on
**terminal outcomes only**. Never mutated; deleted only by the retention sweep.
The queue stays delete-on-success and this table is where email history lives.

```sql
CREATE TABLE email_log (
    id                  uuid        NOT NULL DEFAULT uuidv7(),
    job_id              uuid        NULL,       -- job_queue.id that produced this outcome
    legacy_outbox_id    uuid        NULL,       -- fold lineage: source invitation_email_outbox.id (§4.6)
    kind                integer     NOT NULL,   -- EmailKind: 0 TenantInvitation, 1 StaffInvitation, 2 PasswordReset, …
    recipient           text        NOT NULL,
    outcome             integer     NOT NULL,   -- EmailLogOutcome: 0 Submitted, 1 CancelledIneligible, 2 PermanentlyFailed, 3 LegacySubmissionUnverified (R2-3)
    invitation_id       uuid        NULL,       -- related entity ids; no FK constraints (see below)
    user_id             uuid        NULL,
    provider_message_id text        NULL,       -- provider correlation (F3/F20)
    request_sha256     text        NULL,       -- sha256 of the exact provider request bytes sent (F7/R2-2)
    attempts            integer     NOT NULL DEFAULT 0,
    last_error          text        NULL,       -- bounded + sanitized (F20)
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_email_log PRIMARY KEY (id)
);

CREATE INDEX ix_email_log_kind_occurred_at ON email_log (kind, occurred_at);
CREATE INDEX ix_email_log_recipient_occurred_at ON email_log (recipient, occurred_at);  -- the support query (F20)
CREATE INDEX ix_email_log_invitation_id ON email_log (invitation_id)
    WHERE invitation_id IS NOT NULL;
CREATE INDEX ix_email_log_user_id ON email_log (user_id)
    WHERE user_id IS NOT NULL;

-- One terminal outcome per job: doubles as the handler's idempotency marker
-- (§5.4 — a reclaimed job whose Submitted row already exists must not resend).
CREATE UNIQUE INDEX ux_email_log_job_id ON email_log (job_id)
    WHERE job_id IS NOT NULL;

-- One historical row per source outbox row: makes the R1/R2 back-copy idempotent
-- and re-run-safe across migration steps (F4/C3).
CREATE UNIQUE INDEX ux_email_log_legacy_outbox_id ON email_log (legacy_outbox_id)
    WHERE legacy_outbox_id IS NOT NULL;
```

Design notes:

- **`Submitted`, not "Sent" (F20, honesty):** outcome 0 means **the provider
  accepted the send request** — it says nothing about inbox delivery.
  Delivered/bounced/complaint tracking requires provider webhooks and is a
  designed follow-up (§10), not implied by this table. UI copy must say
  "submitted to provider".
- **`LegacySubmissionUnverified` (outcome 3), never `Submitted`, for folded
  legacy `Sent` rows (R2-3).** The old outbox's `Sent` status is **not evidence
  of provider acceptance**: F3 records that `ResendEmailAdapter` returned
  `Success = false` on rejection, `EmailService` discarded that result, and the
  dispatcher marked the row `Sent` regardless — so a legacy `Sent` row may in
  fact be a *rejected* send. Mapping it to `Submitted` ("provider accepted")
  would manufacture authoritative success history from rows known not to support
  it. The fold therefore migrates legacy `Sent` → **`LegacySubmissionUnverified`**
  (§4.6), a distinct outcome the dashboard renders as "legacy — delivery
  unverified" and that no metric counts as a confirmed submission. Provider-side
  reconciliation (if Resend logs are ever imported) may later upgrade specific
  rows; absent evidence they stay unverified. Only handlers running the *corrected*
  F3 contract (§5.4) ever write `Submitted`.
- **No FK constraints** on `invitation_id`/`user_id` (plain indexed uuid
  columns): an audit-trail table must outlive — and never block — the lifecycle
  of the rows it references (hard-delete sweeps, future data-erasure flows).
- **Privacy / retention / access (F20):** recipient addresses are personal
  data. Rows older than `EMAIL_LOG_RETENTION_DAYS` (default 180; O7) are
  hard-deleted by the retention sweep system job (§7.3). `last_error` is
  bounded (exception type + message, ≤2 KB) and must never echo tokens, payload
  JSON, or full provider responses. Dashboard access (Phase 4) sits behind its
  own staff permission; the table never stores email bodies — `request_sha256`
  is a fingerprint, the token lives only in the short-lived scratch (§4.5).
- `kind` values **preserve the shipped enum**: `InvitationEmailKind
  { TenantInvitation = 0, StaffInvitation = 1 }` extends to `EmailKind
  { TenantInvitation = 0, StaffInvitation = 1, PasswordReset = 2, … }`, so rows
  copied from `invitation_email_outbox` during the fold keep their meaning.
- `job_id` is NULL and `legacy_outbox_id` is set for rows back-copied from the
  historical outbox during the fold (§4.6) — `legacy_outbox_id` also makes the
  back-copy idempotent across migration steps.

### 4.5 `email_prepared_sends` (send-once scratch — F7)

The provider (Resend) deduplicates on idempotency key **only for 24 hours and
only for byte-identical payloads**. Reloading mutable domain state on each
attempt (tenant renamed, token rotated) would make a retry after a lost
response carry *different* content under the same key → provider 409 or, past
24 h, a duplicate send. Fix: the request is **rendered and its exact wire bytes
persisted exactly once per job**, and retries resend those stored bytes.

```sql
CREATE TABLE email_prepared_sends (
    job_id                   uuid        NOT NULL,   -- the email job this envelope belongs to
    request_body             bytea       NOT NULL,   -- the EXACT UTF-8 provider request body sent on the wire (C1/R2-2)
    request_sha256           text        NOT NULL,   -- sha256(request_body) — the fingerprint carried into email_log
    provider_idempotency_key text        NOT NULL,   -- stable per job (derived from job_id)
    prepared_at              timestamptz NOT NULL DEFAULT now(), -- when PREPARE committed (row existence = commit proof; R2-12)
    CONSTRAINT pk_email_prepared_sends PRIMARY KEY (job_id)
);
```

**Row existence *is* the PREPARE-committed proof (R2-12).** There is **no
`prepared_committed` flag** — another transaction cannot see an uncommitted
insert, and every insert would set it true, so the column could never distinguish
the two lifecycle states. The presence of a committed `email_prepared_sends` row
for a `job_id` means PREPARE committed; its absence means it did not. `prepared_at`
is retained only because it is operationally useful (the orphan-floor age, §7.3).

**Why `bytea`, and a *transport* serializer — not `JobJson` (R2-2/C1).** The
prepared body must be the **exact bytes written to the provider HTTP request**;
`jsonb` normalizes key order/whitespace and could not preserve them. Critically,
`JobJson` is the **job-payload** serializer (it serializes `{"invitationId":…}`
queue payloads) — it is **not** the Resend request serializer, so it cannot
produce the provider's request body. The design therefore adds a dedicated
**provider-request transport boundary**:

```csharp
// Infrastructure/Messaging/Email — the byte-faithful send path (R2-2).
Task<EmailSendReceipt> SendPreparedAsync(
    ReadOnlyMemory<byte> requestBody,   // the persisted email_prepared_sends.request_body, verbatim
    string idempotencyKey,              // the job-stable provider idempotency key
    CancellationToken ct);
```

`SendPreparedAsync` writes `requestBody` **directly to the provider POST body**
(`Content-Type: application/json`, `Idempotency-Key: {idempotencyKey}`) — it does
**not** re-serialize a semantic object, so the persisted bytes *are* the wire
bytes, and `request_sha256` provably fingerprints what was sent. `request_body`
is produced **once** at PREPARE by a small transport serializer
(`ResendEmailRequest.SerializeCanonical(...)` in the email adapter, deterministic
member order) — the same code path `SendPreparedAsync` consumes.

> **Honest fallback if the SDK cannot be bypassed (R2-2).** If the Resend .NET SDK
> genuinely cannot accept a raw body, the design **weakens the claim honestly**:
> `request_body` stores the SDK's own canonical serialization of a *frozen*
> request object (all fields fixed at PREPARE), retries reconstruct that identical
> object, and the guarantee is stated as "provider-supported canonical request,
> byte-stable under the SDK's serializer" rather than "raw wire bytes." Either way
> the retry never re-renders mutated domain state. `SendPreparedAsync` is the
> preferred, provable form; Phase 2C picks one and the spec asserts byte/field
> stability across a simulated domain mutation.

**Two-phase lifecycle (C1) — a committed PREPARE, then a locked SEND:**

1. **PREPARE transaction (commits before any provider call).** On the first
   attempt the handler renders the request from fresh domain state, serializes it
   to `request_body`, and `INSERT … ON CONFLICT (job_id) DO NOTHING`, then
   **commits**. Because this commit precedes the network call, a crash *after*
   the provider accepts but *before* the send transaction commits leaves the
   prepared bytes durably on disk — the retry re-sends the **same** bytes rather
   than re-rendering mutated state (the exact failure C1 flags). A subsequent
   attempt that **finds a committed row** skips rendering entirely and reads the
   stored bytes back.
2. **SEND transaction (separate, locked).** A second transaction takes the domain
   row lock, does the eligibility recheck **and re-checks `email_log(job_id)`
   immediately before network I/O** (R2-2 local-race close, §5.4), calls
   `SendPreparedAsync` with the stored bytes, and on acceptance writes
   `email_log(Submitted)` + deletes the scratch row. **On a *transient* provider
   failure the scratch row is left committed** so the retry reuses it; only a
   terminal outcome deletes it.

**Cleanup is a live-state anti-join, never age alone (C1).** "Orphan" is defined,
not assumed: the `email-prepared-sends-retention` sweep (§7.3) may delete a row
**only when its `job_id` exists in neither `job_queue` nor `job_dead_letter`**
(the job is fully resolved and gone) **and** the row is older than a safety floor
(7 days). A live job's envelope can never be swept out from under it regardless
of age — the anti-join is the gate, the age is only a secondary backstop against
truly-leaked rows. Because the bytes contain a live token, the floor is kept
short, but correctness rests on the anti-join.

**The honest delivery guarantee (F7):** email delivery is **at-least-once with
a bounded no-duplicate window** — within 24 h of first provider acceptance,
byte-identical retries under the stable key are deduplicated by the provider;
beyond 24 h (a job stuck in retry that long has hit the DLQ under the default
schedule anyway), or if the provider's dedup fails, a duplicate is possible.
`email_log`'s unique `job_id` additionally guarantees this system never
*accounts* a job as submitted twice, and `provider_message_id` +
`request_sha256` make any duplicate investigable. Unconditional exactly-once
is not claimed anywhere.

### 4.6 Migration path — expand/contract fold of `invitation_email_outbox` (F4)

**Supersedes the previously ratified rename+extend (O1).** The previous
single-migration "fold and drop in one shot" claim was **wrong for any window
with a live old dispatcher**: a shipped dispatcher can hold a `Processing` row
*inside a provider send* (with **no** idempotency key) at the moment a
migration re-enqueues that row as a new job — if its send succeeds but the
table drops before its final save, the new job sends again. "Early re-claim is
safe" holds *within* one system's crash-recovery semantics, not *across* the
old/new systems during a mixed-version cutover. The rollout is therefore
expand/contract across **two releases**:

**Release R1 (Phase 2C):**

1. Migration `AddEmailLogAndFoldEmailOutbox`:
   - Create `email_log` (§4.4) + `email_prepared_sends` (§4.5).
   - **Fold `Pending` rows first, with a DISTINCT "folded" state — never a fake
     `Cancelled` (C3).** The bridge state that keeps the old dispatcher off a
     folded row must be **distinguishable from a genuine cancellation** so it is
     never mistaken for delivery history. Fold `Pending` rows only into
     `job_queue`: `job_type` mapped from `kind`
     (`email.tenant-invitation.v1` / `email.staff-invitation.v1`), payload built
     **in SQL to the canonical wire shape** (F2):
     `jsonb_build_object('invitationId', invitation_id)`; `attempts =
     attempt_count`, `next_attempt_at` preserved; email priority;
     `idempotency_key = 'fold:' || id` (the **source-row marker** — under the
     `(job_type, idempotency_key)` unique index a re-run cannot duplicate a
     fold). In the same statement flow, move each folded source row out of
     `Pending` and stamp the **reserved sentinel** `last_error =
     '__folded_to_job_queue__'` so (a) the old dispatcher can never also send it
     and (b) the back-copy below can recognize and **exclude** it. This sentinel
     is a bridge marker, **not** a delivery outcome.
   - **Back-copy GENUINE terminal history only (C3/O6/R2-3).** `INSERT INTO
     email_log … SELECT` every outbox row that is a *real* delivery outcome —
     `Sent` (→ **`LegacySubmissionUnverified`**, never `Submitted` — R2-3;
     `occurred_at = sent_at`), `Failed` (→ `PermanentlyFailed`,
     `occurred_at = updated_at`, carrying `attempt_count`), or a
     genuinely-`Cancelled` row **whose `last_error` is not the fold sentinel**
     (→ `CancelledIneligible`, `occurred_at = updated_at`). Rows carrying
     `'__folded_to_job_queue__'` are **excluded** — their outcome is the new
     `job_queue` job, not a cancellation. Explicit **legacy timestamp mapping**:
     `Sent → sent_at`; `Failed`/`Cancelled → updated_at`.
   - **Historical errors: a SQL-side stable code, never a C#-sanitized copy
     (R2-8).** An `INSERT … SELECT` migration cannot call the C# static
     `JobErrorSanitizer`, so the R1 round-1 wording ("passed through
     `JobErrorSanitizer`") was not executable. The fold instead writes a **stable
     migration code** into `email_log.last_error` — a fixed literal per source
     status (`'legacy-import:failed'` for `Failed`, `NULL` otherwise) — and does
     **not** copy the raw legacy `last_error` at all (its diagnostic value is low
     and it may hold unsanitizable PII/tokens). If an operator later decides the
     raw text must be preserved, the migration may instead apply an **explicitly
     defined SQL redaction function** (`regexp_replace` for email/token shapes +
     `left(…, 2048)`) — named and reviewed in the migration — but the default is
     the stable code. `legacy_outbox_id` is stamped on every copied row; the
     `ux_email_log_legacy_outbox_id` unique index (§4.4) makes the copy idempotent
     and re-run-safe (`ON CONFLICT (legacy_outbox_id) DO NOTHING`).
     *(Recommendation — O6; the alternative is dropping history with the table.)*
   - **`Processing` rows are NOT touched** — they may be inside a live
     old-dispatcher send. They drain via step 2.
   - A `Pending` row with `invitation_id IS NULL` (pre-linkage legacy shape;
     expected count **zero**) cannot become an ID-payload job: route it to
     `email_log` as `CancelledIneligible` with an explanatory `last_error`.
2. R1 code: producers write `job_queue` email jobs (§5.4); **the old dispatcher
   ships in R1 and keeps running as a drainer, registered worker-only**
   (`AddWorkerServices`, never shared `AddInfraServices` — §3.2/C5, so it never
   runs in the `api` role) — it sees no new rows (producers stopped writing;
   Pending rows were folded) and finishes or lease-reclaims its remaining
   `Processing` rows with the old semantics. No
   row is ever owned by both systems: folded rows are `Cancelled` to the old
   dispatcher, unfolded `Processing` rows are invisible to the new one.

**Release R2 (small follow-up, same night or next deploy):**

3. Migration `DropInvitationEmailOutbox`:
   - **Precondition — prove producer quiescence, not just data drain (R2-5).**
     Zero `Pending`/`Processing` rows proves the *table is drained*; it does
     **not** prove that no old (pre-R1) API or worker binary is still capable of
     *inserting* into or *claiming* the table. R2 is gated on an **explicit,
     inspectable fleet precondition first**: *every running API and worker replica
     is on an R1-or-newer immutable image tag, and every pre-R1 binary is gone* —
     verified from the deployment's image-tag/rollout state (§3.4 immutable tags),
     recorded in the release checklist. Only once the fleet is confirmed
     R1-or-newer does the migration proceed to the row-level lock/check below.
   - **Blocked-old-producer analysis (R2-5).** If — against the precondition — a
     pre-R1 producer is still live, it blocks behind the `ACCESS EXCLUSIVE` lock,
     then its `INSERT` fails when the table is dropped, **rolling back the whole
     invitation request** (the caller gets an error, no half-written state). That
     is *not* silent data loss, but it *is* a visible failed request — which is
     why the fleet precondition above (not the lock alone) is the real gate: the
     lock prevents corruption, the precondition prevents the failed request.
   - **Take an exclusive table lock, then verify total quiescence regardless of
     age (C2).** `LOCK TABLE invitation_email_outbox IN ACCESS EXCLUSIVE MODE`
     first — this blocks the drainer from claiming/transitioning a row during the
     check-then-drop, closing the TOCTOU window. Then **fail the migration (abort
     the deploy) if *any* `Pending` OR `Processing` row exists, of *any* age.**
     The previous "younger than the lease window" predicate was exactly wrong: a
     stale `Processing` row **older** than the lease is precisely the row the R1
     drainer must still reclaim and finish — dropping it would lose unsent work.
     Only `count(Pending) = 0 AND count(Processing) = 0` proves the drain is
     complete; anything else means the operator must wait, not drop.
   - Under the same lock, back-copy any **genuine** terminal rows created during
     the R1 window — the identical genuine-outcome `SELECT` as R1 step 1 (`Sent`
     → `LegacySubmissionUnverified`; fold sentinel `'__folded_to_job_queue__'`
     excluded; `last_error` = SQL-side stable code, never raw — R2-8; idempotent
     via the `legacy_outbox_id` unique index) — then
     `DROP TABLE invitation_email_outbox`. Because the fold sentinel is excluded
     in both R1 and R2, a folded email acquires **exactly one** record: its new
     `job_queue` outcome, never a spurious `CancelledIneligible` (C3).
   - Specs must cover: a **fresh** `Processing` row, a **stale** (older than the
     lease) `Processing` row, and a **fresh `Pending` row inserted by an old
     producer** mid-R1 — each must abort the drop (C2).
4. R2 code: delete `InvitationEmailOutboxDispatcher` (+ spec), the signal, and
   the entity.

**Single-node shortcut (documented, optional):** on the current single-node
Dokploy deploy, an operator who stops the old containers **before** running
migrations has no in-flight send by construction and may run R1+R2's DDL in one
release at the cost of a brief outage. This is an explicit operator choice with
a stated precondition — the default pipeline (migrate stage runs while old
containers still serve) does **not** satisfy it, which is exactly why
expand/contract is the default path.

---

## 5. Components

### 5.1 `JobQueueProcessor` (`Infrastructure/Jobs/JobQueueProcessor.cs`)

A `BackgroundService` running on **every** worker instance (not leader-gated).
Structure mirrors the shipped `InvitationEmailOutboxDispatcher` — same
public-method-for-determinism discipline.

- **Stale-lease reset + claim — two statements, both on database time (F22,
  F11).** Each cycle first releases expired leases (cheap, uses
  `ix_job_queue_reclaim`), then claims from a **pending-only** predicate the
  partial claim index serves as one ordered scan:

  ```sql
  -- 1. reset expired leases (also run by RecoverStaleJobsJob):
  UPDATE job_queue
  SET status = 0, lock_token = NULL, locked_until = NULL, locked_by = NULL,
      updated_at = now()
  WHERE status = 1 AND locked_until <= now();

  -- 2. hot claim (pending-only; priority order with total tie-break):
  UPDATE job_queue
  SET status = 1,
      locked_until = now() + make_interval(secs => {leaseSeconds}),
      locked_by = {workerId},
      lock_token = {freshToken},          -- new uuid per claim (F1)
      updated_at = now()
  WHERE id IN (
      SELECT id FROM job_queue
      WHERE status = 0 AND next_attempt_at <= now()
      ORDER BY priority DESC, next_attempt_at, created_at, id
      LIMIT {batchSize}
      FOR UPDATE SKIP LOCKED
  )
  RETURNING id, lock_token;
  ```

  Public `static ClaimBatchAsync(...)` so specs can race two claimers directly.

  **Dispatch order is a separate ordered re-query, not `RETURNING` order
  (C16/F9).** PostgreSQL does **not** guarantee the row order of `UPDATE …
  RETURNING`, so the claim's `RETURNING id, lock_token, job_type` is treated as
  an unordered set. Before dispatch the engine **re-queries the claimed ids with
  an explicit `ORDER BY priority DESC, next_attempt_at, created_at, id`** (the
  same total order the claim's inner `SELECT` used) and executes in that order:

  ```sql
  SELECT * FROM job_queue
  WHERE id = ANY({claimedIds})
  ORDER BY priority DESC, next_attempt_at, created_at, id;
  ```

  Execution therefore **provably preserves the claim's priority order** — the
  F9 priority reversal (execution re-sorting ascending) is structurally
  impossible, and an execution-order spec (§9) asserts it against a mixed-priority
  batch. Relying on `RETURNING` order is called out as forbidden precisely
  because it would silently regress on a planner change.

- **Lease fencing & renewal (F1).** `lock_token` is the fencing token: a fresh
  uuid stamped at claim. **Every** subsequent transition is conditioned on it
  and checks the affected-row count:

  ```sql
  -- success:
  DELETE FROM job_queue WHERE id = {id} AND lock_token = {token};
  -- retry:
  UPDATE job_queue
  SET status = 0, attempts = attempts + 1, last_error = {boundedError},
      next_attempt_at = now() + make_interval(secs => {delaySeconds}),
      lock_token = NULL, locked_until = NULL, locked_by = NULL, updated_at = now()
  WHERE id = {id} AND lock_token = {token};
  -- DLQ: hook write + INSERT job_dead_letter + conditioned DELETE, one transaction.
  -- renewal (while the handler runs, at lease/2 cadence):
  UPDATE job_queue
  SET locked_until = now() + make_interval(secs => {leaseSeconds}), updated_at = now()
  WHERE id = {id} AND lock_token = {token}
  RETURNING locked_until, now();   -- DB-computed deadline + DB clock drive the safety margin (R2-4)
  ```

  **Zero affected rows = the lease was lost** (another worker reclaimed after
  expiry): the engine cancels that handler's linked `CancellationTokenSource`,
  discards its outcome, and logs a `lease_lost` event — it can never
  delete/reset work now owned by the new claimant. Batch semantics: the claim
  leases the whole batch, the engine **re-stamps the row's lease immediately
  before dispatching each job** (so job #20 of a slow batch doesn't start with
  an almost-expired lease), and a renewal loop re-stamps at `lease/2` intervals
  while a handler runs.

  **Renewal-failure semantics — confirmed loss vs. transient error, with a DB
  safety margin (C7/R2-4).** A renewal outcome is *not* binary; the loop
  distinguishes two failure kinds and tracks the **last confirmed *database*
  lease deadline** — not a local stopwatch. Each successful renewal
  `UPDATE … RETURNING locked_until, now()` returns the **DB-computed** new
  deadline and the **DB clock**; the loop stores `confirmedDbDeadline =
  locked_until` and the observed DB↔app skew. Abandonment is judged against that
  DB deadline, minus a margin — never against a local "full lease window" timer:
  - **Confirmed loss** — the renewal returns **zero affected rows**. Ownership
    definitively belongs to a new claimant; the handler is cancelled at once
    (`leaseLostSource`) and the outcome discarded. This is the only *certain*
    signal, and it acts immediately.
  - **Transient error** — the renewal statement *threw* (a DB hiccup, a dropped
    connection): ownership is **unknown**, not lost. The loop **retries on a
    short bounded interval (`lease/8`, floor 0.25 s)** on a fresh
    scope/connection — but only **while there is still a safe margin left before
    the confirmed DB deadline**. It **abandons (cancels the handler) *before*
    `confirmedDbDeadline − safetyMargin` is reached**, where `safetyMargin`
    covers the expected DB round-trip plus a buffer (design default:
    `max(2 s, lease/20)`, tunable). It does **not** wait until at or after the
    lease actually expires — because at that point the DB lease may already have
    been reclaimed and another worker may already be executing, and fencing
    protects only *settlement*, not a **concurrent external side effect** already
    in flight in this handler. Abandoning early trades a rare redundant re-run
    (safe, at-least-once) for never overlapping two live executions.

  A connection exception therefore never triggers an instant cancel, yet the
  handler is always cancelled with margin to spare before the real lease
  boundary. This closes both F1 failure modes — expired-mid-run clobber and
  serial-batch lease exhaustion — *and* the C7/R2-4 renewal-margin gap. The §9
  spec adds a case: **a transient renewal outage spanning the safety deadline
  while a second worker reclaims the row → the first handler is cancelled before
  the reclaim's lease begins, and its settlement no-ops on the fence.**

  > **Known code-alignment item (R2-4, captain's reconciliation round).** The
  > `feat/633-job-queue-core` tip's `RenewLeaseLoopAsync` currently uses a local
  > `sinceConfirmedStamp` stopwatch and cancels only after a *full* lease window,
  > and does not `RETURNING` the DB deadline. **This document specifies the
  > correct contract** (DB-returned deadline + `safetyMargin`, abandon-before-
  > expiry); the 633 implementation is a **known gap to reconcile** — not a doc
  > defect. It is listed for the captain's code-reconciliation round.

- **Drain loop (F10).** After processing a batch, the processor claims again
  **immediately while the previous batch was full**, and only waits on
  signal/poll once a batch comes back short or empty. One coalesced NOTIFY
  therefore drains an entire backlog, not one batch per poll tick. The drain is
  bounded by `JOB_QUEUE_DRAIN_BUDGET_SECONDS` (default 60): on budget expiry
  the loop yields one iteration (re-checks `stoppingToken`, emits its metrics
  heartbeat) and resumes — a full queue can never starve shutdown or
  observability. `stoppingToken` is checked between every job.

- **Dispatch — trusted boundary in, registry out (F15, F14, F2).**
  - **Enqueue side:** producers never touch `DbSet<JobQueueItem>` or raw SQL.
    The only write path is `IJobEnqueuer` (scoped; takes the caller's
    `AppDbContext` so the insert **joins the caller's transaction**):

    ```csharp
    Task<Guid> EnqueueAsync<TPayload>(
        JobDefinition<TPayload> definition, TPayload payload,
        EnqueueOptions? options = null, CancellationToken ct = default);
    ```

    `JobDefinition<TPayload>` entries live in **static catalogs** beside their
    handlers (e.g. `InvitationEmailJobs.TenantInvitationV1`) and own: the
    versioned `job_type` string, default priority and `max_attempts`, payload
    validation (**required members present, no `Guid.Empty` IDs** — F2), and
    serialization through the canonical serializer. **There is no per-definition
    lease (C15):** the lease is a single global `JOB_LEASE_SECONDS` used by the
    claim, per-dispatch re-stamp, renewal, and stale-reset alike — `job_queue`
    has no lease-duration column and `JobDefinition` exposes none, so the
    envelope, claim, renewal, and DLQ paths all read one value. (Per-definition
    tuning is `max_attempts` only, which *is* a column and *is* preserved on the
    DLQ envelope.) The enqueuer
    stamps provenance (`tenant_id`, `actor_user_id` from `IRequestAuthContext`
    when present; `correlation_id` from the current `Activity`) — F15. An
    architecture spec (§9) asserts no other code writes the table.
  - **Canonical payload serializer (F2):** one static `JobJson.Options`
    (camelCase naming policy, case-insensitive read, strict members) used by
    the enqueuer, every handler read, and **matched exactly by any
    migration-emitted JSON** (§4.6 builds `jsonb_build_object('invitationId', …)`
    — camelCase on the wire). Payload records declare members `required`, so a
    missing field throws on deserialization instead of materializing
    `Guid.Empty`; handlers additionally reject empty IDs as a
    `PermanentFailure`. A spec asserts the exact wire JSON round-trips (§9).
  - **Execute side — a unified `JobRegistration` registry (F14/F15/R2-7).** One
    registry maps `job_type` → a **`JobRegistration`** that pairs, for the same
    versioned type, **both** capabilities the engine needs:
    - a **handler factory** `Func<IServiceProvider, IJobHandler>` (resolved from a
      fresh DI scope per job), and
    - a **type-erased payload validator** `Action<string> ValidatePayloadJson`
      (a closure captured over the concrete `TPayload`, running the canonical
      `JobJson` deserialize + F2 required-member/empty-ID checks on arbitrary
      stored JSON).

    Registration is explicit and fail-fast (each `job_type` maps to exactly one
    registration). Pairing the validator with the factory is what lets
    `RequeueDeadLetterAsync` (§4.2) validate a *stored* DLQ payload without a
    compile-time `TPayload`, and lets the enqueue side and the requeue side share
    one validation definition instead of two drifting copies. An **unknown
    `job_type`** encountered at dispatch is a `PermanentFailure` straight to the
    DLQ (no pointless retries). (`AddJobHandler<T>` registers the handler factory;
    the paired `JobDefinition<TPayload>` supplies `ValidatePayloadJson`, so a
    handler registered without its definition — or vice-versa — fails the
    fail-fast check.)
  - **Version-compatibility gate — fail closed at startup, not a post-damage
    warning (C14/F14).** The registry's DLQ-orphan *log warning* is retained
    only as the **observability twin**; the enforcement is a
    `JobRegistryStartupGate` that runs during worker composition (before the
    processor's hosted loop begins claiming) and **refuses to start the worker**
    when compatibility is broken:
    - It queries **both** live tables — `SELECT DISTINCT job_type FROM job_queue`
      **and** `FROM job_dead_letter` — and computes the set of persisted job
      types with **no registered handler**.
    - If that set is non-empty the gate throws, the worker host fails to boot,
      and (because the container `--worker-health` probe never goes green) the
      **deploy fails closed**. A new worker can therefore never silently consume
      a queued old-version row and permanently dead-letter it, and a DLQ row
      whose handler was dropped can never become un-requeueable unnoticed —
      both are caught *before* the loop processes anything.
    - **No global bypass (R2-9).** There is **no** `JOB_REGISTRY_ALLOW_UNREGISTERED`
      boolean — a flag that lets the worker start with *any* unsupported live
      `job_queue` type would only guarantee that type is then permanently
      dead-lettered, disabling the very guarantee the gate exists to enforce; and
      "drain a retired version" is impossible without that version's handler
      anyway (so with the handler present the bypass is unnecessary, and without
      it the bypass is harmful). **Unregistered `job_queue` types are never
      tolerated — full stop, fail closed.**
    - **DLQ-only, exact-type audited allowlist (R2-9), the sole escape.** The one
      permitted relaxation is for *historical DLQ orphans only* — DLQ rows of a
      version whose handler is legitimately gone and which will never be requeued.
      An explicit `JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST` names **exact `job_type`
      strings** (no wildcards) that may exist **in `job_dead_letter` only**; it
      never permits an unregistered type in `job_queue`, and each entry is
      audit-logged at boot. The clean alternative — deploy the old handler image
      to drain those DLQ rows — remains preferred; the allowlist is for when that
      image is retired and the orphans are accepted as permanently un-requeueable.
  - **Payload versioning (F14):** `job_type` strings are versioned from day
    one (`email.tenant-invitation.v1`). A breaking payload change introduces
    `…v2` + its handler while the `v1` handler (or an upcaster registered for
    `v1`) **stays until the queue and DLQ are drained of `v1`** — the startup
    gate above *proves* the drain (a `v1` handler cannot be removed while any
    `v1` row survives in either table, or the next deploy fails closed).
    **Release gate for handler removal:** a version's handler may be removed only
    in a release that can demonstrate (a) no producer still enqueues that version
    — old api replicas are fully rolled over, verified by the immutable image
    tags in the fleet (§3.4) — **and** (b) zero rows of that `job_type` remain in
    `job_queue` or `job_dead_letter`. Mixed-version deploy rule restated: old api
    replicas may enqueue `vN` after new workers deploy, so **a version's handler
    is never removed in the same release that stops producing it**. Immutable
    image tags (§3.4) make the fleet's version set explicit and inspectable.

- **Outcome taxonomy & cancellation (F12).** Handlers return a typed outcome;
  exceptions are classified — nothing is implicitly retried forever, and only
  the host's own token means shutdown:

  ```csharp
  JobOutcome = Success                       // delete row
             | Cancelled(reason)             // domain no-op (e.g. ineligible email): delete row, no DLQ
             | Retry(TimeSpan? delayOverride) // engine backoff unless overridden (e.g. provider Retry-After)
             | PermanentFailure(reason);     // straight to DLQ regardless of attempts
  ```

  Exception classification in the engine: `OperationCanceledException` **where
  the host `stoppingToken` (or a lease-lost cancellation) is the source** →
  shutdown/abandon path (row released or left leased; never DLQ, never counted
  as an attempt); any other cancellation (`TaskCanceledException` from a
  provider HTTP timeout) → `Retry`; `JsonException` / payload-validation
  failures / unknown `job_type` → `PermanentFailure`; classified permanent
  provider errors (§5.4) → `PermanentFailure`; everything else → `Retry`. A
  provider timeout can therefore never stop the worker host.

- **Retry / backoff — engine-owned, one place (#810 fix; F11/F12).** Delay for
  the *n*-th failed attempt: `d = min(15 s × 2^(n−1), 3600 s)` with **equal
  jitter** (`d/2 + U(0, d/2)`), applied in SQL as an interval added to database
  `now()` — never an app-computed timestamp. Default `max_attempts = 10`
  (schedule spans ≈ 2 h before terminal, replacing the audit-flagged 254 s
  window); definitions override per job type. A `Retry(delayOverride)` outcome
  (provider `Retry-After`) wins over the computed backoff when longer. On
  retry the row returns to `status = Pending` with the lease cleared — the
  same claim predicate governs first runs and retries, so the #810 bug class
  is unrepresentable (handlers can't touch scheduling columns at all).

- **Terminal path.** `PermanentFailure` or attempts exhausted: invoke the
  handler's `OnTerminalFailureAsync` hook (§5.4 uses it for
  `email_log(PermanentlyFailed)`), insert the full envelope into
  `job_dead_letter`, delete the queue row conditioned on the fencing token —
  **one transaction** (hook write included; hook failure rolls the transaction
  back and the terminal attempt is retried whole — F5 semantics, spec-asserted).
  On `Success`/`Cancelled`: conditioned delete.

  ```csharp
  public interface IJobHandler {
      string JobType { get; }                  // versioned
      Task<JobOutcome> HandleAsync(JobContext ctx, CancellationToken ct);
      Task OnTerminalFailureAsync(JobContext ctx, CancellationToken ct)
          => Task.CompletedTask;               // default no-op (F5)
  }
  ```

- **Batch size** from `JOB_QUEUE_BATCH_SIZE` (default 20). Public
  `ProcessBatchAsync(CancellationToken)` for deterministic single-batch specs.

- **Error-persistence sanitization — one boundary, a real mechanism (C11/F20).**
  "Sanitized" is not an assertion sprinkled on schema comments; it is a single
  static class, `JobErrorSanitizer` (`Infrastructure/Jobs/`), through which
  **every** string that reaches a durable `last_error` column (`job_queue`,
  `job_dead_letter`, `email_log`) or a log *template* passes. Its contract:
  - **`Describe(Exception)` → a structured safe code + sanitized message.** The
    stored form is `"{ExceptionTypeName}: {sanitized message}"` — the exception
    **type name is the stable, safe error code** (e.g.
    `EmailProviderPermanentException`, `JsonException`), never a raw provider
    body or a caller-formatted blob. Stack traces are **never** stored.
  - **`Sanitize(string?)`** is applied to *every* handler-supplied string too —
    `Retry(Error)` and `PermanentFailure(reason)` are run through it before they
    are persisted or logged (the engine calls `Sanitize` in `ApplyOutcomeAsync`
    and `DeadLetterAsync`). It: (a) collapses control characters; (b) redacts
    email addresses → `[redacted-email]`; (c) redacts token-shaped runs — any
    unbroken base64/hex/url-safe run ≥ 24 chars (reset tokens, API keys, signed
    fragments) → `[redacted-token]`; (d) **hard-bounds length at 2 KB**.
  - **Logs are redacted too — "protected" is not a substitute for redaction
    (R2-8).** The engine does **not** hand the raw `Exception` (whose `.Message`
    Serilog would render into a sink) to the logger for provider/handler failures.
    Instead it logs the **sanitized `Describe(ex)` (type + redacted, bounded
    message)** plus **safe stack metadata** — the exception *type* and its stack
    **frames** (method/type/file/line), which do not carry untrusted payload
    values — and omits the raw message. So a Resend 4xx body, a token, or a
    recipient address inside `ex.Message` never reaches a log sink either.
  - **Backstop: a global Serilog exception-redaction destructuring policy
    (R2-8).** Because a raw exception could be logged from *anywhere* (not just the
    engine), an `IExceptionDestructurer` / destructuring policy is registered on
    the logger pipeline that runs every logged exception's `Message` through
    `JobErrorSanitizer.Sanitize` before it is written. This makes redaction a
    property of the logging boundary, not of each call site's discipline.

  Between the durable-column boundary and the logging boundary, payload JSON,
  tokens, and provider response bodies cannot reach `last_error` **or** a log sink
  even when a handler naïvely stuffs them into a reason string or throws them in an
  exception message. A spec (`JobErrorSanitizer.Spec.cs`, §9) asserts email/token
  redaction and the 2 KB bound on adversarial inputs, plus that a logged exception
  carrying an email/token is redacted at the sink.

  > **Known code-alignment item (R2-8, captain's reconciliation round).** The 633
  > processor currently passes the raw `failure` exception to `LogWarning`/
  > `LogError`. This document specifies the redacted-logging contract above (safe
  > `Describe` + stack metadata + destructuring backstop); aligning the 633 log
  > calls is a code-reconciliation item, not a doc defect.

### 5.2 `SchedulerLeaderService` (`Infrastructure/Jobs/SchedulerLeaderService.cs`)

A `BackgroundService` (worker/all only) that owns Quartz's lifecycle via a
**session-level advisory lock**:

- Holds a **dedicated long-lived Npgsql connection** and calls
  `pg_try_advisory_lock({SCHEDULER_LEADER_LOCK_KEY})`. On acquire → **start** the
  Quartz scheduler and register its triggers; on failure to acquire → stay a
  follower and retry on an interval (e.g. 15 s).
- **Renewal** is implicit: a session-level advisory lock is held for the life of
  the connection. The service periodically `SELECT 1`s to detect a dropped
  connection; on loss it **stops** Quartz (`scheduler.Standby()`/`Shutdown`) and
  re-enters the acquire loop, so leadership migrates to a surviving replica.
- **Lock key**: a single fixed `bigint` app constant (e.g. a stable hash of
  `"publyapp.scheduler.leader"`), defined once in code as
  `SCHEDULER_LEADER_LOCK_KEY`. A grep of the repo found **no other
  `pg_advisory_lock`/`pg_try_advisory_lock` usage**, so there is no collision to
  design around; the constant is the whole namespace.

Only the leader runs Quartz triggers; **all** workers run `JobQueueProcessor`.
Thus a trigger only *enqueues*/reconciles — the actual work is claimed by any
worker, so leader failover never strands in-flight jobs.

### 5.3 Quartz job inventory (`Infrastructure/Jobs/Quartz/`)

Quartz uses the **RAM job store** (`useProperties`/in-memory), *not* a persistent
`qrtz_*` store — see rationale below. Triggers are re-registered on the leader at
startup and kept current by `SyncSystemJobsJob`.

| Job | Cadence | Responsibility |
| --- | --- | --- |
| `SyncSystemJobsJob` | 60 s | Reconcile `system_job_definitions` (enabled, non-deleted, **catalog-known**) into the leader's live scheduler — add/update/remove cron triggers so dashboard edits take effect within ~60 s (#636); skip+warn on catalog-unknown or invalid-cron rows (C4). |
| `EnqueueSystemJobJob` | (per trigger) | **The generic dispatcher fired by every dynamic system-job trigger (C4).** Resolves the trigger's `job_key` → `SystemJobCatalog` entry, then enqueues the mapped versioned job **exclusively through `IJobEnqueuer`** with a scheduled-occurrence idempotency key; stamps `last_enqueued_at`. The leader only *enqueues*; any worker runs the work. |
| `RecoverStaleJobsJob` | 5 min | Belt-and-braces run of the stale-lease reset statement (§5.1 step 1); the processor also resets inline — this covers a fully-crashed fleet. |
| `DispatchDuePostsJob` | — | **FUTURE / D3 (#646).** Scans `scheduled_posts` and enqueues due posts into `job_queue` with an `idempotency_key` (+ a domain outcome marker per §4.1/F13). *Design accommodates it; does not build it.* |

**System-job dispatch contract — `SystemJobCatalog` + `EnqueueSystemJobJob`
(C4/F15).** Recurring system jobs must ride the *same* trusted enqueue boundary
as every other producer; they cannot bypass `IJobEnqueuer` and hand-build a
`JobQueueItem` (the pre-remediation #634 shape did, which is exactly the C4
hole). The contract:

- **`SystemJobCatalog`** (`Infrastructure/Jobs/Quartz/SystemJobCatalog.cs`): a
  static, code-owned map `job_key → SystemJobEntry`. Each entry carries:
  - the **versioned `JobDefinition`** (its `job_type`, e.g.
    `system.session-cleanup.v1`, default priority `0`/bulk, `max_attempts`);
  - a **payload factory** (usually an empty/marker payload — most system jobs are
    parameterless sweeps; the catalog is where a future parameterized job supplies
    one);
  - **cron policy**: the trigger **time zone** (default UTC, explicit per entry)
    and a **gap policy** (see below).
- **`EnqueueSystemJobJob`** is the single Quartz job type every dynamic trigger
  fires (wired by `SyncSystemJobsJob`, which stamps the `job_key` into the
  trigger's `JobDataMap`). On fire it, **in one transaction**: computes
  `scheduled_fire_at` (the trigger's *scheduled* fire time, quantized to cron
  granularity — Quartz exposes this on the fire context, distinct from "now"),
  `INSERT INTO system_job_occurrences (job_key, scheduled_fire_at) … ON CONFLICT
  DO NOTHING`, and **only if that inserted a row** calls
  `IJobEnqueuer.EnqueueAsync(entry.Definition, entry.PayloadFactory(scheduled_fire_at), …)`,
  records `enqueued_job_id`, and stamps `last_enqueued_at`; then commits. It never
  constructs `JobQueueItem` directly — the `JobEnqueueBoundary` spec (§9) asserts
  `Infrastructure/Jobs/Quartz` holds no direct-write of the entity.
- **Scheduled-occurrence idempotency is DURABLE (C4/F13/R2-1).** The permanent
  dedup is the `system_job_occurrences (job_key, scheduled_fire_at)` primary key
  (§4.3), **not** the queue's `idempotency_key`. Because the occurrence row
  outlives queue deletion, a delayed duplicate firing of the same scheduled tick
  — *after* the first job already completed and its queue row was deleted —
  `ON CONFLICT DO NOTHING`s and enqueues nothing. (The enqueue still also carries
  `IdempotencyKey = $"{job_key}:{scheduled_fire_at:o}"` as the *in-flight* guard
  against a same-tick double-fire while the first job is still queued, but that is
  the belt to the ledger's braces.) A recurring sweep whose logical work must
  never double-execute additionally relies on its handler's natural idempotency or
  a domain outcome marker (§4.1/F13).
- **Missed-occurrence semantics — durable-derived, explicit drop-on-gap default
  (R2-1).** The round-1 "fire-once-then-resume" phrasing was wrong: a RAM job
  store has **no memory of ticks missed while no scheduler existed**, so it cannot
  provide catch-up. The durable ledger *is* the memory. On leader acquisition (and
  each `SyncSystemJobsJob` pass) reconciliation may derive missed occurrences by
  comparing each catalog cron's expected fire times against
  `system_job_occurrences`. The **default gap policy is DROP-ON-GAP**: missed
  ticks are **not** back-filled — recurring sweeps are idempotent and
  state-reconciling (a `session-cleanup` that missed three ticks needs one run on
  current state, not three), so the next scheduled fire covers reality. An entry
  may **opt into bounded catch-up** (`CatchUp = AtMost(n)`): reconciliation
  enqueues at most the `n` most-recent missed occurrences (each idempotent via the
  ledger), never an unbounded burst. The policy is a per-catalog-entry field, so
  the choice is explicit and inspectable, never implicit RAM-store behavior.
- **Catalog→definition→handler closure, validated at startup (R2-1).** A
  `SystemJobCatalog` self-check runs in the same worker-startup gate as the
  registry check (§5.1): **every** catalog entry's `JobDefinition.JobType` must
  resolve to a **registered `IJobHandler`**, or the worker **fails closed**. This
  makes it impossible to ship a seeded/scheduled system job whose enqueued jobs
  would dead-letter for want of a handler.
- **Seeder.** `SystemJobSeeder` (`Modules/Jobs/Seeders/`, run with the other
  seeders) inserts one `system_job_definitions` row per catalog entry that should
  ship enabled (idempotent on `job_key`), so a fresh environment has the baseline
  recurring jobs without a manual dashboard step. Operators then edit cron /
  enable-disable from the dashboard (#636).
- **Specs (§9):** catalog-unknown `job_key` is skipped (not scheduled); a
  delayed duplicate occurrence enqueues nothing (ledger PK); catalog→handler
  closure fails the startup gate when a definition has no handler;
  `EnqueueSystemJobJob` routes only through `IJobEnqueuer`.

**Why no `qrtz_*` tables (deviation from #194's table list):** durability lives
in `job_queue` (work) and `system_job_occurrences` (recurring identity),
leadership lives in the advisory lock, and the system-job catalog lives in
`system_job_definitions` (reconciled every 60 s). Quartz here only needs to *fire
cron triggers on the leader* — occurrence durability and gap policy are provided
by the ledger + reconciliation above, **not** by a Quartz job store — so a
persistent `qrtz_*` store would be redundant complexity. If Quartz-native misfire
handling across restarts is ever wanted, it is an additive follow-up, not a
Phase-A dependency.

### 5.4 Email job handlers (replaces the typed-outbox dispatcher)

Emails are ordinary jobs; the shipped `InvitationEmailOutboxDispatcher`, the
`InvitationEmailOutbox` entity, and `IInvitationEmailOutboxSignal` are
**retired** across R1/R2 of the fold (§4.6). What replaces them:

- **One handler per kind** (three `IJobHandler`s, one versioned `job_type`
  each) — *not* one kind-dispatching mega-handler. The engine's
  `JobHandlerRegistry` **is** the kind dispatcher (`job_type` is the
  discriminator); an internal kind-switch inside a single "email handler" would
  recreate a second dispatch layer, grow unboundedly as kinds are added, and
  drag every domain's eligibility logic into one file. Per-kind handlers also
  live in their owning domain (§8) and can differ in `max_attempts` (the lease
  is global — C15/§5.1).

  | `job_type` | Handler | Domain home |
  | --- | --- | --- |
  | `email.tenant-invitation.v1` | `TenantInvitationEmailJobHandler` | `Modules/Invitations/Jobs/` |
  | `email.staff-invitation.v1` | `StaffInvitationEmailJobHandler` | `Modules/Invitations/Jobs/` |
  | `email.password-reset.v1` | `PasswordResetEmailJobHandler` | `Modules/Auth/Jobs/` |

- **Payload records — IDs, not denormalized strings.**
  `TenantInvitationEmailPayload { required Guid InvitationId }`,
  `StaffInvitationEmailPayload { required Guid InvitationId }`,
  `PasswordResetEmailPayload { required Guid UserId }` — `required` members +
  empty-ID rejection per the F2 contract, serialized only through `JobJson`
  (camelCase wire form: `{"invitationId": "…"}`; the fold migration emits
  exactly this shape). Everything the send needs is reloadable from those IDs —
  `Invitation` carries `Email`, `Token`, `AccountLevel`, and the `Tenant`
  navigation (name); `User` carries `Email` and the current
  `PasswordResetToken`/`PasswordResetTokenExpiresAt` — and the eligibility
  recheck must reload fresh domain state anyway. Reloaded content is then
  **frozen into the prepared envelope on first attempt** (§4.5), which is what
  retries actually send; denormalizing into the *queue payload* would only be a
  staleness liability. Denormalize into a payload only when a future kind needs
  data that is genuinely not reloadable at send time.

- **The corrected email-failure contract (F3 — a live pre-existing bug, fixed
  in Phase 2C).** Today `ResendEmailAdapter` converts `response.Exception` into
  `EmailResult.Success = false` and **every `EmailService` method discards the
  result** — provider rejections vanish. Corrected contract: the adapter
  **throws classified exceptions** — `EmailProviderTransientException`
  (timeouts, 5xx, 429 with optional `RetryAfter`) and
  `EmailProviderPermanentException` (validation 4xx, suppressed recipient) —
  and success returns an `EmailSendReceipt { ProviderMessageId }` that
  `IEmailService` methods **must return** to their callers. Failure is
  impossible to ignore: a handler maps transient → `Retry` (honoring
  `RetryAfter`), permanent → `PermanentFailure`, and persists
  `ProviderMessageId` into `email_log`. Throw-classified is chosen over
  result-objects because the engine's outcome taxonomy (§5.1) is built on
  classification, and a result object reintroduces the discard-by-default
  hazard this bug *is*. Non-job callers (e.g. verification emails still sent
  inline) get the same contract — their existing silent-failure behavior is the
  bug, not a compatibility target.

- **Send flow — two transactions: committed PREPARE, then locked SEND (#811
  fix; F7/F8; C1).** The prepared-envelope guarantee is *not* one
  lock-render-send-commit transaction (a crash between provider-accept and commit
  would roll back the scratch and email_log and let the retry re-render mutated
  state — the C1 defect). It is a **committed prepare followed by a separate
  locked send**. Each handler:

  0. **Idempotency short-circuit.** If an `email_log` row already exists for this
     `job_id` (unique index §4.4), return `Success` **without sending** — a
     reclaimed job whose Submitted (or terminal) outcome is already recorded
     never re-sends.
  1. **PREPARE transaction (first attempt only; commits before any network I/O).**
     If no committed `email_prepared_sends` row exists yet (row existence is the
     commit proof — §4.5): open transaction A, take the domain row lock
     (`SELECT … FOR UPDATE`), do a fresh eligibility read (ineligible → the
     CancelledIneligible path in step 3, in this same transaction), **render the
     request from the locked-fresh state**, serialize it to `request_body` via the
     provider **transport** serializer (§4.5 — *not* `JobJson`), `INSERT … ON
     CONFLICT (job_id) DO NOTHING`, and **commit A**. The bytes are now durable
     *before* the provider is ever called, so any later crash resends stored
     bytes, never re-rendered ones. A retry that finds the committed scratch row
     skips this step entirely.
  2. **SEND transaction opens** and takes the domain row lock again
     (`SELECT … FOR UPDATE`).
  3. **Fresh eligibility read under the SEND lock** — *this locked read is the
     linearization point (F8)*: invitation `IsRevoked() || IsAccepted() ||
     IsExpired(now)` → write `email_log(CancelledIneligible)` + delete the
     prepared-send row, commit, return `Cancelled`. Password-reset: token absent
     or expired → same path. The **guaranteed semantic**: an ineligibility
     **committed before this locked read** is always honored — no send. An
     ineligibility that *initiates* after it blocks on the row lock (or commits
     after) and does **not** recall the send: revoke cannot preempt in-flight
     provider I/O, and no lock design over a network call can make it. That is
     the chosen serialization order, stated plainly.
  3a. **Local send-once recheck inside the SEND lock, immediately before network
     I/O (R2-2).** Two workers can both pass step 0's `email_log` check before
     either takes the SEND lock; the fencing token settles the *queue row* but not
     an *external* double-send. So — still holding the domain lock, as the last
     thing before the provider call — re-`SELECT email_log WHERE job_id = …`. If a
     `Submitted` row now exists, **do not send**: delete the scratch, commit,
     return `Success`. The domain row lock serializes the two SEND transactions, so
     the second one observes the first's committed `email_log` row here and skips
     the provider. (This is a local optimization; the provider idempotency key
     remains the cross-process backstop for the crash-after-send window.)
  4. **Send the stored bytes.** Call `SendPreparedAsync(request_body,
     idempotencyKey, ct)` (§4.5) — the persisted bytes go straight to the provider
     POST body — inside the lock window **bounded by an explicit provider HTTP
     timeout (30 s)** (so a blocked revoke waits bounded time).
  5. **On provider acceptance:** insert `email_log(Submitted)` with
     `provider_message_id` + `request_sha256`, delete the prepared-send row,
     commit the SEND transaction, return `Success`. Within the provider's 24 h
     window the stable idempotency key closes the crash-after-send window
     remotely (§4.5's bounded guarantee); the `email_log` unique `job_id` closes
     it locally.
  6. **On classified *transient* provider failure:** roll back the SEND
     transaction **without** writing `email_log` and **without** deleting the
     scratch row (the committed prepare survives), map to `Retry` per the F3
     contract; the retry re-enters at step 2 and resends the *same* stored bytes.
     **On a classified permanent failure:** `PermanentFailure`. The **engine**
     owns backoff throughout (#810 — handlers never see scheduling columns).
  `OnTerminalFailureAsync` writes `email_log(PermanentlyFailed)` — and deletes the
  prepared-send row — with the last classified error when the engine dead-letters
  the job.

- **#809 — password-reset behind a transaction-owning Auth operation (F6).**
  The promised "same transaction as token issuance" **cannot be built through
  the current boundary**: `RequestPasswordReset.Handle` calls
  `UserService.UpdateUserAsync`, which commits before returning, and the
  token-reuse branch persists nothing at all — there is no unit of work to
  join. Phase 2C introduces `Modules/Auth/Services/PasswordResetService.cs`
  (`IPasswordResetService`, `[Service]`), owning **one `AppDbContext`
  transaction** for the whole operation: load user → reuse-or-issue token
  (both branches now persist) → `IJobEnqueuer.EnqueueAsync(PasswordResetV1,
  { userId })` joining the same context → single commit (+ NOTIFY, delivered
  at commit). The handler shrinks to validation + calling this service +
  constant-shape response (no user-enumeration signal — unchanged). This
  respects the services-depend-only-on-DbContext+infrastructure rule:
  `IJobEnqueuer` is infrastructure. Rollback specs in both directions (§9).

- **Producers.** `InvitationService`, `TenantAsStaffService`,
  `StaffProfileAsStaffService` switch from writing `InvitationEmailOutbox` rows
  + `Notify()` to `IJobEnqueuer.EnqueueAsync(...)` in the same transaction as
  the invitation write, + `NOTIFY` (§5.5). `RequestPasswordReset` goes through
  `IPasswordResetService` per above.
- **Synchronous cancellation retired.** The shipped
  `CancelPendingForInvitationAsync` calls in revoke/accept services are removed:
  with the locked send-time recheck as the authoritative gate, eagerly mutating
  queue rows from domain services is redundant machinery (and would need
  jsonb-payload queries to even find the rows). A revoked invitation's pending
  job resolves to `CancelledIneligible` at claim time — visible in `email_log`,
  which replaces the cancelled-row visibility the old table provided.

### 5.5 Cross-process wake — recommendation: **Postgres `LISTEN`/`NOTIFY` + poll fallback**

**The problem.** `IInvitationEmailOutboxSignal` is a `SemaphoreSlim` — an
**in-process** wake. Producers call `_outboxSignal.Notify()` from
`InvitationService`, `TenantAsStaffService`, `StaffProfileAsStaffService` (grep-
confirmed) after committing rows. Under D1, producers run in the **`api`**
process while the `JobQueueProcessor` runs in the **`worker`** process — a
semaphore in `api` can never release a semaphore in `worker`. Left unfixed,
every email and on-demand job waits up to the full poll interval, and the
"immediate wake" property is silently lost.

**Options.**

- **Pure polling.** Drop the signal; rely on the 5 s poll. Simple, correct, but
  adds up-to-5 s latency to *every* transactional email and on-demand job.
- **`LISTEN`/`NOTIFY` + poll fallback (recommended).** Producers issue
  `NOTIFY job_queue` (via `pg_notify('job_queue', '')`) alongside the job
  insert — Postgres delivers it **at commit**, so it is naturally transactional
  and never fires for a rolled-back write (the enqueuer emits it, so no
  producer can forget). A worker-side `JobQueueListener`
  (`Infrastructure/Jobs/`) holds a dedicated Npgsql connection doing
  `LISTEN job_queue` and, on notification, wakes the processor's loop through an
  `IJobQueueSignal` seam (same shape as the shipped signal interface, now backed
  by Postgres). The **poll interval remains the correctness fallback**, exactly
  as the shipped dispatcher's comment prescribes.

  **Topology — one listener per replica, broadcast to all (C17).** There is **one
  `JobQueueListener` per worker replica**, not one fleet-wide listener. PostgreSQL
  **broadcasts each `NOTIFY` to *every* session currently `LISTEN`ing on the
  channel**, so every replica's listener wakes on every enqueue and every
  replica's processor then races a claim. That cross-replica claim herd is
  **accepted, not eliminated**: `FOR UPDATE SKIP LOCKED` (§5.1) makes the losers
  cheap **no-op claims** (they select zero rows and return), which is the correct,
  bounded cost of at-least-once fan-out — local single-replica signal coalescing
  reduces *redundant wakes within* a replica but cannot and does not remove the
  *between-replica* herd. With few replicas and low transactional-email volume the
  no-op claims are negligible; if they ever aren't, sharded channels are the
  designed escalation (not built speculatively).

  Failure analysis: (a) *no listener connected at commit* → NOTIFY is dropped by
  Postgres (it is fire-and-forget, not queued), but the poll fallback picks the
  row up within the interval; (b) *listener connection drops* → the listener
  reconnects on a **bounded exponential backoff with jitter** (e.g. 1 s → 30 s cap,
  ± jitter, so a Postgres restart doesn't produce a synchronized reconnect
  stampede across replicas), re-`LISTEN`s, **and immediately triggers one catch-up
  poll**, so any notifications missed while disconnected are covered (reconnects
  and `listener_connected` are metered — §7.1); (c) *NOTIFY payload limits (8 KB)*
  → send an **empty payload** and let the processor query for eligible rows (it
  must anyway, because many producers may have committed); (d) *within-replica
  wake herd* → the processor coalesces (a single wake triggers the §5.1 drain
  loop, which empties the backlog), and the semaphore-style "one pending wake is
  enough" collapsing is preserved.

  **Connection discipline (C17).** The listener holds a **dedicated, non-pooled
  Npgsql connection kept open continuously** for the life of the replica — a
  `LISTEN` registration is per-session, so a pooled connection that is reset and
  returned would silently drop the subscription. This mirrors
  `SchedulerLeaderService`'s non-pooled lock connection (§5.2).

**Recommend `LISTEN`/`NOTIFY` + poll fallback.** It preserves the shipped low-
latency behavior across the process split, degrades to pure polling on any
listener failure, and needs no broker (honoring D3). With the single-lane
ruling there is exactly **one channel** (`job_queue`) and **one listener per
replica** — the per-concern channel question disappears with the second lane. In the `all` role
the same mechanism works unchanged (it is just in-process NOTIFY/LISTEN), so the
`SemaphoreSlim` signal is **retired** rather than kept as a special case. Keep
the `IJobQueueSignal` interface seam so tests can inject a deterministic fake.

---

## 6. Failure semantics

- **Lease model with fencing (F1).** A claim sets `Processing`,
  `locked_until = now() + lease`, and a fresh `lock_token`. Every transition
  (success delete, retry requeue, DLQ move, renewal, shutdown release) is
  **conditioned on that token** with an affected-row-count check; zero rows =
  lease lost = the outcome is discarded and the handler's token cancelled. A
  worker that crashes leaves the row `Processing`; once `locked_until` passes,
  the stale-lease reset (inline or `RecoverStaleJobsJob`) returns it to
  `Pending` and a new claim issues a **new** token — the old owner is fenced
  out permanently. Live handlers renew at `lease/2`; the engine re-stamps each
  row's lease immediately before dispatch so serial batches never start jobs on
  spent leases.
- **Crash between claim and completion.** At-least-once: the row is reclaimed
  and retried after lease expiry. Handlers **must be idempotent** (see below).
  For email jobs, the `email_log` unique `job_id` row, the prepared-send
  envelope, and the provider idempotency key (§4.5/§5.4) reduce
  crash-after-send re-runs to the documented bounded-duplicate guarantee.
- **Typed outcomes (F12).** `Success`/`Cancelled` delete; `Retry` requeues with
  engine backoff (equal jitter, `Retry-After` override); `PermanentFailure`
  dead-letters immediately — malformed payloads, unknown job types, and
  classified permanent provider errors never burn retry attempts. Only
  host-token (or lease-lost) cancellation is treated as shutdown/abandon; a
  provider `TaskCanceledException` is a `Retry`, never a worker stop.
- **Poison jobs → DLQ.** When `attempts >= max_attempts` (or on
  `PermanentFailure`), the engine invokes `OnTerminalFailureAsync`, copies the
  **full envelope** to `job_dead_letter`, and deletes the queue row — one
  transaction, conditioned on the fencing token; a hook failure rolls back the
  whole terminal step. Manual redelivery is the dashboard's server-side requeue
  (§4.2 contract); there is no keep-terminal-rows-in-queue special case for any
  job type.
- **Max-attempt policy per job type.** `max_attempts` defaults to 10
  (≈ 2 h retry span) and is set per job definition — a cheap idempotent sweep
  and an expensive export can differ; the DB CHECK bounds it at 50.
- **Idempotency expectations on handlers.** Every `IJobHandler` must be safe to
  run ≥1 time: natural idempotency (session cleanup's
  `DELETE … WHERE expires_at <= now` re-runs harmlessly), the scoped
  `(job_type, idempotency_key)` in-flight dedup at enqueue, a **domain outcome
  marker** for permanent dedup (§4.1/F13), and for emails the
  `email_log`/prepared-send/provider-key stack (§5.4). This is a **hard
  contract**, asserted per handler in specs.
- **Clock-skew stance (F11), total.** Every comparison AND every computation of
  scheduling state happens in SQL against database `now()`: claim eligibility,
  lease expiry, lease renewal, retry `next_attempt_at` (interval arithmetic on
  `now()`), and all `created_at`/`updated_at`/`failed_at`/`occurred_at` stamps
  (column defaults or SQL SET clauses). Entity classes carry **no C#
  initializers** on these columns and the engine never writes an app-computed
  absolute timestamp into them. App-side `DateTime.UtcNow` is permitted only in
  non-safety contexts (log messages, domain eligibility checks whose semantics
  are domain-owned). A worker with a skewed clock therefore cannot cause retry
  storms, premature reclaims, or long stalls.

---

## 7. Observability & operations (F21)

Liveness (§3.5) says "the process and DB are up"; this section is how anyone
knows the **queue is healthy**.

**One release sequence, stated once (C12/F21/R2-10).** The existing stack is
Serilog with **console + file sinks only**, and the `Meter` instruments below have
**no exporter** yet. There is no contradiction between "telemetry-only" and
"wire an alert route" — they are **two different phases**:
- **Phase 2A-R (and 2B): instruments only — telemetry.** The engine emits the
  §7.1 `System.Diagnostics.Metrics` instruments and their structured-log twins
  from day one. Nothing routes them to a pager yet; this is *telemetry*, and the
  document does **not** claim these alert.
- **Phase 3: the sampler + exactly one wired alert route.** Phase 3 adds the
  §7.2 sampler **and** wires **one** real destination — a Serilog **warning+
  webhook sink** to the operator's existing notification channel (the ratified
  default, O8), with an OTel/Prometheus-exporter→Alertmanager path as the
  alternative if a metrics backend is later stood up. Wiring, not redesign (the
  instruments already exist).

So: telemetry in 2A-R, alerting in Phase 3 — never "telemetry-only" and "wired
route" claimed of the same phase.

### 7.1 Instruments (Meter `PublyApp.Jobs`) — emitted by the engine (Phase 2A-R)

| Instrument | Type | Tags | Scope |
| --- | --- | --- | --- |
| `jobs.claimed`, `jobs.succeeded`, `jobs.retried`, `jobs.dead_lettered`, `jobs.cancelled`, `jobs.lease_lost` | counters | `job_type` | per-replica |
| `jobs.handler_duration` | histogram | `job_type`, `outcome` | per-replica |
| `jobs.attempts_at_terminal` | histogram | `job_type` | per-replica |
| `jobs.last_success_at` | gauge (unix ts) | `job_type` | per-replica |
| `jobs.listener_connected` | gauge (0/1) | — | per-replica (§5.5 listener) |
| `jobs.listener_reconnects` | counter | — | per-replica |
| `jobs.listener_last_catchup_at` | gauge (unix ts) | — | per-replica |
| `email.submit_failures` | counter | `kind`, `transient\|permanent` | per-replica |
| `scheduler.is_leader` | gauge (0/1) | `instance` | per-replica (only leader = 1) |
| `scheduler.leader_present` | gauge (0/1) | — | per-replica; **1 iff this replica sees a live leader** (advisory-lock probe) — the leader-absence alert (R2-10) |
| `scheduler.last_sync_at` | gauge (unix ts) | `instance` | leader emits; **staleness alert** if no update within 2× sync interval (R2-10) |
| `scheduler.sync_failures` | counter | — | leader emits |
| `scheduler.last_trigger_fire_at` | gauge (unix ts) | `job_key` | leader emits |

**Per-replica emission with instance tags — no signal dies with leadership
(R2-10).** Every instrument is emitted per-replica and **instance-tagged**; the
alert layer aggregates. The round-1 design leader-gated the global-queue gauges
to avoid N duplicate emissions — but that meant that **when there is no leader
(the failure most needing detection) nothing sampled the queue and no threshold
warning fired**: silence became the symptom. Round-2 fix: the §7.2 sampler runs on
**every replica, instance-tagged**, and the alerting layer de-duplicates by
*condition* (not by instance) so one breach is one alert regardless of replica
count. Additionally, `scheduler.leader_present` lets **every** replica assert
"there is a live leader" (a cheap advisory-lock presence probe), so **leader
absence itself is an alertable condition** — and `scheduler.last_sync_at`
staleness beyond 2× the sync interval alerts on a wedged-but-present leader. Every
counter increment and threshold breach has a structured-log twin; per the §7
sequence that is telemetry in 2A-R and paging via the Phase-3 route.

### 7.2 Sampled gauges — `JobQueueMonitorService` (Phase 3)

A cheap **per-replica, instance-tagged** sampler (`JobQueueMonitorService`, 60 s
— runs on **every** worker, **not** leader-gated, so queue health is still
sampled when no leader exists — R2-10): `due_depth` (pending & due, split by
priority class), `oldest_due_age_seconds` (per priority class — the F22 fairness
tripwire), `processing_over_lease_count` (should be ~0; sustained >0 means reclaim
is broken), `dlq_size` + `dlq_growth_1h`, `email_log_failures_1h`, and `job_queue`
dead-tuple count from `pg_stat_user_tables` (autovacuum health, F21). These are
whole-queue facts identical from any replica, so each sample is tagged with
`instance` and the **alert layer aggregates by condition** — one breach is one
alert regardless of how many replicas observed it (the round-1 leader-gating that
blinded the fleet on leader loss is removed). The read is cheap (a few indexed
counts) so N replicas sampling is not a load concern. (Per-replica signals —
listener connectivity, handler durations, reconnects — are inherently per-replica,
§7.1.) Each sample logs at information; threshold breaches (defaults: due_depth >
500, oldest age > 10 min for priority 100 / > 60 min for priority 0,
processing-over-lease > 0 for 3 consecutive samples, DLQ growth > 0 in an hour,
**plus `scheduler.leader_present = 0` fleet-wide and `last_sync_at` staleness >
2× interval** — R2-10) log at **warning** and increment a metric — telemetry the
Phase-3 alert route (§7) consumes; the warning log is **not itself** a pager.

### 7.3 Operational jobs (Phase 3)

Retention sweeps run as ordinary system jobs (dashboard-visible, #636):
`email-log-retention` (delete rows older than `EMAIL_LOG_RETENTION_DAYS`,
batched), `job-dead-letter-retention` (`JOB_DEAD_LETTER_RETENTION_DAYS`),
`email-prepared-sends-retention` (**live-state anti-join, C1: delete only when
`job_id` is absent from both `job_queue` and `job_dead_letter` AND older than
`EMAIL_PREPARED_SEND_RETENTION_DAYS`** — default 7; the env var, not a hardcoded
floor — R2-11; age alone never deletes), and `system-job-occurrence-retention`
(prune `system_job_occurrences` older than `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS`
— default 30; R2-1/O9). Autovacuum storage parameters for `job_queue` ship in the
Phase 2A-R migration (§4.1); the sampler watches dead tuples so a mis-tuned
autovacuum is visible, not silent.

---

## 8. Module / file placement

Per `docs/guides/api-module-structure.md` (infra = capabilities provided *to*
domains) and `docs/guides/dotnet-project-layout.md` (co-located `*.Spec.cs`, new
top-level source area needs its own `Compile Include` line in the test shell).

- **Engine (infra):** `apps/api/Infrastructure/Jobs/`
  - `JobQueueProcessor.cs`, `SchedulerLeaderService.cs`, `JobBackoff.cs`,
    `JobHandlerRegistry.cs`, `JobRegistryStartupGate.cs` (C14), `IJobHandler.cs`,
    `JobContext.cs`, `JobOutcome.cs`, `JobJson.cs`, `JobErrorSanitizer.cs` (C11),
    `IJobEnqueuer.cs` + `JobEnqueuer.cs` (incl. `RequeueDeadLetterAsync` — C9),
    `JobDefinition.cs`, `JobQueueListener.cs` + `IJobQueueSignal.cs`,
    `JobsMetrics.cs`, `JobsServiceRegistration.cs`, `WorkerHeartbeatService.cs`,
    `JobQueueMonitorService.cs` (Phase 3)
  - `Infrastructure/Jobs/Quartz/`: `SyncSystemJobsJob.cs`,
    `RecoverStaleJobsJob.cs`, `EnqueueSystemJobJob.cs` + `SystemJobCatalog.cs`
    (C4), `ScopedJobFactory.cs` (and future `DispatchDuePostsJob.cs`).
  - The engine is a technical capability used by many domains → **infra**, not a
    domain module. This mirrors `Infrastructure/Messaging/Email/` (which keeps
    `IEmailService`, the provider adapters, and the F3 classified exceptions;
    the outbox dispatcher and signal are deleted by the fold's R2).
- **Engine entities:** these are infra-owned tables, but the repo keeps EF
  entities under `Modules/`. Create a small **`Modules/Jobs/Entities/`**
  (`JobQueueItem.cs`, `JobDeadLetter.cs`, `SystemJobDefinition.cs`) as the domain
  home for the engine's persisted types, with `DbSet`s added to `AppDbContext`.
  `Modules/Jobs/Entities/` also holds **`SystemJobOccurrence.cs`** (the durable
  occurrence ledger — R2-1). (Rationale: entities live in modules by convention;
  the *behavior* lives in `Infrastructure/Jobs/`. `Modules/Jobs` is the entity/enum
  home, plus `Modules/Jobs/Seeders/SystemJobSeeder.cs` — C4 — which seeds one
  `system_job_definitions` row per shipped `SystemJobCatalog` entry.) Writes to
  `JobQueueItem` outside `Infrastructure/Jobs` are forbidden and spec-guarded
  (F15, §9). The unified **`JobRegistration`** (handler factory + type-erased
  `ValidatePayloadJson` — R2-7) and the byte-faithful `SendPreparedAsync` transport
  (R2-2, in `Infrastructure/Messaging/Email`) are behavior, so they live in
  `Infrastructure/`, not here.
- **`EmailLog` home — `Modules/Messaging/` (O5's module, repurposed).** The
  single-lane ruling removes the `EmailOutbox` entity O5 created this module
  for, but the *reason* for a neutral messaging module survives: `email_log` is
  a cross-domain record (invitations + auth today, more kinds later) that
  belongs to no single domain — the same shape as `Modules/AuditLogs`. So:
  `Modules/Messaging/Entities/EmailLog.cs` + `EmailPreparedSend.cs`, the shared
  `EmailKind` / `EmailLogOutcome` enums, and a small `[Service]`
  `Modules/Messaging/Services/EmailLogWriter.cs` the handlers call. The
  alternative — parking these under `Modules/Jobs` — is rejected because they
  are not engine tables: the engine never reads or writes them; domain email
  handlers do.
- **Email job handlers (domain logic):** live with their domain, per the same
  rule as every other job handler — `Modules/Invitations/Jobs/
  {TenantInvitationEmailJobHandler,StaffInvitationEmailJobHandler}.cs` (the
  eligibility recheck is invitation domain logic) and
  `Modules/Auth/Jobs/PasswordResetEmailJobHandler.cs` (token validity is auth
  domain logic). Payload records and the domain's `JobDefinition` catalog
  (e.g. `InvitationEmailJobs.cs`) sit beside their handlers.
  `Modules/Auth/Services/PasswordResetService.cs` (F6) follows the normal
  domain-service rules.
- **Job handlers generally:** live with their domain, not in the engine —
  session cleanup (#389) → `Modules/Auth/Jobs/CleanupExpiredSessionsHandler.cs`
  (Session lives in `Modules/Auth/Entities`), expired-invitation sweep (#425) →
  `Modules/Invitations/Jobs/`, exports (#213/#286) →
  `Modules/AuditLogs/Jobs/` and `Modules/Tenants/Jobs/`. Each implements
  `IJobHandler`. This keeps the engine domain-agnostic and each job's business
  logic inside its slice.
- **Migrations:** `apps/api/Migrations/` (unchanged location) — one per schema
  step (§10), each also mutating `AppDbContextModelSnapshot.cs`.
- **DI:** worker hosted services via `AddHostedService<…>()` inside
  `JobsServiceRegistration.AddWorkerServices` (targeting
  `IHostApplicationBuilder`, §3.2), gated by role in `Program.cs`.
  `IJobHandler` implementations via the explicit `JobHandlerRegistry` (keyed by
  `JobType`) rather than `[Service]` (which has no keying by string).
  `IJobEnqueuer` is scoped infrastructure (legal dependency for domain
  services). Producers, registry, and `AppEnvironment` accessors follow
  existing patterns.
- **Test-shell wiring:** the **new** top-level `Modules/Jobs` and
  `Modules/Messaging` areas already fall under the existing
  `..\Modules\**\*.Spec.cs` include, so no new shell line is needed; the same is
  true for `Infrastructure/**`. (Only a brand-new *sibling of* `Modules/` would
  need its own `Compile Include` line — none is introduced.)

---

## 9. Testing strategy

Testcontainers integration specs (Docker Postgres, per `docs/guides/api-integration-tests.md`),
co-located `*.Spec.cs`, `ItShould…` naming, and the shipped dispatcher's
**public-methods-for-determinism** discipline (drive `ClaimBatchAsync` /
`ProcessBatchAsync` / handler methods directly so assertions never race the live
background loop; schedule control rows into the future as
`InvitationEmailOutboxDispatcherSpec` did). Contention/claim specs assert
**ownership and counts**, not merely "something happened" (F23).

Engine (`JobQueueProcessor.Spec.cs` and siblings):

| Spec | Proves |
| --- | --- |
| claim contention | two concurrent `ClaimBatchAsync` never claim the same id; each claimed row carries the claimer's `lock_token`/`locked_by`; expected total counts (non-vacuous) |
| execution order (F9 regression) | dispatch preserves `priority DESC` + deterministic tie-breakers from the claim |
| lease reclaim + fencing (F1) | a row `Processing` past `locked_until` is reset and re-claimable with a **new** token; before expiry it is not |
| **old-owner-after-reclaim (F1/F23)** | owner A's lease expires mid-run; B reclaims; A's success delete / retry update affects **0 rows**, A's outcome is discarded, B's outcome stands |
| **full-batch lease expiry (F1/F23)** | a slow serial batch: per-dispatch re-stamp + `lease/2` renewal keep the last job's lease alive; with renewal disabled the fence (not luck) protects the reclaimed rows |
| backoff requeue (#810 class) | after `Retry` the row is `Pending` with SQL-computed future `next_attempt_at`; **unclaimable before, claimable after** |
| **cancellation classification (F12/F23)** | a provider-style `TaskCanceledException` → `Retry`, worker keeps running; host-token stop → clean release, no attempt burned, no DLQ |
| outcome taxonomy (F12) | malformed payload / unknown `job_type` / `PermanentFailure` skip retries and dead-letter immediately; `Cancelled` deletes without DLQ |
| DLQ on exhaustion + hook (F5) | at terminal: `OnTerminalFailureAsync` ran, full envelope (priority, key, provenance, enqueued_at) present in `job_dead_letter`, queue row gone — and a **throwing hook rolls back** the whole terminal transaction |
| **exact wire JSON (F2/F23)** | the byte-exact fold-migration JSON (`{"invitationId":"…"}`) deserializes into each payload record via `JobJson` with correct Guids; enqueuer output round-trips; missing/empty ID → `PermanentFailure` |
| **enqueue boundary (F15)** | architecture guard: no code outside `Infrastructure/Jobs` writes `JobQueueItem`; enqueuer joins the caller's transaction (rollback removes the job row) |
| idempotent enqueue scoping (F13) | same `(job_type, key)` dedups; same key across different job types does not collide |
| **signal coalescing + backlog drain (F10/F23)** | enqueue 3× batch size with a single NOTIFY → all rows processed in one wake (drain loop), no poll-tick waits |
| **listener disconnect/catch-up + backoff (F23/C17)** | kill the listener connection; rows committed while down are processed after reconnect's catch-up poll; reconnect uses bounded jittered backoff |
| **renewal transient vs. confirmed-loss + safety margin (C7/R2-4)** | a renewal that *throws* (transient) retries at `lease/8` while margin remains; a renewal returning **0 rows** cancels the handler at once; **a transient outage spanning `confirmedDbDeadline − safetyMargin` cancels the handler BEFORE the lease boundary while a second worker reclaims — the first's settlement no-ops on the fence** |
| **error sanitization (`JobErrorSanitizer.Spec.cs`, C11/F20/R2-8)** | an exception message carrying an email + a token blob → stored `last_error` is type-coded, redacted (`[redacted-email]`/`[redacted-token]`), ≤ 2 KB; **a logged exception carrying an email/token is redacted at the sink** (destructuring policy), and the engine logs `Describe` + stack metadata, never the raw message |
| **version-compat startup gate (C14/F14/R2-9)** | a `job_queue` **or** `job_dead_letter` row of an unregistered `job_type` → worker composition **fails to start**; **there is no bypass for a `job_queue` orphan**; a DLQ-only orphan in `JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST` (exact type) boots; all-registered → starts clean |
| **DLQ requeue lineage + single-use (C9/F16/R2-7)** | `RequeueDeadLetterAsync` restores the stored envelope verbatim, validates the stored JSON via the type-erased `JobRegistration.ValidatePayloadJson`, sets `requeued_from_dead_letter_id` + `requeued_as_job_id`, writes the audit row atomically; unregistered/invalid → clear error, no enqueue; **a second requeue of the same DLQ row (its `requeued_as_job_id` already set) is rejected**; a re-failure requeues from its new DLQ row, chain preserved |
| **system-job durable occurrence dedup (C4/F13/R2-1)** | an occurrence enqueues its `(job_key, scheduled_fire_at)` ledger row atomically with the queue insert; a **delayed duplicate firing of the same occurrence after the first job already completed and its queue row was deleted enqueues nothing** (ledger PK conflict); catalog-unknown `job_key` skipped; dispatch routes only through `IJobEnqueuer`; startup asserts catalog→definition→handler closure |
| leader election (`SchedulerLeaderService.Spec.cs`) | two hosts contend the advisory lock; exactly one starts Quartz; release migrates leadership; **standby is confirmed before the lock releases**, and an unconfirmed standby fails closed (lock retained) |
| `AppRoleComposition.Spec.cs` (F17/C5) | `Worker` builds a Generic Host — **no server/endpoints exist**, and the full DI graph resolves without web registrations; the spec enumerates **every registered `IHostedService`** (not one namespace) and asserts `Api` registers **zero** job/worker hosted-services — including the transitional legacy outbox dispatcher |

Email handlers + fold:

| Spec | Proves |
| --- | --- |
| kind routing | each email `job_type` resolves its registered handler, which calls the right `IEmailService` method |
| **eligibility race, both lock orders (F8/#811)** | order 1: revoke commits before the handler's locked read → no send, `CancelledIneligible` logged. order 2: handler holds the lock paused at the fake-sender barrier → the concurrent revoke **blocks** (does not complete), the send proceeds, revoke commits after — asserting the documented linearization semantic, not a preemption the design does not provide |
| `email_log` terminal writes | `Submitted` / `CancelledIneligible` / `PermanentlyFailed` each produce exactly one row with kind/recipient/entity ids/`provider_message_id`/`request_sha256` |
| send idempotency + two-phase prepare + local recheck (F7/C1/R2-2) | re-running a job whose `Submitted` row exists sends **nothing**; the PREPARE transaction commits `request_body` **before** the provider call, and `SendPreparedAsync` sends those **exact bytes**, so a crash after provider-accept/before send-commit resends byte-identically even after the domain row mutates; a transient failure leaves the committed scratch; **two reclaimed handlers racing past step 0 — the second re-checks `email_log` under the SEND lock and does not call the provider** |
| legacy `Sent` mapped honestly (R2-3) | a folded legacy `Sent` row becomes `LegacySubmissionUnverified`, **never `Submitted`**; no metric counts it as a confirmed submission |
| prepared-send cleanup anti-join (C1) | the retention sweep deletes a prepared-send row **only** when its `job_id` is absent from both `job_queue` and `job_dead_letter`; a live job's envelope is never swept regardless of age |
| **non-throw provider failure (F3/F23)** | an unsuccessful provider response (no exception thrown by the SDK) surfaces as a classified exception → `Retry`/`PermanentFailure`; it can never yield `Submitted` |
| #809 durability + rollback (F6) | the committed reset job survives request cancellation/restart and is deliverable; a failed enqueue rolls back token issuance and vice versa (both directions) |
| **fold idempotency + in-flight dispatcher (F4/F23/C2/C3)** | re-running the fold produces no duplicate jobs (source-row marker); a `Processing` row is untouched by R1's fold and drains via the old path; **R2's quiescence check aborts the drop for a fresh `Processing`, a stale (older-than-lease) `Processing`, and a fresh old-producer `Pending` row alike**; a folded row (fold sentinel) is **excluded** from back-copy so it never gets a false `CancelledIneligible` — only genuine `Sent`/`Failed`/`Cancelled` rows are copied, `legacy_outbox_id`-idempotent |

The `AppRoleComposition` spec is the architecture-convention analogue of
`ServiceArgsRecordConvention.Spec.cs`: it discovers composition facts by
reflection and fails the build on drift.

---

## 10. Build order (packet map)

**Legend:** ✅ create, ✎ touch. A phase's **gate** is its verification bar.
Sequencing: **2A (shipped) → 2A-R (engine remediation) → 2B ∥ 2C-R1 → 2C-R2 →
3 → 4.** 2B and 2C both consume 2A-R's contracts (`IHostApplicationBuilder`
registration seam; `JobOutcome`/`IJobEnqueuer`/`JobJson`).

### Phase 2A — #633: core queue + processor (SHIPPED, pre-audit)

As built: `job_queue`/`job_dead_letter` tables, claim/lease/backoff engine,
specs. The audit found it incomplete; 2A-R below is its remediation packet.

### Phase 2A-R — engine remediation (absorbs F1, F2, F5, F9–F16, F21, F22)

- **Create:** `Infrastructure/Jobs/{JobOutcome,JobJson,IJobEnqueuer,JobEnqueuer,JobDefinition,JobsMetrics,JobErrorSanitizer}.cs`
  (`JobErrorSanitizer` is the single C11/F20 persistence boundary);
  migration `HardenJobQueueEnvelope` — adds `lock_token`, `tenant_id`,
  `actor_user_id`, `correlation_id`, **`requeued_from_dead_letter_id`** (C9/F16
  lineage on both `job_queue` and `job_dead_letter`, + `requeued_as_job_id` /
  `requeued_at` on the DLQ), CHECK constraints, rescopes the idempotency index to
  `(job_type, idempotency_key)`, extends the claim index tie-break +
  `job_dead_letter` envelope columns (§4.2), sets `job_queue`
  autovacuum/fillfactor params (§4.1), and bumps the `max_attempts` default
  to 10.
- **Touch:** `JobQueueProcessor.cs` (split stale-reset from pending-only claim;
  **ordered post-claim re-query for dispatch — not `RETURNING` order** (C16);
  fencing-conditioned transitions + rowcount checks; per-dispatch lease
  re-stamp + `lease/2` renewal with **confirmed-loss vs. transient distinction —
  `lease/8` retry, renewal `RETURNING locked_until, now()`, abandon *before*
  `confirmedDbDeadline − safetyMargin`** (C7/R2-4; **known 633 code-gap: current
  tip cancels only after a full local window — reconcile**); drain loop with
  budget; outcome taxonomy + exception classification; all durable error strings
  via `JobErrorSanitizer` and **redacted-exception logging** — `Describe` + safe
  stack metadata, never the raw message (C11/R2-8; **known 633 code-gap: current
  tip logs the raw exception — reconcile**)); a Serilog exception-redaction
  destructuring policy registered on the logger (R2-8); SQL-time backoff with
  equal jitter + `Retry-After`); `IJobHandler.cs` (`JobOutcome` return +
  `OnTerminalFailureAsync` — F5); `JobBackoff.cs` (computes delay
  **durations** only, never timestamps — F11); `JobQueueItem.cs` /
  `JobDeadLetter.cs` (new columns; **remove all timestamp initializers** —
  F11); `JobHandlerRegistry.cs` → **unified `JobRegistration`** (pairs handler
  factory **and** type-erased `ValidatePayloadJson` for the requeue path —
  R2-7; versioned types, unknown-type → DLQ). The drain-budget/lease knobs use
  code constants until 2B's `AppEnvironment` edit lands (call-out below).
- **Gate:** all engine specs in §9 green, including old-owner-after-reclaim,
  full-batch lease expiry, cancellation classification, exact wire JSON,
  enqueue-boundary guard, drain, taxonomy; `EXPLAIN (ANALYZE, BUFFERS)` on the
  claim at ~100 k-row cardinality shows the partial-index ordered scan (F22),
  recorded in the PR.

### Phase 2B — #634: `APP_ROLE` + leadership + Quartz (absorbs F17–F19, F24)

- **Create:** `Infrastructure/Jobs/SchedulerLeaderService.cs`;
  `Infrastructure/Jobs/Quartz/{SyncSystemJobsJob,RecoverStaleJobsJob,EnqueueSystemJobJob,ScopedJobFactory,SystemJobCatalog}.cs`
  (**`SystemJobCatalog` + catalog-driven `EnqueueSystemJobJob` enqueuing through
  `IJobEnqueuer`** — C4/F15); `Modules/Jobs/Seeders/SystemJobSeeder.cs`;
  `Infrastructure/Jobs/JobRegistryStartupGate.cs` (**fail-closed version-compat
  gate over `job_queue` + `job_dead_letter`, no `job_queue` bypass, DLQ-only exact
  allowlist** — C14/F14/R2-9; **+ catalog→definition→handler closure check** —
  R2-1); `Modules/Jobs/Entities/{SystemJobDefinition,SystemJobOccurrence}.cs`
  (**occurrence ledger** — R2-1); migration `AddSystemJobDefinitions`
  (**+ `system_job_occurrences`** — R2-1); `Infrastructure/Jobs/WorkerHeartbeatService.cs`;
  `SchedulerLeaderService.Spec.cs`, `AppRoleComposition.Spec.cs`,
  `SystemJobCatalog`/`EnqueueSystemJobJob`/occurrence-dedup specs.
- **Touch:** `AppEnvironment.cs` (`APP_ROLE` + validator + **env-gated default:
  `All` only under `Development`/`Testing`, fail-fast when a production-like
  environment omits it** — C6/F24; tuning vars incl. drain budget + retention
  windows incl. `EMAIL_PREPARED_SEND_RETENTION_DAYS` + `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS`
  — R2-11/R2-1; **`JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST` (DLQ-only exact types) — no
  global bypass boolean** — R2-9); **move the legacy `InvitationEmailOutboxDispatcher`
  registration from shared `AddInfraServices` into worker-only `AddWorkerServices`
  here in 2B** (R2-6 — so 2B alone satisfies D1; 2C-R1 merely retains it);
  `Program.cs` (**Generic Host for `Worker`** — F17; role branching;
  `--worker-health`; run `JobRegistryStartupGate` **+ catalog closure check**
  before the worker loop); `ServiceRegistration.cs` (retarget shared registrations
  to `IHostApplicationBuilder`; move `AddHttpContextAccessor` into shared infra —
  F17); `Dockerfile`
  (**`APP_ROLE=api` in the build-time OpenAPI env block** — C6/F24);
  `apps/front-2/docker-compose.test.yml` (`APP_ROLE=api` — C6/F24);
  **the OpenAPI-drift / `generate-client` CI workflow (`APP_ROLE=api`)** and any
  other app-boot CI job (C6/F24 entrypoint enumeration, §3.1);
  `dokploy.yml` (worker service: shared storage volume — F18; no
  `container_name`, `stop_grace_period: 45s` on both services — F19; immutable
  `${RELEASE_TAG}` images — F14); Quartz packages in
  `Directory.Packages.props` + `PublyApp.Api.csproj`; `AppDbContext.cs`
  (`SystemJobDefinition` + `SystemJobOccurrence` DbSets).
- **Gate:** leader-election spec green (incl. standby-confirmed release);
  `AppRoleComposition` proves the worker host has **no HTTP server** and a
  resolvable DI graph, and — enumerating **every `IHostedService`** — that api
  registers **zero** job/worker services (C5); the version-compat startup gate
  fails closed on an unregistered queued/DLQ type (C14); worker container passes
  `--worker-health`; every enumerated OpenAPI/CI/build entrypoint runs
  role-pinned (C6).

### Phase 2C-R1 — #809/#810/#811: email jobs + `email_log` + fold (absorbs F3, F4, F6, F7, F8, F20) — **DEPENDS ON 2A-R**

- **Create:** `Modules/Messaging/Entities/{EmailLog,EmailPreparedSend}.cs`
  (+ `EmailKind`, `EmailLogOutcome`), `Modules/Messaging/Services/EmailLogWriter.cs`;
  `Modules/Invitations/Jobs/{TenantInvitationEmailJobHandler,StaffInvitationEmailJobHandler}.cs`
  (+ payload records + `InvitationEmailJobs.cs` definitions + specs);
  `Modules/Auth/Jobs/PasswordResetEmailJobHandler.cs` (+ payload record +
  `AuthEmailJobs.cs` + spec); `Modules/Auth/Services/PasswordResetService.cs`
  (F6, + spec incl. both rollback directions); `RequestPasswordReset.Spec.cs`;
  `Infrastructure/Messaging/Email/EmailProviderException.cs` (classified
  hierarchy — F3); `Infrastructure/Jobs/JobQueueListener.cs` +
  `IJobQueueSignal.cs`; migration `AddEmailLogAndFoldEmailOutbox` (§4.6 R1).
- **Touch:** `ResendEmailAdapter.cs` + `EmailService.cs` (**F3 contract:
  classified throws + `EmailSendReceipt` — fixes the live result-swallowing
  bug**; **+ `SendPreparedAsync(ReadOnlyMemory<byte>, idempotencyKey)`** — the
  byte-faithful transport, R2-2); producers `InvitationService.cs`,
  `TenantAsStaffService.cs`, `StaffProfileAsStaffService.cs` (→ `IJobEnqueuer` +
  NOTIFY); `RequestPasswordReset.cs` (→ `IPasswordResetService`); revoke/accept
  services (remove `CancelPendingForInvitationAsync` calls); `AppDbContext.cs`
  (`EmailLog`/`EmailPreparedSend` DbSets). **The legacy dispatcher is already
  worker-only from 2B (R2-6); R1 merely retains it as a drainer** (§4.6). The
  `email_prepared_sends` scratch persists the request as **`bytea` (`request_body`)
  with a committed-PREPARE phase — no `prepared_committed` flag, row existence is
  the proof** (C1/R2-12); `EmailLogOutcome` includes **`LegacySubmissionUnverified`**
  (R2-3); the fold migration marks folded rows with the reserved sentinel,
  back-copies **genuine outcomes only** with `Sent → LegacySubmissionUnverified`
  and a **SQL-side stable error code** (C3/R2-3/R2-8).
- **Gate:** §9 email-handler specs green (both lock orders, prepared-envelope
  idempotency, non-throw provider failure, terminal `email_log` writes, #809
  rollback both directions); fold idempotency spec green; `just test-api`
  green.

### Phase 2C-R2 — drop the outbox (small follow-up release)

- Migration `DropInvitationEmailOutbox` (**`ACCESS EXCLUSIVE` lock + total
  quiescence check — zero `Pending`/`Processing` regardless of age**, C2 —
  straggler genuine-outcome back-copy + DROP — §4.6); **delete**
  `InvitationEmailOutboxDispatcher.cs` (+ spec), `InvitationEmailOutboxSignal.cs`,
  `InvitationEmailOutbox.cs`; remove their (worker-only) registrations + DbSet.
  Gate: quiescence check exercised in a spec across **fresh `Processing`, stale
  `Processing`, and fresh old-producer `Pending`** (C2); full suite green with the
  outbox code gone.

### Parallelization

- **2A-R first** — it owns the engine contracts everything else consumes.
- **2B ∥ 2C-R1 after 2A-R**, at the feature-code level: 2B lives in
  `Infrastructure/Jobs` + `AppEnvironment`/`Program`/`Dockerfile`/`dokploy`; 2C
  lives in `Modules/Messaging` + `Modules/Invitations` + `Modules/Auth` +
  `Infrastructure/Messaging/Email` + `Infrastructure/Jobs` (listener only — a
  new file).
- **Shared-file hazards (call-outs):**
  1. **`AppDbContext.cs`** — 2A-R none, 2B adds `SystemJobDefinition`, 2C-R1
     adds `EmailLog`/`EmailPreparedSend`, 2C-R2 removes the outbox DbSet.
     Trivial merges; serialize if possible.
  2. **EF migrations + `AppDbContextModelSnapshot.cs`** — 2A-R, 2B, 2C-R1,
     2C-R2 each add a migration; whichever lands later must regenerate against
     the updated snapshot (`just db-add` after rebasing). 2C-R1's fold
     presupposes 2A-R's hardened envelope (it stamps `idempotency_key`).
  3. **`AppEnvironment.cs`** — 2B owns it (role + all new tuning/retention
     vars). 2A-R uses code constants for the drain budget until 2B lands, then
     switches to the env var — no concurrent edit.
  4. **`ServiceRegistration.cs` / `Program.cs`** — 2B owns the
     Generic-Host/role restructure (F17); 2C-R1 also edits
     `ServiceRegistration.cs` (email adapter/service changes are in-place;
     outbox registration removal waits for 2C-R2). Land 2B's restructure
     before 2C-R2's removals.
  5. **`IJobHandler`/engine contracts** — owned by 2A-R; 2B/2C consume, never
     edit.

### Phase 3 — #635: recovery/DLQ ops + first system jobs + observability sampler

`RecoverStaleJobsJob` + `SyncSystemJobsJob` seed rows; first recurring
handlers: session cleanup (#389, `Modules/Auth/Jobs/`) and expired-invitation
status (#425, `Modules/Invitations/Jobs/`), each with an idempotency spec and a
domain outcome marker where applicable (F13); `JobQueueMonitorService` (§7.2 —
**per-replica, instance-tagged, not leader-gated**, + `scheduler.leader_present`
and sync-staleness alerts — R2-10); **the one wired alert route** (Serilog
warning+ webhook sink — O8/R2-10); retention sweep jobs (§7.3 — email_log, DLQ,
prepared-sends via `EMAIL_PREPARED_SEND_RETENTION_DAYS`, and
`system_job_occurrences` via `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS` — R2-11/R2-1).
Gate: jobs run on schedule under `worker`; sampler emits gauges and threshold
warnings **from a follower with no leader present**; the alert route fires on a
seeded breach; retention deletes only out-of-window rows.

### Phase 4 — #636: staff job-visibility dashboard (sketch only)

Staff endpoints (`/staff/...`, per route-design guide) over `job_queue`,
`job_dead_letter`, `system_job_definitions`, and **`email_log`**: list/inspect
(payload view behind its own read permission — F20), **server-side
requeue-from-DLQ per the §4.2 contract** (engine-only `RequeueDeadLetterAsync`
restoring the stored envelope + lineage chaining, `staff:jobs:dead-letter:requeue`
permission, immutable audit entry, no client payload override — F16/C9),
enable/disable + edit-cron system jobs. Follows
existing staff list-page + permission patterns. **Design-sketch scope only in
this doc**; full UI spec is out of Epic A's core.

### Follow-ups (not in this build order)

- **#317** — `packages/shared-cs` + `apps/worker` extraction, thin hosts,
  `seed-bulk` move. Revisit when the role-based single image is outgrown.
- Durable Quartz store (`qrtz_*`) — only if misfire-across-restart semantics are
  ever required.
- #646 (D3) `ScheduledPost` + `DispatchDuePostsJob` — the design accommodates it
  (idempotent enqueue + domain outcome marker, priority) but Epic A does not
  build it.
- Provider delivery webhooks (delivered/bounced/complaint → `email_log`
  enrichment) — required before any UI claims "delivered" (F20).
- Object storage for export artifacts (replaces the shared volume when the
  fleet spans hosts — F18).
- OTel/Prometheus exporter for the `PublyApp.Jobs` meter (§7 v1 is log-based).
- Priority aging in the claim ORDER BY — only if §7's fairness tripwire fires
  (F22).

---

## 11. Open questions for the owner

Kept short; everything else is decided above. O1 and O4 are **superseded** by
the same-night D2 revision and retained only for the record.

- ~~**O1 — Rename a just-shipped production table?**~~ **SUPERSEDED
  (2026-07-16, single-lane ruling):** there is no rename — the table folds into
  `job_queue` + `email_log` and is dropped via expand/contract (§4.6).
- **O2 — Cross-process wake mechanism.** §5.5 recommends **`LISTEN`/`NOTIFY` +
  poll fallback** (retiring the `SemaphoreSlim`). *Ratified.* Now applies to
  `job_queue` inserts generally (single channel).
- **O3 — Worker liveness mechanism.** §3.5 recommends a **file-heartbeat +
  `--worker-health` CLI probe** (no HTTP, honoring D1). *Ratified.*
- ~~**O4 — Password-reset lane.**~~ **SUPERSEDED (2026-07-16, single-lane
  ruling):** there is no typed lane — #809 becomes the `email.password-reset.v1`
  job (§5.4).
- **O5 — `Modules/Messaging/` home.** *Ratified, then repurposed by the D2
  revision:* the module now houses `EmailLog`/`EmailPreparedSend` + the shared
  email enums + `EmailLogWriter`; email job handlers live in their owning
  domains (§8).
- **O6 — Migrate sent-row history into `email_log`? — AUTHOR-DECIDED: copy
  (pending owner objection).** §4.6 R1 copies the historical **genuine** terminal
  rows (`Sent`/`Failed`/real `Cancelled`; fold sentinel excluded, C3) from
  `invitation_email_outbox` into `email_log` (with `legacy_outbox_id` lineage)
  before the R2 drop, so delivery history is complete from the feature's first
  day. Cost is trivial (days-old, small table); the alternative is dropping
  history with the table. **Decided: copy** — the schema and build packets embed
  it; it transforms production data (not just schema), so an explicit owner
  **no** is the only thing that would reverse it.
- **O7 — Retention windows (F20). — AUTHOR-DECIDED: adopt defaults (pending owner
  objection).** `email_log` 180 days (`EMAIL_LOG_RETENTION_DAYS`),
  `job_dead_letter` 90 days (`JOB_DEAD_LETTER_RETENTION_DAYS`),
  `email_prepared_sends` orphans 7 days behind the live-state anti-join
  (`EMAIL_PREPARED_SEND_RETENTION_DAYS` — a real env var now, R2-11) — enforced by
  Phase-3 sweep jobs (§7.3), env-overridable. **Decided: adopt these defaults.**
  Flagged because retention of recipient personal data is policy territory; the
  owner may override any window without a design change (all are env vars, §3.1).
- **O9 — System-job occurrence ledger: retention + gap policy (R2-1). —
  AUTHOR-DECIDED (pending owner objection).** The `system_job_occurrences` durable
  dedup table (§4.3) is pruned to `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS` (default
  30 — long enough to dedup any realistic re-fire, short enough to stay small),
  and the default missed-occurrence policy is **drop-on-gap** (idempotent
  recurring sweeps don't back-fill; per-entry bounded catch-up is opt-in — §5.3).
  **Decided: 30-day prune, drop-on-gap default.** Flagged because both are
  operational tuning the owner may adjust.
- **O8 — Alert route (F21/C12). — AUTHOR-DECIDED: telemetry-only v1 + one wired
  route in Phase 3 (pending owner objection).** v1 is telemetry-only (§7); Phase 3
  wires exactly one real destination — **default recommendation: a Serilog
  warning+ webhook sink to the operator's existing notification channel**, with an
  OTel/Prometheus exporter as the alternative if a metrics backend is stood up.
  **Decided: telemetry v1, webhook-sink route in Phase 3.** Flagged because the
  concrete destination is an ops/policy choice, not an engineering one.

### Ratification record

**2026-07-16 (owner, night session):** O1–O5 all approved as recommended — rename+extend migration, `LISTEN`/`NOTIFY` + poll fallback, file-heartbeat `--worker-health` probe, password-reset on typed `EmailOutbox`, new `Modules/Messaging/` home. This design is authoritative for Epic A implementation.

**2026-07-16 (owner, later the same night session) — D2 REVISED, supersedes parts of the above:**
the two-lane ruling (typed `EmailOutbox` + generic `job_queue`) is reversed to a
**single-lane design**: emails fold into the generic `job_queue` (no typed
`email_outbox` table, no rename migration — **O1 and O4 are void**), because
pure-Postgres job inserts are already transactional with domain writes, two
lanes duplicate claim/lease/backoff/recovery/DLQ/dashboard machinery forever,
and typed-table-per-concern would proliferate with future side-effects
(webhooks, Epic D provider publishing). Additionally the owner mandated
**`email_log` from day one** (deferral explicitly rejected — paraphrasing the
owner: *"I want the correct way of doing things from now"*): an append-only
delivery record written on terminal outcomes, keeping the queue
delete-on-success. O2 carries over generalized to all `job_queue` inserts; O3
unchanged; O5's `Modules/Messaging/` module is repurposed for `EmailLog` and the
email enums. Sections §2 (D2), §4.4/§4.6, §5.4/§5.5, and the Phase-2C build
order reflect this revision; O6 (historical sent-row copy) is newly flagged.

**2026-07-16 (same night) — sol@high audit absorbed (6 blockers / 15 majors;
`.dump/exec/jobs-infra/audit-findings.md`), owner mandate: correct-by-design,
no deferral framing.** Design-level changes: lease **fencing tokens +
conditioned transitions + renewal** (F1); canonical `JobJson` payload contract
matched by migration SQL (F2); corrected email-failure contract — classified
provider exceptions + receipts, marked as a live pre-existing bug (F3); the
fold migration rewritten as a **two-release expand/contract** with source-row
markers and a quiescence-gated drop, replacing the false "seconds-long window"
single-shot claim (F4); `OnTerminalFailureAsync` specified as transactional
(F5); #809 respecified behind a transaction-owning `IPasswordResetService`
(F6); exactly-once softened to a **bounded at-least-once guarantee** with a
prepared-send envelope table (F7); #811's linearization point defined and the
two-lock-order test specified honestly (F8); drain-until-short-batch loop
(F10); total database-time stance (F11); typed outcome taxonomy + cancellation
classification + 10-attempt jittered schedule (F12); idempotency rescoped to
`(job_type, key)` + domain outcome markers (F13); versioned job types +
mixed-version rules + immutable image tags (F14); `IJobEnqueuer`/definition
catalog + provenance envelope + DB constraints (F15); DLQ full-envelope
preservation + server-side permissioned requeue (F16); worker role redefined as
a **Generic Host with no HTTP server** + shared-DI relocation (F17); shared
storage volume, no fixed container names, `stop_grace_period` (F18/F19);
`email_log`/DLQ privacy-retention-supportability contract with `Submitted`
honesty (F20); new **§7 Observability & operations** + autovacuum plan (F21);
claim split into stale-reset + pending-only hot path with an EXPLAIN gate and a
fairness tripwire stance (F22); §9 extended with the F23 adversarial spec list;
`APP_ROLE` pinned for OpenAPI generation and front-2 e2e (F24). Build order
re-cut as 2A-R (engine remediation) → 2B ∥ 2C-R1 → 2C-R2. New open question O7
(retention windows).

**2026-07-17 — PR #852 merge-challenge round 1 remediated (4 merge-blockers /
10 majors / 3 minors; `.dump/exec/jobs-infra/doc-challenge-r1-findings.md`).**
Every finding was resolved as a *mechanism*, grounded in the implemented reality
of `origin/feat/633-job-queue-core` and `origin/feat/634-app-role-quartz`:
- **C1 (prepared envelope, F7):** two-phase send — a **committed PREPARE**
  transaction persisting canonical request bytes as **`text`** (not `jsonb`),
  then a separate **locked SEND**; transient failure keeps the committed scratch;
  cleanup is a **live-state anti-join** on `job_queue`/`job_dead_letter`, never
  age alone (§4.5/§5.4/§7.3).
- **C2 (R2 drop, F4):** `ACCESS EXCLUSIVE` lock + **zero `Pending`/`Processing`
  regardless of age** before drop (§4.6).
- **C3 (false cancellation history, F4):** folded rows carry a reserved
  **sentinel**, excluded from back-copy; genuine outcomes only; `legacy_outbox_id`
  unique index; explicit timestamp mapping; historical errors sanitized (§4.4/§4.6).
- **C4 (system-job dispatch, F15):** **`SystemJobCatalog`** maps stable `job_key`
  → versioned `JobDefinition` + payload factory + cron tz/misfire +
  scheduled-occurrence idempotency key; `EnqueueSystemJobJob` enqueues **only**
  through `IJobEnqueuer`; catalog-unknown rows skipped; `SystemJobSeeder` named
  (§4.3/§5.3).
- **C5 (legacy dispatcher composition, F17):** legacy dispatcher registered
  **worker-only** through R1; `AppRoleComposition` inspects **every
  `IHostedService`** (§3.2/§9).
- **C6 (`All` fallback, F24):** default `All` **only in Development/Testing**;
  **fail-fast** in production-like environments; **all** OpenAPI/CI/build
  entrypoints enumerated and pinned (§3.1/§3.3).
- **C7 (renewal semantics, F1):** confirmed-loss (0 rows → cancel) vs. transient
  error (**`lease/8` bounded retry within the window; cancel only after a full
  unconfirmed lease window**) — the implemented `RenewLeaseLoopAsync` (§5.1/§6).
- **C8 (graceful drain):** doc aligned to the **implemented** cancellation
  semantics (immediate in-flight cancel + already-returned outcomes committed on
  `None` + proactive release + fence); the challenge's two-token "wait for
  in-flight" remedy is **deliberately not adopted** (idempotent at-least-once
  re-run — §3.6, reasoned deviation).
- **C9 (DLQ requeue, F16):** engine-only **`RequeueDeadLetterAsync`** restoring
  the stored envelope verbatim + **lineage chaining**
  (`requeued_from_dead_letter_id`/`requeued_as_job_id`) + atomic audit (§4.2).
- **C10 (external-effect idempotency, F13):** external side effects require a
  provider idempotency identity + immutable prepared request + persisted receipt;
  Epic D Bluesky **must** use a deterministic `rkey` — `published_at` alone is
  insufficient (§4.1).
- **C11 (sanitization, F20):** `JobErrorSanitizer` specified as the **one
  boundary** — exception-type safe codes, email/token redaction, 2 KB bound,
  originals only to protected structured logs (§5.1).
- **C12 (observability, F21):** honest **telemetry-only v1** (no alert route/
  exporter in the console+file stack); scheduler/listener health + last-success
  timestamps added; global gauges **leader-gated** (§7).
- **C13 (self-contained claim):** authoritative scope **narrowed to Phases
  2A-R/2B/2C**, Phase 3/4 marked design-direction with build-grade contracts
  where they are core dependencies; **O6/O7 ratified** (author-decided), **O8**
  (alert route) added and decided (opening note; §11).
- **C14 (version compat, F14):** **fail-closed `JobRegistryStartupGate`** over
  `job_queue` **and** `job_dead_letter`; handler-removal release gate (§5.1).
- **C15 (per-definition lease, F15):** claim removed — lease is a single global
  `JOB_LEASE_SECONDS`; per-definition tuning is `max_attempts` only (§5.1/§5.4).
- **C16 (claim order, F9):** dispatch uses an explicit **ordered post-claim
  re-query**; `RETURNING` order is forbidden (§5.1).
- **C17 (listener topology, §5.5):** **one listener per replica**; Postgres
  broadcasts to all sessions; bounded no-op claims accepted; **reconnect
  backoff + jitter**; dedicated **non-pooled** continuously-held connection (§5.5).

Author-decided (pending owner objection): **O6** (copy sent-row history), **O7**
(retention defaults 180/90/7 days), **O8** (telemetry-only v1 + webhook-sink
alert route in Phase 3). One reasoned dispute recorded: **C8**'s specific
two-token remedy is declined in favor of the coherent implemented immediate-cancel
+ release semantics; the finding's actual defect (the doc's phantom grace budget)
is fixed. New open question **O8** (alert route).

**2026-07-17 — PR #852 merge-challenge round 2 remediated (3 merge-blockers /
7 majors / 1 minor / 1 editorial; `.dump/exec/jobs-infra/doc-challenge-r2-findings.md`).**
Round 2 accepted the C8 dispute verbatim and graded 9/17 C-fixes Absorbed; the
12 remaining findings are resolved as mechanisms:
- **R2-1 (occurrence identity, MB):** durable **`system_job_occurrences`** table
  with a `(job_key, scheduled_fire_at)` PK written atomically with enqueue and
  surviving queue deletion; **drop-on-gap** default with per-entry bounded
  catch-up (RAMJobStore cannot back-fill — the ledger is the memory);
  catalog→definition→handler closure validated at the startup gate (§4.3/§5.3).
- **R2-2 (byte-faithful transport, MB):** `SendPreparedAsync(ReadOnlyMemory<byte>,
  idempotencyKey)` writes the persisted `request_body` (a dedicated *transport*
  serializer, **not** `JobJson`) straight to the provider POST body; honest
  SDK-canonical fallback documented; **post-lock `email_log` recheck inside the
  SEND transaction** closes the local double-send race (§4.5/§5.4).
- **R2-3 (legacy `Sent`, MB):** folded legacy `Sent` → **`LegacySubmissionUnverified`**,
  never `Submitted` (which means "provider accepted") — F3 proves the old status
  is not evidence of acceptance (§4.4/§4.6).
- **R2-4 (renewal margin, major):** renewal `RETURNING locked_until, now()`;
  abandon **before `confirmedDbDeadline − safetyMargin`**, never at/after the
  lease boundary (633 code-gap flagged for reconciliation) (§5.1).
- **R2-5 (R2 producer quiescence, major):** explicit inspectable fleet
  precondition (all API/worker on R1-or-newer immutable tags) *before* the
  row-lock/check; blocked-old-producer case added to the rollout analysis (§4.6).
- **R2-6 (legacy dispatcher packet, major):** the worker-only registration move is
  reassigned to **Phase 2B** (2C-R1 merely retains it) so 2B alone satisfies D1
  (§3.2/§10).
- **R2-7 (requeue registry + single-use, major):** unified **`JobRegistration`**
  (handler factory + type-erased `ValidatePayloadJson`); requeue conditioned
  atomically on `requeued_as_job_id IS NULL`; re-failures requeue from their new
  DLQ row, never the ancestor (§4.2/§5.1).
- **R2-8 (sanitization bypasses, major):** migration errors → **SQL-side stable
  code** (no C# sanitizer call, raw legacy text not copied); live path logs
  `Describe` + safe stack metadata, **never the raw exception message**, with a
  Serilog exception-redaction destructuring backstop (§4.6/§5.1; 633 log-call gap
  flagged).
- **R2-9 (registry escape hatch, major):** the global
  `JOB_REGISTRY_ALLOW_UNREGISTERED` boolean is **removed** — unregistered
  `job_queue` types never boot; the only relaxation is a **DLQ-only exact-type
  allowlist** (§5.1).
- **R2-10 (observability, major):** one release sequence (2A-R telemetry → Phase 3
  alert route); the queue sampler is **per-replica, instance-tagged, not
  leader-gated**, aggregated by condition; **`scheduler.leader_present`** +
  sync-staleness alerts make leader-absence itself alertable (§7).
- **R2-11 (prepared-send retention var, minor):** `EMAIL_PREPARED_SEND_RETENTION_DAYS`
  added to the config surface + sweep wiring (§3.1/§7.3).
- **R2-12 (`prepared_committed`, editorial):** column **removed** — row existence
  is the PREPARE-committed proof; `prepared_at` retained for the orphan floor
  (§4.5).

New author-decided item: **O9** (occurrence-ledger 30-day prune + drop-on-gap
default). Two 633-tip code-alignment items are flagged for the captain's
reconciliation round (do not touch code branches): **R2-4** renewal margin and
**R2-8** raw-exception logging — the document specifies the correct contract; the
code lags. No disputes this round.
