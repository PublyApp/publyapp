# Background Jobs & Worker Infrastructure — Design

> Status: **design, ratified 2026-07-16; revised same night** (single-lane
> ruling — see Ratification record, §10). Closes the #632 gap (the #194 design
> was referenced but never committed). This document is the build spec for
> Epic A (#633–#636) and the email fold-in (#809/#810/#811). Another
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
still send).

The outbox's *claim pattern, host-lifetime discipline, and spec discipline* are
the template for this design's engine. Its *table and dispatcher* are retired by
it: emails become jobs on the generic queue (§2 D2), the three bugs are fixed in
the engine and the email job handlers (§5), and delivery history moves to
`email_log` (§4.4).

### What this design adds

1. A **generic `job_queue`** (JSON payload) for **all** background work —
   scheduled jobs, on-demand jobs, and transactional emails — with a
   `JobQueueProcessor` modeled on the shipped dispatcher's claim pattern.
2. **Quartz.NET with manual lifecycle** and `pg_try_advisory_lock` leader
   election so exactly one worker replica schedules recurring triggers.
3. **Role-based hosting** (`APP_ROLE`) so the same image runs as `api`, `worker`,
   or `all` — the worker process is where all job hosted-services live.
4. **Cross-process wake** (`LISTEN`/`NOTIFY` on `job_queue`) to replace the
   in-process semaphore, which cannot span the api→worker process boundary once
   roles are separated.
5. The **email fold-in**: `invitation_email_outbox` migrates into `job_queue`
   email jobs and is dropped; an append-only **`email_log`** records terminal
   delivery outcomes from day one; the #810/#811 fixes land in the engine and
   the email handlers; #809 (password-reset) becomes a transactional email job.

---

## 2. Ratified decisions (2026-07-16 — FIXED)

These were ratified by the owner. Design around them; do not relitigate. D2 was
**revised by the owner later the same night** (see Ratification record, §10);
the text below is the current ruling.

### D1 — Role-based hosting (one codebase, one image)

One Docker image. An `APP_ROLE` env var (surfaced via `AppEnvironment`) decides
composition at startup:

- `api` — maps HTTP endpoints; registers **no** job hosted-services.
- `worker` — registers Quartz + `JobQueueProcessor` + the cross-process
  listener; serves **no** HTTP request surface.
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
  outcomes — sent, cancelled-ineligible, permanently-failed — carrying kind,
  recipient, related entity IDs (`invitation_id`, `user_id`), error, and
  timestamps. The queue stays delete-on-success; **history lives in
  `email_log`**, cleanly separated from execution state. Schema in §4.4.

