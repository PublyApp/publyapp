# PublyApp Background Jobs Infrastructure — Pure Postgres v3 (Final)

> **Architecture**: Quartz.NET (manual lifecycle) + PostgreSQL job queue with leases
>
> No RabbitMQ. No Redis. Just PostgreSQL.
>
> **Changes from v2**: Fixed Quartz startup, added lease model, unified retry authority, added uniqueness guards.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [State Machines (Corrected)](#2-state-machines-corrected)
3. [Database Schema (with Leases)](#3-database-schema-with-leases)
4. [Phase 1: Project Setup](#4-phase-1-project-setup)
5. [Phase 2: Quartz with Manual Lifecycle](#5-phase-2-quartz-with-manual-lifecycle)
6. [Phase 3: Job Queue Processor (with Leases)](#6-phase-3-job-queue-processor-with-leases)
7. [Phase 4: Job Handlers (Unified Retry Authority)](#7-phase-4-job-handlers-unified-retry-authority)
8. [Phase 5: System Jobs](#8-phase-5-system-jobs)
9. [Phase 6: API Integration](#9-phase-6-api-integration)
10. [Phase 7: Observability](#10-phase-7-observability)
11. [Phase 8: Deployment](#11-phase-8-deployment)
12. [Implementation Checklist](#12-implementation-checklist)

---

## 1. Architecture Overview

### 1.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PublyApp.Worker                                      │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │              SchedulerLeaderService (BackgroundService)                 │ │
│  │                                                                         │ │
│  │  1. Acquire advisory lock (pg_try_advisory_lock)                       │ │
│  │  2. If acquired: create + start Quartz scheduler (MANUAL, not hosted)  │ │
│  │  3. Hold lock until shutdown                                           │ │
│  │  4. On shutdown: stop scheduler, release lock                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                    │                                                         │
│                    ▼ (leader only)                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    Quartz.NET (manually managed)                        │ │
│  │                                                                         │ │
│  │  DispatchDuePostsJob (every 15s)     System Jobs                       │ │
│  │  ┌─────────────────────────────┐     ┌───────────────────────────────┐ │ │
│  │  │ 1. SELECT scheduled_posts   │     │ • SessionCleanupJob (hourly)  │ │ │
│  │  │    WHERE status='scheduled' │     │ • RefreshTokensJob (6h)       │ │ │
│  │  │    AND publish_at <= now()  │     │ • RecoverStaleJobsJob (5min)  │ │ │
│  │  │ 2. UPDATE status='queued'   │     │ • ValidatePostsJob (daily)    │ │ │
│  │  │ 3. INSERT INTO job_queue    │     │ • CleanupOldJobsJob (daily)   │ │ │
│  │  │    (idempotent via UNIQUE)  │     └───────────────────────────────┘ │ │
│  │  └─────────────────────────────┘                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │              JobQueueProcessor (BackgroundService)                      │ │
│  │                        (runs on ALL instances)                          │ │
│  │                                                                         │ │
│  │  Loop:                                                                  │ │
│  │    1. Claim jobs: UPDATE ... SET locked_until = now() + '5 min'        │ │
│  │       WHERE status='pending' AND run_after <= now()                    │ │
│  │       FOR UPDATE SKIP LOCKED                                           │ │
│  │    2. Execute handler                                                  │ │
│  │    3. On success: DELETE from job_queue, update scheduled_posts        │ │
│  │    4. On failure: increment attempts, extend locked_until for retry    │ │
│  │       OR move to dead_letter_jobs if max attempts reached              │ │
│  │    5. Long jobs: heartbeat extends locked_until                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL                                      │
│                                                                              │
│  scheduled_posts              job_queue                 dead_letter_jobs    │
│  ┌─────────────────┐         ┌─────────────────┐       ┌─────────────────┐  │
│  │ status          │         │ status          │       │ (terminal)      │  │
│  │ publish_at_utc  │         │ locked_until    │◄──────│                 │  │
│  │ job_queue_id    │◄────────│ correlation_id  │       │                 │  │
│  │ platform_post_id│         │ attempts        │       │                 │  │
│  └─────────────────┘         └─────────────────┘       └─────────────────┘  │
│                                                                              │
│  rate_limits                  qrtz_* tables                                 │
│  ┌─────────────────┐         ┌─────────────────┐                           │
│  │ (atomic counter)│         │ (Quartz internal)│                           │
│  └─────────────────┘         └─────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Design Decisions (v3)

| Decision | Rationale |
|----------|-----------|
| **Manual Quartz lifecycle** | Leader service creates/starts scheduler directly. No QuartzHostedService race. |
| **Lease model (`locked_until`)** | Workers claim jobs with a lease. Stale recovery only touches expired leases. |
| **Job queue owns retries** | Handler doesn't manipulate `scheduled_posts` status on transient errors. |
| **Uniqueness constraint** | `UNIQUE (job_type, correlation_id)` prevents duplicate job enqueue. |
| **`job_queue_id` on posts** | Tracks which job is responsible for a post. Enables clean recovery. |

### 1.3 Retry Authority (Clarified)

| System | Owns | Does NOT own |
|--------|------|--------------|
| **job_queue** | Retry attempts, backoff timing | Business-level rescheduling |
| **scheduled_posts** | Source of truth for publish time | Retry mechanics |
| **Handler** | Intentional reschedules (rate limit, user action) | Transient error retries |

**Rule**: On transient error, handler throws. Job queue handles retry. Handler only changes `scheduled_posts.publish_at_utc` when intentionally pushing to a future time (e.g., platform rate limit says "retry in 15 min").

---

## 2. State Machines (Corrected)

### 2.1 scheduled_posts State Machine

```
                      User creates
                           │
                           ▼
                    ┌──────────────┐
                    │    draft     │
                    └──────┬───────┘
                           │ User schedules (sets publish_at_utc)
                           ▼
                    ┌──────────────┐
          ┌─────────│  scheduled   │◄─────────────────────────────┐
          │         └──────┬───────┘                              │
          │                │ DispatchDuePostsJob                  │
          │                │ (publish_at_utc <= now)              │
          │                ▼                                      │
          │         ┌──────────────┐                              │
          │         │    queued    │ (job_queue_id is set)        │
          │         └──────┬───────┘                              │
          │                │ JobQueueProcessor claims job         │
          │                ▼                                      │
          │         ┌──────────────┐                              │
          │         │  processing  │──────────────────────────────┤
          │         └──────┬───────┘  Handler intentionally       │
          │                │          reschedules (rate limit)    │
          │       ┌────────┴────────┐                             │
          │       │                 │                             │
          │       ▼                 ▼                             │
          │ ┌──────────┐     ┌──────────┐                        │
          │ │ published│     │  failed  │ (max attempts, DLQ)    │
          │ └──────────┘     └──────────┘                        │
          │
          │ User cancels (only from scheduled/queued)
          ▼
   ┌──────────────┐
   │  cancelled   │
   └──────────────┘
```

**Note**: `processing` is set by the handler when it starts work. Job queue retries do NOT change `scheduled_posts` status — they just retry the job.

### 2.2 job_queue State Machine

```
     DispatchDuePostsJob (idempotent INSERT)
                │
                ▼
         ┌──────────────┐
         │   pending    │ (run_after, locked_until=NULL)
         └──────┬───────┘
                │ Processor claims (sets locked_until)
                ▼
         ┌──────────────┐
         │  processing  │ (locked_until = now + lease)
         └──────┬───────┘
                │
       ┌────────┼────────┐
       │        │        │
       ▼        │        ▼
  [SUCCESS]     │    [FAILURE]
       │        │        │
       │        │        ├─► attempts < max: reset to pending
       │        │        │   (run_after = now + backoff)
       │        │        │
       ▼        │        ▼
   [DELETE]     │   [MOVE TO DLQ + DELETE]
                │
                │ Lease expired (locked_until < now)
                │ RecoverStaleJobsJob
                ▼
         ┌──────────────┐
         │   pending    │ (attempts++, run_after = now)
         └──────────────┘
```

**Key**: Jobs are deleted on completion or DLQ. No `completed` status needed (optional for audit).

---

## 3. Database Schema (with Leases)

### 3.1 scheduled_posts

```sql
-- Migration: 001_create_scheduled_posts.sql

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

    -- Scheduling (ALWAYS UTC)
    publish_at_utc TIMESTAMPTZ NOT NULL,
    user_timezone_id VARCHAR(100) NOT NULL,

    -- Status
    status post_status NOT NULL DEFAULT 'draft',

    -- Job tracking (links to job_queue)
    job_queue_id UUID,  -- Set when dispatched, cleared on completion/failure

    -- Idempotency checkpoint
    platform_post_id VARCHAR(500),  -- Set IMMEDIATELY after API success
    platform_url TEXT,

    -- Terminal state info
    published_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT fk_job_queue FOREIGN KEY (job_queue_id) REFERENCES job_queue(id) ON DELETE SET NULL
);

-- Dispatch query: find posts ready to queue
CREATE INDEX idx_scheduled_posts_dispatch
    ON scheduled_posts (publish_at_utc)
    WHERE status = 'scheduled';

-- User queries
CREATE INDEX idx_scheduled_posts_tenant
    ON scheduled_posts (tenant_id, status, publish_at_utc DESC);

-- Recovery: find posts with missing jobs (queued but no job_queue row)
CREATE INDEX idx_scheduled_posts_orphaned
    ON scheduled_posts (job_queue_id)
    WHERE status = 'queued' AND job_queue_id IS NOT NULL;
```

### 3.2 job_queue (with Leases)

```sql
-- Migration: 002_create_job_queue.sql

CREATE TYPE job_status AS ENUM ('pending', 'processing');

CREATE TABLE job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job type and correlation
    job_type VARCHAR(100) NOT NULL,
    correlation_id UUID,  -- e.g., scheduled_post.id
    tenant_id UUID,

    -- Payload
    payload JSONB NOT NULL,

    -- Scheduling
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Lease (THE KEY ADDITION)
    locked_until TIMESTAMPTZ,  -- NULL = not claimed, future = claimed with lease
    locked_by VARCHAR(100),    -- Worker instance ID (for debugging)

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

-- Claim query: pending jobs ready to run
CREATE INDEX idx_job_queue_claim
    ON job_queue (run_after, created_at)
    WHERE status = 'pending';

-- Stale recovery: expired leases
CREATE INDEX idx_job_queue_stale
    ON job_queue (locked_until)
    WHERE status = 'processing' AND locked_until IS NOT NULL;

-- UNIQUENESS GUARD: prevent duplicate publish jobs
CREATE UNIQUE INDEX idx_job_queue_publish_unique
    ON job_queue (job_type, correlation_id)
    WHERE job_type = 'publish_post' AND correlation_id IS NOT NULL;
```

### 3.3 dead_letter_jobs

```sql
-- Migration: 003_create_dead_letter_jobs.sql

CREATE TABLE dead_letter_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Original job
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

    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    resolution_notes TEXT
);

CREATE INDEX idx_dlq_unresolved
    ON dead_letter_jobs (moved_at DESC)
    WHERE resolved_at IS NULL;
```

### 3.4 rate_limits

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

-- Cleanup old records
CREATE INDEX idx_rate_limits_date ON rate_limits (date);
```

### 3.5 Quartz Tables

```sql
-- Migration: 005_create_quartz_tables.sql
-- Download from: https://github.com/quartznet/quartznet/blob/main/database/tables/tables_postgres.sql
-- Run the full script (~200 lines)
```

---

## 4. Phase 1: Project Setup

### 4.1 Packages

```bash
dotnet add package Quartz                      # Core only, NOT Quartz.Extensions.Hosting
dotnet add package Quartz.Serialization.Json
dotnet add package Npgsql
dotnet add package Dapper
dotnet add package NodaTime
dotnet add package Polly
dotnet add package Serilog.Extensions.Hosting
```

**Note**: We use `Quartz` only, NOT `Quartz.Extensions.Hosting`. We manage lifecycle manually.

### 4.2 Configuration

```csharp
// Configuration/WorkerOptions.cs
namespace PublyApp.Worker.Configuration;

public class WorkerOptions
{
    public long AdvisoryLockId { get; set; } = 424242;
    public string InstanceId { get; set; } = Environment.MachineName;
    public JobQueueOptions JobQueue { get; set; } = new();
    public DispatchOptions Dispatch { get; set; } = new();
}

public class JobQueueOptions
{
    public int PollingIntervalMs { get; set; } = 1000;
    public int BatchSize { get; set; } = 20;
    public int MaxConcurrency { get; set; } = 10;
    public int LeaseSeconds { get; set; } = 300;        // 5 minutes
    public int HeartbeatIntervalSeconds { get; set; } = 60;  // Extend lease every 60s
}

public class DispatchOptions
{
    public int BatchSize { get; set; } = 100;
    public int IntervalSeconds { get; set; } = 15;
}
```

---

## 5. Phase 2: Quartz with Manual Lifecycle

### 5.1 Scheduler Leader Service (Corrected)

```csharp
// Leadership/SchedulerLeaderService.cs
namespace PublyApp.Worker.Leadership;

using Microsoft.Extensions.Options;
using Npgsql;
using PublyApp.Worker.Configuration;
using PublyApp.Worker.Scheduling;
using Quartz;
using Quartz.Impl;
using Quartz.Spi;

/// <summary>
/// Manages Quartz scheduler lifecycle with PostgreSQL advisory lock for leader election.
///
/// KEY CHANGE FROM v2: We do NOT use QuartzHostedService.
/// This service creates and manages the scheduler directly, ensuring it only
/// starts AFTER we acquire the advisory lock.
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
        // Open dedicated connection for advisory lock
        _lockConnection = await _dataSource.OpenConnectionAsync(ct);

        try
        {
            // Try to acquire advisory lock (non-blocking)
            await using var cmd = _lockConnection.CreateCommand();
            cmd.CommandText = "SELECT pg_try_advisory_lock(@lockId)";
            cmd.Parameters.AddWithValue("lockId", _options.AdvisoryLockId);

            var acquired = (bool)(await cmd.ExecuteScalarAsync(ct))!;

            if (acquired)
            {
                await RunAsLeaderAsync(ct);
            }
            else
            {
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
        _isLeader = true;
        _logger.LogInformation("Acquired leadership. Creating Quartz scheduler...");

        // CREATE SCHEDULER MANUALLY (not via DI/hosted service)
        _scheduler = await CreateSchedulerAsync();

        // Register jobs
        await RegisterJobsAsync(_scheduler, ct);

        // START SCHEDULER (only now, after lock acquired)
        await _scheduler.Start(ct);
        _logger.LogInformation("Quartz scheduler started as leader");

        // Hold leadership until cancellation or connection loss
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), ct);

                // Verify connection still alive
                if (_lockConnection?.State != System.Data.ConnectionState.Open)
                {
                    _logger.LogWarning("Lock connection lost");
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
        _isLeader = false;
        _logger.LogInformation("Another instance is leader. Running as follower.");

        // Close connection (we don't hold lock)
        await _lockConnection!.DisposeAsync();
        _lockConnection = null;

        // Wait before retrying
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

        // Set up DI job factory
        scheduler.JobFactory = new ServiceProviderJobFactory(_services);

        return scheduler;
    }

    private async Task RegisterJobsAsync(IScheduler scheduler, CancellationToken ct)
    {
        // DispatchDuePostsJob - every 15 seconds
        var dispatchJob = JobBuilder.Create<DispatchDuePostsJob>()
            .WithIdentity("dispatch-due-posts", "scheduling")
            .Build();

        var dispatchTrigger = TriggerBuilder.Create()
            .WithIdentity("dispatch-due-posts-trigger", "scheduling")
            .WithSimpleSchedule(x => x
                .WithIntervalInSeconds(_options.Dispatch.IntervalSeconds)
                .RepeatForever())
            .StartNow()
            .Build();

        if (!await scheduler.CheckExists(dispatchJob.Key, ct))
        {
            await scheduler.ScheduleJob(dispatchJob, dispatchTrigger, ct);
        }

        // RecoverStaleJobsJob - every 5 minutes
        var recoverJob = JobBuilder.Create<RecoverStaleJobsJob>()
            .WithIdentity("recover-stale-jobs", "scheduling")
            .Build();

        var recoverTrigger = TriggerBuilder.Create()
            .WithIdentity("recover-stale-jobs-trigger", "scheduling")
            .WithCronSchedule("0 */5 * * * ?")
            .Build();

        if (!await scheduler.CheckExists(recoverJob.Key, ct))
        {
            await scheduler.ScheduleJob(recoverJob, recoverTrigger, ct);
        }

        // Add other system jobs similarly...
        await RegisterSystemJobsAsync(scheduler, ct);
    }

    private async Task RegisterSystemJobsAsync(IScheduler scheduler, CancellationToken ct)
    {
        // Session cleanup - hourly
        await RegisterJobIfNotExistsAsync<SessionCleanupJob>(
            scheduler, "session-cleanup", "system", "0 0 * * * ?", ct);

        // Token refresh - every 6 hours
        await RegisterJobIfNotExistsAsync<RefreshExpiringTokensJob>(
            scheduler, "refresh-tokens", "system", "0 0 */6 * * ?", ct);

        // Validate posts - daily at 6 AM
        await RegisterJobIfNotExistsAsync<ValidateScheduledPostsJob>(
            scheduler, "validate-posts", "system", "0 0 6 * * ?", ct);

        // Cleanup old jobs - daily at 3 AM
        await RegisterJobIfNotExistsAsync<CleanupOldJobsJob>(
            scheduler, "cleanup-old-jobs", "system", "0 0 3 * * ?", ct);
    }

    private async Task RegisterJobIfNotExistsAsync<TJob>(
        IScheduler scheduler,
        string name,
        string group,
        string cron,
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
            .WithCronSchedule(cron)
            .Build();

        await scheduler.ScheduleJob(job, trigger, ct);
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
            }
            catch { /* Connection may already be closed */ }
            finally
            {
                await _lockConnection.DisposeAsync();
                _lockConnection = null;
            }
        }

        _logger.LogInformation("Leadership released");
    }
}

/// <summary>
/// Simple job factory that resolves jobs from DI container
/// </summary>
public class ServiceProviderJobFactory : IJobFactory
{
    private readonly IServiceProvider _services;

    public ServiceProviderJobFactory(IServiceProvider services)
    {
        _services = services;
    }

    public IJob NewJob(TriggerFiredBundle bundle, IScheduler scheduler)
    {
        using var scope = _services.CreateScope();
        return (IJob)scope.ServiceProvider.GetRequiredService(bundle.JobDetail.JobType);
    }

    public void ReturnJob(IJob job)
    {
        (job as IDisposable)?.Dispose();
    }
}
```

### 5.2 Dispatch Due Posts Job (Idempotent)

```csharp
// Scheduling/DispatchDuePostsJob.cs
namespace PublyApp.Worker.Scheduling;

using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using PublyApp.Worker.Configuration;
using Quartz;

[DisallowConcurrentExecution]
public class DispatchDuePostsJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<DispatchDuePostsJob> _logger;
    private readonly int _batchSize;

    public DispatchDuePostsJob(
        NpgsqlDataSource dataSource,
        IOptions<WorkerOptions> options,
        ILogger<DispatchDuePostsJob> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
        _batchSize = options.Value.Dispatch.BatchSize;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        try
        {
            // Claim due posts
            var duePosts = await conn.QueryAsync<DuePostDto>(
                """
                SELECT id, tenant_id, social_account_id
                FROM scheduled_posts
                WHERE status = 'scheduled'
                AND publish_at_utc <= now()
                ORDER BY publish_at_utc
                FOR UPDATE SKIP LOCKED
                LIMIT @batchSize
                """,
                new { batchSize = _batchSize },
                transaction: tx);

            var posts = duePosts.ToList();
            if (posts.Count == 0)
            {
                await tx.RollbackAsync(ct);
                return;
            }

            foreach (var post in posts)
            {
                var jobId = Guid.NewGuid();
                var payload = JsonSerializer.Serialize(new PublishPostPayload
                {
                    ScheduledPostId = post.Id,
                    TenantId = post.TenantId,
                    SocialAccountId = post.SocialAccountId
                });

                // INSERT job (idempotent via unique constraint)
                // If job already exists for this post, this is a no-op
                var inserted = await conn.ExecuteAsync(
                    """
                    INSERT INTO job_queue (id, job_type, correlation_id, tenant_id, payload)
                    VALUES (@jobId, 'publish_post', @correlationId, @tenantId, @payload::jsonb)
                    ON CONFLICT (job_type, correlation_id)
                    WHERE job_type = 'publish_post' AND correlation_id IS NOT NULL
                    DO NOTHING
                    """,
                    new
                    {
                        jobId,
                        correlationId = post.Id,
                        tenantId = post.TenantId,
                        payload
                    },
                    transaction: tx);

                if (inserted > 0)
                {
                    // Update post status and link to job
                    await conn.ExecuteAsync(
                        """
                        UPDATE scheduled_posts
                        SET status = 'queued', job_queue_id = @jobId, updated_at = now()
                        WHERE id = @postId
                        """,
                        new { postId = post.Id, jobId },
                        transaction: tx);
                }
                // If insert was no-op (job exists), post might already be queued - that's fine
            }

            await tx.CommitAsync(ct);
            _logger.LogInformation("Dispatched {Count} posts to job queue", posts.Count);
        }
        catch (Exception ex)
        {
            await tx.RollbackAsync(ct);
            _logger.LogError(ex, "Error dispatching due posts");
            throw;
        }
    }

    private class DuePostDto
    {
        public Guid Id { get; set; }
        public Guid TenantId { get; set; }
        public Guid SocialAccountId { get; set; }
    }

    public class PublishPostPayload
    {
        public Guid ScheduledPostId { get; set; }
        public Guid TenantId { get; set; }
        public Guid SocialAccountId { get; set; }
    }
}
```

### 5.3 Recover Stale Jobs (Lease-based)

```csharp
// Scheduling/RecoverStaleJobsJob.cs
namespace PublyApp.Worker.Scheduling;

using Dapper;
using Npgsql;
using Quartz;

[DisallowConcurrentExecution]
public class RecoverStaleJobsJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<RecoverStaleJobsJob> _logger;

    public RecoverStaleJobsJob(
        NpgsqlDataSource dataSource,
        ILogger<RecoverStaleJobsJob> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Recover jobs with EXPIRED LEASES only
        // This is the key difference from v2: we check locked_until, not just claimed_at
        var recovered = await conn.ExecuteAsync(
            """
            UPDATE job_queue
            SET status = 'pending',
                locked_until = NULL,
                locked_by = NULL,
                attempts = attempts + 1,
                last_error = 'Recovered: lease expired without completion',
                run_after = now()
            WHERE status = 'processing'
            AND locked_until < now()  -- Lease expired
            """);

        if (recovered > 0)
        {
            _logger.LogWarning("Recovered {Count} jobs with expired leases", recovered);
        }

        // Also recover orphaned posts (queued but job was deleted/failed)
        var orphanedPosts = await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'scheduled',
                job_queue_id = NULL,
                updated_at = now()
            WHERE status = 'queued'
            AND job_queue_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM job_queue WHERE id = scheduled_posts.job_queue_id)
            """);

        if (orphanedPosts > 0)
        {
            _logger.LogWarning("Recovered {Count} orphaned posts (job was deleted)", orphanedPosts);
        }
    }
}
```

---

## 6. Phase 3: Job Queue Processor (with Leases)

```csharp
// Queue/JobQueueProcessor.cs
namespace PublyApp.Worker.Queue;

using System.Diagnostics;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using PublyApp.Worker.Configuration;
using PublyApp.Worker.Services;

public class JobQueueProcessor : BackgroundService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly IServiceProvider _services;
    private readonly JobHandlerRegistry _registry;
    private readonly DeadLetterService _dlqService;
    private readonly ILogger<JobQueueProcessor> _logger;
    private readonly WorkerOptions _options;
    private readonly SemaphoreSlim _semaphore;

    public JobQueueProcessor(
        NpgsqlDataSource dataSource,
        IServiceProvider services,
        JobHandlerRegistry registry,
        DeadLetterService dlqService,
        IOptions<WorkerOptions> options,
        ILogger<JobQueueProcessor> logger)
    {
        _dataSource = dataSource;
        _services = services;
        _registry = registry;
        _dlqService = dlqService;
        _logger = logger;
        _options = options.Value;
        _semaphore = new SemaphoreSlim(_options.JobQueue.MaxConcurrency);
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation(
            "JobQueueProcessor started. Instance: {Instance}, Concurrency: {Concurrency}",
            _options.InstanceId, _options.JobQueue.MaxConcurrency);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                var claimed = await ClaimAndProcessBatchAsync(ct);
                if (claimed == 0)
                {
                    await Task.Delay(_options.JobQueue.PollingIntervalMs, ct);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in processor loop");
                await Task.Delay(5000, ct);
            }
        }

        // Wait for in-flight jobs
        _logger.LogInformation("Waiting for in-flight jobs to complete...");
        for (int i = 0; i < _options.JobQueue.MaxConcurrency; i++)
        {
            await _semaphore.WaitAsync(TimeSpan.FromSeconds(60));
        }
        _logger.LogInformation("JobQueueProcessor stopped");
    }

    private async Task<int> ClaimAndProcessBatchAsync(CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var leaseSeconds = _options.JobQueue.LeaseSeconds;

        // CLAIM WITH LEASE
        var jobs = await conn.QueryAsync<JobDto>(
            """
            UPDATE job_queue
            SET status = 'processing',
                locked_until = now() + @leaseSeconds * INTERVAL '1 second',
                locked_by = @instanceId
            WHERE id IN (
                SELECT id FROM job_queue
                WHERE status = 'pending'
                AND run_after <= now()
                ORDER BY run_after, created_at
                FOR UPDATE SKIP LOCKED
                LIMIT @batchSize
            )
            RETURNING id, job_type, correlation_id, tenant_id, payload, attempts, max_attempts
            """,
            new
            {
                leaseSeconds,
                instanceId = _options.InstanceId,
                batchSize = _options.JobQueue.BatchSize
            });

        var jobList = jobs.ToList();
        if (jobList.Count == 0) return 0;

        _logger.LogDebug("Claimed {Count} jobs", jobList.Count);

        // Process with semaphore for concurrency control
        var tasks = jobList.Select(j => ProcessWithSemaphoreAsync(j, ct));
        await Task.WhenAll(tasks);

        return jobList.Count;
    }

    private async Task ProcessWithSemaphoreAsync(JobDto job, CancellationToken ct)
    {
        await _semaphore.WaitAsync(ct);
        try
        {
            await ProcessJobAsync(job, ct);
        }
        finally
        {
            _semaphore.Release();
        }
    }

    private async Task ProcessJobAsync(JobDto job, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var heartbeatTask = RunHeartbeatAsync(job.Id, cts.Token);

        var sw = Stopwatch.StartNew();

        using var logScope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["JobId"] = job.Id,
            ["JobType"] = job.JobType,
            ["Attempt"] = job.Attempts + 1
        });

        try
        {
            var handlerType = _registry.GetHandlerType(job.JobType);
            if (handlerType == null)
            {
                await FailJobToDlqAsync(job, $"No handler for job type: {job.JobType}");
                return;
            }

            using var scope = _services.CreateScope();
            var handler = (IJobHandler)scope.ServiceProvider.GetRequiredService(handlerType);

            var context = new JobContext
            {
                JobId = job.Id,
                CorrelationId = job.CorrelationId,
                TenantId = job.TenantId,
                Payload = job.Payload,
                Attempt = job.Attempts + 1,
                MaxAttempts = job.MaxAttempts
            };

            await handler.HandleAsync(context, ct);

            // SUCCESS: Delete job
            await DeleteJobAsync(job.Id);

            _logger.LogInformation("Job completed in {Ms}ms", sw.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Shutdown - leave job for another worker (lease will expire)
            _logger.LogWarning("Job interrupted by shutdown, will be recovered");
            throw;
        }
        catch (Exception ex)
        {
            await HandleJobFailureAsync(job, ex);
        }
        finally
        {
            cts.Cancel(); // Stop heartbeat
            try { await heartbeatTask; } catch { }
        }
    }

    private async Task RunHeartbeatAsync(Guid jobId, CancellationToken ct)
    {
        var interval = TimeSpan.FromSeconds(_options.JobQueue.HeartbeatIntervalSeconds);
        var extension = TimeSpan.FromSeconds(_options.JobQueue.LeaseSeconds);

        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(interval, ct);

            try
            {
                await using var conn = await _dataSource.OpenConnectionAsync(ct);
                await conn.ExecuteAsync(
                    """
                    UPDATE job_queue
                    SET locked_until = now() + @extensionSeconds * INTERVAL '1 second'
                    WHERE id = @jobId AND status = 'processing'
                    """,
                    new { jobId, extensionSeconds = (int)extension.TotalSeconds });
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _logger.LogWarning(ex, "Heartbeat failed for job {JobId}", jobId);
            }
        }
    }

    private async Task HandleJobFailureAsync(JobDto job, Exception ex)
    {
        var newAttempts = job.Attempts + 1;

        _logger.LogError(ex, "Job failed on attempt {Attempt}/{Max}",
            newAttempts, job.MaxAttempts);

        if (newAttempts >= job.MaxAttempts)
        {
            await FailJobToDlqAsync(job, ex.Message);
        }
        else
        {
            // Exponential backoff: 5s, 30s, 2min, 10min
            var delays = new[] { 5, 30, 120, 600 };
            var delaySec = delays[Math.Min(newAttempts - 1, delays.Length - 1)];

            await using var conn = await _dataSource.OpenConnectionAsync();
            await conn.ExecuteAsync(
                """
                UPDATE job_queue
                SET status = 'pending',
                    locked_until = NULL,
                    locked_by = NULL,
                    attempts = @attempts,
                    last_error = @error,
                    run_after = now() + @delaySec * INTERVAL '1 second'
                WHERE id = @jobId
                """,
                new
                {
                    jobId = job.Id,
                    attempts = newAttempts,
                    error = ex.Message,
                    delaySec
                });
        }
    }

    private async Task FailJobToDlqAsync(JobDto job, string reason)
    {
        await _dlqService.MoveToDeadLetterAsync(
            job.Id, job.JobType, job.CorrelationId, job.TenantId,
            job.Payload, job.Attempts + 1, job.LastError, reason);

        await DeleteJobAsync(job.Id);

        _logger.LogError("Job moved to DLQ: {Reason}", reason);
    }

    private async Task DeleteJobAsync(Guid jobId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync("DELETE FROM job_queue WHERE id = @jobId", new { jobId });
    }

    private class JobDto
    {
        public Guid Id { get; set; }
        public string JobType { get; set; } = null!;
        public Guid? CorrelationId { get; set; }
        public Guid? TenantId { get; set; }
        public string Payload { get; set; } = null!;
        public int Attempts { get; set; }
        public int MaxAttempts { get; set; }
        public string? LastError { get; set; }
    }
}
```

---

## 7. Phase 4: Job Handlers (Unified Retry Authority)

### 7.1 Handler Interface

```csharp
// Queue/IJobHandler.cs
namespace PublyApp.Worker.Queue;

public interface IJobHandler
{
    string JobType { get; }
    Task HandleAsync(JobContext context, CancellationToken ct);
}

public class JobContext
{
    public required Guid JobId { get; init; }
    public required Guid? CorrelationId { get; init; }
    public required Guid? TenantId { get; init; }
    public required string Payload { get; init; }
    public required int Attempt { get; init; }
    public required int MaxAttempts { get; init; }

    public bool IsLastAttempt => Attempt >= MaxAttempts;
}
```

### 7.2 Publish Post Handler (Corrected)

```csharp
// Handlers/PublishPostHandler.cs
namespace PublyApp.Worker.Handlers;

using System.Text.Json;
using Dapper;
using Npgsql;
using PublyApp.Worker.Queue;
using PublyApp.Worker.Scheduling;
using PublyApp.Worker.Services;

public class PublishPostHandler : IJobHandler
{
    public string JobType => "publish_post";

    private readonly NpgsqlDataSource _dataSource;
    private readonly ISocialMediaClientFactory _clientFactory;
    private readonly IOAuthService _oauthService;
    private readonly RateLimitService _rateLimitService;
    private readonly ILogger<PublishPostHandler> _logger;

    public PublishPostHandler(
        NpgsqlDataSource dataSource,
        ISocialMediaClientFactory clientFactory,
        IOAuthService oauthService,
        RateLimitService rateLimitService,
        ILogger<PublishPostHandler> logger)
    {
        _dataSource = dataSource;
        _clientFactory = clientFactory;
        _oauthService = oauthService;
        _rateLimitService = rateLimitService;
        _logger = logger;
    }

    public async Task HandleAsync(JobContext context, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<DispatchDuePostsJob.PublishPostPayload>(context.Payload)!;
        var postId = payload.ScheduledPostId;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Load post + account
        var post = await conn.QuerySingleOrDefaultAsync<PostDto>(
            """
            SELECT
                p.id, p.tenant_id, p.social_account_id, p.content, p.media_urls,
                p.status, p.platform_post_id,
                a.platform, a.access_token, a.refresh_token, a.token_expires_at
            FROM scheduled_posts p
            JOIN social_accounts a ON a.id = p.social_account_id
            WHERE p.id = @postId
            """,
            new { postId });

        if (post == null)
        {
            _logger.LogWarning("Post {PostId} not found", postId);
            return; // Complete job - nothing to do
        }

        // === IDEMPOTENCY CHECKS ===

        // 1. Already published
        if (post.Status == "published")
        {
            _logger.LogInformation("Post {PostId} already published", postId);
            await ClearJobLinkAsync(conn, postId);
            return;
        }

        // 2. Partial success: API worked, DB update failed
        if (!string.IsNullOrEmpty(post.PlatformPostId))
        {
            _logger.LogWarning("Post {PostId} has platform_post_id, marking published", postId);
            await MarkPublishedAsync(conn, postId, post.PlatformPostId, null);
            return;
        }

        // 3. Cancelled
        if (post.Status == "cancelled")
        {
            _logger.LogInformation("Post {PostId} cancelled", postId);
            await ClearJobLinkAsync(conn, postId);
            return;
        }

        // === RATE LIMIT CHECK ===
        if (!await _rateLimitService.TryConsumeAsync(post.SocialAccountId, post.Platform, ct))
        {
            // INTENTIONAL RESCHEDULE: Push to tomorrow
            _logger.LogWarning("Rate limit exceeded, rescheduling to tomorrow");
            await ReschedulePostAsync(conn, postId, TimeSpan.FromDays(1));
            return; // Complete this job - a new one will be created
        }

        // === TOKEN REFRESH ===
        if (post.TokenExpiresAt < DateTime.UtcNow.AddMinutes(5))
        {
            try
            {
                var newToken = await _oauthService.RefreshTokenAsync(post.SocialAccountId, post.RefreshToken, ct);
                post.AccessToken = newToken.AccessToken;

                await conn.ExecuteAsync(
                    """
                    UPDATE social_accounts
                    SET access_token = @token, token_expires_at = @expires, last_token_refresh_at = now()
                    WHERE id = @accountId
                    """,
                    new { accountId = post.SocialAccountId, token = newToken.AccessToken, expires = newToken.ExpiresAt });
            }
            catch (OAuthException ex)
            {
                // PERMANENT FAILURE: Token can't be refreshed
                await MarkFailedAsync(conn, postId, $"Token refresh failed: {ex.Message}");
                return; // Don't throw - this is a terminal failure
            }
        }

        // === MARK PROCESSING ===
        await conn.ExecuteAsync(
            "UPDATE scheduled_posts SET status = 'processing', updated_at = now() WHERE id = @postId",
            new { postId });

        // === CALL EXTERNAL API ===
        try
        {
            var client = _clientFactory.GetClient(post.Platform);
            var idempotencyKey = $"publyapp:{postId}";  // STABLE KEY

            var result = await client.PublishAsync(
                post.AccessToken,
                post.Content,
                post.MediaUrls,
                idempotencyKey,
                ct);

            // CHECKPOINT: Save platform_post_id IMMEDIATELY
            await conn.ExecuteAsync(
                "UPDATE scheduled_posts SET platform_post_id = @platformPostId, updated_at = now() WHERE id = @postId",
                new { postId, platformPostId = result.PostId });

            // Full success
            await MarkPublishedAsync(conn, postId, result.PostId, result.PostUrl);

            _logger.LogInformation("Published post {PostId} as {PlatformPostId}", postId, result.PostId);
        }
        catch (PlatformRateLimitException ex)
        {
            // INTENTIONAL RESCHEDULE: Platform says wait
            var retryAfter = ex.RetryAfter ?? TimeSpan.FromMinutes(15);
            _logger.LogWarning("Platform rate limit, rescheduling in {Minutes}min", retryAfter.TotalMinutes);
            await ReschedulePostAsync(conn, postId, retryAfter);
            // Don't throw - this job is done, new job will be created when dispatch runs again
        }
        catch (Exception ex)
        {
            // TRANSIENT ERROR: Let job queue retry
            // We do NOT update scheduled_posts status here (it stays 'processing')
            // The job queue will retry, and if it fails permanently, the DLQ handler updates the post
            _logger.LogError(ex, "Transient error publishing post");
            throw; // Job queue handles retry
        }
    }

    private async Task MarkPublishedAsync(NpgsqlConnection conn, Guid postId, string platformPostId, string? platformUrl)
    {
        await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'published',
                platform_post_id = @platformPostId,
                platform_url = @platformUrl,
                published_at = now(),
                job_queue_id = NULL,
                updated_at = now()
            WHERE id = @postId
            """,
            new { postId, platformPostId, platformUrl });
    }

    private async Task MarkFailedAsync(NpgsqlConnection conn, Guid postId, string reason)
    {
        await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'failed',
                failure_reason = @reason,
                failed_at = now(),
                job_queue_id = NULL,
                updated_at = now()
            WHERE id = @postId
            """,
            new { postId, reason });
    }

    private async Task ReschedulePostAsync(NpgsqlConnection conn, Guid postId, TimeSpan delay)
    {
        // Set back to scheduled with new publish time
        // The job will be deleted, and DispatchDuePostsJob will create a new one
        await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'scheduled',
                publish_at_utc = now() + @delaySec * INTERVAL '1 second',
                job_queue_id = NULL,
                updated_at = now()
            WHERE id = @postId
            """,
            new { postId, delaySec = (int)delay.TotalSeconds });
    }

    private async Task ClearJobLinkAsync(NpgsqlConnection conn, Guid postId)
    {
        await conn.ExecuteAsync(
            "UPDATE scheduled_posts SET job_queue_id = NULL, updated_at = now() WHERE id = @postId",
            new { postId });
    }

    private class PostDto
    {
        public Guid Id { get; set; }
        public Guid TenantId { get; set; }
        public Guid SocialAccountId { get; set; }
        public string Content { get; set; } = null!;
        public string[] MediaUrls { get; set; } = Array.Empty<string>();
        public string Status { get; set; } = null!;
        public string? PlatformPostId { get; set; }
        public string Platform { get; set; } = null!;
        public string AccessToken { get; set; } = null!;
        public string RefreshToken { get; set; } = null!;
        public DateTime? TokenExpiresAt { get; set; }
    }
}
```

### 7.3 Rate Limit Service (Corrected)

```csharp
// Services/RateLimitService.cs
namespace PublyApp.Worker.Services;

using Dapper;
using Npgsql;

public class RateLimitService
{
    private readonly NpgsqlDataSource _dataSource;

    private static readonly Dictionary<string, int> Limits = new(StringComparer.OrdinalIgnoreCase)
    {
        ["linkedin"] = 100,
        ["twitter"] = 200,
        ["facebook"] = 200,
        ["instagram"] = 25
    };

    public RateLimitService(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    /// <summary>
    /// Atomically checks and consumes a rate limit slot.
    /// Returns true if allowed, false if rate limited.
    /// </summary>
    public async Task<bool> TryConsumeAsync(Guid accountId, string platform, CancellationToken ct = default)
    {
        var limit = Limits.GetValueOrDefault(platform.ToLower(), 50);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Simple approach: upsert and return new count
        var newCount = await conn.QuerySingleAsync<int>(
            """
            INSERT INTO rate_limits (social_account_id, platform, date, request_count)
            VALUES (@accountId, @platform, @date, 1)
            ON CONFLICT (social_account_id, platform, date)
            DO UPDATE SET request_count = rate_limits.request_count + 1, updated_at = now()
            RETURNING request_count
            """,
            new { accountId, platform = platform.ToLower(), date = today });

        // Check AFTER increment (pessimistic)
        return newCount <= limit;
    }
}
```

---

## 8. Phase 5: System Jobs

```csharp
// SystemJobs/SessionCleanupJob.cs
[DisallowConcurrentExecution]
public class SessionCleanupJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<SessionCleanupJob> _logger;

    public SessionCleanupJob(NpgsqlDataSource dataSource, ILogger<SessionCleanupJob> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(context.CancellationToken);
        var deleted = await conn.ExecuteAsync("DELETE FROM sessions WHERE expires_at < now()");
        _logger.LogInformation("Deleted {Count} expired sessions", deleted);
    }
}
```

```csharp
// SystemJobs/CleanupOldJobsJob.cs
[DisallowConcurrentExecution]
public class CleanupOldJobsJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<CleanupOldJobsJob> _logger;

    public CleanupOldJobsJob(NpgsqlDataSource dataSource, ILogger<CleanupOldJobsJob> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(context.CancellationToken);

        // Delete old rate limits
        var rateLimits = await conn.ExecuteAsync(
            "DELETE FROM rate_limits WHERE date < CURRENT_DATE - INTERVAL '30 days'");

        // Delete resolved DLQ entries older than 90 days
        var dlq = await conn.ExecuteAsync(
            "DELETE FROM dead_letter_jobs WHERE resolved_at < now() - INTERVAL '90 days'");

        _logger.LogInformation("Cleanup: {RateLimits} rate_limits, {Dlq} resolved DLQ entries", rateLimits, dlq);
    }
}
```

---

## 9. Phase 6: API Integration

```csharp
// In PublyApp.Api/Services/PostSchedulingService.cs

public class PostSchedulingService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly IDateTimeZoneProvider _tzProvider;

    public PostSchedulingService(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
        _tzProvider = DateTimeZoneProviders.Tzdb;
    }

    public async Task<Guid> SchedulePostAsync(
        Guid tenantId,
        Guid socialAccountId,
        string content,
        string[] mediaUrls,
        DateTime publishAtLocal,
        string timeZoneId,
        CancellationToken ct = default)
    {
        var tz = _tzProvider.GetZoneOrNull(timeZoneId)
            ?? throw new ArgumentException($"Invalid timezone: {timeZoneId}");

        var publishAtUtc = LocalDateTime.FromDateTime(publishAtLocal)
            .InZoneLeniently(tz)
            .ToInstant()
            .ToDateTimeUtc();

        if (publishAtUtc <= DateTime.UtcNow)
            throw new ArgumentException("Publish time must be in the future");

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        return await conn.QuerySingleAsync<Guid>(
            """
            INSERT INTO scheduled_posts (tenant_id, social_account_id, content, media_urls, publish_at_utc, user_timezone_id, status)
            VALUES (@tenantId, @socialAccountId, @content, @mediaUrls, @publishAtUtc, @timeZoneId, 'scheduled')
            RETURNING id
            """,
            new { tenantId, socialAccountId, content, mediaUrls, publishAtUtc, timeZoneId });
    }

    public async Task CancelPostAsync(Guid postId, Guid tenantId, CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Delete any pending job first
        await conn.ExecuteAsync(
            """
            DELETE FROM job_queue
            WHERE correlation_id = @postId AND job_type = 'publish_post'
            """,
            new { postId });

        var updated = await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'cancelled', job_queue_id = NULL, updated_at = now()
            WHERE id = @postId AND tenant_id = @tenantId
            AND status IN ('scheduled', 'queued')
            """,
            new { postId, tenantId });

        if (updated == 0)
            throw new InvalidOperationException("Post cannot be cancelled");
    }
}
```

---

## 10. Phase 7: Observability

### Health Checks

```csharp
// Monitoring/JobQueueHealthCheck.cs
public class JobQueueHealthCheck : IHealthCheck
{
    private readonly NpgsqlDataSource _dataSource;

    public JobQueueHealthCheck(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var stats = await conn.QuerySingleAsync<dynamic>(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing' AND locked_until < now()) as stale_leases,
                (SELECT COUNT(*) FROM dead_letter_jobs WHERE resolved_at IS NULL) as unresolved_dlq
            FROM job_queue
            """);

        var data = new Dictionary<string, object>
        {
            ["Pending"] = (int)stats.pending,
            ["StaleLeases"] = (int)stats.stale_leases,
            ["UnresolvedDLQ"] = (int)stats.unresolved_dlq
        };

        if (stats.stale_leases > 5)
            return HealthCheckResult.Degraded("High stale leases", data: data);

        if (stats.unresolved_dlq > 0)
            return HealthCheckResult.Degraded("Unresolved DLQ jobs", data: data);

        return HealthCheckResult.Healthy("OK", data);
    }
}
```

---

## 11. Phase 8: Deployment

### Program.cs

```csharp
var builder = Host.CreateApplicationBuilder(args);

