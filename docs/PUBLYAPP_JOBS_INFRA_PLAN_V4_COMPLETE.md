# PublyApp Background Jobs Infrastructure — Pure Postgres v4 (Complete)

> **Architecture**: Quartz.NET (manual lifecycle) + PostgreSQL job queue with leases
>
> **Scope**: Post publishing, configurable system jobs, run-on-demand, full crash safety
>
> No RabbitMQ. No Redis. Just PostgreSQL.
>
> **Changes from v3.1**: Added `system_job_definitions` table, `SyncSystemJobsJob` pattern, run-on-demand API, comprehensive self-critique.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Deployment & Leadership Model](#2-deployment--leadership-model)
3. [Database Schema](#3-database-schema)
4. [End-to-End Flows](#4-end-to-end-flows)
5. [Locking & Concurrency Explanation](#5-locking--concurrency-explanation)
6. [Failure Scenarios & Recovery](#6-failure-scenarios--recovery)
7. [Separation of Responsibilities](#7-separation-of-responsibilities)
8. [Self-Critique & Correctness Audit](#8-self-critique--correctness-audit)
9. [Implementation Code](#9-implementation-code)
10. [Implementation Checklist](#10-implementation-checklist)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PublyApp.Worker (N Replicas)                            │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                    SchedulerLeaderService (BackgroundService)                    ││
│  │                                                                                  ││
│  │   1. On startup: attempt pg_try_advisory_lock(424242)                           ││
│  │   2. If acquired → Create Quartz scheduler MANUALLY (not via hosted service)    ││
│  │   3. Start scheduler ONLY after lock confirmed                                  ││
│  │   4. Register hardcoded trigger jobs                                            ││
│  │   5. Hold lock via dedicated connection until shutdown                          ││
│  │   6. On shutdown: stop scheduler, release lock                                  ││
│  │   7. On lock loss: stop scheduler, retry acquisition loop                       ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
│                              │ (leader only)                                         │
│                              ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                         Quartz.NET (Manually Managed)                            ││
│  │                                                                                  ││
│  │  Hardcoded Trigger Jobs (short-lived, no external calls):                       ││
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  ││
│  │  │ DispatchDuePostsJob      │ Every 15s  │ Enqueue due scheduled_posts      │  ││
│  │  │ SyncSystemJobsJob        │ Every 60s  │ Reconcile system jobs from DB    │  ││
│  │  │ RecoverStaleJobsJob      │ Every 5min │ Reset expired lease jobs         │  ││
│  │  └───────────────────────────────────────────────────────────────────────────┘  ││
│  │                                                                                  ││
│  │  Dynamic Triggers (managed by SyncSystemJobsJob):                               ││
│  │  ┌───────────────────────────────────────────────────────────────────────────┐  ││
│  │  │ EnqueueSystemJobTrigger:cleanup_expired_sessions  │ Cron from DB         │  ││
│  │  │ EnqueueSystemJobTrigger:refresh_expiring_tokens   │ Cron from DB         │  ││
│  │  │ EnqueueSystemJobTrigger:validate_scheduled_posts  │ Cron from DB         │  ││
│  │  │ ... (all system jobs from system_job_definitions)                        │  ││
│  │  └───────────────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐│
│  │                   JobQueueProcessor (BackgroundService)                          ││
│  │                           (Runs on ALL instances)                                ││
│  │                                                                                  ││
│  │   Loop:                                                                         ││
│  │     1. SELECT + FOR UPDATE SKIP LOCKED from job_queue                           ││
│  │     2. UPDATE set status='processing', locked_until = now() + lease             ││
│  │     3. Execute handler (with heartbeat extending lease)                         ││
│  │     4. On success: DELETE job, update business entity                           ││
│  │     5. On failure: increment attempts, backoff, or move to DLQ                  ││
│  │                                                                                  ││
│  │   Concurrency: Semaphore limits parallel executions (default 10)                ││
│  │   Heartbeat: Extends locked_until every 60s for long-running jobs               ││
│  └─────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────┬──────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    PostgreSQL                                        │
│                                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ scheduled_posts │  │   job_queue     │  │dead_letter_jobs │  │   rate_limits   │ │
│  │                 │  │                 │  │                 │  │                 │ │
│  │ Business intent │  │ Execution queue │  │ Terminal fails  │  │ API throttling  │ │
│  │ "Publish at T"  │  │ "Do this work"  │  │ Audit trail     │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                                      │
│  ┌────────────────────────────┐  ┌─────────────────────────────────────────────────┐│
│  │ system_job_definitions    │  │              qrtz_* tables                       ││
│  │                            │  │                                                  ││
│  │ Dashboard-configurable     │  │ Quartz internal persistence                     ││
│  │ system job schedules       │  │ (triggers, job details, locks)                  ││
│  └────────────────────────────┘  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Pure Postgres** | No operational overhead of Redis/RabbitMQ. Single source of truth. |
| **Manual Quartz lifecycle** | Prevents Quartz from starting before advisory lock acquired. No race condition. |
| **Two-phase locking** | Dispatcher locks `scheduled_posts`, workers lock `job_queue`. Prevents duplicates at both layers. |
| **Lease model** | `locked_until` enables crash recovery without false positives. |
| **Delete-on-success** | Jobs table stays small. DLQ provides audit trail for failures. |
| **system_job_definitions** | System jobs configurable from dashboard, not hardcoded in binary. |
| **SyncSystemJobsJob** | Single reconciliation point. Dashboard changes take effect within 60s. |
| **Stable idempotency keys** | Key = `publyapp:{postId}`, never includes retry count. |

### 1.3 What Each Component Does NOT Do

| Component | Responsibility | What It Does NOT Do |
|-----------|---------------|---------------------|
| **Quartz** | Time-based triggers, enqueue work | Execute long jobs, call external APIs, manage retries |
| **job_queue** | Execution state, retry logic, leases | Store business intent, decide schedules |
| **scheduled_posts** | Business intent ("publish at T") | Manage retries, track execution state |
| **Workers** | Execute handlers, manage leases | Decide when work exists, run cron schedules |

---

## 2. Deployment & Leadership Model

### 2.1 Single Binary, N Replicas

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PublyApp.Worker Binary                        │
│                                                                      │
│  Contains:                                                          │
│    - SchedulerLeaderService (competes for leadership)               │
│    - JobQueueProcessor (runs on all instances)                      │
│    - All Quartz trigger jobs                                        │
│    - All job handlers                                               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ docker-compose scale=N
                                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │  worker-1   │    │  worker-2   │    │  worker-3   │
    │             │    │             │    │             │
    │ Leader: YES │    │ Leader: NO  │    │ Leader: NO  │
    │ Quartz: ON  │    │ Quartz: OFF │    │ Quartz: OFF │
    │ Worker: ON  │    │ Worker: ON  │    │ Worker: ON  │
    └─────────────┘    └─────────────┘    └─────────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    └─────────────────┘
```

### 2.2 Leader Election via Advisory Lock

**Lock acquisition flow:**

```
Instance Startup
       │
       ▼
Open dedicated connection (kept open for lock duration)
       │
       ▼
SELECT pg_try_advisory_lock(424242)
       │
       ├─── TRUE ──────────────────────────────────────┐
       │                                               │
       ▼                                               ▼
Return FALSE                              Create Quartz scheduler
       │                                               │
       ▼                                               ▼
Wait 30s, retry ◄──────────────────────── Start scheduler (NOW safe)
       │                                               │
       │                                               ▼
       │                              Hold lock via connection keepalive
       │                                               │
       │                              On connection loss: stop scheduler,
       │                                               re-enter loop
       │                                               │
       └───────────────── Leader crashes: connection closes,
                          lock released automatically by Postgres
```

**Critical invariants:**
1. Quartz scheduler is created INSIDE the lock-holding branch
2. Scheduler is started AFTER creation, not before
3. Lock connection is dedicated (not from pool) and kept open
4. Lock is session-level: connection close = lock release

### 2.3 What Happens During Failover

```
Timeline:
─────────────────────────────────────────────────────────────────────────────►

T0: worker-1 holds lock, runs Quartz
T1: worker-1 crashes (process killed, OOM, etc.)
T2: Postgres detects connection closed, releases advisory lock (immediate)
T3: worker-2's next lock attempt succeeds (within 30s polling interval)
T4: worker-2 creates and starts Quartz
T5: SyncSystemJobsJob runs on worker-2, reconciles triggers from DB

Gap T1→T4: ~0-30 seconds of no Quartz execution
           But: JobQueueProcessor on worker-2/3 continues processing job_queue
           Any due DispatchDuePostsJob runs will simply run later
           No data loss, no duplicate execution
```

---

## 3. Database Schema

### 3.1 Migration Order

```
001_create_job_queue.sql           -- Must be first (scheduled_posts references it)
002_create_scheduled_posts.sql     -- Has FK to job_queue
003_create_dead_letter_jobs.sql    -- Standalone
004_create_rate_limits.sql         -- Standalone
005_create_system_job_definitions.sql  -- NEW: Dashboard-configurable system jobs
006_create_quartz_tables.sql       -- Quartz internal (download from GitHub)
```

### 3.2 job_queue (Execution Queue)

```sql
-- Migration: 001_create_job_queue.sql

CREATE TYPE job_status AS ENUM ('pending', 'processing');

CREATE TABLE job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job identification
    job_type VARCHAR(100) NOT NULL,          -- 'publish_post' | 'system::cleanup_expired_sessions' | etc.
    correlation_id UUID,                      -- scheduled_post.id for publish jobs, run_id for system jobs
    tenant_id UUID,                           -- NULL for system jobs

    -- Payload
    payload JSONB NOT NULL DEFAULT '{}',

    -- Scheduling
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Lease (critical for crash safety)
    locked_until TIMESTAMPTZ,                 -- NULL = not claimed, future = claimed with lease
    locked_by VARCHAR(100),                   -- Worker instance ID (for debugging/monitoring)

    -- Status
    status job_status NOT NULL DEFAULT 'pending',

    -- Retry
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT positive_attempts CHECK (attempts >= 0),
    CONSTRAINT valid_max_attempts CHECK (max_attempts > 0)
);

-- Worker claim query: pending jobs ready to run
CREATE INDEX idx_job_queue_claim
    ON job_queue (run_after, created_at)
    WHERE status = 'pending';

-- Stale lease recovery: find jobs with expired leases
CREATE INDEX idx_job_queue_stale
    ON job_queue (locked_until)
    WHERE status = 'processing' AND locked_until IS NOT NULL;

-- UNIQUENESS GUARD: prevent duplicate publish jobs for same post
CREATE UNIQUE INDEX idx_job_queue_publish_unique
    ON job_queue (job_type, correlation_id)
    WHERE job_type = 'publish_post' AND correlation_id IS NOT NULL;

-- System job uniqueness (allow only one pending/processing per job_key at a time)
-- This supports concurrency_policy='skip_if_running'
CREATE UNIQUE INDEX idx_job_queue_system_unique
    ON job_queue (job_type)
    WHERE job_type LIKE 'system::%' AND status IN ('pending', 'processing');
```

### 3.3 scheduled_posts (Business Intent)

```sql
-- Migration: 002_create_scheduled_posts.sql

CREATE TYPE post_status AS ENUM (
    'draft',
    'scheduled',
    'queued',
    'processing',
    'published',
    'failed',
    'cancelled'
);

CREATE TABLE scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,

    -- Content
    content TEXT NOT NULL,
    media_urls TEXT[] NOT NULL DEFAULT '{}',

    -- Scheduling (NULLABLE for drafts)
    publish_at_utc TIMESTAMPTZ,
    user_timezone_id VARCHAR(100),

    -- Status
    status post_status NOT NULL DEFAULT 'draft',

    -- Job tracking (links to current execution)
    job_queue_id UUID REFERENCES job_queue(id) ON DELETE SET NULL,

    -- Idempotency checkpoint (SET IMMEDIATELY after platform API success)
    platform_post_id VARCHAR(500),
    platform_url TEXT,

    -- Terminal state info
    published_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,

    -- Retry tracking (for observability, not logic)
    retry_count INT NOT NULL DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT scheduled_requires_publish_time CHECK (
        status = 'draft' OR publish_at_utc IS NOT NULL
    )
);

-- Dispatch query: scheduled posts ready to queue
CREATE INDEX idx_scheduled_posts_dispatch
    ON scheduled_posts (publish_at_utc)
    WHERE status = 'scheduled' AND publish_at_utc IS NOT NULL;

-- User queries (list posts by tenant and status)
CREATE INDEX idx_scheduled_posts_tenant
    ON scheduled_posts (tenant_id, status, created_at DESC);

-- Orphan detection (posts marked queued but job is gone)
CREATE INDEX idx_scheduled_posts_orphaned
    ON scheduled_posts (job_queue_id)
    WHERE status = 'queued' AND job_queue_id IS NOT NULL;
```

### 3.4 dead_letter_jobs (Terminal Failures)

```sql
-- Migration: 003_create_dead_letter_jobs.sql

CREATE TABLE dead_letter_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Original job info
    original_job_id UUID NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    correlation_id UUID,
    tenant_id UUID,
    payload JSONB NOT NULL,

    -- Failure info
    attempts INT NOT NULL,
    last_error TEXT,
    failure_reason TEXT NOT NULL,

    -- Timestamps
    original_created_at TIMESTAMPTZ NOT NULL,
    moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Resolution (admin actions)
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    resolution_notes TEXT
);

-- Unresolved DLQ entries for admin dashboard
CREATE INDEX idx_dlq_unresolved
    ON dead_letter_jobs (moved_at DESC)
    WHERE resolved_at IS NULL;

-- By job type for analysis
CREATE INDEX idx_dlq_job_type
    ON dead_letter_jobs (job_type, moved_at DESC)
    WHERE resolved_at IS NULL;
```

### 3.5 rate_limits (API Throttling)

```sql
-- Migration: 004_create_rate_limits.sql

CREATE TABLE rate_limits (
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (social_account_id, platform, date)
);

-- Cleanup old rate limit records
CREATE INDEX idx_rate_limits_cleanup ON rate_limits (date);
```

### 3.6 system_job_definitions (NEW - Dashboard-Configurable System Jobs)

```sql
-- Migration: 005_create_system_job_definitions.sql

CREATE TYPE schedule_type AS ENUM ('cron', 'fixed_interval');
CREATE TYPE concurrency_policy AS ENUM ('allow', 'skip_if_running', 'queue', 'replace');

CREATE TABLE system_job_definitions (
    -- Unique identifier for the job (e.g., 'cleanup_expired_sessions')
    job_key VARCHAR(100) PRIMARY KEY,

    -- Display info for admin UI
    display_name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Enabled/disabled toggle
    enabled BOOLEAN NOT NULL DEFAULT true,

    -- Schedule configuration
    schedule_type schedule_type NOT NULL,
    cron_expression VARCHAR(100),          -- Required if schedule_type='cron'
    interval_seconds INT,                   -- Required if schedule_type='fixed_interval'

    -- Timezone for admin display (execution always UTC)
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',

    -- Concurrency handling
    concurrency_policy concurrency_policy NOT NULL DEFAULT 'skip_if_running',

    -- Default payload (can be overridden by run-on-demand)
    default_payload JSONB NOT NULL DEFAULT '{}',

    -- Retry configuration
    max_attempts INT NOT NULL DEFAULT 3,

    -- Audit
    last_modified_by VARCHAR(100),
    last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_cron_config CHECK (
        schedule_type != 'cron' OR cron_expression IS NOT NULL
    ),
    CONSTRAINT valid_interval_config CHECK (
        schedule_type != 'fixed_interval' OR (interval_seconds IS NOT NULL AND interval_seconds > 0)
    ),
    CONSTRAINT reasonable_interval CHECK (
        interval_seconds IS NULL OR interval_seconds >= 60  -- Minimum 1 minute
    )
);

-- Example seed data (run via separate migration or seed script)
-- INSERT INTO system_job_definitions (job_key, display_name, description, schedule_type, cron_expression, concurrency_policy) VALUES
--     ('cleanup_expired_sessions', 'Cleanup Expired Sessions', 'Remove expired user sessions from the database', 'cron', '0 0 * * * ?', 'skip_if_running'),
--     ('refresh_expiring_tokens', 'Refresh Expiring Tokens', 'Proactively refresh OAuth tokens expiring soon', 'cron', '0 0 */6 * * ?', 'skip_if_running'),
--     ('validate_scheduled_posts', 'Validate Scheduled Posts', 'Check scheduled posts for issues before publish time', 'cron', '0 0 6 * * ?', 'skip_if_running'),
--     ('cleanup_old_jobs', 'Cleanup Old Jobs', 'Remove old rate limits and resolved DLQ entries', 'cron', '0 0 3 * * ?', 'skip_if_running'),
--     ('health_check_social_accounts', 'Health Check Social Accounts', 'Verify social account connections are still valid', 'cron', '0 0 */12 * * ?', 'skip_if_running');
```

### 3.7 Quartz Tables

```sql
-- Migration: 006_create_quartz_tables.sql
-- Download from: https://github.com/quartznet/quartznet/blob/main/database/tables/tables_postgres.sql
-- Run the full script (~200 lines)
```

---

## 4. End-to-End Flows

### 4.1 Flow: Scheduling a Post

```
User Action: "Schedule post for 2024-03-15 10:00 AM EST"
                              │
                              ▼
              ┌───────────────────────────────────────┐
              │           API Endpoint                 │
              │                                        │
              │  1. Validate content                   │
              │  2. Convert local time → UTC           │
              │  3. Verify publish_at > now()          │
              └───────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────────────┐
              │           PostgreSQL                   │
              │                                        │
              │  INSERT INTO scheduled_posts (         │
              │    tenant_id, social_account_id,       │
              │    content, publish_at_utc,            │
              │    status = 'scheduled'                │
              │  )                                     │
              └───────────────────────────────────────┘
                              │
                              ▼
              Post sits in 'scheduled' status until
              DispatchDuePostsJob picks it up
```

### 4.2 Flow: Dispatching Due Posts (Quartz → job_queue)

```
Every 15 seconds (DispatchDuePostsJob on leader):
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BEGIN TRANSACTION                                 │
│                                                                          │
│  Step 1: Lock due posts                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ SELECT id, tenant_id, social_account_id                            │ │
│  │ FROM scheduled_posts                                               │ │
│  │ WHERE status = 'scheduled'                                         │ │
│  │   AND publish_at_utc <= now()                                      │ │
│  │ ORDER BY publish_at_utc                                            │ │
│  │ FOR UPDATE SKIP LOCKED  ◄──── Prevents concurrent dispatch         │ │
│  │ LIMIT 100                                                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Step 2: For each post, upsert job (idempotent)                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ INSERT INTO job_queue (job_type, correlation_id, tenant_id, ...)   │ │
│  │ VALUES ('publish_post', $post_id, ...)                             │ │
│  │ ON CONFLICT (job_type, correlation_id)                             │ │
│  │   WHERE job_type = 'publish_post' AND correlation_id IS NOT NULL   │ │
│  │ DO UPDATE SET payload = EXCLUDED.payload  -- No-op to get RETURNING│ │
│  │ RETURNING id                              ◄──── Always get job ID  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Step 3: Update post status and link                                    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ UPDATE scheduled_posts                                             │ │
│  │ SET status = 'queued', job_queue_id = $job_id, updated_at = now()  │ │
│  │ WHERE id = $post_id AND status = 'scheduled'                       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│                        COMMIT                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Flow: Worker Executing a Job

```
JobQueueProcessor loop (runs on ALL instances):
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Claim batch with lease                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ UPDATE job_queue                                                   │ │
│  │ SET status = 'processing',                                         │ │
│  │     locked_until = now() + interval '5 minutes',                   │ │
│  │     locked_by = $instance_id                                       │ │
│  │ WHERE id IN (                                                      │ │
│  │   SELECT id FROM job_queue                                         │ │
│  │   WHERE status = 'pending' AND run_after <= now()                  │ │
│  │   ORDER BY run_after, created_at                                   │ │
│  │   FOR UPDATE SKIP LOCKED  ◄──── Multiple workers don't clash      │ │
│  │   LIMIT 20                                                         │ │
│  │ )                                                                  │ │
│  │ RETURNING id, job_type, correlation_id, payload, attempts, ...     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2: Execute handler (with heartbeat)                                │
│                                                                          │
│    ┌──────────────────────────────────────────────────────────────┐     │
│    │                    Start heartbeat task                       │     │
│    │  (Every 60s: UPDATE locked_until = now() + '5 minutes')      │     │
│    └──────────────────────────────────────────────────────────────┘     │
│                              │                                           │
│                              ▼                                           │
│    ┌──────────────────────────────────────────────────────────────┐     │
│    │                    Execute handler                            │     │
│    │                                                               │     │
│    │  For publish_post:                                            │     │
│    │    1. Load post + social account                              │     │
│    │    2. Check idempotency (platform_post_id already set?)       │     │
│    │    3. Refresh OAuth token if needed                           │     │
│    │    4. Check rate limit                                        │     │
│    │    5. Mark post 'processing'                                  │     │
│    │    6. Call external API (with stable idempotency key)         │     │
│    │    7. IMMEDIATELY save platform_post_id (checkpoint)          │     │
│    │    8. Mark post 'published'                                   │     │
│    └──────────────────────────────────────────────────────────────┘     │
│                              │                                           │
│                              ▼                                           │
│    ┌──────────────────────────────────────────────────────────────┐     │
│    │                    Stop heartbeat task                        │     │
│    └──────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            │                 │                 │
            ▼                 ▼                 ▼
       SUCCESS           TRANSIENT          PERMANENT
            │             ERROR               ERROR
            │                 │                 │
            ▼                 ▼                 ▼
    DELETE FROM       attempts < max?      Move to DLQ
    job_queue              │               DELETE job
                    ┌──────┴──────┐        Update business
                   YES            NO        entity 'failed'
                    │              │
                    ▼              │
            Reset to pending       │
            run_after = now()      │
            + backoff              │
                                   └──────► Move to DLQ
```

### 4.4 Flow: Retry & Backoff

```
Backoff Schedule:
  Attempt 1 failure → retry in 5 seconds
  Attempt 2 failure → retry in 30 seconds
  Attempt 3 failure → retry in 2 minutes
  Attempt 4 failure → retry in 10 minutes
  Attempt 5 failure → Move to DLQ

Formula: delays = [5, 30, 120, 600] seconds
         delaySec = delays[min(attempt - 1, len(delays) - 1)]

┌─────────────────────────────────────────────────────────────────────────┐
│  On transient failure (attempt < max_attempts):                          │
│                                                                          │
│  UPDATE job_queue                                                        │
│  SET status = 'pending',                                                 │
│      locked_until = NULL,                                                │
│      locked_by = NULL,                                                   │
│      attempts = attempts + 1,                                            │
│      last_error = $error_message,                                        │
│      run_after = now() + interval '$backoff_seconds seconds'             │
│  WHERE id = $job_id                                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  On max attempts reached:                                                │
│                                                                          │
│  1. INSERT INTO dead_letter_jobs (...)                                   │
│  2. DELETE FROM job_queue WHERE id = $job_id                             │
│  3. For publish_post: UPDATE scheduled_posts SET status = 'failed'       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Flow: Crash Recovery (Stale Leases)

```
Every 5 minutes (RecoverStaleJobsJob on leader):
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Reset jobs with expired leases                                  │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ UPDATE job_queue                                                   │ │
│  │ SET status = 'pending',                                            │ │
│  │     locked_until = NULL,                                           │ │
│  │     locked_by = NULL,                                              │ │
│  │     attempts = attempts + 1,                                       │ │
│  │     last_error = 'Recovered: lease expired without completion',    │ │
│  │     run_after = now()                                              │ │
│  │ WHERE status = 'processing'                                        │ │
│  │   AND locked_until < now()  ◄──── ONLY expired leases              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Step 2: Recover orphaned posts                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ UPDATE scheduled_posts                                             │ │
│  │ SET status = 'scheduled',                                          │ │
│  │     job_queue_id = NULL,                                           │ │
│  │     updated_at = now()                                             │ │
│  │ WHERE status = 'queued'                                            │ │
│  │   AND job_queue_id IS NOT NULL                                     │ │
│  │   AND NOT EXISTS (SELECT 1 FROM job_queue WHERE id = job_queue_id) │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.6 Flow: System Job Scheduling (SyncSystemJobsJob)

```
Every 60 seconds (SyncSystemJobsJob on leader):
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Load all system job definitions from DB                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ SELECT job_key, enabled, schedule_type, cron_expression,           │ │
│  │        interval_seconds, concurrency_policy                        │ │
│  │ FROM system_job_definitions                                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Step 2: Get current Quartz triggers for system jobs                    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ var existingTriggers = scheduler.GetTriggerKeys(                   │ │
│  │   GroupMatcher.GroupEquals("system-triggers"))                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              │                                           │
│                              ▼                                           │
│  Step 3: Reconcile                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ For each definition in DB:                                         │ │
│  │   - If enabled AND no trigger exists → Create trigger              │ │
│  │   - If enabled AND trigger exists with different schedule → Update │ │
│  │   - If disabled AND trigger exists → Remove trigger                │ │
│  │                                                                    │ │
│  │ For each trigger not in DB:                                        │ │
│  │   - Remove trigger (job_key was deleted from DB)                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

When a system job trigger fires:
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  EnqueueSystemJobTrigger.Execute()                                       │
│                                                                          │
│  1. Read job_key from trigger's JobDataMap                              │
│  2. Load definition from system_job_definitions                         │
│  3. Check concurrency_policy:                                           │
│     - skip_if_running: Check if pending/processing job exists → abort   │
│     - allow: Always insert                                              │
│     - replace: Delete existing pending, then insert                     │
│  4. INSERT INTO job_queue (                                             │
│       job_type = 'system::' + job_key,                                  │
│       correlation_id = new unique run_id,                               │
│       payload = default_payload                                         │
│     )                                                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.7 Flow: Run-on-Demand (Admin Dashboard)

```
Admin clicks "Run Now" for cleanup_expired_sessions:
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          API Endpoint                                    │
│  POST /api/admin/system-jobs/{job_key}/run                              │
│  Body: { "payload": { ...optional overrides... } }                       │
│  Auth: Admin role required                                               │
│                                                                          │
│  1. Load definition from system_job_definitions                         │
│  2. Generate unique run_id                                              │
│  3. Check concurrency_policy (same as scheduled)                        │
│  4. INSERT INTO job_queue (                                             │
│       job_type = 'system::cleanup_expired_sessions',                    │
│       correlation_id = $run_id,           ◄──── Unique per run          │
│       payload = COALESCE($override, default_payload),                   │
│       run_after = now()                   ◄──── Immediate execution     │
│     )                                                                   │
│  5. Record audit: who triggered, when, with what payload                │
│                                                                          │
│  Response: { "run_id": "...", "status": "queued" }                       │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              Job processed by any worker via normal job_queue flow
              (same path as scheduled system jobs)
```

---

## 5. Locking & Concurrency Explanation

### 5.1 Why Two Locks Are Required

```
Lock 1: Dispatcher Lock (scheduled_posts)
═══════════════════════════════════════════════════════════════════════════

Purpose: Prevent the SAME scheduled post from being dispatched to job_queue
         multiple times.

When: DispatchDuePostsJob runs every 15s.

How:  FOR UPDATE SKIP LOCKED on scheduled_posts WHERE status='scheduled'

Why can't we skip this?
  - Without this lock, two DispatchDuePostsJob runs (during failover or
    misconfiguration) could both see the same 'scheduled' post and both
    try to insert into job_queue.
  - The unique index on job_queue would catch the duplicate INSERT, but
    the first dispatcher might commit (updating post to 'queued') while
    the second sees conflict and doesn't update the post.
  - Result: post stuck in 'scheduled' or 'queued' with broken state.


Lock 2: Worker Lock (job_queue)
═══════════════════════════════════════════════════════════════════════════

Purpose: Prevent the SAME job from being executed by multiple workers
         simultaneously.

When: JobQueueProcessor claims jobs.

How:  FOR UPDATE SKIP LOCKED on job_queue WHERE status='pending'

Why can't we skip this?
  - Without this lock, two workers could claim the same job row.
  - Both would execute the handler, potentially causing duplicate
    API calls, double-publishing, or other consistency violations.


Why can't we merge these locks?
═══════════════════════════════════════════════════════════════════════════

Scenario: "Just lock job_queue directly when dispatching"

Problem:
  - Dispatcher would need to INSERT and then immediately lock the row
  - But INSERT doesn't lock - other workers see the row immediately
  - Race window between INSERT and any subsequent lock

Scenario: "Lock scheduled_posts through to execution"

Problem:
  - Dispatcher holds lock on scheduled_posts row during transaction
  - Transaction commits, lock released
  - But job_queue row now exists and multiple workers can claim it
  - The scheduled_posts lock doesn't protect job_queue claims

Conclusion:
  - Phase 1 lock protects dispatch uniqueness
  - Phase 2 lock protects execution uniqueness
  - These are DIFFERENT tables with DIFFERENT access patterns
  - Both are required for correctness
```

### 5.2 Concurrent Dispatcher Scenario

```
T0: Dispatcher A starts, locks posts [1, 2, 3] via FOR UPDATE SKIP LOCKED
T1: Dispatcher B starts, tries to lock posts, gets [4, 5] (1-3 are locked)
T2: Dispatcher A inserts jobs for posts 1, 2, 3
T3: Dispatcher A updates posts 1, 2, 3 to 'queued'
T4: Dispatcher A commits (locks released)
T5: Dispatcher B inserts jobs for posts 4, 5
T6: Dispatcher B commits

Result: No duplicates. Each post dispatched exactly once.

What if Dispatcher A crashes at T2 (before commit)?
  - Transaction rolls back
  - Posts 1, 2, 3 return to 'scheduled' status
  - Next dispatcher run picks them up
  - No data loss, no duplicates
```

### 5.3 Concurrent Worker Scenario

```
T0: Worker A claims jobs [J1, J2] via FOR UPDATE SKIP LOCKED
T1: Worker B claims jobs, gets [J3, J4] (J1-J2 are locked by UPDATE)
T2: Worker A executes J1
T3: Worker A completes J1, deletes it
T4: Worker A executes J2
    (Worker B is independently processing J3, J4)

Result: Each job executed exactly once.

What if Worker A crashes at T2?
  - Connection closed, but job J1 and J2 still in job_queue
  - J1 and J2 have status='processing', locked_until = T0 + 5min
  - RecoverStaleJobsJob runs at T0 + 5min + ε
  - Finds J1, J2 with locked_until < now()
  - Resets them to 'pending' with attempts++
  - Another worker picks them up

Result: Jobs recovered, but with attempt count incremented.
        After max_attempts, moved to DLQ.
```

---

## 6. Failure Scenarios & Recovery

### 6.1 Leader Crashes Mid-Dispatch Transaction

```
Scenario: Leader dies while holding FOR UPDATE lock on scheduled_posts

Timeline:
  T0: Leader begins transaction
  T1: Leader locks posts [1, 2, 3] with FOR UPDATE
  T2: Leader inserts job for post 1
  T3: CRASH (process killed)

Recovery:
  - Transaction never committed → rolled back by Postgres
  - Posts [1, 2, 3] return to 'scheduled' status (no change persisted)
  - No job inserted (rolled back)
  - Postgres releases advisory lock (connection closed)
  - Another instance acquires lock, becomes leader
  - Next DispatchDuePostsJob run picks up posts [1, 2, 3]

Duplicates? NO - transaction was atomic
Data loss? NO - posts still in 'scheduled' status
```

### 6.2 Worker Crashes After Claim, Before Execution

```
Scenario: Worker claimed job, then died before executing

Timeline:
  T0: Worker claims job J1, sets locked_until = T0 + 5min
  T1: Worker dies before calling handler

Recovery:
  - Job J1 in job_queue: status='processing', locked_until = T0 + 5min
  - At T0 + 5min, RecoverStaleJobsJob finds J1
  - Resets to status='pending', attempts++
  - Another worker picks it up

Duplicates? NO - original worker never executed
Data loss? NO - job recovered
```

### 6.3 Worker Crashes After External Publish, Before DB Update

```
Scenario: Platform accepted the post, but worker crashed before marking 'published'

Timeline:
  T0: Worker calls platform API
  T1: Platform returns success with platform_post_id='12345'
  T2: Worker saves platform_post_id to scheduled_posts (CHECKPOINT)
  T3: CRASH before marking status='published'

Recovery:
  - Job J1 still in job_queue: status='processing'
  - Post has platform_post_id='12345' (checkpoint saved)
  - RecoverStaleJobsJob resets J1 to pending
  - Worker picks up J1, calls handler
  - Handler checks: platform_post_id already set?
    → YES! Skip API call, just mark 'published'

Duplicates? NO - idempotency checkpoint prevents re-publish
Data loss? NO - post eventually marked published

What if crash happens at T1.5 (after API, before checkpoint)?
  - platform_post_id NOT saved
  - Handler will retry API call
  - API call includes idempotency key = 'publyapp:{postId}'
  - Platform returns same result (idempotent)
  - Handler saves platform_post_id

Duplicates? NO - platform idempotency key prevents duplicate post
```

### 6.4 Database Restart During High Load

```
Scenario: Postgres restarts while workers are processing jobs

Immediate effects:
  - All connections dropped
  - Advisory lock released (leader loses leadership)
  - In-flight queries fail

Recovery:
  - Workers reconnect (connection pool handles this)
  - Leader service detects connection loss, re-enters election loop
  - Jobs that were 'processing' still have future locked_until
  - NO immediate duplicate risk (workers can't claim until lease expires)
  - After DB up, new leader elected
  - RecoverStaleJobsJob handles any orphaned jobs

Duplicates? NO - lease model protects in-flight work
Data loss? NO - nothing committed is lost
```

### 6.5 External Platform Returns 500 for 10 Minutes

```
Scenario: Social media platform has outage

Timeline:
  T0: Worker attempts publish, gets HTTP 500
  T1: Handler throws exception
  T2: JobQueueProcessor catches, increments attempts, schedules retry
      run_after = T2 + 5 seconds (attempt 1)
  T3: Retry fails (500 still)
  T4: run_after = T4 + 30 seconds (attempt 2)
  ...
  T10: Platform recovers
  T11: Next retry succeeds

Behavior:
  - Exponential backoff: 5s, 30s, 2min, 10min
  - After max_attempts (default 3): move to DLQ
  - Admin can replay from DLQ after platform recovery

No thundering herd:
  - Each job has its own backoff schedule
  - Jobs don't all retry at exactly the same time
  - If many jobs in DLQ, admin replay can be rate-limited
```

### 6.6 Two Replicas Accidentally Start Quartz (Misconfiguration)

```
Scenario: Bug or misconfiguration allows two instances to run Quartz

Why this shouldn't happen:
  - Advisory lock is exclusive
  - pg_try_advisory_lock returns FALSE for second caller
  - Quartz created/started ONLY in TRUE branch

If it somehow happens:
  - Both instances run DispatchDuePostsJob
  - FOR UPDATE SKIP LOCKED ensures each post locked by only one
  - Unique index on job_queue prevents duplicate job inserts
  - At worst: some posts dispatched by instance A, some by B
  - No duplicates due to defensive mechanisms

Detection:
  - Log "Acquired leadership" should appear once
  - Alert if multiple instances log this within same minute
  - Quartz cluster mode (if enabled) would also detect
```

---

## 7. Separation of Responsibilities

### 7.1 Responsibility Matrix

| Concern | Owner | NOT Owner |
|---------|-------|-----------|
| **When to publish** | `scheduled_posts.publish_at_utc` | job_queue, Quartz |
| **What to publish** | `scheduled_posts.content/media` | job_queue.payload (just IDs) |
| **Whether work exists** | DispatchDuePostsJob (polls scheduled_posts) | Workers |
| **Execution timing** | `job_queue.run_after` | scheduled_posts |
| **Retry logic** | JobQueueProcessor | Handlers, Quartz |
| **Lease management** | JobQueueProcessor | Handlers |
| **System job schedules** | `system_job_definitions` DB table | Hardcoded in binary |
| **Trigger reconciliation** | SyncSystemJobsJob | Manual registration |
| **Idempotency** | Handler + platform_post_id checkpoint | job_queue |
| **Leadership** | SchedulerLeaderService + advisory lock | Quartz |

### 7.2 Handler Responsibilities

```
Handlers DO:
  ✓ Load business entity from DB
  ✓ Check idempotency checkpoints
  ✓ Call external APIs
  ✓ Save idempotency checkpoint IMMEDIATELY after API success
  ✓ Update business entity final state (published/failed)
  ✓ Throw exceptions for transient errors (let queue retry)
  ✓ Return cleanly for permanent failures (queue moves to DLQ)

Handlers DO NOT:
  ✗ Manage job_queue status
  ✗ Calculate retry timing
  ✗ Extend leases (heartbeat handled by processor)
  ✗ Decide max_attempts
  ✗ Delete jobs from queue
```

### 7.3 Quartz vs Workers

```
Quartz (leader only):
  ✓ Fire time-based triggers
  ✓ Run short dispatcher jobs
  ✓ Reconcile system job definitions
  ✓ Enqueue work into job_queue
  ✗ Execute long-running handlers
  ✗ Call external APIs
  ✗ Manage retries

Workers (all instances):
  ✓ Poll job_queue
  ✓ Claim and execute jobs
  ✓ Manage leases (claim, heartbeat)
  ✓ Handle retries and backoff
  ✓ Move failures to DLQ
  ✗ Decide when work exists
  ✗ Run cron schedules
```

---

## 8. Self-Critique & Correctness Audit

### 8.0 Summary of Guarantees

| Guarantee | How Enforced | Where It Can Fail | How Detected |
|-----------|--------------|-------------------|--------------|
| **No duplicate dispatch** | `FOR UPDATE SKIP LOCKED` on scheduled_posts + unique index on job_queue | Two dispatchers with different lock IDs (impossible with advisory lock) | Monitor for multiple job inserts with same correlation_id |
| **No duplicate execution** | `FOR UPDATE SKIP LOCKED` on job_queue | Two workers bypass skip locked (impossible) | Monitor for concurrent handler logs with same job_id |
| **No early execution** | `run_after <= now()` in claim query | Clock skew between workers | NTP sync, alert on future-dated claims |
| **Crash safety** | Lease model (`locked_until`) + RecoverStaleJobsJob | Stale recovery job not running | Alert on jobs with locked_until < now() - 10min |
| **Bounded retries** | `attempts < max_attempts` check, move to DLQ | Bug in failure handler | Monitor DLQ growth, alert on job with attempts > max |
| **At most one leader** | Postgres advisory lock (session-level) | Advisory lock misconfiguration | Alert on multiple "Acquired leadership" logs |

---

### 8.1 Concurrency & Locking Audit

**Why `scheduled_posts` needs `FOR UPDATE SKIP LOCKED` (dispatcher phase):**

The dispatcher job runs periodically (every 15s) and may overlap with itself during slow execution or during leader failover. Without row-level locking, two concurrent dispatchers could both SELECT the same 'scheduled' posts, both attempt to INSERT jobs, and end up with race conditions on the post status update. The unique index on job_queue catches duplicate INSERTs, but without the SKIP LOCKED, the first dispatcher would succeed while the second would fail and potentially leave the post in an inconsistent state. FOR UPDATE SKIP LOCKED ensures each post is claimed by exactly one dispatcher transaction.

**Why `job_queue` needs `FOR UPDATE SKIP LOCKED` (worker phase):**

Multiple workers poll job_queue continuously. Without row-level locking, two workers could claim the same job row, both set it to 'processing', and both execute the handler. This would cause duplicate external API calls and potential data corruption. FOR UPDATE SKIP LOCKED ensures each job is claimed by exactly one worker. The locked rows are invisible to other workers' SELECT queries.

**Why these cannot be merged safely:**

These locks operate on different tables at different times in the workflow. The dispatcher lock protects the "dispatch" operation (scheduled_posts → job_queue). The worker lock protects the "claim" operation (job_queue → handler execution). Merging would require either: (a) keeping scheduled_posts locked through handler execution (unacceptable - blocks user operations), or (b) removing worker-side locking (unsafe - allows duplicate execution). The two-phase model correctly separates concerns.

**Two dispatchers concurrent:**
- Dispatcher A acquires FOR UPDATE on posts [1,2,3]
- Dispatcher B's FOR UPDATE SKIP LOCKED returns posts [4,5] (1-3 skipped)
- No overlap, no duplicates

**Two workers claim same job:**
- Worker A's FOR UPDATE SKIP LOCKED claims job J1
- Worker B's FOR UPDATE SKIP LOCKED skips J1 (locked by A)
- No overlap, no duplicates

---

### 8.2 Leader Election / Quartz Startup Audit

**How Quartz does NOT run until leadership acquired:**

Quartz is NOT registered as a hosted service. Instead, SchedulerLeaderService creates the IScheduler instance manually inside the `RunAsLeaderAsync` method, which is only called after `pg_try_advisory_lock` returns TRUE. The scheduler is created via `StdSchedulerFactory` and started explicitly with `scheduler.Start()`. This ordering is enforced by code structure - there is no code path that creates a scheduler without holding the lock.

**Leader handoff (leader crashes mid-run):**

When the leader process dies, its database connection closes. Postgres automatically releases session-level advisory locks when the session ends. Within seconds, another instance's `pg_try_advisory_lock` call succeeds. That instance enters `RunAsLeaderAsync`, creates a new Quartz scheduler, and starts it. The Quartz job store (PostgreSQL) contains the trigger state - the new scheduler picks up where the old one left off. Any in-flight Quartz job (like DispatchDuePostsJob) would have been rolled back on crash.

**Ensuring "at most one leader":**

`pg_try_advisory_lock(424242)` is an exclusive lock. Only one session can hold it at a time. The lock ID (424242) is fixed and configured. All instances use the same lock ID. Postgres guarantees exclusivity. Even if two instances call simultaneously, only one receives TRUE.

**Preventing "Quartz briefly ran before lock acquired":**

The code structure prevents this:
```csharp
var acquired = (bool)(await cmd.ExecuteScalarAsync(ct))!;
if (acquired)
{
    await RunAsLeaderAsync(ct);  // Scheduler created HERE
}
```
Scheduler creation happens inside the `if (acquired)` block. No scheduler exists before the lock is confirmed.

**If advisory lock lost (DB restart/network blip):**

The lock connection is monitored in a loop:
```csharp
if (_lockConnection?.State != System.Data.ConnectionState.Open)
{
    _logger.LogWarning("Lock connection lost");
    break;  // Exit RunAsLeaderAsync
}
```
On connection loss, the method exits, CleanupAsync stops the scheduler, and the service re-enters the leadership loop to attempt re-acquisition.

---

### 8.3 Transaction Boundary Audit

| Step | Transaction Boundary | Crash Recovery | Idempotency Required? |
|------|---------------------|----------------|----------------------|
| **Claim scheduled_posts** | Inside dispatcher TX | TX rollback, posts remain 'scheduled' | No - nothing persisted |
| **Insert job_queue rows** | Inside dispatcher TX | TX rollback, no jobs created | No - covered by TX |
| **Update posts to queued** | Inside dispatcher TX | TX rollback, posts remain 'scheduled' | No - covered by TX |
| **Worker claim job** | Single UPDATE | Job marked 'processing', crash → lease expires → recovered | No - idempotent UPDATE |
| **Worker heartbeat** | Single UPDATE | Heartbeat lost → lease expires → recovered | No - idempotent UPDATE |
| **External API call** | NOT in transaction | See below | YES - platform idempotency key |
| **Save platform_post_id** | Single UPDATE | If crashes before, retry will re-save same value | Yes - checkpoint is idempotent |
| **Mark published** | Single UPDATE | If crashes after checkpoint, retry sees checkpoint, skips API, marks published | Yes - handler checks checkpoint |

**External API call crash scenarios:**

1. Crash before API call: Lease expires, job recovered, retry calls API (no duplicate - first call never happened)
2. Crash during API call (no response): Unknown state. Retry uses same idempotency key. Platform either:
   - Returns cached response (already succeeded)
   - Returns error (original request failed)
3. Crash after API success, before checkpoint: platform_post_id not saved. Retry calls API with same idempotency key. Platform returns cached success. Handler saves checkpoint.
4. Crash after checkpoint, before 'published': platform_post_id saved. Retry sees checkpoint, skips API, marks 'published'.

All paths are safe due to stable idempotency key (`publyapp:{postId}`) and checkpoint (`platform_post_id`).

---

### 8.4 Lease & Stale Recovery Audit

**Lease duration:** 5 minutes (300 seconds), configurable via `WorkerOptions.JobQueue.LeaseSeconds`

**When lease is set:** During claim query:
```sql
UPDATE job_queue SET locked_until = now() + interval '5 minutes' ...
```

**Lease extension:** Heartbeat task runs every 60 seconds, extends lease by another 5 minutes:
```sql
UPDATE job_queue SET locked_until = now() + interval '5 minutes' WHERE id = @jobId
```

**Stale recovery criteria:** `status = 'processing' AND locked_until < now()`

**What if job takes longer than lease?**

Heartbeat extends lease every 60 seconds. As long as heartbeat succeeds, lease is extended. Job can run indefinitely.

**What prevents stale recovery from requeuing legitimately running job?**

Stale recovery ONLY selects jobs where `locked_until < now()`. A running job with active heartbeat has `locked_until` in the future (5 minutes ahead). The WHERE clause excludes it.

**Avoiding endless extension for wedged jobs:**

Two mechanisms:
1. Handler must complete eventually (no infinite loops in handler code)
2. If heartbeat fails (e.g., DB connection lost), lease is not extended, and stale recovery eventually picks up the job

If a job is truly wedged (infinite loop, deadlock), it will eventually hit external timeout (handler-level timeout) or the operator must manually kill the process. The system does not auto-kill wedged jobs - this is by design to avoid killing legitimate long-running work.

**Maximum stuck time:**

In worst case: lease duration (5 min) + stale recovery interval (5 min) = 10 minutes before recovery starts. In practice, typically recovered within 5-6 minutes of worker crash.

---

### 8.5 Duplicate Prevention Audit

| Duplicate Source | Causes Duplicate Publish? | Prevention Mechanism |
|-----------------|---------------------------|---------------------|
| **Dispatcher runs twice** | No | FOR UPDATE SKIP LOCKED + unique index on job_queue |
| **Worker crashes after publish, before DB update** | No | platform_post_id checkpoint checked before API call |
| **Network timeout after platform accepted** | No | Stable idempotency key (`publyapp:{postId}`) sent to platform |
| **Job retry after partial success** | No | Handler checks platform_post_id, skips API if present |
| **Admin "Run now" spam** | No | Unique index on (job_type, correlation_id) for system jobs, or rate limiting in API |
| **Look-ahead window pre-creates jobs** | N/A | We don't pre-create jobs; dispatch happens when publish_at_utc <= now() |

**Detailed analysis:**

1. **Dispatcher runs twice:** Unique index `idx_job_queue_publish_unique` prevents second INSERT. First dispatcher succeeds, second sees conflict, uses DO UPDATE to get existing job_id, post status updated correctly either way.

2. **Worker crash after publish:** platform_post_id saved IMMEDIATELY after API success (before marking published). On retry, handler checks this field first. If set, skips API call entirely.

3. **Network timeout:** Platform receives idempotency key. If platform processed the request, it returns cached response. If not, it processes as new request. Either way, at most one post created on platform.

4. **Retry after partial success:** Same as #2 - checkpoint prevents re-execution.

5. **Run now spam:** API should validate unique run_id. Unique index on job_queue for system jobs with `status IN ('pending', 'processing')` prevents duplicate pending jobs.

---

### 8.6 State Machine Consistency Audit

**scheduled_posts state transitions:**

```
draft ──────► scheduled ──────► queued ──────► processing ──────► published
   │              │                │                │
   │              │                │                └──────────► failed
   │              │                │
   │              └────────────────┴──────────► cancelled
   │
   └──► (deleted)

Allowed transitions:
  draft → scheduled      (User schedules post)
  scheduled → queued     (DispatchDuePostsJob)
  scheduled → cancelled  (User cancels)
  queued → processing    (Handler starts)
  queued → cancelled     (User cancels + delete job)
  queued → scheduled     (RecoverStaleJobsJob - orphan recovery)
  processing → published (Handler success)
  processing → failed    (Max attempts reached)
  processing → scheduled (Handler intentional reschedule - rate limit)
```

**job_queue state transitions:**

```
(created) ──────► pending ──────► processing ──────► (deleted)
                     │                │
                     │                ├──────► pending (retry)
                     │                │
                     │                └──────► (deleted + DLQ)
                     │
                     └──────► (deleted) (cancelled by user)

Allowed transitions:
  (new) → pending       (Dispatcher/API inserts job)
  pending → processing  (Worker claims job)
  processing → pending  (Retry after failure)
  processing → deleted  (Success OR max attempts → DLQ)
  pending → deleted     (User cancels scheduled post)
```

**Single authority for transitions:**

| Transition | Authority | Notes |
|------------|-----------|-------|
| draft → scheduled | API | User action |
| scheduled → queued | DispatchDuePostsJob | Only dispatcher |
| queued → processing | Handler (via processor) | Handler sets this |
| processing → published | Handler | Handler sets this |
| processing → failed | Handler OR DeadLetterService | Handler for permanent, DLQ for max attempts |
| pending → processing | JobQueueProcessor | Only processor claims |
| processing → pending | JobQueueProcessor | Only processor retries |

**Preventing orphan posts:**

Orphan = post with status='queued' but job doesn't exist.

Causes:
1. Job deleted after claim but before handler updates post
2. Job moved to DLQ without updating post

Prevention:
1. RecoverStaleJobsJob checks for orphans every 5 minutes
2. DeadLetterService updates post to 'failed' when moving to DLQ

**Preventing orphan jobs:**

Orphan = job exists but post was deleted.

Prevention:
1. Post deletion deletes associated job (cascade or API logic)
2. Handler checks post existence; if missing, completes job without error

---

### 8.7 Retry/Backoff/DLQ Audit

**Configuration:**

- Max attempts: 3 (default), configurable per job type
- Backoff algorithm: Fixed intervals array
  - Attempt 1 fail → wait 5 seconds
  - Attempt 2 fail → wait 30 seconds
  - Attempt 3 fail → wait 2 minutes
  - Attempt 4+ fail → wait 10 minutes (if max_attempts > 3)
- Formula: `delays = [5, 30, 120, 600]; delaySec = delays[min(attempt-1, 3)]`

**DLQ contents:**

```sql
dead_letter_jobs (
  original_job_id,     -- For correlation
  job_type,            -- For categorization
  correlation_id,      -- For finding business entity
  tenant_id,           -- For multi-tenant filtering
  payload,             -- Original job payload
  attempts,            -- How many times tried
  last_error,          -- Last exception message
  failure_reason,      -- "Max attempts exceeded" or "Permanent failure"
  original_created_at, -- When job was first created
  moved_at,            -- When moved to DLQ
  resolved_at,         -- Admin resolution timestamp
  resolved_by,         -- Admin who resolved
  resolution_notes     -- What was done
)
```

**Admin inspection/replay:**

1. Dashboard queries `dead_letter_jobs WHERE resolved_at IS NULL`
2. Admin reviews last_error, payload
3. Admin can:
   - Mark resolved (with notes) - no action taken
   - Replay - inserts new job into job_queue with same payload
   - Edit & replay - modify payload before replay

**Can system retry forever?**

No. `attempts` is incremented on every retry. When `attempts >= max_attempts`, job is moved to DLQ and deleted from job_queue. No further retries occur automatically.

**Preventing thundering herd:**

1. Each job has independent retry timing based on its own failure time
2. Backoff spreads retries over time
3. DLQ replay is manual (admin controls rate)
4. No "retry all failed jobs at once" button (or it's rate-limited)

---

### 8.8 On-Demand System Jobs Audit

**Preventing overlapping runs with skip_if_running:**

```sql
-- When inserting on-demand job:
INSERT INTO job_queue (job_type, correlation_id, ...)
SELECT 'system::cleanup_expired_sessions', $run_id, ...
WHERE NOT EXISTS (
  SELECT 1 FROM job_queue
  WHERE job_type = 'system::cleanup_expired_sessions'
  AND status IN ('pending', 'processing')
);
-- Returns 0 rows if existing job found
```

Or via unique index:
```sql
CREATE UNIQUE INDEX idx_job_queue_system_unique
    ON job_queue (job_type)
    WHERE job_type LIKE 'system::%' AND status IN ('pending', 'processing');
```

Insert fails with unique violation if overlapping job exists.

**Minimum schedule frequency guardrails:**

```sql
CONSTRAINT reasonable_interval CHECK (
    interval_seconds IS NULL OR interval_seconds >= 60
)
```

Minimum 60 seconds between runs. Dashboard can enforce stricter limits.

**Audit trail:**

```sql
-- Consider adding to system_job_definitions or separate table:
system_job_runs (
  id UUID,
  job_key VARCHAR(100),
  triggered_by VARCHAR(100),  -- 'scheduler' or user email
  triggered_at TIMESTAMPTZ,
  payload_override JSONB,     -- NULL if default
  job_queue_id UUID           -- FK to job_queue
)
```

**Admin runs job while scheduled run pending:**

With skip_if_running: Admin request rejected (job already pending/processing)
With allow: Both jobs queued, both will execute
With replace: Existing pending job deleted, new job inserted
With queue: Both jobs queued, execute sequentially (FIFO)

Each policy is explicit - admin knows the behavior.

**correlation_id for on-demand:**

On-demand runs use `correlation_id = gen_random_uuid()` (unique run ID). Scheduled runs also use unique run IDs. This allows multiple runs to exist in DLQ for analysis without correlation_id collision.

---

### 8.9 Performance & DB Load Audit

**Worker loop behavior:**

```csharp
while (!ct.IsCancellationRequested)
{
    var claimed = await ClaimAndProcessBatchAsync(ct);
    if (claimed == 0)
    {
        await Task.Delay(_pollingIntervalMs, ct);  // Default 1000ms
    }
    // If claimed > 0, loop immediately to check for more work
}
```

- Idle polling: 1 query per second per worker
- 3 workers, 0 jobs for 1 hour: 3 * 3600 = 10,800 queries
- Each query is cheap (index scan on pending jobs)

**LISTEN/NOTIFY (optional optimization):**

Not implemented in base design. If needed:
1. Worker subscribes to `job_queue_notify` channel
2. Dispatcher sends NOTIFY after inserting jobs
3. Worker wakes immediately instead of waiting for poll
4. Fallback timer ensures no missed jobs if NOTIFY lost

**Batch sizes:**

- Dispatch batch: 100 posts per run
- Worker claim batch: 20 jobs per claim
- Max concurrency: 10 parallel handlers per worker

**Queries during 0 jobs for 1 hour:**

Assuming 3 workers, 1s polling interval:
- Workers: 3 * 3600 = 10,800 claim queries (all return empty)
- Leader: ~240 DispatchDuePostsJob runs (return empty)
- Leader: ~12 RecoverStaleJobsJob runs (return empty)
- Leader: ~60 SyncSystemJobsJob runs (reconcile triggers)

Total: ~11,112 queries/hour during idle. Acceptable for Postgres.

**Peak burst (10k posts due at once):**

1. DispatchDuePostsJob claims 100 posts per 15s run
2. 10,000 / 100 = 100 dispatch cycles = 25 minutes to dispatch all
3. Workers process 20 jobs per claim * 10 concurrency * 3 workers = 600 jobs/minute (with instant execution)
4. Actual throughput depends on handler duration

If dispatch is too slow:
- Increase dispatch batch size
- Decrease dispatch interval
- Run dispatch on multiple leaders (not recommended - adds complexity)

Handler execution is the real bottleneck (API calls take time).

---

### 8.10 Red Team Scenarios

#### Scenario 1: Leader crashes mid-dispatch transaction

**What breaks:** Transaction rolled back. No jobs inserted. Posts remain 'scheduled'.

**What detects it:** Next dispatcher run finds the posts and processes them.

**How it heals:** Normal dispatcher operation.

**Duplicates?** No - transaction was atomic.

#### Scenario 2: Worker crashes after claim, before executing

**What breaks:** Job stuck in 'processing' with stale lease.

**What detects it:** RecoverStaleJobsJob finds `locked_until < now()`.

**How it heals:** Job reset to 'pending', another worker picks it up.

**Duplicates?** No - original worker never executed handler.

#### Scenario 3: Worker crashes after external publish, before DB update

**What breaks:** Post published on platform, but status not updated in DB.

**What detects it:** RecoverStaleJobsJob resets job, handler re-runs.

**How it heals:** Handler checks `platform_post_id` (checkpoint). If set, skips API, marks 'published'.

**Duplicates?** No - checkpoint and idempotency key protect against duplicates.

#### Scenario 4: DB restart during high load

**What breaks:** All connections dropped. Advisory lock released. In-flight transactions rolled back.

**What detects it:** Workers reconnect. Leader service detects connection loss.

**How it heals:** New leader elected. Workers resume polling. Jobs with expired leases recovered.

**Duplicates?** No - lease model ensures in-flight jobs not double-claimed until lease expires.

#### Scenario 5: External platform returns 500 for 10 minutes

**What breaks:** All publish attempts fail.

**What detects it:** Handler catches exception, JobQueueProcessor schedules retry.

**How it heals:** Retries with backoff. After max attempts, moved to DLQ. Admin can replay when platform recovers.

**Duplicates?** No - idempotency key means platform won't create duplicate post even if we retry after platform partial success.

#### Scenario 6: Two replicas accidentally start Quartz due to misconfig

**What breaks:** Potential for concurrent dispatch.

**What detects it:** Should not happen (advisory lock). If it does, logs show multiple "Acquired leadership" messages.

**How it heals:** FOR UPDATE SKIP LOCKED ensures no post processed twice. Unique index ensures no duplicate jobs.

**Duplicates?** No - defensive mechanisms (locks + unique index) prevent duplicates even in this scenario.

#### Scenario 7: Handler throws OperationCanceledException during shutdown

**What breaks:** Job processing interrupted mid-execution.

**What detects it:** JobQueueProcessor catches exception, does NOT mark job failed.

**How it heals:** Job remains 'processing' with existing lease. After shutdown completes, lease expires. RecoverStaleJobsJob resets job.

**Duplicates?** Depends on where in handler execution. If before API call: no duplicate. If after API call: checkpoint or idempotency key protects.

---

### 8.11 Final Confidence Statement

**Highest risk remaining areas:**

1. **Handler timeout:** No explicit timeout on handler execution. A slow handler could run for hours with heartbeat extending lease indefinitely. Consider adding handler-level timeout.

2. **Clock skew:** If worker clock is ahead of DB clock, it might claim jobs with `run_after` in the "future" from DB's perspective. Mitigation: use `now()` from DB, not application server.

3. **Unique index partial index correctness:** The partial unique index on job_queue for system jobs relies on exact match of `status IN ('pending', 'processing')`. If status enum changes, index may need update.

4. **Advisory lock ID collision:** If another application uses lock ID 424242, they would conflict. Use application-specific lock ID.

**If I were shipping this, I would add tests for:**

1. Concurrent dispatch (two transactions, verify no duplicate jobs)
2. Concurrent worker claim (verify FOR UPDATE SKIP LOCKED behavior)
3. Lease expiry and recovery (kill worker process, verify job recovered)
4. Idempotency checkpoint (crash after API, verify no duplicate publish)
5. DLQ flow (force max failures, verify DLQ entry and post status)
6. Leader election (start 3 instances, verify only 1 runs Quartz)
7. Leader failover (kill leader, verify another takes over)
8. System job concurrency policy (run-now while scheduled pending)

**Metrics/alerts required for safety:**

| Metric | Alert Threshold | Meaning |
|--------|----------------|---------|
| `job_queue_pending_count` | > 1000 for 5 min | Workers can't keep up |
| `job_queue_stale_count` | > 0 | Jobs with expired leases exist |
| `dead_letter_unresolved_count` | > 0 | Failures need admin attention |
| `dispatch_lag_seconds` | > 60 | Posts not being dispatched on time |
| `leader_election_count` | > 1 per 5 min | Unstable leadership |
| `handler_duration_p99` | > 4 min | Handlers approaching lease duration |
| `db_connection_pool_exhausted` | any | Workers can't get connections |

---

## 9. Implementation Code

### 9.1 SchedulerLeaderService

```csharp
// Leadership/SchedulerLeaderService.cs
namespace PublyApp.Worker.Leadership;

using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using Npgsql;
using PublyApp.Worker.Configuration;
using PublyApp.Worker.Scheduling;
using Quartz;
using Quartz.Impl;
using Quartz.Spi;

/// <summary>
/// Manages Quartz scheduler lifecycle with PostgreSQL advisory lock for leader election.
/// Quartz is created and started ONLY after advisory lock is acquired.
/// </summary>
public class SchedulerLeaderService : BackgroundService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly IServiceProvider _services;
    private readonly ILogger<SchedulerLeaderService> _logger;
    private readonly WorkerOptions _options;
    private readonly string _connectionString;

    private NpgsqlConnection? _lockConnection;
    private IScheduler? _scheduler;
    private bool _isLeader;

    public SchedulerLeaderService(
        NpgsqlDataSource dataSource,
        IServiceProvider services,
        IConfiguration configuration,
        IOptions<WorkerOptions> options,
        ILogger<SchedulerLeaderService> logger)
    {
        _dataSource = dataSource;
        _services = services;
        _logger = logger;
        _options = options.Value;
        _connectionString = configuration.GetConnectionString("DefaultConnection")!;
    }

    public bool IsLeader => _isLeader;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunLeadershipLoopAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in leadership loop, retrying in 10s");
                await CleanupAsync();
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }

        await CleanupAsync();
    }

    private async Task RunLeadershipLoopAsync(CancellationToken ct)
    {
        // Open dedicated connection for advisory lock (not from pool)
        _lockConnection = new NpgsqlConnection(_connectionString);
        await _lockConnection.OpenAsync(ct);

        try
        {
            // Attempt to acquire advisory lock (non-blocking)
            await using var cmd = _lockConnection.CreateCommand();
            cmd.CommandText = "SELECT pg_try_advisory_lock(@lockId)";
            cmd.Parameters.AddWithValue("lockId", _options.AdvisoryLockId);

            var acquired = (bool)(await cmd.ExecuteScalarAsync(ct))!;

            if (acquired)
            {
                _isLeader = true;
                _logger.LogInformation(
                    "Acquired leadership (lock {LockId}). Starting Quartz scheduler...",
                    _options.AdvisoryLockId);

                await RunAsLeaderAsync(ct);
            }
            else
            {
                _isLeader = false;
                _logger.LogInformation(
                    "Another instance holds leadership (lock {LockId}). Running as follower.",
                    _options.AdvisoryLockId);

                await RunAsFollowerAsync(ct);
            }
        }
        finally
        {
            if (_lockConnection != null)
            {
                await _lockConnection.DisposeAsync();
                _lockConnection = null;
            }
        }
    }

    private async Task RunAsLeaderAsync(CancellationToken ct)
    {
        // CREATE SCHEDULER (only now, after lock confirmed)
        _scheduler = await CreateSchedulerAsync();

        // Register hardcoded trigger jobs
        await RegisterHardcodedJobsAsync(_scheduler, ct);

        // START SCHEDULER
        await _scheduler.Start(ct);
        _logger.LogInformation("Quartz scheduler started");

        // Hold leadership until cancellation or connection loss
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), ct);

                // Verify lock connection still alive
                if (_lockConnection?.State != System.Data.ConnectionState.Open)
                {
                    _logger.LogWarning("Lock connection lost, releasing leadership");
                    break;
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Normal shutdown
        }
    }

    private async Task RunAsFollowerAsync(CancellationToken ct)
    {
        // Close connection (we don't hold lock)
        await _lockConnection!.DisposeAsync();
        _lockConnection = null;

        // Wait before retrying leadership acquisition
        await Task.Delay(TimeSpan.FromSeconds(30), ct);
    }

    private async Task<IScheduler> CreateSchedulerAsync()
    {
        var properties = new System.Collections.Specialized.NameValueCollection
        {
            ["quartz.scheduler.instanceName"] = "PublyAppScheduler",
            ["quartz.scheduler.instanceId"] = _options.InstanceId,
            ["quartz.threadPool.maxConcurrency"] = "5",
            ["quartz.jobStore.type"] = "Quartz.Impl.AdoJobStore.JobStoreTX, Quartz",
            ["quartz.jobStore.driverDelegateType"] = "Quartz.Impl.AdoJobStore.StdAdoDelegate, Quartz",
            ["quartz.jobStore.dataSource"] = "default",
            ["quartz.jobStore.tablePrefix"] = "qrtz_",
            ["quartz.jobStore.useProperties"] = "true",
            ["quartz.dataSource.default.provider"] = "Npgsql",
            ["quartz.dataSource.default.connectionString"] = _connectionString,
            ["quartz.serializer.type"] = "json"
        };

        var factory = new StdSchedulerFactory(properties);
        var scheduler = await factory.GetScheduler();

        // Set DI job factory
        scheduler.JobFactory = new ServiceProviderJobFactory(_services);

        return scheduler;
    }

    private async Task RegisterHardcodedJobsAsync(IScheduler scheduler, CancellationToken ct)
    {
        // DispatchDuePostsJob - every 15 seconds
        await RegisterJobIfNotExistsAsync<DispatchDuePostsJob>(
            scheduler,
            "dispatch-due-posts",
            "core",
            SimpleScheduleBuilder.Create()
                .WithIntervalInSeconds(_options.Dispatch.IntervalSeconds)
                .RepeatForever(),
            ct);

        // SyncSystemJobsJob - every 60 seconds
        await RegisterJobIfNotExistsAsync<SyncSystemJobsJob>(
            scheduler,
            "sync-system-jobs",
            "core",
            SimpleScheduleBuilder.Create()
                .WithIntervalInSeconds(60)
                .RepeatForever(),
            ct);

        // RecoverStaleJobsJob - every 5 minutes
        await RegisterJobIfNotExistsAsync<RecoverStaleJobsJob>(
            scheduler,
            "recover-stale-jobs",
            "core",
            CronScheduleBuilder.CronSchedule("0 */5 * * * ?"),
            ct);
    }

    private async Task RegisterJobIfNotExistsAsync<TJob>(
        IScheduler scheduler,
        string name,
        string group,
        IScheduleBuilder scheduleBuilder,
        CancellationToken ct) where TJob : IJob
    {
        var jobKey = new JobKey(name, group);
        if (await scheduler.CheckExists(jobKey, ct))
            return;

        var job = JobBuilder.Create<TJob>()
            .WithIdentity(jobKey)
            .Build();

        var trigger = TriggerBuilder.Create()
            .WithIdentity($"{name}-trigger", group)
            .WithSchedule(scheduleBuilder)
            .StartNow()
            .Build();

        await scheduler.ScheduleJob(job, trigger, ct);
        _logger.LogInformation("Registered Quartz job: {JobKey}", jobKey);
    }

    private async Task CleanupAsync()
    {
        _isLeader = false;

        if (_scheduler != null)
        {
            try
            {
                _logger.LogInformation("Shutting down Quartz scheduler...");
                await _scheduler.Shutdown(waitForJobsToComplete: true);
                _logger.LogInformation("Quartz scheduler stopped");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error shutting down scheduler");
            }
            _scheduler = null;
        }

        if (_lockConnection != null)
        {
            try
            {
                await using var cmd = _lockConnection.CreateCommand();
                cmd.CommandText = "SELECT pg_advisory_unlock(@lockId)";
                cmd.Parameters.AddWithValue("lockId", _options.AdvisoryLockId);
                await cmd.ExecuteNonQueryAsync();
                _logger.LogInformation("Released advisory lock {LockId}", _options.AdvisoryLockId);
            }
            catch { /* Connection may already be closed */ }
            finally
            {
                await _lockConnection.DisposeAsync();
                _lockConnection = null;
            }
        }
    }
}

/// <summary>
/// Job factory that properly manages DI scope lifetime.
/// </summary>
public class ServiceProviderJobFactory : IJobFactory
{
    private readonly IServiceProvider _rootProvider;
    private readonly ConcurrentDictionary<IJob, IServiceScope> _scopes = new();

    public ServiceProviderJobFactory(IServiceProvider rootProvider)
    {
        _rootProvider = rootProvider;
    }

    public IJob NewJob(TriggerFiredBundle bundle, IScheduler scheduler)
    {
        var scope = _rootProvider.CreateScope();

        try
        {
            var job = (IJob)scope.ServiceProvider.GetRequiredService(bundle.JobDetail.JobType);
            _scopes[job] = scope;
            return job;
        }
        catch
        {
            scope.Dispose();
            throw;
        }
    }

    public void ReturnJob(IJob job)
    {
        if (_scopes.TryRemove(job, out var scope))
        {
            scope.Dispose();
        }
        (job as IDisposable)?.Dispose();
    }
}
```

### 9.2 SyncSystemJobsJob

```csharp
// Scheduling/SyncSystemJobsJob.cs
namespace PublyApp.Worker.Scheduling;

using Dapper;
using Npgsql;
using Quartz;
using Quartz.Impl.Matchers;

/// <summary>
/// Reconciles Quartz triggers with system_job_definitions from the database.
/// Runs every 60 seconds on the leader.
/// </summary>
[DisallowConcurrentExecution]
public class SyncSystemJobsJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ISchedulerFactory _schedulerFactory;
    private readonly ILogger<SyncSystemJobsJob> _logger;

    private const string TriggerGroup = "system-triggers";
    private const string JobGroup = "system-jobs";

    public SyncSystemJobsJob(
        NpgsqlDataSource dataSource,
        ISchedulerFactory schedulerFactory,
        ILogger<SyncSystemJobsJob> logger)
    {
        _dataSource = dataSource;
        _schedulerFactory = schedulerFactory;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        var scheduler = await _schedulerFactory.GetScheduler(ct);

        // Load definitions from DB
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var definitions = (await conn.QueryAsync<SystemJobDefinition>(
            """
            SELECT job_key, enabled, schedule_type, cron_expression, interval_seconds,
                   concurrency_policy, default_payload, max_attempts
            FROM system_job_definitions
            """)).ToList();

        // Get existing triggers
        var existingTriggerKeys = await scheduler.GetTriggerKeys(
            GroupMatcher<TriggerKey>.GroupEquals(TriggerGroup), ct);

        var definitionKeys = definitions.Select(d => d.JobKey).ToHashSet();
        var existingKeys = existingTriggerKeys.Select(tk => tk.Name).ToHashSet();

        // Process each definition
        foreach (var def in definitions)
        {
            var triggerKey = new TriggerKey(def.JobKey, TriggerGroup);
            var jobKey = new JobKey(def.JobKey, JobGroup);

            if (def.Enabled)
            {
                if (!existingKeys.Contains(def.JobKey))
                {
                    // Create new trigger
                    await CreateTriggerAsync(scheduler, def, ct);
                    _logger.LogInformation("Created trigger for system job: {JobKey}", def.JobKey);
                }
                else
                {
                    // Check if schedule changed
                    var existingTrigger = await scheduler.GetTrigger(triggerKey, ct);
                    if (existingTrigger != null && ScheduleChanged(existingTrigger, def))
                    {
                        await scheduler.UnscheduleJob(triggerKey, ct);
                        await CreateTriggerAsync(scheduler, def, ct);
                        _logger.LogInformation("Updated trigger for system job: {JobKey}", def.JobKey);
                    }
                }
            }
            else
            {
                // Disabled - remove trigger if exists
                if (existingKeys.Contains(def.JobKey))
                {
                    await scheduler.UnscheduleJob(triggerKey, ct);
                    _logger.LogInformation("Removed trigger for disabled system job: {JobKey}", def.JobKey);
                }
            }
        }

        // Remove triggers for deleted definitions
        foreach (var existingKey in existingTriggerKeys)
        {
            if (!definitionKeys.Contains(existingKey.Name))
            {
                await scheduler.UnscheduleJob(existingKey, ct);
                _logger.LogInformation("Removed trigger for deleted system job: {JobKey}", existingKey.Name);
            }
        }
    }

    private async Task CreateTriggerAsync(IScheduler scheduler, SystemJobDefinition def, CancellationToken ct)
    {
        var job = JobBuilder.Create<EnqueueSystemJobTrigger>()
            .WithIdentity(def.JobKey, JobGroup)
            .UsingJobData("job_key", def.JobKey)
            .Build();

        IScheduleBuilder scheduleBuilder = def.ScheduleType switch
        {
            "cron" => CronScheduleBuilder.CronSchedule(def.CronExpression!),
            "fixed_interval" => SimpleScheduleBuilder.Create()
                .WithIntervalInSeconds(def.IntervalSeconds!.Value)
                .RepeatForever(),
            _ => throw new InvalidOperationException($"Unknown schedule type: {def.ScheduleType}")
        };

        var trigger = TriggerBuilder.Create()
            .WithIdentity(def.JobKey, TriggerGroup)
            .ForJob(job)
            .WithSchedule(scheduleBuilder)
            .StartNow()
            .Build();

        await scheduler.ScheduleJob(job, trigger, ct);
    }

    private bool ScheduleChanged(ITrigger existing, SystemJobDefinition def)
    {
        // Compare schedules
        if (def.ScheduleType == "cron" && existing is ICronTrigger cronTrigger)
        {
            return cronTrigger.CronExpressionString != def.CronExpression;
        }
        if (def.ScheduleType == "fixed_interval" && existing is ISimpleTrigger simpleTrigger)
        {
            return simpleTrigger.RepeatInterval != TimeSpan.FromSeconds(def.IntervalSeconds!.Value);
        }
        return true; // Schedule type changed
    }

    private class SystemJobDefinition
    {
        public string JobKey { get; set; } = null!;
        public bool Enabled { get; set; }
        public string ScheduleType { get; set; } = null!;
        public string? CronExpression { get; set; }
        public int? IntervalSeconds { get; set; }
        public string ConcurrencyPolicy { get; set; } = null!;
        public string DefaultPayload { get; set; } = "{}";
        public int MaxAttempts { get; set; }
    }
}

/// <summary>
/// Quartz job that enqueues a system job into job_queue.
/// Does NOT execute the system job - just creates the queue entry.
/// </summary>
public class EnqueueSystemJobTrigger : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<EnqueueSystemJobTrigger> _logger;

    public EnqueueSystemJobTrigger(
        NpgsqlDataSource dataSource,
        ILogger<EnqueueSystemJobTrigger> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var jobKey = context.MergedJobDataMap.GetString("job_key")!;
        var ct = context.CancellationToken;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Load definition to get concurrency policy and payload
        var def = await conn.QuerySingleOrDefaultAsync<dynamic>(
            """
            SELECT concurrency_policy, default_payload, max_attempts
            FROM system_job_definitions
            WHERE job_key = @jobKey AND enabled = true
            """,
            new { jobKey });

        if (def == null)
        {
            _logger.LogWarning("System job definition not found or disabled: {JobKey}", jobKey);
            return;
        }

        var concurrencyPolicy = (string)def.concurrency_policy;
        var payload = (string)def.default_payload;
        var maxAttempts = (int)def.max_attempts;

        // Check concurrency policy
        if (concurrencyPolicy == "skip_if_running")
        {
            var existing = await conn.QuerySingleOrDefaultAsync<int>(
                """
                SELECT COUNT(*) FROM job_queue
                WHERE job_type = @jobType
                AND status IN ('pending', 'processing')
                """,
                new { jobType = $"system::{jobKey}" });

            if (existing > 0)
            {
                _logger.LogDebug("Skipping system job {JobKey}: already running/pending", jobKey);
                return;
            }
        }
        else if (concurrencyPolicy == "replace")
        {
            await conn.ExecuteAsync(
                """
                DELETE FROM job_queue
                WHERE job_type = @jobType AND status = 'pending'
                """,
                new { jobType = $"system::{jobKey}" });
        }

        // Insert job into queue
        var runId = Guid.NewGuid();
        await conn.ExecuteAsync(
            """
            INSERT INTO job_queue (job_type, correlation_id, payload, max_attempts)
            VALUES (@jobType, @runId, @payload::jsonb, @maxAttempts)
            ON CONFLICT DO NOTHING
            """,
            new
            {
                jobType = $"system::{jobKey}",
                runId,
                payload,
                maxAttempts
            });

        _logger.LogInformation("Enqueued system job: {JobKey} (run_id: {RunId})", jobKey, runId);
    }
}
```

### 9.3 Run-on-Demand API

```csharp
// Api/Controllers/AdminSystemJobsController.cs
namespace PublyApp.Api.Controllers;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using Npgsql;
using System.Text.Json;