Consequences: superseded open questions O1 (rename+extend) and O4
(password-reset on the typed outbox) are void — password-reset (#809) becomes
an email job; the shipped `invitation_email_outbox` migrates into `job_queue` +
`email_log` and is **dropped** (§4.5).

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
| `JOB_QUEUE_BATCH_SIZE` | 20 | rows claimed per processor tick (matches the shipped outbox) |
| `JOB_QUEUE_POLL_SECONDS` | 5 | fallback poll interval (matches the shipped outbox) |
| `JOB_LEASE_SECONDS` | 300 | claim lease / stale-reclaim cutoff |
| `SCHEDULER_LEADER_LOCK_KEY` | (constant, not env) | see §5.2 |

### 3.2 Composition — exactly what each role wires

Refactor `Program.cs` + `Lib/ServiceRegistration.cs` so composition branches on
`AppEnvironment.Role`. Today `Program.Main` unconditionally maps endpoints and
`AddInfraServices` unconditionally `AddHostedService<InvitationEmailOutboxDispatcher>()`
(retired by Phase 2C). Split into role-gated blocks:

| Concern | `api` | `worker` | `all` |
| --- | --- | --- | --- |
| Kestrel HTTP + endpoint maps (`MapAuthEndpoints`, staff/tenant groups, `/files`, `/health`) | ✅ | ❌ (no request surface) | ✅ |
| `AddDbContext<AppDbContext>` + infra singletons (email, storage) | ✅ | ✅ | ✅ |
| `JobQueueProcessor` hosted service | ❌ | ✅ | ✅ |
| `SchedulerLeaderService` (+ Quartz) hosted service | ❌ | ✅ | ✅ |
| Cross-process `JobQueueListener` (§5.5 wake) | ❌ | ✅ | ✅ |
| Worker liveness heartbeat writer | ❌ | ✅ | ✅ |
| Job **producers** (services that write `job_queue` rows) | ✅ | ✅ | ✅ |

Note the last row: producers (an invitation handler enqueuing an email job) run
in **`api`**; the consumer (`JobQueueProcessor`) runs in **`worker`**. In `all`
they coexist in one process. This is the crux of §5.5's cross-process-wake
problem.

Implementation shape: introduce `Infrastructure/Jobs/JobsServiceRegistration.cs`
with `AddWorkerServices(this WebApplicationBuilder)` that registers every
worker-only hosted service, and a `MapWorkerComposition` split in `Program.cs`
that (a) calls `AddWorkerServices` only for `Worker`/`All`, and (b) skips all
endpoint mapping + `UseHttpsRedirection`/`UseCors`/`UseOpenApi` for `Worker`.
Keeping worker registrations in their own extension file (not inline in
`ServiceRegistration.AddInfraServices`) is also what lets Phase 2A and 2B/2C be
developed with minimal contention on `ServiceRegistration.cs` (§9).

For `Worker`, still call `WebApplication.CreateBuilder` (host + DI + config +
logging are shared), but do **not** build the HTTP pipeline: no endpoint maps, no
CORS/OpenAPI/static-files middleware. A worker with zero mapped endpoints is
asserted by an architecture spec (§8).

### 3.3 Local dev

`all` is the default; `just dev-api` runs one process that is both api and
worker, exactly as today. No new dev workflow. Testcontainers integration tests
run under `all` too (the test host starts the worker hosted services, as it
started the shipped outbox dispatcher before the fold-in).

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
- A job claimed but not finished at shutdown is **not** lost: it stays
  `Processing` with a `locked_until` lease and is reclaimed after expiry
  (§6). Execution is at-least-once by design; handlers are idempotent
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
| `email_log` | **No** | Append-only delivery record, written once at a terminal outcome and never mutated or deleted; `updated_at`/soft-delete are meaningless here — same stance as `job_dead_letter`. Explicit `id` + `occurred_at`/`created_at`. |

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

**Email jobs enqueue with elevated `priority`** (constant, e.g. 100) so a burst
of bulk work (exports, sweeps, future due-post publishing at priority 0) can
never starve transactional user-facing email behind it.

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
> Email jobs DLQ like any other job; their *delivery-history* record additionally
> lands in `email_log` (§4.4) via the terminal-failure hook (§5.4).

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
**terminal outcomes only**. Never mutated, never deleted; the queue stays
delete-on-success and this table is where email history lives.

```sql
CREATE TABLE email_log (
    id            uuid        NOT NULL DEFAULT uuidv7(),
    job_id        uuid        NULL,             -- job_queue.id that produced this outcome
    kind          integer     NOT NULL,          -- EmailKind: 0 TenantInvitation, 1 StaffInvitation, 2 PasswordReset, …
    recipient     text        NOT NULL,
    outcome       integer     NOT NULL,          -- 0 Sent, 1 CancelledIneligible, 2 PermanentlyFailed
    invitation_id uuid        NULL,              -- related entity ids; no FK constraints (see below)
    user_id       uuid        NULL,
    attempts      integer     NOT NULL DEFAULT 0,
    last_error    text        NULL,              -- populated for PermanentlyFailed; reason for CancelledIneligible
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_email_log PRIMARY KEY (id)
);

CREATE INDEX ix_email_log_kind_occurred_at ON email_log (kind, occurred_at);
CREATE INDEX ix_email_log_invitation_id ON email_log (invitation_id)
    WHERE invitation_id IS NOT NULL;
CREATE INDEX ix_email_log_user_id ON email_log (user_id)
    WHERE user_id IS NOT NULL;

-- One terminal outcome per job: doubles as the handler's idempotency marker
-- (§5.4 — a reclaimed job whose Sent row already exists must not resend).
CREATE UNIQUE INDEX ux_email_log_job_id ON email_log (job_id)
    WHERE job_id IS NOT NULL;
```

Design notes:

- **No FK constraints** on `invitation_id`/`user_id` (plain indexed uuid
  columns): an audit-trail table must outlive — and never block — the lifecycle
  of the rows it references (hard-delete sweeps, future data-erasure flows).
  Same stance an audit log takes.
- `kind` values **preserve the shipped enum**: `InvitationEmailKind
  { TenantInvitation = 0, StaffInvitation = 1 }` extends to `EmailKind
  { TenantInvitation = 0, StaffInvitation = 1, PasswordReset = 2, … }`, so rows
  copied from `invitation_email_outbox` during migration keep their meaning.
- `job_id` is NULL only for rows back-copied from the historical outbox during
  the migration (§4.5) — every runtime-written row carries the job id.

### 4.5 Migration path — fold `invitation_email_outbox` into `job_queue` + `email_log`, then drop

**Supersedes the previously ratified rename+extend (O1).** One Phase-2C
migration (`AddEmailLogAndFoldEmailOutbox`), running in the existing `migrate`
image stage ahead of app rollout:

1. **Create `email_log`** (§4.4 DDL).
2. **Back-copy terminal history** — `INSERT INTO email_log … SELECT` every
   `invitation_email_outbox` row with status `Sent` (→ outcome `Sent`,
   `occurred_at = sent_at`), `Failed` (→ `PermanentlyFailed`, carrying
   `attempt_count`/`last_error`), or `Cancelled` (→ `CancelledIneligible`).
   `job_id` stays NULL; `invitation_id`, `email` (→ `recipient`), and `kind`
   carry over directly. *(Recommendation — see O6, §10; the alternative is to
   drop history with the table.)*
3. **Fold pending work into `job_queue`** — for rows with status `Pending` or
   `Processing` **and a non-null `invitation_id`**: insert a job with
   `job_type` mapped from `kind` (`email.tenant-invitation` /
   `email.staff-invitation`), `payload = jsonb_build_object('invitationId',
   invitation_id)`, **`attempts = attempt_count` and `next_attempt_at =
   next_attempt_at` preserved** (backoff position survives the fold),
   `max_attempts = 8`, email priority, `status = Pending` (claims do **not**
   carry over — a `Processing` row's old-code lease is meaningless to the new
   engine, and at-least-once semantics make an early re-claim safe).
4. **Legacy stragglers** — a still-pending row with `invitation_id IS NULL`
   (pre-linkage legacy shape; every current producer sets it, so the expected
   count is **zero**) cannot become an ID-payload job. Route it to `email_log`
   as `CancelledIneligible` with `last_error = 'unmigratable legacy outbox row
   (no invitation_id)'` rather than inventing a denormalized-payload handler
   path for a row that should not exist.
5. **Drop `invitation_email_outbox`.**

**Deploy-window caveat (explicit):** the migrate stage runs *before* the new
code rolls, and this migration drops a table the **old** code still reads and
writes. During the seconds-long replacement window, old-code replicas will log
dispatcher-poll errors (harmless — the loop catches and continues) and an
invitation created in that window would fail its outbox insert. On the current
single-node Dokploy deploy this window is accepted. If it ever isn't: split
into two migrations — M1 creates `email_log` + folds + *keeps* the table, roll
the code, then M2 (next deploy) re-runs the fold for any straggler rows written
during the window and drops the table. The single-migration form is recommended
for tonight; the two-step variant is the documented fallback.

**Data-preservation analysis (sent-row history):** copying terminal rows (step
2) is recommended over dropping them. Cost is trivial (the table is days old and
small); benefit is that `email_log` is *complete from the first day the feature
existed*, the #636 dashboard never has a "history starts here" seam, and
operator questions ("did user X ever get their invitation email?") stay
answerable. Flagged as **O6** (§10) for owner sign-off since it copies
production data during a migration.

---

## 5. Components

### 5.1 `JobQueueProcessor` (`Infrastructure/Jobs/JobQueueProcessor.cs`)

A `BackgroundService` running on **every** worker instance (not leader-gated).
Structure mirrors the shipped `InvitationEmailOutboxDispatcher` — same
public-method-for-determinism discipline.

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
  does). `locked_until` is set at claim time (a real lease), unlike the shipped
  outbox which derived its lease from `claimed_at` + a constant — the
  `job_queue` lease is explicit so per-job-type lease lengths are possible
  later.

