# PublyApp Background Jobs Infrastructure — Pure Postgres Edition (v2)

> **Architecture**: Quartz.NET + PostgreSQL job queue + SKIP LOCKED processing
>
> No RabbitMQ. No Redis. Just PostgreSQL.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [State Machine](#2-state-machine)
3. [Database Schema](#3-database-schema)
4. [Phase 1: Project Setup](#4-phase-1-project-setup)
5. [Phase 2: Quartz.NET with Leader Election](#5-phase-2-quartznet-with-leader-election)
6. [Phase 3: Job Queue Processor](#6-phase-3-job-queue-processor)
7. [Phase 4: Job Handlers](#7-phase-4-job-handlers)
8. [Phase 5: Scheduling Service (API Integration)](#8-phase-5-scheduling-service-api-integration)
9. [Phase 6: System Jobs](#9-phase-6-system-jobs)
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
│  │                    Quartz.NET Scheduler                                 │ │
│  │              (runs ONLY on leader instance)                             │ │
│  │                                                                         │ │
│  │  ┌─────────────────────┐    ┌────────────────────────────────────────┐ │ │
│  │  │ DispatchDuePostsJob │    │           System Jobs                   │ │ │
│  │  │ (every 15s)         │    │                                         │ │ │
│  │  │                     │    │  • SessionCleanupJob (hourly)           │ │ │
│  │  │ 1. Query due posts  │    │  • RefreshExpiringTokensJob (6h)        │ │ │
│  │  │ 2. Insert job_queue │    │  • RecoverStaleJobsJob (5min)           │ │ │
│  │  │ 3. Update status    │    │  • ValidateScheduledPostsJob (daily)    │ │ │
│  │  │    (scheduled→queued)│    │  • CleanupCompletedJobsJob (daily)      │ │ │
│  │  └─────────────────────┘    └────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                 JobQueueProcessor (BackgroundService)                   │ │
│  │                    (runs on ALL instances)                              │ │
│  │                                                                         │ │
│  │  while (!cancelled):                                                    │ │
│  │    1. SELECT ... FOR UPDATE SKIP LOCKED                                │ │
│  │    2. Execute handler based on job_type                                │ │
│  │    3. Update status (completed / failed / retry)                       │ │
│  │    4. Sleep if no jobs                                                 │ │
│  │                                                                         │ │
│  │  Handlers:                                                              │ │
│  │    • PublishPostHandler                                                │ │
│  │    • SendNotificationHandler                                           │ │
│  │    • ProcessWebhookHandler                                             │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL                                      │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
│  │  scheduled_posts  │  │    job_queue      │  │    rate_limits        │   │
│  │                   │  │                   │  │                       │   │
│  │  Source of truth  │  │  Work to be done  │  │  Per-account/day      │   │
│  │  for user posts   │  │  (all job types)  │  │  counters             │   │
│  └───────────────────┘  └───────────────────┘  └───────────────────────┘   │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐                              │
│  │  qrtz_* tables    │  │  dead_letter_jobs │                              │
│  │                   │  │                   │                              │
│  │  Quartz internal  │  │  Failed jobs for  │                              │
│  │  persistence      │  │  investigation    │                              │
│  └───────────────────┘  └───────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No RabbitMQ** | PostgreSQL handles your scale (1000+ msg/sec capacity, you need ~5) |
| **No Redis** | Rate limiting via Postgres table with atomic upsert |
| **Single job_queue table** | One place for all async work, simple to monitor |
| **Quartz only on leader** | Advisory lock prevents duplicate scheduling |
| **All workers process queue** | Horizontal scaling for job execution |
| **SKIP LOCKED** | Lock-free concurrent claiming, proven pattern |

### 1.3 Component Responsibilities

| Component | Runs On | Responsibility |
|-----------|---------|----------------|
| `SchedulerLeaderService` | All instances | Acquires advisory lock, starts Quartz on leader only |
| `Quartz.NET` | Leader only | Time-based triggers, enqueues work to job_queue |
| `JobQueueProcessor` | All instances | Claims and executes jobs from job_queue |
| `Job Handlers` | All instances | Actual business logic (publish post, send email, etc.) |

---

## 2. State Machine

### 2.1 Scheduled Posts State Machine

```
                    User creates post
                           │
                           ▼
                    ┌──────────────┐
                    │    draft     │
                    └──────┬───────┘
                           │ User schedules
                           ▼
                    ┌──────────────┐
          ┌─────────│  scheduled   │◄────────────────┐
          │         └──────┬───────┘                 │
          │                │ DispatchDuePostsJob     │
          │                │ (publish_at <= now)     │
          │                ▼                         │
          │         ┌──────────────┐                 │
          │         │    queued    │                 │
          │         └──────┬───────┘                 │
          │                │ JobQueueProcessor       │
          │                │ claims job              │
          │                ▼                         │
          │         ┌──────────────┐                 │
          │         │  processing  │─────────────────┤
          │         └──────┬───────┘    Transient    │
          │                │            failure      │
          │       ┌────────┴────────┐   (retry)      │
          │       │                 │                │
          │       ▼                 ▼                │
          │ ┌──────────┐     ┌──────────┐           │
          │ │ published│     │  failed  │           │
          │ └──────────┘     └──────────┘           │
          │                        │                 │
          │                        │ Manual retry    │
          │                        └─────────────────┘
          │
          │ User cancels
          ▼
   ┌──────────────┐
   │  cancelled   │
   └──────────────┘
```

### 2.2 Job Queue State Machine

```
     DispatchDuePostsJob / API call
                │
                ▼
         ┌──────────────┐
         │   pending    │◄───────────────────┐
         └──────┬───────┘                    │
                │ JobQueueProcessor          │
                │ claims (SKIP LOCKED)       │
                ▼                            │
         ┌──────────────┐                    │
         │  processing  │────────────────────┤
         └──────┬───────┘   Transient error  │
                │           (attempts < max) │
       ┌────────┴────────┐                   │
       │                 │                   │
       ▼                 ▼                   │
┌──────────────┐  ┌──────────────┐          │
│  completed   │  │ dead_letter  │          │
└──────────────┘  └──────────────┘          │
                   (attempts >= max)
```

### 2.3 State Transition Rules

| From State | To State | Trigger | Where |
|------------|----------|---------|-------|
| `draft` | `scheduled` | User schedules post | API |
| `scheduled` | `queued` | `publish_at <= now()` | DispatchDuePostsJob |
| `scheduled` | `cancelled` | User cancels | API |
| `queued` | `processing` | Worker claims job | JobQueueProcessor |
| `processing` | `published` | API call succeeds | PublishPostHandler |
| `processing` | `scheduled` | Transient error + retries left | PublishPostHandler |
| `processing` | `failed` | Max retries exceeded | PublishPostHandler |
| `processing` | `scheduled` | Stale (>10min) | RecoverStaleJobsJob |

---

## 3. Database Schema

### 3.1 Scheduled Posts Table

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

    -- Status tracking
    status post_status NOT NULL DEFAULT 'draft',
    queued_at TIMESTAMPTZ,           -- When moved to job_queue
    published_at TIMESTAMPTZ,        -- When actually published

    -- Platform response (for idempotency)
    platform_post_id VARCHAR(500),   -- Set IMMEDIATELY after API success
    platform_url TEXT,

    -- Error tracking
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    last_error TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT positive_retry_count CHECK (retry_count >= 0),
    CONSTRAINT valid_max_retries CHECK (max_retries > 0)
);

-- Index for DispatchDuePostsJob: find posts ready to be queued
CREATE INDEX idx_scheduled_posts_dispatch
    ON scheduled_posts (publish_at_utc)
    WHERE status = 'scheduled';

-- Index for user queries
CREATE INDEX idx_scheduled_posts_tenant_status
    ON scheduled_posts (tenant_id, status, publish_at_utc DESC);

-- Index for stale job recovery
CREATE INDEX idx_scheduled_posts_stale
    ON scheduled_posts (queued_at)
    WHERE status = 'processing';
```

### 3.2 Job Queue Table

```sql
-- Migration: 002_create_job_queue.sql

CREATE TYPE job_status AS ENUM (
    'pending',
    'processing',
    'completed'
);

CREATE TABLE job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job identification
    job_type VARCHAR(100) NOT NULL,      -- 'publish_post', 'send_notification', etc.

    -- Correlation (for tracing)
    correlation_id UUID,                  -- e.g., scheduled_post.id
    tenant_id UUID,

    -- Payload
    payload JSONB NOT NULL,

    -- Scheduling
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),  -- For delayed execution

    -- Status tracking
    status job_status NOT NULL DEFAULT 'pending',
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Retry handling
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_error TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT positive_attempts CHECK (attempts >= 0)
);

-- Primary index for claiming: pending jobs ready to run
CREATE INDEX idx_job_queue_claim
    ON job_queue (run_after, created_at)
    WHERE status = 'pending';

-- Index for monitoring by job type
CREATE INDEX idx_job_queue_type_status
    ON job_queue (job_type, status);

-- Index for correlation lookups
CREATE INDEX idx_job_queue_correlation
    ON job_queue (correlation_id)
    WHERE correlation_id IS NOT NULL;
```

### 3.3 Dead Letter Jobs Table

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
    failure_reason TEXT,

    -- Timestamps
    original_created_at TIMESTAMPTZ NOT NULL,
    moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Resolution tracking
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

-- Index for monitoring
CREATE INDEX idx_dead_letter_unresolved
    ON dead_letter_jobs (moved_at DESC)
    WHERE resolved_at IS NULL;

CREATE INDEX idx_dead_letter_job_type
    ON dead_letter_jobs (job_type, moved_at DESC)
    WHERE resolved_at IS NULL;
```

### 3.4 Rate Limits Table

```sql
-- Migration: 004_create_rate_limits.sql

CREATE TABLE rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Composite key for rate limiting
    social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    date DATE NOT NULL,

    -- Counter
    request_count INT NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique constraint for upsert
    CONSTRAINT uq_rate_limits_account_platform_date
        UNIQUE (social_account_id, platform, date)
);

-- Index for cleanup of old records
CREATE INDEX idx_rate_limits_date ON rate_limits (date);
```

### 3.5 Quartz Tables

```sql
-- Migration: 005_create_quartz_tables.sql
--
-- Download the official Quartz.NET PostgreSQL schema from:
-- https://github.com/quartznet/quartznet/blob/main/database/tables/tables_postgres.sql
--
-- Or run this condensed version:

-- Note: The full Quartz schema creates these tables:
-- qrtz_job_details, qrtz_triggers, qrtz_simple_triggers, qrtz_cron_triggers,
-- qrtz_simprop_triggers, qrtz_blob_triggers, qrtz_calendars, qrtz_paused_trigger_grps,
-- qrtz_fired_triggers, qrtz_scheduler_state, qrtz_locks

-- IMPORTANT: Download and run the full schema from the Quartz.NET repository
-- The schema is ~200 lines and includes all necessary indexes and constraints
```

### 3.6 Social Accounts Token Fields (if not exists)

```sql
-- Migration: 006_add_social_account_token_fields.sql

ALTER TABLE social_accounts
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_token_refresh_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS token_refresh_failed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS token_refresh_error TEXT;

-- Index for token refresh job
CREATE INDEX IF NOT EXISTS idx_social_accounts_token_expiry
    ON social_accounts (token_expires_at)
    WHERE token_expires_at IS NOT NULL
    AND token_refresh_failed = false;
```

---

## 4. Phase 1: Project Setup

### 4.1 Create Worker Project

```bash
# From solution root
cd src
dotnet new worker -n PublyApp.Worker
cd ..
dotnet sln add src/PublyApp.Worker/PublyApp.Worker.csproj

# Add references
cd src/PublyApp.Worker
dotnet add reference ../PublyApp.Domain/PublyApp.Domain.csproj
dotnet add reference ../PublyApp.Infrastructure/PublyApp.Infrastructure.csproj
```

### 4.2 Install Packages

```bash
# Quartz.NET
dotnet add package Quartz.Extensions.Hosting
dotnet add package Quartz.Serialization.Json

# PostgreSQL
dotnet add package Npgsql
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add package Dapper  # For raw SQL in job processor

# Utilities
dotnet add package NodaTime              # Timezone handling
dotnet add package Polly                 # Retry policies for external APIs
dotnet add package Serilog.Extensions.Hosting
dotnet add package Serilog.Sinks.Console
dotnet add package Serilog.Sinks.Seq     # Optional: structured log server
```

### 4.3 Project Structure

```
src/PublyApp.Worker/
├── Program.cs
├── appsettings.json
├── appsettings.Development.json
│
├── Configuration/
│   ├── QuartzConfiguration.cs
│   └── WorkerOptions.cs
│
├── Leadership/
│   └── SchedulerLeaderService.cs
│
├── Scheduling/                          # Quartz jobs (leader only)
│   ├── DispatchDuePostsJob.cs
│   └── RecoverStaleJobsJob.cs
│
├── SystemJobs/                          # Quartz system jobs (leader only)
│   ├── SessionCleanupJob.cs
│   ├── RefreshExpiringTokensJob.cs
│   ├── ValidateScheduledPostsJob.cs
│   └── CleanupCompletedJobsJob.cs
│
├── Queue/                               # Job queue processing (all instances)
│   ├── JobQueueProcessor.cs
│   ├── IJobHandler.cs
│   └── JobHandlerRegistry.cs
│
├── Handlers/                            # Actual job implementations
│   ├── PublishPostHandler.cs
│   ├── SendNotificationHandler.cs
│   └── ProcessWebhookHandler.cs
│
├── Services/
│   ├── RateLimitService.cs
│   ├── IdempotencyService.cs
│   └── DeadLetterService.cs
│
└── Monitoring/
    ├── HealthChecks/
    │   ├── LeaderHealthCheck.cs
    │   └── JobQueueHealthCheck.cs
    └── Metrics/
        └── JobMetrics.cs
```

### 4.4 appsettings.json

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=publyapp;Username=publyapp;Password=${DB_PASSWORD}"
  },
  "Worker": {
    "AdvisoryLockId": 424242,
    "JobQueue": {
      "PollingIntervalMs": 1000,
      "BatchSize": 20,
      "MaxConcurrency": 10,
      "StaleJobThresholdMinutes": 10
    },
    "Dispatch": {
      "BatchSize": 100,
      "IntervalSeconds": 15
    }
  },
  "Quartz": {
    "SchedulerName": "PublyAppScheduler"
  },
  "Serilog": {
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "Quartz": "Warning"
      }
    }
  }
}
```

### 4.5 Worker Options

```csharp
// Configuration/WorkerOptions.cs
namespace PublyApp.Worker.Configuration;

public class WorkerOptions
{
    public long AdvisoryLockId { get; set; } = 424242;
    public JobQueueOptions JobQueue { get; set; } = new();
    public DispatchOptions Dispatch { get; set; } = new();
}

public class JobQueueOptions
{
    public int PollingIntervalMs { get; set; } = 1000;
    public int BatchSize { get; set; } = 20;
    public int MaxConcurrency { get; set; } = 10;
    public int StaleJobThresholdMinutes { get; set; } = 10;
}

public class DispatchOptions
{
    public int BatchSize { get; set; } = 100;
    public int IntervalSeconds { get; set; } = 15;
}
```

---

## 5. Phase 2: Quartz.NET with Leader Election

### 5.1 Scheduler Leader Service

```csharp
// Leadership/SchedulerLeaderService.cs
namespace PublyApp.Worker.Leadership;

using Microsoft.Extensions.Options;
using Npgsql;
using PublyApp.Worker.Configuration;
using Quartz;

public class SchedulerLeaderService : BackgroundService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ISchedulerFactory _schedulerFactory;
    private readonly ILogger<SchedulerLeaderService> _logger;
    private readonly long _lockId;

    private NpgsqlConnection? _lockConnection;
    private bool _isLeader;
    private IScheduler? _scheduler;

    public SchedulerLeaderService(
        NpgsqlDataSource dataSource,
        ISchedulerFactory schedulerFactory,
        IOptions<WorkerOptions> options,
        ILogger<SchedulerLeaderService> logger)
    {
        _dataSource = dataSource;
        _schedulerFactory = schedulerFactory;
        _logger = logger;
        _lockId = options.Value.AdvisoryLockId;
    }

    public bool IsLeader => _isLeader;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Get scheduler reference (but don't start it yet)
        _scheduler = await _schedulerFactory.GetScheduler(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await TryAcquireLeadershipAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in leader election loop");
                await CleanupLeadershipAsync();
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }

        await CleanupLeadershipAsync();
    }

    private async Task TryAcquireLeadershipAsync(CancellationToken ct)
    {
        // Open a dedicated connection for the advisory lock
        // The lock is held as long as this connection stays open
        _lockConnection = await _dataSource.OpenConnectionAsync(ct);

        try
        {
            // Try to acquire the advisory lock (non-blocking)
            await using var cmd = _lockConnection.CreateCommand();
            cmd.CommandText = "SELECT pg_try_advisory_lock(@lockId)";
            cmd.Parameters.AddWithValue("lockId", _lockId);

            var acquired = (bool)(await cmd.ExecuteScalarAsync(ct))!;

            if (acquired)
            {
                await BecomeLeaderAsync(ct);
            }
            else
            {
                await BecomeFollowerAsync(ct);
            }
        }
        catch
        {
            await _lockConnection.DisposeAsync();
            _lockConnection = null;
            throw;
        }
    }

    private async Task BecomeLeaderAsync(CancellationToken ct)
    {
        _isLeader = true;
        _logger.LogInformation("This instance is now the LEADER. Starting Quartz scheduler.");

        // Start the scheduler ONLY after acquiring leadership
        if (_scheduler != null && !_scheduler.IsStarted)
        {
            await _scheduler.Start(ct);
            _logger.LogInformation("Quartz scheduler started");
        }

        // Hold leadership until cancellation or connection loss
        try
        {
            // Periodically verify we still hold the lock
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), ct);

                // Verify connection is still alive
                if (_lockConnection?.State != System.Data.ConnectionState.Open)
                {
                    _logger.LogWarning("Lock connection lost, relinquishing leadership");
                    break;
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Expected during shutdown
        }
    }

    private async Task BecomeFollowerAsync(CancellationToken ct)
    {
        _isLeader = false;
        _logger.LogInformation("Another instance is leader. This instance is a FOLLOWER.");

        // Close the connection (we didn't get the lock)
        await _lockConnection!.DisposeAsync();
        _lockConnection = null;

        // Ensure scheduler is not running on this instance
        if (_scheduler != null && _scheduler.IsStarted)
        {
            await _scheduler.Standby(ct);
            _logger.LogInformation("Quartz scheduler put in standby mode");
        }

        // Wait before retrying
        await Task.Delay(TimeSpan.FromSeconds(30), ct);
    }

    private async Task CleanupLeadershipAsync()
    {
        _isLeader = false;

        // Stop scheduler gracefully
        if (_scheduler != null && _scheduler.IsStarted)
        {
            _logger.LogInformation("Shutting down Quartz scheduler...");
            await _scheduler.Shutdown(waitForJobsToComplete: true);
            _logger.LogInformation("Quartz scheduler shut down");
        }

        // Release advisory lock by closing connection
        if (_lockConnection != null)
        {
            try
            {
                // Explicitly release (optional, connection close does this anyway)
                await using var cmd = _lockConnection.CreateCommand();
                cmd.CommandText = "SELECT pg_advisory_unlock(@lockId)";
                cmd.Parameters.AddWithValue("lockId", _lockId);
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error explicitly releasing advisory lock");
            }
            finally
            {
                await _lockConnection.DisposeAsync();
                _lockConnection = null;
            }
        }

        _logger.LogInformation("Leadership released");
    }
}
```

### 5.2 Quartz Configuration

```csharp
// Configuration/QuartzConfiguration.cs
namespace PublyApp.Worker.Configuration;