// Config
builder.Services.Configure<WorkerOptions>(builder.Configuration.GetSection("Worker"));
var connString = builder.Configuration.GetConnectionString("DefaultConnection")!;

// Database
builder.Services.AddNpgsqlDataSource(connString);

// Services
builder.Services.AddSingleton<DeadLetterService>();
builder.Services.AddSingleton<RateLimitService>();

// Handler registry
var registry = new JobHandlerRegistry();
registry.Register<PublishPostHandler>("publish_post");
builder.Services.AddSingleton(registry);
builder.Services.AddScoped<PublishPostHandler>();

// Quartz jobs (resolved by ServiceProviderJobFactory)
builder.Services.AddScoped<DispatchDuePostsJob>();
builder.Services.AddScoped<RecoverStaleJobsJob>();
builder.Services.AddScoped<SessionCleanupJob>();
builder.Services.AddScoped<RefreshExpiringTokensJob>();
builder.Services.AddScoped<ValidateScheduledPostsJob>();
builder.Services.AddScoped<CleanupOldJobsJob>();

// Background services
builder.Services.AddSingleton<SchedulerLeaderService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SchedulerLeaderService>());
builder.Services.AddHostedService<JobQueueProcessor>();

// Health checks
builder.Services.AddHealthChecks()
    .AddNpgSql(connString)
    .AddCheck<JobQueueHealthCheck>("job_queue");