- **Dispatch** — a `JobHandlerRegistry` maps `job_type` → `IJobHandler`.
  `IJobHandler` exposes `string JobType { get; }`,
  `Task HandleAsync(JobContext ctx, CancellationToken ct)`, and an optional
  `Task OnTerminalFailureAsync(JobContext ctx, CancellationToken ct)` hook
  (default no-op) that the engine invokes **when moving a job to the DLQ** — this
  is how email handlers write their `PermanentlyFailed` `email_log` row without
  the generic engine knowing what an email is. `JobContext` exposes the
  typed-deserialized `payload`. Registration is **explicit and fail-fast** (a
  startup guard that every `job_type` maps to exactly one handler and
  vice-versa), matching the repo's DI ethos; handlers are resolved from a fresh
  DI scope per job (as the shipped dispatcher creates a scope per batch). The
  registry carries the email job types (`email.tenant-invitation`,
  `email.staff-invitation`, `email.password-reset`) alongside every other
  job type — there is no separate email dispatch layer.

- **Retry / backoff — the #810-class fix, by design.** Backoff is computed in
  **one place** — `JobBackoff.NextAttempt(attempts)` in the engine
  (`min(2^attempts, MaxBackoffSeconds)`, keeping the shipped constants
  `MaxAttempts = 8`, `MaxBackoffSeconds = 900`). On a **retryable** failure the
  processor: `attempts++`, `last_error = …`, `next_attempt_at =
  JobBackoff.NextAttempt(attempts)`, **`status = Pending`, `locked_until =
  NULL`** — so the *same* claim predicate (`status = 0 AND next_attempt_at <=
  now`) that governs first-run also governs retries. No row is ever left
  `Processing` waiting for its lease to expire just to honor backoff (that is
  exactly the #810 bug — which dies with the shipped dispatcher, and cannot be
  reintroduced per-handler because handlers never touch retry state at all).
  On **terminal** failure (`attempts >= max_attempts`): invoke the handler's
  `OnTerminalFailureAsync` hook, insert into `job_dead_letter`, then **delete**
  from `job_queue` (hook write + DLQ insert + delete in one transaction). On
  **success**: **delete** from `job_queue`.

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
| `RecoverStaleJobsJob` | 5 min | Belt-and-braces reset of `job_queue` rows stuck `Processing` past `locked_until` back to `Pending` (the processor also reclaims inline; this covers a fully-crashed fleet). |
| `DispatchDuePostsJob` | — | **FUTURE / D3 (#646).** Scans `scheduled_posts` and enqueues due posts into `job_queue` with an `idempotency_key`. *Design accommodates it (idempotent enqueue, priority) but does not build it.* |

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
**retired** by Phase 2C. What replaces them:

- **One handler per kind** (three `IJobHandler`s, one `job_type` each) — *not*
  one kind-dispatching mega-handler. The engine's `JobHandlerRegistry` **is**
  the kind dispatcher (`job_type` is the discriminator); an internal
  kind-switch inside a single "email handler" would recreate a second dispatch
  layer, grow unboundedly as kinds are added, and drag every domain's
  eligibility logic into one file. Per-kind handlers also live in their owning
  domain (§7) and can differ in `max_attempts`/lease later.

  | `job_type` | Handler | Domain home |
  | --- | --- | --- |
  | `email.tenant-invitation` | `TenantInvitationEmailJobHandler` | `Modules/Invitations/Jobs/` |
  | `email.staff-invitation` | `StaffInvitationEmailJobHandler` | `Modules/Invitations/Jobs/` |
  | `email.password-reset` | `PasswordResetEmailJobHandler` | `Modules/Auth/Jobs/` |

- **Payload records — IDs, not denormalized strings.**
  `TenantInvitationEmailPayload { Guid InvitationId }`,
  `StaffInvitationEmailPayload { Guid InvitationId }`,
  `PasswordResetEmailPayload { Guid UserId }`. Everything the send needs is
  reloadable from those IDs — `Invitation` carries `Email`, `Token`,
  `AccountLevel`, and the `Tenant` navigation (name); `User` carries `Email`
  and the current `PasswordResetToken`/`PasswordResetTokenExpiresAt` — and the
  eligibility recheck must reload fresh domain state anyway, so denormalized
  copies would only be a staleness liability (a rotated reset token or renamed
  tenant would be sent stale). The shipped outbox's `tenant_name`/
  `account_level`/`token` columns existed because the outbox row *was* the
  payload; with reload-at-send they carry no at-least-once value and are
  dropped. Denormalize into a payload only when a future kind needs data that
  is genuinely not reloadable at send time.

- **Send-time eligibility recheck — THE #811 fix.** Each handler runs its
  send-decision inside a transaction that takes a **row lock on the domain
  row** (`SELECT … FOR UPDATE` the invitation / user) covering a **fresh
  eligibility read → send → `email_log` write**:
  - *Invitation kinds:* reload the invitation under lock; if
    `IsRevoked() || IsAccepted() || IsExpired(now)` → write
    `email_log(outcome: CancelledIneligible)` and return success (job deleted;
    nothing sent). A concurrent revoke/accept either blocks on the row lock
    until the outcome is committed, or has already committed and is observed by
    the fresh read — the unlocked-`Include` race in the shipped dispatcher is
    structurally gone.
  - *Password-reset:* reload the user under lock; if the reset token is absent
    or `PasswordResetTokenExpiresAt <= now` → `CancelledIneligible`. Otherwise
    send the **current** token (correct even if rotated after enqueue).
  - **Provider idempotency:** the send call carries an idempotency key derived
    from the job id, and the handler treats an existing `email_log` row for its
    `job_id` (unique index, §4.4) as "already delivered — no-op success". This
    closes the crash-after-send-before-delete window that at-least-once
    execution leaves open: the re-claimed job finds its `Sent` row and does not
    resend.
- **Terminal outcomes → `email_log`, always.** `Sent` is written in the
  handler's send transaction; `CancelledIneligible` likewise; `PermanentlyFailed`
  is written by the handler's `OnTerminalFailureAsync` hook when the engine
  DLQs the job (§5.1). One terminal row per job, enforced by the unique index.
- **No handler-owned retry state — THE #810 fix.** Handlers signal retryable
  failure by throwing; the **engine alone** computes backoff and requeues
  (§5.1). The #810 bug class (backoff written where the claim predicate can't
  see it) is unrepresentable because handlers have no access to scheduling
  columns.