using PublyApp.Worker.Scheduling;
using PublyApp.Worker.SystemJobs;
using Quartz;

public static class QuartzConfiguration
{
    public static IServiceCollection AddQuartzScheduler(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var workerOptions = configuration.GetSection("Worker").Get<WorkerOptions>()!;

        services.AddQuartz(q =>
        {
            q.UseMicrosoftDependencyInjectionJobFactory();

            // Persistent store with PostgreSQL
            q.UsePersistentStore(store =>
            {
                store.UsePostgres(pg =>
                {
                    pg.ConnectionString = configuration.GetConnectionString("DefaultConnection")!;
                    pg.TablePrefix = "qrtz_";
                });
                store.UseJsonSerializer();
                store.PerformSchemaValidation = true;
            });

            // Thread pool
            q.UseDefaultThreadPool(tp => tp.MaxConcurrency = 5);

            // Register jobs (but DON'T auto-start - leader service controls this)
            ConfigureSchedulingJobs(q, workerOptions);
            ConfigureSystemJobs(q);
        });

        // Add hosted service WITHOUT auto-start
        // The SchedulerLeaderService will start it when this instance becomes leader
        services.AddQuartzHostedService(options =>
        {
            options.WaitForJobsToComplete = true;
            options.StartDelay = null; // Don't auto-start
        });

        return services;
    }

