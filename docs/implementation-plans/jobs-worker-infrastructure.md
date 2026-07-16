# Background Jobs & Worker Infrastructure — Design

> Status: **design, ratified 2026-07-16; revised same night** (single-lane
> ruling + sol@high audit absorption — see Ratification record, §11). Closes
> the #632 gap (the #194 design was referenced but never committed). This
> document is the build spec for Epic A (#633–#636) and the email fold-in
> (#809/#810/#811). Another agent must be able to implement each phase from
> the sections below without re-deriving decisions.
>
> Scope note: **design only.** No application code is introduced by the doc
> itself; every file path below is a build target for a later phase. Audit
> finding numbers (F1–F24) reference
> `.dump/exec/jobs-infra/audit-findings.md` and are cited inline where the
> design absorbs them.

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
- `all` — both. This is the **local-dev default and the safe default when
  `APP_ROLE` is unset**; non-dev environments set the role explicitly (§3.1 —
  F24).

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
  `{ Api, Worker, All }`, **default `All`** when unset/blank. Parse
  case-insensitively via an explicit map (never `ToLower()` — PUBLY0003). Reject
  any other value at startup with the same fail-fast `InvalidOperationException`
  path the other vars use, and add a validator rule.
- Expose `AppEnvironment.Role` plus convenience `IsApiRole` / `IsWorkerRole`
  computed the same way as the existing `IsDevelopment` accessors.
- **`All` is reserved for local development and worker-specific integration
  fixtures (F24).** Every tooling/CI/deployment context that assumes an
  API-only process must say so: the Dockerfile's build-time OpenAPI generation
  env block and `apps/front-2/docker-compose.test.yml`'s api service both set
  `APP_ROLE=api` explicitly, so neither can silently construct worker
  infrastructure.

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

Implementation shape: `Infrastructure/Jobs/JobsServiceRegistration.cs` exposes
`AddWorkerServices(this IHostApplicationBuilder)`; `Program.Main` branches on
`AppEnvironment.Role` — `Worker` builds the Generic Host (infra + app + worker
services, no web pipeline), `Api` builds the web app without
`AddWorkerServices`, `All` builds the web app with it. Keeping worker
registrations in their own extension file (not inline in
`ServiceRegistration.AddInfraServices`) is also what lets the phases be
developed with minimal contention on `ServiceRegistration.cs` (§10).

### 3.3 Local dev

`all` is the default; `just dev-api` runs one process that is both api and
worker, exactly as today. No new dev workflow. Testcontainers integration tests
run under `all` too (the test host starts the worker hosted services, as it
started the shipped outbox dispatcher before the fold-in). **Everything that is
not local dev or a worker fixture sets `APP_ROLE` explicitly (F24):** the
Dockerfile publish step (build-time OpenAPI generation executes the app) and
`apps/front-2/docker-compose.test.yml` set `APP_ROLE=api`.

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
  SIGKILL never preempts the host's own drain budget (F19 — Compose defaults to
  10 s, which would kill mid-drain).
- On stop, the processor: stops claiming; lets in-flight handlers run to
  completion within the budget (cancelling their linked tokens as the budget
  nears exhaustion); then **proactively releases** any still-unfinished rows it
  owns (`status = Pending`, `lock_token = NULL`, conditioned on its own token —
  §5.1) so a restart resumes immediately instead of waiting out the lease. If
  the process dies before releasing, the lease + fencing token still guarantee
  safe reclaim (§6).
- `SchedulerLeaderService` calls `scheduler.Shutdown(waitForJobsToComplete:
  true)` within that budget, then releases the advisory lock (implicit on
  connection close).
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
    failed_at       timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_job_dead_letter PRIMARY KEY (id)
);