- **#809 — password-reset as a transactional job insert.**
  `RequestPasswordReset.Handle` replaces its fire-and-forget
  `ContinueWith` with a `job_queue` insert (`email.password-reset`,
  `{ userId }`) **in the same SaveChanges/transaction as token issuance** — a
  committed token now always has a durable delivery job, surviving request
  cancellation and process replacement. Response semantics are unchanged
  (same generic success either way; no user-enumeration signal).
- **Producers.** `InvitationService`, `TenantAsStaffService`,
  `StaffProfileAsStaffService` switch from writing `InvitationEmailOutbox` rows
  + `Notify()` to writing `job_queue` rows (same transaction as the invitation)
  + `NOTIFY` (§5.5). `RequestPasswordReset` joins them per above.
- **Synchronous cancellation retired.** The shipped
  `CancelPendingForInvitationAsync` calls in revoke/accept services are removed:
  with reload-under-lock at send time as the authoritative gate, eagerly
  mutating queue rows from domain services is redundant machinery (and would
  need jsonb-payload queries to even find the rows). A revoked invitation's
  pending job simply resolves to `CancelledIneligible` at claim time — visible
  in `email_log`, which replaces the cancelled-row visibility the old table
  provided.

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
  and never fires for a rolled-back write. A worker-side `JobQueueListener`
  (`Infrastructure/Jobs/`) holds a dedicated Npgsql connection doing
  `LISTEN job_queue` and, on notification, wakes the processor's loop through an
  `IJobQueueSignal` seam (same shape as the shipped signal interface, now backed
  by Postgres). The **poll interval remains the correctness fallback**, exactly
  as the shipped dispatcher's comment prescribes.

  Failure analysis: (a) *no listener connected at commit* → NOTIFY is dropped by
  Postgres, but the poll fallback picks the row up within the interval; (b)
  *listener connection drops* → on reconnect the listener re-`LISTEN`s **and
  immediately triggers one catch-up poll**, so any notifications missed while
  disconnected are covered; (c) *NOTIFY payload limits (8 KB)* → send an **empty
  payload** and let the processor query for eligible rows (it must anyway,
  because many producers may have committed); (d) *thundering herd* → the
  processor already coalesces (a single wake drains a full batch), and the
  semaphore-style "one pending wake is enough" collapsing is preserved.

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