    private static void ConfigureSchedulingJobs(
        IServiceCollectionQuartzConfigurator q,
        WorkerOptions options)
    {
        // Dispatch due posts - runs every N seconds
        var dispatchInterval = options.Dispatch.IntervalSeconds;

        q.AddJob<DispatchDuePostsJob>(opts => opts
            .WithIdentity("dispatch-due-posts", "scheduling")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("dispatch-due-posts", "scheduling")
            .WithIdentity("dispatch-due-posts-trigger")
            .WithSimpleSchedule(x => x
                .WithIntervalInSeconds(dispatchInterval)
                .RepeatForever())
            .StartNow());

        // Recover stale jobs - every 5 minutes
        q.AddJob<RecoverStaleJobsJob>(opts => opts
            .WithIdentity("recover-stale-jobs", "scheduling")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("recover-stale-jobs", "scheduling")
            .WithIdentity("recover-stale-jobs-trigger")
            .WithCronSchedule("0 */5 * * * ?")); // Every 5 minutes
    }

    private static void ConfigureSystemJobs(IServiceCollectionQuartzConfigurator q)
    {
        // Session cleanup - every hour at :00
        q.AddJob<SessionCleanupJob>(opts => opts
            .WithIdentity("session-cleanup", "system")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("session-cleanup", "system")
            .WithIdentity("session-cleanup-trigger")
            .WithCronSchedule("0 0 * * * ?"));

        // Token refresh - every 6 hours
        q.AddJob<RefreshExpiringTokensJob>(opts => opts
            .WithIdentity("refresh-expiring-tokens", "system")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("refresh-expiring-tokens", "system")
            .WithIdentity("refresh-expiring-tokens-trigger")
            .WithCronSchedule("0 0 */6 * * ?"));

        // Validate scheduled posts - daily at 6 AM UTC
        q.AddJob<ValidateScheduledPostsJob>(opts => opts
            .WithIdentity("validate-scheduled-posts", "system")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("validate-scheduled-posts", "system")
            .WithIdentity("validate-scheduled-posts-trigger")
            .WithCronSchedule("0 0 6 * * ?"));

        // Cleanup completed jobs - daily at 3 AM UTC
        q.AddJob<CleanupCompletedJobsJob>(opts => opts
            .WithIdentity("cleanup-completed-jobs", "system")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("cleanup-completed-jobs", "system")
            .WithIdentity("cleanup-completed-jobs-trigger")
            .WithCronSchedule("0 0 3 * * ?"));
    }
}
```

### 5.3 Dispatch Due Posts Job

```csharp
// Scheduling/DispatchDuePostsJob.cs
namespace PublyApp.Worker.Scheduling;

using System.Text.Json;
using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using PublyApp.Worker.Configuration;
using Quartz;

[DisallowConcurrentExecution] // Prevent overlapping executions
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
        var dispatchedCount = 0;

        try
        {
            await using var conn = await _dataSource.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);

            // Step 1: Claim due posts with FOR UPDATE SKIP LOCKED
            // This is atomic - no other instance can claim these rows
            var duePosts = await conn.QueryAsync<ScheduledPostDto>(
                """
                UPDATE scheduled_posts
                SET status = 'queued',
                    queued_at = now(),
                    updated_at = now()
                WHERE id IN (
                    SELECT id FROM scheduled_posts
                    WHERE status = 'scheduled'
                    AND publish_at_utc <= now()
                    ORDER BY publish_at_utc
                    FOR UPDATE SKIP LOCKED
                    LIMIT @batchSize
                )
                RETURNING id, tenant_id, social_account_id
                """,
                new { batchSize = _batchSize },
                transaction: tx);

            var postsList = duePosts.ToList();

            if (postsList.Count == 0)
            {
                await tx.RollbackAsync(ct);
                return;
            }

            // Step 2: Insert into job_queue (same transaction)
            foreach (var post in postsList)
            {
                var payload = JsonSerializer.Serialize(new PublishPostPayload
                {
                    ScheduledPostId = post.Id,
                    TenantId = post.TenantId,
                    SocialAccountId = post.SocialAccountId
                });

                await conn.ExecuteAsync(
                    """
                    INSERT INTO job_queue (job_type, correlation_id, tenant_id, payload, run_after)
                    VALUES ('publish_post', @correlationId, @tenantId, @payload::jsonb, now())
                    """,
                    new
                    {
                        correlationId = post.Id,
                        tenantId = post.TenantId,
                        payload
                    },
                    transaction: tx);
            }

            await tx.CommitAsync(ct);
            dispatchedCount = postsList.Count;

            _logger.LogInformation("Dispatched {Count} posts to job queue", dispatchedCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error dispatching due posts");
            throw;
        }
    }

    private class ScheduledPostDto
    {
        public Guid Id { get; set; }
        public Guid TenantId { get; set; }
        public Guid SocialAccountId { get; set; }
    }

    private class PublishPostPayload
    {
        public Guid ScheduledPostId { get; set; }
        public Guid TenantId { get; set; }
        public Guid SocialAccountId { get; set; }
    }
}
```

### 5.4 Recover Stale Jobs

```csharp
// Scheduling/RecoverStaleJobsJob.cs
namespace PublyApp.Worker.Scheduling;