var host = builder.Build();
await host.RunAsync();
```

### Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: publyapp
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: publyapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U publyapp"]
      interval: 10s
      timeout: 5s
      retries: 5

  worker-1:
    build:
      context: .
      dockerfile: src/PublyApp.Worker/Dockerfile
    environment:
      - ConnectionStrings__DefaultConnection=Host=postgres;Database=publyapp;Username=publyapp;Password=${DB_PASSWORD}
      - Worker__InstanceId=worker-1
    depends_on:
      postgres:
        condition: service_healthy
    stop_grace_period: 90s

  worker-2:
    build:
      context: .
      dockerfile: src/PublyApp.Worker/Dockerfile
    environment:
      - ConnectionStrings__DefaultConnection=Host=postgres;Database=publyapp;Username=publyapp;Password=${DB_PASSWORD}
      - Worker__InstanceId=worker-2
    depends_on:
      postgres:
        condition: service_healthy
    stop_grace_period: 90s

volumes:
  postgres_data:
```

---

## 12. Implementation Checklist

### Database
- [ ] Migration 001: `scheduled_posts` with `job_queue_id`
- [ ] Migration 002: `job_queue` with `locked_until`, `locked_by`, unique index
- [ ] Migration 003: `dead_letter_jobs`
- [ ] Migration 004: `rate_limits`
- [ ] Migration 005: Quartz tables (from GitHub)