- **Lease model.** A claim sets `Processing` + `locked_until = now + lease`
  (`JOB_LEASE_SECONDS`, default 300). A worker that finishes deletes (success) or
  DLQs+deletes (terminal) the row. A worker that crashes leaves the row
  `Processing`; once `locked_until` passes, the next `ClaimBatchAsync` (or
  `RecoverStaleJobsJob`) reclaims it.
- **Crash between claim and completion.** At-least-once: the row is reclaimed and
  retried after lease expiry. Handlers **must be idempotent** (see below), so a
  re-run after a crash-post-side-effect is safe. For email jobs specifically,
  the `email_log` unique `job_id` row + provider idempotency key (§5.4) make a
  crash-after-send re-run a no-op instead of a duplicate email.
- **Poison jobs → DLQ.** When `attempts >= max_attempts`, the engine invokes the
  handler's `OnTerminalFailureAsync` hook (email handlers write their
  `PermanentlyFailed` `email_log` row here), copies the row to
  `job_dead_letter`, and deletes it from `job_queue` — one transaction. Manual
  redelivery is the dashboard's requeue-from-DLQ (#636); there is no
  keep-terminal-rows-in-queue special case for any job type.
- **Max-attempt policy per job type.** `max_attempts` is a per-row column
  (default 8, overridable at enqueue) so a cheap idempotent sweep and an
  expensive export can differ. Backoff schedule is engine-owned
  (`JobBackoff`), capped at `MaxBackoffSeconds` (900).
- **Idempotency expectations on handlers.** Every `IJobHandler` must be safe to
  run ≥1 time: use natural idempotency (e.g. session cleanup
  `DELETE … WHERE expires_at <= now` is naturally idempotent), an
  `idempotency_key` on enqueue (due-post publish), and — for email handlers —
  the `email_log` `job_id` marker + provider idempotency key (§5.4). This is a
  **hard contract**, asserted per handler in specs.
- **Clock-skew stance.** All lease/backoff/`next_attempt_at` comparisons use
  **database `now()`** wherever the claim runs in SQL (the claim statement uses
  server time), so multi-replica workers agree regardless of container clock
  drift. Application-side timestamps (e.g. `DateTime.UtcNow` inside a handler)
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
    `JobQueueListener.cs` + `IJobQueueSignal.cs`,
    `JobsServiceRegistration.cs`, `WorkerHeartbeatService.cs`
  - `Infrastructure/Jobs/Quartz/`: `SyncSystemJobsJob.cs`,
    `RecoverStaleJobsJob.cs` (and future `DispatchDuePostsJob.cs`).
  - The engine is a technical capability used by many domains → **infra**, not a
    domain module. This mirrors `Infrastructure/Messaging/Email/` (which keeps
    `IEmailService` and the provider adapters; the outbox dispatcher and signal
    are deleted from it by Phase 2C).