using Dapper;
using Microsoft.Extensions.Options;
using Npgsql;
using PublyApp.Worker.Configuration;
using Quartz;

[DisallowConcurrentExecution]
public class RecoverStaleJobsJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<RecoverStaleJobsJob> _logger;
    private readonly int _staleThresholdMinutes;

    public RecoverStaleJobsJob(
        NpgsqlDataSource dataSource,
        IOptions<WorkerOptions> options,
        ILogger<RecoverStaleJobsJob> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
        _staleThresholdMinutes = options.Value.JobQueue.StaleJobThresholdMinutes;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Recover stale jobs in job_queue
        var recoveredJobs = await conn.ExecuteAsync(
            """
            UPDATE job_queue
            SET status = 'pending',
                claimed_at = NULL,
                attempts = attempts + 1,
                last_error = 'Recovered from stale processing state'
            WHERE status = 'processing'
            AND claimed_at < now() - @threshold * INTERVAL '1 minute'
            """,
            new { threshold = _staleThresholdMinutes });

        if (recoveredJobs > 0)
        {
            _logger.LogWarning("Recovered {Count} stale jobs in job_queue", recoveredJobs);
        }

        // Recover stale scheduled_posts stuck in 'processing'
        var recoveredPosts = await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'scheduled',
                queued_at = NULL,
                retry_count = retry_count + 1,
                last_error = 'Recovered from stale processing state',
                updated_at = now()
            WHERE status = 'processing'
            AND queued_at < now() - @threshold * INTERVAL '1 minute'
            """,
            new { threshold = _staleThresholdMinutes });

        if (recoveredPosts > 0)
        {
            _logger.LogWarning("Recovered {Count} stale scheduled_posts", recoveredPosts);
        }
    }
}
```

---

## 6. Phase 3: Job Queue Processor

### 6.1 Job Handler Interface

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
    public required int Attempts { get; init; }
    public required int MaxAttempts { get; init; }
}
```

### 6.2 Job Handler Registry

```csharp
// Queue/JobHandlerRegistry.cs
namespace PublyApp.Worker.Queue;

public class JobHandlerRegistry
{
    private readonly Dictionary<string, Type> _handlers = new(StringComparer.OrdinalIgnoreCase);

    public void Register<THandler>(string jobType) where THandler : IJobHandler
    {
        _handlers[jobType] = typeof(THandler);
    }

    public Type? GetHandlerType(string jobType)
    {
        return _handlers.TryGetValue(jobType, out var type) ? type : null;
    }

    public IEnumerable<string> RegisteredJobTypes => _handlers.Keys;
}
```

### 6.3 Job Queue Processor

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
    private readonly DeadLetterService _deadLetterService;
    private readonly ILogger<JobQueueProcessor> _logger;
    private readonly JobQueueOptions _options;
    private readonly SemaphoreSlim _concurrencySemaphore;

    public JobQueueProcessor(
        NpgsqlDataSource dataSource,
        IServiceProvider services,
        JobHandlerRegistry registry,
        DeadLetterService deadLetterService,
        IOptions<WorkerOptions> options,
        ILogger<JobQueueProcessor> logger)
    {
        _dataSource = dataSource;
        _services = services;
        _registry = registry;
        _deadLetterService = deadLetterService;
        _logger = logger;
        _options = options.Value.JobQueue;
        _concurrencySemaphore = new SemaphoreSlim(_options.MaxConcurrency);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Job queue processor started. Concurrency: {Concurrency}, Batch: {Batch}, Poll: {Poll}ms",
            _options.MaxConcurrency, _options.BatchSize, _options.PollingIntervalMs);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processedCount = await ProcessBatchAsync(stoppingToken);

                // If no jobs were found, wait before polling again
                if (processedCount == 0)
                {
                    await Task.Delay(_options.PollingIntervalMs, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in job queue processor loop");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }

        _logger.LogInformation("Job queue processor stopping, waiting for in-flight jobs...");

        // Wait for all in-flight jobs to complete
        for (int i = 0; i < _options.MaxConcurrency; i++)
        {
            await _concurrencySemaphore.WaitAsync(TimeSpan.FromSeconds(30));
        }

        _logger.LogInformation("Job queue processor stopped");
    }

    private async Task<int> ProcessBatchAsync(CancellationToken ct)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Claim a batch of jobs with FOR UPDATE SKIP LOCKED
        var jobs = await conn.QueryAsync<JobDto>(
            """
            UPDATE job_queue
            SET status = 'processing',
                claimed_at = now()
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
            new { batchSize = _options.BatchSize });

        var jobsList = jobs.ToList();

        if (jobsList.Count == 0)
        {
            return 0;
        }

        _logger.LogDebug("Claimed {Count} jobs for processing", jobsList.Count);

        // Process jobs concurrently (up to MaxConcurrency)
        var tasks = jobsList.Select(job => ProcessJobWithSemaphoreAsync(job, ct));
        await Task.WhenAll(tasks);

        return jobsList.Count;
    }

    private async Task ProcessJobWithSemaphoreAsync(JobDto job, CancellationToken ct)
    {
        await _concurrencySemaphore.WaitAsync(ct);
        try
        {
            await ProcessJobAsync(job, ct);
        }
        finally
        {
            _concurrencySemaphore.Release();
        }
    }

    private async Task ProcessJobAsync(JobDto job, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        using var logScope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["JobId"] = job.Id,
            ["JobType"] = job.JobType,
            ["CorrelationId"] = job.CorrelationId ?? Guid.Empty,
            ["TenantId"] = job.TenantId ?? Guid.Empty,
            ["Attempt"] = job.Attempts + 1
        });

        try
        {
            // Resolve handler
            var handlerType = _registry.GetHandlerType(job.JobType);
            if (handlerType == null)
            {
                _logger.LogError("No handler registered for job type: {JobType}", job.JobType);
                await FailJobAsync(job, $"No handler for job type: {job.JobType}", moveToDlq: true);
                return;
            }

            // Create scoped handler instance
            using var scope = _services.CreateScope();
            var handler = (IJobHandler)scope.ServiceProvider.GetRequiredService(handlerType);

            // Execute handler
            var context = new JobContext
            {
                JobId = job.Id,
                CorrelationId = job.CorrelationId,
                TenantId = job.TenantId,
                Payload = job.Payload,
                Attempts = job.Attempts + 1, // Current attempt (1-based)
                MaxAttempts = job.MaxAttempts
            };

            await handler.HandleAsync(context, ct);

            // Success - mark completed
            await CompleteJobAsync(job);

            sw.Stop();
            _logger.LogInformation(
                "Job {JobId} ({JobType}) completed in {ElapsedMs}ms",
                job.Id, job.JobType, sw.ElapsedMilliseconds);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Shutdown requested - put job back to pending for another worker
            await RequeueJobAsync(job, "Shutdown requested");
            throw;
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex,
                "Job {JobId} ({JobType}) failed after {ElapsedMs}ms on attempt {Attempt}/{MaxAttempts}",
                job.Id, job.JobType, sw.ElapsedMilliseconds, job.Attempts + 1, job.MaxAttempts);

            var newAttempts = job.Attempts + 1;
            if (newAttempts >= job.MaxAttempts)
            {
                await FailJobAsync(job, ex.Message, moveToDlq: true);
            }
            else
            {
                // Calculate backoff: 5s, 30s, 2min, 10min
                var delays = new[] { 5, 30, 120, 600 };
                var delaySeconds = delays[Math.Min(newAttempts - 1, delays.Length - 1)];
                await RequeueJobAsync(job, ex.Message, TimeSpan.FromSeconds(delaySeconds));
            }
        }
    }

    private async Task CompleteJobAsync(JobDto job)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            UPDATE job_queue
            SET status = 'completed',
                completed_at = now()
            WHERE id = @id
            """,
            new { id = job.Id });
    }

    private async Task RequeueJobAsync(JobDto job, string error, TimeSpan? delay = null)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            UPDATE job_queue
            SET status = 'pending',
                claimed_at = NULL,
                attempts = attempts + 1,
                last_error = @error,
                run_after = now() + @delay * INTERVAL '1 second'
            WHERE id = @id
            """,
            new
            {
                id = job.Id,
                error,
                delay = delay?.TotalSeconds ?? 0
            });
    }

    private async Task FailJobAsync(JobDto job, string error, bool moveToDlq)
    {
        if (moveToDlq)
        {
            await _deadLetterService.MoveToDeadLetterAsync(job, error);
        }

        await using var conn = await _dataSource.OpenConnectionAsync();
        await conn.ExecuteAsync(
            "DELETE FROM job_queue WHERE id = @id",
            new { id = job.Id });
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
    }
}
```

### 6.4 Dead Letter Service

```csharp
// Services/DeadLetterService.cs
namespace PublyApp.Worker.Services;

