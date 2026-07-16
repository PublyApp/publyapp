# Background Jobs & Worker Infrastructure — Design

> Status: **design, ratified 2026-07-16.** Closes the #632 gap (the #194 design
> was referenced but never committed). This document is the build spec for
> Epic A (#633–#636) and the email-outbox migration (#809/#810/#811). Another
> agent must be able to implement each phase from the sections below without
> re-deriving decisions.
>
> Scope note: **design only.** No application code is introduced by the doc
> itself; every file path below is a build target for a later phase.

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
| Invitation email delivery | #291 | already shipped as typed outbox (#806) |
| Password-reset email delivery | #809 | move fire-and-forget → typed outbox |

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
still send).

### What this design adds

1. A **generic `job_queue`** (JSON payload) for scheduled/on-demand jobs, with a
   `JobQueueProcessor` modeled on the shipped dispatcher's claim pattern.
2. **Quartz.NET with manual lifecycle** and `pg_try_advisory_lock` leader
   election so exactly one worker replica schedules recurring triggers.
3. **Role-based hosting** (`APP_ROLE`) so the same image runs as `api`, `worker`,
   or `all` — the worker process is where all job hosted-services live.
4. **Cross-process wake** to replace the in-process semaphore, which cannot span
   the api→worker process boundary once roles are separated.
5. The **`EmailOutbox` generalization** of the typed invitation outbox, with the
   #810/#811 fixes folded in and #809 (password-reset) onboarded.

---

## 2. Ratified decisions (2026-07-16 — FIXED)

These were ratified by the owner. Design around them; do not relitigate.

### D1 — Role-based hosting (one codebase, one image)

One Docker image. An `APP_ROLE` env var (surfaced via `AppEnvironment`) decides
composition at startup:

- `api` — maps HTTP endpoints; registers **no** job hosted-services.
- `worker` — registers Quartz + `JobQueueProcessor` + outbox dispatcher(s) + the
  cross-process listener; serves **no** HTTP request surface.
- `all` — both. This is the **local-dev default and the safe default when
  `APP_ROLE` is unset**.