- **Engine entities:** these are infra-owned tables, but the repo keeps EF
  entities under `Modules/`. Create a small **`Modules/Jobs/Entities/`**
  (`JobQueueItem.cs`, `JobDeadLetter.cs`, `SystemJobDefinition.cs`) as the domain
  home for the engine's persisted types, with `DbSet`s added to `AppDbContext`.
  (Rationale: entities live in modules by convention; the *behavior* lives in
  `Infrastructure/Jobs/`. `Modules/Jobs` is the entity/enum home only.)
- **`EmailLog` home — `Modules/Messaging/` (O5's module, repurposed).** The
  single-lane ruling removes the `EmailOutbox` entity O5 created this module
  for, but the *reason* for a neutral messaging module survives: `email_log` is
  a cross-domain record (invitations + auth today, more kinds later) that
  belongs to no single domain — the same shape as `Modules/AuditLogs`. So:
  `Modules/Messaging/Entities/EmailLog.cs` plus the shared `EmailKind` /
  `EmailLogOutcome` enums, and a small `[Service]`
  `Modules/Messaging/Services/EmailLogWriter.cs` the handlers call. The
  alternative — parking `EmailLog` under `Modules/Jobs` — is rejected because it
  is not an engine table: the engine never reads or writes it; domain email
  handlers do.
- **Email job handlers (domain logic):** live with their domain, per the same
  rule as every other job handler — `Modules/Invitations/Jobs/
  {TenantInvitationEmailJobHandler,StaffInvitationEmailJobHandler}.cs` (the
  eligibility recheck is invitation domain logic) and
  `Modules/Auth/Jobs/PasswordResetEmailJobHandler.cs` (token validity is auth
  domain logic). Payload records sit beside their handlers.
- **Job handlers generally:** live with their domain, not in the engine —
  session cleanup (#389) → `Modules/Auth/Jobs/CleanupExpiredSessionsHandler.cs`
  (Session lives in `Modules/Auth/Entities`), expired-invitation sweep (#425) →
  `Modules/Invitations/Jobs/`, exports (#213/#286) →
  `Modules/AuditLogs/Jobs/` and `Modules/Tenants/Jobs/`. Each implements
  `IJobHandler`. This keeps the engine domain-agnostic and each job's business
  logic inside its slice.
- **Migrations:** `apps/api/Migrations/` (unchanged location) — one per schema
  step (§9), each also mutating `AppDbContextModelSnapshot.cs`.
- **DI:** worker hosted services via `AddHostedService<…>()` inside
  `JobsServiceRegistration.AddWorkerServices`, gated by role in `Program.cs`.
  `IJobHandler` implementations via the explicit `JobHandlerRegistry` (keyed by
  `JobType`) rather than `[Service]` (which has no keying by string). Producers,
  registry, and `AppEnvironment` accessors follow existing patterns.
- **Test-shell wiring:** the **new** top-level `Modules/Jobs` and
  `Modules/Messaging` areas already fall under the existing
  `..\Modules\**\*.Spec.cs` include, so no new shell line is needed; the same is
  true for `Infrastructure/**`. (Only a brand-new *sibling of* `Modules/` would
  need its own `Compile Include` line — none is introduced.)

---

## 8. Testing strategy

Testcontainers integration specs (Docker Postgres, per `docs/guides/api-integration-tests.md`),
co-located `*.Spec.cs`, `ItShould…` naming, and the shipped dispatcher's
**public-methods-for-determinism** discipline (drive `ClaimBatchAsync` /
`ProcessBatchAsync` / handler methods directly so assertions never race the live
background loop; schedule control rows into the future as
`InvitationEmailOutboxDispatcherSpec` did).

| Spec | Proves | Model on |
| --- | --- | --- |
| `JobQueueProcessor.Spec.cs` — claim contention | two concurrent `ClaimBatchAsync` never claim the same id; non-vacuous (something claimed) | `ItShouldNeverClaimTheSameRowFromTwoConcurrentDispatchers` |
| `JobQueueProcessor.Spec.cs` — lease reclaim | a row `Processing` past `locked_until` is re-claimable; before it, is not | new |
| `JobQueueProcessor.Spec.cs` — backoff requeue (#810 class) | after retryable failure the row is `Pending` with future `next_attempt_at`; **unclaimable before, claimable after** `next_attempt_at` — covers email jobs and all others identically | #810's requested spec shape |
| `JobQueueProcessor.Spec.cs` — DLQ on exhaustion | at `attempts == max_attempts` the row is gone from `job_queue`, present in `job_dead_letter`, and the handler's `OnTerminalFailureAsync` ran | new |
| `SchedulerLeaderService.Spec.cs` — leader election | two hosts contend the advisory lock; exactly one acquires and starts Quartz; releasing lets the other take over | new |
| `AppRoleComposition.Spec.cs` — architecture guard | in `Worker` the app maps **zero HTTP endpoints**; in `Api` **zero job hosted-services** are registered | discovery pattern of `ServiceArgsRecordConvention.Spec.cs` (reflect over the built service collection / endpoint data sources) |
| email handler specs — kind routing | each email `job_type` resolves its registered handler, which calls the right `IEmailService` method (incl. `email.password-reset` → `SendResetPasswordRequestEmailAsync`) | extends the shipped tenant/staff kind specs |
| email handler specs — eligibility race (#811) | a fake-sender barrier pauses after the eligibility read; a second context commits revoke/accept; assert **no send** occurs and `email_log` records `CancelledIneligible` | #811's requested barrier spec |
| email handler specs — `email_log` terminal writes | `Sent`, `CancelledIneligible`, and `PermanentlyFailed` each produce exactly one `email_log` row with the right kind/recipient/entity ids | new |
| email handler specs — send idempotency | re-running a job whose `Sent` `email_log` row exists (crash-after-send simulation) sends **nothing** and succeeds | new |
| `RequestPasswordReset.Spec.cs` — #809 durability | the committed reset job row survives request cancellation/restart and is subsequently deliverable | #809's requested spec shape |

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
- **Gate:** claim-contention + lease-reclaim + backoff-requeue + DLQ (incl.
  `OnTerminalFailureAsync` hook) specs green; `just test-api` passes.

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

### Phase 2C — #809/#810/#811: email jobs + `email_log` + fold migration — **DEPENDS ON 2A**

2C consumes 2A's engine (`IJobHandler`, `JobHandlerRegistry`, `JobBackoff`,
`job_queue` table): it is **not parallel to 2A**. It may run alongside 2B (see
Parallelization).

- **Create:**
  - `Modules/Messaging/Entities/EmailLog.cs` (+ `EmailKind`, `EmailLogOutcome`
    enums), `Modules/Messaging/Services/EmailLogWriter.cs`
  - `Modules/Invitations/Jobs/TenantInvitationEmailJobHandler.cs` (+ payload
    record + `.Spec.cs`), `Modules/Invitations/Jobs/StaffInvitationEmailJobHandler.cs`
    (+ payload record + `.Spec.cs`)
  - `Modules/Auth/Jobs/PasswordResetEmailJobHandler.cs` (+ payload record +
    `.Spec.cs`), `RequestPasswordReset.Spec.cs` (#809 durability)
  - `Infrastructure/Jobs/JobQueueListener.cs` + `IJobQueueSignal.cs`
    (LISTEN/NOTIFY wake, §5.5)
  - migration `AddEmailLogAndFoldEmailOutbox` (§4.5: create `email_log`,
    back-copy terminal rows, fold pending rows into `job_queue`, drop
    `invitation_email_outbox`)
- **Touch:**
  - producers: `Modules/Invitations/Services/InvitationService.cs`,
    `Modules/Tenants/Services/TenantAsStaffService.cs`,
    `Modules/Profiles/Services/StaffProfileAsStaffService.cs` — write
    `job_queue` email jobs (same transaction) + `NOTIFY`, drop `Notify()`
  - `Modules/Auth/Handlers/RequestPasswordReset.cs` (#809 — transactional job
    insert, remove the fire-and-forget `ContinueWith`)
  - revoke/accept paths: `Modules/Invitations/Services/InvitationRevokeService.cs`,
    `InvitationAcceptanceService.cs` — remove `CancelPendingForInvitationAsync`
    calls (send-time recheck is authoritative, §5.4)
  - `Lib/ServiceRegistration.cs` — remove the
    `IInvitationEmailOutboxSignal` singleton + outbox `AddHostedService`
    registrations
  - `AppDbContext.cs` — remove the `InvitationEmailOutbox` DbSet, add `EmailLog`
  - **Delete:** `Infrastructure/Messaging/Email/InvitationEmailOutboxDispatcher.cs`
    (+ `.Spec.cs`), `InvitationEmailOutboxSignal.cs`,
    `Modules/Invitations/Entities/InvitationEmailOutbox.cs`
- **Gate:** #810 covered by the engine backoff-requeue spec (email job included);
  #811 barrier spec green (no send after concurrent revoke, `CancelledIneligible`
  logged); #809 durability spec green; `email_log` terminal-write + idempotency
  specs green; fold migration applies cleanly (terminal rows in `email_log`,
  pending rows claimable as jobs, old table gone); full `just test-api` green
  with the outbox specs deleted.

### Parallelization

- **Order: 2A first.** Both 2B and 2C build on 2A (2B role-gates the services
  2A registers in `JobsServiceRegistration.cs`; 2C implements 2A's `IJobHandler`
  against 2A's engine and table).
- **2B ∥ 2C after 2A lands**, at the feature-code level: 2B lives in
  `Infrastructure/Jobs` + `AppEnvironment`/`Program`/`dokploy`; 2C lives in
  `Modules/Messaging` + `Modules/Invitations` + `Modules/Auth` +
  `Infrastructure/Messaging/Email` (deletions) + `Infrastructure/Jobs`
  (listener only — a new file, no 2B-owned file touched).
- **Shared-file hazards (call-outs):**
  1. **`AppDbContext.cs`** — 2A adds job DbSets, 2B adds `SystemJobDefinition`,
     2C removes the outbox DbSet and adds `EmailLog`. Serialize the DbSet edits
     or expect a trivial merge here.
  2. **EF migrations + `AppDbContextModelSnapshot.cs`** — the snapshot is a
     single file mutated by **every** migration. 2A, 2B, and 2C each add a
     migration; migrations are linearized by timestamp, so **whichever of 2B/2C
     lands second must regenerate its migration against the updated snapshot**
     (i.e. `just db-add` after rebasing). 2C's fold migration additionally
     *presupposes 2A's `job_queue` migration* — it inserts into that table.
     This is the one place the phases *cannot* be blindly merged — sequence the
     migration step even when the code is written in parallel.
  3. **`AppEnvironment.cs`** — 2B owns it (`APP_ROLE`); 2A/2C should not touch it.
  4. **`ServiceRegistration.cs` / `Program.cs`** — 2B owns the role-gating edit;
     2C **also** edits `ServiceRegistration.cs` (removing the outbox
     signal/hosted-service registrations). These are distinct regions of the
     file but the same file: coordinate the two edits (land 2B's gating first,
     or accept a small merge). 2A confines its registration to
     `JobsServiceRegistration.cs` and touches neither.

### Phase 3 — #635: recovery / DLQ + first system jobs

`RecoverStaleJobsJob` wired to the scheduler; DLQ requeue path; **first real
recurring handlers**: session cleanup (#389, `Modules/Auth/Jobs/`) and
expired-invitation status (#425, `Modules/Invitations/Jobs/`), each with an
idempotency spec and a `system_job_definitions` seed row. Gate: jobs run on
schedule under `worker`, expired rows swept, active rows preserved.

### Phase 4 — #636: staff job-visibility dashboard (sketch only)

Staff endpoints (`/staff/...`, per route-design guide) over `job_queue`,
`job_dead_letter`, `system_job_definitions`, and **`email_log`** (delivery
history is part of job visibility now): list/inspect, requeue-from-DLQ,
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

Kept short; everything else is decided above. O1 and O4 are **superseded** by
the same-night D2 revision and retained only for the record.

- ~~**O1 — Rename a just-shipped production table?**~~ **SUPERSEDED
  (2026-07-16, single-lane ruling):** there is no rename — the table folds into
  `job_queue` + `email_log` and is dropped (§4.5).
- **O2 — Cross-process wake mechanism.** §5.5 recommends **`LISTEN`/`NOTIFY` +
  poll fallback** (retiring the `SemaphoreSlim`). *Ratified.* Now applies to
  `job_queue` inserts generally (single channel), not just emails.
- **O3 — Worker liveness mechanism.** §3.5 recommends a **file-heartbeat +
  `--worker-health` CLI probe** (no HTTP, honoring D1). *Ratified.*
- ~~**O4 — Password-reset lane.**~~ **SUPERSEDED (2026-07-16, single-lane
  ruling):** there is no typed lane — #809 becomes the `email.password-reset`
  job (§5.4).
- **O5 — `Modules/Messaging/` home.** *Ratified, then repurposed by the D2
  revision:* the module now houses `EmailLog` + the shared email enums +
  `EmailLogWriter` instead of an `EmailOutbox` entity; email job handlers live
  in their owning domains (§7).
- **O6 — Migrate sent-row history into `email_log`?** §4.5 step 2 recommends
  **copying** the historical terminal rows (`Sent`/`Failed`/`Cancelled`) from
  `invitation_email_outbox` into `email_log` before dropping the table, so
  delivery history is complete from the feature's first day. Cost is trivial
  (days-old, small table). The alternative is dropping history with the table.
  *Recommendation: copy.* Needs a yes because the migration then transforms
  production data, not just schema.

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
email enums. Sections §2 (D2), §4.4/§4.5, §5.4/§5.5, and the Phase-2C build
order reflect this revision; O6 (historical sent-row copy) is newly flagged.