using Dapper;
using Npgsql;

public class DeadLetterService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<DeadLetterService> _logger;

    public DeadLetterService(NpgsqlDataSource dataSource, ILogger<DeadLetterService> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task MoveToDeadLetterAsync(dynamic job, string error)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();

        await conn.ExecuteAsync(
            """
            INSERT INTO dead_letter_jobs (
                original_job_id, job_type, correlation_id, tenant_id,
                payload, attempts, last_error, failure_reason, original_created_at
            )
            SELECT
                id, job_type, correlation_id, tenant_id,
                payload, attempts, last_error, @failureReason, created_at
            FROM job_queue
            WHERE id = @jobId
            """,
            new
            {
                jobId = (Guid)job.Id,
                failureReason = error
            });

        _logger.LogWarning(
            "Moved job {JobId} ({JobType}) to dead letter queue: {Error}",
            job.Id, job.JobType, error);
    }
}
```

---

## 7. Phase 4: Job Handlers

### 7.1 Publish Post Handler

```csharp
// Handlers/PublishPostHandler.cs
namespace PublyApp.Worker.Handlers;

using System.Text.Json;
using Dapper;
using Npgsql;
using PublyApp.Domain.Entities;
using PublyApp.Infrastructure.SocialMedia;
using PublyApp.Worker.Queue;
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
        var payload = JsonSerializer.Deserialize<PublishPostPayload>(context.Payload)!;
        var postId = payload.ScheduledPostId;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Load post and account
        var post = await conn.QuerySingleOrDefaultAsync<ScheduledPostDto>(
            """
            SELECT
                p.id, p.tenant_id, p.social_account_id, p.content, p.media_urls,
                p.status, p.platform_post_id, p.retry_count, p.max_retries,
                a.platform, a.access_token, a.refresh_token, a.token_expires_at
            FROM scheduled_posts p
            JOIN social_accounts a ON a.id = p.social_account_id
            WHERE p.id = @postId
            """,
            new { postId });

        if (post == null)
        {
            _logger.LogWarning("Scheduled post {PostId} not found, skipping", postId);
            return; // Job completes successfully (nothing to do)
        }

        // IDEMPOTENCY CHECK 1: Already published
        if (post.Status == "published")
        {
            _logger.LogInformation("Post {PostId} already published, skipping", postId);
            return;
        }

        // IDEMPOTENCY CHECK 2: Partial success (API succeeded, DB update failed)
        if (!string.IsNullOrEmpty(post.PlatformPostId))
        {
            _logger.LogWarning(
                "Post {PostId} has platform_post_id but not published status. Fixing state.",
                postId);

            await conn.ExecuteAsync(
                """
                UPDATE scheduled_posts
                SET status = 'published', published_at = now(), updated_at = now()
                WHERE id = @postId
                """,
                new { postId });
            return;
        }

        // IDEMPOTENCY CHECK 3: Cancelled
        if (post.Status == "cancelled")
        {
            _logger.LogInformation("Post {PostId} was cancelled, skipping", postId);
            return;
        }

        // Check rate limit
        if (!await _rateLimitService.TryConsumeAsync(post.SocialAccountId, post.Platform, ct))
        {
            _logger.LogWarning(
                "Rate limit exceeded for account {AccountId} on {Platform}",
                post.SocialAccountId, post.Platform);

            // Reschedule for tomorrow
            await conn.ExecuteAsync(
                """
                UPDATE scheduled_posts
                SET status = 'scheduled',
                    queued_at = NULL,
                    publish_at_utc = date_trunc('day', now() + INTERVAL '1 day') + INTERVAL '9 hours',
                    last_error = 'Rate limit exceeded, rescheduled',
                    updated_at = now()
                WHERE id = @postId
                """,
                new { postId });

            throw new RateLimitExceededException($"Rate limit exceeded for {post.Platform}");
        }

        // Check and refresh token if needed
        if (post.TokenExpiresAt < DateTime.UtcNow.AddMinutes(5))
        {
            _logger.LogInformation("Token expiring soon, attempting refresh");

            try
            {
                var newToken = await _oauthService.RefreshTokenAsync(
                    post.SocialAccountId, post.RefreshToken, ct);

                await conn.ExecuteAsync(
                    """
                    UPDATE social_accounts
                    SET access_token = @accessToken,
                        token_expires_at = @expiresAt,
                        last_token_refresh_at = now()
                    WHERE id = @accountId
                    """,
                    new
                    {
                        accountId = post.SocialAccountId,
                        accessToken = newToken.AccessToken,
                        expiresAt = newToken.ExpiresAt
                    });

                post.AccessToken = newToken.AccessToken;
            }
            catch (OAuthException ex)
            {
                await FailPostPermanently(conn, postId, $"Token refresh failed: {ex.Message}");
                return; // Don't retry
            }
        }

        // Mark as processing
        await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'processing', updated_at = now()
            WHERE id = @postId
            """,
            new { postId });

        try
        {
            // Get platform client
            var client = _clientFactory.GetClient(post.Platform);

            // STABLE IDEMPOTENCY KEY - never includes retry count
            var idempotencyKey = $"publyapp:{postId}";

            // Call external API
            var result = await client.PublishAsync(
                post.AccessToken,
                post.Content,
                post.MediaUrls,
                idempotencyKey,
                ct);

            // CRITICAL: Save platform_post_id IMMEDIATELY
            // This is our checkpoint - if we crash after this, we know the post was created
            await conn.ExecuteAsync(
                """
                UPDATE scheduled_posts
                SET platform_post_id = @platformPostId,
                    updated_at = now()
                WHERE id = @postId
                """,
                new { postId, platformPostId = result.PostId });

            // Now update full success state
            await conn.ExecuteAsync(
                """
                UPDATE scheduled_posts
                SET status = 'published',
                    published_at = now(),
                    platform_url = @platformUrl,
                    updated_at = now()
                WHERE id = @postId
                """,
                new { postId, platformUrl = result.PostUrl });

            _logger.LogInformation(
                "Successfully published post {PostId} to {Platform} as {PlatformPostId}",
                postId, post.Platform, result.PostId);
        }
        catch (PlatformRateLimitException ex)
        {
            // Platform rate limit - reschedule
            var retryAfter = ex.RetryAfter ?? TimeSpan.FromMinutes(15);

            await conn.ExecuteAsync(
                """
                UPDATE scheduled_posts
                SET status = 'scheduled',
                    queued_at = NULL,
                    publish_at_utc = now() + @retryAfter * INTERVAL '1 second',
                    last_error = @error,
                    updated_at = now()
                WHERE id = @postId
                """,
                new
                {
                    postId,
                    retryAfter = (int)retryAfter.TotalSeconds,
                    error = $"Platform rate limit, retry after {retryAfter}"
                });

            _logger.LogWarning(
                "Platform rate limit for post {PostId}, rescheduled for {RetryAfter}",
                postId, retryAfter);
        }
        catch (Exception ex)
        {
            // Transient error - let job queue handle retry
            post.RetryCount++;

            await conn.ExecuteAsync(
                """
                UPDATE scheduled_posts
                SET status = 'queued',
                    retry_count = @retryCount,
                    last_error = @error,
                    updated_at = now()
                WHERE id = @postId
                """,
                new { postId, retryCount = post.RetryCount, error = ex.Message });

            if (post.RetryCount >= post.MaxRetries)
            {
                await FailPostPermanently(conn, postId, ex.Message);
                return; // Don't throw - job completed (moved to failed)
            }

            throw; // Re-throw for job queue retry
        }
    }

    private async Task FailPostPermanently(NpgsqlConnection conn, Guid postId, string error)
    {
        await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'failed',
                last_error = @error,
                updated_at = now()
            WHERE id = @postId
            """,
            new { postId, error });

        _logger.LogError("Post {PostId} failed permanently: {Error}", postId, error);

        // TODO: Send notification to user
    }

    // DTOs
    private class PublishPostPayload
    {
        public Guid ScheduledPostId { get; set; }
        public Guid TenantId { get; set; }
        public Guid SocialAccountId { get; set; }
    }

    private class ScheduledPostDto
    {
        public Guid Id { get; set; }
        public Guid TenantId { get; set; }
        public Guid SocialAccountId { get; set; }
        public string Content { get; set; } = null!;
        public string[] MediaUrls { get; set; } = Array.Empty<string>();
        public string Status { get; set; } = null!;
        public string? PlatformPostId { get; set; }
        public int RetryCount { get; set; }
        public int MaxRetries { get; set; }
        public string Platform { get; set; } = null!;
        public string AccessToken { get; set; } = null!;
        public string RefreshToken { get; set; } = null!;
        public DateTime? TokenExpiresAt { get; set; }
    }
}
```

### 7.2 Rate Limit Service (Postgres-based)

```csharp
// Services/RateLimitService.cs
namespace PublyApp.Worker.Services;