CREATE INDEX ix_job_dead_letter_job_type ON job_dead_letter (job_type, failed_at);
```

> Named `job_dead_letter` (per the ratified schema list), **renaming #194's
> `dead_letter_jobs`** for a consistent `job_` prefix across the engine tables.

**Requeue contract (F16 — binds Phase 4):** requeue is **server-side only**,
through the registered job definition: the endpoint takes a DLQ row id, the
handler re-enqueues via `IJobEnqueuer` from the **stored** envelope (payload,
type, priority, idempotency key, provenance — nothing client-supplied), records
an immutable audit-log entry (existing `AuditLog` machinery), and requires a
dedicated high-gravity permission (`staff:jobs:dead-letter:requeue`). There is
**no client payload override and no payload editing surface** — an editable
payload would be an arbitrary-work execution primitive. A requeue of a
`job_type` version no longer registered fails with a clear error instead of
enqueueing an undispatchable job (see versioning, §5.1/F14). Raw payloads are
**viewable** in the dashboard only under a separate read permission, since DLQ
payloads may reference tenant data (F20).

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
    outcome             integer     NOT NULL,   -- 0 Submitted, 1 CancelledIneligible, 2 PermanentlyFailed
    invitation_id       uuid        NULL,       -- related entity ids; no FK constraints (see below)
    user_id             uuid        NULL,
    provider_message_id text        NULL,       -- provider correlation (F3/F20)
    envelope_sha256     text        NULL,       -- fingerprint of the prepared envelope actually sent (F7)
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
```

Design notes:

- **`Submitted`, not "Sent" (F20, honesty):** outcome 0 means **the provider
  accepted the send request** — it says nothing about inbox delivery.
  Delivered/bounced/complaint tracking requires provider webhooks and is a
  designed follow-up (§10), not implied by this table. UI copy must say
  "submitted to provider".
- **No FK constraints** on `invitation_id`/`user_id` (plain indexed uuid
  columns): an audit-trail table must outlive — and never block — the lifecycle
  of the rows it references (hard-delete sweeps, future data-erasure flows).
- **Privacy / retention / access (F20):** recipient addresses are personal
  data. Rows older than `EMAIL_LOG_RETENTION_DAYS` (default 180; O7) are
  hard-deleted by the retention sweep system job (§7.3). `last_error` is
  bounded (exception type + message, ≤2 KB) and must never echo tokens, payload
  JSON, or full provider responses. Dashboard access (Phase 4) sits behind its
  own staff permission; the table never stores email bodies — `envelope_sha256`
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
24 h, a duplicate send. Fix: the envelope is **rendered exactly once per job**
and retries resend the persisted bytes.

```sql
CREATE TABLE email_prepared_sends (
    job_id                   uuid        NOT NULL,   -- the email job this envelope belongs to
    envelope                 jsonb       NOT NULL,   -- rendered send: recipient, template id + params (incl. token)
    envelope_sha256          text        NOT NULL,
    provider_idempotency_key text        NOT NULL,   -- stable per job (derived from job_id)
    created_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_email_prepared_sends PRIMARY KEY (job_id)
);
```

Lifecycle: inserted on the job's **first** send attempt (after the eligibility
recheck) with `INSERT … ON CONFLICT (job_id) DO NOTHING` then read-back — every
retry thereafter sends the **stored** envelope byte-identically. Deleted in the
same transaction as the terminal `email_log` write. Because the envelope
contains a live token, the row is deliberately short-lived; the retention sweep
(§7.3) deletes any orphan older than 7 days as a backstop.

**The honest delivery guarantee (F7):** email delivery is **at-least-once with
a bounded no-duplicate window** — within 24 h of first provider acceptance,
byte-identical retries under the stable key are deduplicated by the provider;
beyond 24 h (a job stuck in retry that long has hit the DLQ under the default
schedule anyway), or if the provider's dedup fails, a duplicate is possible.
`email_log`'s unique `job_id` additionally guarantees this system never
*accounts* a job as submitted twice, and `provider_message_id` +
`envelope_sha256` make any duplicate investigable. Unconditional exactly-once
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
   - **Back-copy terminal history** — `INSERT INTO email_log … SELECT` every
     outbox row with status `Sent` (→ `Submitted`, `occurred_at = sent_at`),
     `Failed` (→ `PermanentlyFailed`, carrying `attempt_count`/`last_error`),
     or `Cancelled` (→ `CancelledIneligible`); stamp `legacy_outbox_id` so the
     copy is idempotent (`WHERE NOT EXISTS` on it). *(Recommendation — O6;
     the alternative is dropping history with the table.)*
   - **Fold `Pending` rows only** into `job_queue`: `job_type` mapped from
     `kind` (`email.tenant-invitation.v1` / `email.staff-invitation.v1`),
     payload built **in SQL to the canonical wire shape** (F2):
     `jsonb_build_object('invitationId', invitation_id)`; `attempts =
     attempt_count`, `next_attempt_at` preserved; email priority;
     `idempotency_key = 'fold:' || id` (the **source-row marker** — under the
     `(job_type, idempotency_key)` unique index a re-run cannot duplicate a
     fold). In the same statement flow, mark each folded source row
     `Cancelled` with `last_error = 'folded to job_queue'` so the old
     dispatcher can never also send it.
   - **`Processing` rows are NOT touched** — they may be inside a live
     old-dispatcher send. They drain via step 2.
   - A `Pending` row with `invitation_id IS NULL` (pre-linkage legacy shape;
     expected count **zero**) cannot become an ID-payload job: route it to
     `email_log` as `CancelledIneligible` with an explanatory `last_error`.