[ApiController]
[Route("api/admin/system-jobs")]
[Authorize(Roles = "Admin")]
public class AdminSystemJobsController : ControllerBase
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<AdminSystemJobsController> _logger;

    public AdminSystemJobsController(
        NpgsqlDataSource dataSource,
        ILogger<AdminSystemJobsController> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    /// <summary>
    /// List all system job definitions
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> ListSystemJobs(CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var jobs = await conn.QueryAsync<SystemJobDto>(
            """
            SELECT job_key, display_name, description, enabled,
                   schedule_type, cron_expression, interval_seconds,
                   timezone, concurrency_policy, max_attempts,
                   last_modified_by, last_modified_at
            FROM system_job_definitions
            ORDER BY display_name
            """);

        return Ok(jobs);
    }

    /// <summary>
    /// Run a system job immediately (on-demand)
    /// </summary>
    [HttpPost("{jobKey}/run")]
    public async Task<IActionResult> RunSystemJob(
        string jobKey,
        [FromBody] RunSystemJobRequest? request,
        CancellationToken ct)
    {
        var userId = User.Identity?.Name ?? "unknown";

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Load definition
        var def = await conn.QuerySingleOrDefaultAsync<dynamic>(
            """
            SELECT enabled, concurrency_policy, default_payload, max_attempts
            FROM system_job_definitions
            WHERE job_key = @jobKey
            """,
            new { jobKey });

        if (def == null)
            return NotFound(new { error = "System job not found", jobKey });

        if (!(bool)def.enabled)
            return BadRequest(new { error = "System job is disabled", jobKey });

        var concurrencyPolicy = (string)def.concurrency_policy;
        var payload = request?.PayloadOverride != null
            ? JsonSerializer.Serialize(request.PayloadOverride)
            : (string)def.default_payload;
        var maxAttempts = (int)def.max_attempts;

        // Check concurrency policy
        if (concurrencyPolicy == "skip_if_running")
        {
            var existing = await conn.QuerySingleOrDefaultAsync<int>(
                """
                SELECT COUNT(*) FROM job_queue
                WHERE job_type = @jobType
                AND status IN ('pending', 'processing')
                """,
                new { jobType = $"system::{jobKey}" });

            if (existing > 0)
            {
                return Conflict(new
                {
                    error = "System job already running or pending",
                    jobKey,
                    concurrencyPolicy
                });
            }
        }
        else if (concurrencyPolicy == "replace")
        {
            await conn.ExecuteAsync(
                """
                DELETE FROM job_queue
                WHERE job_type = @jobType AND status = 'pending'
                """,
                new { jobType = $"system::{jobKey}" });
        }

        // Insert job
        var runId = Guid.NewGuid();
        await conn.ExecuteAsync(
            """
            INSERT INTO job_queue (job_type, correlation_id, payload, max_attempts, run_after)
            VALUES (@jobType, @runId, @payload::jsonb, @maxAttempts, now())
            """,
            new
            {
                jobType = $"system::{jobKey}",
                runId,
                payload,
                maxAttempts
            });

        _logger.LogInformation(
            "Admin {UserId} triggered system job {JobKey} (run_id: {RunId})",
            userId, jobKey, runId);

        return Accepted(new
        {
            jobKey,
            runId,
            status = "queued",
            triggeredBy = userId,
            triggeredAt = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Update a system job definition
    /// </summary>
    [HttpPut("{jobKey}")]
    public async Task<IActionResult> UpdateSystemJob(
        string jobKey,
        [FromBody] UpdateSystemJobRequest request,
        CancellationToken ct)
    {
        var userId = User.Identity?.Name ?? "unknown";

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var updated = await conn.ExecuteAsync(
            """
            UPDATE system_job_definitions
            SET enabled = @enabled,
                schedule_type = @scheduleType,
                cron_expression = @cronExpression,
                interval_seconds = @intervalSeconds,
                concurrency_policy = @concurrencyPolicy,
                max_attempts = @maxAttempts,
                last_modified_by = @userId,
                last_modified_at = now()
            WHERE job_key = @jobKey
            """,
            new
            {
                jobKey,
                request.Enabled,
                scheduleType = request.ScheduleType,
                cronExpression = request.CronExpression,
                intervalSeconds = request.IntervalSeconds,
                concurrencyPolicy = request.ConcurrencyPolicy,
                maxAttempts = request.MaxAttempts,
                userId
            });

        if (updated == 0)
            return NotFound(new { error = "System job not found", jobKey });

        _logger.LogInformation(
            "Admin {UserId} updated system job definition {JobKey}",
            userId, jobKey);

        return Ok(new { jobKey, updated = true });
    }

    public record RunSystemJobRequest(Dictionary<string, object>? PayloadOverride);

    public record UpdateSystemJobRequest(
        bool Enabled,
        string ScheduleType,
        string? CronExpression,
        int? IntervalSeconds,
        string ConcurrencyPolicy,
        int MaxAttempts);

    private class SystemJobDto
    {
        public string JobKey { get; set; } = null!;
        public string DisplayName { get; set; } = null!;
        public string? Description { get; set; }
        public bool Enabled { get; set; }
        public string ScheduleType { get; set; } = null!;
        public string? CronExpression { get; set; }
        public int? IntervalSeconds { get; set; }
        public string Timezone { get; set; } = null!;
        public string ConcurrencyPolicy { get; set; } = null!;
        public int MaxAttempts { get; set; }
        public string? LastModifiedBy { get; set; }
        public DateTime LastModifiedAt { get; set; }
    }
}
```

### 9.4 System Job Handler Example

```csharp
// Handlers/SystemJobHandlers.cs
namespace PublyApp.Worker.Handlers;

using System.Text.Json;
using Dapper;
using Npgsql;
using PublyApp.Worker.Queue;

/// <summary>
/// Handler for system::cleanup_expired_sessions
/// </summary>
public class CleanupExpiredSessionsHandler : IJobHandler
{
    public string JobType => "system::cleanup_expired_sessions";

    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<CleanupExpiredSessionsHandler> _logger;

    public CleanupExpiredSessionsHandler(
        NpgsqlDataSource dataSource,
        ILogger<CleanupExpiredSessionsHandler> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task HandleAsync(JobContext context, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var deleted = await conn.ExecuteAsync(
            "DELETE FROM sessions WHERE expires_at < now()");

        _logger.LogInformation(
            "Cleanup completed: deleted {Count} expired sessions (run_id: {RunId})",
            deleted, context.CorrelationId);
    }
}

/// <summary>
/// Handler for system::refresh_expiring_tokens
/// </summary>
public class RefreshExpiringTokensHandler : IJobHandler
{
    public string JobType => "system::refresh_expiring_tokens";

    private readonly NpgsqlDataSource _dataSource;
    private readonly IOAuthService _oauthService;
    private readonly ILogger<RefreshExpiringTokensHandler> _logger;

    public RefreshExpiringTokensHandler(
        NpgsqlDataSource dataSource,
        IOAuthService oauthService,
        ILogger<RefreshExpiringTokensHandler> logger)
    {
        _dataSource = dataSource;
        _oauthService = oauthService;
        _logger = logger;
    }

    public async Task HandleAsync(JobContext context, CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Find tokens expiring in next 24 hours
        var expiringAccounts = await conn.QueryAsync<dynamic>(
            """
            SELECT id, platform, refresh_token
            FROM social_accounts
            WHERE token_expires_at < now() + interval '24 hours'
            AND refresh_token IS NOT NULL
            AND is_active = true
            """);

        var refreshed = 0;
        var failed = 0;

        foreach (var account in expiringAccounts)
        {
            try
            {
                var newToken = await _oauthService.RefreshTokenAsync(
                    (Guid)account.id,
                    (string)account.refresh_token,
                    ct);

                await conn.ExecuteAsync(
                    """
                    UPDATE social_accounts
                    SET access_token = @accessToken,
                        token_expires_at = @expiresAt,
                        last_token_refresh_at = now()
                    WHERE id = @id
                    """,
                    new
                    {
                        id = (Guid)account.id,
                        accessToken = newToken.AccessToken,
                        expiresAt = newToken.ExpiresAt
                    });

                refreshed++;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to refresh token for account {AccountId}",
                    (Guid)account.id);
                failed++;
            }
        }

        _logger.LogInformation(
            "Token refresh completed: {Refreshed} refreshed, {Failed} failed (run_id: {RunId})",
            refreshed, failed, context.CorrelationId);
    }
}
```

---

## 10. Implementation Checklist

### Database Migrations (in order)

- [ ] 001_create_job_queue.sql - Execution queue with lease columns
- [ ] 002_create_scheduled_posts.sql - Business entity with FK to job_queue
- [ ] 003_create_dead_letter_jobs.sql - Terminal failure storage
- [ ] 004_create_rate_limits.sql - API throttling
- [ ] 005_create_system_job_definitions.sql - Dashboard-configurable system jobs
- [ ] 006_create_quartz_tables.sql - Quartz internal tables (from GitHub)
- [ ] Seed system_job_definitions with initial job definitions

### Core Infrastructure

- [ ] WorkerOptions configuration class
- [ ] SchedulerLeaderService with advisory lock
- [ ] ServiceProviderJobFactory with proper scope lifecycle
- [ ] JobQueueProcessor with lease-based claiming and heartbeat
- [ ] JobHandlerRegistry for handler lookup
- [ ] DeadLetterService for DLQ operations
- [ ] IJobHandler interface and JobContext

### Quartz Trigger Jobs

- [ ] DispatchDuePostsJob (idempotent dispatch)
- [ ] SyncSystemJobsJob (reconcile system jobs from DB)
- [ ] EnqueueSystemJobTrigger (enqueue system job to queue)
- [ ] RecoverStaleJobsJob (lease-based recovery)

### Job Handlers

- [ ] PublishPostHandler with idempotency checkpoint
- [ ] CleanupExpiredSessionsHandler
- [ ] RefreshExpiringTokensHandler
- [ ] ValidateScheduledPostsHandler
- [ ] CleanupOldJobsHandler
- [ ] HealthCheckSocialAccountsHandler

### API Endpoints

- [ ] POST /api/posts/schedule - Schedule a post
- [ ] DELETE /api/posts/{id}/cancel - Cancel a scheduled post
- [ ] GET /api/admin/system-jobs - List system job definitions
- [ ] POST /api/admin/system-jobs/{key}/run - Run system job on demand
- [ ] PUT /api/admin/system-jobs/{key} - Update system job definition
- [ ] GET /api/admin/dlq - List unresolved DLQ entries
- [ ] POST /api/admin/dlq/{id}/replay - Replay a DLQ job

### Observability

- [ ] JobQueueHealthCheck
- [ ] Structured logging with job context
- [ ] Metrics for pending/stale/DLQ counts
- [ ] Alerts for degraded states

### Testing

- [ ] Test leader election (start 2 workers, verify only 1 runs Quartz)
- [ ] Test lease expiry (kill worker, verify job recovered)
- [ ] Test idempotency (duplicate dispatch, verify single job)
- [ ] Test idempotency checkpoint (crash after API, verify no duplicate publish)
- [ ] Test DLQ flow (force max failures, verify DLQ entry)
- [ ] Test system job scheduling (verify SyncSystemJobsJob creates triggers)
- [ ] Test run-on-demand (verify API creates job, worker executes)
- [ ] Test concurrency policies (skip_if_running, replace)
- [ ] Test backoff timing (verify delays match spec)

---

## Summary

This implementation plan provides a complete, production-grade background jobs infrastructure for PublyApp using pure PostgreSQL with Quartz.NET for scheduling triggers.

**Key features:**
- No external message broker required
- Dashboard-configurable system jobs via `system_job_definitions`
- Run-on-demand API for admin operations
- Crash-safe execution via lease model
- Two-phase locking for duplicate prevention
- Comprehensive idempotency for external API calls
- Bounded retry with exponential backoff
- Full audit trail via DLQ

**The self-critique section (Section 8) validates:**
- Locking correctness
- Leader election safety
- Transaction boundaries
- Lease model correctness
- Duplicate prevention at all layers
- State machine consistency
- Bounded retry behavior
- On-demand job safety
- Performance characteristics
- Red team failure scenarios

Ready for implementation review.