using Dapper;
using Npgsql;

public class RateLimitService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<RateLimitService> _logger;

    // Platform daily limits
    private static readonly Dictionary<string, int> DailyLimits = new(StringComparer.OrdinalIgnoreCase)
    {
        ["linkedin"] = 100,
        ["twitter"] = 200,
        ["facebook"] = 200,
        ["instagram"] = 25
    };

    public RateLimitService(NpgsqlDataSource dataSource, ILogger<RateLimitService> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    /// <summary>
    /// Atomically checks and consumes a rate limit slot.
    /// Returns true if request is allowed, false if rate limited.
    /// </summary>
    public async Task<bool> TryConsumeAsync(
        Guid socialAccountId,
        string platform,
        CancellationToken ct = default)
    {
        var limit = DailyLimits.GetValueOrDefault(platform.ToLower(), 50);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Atomic upsert with conditional increment
        // Only increments if under limit, returns the new count
        var result = await conn.QuerySingleAsync<RateLimitResult>(
            """
            INSERT INTO rate_limits (social_account_id, platform, date, request_count, updated_at)
            VALUES (@accountId, @platform, @date, 1, now())
            ON CONFLICT (social_account_id, platform, date) DO UPDATE
            SET request_count = CASE
                    WHEN rate_limits.request_count < @limit THEN rate_limits.request_count + 1
                    ELSE rate_limits.request_count
                END,
                updated_at = now()
            RETURNING request_count,
                      (rate_limits.request_count < @limit OR rate_limits.request_count IS NULL) as was_allowed
            """,
            new
            {
                accountId = socialAccountId,
                platform = platform.ToLower(),
                date = today,
                limit
            });

        if (!result.WasAllowed)
        {
            _logger.LogWarning(
                "Rate limit reached for account {AccountId} on {Platform}: {Count}/{Limit}",
                socialAccountId, platform, result.RequestCount, limit);
        }

        return result.WasAllowed;
    }

    public async Task<int> GetRemainingAsync(
        Guid socialAccountId,
        string platform,
        CancellationToken ct = default)
    {
        var limit = DailyLimits.GetValueOrDefault(platform.ToLower(), 50);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var count = await conn.QuerySingleOrDefaultAsync<int?>(
            """
            SELECT request_count FROM rate_limits
            WHERE social_account_id = @accountId
            AND platform = @platform
            AND date = @date
            """,
            new { accountId = socialAccountId, platform = platform.ToLower(), date = today });

        return Math.Max(0, limit - (count ?? 0));
    }

    private class RateLimitResult
    {
        public int RequestCount { get; set; }
        public bool WasAllowed { get; set; }
    }
}
```

---

## 8. Phase 5: Scheduling Service (API Integration)

### 8.1 Post Scheduling Service

This service lives in your API project and is used by controllers/endpoints.

```csharp
// In PublyApp.Api/Services/PostSchedulingService.cs
namespace PublyApp.Api.Services;

using System.Text.Json;
using Dapper;
using NodaTime;
using Npgsql;