### Core Infrastructure
- [ ] `SchedulerLeaderService` (manual Quartz lifecycle)
- [ ] `ServiceProviderJobFactory` (DI for Quartz jobs)
- [ ] `JobQueueProcessor` (lease-based claiming, heartbeat)
- [ ] `JobHandlerRegistry`
- [ ] `DeadLetterService`

### Quartz Jobs
- [ ] `DispatchDuePostsJob` (idempotent insert)
- [ ] `RecoverStaleJobsJob` (lease-based recovery)
- [ ] `SessionCleanupJob`
- [ ] `RefreshExpiringTokensJob`
- [ ] `ValidateScheduledPostsJob`
- [ ] `CleanupOldJobsJob`

### Handlers
- [ ] `PublishPostHandler` (unified retry, idempotency)
- [ ] `RateLimitService` (corrected RETURNING logic)

### Testing
- [ ] Test leader election (start 2 workers, verify only 1 runs Quartz)
- [ ] Test lease expiry (kill worker, verify job recovered)
- [ ] Test idempotency (duplicate dispatch, verify single job)
- [ ] Test DLQ flow (force max failures, verify DLQ entry)

---

## Summary of v3 Changes

| Issue | v2 | v3 |
|-------|----|----|
| Quartz startup | `StartDelay = null` (unreliable) | Manual create + start in leader service |
| Stale recovery | `claimed_at` check | `locked_until` lease check |
| Duplicate jobs | No guard | `UNIQUE (job_type, correlation_id)` |
| Retry authority | Mixed (handler + queue) | Job queue owns retries |
| Post ↔ Job link | None | `job_queue_id` on `scheduled_posts` |
| Rate limit RETURNING | Complex expression | Simple: return count, check in C# |
| State machine docs | `dead_letter` in job_queue | Clarified: DLQ is separate table |

---

*v3 Final — Ready for implementation*
