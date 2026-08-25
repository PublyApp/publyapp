# Background Jobs & Worker Infrastructure — Design

> Status: **design, owner-ratified core decisions 2026-07-16; revised same
> night; merge-challenge rounds 1–10 remediated 2026-07-17.** The adversarial
> challenge loop **ran ten rounds and was ended by owner decision at this state**;
> the document merges as the authoritative jobs/worker architecture reference.
> **This is not a MERGE-READY verdict** — round 10 returned *NOT MERGE-READY (1
> merge-blocker, 4 majors, 2 minors)* and no round 11 graded the remediation
> below. Read **§11 → "Known open items"** first: it names, with consequences,
> every finding this document does **not** close. See the Ratification record,
> §11. Closes the #632 gap (the #194 design was referenced but never committed).
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
> numbers (F1–F24) are summarized in the ratification record below. The durable
> challenge records are committed at
> `docs/reviews/jobs-infra-design-challenge/doc-challenge-r1-findings.md`,
> `doc-challenge-r2-findings.md`, `doc-challenge-r3-findings.md`,
> `doc-challenge-r4-findings.md`, `doc-challenge-r5-findings.md`,
> `doc-challenge-r6-findings.md`, `doc-challenge-r7-findings.md`,
> `doc-challenge-r8-findings.md`, `doc-challenge-r9-findings.md`, and
> `doc-challenge-r10-findings.md`; their
> C1–C17, R2-1–R2-12, R3-1–R3-9, R4-1–R4-7, R5-1–R5-3, R6-1–R6-5, R7-1–R7-3,
> R8-1–R8-5, R9-1–R9-7, and R10-1–R10-7 identifiers are cited inline where
> absorbed.

---

## 1. Context & goals

PublyApp needs durable, crash-safe background execution. Consumers already filed
against this infrastructure:

| Consumer | Issue | Nature |
| --- | --- | --- |
| Scheduled post publishing | #646 (D3, part of #631) | Quartz due-scan → enqueue → publish; **future**, this design accommodates it, does not build it |
| Expired-session cleanup | #389 | recurring system job, batched hard-delete |
| Invitation expiration | #425 | derived at read time; **no job** (owner ruling, §11 O32) |
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

The #811 locked-eligibility guarantee begins only at **R2 quiescence**, after
the legacy drainer and all pre-R1 producers are gone (R4-7). During R1, remaining
`Processing` rows and any bounded rollout stragglers still drain under the old
eligibility-check/send semantics and retain their residual race window. That is
an accepted, bounded rollout condition; the drainer is retired at R2 rather than
hardened for its short final lifetime (§4.6).

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
   auditable **`email_log`** records delivery lifecycle outcomes from day one;
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
  **auditable delivery lifecycle record** inserted by email job handlers on
  terminal outcomes — submitted-to-provider, cancelled-ineligible,
  permanently-failed —
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
  2. `apps/front/docker-compose.test.yml`'s api service (front-2 E2E);
  3. the **OpenAPI-drift / client-generation workflow** (`just build-api` +
     `just generate-client`, and its CI job) — `dotnet build` runs the app to
     emit the OpenAPI document, so the build env must export `APP_ROLE=api`;
  4. any CI job that boots the app for a purpose other than the worker
     integration fixtures (which run `all` deliberately, §3.3);
  5. the Docker production migration entrypoint — the `migrate` stage in
     `apps/api/Dockerfile` — and every staging/production migration service or
     job that invokes it, including the staging `migrate` service documented in
     `docs/front-migration/staging-deploy.md` and the Dokploy migrate job. Each
     pins `APP_ROLE=api`; migration/model creation is an API-role tooling path,
     never an implicit `all` or worker host (R4-4).
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
| `JOB_LEASE_SECONDS` | 300 | claim lease / renewal target / stale-reclaim cutoff; startup validation rejects values below **10 seconds** (R3-4/O12) |
| `JOB_QUEUE_DRAIN_BUDGET_SECONDS` | 60 | max continuous drain per wake before yielding one loop iteration (F10) |
| `EMAIL_LOG_RETENTION_DAYS` | 180 | retention sweep window for `email_log` (F20; O7) |
| `JOB_DEAD_LETTER_RETENTION_DAYS` | 90 | retention sweep window for `job_dead_letter` (F20; O7) |
| `EMAIL_PREPARED_SEND_RETENTION_DAYS` | 7 | sensitive prepared-byte lifetime and email-DLQ requeue window (§4.2/§4.5/§7.3; O7/O16; R2-11/R4-3) — validated ≥ 1 |
| `EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES` | 60 | **observability threshold only, not a deletion guarantee** (R10-2): the overdue age at which `jobs.prepared_state.sweep_overdue` warns (§7.2). Nothing deletes bytes because this elapses; it exists so the gap between *eligible* and *deleted* is visible and alertable. Validated ≥ 1 |
| `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS` | 30 | prune window for the `system_job_occurrences` ledger (§4.3/§7.3; O9) — validated ≥ 1 |
| `JOB_ALERT_LEASE_RETENTION_DAYS` | 30 | prune window for the `job_alert_delivery_leases` audit rows (§7.2/§7.3; O7) — validated ≥ 1 |
| `SCHEDULER_LEADER_LOCK_KEY` | (constant, not env) | see §5.2 |

`JOB_LEASE_SECONDS` has a hard **10-second minimum** (R3-4/O12). The
`AppEnvironment` validator rejects smaller values at startup; the claim,
per-dispatch restamp, renewal loop, and test fixtures all consume the validated
value. This floor leaves room for the 2-second minimum safety margin and at least
one bounded retry without pretending sub-second leases are supportable.

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
explicitly (C6/F24/R4-4)** — the full enumerated list is in §3.1: the Dockerfile
build-time OpenAPI env block, `apps/front/docker-compose.test.yml`, the
`just build-api`/`generate-client` OpenAPI-drift workflow and its CI job, every
other CI app-boot, and every production-like migration invocation (the
Dockerfile `migrate` stage, the staging migrate service, and the Dokploy migrate
job). Under production-like environments an unset `APP_ROLE` fails fast (§3.1),
so nothing can silently inherit `all`.

### 3.4 Dokploy deployment sketch

Same GHCR image, **two services**, differing only by env. Deploy **immutable
image tags** (release SHA / semver), never `:latest` (F14 — a mixed-version
fleet must be an explicit, inspectable state, not an accident of pull timing).
Add to `dokploy.yml` alongside `publyapp-api`:

```yaml
  publyapp-worker:
    image: ghcr.io/publyapp/publyapp/api:${RELEASE_TAG}   # same image as api, immutable tag
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
runtime role runs `database update` at boot. The migrate container/job itself
explicitly supplies `APP_ROLE=api`, including the staging and Dokploy shapes
enumerated in §3.1 (R4-4).

> **Known code-alignment item (R4-4, captain's reconciliation round).** The
> production migration entrypoint is the `migrate` stage in
> `apps/api/Dockerfile`; the staging service shape is documented in
> `docs/front-migration/staging-deploy.md`. The current staging shape omits
> `APP_ROLE`, and any Dokploy migration job must be audited likewise. Pinning
> `APP_ROLE=api` in those exact entrypoints is a Phase-2B code/deploy-doc
> alignment item; this design document does not edit those branches.

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

**Lock-order rule (R5-1/R6-3), total:** when one transaction must hold two rows
of a pair below, it acquires them in **this** order on **every** path that
touches the pair. No path may invert it; a new path extends this table rather
than choosing its own order.

| Resource pair | Order | Paths bound |
| --- | --- | --- |
| `system_job_definitions` ↔ `system_job_occurrences` | **definition row first**, then the occurrence PK | `EnqueueSystemJobJob` live delivery; `SyncSystemJobsJob` reconciliation (§4.3/§5.3) |
| `job_dead_letter` ↔ `email_prepared_sends` | **DLQ row first**, then the prepared row | `RequeueDeadLetterAsync` (§4.2); the `email-prepared-sends-retention` sweep (§4.5) |

Two transactions then serialize on the first resource of the pair before either
can wait on the second, so a wait cycle between the two resources is
unconstructible and Postgres cannot abort one with `40P01`. `SKIP LOCKED` is a
throughput choice on the first resource, never the deadlock remedy: once a
transaction already owns the opposite resource, skipping cannot rescue it. The
two rows are the same defect class found a round apart — R5-1's
delivery/reconciliation inversion and R6-3's requeue/sweep inversion — so the
rule is stated here **once** and cited from each path instead of re-argued
per section.

### 4.0 `BaseAttributes` stance for infra tables (explicit)

`BaseAttributes` brings `id` + `created_at` + `updated_at` + **`is_deleted` +
`deleted_at`**, and `AppDbContext.UpdateAuditFields` **auto-converts an EF
`Delete` into a soft-delete** for any `BaseAttributesNoKey` entity unless
force-hard-delete is requested.

| Table | Inherits `BaseAttributes`? | Why |
| --- | --- | --- |
| `job_queue` | **No** | Delete-on-success is a *hard* delete; the soft-delete conversion actively fights it, and `is_deleted`/`deleted_at` are dead weight on a high-churn table. Claim/complete go through **raw SQL** (bypassing `UpdateAuditFields` entirely), so the audit override buys nothing — and the DB-time rule (F11) forbids the app-side timestamp writes `UpdateAuditFields` performs. |
| `job_dead_letter` | **No** | Append-only audit trail; never soft-deleted. Explicit `id` + `created_at`/`failed_at`, DB defaults. |
| `job_dead_letter_events` | **No** | Append-only, engine-written evidence about a DLQ row's external-state transitions (§4.2; R10-3/O30). Never updated, never soft-deleted; removed only by the `ON DELETE CASCADE` from its parent DLQ row. |
| `system_job_definitions` | **Yes** | Low-churn config edited from the dashboard; `updated_at` tracking is wanted, and operational disable uses an explicit `is_enabled` flag (not deletion), so the soft-delete default is harmless. |
| `email_log` | **No** | Auditable delivery lifecycle record. Inserted once for the local terminal submission outcome; later evidence may make only the state-machine transitions in §4.4, with an atomic `AuditLog` entry. Retention hard-deletes; soft-delete remains meaningless. |
| `email_prepared_sends` | **No** | Short-lived sensitive scratch keyed by job id (F7); inserted once, deleted on resolved success/cancellation, retained through email DLQ only within the prepared-send window for faithful requeue, then swept even while the longer-lived DLQ audit row remains (R4-3). |

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
    external_prepared_at timestamptz NULL,                 -- durable "PREPARE committed" marker (R6-4/O20): set in the PREPARE transaction to the committed scratch row's OWN prepared_at (never a second now() — R7-2/O23), copied to the DLQ at dead-letter; NULL ⇒ no external effect can have occurred. Sole writers: IExternalPreparedMarker.StampAsync (§4.5) and RequeueDeadLetterAsync's transfer restore (§4.2) — both engine-owned, both proving a TransferExternalEffectState policy before writing (R8-3/O26), which is what makes a marker on a Standard/unregistered row an audited integrity failure rather than an ignorable value (§4.2)
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
    -- Durable external-prepared-state evidence (R5-2/O19). Stamped at dead-letter
    -- time; survives deletion of the prepared bytes it describes, so expiry stays
    -- distinguishable from loss long after email_prepared_sends is gone.
    external_state_status     integer     NOT NULL DEFAULT 0,
        -- ExternalStateStatus: 0 None (RequeuePolicy = Standard — no external state),
        -- 1 Present, 2 Expired, 3 NeverPrepared, 4 Missing, 5 Transferred,
        -- 6 Unclassified (the probe could not run; presence UNKNOWN — R9-2/O29)
    external_state_prepared_at timestamptz NULL, -- copied from the queue row's job_queue.external_prepared_at MARKER at dead-letter, never from the scratch row (R6-4/O20): a `4 Missing` row has no scratch to copy from, and the marker equals the scratch's prepared_at by the fenced PREPARE write (§4.5)
    external_state_expires_at  timestamptz NULL, -- marker + EMAIL_PREPARED_SEND_RETENTION_DAYS, materialized at dead-letter; AUTHORITATIVE thereafter — the sweep and requeue both READ it, never recompute it (R6-2)
    external_state_expired_at  timestamptz NULL, -- when the sweep actually deleted the bytes (status → 2)
    failed_at       timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_job_dead_letter PRIMARY KEY (id),
    -- A status carrying a window must carry its bounds; only Expired may be stamped.
    -- 6 Unclassified carries bounds like 1 Present: presence is unknown, but the
    -- marker-derived window is known, and the sweep needs it to cap the bytes (R9-2).
    CONSTRAINT ck_job_dead_letter_external_state CHECK (
        (external_state_status IN (0, 3) AND external_state_prepared_at IS NULL
                                         AND external_state_expires_at IS NULL)
     OR (external_state_status IN (1, 2, 4, 5, 6) AND external_state_prepared_at IS NOT NULL
                                                  AND external_state_expires_at IS NOT NULL)
    ),
    CONSTRAINT ck_job_dead_letter_expired_at CHECK (
        (external_state_expired_at IS NULL) = (external_state_status <> 2)
    )
);

CREATE INDEX ix_job_dead_letter_job_type ON job_dead_letter (job_type, failed_at);
-- Follow the requeue chain backward/forward across re-dead-letterings (F16/C9).
CREATE INDEX ix_job_dead_letter_requeued_from
    ON job_dead_letter (requeued_from_dead_letter_id)
    WHERE requeued_from_dead_letter_id IS NOT NULL;
-- The lineage predicate `job_dead_letter.original_job_id = email_prepared_sends.job_id`
-- (R4-6) is executed by the requeue load, the prepared-send sweep's join, and the
-- dashboard's status read — it needs its own index, not a scan (R5-2).
CREATE INDEX ix_job_dead_letter_original_job_id ON job_dead_letter (original_job_id);
-- Drives the dashboard's "expiring soon / expired" filter without touching the
-- (deleted) prepared rows.
CREATE INDEX ix_job_dead_letter_external_state
    ON job_dead_letter (external_state_status, external_state_expires_at)
    WHERE external_state_status <> 0;
-- The `job-dead-letter-retention` age sweep (§7.3). ix_job_dead_letter_job_type
-- leads with job_type and cannot serve a global scan by age (R5-3).
CREATE INDEX ix_job_dead_letter_failed_at ON job_dead_letter (failed_at);
```

#### `job_dead_letter_events` — the engine's evidence table (R10-3/O30)

**Why this table exists at all, and why the evidence is not in `audit_logs`
(R10-3, author self-catch).** Rounds 5–9 wrote "an immutable `AuditLog` entry"
for every engine-side external-state transition, and §4.5's sweep statement
spelled out `INSERT INTO audit_logs (action, subject_type, subject_id, metadata,
occurred_at)`. **That statement does not compile against this repository.** The
shipped `audit_logs` table (`apps/api/Modules/AuditLogs/Entities/AuditLog.cs`)
has **no** `subject_type`, `subject_id`, `metadata`, or `occurred_at` columns —
its columns are `user_id`, `action`, `target_id`, `details`, `ip_address`,
`user_agent` plus `BaseAttributes` — and, decisively, **`user_id` is a
non-nullable `Guid` with a real foreign key to `users`**
(`FK_audit_logs_users_user_id`, `20260511120526_Init`). `audit_logs` is a
**user-attributed** record by construction. The classifier, the prepared-state
sweep, and the DLQ retention sweep have **no user**: they are engine code on a
worker replica, and a system job's `actor_user_id` is NULL. Writing their
evidence to `audit_logs` would require either inventing a fake seeded "system"
user (a lie in the actor column of the table the platform trusts for
accountability) or dropping that FK for every caller. Neither is acceptable, so
the engine gets its own actor-less table and `audit_logs` keeps its invariant.

**The split is principled, not a workaround:** *staff actions* on DLQ rows —
`RequeueDeadLetterAsync` (§4.2) — have a real actor and **keep writing
`audit_logs` through the existing `IAuditLogService`**. *Engine transitions* have
no actor and write here.

```sql
-- Append-only evidence for engine-decided external-state transitions on a DLQ
-- row. No actor column: nothing that writes this table has an actor (R10-3/O30).
CREATE TABLE job_dead_letter_events (
    id             uuid        NOT NULL DEFAULT uuidv7(),
    dead_letter_id uuid        NOT NULL,  -- THE stable join key (§4.5 joins on it)
    event          text        NOT NULL,  -- stable code, enumerated below
    detected_by    text        NOT NULL,  -- 'classifier' | 'requeue_reader' | 'prepared_state_sweep'
    prior_status   integer     NULL,      -- external_state_status before this event (NULL at classification: the row is new)
    new_status     integer     NOT NULL,  -- external_state_status after it
    details        jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- window/diagnostic metadata; contract below
    occurred_at    timestamptz NOT NULL DEFAULT now(),        -- DB time (F11)
    CONSTRAINT pk_job_dead_letter_events PRIMARY KEY (id),
    CONSTRAINT fk_job_dead_letter_events_dead_letter
        FOREIGN KEY (dead_letter_id) REFERENCES job_dead_letter (id) ON DELETE CASCADE
);

-- The dashboard and §9's specs read a DLQ row's event history in order.
CREATE INDEX ix_job_dead_letter_events_dead_letter_id
    ON job_dead_letter_events (dead_letter_id, occurred_at);
```

**Stable event codes** (the whole set; the writer emits nothing else):

| `event` | `new_status` | `detected_by` | Written by |
| --- | --- | --- | --- |
| `dead_letter.external_state.unclassified` | `6` | `classifier` | the terminal transaction's step 5 (§5.1) |
| `dead_letter.external_state.missing` | `4` | `classifier` | terminal step 5 — the probe ran and found no row, or the marker sits on a `Standard`/unregistered row |
| `dead_letter.external_state.missing` | `4` | `requeue_reader` | `RequeueDeadLetterAsync`'s `Present`-with-no-row branch (§4.2) |
| `dead_letter.external_state.missing` | `4` | `prepared_state_sweep` | the sweep's **resolution batch** (§4.5) |
| `dead_letter.external_state.expired` | `2` | `prepared_state_sweep` | the sweep's **DLQ-expiry batch** (§4.5) |

**`details` metadata contract** — `originalJobId` (uuid), `jobType` (the
versioned type string), `preparedAt` + `expiresAt` (the marker-derived window),
`reason` on every `missing` event (`probe_absent` | `marker_on_standard` |
`marker_on_unregistered` | `reader_absent`), and — on `unclassified` only —
`sqlState` (the five-character SQLSTATE, e.g. `42P01`) plus `probeError` (the
probe exception message **through `JobErrorSanitizer`**, the C11/F20 persistence
boundary).

> **What keeps sensitive bytes out of `details` — and what does not.** *Enforced:*
> the classifier never reads the scratch's `request_body`. Its probe is an
> **existence check over the descriptor's single `Guid JobId` primary key**
> (R9-3/O27) — the descriptor carries no selector and the engine builds the
> predicate from its own EF model — so the classifier holds no recipient, body,
> token, or provider key to leak. `sqlState` and the sanitized `probeError`
> describe the *store*, not a row's contents. *Not enforced:* `details` is a
> `jsonb` column; **no type or constraint stops a future engine change from
> putting something sensitive in it.** The protection is that the writer
> (`JobDeadLetterEventWriter`, §8/§10) is the single engine-owned symbol that
> populates it and its inputs are the fields listed above. This is stated as a
> convention with a named owner, **not** claimed as a structural guarantee.

**Retention: the events die with their parent.** `ON DELETE CASCADE` means
`job-dead-letter-retention` removes a DLQ row's events with the row, at
`JOB_DEAD_LETTER_RETENTION_DAYS`. No separate sweep, no orphaned evidence, and no
event outlives the row it describes. *Enforcing artefact:
`fk_job_dead_letter_events_dead_letter`'s `ON DELETE CASCADE`.*

**`external_state_status` is the durable answer to "was this expiry expected?"
(R5-2/O19).** The seven-day cutoff is anchored to `email_prepared_sends.prepared_at`,
but the sweep *deletes that row* — so anchoring the dashboard or
`RequeueDeadLetterAsync` to the prepared row's continued existence means both can
only ever observe **absence**, and absence is ambiguous between a policy-driven
expiry and premature loss/corruption. `failed_at` is **not** a substitute:
preparation can precede dead-lettering by hours or by an outage, so
`failed_at + 7d` is not the expiry boundary. The DLQ row therefore records the
window's bounds **at dead-letter time** and the sweep records its own action, so
the distinction is queryable state that outlives the bytes:

| Status | Written by | Meaning | Requeue |
| --- | --- | --- | --- |
| `0 None` | the **engine** (§5.1), for a `RequeuePolicy = Standard` registration whose marker is **NULL** | the type has no external prepared state | `Standard` path |
| `1 Present` | the **engine** (§5.1), when the marker is set and its probe of the registration's *declared* external-state store (email's: `email_prepared_sends`) finds a committed row for `original_job_id` | bytes retained; `external_state_prepared_at` copied from the **marker**, `external_state_expires_at` = marker + the store's declared retention | `TransferExternalEffectState` path |
| `2 Expired` | the `email-prepared-sends-retention` sweep, in the **same statement** that deletes the bytes | policy-driven expiry at `external_state_expired_at` | rejected `PreparedStateExpired` |
| `3 NeverPrepared` | the **engine** (§5.1), whenever the queue row's `external_prepared_at` marker is **NULL** and the type is not `Standard` — the job died before PREPARE committed (render failure, or the invalid-before-handler settlement §5.1); **or** an unregistered `job_type` with a NULL marker. **No store is probed on this branch** | no external effect can have occurred | allowed; the requeued job prepares normally |
| `4 Missing` | the **engine** (§5.1), when the marker is **set** and (a) the probe **ran and found no prepared row**, or (b) the type is `Standard` / unregistered — a marker that could not have been written (integrity failure, O26); **or** any later **`Present`** reader that finds `status = 1` with no prepared row (§4.2 requeue; §4.5's sweep resolution batch — never a `6 Unclassified` row, R10-7) | **integrity anomaly** — bytes *proved* absent without a sweep stamp, or a marker exists that no sanctioned writer could have set | rejected `PreparedStateAnomaly` |
| `5 Transferred` | `RequeueDeadLetterAsync`, in the requeue transaction | the bytes moved to `requeued_as_job_id`; this ancestor no longer owns them | already-requeued (single-use guard) |
| `6 Unclassified` | the **engine** (§5.1), when the marker is **set**, the type is `TransferExternalEffectState`, and the probe **could not run to an answer** — a recoverable statement error contained by the probe savepoint (R9-1/O28) | **anomaly with unknown presence** — the bytes may or may not exist; the marker-derived window bounds are known and recorded, and the prepared-state sweep treats this row exactly like `1 Present` (R9-2/O29) | rejected `PreparedStateAnomaly` (fail-closed) |

`5 Transferred` exists because the requeue hook **moves** the prepared row from
`original_job_id` to the new job id (§4.2 below): without it, every successfully
requeued ancestor would read as `Missing` and manufacture a false anomaly. The
`Present`-with-no-row read is only an anomaly for a row with
`requeued_as_job_id IS NULL`.

**`Missing` is stamped, not merely observed — and only a `Present` reader stamps
it (R10-7).** The sweep is the *only* authorized deleter of prepared bytes, and it
stamps `Expired` atomically (§4.5). So a reader that finds **`status = 1`**,
`requeued_as_job_id IS NULL`, and no prepared row has found bytes that
disappeared outside the policy. It writes `external_state_status = 4` **in a
transaction that commits** with a `job_dead_letter_events` row (above), and only
then surfaces the rejection as `PreparedStateAnomaly` (distinct from
`PreparedStateExpired`). §7.2 alerts on the **durable** count of these rows.
Expiry is **never** inferred from absence.

**The `Present`-reader scope is a rule, not an accident.** `status = 1` asserts
*the probe ran and found the row*, so a later absence is a real transition:
present → gone, outside the policy. `status = 6 Unclassified` asserts nothing
about presence, so a later absence is **not** a transition and **not** evidence of
loss — the bytes may never have been observable. **No reader specified in this
document ever stamps `Missing` on an absent status-6 row**, and none reclassifies
`6` at all: requeue rejects it without probing (§4.2), and the sweep's batches
(§4.5) transition it only when their `JOIN` *finds* bytes. An absent `6` stays `6`
until a human resolves it. *That is a deliberate choice with a real cost, and the
cost is unpaid — see §11 "Known open items", K-1.*

**Absence at dead-letter time is classified by a durable marker, never inferred
(R6-4/O20).** Dead-letter classification cannot ask "did PREPARE happen?" by probing
`email_prepared_sends`: absence there is ambiguous between *never prepared* and
*prepared, then lost* — and the second is exactly the anomaly `Missing` names, so
inferring `NeverPrepared` from absence would label an ambiguous provider attempt
followed by premature scratch loss as "no external effect occurred" and hand
requeue a licence to mint fresh bytes and a fresh key. The proof therefore lives
**outside the deletable scratch**, on the queue row that survives to dead-letter:

- **The marker.** `job_queue.external_prepared_at` (§4.1) is written **in the
  PREPARE transaction itself**, and it takes **the committed scratch row's own
  `prepared_at`** — the value `INSERT … RETURNING` hands back, or, when the insert
  loses an `ON CONFLICT DO NOTHING` race, the value re-read from the winner row
  inside that same fenced transaction (§4.5/R7-2/O23). There is **no second,
  marker-side `now()`**: equality is *enforced by the write* (`… AND
  (external_prepared_at IS NULL OR external_prepared_at = {preparedAt})`, exactly
  one affected row or the whole transaction rolls back), not asserted by
  construction. Because the two rows commit together, the marker means exactly "a
  committed PREPARE exists for this job", the same proposition the scratch row's
  existence carries (R2-12), on a row the retention sweep never touches.
- **It carries no sensitive material.** It is one timestamp. No recipient, body,
  token, hash, or provider key leaves the scratch — the privacy line O16/O19 draw
  is unmoved, and `external_state_prepared_at` on the DLQ is that same timestamp.
- **Classification at dead-letter is total, and the *engine* decides every
  branch** — marker first, store second. Only one sub-question is not generic
  ("do the prepared bytes still exist?", answerable only against a *type-specific*
  store — `email_prepared_sends` today, a webhook/publishing store later), and the
  type answers it by **declaring where its store is, not by running code**: a
  registration carries an `ExternalStateStore` *descriptor* (§5.1/O24) and the
  engine builds and runs the probe itself. This table is the whole decision
  function, and §5.1 states it once as engine code:

  | Marker | Policy | Probe | Status stamped |
  | --- | --- | --- | --- |
  | NULL | `Standard` | not run | `0 None` |
  | NULL | `TransferExternalEffectState` | not run | `3 NeverPrepared` (no external effect is possible) |
  | NULL | unregistered `job_type` | not run | `3 NeverPrepared` |
  | set | `TransferExternalEffectState` | row present | `1 Present` + window bounds |
  | set | `TransferExternalEffectState` | row absent | `4 Missing` — a real anomaly, alerted like any other `Missing` (above) and evidenced by a `job_dead_letter_events` row (§4.2), **never** `NeverPrepared` |
  | set | `TransferExternalEffectState` | probe raises a **recoverable statement error** (rolled back to the probe savepoint, O28) | `6 Unclassified`, evidenced (`job_dead_letter_events`, §4.2) — presence is **unknown**, so the row is **not** stamped `Missing` (which asserts proven absence and is swept by nothing); the sweep caps its possible bytes at the recorded window (R9-2/O29) |
  | set | `Standard` **or** unregistered | not run | `4 Missing`, evidenced (`job_dead_letter_events`, §4.2) — **conservative integrity failure**: no sanctioned writer could have set this marker (§5.1), so the marker itself is the anomaly |

  `external_state_prepared_at` is copied from the **marker** on every branch that
  needs it, so the `Missing`-at-dead-letter row satisfies
  `ck_job_dead_letter_external_state` without the deleted scratch.
  `external_state_expires_at = marker + {the store descriptor's declared
  retention}` (email: `EMAIL_PREPARED_SEND_RETENTION_DAYS`) — including on the
  `6 Unclassified` branch, which **has** a descriptor (it is reached only for a
  `TransferExternalEffectState` registration) and therefore a real window, which is
  the whole reason the sweep can cap its bytes at seven days (R9-2). On the two
  **integrity-failure** rows there is no descriptor and therefore no retention to
  apply, so the engine writes `external_state_expires_at = external_state_prepared_at`
  — a **zero-length window**, the only conservative value available: it claims no
  retention for bytes the engine cannot account for, and it satisfies the CHECK
  **without relaxing it**. Nothing reads it for a decision — status `4` is
  rejected `PreparedStateAnomaly` by requeue regardless of its window (§4.2).

  > **Stated residue, not a claim (R9-2).** On those two integrity-failure rows the
  > engine also has **no store to sweep**: a `Standard` registration declares no
  > descriptor and an unregistered `job_type` resolves to no registration at all, so
  > if such a marker ever appeared there is no declared location from which bytes
  > could be deleted. The design does **not** claim a retention cap for that state;
  > it claims that no sanctioned writer can produce it (§5.1's target-row guard,
  > O26) and that if it appears it is a durable, alerting anomaly for a human. Every
  > state that a sanctioned writer *can* produce with possibly-present bytes —
  > `1 Present` and `6 Unclassified` — is swept at the recorded window.
- **The marker travels with a requeue.** A `TransferExternalEffectState` requeue
  moves the bytes to the new job without a second PREPARE, so the new queue row
  would carry a NULL marker and a later dead-letter would misread it as
  `NeverPrepared`. `RequeueDeadLetterAsync` therefore restores
  `external_prepared_at = {ancestor}.external_state_prepared_at` onto the new
  queue row on the transfer path (and leaves it NULL on the `NeverPrepared` path,
  where the requeued job PREPAREs normally and writes its own).
- **`Standard`-policy types never set it**; their DLQ rows stay `0 None`.

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

Its contract, all in **one transaction**, **in this order** — every validation
precedes every write, so a rejection never has a partial write to undo (R6-3):

- **Load and lock the DLQ row first.** `SELECT … FROM job_dead_letter WHERE id =
  {deadLetterId} FOR UPDATE`. This is the **DLQ-before-prepared** acquisition the
  §4 lock-order rule mandates; the sweep (§4.5) takes the same pair in the same
  order, so requeue and sweep cannot construct a wait cycle.
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
- **Validate external state before any write (R6-2/R6-3), from the DLQ row's own
  durable columns — never from the prepared row's existence (R5-2/O19).** The
  status column survives the sweep; a probe for `email_prepared_sends` returns
  "absent" for expiry, loss, and corruption alike. The gate is status **and**
  time:

  | Read state | Outcome |
  | --- | --- |
  | `requeued_as_job_id IS NOT NULL` — **already requeued regardless of external-state status** (`5 Transferred` only when state actually moved; a requeued `3 NeverPrepared` ancestor stays at `3`, per the transfer-hook rule below) | already requeued — abort with the single-use error; no writes. |
  | `2 Expired` | reject `PreparedStateExpired`, citing `external_state_expired_at`; no writes. |
  | `3 NeverPrepared` | allowed — no external effect occurred, so the requeued job renders and PREPAREs normally (its NULL marker is the proof, §4.2 above). Continue below. |
  | `4 Missing` | reject `PreparedStateAnomaly` — already-recorded integrity anomaly; no writes. |
  | `6 Unclassified` | reject `PreparedStateAnomaly` — **fail-closed**: the engine never learned whether the bytes exist, so requeue may neither transfer (they may be gone) nor re-prepare fresh bytes under a new key (they may be present, and O20's licence is exactly what must not be granted on ambiguity); no writes. Requeue does **not** re-probe: the probe already failed once at settlement, and a reader that could resolve the ambiguity would have to be the sweep, which does so under the recorded cutoff (§4.5). |
  | `1 Present` | resolve it now — see the three sub-branches below. |

  A `1 Present` row is resolved by locking the prepared row (`WHERE job_id =
  original_job_id FOR UPDATE` — the **second** resource in the lock order) and
  then branching on **existence first, clock second**, which makes the branch
  total: absence and lateness are independent, and an expired-*and*-vanished row
  is an anomaly, not an expiry.

  | Prepared row | Clock | Outcome |
  | --- | --- | --- |
  | **absent** | (irrelevant) | The anomaly path — the bytes left outside the policy, so there is nothing to expire and nothing to transfer. Stamp `4 Missing` + a `detected_by = 'requeue_reader'` `job_dead_letter_events` row (§4.2), **COMMIT that transition**, and return `PreparedStateAnomaly` *after* the commit. No single-use stamp, no new job — and, because validation precedes every write, nothing to roll back (R6-3). |
  | present | `now() >= external_state_expires_at` | The recorded cutoff has passed and the asynchronous sweep has not reached this row yet. Requeue neither waits for it nor admits a late transfer: it performs the *same* delete + `2 Expired` + `external_state_expired_at` + audit transition §4.5 defines, **commits** it, and returns `PreparedStateExpired`. **The gate is the clock, not the sweep's schedule** (R6-2). |
  | present | `now() < external_state_expires_at` | Eligible — transfer, per the policy hook below. |

  **`external_state_expires_at` is authoritative and shared — and it bounds
  *eligibility*, not the deletion instant (R10-2).** It was materialized at
  dead-letter and is the **same stored column** requeue reads and the sweep
  predicates on (§4.5), so the boundary the dashboard displays is the boundary
  both paths enforce; neither re-derives `prepared_at + current
  EMAIL_PREPARED_SEND_RETENTION_DAYS`. What that buys, stated at its true width:

  - **Requeue's cutoff is exact.** *Enforcing artefact:* the `now() >=
    external_state_expires_at` comparison in the branch table above, evaluated
    inside the requeue transaction against the stored column while the DLQ row is
    held `FOR UPDATE`. From that instant onward **no requeue transfers these
    bytes** — the command reads the clock, not the sweep's schedule (R6-2).
  - **Physical deletion is *eventual*, not instantaneous.** The same column makes a
    row **eligible**; it does not run the sweep. The bytes are deleted by
    whichever path reaches the row first **at or after** the cutoff — the next
    successful sweep pass, or a requeue attempt that finds the row past its cutoff
    and performs the transition itself. If neither happens (the sweep is down and
    nobody requeues), the bytes sit past their advertised cutoff for as long as
    that lasts. **Nothing in this design deletes them *at* the instant.** §7.2's
    `jobs.prepared_state.sweep_overdue` condition exists to make that gap visible
    rather than to close it; see §11 "Known open items", K-3.

  Requeue also never branches on stored status alone: status-only branching left a
  row `Present` and requeueable past its own cutoff for however long the sweep
  lagged (R6-2).
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
- **Apply the registration's per-type requeue policy before minting the new
  queue row (R3-2/O11).** `JobRegistration` carries
  `RequeuePolicy = Standard | TransferExternalEffectState` plus a type-erased
  `TransferRequeueStateAsync(oldJobId, newJobId, db, ct)` hook. `Standard` is a
  no-op. Every job type that can cause a non-transactional external effect is
  required by the startup registry gate to choose
  `TransferExternalEffectState` and register a hook; it may not fall back to
  standard requeue. For email types the hook atomically **moves** the surviving
  `email_prepared_sends` row from `original_job_id` to `newJobId`, changing only
  `job_id`: `request_body`, `request_sha256`, and
  `provider_idempotency_key` are copied byte-for-byte, and stamps the ancestor
  `external_state_status = 5 (Transferred)` in the same transaction so it is never
  later misread as `Missing`. **On a `3 NeverPrepared` ancestor the hook is a
  no-op** — the gate above already proved no prepared row can exist — and the
  ancestor **keeps** `3 NeverPrepared`: it is not stamped `Transferred`, both
  because nothing was transferred and because
  `ck_job_dead_letter_external_state` (§4.2) requires a window-carrying status to
  carry its bounds, which a `NeverPrepared` row has none of. Single-use is
  enforced by `requeued_as_job_id`, not by the status, so the ancestor is still
  requeueable exactly once. Future webhook/publishing types must provide the
  equivalent prepared-request/provider-identity transfer hook and the same status
  stamping.
- **Restore the approved envelope verbatim** into a new `job_queue` row —
  `payload`, `job_type`, `priority`, `max_attempts`, `idempotency_key`,
  `tenant_id`, `actor_user_id`, `correlation_id` all copied from the DLQ row
  (**nothing client-supplied, no re-stamp from the staff requester**), with
  `attempts = 0`, `status = Pending`, `next_attempt_at = now()`, and — on the
  transfer path only — `external_prepared_at = {ancestor}.external_state_prepared_at`
  so the moved bytes keep their PREPARE proof (§4.2 above; R6-4/O20).
- **Chain the lineage (C9):** the new row's `requeued_from_dead_letter_id` is
  set to `deadLetterId`. `JobDeadLetter.FromJob` **copies
  `requeued_from_dead_letter_id` forward**, so a requeued job that dead-letters
  again preserves the full chain back to the original failure (the
  `ix_job_dead_letter_requeued_from` index walks it).
- **Audit atomically** — state transfer, queue insert, DLQ single-use stamp, and
  an immutable `AuditLog` entry (existing machinery)
  recording actor, DLQ id, and new job id commits in the same transaction as
  the insert; a failed enqueue rolls the audit back and vice-versa.

Guards: a dedicated high-gravity permission (`staff:jobs:dead-letter:requeue`);
**no client payload override and no payload editing surface** (an editable
payload would be an arbitrary-work execution primitive). Raw payloads are
**viewable** in the dashboard only under a *separate* read permission, since DLQ
payloads may reference tenant data (F20). A `NOTIFY job_queue` fires at commit
so the requeued row is picked up immediately (§5.5).

For email, terminal failure therefore retains the prepared-send row **for the
window recorded on its DLQ row (`external_state_prepared_at` +
`EMAIL_PREPARED_SEND_RETENTION_DAYS` as it stood at dead-letter, default seven
days), plus the sweep's lag** — using the exact lineage predicate
`job_dead_letter.original_job_id = email_prepared_sends.job_id` (R4-3/R4-6).
Within that window, DLQ requeue transfers the row to the new job before commit;
the new handler skips rendering and calls the provider with the **original bytes
and original key**. **Requeueability ends at `external_state_expires_at` itself**,
not when the sweep next runs (R6-2) — that half is exact, and the comparison in
the requeue transaction is what enforces it. **Deletion of the bytes is the
eventual half:** whichever path reaches the row first at or after that instant
performs the same delete + `2 (Expired)` + `external_state_expired_at` + event
transition **in one statement** (§4.5), so the DLQ row remains and still *reports
its own expiry* rather than merely lacking bytes. "At most seven days" was the
wrong sentence and is withdrawn (R10-2): seven days bounds when the bytes become
**deletable and un-requeueable**, not when they are physically gone. The old
logical send becomes non-requeueable. Staff
must use the explicit **new-logical-send** operation to re-render current domain
state under a new job id/provider key (with its own permission and audit entry)
rather than resurrecting stale token-bearing bytes. The §9 lineage test covers
first DLQ → requeue transfer → re-dead-letter using the exact predicate at every
hop, and the §9 fresh-context test proves the `Expired` verdict survives process
restart.

> **Known code-alignment item (R3-2, captain's reconciliation round).** The
> current 633/809 branch tips expose generic envelope requeue, derive the email
> provider key from the newly minted job id, and delete prepared state on terminal
> failure. The contract above is authoritative; the per-registration policy,
> retained scratch, atomic transfer, and ambiguous-acceptance regression are
> captain reconciliation items.

**Retention (F20/R4-3/R5-2):** DLQ rows older than
`JOB_DEAD_LETTER_RETENTION_DAYS` (default 90; O7) are hard-deleted by the
retention sweep system job (§7.3), but an email DLQ row is requeueable only while
its matching prepared state is within the shorter prepared-send window (default
seven days; O16). The DLQ row remains inspectable after that window without
retaining recipient/body/token request bytes: the four `external_state_*` columns
are **metadata about the window, not the bytes** — they carry no recipient,
body, or token material, so keeping them for the full 90 days does not re-open
the O16 privacy exposure that ending byte retention at seven days closes.

#### DLQ retention may not delete the row that protects prepared bytes (R10-1)

**The defect this closes.** `job-dead-letter-retention` is an **independent**
global `failed_at` sweep. Nothing ordered it against
`email-prepared-sends-retention`, and **both windows are operator-configurable**,
so `JOB_DEAD_LETTER_RETENTION_DAYS = 1` with
`EMAIL_PREPARED_SEND_RETENTION_DAYS = 7` is a *valid configuration* that deletes a
status-`1`/`6` DLQ row **before** its own recorded `external_state_expires_at`.
Its prepared row instantly becomes an **orphan** — and the orphan batch has no
recorded boundary to read, so it falls back to `prepared_at + the current env
var`, exactly the retroactive reading §4.5's prospective-retention rule exists to
forbid. Worse, the bytes' owner is gone, so the `Expired` stamp and its evidence
can never be written: the expiry becomes indistinguishable from loss. **Even at
unchanged defaults, sweep ordering alone can erase the DLQ row in the gap before
the prepared sweep transitions it.** This is R9-2's class exactly — *one retention
job silently removing the row that makes the other one safe.*

**The rule.** `job-dead-letter-retention` is **ineligible to delete any
bytes-possible row**. A row is bytes-possible iff `external_state_status IN (1,
6)` — the same `IN` list §4.5's expiry batch uses, and for the same reason: those
are precisely the two states a sanctioned writer can stamp on a row whose bytes
may still exist. The age sweep's `DELETE` therefore carries the predicate:

```sql
-- job-dead-letter-retention (§7.3). The NOT IN (1, 6) predicate is the artefact
-- that keeps this sweep from destroying the owner of possibly-present bytes.
DELETE FROM job_dead_letter d
WHERE  d.id IN (
    SELECT id
    FROM   job_dead_letter
    WHERE  failed_at < now() - make_interval(days => :retentionDays)
      AND  external_state_status NOT IN (1, 6)   -- R10-1: bytes-possible ⇒ ineligible
    ORDER  BY failed_at
    LIMIT  :batch
    FOR UPDATE SKIP LOCKED
);
```

*Enforcing artefact: the `external_state_status NOT IN (1, 6)` predicate in the
`DELETE`'s selecting subquery.* It is a **persisted-state** test, not a duration
comparison — which is why it is stated this way rather than as an ordering or
validation relationship between the two env vars. **A default-duration
relationship was rejected on purpose:** validating `JOB_DEAD_LETTER_RETENTION_DAYS
> EMAIL_PREPARED_SEND_RETENTION_DAYS` at startup would protect rows only while the
config that created them is still in force, and `external_state_expires_at` is
materialized *per row* from the value in force at *its* dead-letter — so any later
edit, in either direction, re-opens the hole for every outstanding row. The
predicate above is indifferent to both windows, to config edits, and to which
sweep runs first: **while the status says bytes may exist, the row is not
deletable by age.**

**What this yields, and the artefact for each:**

- **No prepared row protected by a DLQ row can be orphaned by DLQ retention.**
  *Artefact:* the `NOT IN (1, 6)` predicate, plus §4.5's `IN (1, 6)` — the two are
  complements over the same column, so a DLQ row is deletable by age **only** in a
  state whose bytes are already accounted for: `2 Expired` (deleted by the sweep in
  the statement that stamped it), `4 Missing` (proved absent), `5 Transferred`
  (moved, and now protected by the successor job's own row), `0 None`/`3
  NeverPrepared` (no bytes ever existed).
- **Sweep ordering stops mattering.** Whichever sweep runs first, the age sweep
  cannot select a row the prepared sweep still needs. *Artefact:* the same
  predicate — it holds regardless of scheduling.
- **Retention edits in either direction stop mattering** to already-persisted
  rows. *Artefact:* the same predicate — it reads status, not duration.

**The cost, stated:** a bytes-possible row is exempt from age retention **until
something resolves it**, and for `6 Unclassified` with absent bytes nothing does.
See §11 "Known open items", **K-1**. §4.5's **resolution batch** closes the `1
Present` half of this; the `6` half is open.

> **Known code-alignment item (R5-2, captain's reconciliation round).** The
> current 633 `job_dead_letter` table and `JobDeadLetter.FromJob` have no
> `external_state_*` columns and stamp no prepared-state status. The contract
> above is authoritative; adding the columns, the CHECK constraints, the
> dead-letter-time stamp, and the sweep's atomic `Expired` transition belongs to
> the captain's reconciliation round.

### 4.3 `system_job_definitions`

```sql
CREATE TABLE system_job_definitions (
    id               uuid        NOT NULL DEFAULT uuidv7(),
    job_key          text        NOT NULL,     -- stable id, e.g. 'session-cleanup'
    cron_expression  text        NOT NULL,     -- Quartz cron
    is_enabled       boolean     NOT NULL DEFAULT true,
    description      text        NULL,
    last_enqueued_at timestamptz NULL,
    reconciled_through timestamptz NOT NULL DEFAULT now(), -- durable exclusive lower bound for gap reconciliation (R3-1)
    schedule_policy_fingerprint text NOT NULL, -- POLICY EQUALITY: hash/version of cron + timezone + gap policy (R4-1). Detects revisions; repeats across A → B → A by design.
    schedule_epoch   uuid        NOT NULL DEFAULT gen_random_uuid(), -- EPOCH IDENTITY: re-randomized on every revision, every disable→enable, every recreation (R6-1/O18). Never repeats.
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

The `(job_key, scheduled_fire_at)` **primary key** is the occurrence identity
for as long as the ledger row is retained. `EnqueueSystemJobJob` writes this row
**in the same transaction** as the
`IJobEnqueuer` enqueue (§5.3): `INSERT … ON CONFLICT (job_key, scheduled_fire_at)
DO NOTHING` — **zero rows inserted ⇒ this occurrence was already enqueued** (even
if that earlier job has since completed and been deleted), so the transaction
enqueues nothing and commits a no-op. This is durable, restart-surviving dedup the
queue key cannot provide.

**Prune-safe, revision-aware reconciliation high-watermark
(R3-1/R4-1/O10/O15).** Retention means the
ledger identity is not literally permanent, so catch-up must never infer an old
missing occurrence merely because its ledger row was pruned. The durable lower
bound is `system_job_definitions.reconciled_through`, updated under a row lock:

1. Reconciliation starts one transaction and locks the definition row `FOR
   UPDATE`. Its exclusive scan interval is `(reconciled_through, cutoff]`, where
   `cutoff` is the latest expected cron fire at or before database `now()`. If a
   sparse cron has no expected fire after the current watermark, the interval is
   empty; `cutoff` is never allowed to move the watermark backward.
   On first deployment, the migration initializes `reconciled_through = now()`
   for existing definitions; the seeder initializes new definitions to database
   `now()`. Neither bootstrap path backfills pre-feature history.
2. `DropOnGap` inserts no missed occurrences. `CatchUp = AtMost(n)` selects at
   most the `n` most-recent expected fires in that interval and inserts their
   ledger + queue rows through the atomic path below. Older fires in the interval
   are deliberately dropped, not deferred.
3. After all selected enqueues (possibly zero) succeed, the same transaction
   advances
   `reconciled_through = GREATEST(reconciled_through, cutoff)` and commits. Any
   enqueue failure rolls back both the jobs and the watermark. A concurrent
   reconciler blocks on the row lock and then observes the monotonic bound.
4. Reconciliation **never enumerates a fire at or before
   `reconciled_through`**, even when its occurrence row has been pruned. The
   ledger may therefore be retained for 30 days without resurrecting older work.

Normal scheduled delivery writes the occurrence ledger but does **not** advance
the watermark independently: the next serialized reconciliation sees that tick
in the ledger, catches any eligible missing predecessors according to policy,
then advances through one cutoff. This prevents a live fire racing ahead from
silently skipping a bounded-catch-up gap. The §9 regression prunes an old
occurrence, reconciles twice, and proves that neither pass resurrects it.

**Schedule-revision semantic: edits start “from now”; they never back-fill
(R4-1/O15).** The stored `schedule_policy_fingerprint` is a deterministic
version/hash of the effective cron expression, catalog timezone, and catalog gap
policy. Every schedule mutation uses one of two transactionally complete paths,
and each writes the new fingerprint, a **fresh `schedule_epoch`**, and the
watermark reset together:

- the dashboard/service path locks the definition and, on a cron change or a
  `disabled → enabled` transition, writes the new values/fingerprint, a new
  `schedule_epoch`, and resets `reconciled_through = database now()` in the same
  transaction; and
- `SyncSystemJobsJob` compares the current catalog-derived fingerprint under the
  same definition-row lock. A timezone or gap-policy code change that causes a
  mismatch atomically writes the new fingerprint, a new `schedule_epoch`, and
  resets `reconciled_through = database now()` **before** registering the revised
  live trigger.

That reset is the new schedule's exclusive effective lower bound: time before it
is never interpreted under the new cron/timezone/gap policy, and time spent
disabled is never caught up when re-enabled. This deliberately trades historical
back-fill for an honest, simple edit contract. The §9 sparse-cron, cron-edit, and
disable-past-retention specs prove monotonicity and the no-back-fill boundary.

**The reset alone does not fence the *live* trigger — the trigger carries its
schedule's identity (R5-1/O18).** Resetting `reconciled_through` fixes durable
*history*; it does nothing to the RAM-store trigger already registered under the
**old** cron. `SyncSystemJobsJob` reconciles only every ~60 s, so after a
dashboard cron edit commits there is a window of up to one sync interval in which
the superseded trigger is still live and can fire. The occurrence PK cannot catch
it: the old schedule's fire time is genuinely unique, so
`INSERT … ON CONFLICT DO NOTHING` inserts happily and the system persists an
occurrence — and a real job — from a schedule the operator has already replaced,
*after* the new policy's effective boundary. The fence is therefore carried **on
the trigger itself** — and the token it carries is the **epoch**, not the
fingerprint:

- **Two fields, two questions (R6-1/O18).** `schedule_policy_fingerprint` answers
  **“is the policy text identical?”** (policy equality). `schedule_epoch` answers
  **“did this execution come from the registration that is current now?”**
  (registration-epoch identity). These are different propositions and neither
  implies the other; the design keeps both fields because it needs both answers.
  The fingerprint is the **detector** — it is what makes a revision noticeable, so
  `SyncSystemJobsJob` knows when to re-register — and it is deliberately allowed
  to repeat. The epoch is the **fence**, and it never repeats.
- `SyncSystemJobsJob` stamps **`schedule_epoch` into every dynamic trigger's
  `JobDataMap`** alongside `job_key`, read under the same definition-row lock in
  which it compares the catalog-derived fingerprint. A trigger thus carries the
  identity of the registration that created it, and that identity travels with
  every fire. (The fingerprint is **not** stamped into triggers: one token on the
  wire, one fence.)
- Because a Quartz `JobDataMap` is fixed at registration, an epoch change means
  the trigger must be **replaced, not left in place**: `SyncSystemJobsJob`
  unschedules the old trigger and registers a new one carrying the new epoch
  (`RescheduleJob` with a fresh `TriggerKey` payload). Re-registration is what
  retires the old identity; any straggler fire from the old trigger still carries
  the old epoch and is rejected below.
- `EnqueueSystemJobJob` compares the trigger's epoch against the definition's
  **current** `schedule_epoch` under the definition-row lock and enqueues only on
  an **exact** match (§5.3).

**Why a repeating fingerprint cannot be the fence — the ABA hole (R6-1/O18).**
An earlier revision fenced on the fingerprint and argued that a revert
(`A → B → A`) *should* recompute the same value because the old trigger is
“schedule-identical” to the current one. That argument was **wrong**, and the
error is worth stating precisely because it is easy to re-make: it answers the
policy-equality question when the question on the wire is epoch identity. Both
things are true at once, and they point opposite ways —

- the **newly registered A trigger** should be accepted: its policy equals the
  current policy, and that is what the fingerprint correctly reports; but
- a **delayed execution acquired under the first A epoch** should be rejected:
  Quartz may have acquired that fire long before, and it has been in flight across
  a B interval the operator deliberately imposed. It is not a fire of the current
  registration, and no property of the *policy text* can say so.

A repeating hash cannot separate the two, so a fingerprint fence admits the
stale one. The same hole opens for **disable → enable** (the fingerprint is
unchanged across an interval where the operator's intent was "do not run", so a
fire acquired before the disable passes both the hash check and the now-`true`
enabled check) and for **delete → recreate** of the same `job_key` with the same
policy. The occurrence PK does not close any of these: the stale fire's
`scheduled_fire_at` is genuinely unique, so `ON CONFLICT DO NOTHING` inserts it
happily.

A random uuid re-drawn on every revision, every `disabled → enabled` transition,
and every active-definition recreation closes all three, because no two
registrations ever share an epoch — including a recreation, which a monotonic
counter would restart from zero and which is why the epoch is a **uuid rather
than a counter**. Note what is *not* claimed: the epoch is not ordered and
carries no history; it answers identity only. Ordering questions belong to
`reconciled_through`.

**Why the epoch, and not the watermark, is the fence.** A live tick is
legitimately allowed to land at or below `reconciled_through` — reconciliation
advances the watermark to the latest expected fire at or before `now()`, which
routinely passes live ticks. Fencing delivery on the watermark would therefore
drop valid occurrences. The epoch is orthogonal to time entirely, which is
exactly why it composes with the watermark instead of competing with it. (The
reviewer's alternative — an immutable `schedule_effective_from` fence compared
against `scheduled_fire_at` — also works, but only if kept strictly separate from
the advancing watermark; the epoch is preferred because it needs no such
separation discipline and it survives delete/recreate.)

**Definition-first lock order (R5-1/O18).** Both occurrence-writing paths open
their transaction by locking the **definition row first**, per the §4 lock-order
rule (`system_job_definitions` before `system_job_occurrences`):

| Path | Order |
| --- | --- |
| `EnqueueSystemJobJob` (live delivery) | `SELECT … FROM system_job_definitions WHERE job_key = $1 AND is_deleted = false FOR UPDATE` → validate (enabled / not deleted / **epoch match**) → `INSERT INTO system_job_occurrences … ON CONFLICT DO NOTHING` → enqueue via `IJobEnqueuer` → stamp `last_enqueued_at` → COMMIT |
| Reconciliation (`SyncSystemJobsJob`) | `SELECT … FOR UPDATE` on the same definition row → derive `(reconciled_through, cutoff]` → insert occurrence + queue rows → `reconciled_through = GREATEST(reconciled_through, cutoff)` → COMMIT |

This eliminates the inversion the previous text left open, in which reconciliation
locked the definition and *then* inserted occurrences while live delivery inserted
the occurrence and *only later* stamped `last_enqueued_at` on the definition. The
`last_enqueued_at` stamp is now a write under a lock the transaction already
holds, not a second, later acquisition.

> **Known code-alignment item (R3-1/R4-1/R5-1/R6-1, captain's reconciliation
> round).** The current `feat/634-app-role-quartz` line has no durable
> reconciliation high-watermark, no `schedule_epoch`, stamps only `job_key` into
> the `JobDataMap`, and does not lock the definition row on the delivery path.
> This document specifies the correct contract; adding the columns, migration
> initialization, `GREATEST` update, the fingerprint/epoch reset paths, the
> trigger epoch stamp/replacement, the definition-first lock order, and specs
> belongs to the captain's reconciliation round.

### 4.4 `email_log` (auditable delivery lifecycle record — day one)

Written by email job handlers (and the engine's terminal-failure hook, §5.4) on
**terminal local outcomes first**. The queue stays delete-on-success and this
table is where email history lives. Later provider evidence may transition the
row only through the state machine below; every transition is atomically audited.

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
    evidence_source     text        NOT NULL DEFAULT 'local', -- local, provider_webhook, provider_reconciliation
    provider_event_id   text        NULL,       -- current transition evidence id; webhook/reconciliation dedup
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_email_log PRIMARY KEY (id)
);

CREATE INDEX ix_email_log_kind_occurred_at ON email_log (kind, occurred_at);
CREATE INDEX ix_email_log_recipient_occurred_at ON email_log (recipient, occurred_at);  -- the support query (F20)
CREATE INDEX ix_email_log_invitation_id ON email_log (invitation_id)
    WHERE invitation_id IS NOT NULL;
CREATE INDEX ix_email_log_user_id ON email_log (user_id)
    WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX ux_email_log_provider_event_id ON email_log (provider_event_id)
    WHERE provider_event_id IS NOT NULL;

-- One terminal outcome per job: doubles as the handler's idempotency marker
-- (§5.4 — a reclaimed job whose Submitted row already exists must not resend).
CREATE UNIQUE INDEX ux_email_log_job_id ON email_log (job_id)
    WHERE job_id IS NOT NULL;

-- One historical row per source outbox row: makes the R1/R2 back-copy idempotent
-- and re-run-safe across migration steps (F4/C3).
CREATE UNIQUE INDEX ux_email_log_legacy_outbox_id ON email_log (legacy_outbox_id)
    WHERE legacy_outbox_id IS NOT NULL;

-- The `email-log-retention` age sweep (§7.3). Both composite indexes above lead
-- with kind/recipient, so neither can serve a global scan by age (R5-3).
CREATE INDEX ix_email_log_occurred_at ON email_log (occurred_at);
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
  reconciliation (if Resend logs are ever imported) may later transition specific
  rows through the audited state machine below; absent evidence they stay
  unverified. Only handlers running the *corrected*
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

**Permitted evidence transitions (R3-8/O14; no second table).** `email_log` is
not row-immutable. `EmailLogWriter.ApplyProviderEvidenceAsync` is the only update
path and performs, in one transaction, a conditioned update plus an immutable
existing `AuditLog` entry containing the email-log id, prior outcome, new
outcome, evidence source, provider event id, and actor/system identity. Allowed
edges are deliberately narrow: `LegacySubmissionUnverified → Submitted` only
with provider acceptance evidence; `Submitted → Delivered | Bounced |
Complained` for authenticated, idempotently processed provider webhooks. Terminal
delivery edges do not reverse. The update sets `evidence_source` and
`updated_at = now()` in SQL; an edge outside the allowlist affects zero rows and
is rejected. The conditioned update also writes `provider_event_id`; its partial
unique index rejects a concurrent replay, while a later replay of an older event
cannot satisfy the forward-only outcome predicate. Dashboard history is reconstructed
from `AuditLog`; retention still hard-deletes the lifecycle row according to
§7.3. The enum/migration that introduces webhook outcomes belongs to the later
webhook build packet; this document fixes the lifecycle contract now without a
new evidence table.

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

-- The `email-prepared-sends-retention` sweep scans and orders by prepared_at;
-- the PK is on job_id and cannot serve it (R5-3).
CREATE INDEX ix_email_prepared_sends_prepared_at ON email_prepared_sends (prepared_at);
```

**Row existence *is* the PREPARE-committed proof (R2-12).** There is **no
`prepared_committed` flag** — another transaction cannot see an uncommitted
insert, and every insert would set it true, so the column could never distinguish
the two lifecycle states. The presence of a committed `email_prepared_sends` row
for a `job_id` means PREPARE committed; its absence means it did not — **while the
row is still alive**. Once retention may have deleted it, the same proposition is
carried by the `job_queue.external_prepared_at` marker written in this very
transaction, which is what lets absence be classified rather than guessed
(§4.2/R6-4). `prepared_at` is retained because it is operationally useful and is
the **orphan** batch's age floor (§7.3); the DLQ-requeue window's boundary is
never recomputed from it — that boundary is materialized once into
`job_dead_letter.external_state_expires_at` at dead-letter and read from there
(§4.2; R4-3/R6-2).

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

1. **PREPARE — ONE FENCED TRANSACTION (commits before any provider call).**
   Because this commit precedes the network call, a crash *after* the provider
   accepts but *before* the send transaction commits leaves the prepared bytes
   durably on disk — the retry re-sends the **same** bytes rather than re-rendering
   mutated state (the exact failure C1 flags). A subsequent attempt that **finds a
   committed row** skips rendering entirely and reads the stored bytes back.

   The transaction writes **two** rows — the scratch and the queue row's marker —
   and they must agree, so the write is specified as a unit (R7-2/O23):

   1. take the **domain row lock** (`SELECT … FOR UPDATE`) and do the fresh
      eligibility read (§5.4 step 1);
   2. **lock and re-check the prepared row *after* that lock** —
      `SELECT prepared_at FROM email_prepared_sends WHERE job_id = {jobId} FOR
      UPDATE`. The pre-check that decided to enter PREPARE at all was unlocked and
      is not authoritative; **this** read is;
   3. if it is absent, render, serialize, and insert **once**, taking the
      database's own value for the row that ends up existing:
      `INSERT … ON CONFLICT (job_id) DO NOTHING RETURNING prepared_at`. If the
      insert returns **no** row it lost a conflict — re-read the **winner's**
      `prepared_at` (step 2's `SELECT`, repeated). Either way PREPARE now holds
      **`preparedAt` = the `prepared_at` of the one scratch row that actually
      exists**, never a value of its own invention;
   4. **stamp the marker with that exact value, fenced on the lease token, and only
      after the engine has *proved* the caller is entitled to it.** The handler does
      **not** write `job_queue` itself — it calls an **engine-owned seam**
      (`Infrastructure/Jobs/ExternalPreparedMarker.cs`, **built by Phase 2A-R**,
      which owns engine contracts; 2C-R1 only calls it — §10):

      ```csharp
      // Infrastructure/Jobs — the ONLY sanctioned marker write.
      public interface IExternalPreparedMarker {
          Task StampAsync(StampExternalPreparedArgs args, CancellationToken ct);
      }

      // 3 params → an Args record, per the repo's service convention.
      public sealed record StampExternalPreparedArgs(
          Guid JobId, Guid LockToken, DateTimeOffset PreparedAt);

      [Service(ServiceLifetime.Scoped)]
      public sealed class ExternalPreparedMarker : IExternalPreparedMarker {
          // Scoped AppDbContext IS the caller's PREPARE context, so the write joins
          // the caller's transaction. No job_type parameter exists anywhere above:
          // the caller cannot tell this seam what it is stamping.
          public ExternalPreparedMarker(AppDbContext db, IJobRegistry registry) { … }
      }
      ```

      **Two guards, then the fenced write — in this order, each failing the call
      rather than trusting a call site (R8-3).** Round 7 took only ids, a timestamp, a context,
      and a token — so "both marker writers are reachable only for a
      `TransferExternalEffectState` type" was **assertion-by-call-site**: any
      same-assembly caller, including a `Standard` handler, could stamp. F15's guard
      catches direct `job_queue` writes *outside* `Infrastructure/Jobs`; it does not
      catch calls *into* an unrestricted engine method. So:

      1. **Active caller transaction required.** `db.Database.CurrentTransaction is
         null` → throw before writing. Without an ambient transaction the `UPDATE`
         would autocommit and step 5's rowcount-or-rollback rule could not roll the
         scratch insert back — the fence would be decorative.
      2. **Policy proved from the *persisted* row, under lock.**
         ```sql
         SELECT job_type FROM job_queue
         WHERE id = {jobId} AND lock_token = {token} FOR UPDATE;
         ```
         Zero rows → the lease is lost or the row is settled → throw
         `ExternalPreparedFenceLostException` **before writing**. Otherwise resolve
         that `job_type` against the registry and throw unless it is a
         `TransferExternalEffectState` registration. The `job_type` is **read from
         the database, not supplied by the caller**, so it cannot be forged.

         **What this guard proves, exactly — and what it does not (R9-7).** It is
         **target entitlement**, not caller identity. It proves two things about the
         *row being stamped*: the caller holds that row's **current lock token**
         (otherwise zero rows), and that row's **persisted policy** is
         `TransferExternalEffectState` (otherwise the registry resolution throws).
         It does **not** know which registration is calling, and the design does not
         pretend it does. So: a `Standard` handler stamping **its own** job is
         rejected on its own row's persisted `Standard` type; a `Standard` handler
         stamping **another job's** id **with its own token** is rejected by the fence
         (`AND lock_token = {token}` matches zero rows) *before* any persisted type is
         read — the right outcome for the wrong reason than round 8 gave, and worth
         stating accurately; and a `Standard` handler that somehow held a live
         **Transfer** row's id *and* that row's *current* token would be **allowed** to
         stamp it. That last case violates no invariant §4.2 relies on — the stamped
         row is a Transfer row, which is precisely the state the marker is *for*. The
         invariant this seam delivers is target-scoped: **no marker on a
         `Standard`/unregistered row**. If caller identity ever becomes load-bearing,
         it needs a different mechanism — `JobId`/`LockToken` removed from
         caller-controlled args and bound to the engine's current execution context —
         and that is not built here, so it is not claimed here.
      3. **Then the fenced write** — same predicate, plus NULL-or-equal:
         ```sql
         UPDATE job_queue
         SET    external_prepared_at = {preparedAt},   -- the scratch row's OWN value; NEVER a second now()
                updated_at           = now()
         WHERE  id         = {jobId}
           AND  lock_token = {token}                   -- §6: every transition is conditioned on the token
           AND  (external_prepared_at IS NULL OR external_prepared_at = {preparedAt});
         ```
         Rowcount ≠ 1 → throw. **What that check still catches, precisely:** guard 2
         already holds the row lock with a matching token, and every §6 transition is
         itself token-conditioned and needs that lock (a settling `DELETE … WHERE id
         AND lock_token` blocks on it) — so the token cannot change and the row
         cannot vanish underneath this statement. The residual zero-row case is
         therefore exactly **"the marker already holds a different value"**, which is
         the equality violation this rule exists to reject.

      **The seam rolls the transaction back itself; it does not ask.** Every throw
      above is preceded by `CurrentTransaction.RollbackAsync()`. This is not
      belt-and-braces — without it the rollback would be a **convention** (the same
      defect class as R8-1's "payload-blind" claim): guard 2's zero-row result is a
      client-side condition, **not** a SQL error, so Postgres does *not* poison the
      transaction, and a handler that wrapped `StampAsync` in a `try/catch` and
      committed anyway would land its scratch bytes with no marker — an orphan
      created by the very seam that exists to prevent one. Rolling back first makes
      the caller's subsequent `CommitAsync` throw on an already-completed
      transaction, so **a catching handler still commits nothing**. §9 asserts
      exactly that.

      **Lock order (global, and consistent with every other path):** domain row →
      scratch row → `job_queue`. Terminal settlement takes an unlocked read of the
      scratch and then `job_queue`, preserving the same relative order; the sweep's
      order (DLQ → scratch, R6-3) shares no pair with either. No cycle exists, so
      guard 2's `FOR UPDATE` introduces no `40P01` risk.

      Engine-owned for three reasons: the fence/rowcount rule below cannot be
      re-implemented — or quietly forgotten — per job type; the policy proof above is
      only unforgeable if the caller cannot supply the `job_type`; and F15's boundary
      ("nothing outside `Infrastructure/Jobs` writes `job_queue`", §9's architecture
      guard) keeps holding, which it would not if each handler hand-wrote this
      `UPDATE`.

   5. **require exactly one affected row, or roll the *entire* transaction back** —
      the scratch insert included;
   6. **commit.**

   **What each clause forecloses** — the old contract set the marker from an
   **independent** `now()` and left the write **unfenced**, and claimed
   marker/`prepared_at` equality "by construction". Each case below is something
   that admitted:

   - **Two workers both observe no scratch.** They serialize on the domain lock, so
     the loser's step-2 recheck sees the winner's row and never inserts. If a future
     kind's domain lock does not cover the pair, step 3's `DO NOTHING` +
     winner-read still leaves **one** row and makes the loser adopt **the winner's**
     `prepared_at` — where the old rule let it hit `DO NOTHING` and *still* overwrite
     the marker with a strictly **later** `now()`, advertising a sensitive-byte
     cutoff past the real one and lying about when the bytes were prepared.
   - **A token-ignoring stale owner reaches PREPARE after lease loss** (§5.1 —
     cancellation is cooperative, so this is a *supported* path, not a hypothetical).
     Its `lock_token` no longer matches, so **guard 2's fenced read finds zero rows**
     and throws `ExternalPreparedFenceLostException` **before any write** → the whole
     transaction rolls back. It cannot insert an orphan scratch, cannot move the
     marker, and cannot mutate a queue row the new owner now owns.
   - **A stale owner reaches PREPARE after the row was already settled.** The queue
     row is gone, so guard 2's `WHERE id = {jobId}` matches **zero rows** → the same
     throw → rollback → **no scratch is committed after settlement** and no orphan
     outlives its queue row.
   - **The marker already holds a different value.** Zero rows → rollback. So
     `job_queue.external_prepared_at = email_prepared_sends.prepared_at` is
     **enforced by the write itself** rather than asserted: the only value the marker
     can ever hold is the one carried by the scratch row that exists. (The requeue
     transfer path satisfies the `= {preparedAt}` branch by construction — it
     restores the marker *from* the moved row's own `prepared_at`, §4.2 — so a
     transferred job that re-enters PREPARE finds the row at step 2 and never
     reaches step 3.)
   - **A job whose scratch vanished tries to PREPARE again.** This falls out of the
     clause above and is the **intended** behaviour, not a side effect: the marker
     still holds `T1` while a fresh insert would mint `T2`, so the stamp affects zero
     rows and the attempt rolls back — the job **cannot silently re-render fresh
     bytes under a fresh provider key**, which is precisely the licence O20 exists to
     deny. It is not a stall: the rolled-back attempt is an ordinary failed attempt,
     burns one of `max_attempts`, and the job settles terminally, where the engine's
     classifier reads marker-set + row-absent and stamps the evidenced `4 Missing`
     (§4.2). The anomaly is surfaced, not papered over.

   This is why the marker is trustworthy enough to classify absence at dead-letter
   (§4.2) and to bound the DLQ requeue window (the retention rules below): it is not a
   parallel timestamp that *should* match the scratch, it is the scratch's own
   timestamp, written under the same fence as every other transition (§6).
2. **SEND transaction (separate, locked).** A second transaction takes the domain
   row lock, does the eligibility recheck **and re-checks `email_log(job_id)`
   immediately before network I/O** (R2-2 local-race close, §5.4), calls
   `SendPreparedAsync` with the stored bytes, and on acceptance writes
   `email_log(Submitted)` + deletes the scratch row. **On a *transient* provider
   failure the scratch row is left committed** so the retry reuses it; only a
   resolved `Submitted`/`CancelledIneligible` outcome deletes it. A permanent
   failure leaves the row attached to the DLQ lineage so §4.2 can transfer the
   original bytes and provider identity during requeue **within the prepared-send
   window** (R3-2/R4-3).

**Cleanup preserves live queue work but caps email-DLQ state at seven days
(C1/R4-3/R4-6/R6-2).** The `email-prepared-sends-retention` sweep (§7.3) uses
exact relationships: `job_queue.id = email_prepared_sends.job_id` and
`job_dead_letter.original_job_id = email_prepared_sends.job_id`. A live
`job_queue` row protects its prepared envelope regardless of age. A matching
email DLQ row **in a bytes-possible state — `1 Present` or `6 Unclassified`
(R9-2)** — protects it **until that row's recorded
`external_state_expires_at`**, after which its bytes become **eligible for
deletion**. The sweep reads that stored boundary and does **not** recompute
`prepared_at + current EMAIL_PREPARED_SEND_RETENTION_DAYS`, so the timestamp the
dashboard shows and the instant requeue stops accepting (§4.2) are **one value**.

> **What that one value does and does not fix (R10-2).** It makes the *displayed*
> cutoff and the *requeue* cutoff identical — **and requeue's is exact**, because
> the command compares `now()` to the stored column synchronously (§4.2). It does
> **not** make the bytes disappear then. This sweep is a periodic system job: the
> predicate below marks a row **eligible** at `external_state_expires_at <=
> now()`; the row's bytes are deleted by the **first successful pass at or after**
> that instant. A delayed, failed, or not-yet-scheduled sweep — or the store
> outage that produced the `6 Unclassified` in the first place, if it persists
> through the cutoff — leaves the bytes on disk past their advertised expiry.
> Earlier revisions of this paragraph said the displayed cutoff, the requeue
> cutoff, "and the instant the bytes actually die are one value and cannot
> disagree." **That third clause was false and is withdrawn.** The honest form:
> *the recorded cutoff bounds eligibility exactly; physical deletion is eventual
> and its lag is observable (§7.2's `jobs.prepared_state.sweep_overdue`), not
> bounded by anything in this design.* See §11 "Known open items", **K-3**.

A row matching neither relation is an orphan, deleted by the sweep's **orphan
batch** on the `prepared_at` age floor (it has no DLQ row to carry a boundary or
to stamp — see the orphan-boundary residue below).

**The batches must partition the possibly-present bytes, and one status broke that
(R9-2).** A DLQ row in a bytes-possible state is *not* an orphan (it matches the
DLQ relation), so the orphan batch will never touch its bytes; the
DLQ-expiry batch is therefore the **only** sweep that can. When that batch
predicated on `external_state_status = 1` alone, bytes sitting behind a
probe-failure row selected by **neither** batch and survived until the 90-day DLQ
row itself was deleted — inheriting exactly the retention the seven-day cap exists
to deny (O16), and falsifying this section's own "exactly until its recorded
expiry". The predicate below is therefore `status IN (1, 6)`: the enforcing artefact
for the seven-day cap is that `IN` list, and it must contain **every** status a
sanctioned writer can stamp on a row whose bytes may still exist. `2 Expired`
(bytes provably deleted by this sweep), `3 NeverPrepared`/`0 None` (no bytes), and
`5 Transferred` (bytes moved and now protected by the new job's own row) are
excluded because their bytes are accounted for; `4 Missing` is excluded because it
means the probe **ran** and proved absence.

Thus age alone never deletes active queued work, but it deliberately ends
requeueability for failed email sends so token-bearing recipient/body bytes do not
inherit the 90-day DLQ retention window (O16).

**And the other retention job may not delete the row this one depends on
(R10-1).** This whole section reasons from a surviving DLQ row: it carries the
boundary, it receives the `Expired` stamp, and it is what keeps the bytes out of
the orphan batch. `job-dead-letter-retention` is an independent age sweep and
could delete it first — so §4.2 now makes that sweep **ineligible for any row with
`external_state_status IN (1, 6)`**. The two predicates are complements over one
column (`IN (1, 6)` here, `NOT IN (1, 6)` there), which is what makes them safe
under any configuration and either sweep order. *Enforcing artefacts: the two SQL
predicates. Not a duration relationship — the env vars are free to be anything.*

**The orphan batch's boundary is the one honest residue (R10-1/R10-2).** A true
orphan — a prepared row with neither a live `job_queue` row nor a
`job_dead_letter` row, e.g. a scratch left by a crash between outcome and cleanup
— **has no recorded cutoff**, because nothing ever materialized one for it. The
orphan batch therefore deletes on `prepared_at + the current
EMAIL_PREPARED_SEND_RETENTION_DAYS`, which **is** retroactive: editing the env var
moves the boundary for outstanding orphans in both directions. This is not fixed
and cannot be fixed by reading a boundary that was never written; the current env
var is the only bound available for a row that never had a DLQ row. The
prospective-retention guarantee below is therefore stated for **rows with a
materialized boundary**, and orphans are excluded from it by name. What keeps this
small: with R10-1's exemption in place, **no DLQ-protected row becomes an orphan
through retention** — orphans arise only from crash residue, never from a sweep.

**A retention-window change is PROSPECTIVE ONLY for rows with a materialized
boundary (R6-2/O7; scope stated, R10-1).** Because the boundary is materialized at
dead-letter, editing `EMAIL_PREPARED_SEND_RETENTION_DAYS`
changes the window for rows dead-lettered **after** the change and leaves every
already-materialized `external_state_expires_at` exactly as recorded — and
R10-1's exemption is what keeps that promise *durable*, since a DLQ row deleted by
the age sweep would take its materialized boundary with it and drop the bytes back
onto the current env var. **True orphans are the stated exception** (above): they
never had a materialized boundary, so the edit does reach them. This is the
deliberate choice, and it is what keeps the durable timestamp honest: a
retroactive reading would let a shortened window delete bytes *before* the expiry
the row advertises, and a lengthened one retain and requeue them *after* it —
either way the DLQ row would be lying about its own cutoff. Operators shortening
the window for a compliance deadline must therefore know it governs new rows;
purging outstanding ones is an explicit, audited operation, not a silent
consequence of an env-var edit (the alternative — a conditioned recalculation
migration over outstanding `Present` rows before the new window takes effect —
was considered and rejected in O7).

**Deleting the bytes and recording that they expired are the same statement
(R5-2/O19).** If the sweep deleted `email_prepared_sends` rows and *then* stamped
the DLQ, a crash between the two would leave a DLQ row reading `Present` with no
bytes — indistinguishable from corruption, which is precisely the state §4.2's
`Missing` path escalates as an anomaly. The sweep therefore performs deletion,
DLQ transition, and evidence in **one statement, one transaction** — a single CTE
whose `DELETE` feeds the `UPDATE` that feeds the evidence `INSERT`, so all three
commit together or none do:

```sql
-- email-prepared-sends-retention, DLQ-expiry batch (one statement, one transaction).
-- :batch = the sweep batch size. No retention env var appears here: the boundary
-- was materialized at dead-letter and is read, never recomputed (R6-2).
WITH due AS (
    SELECT d.id AS dead_letter_id, d.original_job_id AS job_id,
           d.external_state_expires_at, d.external_state_status AS prior_status
    FROM   job_dead_letter d                                    -- DLQ FIRST (§4 lock order, R6-3)
    JOIN   email_prepared_sends p ON p.job_id = d.original_job_id  -- R4-6 exact predicate; read, not locked here
    WHERE  d.requeued_as_job_id IS NULL
      AND  d.external_state_status IN (1, 6)                    -- Present OR Unclassified: every state whose bytes may exist (R9-2/O29)
      AND  d.external_state_expires_at <= now()                 -- THE recorded boundary (R6-2)
      AND  NOT EXISTS (SELECT 1 FROM job_queue q WHERE q.id = d.original_job_id)
    ORDER  BY d.external_state_expires_at                       -- ordered batch (§7.3 idiom)
    LIMIT  :batch
    FOR UPDATE OF d SKIP LOCKED                                 -- lock the DLQ row, never p first
),
purged AS (
    DELETE FROM email_prepared_sends p                          -- prepared row locked SECOND, by this delete
    USING  due
    WHERE  p.job_id = due.job_id
    RETURNING p.job_id
),
stamped AS (
    UPDATE job_dead_letter d
    SET    external_state_status     = 2,        -- Expired
           external_state_expired_at = now()
    FROM   due
    WHERE  d.id = due.dead_letter_id
      AND  d.external_state_status IN (1, 6)     -- re-assert under the write
      AND  EXISTS (SELECT 1 FROM purged WHERE purged.job_id = due.job_id)
    RETURNING d.id, d.original_job_id, d.external_state_expires_at, due.prior_status
)
-- Evidence goes to the ENGINE's actor-less event table, never to audit_logs:
-- audit_logs.user_id is NOT NULL with an FK to users and this sweep has no user
-- (§4.2 "why this table exists"; R10-3/O30).
INSERT INTO job_dead_letter_events
       (dead_letter_id, event, detected_by, prior_status, new_status, details, occurred_at)
SELECT s.id, 'dead_letter.external_state.expired', 'prepared_state_sweep',
       -- The status column is single-valued, so 6 → 2 overwrites the anomaly. The WHY
       -- survives in prior_status and in the classification-time event row that shares
       -- this dead_letter_id (R9-2): prior_status = 6 means "these bytes were swept
       -- while their presence was never established".
       s.prior_status, 2,
       jsonb_build_object('originalJobId', s.original_job_id,
                          'expiresAt', s.external_state_expires_at),
       now()
FROM   stamped s;
```

The sweep loops this statement until it affects fewer than `:batch` rows.

**`dead_letter_id` is the specified join key (R10-3).** The expiry event above and
the classification-time event §5.1's step 5 writes are **rows in one table sharing
one column**, and `fk_job_dead_letter_events_dead_letter` is what guarantees both
resolve to the same DLQ row. "The expiry audit relies on the earlier row to
preserve why status 6 became status 2" is therefore a **join**, not a narrative:
`SELECT … FROM job_dead_letter_events WHERE dead_letter_id = :id ORDER BY
occurred_at`. §9's expiry spec asserts it by that key.

**The sweep takes the pair DLQ-first, exactly like requeue (§4 lock-order rule;
R6-3).** `due` locks only the **DLQ** row (`FOR UPDATE OF d`) — the `JOIN` to
`email_prepared_sends` reads the row to confirm bytes still exist but does not
lock it — and the prepared row is locked **second**, implicitly, by `purged`'s
`DELETE`. Requeue (§4.2) acquires the same two rows in the same order. The earlier
text inverted them (sweep: `FOR UPDATE OF p` then update the DLQ; requeue: stamp
the DLQ then lock `p`), which is the deadlock §4's rule now forecloses.

`SKIP LOCKED` therefore serves throughput only: a DLQ row concurrently held by an
in-flight requeue is left for the next pass rather than blocking the sweep; that
requeue either commits (stamping `5 Transferred`, which the
`external_state_status IN (1, 6)` predicate then excludes) or rolls back (leaving
the prior status for the next batch). A `6 Unclassified` row is never held by an
in-flight requeue for long: requeue rejects it fail-closed without writes (§4.2).

A `Present` or `Unclassified` row whose bytes are **already** gone does not match
the `JOIN` and is never selected by *this* batch — the batch's job is deleting
bytes, and there are none. The `EXISTS (SELECT 1 FROM purged …)` join is what
makes "stamped `Expired`" mean **"these exact bytes were deleted by this
statement"** rather than an optimistic claim. This is also why `6 Unclassified` is
safe to expire when it *has* bytes: the `JOIN` — not the status — decides, so the
sweep never needs the answer the probe could not give.

**But "any later reader stamps `4 Missing`" was wrong, and the resolution batch is
what makes the sentence true where it can be (R10-7).** The old text claimed a
later reader resolves these rows. **No specified reader does, for `6`**, and for
`1` the only reader was a staff requeue that might never happen. Concretely:
requeue rejects status 6 without probing or writing (§4.2), and the batch above
transitions a row only when it *finds* bytes. So an absent bytes-possible row was
resolved by nothing — and with R10-1's exemption it is now also **undeletable by
age**, which turns "unresolved" into "permanent". The sweep therefore carries a
**third, resolution batch** — the complement of the expiry batch over the same
eligibility clock, so that at/after the cutoff every bytes-possible row is
reached by exactly one of them:

```sql
-- email-prepared-sends-retention, RESOLUTION batch (one statement, one transaction).
-- The expiry batch's complement: same clock, same lock order, opposite JOIN.
-- Present + eligible + bytes ABSENT ⇒ the Present-reader rule fires (§4.2, R10-7).
WITH due AS (
    SELECT d.id AS dead_letter_id, d.original_job_id AS job_id, d.job_type,
           d.external_state_prepared_at, d.external_state_expires_at
    FROM   job_dead_letter d                              -- DLQ FIRST (§4 lock order)
    WHERE  d.requeued_as_job_id IS NULL
      AND  d.external_state_status = 1                    -- PRESENT ONLY. Never 6 (R10-7)
      AND  d.external_state_expires_at <= now()
      AND  NOT EXISTS (SELECT 1 FROM email_prepared_sends p WHERE p.job_id = d.original_job_id)
      AND  NOT EXISTS (SELECT 1 FROM job_queue q WHERE q.id = d.original_job_id)
    ORDER  BY d.external_state_expires_at
    LIMIT  :batch
    FOR UPDATE SKIP LOCKED
),
stamped AS (
    UPDATE job_dead_letter d
    SET    external_state_status = 4                      -- Missing: bytes PROVED absent
    FROM   due
    WHERE  d.id = due.dead_letter_id
      AND  d.external_state_status = 1                    -- re-assert under the write
    RETURNING d.id, due.job_id, due.job_type,
              due.external_state_prepared_at, due.external_state_expires_at
)
INSERT INTO job_dead_letter_events
       (dead_letter_id, event, detected_by, prior_status, new_status, details, occurred_at)
SELECT s.id, 'dead_letter.external_state.missing', 'prepared_state_sweep', 1, 4,
       jsonb_build_object('originalJobId', s.job_id, 'jobType', s.job_type,
                          'preparedAt', s.external_state_prepared_at,
                          'expiresAt', s.external_state_expires_at,
                          'reason', 'reader_absent'),
       now()
FROM   stamped s;
```

**Why this batch is a legitimate `Present` reader, not a guess.** It holds the DLQ
row `FOR UPDATE` while it tests for absence, and the **only** two deleters of
`email_prepared_sends` rows are this sweep and `RequeueDeadLetterAsync` — both of
which take the DLQ row first (§4 lock-order rule). So under that lock, absence is
stable, and `status = 1` means the probe already ran and found the row. Present →
absent is a real transition and `4 Missing` is the correct stamp. *Enforcing
artefacts: the `FOR UPDATE` on the DLQ row, the lock-order rule that makes it
sufficient, and the `external_state_status = 1` re-assertion in the `UPDATE`.*
`4 Missing` satisfies `ck_job_dead_letter_external_state` unchanged — the row
already carries both bounds.

**What it fixes:** a `1 Present` row whose bytes vanished outside the policy is now
detected **without waiting for a staff requeue that may never come**, it starts
counting in `dlq_external_state_missing` (§7.2), and — having left `IN (1, 6)` —
it becomes eligible for ordinary DLQ age retention again.

**What it deliberately does not touch: `6 Unclassified`.** The `WHERE
external_state_status = 1` is the artefact. An absent status-6 row asserts nothing
about presence, so its absence is not evidence of loss and `Missing` would be a
manufactured claim. **It stays `6` until explicit operator triage** — of which this
document specifies none. **§11 "Known open items", K-1.** If automatic
reclassification is wanted later, it needs a real reprobe path with its own
savepoint and event semantics (§5.1's boundary), not a widened predicate here.

Orphan rows (matching neither `job_queue` nor `job_dead_letter`) are deleted by
the orphan batch — they have no DLQ row to stamp.

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
   - **Fold `Pending` rows first using the shipped compound bridge marker
     (C3/R3-7).** There is no `Folded` enum value. The exact persisted marker is
     `status = Cancelled` **and** `last_error = 'folded to job_queue'`; the pair,
     not `Cancelled` alone, distinguishes a folded source row from a genuine
     cancellation and must be matched exactly by both R1/R2 back-copy SQL. Fold
     `Pending` rows only into
     `job_queue`: `job_type` mapped from `kind`
     (`email.tenant-invitation.v1` / `email.staff-invitation.v1`), payload built
     **in SQL to the canonical wire shape** (F2):
     `jsonb_build_object('invitationId', invitation_id)`; `attempts =
     attempt_count`, `next_attempt_at` preserved; email priority;
     `idempotency_key = 'fold:' || id` (the **source-row marker** — under the
     `(job_type, idempotency_key)` unique index a re-run cannot duplicate a
     fold). In the same statement flow, move each folded source row out of
     `Pending` by setting `status = Cancelled` and stamp the **reserved sentinel**
     `last_error = 'folded to job_queue'` so (a) the old dispatcher can never also send it
     and (b) the back-copy below can recognize and **exclude** it. This sentinel
     is a bridge marker, **not** a delivery outcome.
   - **Back-copy GENUINE terminal history only (C3/O6/R2-3).** `INSERT INTO
     email_log … SELECT` every outbox row that is a *real* delivery outcome —
     `Sent` (→ **`LegacySubmissionUnverified`**, never `Submitted` — R2-3;
     `occurred_at = sent_at`), `Failed` (→ `PermanentlyFailed`,
     `occurred_at = updated_at`, carrying `attempt_count`), or a
     genuinely-`Cancelled` row **whose `last_error` is not the fold sentinel**
     (→ `CancelledIneligible`, `occurred_at = updated_at`). Rows carrying
     `'folded to job_queue'` are **excluded** — their outcome is the new
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
   **Accepted bounded rollout condition (R4-7):** those residual rows still use
   the legacy eligibility-check/send sequence, and a pre-R1 producer that slips
   through during rollout may add another such row. The #811 domain-lock
   linearization guarantee therefore does **not** cover the R1 drainer window.
   It begins only after R2's fleet precondition and total quiescence check prove
   no legacy producer/drainer work remains. The drainer is intentionally not
   hardened because R2 retires it; immutable tags, the short R1 interval, and
   the abort-on-any-Pending/Processing gate bound the accepted exposure.

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
     → `LegacySubmissionUnverified`; fold sentinel `'folded to job_queue'`
     excluded; `last_error` = SQL-side stable code, never raw — R2-8; idempotent
     via the `legacy_outbox_id` unique index) — then
     `DROP TABLE invitation_email_outbox`. Because the fold sentinel is excluded
     in both R1 and R2, a folded email acquires **exactly one** record: its new
     `job_queue` outcome, never a spurious `CancelledIneligible` (C3).
   - Specs must cover: a **fresh** `Processing` row, a **stale** (older than the
     lease) `Processing` row, and a **fresh `Pending` row inserted by an old
     producer** mid-R1 — each must abort the drop (C2).
4. R2 code: delete `InvitationEmailOutboxDispatcher` (+ spec), the signal, and
   the entity. At this R2 quiescence boundary the new email handlers are the only
   send path, so the #811 locked-eligibility guarantee becomes system-wide.

**Proof the old dispatcher ignores the compound marker (R3-7).** The shipped R1
implementation is
`apps/api/Migrations/20260717035428_AddEmailLogAndFoldEmailOutbox.cs` on
`origin/feat/809-email-jobs-fold`; it writes exactly `status = 4` (`Cancelled`)
and `last_error = 'folded to job_queue'`. The shipped
`Infrastructure/Messaging/Email/InvitationEmailOutboxDispatcher.cs` claim SQL
selects only `(status = Pending AND due) OR (status = Processing AND stale)`.
Status 4 satisfies neither branch, so the old dispatcher cannot claim a folded
row. R1/R2 migration specs must assert the exact compound value and this claim
predicate. The current 809 migration's other round-2 contract gaps remain known
code-alignment items for the captain; this paragraph records its bridge state
exactly rather than inventing a new enum value or sentinel.

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
  -- DLQ: classify + hook write + INSERT job_dead_letter + conditioned DELETE, one
  --      transaction, in the terminal-path order below.
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
    connection): ownership is **unknown**, not lost. Define `safeDeadline =
    confirmedDbDeadline − safetyMargin`, where `safetyMargin = max(2 s,
    lease/20)`. A dedicated deadline timer is armed from the DB clock/skew sample
    and cancels `leaseLostSource` at `safeDeadline` even if the retry task is
    blocked. Each retry uses a fresh scope/connection and proposes
    `lease/8` (floor 0.25 s), but the actual delay is
    `min(proposedDelay, remainingSafeInterval)`; when the remaining interval is
    non-positive, it abandons immediately. No sleep or database command is
    deliberately started beyond that deadline.

  The margin **reduces** the chance that an unresponsive first handler overlaps
  a reclaimer; it does not prove non-overlap. Cancellation is cooperative: a
  provider call or handler may ignore the token until after lease expiry.
  Fencing prevents stale settlement, while handler idempotency and the stable
  external-effect identity/prepared-request/receipt contract (§4.1/§4.2) are the
  correctness mechanism for any execution overlap. The §9 spec therefore proves
  the deadline cancellation and fenced no-op settlement, and separately proves
  external-effect deduplication; it does not claim the first task has physically
  stopped before reclaim.

  > **Known code-alignment item (R2-4/R3-4, captain's reconciliation round).** The
  > `feat/633-job-queue-core` tip's `RenewLeaseLoopAsync` currently uses a local
  > `sinceConfirmedStamp` stopwatch and cancels only after a *full* lease window,
  > and does not `RETURNING` the DB deadline. **This document specifies the
  > correct contract** (validated 10-second floor, DB-returned deadline,
  > deadline timer, and capped sleeps); the 633 loop and 634 validator are
  > **known gaps to reconcile** — not doc defects. They are listed for the
  > captain's code-reconciliation round.

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
    versioned type, **all** capabilities the engine needs:
    - a **handler factory** `Func<IServiceProvider, IJobHandler>` (resolved from a
      fresh DI scope per job), and
    - a **type-erased payload validator** `Action<string> ValidatePayloadJson`
      (a closure captured over the concrete `TPayload`, running the canonical
      `JobJson` deserialize + F2 required-member/empty-ID checks on arbitrary
      stored JSON); and
    - a **per-type requeue policy + state-transfer hook** (§4.2/R3-2). Standard
      jobs declare a no-op policy; external-effect jobs must declare
      `TransferExternalEffectState` and supply an atomic hook that preserves the
      prepared request and original provider identity; and
    - an **`ExternalStateStore` descriptor** — the *dead-letter-time* peer of the
      transfer hook (R7-1/R8-1/O22/O24). Note the asymmetry, which is deliberate:
      the transfer hook is a **delegate** (it performs a move, at requeue, and there
      is no declarative way to express one), while the descriptor is **data** — the
      engine, not the type, runs the dead-letter probe. Specified in full immediately
      below.

    Registration is explicit and fail-fast (each `job_type` maps to exactly one
    registration). The startup gate rejects an external-effect definition that is
    missing **either** the transfer hook **or** the descriptor. Pairing the validator, policy, and descriptor with the factory is what lets
    `RequeueDeadLetterAsync` (§4.2) validate a *stored* DLQ payload without a
    compile-time `TPayload`, and lets the enqueue side and the requeue side share
    one validation definition instead of two drifting copies. An **unknown
    `job_type`** encountered at dispatch is a `PermanentFailure` straight to the
    DLQ (no pointless retries). (`AddJobHandler<T>` registers the handler factory;
    the paired `JobDefinition<TPayload>` supplies `ValidatePayloadJson`, so a
    handler registered without its definition — or vice-versa — fails the
    fail-fast check.)
  - **Terminal external-state classification — the engine decides; the type only
    *declares its store* (R7-1/R8-1/O22/O24).** §4.2's `external_state_status`
    machine is only total if something can answer, for an *arbitrary stored
    `job_type`*, "did a PREPARE commit, and do its bytes still exist?" The first
    half is generic — it is the marker (§4.1), an engine-owned column. Only the
    second half is type-specific (`email_prepared_sends` today; a webhook or
    Epic-D publishing prepared-state store later), and three places that might have
    answered it cannot:
    - `JobDeadLetter.FromJob` is a **generic entity factory** — it would have to
      query an email table by name to classify, coupling the engine to one domain
      and forcing an edit for every future prepared-state store;
    - `IJobHandler.OnTerminalFailureAsync` returns `Task` (no classification to
      return) and, worse, needs a **handler instance and a `JobContext`** — neither
      of which exists on the invalid-before-handler path (O21), which is exactly a
      path that must still be classified;
    - the requeue `TransferExternalEffectState` hook answers a *different* question
      at a *different* time (move the bytes, at requeue).

    **Round 7 answered this with a delegate on the registration, and that answer
    was wrong in its API shape (R8-1).** The delegate took the full `JobQueueItem`
    *and* `JobDeadLetter` — both carrying the malformed payload the text called
    unreachable — plus a **writable `AppDbContext`**. "Payload-blind" and "its only
    permitted write is `external_state_*`" were therefore **conventions the
    signature did not enforce**, and the startup gate proved only that a delegate
    *existed*, never what it did. Since a classifier failure rolled the terminal
    transaction back, any deterministic classifier defect **recreated the infinite
    re-lease loop O21 exists to close**. Blindness has to be structural.

    So the executable surface is removed. The registration carries a **declarative
    descriptor**; the engine builds and runs the probe and decides the status.

    **Round 8 answered this with an `Expression<Func<TScratch, Guid>>` selector, and
    that answer overclaimed (R9-3).** The descriptor was materially safer than the
    delegate — that part was real — but the advertised property was **stronger than
    the type**. A C# expression lambda body may contain method calls, may close over
    an instance, and EF evaluates parameterizable parts **on the client** while
    translating the rest; the signature constrained the body to nothing. So "no type
    IL executes", "a throw has no method body to live in", and "the type supplies no
    code that runs" were **not enforced by `Expression<>`** — they were the same
    convention-dressed-as-a-property defect as round 7's "payload-blind by
    signature", one level down. The startup probe proved that *one* evaluation
    translated and returned; it proved nothing about the tree's shape.

    The fix is not to validate the expression tree — it is to **have no expression**.
    The engine already knows where the store is: `TScratch` is an entity in its own
    `AppDbContext` model, and §4.5 mandates that any prepared-state store be **keyed
    by the job id**. So the engine reads the key from its **own EF model** and builds
    the predicate itself. The type contributes a **type argument and a `TimeSpan`** —
    no body, because there is no field that could hold one:

    ```csharp
    // Infrastructure/Jobs — DATA. Every field is a value; there is no delegate
    // field and no Expression<> field, so there is nothing here that CAN run.
    public sealed record ExternalStateStore<TScratch>(
        TimeSpan Retention) where TScratch : class;

    // 2C-R1's three email registrations each supply exactly this:
    new ExternalStateStore<EmailPreparedSend>(AppEnvironment.EmailPreparedSendRetention);

    // Composition erases TScratch into the type-erased probe the registration holds
    // (the same erasure ValidatePayloadJson uses — R2-7). The WHOLE probe is written
    // HERE, in the engine, over metadata the engine reads from its own model:
    //
    //   var keyName = db.Model.FindEntityType(typeof(TScratch))!    // §5.1 gate proves
    //                   .FindPrimaryKey()!.Properties.Single().Name; //   these hold
    //
    //   Func<AppDbContext, Guid, CancellationToken, Task<bool>> probe =
    //       (db, jobId, ct) => db.Set<TScratch>()
    //           .IgnoreQueryFilters()                    // a model-level filter must not
    //                                                    // make present bytes read absent
    //           .AnyAsync(s => EF.Property<Guid>(s, keyName) == jobId, ct);
    ```

    **The startup gate proves the model shape, not a lambda's shape** (gate bullet
    below): for every `TransferExternalEffectState` registration it resolves
    `TScratch` in the live EF model and **fails composition** unless the entity is
    mapped and its primary key is **exactly one property, of CLR type `Guid`, named
    `JobId`** — §4.5's mandated shape, checked against the model rather than trusted.
    That check is a property of the model metadata, so it cannot be satisfied by a
    cleverly-shaped argument; there is no argument.

    **The probe returns a `bool` — nothing else.** It asks only "do the bytes still
    exist?", which is the entire non-generic sub-question. It deliberately does
    **not** read the store's `prepared_at`: §4.2 sources `external_state_prepared_at`
    from the **marker** on every branch, and O23's fenced write makes marker =
    scratch `prepared_at` an *enforced* equality — so a second read would be a
    redundant path that could disagree with the marker, and reading it back through
    a nullable projection would make "no row" indistinguishable from a `default`
    timestamp. Existence is the question; a `bool` is the whole answer.

    **Why this is blindness by API boundary rather than by promise — each claim
    with the artefact that enforces it (R9-3):**
    - **The registration supplies no code to classification.** *Enforcing artefact:
      the `ExternalStateStore<TScratch>` record declaration.* Its only member is a
      `TimeSpan`. There is no delegate field, no `Expression<>` field, and no member
      of `TScratch` is invoked — the probe is `SELECT EXISTS(…)`, projecting nothing,
      materializing nothing. "No type-supplied code runs" is now true for the reason
      that "no type-supplied code exists to run": the shape of the record forbids
      carrying any. This is a property of a type declaration you can read in four
      lines, not of a lambda body someone else writes at a call site.
    - **The payload is not in the type's reach.** *Enforcing artefact: the descriptor
      has no parameters at all.* Round 8 argued this from the selector's parameter
      type; there is now no selector. `JobQueueItem.Payload` cannot be reached from a
      `TimeSpan`.
    - **Writes are not expressible.** *Enforcing artefact: the probe's return type
      (`Task<bool>`) and the engine-authored query.* The `DbContext` never crosses the
      registration boundary in either direction; the type never receives an entity
      handle, a tracked object, or a query root.
    - **What the type still influences, stated plainly.** The **EF model mapping** for
      `TScratch` — table name, key, value converters, query filters — shapes the SQL
      the engine's probe translates to. That mapping is authored in `AppDbContext`
      alongside every other entity, is engine-visible, and is **not** a capability the
      registration carries; but it is honest to say it exists rather than to claim the
      type influences nothing. Two of its reachable failure modes are closed by
      mechanism: a **global query filter** cannot make present bytes read as absent,
      because the probe issues `IgnoreQueryFilters()`; and a **non-`Guid` or compound
      key** cannot silently mis-target the probe, because the startup gate rejects the
      model shape before boot. A deliberately mis-mapped table name would point the
      probe at the wrong table — that is a mapping defect visible in `AppDbContext`
      and caught by the composition-time probe only if the wrong table is absent. The
      design does not claim otherwise.
    - **Honest residue.** The descriptor can still name an entity whose table is
      **dropped or renamed** under a running process — a real failure mode, closed
      twice: the startup gate **executes each descriptor's probe once at composition**
      (below), so a mis-pointed descriptor means the worker **does not boot**; and O28
      contains any *surviving* probe failure in a savepoint so it cannot roll the
      settlement back, stamping the evidenced `6 Unclassified` (O29).
    - **`Retention` is a value, captured at composition.** It is read from
      `AppEnvironment` (startup-validated and immutable for the process), so this is
      the same value a dead-letter-time read would have returned — no behaviour
      changes versus O22's delegate, and R6-2 is untouched: `external_state_expires_at`
      is still *materialized at dead-letter* and authoritative thereafter, with the
      sweep and requeue reading the stored column rather than any env var.
    - **What this keeps.** Store knowledge still lives on the registration — as the
      **type argument** — so the generic engine still has **no compile-time coupling
      to `email_prepared_sends`** and a webhook/publishing store adds a registration,
      not an engine edit — the property round 8 held. Only the *executable* surface is
      gone.
    - **Expressiveness limit, now stricter, stated rather than assumed.** The
      descriptor spans exactly "one scratch entity whose primary key is a single
      `Guid JobId`, carrying a `prepared_at`" — which is `email_prepared_sends` and the
      shape §4.5 mandates for any prepared-state store. Dropping the selector
      **narrows** this further than round 8's version: a store keyed by `job_id` under
      a *different property name*, or keyed by a compound key, can no longer be
      described at all and is an **engine change, reviewed** — deliberately, rather
      than re-opening a hole by handing arbitrary code back. That is a real, larger
      constraint on Epic-D and is the cost O27 states.

    **The decision function — engine code, total, stated once.** §4.2's table is
    normative and this is its implementation:

    ```csharp
    // Infrastructure/Jobs/ExternalStateClassifier.cs — the WHOLE decision.
    public interface IExternalStateClassifier {
        Task<ExternalStateClassification> ClassifyAsync(
            ExternalStateClassificationInput input, CancellationToken ct);
    }

    // The restricted input: three engine-owned scalars. No payload-bearing object,
    // no mutable DLQ entity, no DbContext — the engine holds those, not its input.
    public sealed record ExternalStateClassificationInput(
        Guid JobId, string JobType, DateTimeOffset? ExternalPreparedAt);

    // The returned value the ENGINE applies and validates — the classifier proposes
    // the triple; it never stamps the entity itself.
    public sealed record ExternalStateClassification(
        ExternalStateStatus Status,
        DateTimeOffset?     PreparedAt,
        DateTimeOffset?     ExpiresAt);

    [Service(ServiceLifetime.Scoped)]
    public sealed class ExternalStateClassifier : IExternalStateClassifier {
        // ctor deps (AppDbContext db, IJobRegistry registry): the probe is async, so
        // ClassifyAsync is too. db is the terminal transaction's scoped context, so
        // the probe reads committed state as of the failure.
        public ExternalStateClassifier(AppDbContext db, IJobRegistry registry) { … }
    }
    ```

    It **assigns a status on every branch** — `0 None` is emitted on exactly one
    (marker NULL + `Standard`) and is never reached by falling through to the enum's
    default; the engine then **validates the returned triple against
    `ck_job_dead_letter_external_state` before stamping**, so a status/bounds
    mismatch is a spec failure at the seam rather than a constraint violation at
    insert. A totality spec asserts all seven rows.

    **The probe is a named subtransaction — because a caught exception does not
    un-abort a PostgreSQL transaction (R9-1/O28).** This is the mechanism the round-8
    text was missing, and its absence made O25's claim false in the exact scenario
    O25's own test mandates. The probe runs through the **same** scoped `AppDbContext`
    and therefore the **same terminal transaction** as the evidence insert, the DLQ
    insert, and the fenced delete. In PostgreSQL **any SQL error aborts the
    transaction**: every subsequent statement fails with `25P02` until rollback.
    Catching the .NET exception restores nothing — the transaction is already
    unusable, so "the engine catches it and the settlement proceeds" described a
    settlement that **cannot** proceed. The job would roll back and re-lease: the
    infinite-loop class O25 was invented to close, re-entered through O25 itself. EF's
    automatic savepoint wraps `SaveChanges`; this is a failing *query*, so nothing
    wraps it unless the design says so. It now does:

    ```csharp
    // ExternalStateClassifier — the probe, and ONLY the probe, is savepoint-isolated.
    var tx = db.Database.CurrentTransaction;            // the terminal transaction
    await tx.CreateSavepointAsync(ProbeSavepoint, ct);  // "external_state_probe"
    try {
        var present = await probe(db, input.JobId, ct);
        await tx.ReleaseSavepointAsync(ProbeSavepoint, ct);
        return present ? Present(...) : Missing(...);   // §4.2 rows 4 and 5
    }
    catch (PostgresException ex)
        when (ExternalStateProbeErrors.IsRecoverableStatementError(ex, db.Database.GetDbConnection()))
    {
        await tx.RollbackToSavepointAsync(ProbeSavepoint, ct);  // transaction USABLE again
        return Unclassified(ex.SqlState, ...);          // §4.2 row 6 — evidence written at step 5
    }
    ```

    `ROLLBACK TO SAVEPOINT` is what makes the enclosing transaction usable again — it
    is a PostgreSQL subtransaction primitive, not an application convention, and it is
    the artefact behind every "the settlement still commits" sentence below.

    **`IsRecoverableStatementError` is a closed allowlist, not a description
    (R10-5).** Round 9 accepted the savepoint and round 10 was right that the
    boundary above it was still prose: *"a statement error on a live connection"*
    is a **conclusion an implementer would have to re-derive**, and "live
    connection" is not something a `catch` filter can read off an exception. The
    most load-bearing part of O28 is therefore specified as executable code, in a
    **named production helper** — `Infrastructure/Jobs/ExternalStateProbeErrors.cs`
    (Phase 2A-R, §10):

    ```csharp
    // Infrastructure/Jobs/ExternalStateProbeErrors.cs — THE probe recovery predicate.
    // Allowlist by exact SQLSTATE. Anything absent is rethrown. See the asymmetry note.
    private static readonly FrozenSet<string> RecoverableStatementStates =
        new[] {
            "42P01",  // undefined_table          — the store table was dropped/renamed
            "42703",  // undefined_column         — the model drifted from the table
            "42P10",  // invalid_column_reference
            "42883",  // undefined_function
            "42804",  // datatype_mismatch
            "42501",  // insufficient_privilege   — the SELECT grant was revoked
            "42601",  // syntax_error
            "3F000",  // invalid_schema_name      — the schema was dropped/renamed
            "22P02",  // invalid_text_representation
        }.ToFrozenSet(StringComparer.Ordinal);

    public static bool IsRecoverableStatementError(PostgresException ex, DbConnection conn) {
        if (ex.SqlState is null) {
            return false;
        }
        if (!RecoverableStatementStates.Contains(ex.SqlState)) {
            return false;
        }
        // Severity FATAL/PANIC means the backend is terminating: the savepoint dies
        // with it. 57P01 arrives this way. Belt-and-braces behind the allowlist.
        if (!string.Equals(ex.Severity, "ERROR", StringComparison.Ordinal)) {
            return false;
        }
        // The rollback needs a usable connection. This is a read of observable state,
        // not a prediction — and if it races, the rollback throws (see below).
        return conn.State is ConnectionState.Open;
    }
    ```

    **The asymmetry that justifies an allowlist over a denylist.** A **false
    negative** (a genuinely recoverable error not on the list) costs one ordinary
    settlement retry — the job re-leases and settles again; safe, and it is the
    behaviour that existed before O25. A **false positive** (an unrecoverable error
    treated as contained) costs a settlement that cannot commit — the #810 loop.
    The costs are not symmetric, so the default is **rethrow**, and the list is
    small, exact, and additive. R10-5 offered "explicit allowlist **or** exhaustive
    category/denylist"; the denylist is rejected because it must be exhaustive over
    a SQLSTATE space PostgreSQL extends between versions, and every state it forgets
    fails **open**.

    **The boundary, with the artefact that decides each row** (the predicate is
    total: allowlist membership is decidable, so every failure lands in exactly one
    row):

    | Failure | Contained? | **What decides it** |
    | --- | --- | --- |
    | `42P01` dropped/renamed store table, `42703` bad column, `42501` revoked grant, `3F000` dropped schema, and the rest of the list above | **yes** — rollback to savepoint → `6 Unclassified`, evidence written, **settlement commits** | on `RecoverableStatementStates`, `Severity == "ERROR"`, connection `Open` |
    | `57P01` **admin termination** (`pg_terminate_backend`) | **no** — rethrow, ordinary settlement retry | **not on the allowlist** — and its `Severity` is `FATAL`, so it fails two gates independently. This is the mechanism round 10 asked for: not "the connection is dead" as a conclusion, but two readable fields |
    | `57014` **query_canceled** — client `CancellationToken` reaching the server, or `statement_timeout` firing | **no** — rethrow | **not on the allowlist.** Cancellation is never converted to a store-integrity anomaly: `6 Unclassified` would assert the *store* was unqueryable when in fact *we* stopped asking |
    | `25P02` **outer transaction already aborted** on entry | **no** — rethrow | **not on the allowlist.** A savepoint cannot rescue a transaction that was already unrecoverable — and `25P02` is exactly how PostgreSQL says so |
    | **Broken/lost connection** — `NpgsqlException` over `IOException`/`SocketException`, `ObjectDisposedException` | **no** — rethrow | **the `catch` filter never matches**: these are not `PostgresException`. Nothing to decide |
    | **Command timeout** (Npgsql `CommandTimeout`) | **no** — rethrow | surfaces as `NpgsqlException`/`OperationCanceledException` (filter does not match) or, if the server cancels first, as `57014` (not on the allowlist). **Both routes rethrow** |
    | `OperationCanceledException` from the **host `stoppingToken`** | **no** | not a `PostgresException` — the filter does not match. Shutdown/abandon path (§5.1's outcome taxonomy), never an anomaly state |
    | `RollbackToSavepointAsync` **itself** throws | **no** — rethrow | **no `try` wraps it.** It runs inside the `catch` block, so its exception propagates and the settlement fails. This is the backstop for every case where `conn.State` was `Open` at the check and the connection died a microsecond later: the design does not predict the rollback will succeed, it lets the failure through |

    **Why the `catch` filter is `PostgresException` and not `Exception` (R9-1,
    self-caught).** A *client-side* EF failure — a query that cannot be translated —
    is an `InvalidOperationException` raised **before any SQL is sent**, so it does
    not abort the transaction and a savepoint would be irrelevant to it. It is also
    **not a runtime path**: the engine authors the probe expression (O27, there is no
    caller-supplied tree left to fail translation) and the startup gate executes it
    once at composition. Widening the filter to `Exception` would therefore buy
    nothing real and would swallow the class of defects that should fail loudly —
    including a bug in the engine's own classifier. Narrow filter, stated reason.

    **So the honest form of the property is:** *classification cannot fail the
    settlement for any **recoverable statement error** the probe can raise* — which
    includes every **deterministic** one (a dropped/renamed store table, a bad column,
    a revoked grant), and deterministic failure is the only kind that can produce the
    #810 loop, because it is the only kind that recurs identically on every re-lease.
    A lost connection fails the settlement exactly as it would fail step 3, 4, 5, or 6 —
    it is not classification-specific and it does not survive a reconnect, so it is
    handled by the retry that already exists. **The design claims no more than that**,
    and specifically does **not** claim "no classification outcome can ever roll the
    settlement back" — round 9 proved that sentence false and it is not restated.

    **Why the engine-decided branches are sound** — they do not *assume* a NULL
    marker; the marker has **exactly two writers, both engine code, both of which
    now *prove* the policy before writing** (this is what R8-3 fixed — previously it
    was assertion-by-call-site):

    1. `IExternalPreparedMarker.StampAsync` (§4.5), which re-reads the **locked
       queue row's persisted `job_type`** and refuses unless it resolves to a
       `TransferExternalEffectState` registration; and
    2. `RequeueDeadLetterAsync`'s transfer restore (§4.2), which runs on the
       transfer path only and refuses an unregistered `job_type` outright.

    **What that enforces is a property of the *target row*, not of the caller
    (R9-7).** Writer 1 refuses unless **the row being stamped** resolves to a
    `TransferExternalEffectState` registration, reading that `job_type` from the
    database under lock; writer 2 runs only on the transfer path and refuses an
    unregistered type. Neither knows which registration is *calling*, and the design
    no longer says they do. The invariant they deliver is therefore stated in
    target-row terms:

    > **No sanctioned writer can set the marker on a `Standard` or unregistered
    > `job_queue` row.** *Enforcing artefact: guard 2's `SELECT job_type FROM
    > job_queue WHERE id = {jobId} AND lock_token = {token} FOR UPDATE` plus the
    > registry resolution that follows it — both reading the persisted row, neither
    > taking a caller-supplied `job_type`.*

    That is exactly what §4.2 needs, and it is all §4.2 needs: a marker on a
    `Standard`/unregistered row is **not** a state the sanctioned writers can
    produce — which is why §4.2 classifies it as an evidenced `4 Missing` integrity
    failure and not as `None`/`NeverPrepared`. Round 8's stronger sentence ("a
    `Standard` registration cannot reach writer 1") is **withdrawn**: a `Standard`
    handler holding a live `Transfer` job's id *and* that row's current lock token
    would satisfy both guards. That is target-entitlement working as designed — the
    row it stamps is a Transfer row, so no invariant above is violated — and it is
    not caller authentication, which this seam does not implement and no longer
    claims. **Conservative, not convenient:** the
    cheap reading ("`Standard` ⇒ `None`, whatever the marker says") would let an
    unexplained marker license a fresh-bytes requeue, which is the exact licence
    O20 exists to deny.

    **The startup gate covers the descriptor** (gate bullet below): a
    `TransferExternalEffectState` registration with no store descriptor — or a
    `Standard` one that supplies a descriptor or a transfer hook — **fails
    composition**; each descriptor's `TScratch` must resolve in the EF model to a
    mapped entity with a **single `Guid` primary-key property named `JobId`**; and
    each descriptor's probe is **executed once against the live database** at
    composition, so a descriptor whose model shape is wrong, or which names a table
    that is not there, fails the boot rather than the first dead-letter.

    > **Captain-alignment item (R7-1/R8-1) — this changes what Phase 2A-R must build.**
    > `JobRegistration` gains a fourth capability — a **declarative
    > `ExternalStateStore` descriptor**, not a delegate; `JobDeadLetter.FromJob`
    > becomes a pure envelope/lineage factory that **classifies nothing**; the engine
    > gains `ExternalStateClassifier`; the startup gate gains the paired-capability
    > check **and the probe-executes check**; and 2C-R1's three email registrations
    > must each supply a descriptor. §10 carries these into the phase specs. The 633
    > tip's `JobHandlerRegistry` has no such capability and 809's placeholders none
    > either — **no code branch is edited by this document.**
  - **Version-compatibility gate — fail closed at startup, not a post-damage
    warning (C14/F14).** The registry's DLQ-orphan *log warning* is retained
    only as the **observability twin**; the enforcement is a
    `JobRegistryStartupGate` that runs during worker composition (before the
    processor's hosted loop begins claiming) and **refuses to start the worker**
    when compatibility is broken:
    - It queries **both** live tables — `SELECT DISTINCT job_type FROM job_queue`
      **and** `FROM job_dead_letter` — and computes the set of persisted job
      types with **no registered handler**.
    - **Registration-completeness check (R7-1).** In the same gate, over the
      registry itself: every registration's capability set must match its declared
      policy — `TransferExternalEffectState` ⇒ **both** a transfer hook **and** an
      `ExternalStateStore` descriptor; `Standard` ⇒ **neither** (the engine's
      decision function needs nothing from it). A mismatch **throws and the worker
      does not boot**. This is drift fail-fast, not defensive coding: a
      policy-bearing type registered without a descriptor would dead-letter into an
      evidenced `4 Missing` integrity row (§4.2) and silently convert a deploy typo
      into an anomaly alert, long after the deploy.
    - **Descriptor model-shape + probe check (R8-1/R9-3/O24/O27).** For every
      `TransferExternalEffectState` registration the gate does two things. First it
      resolves `TScratch` against the **live EF model** and throws unless the entity
      is mapped and its primary key is **exactly one property, CLR type `Guid`, named
      `JobId`** — §4.5's mandated store shape, proved against model metadata rather
      than assumed. Second it **executes that descriptor's probe once** against the
      live database with a synthetic job id (expecting no row), inside a transaction
      it rolls back, proving the declared store **exists and is queryable** at boot. A
      descriptor whose entity is unmapped or mis-keyed, or which names a
      dropped/renamed table, **fails composition** — turning O27's one honest residue
      into a failed deploy rather than a first-dead-letter surprise.
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

- **Terminal path — one order, two settlement shapes (F5/R6-4/R7-1/O21/O22).**
  `PermanentFailure` or attempts exhausted. Which shape applies is decided by
  **whether a handler was ever reached**, and that is not a nuance: the hook is
  transactional, so a hook that cannot succeed does not merely fail — it rolls the
  settlement back forever.

  **The terminal transaction runs in exactly this order** (R7-1 — classification
  must observe the external state as of the failure, *before* any terminal-hook
  write can touch the type's own store):

  1. **Create the DLQ entity** — `JobDeadLetter.FromJob(job)` copies the envelope
     and lineage only. It **classifies nothing** (it is generic and has no
     type-specific store to consult).
  2. **Classify external state** — the engine's `IExternalStateClassifier` (above)
     decides from the marker + the registration's declared store and **returns** an
     `ExternalStateClassification`; the **engine** validates that triple against the
     CHECK model and applies it to the entity. The classifier proposes, the engine
     disposes — no classification code touches the entity. This runs on **both** settlement
     shapes: it is engine code reading engine state, so it needs no handler
     instance. It must precede step 3 because the hook may write the type's store.
  3. **Run the handler terminal hook** — `OnTerminalFailureAsync`, on the
     handler-reached shape **only**.
  4. **Insert** the DLQ row.
  5. **Write the classification evidence** — see below. **New in round 10 (R10-3);
     without it, nothing wrote the row the rest of the design cites.**
  6. **Fenced-delete** the queue row: `DELETE … WHERE id = {id} AND lock_token =
     {token}`, requiring exactly one affected row (§6).

  All six are **one transaction**. A failure in step **3, 4, 5, or 6** — hook,
  insert, evidence, or a zero-row fenced delete — rolls back the whole settlement
  (F5 semantics, spec-asserted).

  **Step 5 — the classification-evidence writer (R10-3).** Rounds 5–9 asserted a
  "classification-time audit" in six places: the expiry event joins it to preserve
  why status 6 became status 2, §7.2 points operators at it, and §9 demands a spec
  for it. **No step created it.** The classifier returned a triple and the engine
  stamped a column; the audit existed only in prose. Round 10 is right that this is
  the same defect class as the rest — *an asserted property with no artefact* — so
  the writer is now a step:

  - **Owner:** `Infrastructure/Jobs/JobDeadLetterEventWriter.cs`
    (`IJobDeadLetterEventWriter`), engine-owned, created in Phase 2A-R (§10). It is
    the **only** symbol that inserts `job_dead_letter_events` from the terminal
    path; §9's reflection guard fails the build on drift, the same shape as
    `IExternalPreparedMarker`'s.
  - **When it fires:** **only** when the status the engine applied in step 2 is
    `4 Missing` or `6 Unclassified`. `0 None`, `1 Present`, `3 NeverPrepared`, and
    `5 Transferred` are ordinary outcomes with the DLQ row itself as their record;
    an event row for each would be noise, not evidence. *This is a scope choice,
    stated: an operator reconstructing a `1 Present` row's history has the DLQ
    columns, not an event.*
  - **What it writes:** one `job_dead_letter_events` row — `dead_letter_id` = the
    DLQ row inserted at step 4, `event` = `dead_letter.external_state.missing` or
    `…unclassified`, `detected_by = 'classifier'`, `prior_status = NULL` (the DLQ
    row is new; there is no prior), `new_status` = 4 or 6, and the `details`
    contract from §4.2 — including `sqlState` + the sanitized `probeError` on the
    `unclassified` branch, which is why `ClassifyAsync` returns the SQLSTATE in its
    triple rather than discarding it.
  - **Why step 5 and not step 2:** the event's `dead_letter_id` is an FK to a row
    that does not exist until step 4. Writing it earlier would need the id before
    the insert; writing it later than step 6 would put it outside the fenced
    delete's protection. **Atomicity is what matters and it is satisfied either
    way:** DLQ insert, evidence insert, and fenced delete are in one transaction, so
    they commit together or not at all. *Enforcing artefact: one transaction plus
    `fk_job_dead_letter_events_dead_letter` — an event for a DLQ row that rolled
    back cannot exist, because the FK has no referent.*
  - **The savepoint interaction:** step 5 is downstream of the probe. A recoverable
    statement error at step 2 has already been rolled back to the
    `external_state_probe` savepoint, so the transaction is usable and this insert
    commits. That is the whole point of O28's savepoint — **and this step is the
    thing it was protecting all along**, which is precisely why its absence made the
    `6 Unclassified` audit unwritable while the document claimed it existed.

  **Step 2 is the deliberate exception — for recoverable statement errors, which is
  the class that matters (R8-1/R9-1/O25/O28).** The probe runs inside the
  `external_state_probe` **savepoint** specified above, whose mechanics and exact
  exception boundary are stated there once and not repeated here. In terms of this
  order: a **recoverable statement error** is rolled back to the savepoint, stamps
  the evidenced `6 Unclassified` (§4.2), and steps 3–6 then **commit**. The enforcing
  artefact is the **savepoint**, not a `catch` — round 8 claimed this exemption with
  only a `catch` behind it, which PostgreSQL does not honour. An **unrecoverable**
  failure (lost connection, already-aborted transaction) is *not* exempted: it fails
  the settlement like steps 3–6 and follows ordinary lease retry. So the closed class
  is the **deterministic** one — a dropped store table, a mis-pointed descriptor —
  which is the class that loops, because it recurs identically on every re-lease.
  **Not claimed:** "no classification outcome can roll the settlement back". That
  sentence was false and appears nowhere in this document.

  **Why `6 Unclassified` and not `4 Missing` (R9-2/O29).** `Missing` asserts the bytes
  are *proved gone*, and §4.5's sweep believes it — so stamping it on a failed probe
  traded the lease loop for a **privacy violation**: possibly-present
  recipient/body/token bytes selected by neither sweep batch, surviving to the DLQ's
  90 days instead of the mandated seven (O16). `6 Unclassified` records what the
  engine actually knows ("a PREPARE committed; presence unknown"), carries the
  marker-derived window, is **swept exactly like `1 Present`** at that window (§4.5),
  rejects requeue fail-closed, and alerts (§7.2) — a **visible, terminal,
  retention-capped** anomaly rather than a silent `None`, an invisible spin, or a
  seven-day cap that quietly became ninety.

  - **Handler-reached settlement (the normal case).** The payload validated and a
    handler instance ran, so step 3 fires (§5.4 uses it for
    `email_log(PermanentlyFailed)`).
  - **Invalid-before-handler settlement: DLQ-only, no hook (R6-4/O21).** When the
    failure *is* that no handler could be reached — unknown `job_type`,
    `JsonException`, or a payload rejected by the registration's
    `ValidatePayloadJson` — there is **no handler instance and no `JobContext`**,
    so the engine **skips step 3 entirely**. Steps 1–2, 4, and 6 still run; **step
    5 does not fire either**, and that is the rule rather than an omission — it
    fires only for `4 Missing`/`6 Unclassified`, and this path classifies
    `3 NeverPrepared`, whose record is the DLQ row itself. Step 2 here is
    **pure engine code that touches no store on this path**: the marker is NULL by
    construction (nothing ran to set it), and §4.2's table decides `3 NeverPrepared`
    from the marker alone — **no probe is run and no registration code exists to
    invoke**, so there is nothing here that could parse the malformed payload,
    throw, or roll the settlement back. An unknown `job_type` has no registration at
    all and takes the same NULL-marker branch. **No `email_log` row is written**,
    and none is owed: `email_log` records what happened to a *recipient*, and this
    job never determined one.

  This is a correctness requirement, not a simplification. `email_log.recipient`
  is `NOT NULL` (§4.4) and the email hook reloads the recipient from the payload's
  ids — so if a malformed/missing-id payload could reach the hook, the hook would
  throw, the transactional rollback above would revive the job, and it would
  dead-letter and roll back again on every lease expiry: **an infinite lease loop**
  (this system has shipped one of those and fixed it — #810). Neither escape is
  taken: **no placeholder address is invented** (a fabricated recipient in a
  delivery-audit table is a lie in the exact table support reads), and the
  `NOT NULL` **is not relaxed** (it is what makes every `email_log` row mean
  something). Rule stated once here; §5.4's hook cites it.

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
  - **Backstop: transform `LogEvent.Exception` before every durable sink
    (R2-8/R3-5/O13).** Serilog destructuring policies do **not** sanitize the
    special `LogEvent.Exception` object rendered by console/file sinks, so no
    destructurer is claimed. Instead both configured sinks are wrapped by one
    `SanitizingLogEventSink`. Its `Emit` method constructs a replacement
    `LogEvent` with `Exception = null`, preserves the safe structured properties,
    and adds only `exception_type`, sanitized/bounded `exception_message`, and
    safe stack-frame metadata produced by `JobErrorSanitizer`. The wrapper then
    forwards that replacement event to the real console or file sink. Logger
    startup exposes **no direct console/file sink path** around the wrapper; a
    configuration spec enumerates the sink graph and fails if one is added.
    This boundary handles naïve `_logger.LogError(ex, ...)` calls anywhere in the
    process without relying on call-site discipline.

  Between the durable-column boundary and the logging boundary, payload JSON,
  tokens, and provider response bodies cannot reach `last_error` **or** a log sink
  even when a handler naïvely stuffs them into a reason string or throws them in an
  exception message. A spec (`JobErrorSanitizer.Spec.cs`, §9) asserts email/token
  redaction and the 2 KB bound on adversarial inputs. It boots the **actual
  configured console and file pipelines**, logs an exception carrying unique
  email/token canaries, reads both rendered outputs, and asserts the canaries and
  raw exception message are absent while sanitized metadata remains.

  > **Known code-alignment item (R2-8, captain's reconciliation round).** The 633
  > processor currently passes the raw `failure` exception to `LogWarning`/
  > `LogError`. This document specifies the redacted-logging contract above (safe
  > `Describe` + stack metadata + sink-boundary replacement); aligning the 633 log
  > calls and replacing the ineffective destructuring claim with the sink wrapper
  > are code-reconciliation items, not doc defects.

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
| `SyncSystemJobsJob` | 60 s | Reconcile `system_job_definitions` (enabled, non-deleted, **catalog-known**) into the leader's live scheduler — add/**replace**/remove cron triggers so dashboard edits take effect within ~60 s (#636); stamps `job_key` + `schedule_epoch` into each trigger's `JobDataMap` and replaces (never mutates) a trigger whose epoch changed (R5-1/R6-1); skip+warn on catalog-unknown or invalid-cron rows (C4). |
| `EnqueueSystemJobJob` | (per trigger) | **The generic dispatcher fired by every dynamic system-job trigger (C4).** Locks the definition row, rejects a superseded/disabled/deleted fire on the **epoch** fence (R5-1/R6-1), resolves the trigger's `job_key` → `SystemJobCatalog` entry, then enqueues the mapped versioned job **exclusively through `IJobEnqueuer`** with a scheduled-occurrence idempotency key; stamps `last_enqueued_at`. The leader only *enqueues*; any worker runs the work. |
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
- **Every dynamic `CronTrigger` disables Quartz catch-up (R4-2).**
  `SyncSystemJobsJob` constructs it with
  `WithCronSchedule(cronExpression, x => x.InTimeZone(timeZone)
  .WithMisfireHandlingInstructionDoNothing())`. Quartz therefore skips a live
  misfire caused by thread starvation or a paused scheduler; it never injects a
  `FireOnceNow` occurrence behind the durable policy's back. The durable
  reconciliation transaction is the **sole catch-up authority** for both
  `DropOnGap` and `CatchUp = AtMost(n)`.
- **`EnqueueSystemJobJob`** is the single Quartz job type every dynamic trigger
  fires (wired by `SyncSystemJobsJob`, which stamps **`job_key` and the
  definition's current `schedule_epoch`** into the trigger's `JobDataMap` —
  R6-1/O18, §4.3). On fire it, **in one transaction, in this order**:
  1. **Lock the definition first** —
     `SELECT id, is_enabled, schedule_epoch
      FROM system_job_definitions
      WHERE job_key = {jobDataMap.job_key} AND is_deleted = false
      FOR UPDATE`. A vanished/soft-deleted definition yields zero rows → no-op
     (see below). This lock, taken **before** any occurrence write, is what makes
     the delivery path share reconciliation's definition-first order (§4.3/§4).
  2. **Fence on the epoch** — require `is_enabled = true` **and**
     `schedule_epoch = {jobDataMap.schedule_epoch}` **exactly**. A mismatch means
     the trigger was built by a registration that has since been retired — by a
     cron/timezone/gap-policy revision, by a disable→enable cycle, or by a
     delete/recreate — **including** when the current policy is textually
     identical to the one that built it (§4.3: policy equality is not epoch
     identity). The fingerprint is **not** consulted here; it is the detector that
     tells `SyncSystemJobsJob` when to re-register, not the fence.
  3. Compute `scheduled_fire_at` (the trigger's *scheduled* fire time, quantized
     to cron granularity — Quartz exposes this on the fire context, distinct from
     "now"), `INSERT INTO system_job_occurrences (job_key, scheduled_fire_at) …
     ON CONFLICT DO NOTHING`, and **only if that inserted a row** call
     `IJobEnqueuer.EnqueueAsync(entry.Definition, entry.PayloadFactory(scheduled_fire_at), …)`,
     record `enqueued_job_id`, and stamp `last_enqueued_at` on the row already
     locked in step 1; then commit.

  It never constructs `JobQueueItem` directly — the `JobEnqueueBoundary` spec
  (§9) asserts `Infrastructure/Jobs/Quartz` holds no direct-write of the entity.
- **A superseded fire is a normal no-op, not an error (R5-1/O18).** When step 1
  or 2 rejects, `EnqueueSystemJobJob` **commits an empty transaction and returns
  successfully**: it does not throw, does not retry, does not enqueue, and does
  not dead-letter. This is the expected steady-state outcome of editing a cron —
  a superseded trigger firing inside the ≤60 s sync window is *routine*, and
  treating it as a failure would page an operator for a working system.
  Reconciliation owns whatever catch-up the new schedule's policy calls for
  (§4.3), so nothing is lost by dropping the fire. The job logs **one structured
  event at information** — `system_job.fire_rejected` with `job_key`,
  `scheduled_fire_at`, `trigger_epoch`, `definition_epoch`, and
  `reason` ∈ { `superseded-schedule`, `disabled`, `definition-deleted` } — and
  increments the `jobs.system_job_fire_rejected` counter tagged by `reason`
  (§7.2). Sustained `superseded-schedule` beyond one sync interval means
  `SyncSystemJobsJob` has stopped replacing triggers, which the existing
  `last_sync_at` staleness alert (§7.2) already covers.
- **Scheduled-occurrence idempotency is durable across queue deletion
  (C4/F13/R2-1).** The retained-window
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
- **Missed-occurrence semantics — durable-derived, prune-safe high-watermark,
  explicit drop-on-gap default (R2-1/R3-1).** The round-1
  "fire-once-then-resume" phrasing was wrong: a RAM job
  store has **no memory of ticks missed while no scheduler existed**, so it cannot
  provide catch-up. The durable ledger plus definition high-watermark are the
  memory. On leader acquisition (and each `SyncSystemJobsJob` pass),
  reconciliation derives missed occurrences only inside the definition's locked
  `(reconciled_through, cutoff]` interval (§4.3), using the ledger to suppress
  already-enqueued ticks inside that interval. The **default gap policy is
  DROP-ON-GAP**: missed
  ticks are **not** back-filled — recurring sweeps are idempotent and
  state-reconciling (a `session-cleanup` that missed three ticks needs one run on
  current state, not three), so the next scheduled fire covers reality. An entry
  may **opt into bounded catch-up** (`CatchUp = AtMost(n)`): reconciliation
  enqueues at most the `n` most-recent missed occurrences, deliberately drops
  older misses in the interval, then advances
  `reconciled_through = GREATEST(reconciled_through, cutoff)` in the same
  transaction. No later pass inspects at/below that bound, even after
  occurrence retention prunes those rows. The policy is a per-catalog-entry
  field, so the choice is explicit and inspectable, never implicit RAM-store
  behavior.
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
  delayed duplicate occurrence enqueues nothing (ledger PK); prune then
  reconcile twice never resurrects an occurrence at/below the high-watermark;
  sparse cron never regresses the watermark; cron edit and disable beyond
  retention then re-enable both reset to database `now()` and never back-fill;
  a live scheduler paused beyond a fire time uses
  `WithMisfireHandlingInstructionDoNothing()` and enqueues nothing until the
  durable reconciliation policy runs;
  **a committed cron edit followed by a forced fire of the retained old trigger
  writes no occurrence and no job (epoch fence)**; **`A → B → A`, disable→enable,
  and delete/recreate each reject a delayed execution from the retired epoch even
  though the policy is textually identical again (ABA)**; **a live fire racing
  reconciliation on one definition neither deadlocks nor loses an occurrence
  (definition-first lock order)**;
  catalog→handler
  closure fails the startup gate when a definition has no handler;
  `EnqueueSystemJobJob` routes only through `IJobEnqueuer`.

> **Known code-alignment item (R4-2, captain's reconciliation round).** The
> current `feat/634-app-role-quartz` line uses the default
> `WithCronSchedule(cronExpression)`, whose smart misfire policy may fire once
> immediately. Replacing it with
> `WithMisfireHandlingInstructionDoNothing()` on every dynamic cron trigger and
> adding the live-scheduler pause/misfire spec are Phase-2B alignment work; this
> document makes no code-branch edit.

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
     An unlocked pre-check for a committed `email_prepared_sends` row (row existence
     is the commit proof — §4.5) decides whether to enter this step at all; it is an
     optimization and is **not** authoritative — the authoritative re-check happens
     under the lock, inside the transaction. Open transaction A, take the domain row
     lock (`SELECT … FOR UPDATE`), do a fresh eligibility read (ineligible → the
     CancelledIneligible path in step 3, in this same transaction), **render the
     request from the locked-fresh state**, and serialize it to `request_body` via
     the provider **transport** serializer (§4.5 — *not* `JobJson`). The scratch
     insert, the `job_queue.external_prepared_at` marker write, and their
     fencing/rowcount conditions are **§4.5's fenced-PREPARE contract, stated there
     and not repeated here** (R7-2/O23): one transaction, the marker taking the
     scratch row's own `prepared_at`, the queue update conditioned on `lock_token`,
     exactly one affected row or a full rollback. Commit A. The bytes are now
     durable *before* the provider is ever called, so any later crash resends stored
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
  `OnTerminalFailureAsync` writes `email_log(PermanentlyFailed)` with the last
  classified error when the engine dead-letters the job and **retains** the
  prepared-send row for the external-effect requeue transfer (§4.2/R3-2). It runs
  **only on the handler-reached settlement path**; a job whose payload never
  validated settles DLQ-only with no hook and no `email_log` row, exactly as §5.1
  specifies (R6-4/O21) — which is what keeps this hook's unconditional
  `email_log(PermanentlyFailed)` write, and `email_log.recipient`'s `NOT NULL`,
  both safe. **The hook does not stamp the DLQ row's prepared-state evidence — the
  engine's `ExternalStateClassifier` does** (R7-1/R8-1/O22/O24), earlier in
  the **same terminal transaction** and on **both** settlement shapes (§5.1's
  six-step order). The email registration therefore supplies **two** external-effect
  capabilities beside its handler factory, at two different moments and in two
  different forms: the **`ExternalStateStore` descriptor** — *declared data* (a
  `TimeSpan` and a scratch type argument, R9-3/O27), from
  which the engine builds the dead-letter probe of `email_prepared_sends` to produce
  §4.2's `1 Present` / `4 Missing` / `3 NeverPrepared` / `6 Unclassified` (the email
  registration supplies no classification code, so nothing of its own can parse the
  payload); and
  the `TransferExternalEffectState` **hook** — a delegate, which moves the bytes at
  requeue (§4.2). What
  the hook still owns at terminal is the `email_log(PermanentlyFailed)` write and
  **retaining** the prepared-send row for that later transfer. Retention then ends the
  prepared bytes at `external_state_expires_at`, **not** when DLQ lineage
  disappears: the sweep deletes them and stamps `2 (Expired)` in one statement
  (§4.5), while the DLQ audit row survives to the full
  `JOB_DEAD_LETTER_RETENTION_DAYS`. (The earlier "delete only after both queue and
  DLQ lineage are gone" rule was the pre-O16 policy and is superseded — it would
  hold token-bearing bytes for the DLQ's 90 days.)

  > ⚠️ **CAPTAIN-ALIGNMENT ITEM — a suspected LIVE DEFECT on `origin/feat/809-email-jobs-fold`,
  > not merely a doc gap (R6-4).** Everything above is the *design's* rule. The
  > hazard it forecloses looks reachable on the shipped 2C branch **today**: if
  > that branch's engine invokes the terminal hook on *every* terminal path
  > (including a payload that never validated) while the email hook writes
  > `email_log(PermanentlyFailed)` and `email_log.recipient` is `NOT NULL`, then a
  > malformed/missing-id payload makes the hook throw, the transactional terminal
  > settlement roll back, and the job re-lease → re-fail → roll back **forever** —
  > the same infinite-loop class as #810. This document makes **no code-branch
  > edit**; the captain must verify the 809 tip against §5.1's two settlement
  > shapes directly. Flagged here rather than filed silently because the
  > difference between "doc gap" and "shipped bug" changes who must act and when.

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
  (success delete, retry requeue, DLQ move, renewal, shutdown release, **and the
  PREPARE marker write** — §4.5) is
  **conditioned on that token** with an affected-row-count check; zero rows =
  lease lost = the outcome is discarded and the handler's token cancelled. The
  PREPARE case is the strictest: zero rows rolls back its **whole** transaction,
  scratch insert included, so a stale owner cannot leave orphan external state
  behind (R7-2/§4.5). A
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
  `PermanentFailure`), the engine classifies external state, copies the **full
  envelope** to `job_dead_letter`, and deletes the queue row — one transaction,
  conditioned on the fencing token; a **hook, insert, or fenced-delete** failure
  rolls back the whole terminal step. **Classification is the one step exempted, and
  only for recoverable statement errors** (R8-1/R9-1/O25/O28): the probe runs inside
  a **savepoint**, so a statement error is rolled back **to the savepoint** — leaving
  the terminal transaction usable — stamps the evidenced `6 Unclassified`, and the
  settlement commits. That is what closes the *deterministic* probe-failure loop
  (§5.1). An unrecoverable failure (lost connection, already-aborted transaction) is
  **not** converted: it fails the settlement like any other step and follows ordinary
  lease retry. `OnTerminalFailureAsync` is invoked on **handler-reached
  terminal paths only**. Failures where no handler could be reached — unknown
  `job_type`, `JsonException`, a payload rejected by `ValidatePayloadJson` —
  settle **DLQ-only with no hook** and, for email types, **no `email_log` row**
  (R6-4/O21); §5.1's terminal path is the full order for both shapes. Manual
  redelivery is the dashboard's server-side requeue (§4.2 contract); there is no
  keep-terminal-rows-in-queue special case for any job type.
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
| `jobs.claimed`, `jobs.succeeded`, `jobs.retried`, `jobs.dead_lettered`, `jobs.cancelled`, `jobs.lease_lost` | counters | `instance`, `job_type` | per-replica |
| `jobs.handler_duration` | histogram | `instance`, `job_type`, `outcome` | per-replica |
| `jobs.attempts_at_terminal` | histogram | `instance`, `job_type` | per-replica |
| `jobs.last_success_at` | gauge (unix ts) | `instance`, `job_type` | per-replica |
| `jobs.listener_connected` | gauge (0/1) | `instance` | per-replica (§5.5 listener) |
| `jobs.listener_reconnects` | counter | `instance` | per-replica |
| `jobs.listener_last_catchup_at` | gauge (unix ts) | `instance` | per-replica |
| `email.submit_failures` | counter | `instance`, `kind`, `transient\|permanent` | per-replica |
| `scheduler.is_leader` | gauge (0/1) | `instance` | per-replica (only leader = 1) |
| `scheduler.leader_present` | gauge (0/1) | `instance` | per-replica; **1 iff this replica sees a live leader** (advisory-lock probe) — the leader-absence alert (R2-10) |
| `scheduler.last_sync_at` | gauge (unix ts) | `instance` | leader emits; **staleness alert** if no update within 2× sync interval (R2-10) |
| `scheduler.sync_failures` | counter | `instance` | leader emits |
| `scheduler.last_trigger_fire_at` | gauge (unix ts) | `instance`, `job_key` | leader emits |

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

`instance` is the worker's stable runtime replica id (the same value used for
`locked_by`) and is attached at instrument creation/emission for **every** row in
the table above. Leader presence is observed without attempting or perturbing
the lock. For the single-bigint `SCHEDULER_LEADER_LOCK_KEY`, each replica runs
this exact `pg_locks` query (PostgreSQL represents the high/low 32-bit halves as
`classid`/`objid`, with `objsubid = 1` for the bigint form):

```sql
SELECT EXISTS (
    SELECT 1
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND classid = (({lockKey}::bigint >> 32) & 4294967295)::oid
      AND objid = ({lockKey}::bigint & 4294967295)::oid
      AND objsubid = 1
      AND granted
) AS leader_present;
```

This is a catalog read, never `pg_try_advisory_lock`, so the monitor cannot
momentarily acquire leadership or interfere with the scheduler connection.

### 7.2 Sampled gauges — `JobQueueMonitorService` (Phase 3)

A cheap **per-replica, instance-tagged** sampler (`JobQueueMonitorService`, 60 s
— runs on **every** worker, **not** leader-gated, so queue health is still
sampled when no leader exists — R2-10): `due_depth` (pending & due, split by
priority class), `oldest_due_age_seconds` (per priority class — the F22 fairness
tripwire), `processing_over_lease_count` (should be ~0; sustained >0 means reclaim
is broken), `dlq_size` + `dlq_growth_1h`, `email_log_failures_1h`, `job_queue`
dead-tuple count from `pg_stat_user_tables` (autovacuum health, F21), and
**`dlq_external_state_missing`** — a **sampled count of durable rows**
(`SELECT count(*) FROM job_dead_letter WHERE external_state_status = 4`, served by
`ix_job_dead_letter_external_state`), the §4.2 integrity anomaly — and
**`dlq_external_state_unclassified`** (the same count for
`external_state_status = 6`, same index), the §4.2 probe-failure anomaly (R9-2/O29),
and **`dlq_prepared_state_overdue_seconds`** (the sweep-lag signal defined below —
R10-2).
The first two are **separate gauges, not one sum**, because they page differently: a
`Missing` burst means bytes vanished outside the sweep, while an `Unclassified`
burst means the **store is unreachable** — typically one dropped/renamed table
affecting every settlement at once — and points at a migration, not at a data-loss
incident. Both are sampled
from the table, **not** an in-process counter incremented once by the detecting
path (R6-4): the status commit and the metric emission are separate events, so a
crash or a restart between them would lose the only record that an anomaly was
ever seen — while the row itself is durable and every replica can re-observe it.
The detecting paths still log the event, but the **alert reads the table**. One
counter remains genuinely in-process because it has no durable row to sample:
`jobs.system_job_fire_rejected` (tagged `reason` — a superseded/disabled trigger
fire, §5.3/R5-1), whose loss costs a diagnostic, not an integrity signal. These
are
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
2× interval** — R2-10) log at
**warning** and increment a metric — telemetry the
Phase-3 alert route (§7) consumes; the warning log is **not itself** a pager.

**Prepared-state conditions — the full set, each with a route (R10-2/R10-4).**
Round 10 found `dlq_external_state_unclassified` sampled but **absent from the
warning-condition list**, which is where Phase 3's leased webhook path picks
breaches up: a gauge with no condition key produces no severity, no persistence
rule, no lease window, and **no notification**. A fleet-wide store outage could
accumulate status-6 rows without the page the design promised. All three
conditions below are therefore defined at the same grade as the rest, and each
carries the `condition_key` the `job_alert_delivery_leases` table keys on:

| Condition | `condition_key` | Severity / persistence | Aggregation | Recovery | Message |
| --- | --- | --- | --- | --- | --- |
| `dlq_external_state_missing > 0` | `jobs.dlq.external_state_missing` | **warning**; an **integrity anomaly, not a threshold** — it re-breaches on **every** 60 s sample while any row remains, so it **stays alerting until the rows are triaged** rather than firing once (R5-2/R6-4) | **fleet-wide** — `instance` excluded from the key (the count is a whole-queue fact identical from any replica); the lease collapses N replicas to one notification per 5-min window | when the count returns to 0 | "N dead-letter rows report prepared bytes **proved absent** outside the retention policy — data loss or out-of-band deletion. Inspect `job_dead_letter_events` for `dead_letter.external_state.missing` (`reason` distinguishes probe-absent from a marker on a `Standard`/unregistered row)." |
| `dlq_external_state_unclassified > 0` | `jobs.dlq.external_state_unclassified` | **warning**; same anomaly semantics — re-breaches every sample, stays alerting until triaged. **Deliberately a separate route from `Missing`, not a summed gauge:** they page differently and a responder's *first action* differs — `Missing` opens a data-loss investigation, `Unclassified` sends you to look at a **migration** | **fleet-wide**, same rule | when the count returns to 0 | "N dead-letter rows could not classify their prepared state — **the store was unreachable**, typically one dropped/renamed table or a revoked grant affecting every settlement at once. `job_dead_letter_events.details.sqlState` names the failure. **These rows do not self-resolve** (§4.5/K-1) and their bytes are deleted at the recorded cutoff whether or not anyone establishes they existed (O29)." |
| `dlq_prepared_state_overdue_seconds > EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES × 60` | `jobs.prepared_state.sweep_overdue` | **warning**; persists while the lag exceeds the threshold. **This is R10-2's exposure of the eligible-vs-deleted gap.** It does not bound the gap — it makes it visible | **fleet-wide**, same rule | when the oldest overdue age falls back under the threshold (i.e. the sweep caught up) | "Prepared bytes have been **eligible for deletion for N minutes** and are still on disk — the `email-prepared-sends-retention` sweep is lagging, failed, or not scheduled. The seven-day privacy cap (O16) is **not being met** for these rows right now." |

The overdue gauge is **`dlq_prepared_state_overdue_seconds`** — the age of the
oldest row satisfying `external_state_status IN (1, 6) AND
external_state_expires_at <= now()`, i.e. `EXTRACT(EPOCH FROM (now() -
min(external_state_expires_at)))` over that predicate, served by
`ix_job_dead_letter_external_state` and **0 when no row is overdue**. It samples
the same durable table as the other two (R6-4's rule: the alert reads the table,
never an in-process counter), and it is deliberately **a property of the rows, not
of the sweep** — a last-success timestamp on the sweep job would go stale for
benign reasons (nothing due) and would not notice a sweep that runs and silently
fails to progress. **What it cannot do:** it cannot fire if the *monitor* is also
down, and it does not distinguish "sweep broken" from "sweep not yet scheduled".
See §11 "Known open items", **K-3**.

**At-least-once alert delivery with a condition/window lease
(R3-6/R4-5/O17).** Phase 3 adds
the pure-Postgres `job_alert_delivery_leases` table; the webhook sink is only the
transport and never performs deduplication itself:

```sql
CREATE TABLE job_alert_delivery_leases (
    condition_key       text        NOT NULL,
    window_started_at   timestamptz NOT NULL,
    lease_until         timestamptz NOT NULL,
    owner_instance      text        NOT NULL,
    notification_sent_at timestamptz NULL,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_job_alert_delivery_leases
        PRIMARY KEY (condition_key, window_started_at)
);

-- The PK leads with condition_key, so it cannot serve a global age sweep — a
-- retention scan by window_started_at alone would seq-scan the whole table
-- (R5-3). This index leads with the sweep's predicate column.
CREATE INDEX ix_job_alert_delivery_leases_window_started_at
    ON job_alert_delivery_leases (window_started_at);
```

All replicas derive the same five-minute `window_started_at` with database
`date_bin('5 minutes', now(), '2000-01-01'::timestamptz)`. Before delivery a
replica executes one `INSERT … ON CONFLICT … DO UPDATE` whose update is allowed
only when `notification_sent_at IS NULL AND lease_until <= now()`, setting a
60-second `lease_until` and its `owner_instance`, and proceeds only when
`RETURNING` yields the row. On successful webhook response it sets
`notification_sent_at = now()` conditioned on the same owner; on a definite
failure it expires the lease immediately for retry. The webhook request also
carries the stable idempotency key `{condition_key}:{window_started_at}` as a
**best-effort receiver hint**, not a v1 exactly-once guarantee. If the receiver
accepts and the worker crashes or times out before committing
`notification_sent_at`, the lease expires and another replica retries; the
receiver may render a duplicate unless it contractually honors that key. Thus
the lease prevents concurrent sends and bounds duplicates to ambiguous-response
or lease-expiry races, while delivery remains honestly **at least once**. The
table accrues one row per breached condition per five-minute window, so it needs
a real retention job, not a claim: the `job-alert-lease-retention` sweep (§7.3)
deletes rows with `window_started_at < now() - JOB_ALERT_LEASE_RETENTION_DAYS`
(default 30; §3.1/O7) through
`ix_job_alert_delivery_leases_window_started_at`, in the same ordered-batch /
`SKIP LOCKED` shape as the other retention sweeps. The window is
comfortably longer than the 60-second lease, so the sweep can never delete a live
lease; it is named in §7.3's inventory and in Phase 3's build order. Condition keys exclude
`instance` for fleet-wide facts (leader absence, queue depth) and include it for
replica-local faults (listener disconnected), which makes the aggregation rule
explicit rather than an assertion. The Phase-3 gate starts N worker monitors on
one breached fleet-wide condition and proves only the lease winner attempts
delivery while the lease is live; an accept-without-local-commit case then
proves a retry occurs after expiry and records that a duplicate is permitted. It
separately drops the scheduler lock and proves leader absence remains observable
and attempts delivery through the same at-least-once path.

### 7.3 Operational jobs (Phase 3)

Retention sweeps run as ordinary system jobs (dashboard-visible, #636):
`email-log-retention` (delete rows older than `EMAIL_LOG_RETENTION_DAYS`,
batched), `job-dead-letter-retention` (`JOB_DEAD_LETTER_RETENTION_DAYS`, **and
ineligible for any row with `external_state_status IN (1, 6)` — R10-1, §4.2: it may
not delete the row that protects possibly-present prepared bytes; the row's events
cascade with it**),
`email-prepared-sends-retention` (**bounded live-state policy, C1/R4-3/R4-6/R6-2**:
protect when `job_queue.id = email_prepared_sends.job_id`; protect a DLQ-only row
only until that DLQ row's **recorded** `external_state_expires_at`, matched on
`job_dead_letter.original_job_id = email_prepared_sends.job_id` and selected for
**every** bytes-possible status — `external_state_status IN (1, 6)`, R9-2/O29 — the boundary is
read, never recomputed from the current env var, so the sweep and requeue enforce
the same instant (§4.2/§4.5); delete an unmatched orphan after the
`EMAIL_PREPARED_SEND_RETENTION_DAYS` age floor — default 7, never a hardcoded
value; delete expired DLQ prepared state even though its 90-day audit row
remains), and
`system-job-occurrence-retention`
(prune `system_job_occurrences` older than `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS`
— default 30; R2-1/O9), and `job-alert-lease-retention`
(prune `job_alert_delivery_leases` whose `window_started_at` is older than
`JOB_ALERT_LEASE_RETENTION_DAYS` — default 30; §7.2/O7/R5-3). The prune never changes
`system_job_definitions.reconciled_through`; reconciliation never inspects at or
below that durable bound, so a pruned occurrence cannot be resurrected
(R3-1/O10).

**Shared sweep shape (all five retention jobs).** Each sweep selects its next
batch through **an index leading with its own retention predicate**, **ordered by
that column**, `LIMIT` the batch size, `FOR UPDATE SKIP LOCKED` on the **first
row of its lock order** (§4), deletes that batch in one statement, and loops until
a short batch. No sweep takes a table-wide lock, and none scans without an index.
`email-prepared-sends-retention` is the one sweep with **three** batches, because
its DLQ-driven batches are keyed off a boundary stored on the *other* table:

| Sweep | Predicate | Index (all lead with the age column) |
| --- | --- | --- |
| `email-log-retention` | `occurred_at` | `ix_email_log_occurred_at` (§4.4) |
| `job-dead-letter-retention` | `failed_at`, **`AND external_state_status NOT IN (1, 6)`** (R10-1) | `ix_job_dead_letter_failed_at` (§4.2) — leads with `failed_at`; the status test is an **index-scan filter**, deliberately: the exempt rows are a small minority, and a partial index would have to be rebuilt whenever the exempt set changes |
| `email-prepared-sends-retention` — DLQ-expiry batch | `job_dead_letter.external_state_expires_at` (the **recorded** boundary, R6-2) for `external_state_status IN (1, 6)` (R9-2), **bytes present** | `ix_job_dead_letter_external_state` (§4.2 — `(external_state_status, external_state_expires_at)`: the `IN` list is two index scans over the leading column, each with the range on the second — still an index scan, not a filter) |
| `email-prepared-sends-retention` — **resolution batch (R10-7/R10-1)** | the same recorded boundary for `external_state_status = 1`, **bytes absent** → stamp `4 Missing` | `ix_job_dead_letter_external_state` — one index scan (a single leading value plus the range) |
| `email-prepared-sends-retention` — orphan batch | `prepared_at` (**the current env var — the one retroactive boundary in the design, §4.5**) | `ix_email_prepared_sends_prepared_at` (§4.5) |
| `system-job-occurrence-retention` | `scheduled_fire_at` | `ix_system_job_occurrences_scheduled_fire_at` (§4.3) |
| `job-alert-lease-retention` | `window_started_at` | `ix_job_alert_delivery_leases_window_started_at` (§7.2) |

`job-alert-lease-retention` uses exactly this idiom, not a new one (§4.5's SQL is
the worked example, since the prepared-send sweep is the only one that must also
stamp a second table). Three of these indexes are **added by R5-3**:
`ix_email_log_occurred_at`, `ix_job_dead_letter_failed_at`, and
`ix_email_prepared_sends_prepared_at`. The pre-existing composite indexes on those
tables lead with `kind`/`recipient`/`job_type` or are the `job_id` PK, so none of
them could serve a global age sweep — the same defect R5-3 identified in
`job_alert_delivery_leases`' `(condition_key, window_started_at)` PK. Fixing one
table and leaving three identical gaps would have made "the existing sweep idiom"
a phrase with no index behind it.

**Sweep recurrence, and what it does and does not guarantee (R10-2).** These are
periodic system jobs: a row becomes **eligible** at its predicate, and its bytes go
on the **first successful pass at or after** that moment. Concrete cron defaults
for the Phase-3 catalog are a **Phase-3 build-spec item** (see the scope note at
the head of this document) and are deliberately not invented here — but the
*shape* of the promise is fixed now, because getting it wrong is what R10-2
caught: **`email-prepared-sends-retention` must run on a cadence materially
shorter than `EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES` (default 60), and nothing in
this design enforces that.** The cadence is a cron string in a table an operator
can edit or disable (§4.3). What *is* specified is the detection: exceed the lag
and `jobs.prepared_state.sweep_overdue` (§7.2) warns, naming the rows. **Eligible
is enforced by SQL; deleted is enforced by the sweep actually running.** §11
"Known open items", **K-3**.

**The prepared-send sweep records expiry durably, not just in its logs
(R5-2/O19).** Its §4.5 statement deletes the bytes, stamps the matching DLQ row
`external_state_status = 2 (Expired)` + `external_state_expired_at`, and writes
its `job_dead_letter_events` row **atomically**. The staff dashboard and `RequeueDeadLetterAsync`
then read that stored status — rendering **non-requeueable: prepared state
expired** and pointing authorized staff to the audited new-logical-send operation
(O16) — instead of inferring expiry from a missing row. A previous revision had
the sweep merely "report the affected DLQ ids"; log output is not state a later
dashboard request can query, and it left expiry indistinguishable from loss.
Autovacuum storage parameters for `job_queue` ship in the
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
    `JobQueueMonitorService.cs` (Phase 3), `ExternalStateProbeErrors.cs` (the
    probe's recovery allowlist — R10-5), `JobDeadLetterEventWriter.cs` (the
    engine's actor-less evidence writer — R10-3/O30)
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
  occurrence ledger — R2-1) and **`JobDeadLetterEvent.cs`** (the engine's
  actor-less external-state evidence rows — R10-3/O30; it lives here rather than in
  `Modules/AuditLogs/` precisely because it is **not** an `AuditLog`: `audit_logs`
  is user-attributed by its `NOT NULL` `user_id` FK and these rows have no user,
  §4.2). (Rationale: entities live in modules by convention;
  the *behavior* lives in `Infrastructure/Jobs/`. `Modules/Jobs` is the entity/enum
  home, plus `Modules/Jobs/Seeders/SystemJobSeeder.cs` — C4 — which seeds one
  `system_job_definitions` row per shipped `SystemJobCatalog` entry.) Writes to
  `JobQueueItem` outside `Infrastructure/Jobs` are forbidden and spec-guarded
  (F15, §9). The unified **`JobRegistration`** (handler factory + type-erased
  `ValidatePayloadJson` + per-type requeue state-transfer policy/hook **+ the
  declarative `ExternalStateStore` descriptor that the engine's terminal
  external-state classifier probes** — R2-7/R3-2/R7-1/R8-1/O22/O24)
  and the byte-faithful `SendPreparedAsync` transport
  (R2-2, in `Infrastructure/Messaging/Email`) are behavior, so they live in
  `Infrastructure/`, not here. **`IExternalPreparedMarker`** (§4.5) is engine
  behavior too and lives beside them — it is the only sanctioned writer of
  `job_queue.external_prepared_at`.
- **`EmailLog` home — `Modules/Messaging/` (O5's module, repurposed).** The
  single-lane ruling removes the `EmailOutbox` entity O5 created this module
  for, but the *reason* for a neutral messaging module survives: `email_log` is
  a cross-domain record (invitations + auth today, more kinds later) that
  belongs to no single domain — the same shape as `Modules/AuditLogs`. So:
  `Modules/Messaging/Entities/EmailLog.cs` + `EmailPreparedSend.cs`, the shared
  `EmailKind` / `EmailLogOutcome` enums, and a small `[Service]`
  `Modules/Messaging/Services/EmailLogWriter.cs` the handlers call. The
  alternative — parking these under `Modules/Jobs` — is rejected because they
  are not engine tables: **the generic engine has no direct table coupling to
  them** — no engine file names `email_log` or `email_prepared_sends` — while
  **registered type-specific delegates and descriptors do**: the email handlers
  read and write both, and the engine's terminal classifier probes
  `email_prepared_sends` **only** through the `ExternalStateStore` descriptor 2C
  declares on its registrations (§5.1/O24), never through a compile-time reference.
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
  (Session lives in `Modules/Auth/Entities`), exports (#213/#286) →
  `Modules/AuditLogs/Jobs/` and `Modules/Tenants/Jobs/`. Each implements
  `IJobHandler`. This keeps the engine domain-agnostic and each job's business
  logic inside its slice. Invitation expiration (#425) has no handler or sweep;
  it is derived at read time (see §11, O32/#425 ruling).
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
| **invalid-before-handler settlement (R6-4/R7-1/O21/O22)** | an `email.*` job with a malformed / missing-id payload (a type whose registered hook writes `email_log(PermanentlyFailed)` against a `NOT NULL` recipient) reaches terminal: **no hook is invoked**, yet the row **is still classified and stamped** — by the engine, from the NULL marker alone, with **no probe run and no registration code invoked**, proving classification is not a handler and cannot touch the malformed payload — exactly one `job_dead_letter` row exists with `external_state_status = 3 NeverPrepared`, **zero `email_log` rows** exist for that `job_id`, and the queue row is gone. The **loop regression is the point**: drive the engine's claim/settle cycle repeatedly past the lease and assert the job settles **once** and never re-appears as `Pending` — a control run that routes this failure through the hook reproduces the infinite rollback and fails the spec |
| **exact wire JSON (F2/F23)** | the byte-exact fold-migration JSON (`{"invitationId":"…"}`) deserializes into each payload record via `JobJson` with correct Guids; enqueuer output round-trips; missing/empty ID → `PermanentFailure` |
| **enqueue boundary (F15)** | architecture guard: no code outside `Infrastructure/Jobs` writes `JobQueueItem`; enqueuer joins the caller's transaction (rollback removes the job row) |
| idempotent enqueue scoping (F13) | same `(job_type, key)` dedups; same key across different job types does not collide |
| **signal coalescing + backlog drain (F10/F23)** | enqueue 3× batch size with a single NOTIFY → all rows processed in one wake (drain loop), no poll-tick waits |
| **listener disconnect/catch-up + backoff (F23/C17)** | kill the listener connection; rows committed while down are processed after reconnect's catch-up poll; reconnect uses bounded jittered backoff |
| **renewal transient vs. confirmed-loss + safety margin (C7/R2-4/R3-4)** | startup rejects leases below 10 s; a renewal that *throws* retries while margin remains with every sleep capped to `remainingSafeInterval`; a renewal returning **0 rows** cancels at once; a transient outage crossing the deadline timer requests cancellation before expiry and the first settlement no-ops on the fence; a token-ignoring handler demonstrates why provider identity/idempotency, not cooperative cancellation, prevents duplicate effects |
| **error sanitization (`JobErrorSanitizer.Spec.cs`, C11/F20/R2-8/R3-5)** | an exception message carrying an email + a token blob → stored `last_error` is type-coded, redacted (`[redacted-email]`/`[redacted-token]`), ≤ 2 KB; the actual configured console/file outputs contain no canary or raw exception message because `SanitizingLogEventSink` removes `LogEvent.Exception`, and the engine logs `Describe` + stack metadata |
| **version-compat startup gate (C14/F14/R2-9)** | a `job_queue` **or** `job_dead_letter` row of an unregistered `job_type` → worker composition **fails to start**; **there is no bypass for a `job_queue` orphan**; a DLQ-only orphan in `JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST` (exact type) boots; all-registered → starts clean |
| **registration-completeness + descriptor model-shape + probe gate (R7-1/R8-1/R9-3/O22/O24/O27)** | the same gate rejects capability drift: a `TransferExternalEffectState` registration missing its **`ExternalStateStore` descriptor** → composition **fails to start**; likewise one missing its transfer hook; a `Standard` registration that supplies either → fails; a fully-formed registry boots (non-vacuous). Plus the **model-shape check** (R9-3): a descriptor whose `TScratch` is **not a mapped entity**, whose primary key is **compound**, or whose single key property is **not a `Guid`** or **not named `JobId`** fails composition — asserted against the live EF model, one hostile registration per case. Plus the **probe check**: a descriptor naming a **dropped/renamed table** fails composition — the gate executes each probe once with a synthetic job id in a rolled-back transaction, asserting it returns `false` rather than throwing. Together these prove a policy-bearing type cannot reach its first dead-letter unclassifiable. (Round 8's "hostile method-call / captured-instance descriptor" cases are **gone because the hole is gone**: the descriptor has no expression field to make hostile — see O27) |
| **DLQ requeue lineage + single-use (C9/F16/R2-7/R3-2/R4-3/R4-6)** | `RequeueDeadLetterAsync` restores the stored envelope, validates through `JobRegistration`, applies its policy, stamps lineage/audit atomically, and rejects repeats; for email, provider acceptance without local receipt → first DLQ → requeue transfer → re-dead-letter proves `job_dead_letter.original_job_id = email_prepared_sends.job_id` at every hop and preserves the original bytes/key; missing or >7-day prepared state rejects requeue with no partial stamp/insert, while new-logical-send remains available |
| **system-job durable occurrence dedup (C4/F13/R2-1/R3-1/R4-1/R4-2)** | an occurrence enqueues its ledger row atomically; a delayed duplicate after queue deletion enqueues nothing; after pruning an old occurrence, **two reconciliation passes both ignore it because `scheduled_fire_at <= reconciled_through`**; concurrent reconcilers serialize and watermark/jobs roll back together; a sparse cron proves `GREATEST` never regresses the watermark; cron edit and disable-past-retention/re-enable reset it to DB `now()` without back-fill; a paused live scheduler proves DoNothing misfire behavior and reconciliation-only catch-up; catalog closure holds |
| **superseded-trigger epoch fence (R5-1/R6-1/O18)** | commit a dashboard cron edit (new fingerprint, **new `schedule_epoch`**, `reconciled_through` reset), **retain the old trigger and force it to fire** via `TriggerJob` with the pre-edit `JobDataMap`: `EnqueueSystemJobJob` observes the epoch mismatch under the definition lock and writes **no `system_job_occurrences` row and no `job_queue` row** — asserted by count, not by absence of an exception; it returns success, logs `system_job.fire_rejected` with `reason = superseded-schedule`, and increments the counter. The same forced fire against a **disabled** and a **soft-deleted** definition rejects with `reason = disabled` / `definition-deleted`. A fire whose epoch **matches** still enqueues normally (non-vacuous) |
| **ABA epoch fence — the three identical-policy returns (R6-1/O18)** | each case drives the definition back to a state **textually identical** to the one that built the old trigger, then forces a *delayed old execution* to land after the return, and asserts zero occurrences + zero jobs from it while the **currently registered** trigger still enqueues normally (so the fence is not merely rejecting everything): (a) **`A → B → A`** cron revert — the fingerprint provably repeats (assert the two fingerprint values are equal) while the epoch provably does not (assert unequal), and the first-epoch fire is rejected; (b) **disable → enable** with no policy change — a fire acquired before the disable is rejected after re-enable even though `is_enabled = true` and the fingerprint matches; (c) **delete → recreate** of the same `job_key` with the same cron — the fire from the deleted definition's epoch is rejected against the new row (which is why the epoch is a random uuid: a per-row counter would restart at the recreated row and could collide). A control run stamping the **fingerprint** instead of the epoch fails all three — the spec must be able to fail |
| **live-fire ∥ reconciliation lock order (R5-1/O18)** | a forced live fire and a reconciliation pass run concurrently against the **same definition** at the same tick: both take the definition row `FOR UPDATE` first, so they serialize — **no `40P01` deadlock** is raised by either transaction (asserted over repeated interleavings, with the definition-first order removed in a control run to show the spec can fail), and the occurrence is enqueued **exactly once** with no lost tick: the loser observes the winner's ledger row via `ON CONFLICT DO NOTHING` and commits a no-op |
| **2C registration set (R3-3/R7-1/R8-1)** | after 2B composition, 2C registers exactly one listener hosted service, one shared `IJobQueueSignal` binding, and exactly the three v1 email `JobRegistration`s — each carrying **both** the external-effect transfer hook **and** the `ExternalStateStore` descriptor (R7-1/O22/O24); missing/duplicate entries, or a registration with one capability but not the other, fail |
| **alert condition/window lease (R3-6/R4-5)** | N replica monitors breach the same fleet condition/window and only the DB-lease winner attempts delivery during the live lease; a definite failure releases for retry; accept-without-local-commit → lease expiry → retry proves v1 at-least-once semantics and permits a receiver-visible duplicate; dropping the scheduler advisory lock makes every instance-tagged probe report absence while the fleet condition still attempts delivery |
| **alert-lease retention (R5-3)** | `job-alert-lease-retention` deletes only rows older than `JOB_ALERT_LEASE_RETENTION_DAYS`, leaves a live in-window lease untouched, batches through `ix_job_alert_delivery_leases_window_started_at` (an `EXPLAIN` assertion shows the index scan, not a seq scan), and terminates on a short batch |
| leader election (`SchedulerLeaderService.Spec.cs`) | two hosts contend the advisory lock; exactly one starts Quartz; release migrates leadership; **standby is confirmed before the lock releases**, and an unconfirmed standby fails closed (lock retained) |
| `AppRoleComposition.Spec.cs` (F17/C5) | `Worker` builds a Generic Host — **no server/endpoints exist**, and the full DI graph resolves without web registrations; the spec enumerates **every registered `IHostedService`** (not one namespace) and asserts `Api` registers **zero** job/worker hosted-services — including the transitional legacy outbox dispatcher |

Email handlers + fold:

| Spec | Proves |
| --- | --- |
| kind routing | each email `job_type` resolves its registered handler, which calls the right `IEmailService` method |
| **eligibility race, both lock orders (F8/#811)** | order 1: revoke commits before the handler's locked read → no send, `CancelledIneligible` logged. order 2: handler holds the lock paused at the fake-sender barrier → the concurrent revoke **blocks** (does not complete), the send proceeds, revoke commits after — asserting the documented linearization semantic, not a preemption the design does not provide |
| **#811 rollout boundary (R4-7)** | during R1 a residual legacy `Processing` send can still win the old eligibility-check/send race; after the immutable-tag fleet precondition and zero Pending/Processing R2 gate, the drainer is gone and both lock-order specs above cover every send path |
| `email_log` terminal writes | `Submitted` / `CancelledIneligible` / `PermanentlyFailed` each produce exactly one row with kind/recipient/entity ids/`provider_message_id`/`request_sha256` |
| provider-evidence lifecycle (R3-8) | only allowed conditioned transitions succeed; each update writes its immutable audit row atomically and deduplicates provider event id; forbidden/repeated transitions affect zero rows; dashboard history can reconstruct prior/new outcomes |
| send idempotency + two-phase prepare + local recheck (F7/C1/R2-2) | re-running a job whose `Submitted` row exists sends **nothing**; the PREPARE transaction commits `request_body` **before** the provider call, and `SendPreparedAsync` sends those **exact bytes**, so a crash after provider-accept/before send-commit resends byte-identically even after the domain row mutates; a transient failure leaves the committed scratch; **two reclaimed handlers racing past step 0 — the second re-checks `email_log` under the SEND lock and does not call the provider** |
| **fenced PREPARE under a reclaimed owner (R7-2/R8-2/O23)** | barrier-controlled, **two real owners of the same job**. The schedule is constrained by the domain lock and is stated in the only order it can actually execute (R8-2 corrected an unconstructible one): (1) owner A enters PREPARE, takes the **domain row lock**, renders, inserts its scratch, and **pauses at a barrier before its marker write**; (2) A's lease is expired and B **reclaims** the `job_queue` row with a **new** `lock_token` — this touches only `job_queue`, which A does not yet hold; (3) B enters PREPARE and **blocks on the domain lock A holds** — asserted directly, **not** inferred from a timeout, and observed on the **right object (R9-5)**: capture A's and B's backend pids (`pg_backend_pid()` on each connection), then assert `pg_blocking_pids(B_pid)` **contains** `A_pid`, with `pg_stat_activity` showing B `wait_event_type = 'Lock'`. PostgreSQL stores row locks **in the row**, so a waiter normally appears as waiting on the holder's **transaction id**, not as an ungranted *tuple* lock; the round-8 assertion (`pg_locks … granted = false` on that tuple) targeted an object that need not exist and could pass or fail for the wrong reason. Optionally assert B holds an ungranted `transactionid` lock on A's xid; **never** require a tuple-shaped `pg_locks` row. B **cannot** "PREPARE to completion" here, which is why the round-7 barrier schedule was impossible; (4) A — a *token-ignoring* handler, the path §5.1 says cancellation cannot prevent — is released: `IExternalPreparedMarker.StampAsync`'s guard-2 fenced read finds **zero rows** for A's stale token, throws `ExternalPreparedFenceLostException` **before writing**, and A's transaction **rolls back whole**, discarding A's scratch and releasing the domain lock; (5) B then acquires the domain lock, its post-lock recheck finds **no** scratch (A's rolled back), and B inserts and stamps its own. Asserts: exactly **one** `email_prepared_sends` row, whose `request_body`/`request_sha256`/`provider_idempotency_key` are **byte-identical to B's** (A's bytes never land); `job_queue.external_prepared_at` **equals** that row's `prepared_at` *exactly* (timestamp equality, not both-non-null); A committed **zero** `job_queue` writes and **zero** scratch rows; A failed with the fence exception **by type** (proving the guard fired, not a coincidental rollback) |
| **no-token control — what dropping the fence actually breaks (R8-2)** | the same schedule with `AND lock_token = {token}` removed from **both** guard 2's read and the marker `UPDATE`. A's fence read now finds the row by `id` alone, its policy check passes (the `job_type` is still an email type), the marker is still NULL, so A's `UPDATE` affects **one** row and **A commits its scratch and marker under B's ownership**. B then acquires the domain lock, its recheck finds **A's** row, and B **adopts A's bytes** and never inserts. Asserts the failure precisely: the surviving `request_sha256` is **A's, not B's** — a *stale* owner's bytes commit under the new owner's lease. This is what the token predicate prevents; it is **not** an orphan (the queue row exists throughout, and after settlement `WHERE id = {jobId}` matches zero rows regardless of the token — which is why round 7's claim that this control produced an orphan was false) |
| **post-settlement orphan control — removes the *rowcount-or-rollback rule*, not the token (R8-2/R9-4)** | separate schedule, since the orphan needs a **settled** queue row. **Round 9 rejected the previous shape and was right: it asked one stored row to have two mutually exclusive histories** — owner A was inside a *valid email handler's* PREPARE path (so the type resolved, the payload validated, and a handler ran), and the engine was then asked to settle that same row *invalid-before-handler*, a shape reachable only for an unknown type, a `JsonException`, or a pre-handler payload rejection. No intervening mutation could make both true, so the "engine schedule" was really an internal helper called with an impossible flag. The schedule is now **production-reachable end to end**, using a **dedicated test registration** `test.transfer-scratch.v1` — `RequeuePolicy = TransferExternalEffectState`, an `ExternalStateStore<EmailPreparedSend>` descriptor (the same scratch table; it is keyed by `job_id` and carries nothing email-specific), a transfer hook, and a **lock-free no-op terminal hook**. Crucially **A takes no lock the settling pass needs** — the orphan case never required A's domain lock, which is what made the old shape contorted: (1) A, the job's first attempt, renders and inserts its scratch and **pauses at a barrier before `StampAsync`**; (2) A's lease expires and B **reclaims** the row with a new token; (3) B's attempt returns `PermanentFailure` **before touching any domain row**, so the engine settles it on the **handler-reached** path — a real registration, a real outcome, no impossible flag — running the lock-free hook, classifying `3 NeverPrepared` (marker NULL: A never stamped), inserting the DLQ row, and **fenced-deleting the queue row with B's token**, blocking on nothing A holds; (4) A is released. Main run: guard 2's fenced read finds zero rows (the queue row is gone) → throw → A rolls back → **no orphan** (zero `email_prepared_sends` rows for that `job_id`, asserted from a fresh context). **Control preserved, unchanged in force:** make the engine seam **return normally instead of throwing when its fenced read/update matches zero rows** — A's PREPARE now commits and leaves an **orphan scratch** whose `job_id` has no queue row; the spec fails. Also asserts the settlement classified `3 NeverPrepared` while A's scratch was still uncommitted, proving the probe reads **committed state only** |
| **non-vacuity control for marker = `prepared_at` (R7-2/R8-4/R9-6 — replaced, the old one could not fail)** | the retained control asserted that stamping the marker from an independent database `now()` yields marker ≠ `prepared_at`. **It rested on a false premise:** PostgreSQL `now()` is the **start time of the current transaction** and does not advance within it, so a scratch defaulted with `now()` and a later marker-side `now()` in the **same** PREPARE transaction are **exactly equal** — the control passed the mutation it was supposed to catch, and therefore proved nothing about the main assertion's non-vacuity. The replacement makes inequality **structural rather than clock-dependent**: in an **earlier, committed** transaction, insert the conflict winner's scratch row for that `job_id` with an **explicitly written** `prepared_at = now() - interval '1 hour'` (a written constant, not a race — no clock resolution, no timing assumption). The PREPARE attempt's step-2 locked recheck then **finds** that row, so the main run adopts **its** `prepared_at` and the marker equals it exactly. **Control:** replace step 4's `{preparedAt}` with the PREPARE transaction's own `now()` (the pre-R7 contract) — the marker is now provably **≥ 1 hour later** than `prepared_at`, the main spec's exact-equality assertion fails, and non-vacuity is demonstrated by a difference that **cannot** be zero. (`clock_timestamp()` would also advance within the transaction, but its margin is microseconds and its inequality is an assumption about elapsed time; the committed-winner offset is the deterministic form and is what the spec uses) |
| **the marker seam enforces *target entitlement* (R8-3/R9-7 — scope narrowed to what the guard proves)** | runtime: a `Standard`-registered job type whose handler calls `IExternalPreparedMarker.StampAsync` with its **own** live `jobId`/`lockToken` inside a transaction is rejected — guard 2 resolves the **persisted** `job_type` to a `Standard` registration and throws **before** any write; `job_queue.external_prepared_at` stays NULL, asserted from a fresh context. Repeated with the `Standard` handler passing a *`TransferExternalEffectState`* job's id **and its own token**: also rejected — but the spec asserts the **true** reason, `ExternalPreparedFenceLostException` from guard 2's zero-row fenced read, which fires *before* any persisted type is resolved. Round 8 called this a rejection "on that row's persisted type" and round 9 was right that it is not: the seam checks the **target row's** entitlement, not the caller's registration, and a caller holding a live Transfer row's **current** token would be permitted to stamp it. The invariant asserted is therefore the target-scoped one §4.2 actually relies on — **no marker on a `Standard`/unregistered row** — and the cross-job case is kept only because it demonstrates the fence, not caller authentication. Also asserted: calling `StampAsync` with **no ambient transaction** throws guard 1 and writes nothing; and a **handler that catches the fence exception and calls `CommitAsync` anyway** still commits nothing — the seam rolled the transaction back before throwing, so the commit itself throws and **zero** `email_prepared_sends` rows survive (proving the rollback is the seam's act, not the caller's courtesy). Architecture-convention half (the `ServiceArgsRecordConvention` analogue): `IExternalPreparedMarker` is the **only** symbol in the assembly that writes `job_queue.external_prepared_at`, discovered by reflection and failed on drift |
| **a failed probe cannot loop the settlement — the savepoint, not the `catch` (R9-1/O25/O28)** | the store table is **actually dropped** (`DROP TABLE email_prepared_sends`, the real `42P01`, not a fake exception injected in front of the SQL — round 9's defect is invisible to a fake, because the point is what PostgreSQL does to the transaction). A job with a **set** marker settles terminally in **one** pass: the probe raises inside its `external_state_probe` savepoint, the engine rolls back **to the savepoint**, and — the assertion that matters — the **DLQ insert, the step-5 evidence insert, and the fenced delete all COMMIT afterwards**, read back from a **fresh context**: exactly one `job_dead_letter` row reading **`6 Unclassified`** (never `0 None`, never `4 Missing`, never an unset default) with marker-derived `external_state_prepared_at`/`external_state_expires_at`, the queue row **gone**, and its `job_dead_letter_events` row present. A second lease cycle is proved **not** to occur (asserted over two full lease windows). **Control 1 (the round-9 regression):** remove the savepoint and keep only the `catch` — every post-probe statement fails `25P02`, the settlement rolls back, and the job **re-leases and re-settles repeatedly**, reproducing the #810 loop and failing the spec. This control is the one that would have caught round 9 and it must stay red without the savepoint. **Control 2:** remove the `catch` entirely — same loop. Companion: the startup-gate probe check rejects that same store at composition, so the runtime path is the *residue*, not the primary defence |
| **the exception boundary is honoured, both directions (R9-1/O28)** | *contained:* the dropped-table `42P01` above, plus a revoked `SELECT` grant (`42501`) → both settle `6 Unclassified` and **commit**. *Not contained:* kill the backend connection mid-probe (`pg_terminate_backend` on the worker's pid) → the settlement **fails and rolls back**, the job returns to `Pending`, and the next lease **settles it normally** once the connection is re-established — asserting the design's actual claim (ordinary retry) rather than a converted anomaly. Asserted **by exception type** that no connection-level failure is ever mapped to `6 Unclassified`, and that a probe raising while the outer transaction is already aborted is **rethrown**, not swallowed |
| **classification totality + no silent `None` (R8-1/R9-3/O24/O27)** | `ExternalStateClassifier` is asserted over **all seven** rows of §4.2's table, including marker-set/`Standard` and marker-set/unregistered → `4 Missing` with a zero-length window that satisfies `ck_job_dead_letter_external_state`, and marker-set/probe-error → `6 Unclassified` with a real window. `0 None` is emitted on exactly one row and never by enum default |
| legacy `Sent` mapped honestly (R2-3) | a folded legacy `Sent` row becomes `LegacySubmissionUnverified`, **never `Submitted`**; no metric counts it as a confirmed submission |
| prepared-send cleanup/expiry (C1/R4-3/R4-6) | a live `job_queue.id = email_prepared_sends.job_id` protects prepared state regardless of age; first DLQ, requeue transfer, and re-dead-letter each match on `job_dead_letter.original_job_id = email_prepared_sends.job_id`; at the prepared-send cutoff the DLQ bytes are swept, its dashboard row becomes non-requeueable, and requeue returns `PreparedStateExpired` without partial writes |
| **expiry evidence survives the bytes, from a fresh context (R5-2/O19)** | run the sweep past the cutoff, then **dispose the `AppDbContext`/service scope and resolve new ones** (no in-memory carry-over, no tracked entities): the dashboard read and `RequeueDeadLetterAsync` both report **`Expired`** with a populated `external_state_expired_at`, proving the distinction is durable column state rather than process memory. Re-resolving from a *second* fresh scope repeats it. The sweep's delete+stamp+event is one statement: injecting a failure into the event insert leaves the bytes **and** the `Present` status intact (all-or-nothing) |
| **expired vs. missing vs. never-prepared (R5-2/O19)** | three DLQ rows: (a) swept at cutoff → `Expired` → requeue rejects `PreparedStateExpired`; (b) prepared row deleted **out-of-band** with no sweep stamp → the reader stamps `4 Missing`, audits, and rejects `PreparedStateAnomaly` — **never** silently reported as an expiry; (c) dead-lettered with a NULL marker → `3 NeverPrepared` → requeue **succeeds** and the new job prepares normally. A successfully transferred ancestor reads `5 Transferred`, not `Missing` |
| **requeue is gated on the clock, before the sweep runs (R6-2)** | a DLQ row is `1 Present` with `external_state_expires_at` in the **past** and the sweep **has not run** (it is never started): `RequeueDeadLetterAsync` rejects `PreparedStateExpired` — it does **not** transfer — and in the same call the bytes are gone, the row reads `2 Expired` with `external_state_expired_at` set, and its `dead_letter.external_state.expired` event row exists. Asserted from a **fresh context**. Before the cutoff the same row requeues normally (non-vacuous) |
| **retention-config change is prospective (R6-2/O7; weakened R10-2)** | with an existing `Present` DLQ row, change `EMAIL_PREPARED_SEND_RETENTION_DAYS` in **both** directions and re-run the sweep: the existing row's `external_state_expires_at` is **byte-identical to its recorded value**, and — the property stated at its true width — **a sweep pass run before that recorded instant deletes nothing, and the first pass at or after it deletes the bytes**, under either setting. Shortening never deletes before the recorded expiry; lengthening never retains past *a pass that runs after* it. The spec asserts the two sweep passes explicitly rather than asserting an instant, because the sweep is what deletes and the spec is what runs it. A row dead-lettered **after** the change gets the new window. Proves the sweep predicates on the stored column, not on the env var |
| **sweep ∥ requeue: one lock order, no deadlock (R6-3)** | a barrier-controlled interleaving on the **same** DLQ row + prepared row: the sweep is paused after locking the DLQ row and before its `DELETE`, a requeue is released into it, and both then run to completion — **no `40P01` is raised by either transaction** (asserted over repeated interleavings in both release orders), exactly one outcome stands (either the transfer commits and the row reads `5 Transferred`, or the sweep commits and requeue rejects `PreparedStateExpired`), and the bytes are never both moved and deleted. A control run inverting the sweep's order to `FOR UPDATE OF p`-then-DLQ **reproduces the deadlock** — the spec can fail |
| **a rejected `Missing` detection is persisted, not rolled back (R6-3)** | a `1 Present` row whose prepared row was deleted out-of-band: `RequeueDeadLetterAsync` returns `PreparedStateAnomaly`, and from a **fresh `AppDbContext`/scope** the row reads `4 Missing` with its `detected_by = 'requeue_reader'` event row present — the rejection did **not** erase its own evidence. In the same fresh read: `requeued_as_job_id IS NULL` and **zero** `job_queue` rows reference that DLQ id (rejected *and* durable, simultaneously) |
| **pre-DLQ scratch loss is `Missing`, not `NeverPrepared` (R6-4/O20)** | a job PREPAREs (marker + scratch committed), the prepared row is destroyed **before** the job dead-letters, then the job dead-letters: the DLQ row reads **`4 Missing`** with `external_state_prepared_at` populated from the marker (satisfying `ck_job_dead_letter_external_state`), it is evidenced and counted, and requeue rejects `PreparedStateAnomaly` — it is **never** classified `NeverPrepared` and never allowed to re-prepare fresh bytes under a new key. A job that dead-letters with **no** marker reads `3 NeverPrepared` in the same spec (the pair is what proves the classification is total, not merely conservative) |
| **the marker survives a transfer (R6-4/O20)** | requeue transfers prepared state to a new job (which never PREPAREs again); the new `job_queue` row carries `external_prepared_at` copied from the ancestor. When that job dead-letters, its DLQ row reads `1 Present`/`4 Missing` per the bytes' actual fate — **never** `NeverPrepared` |
| **a failed probe does not strand sensitive bytes for 90 days (R9-2/O29)** | **the retention spec of this round.** Force a probe failure **while the prepared row really exists**: PREPARE commits (scratch + marker), the store is then made unqueryable in a way that does **not** delete the bytes (`ALTER TABLE email_prepared_sends RENAME TO …`, or revoke `SELECT` — the bytes are provably still on disk, asserted by counting them through a superuser/second context), and the job settles → `6 Unclassified`. Restore queryability, advance to **past the row's recorded `external_state_expires_at`** (seven days), and run the sweep: the `email_prepared_sends` row is **GONE**, asserted from a fresh context, and the DLQ row reads `2 Expired` with `external_state_expired_at` set — **without** waiting for `JOB_DEAD_LETTER_RETENTION_DAYS`, and with the DLQ row itself still present and inspectable. The event history proves the anomaly was not erased by the expiry stamp: **both** the classification-time `…unclassified` row **and** the sweep's `…expired` row (carrying `prior_status = 6`) exist — joined by `dead_letter_id` (R10-3). **Control:** predicate the sweep's DLQ-expiry batch on `external_state_status = 1` alone (round 9's shape) — the bytes **survive** the cutoff, matching neither the DLQ-expiry batch nor the orphan batch, and the spec fails. That control is the privacy regression stated as a test |
| **`Missing` alerting reads the table (R6-4)** | with a durable `external_state_status = 4` row present, a **freshly started** monitor (no in-process history of the detection) reports `dlq_external_state_missing = 1`, and an `EXPLAIN` assertion shows `ix_job_dead_letter_external_state` serving the count |
| **DLQ retention cannot destroy the owner of possibly-present bytes — the round-10 blocker spec (R10-1)** | **the retention spec of this round, and it is configuration-hostile on purpose.** Set `JOB_DEAD_LETTER_RETENTION_DAYS = 1` and `EMAIL_PREPARED_SEND_RETENTION_DAYS = 7` — *DLQ retention shorter than prepared retention*, the valid config that used to be the hole. A `1 Present` and a `6 Unclassified` DLQ row, both with live bytes, both `failed_at` well past the 1-day floor. Run `job-dead-letter-retention`: **both DLQ rows survive** and both `email_prepared_sends` rows survive, asserted from a fresh context. Repeat with the **third** row in `2 Expired` → that one **is** deleted (non-vacuity: the sweep works, it is the predicate that exempts). Then run both sweeps in **both orders** (`dlq→prepared` and `prepared→dlq`), advancing past the recorded cutoff: in **both** orders the bytes are deleted by the prepared sweep, the DLQ row is stamped `2 Expired` with its event row, and *only then* does a later `job-dead-letter-retention` pass delete it. Finally, change `JOB_DEAD_LETTER_RETENTION_DAYS` in **both** directions with the `Present` row outstanding: the row remains undeletable in both. **Control:** remove `AND external_state_status NOT IN (1, 6)` from the age sweep's subquery — the DLQ row is deleted, its bytes become an orphan, and (with the env var then shortened) the orphan batch deletes them **before** the recorded `external_state_expires_at` while **no `2 Expired` stamp and no event row was ever written**. The spec fails on all three assertions. That control is R10-1 stated as a test |
| **DLQ retention cascades its evidence, and only its evidence (R10-3/O30)** | a `4 Missing` DLQ row with two `job_dead_letter_events` rows is deleted by `job-dead-letter-retention` at the age floor: **zero** events remain for that `dead_letter_id`, asserted from a fresh context, and a *sibling* DLQ row's events are untouched. Proves `fk_job_dead_letter_events_dead_letter`'s `ON DELETE CASCADE` needs no second sweep. Also asserts an event row **cannot** be inserted for a non-existent `dead_letter_id` (the FK rejects it) |
| **the classification evidence has a writer, and it commits with the DLQ row (R10-3)** | the round-10 gap stated as a test: **no test may assert an event row exists without the step that writes it.** (a) A marker-set job whose probe finds no row settles → from a **fresh context**, exactly one `job_dead_letter_events` row with `event = 'dead_letter.external_state.missing'`, `detected_by = 'classifier'`, `new_status = 4`, `prior_status IS NULL`, and `details->>'reason' = 'probe_absent'`. (b) The dropped-table `42P01` settles → one row with `…unclassified`, `new_status = 6`, `details->>'sqlState' = '42P01'`, and a `probeError` that is **sanitizer output** (asserted by comparing to `JobErrorSanitizer`'s result, not by substring). (c) **Atomicity, both directions:** inject a failure into the event insert → **the whole settlement rolls back** (zero DLQ rows, the queue row still present, the job re-leases); inject a failure into the fenced delete → **zero event rows**. (d) `3 NeverPrepared`/`1 Present`/`5 Transferred` settlements write **zero** event rows (the scope rule, asserted rather than assumed). (e) Reflection guard: `IJobDeadLetterEventWriter` is the **only** symbol in the assembly inserting `job_dead_letter_events` from the terminal path — the `IExternalPreparedMarker` guard's shape |
| **the expiry event joins the classification event by `dead_letter_id` (R10-3)** | the R9-2 residue spec's audit assertion, restated as a **key join instead of a narrative**: after `6 Unclassified` → sweep → `2 Expired`, `SELECT * FROM job_dead_letter_events WHERE dead_letter_id = :id ORDER BY occurred_at` returns **exactly two rows** — `(…unclassified, classifier, new_status 6)` then `(…expired, prepared_state_sweep, prior_status 6, new_status 2)`. The `prior_status = 6` on the second is what preserves the question the status column overwrote. Asserted by that key, from a fresh context |
| **the resolution batch stamps `Missing` on an absent `Present` row — and never touches `6` (R10-7/R10-1)** | two DLQ rows past their recorded cutoff, both with **no** prepared row: one `1 Present`, one `6 Unclassified`. Run the sweep. The `Present` row reads **`4 Missing`** with a `prepared_state_sweep`/`reason = 'reader_absent'` event, and is then deletable by `job-dead-letter-retention` (asserted by running it). The `Unclassified` row **still reads `6`**, has **no** new event, and is **still exempt** from age retention — asserted, because it is the known-open item K-1 and the spec is what stops a future change from silently "fixing" it into a manufactured `Missing`. Non-vacuity: a `1 Present` row **with** bytes goes down the expiry batch to `2 Expired`, not to `4 Missing` |
| **the sweep is unavailable through the cutoff — fail-closed requeue, eventual cleanup (R10-2)** | the property R10-2 says the SQL actually delivers. A `1 Present` row with live bytes; **the sweep is never started**. Advance past `external_state_expires_at`. Assert, from a fresh context: (a) the bytes are **still on disk** — this is the design's real behaviour and the spec says so out loud rather than pretending otherwise; (b) `RequeueDeadLetterAsync` **fails closed** — rejects `PreparedStateExpired`, transfers nothing; (c) `dlq_prepared_state_overdue_seconds` is **> 0** and the `jobs.prepared_state.sweep_overdue` condition breaches once the lag exceeds `EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES`. Then start the sweep: the bytes are **gone** and the row reads `2 Expired`, and the overdue gauge returns to **0**. Proves *eligibility is exact, deletion is eventual, and the lag is observable* — the three separate properties round 10 found conflated into one |
| **`Unclassified` pages, and pages once (R10-4)** | with a durable `external_state_status = 6` row, a **freshly started** monitor (no in-process history) reports `dlq_external_state_unclassified = 1` and breaches condition **`jobs.dlq.external_state_unclassified`** — a **different `condition_key`** from `jobs.dlq.external_state_missing`, asserted by key, so a `Missing` breach can never satisfy an `Unclassified` page or vice-versa. **Multi-replica:** N monitors breach the same fleet-wide condition/window → **exactly one** webhook delivery attempt while the lease is live (the §7.2 lease path, keyed on the condition key with `instance` excluded). Persistence: the condition **re-breaches on the next sample** while the row remains; it recovers only when the count reaches 0. Same three assertions for `jobs.prepared_state.sweep_overdue`. **Control:** the round-9 shape — sample the gauge but define no condition — delivers **zero** notifications; the spec fails |
| **the probe exception boundary is a closed allowlist, case by case (R10-5)** | the boundary table of §5.1 asserted **mechanically, one case per row**, against the real `IsRecoverableStatementError`. *Contained → `6 Unclassified` + settlement commits:* `42P01` (`DROP TABLE`), `42501` (`REVOKE SELECT`). *Rethrown → settlement rolls back → ordinary retry, asserted by exception type and by a subsequent clean settlement:* `57P01` (`pg_terminate_backend` on the probing backend); **client cancellation** (cancel the probe's `CancellationToken`) and **host cancellation** (the `stoppingToken`); **command timeout** (a `CommandTimeout` shorter than a deliberately blocked probe); **lost socket** (kill the connection underneath); **already-aborted outer transaction** (raise an error before the probe, then probe → `25P02`); and **rollback-to-savepoint failure** (drop the connection between the probe error and the rollback). **Unit-level totality:** `IsRecoverableStatementError` returns `false` for every SQLSTATE **not** on `RecoverableStatementStates` (asserted over the allowlist's complement within a sampled set including `57014`, `25P02`, `57P01`, `40001`, `40P01`, `53300`), `false` for `Severity = "FATAL"` on an **allowlisted** SQLSTATE, and `false` for a non-`Open` connection on an allowlisted SQLSTATE with `Severity = "ERROR"` — the three gates proved independently loadbearing. **Control:** widen the allowlist to accept `57P01` — the settlement then tries to continue on a dead backend and the spec fails |
| **non-throw provider failure (F3/F23)** | an unsuccessful provider response (no exception thrown by the SDK) surfaces as a classified exception → `Retry`/`PermanentFailure`; it can never yield `Submitted` |
| #809 durability + rollback (F6) | the committed reset job survives request cancellation/restart and is deliverable; a failed enqueue rolls back token issuance and vice versa (both directions) |
| **fold idempotency + in-flight dispatcher (F4/F23/C2/C3/R3-7)** | re-running the fold produces no duplicate jobs; a `Processing` row is untouched; R2 aborts for fresh/stale Processing and fresh old-producer Pending; a folded source persists the exact compound marker `Cancelled + 'folded to job_queue'`, is excluded from back-copy, and the shipped dispatcher claim predicate proves it is unclaimable; genuine outcomes alone are copied idempotently |

The `AppRoleComposition` spec is the architecture-convention analogue of
`ServiceArgsRecordConvention.Spec.cs`: it discovers composition facts by
reflection and fails the build on drift.

---

## 10. Build order (packet map)

**Legend:** ✅ create, ✎ touch. A phase's **gate** is its verification bar.
Parallel development after 2A-R is allowed, but deploy/release order is strict:
**2A (shipped) → 2A-R → 2B → 2C-R1 → 2C-R2 → 3 → 4** (R3-3). 2B and
2C-R1 may be developed concurrently against 2A-R, but 2C-R1 rebases onto and
ships after 2B because it consumes `AddWorkerServices` and the dispatcher move.

### Phase 2A — #633: core queue + processor (SHIPPED, pre-audit)

As built: `job_queue`/`job_dead_letter` tables, claim/lease/backoff engine,
specs. The audit found it incomplete; 2A-R below is its remediation packet.

### Phase 2A-R — engine remediation (absorbs F1, F2, F5, F9–F16, F21, F22)

- **Create:** `Infrastructure/Jobs/{JobOutcome,JobJson,IJobEnqueuer,JobEnqueuer,JobDefinition,JobsMetrics,JobErrorSanitizer}.cs`
  (`JobErrorSanitizer` is the single C11/F20 persistence boundary);
  **`Infrastructure/Jobs/ExternalPreparedMarker.cs`** (`IExternalPreparedMarker` +
  `StampExternalPreparedArgs` + `ExternalPreparedFenceLostException` — the **only**
  sanctioned `job_queue.external_prepared_at` writer, with its active-transaction
  guard and its **persisted-`job_type` policy proof under lock**, §4.5) **+
  `ExternalPreparedMarker.Spec.cs`** (**target entitlement**, R9-7: a `Standard`
  handler cannot stamp **its own** row — rejected on that row's persisted type; and
  cannot stamp a `TransferExternalEffectState` row **with its own token** — rejected
  by the fence, asserted by exception type. The seam does **not** authenticate the
  caller and the spec does not assert that it does. Plus: no-ambient-transaction
  throws; the reflection guard that no other symbol writes the column — R8-3).
  `StampExternalPreparedArgs` is a 3-param `{Action}{Domain}Args` record, so 2A-R
  also **touches `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`**
  to add its assertion, per the repo's standing service convention;
  **`Infrastructure/Jobs/ExternalStateStore.cs`** (the declarative
  `ExternalStateStore<TScratch>(TimeSpan Retention)` descriptor — **data only: no
  delegate and no `Expression<>` field**; the engine builds the probe from its own EF
  model's single `Guid JobId` primary key and issues it with `IgnoreQueryFilters()` —
  R8-1/R9-3/O24/O27) and
  **`Infrastructure/Jobs/ExternalStateClassifier.cs`** (`IExternalStateClassifier` +
  `ExternalStateClassificationInput` + `ExternalStateClassification` — the engine's
  total marker-first decision function, returning a triple the engine validates
  against the CHECK model and applies; **+ the `external_state_probe` savepoint and
  its exact exception boundary**: recoverable statement error → rollback-to-savepoint
  → audited `6 Unclassified`; broken connection / already-aborted transaction →
  **rethrow**, ordinary settlement retry — R9-1/O25/O28, §4.2/§5.1) **+
  `ExternalStateClassifier.Spec.cs`** (all **seven** rows; the real-dropped-table
  control proving the DLQ insert and fenced delete **commit** after
  rollback-to-savepoint, and the savepoint-removed control proving the `25P02`
  re-lease loop — R8-1/R9-1);
  **`Infrastructure/Jobs/ExternalStateProbeErrors.cs`** (the **named** production
  helper behind the savepoint's `when` filter — the closed
  `RecoverableStatementStates` allowlist + the severity and connection-state gates,
  §5.1 — R10-5) **+ `ExternalStateProbeErrors.Spec.cs`** (the allowlist-complement
  totality assertions and the three independent gates);
  **`Infrastructure/Jobs/JobDeadLetterEventWriter.cs`**
  (`IJobDeadLetterEventWriter` — the **only** terminal-path writer of
  `job_dead_letter_events`, the engine's actor-less evidence table, and the
  terminal transaction's **step 5**; `audit_logs` cannot carry these rows —
  `user_id` is `NOT NULL` with an FK to `users` and the engine has no actor, §4.2 —
  R10-3/O30) **+ `JobDeadLetterEventWriter.Spec.cs`** (the writer/atomicity/scope
  assertions and the reflection drift guard);
  **`Modules/Jobs/Entities/JobDeadLetterEvent.cs`** + its `DbSet`;
  migration `HardenJobQueueEnvelope` — adds `lock_token`, `tenant_id`,
  `actor_user_id`, `correlation_id`, **`requeued_from_dead_letter_id`** (C9/F16
  lineage on both `job_queue` and `job_dead_letter`, + `requeued_as_job_id` /
  `requeued_at` on the DLQ), CHECK constraints, rescopes the idempotency index to
  `(job_type, idempotency_key)`, extends the claim index tie-break +
  `job_dead_letter` envelope columns (§4.2), **adds the `job_dead_letter`
  `external_state_{status,prepared_at,expires_at,expired_at}` columns + their two
  CHECK constraints + `ix_job_dead_letter_original_job_id` and
  `ix_job_dead_letter_external_state`** (R5-2/O19 — the engine owns the columns;
  2C-R1 populates them for email types and Phase 3's sweep transitions them),
  **adds `job_queue.external_prepared_at`** (R6-4/O20 — the durable PREPARE marker;
  the engine owns the column and copies it into the DLQ at dead-letter, 2C-R1's
  PREPARE writes it), **adds `ix_job_dead_letter_failed_at` for the retention age
  sweep** (R5-3), **creates `job_dead_letter_events` + its
  `ON DELETE CASCADE` FK + `ix_job_dead_letter_events_dead_letter_id`** (R10-3/O30 —
  the engine owns the table; Phase 3's sweeps and Phase 4's dashboard read it),
  sets `job_queue`
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
  tip logs the raw exception — reconcile**)); `SanitizingLogEventSink` wrapping
  every console/file sink and removing raw `LogEvent.Exception` (R3-5/O13);
  SQL-time backoff with
  equal jitter + `Retry-After`); `IJobHandler.cs` (`JobOutcome` return +
  `OnTerminalFailureAsync` — F5); `JobBackoff.cs` (computes delay
  **durations** only, never timestamps — F11); `JobQueueItem.cs` /
  `JobDeadLetter.cs` (new columns; **remove all timestamp initializers** —
  F11; **`JobDeadLetter.FromJob` copies envelope + lineage and classifies
  NOTHING** — the engine's `ExternalStateClassifier` decides `external_state_*` and
  the engine stamps it, and the engine settles invalid-before-handler failures
  DLQ-only with no terminal hook,
  R6-4/R7-1/R8-1/O20/O21/O22/O24); **the terminal transaction follows §5.1's six-step order —
  create DLQ entity → classify → handler hook (handler-reached only) → insert →
  fenced delete, with classification the one step exempted from the rollback rule —
  **and the exemption implemented by a savepoint, for recoverable statement errors
  only** (R7-1/R9-1/O25/O28); `JobHandlerRegistry.cs` → **unified `JobRegistration`** (pairs handler
  factory **and** type-erased `ValidatePayloadJson` for the requeue path —
  R2-7; **+ per-type requeue policy and external-effect state-transfer hook** —
  R3-2/O11; **+ the declarative `ExternalStateStore` descriptor — a `TimeSpan` and a
  scratch type argument, carrying no code the engine could invoke; the engine owns
  every classification branch, including `Standard` → `None`** — R7-1/R8-1/R9-3/O22/O24/O27;
  versioned types, unknown-type → DLQ);
  `JobRegistryStartupGate` **also enforces registration completeness — policy and
  capability set must match — validates each descriptor's `TScratch` against the EF
  model (single `Guid JobId` primary key), and executes each descriptor's probe once
  against the live database, or the worker does not boot** (R7-1/R8-1/R9-3). The
  drain-budget/lease knobs use
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
  (**+ `system_job_occurrences` + monotonic `reconciled_through` durable
  high-watermark + `schedule_policy_fingerprint` + `schedule_epoch`, initialized to
  database `now()`/current policy/a fresh uuid per row** —
  R2-1/R3-1/R4-1/R6-1/O10/O15/O18). Every revision path (dashboard edit,
  disable→enable, catalog-driven sync, recreate) writes fingerprint **+ a new
  `schedule_epoch` +** the watermark reset in one transaction; `SyncSystemJobsJob`
  stamps `job_key` **+ `schedule_epoch`** into every trigger's `JobDataMap` and
  **replaces** (never mutates) a trigger whose epoch changed;
  `EnqueueSystemJobJob` opens with `SELECT … FOR UPDATE` on the definition and
  no-ops on an **exact-epoch** fence rejection — **definition-first lock order on
  both occurrence paths** (R5-1/R6-1/O18);
  `Infrastructure/Jobs/WorkerHeartbeatService.cs`;
  `SchedulerLeaderService.Spec.cs`, `AppRoleComposition.Spec.cs`,
  `SystemJobCatalog`/`EnqueueSystemJobJob`/occurrence-dedup specs.
- **Touch:** `AppEnvironment.cs` (`APP_ROLE` + validator + **env-gated default:
  `All` only under `Development`/`Testing`, fail-fast when a production-like
  environment omits it** — C6/F24; tuning vars incl. drain budget + retention
  windows incl. `EMAIL_PREPARED_SEND_RETENTION_DAYS` + `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS`
  + **`JOB_ALERT_LEASE_RETENTION_DAYS`** (R5-3)
  — R2-11/R2-1; **`JOB_REGISTRY_DLQ_ORPHAN_ALLOWLIST` (DLQ-only exact types) — no
  global bypass boolean** — R2-9; **validate `JOB_LEASE_SECONDS >= 10`** —
  R3-4/O12); **move the legacy `InvitationEmailOutboxDispatcher`
  registration from shared `AddInfraServices` into worker-only `AddWorkerServices`
  here in 2B** (R2-6 — so 2B alone satisfies D1; 2C-R1 merely retains it);
  `Program.cs` (**Generic Host for `Worker`** — F17; role branching;
  `--worker-health`; run `JobRegistryStartupGate` **+ catalog closure check**
  before the worker loop); `ServiceRegistration.cs` (retarget shared registrations
  to `IHostApplicationBuilder`; move `AddHttpContextAccessor` into shared infra —
  F17); `Dockerfile`
  (**`APP_ROLE=api` in both the build-time OpenAPI env block and the production
  `migrate` stage/invocation** — C6/F24/R4-4);
  `apps/front/docker-compose.test.yml` (`APP_ROLE=api` — C6/F24);
  **the OpenAPI-drift / `generate-client` CI workflow (`APP_ROLE=api`)** and any
  other app-boot CI job; `docs/front-migration/staging-deploy.md` staging
  migrate service and the Dokploy migrate job (**both `APP_ROLE=api`** —
  C6/F24/R4-4 entrypoint enumeration, §3.1);
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
  `--worker-health`; sparse-cron/cron-edit/disable-past-retention reconciliation
  specs and the live-scheduler DoNothing misfire spec pass (R4-1/R4-2); **the
  superseded-trigger epoch-fence spec (forced old-trigger fire after a cron edit →
  zero occurrences, zero jobs), the ABA spec (`A → B → A`, disable→enable,
  delete/recreate — each rejecting a delayed old execution after the definition
  returns to identical state) and the concurrent live-fire ∥ reconciliation spec
  (no `40P01`, no lost occurrence) pass** (R5-1/R6-1); every
  enumerated OpenAPI/CI/build/**migrate** entrypoint runs role-pinned, including
  building/running the Docker `migrate` target under a production-like
  environment (C6/R4-4).

### Phase 2C-R1 — #809/#810/#811: email jobs + `email_log` + fold (absorbs F3, F4, F6, F7, F8, F20) — **DEVELOPMENT DEPENDS ON 2A-R; RELEASE DEPENDS ON 2B**

- **Create:** `Modules/Messaging/Entities/{EmailLog,EmailPreparedSend}.cs`
  (+ `EmailKind`, `EmailLogOutcome`), `Modules/Messaging/Services/EmailLogWriter.cs`;
  `Modules/Invitations/Jobs/{TenantInvitationEmailJobHandler,StaffInvitationEmailJobHandler}.cs`
  (+ payload records + `InvitationEmailJobs.cs` definitions + specs);
  `Modules/Auth/Jobs/PasswordResetEmailJobHandler.cs` (+ payload record +
  `AuthEmailJobs.cs` + spec); `Modules/Auth/Services/PasswordResetService.cs`
  (F6, + spec incl. both rollback directions); `RequestPasswordReset.Spec.cs`;
  `Infrastructure/Messaging/Email/EmailProviderException.cs` (classified
  hierarchy — F3); `Infrastructure/Jobs/JobQueueListener.cs` +
  `IJobQueueSignal.cs`; migration `AddEmailLogAndFoldEmailOutbox` (§4.6 R1 —
  **including the retention age indexes `ix_email_log_occurred_at` and
  `ix_email_prepared_sends_prepared_at`**, R5-3).
- **Touch:** `ResendEmailAdapter.cs` + `EmailService.cs` (**F3 contract:
  classified throws + `EmailSendReceipt` — fixes the live result-swallowing
  bug**; **+ `SendPreparedAsync(ReadOnlyMemory<byte>, idempotencyKey)`** — the
  byte-faithful transport, R2-2); producers `InvitationService.cs`,
  `TenantAsStaffService.cs`, `StaffProfileAsStaffService.cs` (→ `IJobEnqueuer` +
  NOTIFY); `RequestPasswordReset.cs` (→ `IPasswordResetService`); revoke/accept
  services (remove `CancelPendingForInvitationAsync` calls); `AppDbContext.cs`
  (`EmailLog`/`EmailPreparedSend` DbSets);
  `Infrastructure/Jobs/JobsServiceRegistration.cs` (**register exactly one
  `JobQueueListener` hosted service, bind `IJobQueueSignal` to the shared
  per-replica signal instance, and add `JobRegistration` entries for
  `email.tenant-invitation.v1`, `email.staff-invitation.v1`, and
  `email.password-reset.v1`, each with the external-effect transfer policy/hook
  **and** an `ExternalStateStore<EmailPreparedSend>(AppEnvironment.EmailPreparedSendRetention)`
  descriptor — **declared data, not a classifier delegate and (since R9-3) not an
  expression either**: 2A-R's engine owns the decision function, derives the probe's
  key from its own EF model (`EmailPreparedSend`'s single `Guid JobId` primary key),
  and runs it (R7-1/R8-1/R9-3/O22/O24/O27; the startup gate rejects a registration
  carrying one capability without the other, rejects a `TScratch` whose model shape is
  wrong, and rejects a descriptor whose probe does not execute)** —
  R3-2/R3-3/R7-1/R8-1/R9-3). **The legacy dispatcher is already
  worker-only from 2B (R2-6); R1 merely retains it as a drainer** (§4.6). The
  `email_prepared_sends` scratch persists the request as **`bytea` (`request_body`)
  with a committed-PREPARE phase — no `prepared_committed` flag, row existence is
  the proof** (C1/R2-12), and the PREPARE transaction is **fenced and single**:
  post-lock recheck, one insert, and the marker set to **that row's own
  `prepared_at`** (never a second `now()`) by **calling 2A-R's pre-existing
  `IExternalPreparedMarker.StampAsync` seam** — 2C **creates no engine file and
  writes no `job_queue` SQL**; the seam's active-transaction guard, persisted-`job_type`
  policy proof, token fence, and rowcount-or-rollback rule are 2A-R's contract and
  2C only consumes them, per the phase-ownership rule below (§4.5 —
  R6-4/R7-2/R8-3/O20/O23/O26);
  `EmailLogOutcome` includes **`LegacySubmissionUnverified`**
  (R2-3); email terminal failure retains prepared state only within the
  prepared-send window, **and the engine stamps the new DLQ row's `external_state_*`
  evidence (`Present` + materialized window bounds, `Missing`, `NeverPrepared`, or
  `Unclassified` on a savepoint-contained probe error — decided by the marker and
  2C's declared descriptor, §4.2) in the same terminal
  transaction** (R5-2/R6-4/R8-1/R9-1/R9-2/O19/O20/O24/O28/O29), and
  its registration atomically transfers original bytes/key on timely requeue while
  stamping the ancestor `Transferred` and **carrying the marker onto the new queue
  row** (R3-2/R4-3/R6-4); the fold migration
  marks folded rows with exact compound marker
  `Cancelled + 'folded to job_queue'`,
  back-copies **genuine outcomes only** with `Sent → LegacySubmissionUnverified`
  and a **SQL-side stable error code** (C3/R2-3/R2-8).
- **Gate:** §9 email-handler specs green (both lock orders, prepared-envelope
  idempotency, non-throw provider failure, terminal `email_log` writes, #809
  rollback both directions, prepared-state expiry, and exact first-DLQ → requeue
  transfer → re-dead-letter lineage predicate); **the R6 state-machine specs green
  — clock-gated requeue before the sweep runs, prospective retention-config change,
  barrier-controlled sweep ∥ requeue with no `40P01`, fresh-context persistence of
  a rejected `Missing`, pre-DLQ scratch loss → `Missing` (not `NeverPrepared`),
  marker survival across a transfer, and invalid-before-handler DLQ-only settlement
  with its infinite-loop regression** (R6-2/R6-3/R6-4); **the R7/R8/R9 contract specs
  green — §9's rows *"fenced PREPARE under a reclaimed owner"*, *"no-token control"*,
  *"post-settlement orphan control"*, and *"non-vacuity control for marker =
  `prepared_at`"*, each **exactly as §9 specifies them** — plus the
  registration-completeness **and descriptor-probe** gates, and the
  classification-cannot-loop control** (R7-1/R7-2/R8-1/R8-2/R9-4/R9-5/R9-6);

  > **This gate cites §9; it does not paraphrase it (R10-6).** It previously
  > restated two of those controls in the **forms round 9 struck** — "B proved
  > blocked on the domain lock **via `pg_locks`**" (R9-5 replaced it with backend
  > pids + `pg_blocking_pids`/`pg_stat_activity`; PostgreSQL stores row locks *in
  > the row*, so the `pg_locks` tuple the old text demanded need not exist) and
  > "**independent-`now()` → marker ≠ `prepared_at`**" (R9-6 proved that control
  > **vacuous**: `now()` is transaction-scoped, so it passed the mutation it existed
  > to catch; the replacement pre-commits the conflict winner at `now() - interval
  > '1 hour'`). Because this is **current build-order text**, not a struck
  > chronological record, a builder reading it would have implemented the two
  > superseded controls. **The rule going forward:** gates name §9's spec rows and
  > §9 owns their content — a summary that rephrases a spec is a second source of
  > truth, and the second one goes stale silently.
  fold idempotency spec green; an exact registration
  set spec asserts the three email registrations **each with both external-effect
  capabilities** (transfer hook + `ExternalStateStore` descriptor), one listener
  hosted service, and one shared signal binding with no duplicates/omissions
  (R3-3/R7-1/R8-1);
  `just test-api` green.

> **Known code-alignment item (R3-3, captain's reconciliation round).** The
> current `feat/809-email-jobs-fold` file already wires one listener and signal,
> but its three email handlers are scoped concrete placeholders rather than
> unified `JobRegistration` entries and it has no exact registration-set gate.
> Rebase it after 2B, replace the placeholders with the three policy-bearing
> registrations, and add the gate; no code branch is changed by this document.
>
> ⚠️ **Separately — a suspected live defect on that same branch, not a doc gap
> (R6-4):** the malformed-payload → mandatory terminal hook → `NOT NULL`
> `email_log.recipient` → infinite rollback loop described in §5.4. Verify the 809
> tip against §5.1's two settlement shapes; it is a code question, not a
> documentation one.

### Phase 2C-R2 — drop the outbox (small follow-up release)

- Migration `DropInvitationEmailOutbox` (**`ACCESS EXCLUSIVE` lock + total
  quiescence check — zero `Pending`/`Processing` regardless of age**, C2 —
  straggler genuine-outcome back-copy + DROP — §4.6); **delete**
  `InvitationEmailOutboxDispatcher.cs` (+ spec), `InvitationEmailOutboxSignal.cs`,
  `InvitationEmailOutbox.cs`; remove their (worker-only) registrations + DbSet.
  Gate: quiescence check exercised in a spec across **fresh `Processing`, stale
  `Processing`, and fresh old-producer `Pending`** (C2); full suite green with the
  outbox code gone; the rollout spec records the accepted R1 #811 race window and
  proves the locked-eligibility guarantee covers every send path only after this
  R2 boundary (R4-7).

### Parallelization

- **2A-R first** — it owns the engine contracts everything else consumes.
- **2B ∥ 2C-R1 development after 2A-R; merge/deploy 2B before 2C-R1.** At the
  feature-code level, 2B lives in
  `Infrastructure/Jobs` + `AppEnvironment`/`Program`/`Dockerfile`/`dokploy`; 2C
  lives in `Modules/Messaging` + `Modules/Invitations` + `Modules/Auth` +
  `Infrastructure/Messaging/Email` + `Infrastructure/Jobs` (listener/signal
  files **plus `JobsServiceRegistration.cs` integration**). This is a real
  shared-file conflict: develop in parallel, then rebase 2C-R1 onto 2B and apply
  the registration-set gate before release (R3-3).
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
  4. **`ServiceRegistration.cs` / `Program.cs` / `JobsServiceRegistration.cs`** — 2B owns the
     Generic-Host/role restructure (F17); 2C-R1 also edits
     `ServiceRegistration.cs` (email adapter/service changes are in-place;
     outbox registration removal waits for 2C-R2). Land 2B's restructure
     before 2C-R1's listener/handler integration and 2C-R2's removals.
  5. **`IJobHandler`/engine contracts** — owned by 2A-R; 2B/2C consume, never
     edit. This explicitly covers **`IExternalPreparedMarker`** (§4.5),
     **`ExternalStateStore`**, and **`ExternalStateClassifier`** (§5.1): 2A-R
     creates the files and their specs; 2C-R1 *calls* `StampAsync` from its PREPARE
     and *supplies descriptor data* on its registrations. Round 8 (R8-3) caught the
     inverse of this rule being unimplementable — §10 told 2C to use the fenced
     marker transaction while assigning the marker operation to no phase at all, so
     an implementer had to either leave it missing or breach this boundary.

### Phase 3 — #635: recovery/DLQ ops + first system jobs + observability sampler

`RecoverStaleJobsJob` + `SyncSystemJobsJob` seed rows; Phase 3 seeds exactly
one domain job: session cleanup (#389, `Modules/Auth/Jobs/`), with an
idempotency spec and a domain outcome marker where applicable (F13). Invitation
expiration (#425) is not a handler or system-job definition; it remains derived
at read time (see §11, O32/#425 ruling). `JobQueueMonitorService` (§7.2 —
**per-replica, instance-tagged, not leader-gated**, + `scheduler.leader_present`
and sync-staleness alerts — R2-10); **the one wired alert route** (Serilog
warning+ webhook sink — O8/R2-10) behind the
`job_alert_delivery_leases` condition/window lease + migration (§7.2/R3-6 —
**including `ix_job_alert_delivery_leases_window_started_at`**, R5-3);
**five** retention sweep jobs (§7.3 — `email-log-retention`,
`job-dead-letter-retention` (**carrying `AND external_state_status NOT IN (1, 6)`
— it may not delete the owner of possibly-present prepared bytes**, R10-1/§4.2),
`email-prepared-sends-retention` via `EMAIL_PREPARED_SEND_RETENTION_DAYS`
(**three batches: DLQ-expiry — the atomic delete + `Expired` stamp + event, R5-2;
resolution — absent-`Present` → `4 Missing` + event, R10-7/R10-1; and orphan**),
`system-job-occurrence-retention` via `SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS`, and
**`job-alert-lease-retention` via `JOB_ALERT_LEASE_RETENTION_DAYS`** — R2-11/R2-1/R5-3);
**the three prepared-state alert conditions with their `condition_key`s wired
through the delivery lease** — `jobs.dlq.external_state_missing`,
`jobs.dlq.external_state_unclassified`, and `jobs.prepared_state.sweep_overdue`
(§7.2 — R10-2/R10-4), plus the `dlq_prepared_state_overdue_seconds` gauge and
`EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES` (§3.1). **Cron defaults for these sweeps are
this phase's to set** — the design fixes the predicates, not the cadence, and
`email-prepared-sends-retention`'s cadence must be materially shorter than
`EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES` (§7.3; K-3).
Gate: jobs run on schedule under `worker`; sampler emits gauges and threshold
warnings **from a follower with no leader present**; N replicas observing one
fleet condition permit only the live lease winner to attempt delivery;
accept-without-local-commit retries after lease expiry under the explicit
at-least-once contract (a receiver-visible duplicate is allowed); the exact
`pg_locks`
probe reports leader absence without attempting the advisory lock; **each of the
five sweeps** deletes only out-of-window rows, batches through its retention index
(`EXPLAIN`-asserted, no seq scan), and leaves a live alert lease untouched; the
prepared-send sweep's post-sweep `Expired` verdict is readable from a fresh
context (R5-2); **§9's round-10 rows green — the DLQ-retention exemption under a
shorter-DLQ-window config and both sweep orders, the resolution batch's
`Present`-only scope, the sweep-unavailable fail-closed/eventual-cleanup pair, and
`Unclassified` breaching its own condition key exactly once fleet-wide**
(R10-1/R10-2/R10-4/R10-7).

### Phase 4 — #636: staff job-visibility dashboard (sketch only)

Staff endpoints (`/staff/...`, per route-design guide) over `job_queue`,
`job_dead_letter`, `system_job_definitions`, and **`email_log`**: list/inspect
(payload view behind its own read permission — F20), **server-side
requeue-from-DLQ per the §4.2 contract** (engine-only `RequeueDeadLetterAsync`
restoring the stored envelope + per-type external-effect state + lineage
chaining, `staff:jobs:dead-letter:requeue`
permission, immutable audit entry, no client payload override — F16/C9), with
email rows **whose stored `external_state_status` is `2 (Expired)`** plainly
marked **non-requeueable: prepared state expired** (citing
`external_state_expired_at`) and an explicit, separately
permissioned/audited **new logical send** action that renders current state under
a new id/key (R4-3/O16). The label is driven by the DLQ column, never by probing
for the deleted `email_prepared_sends` row; `4 Missing` renders as a distinct
**integrity anomaly** badge, not as an expiry (R5-2/O19); and `6 Unclassified`
renders as its **own** badge — *prepared state could not be verified* — separate
from both, since it means the store was unreachable at settlement rather than that
bytes were lost, and it points at the audit trail rather than at a data-loss
incident (R9-2/O29). Both anomaly states are non-requeueable.
Also: enable/disable + edit-cron system jobs. Follows
existing staff list-page + permission patterns. **Design-sketch scope only in
this doc**; full UI spec is out of Epic A's core.

### Follow-ups (not in this build order)

- **#317** — `packages/shared-cs` + `apps/worker` extraction, thin hosts,
  `seed-bulk` move. Revisit when the role-based single image is outgrown.
- Durable Quartz store (`qrtz_*`) — only if misfire-across-restart semantics are
  ever required.
- **Receiver-enforced alert idempotency contract (O17):** upgrading alert
  delivery from v1 at-least-once to exactly-once requires selecting a receiver
  that contractually deduplicates `{condition_key}:{window_started_at}`, with
  specified key-retention, accept/response semantics, and an
  accept-without-response integration test. It is a named follow-up, not a v1
  guarantee inferred from the request header.
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
- **O7 — Retention windows (F20/R5-3). — AUTHOR-DECIDED: adopt defaults (pending owner
  objection).** `email_log` 180 days (`EMAIL_LOG_RETENTION_DAYS`),
  `job_dead_letter` 90 days (`JOB_DEAD_LETTER_RETENTION_DAYS`),
  `email_prepared_sends` 7 days
  (`EMAIL_PREPARED_SEND_RETENTION_DAYS` — a real env var, R2-11), including the
  email-DLQ requeue cap in O16, and **`job_alert_delivery_leases` 30 days
  (`JOB_ALERT_LEASE_RETENTION_DAYS`, R5-3 — the table accrues one row per breached
  condition per 5-minute window and previously claimed pruning against an
  undefined "alert audit window"; 30 days matches the occurrence ledger's O9
  window and is far longer than the 60-second lease, so the sweep can never
  delete a live lease)** — all enforced by Phase-3 sweep jobs (§7.3),
  env-overridable. **Decided: adopt these defaults.**
  Flagged because retention of recipient personal data is policy territory; the
  owner may override any window without a design change (all are env vars, §3.1).
  **Override semantics are PROSPECTIVE ONLY (R6-2)** — the mechanism and its
  consequences are stated once in §4.5; the decision is recorded here.
  `EMAIL_PREPARED_SEND_RETENTION_DAYS` is the only one of the four with a
  *materialized* boundary (`external_state_expires_at`), so it is the only one
  where the question arises; the other three are simple age predicates. **Decided
  over:** a retroactive reading (a conditioned recalculation migration over
  outstanding `Present` rows before the new window takes effect) — rejected
  because a materialized timestamp the current env var can silently overrule is a
  timestamp the dashboard is lying with.
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
  Delivery is at least once (O17); its idempotency key is best-effort until a
  receiver contract says otherwise. **Decided: telemetry v1, webhook-sink route
  in Phase 3.** Flagged because the concrete destination is an ops/policy choice,
  not an engineering one.
- **O10 — Prune-safe catch-up identity (R3-1). — AUTHOR-DECIDED: durable
  high-watermark (pending owner objection).** Add
  `system_job_definitions.reconciled_through`; serialize reconciliation on the
  definition row, scan only `(watermark, cutoff]`, and advance with `GREATEST`
  atomically even when older misses are dropped (§4.3/§5.3). Schedule-edit reset
  semantics are O15. **Decided over:** a
  catch-up-window/retention inequality, because correctness then does not depend
  on two independently tunable durations.
- **O11 — External-effect DLQ requeue (R3-2). — AUTHOR-DECIDED: transfer state
  (pending owner objection).** Keep the staff requeue operation, but require each
  external-effect `JobRegistration` to atomically transfer its immutable prepared
  request and original provider identity to the new job (§4.2), subject to the
  seven-day email cap in O16. **Decided over:** prohibiting all requeue; the
  separate new-logical-send operation is used only after faithful state expires.
- **O12 — Minimum job lease (R3-4). — AUTHOR-DECIDED: 10 seconds (pending owner
  objection).** Startup rejects smaller `JOB_LEASE_SECONDS`; renewal sleeps are
  capped to the remaining safe interval and a deadline timer requests
  cancellation. **Decided:** 10 seconds leaves usable room for the 2-second
  minimum margin without supporting operationally brittle sub-second leases.
- **O13 — Serilog global exception boundary (R3-5). — AUTHOR-DECIDED: sink
  wrapper (pending owner objection).** Every console/file sink is wrapped by
  `SanitizingLogEventSink`, which removes `LogEvent.Exception` and forwards only
  sanitized metadata; the actual rendered outputs are tested (§5.1). **Decided
  over:** analyzer-only enforcement, because the boundary also protects existing
  and third-party call sites.
- **O14 — `email_log` evidence model (R3-8). — AUTHOR-DECIDED: audited state
  transitions (pending owner objection).** Keep one lifecycle table (no new event
  table); permit only the conditioned evidence transitions in §4.4 and write an
  immutable `AuditLog` entry in the same transaction. The row is no longer
  described as immutable or append-only.
- **O15 — Schedule revision semantics (R4-1). — AUTHOR-DECIDED: reset to database
  now, never back-fill (pending owner objection).** Cron/timezone/gap-policy
  changes and disabled→enabled transitions atomically reset
  `reconciled_through` to database `now()`; a persisted policy fingerprint makes
  catalog changes detectable. **Decided over:** storing and replaying historical
  schedule revisions, because edits should take effect prospectively.
- **O16 — Email prepared-state/DLQ window (R4-3/R4-6). — AUTHOR-DECIDED: seven-day
  requeue cap (pending owner objection).** Email DLQ requeue is faithful only
  while its exact prepared bytes/key remain within
  `EMAIL_PREPARED_SEND_RETENTION_DAYS` (default seven). Older DLQ rows remain for
  audit but are non-requeueable; staff use the separately permissioned/audited
  new-logical-send operation. **Decided over:** retaining sensitive prepared bytes
  for 90 days or adding encryption machinery in v1.
- **O17 — Alert delivery semantics (R4-5). — AUTHOR-DECIDED: at least once in v1
  (pending owner objection).** The DB lease prevents concurrent attempts and
  bounds duplicates to ambiguous-response/lease-expiry races; the stable key is
  best-effort. Exactly-once requires the named receiver-contract follow-up in
  §10. **Decided over:** claiming receiver behavior the selected generic webhook
  route does not guarantee.
- **O18 — Superseded-trigger fence + lock order (R5-1/R6-1). — AUTHOR-DECIDED:
  fence on a distinct `schedule_epoch`; keep the fingerprint as the revision
  *detector*; definition-first lock order (pending owner objection).**
  **This item REVERSES the round-5 decision recorded under this number. The
  round-5 reasoning was wrong; it is corrected here rather than quietly
  rewritten.** Round 5 fenced on `schedule_policy_fingerprint` and rejected a
  revision token, arguing that an `A → B → A` revert *should* re-accept the
  identical schedule and that a monotonic counter "would get that wrong." That
  argument **conflated two different questions**:
  - **policy equality** — "is the cron/timezone/gap policy textually identical?",
    which the fingerprint answers correctly, and which is why the *newly
    registered* A trigger should indeed be accepted; and
  - **registration-epoch identity** — "did this execution come from the
    registration that is current now?", which is the actual superseded-fire
    question, and which **no property of the policy text can answer**.
  Both answers are needed, and they point opposite ways in exactly the case round
  5 used to justify the fingerprint: after `A → B → A`, the new A trigger should
  be accepted **and** a delayed execution acquired under the *first* A epoch
  should be rejected. A repeating hash cannot separate them, so the fingerprint
  fence admitted the stale fire — an **ABA hole**, equally open for
  disable→enable and for delete/recreate of the same `job_key` with the same
  policy. The occurrence PK does not close it (the stale fire's `scheduled_fire_at`
  is genuinely unique). The reviewer was right; round 5's rejection of a revision
  token does not stand.
  **Now decided:** `system_job_definitions.schedule_epoch` (a **random uuid**) is
  re-drawn on **every** cron/timezone/gap-policy revision, **every**
  disable→enable transition, and **every** active-definition recreation, in the
  same transaction as the fingerprint write and the `reconciled_through` reset.
  `SyncSystemJobsJob` stamps the **epoch** into every dynamic trigger's
  `JobDataMap` and *replaces* a trigger whose epoch changed; `EnqueueSystemJobJob`
  locks the definition row first and enqueues only on an **exact epoch match**,
  treating a mismatch as a **logged, counted, non-error no-op**. The fingerprint
  **stays** — as the detector that tells `SyncSystemJobsJob` a revision happened,
  never as the fence. Two fields, two questions; §4.3 states the distinction where
  the mechanism lives. Both occurrence-writing paths take the definition row
  before any occurrence row, per §4's global lock-order rule (§4.3/§5.3).
  **Decided over:** (a) a monotonic `schedule_revision` **integer** — an epoch
  uuid composes with delete/recreate, where a per-row counter restarts at zero and
  can collide with a retired registration's live trigger; (b) an immutable
  `schedule_effective_from` fence compared against `scheduled_fire_at` (the
  reviewer's alternative) — workable, but it must be kept strictly separate from
  the advancing `reconciled_through` watermark, and the epoch needs no such
  discipline; (c) shortening the sync interval — narrows the race without closing
  it; (d) treating a superseded fire as a failure — it is the routine consequence
  of a cron edit and would page operators for correct behavior.
  Flagged because "a superseded fire silently drops its tick, and reconciliation
  decides any catch-up" is a semantic the owner may want to see, and because the
  no-op is deliberately invisible outside the counter and the information log.
- **O19 — DLQ external-prepared-state status model (R5-2). — AUTHOR-DECIDED:
  persist the evidence on `job_dead_letter` (pending owner objection).** The
  seven-day expiry (O16) deletes the very row that proves expiry was expected, so
  the DLQ row now carries `external_state_status` (`None`/`Present`/`Expired`/
  `NeverPrepared`/`Missing`/`Transferred`, **+ `Unclassified` added by O29**) plus `external_state_prepared_at`,
  `external_state_expires_at`, and `external_state_expired_at`. The sweep deletes
  the bytes, stamps `Expired`, and audits **in one statement**; requeue and the
  dashboard read the stored status; `Missing` is an audited, alerted integrity
  anomaly and is **never** reported as an expiry. **Decided over:** (a) inferring
  expiry from `failed_at + 7d` — invalid, since preparation can precede
  dead-lettering by hours or an outage; (b) inferring expiry from the prepared
  row's absence — that is exactly the ambiguity being removed; (c) a separate
  expiry-event table — the DLQ row is already the durable audit object and one
  atomic statement is simpler than a second table. Flagged because it adds four
  columns to an engine table and because `NeverPrepared` and `Transferred` are
  new status values the owner may want to review; note the columns are window
  metadata only and carry **no** recipient/body/token material, so retaining them
  for the DLQ's 90 days does not re-open the O16 privacy exposure.
  **Completed by R6 (transitions, not direction):** `external_state_expires_at` is
  the *enforced* boundary on **both** paths, not just a recorded one — the sweep
  predicates on it and requeue gates on `now() <` it (R6-2/O7); the sweep and
  requeue share one DLQ→prepared lock order (§4; R6-3); the `Missing` detection
  **commits and then rejects** rather than rolling back the evidence it just wrote
  (R6-3); and `NeverPrepared` is read from a durable marker instead of inferred
  from absence (R6-4/O20).
- **O20 — Durable "PREPARE occurred" marker (R6-4). — AUTHOR-DECIDED: persist the
  marker outside the deletable scratch (pending owner objection). SUPERSEDED AT THE
  WRITE LEVEL BY O23** — the marker's *direction* (a durable, engine-owned proof
  outside the scratch) stands unchanged and is what everything below relies on; the
  *write mechanism* described in this item is the one R7-2/O23 replaced. Read the
  paragraph below with that substitution, stated inline where it occurs.** O19's status
  model was not **total**: at dead-letter, "prepared row absent" was classified
  `NeverPrepared`, which cannot distinguish a true pre-PREPARE failure from
  prepared state lost or corrupted *before* dead-lettering — the very anomaly
  `Missing` names. Worst case, an ambiguous provider attempt followed by premature
  scratch loss reads as "no external effect occurred" and requeue mints fresh bytes
  under a fresh key. `job_queue.external_prepared_at` is therefore written **in the
  PREPARE transaction** ~~from the same database `now()` as
  `email_prepared_sends.prepared_at`~~ — **superseded by O23: the marker takes the
  committed scratch row's *own* `prepared_at`, returned by its `INSERT … RETURNING`
  or re-read from the conflict winner inside the same fenced transaction; there is
  **no second, marker-side `now()`**. The equality conclusion this item draws
  survives and is now *enforced by the write* rather than claimed "by construction"
  (§4.5)** — and copied to the DLQ at dead-letter — so
  marker present + row absent → a real, audited `Missing`; marker absent →
  genuinely `NeverPrepared` (§4.1/§4.2/§4.5). Requeue carries the marker onto the
  new queue row when it transfers state, so a transferred job that never re-PREPAREs
  is not later misread as `NeverPrepared`. **The marker is one timestamp — no
  recipient, body, token, hash, or provider key** — so O19's privacy claim stays
  true. **Decided over:** narrowing `Missing` to post-dead-letter loss and dropping
  the loss/corruption distinction — cheaper, but it answers a correctness question
  by lowering the claim, and the standing rule is the correct architecture, not the
  cheaper story. Flagged because it adds a column to the hottest engine table
  (nullable, written once per external-effect job, never indexed).
- **O21 — Invalid-before-handler settlement (R6-4). — AUTHOR-DECIDED: DLQ-only,
  `NeverPrepared`, no `email_log` row (pending owner objection).** The engine's
  terminal hook is transactional (F5), so a hook that *cannot* succeed does not
  fail — it rolls settlement back forever. A malformed/missing-id email payload
  cannot reload a recipient, and `email_log.recipient` is `NOT NULL`, so routing
  that failure through `OnTerminalFailureAsync` yields an **infinite lease loop**
  (the #810 class, already shipped once in this system). Settlement for failures
  where **no handler instance was ever reached** — unknown `job_type`,
  `JsonException`, payload rejected by `ValidatePayloadJson` — therefore invokes
  **no hook**: DLQ-only, `external_state_status = 3 NeverPrepared`, no `email_log`
  row, conditioned queue delete, one commit (§5.1/§5.4). **Decided over:** (a) a
  placeholder recipient (`unknown@invalid`) — fabricated data in the table support
  reads to answer "what happened to this address"; (b) relaxing `recipient` to
  nullable — it is what makes every `email_log` row mean something, and a nullable
  recipient would push the check to every reader forever; (c) a schema-supported
  `recipient unavailable` outcome — a real option, but it adds an enum value and a
  nullable column to record an event with no delivery semantics, and the DLQ row
  already records it losslessly. Flagged because it makes "every terminal path
  writes an `email_log` row" false by design — the correct claim is "every terminal
  path that reached a handler" — and because the owner may prefer (c)'s explicit
  outcome value.
- **O22 — Terminal external-state classification seam (R7-1). — AUTHOR-DECIDED: the
  seam belongs on `JobRegistration`, not on `FromJob` or `IJobHandler` (pending owner
  objection). SUPERSEDED IN API SHAPE BY O24, AND O24 IN TURN BY O27** — the
  *placement* decision below is
  what rounds 8 and 9 both held and it stands; the **delegate** shape it chose does
  not, and neither does O24's expression that replaced it. This
  item claimed the classifier was "payload-blind **by signature**" while the
  signature handed it `JobQueueItem` *and* `JobDeadLetter` (both payload-bearing) and
  a **writable `AppDbContext`**. That was blindness by convention. O24 replaces the
  delegate with declarative data; read the API sentences below as superseded, the
  placement rationale as live.** O19/O20 gave the DLQ a six-value external-state machine and O20 gave
  it a durable marker, but never said **who computes** the non-generic half of it.
  "Do the prepared bytes still exist?" is answerable only against a *type-specific*
  store, and the unified `JobRegistration` exposed only a handler factory, a payload
  validator, and a **requeue** transfer hook — so the document asserted a total state
  machine with no dispatch seam to produce it. `JobRegistration` therefore gains
  `ClassifyExternalStateAsync(JobQueueItem, JobDeadLetter, AppDbContext, ct)`,
  required alongside `TransferExternalEffectState` and enforced by the startup gate;
  the terminal transaction runs create-entity → classify → handler hook → insert →
  fenced delete (§5.1). The classifier takes **no `JobContext` and may not parse the
  payload** — that is what lets it run on the invalid-before-handler path where O21
  forbids the *hook*, keeping the machine total without reopening the #810
  infinite-rollback class. **Decided over:** (a) letting the generic
  `JobDeadLetter.FromJob` query `email_prepared_sends` — couples the engine to one
  domain and needs an edit per future webhook/publishing prepared-state store;
  (b) putting it on `IJobHandler` — needs a handler instance, which the
  invalid-before-handler path by definition does not have; (c) having
  `OnTerminalFailureAsync` return a classification — it returns `Task`, ran *after*
  DLQ creation in the documented order, and is not invoked at all on the path that
  most needs classifying. Flagged because it adds a **required** capability to every
  external-effect registration (a startup-gate breaking change for any type added
  later) and because it moves classification off `FromJob`, where R5-2/R6-4 had put
  it.
- **O23 — Fenced PREPARE as one transaction (R7-2). — AUTHOR-DECIDED: derive the
  marker from the inserted row, fence it on `lock_token`, rowcount-or-rollback
  (pending owner objection).** O20's marker was written from an **independent**
  database `now()` alongside an `INSERT … ON CONFLICT DO NOTHING`, and the equality
  of marker and `email_prepared_sends.prepared_at` was claimed "by construction" —
  it was not: a loser hitting `DO NOTHING` still overwrote the marker with a strictly
  later timestamp, and a token-ignoring stale owner (a path §5.1 explicitly supports,
  since cancellation is cooperative) could insert an orphan scratch or mutate a queue
  row it no longer owned, extending the advertised sensitive-byte cutoff past the real
  one and committing scratch after settlement. PREPARE is now **one fenced
  transaction**: post-domain-lock recheck of the prepared row, a single insert whose
  **own** `prepared_at` (or the conflict winner's) becomes the marker value, a queue
  update conditioned on `id` + `lock_token` + `NULL-or-equal`, and **exactly one
  affected row or the entire transaction rolls back** (§4.5). Equality is then
  *enforced by the write*, not asserted. **Decided over:** (a) keeping the
  independent `now()` and documenting the skew as acceptable — it makes the DLQ row
  lie about its own expiry boundary, which is the whole point of O19/O20;
  (b) maintaining the marker by database trigger from the scratch row — the scratch
  is *deleted by policy* at seven days, so the trigger would have to nullify or
  freeze the marker and would reintroduce exactly the absence-ambiguity O20 removes;
  (c) dropping the marker and re-deriving from the scratch — already rejected as O20.
  Flagged because it makes PREPARE's correctness depend on the lease fence, so a
  handler that PREPAREs outside a claimed lease is now a **rollback**, not a
  tolerated write.
- **O24 — Classification is declarative data, not a registration delegate (R8-1). —
  AUTHOR-DECIDED: the type declares *where* its store is; the engine decides
  everything (pending owner objection). SUPERSEDED IN API SHAPE BY O27** — the
  *direction* below (declaration over delegation; the engine owns the decision) is
  unchanged and was graded materially safer by round 9. What round 9 rejected is the
  `Expression<>` selector this item chose as the vehicle and, specifically, the
  strength of the property claimed for it: **an expression lambda body may contain
  method calls and closures, and EF may evaluate parts of it on the client**, so
  "no type IL executes during classification" was not enforced by the signature. The
  struck sentences are left below rather than quietly deleted, per the same rule
  round 8 applied to round 7's "payload-blind by signature".** O22 put the classifier on the registration
  as a delegate taking `(JobQueueItem, JobDeadLetter, AppDbContext, ct)` and called
  it "payload-blind by signature". **It was not.** Both entities carry the payload,
  the `AppDbContext` is writable, and the startup gate could only prove a delegate
  *existed* — so "payload-blind" and "its only permitted write is `external_state_*`"
  were conventions. Worse, because a classifier failure rolled the terminal
  transaction back, any deterministic classifier defect **recreated the #810
  infinite re-lease loop O21 exists to close** — through the very seam meant to close
  it. `JobRegistration` therefore carries an `ExternalStateStore<TScratch>`
  *descriptor* — ~~one `Expression<>` job-id selector over the type's **scratch
  entity** plus~~ a retention `TimeSpan` (O27 removed the selector) — and the engine
  builds the probe, runs it, and owns the
  whole decision (§4.2/§5.1). Blindness becomes structural: ~~the only value the type's
  code ever sees is a `TScratch`, so the payload is unreachable **by parameter type**;
  the selector is an expression tree EF translates to SQL, so **no type IL executes
  during classification** and a no-op/mutation/throw has no method body to live in~~;
  the probe answers a **`bool`**, so no write surface — and no value at all — leaves
  the boundary.
  > ⚠️ **Round 9 proved the struck clauses false (R9-3), and O27 fixes the vehicle
  > rather than the wording.** `Expression<Func<TScratch, Guid>>` constrains the
  > lambda's *type*, not its *body*: the body may contain method calls, may close over
  > an instance, and EF client-evaluates parameterizable fragments while translating
  > the rest. The startup probe proved one evaluation translated and returned — not
  > the tree's shape, and not the absence of side effects during client-evaluated
  > parameter extraction. The correct reading is that this item bought a **large real
  > reduction** in attack surface (the writable `DbContext` and the payload-bearing
  > entities are genuinely gone) and then **described that reduction as a guarantee it
  > had not bought**. O27 buys the guarantee by deleting the expression. The probe reads only *existence*: `external_state_prepared_at` comes
  from the marker on every branch and O23 makes marker = scratch `prepared_at` an
  enforced equality, so a second timestamp read would be a redundant path that could
  disagree with the marker. What O22 got right is preserved intact — store knowledge still lives on
  the registration, the engine still has **zero compile-time coupling** to
  `email_prepared_sends`, and a webhook/publishing store still adds a registration
  rather than an engine edit. **Decided over:** (a) O22's delegate with a narrowed
  input record (`ExternalStateClassificationInput` → `ExternalStateClassification`) —
  strictly better than O22 and the obvious fix, but it still hands back an executable
  body, so "cannot throw / cannot no-op / cannot loop" would remain a promise about
  behaviour rather than a property of the API, and the store access it needs would
  reintroduce either a `DbContext` or an arbitrary-SQL capability; (b) welding the
  engine to `email_prepared_sends` — rejected by O22 for reasons that still hold;
  (c) handing the delegate a read-only query capability — "read-only" over arbitrary
  SQL still reaches `job_queue.payload`, so it buys nothing structural. **Flagged
  because it trades expressiveness for enforceability**: the descriptor spans exactly
  "one scratch table, keyed by `job_id`, carrying a `prepared_at`" — today's
  `email_prepared_sends` and the shape §4.5 mandates of any prepared-state store — and
  a future store needing a compound key or a status column requires a **reviewed
  engine change** rather than type-supplied code. That is the intended direction of
  the trade, but it is a real constraint on Epic-D and should be objected to now if
  the owner expects heterogeneous prepared-state shapes. ~~Its one honest residue (an
  expression tree containing an untranslatable call) is closed by the startup gate
  executing every descriptor's probe at composition, and by O25 behind it.~~ (O27
  removes that residue by removing the expression; the startup gate and O28 remain
  behind the *store-availability* residue, which is real.)
- **O25 — Classification cannot fail the settlement (R8-1). — AUTHOR-DECIDED: a probe
  failure stamps a conservative audited `4 Missing` instead of rolling back (pending
  owner objection). SUPERSEDED BY O28 (mechanism + scope) AND O29 (the stamped
  state).** Round 9 found this item false **twice over**, and both are recorded rather
  than smoothed away: the mechanism it specified (a `catch`) **cannot** deliver the
  property it claimed, because a caught `PostgresException` leaves the PostgreSQL
  transaction aborted — so the settlement it promised would proceed could not proceed,
  and the job re-leased into the exact loop this item exists to close. And the state it
  chose (`4 Missing`) **traded that loop for a privacy violation**: `Missing` asserts
  proven absence and is swept by neither sweep batch, so possibly-present recipient
  and token bytes would survive 90 days instead of seven. The *direction* — settlement
  must not be revivable by a classification failure — is right and is kept; the
  absolute claim, the mechanism, and the state are all replaced. **The original text
  follows, superseded:** Under R7's contract, step 2 of the terminal transaction was
  inside F5's "any failure rolls the whole settlement back" rule — so an
  unclassifiable job returned to the queue, re-leased, dead-lettered, and rolled back
  forever. **A design cannot both claim to have closed the #810 loop class and route
  a new failure mode back into it.** Classification is therefore the **one step** of
  the five that cannot fail the settlement: ~~the engine catches a probe failure,
  stamps `4 Missing` with an `AuditLog` entry, and proceeds. This is what makes "no
  classifier defect can loop" a *property* rather than a hope — no classification
  outcome, including total probe failure, can revive a job that has exhausted its
  attempts.~~ (Struck by R9-1/R9-2: the `catch` cannot make the settlement proceed,
  and `4 Missing` cannot hold the bytes to seven days. See O28/O29.) **Decided over:** (a) leaving classification inside the rollback rule —
  keeps F5 uniform, but re-opens the exact loop; (b) stamping `0 None` on failure —
  silent, and `None` licenses a `Standard` requeue path for a job that may well have
  external effects; (c) letting the settlement proceed *unclassified* — violates
  `ck_job_dead_letter_external_state` and §4.2's totality. `4 Missing` is chosen
  because it is the **conservative** answer: it rejects requeue with
  `PreparedStateAnomaly`, alerts via §7.2's durable count, and turns an
  unclassifiable job into a visible terminal anomaly rather than a silent spin.
  **Flagged because it puts a deliberate hole in F5's uniformity** — §5.1 now reads
  "steps 3, 4, 5 roll back; step 2 cannot" — and because it means a systematic probe
  outage (a dropped store table) manifests as a burst of `Missing` anomaly alerts
  rather than as stalled jobs. That is the correct failure direction, but it is a
  paging consequence the owner should see.
- **O26 — The marker write proves its own entitlement (R8-3). — AUTHOR-DECIDED:
  policy read from the persisted row under lock + an active-transaction guard
  (pending owner objection).** O23 made the marker write fenced but left
  `StampExternalPreparedAsync(jobId, lockToken, preparedAt, db, ct)` taking **no
  policy proof and no transaction guard** — so §5.1's load-bearing claim that "the
  marker has exactly two writers, both reachable only for a
  `TransferExternalEffectState` type" was **assertion-by-call-site**: any
  same-assembly caller, `Standard` handlers included, could stamp, and F15's guard
  (which catches `job_queue` writes *outside* `Infrastructure/Jobs`) does not see
  calls *into* an engine method. Since §4.2's `Standard` → `None` and unregistered →
  `NeverPrepared` branches are sound **only** because that enumeration holds, an
  unenforced invariant there is a correctness hole, not a style point. The seam is now
  `IExternalPreparedMarker.StampAsync(StampExternalPreparedArgs, ct)`, which (1)
  refuses without an ambient caller transaction — otherwise the `UPDATE` autocommits
  and the rowcount-or-rollback rule cannot roll the scratch back; (2) re-reads the
  **locked queue row's persisted `job_type`** and refuses unless it resolves to a
  `TransferExternalEffectState` registration; (3) only then runs the fenced update;
  and (4) **rolls the ambient transaction back itself before every throw** — guard 2's
  zero-row result is a client-side condition, not a SQL error, so Postgres does not
  poison the transaction and a handler that caught the fence exception and committed
  anyway would land orphan scratch bytes; rolling back first makes that commit throw,
  so a catching handler commits nothing. The caller supplies **no `job_type`**, so the
  policy check is unforgeable, and it cannot opt out of the fence by catching.
  Correspondingly, §4.2 now classifies a marker on a `Standard`/unregistered row as
  an audited `4 Missing` **integrity failure** — a state no sanctioned writer can
  produce — rather than as `None`/`NeverPrepared`. **Decided over:** (a) trusting the
  call site plus an architecture guard listing permitted callers — a fresh caller is
  one edit away and the guard cannot see intent; (b) taking `job_type` as a parameter
  — forgeable, and precisely the assertion-by-call-site being removed; (c) a
  `TransferExternalEffectState`-only marker interface resolved from the registration
  — better, but the entitlement would still rest on which object the caller managed
  to obtain rather than on the row's persisted truth. **Flagged because it adds a
  `SELECT … FOR UPDATE` on `job_queue` to every PREPARE** (one extra round trip and a
  row lock held for the PREPARE's remainder, on the hottest engine table) and because
  it makes the lock order **domain → scratch → `job_queue`** load-bearing across
  PREPARE and terminal settlement. §4.5 states that order explicitly; no cycle exists
  against the sweep's DLQ → scratch order (R6-3), but it is now a rule future paths
  must respect.
- **O27 — The store descriptor carries no code at all; the engine reads the key from
  its own model (R9-3). — AUTHOR-DECIDED: delete the expression rather than validate
  it (pending owner objection). Supersedes O24 in API shape.** O24 replaced a
  delegate with an `Expression<Func<TScratch, Guid>>` and called the result "no type
  IL executes". **It was not.** A C# expression lambda may contain method calls and
  closures; EF client-evaluates parameterizable fragments while translating the rest;
  the signature constrained the *type* of the lambda, never its *body*. The
  descriptor is now `ExternalStateStore<TScratch>(TimeSpan Retention)` — its only
  member is a value, so **there is no field that can carry code**, which is why the
  property is now true. The engine derives the probe's key from the **EF model it
  already owns** (`TScratch`'s single `Guid JobId` primary key — §4.5's mandated
  store shape), builds `EF.Property<Guid>(s, key) == jobId` itself, and issues it with
  `IgnoreQueryFilters()` so a model-level filter cannot make present bytes read as
  absent. The startup gate validates the model shape (mapped entity; exactly one PK
  property; `Guid`; named `JobId`) before the probe check. **Decided over:** (a)
  keeping the expression and **validating the tree** at composition — a direct
  `MemberExpression` rooted at the lambda parameter, no calls/closures/indexers — the
  reviewer's own fallback and genuinely sound, but it makes the safety property
  depend on a **hand-written tree-walker being exhaustive over the whole
  `Expression` node taxonomy**, which is a much larger thing to get right than "the
  record has one `TimeSpan` field", and every future C# expression feature is a new
  hole to re-audit; (b) an engine-owned `IExternalPreparedState { Guid JobId { get; }}`
  interface constraint — cleaner to read, but it puts a **property getter** (real IL)
  back on the type, and the guarantee would again be "we never invoke it" rather than
  "there is nothing to invoke"; (c) welding the engine to `email_prepared_sends` —
  rejected by O22 for reasons that still hold. **Flagged because it narrows the
  descriptor further than O24 did, and O24's narrowing was already flagged**: a
  prepared-state store may now be described **only** if its EF primary key is a single
  `Guid` property **named `JobId`**. A store keyed by the same column under a
  different property name, or by a compound key, or a store wanting a status column,
  is now a **reviewed engine change** — not a registration. This is the second
  consecutive round in which expressiveness has been traded for enforceability in the
  same place, and the owner should object **now** if Epic-D is expected to carry
  heterogeneous prepared-state shapes, because the third such trade will be a
  refactor rather than an edit.
- **O28 — The probe is a savepoint-isolated subtransaction, and the exemption covers
  recoverable statement errors only (R9-1). — AUTHOR-DECIDED: name the boundary
  instead of widening the claim (pending owner objection). Supersedes O25's mechanism
  and scope.** O25 said classification "cannot fail the settlement" and implemented it
  with a `catch`. **In PostgreSQL a SQL error aborts the transaction**, and catching
  the .NET exception restores nothing — so on the very failure O25's mandated test
  produces (a dropped store table), the audit insert, DLQ insert, fenced delete, and
  commit **all** fail with `25P02`, the settlement rolls back, and the job re-leases:
  the #810 loop, re-entered through the item written to close it. The probe is
  therefore wrapped in a **named savepoint** (`external_state_probe`): created before
  the probe, released on success, and **rolled back to** on a recoverable statement
  error — a PostgreSQL subtransaction primitive that genuinely restores the enclosing
  transaction, which a `catch` does not. The exemption is then stated at its true
  width: **recoverable statement errors are contained; a broken/lost connection, an
  already-aborted outer transaction, and a failing rollback-to-savepoint are not** —
  those rethrow and follow **ordinary settlement retry**, exactly as they would for
  steps 3–6. That is enough, because the loop class is produced by *deterministic*
  failure and every deterministic probe failure is a statement error. **Decided
  over:** (a) probing on a **separate connection/transaction** — fully isolates the
  failure, but the probe would then read state outside the terminal transaction's
  snapshot, breaking "the probe observes the external state as of the failure" (R7-1's
  ordering requirement) and adding a second connection per settlement; (b) probing
  **before** opening the terminal transaction — same snapshot problem, plus it
  reintroduces a window where a terminal hook could write the store between probe and
  classify; (c) keeping the `catch` and *also* claiming the absolute property —
  rejected on sight: that is the round-7/8/9 defect verbatim. **Flagged because it
  narrows a claim the owner may have been relying on**: "classification can never
  roll the settlement back" is **not** true and is no longer written anywhere. It is
  true for statement errors. Also flagged because savepoints have a real cost — each
  one is a subtransaction, and PostgreSQL's subtransaction machinery degrades sharply
  past ~64 nested/concurrent subtransactions per transaction. This design creates
  **exactly one, non-nested, per terminal settlement**, released immediately on the
  success path, so the pathological case does not arise; it is stated so a future path
  does not casually add more.
- **O29 — Probe failure gets its own durable state (`6 Unclassified`), and the
  prepared-state sweep selects it (R9-2). — AUTHOR-DECIDED: represent unknown
  presence honestly rather than reuse `Missing` (pending owner objection). Supersedes
  O25's stamped state.** O25 mapped a failed probe to `4 Missing`. `Missing` means
  **proved absent** — and the design's own SQL believes it: the prepared-send sweep
  selected `external_state_status = 1` only, and the orphan batch deletes only rows
  matching **neither** a live queue row nor a DLQ row. A `Missing` DLQ row matches the
  DLQ relation, so it is not an orphan; it is not `Present`, so the expiry batch skips
  it. **Bytes behind it are selected by nothing** and survive until the 90-day DLQ row
  disappears — recipient addresses, bodies, and provider tokens held for 90 days
  under a design whose stated cap is seven (O16), while §4.5's prose claimed a DLQ row
  protects bytes "exactly until its recorded expiry". Round 9's summary is exact: the
  lease loop was traded for a privacy violation. So probe failure now stamps
  **`6 Unclassified`** — "a PREPARE committed; presence unknown" — carrying the
  marker-derived `external_state_prepared_at` and `external_state_expires_at` (it is
  reached only for a `TransferExternalEffectState` type, so a descriptor and a
  retention always exist). The sweep's DLQ-expiry batch predicates on
  `external_state_status IN (1, 6)`, so if the bytes exist at the recorded cutoff they
  are **deleted and stamped `2 Expired` in the same statement**, and the earlier
  anomaly survives in **audit history** (the classification-time `6 Unclassified`
  audit row, plus `priorStatus` on the sweep's own audit row) even though the status
  column moves on. Requeue rejects `6` fail-closed with `PreparedStateAnomaly`: it may
  neither transfer (the bytes may be gone) nor re-prepare fresh bytes under a new key
  (they may be present — the licence O20 exists to deny). **Decided over:** (a)
  reusing `4 Missing` with the sweep widened to `status IN (1, 4)` — the reviewer's
  own stated minimum, and it does close the retention hole, but it makes `Missing`
  mean "absent **or** unknown", which destroys the one distinction §4.2 was built to
  preserve (`Expired` vs. `Missing` — policy vs. anomaly) and makes
  `dlq_external_state_missing` un-actionable: an operator could no longer tell a
  data-loss incident from a dropped table; (b) stamping `1 Present` on probe failure —
  gets the sweep for free and is fail-*open* in the wrong direction: it would let
  requeue **transfer bytes that may not exist**, minting a job that skips rendering
  and sends nothing; (c) leaving the classification and re-probing at sweep time — the
  sweep's `JOIN` already answers exactly that question, so this adds a path and no
  information. **Flagged for three costs.** It adds a **seventh value (`6`) to
  `ExternalStateStatus` and to `ck_job_dead_letter_external_state`** — the enum and
  the CHECK are now the two artefacts that must stay in step, and 2A-R's migration
  carries both. It gives Phase 4's dashboard a **new terminal state to render** and
  §7.2 a **second anomaly gauge** (`dlq_external_state_unclassified`, deliberately not
  summed with `Missing`: they page differently — one means bytes vanished, the other
  means the store is unreachable; **R10-4 then found that gauge had no warning
  condition and no alert route at all — §7.2 now defines both**). And it means a
  systematic store outage produces a burst of `6 Unclassified` rows whose bytes are
  then **deleted — by the first sweep pass at or after the recorded cutoff —
  without anyone ever establishing whether they existed**; that is the correct
  direction (the privacy cap wins over forensic certainty), but it is a real
  consequence and the event history is the only thing that preserves the question
  was ever open.
  > ⚠️ **Round 10 corrected two things here (R10-2/R10-7).** "Deleted **at** seven
  > days" was an overclaim: the recorded cutoff makes the bytes **eligible**; a
  > periodic sweep deletes them, and nothing bounds the lag (**K-3**). And the
  > sentence assumed these rows eventually resolve — for a status-6 row whose bytes
  > turn out to be **absent**, nothing resolves it, and R10-1's retention exemption
  > now makes it permanent (**K-1**). Both are stated, neither is closed.

- **O30 — Engine evidence goes to a new `job_dead_letter_events` table, not to
  `audit_logs` (R10-3). — AUTHOR-DECIDED: new table (pending owner objection).**
  R10-3 asked for the missing classification-audit *writer*. Specifying it surfaced
  something worse than a missing step: **the audit target this document had been
  naming since round 5 does not exist.** §4.5's sweep statement read `INSERT INTO
  audit_logs (action, subject_type, subject_id, metadata, occurred_at)` and the real
  table (`apps/api/Modules/AuditLogs/Entities/AuditLog.cs`,
  `20260511120526_Init`) has **none of those four columns** — and its `user_id` is a
  **non-nullable `Guid` with `FK_audit_logs_users_user_id`**. The classifier and both
  sweeps are engine code with **no user**. Every "immutable `AuditLog` entry" this
  document promised for an engine transition was **unbuildable**, and no round caught
  it because no round tried to write the insert. **Decided over:** (a) a seeded
  "system" user — it puts a fabricated actor in the one table the platform trusts for
  accountability, and every future system writer inherits the lie; (b) making
  `audit_logs.user_id` nullable — a schema change to a shipped, widely-written
  production table, plus `required Guid UserId` and a required navigation on the
  entity, to serve one consumer; (c) reusing `details` on the DLQ row itself — a
  single mutable column cannot hold an ordered history, which is the entire point
  (the `6 → 2` overwrite is what the evidence exists to survive). **Flagged for three
  costs.** It is a **new engine table + migration + entity + `DbSet`** in Phase 2A-R.
  It **splits** DLQ auditing by actor — staff requeue keeps `audit_logs` via
  `IAuditLogService`; engine transitions go here — so a Phase-4 dashboard rendering a
  DLQ row's full history must read **two** tables and merge them by time. And
  `ON DELETE CASCADE` means the evidence dies with its DLQ row at 90 days, which is
  the right coupling but does mean **no engine anomaly record outlives
  `JOB_DEAD_LETTER_RETENTION_DAYS`** (see K-2).
- **O31 — DLQ retention is gated on persisted status, never on a duration
  relationship (R10-1). — AUTHOR-DECIDED: status predicate (pending owner
  objection).** `job-dead-letter-retention` may not delete a row with
  `external_state_status IN (1, 6)`. **Decided over** the obvious alternative — a
  startup validation that `JOB_DEAD_LETTER_RETENTION_DAYS >
  EMAIL_PREPARED_SEND_RETENTION_DAYS`. That was rejected on the same grounds R6-2
  rejected retroactive retention: `external_state_expires_at` is materialized **per
  row** from the value in force at *its* dead-letter, so a validated ordering
  protects a row only while the config that created it still stands. Any later edit
  re-opens the hole for every outstanding row, and the validation would give false
  confidence that it had not. A status predicate is indifferent to both windows, to
  edits, and to sweep order. **Flagged for its cost:** a bytes-possible row is now
  **exempt from age retention until something resolves it**, and §4.5's resolution
  batch resolves only the `1 Present` half. The `6 Unclassified` half is **K-1** —
  the one place this design knowingly trades unbounded row growth for refusing to
  manufacture a claim it cannot support.
- **O32 — Invitation expiration (#425). — OWNER-RATIFIED 2026-07-17: derived at
  read time; no sweep job and no persisted `Expired` status.** Invitations store
  an expiry timestamp, and expiration is computed at read time. The existing
  database CHECK constraint continues to forbid a persisted `Expired` status. A
  sweep would only write down a fact that is already computable and would be
  correct only until its next run; the derived value is correct the instant the
  deadline passes. Persisting the status would be justified only if directly
  querying or filtering expired invitations in SQL later becomes a requirement.
  #425 is closed as satisfied by the existing design.

### Known open items — read this before building (round 10, final)

**Why this section exists.** The challenge loop ended at round 10 by owner
decision, **not** at a MERGE-READY verdict. The items below are findings this
document does **not** close. Each names its consequence. They are listed here
because a reference that names its own gaps can be built against safely and one
that hides them cannot — **nothing below is a reason not to build 2A-R/2B/2C; each
is a bounded, stated defect with a phase that should own it.**

| # | Open item | Consequence if built as-is | Should be owned by |
| --- | --- | --- | --- |
| **K-1** | **An absent `6 Unclassified` DLQ row has no resolution path, and is now exempt from age retention forever.** R10-1's predicate (O31) makes `IN (1, 6)` undeletable by `job-dead-letter-retention`; §4.5's resolution batch deliberately resolves only `1 Present` (R10-7 — stamping `Missing` on a status-6 row would assert an absence nobody proved). **No operator triage operation is specified anywhere in this document.** | These rows **accumulate without bound**. `JOB_DEAD_LETTER_RETENTION_DAYS` does **not** apply to them, so "90-day DLQ retention" is false for this state. `dlq_external_state_unclassified` (§7.2) stays breached indefinitely, and a permanently-firing condition is one operators learn to mute — which would then also mute a real store outage. **Bounded in practice by how rare a probe failure with subsequently-absent bytes is; unbounded in principle.** | **Phase 3 or 4** — needs a real triage operation: a permissioned staff action that re-probes (with its own savepoint + event semantics, §5.1's boundary) or accepts an operator's explicit resolution to `4 Missing`, writing a `detected_by = 'operator'` event. **Not** a widened sweep predicate. |
| **K-2** | **`job-dead-letter-retention` deletes `4 Missing` rows at 90 days, silently clearing their alert.** `4 Missing` is not bytes-possible, so O31's predicate does not exempt it; the row and (via `ON DELETE CASCADE`) its evidence go at the age floor. §7.2 says the `Missing` condition "stays alerting until the rows are triaged" — but retention also ends the alert, **without triage**. | An untriaged integrity anomaly can **age out of existence**, taking `dlq_external_state_missing` back to 0 and deleting the `job_dead_letter_events` rows that recorded it. The alert recovers with nothing fixed. | **Phase 3** — either exempt `4` from age retention too (and inherit K-1's growth problem), or require an explicit triage stamp before a `Missing` row becomes age-eligible. This document **does not decide it**; R10-1's captain steering scoped the exemption to bytes-possible rows and that scope is honoured literally. |
| **K-3** | **Nothing bounds the lag between "eligible for deletion" and "deleted".** R10-2 is *weakened*, not closed. `external_state_expires_at` makes bytes eligible; the sweep deletes them on its next successful pass. Cron cadence is a Phase-3 build-spec item, and the schedule lives in `system_job_definitions` where an operator can edit or **disable** it. `EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES` is an **alert threshold, not an enforcement** — nothing deletes because it elapses. | The **seven-day privacy cap (O16) is a cap on *eligibility*, not on residency.** If the sweep is down, disabled, or unscheduled, token-bearing recipient/body bytes stay on disk past their advertised cutoff for the duration of the outage. `jobs.prepared_state.sweep_overdue` makes this **visible**, and requeue still **fails closed** at the exact instant — but visibility is not a bound. | **Phase 3** — set the cadence, and decide whether disabling `email-prepared-sends-retention` should be prohibited at the definition level (the other sweeps are not privacy-load-bearing; this one is). |
| **K-4** | **True orphans have no recorded boundary and are therefore retroactively retained.** A prepared row with neither a `job_queue` nor a `job_dead_letter` row (crash residue between outcome and cleanup) never had an `external_state_expires_at` materialized. The orphan batch deletes on `prepared_at + the current EMAIL_PREPARED_SEND_RETENTION_DAYS`. | Editing the env var moves the boundary for outstanding orphans **in both directions** — the one place the prospective-retention guarantee (§4.5) does not hold, which is why that guarantee is now stated with orphans excluded by name. | **Nobody — this is a stated residue, not a bug to file.** It is unfixable by reading a boundary that was never written. R10-1's exemption keeps the class small: **no DLQ-protected row becomes an orphan through retention**; orphans arise only from crash residue. |
| **K-5** | **The `details` jsonb has no structural guard against sensitive material.** §4.2 states what is enforced (the classifier holds no bytes to leak — its probe is an existence check over a `Guid JobId`, R9-3/O27) and what is not: nothing stops a future engine change from writing more into the column. | A later contributor extending the classifier could put recipient/body material into `details`, and `job_dead_letter_events` inherits the DLQ row's 90-day retention — re-opening O16 through a table O16 never considered. | **Phase 2A-R** — the `JobDeadLetterEventWriter` reflection guard proves *who* writes; a stronger form would type `details` as a closed record the writer serialises. Stated as a convention with a named owner, **not** claimed as structural. |
| **K-6** | **§4.4's provider-evidence transitions have the same actor-less-`AuditLog` problem, and this round did not fix them.** O30 found that `audit_logs.user_id` is `NOT NULL` with an FK to `users`, so engine code cannot write it — and §4.4 says every `email_log` provider-evidence transition writes "an existing `AuditLog` entry" atomically. **A provider webhook has no user either.** The fix is mechanically the same shape as `job_dead_letter_events` (an actor-less, append-only evidence table keyed to the `email_log` row), but §4.4 has been quiet for rounds and round 10's steering was explicit that every finding is in the prepared-state seam. **Redesigning §4.4 unreviewed, in the round with no reviewer, is the larger risk** — so it is named here instead of edited. | The Phase-2C-R1/Phase-3 build of §4.4's state machine will hit the same wall: the specified audit write does not compile. Discovered at build time rather than design time. **The `email_log` state machine and its conditioned transitions are unaffected** — only the audit sidecar is. | **Phase 2C-R1** — apply O30's pattern to §4.4, or route provider evidence through the same `job_dead_letter_events` shape under a `email_log_events` table. Decide it in a normal design pass, not in a final remediation round. |

**Also open: the O-item ratification backlog.** **O6–O31** are **author-decided,
pending owner objection** — twenty-six decisions whose mechanisms are
implementation-authoritative but which no owner has ratified. O27–O31 were decided
in the last two rounds and carry the largest costs (a descriptor that can only
describe a single-`Guid JobId` store; a narrowed classification-failure guarantee;
a seventh status value; a new engine table; unbounded retention for one anomaly
state). **O8 sits after O9 by design** — it was added a round later and is kept in
position so round 1's record still cites it accurately; the ordering is intentional
and is **not** a gap.

**And carried forward: the captain-alignment items.** R6-1 (634 has no
`schedule_epoch`), R3-2/R3-3/R5-2/R6-4 (the 633/809 tips have no marker, no
`external_state_*` columns, no descriptor/classifier, and placeholder
registrations), and the ⚠️ **suspected live defect** on
`origin/feat/809-email-jobs-fold` (§10). **No code branch is edited by this
document** — these are reconciliation work, not doc gaps.

> **2026-08-25 — #865 closes K-3's bound half.** The prepared-state residency
> window is now bounded by construction and observed end to end:
> `SyncSystemJobsJob.ReconcileAsync` consults the explicit domain policy
> (`Modules/Jobs/SystemJobDisableProtection`) and reverts — never honors — any
> disable of `email-prepared-sends-retention`, the one privacy-load-bearing
> sweep, logging a per-attempt WARNING that names the cause, the key, and the
> next action; every other sweep stays freely operator-disableable.
> `JobQueueMonitorService` now samples `jobs.prepared_state_overdue_seconds`
> (the age of the OLDEST already-deletable orphan still on disk, anti-join +
> retention floor read at execution, inside the same single-statement snapshot)
> in every 60 s cycle, emits it as an observable gauge on the `PublyApp.Jobs`
> meter, and raises `prepared_state_sweep_overdue` past
> `EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES`. Residency is therefore bounded by
> retention floor + cadence gap (the seeded 10-minute cron, already pinned by
> spec), with the silent-disable path removed and any residual lag visible.
> Stated residue: a hard-DELETE of the protected definition row is repaired at
> the next boot by the idempotent seeder, not auto-repaired while running.

### Ratification record

**Status vocabulary.** Only decisions explicitly attributed to the owner below
are **owner-ratified**. **O6–O31** are **author-decided, pending owner objection**;
**O32** is separately owner-ratified by the 2026-07-17 #425 ruling. Of O1–O5,
O1 and O4 are superseded. The O6–O31 mechanisms are
implementation-authoritative meanwhile, but this record does not relabel silence
as ratification. (O8 is listed after O9 above: it was added a round later and is
kept in its original position so the round-1 record below still cites it
accurately. The ordering is intentional, not a gap.) The "Known open items" table
above is the short form of what this backlog costs.

**How to read the chronological record below.** Each entry records the **state
after that round; later entries may supersede it.** Entries are never rewritten to
match the current design — that is the point of keeping them — so where a bullet
was later overturned it is annotated inline with the round that overturned it. The
sections above are the only authority on current behavior.

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
owner: *"I want the correct way of doing things from now"*): originally framed
as an append-only terminal record, keeping the queue delete-on-success. Round 3
clarifies that later provider evidence uses narrowly allowed, atomically audited
state transitions (O14), so the current contract does not claim row immutability.
O2 carries over generalized to all `job_queue` inserts; O3
unchanged; O5's `Modules/Messaging/` module is repurposed for `EmailLog` and the
email enums. Sections §2 (D2), §4.4/§4.6, §5.4/§5.5, and the Phase-2C build
order reflect this revision; O6 (historical sent-row copy) is newly flagged.

**2026-07-16 (same night) — sol@high audit absorbed (6 blockers / 15 majors;
findings summarized in this record), owner mandate: correct-by-design,
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
10 majors / 3 minors;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r1-findings.md`).**
Every finding was resolved as a *mechanism*, grounded in the implemented reality
of `origin/feat/633-job-queue-core` and `origin/feat/634-app-role-quartz`:
- **C1 (prepared envelope, F7):** two-phase send — a **committed PREPARE**
  transaction persisting canonical request bytes as **`text`** (not `jsonb`),
  then a separate **locked SEND**; transient failure keeps the committed scratch;
  cleanup is a **live-state anti-join** on `job_queue`/`job_dead_letter`, never
  age alone (§4.5/§5.4/§7.3). *(Superseded: `text` → **`bytea`** by R2-2's
  byte-faithful transport; "never age alone" → a **recorded**
  `external_state_expires_at` boundary by R4-3/O16 and R6-2 — see §4.5.)*
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
  timestamps added; global gauges **leader-gated** (§7). *(Superseded: leader-gated
  gauges → **per-replica, instance-tagged sampling with condition-level
  aggregation** by R2-10, precisely because leader-gating blinded the fleet on
  leader loss — see §7.2.)*
- **C13 (self-contained claim):** authoritative scope **narrowed to Phases
  2A-R/2B/2C**, Phase 3/4 marked design-direction with build-grade contracts
  where they are core dependencies; **O6/O7 author-decided pending owner
  objection**, **O8**
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
7 majors / 1 minor / 1 editorial;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r2-findings.md`).**
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
  Serilog exception-redaction boundary (§4.6/§5.1; 633 log-call gap
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

**2026-07-17 — PR #852 merge-challenge round 3 remediated (2 merge-blockers /
4 majors / 2 minors / 1 editorial;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r3-findings.md`).** All
nine findings are absorbed as mechanisms:

- **R3-1 (catch-up resurrection, blocker):** durable per-definition
  `reconciled_through` high-watermark, definition-row lock, exclusive
  `(watermark, cutoff]` scan, and atomic advance; prune → reconcile twice never
  resurrects (§4.3/§5.3/§7.3; O10).
- **R3-2 (external-effect requeue, blocker):** `JobRegistration` per-type requeue
  policy; email DLQ retains and atomically transfers the original prepared bytes,
  hash, and provider identity to the new job; ambiguous acceptance → DLQ →
  requeue proves identical bytes/key and one effect (§4.2/§4.5/§5.4; O11).
- **R3-3 (2C-R1 wiring):** parallel development is distinct from strict deploy
  order `2A-R → 2B → 2C-R1`; 2C-R1 owns `JobsServiceRegistration.cs` listener,
  signal, and three email-registration edits plus an exact-set gate (§10).
- **R3-4 (renewal safety):** validated 10-second lease floor, DB-derived deadline
  timer, every retry sleep capped to remaining safe time, and honest cooperative
  cancellation wording; fencing plus idempotency/provider identity remain the
  correctness mechanisms (§3.1/§5.1/§9; O12).
- **R3-5 (Serilog backstop):** `SanitizingLogEventSink` replaces/removes the
  special `LogEvent.Exception` before both real sinks; the actual rendered
  console/file outputs are canary-tested (§5.1/§9; O13).
- **R3-6 (alert dedup):** pure-Postgres condition/window lease table, stable
  receiver idempotency key, exact non-locking `pg_locks` leader probe, `instance`
  on every instrument, and N-replica/one-notification gate (§7).
- **R3-7 (fold bridge):** exact shipped compound marker
  `Cancelled + 'folded to job_queue'`; proof by the old dispatcher's
  Pending/stale-Processing-only claim predicate; R1/R2 exact-value specs (§4.6).
- **R3-8 (`email_log` mutability):** stopped claiming immutable append-only rows;
  allowed provider-evidence transitions are conditioned and write an immutable
  `AuditLog` entry atomically, without a new table (§4.4; O14).
- **R3-9 (metadata/provenance):** opening status covers rounds 1–3; owner-ratified
  and author-decided statuses are separated; all three challenge records are
  committed under `docs/reviews/jobs-infra-design-challenge/` and cited by stable
  repository paths (§11).

New author-decided items pending owner objection: **O10** high-watermark,
**O11** external-effect state-transfer requeue, **O12** 10-second lease floor,
**O13** Serilog sink wrapper, and **O14** audited `email_log` transitions. Known
code-alignment items for the captain: R3-1 (634 high-watermark), R3-2 (633/809
requeue state), R3-3 (809 placeholder registrations), R3-4 (633 renewal + 634
validator), and R3-5 (633 logging sink). No disputes this round.

**2026-07-17 — PR #852 merge-challenge round 4 remediated (0 blockers /
5 majors / 2 minors;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r4-findings.md`).** All
seven findings are absorbed as mechanisms:

- **R4-1 (watermark monotonicity + schedule revisions, major):** reconciliation
  advances with `GREATEST(reconciled_through, cutoff)`; a persisted policy
  fingerprint detects cron/timezone/gap-policy revisions; edits and
  disabled→enabled transitions atomically reset the watermark to database `now()`
  and never back-fill under the new schedule. Sparse-cron, cron-edit, and
  disable-past-retention specs bind the contract (§4.3/§5.3/§9; O15).
- **R4-2 (Quartz live misfire, major):** every dynamic cron trigger uses
  `WithMisfireHandlingInstructionDoNothing()`; durable reconciliation is the sole
  catch-up authority, with a live-scheduler pause/misfire spec. The 634 default
  `WithCronSchedule` call is an explicit code-alignment item (§5.3/§9).
- **R4-3 (prepared-byte retention, major):** email-DLQ requeueability ends at the
  prepared-send window (default seven days); older DLQ rows remain auditable but
  lose sensitive request bytes and render non-requeueable, with an explicit
  new-logical-send operation for staff (§4.2/§4.5/§7.3/§10; O16).
- **R4-4 (migration-runner role, major):** the Docker `migrate` target, staging
  migrate service, Dokploy migrate job, and every production-like migration
  invocation are enumerated and pinned `APP_ROLE=api`; Phase 2B's gate builds and
  runs the migrate target. Exact lagging files are captain-alignment items
  (§3.1/§3.3/§10).
- **R4-5 (alert receiver idempotency, major):** v1 alert delivery is explicitly
  at least once; the DB lease prevents concurrent attempts but ambiguous
  accept/lease-expiry races may duplicate, and the stable key is best-effort.
  Exactly-once is a named receiver-contract follow-up (§7.2/§9/§10; O17).
- **R4-6 (prepared-state lineage predicate, minor):** every DLQ relation uses
  exact predicate
  `job_dead_letter.original_job_id = email_prepared_sends.job_id`; the first-DLQ
  → requeue transfer → re-dead-letter test proves each hop (§4.2/§4.5/§7.3/§9).
- **R4-7 (#811 rollout boundary, minor):** the locked-eligibility guarantee begins
  only at R2 quiescence. R1's old-semantics drainer race is documented as an
  accepted, bounded rollout condition; no soon-retired drainer hardening is
  claimed (§1/§4.6/§9/§10).

New author-decided items pending owner objection: **O15** prospective
schedule-revision resets, **O16** seven-day email-DLQ requeueability, and **O17**
at-least-once alert delivery with a receiver-contract follow-up. Captain
code-alignment items: R4-1/R4-2 (634 watermark/revision/misfire), R4-4
(`apps/api/Dockerfile`, `docs/front-migration/staging-deploy.md`, and Dokploy
migrate shape), plus the R4-3/R4-6 email sweep/requeue behavior when 809 is
reconciled. No disputes this round.

**2026-07-17 — PR #852 merge-challenge round 5 remediated (0 blockers /
2 majors / 1 minor;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r5-findings.md`).**
Round 5 graded five of seven round-4 items **Absorbed** (R4-2, R4-4, R4-5, R4-6,
R4-7) and two **Weakened** (R4-1, R4-3) — in both cases because the round-4 text
fixed the durable-history half of the defect and asserted the rest. All three
findings are resolved as mechanisms:

- **R5-1 (un-fenced live trigger + lock-order inversion, major; was R4-1/O15):**
  the watermark reset fixed history but not the RAM-store trigger already
  registered under the old cron, which could fire inside the ≤60 s sync window and
  persist an occurrence from a superseded schedule (the occurrence PK cannot catch
  it — the old fire time is genuinely unique). Now **every dynamic trigger carries
  its schedule's `schedule_policy_fingerprint` in the `JobDataMap`**, and a
  fingerprint change makes `SyncSystemJobsJob` **replace** the trigger rather than
  leave it. `EnqueueSystemJobJob` opens its transaction with `SELECT … FOR UPDATE`
  on the definition, then requires enabled + not-soft-deleted + an **exact**
  fingerprint match; a mismatch is a **logged, counted, non-error no-op**
  (`reason = superseded-schedule`), with reconciliation owning catch-up. Both
  occurrence-writing paths now take **definition-first lock order**, removing the
  inversion (reconciliation locked-then-inserted while delivery
  inserted-then-stamped `last_enqueued_at`) that could deadlock on occurrence-PK
  vs. definition-row at a same-tick collision. Two new specs bind it: forced
  old-trigger fire after a cron edit → zero occurrences/zero jobs; concurrent
  live-fire ∥ reconciliation → no `40P01`, no lost occurrence (§4.3/§5.3/§9; O18).
  *(Superseded in part: the **fingerprint** fence is replaced by a distinct
  **`schedule_epoch`** at R6-1 — a repeating hash cannot fence the `A → B → A`,
  disable→enable, and delete/recreate ABA cases. The trigger-carried token,
  replace-don't-mutate rule, exact match under the definition lock, non-error
  no-op, and definition-first lock order all stand; only the token changed. See
  O18 and the round-6 entry.)*
- **R5-2 (expiry destroyed its own evidence, major; was R4-3/O16):** the 7-day
  cutoff is anchored to `email_prepared_sends.prepared_at`, but the sweep deletes
  that row and the DLQ stored neither the timestamps nor a status — so requeue and
  the dashboard could only ever observe "missing" and could not distinguish
  policy-driven expiry from premature loss (`failed_at` is not a substitute;
  "reports the affected DLQ ids" is log output, not queryable state).
  `job_dead_letter` now persists `external_state_status`
  (`None`/`Present`/`Expired`/`NeverPrepared`/`Missing`/`Transferred`),
  `external_state_prepared_at`, `external_state_expires_at`, and
  `external_state_expired_at`, with DDL + CHECK constraints + indexes in §4.2. The
  sweep became **one statement**: delete the bytes, stamp `Expired`, write the
  audit entry — together or not at all (§4.5 SQL). Requeue and the dashboard read
  that durable status: `Expired` → `PreparedStateExpired` + the non-requeueable
  label + the separately permissioned new-logical-send path; `Missing` → an
  audited, alerted `PreparedStateAnomaly`, **never** silently treated as expiry.
  The §5.4 sentence still saying cleanup waits until DLQ lineage is gone (the
  pre-O16 policy) is corrected. New spec: post-sweep, from a **fresh context**, the
  dashboard/requeue query returns `Expired` (§4.2/§4.5/§5.4/§7.3/§9/§10; O19).
- **R5-3 (alert-lease retention asserted but unspecified, minor):**
  `job_alert_delivery_leases` claimed pruning "older than the alert audit window"
  with no duration, no config, no sweep in §7.3, no Phase-3 entry, and a PK
  `(condition_key, window_started_at)` that cannot serve a global age sweep. Now:
  `JOB_ALERT_LEASE_RETENTION_DAYS` (default 30, validated ≥ 1) in §3.1,
  `ix_job_alert_delivery_leases_window_started_at` **leading with the sweep's
  predicate column**, and a named `job-alert-lease-retention` batched sweep in
  **both** §7.3's inventory and Phase 3's build order — using the existing
  indexed/ordered-batch/`SKIP LOCKED` idiom (now stated once in §7.3 as the shape
  all five sweeps share), not a new one. Writing that shape down exposed the same
  defect in three of the four pre-existing sweeps: `email_log`'s indexes lead with
  `kind`/`recipient`, `job_dead_letter`'s with `job_type`, and
  `email_prepared_sends` has only its `job_id` PK — so none could serve their own
  global age sweep either. **`ix_email_log_occurred_at`,
  `ix_job_dead_letter_failed_at`, and `ix_email_prepared_sends_prepared_at` are
  added** (assigned to 2A-R/2C-R1 by table owner); fixing one table and leaving
  three identical gaps would have left "the existing idiom" with no index behind
  it (§3.1/§4.2/§4.4/§4.5/§7.2/§7.3/§9/§10; O7).

New author-decided items pending owner objection: **O18** (fingerprint trigger
fence + definition-first lock order) and **O19** (DLQ external-prepared-state
status model); **O7** extended with the alert-lease window. Captain
code-alignment items: **R5-1** (634 stamps only `job_key` into the `JobDataMap`
and does not lock the definition on the delivery path) and **R5-2** (633
`job_dead_letter`/`JobDeadLetter.FromJob` have no `external_state_*` columns and
stamp no status). No disputes this round.

**2026-07-17 — PR #852 merge-challenge round 6 remediated (0 blockers /
4 majors / 1 editorial;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r6-findings.md`).**
Round 6 graded R5-3 **Absorbed** (including the three extra global-age indexes,
ruled correct scope) and R5-1/R5-2 **Weakened**. Findings rose 3 → 5 because
round 5 added +615 lines of new mechanism and every round-6 major is a defect
*inside that new text* — the round-6 remediation is therefore deliberately
surgical, and states each new rule once (the §4 lock-order rule, §5.1's settlement
shapes, §4.2's marker table) with cross-references rather than restatements.

- **R6-1 (fingerprint is not an epoch fence, major; was R5-1/O18):** **the round-5
  decision is reversed, and O18 records the reversal rather than being edited into
  looking right.** Its argument — that a monotonic revision "would get `A → B → A`
  wrong" — conflated **policy equality** with **registration-epoch identity**. Both
  answers are needed and they point opposite ways in that very case: the newly
  registered A trigger *should* be accepted; a delayed execution acquired under the
  *first* A epoch *should not*. A repeating hash cannot separate them, so the
  fingerprint fence admitted stale fires — an ABA hole equally open for
  disable→enable and delete/recreate of the same `job_key` and policy, and one the
  occurrence PK cannot catch (the stale fire's `scheduled_fire_at` is unique). Now
  `system_job_definitions.schedule_epoch` (a **random uuid**, chosen over a counter
  because it composes with delete/recreate) is re-drawn on every revision, every
  disable→enable, and every recreation; `SyncSystemJobsJob` stamps the **epoch**
  into each trigger's `JobDataMap`; `EnqueueSystemJobJob` requires an **exact epoch
  match** under the definition lock. The **fingerprint stays as the revision
  detector** — two fields, two questions, said once in §4.3. Specs extended to
  `A → B → A`, disable→enable, and delete/recreate, each with a delayed old
  execution landing after the definition returns to identical state, plus a control
  run that fences on the fingerprint and fails (§4.3/§5.3/§9/§10; O18).
- **R6-2 (the materialized boundary was neither the sweep's boundary nor the
  requeue gate, major; was R5-2/O19):** **PROSPECTIVE semantics, made real.**
  `external_state_expires_at` is now authoritative on **both** paths: the sweep
  predicates on `d.external_state_expires_at <= now()` (no retention env var
  appears in its SQL) and requeue requires `now() < external_state_expires_at`
  under the lock — an expired attempt atomically performs the same
  delete + `Expired` + audit transition, commits, and returns
  `PreparedStateExpired`, closing the window where a row stayed `Present` and
  requeueable past its own cutoff until the async sweep caught up. A
  retention-config change is **prospective only** (O7): already-materialized rows
  keep their recorded expiry, so the durable timestamp can never disagree with
  actual deletion. New specs: requeue rejected after the cutoff *before the sweep
  has run*, and a config change in both directions leaving existing rows untouched
  (§4.2/§4.5/§7.3/§9; O7/O19).
- **R6-3 (lock-order inversion + a `Missing` branch that could not both persist and
  roll back, major; was R5-2/O19):** the requeue/sweep inversion is the **same
  defect class** as R5-1's, so the rule is now stated **once** in §4 —
  `system_job_definitions` before `system_job_occurrences`; **`job_dead_letter`
  before `email_prepared_sends`** — and both pairs' paths cite it instead of
  re-arguing it. The sweep selects and locks eligible **DLQ** rows first
  (`FOR UPDATE OF d SKIP LOCKED`) and only then deletes their prepared rows;
  requeue loads the DLQ row `FOR UPDATE` and **validates external state before
  writing the single-use stamp or the new job**. Because validation now precedes
  every write, the `Present`-but-absent branch **commits** its `Missing` + audit
  and returns the rejection *after* that commit — no rollback erases the anomaly,
  and no requeue is created or stamped; the durable-anomaly promise and the
  reject-with-nothing-created promise hold simultaneously. New specs: a
  barrier-controlled sweep ∥ requeue proving no `40P01` under the single order
  (with an inverted control run that deadlocks), and a fresh-context assertion that
  a rejected `Missing` stays persisted and audited (§4/§4.2/§4.5/§9).
- **R6-4 (`NeverPrepared` inferred from absence; the malformed-payload path could
  not satisfy the mandatory terminal hook, major; was R5-2/O19):** the **correct**
  option was taken, not the narrowing one. A minimal non-sensitive **PREPARE-occurred
  marker** (`job_queue.external_prepared_at`, one timestamp, written in the PREPARE
  transaction, copied to the DLQ at dead-letter, carried onto the new queue row by a
  transfer) makes absence classifiable: marker present + row absent → a real,
  audited `Missing`; marker absent → genuinely `NeverPrepared` (O20). Separately,
  **invalid-before-handler settlement** is defined: unknown `job_type`,
  `JsonException`, or a payload rejected by `ValidatePayloadJson` reaches **no
  handler instance**, so **no terminal hook runs** — DLQ-only with `NeverPrepared`
  and **no `email_log` row**; no placeholder address is invented and
  `email_log.recipient`'s `NOT NULL` is not relaxed (O21). Phase-3 alerting now
  **samples durable `external_state_status = 4` rows** through
  `ix_job_dead_letter_external_state` instead of trusting a one-shot in-process
  counter that can be lost between the status commit and metric emission. Specs:
  pre-DLQ scratch loss → `Missing` (paired with a NULL-marker row → `NeverPrepared`,
  so totality is proven, not asserted), marker survival across a transfer, and
  malformed-payload settlement with an **infinite-loop regression**
  (§4.1/§4.2/§4.5/§5.1/§5.4/§7.2/§9/§10; O20/O21).
- **R6-5 (editorial):** the status vocabulary reads **O6–O21** and notes the absent
  O8 ordering is intentional; the chronological record carries an explicit "state
  after that round; later entries may supersede" rubric, and the two named
  superseded bullets are annotated with the rounds that overturned them (round-1
  C1's `text` prepared bytes → `bytea` at R2-2; round-1 C12's leader-gated global
  gauges → per-replica sampling at R2-10).

New author-decided items pending owner objection: **O20** (durable PREPARE marker)
and **O21** (invalid-before-handler DLQ-only settlement); **O18 reversed and
rewritten**; **O7** extended with prospective override semantics; **O19** annotated
as completed at mechanism level.

⚠️ **Captain-alignment item — a suspected LIVE DEFECT, not a doc gap (R6-4).** The
malformed-payload → mandatory terminal hook → `NOT NULL` `email_log.recipient` →
infinite rollback loop looks reachable on the shipped 2C branch
`origin/feat/809-email-jobs-fold` today. Flagged inline at §5.4 and §10 for
separate code verification; **no code branch is edited by this document**. Other
code-alignment items carry forward: **R6-1** (634 has no `schedule_epoch`) and
**R6-4** (633's `job_queue`/`JobDeadLetter.FromJob` have no marker and cannot
classify absence). No disputes this round — the reviewer's ruling on O18 is
accepted in full.

**2026-07-17 — PR #852 merge-challenge round 7 remediated (0 merge-blockers /
2 majors / 1 minor;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r7-findings.md`).**
Round 7 graded R6-1/R6-2/R6-3/R6-5 **Absorbed**, accepted **O18**'s reversal and
**O20**/**O21** as correct decisions, and graded **R6-4 Weakened** — not on
direction, but because the external-state design implied an **engine contract** it
never specified. Both majors are that contract:
- **R7-1 (no type-erased dead-letter classification capability exists, major):**
  round 6 asserted a *total* six-value state machine while naming no one who could
  compute its non-generic half. `JobDeadLetter.FromJob` is a generic entity factory
  and cannot query `email_prepared_sends` without welding the engine to email
  (untenable once webhook/Epic-D publishing prepared-state stores exist);
  `OnTerminalFailureAsync` returns `Task`, ran *after* DLQ creation, and — by O21 —
  is not invoked at all on the very path that most needs classifying. The seam is now
  a **peer capability of the registration**, not a handler method:
  `ClassifyExternalStateAsync(JobQueueItem, JobDeadLetter, AppDbContext, ct)`,
  required alongside `TransferExternalEffectState`. ~~It is **payload-blind by
  signature** — no `JobContext`, no payload parse~~ — which is the mechanism that lets
  it run on the invalid-before-handler path without reopening O21's
  infinite-rollback class.
  > ⚠️ **Round 8 proved that sentence false, and it is left here struck rather than
  > quietly deleted (R8-1).** That signature handed the classifier the full
  > `JobQueueItem` *and* `JobDeadLetter` — both payload-bearing — plus a **writable
  > `AppDbContext`**; it was payload-blind only by *convention*, and the startup gate
  > could prove only that a delegate existed. The mechanism claim is real but now
  > rests on **O24**'s declarative descriptor (no type code runs at all) and **O25**
  > (classification cannot roll the settlement back), not on this signature. Round 7
  > wrote "by signature" without checking the signature — see the round-8 record
  > below.
  >
  The terminal transaction now has an explicit order
  (create DLQ entity → classify → handler hook, handler-reached only → insert →
  fenced delete), and the **startup gate enforces registration completeness**, so a
  policy-bearing type cannot register without a classifier and silently lose
  totality at its first dead-letter. Engine-decided branches (`Standard` → `None`;
  unregistered type → `NeverPrepared`) are **conditioned on the marker, not
  assumed** — a set marker with no classifier stamps the conservative, audited
  `4 Missing` rather than licensing a fresh-bytes requeue — **a branch round 8
  found no live section implemented; §4.2/§5.1 now do (O24/O26)**
  (§4.2/§5.1/§5.4/§9/§10; O22).
- **R7-2 (the PREPARE marker write was neither fencing-conditioned nor tied to the
  row actually inserted, major):** "marker and `prepared_at` are equal by
  construction" was **false**. The marker came from an *independent* `now()`, so a
  loser hitting `ON CONFLICT DO NOTHING` still overwrote it with a strictly later
  timestamp — advertising a sensitive-byte cutoff past the real one — and a
  token-ignoring stale owner (a **supported** path: §5.1's cancellation is
  cooperative) could insert an orphan scratch or mutate a queue row it no longer
  owned, in violation of §6's "every transition is conditioned on the token", even
  after settlement. PREPARE is now **one fenced transaction**: recheck the prepared
  row *after* the domain lock; insert once and take **that row's own** `prepared_at`
  (or the conflict winner's); stamp the marker with **that exact value** via
  `WHERE id = … AND lock_token = … AND (external_prepared_at IS NULL OR = it)`; and
  **exactly one affected row or the whole transaction rolls back**, scratch insert
  included. Equality is **enforced by the write** instead of asserted; a stale owner
  rolls back whole; nothing is committed after settlement. New barrier spec with an
  expired/reclaimed owner and the current owner, plus two failing control runs
  (§4.5/§5.4/§6/§9/§10; O23).
- **R7-3 (three current-contract summaries contradicted the detailed machine,
  minor):** fixed **at the summary**, never by weakening the detail — the DDL comment
  now sources `external_state_prepared_at` from `job_queue.external_prepared_at`
  (a `Missing` row has no scratch to copy from); the requeue gate reads "already
  requeued regardless of external-state status (`Transferred` only when state moved)",
  matching the CHECK-driven rule that keeps a requeued `NeverPrepared` ancestor at
  status 3; and §6's failure summary qualifies the hook as **handler-reached terminal
  paths** and states DLQ-only settlement for invalid-before-handler failures, per O21
  (§4.2/§6).

New author-decided items pending owner objection: **O22** (terminal external-state
classification seam) and **O23** (fenced PREPARE). **O20** is completed at the write
level by O23 and **O19/O21** at the dispatch level by O22 — neither direction is
changed.

**Round 8 (2026-07-17, the eighth merge challenge — NOT MERGE-READY, 0
merge-blockers / 3 majors / 1 minor / 1 editorial;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r8-findings.md`).**
Round 8 confirmed the classification dispatch seam **genuinely exists** and the
PREPARE SQL is **fence-safe**, graded **R7-3 Absorbed**, and ruled **O22 and O23
sound decisions**. Blockers stayed at **0** for a fifth round. All three majors were
defects *inside* round 7's new mechanisms, and their common shape is one lesson:
**round 7 asserted safety that neither the type system nor the SQL enforced.**
- **R8-1 (the classifier was not payload-blind, major):** "payload-blind **by
  signature**" was **false** — the signature handed the classifier the full
  `JobQueueItem` *and* `JobDeadLetter` (both payload-bearing) plus a **writable
  `AppDbContext`**, so blindness and "the only permitted write" were conventions, and
  the startup gate proved only that a delegate *existed*. Because every classifier
  failure rolled the terminal transaction back, a deterministic classifier defect
  **recreated the #810 lease loop O21 exists to close**. The executable surface is
  therefore removed: the registration carries a declarative `ExternalStateStore`
  descriptor, the engine builds and runs the probe and owns the entire decision
  function, ~~the payload is unreachable **by parameter type**, and no type IL executes
  during classification~~ (**O24**). ~~Classification is also made unable to fail the
  settlement — a probe failure stamps the conservative audited `4 Missing` instead of
  rolling back, which is what turns "no classifier defect can loop" into a property~~
  (**O25**).
  > ⚠️ **Round 9 proved both struck clauses false (R9-1/R9-3), and they are left
  > struck rather than quietly deleted — the same rule round 8 applied to round 7.**
  > An `Expression<>` constrains a lambda's type, not its body, so "no type IL
  > executes" was not enforced; and a `catch` cannot un-abort a PostgreSQL
  > transaction, so "unable to fail the settlement" described a settlement that could
  > not proceed. **The direction of both items survived and the mechanisms are now
  > real**: O27 deletes the expression, O28 replaces the `catch` with a savepoint and
  > states the boundary, O29 replaces `4 Missing` with a swept `6 Unclassified`. See
  > the round-9 record below. The marker-NULL invalid-before-handler case is engine-classified with no
  probe and no registration code at all, and marker-set/`Standard` and
  marker-set/unregistered are now explicitly a **conservative audited integrity
  failure** — closing the contradiction round 8 found between the live status table
  and the chronological record, by *implementing* the conservative branch rather than
  deleting the claim (§4.2/§5.1/§9/§10; O24/O25).
- **R8-2 (the mandatory PREPARE concurrency gate was unconstructible, major):** owner
  A pauses *inside* its transaction holding the domain row's `FOR UPDATE`, so owner B
  **cannot** "PREPARE to completion" first — B blocks on that same lock. The asserted
  barrier schedule could never execute. The second control's claim was false too:
  dropping only `AND lock_token = {token}` does **not** produce an orphan (the queue
  row exists throughout; after settlement `WHERE id = {jobId}` matches zero rows
  regardless). §9 now states the **real** schedule — A locks domain and pauses before
  its marker; B reclaims `job_queue` and is **proved blocked on domain via
  `pg_locks`**; A is released, its fenced read finds zero rows and throws before
  writing, rolling A back whole; B then acquires the domain lock and commits its own
  scratch/marker — and three **separate** controls: no-token → *stale A's bytes and
  marker wrongly commit under B's ownership* (what the token predicate actually
  prevents); rowcount-or-rollback-rule removed after settlement → *orphan scratch*;
  independent-`now()` → *marker ≠ `prepared_at`* (retained) (§4.5/§9/§10).
- **R8-3 (the two-writer marker invariant was unenforced and assigned to no phase,
  major):** `StampExternalPreparedAsync` took only ids, a timestamp, a context, and a
  token — **no policy proof, no transaction guard** — so "both writers are reachable
  only for a `TransferExternalEffectState` type" was assertion-by-call-site, and F15's
  guard cannot see calls *into* an engine method. Since §4.2's engine-decided branches
  are sound only because that enumeration holds, this was a correctness hole. The seam
  is now `IExternalPreparedMarker.StampAsync`, which requires an ambient caller
  transaction, **re-reads the locked queue row's persisted `job_type`** — the caller
  supplies none, so the check is unforgeable — fails before writing otherwise, and
  **rolls the transaction back itself before throwing**, so a handler cannot catch the
  fence and commit anyway (**O26**). Separately, §10 added the marker column in 2A-R and told 2C to
  use the fenced transaction while **creating no file for the operation anywhere**,
  forcing an implementer to leave it missing or breach the "2A-R owns engine
  contracts" rule; `ExternalPreparedMarker.cs`, `ExternalStateStore.cs`,
  `ExternalStateClassifier.cs`, and their specs are now **assigned to Phase 2A-R**,
  and 2C only calls the pre-existing seam (§4.5/§5.1/§8/§9/§10).
- **R8-4 (two summaries still described the superseded independent-`now()` write,
  minor):** §4.2 and O20 both said the marker came from "the same database `now()`"
  as `prepared_at` — the mechanism R7-2 replaced. Both now state that the marker takes
  the **committed scratch row's own `prepared_at`**, returned or re-read inside the
  fenced transaction, with no second marker-side `now()`; O20 is annotated
  **superseded at the write level by O23** (direction unchanged, equality conclusion
  intact and now enforced by the write).
- **R8-5 (§8's placement summary omitted the fourth capability, editorial):** the
  "unified `JobRegistration`" parenthetical now names the external-state descriptor,
  and "the engine never reads or writes" the messaging tables is qualified to "the
  generic engine has no direct table coupling; registered type-specific delegates and
  descriptors do."

New author-decided items pending owner objection: **O24** (declarative classification
descriptor), **O25** (classification cannot fail the settlement), **O26** (the marker
write proves its own entitlement). **O22** is superseded **in API shape** by O24 — its
*placement* ruling, which round 8 held, is unchanged — and **O23** is completed at the
authorization level by O26. No direction is reversed.

⚠️ **Captain-alignment items carry forward** unchanged (R6-1: 634 has no
`schedule_epoch`; R6-4: 633 has no marker and cannot classify absence; the **suspected
live defect** on `origin/feat/809-email-jobs-fold`), and R7-1's build-target changes
are restated in R8 terms at §5.1: `JobRegistration`'s fourth capability is a
**descriptor**, not a delegate; the engine gains `ExternalStateClassifier`; the startup
gate gains **both** the paired-capability check and the descriptor-probe check.
**No code branch is edited by this document.** No disputes this round — all three
majors, the minor, and the editorial are accepted as stated. The reviewer's central
point is the one worth recording: **round 7's brief and its text both repeated
"payload-blind by signature" without checking the signature.** A claim that something
*cannot* happen is only worth what the type system or the SQL behind it enforces.

⚠️ **Captain-alignment items (R7-1) — build-target changes, not live defects.**
Major 1's hook changes what **Phase 2A-R** must build: `JobRegistration` gains a
fourth capability; `JobDeadLetter.FromJob` becomes envelope/lineage only and
classifies nothing; `JobRegistryStartupGate` gains the paired-capability check; and
**Phase 2C-R1**'s three email registrations must each supply a classifier beside
their transfer hook. Flagged inline at §5.1 and carried into §10's phase specs.
Prior code-alignment items carry forward unchanged: **R6-1** (634 has no
`schedule_epoch`), **R6-4** (633 has no marker and cannot classify absence), and the
**suspected live defect** on `origin/feat/809-email-jobs-fold` (mandatory terminal
hook → `NOT NULL` `email_log.recipient` → infinite rollback). **No code branch is
edited by this document.** No disputes this round — both majors are accepted as
stated; the reviewer correctly identified that a state machine without a specified
computer of its own states is an assertion, not a design.

**Round 9 (2026-07-17, the ninth merge challenge — NOT MERGE-READY, 2
merge-blockers / 2 majors / 3 minors;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r9-findings.md`).**
**This round is a regression and the record says so plainly.** Merge-blockers had been
**0 for five consecutive rounds**; round 9 returned **two**, and round 8's headline fix
(R8-1) graded **Mis-absorbed**. Convergence: 17 → 12 → 9 → 7 → 3 → 5 → 3 → 3 → **4,
with blockers**. The reviewer's verdict is the entry:

> *"The design says these properties are structural while its specified mechanisms do
> not deliver them."*

**This is the third consecutive round with one root cause: a claimed property stronger
than the mechanism enforcing it.** Round 7: "payload-blind **by signature**" — the
signature passed the payload. Round 8: a rollback guaranteed by a promise a `catch`
could defeat (self-caught). Round 9: "**no type IL executes**" of an `Expression<>`
whose body may contain method calls, and "classification **cannot** fail settlement"
of a `catch` that PostgreSQL ignores. The remediation rule for this round was
therefore absolute — **claim only what a type, a SQL predicate, a CHECK, or a
savepoint enforces; where a property is merely intended, write the weaker sentence
that is true** — and every claim retained below names its enforcing artefact inline.
- **R9-1 (O25 could not recover the terminal transaction after its own probe failed,
  MERGE-BLOCKER):** the probe runs on the terminal transaction's own
  `AppDbContext`, and **in PostgreSQL a SQL error aborts the transaction** — so
  catching the exception restored nothing and the audit insert, DLQ insert, fenced
  delete, and commit could not proceed. On the failure O25's **own mandated test**
  produces (a dropped store table), the job rolled back and re-leased: **the exact
  infinite-loop class O25 was written to declare impossible**, re-entered through O25.
  EF's automatic savepoints wrap `SaveChanges`, not a failing query. The probe is now
  a **named subtransaction** — `CreateSavepointAsync("external_state_probe")`, released
  on success, **rolled back to** on a recoverable statement error — and the exception
  boundary is specified as a table: statement errors on a live connection are
  contained and the settlement **commits**; a broken/lost connection, an
  already-aborted outer transaction, and a failing rollback-to-savepoint are **not**
  convertible and follow ordinary settlement retry. O25's absolute sentence is **not
  restated anywhere**; the property is now written at its true width — *classification
  cannot fail the settlement for recoverable statement errors*, which is the class
  that produces the loop, because deterministic failures are statement errors
  (§4.2/§5.1/§6/§9/§10; **O28**).
- **R9-2 (probe-failure `Missing` stranded sensitive bytes for 90 days instead of 7,
  MERGE-BLOCKER):** and this one is worse than the loop it replaced. `4 Missing` means
  **proved absent**, and the SQL believed it: the prepared-send sweep selected
  `external_state_status = 1` only, and the orphan batch deletes only rows matching
  neither a live queue row nor a DLQ row — so bytes behind a `Missing` DLQ row were
  selected by **neither batch** and survived until the 90-day DLQ row disappeared,
  violating O16's seven-day cap and contradicting §4.5's own "protected exactly until
  its recorded expiry". Round 8 **traded the lease loop for a privacy violation**, and
  the mandated residue test walks precisely that path. Probe failure now stamps a
  **separate durable state, `6 Unclassified`** ("a PREPARE committed; presence
  unknown"), carrying the marker-derived window bounds; the sweep's DLQ-expiry batch
  predicates on **`external_state_status IN (1, 6)`** — *that `IN` list is the artefact
  that enforces the seven-day cap* — so present bytes are deleted and stamped
  `2 Expired` atomically at the recorded cutoff while the anomaly survives in **audit
  history**; requeue rejects `6` **fail-closed** (it may neither transfer bytes that
  may be gone nor mint fresh ones under a new key). The reviewer's stated minimum
  (`status IN (1, 4)`) was **rejected with grounds**: it would make `Missing` mean
  "absent or unknown" and render the `dlq_external_state_missing` alert un-actionable
  (§4.2/§4.5/§7.2/§7.3/§9/§10; **O29**).
- **R9-3 (`Expression<Func<TScratch, Guid>>` did not make "no type-supplied code
  executes" structural, major):** the descriptor was materially safer than the deleted
  delegate — the reviewer says so and it is true — but **the advertised property was
  stronger than the type**. Expression lambdas may contain method calls and closures;
  EF client-evaluates parameterizable fragments while translating the rest; the
  signature constrained the lambda's type, never its body. The startup probe proved one
  evaluation translated and returned — not the tree's shape. **The fix is to have no
  expression.** The descriptor is now `ExternalStateStore<TScratch>(TimeSpan
  Retention)`: *enforcing artefact — the record declaration, whose only member is a
  value, so no field can carry code*. The engine derives the key from **its own EF
  model** (`TScratch`'s single `Guid JobId` primary key), builds
  `EF.Property<Guid>(s, key) == jobId`, and issues it with `IgnoreQueryFilters()` so a
  model-level filter cannot make present bytes read as absent; the startup gate proves
  the **model shape** (mapped; one PK property; `Guid`; named `JobId`) before the probe
  check. Tree-validation — the reviewer's fallback — was considered and rejected with
  grounds: it makes safety depend on a hand-written walker being exhaustive over the
  `Expression` node taxonomy forever (§5.1/§9/§10; **O27**, superseding O24 in API
  shape).
- **R9-4 (the post-settlement orphan control combined mutually exclusive lifecycle
  shapes, major):** owner A was inside a **valid email handler's** PREPARE path — so
  the type resolved, the payload validated, and a handler ran — while the engine was
  asked to settle that same row **invalid-before-handler**, a shape reachable only for
  an unknown type, a `JsonException`, or a pre-handler rejection. **One stored row
  cannot satisfy both histories**, and no intervening mutation was specified; calling
  an internal helper with an impossible flag tests a helper, not an interleaving. The
  control now uses a **production-reachable** schedule with a dedicated test
  `TransferExternalEffectState` registration whose terminal hook is **lock-free** and
  whose settling pass blocks on nothing A holds — A needed no domain lock for the
  orphan case, which is what made the old shape contorted. **The required red control
  is preserved** unchanged in force (§9).
- **R9-5 (the reclaimed-owner test observed the wrong PostgreSQL lock object,
  minor):** PostgreSQL stores row locks **in the row**; a waiter appears as waiting on
  the holder's **transaction id**, not as an ungranted *tuple* lock — so `pg_locks …
  granted = false` on that tuple could pass or fail for the wrong reason. The spec now
  captures both backends' pids and asserts **`pg_blocking_pids(B)` contains A** with
  `pg_stat_activity` showing B on a lock wait (§9).
- **R9-6 (the retained non-vacuity control rested on a false premise, minor —
  the R8-4 "Weakened" grade):** the control assumed two `now()` calls in the same
  PostgreSQL transaction differ. **They do not** — `now()` is transaction-scoped, so
  the control **passed the mutation it existed to catch** and proved nothing. It is
  replaced with one that **cannot** fail for clock reasons: the conflict winner is
  pre-committed with an explicitly written `prepared_at = now() - interval '1 hour'`,
  so the mutated marker is provably ≥ 1 hour off — inequality by written constant, not
  by elapsed time (§4.5/§9).
- **R9-7 (the cross-job `Standard` marker test claimed a caller-identity guarantee the
  seam does not implement, minor):** the guard proves the **target row's** persisted
  policy and the caller's possession of **that row's** current token; it does not know
  the caller's registration. Round 8's "a `Standard` registration cannot reach writer
  1" is **withdrawn** — a `Standard` handler holding a live Transfer row's id *and*
  current token would be permitted, and that violates nothing, because the row stamped
  is a Transfer row. The invariant is restated in target-row terms — **no sanctioned
  marker on a `Standard`/unregistered row**, the only thing §4.2 relies on — and the
  cross-job case is kept only where it asserts the **true** rejection reason (the
  fence, by exception type). R8-3's target-policy fix stands **Absorbed** and is
  untouched (§4.5/§5.1/§9/§10).

New author-decided items pending owner objection: **O27** (the descriptor carries no
code at all), **O28** (savepoint-isolated probe; exemption narrowed to recoverable
statement errors), **O29** (`6 Unclassified` + the sweep that caps it). **O24** is
superseded **in API shape** by O27 — its *direction* (declaration over delegation)
stands and round 9 endorsed it. **O25** is superseded in **mechanism and scope** by
O28 and in **stamped state** by O29 — its *direction* (a classification failure must
not revive a settled job) stands. No direction is reversed; three overclaims are
deleted rather than defended.

⚠️ **Captain-alignment items carry forward** unchanged (R6-1: 634 has no
`schedule_epoch`; R6-4: 633 has no marker and cannot classify absence; the **suspected
live defect** on `origin/feat/809-email-jobs-fold`). Round 9 adds to Phase 2A-R's
build targets: the `external_state_probe` **savepoint** and its exception boundary in
`ExternalStateClassifier`; **`ExternalStateStore<TScratch>` loses its selector
parameter**; the startup gate gains the **EF-model shape check**; and the migration's
`ExternalStateStatus` + `ck_job_dead_letter_external_state` carry **`6 Unclassified`**.
**No code branch is edited by this document.** **No disputes this round** — both
blockers, both majors, and all three minors are accepted as stated; where the reviewer
offered a fallback (reuse `Missing` with `status IN (1, 4)`; validate the expression
tree), the stronger option was taken and the reasoning is recorded in O29 and O27.

The lesson this record now carries three times, stated once more because it has cost
three rounds: **a weaker true claim converges; a stronger false claim costs a round,
every time.** The failures were not analytical — the mechanisms were sound and got
sounder each round — they were **rhetorical**: "by signature", "cannot", "structural"
written ahead of the artefact. Every such sentence in this document now names the type,
the SQL predicate, the CHECK, or the savepoint that enforces it, or it has been
weakened until it is true, or it is gone.

**Round 10 (2026-07-17, the tenth and FINAL merge challenge — NOT MERGE-READY, 1
merge-blocker / 4 majors / 2 minors;
`docs/reviews/jobs-infra-design-challenge/doc-challenge-r10-findings.md`).**
**The loop ended here by owner decision, not by a verdict.** No round 11 graded the
remediation below, so — uniquely among these entries — **this one was never
validated by the round that follows it.** That is why §11 opens with a *Known open
items* table instead of a clean bill: the honest deliverable of an unreviewed final
round is a document that names what it did not close. Convergence:
17 → 12 → 9 → 7 → 3 → 5 → 3 → 3 → 4 → **7**. Every finding sat in **one seam** —
prepared-state retention + classification — and the rest of the document was not
re-opened.

- **R10-1 (DLQ retention could destroy the owner of prepared bytes before their
  durable cutoff, MERGE-BLOCKER):** R9-2's `IN (1, 6)` repaired the hole *while the
  DLQ row exists*. `job-dead-letter-retention` is an **independent** global
  `failed_at` sweep with no exclusion for `Present`/`Unclassified` and no
  relationship to `EMAIL_PREPARED_SEND_RETENTION_DAYS` — and both windows are
  operator-configurable, so a **valid config** (`JOB_DEAD_LETTER_RETENTION_DAYS = 1`,
  prepared = 7) deletes a status-1/6 row before its recorded
  `external_state_expires_at`. The bytes become an orphan and fall back to
  `prepared_at + the current env var`; the `Expired` stamp and its evidence can never
  be written. Even at defaults, **sweep ordering alone** could erase the row first.
  R9-2's class exactly: *one retention job removing the row that makes the other one
  safe.* Fixed as a **persisted-state predicate** — `external_state_status NOT IN (1,
  6)` in the age sweep's selecting subquery, the exact complement of §4.5's `IN (1,
  6)`. *That predicate is the enforcing artefact*, and it is indifferent to both env
  vars, to config edits, and to sweep order. **A default-duration relationship was
  rejected with grounds** (O31): `external_state_expires_at` is materialized per row,
  so a validated ordering protects rows only until the next edit — and would give
  false confidence that it had not (§4.2/§4.5/§7.3/§9/§10; **O31**).
- **R10-2 (an exact physical-deletion instant an async sweep cannot enforce,
  major):** the SQL makes a row **eligible** at `external_state_expires_at <= now()`;
  it does not run the sweep. §4.5 nonetheless said the displayed cutoff, the requeue
  cutoff, "and the instant the bytes actually die are one value and **cannot
  disagree**", and O29 said bytes are deleted "at seven days". **The third clause was
  false.** Two properties were conflated and are now separated everywhere: **requeue's
  cutoff is exact** (*artefact:* the `now() >= external_state_expires_at` comparison
  inside the requeue transaction, on the DLQ row held `FOR UPDATE`), while **physical
  deletion is eventual** — the first successful pass at or after the cutoff. Added:
  `dlq_prepared_state_overdue_seconds` + the `jobs.prepared_state.sweep_overdue`
  condition, and a spec that runs the whole cutoff with **the sweep never started**,
  asserting the bytes are still there, requeue still fails closed, and cleanup happens
  on recovery. **Not closed:** nothing bounds the lag — **K-3** (§4.2/§4.5/§7.2/§7.3/§9).
- **R10-3 ("classification-time audit" had no writer, major — and the finding was
  bigger than the finding):** the design required `Unclassified`/`Missing` to be
  audited in six places; the normative terminal transaction had **no step that wrote
  it**. Specifying the writer surfaced worse: **the audit target did not exist.**
  §4.5's statement read `INSERT INTO audit_logs (action, subject_type, subject_id,
  metadata, occurred_at)`; the shipped table has **none of those four columns**, and
  its `user_id` is `NOT NULL` with `FK_audit_logs_users_user_id`. **The engine has no
  user.** Every "immutable `AuditLog` entry" promised for an engine transition since
  round 5 was **unbuildable**, and no round caught it because no round tried to write
  the insert. Fixed with an actor-less, append-only **`job_dead_letter_events`** table
  (O30) + `IJobDeadLetterEventWriter` as the terminal transaction's **step 5**; staff
  requeue keeps `audit_logs`, because a staff action *has* an actor. `dead_letter_id`
  is the **specified join key** (*artefact:* `fk_job_dead_letter_events_dead_letter`),
  replacing "the expiry audit relies on that earlier row" as narrative.
  **§4.4 has the identical defect and was deliberately not fixed — K-6**
  (§4.2/§5.1/§8/§9/§10; **O30**).
- **R10-4 (`Unclassified` had a gauge but no warning condition or alert route,
  major):** Phase 3's leased webhook path consumes **conditions**, so a second sampled
  gauge created no condition key, severity, persistence rule, lease window, or
  notification — a fleet-wide store outage could accumulate status-6 rows with no
  page. §7.2 now defines all three prepared-state conditions as a table with explicit
  `condition_key`s (`jobs.dlq.external_state_missing`,
  `jobs.dlq.external_state_unclassified`, `jobs.prepared_state.sweep_overdue`),
  aggregation, persistence, recovery, and message — plus a fresh-monitor spec, a
  multi-replica one-notification spec, and a control proving the round-9 shape
  (gauge, no condition) delivers **zero** notifications (§7.2/§9/§10).
- **R10-5 (the "exact" savepoint boundary was an undefined helper, major):** the
  savepoint was the right primitive and `IsRecoverableStatementError(ex)` was never
  defined — *"a statement error on a live connection"* is a conclusion an implementer
  must re-derive, and "live connection" is not a field a `catch` filter can read.
  Replaced with a **closed allowlist** over exact SQLSTATEs in a **named production
  helper** (`Infrastructure/Jobs/ExternalStateProbeErrors.cs`), plus a severity gate
  and a connection-state gate. The boundary table now names **what decides each row**:
  `57P01` escapes because it is **not on the allowlist** (and is `FATAL`); `57014`
  cancellation and `25P02` already-aborted escape the same way; broken sockets and
  `OperationCanceledException` never match the `catch` filter at all; and a failing
  `RollbackToSavepointAsync` escapes because **no `try` wraps it** — the design does
  not predict the rollback succeeds, it lets the failure through. **The allowlist is
  justified by asymmetry:** a false negative costs one ordinary retry, a false
  positive costs the #810 loop — so the default is rethrow (§5.1/§9/§10; **O28**).
- **R10-6 (the Phase 2C gate restated both corrected PREPARE controls in their
  superseded forms, minor):** current build-order text, not a struck record — a
  builder would have implemented `pg_locks` blocker observation (R9-5 replaced it) and
  the vacuous independent-`now()` control (R9-6 proved it passes its own mutation).
  The gate now **cites §9's spec rows by name and owns none of their content**. Rule
  recorded: *a gate that rephrases a spec is a second source of truth, and the second
  one goes stale silently* (§10).
- **R10-7 (the cleanup prose promised a resolution no reader performs, minor):**
  §4.5 said "any later reader stamps `4 Missing`" and that the sweep resolves the
  ambiguity. **Neither is true for `Unclassified`** — requeue rejects status 6 without
  probing or writing, and the sweep transitions it only when its `JOIN` finds bytes.
  Now stated: **only a `Present` reader stamps `Missing` on absence**, because
  `status = 1` means the probe *ran and found the row*, so a later absence is a real
  transition; `status = 6` asserts nothing, so its absence is not evidence of loss.
  Added the sweep's **resolution batch** (`WHERE external_state_status = 1` — the
  artefact) so the `Present` half resolves without waiting for a staff requeue that
  may never come, which also releases it from R10-1's retention exemption. **The `6`
  half is left unresolved on purpose and is now permanent — K-1** (§4.2/§4.5/§9).

**Claims weakened this round** (the rule from round 9, applied without a reviewer to
check it): "protected **exactly until** its recorded expiry" → *eligible at the
recorded cutoff; deleted by the first sweep pass at or after it*. "The displayed
cutoff, the requeue cutoff, and the instant the bytes actually die **cannot
disagree**" → *the first two are one value and requeue's is exact; the third is
eventual*. "Retains the prepared-send row for **at most** seven days" → *for the
recorded window plus the sweep's lag*. "Bytes are deleted **at seven days**" (O29) →
*deleted by the first pass at or after the recorded cutoff*. "**Any later reader**
stamps `4 Missing`" → *only a `Present` reader does; an absent `6` stays `6`*. "The
exception boundary is **exact**" → *it is a closed allowlist; everything not on it is
rethrown* — which is now true, because the list exists. "An immutable **`AuditLog`**
entry" for engine transitions → *a `job_dead_letter_events` row*, because `audit_logs`
requires an actor the engine does not have.

**New author-decided items:** **O30** (the engine's actor-less evidence table) and
**O31** (retention gated on persisted status, never on a duration relationship). Both
are flagged with their costs in §11.

⚠️ **Captain-alignment items carry forward** unchanged (R6-1; R6-4; the **suspected
live defect** on `origin/feat/809-email-jobs-fold`). Round 10 adds to Phase 2A-R's
build targets: `ExternalStateProbeErrors.cs`, `JobDeadLetterEventWriter.cs` +
`Modules/Jobs/Entities/JobDeadLetterEvent.cs`, and the `job_dead_letter_events` table
+ FK + index in the migration; and to Phase 3's: the age sweep's `NOT IN (1, 6)`
predicate, the resolution batch, the three condition keys, and the sweep cadence.
**No code branch is edited by this document.** **No disputes this round** — the
blocker, all four majors, and both minors are accepted as stated.

**The lesson, final form.** Four consecutive rounds had one root cause: *a claimed
property stronger than the mechanism enforcing it* — "payload-blind **by signature**"
(the signature passed the payload); a rollback a `catch` could defeat; "**no type IL
executes**" of an `Expression<>` whose body may contain method calls; "classification
**cannot** fail settlement" of a probe PostgreSQL had already aborted. Round 9 retired
six such sentences. Round 10 found seven more places where the same habit survived —
and round 10's own remediation found the oldest one of all: **five rounds of
"immutable `AuditLog` entry" written against a table that has no such columns and
requires a user the writer does not have.** Nobody checked, because the sentence
sounded like a mechanism. That is the whole failure mode in one line. **The rule that
converges: claim only what a type, a SQL predicate, a CHECK constraint, or a savepoint
enforces — and when you cannot, write the weaker sentence that is true, or write the
gap down where the next reader will find it.** §11's *Known open items* is the second
half of that rule, applied to the six things this document does not close.

**2026-07-17 (owner, #425 option B ruling):** Invitation expiration stays
derived: invitations store an expiry timestamp, and expiration is computed at
read time. The existing database CHECK constraint continues to forbid a persisted
`Expired` status. There is no sweep job. A sweep would only write down a fact that
is already computable and would be correct only until its next run; the derived
value is correct the instant the deadline passes. Persisting the status would be
justified only if directly querying or filtering expired invitations in SQL later
becomes a requirement. #425 is closed as satisfied by the existing design.