public class PostSchedulingService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly IDateTimeZoneProvider _tzProvider;
    private readonly ILogger<PostSchedulingService> _logger;

    public PostSchedulingService(
        NpgsqlDataSource dataSource,
        ILogger<PostSchedulingService> logger)
    {
        _dataSource = dataSource;
        _tzProvider = DateTimeZoneProviders.Tzdb;
        _logger = logger;
    }

    public async Task<Guid> SchedulePostAsync(
        Guid tenantId,
        Guid socialAccountId,
        string content,
        string[] mediaUrls,
        DateTime publishAtLocal,
        string userTimeZoneId,
        CancellationToken ct = default)
    {
        // Validate timezone
        var tz = _tzProvider.GetZoneOrNull(userTimeZoneId)
            ?? throw new ArgumentException($"Invalid timezone: {userTimeZoneId}");

        // Convert to UTC
        var localDt = LocalDateTime.FromDateTime(publishAtLocal);
        var zonedDt = localDt.InZoneLeniently(tz);
        var publishAtUtc = zonedDt.ToInstant().ToDateTimeUtc();

        // Validate not in past
        if (publishAtUtc <= DateTime.UtcNow)
        {
            throw new ArgumentException("Scheduled time must be in the future");
        }

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var postId = await conn.QuerySingleAsync<Guid>(
            """
            INSERT INTO scheduled_posts (
                tenant_id, social_account_id, content, media_urls,
                publish_at_utc, user_timezone_id, status
            )
            VALUES (
                @tenantId, @socialAccountId, @content, @mediaUrls,
                @publishAtUtc, @userTimeZoneId, 'scheduled'
            )
            RETURNING id
            """,
            new
            {
                tenantId,
                socialAccountId,
                content,
                mediaUrls,
                publishAtUtc,
                userTimeZoneId
            });

        _logger.LogInformation(
            "Scheduled post {PostId} for {PublishAt} UTC (user: {UserTime} {TimeZone})",
            postId, publishAtUtc, publishAtLocal, userTimeZoneId);

        return postId;
    }

    public async Task ReschedulePostAsync(
        Guid postId,
        Guid tenantId,
        DateTime newPublishAtLocal,
        string userTimeZoneId,
        CancellationToken ct = default)
    {
        var tz = _tzProvider.GetZoneOrNull(userTimeZoneId)
            ?? throw new ArgumentException($"Invalid timezone: {userTimeZoneId}");

        var localDt = LocalDateTime.FromDateTime(newPublishAtLocal);
        var zonedDt = localDt.InZoneLeniently(tz);
        var publishAtUtc = zonedDt.ToInstant().ToDateTimeUtc();

        if (publishAtUtc <= DateTime.UtcNow)
        {
            throw new ArgumentException("Scheduled time must be in the future");
        }

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var updated = await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET publish_at_utc = @publishAtUtc,
                user_timezone_id = @userTimeZoneId,
                status = 'scheduled',
                queued_at = NULL,
                updated_at = now()
            WHERE id = @postId
            AND tenant_id = @tenantId
            AND status IN ('scheduled', 'queued', 'draft')
            """,
            new { postId, tenantId, publishAtUtc, userTimeZoneId });

        if (updated == 0)
        {
            throw new InvalidOperationException(
                "Post not found or cannot be rescheduled (already processing/published/failed)");
        }

        _logger.LogInformation("Rescheduled post {PostId} to {PublishAt} UTC", postId, publishAtUtc);
    }

    public async Task CancelPostAsync(Guid postId, Guid tenantId, CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var updated = await conn.ExecuteAsync(
            """
            UPDATE scheduled_posts
            SET status = 'cancelled',
                updated_at = now()
            WHERE id = @postId
            AND tenant_id = @tenantId
            AND status IN ('scheduled', 'queued', 'draft')
            """,
            new { postId, tenantId });

        if (updated == 0)
        {
            throw new InvalidOperationException(
                "Post not found or cannot be cancelled (already processing/published)");
        }

        _logger.LogInformation("Cancelled post {PostId}", postId);
    }

    /// <summary>
    /// Enqueue a job immediately (for fire-and-forget work from API)
    /// </summary>
    public async Task EnqueueJobAsync(
        string jobType,
        object payload,
        Guid? correlationId = null,
        Guid? tenantId = null,
        TimeSpan? delay = null,
        CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        await conn.ExecuteAsync(
            """
            INSERT INTO job_queue (job_type, correlation_id, tenant_id, payload, run_after)
            VALUES (@jobType, @correlationId, @tenantId, @payload::jsonb, now() + @delay * INTERVAL '1 second')
            """,
            new
            {
                jobType,
                correlationId,
                tenantId,
                payload = JsonSerializer.Serialize(payload),
                delay = delay?.TotalSeconds ?? 0
            });
    }
}
```

---

## 9. Phase 6: System Jobs

### 9.1 Session Cleanup

```csharp
// SystemJobs/SessionCleanupJob.cs
namespace PublyApp.Worker.SystemJobs;

using Dapper;
using Npgsql;
using Quartz;

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

        var deleted = await conn.ExecuteAsync(
            "DELETE FROM sessions WHERE expires_at < now()");

        _logger.LogInformation("Cleaned up {Count} expired sessions", deleted);
    }
}
```

### 9.2 Refresh Expiring Tokens

```csharp
// SystemJobs/RefreshExpiringTokensJob.cs
namespace PublyApp.Worker.SystemJobs;

using Dapper;
using Npgsql;
using PublyApp.Infrastructure.OAuth;
using Quartz;

[DisallowConcurrentExecution]
public class RefreshExpiringTokensJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly IOAuthService _oauthService;
    private readonly ILogger<RefreshExpiringTokensJob> _logger;

    public RefreshExpiringTokensJob(
        NpgsqlDataSource dataSource,
        IOAuthService oauthService,
        ILogger<RefreshExpiringTokensJob> logger)
    {
        _dataSource = dataSource;
        _oauthService = oauthService;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        var warningThreshold = DateTime.UtcNow.AddHours(48);

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var expiringAccounts = await conn.QueryAsync<ExpiringAccountDto>(
            """
            SELECT id, platform, refresh_token
            FROM social_accounts
            WHERE token_expires_at < @threshold
            AND token_expires_at > now()
            AND token_refresh_failed = false
            AND refresh_token IS NOT NULL
            """,
            new { threshold = warningThreshold });

        var accounts = expiringAccounts.ToList();
        _logger.LogInformation("Found {Count} tokens expiring within 48 hours", accounts.Count);

        var refreshed = 0;
        var failed = 0;

        foreach (var account in accounts)
        {
            try
            {
                var newToken = await _oauthService.RefreshTokenAsync(
                    account.Id, account.RefreshToken, ct);

                await conn.ExecuteAsync(
                    """
                    UPDATE social_accounts
                    SET access_token = @accessToken,
                        token_expires_at = @expiresAt,
                        last_token_refresh_at = now(),
                        token_refresh_failed = false,
                        token_refresh_error = NULL
                    WHERE id = @accountId
                    """,
                    new
                    {
                        accountId = account.Id,
                        accessToken = newToken.AccessToken,
                        expiresAt = newToken.ExpiresAt
                    });

                refreshed++;
                _logger.LogInformation(
                    "Refreshed token for account {AccountId} ({Platform})",
                    account.Id, account.Platform);
            }
            catch (OAuthException ex) when (ex.IsPermanent)
            {
                // Permanent failure - mark account
                await conn.ExecuteAsync(
                    """
                    UPDATE social_accounts
                    SET token_refresh_failed = true,
                        token_refresh_error = @error
                    WHERE id = @accountId
                    """,
                    new { accountId = account.Id, error = ex.Message });

                failed++;
                _logger.LogError(ex,
                    "Permanent token refresh failure for account {AccountId}",
                    account.Id);

                // TODO: Notify user
            }
            catch (Exception ex)
            {
                // Transient failure - will retry next run
                _logger.LogWarning(ex,
                    "Transient token refresh failure for account {AccountId}, will retry",
                    account.Id);
            }
        }

        _logger.LogInformation(
            "Token refresh complete. Refreshed: {Refreshed}, Failed: {Failed}",
            refreshed, failed);
    }

    private class ExpiringAccountDto
    {
        public Guid Id { get; set; }
        public string Platform { get; set; } = null!;
        public string RefreshToken { get; set; } = null!;
    }
}
```

### 9.3 Validate Scheduled Posts

```csharp
// SystemJobs/ValidateScheduledPostsJob.cs
namespace PublyApp.Worker.SystemJobs;

using Dapper;
using Npgsql;
using Quartz;

[DisallowConcurrentExecution]
public class ValidateScheduledPostsJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<ValidateScheduledPostsJob> _logger;

    public ValidateScheduledPostsJob(
        NpgsqlDataSource dataSource,
        ILogger<ValidateScheduledPostsJob> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        var horizon = DateTime.UtcNow.AddDays(7);

        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        // Find posts scheduled in next 7 days where token will be expired
        var problemPosts = await conn.QueryAsync<ProblemPostDto>(
            """
            SELECT
                p.id as post_id,
                p.tenant_id,
                p.publish_at_utc,
                a.id as account_id,
                a.platform,
                a.token_expires_at,
                a.token_refresh_failed
            FROM scheduled_posts p
            JOIN social_accounts a ON a.id = p.social_account_id
            WHERE p.status = 'scheduled'
            AND p.publish_at_utc < @horizon
            AND (
                a.token_expires_at < p.publish_at_utc
                OR a.token_refresh_failed = true
            )
            """,
            new { horizon });

        var problems = problemPosts.ToList();

        foreach (var problem in problems)
        {
            _logger.LogWarning(
                "Post {PostId} scheduled for {PublishAt} has token issue: " +
                "expires {TokenExpires}, refresh_failed={RefreshFailed}",
                problem.PostId,
                problem.PublishAtUtc,
                problem.TokenExpiresAt,
                problem.TokenRefreshFailed);

            // TODO: Send notification to user about token issue
        }

        if (problems.Count > 0)
        {
            _logger.LogWarning(
                "Found {Count} scheduled posts with token problems",
                problems.Count);
        }
    }

    private class ProblemPostDto
    {
        public Guid PostId { get; set; }
        public Guid TenantId { get; set; }
        public DateTime PublishAtUtc { get; set; }
        public Guid AccountId { get; set; }
        public string Platform { get; set; } = null!;
        public DateTime? TokenExpiresAt { get; set; }
        public bool TokenRefreshFailed { get; set; }
    }
}
```

### 9.4 Cleanup Completed Jobs

```csharp
// SystemJobs/CleanupCompletedJobsJob.cs
namespace PublyApp.Worker.SystemJobs;

using Dapper;
using Npgsql;
using Quartz;

[DisallowConcurrentExecution]
public class CleanupCompletedJobsJob : IJob
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ILogger<CleanupCompletedJobsJob> _logger;

    public CleanupCompletedJobsJob(
        NpgsqlDataSource dataSource,
        ILogger<CleanupCompletedJobsJob> logger)
    {
        _dataSource = dataSource;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(context.CancellationToken);

        // Delete completed jobs older than 7 days
        var deletedJobs = await conn.ExecuteAsync(
            """
            DELETE FROM job_queue
            WHERE status = 'completed'
            AND completed_at < now() - INTERVAL '7 days'
            """);

        // Delete old rate limit records
        var deletedRateLimits = await conn.ExecuteAsync(
            """
            DELETE FROM rate_limits
            WHERE date < CURRENT_DATE - INTERVAL '30 days'
            """);

        _logger.LogInformation(
            "Cleanup complete. Deleted {Jobs} old jobs, {RateLimits} old rate limit records",
            deletedJobs, deletedRateLimits);
    }
}
```

---

## 10. Phase 7: Observability

### 10.1 Health Checks

```csharp
// Monitoring/HealthChecks/LeaderHealthCheck.cs
namespace PublyApp.Worker.Monitoring.HealthChecks;

using Microsoft.Extensions.Diagnostics.HealthChecks;
using PublyApp.Worker.Leadership;

public class LeaderHealthCheck : IHealthCheck
{
    private readonly SchedulerLeaderService _leaderService;

    public LeaderHealthCheck(SchedulerLeaderService leaderService)
    {
        _leaderService = leaderService;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken ct = default)
    {
        var data = new Dictionary<string, object>
        {
            ["IsLeader"] = _leaderService.IsLeader
        };

        return Task.FromResult(HealthCheckResult.Healthy(
            _leaderService.IsLeader ? "This instance is the leader" : "This instance is a follower",
            data));
    }
}
```

```csharp
// Monitoring/HealthChecks/JobQueueHealthCheck.cs
namespace PublyApp.Worker.Monitoring.HealthChecks;

using Dapper;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

public class JobQueueHealthCheck : IHealthCheck
{
    private readonly NpgsqlDataSource _dataSource;

    public JobQueueHealthCheck(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken ct = default)
    {
        await using var conn = await _dataSource.OpenConnectionAsync(ct);

        var stats = await conn.QuerySingleAsync<QueueStats>(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                COUNT(*) FILTER (WHERE status = 'pending' AND run_after < now() - INTERVAL '5 minutes') as stale
            FROM job_queue
            """);

        var dlqCount = await conn.QuerySingleAsync<int>(
            "SELECT COUNT(*) FROM dead_letter_jobs WHERE resolved_at IS NULL");

        var data = new Dictionary<string, object>
        {
            ["PendingJobs"] = stats.Pending,
            ["ProcessingJobs"] = stats.Processing,
            ["StaleJobs"] = stats.Stale,
            ["DeadLetterJobs"] = dlqCount
        };

        if (stats.Stale > 10)
        {
            return HealthCheckResult.Degraded(
                $"High number of stale jobs: {stats.Stale}",
                data: data);
        }

        if (dlqCount > 0)
        {
            return HealthCheckResult.Degraded(
                $"Dead letter queue has {dlqCount} unresolved jobs",
                data: data);
        }

        return HealthCheckResult.Healthy("Job queue is healthy", data);
    }

    private class QueueStats
    {
        public int Pending { get; set; }
        public int Processing { get; set; }
        public int Stale { get; set; }
    }
}
```

### 10.2 Program.cs

```csharp
// Program.cs
using PublyApp.Worker.Configuration;
using PublyApp.Worker.Handlers;
using PublyApp.Worker.Leadership;
using PublyApp.Worker.Monitoring.HealthChecks;
using PublyApp.Worker.Queue;
using PublyApp.Worker.Services;
using Serilog;