2. R1 code: producers write `job_queue` email jobs (§5.4); **the old dispatcher
   ships in R1 and keeps running as a drainer** — it sees no new rows
   (producers stopped writing; Pending rows were folded) and finishes or
   lease-reclaims its remaining `Processing` rows with the old semantics. No
   row is ever owned by both systems: folded rows are `Cancelled` to the old
   dispatcher, unfolded `Processing` rows are invisible to the new one.

**Release R2 (small follow-up, same night or next deploy):**

3. Migration `DropInvitationEmailOutbox`:
   - **Verify quiescence**: fail the migration (abort deploy) if any
     non-terminal row younger than the lease window exists — the drain has not
     finished and the operator must wait, not drop.
   - Back-copy any terminal rows created during the R1 window (idempotent via
     `legacy_outbox_id`), then `DROP TABLE invitation_email_outbox`.
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
  Execution order **preserves the claim order** (`priority DESC` with the same
  deterministic tie-breakers) — the F9 priority reversal is fixed and guarded
  by an execution-order spec (§9).

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
  WHERE id = {id} AND lock_token = {token};
  ```

  **Zero affected rows = the lease was lost** (another worker reclaimed after
  expiry): the engine cancels that handler's linked `CancellationTokenSource`,
  discards its outcome, and logs a `lease_lost` event — it can never
  delete/reset work now owned by the new claimant. Batch semantics: the claim
  leases the whole batch, the engine **re-stamps the row's lease immediately
  before dispatching each job** (so job #20 of a slow batch doesn't start with
  an almost-expired lease), and a renewal loop re-stamps at `lease/2` intervals
  while a handler runs. Renewal failure ⇒ handler cancellation. This closes
  both F1 failure modes: expired-mid-run clobber and serial-batch lease
  exhaustion.

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
    versioned `job_type` string, default priority / `max_attempts` / lease,
    payload validation (**required members present, no `Guid.Empty` IDs** —
    F2), and serialization through the canonical serializer. The enqueuer
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
  - **Execute side:** `JobHandlerRegistry` maps `job_type` → `IJobHandler`;
    registration is explicit and fail-fast (every registered `job_type` maps to
    exactly one handler and vice-versa). Handlers are resolved from a fresh DI
    scope per job. An **unknown `job_type`** is a `PermanentFailure` straight
    to the DLQ (no pointless retries); at startup the registry logs a warning
    if the DLQ contains job types no longer registered (requeue would fail).
  - **Payload versioning (F14):** `job_type` strings are versioned from day
    one (`email.tenant-invitation.v1`). A breaking payload change introduces
    `…v2` + its handler while the `v1` handler (or an upcaster registered for
    `v1`) **stays until the queue and DLQ are drained of `v1`** — verified via
    the startup check above. Mixed-version deploy rule: old api replicas may
    enqueue `vN` after new workers deploy, so **a version's handler is never
    removed in the same release that stops producing it**. Immutable image
    tags (§3.4) make the fleet's version set explicit.

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
| `SyncSystemJobsJob` | 60 s | Reconcile `system_job_definitions` (enabled, non-deleted) into the leader's live scheduler — add/update/remove cron triggers so dashboard edits take effect within ~60 s (#636). |
| `RecoverStaleJobsJob` | 5 min | Belt-and-braces run of the stale-lease reset statement (§5.1 step 1); the processor also resets inline — this covers a fully-crashed fleet. |
| `DispatchDuePostsJob` | — | **FUTURE / D3 (#646).** Scans `scheduled_posts` and enqueues due posts into `job_queue` with an `idempotency_key` (+ a domain outcome marker per §4.1/F13). *Design accommodates it; does not build it.* |

**Why no `qrtz_*` tables (deviation from #194's table list):** durability lives
in `job_queue`, leadership lives in the advisory lock, and the
system-job catalog lives in `system_job_definitions` (reconciled every 60 s).
Quartz here only needs to *fire cron triggers on the leader* — it holds no
durable state of its own, so a persistent Quartz store would be redundant
complexity. If a durable Quartz store is ever wanted (e.g. misfire policies
across restarts), it is an additive follow-up, not a Phase-A dependency.

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
  live in their owning domain (§8) and can differ in `max_attempts`/lease.

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

- **Send flow — eligibility recheck, linearization, and idempotency (#811 fix;
  F7/F8).** Each handler:

  1. Opens a transaction and takes a **row lock on the domain row**
     (`SELECT … FOR UPDATE` the invitation / user).
  2. **Fresh eligibility read under the lock** — *this locked read is the
     linearization point (F8)*: invitation `IsRevoked() || IsAccepted() ||
     IsExpired(now)` → write `email_log(CancelledIneligible)` + delete the
     prepared-send row, commit, return `Cancelled`. Password-reset: token
     absent or expired → same path. The **guaranteed semantic**: an
     ineligibility **committed before the locked read** is always honored — no
     send. An ineligibility that *initiates* after the locked read blocks on
     the row lock (or commits after) and does **not** recall the send: revoke
     cannot preempt in-flight provider I/O, and no lock design over a network
     call can make it. That is the chosen serialization order, stated plainly.
  3. Materializes the **prepared envelope** once (`email_prepared_sends`
     insert-once, §4.5) and calls the provider with the stored bytes + the
     job-stable idempotency key. The provider call happens inside the lock
     window **bounded by an explicit provider HTTP timeout (30 s)**, so a
     blocked revoke waits bounded time.
  4. On provider acceptance: insert `email_log(Submitted)` with
     `provider_message_id` + `envelope_sha256`, delete the prepared-send row,
     commit, return `Success`. A reclaimed job that finds an existing
     `email_log` row for its `job_id` (unique index) returns `Success` without
     sending — the crash-after-send window closes locally, and within the
     provider's 24 h window the idempotency key closes it remotely (§4.5's
     bounded guarantee).
  5. On classified provider failure: map per the F3 contract above; the
     **engine** owns backoff (#810 — handlers never see scheduling columns).
  `OnTerminalFailureAsync` writes `email_log(PermanentlyFailed)` with the last
  classified error when the engine dead-letters the job.

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

  Failure analysis: (a) *no listener connected at commit* → NOTIFY is dropped by
  Postgres, but the poll fallback picks the row up within the interval; (b)
  *listener connection drops* → on reconnect the listener re-`LISTEN`s **and
  immediately triggers one catch-up poll**, so any notifications missed while
  disconnected are covered (reconnects are counted — §7); (c) *NOTIFY payload
  limits (8 KB)* → send an **empty payload** and let the processor query for
  eligible rows (it must anyway, because many producers may have committed);
  (d) *thundering herd* → the processor coalesces (a single wake triggers the
  §5.1 drain loop, which empties the backlog), and the semaphore-style "one
  pending wake is enough" collapsing is preserved.

**Recommend `LISTEN`/`NOTIFY` + poll fallback.** It preserves the shipped low-
latency behavior across the process split, degrades to pure polling on any
listener failure, and needs no broker (honoring D3). With the single-lane
ruling there is exactly **one channel** (`job_queue`) and one listener — the
per-concern channel question disappears with the second lane. In the `all` role
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
knows the **queue is healthy**. v1 is deliberately buildable tonight: .NET
`Meter` instruments + structured Serilog events with warning thresholds
(log-based alerting on the existing stack); an OTel/Prometheus exporter is a
follow-up wiring change, not a redesign, because all signals go through
`System.Diagnostics.Metrics` from day one.

### 7.1 Instruments (Meter `PublyApp.Jobs`) — emitted by the engine (Phase 2A-R)

| Instrument | Type | Tags |
| --- | --- | --- |
| `jobs.claimed`, `jobs.succeeded`, `jobs.retried`, `jobs.dead_lettered`, `jobs.cancelled`, `jobs.lease_lost` | counters | `job_type` |
| `jobs.handler_duration` | histogram | `job_type`, `outcome` |
| `jobs.attempts_at_terminal` | histogram | `job_type` |
| `jobs.listener_reconnects` | counter | — |
| `email.submit_failures` | counter | `kind`, `transient|permanent` |

Every counter increment has a structured-log twin (event name + same tags), so
alerting works from logs alone until a metrics backend exists.

### 7.2 Sampled gauges — `JobQueueMonitorService` (Phase 3)

A cheap worker-side sampler (any replica, 60 s): `due_depth` (pending & due,
split by priority class), `oldest_due_age_seconds` (per priority class — the
F22 fairness tripwire), `processing_over_lease_count` (should be ~0; sustained
>0 means reclaim is broken), `dlq_size` + `dlq_growth_1h`,
`email_log_failures_1h`, and `job_queue` dead-tuple count from
`pg_stat_user_tables` (autovacuum health, F21). Each sample logs at
information; threshold breaches (defaults: due_depth > 500, oldest age > 10 min
for priority 100 / > 60 min for priority 0, processing-over-lease > 0 for 3
consecutive samples, DLQ growth > 0 in an hour) log at **warning** — the
log-based alert hook.

### 7.3 Operational jobs (Phase 3)

Retention sweeps run as ordinary system jobs (dashboard-visible, #636):
`email-log-retention` (delete rows older than `EMAIL_LOG_RETENTION_DAYS`,
batched), `job-dead-letter-retention` (`JOB_DEAD_LETTER_RETENTION_DAYS`),
`email-prepared-sends-retention` (orphans > 7 days). Autovacuum storage
parameters for `job_queue` ship in the Phase 2A-R migration (§4.1); the sampler
watches dead tuples so a mis-tuned autovacuum is visible, not silent.

---

## 8. Module / file placement

Per `docs/guides/api-module-structure.md` (infra = capabilities provided *to*
domains) and `docs/guides/dotnet-project-layout.md` (co-located `*.Spec.cs`, new
top-level source area needs its own `Compile Include` line in the test shell).

- **Engine (infra):** `apps/api/Infrastructure/Jobs/`
  - `JobQueueProcessor.cs`, `SchedulerLeaderService.cs`, `JobBackoff.cs`,
    `JobHandlerRegistry.cs`, `IJobHandler.cs`, `JobContext.cs`, `JobOutcome.cs`,
    `JobJson.cs`, `IJobEnqueuer.cs` + `JobEnqueuer.cs`, `JobDefinition.cs`,
    `JobQueueListener.cs` + `IJobQueueSignal.cs`, `JobsMetrics.cs`,
    `JobsServiceRegistration.cs`, `WorkerHeartbeatService.cs`,
    `JobQueueMonitorService.cs` (Phase 3)
  - `Infrastructure/Jobs/Quartz/`: `SyncSystemJobsJob.cs`,
    `RecoverStaleJobsJob.cs` (and future `DispatchDuePostsJob.cs`).
  - The engine is a technical capability used by many domains → **infra**, not a
    domain module. This mirrors `Infrastructure/Messaging/Email/` (which keeps
    `IEmailService`, the provider adapters, and the F3 classified exceptions;
    the outbox dispatcher and signal are deleted by the fold's R2).
- **Engine entities:** these are infra-owned tables, but the repo keeps EF
  entities under `Modules/`. Create a small **`Modules/Jobs/Entities/`**
  (`JobQueueItem.cs`, `JobDeadLetter.cs`, `SystemJobDefinition.cs`) as the domain
  home for the engine's persisted types, with `DbSet`s added to `AppDbContext`.
  (Rationale: entities live in modules by convention; the *behavior* lives in
  `Infrastructure/Jobs/`. `Modules/Jobs` is the entity/enum home only.) Writes
  to `JobQueueItem` outside `Infrastructure/Jobs` are forbidden and
  spec-guarded (F15, §9).
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
| **listener disconnect/catch-up (F23)** | kill the listener connection; rows committed while down are processed after reconnect's catch-up poll |
| leader election (`SchedulerLeaderService.Spec.cs`) | two hosts contend the advisory lock; exactly one starts Quartz; release migrates leadership |
| `AppRoleComposition.Spec.cs` (F17) | `Worker` builds a Generic Host — **no server/endpoints exist**, and the full DI graph resolves without web registrations; `Api` registers zero job hosted-services |

Email handlers + fold:

| Spec | Proves |
| --- | --- |
| kind routing | each email `job_type` resolves its registered handler, which calls the right `IEmailService` method |
| **eligibility race, both lock orders (F8/#811)** | order 1: revoke commits before the handler's locked read → no send, `CancelledIneligible` logged. order 2: handler holds the lock paused at the fake-sender barrier → the concurrent revoke **blocks** (does not complete), the send proceeds, revoke commits after — asserting the documented linearization semantic, not a preemption the design does not provide |
| `email_log` terminal writes | `Submitted` / `CancelledIneligible` / `PermanentlyFailed` each produce exactly one row with kind/recipient/entity ids/`provider_message_id`/`envelope_sha256` |
| send idempotency (F7) | re-running a job whose `Submitted` row exists sends **nothing**; retries send the **stored prepared envelope** byte-identically even after the domain row mutates |
| **non-throw provider failure (F3/F23)** | an unsuccessful provider response (no exception thrown by the SDK) surfaces as a classified exception → `Retry`/`PermanentFailure`; it can never yield `Submitted` |
| #809 durability + rollback (F6) | the committed reset job survives request cancellation/restart and is deliverable; a failed enqueue rolls back token issuance and vice versa (both directions) |
| **fold idempotency + in-flight dispatcher (F4/F23)** | re-running the fold produces no duplicate jobs (source-row marker); a `Processing` row is untouched by R1's fold and drains via the old path; R2's quiescence check fails while a non-terminal row is live |

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

- **Create:** `Infrastructure/Jobs/{JobOutcome,JobJson,IJobEnqueuer,JobEnqueuer,JobDefinition,JobsMetrics}.cs`;
  migration `HardenJobQueueEnvelope` — adds `lock_token`, `tenant_id`,
  `actor_user_id`, `correlation_id`, CHECK constraints, rescopes the
  idempotency index to `(job_type, idempotency_key)`, extends the claim index
  tie-break + `job_dead_letter` envelope columns (§4.2), sets `job_queue`
  autovacuum/fillfactor params (§4.1), and bumps the `max_attempts` default
  to 10.
- **Touch:** `JobQueueProcessor.cs` (split stale-reset from pending-only claim;
  fencing-conditioned transitions + rowcount checks; per-dispatch lease
  re-stamp + `lease/2` renewal; drain loop with budget; outcome taxonomy +
  exception classification; SQL-time backoff with equal jitter +
  `Retry-After`); `IJobHandler.cs` (`JobOutcome` return +
  `OnTerminalFailureAsync` — F5); `JobBackoff.cs` (computes delay
  **durations** only, never timestamps — F11); `JobQueueItem.cs` /
  `JobDeadLetter.cs` (new columns; **remove all timestamp initializers** —
  F11); `JobHandlerRegistry.cs` (versioned types, unknown-type → DLQ, startup
  DLQ-orphan warning). The drain-budget/lease knobs use code constants until
  2B's `AppEnvironment` edit lands (call-out below).
- **Gate:** all engine specs in §9 green, including old-owner-after-reclaim,
  full-batch lease expiry, cancellation classification, exact wire JSON,
  enqueue-boundary guard, drain, taxonomy; `EXPLAIN (ANALYZE, BUFFERS)` on the
  claim at ~100 k-row cardinality shows the partial-index ordered scan (F22),
  recorded in the PR.

### Phase 2B — #634: `APP_ROLE` + leadership + Quartz (absorbs F17–F19, F24)

- **Create:** `Infrastructure/Jobs/SchedulerLeaderService.cs`;
  `Infrastructure/Jobs/Quartz/{SyncSystemJobsJob,RecoverStaleJobsJob}.cs`;
  `Modules/Jobs/Entities/SystemJobDefinition.cs`; migration
  `AddSystemJobDefinitions`; `Infrastructure/Jobs/WorkerHeartbeatService.cs`;
  `SchedulerLeaderService.Spec.cs`, `AppRoleComposition.Spec.cs`.
- **Touch:** `AppEnvironment.cs` (`APP_ROLE` + validator + tuning vars incl.
  drain budget + retention windows); `Program.cs` (**Generic Host for
  `Worker`** — F17; role branching; `--worker-health`);
  `ServiceRegistration.cs` (retarget shared registrations to
  `IHostApplicationBuilder`; move `AddHttpContextAccessor` into shared infra —
  F17); `Dockerfile` (**`APP_ROLE=api` in the build-time OpenAPI env block** —
  F24); `apps/front-2/docker-compose.test.yml` (`APP_ROLE=api` — F24);
  `dokploy.yml` (worker service: shared storage volume — F18; no
  `container_name`, `stop_grace_period: 45s` on both services — F19; immutable
  `${RELEASE_TAG}` images — F14); Quartz packages in
  `Directory.Packages.props` + `PublyApp.Api.csproj`; `AppDbContext.cs`
  (`SystemJobDefinition` DbSet).
- **Gate:** leader-election spec green; `AppRoleComposition` proves the worker
  host has **no HTTP server** and a resolvable DI graph, api has zero job
  services; worker container passes `--worker-health`; OpenAPI build + front-2
  e2e compose run role-pinned.

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
  bug**); producers `InvitationService.cs`, `TenantAsStaffService.cs`,
  `StaffProfileAsStaffService.cs` (→ `IJobEnqueuer` + NOTIFY);
  `RequestPasswordReset.cs` (→ `IPasswordResetService`); revoke/accept services
  (remove `CancelPendingForInvitationAsync` calls); `AppDbContext.cs`
  (`EmailLog`/`EmailPreparedSend` DbSets). **The old dispatcher/entity ship
  unchanged in R1 as drainers** (§4.6).
- **Gate:** §9 email-handler specs green (both lock orders, prepared-envelope
  idempotency, non-throw provider failure, terminal `email_log` writes, #809
  rollback both directions); fold idempotency spec green; `just test-api`
  green.

### Phase 2C-R2 — drop the outbox (small follow-up release)

- Migration `DropInvitationEmailOutbox` (quiescence check + straggler back-copy
  + DROP — §4.6); **delete** `InvitationEmailOutboxDispatcher.cs` (+ spec),
  `InvitationEmailOutboxSignal.cs`, `InvitationEmailOutbox.cs`; remove their
  registrations + DbSet. Gate: quiescence check exercised in a spec; full suite
  green with the outbox code gone.

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
domain outcome marker where applicable (F13); `JobQueueMonitorService` (§7.2)
with threshold warnings; retention sweep jobs (§7.3 — email_log, DLQ,
prepared-sends). Gate: jobs run on schedule under `worker`; sampler emits gauges
and threshold warnings; retention deletes only out-of-window rows.

### Phase 4 — #636: staff job-visibility dashboard (sketch only)

Staff endpoints (`/staff/...`, per route-design guide) over `job_queue`,
`job_dead_letter`, `system_job_definitions`, and **`email_log`**: list/inspect
(payload view behind its own read permission — F20), **server-side
requeue-from-DLQ per the §4.2 contract** (registered-definition re-enqueue,
`staff:jobs:dead-letter:requeue` permission, immutable audit entry, no client
payload override — F16), enable/disable + edit-cron system jobs. Follows
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
- **O6 — Migrate sent-row history into `email_log`?** §4.6 R1 recommends
  **copying** the historical terminal rows (`Sent`/`Failed`/`Cancelled`) from
  `invitation_email_outbox` into `email_log` (with `legacy_outbox_id` lineage)
  before the R2 drop, so delivery history is complete from the feature's first
  day. Cost is trivial (days-old, small table). The alternative is dropping
  history with the table. *Recommendation: copy.* Needs a yes because the
  migration then transforms production data, not just schema.
- **O7 — Retention windows (F20).** Defaults proposed: `email_log` 180 days,
  `job_dead_letter` 90 days, `email_prepared_sends` orphans 7 days — enforced
  by Phase-3 sweep jobs, env-overridable. *Recommendation: adopt these
  defaults.* Flagged because retention of recipient personal data is
  policy territory, not engineering territory.

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