Rationale: a single build/publish/migration story; horizontal scaling of the
worker independently of the api; no premature project split. The
`packages/shared-cs` + `apps/worker` extraction (#317) is **deferred** — recorded
as a follow-up (§9, Follow-ups), *not* part of this build order. The engine
therefore lives inside `apps/api` today and runs as the worker role of the same
assembly.

> This is a deliberate deviation from the `apps/jobs` / `apps/worker` shape
> sketched in `docs/guides/dotnet-project-layout.md` and `AGENTS.md`. Those
> remain the *eventual* target (triggered by #317); until then, "worker" is a
> **role of `PublyApp.Api`**, not a separate project.

### D2 — Typed `EmailOutbox` + generic `job_queue` (two lanes)

- **Typed `EmailOutbox`** (columns, not JSON) carries transactional domain
  side-effect emails: tenant invitation, staff invitation, password-reset (#809),
  extensible via a `kind` discriminator. Typed columns are kept precisely so
  domain logic — e.g. the invitation eligibility recheck and its FK to
  `invitations` — survives. This is the generalization of
  `invitation_email_outbox`.
- **Generic `job_queue`** (JSON payload) carries scheduled and on-demand jobs
  (session cleanup, exports, expired-invitation sweeps, future due-post publish).

The worker consumes **both** lanes: `EmailOutboxDispatcher` for the typed lane,
`JobQueueProcessor` for the generic lane. They are separate processors sharing
one claim pattern, not one processor.

### D3 — Pure Postgres, no broker (from #194, reconfirmed)

- Quartz.NET, **manual lifecycle**, **RAM job store** (no `qrtz_*` tables — see
  §5 rationale).
- `pg_try_advisory_lock` leader election for the scheduler across worker replicas.
- Lease-model claiming: `FOR UPDATE SKIP LOCKED` + a `locked_until` lease.
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

Optional worker-tuning vars (all optional, sane defaults, so `all`/dev needs no
new config):

| Var | Default | Purpose |
| --- | --- | --- |
| `JOB_QUEUE_BATCH_SIZE` | 20 | rows claimed per processor tick (matches outbox) |
| `JOB_QUEUE_POLL_SECONDS` | 5 | fallback poll interval (matches outbox) |
| `JOB_LEASE_SECONDS` | 300 | claim lease / stale-reclaim cutoff |
| `SCHEDULER_LEADER_LOCK_KEY` | (constant, not env) | see §5.2 |

### 3.2 Composition — exactly what each role wires

Refactor `Program.cs` + `Lib/ServiceRegistration.cs` so composition branches on
`AppEnvironment.Role`. Today `Program.Main` unconditionally maps endpoints and
`AddInfraServices` unconditionally `AddHostedService<InvitationEmailOutboxDispatcher>()`.
Split into role-gated blocks:

| Concern | `api` | `worker` | `all` |
| --- | --- | --- | --- |
| Kestrel HTTP + endpoint maps (`MapAuthEndpoints`, staff/tenant groups, `/files`, `/health`) | ✅ | ❌ (no request surface) | ✅ |
| `AddDbContext<AppDbContext>` + infra singletons (email, storage) | ✅ | ✅ | ✅ |
| `EmailOutboxDispatcher` hosted service | ❌ | ✅ | ✅ |
| `JobQueueProcessor` hosted service | ❌ | ✅ | ✅ |
| `SchedulerLeaderService` (+ Quartz) hosted service | ❌ | ✅ | ✅ |
| Cross-process `EmailOutboxListener` (§5 wake) | ❌ | ✅ | ✅ |
| Worker liveness heartbeat writer | ❌ | ✅ | ✅ |
| Job **producers** (services that write outbox/job_queue rows) | ✅ | ✅ | ✅ |

Note the last row: producers (an invitation handler enqueuing an email row) run
in **`api`**; consumers (dispatchers/processors) run in **`worker`**. In `all`
they coexist in one process. This is the crux of §5's cross-process-wake
problem.

Implementation shape: introduce `Infrastructure/Jobs/JobsServiceRegistration.cs`
with `AddWorkerServices(this WebApplicationBuilder)` that registers every
worker-only hosted service, and a `MapWorkerComposition` split in `Program.cs`
that (a) calls `AddWorkerServices` only for `Worker`/`All`, and (b) skips all
endpoint mapping + `UseHttpsRedirection`/`UseCors`/`UseOpenApi` for `Worker`.
Keeping worker registrations in their own extension file (not inline in
`ServiceRegistration.AddInfraServices`) is also what lets Phase 2A and 2B/2C be
developed with minimal contention on `ServiceRegistration.cs` (§8).

For `Worker`, still call `WebApplication.CreateBuilder` (host + DI + config +
logging are shared), but do **not** build the HTTP pipeline: no endpoint maps, no
CORS/OpenAPI/static-files middleware. A worker with zero mapped endpoints is
asserted by an architecture spec (§8).

### 3.3 Local dev

`all` is the default; `just dev-api` runs one process that is both api and
worker, exactly as today. No new dev workflow. Testcontainers integration tests
run under `all` too (the test host already starts the outbox dispatcher).

### 3.4 Dokploy deployment sketch

Same GHCR image (`ghcr.io/radandevist/publyapp/api:latest`), **two services**,
differing only by env. Add to `dokploy.yml` alongside `publyapp-api`:

```yaml
  publyapp-worker:
    image: ghcr.io/radandevist/publyapp/api:latest   # same image
    container_name: publyapp-worker
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - APP_ROLE=worker
      - POSTGRES_CONNECTION_STRING=${POSTGRES_CONNECTION_STRING}
      - FRONT_URL=${FRONT_URL}
      # + RESEND_API_KEY, STAFF_OWNER_*, etc. (same required set as api)
    networks: [publyapp-network]
    # NO dokploy.domain / dokploy.port labels — worker serves no HTTP.
    healthcheck:
      test: ["CMD", "dotnet", "PublyApp.Api.dll", "--worker-health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

The existing `publyapp-api` service adds `APP_ROLE=api`. Migrations continue to
run via the existing `migrate` image stage (§4) — **only one migration runner**,
unchanged; neither role runs `database update` at boot.

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

### 3.6 Graceful shutdown

- Hosted services honor the host `stoppingToken`; on SIGTERM the host stops them
  cooperatively. Set a bounded `HostOptions.ShutdownTimeout` (e.g. 30 s).
- `SchedulerLeaderService` calls `scheduler.Shutdown(waitForJobsToComplete:
  true)` within that budget, then releases the advisory lock (implicit on
  connection close).
- A job/email row claimed but not finished at shutdown is **not** lost: it stays
  `Processing` with a `locked_until` lease and is reclaimed after expiry
  (§6). Delivery/execution is at-least-once by design; handlers are idempotent
  (§6).

---

## 4. Schemas (DDL-level)

Conventions applied throughout: **snake_case columns, UUIDv7 PKs**
(`defaultValueSql: "uuidv7()"`, as in the shipped outbox migration), `timestamptz`.
All tables are created via **EF Core migrations** (the DDL below is the intended
shape, authoritative for column/index names).

### 4.0 `BaseAttributes` stance for infra tables (explicit)

`BaseAttributes` brings `id` + `created_at` + `updated_at` + **`is_deleted` +
`deleted_at`**, and `AppDbContext.UpdateAuditFields` **auto-converts an EF
`Delete` into a soft-delete** for any `BaseAttributesNoKey` entity unless
force-hard-delete is requested.

| Table | Inherits `BaseAttributes`? | Why |
| --- | --- | --- |
| `job_queue` | **No** | Delete-on-success is a *hard* delete; the soft-delete conversion actively fights it, and `is_deleted`/`deleted_at` are dead weight on a high-churn table. Claim/complete go through **raw SQL** (bypassing `UpdateAuditFields` entirely), so the audit override buys nothing. Use an explicit lean entity with a uuidv7 `id` + manual `created_at`/`updated_at`. |
| `job_dead_letter` | **No** | Append-only audit trail; never soft-deleted. Explicit `id` + `created_at`/`failed_at`. |
| `system_job_definitions` | **Yes** | Low-churn config edited from the dashboard; `updated_at` tracking is wanted, and operational disable uses an explicit `is_enabled` flag (not deletion), so the soft-delete default is harmless. |
| `email_outbox` | **Yes** | Keeps parity with the shipped `invitation_email_outbox` (which already inherits `BaseAttributes`); status transitions mutate rows, deletion is not part of its lifecycle. |

### 4.1 `job_queue`

```sql
CREATE TABLE job_queue (
    id              uuid        NOT NULL DEFAULT uuidv7(),
    job_type        text        NOT NULL,                 -- handler dispatch key
    payload         jsonb       NOT NULL DEFAULT '{}',
    status          integer     NOT NULL DEFAULT 0,        -- 0 Pending, 1 Processing
    priority        integer     NOT NULL DEFAULT 0,        -- higher = sooner
    attempts        integer     NOT NULL DEFAULT 0,
    max_attempts    integer     NOT NULL DEFAULT 8,        -- per-enqueue override allowed
    next_attempt_at timestamptz NOT NULL DEFAULT now(),    -- scheduling + backoff live here
    locked_until    timestamptz NULL,                      -- lease; NULL when unclaimed
    locked_by       text        NULL,                      -- claiming worker/replica id
    last_error      text        NULL,
    idempotency_key text        NULL,                      -- optional dedup on enqueue
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_job_queue PRIMARY KEY (id)
);

-- Claim hot path: pending-and-due, ordered by priority then schedule.
CREATE INDEX ix_job_queue_claim
    ON job_queue (priority DESC, next_attempt_at, created_at)
    WHERE status = 0;

-- Stale-lease reclaim path (RecoverStaleJobsJob + processor reclaim).
CREATE INDEX ix_job_queue_reclaim
    ON job_queue (locked_until)
    WHERE status = 1;

-- Idempotent enqueue (e.g. due-post dispatch enqueues a post at most once).
CREATE UNIQUE INDEX ux_job_queue_idempotency
    ON job_queue (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
```

There is deliberately **no `Succeeded`/`Failed` status**: success deletes the
row, terminal failure copies it to `job_dead_letter` and deletes it. Only
`Pending`/`Processing` are ever persisted (§6).

### 4.2 `job_dead_letter`

```sql
CREATE TABLE job_dead_letter (
    id              uuid        NOT NULL DEFAULT uuidv7(),
    original_job_id uuid        NULL,          -- the job_queue.id it came from
    job_type        text        NOT NULL,
    payload         jsonb       NOT NULL,
    attempts        integer     NOT NULL,
    last_error      text        NULL,
    failed_at       timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_job_dead_letter PRIMARY KEY (id)
);

CREATE INDEX ix_job_dead_letter_job_type ON job_dead_letter (job_type, failed_at);
```

> Named `job_dead_letter` (per the ratified schema list), **renaming #194's
> `dead_letter_jobs`** for a consistent `job_` prefix across the engine tables.
> Staff dashboard (#636) reads this and can requeue (re-insert into `job_queue`).

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

### 4.4 `email_outbox` (generalization of `invitation_email_outbox`)

Target entity (keeps `BaseAttributes`, adds `kind` extensibility + password-reset):

```sql
-- After the rename+extend migration (§4.5):
-- table: email_outbox  (was invitation_email_outbox)
--   id, created_at, updated_at, is_deleted, deleted_at        (BaseAttributes)
--   email            text        NOT NULL
--   kind             integer     NOT NULL   -- EmailKind: 0 Tenant, 1 Staff, 2 PasswordReset, …
--   token            text        NOT NULL   -- invitation token OR reset token
--   tenant_name      text        NULL       -- tenant-invitation only
--   account_level    integer     NULL       -- tenant-invitation only
--   invitation_id    uuid        NULL  FK->invitations(id)   -- invitation kinds only
--   user_id          uuid        NULL  FK->users(id)         -- password-reset (+ future) linkage
--   status           integer     NOT NULL   -- 0 Pending,1 Sent,2 Failed,3 Processing,4 Cancelled
--   attempt_count    integer     NOT NULL
--   last_error       text        NULL
--   next_attempt_at  timestamptz NOT NULL
--   claimed_at       timestamptz NULL       -- lease marker (LeaseDuration cutoff)
--   sent_at          timestamptz NULL
-- indexes: (status, next_attempt_at) [claim], (invitation_id), (user_id)
```

The existing `InvitationEmailKind { TenantInvitation=0, StaffInvitation=1 }`
becomes `EmailKind { TenantInvitation=0, StaffInvitation=1, PasswordReset=2, … }`
— **existing 0/1 values are preserved**, so persisted rows map cleanly. Status
enum is unchanged.

### 4.5 Migration path — recommendation: **rename + extend** (not new-table-and-drain)

Two options were considered:

- **A. Rename + extend (recommended).** One migration: `ALTER TABLE
  invitation_email_outbox RENAME TO email_outbox;` (+ rename PK/index/FK
  constraints to the new names), add `user_id` (nullable FK → `users`), and
  broaden the `kind`/status EF mappings. Rename the entity
  `InvitationEmailOutbox` → `EmailOutbox`; the existing `kind` column is reused
  (enum values extended, not remapped).
- **B. New table + drain.** Create `email_outbox`, dual-write, drain
  `invitation_email_outbox` in the background, then drop it.

**Recommend A.** The `invitation_email_outbox` table is days old, single-tenant
in volume, and single-deployment; a rename + additive columns is a pure DDL
migration with **no row rewrite and no drain window**. Existing rows keep their
`kind` 0/1 semantics unchanged. Option B's dual-write/drain machinery is
justified only for large, always-on tables — not this one. Data-migration plan
for A: (1) rename table + constraints; (2) add nullable `user_id` + FK; (3) no
backfill needed (invitation rows already carry `invitation_id`; `user_id` stays
NULL for them); (4) ship the producer change (#809) that writes `kind =
PasswordReset` rows. **Deploy ordering:** run the migration (rename) *before*
rolling the new code, since the renamed table must exist when the new assembly
boots — this fits the existing `migrate` image stage that runs ahead of app
rollout.

> Open question O1 (§10) flags that renaming a just-shipped production table
> wants explicit owner sign-off.

---

## 5. Components

### 5.1 `JobQueueProcessor` (`Infrastructure/Jobs/JobQueueProcessor.cs`)

A `BackgroundService` running on **every** worker instance (not leader-gated).
Structure mirrors `InvitationEmailOutboxDispatcher` — same public-method-for-
determinism discipline.

- **Claim** — one statement, modeled on the shipped `ClaimBatchAsync`:

  ```sql
  UPDATE job_queue
  SET status = 1, locked_until = {now + lease}, locked_by = {workerId}
  WHERE id IN (
      SELECT id FROM job_queue
      WHERE (status = 0 AND next_attempt_at <= {now})
         OR (status = 1 AND locked_until <= {now})     -- reclaim expired lease
      ORDER BY priority DESC, next_attempt_at, created_at
      LIMIT {batchSize}
      FOR UPDATE SKIP LOCKED
  )
  RETURNING id;
  ```

  Public `static Task<List<Guid>> ClaimBatchAsync(...)` so specs can race two
  claimers directly (as `InvitationEmailOutboxDispatcherSpec.ItShouldNeverClaim…`
  does). `locked_until` is set at claim time (a real lease), unlike the outbox
  which derives its lease from `claimed_at` + a constant — the `job_queue` lease
  is explicit so per-job-type lease lengths are possible later.

- **Dispatch** — a `JobHandlerRegistry` maps `job_type` → `IJobHandler`.
  `IJobHandler` exposes `string JobType { get; }` and
  `Task HandleAsync(JobContext ctx, CancellationToken ct)` where `JobContext`
  exposes the typed-deserialized `payload`. Registration is **explicit and
  fail-fast** (a startup guard that every `job_type` maps to exactly one handler
  and vice-versa), matching the repo's DI ethos; handlers are resolved from a
  fresh DI scope per job (as the dispatcher creates a scope per batch).

- **Retry / backoff — the #810-class fix, by design.** Backoff is computed in
  **one place** — a shared `JobBackoff.NextAttempt(attempts)` used by both lanes
  (`min(2^attempts, MaxBackoffSeconds)`, mirroring the outbox constants
  `MaxAttempts = 8`, `MaxBackoffSeconds = 900`). On a **retryable** failure the
  processor: `attempts++`, `last_error = …`, `next_attempt_at =
  JobBackoff.NextAttempt(attempts)`, **`status = Pending`, `locked_until =
  NULL`** — so the *same* claim predicate (`status = 0 AND next_attempt_at <=
  now`) that governs first-run also governs retries. No row is ever left
  `Processing` waiting for its lease to expire just to honor backoff (that is
  exactly the #810 bug). On **terminal** failure (`attempts >= max_attempts`):
  insert into `job_dead_letter`, then **delete** from `job_queue` (same
  transaction). On **success**: **delete** from `job_queue`.

- **Batch size** from `JOB_QUEUE_BATCH_SIZE` (default 20).

Public `ProcessBatchAsync(CancellationToken)` for deterministic single-batch
specs.

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
| `RecoverStaleJobsJob` | 5 min | Belt-and-braces reset of `job_queue` rows stuck `Processing` past `locked_until` back to `Pending` (the processor also reclaims inline; this covers a fully-crashed fleet). Also a safety sweep for stale `email_outbox` leases. |
| `DispatchDuePostsJob` | — | **FUTURE / D3 (#646).** Scans `scheduled_posts` and enqueues due posts into `job_queue` with an `idempotency_key`. *Design accommodates it (idempotent enqueue, priority) but does not build it.* |

**Why no `qrtz_*` tables (deviation from #194's table list):** durability lives
in `job_queue`/`email_outbox`, leadership lives in the advisory lock, and the
system-job catalog lives in `system_job_definitions` (reconciled every 60 s).
Quartz here only needs to *fire cron triggers on the leader* — it holds no
durable state of its own, so a persistent Quartz store would be redundant
complexity. If a durable Quartz store is ever wanted (e.g. misfire policies
across restarts), it is an additive follow-up, not a Phase-A dependency.

### 5.4 `EmailOutboxDispatcher` (generalized; `Infrastructure/Messaging/Email/`)

Evolves the shipped `InvitationEmailOutboxDispatcher` (rename →
`EmailOutboxDispatcher`). What changes:

- **Kind dispatch.** `SendOneAsync` switches on `EmailKind`: `TenantInvitation`
  and `StaffInvitation` keep today's paths; **`PasswordReset`** calls
  `SendResetPasswordRequestEmailAsync` (the #809 onboarding). Use an explicit
  kind→sender map/switch, never `ToLower()` dispatch (PUBLY0003).
- **#810 backoff fix (folded in).** Same principle as §5.1: on retryable failure
  set **`Status = Pending`**, **clear `ClaimedAt`**, **retain `NextAttemptAt`**;
  keep `Failed` terminal. Today the row is left `Processing`, so the pending
  predicate can't see the fresh `NextAttemptAt` and the retry waits for the 5-min
  lease. Backoff must come from the shared `JobBackoff` so both lanes agree.
- **#811 eligibility-race fix (folded in).** The current send-time recheck reads
  `item.Invitation` from an `Include` but does not lock it, so a concurrent
  revoke/accept can commit between the recheck and the send. Fix: perform the
  send-decision inside a transaction that takes a **row lock on the invitation**
  (re-`SELECT … FOR UPDATE` the linked invitation, or a `pg_advisory_xact_lock`
  keyed on the outbox/invitation id) covering a **fresh eligibility read →
  delivery transition**, plus a **provider idempotency key** so a retry after a
  crash-post-send cannot double-send. A concurrent revoke then either blocks
  until we commit `Sent`/`Cancelled`, or we observe its committed `Cancelled`
  and skip. The optimistic-concurrency-after-send approach is insufficient
  because the email has already escaped.
- Everything else — host-lifetime token (never per-request), delete-nothing /
  keep-terminal-rows-for-visibility, `ClaimBatchAsync` single-statement claim —
  is preserved.

### 5.5 Cross-process wake — recommendation: **Postgres `LISTEN`/`NOTIFY` + poll fallback**

**The problem.** `IInvitationEmailOutboxSignal` is a `SemaphoreSlim` — an
**in-process** wake. Producers call `_outboxSignal.Notify()` from
`InvitationService`, `TenantAsStaffService`, `StaffProfileAsStaffService` (grep-
confirmed) after committing rows. Under D1, those producers run in the **`api`**
process while the dispatcher runs in the **`worker`** process — a semaphore in
`api` can never release a semaphore in `worker`. Left unfixed, every email waits
up to the full poll interval, and the "immediate wake" property is silently lost.

**Options.**

- **Pure polling.** Drop the signal; rely on the 5 s poll. Simple, correct, but
  adds up-to-5 s latency to *every* transactional email and to future
  latency-sensitive jobs.
- **`LISTEN`/`NOTIFY` + poll fallback (recommended).** Producers issue
  `NOTIFY email_outbox` (via `pg_notify('email_outbox', '')`) — Postgres delivers
  it **at commit**, so it is naturally transactional and never fires for a
  rolled-back write. A worker-side `EmailOutboxListener` holds a dedicated Npgsql
  connection doing `LISTEN email_outbox` and, on notification, wakes the
  dispatcher's loop (the same `IEmailOutboxSignal` abstraction, now backed by a
  Postgres implementation). The **poll interval remains the correctness
  fallback**, exactly as today.

  Failure analysis: (a) *no listener connected at commit* → NOTIFY is dropped by
  Postgres, but the poll fallback picks the row up within the interval; (b)
  *listener connection drops* → on reconnect the listener re-`LISTEN`s **and
  immediately triggers one catch-up poll**, so any notifications missed while
  disconnected are covered; (c) *NOTIFY payload limits (8 KB)* → send an **empty
  payload** and let the dispatcher query for eligible rows (it must anyway,
  because many producers may have committed); (d) *thundering herd* → the
  dispatcher already coalesces (a single wake drains a full batch), and the
  semaphore-style "one pending wake is enough" collapsing is preserved.

**Recommend `LISTEN`/`NOTIFY` + poll fallback.** It preserves the shipped low-
latency behavior across the process split, degrades to pure polling on any
listener failure, and needs no broker (honoring D3). Apply the **same channel
pattern to `job_queue`** (`NOTIFY job_queue`) so on-demand jobs (exports) also
wake promptly. In the `all` role the same mechanism works unchanged (it is just
in-process NOTIFY/LISTEN), so the `SemaphoreSlim` signal is **retired** rather
than kept as a special case. Keep the `IEmailOutboxSignal`/`IJobSignal`
interface seam so tests can inject a deterministic fake.

---

## 6. Failure semantics

- **Lease model.** A claim sets `Processing` + `locked_until = now + lease`
  (`JOB_LEASE_SECONDS`, default 300). A worker that finishes deletes (success) or
  DLQs+deletes (terminal) the row. A worker that crashes leaves the row
  `Processing`; once `locked_until` passes, the next `ClaimBatchAsync` (or
  `RecoverStaleJobsJob`) reclaims it. `email_outbox` uses the same model via
  `claimed_at` + `LeaseDuration`.
- **Crash between claim and completion.** At-least-once: the row is reclaimed and
  retried after lease expiry. Handlers **must be idempotent** (see below), so a
  re-run after a crash-post-side-effect is safe.
- **Poison jobs → DLQ.** When `attempts >= max_attempts`, the row is copied to
  `job_dead_letter` and deleted from `job_queue` in one transaction. The email
  lane keeps its terminal `Failed` row in place (operator visibility / manual
  redelivery) rather than a separate DLQ — that shipped behavior is retained.
- **Max-attempt policy per job type.** `max_attempts` is a per-row column
  (default 8, overridable at enqueue) so a cheap idempotent sweep and an
  expensive export can differ. Backoff schedule is shared
  (`JobBackoff`), capped at `MaxBackoffSeconds` (900).
- **Idempotency expectations on handlers.** Every `IJobHandler` and every email
  kind must be safe to run ≥1 time: use natural idempotency (e.g. session
  cleanup `DELETE … WHERE expires_at <= now` is naturally idempotent), an
  `idempotency_key` on enqueue (due-post publish), and provider idempotency keys
  for outbound emails (#811). This is a **hard contract**, asserted per handler
  in specs.
- **Clock-skew stance.** All lease/backoff/`next_attempt_at` comparisons use
  **database `now()`** wherever the claim runs in SQL (the claim statement uses
  server time), so multi-replica workers agree regardless of container clock
  drift. Application-side timestamps (e.g. `DateTime.UtcNow` in `SendOneAsync`)
  are only used for non-safety fields; anything that gates claim eligibility is
  evaluated in SQL against `now()`. Lease durations are set generously (minutes)
  relative to any plausible skew.

---

## 7. Module / file placement

Per `docs/guides/api-module-structure.md` (infra = capabilities provided *to*
domains) and `docs/guides/dotnet-project-layout.md` (co-located `*.Spec.cs`, new
top-level source area needs its own `Compile Include` line in the test shell).

- **Engine (infra):** `apps/api/Infrastructure/Jobs/`
  - `JobQueueProcessor.cs`, `SchedulerLeaderService.cs`, `JobBackoff.cs`,
    `JobHandlerRegistry.cs`, `IJobHandler.cs`, `JobContext.cs`,
    `JobsServiceRegistration.cs`, `WorkerHeartbeatService.cs`
  - `Infrastructure/Jobs/Quartz/`: `SyncSystemJobsJob.cs`,
    `RecoverStaleJobsJob.cs` (and future `DispatchDuePostsJob.cs`).
  - The engine is a technical capability used by many domains → **infra**, not a
    domain module. This mirrors `Infrastructure/Messaging/Email/`.
- **Engine entities:** these are infra-owned tables, but the repo keeps EF
  entities under `Modules/`. Create a small **`Modules/Jobs/Entities/`**
  (`JobQueueItem.cs`, `JobDeadLetter.cs`, `SystemJobDefinition.cs`) as the domain
  home for the engine's persisted types, with `DbSet`s added to `AppDbContext`.
  (Rationale: entities live in modules by convention; the *behavior* lives in
  `Infrastructure/Jobs/`. `Modules/Jobs` is the entity/enum home only.)
- **`EmailOutbox` entity:** move out of `Modules/Invitations/Entities/` — it now
  serves auth (password-reset) too. Recommended home:
  **`Modules/Messaging/Entities/EmailOutbox.cs`** (a neutral outbound-messaging
  module), with the `EmailKind`/status enums beside it. The **dispatcher stays in
  `Infrastructure/Messaging/Email/`** (it is infra). Producers reference the
  entity from their own domains (`Modules/Invitations`, `Modules/Auth`).
- **Job handlers (domain logic):** live with their domain, not in the engine —
  e.g. session cleanup (#389) → `Modules/Auth/Jobs/CleanupExpiredSessionsHandler.cs`
  (Session lives in `Modules/Auth/Entities`), expired-invitation sweep (#425) →
  `Modules/Invitations/Jobs/`, exports (#213/#286) →
  `Modules/AuditLogs/Jobs/` and `Modules/Tenants/Jobs/`. Each implements
  `IJobHandler`. This keeps the engine domain-agnostic and each job's business
  logic inside its slice.
- **Migrations:** `apps/api/Migrations/` (unchanged location) — one per schema
  step (§8), each also mutating `AppDbContextModelSnapshot.cs`.
- **DI:** worker hosted services via `AddHostedService<…>()` inside
  `JobsServiceRegistration.AddWorkerServices`, gated by role in `Program.cs`.
  `IJobHandler` implementations via the explicit `JobHandlerRegistry` (keyed by
  `JobType`) rather than `[Service]` (which has no keying by string). Producers,
  registry, and `AppEnvironment` accessors follow existing patterns.
- **Test-shell wiring:** a **new** top-level `Modules/Jobs` area already falls
  under the existing `..\Modules\**\*.Spec.cs` include, so no new shell line is
  needed; the same is true for `Infrastructure/**`. (Only a brand-new *sibling of*
  `Modules/` would need its own `Compile Include` line — none is introduced.)

---

## 8. Testing strategy

Testcontainers integration specs (Docker Postgres, per `docs/guides/api-integration-tests.md`),
co-located `*.Spec.cs`, `ItShould…` naming, and the shipped dispatcher's
**public-methods-for-determinism** discipline (drive `ClaimBatchAsync` /
`ProcessBatchAsync` / `SendOneAsync` directly so assertions never race the live
background loop; schedule control rows into the future as
`InvitationEmailOutboxDispatcherSpec` does).

| Spec | Proves | Model on |
| --- | --- | --- |
| `JobQueueProcessor.Spec.cs` — claim contention | two concurrent `ClaimBatchAsync` never claim the same id; non-vacuous (something claimed) | `ItShouldNeverClaimTheSameRowFromTwoConcurrentDispatchers` |
| `JobQueueProcessor.Spec.cs` — lease reclaim | a row `Processing` past `locked_until` is re-claimable; before it, is not | new |
| `JobQueueProcessor.Spec.cs` — backoff requeue (#810 class) | after retryable failure the row is `Pending` with future `next_attempt_at`; **unclaimable before, claimable after** `next_attempt_at` | #810's requested spec shape |
| `JobQueueProcessor.Spec.cs` — DLQ on exhaustion | at `attempts == max_attempts` the row is gone from `job_queue` and present in `job_dead_letter` | new |
| `SchedulerLeaderService.Spec.cs` — leader election | two hosts contend the advisory lock; exactly one acquires and starts Quartz; releasing lets the other take over | new |
| `AppRoleComposition.Spec.cs` — architecture guard | in `Worker` the app maps **zero HTTP endpoints**; in `Api` **zero job hosted-services** are registered | discovery pattern of `ServiceArgsRecordConvention.Spec.cs` (reflect over the built service collection / endpoint data sources) |
| `EmailOutboxDispatcher.Spec.cs` — kind dispatch | each `EmailKind` (incl. `PasswordReset`) routes to the right sender | extends the shipped tenant/staff kind specs |
| `EmailOutboxDispatcher.Spec.cs` — eligibility race (#811) | a fake-sender barrier pauses after eligibility; a second context commits revoke/accept; assert **no send** occurs | #811's requested barrier spec |

The `AppRoleComposition` spec is the architecture-convention analogue of
`ServiceArgsRecordConvention.Spec.cs`: it discovers composition facts by
reflection and fails the build on drift (e.g. someone adding an endpoint that
maps under the worker role, or a job hosted-service leaking into `api`).

---

## 9. Build order (packet map for tonight)

**Legend:** ✅ create, ✎ touch. A phase's **gate** is its verification bar.

### Phase 2A — #633: core queue + processor

- **Create:** `Infrastructure/Jobs/{IJobHandler,JobContext,JobHandlerRegistry,JobBackoff,JobQueueProcessor,JobsServiceRegistration}.cs`;
  `Modules/Jobs/Entities/{JobQueueItem,JobDeadLetter}.cs`;
  migration `AddJobQueue` (+ `job_dead_letter`); `JobQueueProcessor.Spec.cs`.
- **Touch:** `AppDbContext.cs` (add `DbSet`s + snapshot); wire
  `AddHostedService<JobQueueProcessor>()` **inside `JobsServiceRegistration`**
  (not `ServiceRegistration.AddInfraServices`), registered unconditionally for
  now (2B adds role gating). Keep out of `Program.cs`.
- **Gate:** claim-contention + lease-reclaim + backoff-requeue + DLQ specs green;
  `just test-api` passes.

### Phase 2B — #634: `APP_ROLE` + leadership + Quartz

- **Create:** `Infrastructure/Jobs/SchedulerLeaderService.cs`;
  `Infrastructure/Jobs/Quartz/{SyncSystemJobsJob,RecoverStaleJobsJob}.cs`;
  `Modules/Jobs/Entities/SystemJobDefinition.cs`; migration
  `AddSystemJobDefinitions`; `Infrastructure/Jobs/WorkerHeartbeatService.cs`;
  `SchedulerLeaderService.Spec.cs`, `AppRoleComposition.Spec.cs`.
- **Touch:** `AppEnvironment.cs` (`APP_ROLE` + validator + tuning vars);
  `Program.cs` (role-gated composition, `--worker-health` CLI arg, skip HTTP
  pipeline for `Worker`); `ServiceRegistration.cs` (role gating of
  `AddWorkerServices`); `dokploy.yml` (`publyapp-worker` service + `APP_ROLE=api`
  on the existing one); add Quartz packages to `Directory.Packages.props` +
  `PublyApp.Api.csproj`; `AppDbContext.cs` (`SystemJobDefinition` DbSet).
- **Gate:** leader-election spec (two hosts, one lock) green; `AppRoleComposition`
  spec proves worker maps zero endpoints and api registers zero job services;
  worker container passes `--worker-health`.

### Phase 2C — #809/#810/#811: `EmailOutbox` generalization + fixes

- **Create:** `Modules/Messaging/Entities/EmailOutbox.cs` (+ `EmailKind`/status
  enums); migration `RenameInvitationEmailOutboxToEmailOutbox` (rename + `user_id`
  FK); `EmailOutboxDispatcher.Spec.cs` kind-dispatch + eligibility-race specs;
  `Infrastructure/Messaging/Email/EmailOutboxListener.cs` (LISTEN) +
  `IEmailOutboxSignal` Postgres impl.
- **Touch:** rename `InvitationEmailOutboxDispatcher` → `EmailOutboxDispatcher`
  (fold #810 backoff + #811 row-lock recheck + kind dispatch);
  `RequestPasswordReset.cs` (#809 — write a `PasswordReset` outbox row
  transactionally with token issuance, drop the fire-and-forget
  `ContinueWith`); producers that call `Notify()` (`InvitationService`,
  `TenantAsStaffService`, `StaffProfileAsStaffService`) switch to `NOTIFY`;
  retire `InvitationEmailOutboxSignal`; `AppDbContext.cs` (rename DbSet).
- **Gate:** #810 backoff-requeue spec (unclaimable before / claimable after
  `next_attempt_at`); #811 barrier spec (no send after concurrent revoke); #809
  spec (committed reset row survives request cancel/restart and is deliverable);
  all shipped outbox specs still green after rename.

### Parallelization

- **2A ∥ 2C** at the feature-code level: different folders
  (`Infrastructure/Jobs` + `Modules/Jobs` vs `Infrastructure/Messaging/Email` +
  `Modules/Messaging` + `Modules/Auth`). Dispatchable to concurrent agents.
- **2B depends on 2A** conceptually (it role-gates the processor 2A creates) —
  but keeping 2A's registrations in `JobsServiceRegistration.cs` lets 2B wrap
  them without editing the same lines. 2B can start against 2A's registration
  seam.
- **Shared-file hazards (call-outs):**
  1. **`AppDbContext.cs`** — 2A adds job DbSets, 2B adds `SystemJobDefinition`,
     2C renames the outbox DbSet. Serialize the DbSet edits or expect a trivial
     merge here.
  2. **EF migrations + `AppDbContextModelSnapshot.cs`** — the snapshot is a
     single file mutated by **every** migration. 2A, 2B, and 2C each add a
     migration; migrations are linearized by timestamp, so **whichever lands
     second/third must regenerate its migration against the updated snapshot**
     (i.e. `just db-add` after rebasing). This is the one place the three phases
     *cannot* be blindly merged — sequence the migration step even if the code is
     written in parallel.
  3. **`AppEnvironment.cs`** — 2B owns it (`APP_ROLE`); 2A/2C should not touch it.
  4. **`ServiceRegistration.cs` / `Program.cs`** — 2B owns the role-gating edit;
     2A confines its registration to `JobsServiceRegistration.cs` to avoid
     contention.

### Phase 3 — #635: recovery / DLQ + first system jobs

`RecoverStaleJobsJob` wired to the scheduler; DLQ requeue path; **first real
handlers**: session cleanup (#389, `Modules/Auth/Jobs/`) and expired-invitation
status (#425, `Modules/Invitations/Jobs/`), each with an idempotency spec and a
`system_job_definitions` seed row. Gate: jobs run on schedule under `worker`,
expired rows swept, active rows preserved.

### Phase 4 — #636: staff job-visibility dashboard (sketch only)

Staff endpoints (`/staff/...`, per route-design guide) over `job_queue`,
`job_dead_letter`, `system_job_definitions`: list/inspect, requeue-from-DLQ,
enable/disable + edit-cron a system job (→ `SyncSystemJobsJob` applies within
60 s). Follows existing staff list-page + permission patterns. **Design-sketch
scope only in this doc**; full UI spec is out of Epic A's core.

### Follow-ups (not in this build order)

- **#317** — `packages/shared-cs` + `apps/worker` extraction, thin hosts,
  `seed-bulk` move. Revisit when the role-based single image is outgrown.
- Durable Quartz store (`qrtz_*`) — only if misfire-across-restart semantics are
  ever required.
- #646 (D3) `ScheduledPost` + `DispatchDuePostsJob` — the design accommodates it
  (idempotent enqueue, priority) but Epic A does not build it.

---

## 10. Open questions for the owner

Kept short; everything else is decided above.

- **O1 — Rename a just-shipped production table?** §4.5 recommends **rename +
  extend** (`invitation_email_outbox` → `email_outbox`) over new-table-and-drain,
  because the table is days old and low-volume. *Recommendation: approve the
  rename;* it is a pure DDL migration run ahead of the code roll, no drain. Needs
  a yes because it renames a production table shipped this week.
- **O2 — Cross-process wake mechanism.** §5.5 recommends **`LISTEN`/`NOTIFY` +
  poll fallback** (retiring the `SemaphoreSlim`). *Recommendation: approve;* it
  keeps the shipped low-latency behavior across the api→worker split and needs a
  dedicated listener connection per worker (accept that small connection cost).
- **O3 — Worker liveness mechanism.** §3.5 recommends a **file-heartbeat +
  `--worker-health` CLI probe** (no HTTP, honoring D1). *Recommendation:
  approve;* confirm Dokploy/Docker `healthcheck: CMD` is acceptable (it is
  supported). Alternative is a `worker_heartbeats` SQL row if a filesystem probe
  is undesirable.
- **O4 — Password-reset lane.** §5.4 puts #809 on the **typed `EmailOutbox`**
  (`kind = PasswordReset`), not the generic `job_queue`, because it is a
  transactional domain side-effect email (matches D2). *Recommendation: confirm.*
- **O5 — `EmailOutbox` entity home.** §7 recommends a new
  **`Modules/Messaging/`** module for the entity (it now serves auth +
  invitations), dispatcher staying in `Infrastructure/`. *Recommendation:
  approve;* the alternative (leave it in `Modules/Invitations`) is wrong now that
  auth writes to it.