var builder = Host.CreateApplicationBuilder(args);

// Serilog
builder.Services.AddSerilog(config => config
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .Enrich.WithMachineName()
    .WriteTo.Console());

// Configuration
builder.Services.Configure<WorkerOptions>(builder.Configuration.GetSection("Worker"));

// Database
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")!;
builder.Services.AddNpgsqlDataSource(connectionString);

// Services
builder.Services.AddSingleton<DeadLetterService>();
builder.Services.AddSingleton<RateLimitService>();

// Job handler registry
var registry = new JobHandlerRegistry();
registry.Register<PublishPostHandler>("publish_post");
// registry.Register<SendNotificationHandler>("send_notification");
// registry.Register<ProcessWebhookHandler>("process_webhook");
builder.Services.AddSingleton(registry);

// Register handlers for DI
builder.Services.AddScoped<PublishPostHandler>();
// builder.Services.AddScoped<SendNotificationHandler>();
// builder.Services.AddScoped<ProcessWebhookHandler>();

// External services (implement these based on your needs)
// builder.Services.AddScoped<ISocialMediaClientFactory, SocialMediaClientFactory>();
// builder.Services.AddScoped<IOAuthService, OAuthService>();

// Quartz (configured but NOT auto-started)
builder.Services.AddQuartzScheduler(builder.Configuration);

// Background services
builder.Services.AddSingleton<SchedulerLeaderService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SchedulerLeaderService>());
builder.Services.AddHostedService<JobQueueProcessor>();

// Health checks
builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "postgres")
    .AddCheck<LeaderHealthCheck>("leader")
    .AddCheck<JobQueueHealthCheck>("job_queue");

var host = builder.Build();

// Health check endpoint (minimal API)
var app = WebApplication.Create();
app.MapHealthChecks("/health");
_ = app.RunAsync("http://0.0.0.0:8080");

await host.RunAsync();
```

---

## 11. Phase 8: Deployment

### 11.1 Dockerfile

```dockerfile
# src/PublyApp.Worker/Dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution and project files
COPY ["PublyApp.sln", "."]
COPY ["src/PublyApp.Worker/PublyApp.Worker.csproj", "src/PublyApp.Worker/"]
COPY ["src/PublyApp.Domain/PublyApp.Domain.csproj", "src/PublyApp.Domain/"]
COPY ["src/PublyApp.Infrastructure/PublyApp.Infrastructure.csproj", "src/PublyApp.Infrastructure/"]

# Restore
RUN dotnet restore "src/PublyApp.Worker/PublyApp.Worker.csproj"

# Copy everything and build
COPY . .
WORKDIR "/src/src/PublyApp.Worker"
RUN dotnet publish -c Release -o /app/publish --no-restore

# Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "PublyApp.Worker.dll"]
```

### 11.2 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16
    container_name: publyapp-postgres
    environment:
      POSTGRES_USER: publyapp
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: publyapp
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U publyapp"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  worker-1:
    build:
      context: .
      dockerfile: src/PublyApp.Worker/Dockerfile
    container_name: publyapp-worker-1
    environment:
      - ConnectionStrings__DefaultConnection=Host=postgres;Database=publyapp;Username=publyapp;Password=${DB_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    stop_grace_period: 60s
    restart: unless-stopped

  worker-2:
    build:
      context: .
      dockerfile: src/PublyApp.Worker/Dockerfile
    container_name: publyapp-worker-2
    environment:
      - ConnectionStrings__DefaultConnection=Host=postgres;Database=publyapp;Username=publyapp;Password=${DB_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    stop_grace_period: 60s
    restart: unless-stopped

volumes:
  postgres_data:
```

### 11.3 Graceful Shutdown

The implementation already handles graceful shutdown:

1. **SchedulerLeaderService**: Calls `scheduler.Shutdown(waitForJobsToComplete: true)`
2. **JobQueueProcessor**: Waits for all in-flight jobs via semaphore
3. **Docker**: `stop_grace_period: 60s` gives time for cleanup

---

## 12. Implementation Checklist

### Phase 1: Database
- [ ] Run migration 001: Create `scheduled_posts` table
- [ ] Run migration 002: Create `job_queue` table
- [ ] Run migration 003: Create `dead_letter_jobs` table
- [ ] Run migration 004: Create `rate_limits` table
- [ ] Run migration 005: Create Quartz tables (download from GitHub)
- [ ] Run migration 006: Add token fields to `social_accounts`

### Phase 2: Project Setup
- [ ] Create `PublyApp.Worker` project
- [ ] Install all NuGet packages
- [ ] Create folder structure
- [ ] Add `appsettings.json` configuration

### Phase 3: Leader Election
- [ ] Implement `SchedulerLeaderService`
- [ ] Test advisory lock acquisition/release
- [ ] Verify only one instance runs Quartz

### Phase 4: Quartz Configuration
- [ ] Configure Quartz with PostgreSQL persistence
- [ ] Register `DispatchDuePostsJob`
- [ ] Register `RecoverStaleJobsJob`
- [ ] Register all system jobs
- [ ] Verify jobs don't auto-start (leader controls)

### Phase 5: Job Queue
- [ ] Implement `JobQueueProcessor`
- [ ] Implement `JobHandlerRegistry`
- [ ] Implement `DeadLetterService`
- [ ] Test SKIP LOCKED claiming

### Phase 6: Handlers
- [ ] Implement `PublishPostHandler` with full idempotency
- [ ] Implement `RateLimitService` (Postgres-based)
- [ ] Test idempotency scenarios
- [ ] Test retry/backoff behavior

### Phase 7: API Integration
- [ ] Implement `PostSchedulingService`
- [ ] Add timezone conversion with NodaTime
- [ ] Test scheduling/rescheduling/cancellation

### Phase 8: System Jobs
- [ ] Implement `SessionCleanupJob`
- [ ] Implement `RefreshExpiringTokensJob`
- [ ] Implement `ValidateScheduledPostsJob`
- [ ] Implement `CleanupCompletedJobsJob`

### Phase 9: Observability
- [ ] Add health checks
- [ ] Configure Serilog
- [ ] Test health endpoints

### Phase 10: Deployment
- [ ] Create Dockerfile
- [ ] Create docker-compose.yml
- [ ] Test multi-instance deployment
- [ ] Verify leader election works across instances
- [ ] Test graceful shutdown

---

## Quick Reference: State Transitions

```
SCHEDULED_POSTS:
  draft      → scheduled   (user schedules)
  scheduled  → queued      (DispatchDuePostsJob)
  scheduled  → cancelled   (user cancels)
  queued     → processing  (PublishPostHandler starts)
  processing → published   (API success)
  processing → queued      (transient error, retry)
  processing → scheduled   (stale recovery)
  processing → failed      (max retries)

JOB_QUEUE:
  pending    → processing  (JobQueueProcessor claims)
  processing → completed   (handler success)
  processing → pending     (transient error, retry)
  processing → [deleted]   (max retries, moved to DLQ)
```

---

*Document version: 2.0 — Pure Postgres Edition*
*All issues from v1 review addressed*
