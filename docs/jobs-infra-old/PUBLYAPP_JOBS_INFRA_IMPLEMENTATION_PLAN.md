# PublyApp Background Jobs Infrastructure — The Ultimate Implementation Plan

> **Consensus**: After intensive discussions with Claude and GPT, the agreed architecture is:
> **RabbitMQ + MassTransit + Quartz.NET** with PostgreSQL as the source of truth.
>
> This plan synthesizes the best insights from both AI conversations into a bullet-proof implementation guide.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Phase 0: Prerequisites & Project Setup](#2-phase-0-prerequisites--project-setup)
3. [Phase 1: Database Schema & Core Infrastructure](#3-phase-1-database-schema--core-infrastructure)
4. [Phase 2: MassTransit + RabbitMQ Setup](#4-phase-2-masstransit--rabbitmq-setup)
5. [Phase 3: Quartz.NET Scheduler](#5-phase-3-quartznet-scheduler)
6. [Phase 4: Job Handlers & Consumers](#6-phase-4-job-handlers--consumers)
7. [Phase 5: Reliability Patterns](#7-phase-5-reliability-patterns)
8. [Phase 6: Observability & Monitoring](#8-phase-6-observability--monitoring)
9. [Phase 7: Deployment & Operations](#9-phase-7-deployment--operations)
10. [Migration Path to GCP](#10-migration-path-to-gcp)
11. [Checklist Summary](#11-checklist-summary)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PublyApp.Worker                                 │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    Quartz.NET Scheduler                             │    │
│  │              (advisory lock = single leader)                        │    │
│  │                                                                     │    │
│  │  ┌──────────────────────┐    ┌─────────────────────────────────┐  │    │
│  │  │ ClaimDuePostsJob     │    │      System Jobs                 │  │    │
│  │  │ (every 15-30s)       │    │                                  │  │    │
│  │  │                      │    │  • SessionCleanupJob             │  │    │
│  │  │ Claims scheduled     │    │  • RefreshExpiringTokensJob      │  │    │
│  │  │ posts from DB        │    │  • RecoverStaleJobsJob           │  │    │
│  │  │ Publishes to queue   │    │  • ValidateScheduledPostsJob     │  │    │
│  │  └──────────┬───────────┘    │  • DlqMonitorJob                 │  │    │
│  │             │                 └─────────────────────────────────┘  │    │
│  └─────────────│──────────────────────────────────────────────────────┘    │
│                │                                                            │
│                ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                         RabbitMQ                                    │    │
│  │                                                                     │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐  │    │
│  │  │ publish-post  │  │ send-email    │  │ process-webhook       │  │    │
│  │  │ queue         │  │ queue         │  │ queue                 │  │    │
│  │  └───────┬───────┘  └───────────────┘  └───────────────────────┘  │    │
│  │          │                                                         │    │
│  │  ┌───────┴───────┐                                                │    │
│  │  │ _error queues │ (Dead Letter)                                  │    │
│  │  └───────────────┘                                                │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                │                                                            │
│                ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    MassTransit Consumers                            │    │
│  │                                                                     │    │
│  │  ┌───────────────────┐  ┌───────────────────┐                     │    │
│  │  │ PublishPostConsumer│  │ SendEmailConsumer │  ...               │    │
│  │  │                    │  │                    │                     │    │
│  │  │ • Idempotency check│  │                    │                     │    │
│  │  │ • Token validation │  │                    │                     │    │
│  │  │ • Rate limiting    │  │                    │                     │    │
│  │  │ • API call         │  │                    │                     │    │
│  │  │ • Status update    │  │                    │                     │    │
│  │  └───────────────────┘  └───────────────────┘                     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                │                                                            │
└────────────────│────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL                                     │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐  │
│  │ scheduled_posts   │  │ outbox_messages   │  │ social_accounts       │  │
│  │                   │  │                   │  │                       │  │
│  │ • id              │  │ • id              │  │ • id                  │  │
│  │ • tenant_id       │  │ • message_type    │  │ • tenant_id           │  │
│  │ • publish_at_utc  │  │ • payload         │  │ • platform            │  │
│  │ • status          │  │ • status          │  │ • access_token        │  │
│  │ • claimed_at      │  │ • created_at      │  │ • refresh_token       │  │
│  │ • platform_post_id│  │ • published_at    │  │ • token_expires_at    │  │
│  │ • retry_count     │  │ • retry_count     │  │ • is_refresh_failed   │  │
│  │ • last_error      │  │                   │  │                       │  │
│  └───────────────────┘  └───────────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Job Categories

| Category | Description | Examples | Mechanism |
|----------|-------------|----------|-----------|
| **Request-driven async work** | Triggered by API calls, needs retries + DLQ | Generate thumbnails, send emails, process webhooks | MassTransit consumers |
| **Scheduled/recurring jobs** | Time-triggered, no user request | Delete expired sessions, rebuild indexes, daily digests | Quartz cron triggers |
| **Scheduled user jobs** | Must fire at a specific time, potentially huge volume | Publish post at 2026-01-13 09:00 | DB polling + MassTransit |

### 1.3 Key Design Principles

1. **Database is source of truth** — Never trust the broker for scheduling state
2. **Outbox pattern is MANDATORY** — Not optional, prevents distributed transaction failures
3. **Idempotency everywhere** — Every job must be safe to run twice
4. **Single binary, two roles** — One worker service with Quartz + consumers
5. **Advisory lock leadership** — Only one instance runs Quartz scheduler
6. **FOR UPDATE SKIP LOCKED** — The gold standard for distributed job claiming

---

## 2. Phase 0: Prerequisites & Project Setup

### 2.1 Create Worker Service Project

```bash
# From solution root
dotnet new worker -n PublyApp.Worker -o src/PublyApp.Worker
dotnet sln add src/PublyApp.Worker/PublyApp.Worker.csproj

# Add project reference to shared projects
cd src/PublyApp.Worker
dotnet add reference ../PublyApp.Domain/PublyApp.Domain.csproj
dotnet add reference ../PublyApp.Infrastructure/PublyApp.Infrastructure.csproj
```

### 2.2 Install Required Packages

```bash
# MassTransit + RabbitMQ
dotnet add package MassTransit
dotnet add package MassTransit.RabbitMQ
dotnet add package MassTransit.EntityFrameworkCore

# Quartz.NET
dotnet add package Quartz
dotnet add package Quartz.Extensions.Hosting
dotnet add package Quartz.Serialization.Json

# PostgreSQL
dotnet add package Npgsql
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL

# Utilities
dotnet add package NodaTime                    # Timezone handling
dotnet add package Polly                       # Resilience policies
dotnet add package Serilog.Extensions.Hosting  # Structured logging
```

### 2.3 Project Structure

```
src/PublyApp.Worker/
├── Program.cs
├── appsettings.json
├── Configuration/
│   ├── MassTransitConfiguration.cs
│   ├── QuartzConfiguration.cs
│   └── WorkerConfiguration.cs
├── Jobs/                              # Quartz Jobs
│   ├── Scheduling/
│   │   ├── ClaimDuePostsJob.cs
│   │   └── RecoverStaleJobsJob.cs
│   └── System/
│       ├── SessionCleanupJob.cs
│       ├── RefreshExpiringTokensJob.cs
│       ├── ValidateScheduledPostsJob.cs
│       └── DlqMonitorJob.cs
├── Consumers/                         # MassTransit Consumers
│   ├── Posts/
│   │   └── PublishPostConsumer.cs
│   ├── Notifications/
│   │   └── SendNotificationConsumer.cs
│   └── Webhooks/
│       └── ProcessWebhookConsumer.cs
├── Messages/                          # Message contracts
│   ├── PublishPost.cs
│   ├── SendNotification.cs
│   └── ProcessWebhook.cs
├── Services/
│   ├── SchedulerLeadershipService.cs
│   ├── SocialMediaRateLimiter.cs
│   └── PlatformHealthService.cs
└── Infrastructure/
    ├── OutboxPublisher.cs
    └── Filters/
        └── DeduplicationFilter.cs
```

---

## 3. Phase 1: Database Schema & Core Infrastructure

### 3.1 Database Migration: Scheduled Posts Table

```sql
-- Migration: Create scheduled_posts table
CREATE TABLE scheduled_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    social_account_id UUID NOT NULL REFERENCES social_accounts(id),

    -- Content
    content TEXT NOT NULL,
    media_urls TEXT[] DEFAULT '{}',

    -- Scheduling (always UTC)
    publish_at_utc TIMESTAMPTZ NOT NULL,
    user_timezone_id VARCHAR(100) NOT NULL,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    claimed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,

    -- Idempotency & Platform response
    platform_post_id VARCHAR(500),
    platform_url TEXT,

    -- Retry & Error handling
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    last_error TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN (
        'draft', 'scheduled', 'processing', 'published', 'failed', 'cancelled'
    ))
);

-- Indexes for efficient claiming
CREATE INDEX idx_scheduled_posts_due ON scheduled_posts (publish_at_utc, status)
    WHERE status = 'scheduled';

CREATE INDEX idx_scheduled_posts_tenant ON scheduled_posts (tenant_id, status);

CREATE INDEX idx_scheduled_posts_stale ON scheduled_posts (claimed_at, status)
    WHERE status = 'processing';
```

### 3.2 Database Migration: Outbox Messages Table

```sql
-- Migration: Create outbox_messages table (MANDATORY)
CREATE TABLE outbox_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Message metadata
    message_type VARCHAR(500) NOT NULL,
    payload JSONB NOT NULL,

    -- Correlation
    correlation_id UUID,
    tenant_id UUID,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,

    -- Retry handling
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,

    -- Constraints
    CONSTRAINT valid_outbox_status CHECK (status IN (
        'pending', 'published', 'failed'
    ))
);

-- Index for efficient polling
CREATE INDEX idx_outbox_pending ON outbox_messages (status, created_at)
    WHERE status = 'pending';
```

### 3.3 Database Migration: Social Accounts Token Fields

```sql
-- Migration: Ensure social_accounts has token management fields
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS
    token_expires_at TIMESTAMPTZ;

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS
    last_refreshed_at TIMESTAMPTZ;

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS
    refresh_fail_count INT NOT NULL DEFAULT 0;

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS
    is_refresh_failed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS
    refresh_fail_reason TEXT;

-- Index for token refresh job
CREATE INDEX idx_social_accounts_expiring ON social_accounts (token_expires_at)
    WHERE token_expires_at IS NOT NULL AND is_refresh_failed = false;
```

### 3.4 Entity Framework Entities

```csharp
// Domain/Entities/ScheduledPost.cs
public class ScheduledPost
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid SocialAccountId { get; set; }

    public string Content { get; set; } = null!;
    public List<string> MediaUrls { get; set; } = new();

    public DateTime PublishAtUtc { get; set; }
    public string UserTimeZoneId { get; set; } = null!;

    public PostStatus Status { get; set; }
    public DateTime? ClaimedAt { get; set; }
    public DateTime? PublishedAt { get; set; }

    public string? PlatformPostId { get; set; }
    public string? PlatformUrl { get; set; }

    public int RetryCount { get; set; }
    public int MaxRetries { get; set; } = 3;
    public string? LastError { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Navigation
    public Tenant Tenant { get; set; } = null!;
    public SocialAccount SocialAccount { get; set; } = null!;
}

public enum PostStatus
{
    Draft,
    Scheduled,
    Processing,
    Published,
    Failed,
    Cancelled
}
```

```csharp
// Domain/Entities/OutboxMessage.cs
public class OutboxMessage
{
    public Guid Id { get; set; }
    public string MessageType { get; set; } = null!;
    public string Payload { get; set; } = null!;

    public Guid? CorrelationId { get; set; }
    public Guid? TenantId { get; set; }

    public OutboxMessageStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? PublishedAt { get; set; }

    public int RetryCount { get; set; }
    public string? LastError { get; set; }
}

public enum OutboxMessageStatus
{
    Pending,
    Published,
    Failed
}
```

---

## 4. Phase 2: MassTransit + RabbitMQ Setup

### 4.1 Message Contracts

```csharp
// Messages/PublishPost.cs
public record PublishPost(
    Guid PostId,
    Guid TenantId,
    Guid SocialAccountId
);

// Messages/SendNotification.cs
public record SendNotification(
    Guid UserId,
    string NotificationType,
    Dictionary<string, string> Data
);

// Messages/TokenRefreshFailed.cs
public record TokenRefreshFailed(
    Guid SocialAccountId,
    Guid TenantId,
    string Platform,
    string Reason
);
```

### 4.2 MassTransit Configuration

```csharp
// Configuration/MassTransitConfiguration.cs
public static class MassTransitConfiguration
{
    public static IServiceCollection AddMassTransitWithRabbitMq(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddMassTransit(x =>
        {
            // Auto-discover consumers in this assembly
            x.AddConsumers(typeof(Program).Assembly);

            // Configure Entity Framework outbox (MANDATORY)
            x.AddEntityFrameworkOutbox<AppDbContext>(o =>
            {
                o.UsePostgres();

                // Enable the outbox for all consumers
                o.UseBusOutbox();

                // Query database every 5 seconds for pending messages
                o.QueryDelay = TimeSpan.FromSeconds(5);

                // Clean up delivered messages after 24 hours
                o.DuplicateDetectionWindow = TimeSpan.FromHours(24);
            });

            x.UsingRabbitMq((context, cfg) =>
            {
                var rabbitConfig = configuration.GetSection("RabbitMQ");

                cfg.Host(rabbitConfig["Host"], rabbitConfig["VirtualHost"], h =>
                {
                    h.Username(rabbitConfig["Username"]!);
                    h.Password(rabbitConfig["Password"]!);
                });

                // Global retry policy
                cfg.UseMessageRetry(r => r.Intervals(
                    TimeSpan.FromSeconds(5),
                    TimeSpan.FromSeconds(30),
                    TimeSpan.FromMinutes(2),
                    TimeSpan.FromMinutes(10)
                ));

                // Configure specific endpoints
                cfg.ReceiveEndpoint("publish-post", e =>
                {
                    e.PrefetchCount = 16;
                    e.ConcurrentMessageLimit = 10;
                    e.ConfigureConsumer<PublishPostConsumer>(context);
                });

                cfg.ReceiveEndpoint("send-notification", e =>
                {
                    e.PrefetchCount = 32;
                    e.ConcurrentMessageLimit = 20;
                    e.ConfigureConsumer<SendNotificationConsumer>(context);
                });

                // Auto-configure remaining endpoints
                cfg.ConfigureEndpoints(context);
            });
        });

        return services;
    }
}
```

### 4.3 appsettings.json

```json
{
  "RabbitMQ": {
    "Host": "localhost",
    "VirtualHost": "publyapp",
    "Username": "publyapp",
    "Password": "${RABBITMQ_PASSWORD}"
  },
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Database=publyapp;Username=publyapp;Password=${DB_PASSWORD}"
  },
  "Quartz": {
    "SchedulerName": "PublyAppScheduler",
    "AdvisoryLockId": 424242
  },
  "Worker": {
    "ClaimBatchSize": 50,
    "ClaimIntervalSeconds": 15,
    "StaleJobThresholdMinutes": 10
  }
}
```

---

## 5. Phase 3: Quartz.NET Scheduler

### 5.1 Quartz Configuration

```csharp
// Configuration/QuartzConfiguration.cs
public static class QuartzConfiguration
{
    public static IServiceCollection AddQuartzScheduler(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddQuartz(q =>
        {
            q.UseMicrosoftDependencyInjectionJobFactory();

            // Use PostgreSQL for job persistence
            q.UsePersistentStore(store =>
            {
                store.UsePostgres(postgres =>
                {
                    postgres.ConnectionString =
                        configuration.GetConnectionString("DefaultConnection")!;
                    postgres.TablePrefix = "qrtz_";
                });
                store.UseJsonSerializer();
                store.PerformSchemaValidation = true;
            });

            // Thread pool
            q.UseDefaultThreadPool(tp =>
            {
                tp.MaxConcurrency = 10;
            });

            // Register all jobs
            ConfigureSchedulingJobs(q);
            ConfigureSystemJobs(q);
        });

        services.AddQuartzHostedService(options =>
        {
            options.WaitForJobsToComplete = true;
        });

        return services;
    }

    private static void ConfigureSchedulingJobs(IServiceCollectionQuartzConfigurator q)
    {
        // Claim due posts - every 15 seconds
        q.AddJob<ClaimDuePostsJob>(opts => opts
            .WithIdentity("claim-due-posts", "scheduling")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("claim-due-posts", "scheduling")
            .WithIdentity("claim-due-posts-trigger")
            .WithSimpleSchedule(x => x
                .WithIntervalInSeconds(15)
                .RepeatForever()));

        // Recover stale jobs - every 5 minutes
        q.AddJob<RecoverStaleJobsJob>(opts => opts
            .WithIdentity("recover-stale-jobs", "scheduling")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("recover-stale-jobs", "scheduling")
            .WithIdentity("recover-stale-jobs-trigger")
            .WithCronSchedule("0 */5 * * * ?"));
    }

    private static void ConfigureSystemJobs(IServiceCollectionQuartzConfigurator q)
    {
        // Session cleanup - every hour
        q.AddJob<SessionCleanupJob>(opts => opts
            .WithIdentity("session-cleanup", "system")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("session-cleanup", "system")
            .WithIdentity("session-cleanup-trigger")
            .WithCronSchedule("0 0 * * * ?"));

        // Token refresh - every 6 hours
        q.AddJob<RefreshExpiringTokensJob>(opts => opts
            .WithIdentity("refresh-expiring-tokens", "oauth")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("refresh-expiring-tokens", "oauth")
            .WithIdentity("refresh-expiring-tokens-trigger")
            .WithCronSchedule("0 0 */6 * * ?"));

        // Validate scheduled posts - daily at 9 AM
        q.AddJob<ValidateScheduledPostsJob>(opts => opts
            .WithIdentity("validate-scheduled-posts", "posts")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("validate-scheduled-posts", "posts")
            .WithIdentity("validate-scheduled-posts-trigger")
            .WithCronSchedule("0 0 9 * * ?"));

        // DLQ Monitor - every 15 minutes
        q.AddJob<DlqMonitorJob>(opts => opts
            .WithIdentity("dlq-monitor", "monitoring")
            .StoreDurably());

        q.AddTrigger(opts => opts
            .ForJob("dlq-monitor", "monitoring")
            .WithIdentity("dlq-monitor-trigger")
            .WithCronSchedule("0 */15 * * * ?"));
    }
}
```

### 5.2 Scheduler Leadership Service (Advisory Lock)

```csharp
// Services/SchedulerLeadershipService.cs
public class SchedulerLeadershipService : BackgroundService
{
    private readonly NpgsqlDataSource _dataSource;
    private readonly ISchedulerFactory _schedulerFactory;
    private readonly ILogger<SchedulerLeadershipService> _logger;
    private readonly long _lockId;

    private bool _isLeader = false;
    private NpgsqlConnection? _lockConnection;

    public SchedulerLeadershipService(
        NpgsqlDataSource dataSource,
        ISchedulerFactory schedulerFactory,
        IConfiguration configuration,
        ILogger<SchedulerLeadershipService> logger)
    {
        _dataSource = dataSource;
        _schedulerFactory = schedulerFactory;
        _logger = logger;
        _lockId = configuration.GetValue<long>("Quartz:AdvisoryLockId", 424242);
    }

    public bool IsLeader => _isLeader;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
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
                _logger.LogError(ex, "Error in leadership service");
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }

        await ReleaseLeadershipAsync();
    }

    private async Task TryAcquireLeadershipAsync(CancellationToken ct)
    {
        _lockConnection = await _dataSource.OpenConnectionAsync(ct);

        var acquired = await _lockConnection.ExecuteScalarAsync<bool>(
            "SELECT pg_try_advisory_lock(@lockId)",
            new { lockId = _lockId });

        if (acquired)
        {
            _isLeader = true;
            _logger.LogInformation("This instance acquired scheduler leadership");

            // Start the Quartz scheduler
            var scheduler = await _schedulerFactory.GetScheduler(ct);
            if (!scheduler.IsStarted)
            {
                await scheduler.Start(ct);
                _logger.LogInformation("Quartz scheduler started");
            }

            // Hold the lock by keeping connection open
            // The lock is released when the connection closes
            try
            {
                await Task.Delay(Timeout.Infinite, ct);
            }
            catch (OperationCanceledException)
            {
                // Expected during shutdown
            }
        }
        else
        {
            _isLeader = false;
            _logger.LogInformation("Another instance is leader, waiting...");

            // Pause the scheduler on this instance
            var scheduler = await _schedulerFactory.GetScheduler(ct);
            if (scheduler.IsStarted)
            {
                await scheduler.Standby(ct);
                _logger.LogInformation("Quartz scheduler in standby mode");
            }

            await _lockConnection.CloseAsync();
            _lockConnection.Dispose();
            _lockConnection = null;

            await Task.Delay(TimeSpan.FromSeconds(30), ct);
        }
    }

    private async Task ReleaseLeadershipAsync()
    {
        if (_lockConnection != null)
        {
            try
            {
                await _lockConnection.ExecuteAsync(
                    "SELECT pg_advisory_unlock(@lockId)",
                    new { lockId = _lockId });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to explicitly release advisory lock");
            }
            finally
            {
                await _lockConnection.CloseAsync();
                _lockConnection.Dispose();
            }
        }

        _isLeader = false;
        _logger.LogInformation("Released scheduler leadership");
    }
}
```

### 5.3 Claim Due Posts Job

```csharp
// Jobs/Scheduling/ClaimDuePostsJob.cs
public class ClaimDuePostsJob : IJob
{
    private readonly AppDbContext _db;
    private readonly IBus _bus;
    private readonly ILogger<ClaimDuePostsJob> _logger;
    private readonly int _batchSize;

    public ClaimDuePostsJob(
        AppDbContext db,
        IBus bus,
        IConfiguration configuration,
        ILogger<ClaimDuePostsJob> logger)
    {
        _db = db;
        _bus = bus;
        _logger = logger;
        _batchSize = configuration.GetValue("Worker:ClaimBatchSize", 50);
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;

        try
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(ct);

            // Claim due posts atomically with FOR UPDATE SKIP LOCKED
            var duePosts = await _db.ScheduledPosts
                .FromSqlRaw("""
                    UPDATE scheduled_posts
                    SET status = 'processing', claimed_at = now(), updated_at = now()
                    WHERE id IN (
                        SELECT id FROM scheduled_posts
                        WHERE status = 'scheduled'
                        AND publish_at_utc <= now()
                        ORDER BY publish_at_utc
                        FOR UPDATE SKIP LOCKED
                        LIMIT {0}
                    )
                    RETURNING *
                    """, _batchSize)
                .ToListAsync(ct);

            if (duePosts.Count == 0)
            {
                await transaction.RollbackAsync(ct);
                return;
            }

            _logger.LogInformation("Claimed {Count} due posts for publishing", duePosts.Count);

            // Write to outbox (same transaction)
            foreach (var post in duePosts)
            {
                var message = new PublishPost(post.Id, post.TenantId, post.SocialAccountId);

                _db.OutboxMessages.Add(new OutboxMessage
                {
                    Id = Guid.NewGuid(),
                    MessageType = nameof(PublishPost),
                    Payload = JsonSerializer.Serialize(message),
                    CorrelationId = post.Id,
                    TenantId = post.TenantId,
                    Status = OutboxMessageStatus.Pending,
                    CreatedAt = DateTime.UtcNow
                });
            }

            await _db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);

            _logger.LogInformation("Enqueued {Count} posts for publishing", duePosts.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to claim due posts");
            throw;
        }
    }
}
```

### 5.4 Recover Stale Jobs

```csharp
// Jobs/Scheduling/RecoverStaleJobsJob.cs
public class RecoverStaleJobsJob : IJob
{
    private readonly AppDbContext _db;
    private readonly ILogger<RecoverStaleJobsJob> _logger;
    private readonly int _staleThresholdMinutes;

    public RecoverStaleJobsJob(
        AppDbContext db,
        IConfiguration configuration,
        ILogger<RecoverStaleJobsJob> logger)
    {
        _db = db;
        _logger = logger;
        _staleThresholdMinutes = configuration.GetValue("Worker:StaleJobThresholdMinutes", 10);
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        var staleThreshold = DateTime.UtcNow.AddMinutes(-_staleThresholdMinutes);

        var recovered = await _db.ScheduledPosts
            .Where(p => p.Status == PostStatus.Processing)
            .Where(p => p.ClaimedAt < staleThreshold)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.Status, PostStatus.Scheduled)
                .SetProperty(p => p.ClaimedAt, (DateTime?)null)
                .SetProperty(p => p.RetryCount, p => p.RetryCount + 1)
                .SetProperty(p => p.LastError, "Recovered from stale processing state")
                .SetProperty(p => p.UpdatedAt, DateTime.UtcNow), ct);

        if (recovered > 0)
        {
            _logger.LogWarning("Recovered {Count} stale jobs back to scheduled state", recovered);
        }
    }
}
```

---

## 6. Phase 4: Job Handlers & Consumers

### 6.1 PublishPostConsumer (Main Publishing Logic)

```csharp
// Consumers/Posts/PublishPostConsumer.cs
public class PublishPostConsumer : IConsumer<PublishPost>
{
    private readonly AppDbContext _db;
    private readonly ISocialMediaClientFactory _clientFactory;
    private readonly IOAuthService _oauthService;
    private readonly SocialMediaRateLimiter _rateLimiter;
    private readonly INotificationService _notifications;
    private readonly ILogger<PublishPostConsumer> _logger;

    public PublishPostConsumer(
        AppDbContext db,
        ISocialMediaClientFactory clientFactory,
        IOAuthService oauthService,
        SocialMediaRateLimiter rateLimiter,
        INotificationService notifications,
        ILogger<PublishPostConsumer> logger)
    {
        _db = db;
        _clientFactory = clientFactory;
        _oauthService = oauthService;
        _rateLimiter = rateLimiter;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<PublishPost> context)
    {
        var postId = context.Message.PostId;
        var ct = context.CancellationToken;

        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = context.CorrelationId ?? Guid.Empty,
            ["PostId"] = postId,
            ["TenantId"] = context.Message.TenantId
        });

        _logger.LogInformation("Processing PublishPost for post {PostId}", postId);

        var post = await _db.ScheduledPosts
            .Include(p => p.SocialAccount)
            .FirstOrDefaultAsync(p => p.Id == postId, ct);

        if (post == null)
        {
            _logger.LogWarning("Post {PostId} not found", postId);
            return; // Ack the message, don't retry
        }

        // IDEMPOTENCY CHECK 1: Already published?
        if (post.Status == PostStatus.Published)
        {
            _logger.LogInformation("Post {PostId} already published, skipping", postId);
            return;
        }

        // IDEMPOTENCY CHECK 2: Partial success? (API succeeded, DB update failed)
        if (!string.IsNullOrEmpty(post.PlatformPostId))
        {
            _logger.LogWarning("Post {PostId} has platform ID but not marked published. Fixing state.", postId);
            post.Status = PostStatus.Published;
            post.PublishedAt = DateTime.UtcNow;
            post.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            return;
        }

        // IDEMPOTENCY CHECK 3: Was cancelled?
        if (post.Status == PostStatus.Cancelled)
        {
            _logger.LogInformation("Post {PostId} was cancelled, skipping", postId);
            return;
        }

        var account = post.SocialAccount;

        // Check token expiry
        if (account.TokenExpiresAt < DateTime.UtcNow.AddMinutes(5))
        {
            _logger.LogInformation("Token expiring soon for account {AccountId}, attempting refresh", account.Id);

            try
            {
                await _oauthService.RefreshTokenAsync(account, ct);
                await _db.SaveChangesAsync(ct);
            }
            catch (OAuthRefreshException ex)
            {
                await FailPost(post, $"Token expired and could not be refreshed: {ex.Message}", ct);
                await _notifications.NotifyPostFailedDueToTokenAsync(post, ct);
                return; // Don't retry
            }
        }

        // Check rate limit
        if (!await _rateLimiter.CanPublishAsync(account.Id, account.Platform, ct))
        {
            _logger.LogWarning("Rate limit reached for account {AccountId} on {Platform}",
                account.Id, account.Platform);

            // Reschedule for later
            post.PublishAtUtc = DateTime.UtcNow.Date.AddDays(1).AddHours(9);
            post.Status = PostStatus.Scheduled;
            post.ClaimedAt = null;
            post.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            await _notifications.NotifyRateLimitHitAsync(post, ct);
            return;
        }

        // Mark as processing
        post.Status = PostStatus.Processing;
        post.ClaimedAt = DateTime.UtcNow;
        post.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        try
        {
            // Get platform-specific client
            var client = _clientFactory.GetClient(account.Platform);

            // Create idempotency key
            var idempotencyKey = $"publyapp-{post.Id}-{post.RetryCount}";

            // Call external API
            var result = await client.PublishAsync(
                account.AccessToken,
                post.Content,
                post.MediaUrls,
                idempotencyKey,
                ct);

            // Store platform ID IMMEDIATELY (checkpoint)
            post.PlatformPostId = result.PostId;
            await _db.SaveChangesAsync(ct);

            // Record rate limit usage
            await _rateLimiter.RecordPublishAsync(account.Id, account.Platform, ct);

            // Update full status
            post.Status = PostStatus.Published;
            post.PublishedAt = DateTime.UtcNow;
            post.PlatformUrl = result.PostUrl;
            post.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation("Successfully published post {PostId} to {Platform}",
                postId, account.Platform);
        }
        catch (RateLimitException ex)
        {
            // Platform rate limit - reschedule
            var retryAfter = ex.RetryAfter ?? TimeSpan.FromMinutes(15);
            post.Status = PostStatus.Scheduled;
            post.PublishAtUtc = DateTime.UtcNow.Add(retryAfter);
            post.ClaimedAt = null;
            post.LastError = $"Rate limited by {account.Platform}. Rescheduled.";
            post.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            _logger.LogWarning("Platform rate limit hit, rescheduled post {PostId} for {NewTime}",
                postId, post.PublishAtUtc);
        }
        catch (Exception ex)
        {
            post.RetryCount++;
            post.LastError = ex.Message;
            post.UpdatedAt = DateTime.UtcNow;

            if (post.RetryCount >= post.MaxRetries)
            {
                await FailPost(post, ex.Message, ct);
                await _notifications.NotifyPostFailedAsync(post, ct);
            }
            else
            {
                post.Status = PostStatus.Scheduled;
                post.ClaimedAt = null;
                await _db.SaveChangesAsync(ct);
                throw; // Let MassTransit handle retry with backoff
            }
        }
    }

    private async Task FailPost(ScheduledPost post, string error, CancellationToken ct)
    {
        post.Status = PostStatus.Failed;
        post.LastError = error;
        post.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        _logger.LogError("Post {PostId} failed permanently: {Error}", post.Id, error);
    }
}
```

### 6.2 System Jobs

```csharp
// Jobs/System/SessionCleanupJob.cs
public class SessionCleanupJob : IJob
{
    private readonly AppDbContext _db;
    private readonly ILogger<SessionCleanupJob> _logger;

    public SessionCleanupJob(AppDbContext db, ILogger<SessionCleanupJob> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var deleted = await _db.Sessions
            .Where(s => s.ExpiresAt < DateTime.UtcNow)
            .ExecuteDeleteAsync(context.CancellationToken);

        _logger.LogInformation("Deleted {Count} expired sessions", deleted);
    }
}
```

```csharp
// Jobs/System/RefreshExpiringTokensJob.cs
public class RefreshExpiringTokensJob : IJob
{
    private readonly AppDbContext _db;
    private readonly IOAuthService _oauthService;
    private readonly INotificationService _notifications;
    private readonly ILogger<RefreshExpiringTokensJob> _logger;

    public RefreshExpiringTokensJob(
        AppDbContext db,
        IOAuthService oauthService,
        INotificationService notifications,
        ILogger<RefreshExpiringTokensJob> logger)
    {
        _db = db;
        _oauthService = oauthService;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        var warningThreshold = DateTime.UtcNow.AddHours(48);

        var expiringAccounts = await _db.SocialAccounts
            .Include(a => a.Tenant)
            .Where(a => a.TokenExpiresAt < warningThreshold)
            .Where(a => a.TokenExpiresAt > DateTime.UtcNow)
            .Where(a => !a.IsRefreshFailed)
            .ToListAsync(ct);

        _logger.LogInformation("Found {Count} tokens to refresh", expiringAccounts.Count);

        foreach (var account in expiringAccounts)
        {
            try
            {
                await _oauthService.RefreshTokenAsync(account, ct);

                account.LastRefreshedAt = DateTime.UtcNow;
                account.RefreshFailCount = 0;
                account.IsRefreshFailed = false;

                _logger.LogInformation("Refreshed token for account {AccountId} ({Platform})",
                    account.Id, account.Platform);
            }
            catch (OAuthRefreshException ex) when (ex.IsRecoverable)
            {
                account.RefreshFailCount++;
                _logger.LogWarning(ex, "Temporary failure refreshing token for account {AccountId}",
                    account.Id);
            }
            catch (OAuthRefreshException ex)
            {
                account.IsRefreshFailed = true;
                account.RefreshFailReason = ex.Message;

                _logger.LogError(ex, "Permanent failure refreshing token for account {AccountId}",
                    account.Id);

                await _notifications.SendAsync(
                    account.Tenant.UserId,
                    new TokenRefreshFailedNotification
                    {
                        AccountId = account.Id,
                        Platform = account.Platform,
                        Reason = ex.Message
                    }, ct);
            }
        }

        await _db.SaveChangesAsync(ct);
    }
}
```

```csharp
// Jobs/System/ValidateScheduledPostsJob.cs
public class ValidateScheduledPostsJob : IJob
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notifications;
    private readonly ILogger<ValidateScheduledPostsJob> _logger;

    public ValidateScheduledPostsJob(
        AppDbContext db,
        INotificationService notifications,
        ILogger<ValidateScheduledPostsJob> logger)
    {
        _db = db;
        _notifications = notifications;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var ct = context.CancellationToken;
        var horizon = DateTime.UtcNow.AddDays(7);

        // Find posts scheduled in the next 7 days with expiring tokens
        var postsWithExpiringTokens = await _db.ScheduledPosts
            .Include(p => p.SocialAccount)
            .ThenInclude(a => a.Tenant)
            .Where(p => p.Status == PostStatus.Scheduled)
            .Where(p => p.PublishAtUtc < horizon)
            .Where(p => p.SocialAccount.TokenExpiresAt < p.PublishAtUtc)
            .ToListAsync(ct);

        foreach (var post in postsWithExpiringTokens)
        {
            _logger.LogWarning(
                "Post {PostId} scheduled for {PublishAt} but token expires {TokenExpiry}",
                post.Id, post.PublishAtUtc, post.SocialAccount.TokenExpiresAt);

            await _notifications.SendAsync(
                post.SocialAccount.Tenant.UserId,
                new TokenExpiringBeforeScheduledPostNotification
                {
                    PostId = post.Id,
                    PostTitle = post.Content.Length > 50 ? post.Content[..50] + "..." : post.Content,
                    ScheduledFor = post.PublishAtUtc,
                    TokenExpiresAt = post.SocialAccount.TokenExpiresAt,
                    Platform = post.SocialAccount.Platform
                }, ct);
        }

        _logger.LogInformation("Validated {Count} posts with expiring tokens", postsWithExpiringTokens.Count);
    }
}
```

---

## 7. Phase 5: Reliability Patterns

### 7.1 Rate Limiter Service

```csharp
// Services/SocialMediaRateLimiter.cs
public class SocialMediaRateLimiter
{
    private readonly IDistributedCache _cache;

    public SocialMediaRateLimiter(IDistributedCache cache)
    {
        _cache = cache;
    }

    public async Task<bool> CanPublishAsync(Guid accountId, string platform, CancellationToken ct = default)
    {
        var key = $"rate-limit:{platform}:{accountId}:{DateTime.UtcNow:yyyy-MM-dd}";
        var countStr = await _cache.GetStringAsync(key, ct);
        var count = int.TryParse(countStr, out var c) ? c : 0;

        var limit = GetDailyLimit(platform);
        return count < limit;
    }

    public async Task RecordPublishAsync(Guid accountId, string platform, CancellationToken ct = default)
    {
        var key = $"rate-limit:{platform}:{accountId}:{DateTime.UtcNow:yyyy-MM-dd}";
        var countStr = await _cache.GetStringAsync(key, ct);
        var count = int.TryParse(countStr, out var c) ? c : 0;

        await _cache.SetStringAsync(
            key,
            (count + 1).ToString(),
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(25)
            }, ct);
    }

    private static int GetDailyLimit(string platform) => platform.ToLower() switch
    {
        "linkedin" => 100,
        "twitter" => 200,
        "facebook" => 200,
        "instagram" => 25,
        _ => 50
    };
}
```

### 7.2 Outbox Publisher (for non-MassTransit messages)

```csharp
// Infrastructure/OutboxPublisher.cs
public class OutboxPublisher : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly IBus _bus;
    private readonly ILogger<OutboxPublisher> _logger;

    public OutboxPublisher(
        IServiceProvider services,
        IBus bus,
        ILogger<OutboxPublisher> logger)
    {
        _services = services;
        _bus = bus;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var pendingMessages = await db.OutboxMessages
                    .Where(m => m.Status == OutboxMessageStatus.Pending)
                    .OrderBy(m => m.CreatedAt)
                    .Take(100)
                    .ToListAsync(ct);

                foreach (var message in pendingMessages)
                {
                    try
                    {
                        var payload = DeserializeMessage(message);
                        await _bus.Publish(payload, ct);

                        message.Status = OutboxMessageStatus.Published;
                        message.PublishedAt = DateTime.UtcNow;
                    }
                    catch (Exception ex)
                    {
                        message.RetryCount++;
                        message.LastError = ex.Message;

                        if (message.RetryCount >= 5)
                            message.Status = OutboxMessageStatus.Failed;

                        _logger.LogError(ex, "Failed to publish outbox message {MessageId}", message.Id);
                    }
                }

                await db.SaveChangesAsync(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in outbox publisher");
            }

            await Task.Delay(TimeSpan.FromSeconds(5), ct);
        }
    }

    private object DeserializeMessage(OutboxMessage message)
    {
        return message.MessageType switch
        {
            nameof(PublishPost) => JsonSerializer.Deserialize<PublishPost>(message.Payload)!,
            nameof(SendNotification) => JsonSerializer.Deserialize<SendNotification>(message.Payload)!,
            _ => throw new InvalidOperationException($"Unknown message type: {message.MessageType}")
        };
    }
}
```

### 7.3 Timezone Service

```csharp
// Services/TimezoneService.cs
public class TimezoneService
{
    private readonly IDateTimeZoneProvider _tzProvider;

    public TimezoneService()
    {
        _tzProvider = DateTimeZoneProviders.Tzdb;
    }

    public DateTime ConvertToUtc(DateTime localDateTime, string timeZoneId)
    {
        var tz = _tzProvider.GetZoneOrNull(timeZoneId)
            ?? throw new ArgumentException($"Invalid timezone: {timeZoneId}");

        var localDt = LocalDateTime.FromDateTime(localDateTime);
        var zonedDt = localDt.InZoneLeniently(tz);
        return zonedDt.ToInstant().ToDateTimeUtc();
    }

    public DateTime ConvertFromUtc(DateTime utcDateTime, string timeZoneId)
    {
        var tz = _tzProvider.GetZoneOrNull(timeZoneId) ?? DateTimeZone.Utc;
        var instant = Instant.FromDateTimeUtc(DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc));
        var zonedDt = instant.InZone(tz);
        return zonedDt.LocalDateTime.ToDateTimeUnspecified();
    }

    public bool IsValidTimeZone(string timeZoneId)
    {
        return _tzProvider.GetZoneOrNull(timeZoneId) != null;
    }
}
```

---

## 8. Phase 6: Observability & Monitoring

### 8.1 DLQ Monitor Job

```csharp
// Jobs/System/DlqMonitorJob.cs
public class DlqMonitorJob : IJob
{
    private readonly IConnection _rabbitConnection;
    private readonly IAlertService _alerts;
    private readonly ILogger<DlqMonitorJob> _logger;

    private readonly string[] _queuesToMonitor =
    {
        "publish-post_error",
        "send-notification_error",
        "process-webhook_error"
    };

    public DlqMonitorJob(
        IConnection rabbitConnection,
        IAlertService alerts,
        ILogger<DlqMonitorJob> logger)
    {
        _rabbitConnection = rabbitConnection;
        _alerts = alerts;
        _logger = logger;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        using var channel = _rabbitConnection.CreateModel();

        var totalErrors = 0;
        var queueDetails = new List<QueueErrorCount>();

        foreach (var queueName in _queuesToMonitor)
        {
            try
            {
                var queueDeclare = channel.QueueDeclarePassive(queueName);
                var messageCount = queueDeclare.MessageCount;

                if (messageCount > 0)
                {
                    totalErrors += (int)messageCount;
                    queueDetails.Add(new QueueErrorCount(queueName, (int)messageCount));

                    _logger.LogWarning("Dead letter queue {Queue} has {Count} messages",
                        queueName, messageCount);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to check queue {Queue}", queueName);
            }
        }

        if (totalErrors > 0)
        {
            await _alerts.SendAsync(new DlqAlertNotification
            {
                TotalFailedMessages = totalErrors,
                Queues = queueDetails,
                CheckedAt = DateTime.UtcNow
            });
        }
    }
}

public record QueueErrorCount(string QueueName, int Count);
```

### 8.2 Health Check Endpoints

```csharp
// Add to Program.cs
builder.Services.AddHealthChecks()
    .AddNpgSql(configuration.GetConnectionString("DefaultConnection")!)
    .AddRabbitMQ(rabbitConnectionString: configuration["RabbitMQ:ConnectionString"]!)
    .AddCheck<SchedulerHealthCheck>("scheduler");

// Custom health check
public class SchedulerHealthCheck : IHealthCheck
{
    private readonly SchedulerLeadershipService _leadershipService;
    private readonly ISchedulerFactory _schedulerFactory;

    public SchedulerHealthCheck(
        SchedulerLeadershipService leadershipService,
        ISchedulerFactory schedulerFactory)
    {
        _leadershipService = leadershipService;
        _schedulerFactory = schedulerFactory;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken ct = default)
    {
        var scheduler = await _schedulerFactory.GetScheduler(ct);

        var data = new Dictionary<string, object>
        {
            ["IsLeader"] = _leadershipService.IsLeader,
            ["SchedulerStarted"] = scheduler.IsStarted,
            ["SchedulerInStandby"] = scheduler.InStandbyMode
        };

        if (_leadershipService.IsLeader && !scheduler.IsStarted)
        {
            return HealthCheckResult.Unhealthy("Leader but scheduler not started", data: data);
        }

        return HealthCheckResult.Healthy("Scheduler healthy", data);
    }
}
```

---

## 9. Phase 7: Deployment & Operations

### 9.1 Docker Compose (VPS)

```yaml
# docker-compose.yml
version: '3.8'

services:
  rabbitmq:
    image: rabbitmq:3.12-management
    container_name: publyapp-rabbitmq
    hostname: publyapp-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: publyapp
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
      RABBITMQ_DEFAULT_VHOST: publyapp
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
    ports:
      - "5672:5672"
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

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
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: src/PublyApp.Worker/Dockerfile
    container_name: publyapp-worker
    environment:
      - ConnectionStrings__DefaultConnection=Host=postgres;Database=publyapp;Username=publyapp;Password=${DB_PASSWORD}
      - RabbitMQ__Host=rabbitmq
      - RabbitMQ__VirtualHost=publyapp
      - RabbitMQ__Username=publyapp
      - RabbitMQ__Password=${RABBITMQ_PASSWORD}
    depends_on:
      rabbitmq:
        condition: service_healthy
      postgres:
        condition: service_healthy
    stop_grace_period: 60s
    restart: unless-stopped
    deploy:
      replicas: 2

volumes:
  rabbitmq_data:
  postgres_data:
```

### 9.2 rabbitmq.conf

```ini
# rabbitmq.conf
vm_memory_high_watermark.relative = 0.6
disk_free_limit.absolute = 2GB
consumer_timeout = 1800000
```

### 9.3 Graceful Shutdown Configuration

```csharp
// Program.cs
builder.Host.ConfigureHostOptions(options =>
{
    options.ShutdownTimeout = TimeSpan.FromSeconds(60);
});

builder.Services.AddMassTransit(x =>
{
    // ... other config
    x.SetBusStopTimeout(TimeSpan.FromSeconds(30));
});

builder.Services.AddQuartzHostedService(options =>
{
    options.WaitForJobsToComplete = true;
});
```

---

## 10. Migration Path to GCP

### 10.1 Path A: GKE (Recommended)

```yaml
# kubernetes/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: publyapp-worker
spec:
  replicas: 3
  template:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: worker
          image: gcr.io/your-project/publyapp-worker:latest
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          env:
            - name: ConnectionStrings__DefaultConnection
              valueFrom:
                secretKeyRef:
                  name: publyapp-secrets
                  key: db-connection
```

### 10.2 Path B: Cloud Run + Pub/Sub (Later)

If you want to go fully serverless later, swap RabbitMQ for GCP Pub/Sub:

```csharp
// MassTransit supports Pub/Sub - change transport only
services.AddMassTransit(x =>
{
    x.UsingGooglePubSub((context, cfg) =>
    {
        cfg.Host(projectId);
        cfg.ConfigureEndpoints(context);
    });
});
```

---

## 11. Checklist Summary

### Phase 0: Prerequisites
- [ ] Create PublyApp.Worker project
- [ ] Install all required packages
- [ ] Set up project structure

### Phase 1: Database
- [ ] Create scheduled_posts table with all indexes
- [ ] Create outbox_messages table
- [ ] Add token management fields to social_accounts
- [ ] Create EF Core entities and DbContext configuration

### Phase 2: MassTransit + RabbitMQ
- [ ] Configure MassTransit with RabbitMQ transport
- [ ] Enable Entity Framework outbox (MANDATORY)
- [ ] Configure retry policies
- [ ] Define message contracts

### Phase 3: Quartz Scheduler
- [ ] Configure Quartz with PostgreSQL persistence
- [ ] Implement SchedulerLeadershipService with advisory lock
- [ ] Register all scheduling and system jobs
- [ ] Configure triggers and cron expressions

### Phase 4: Job Handlers
- [ ] Implement PublishPostConsumer with full idempotency
- [ ] Implement all system jobs (cleanup, token refresh, validation)
- [ ] Add proper error handling and logging

### Phase 5: Reliability
- [ ] Implement SocialMediaRateLimiter
- [ ] Implement OutboxPublisher
- [ ] Implement TimezoneService with NodaTime
- [ ] Add RecoverStaleJobsJob

### Phase 6: Observability
- [ ] Implement DlqMonitorJob
- [ ] Add health check endpoints
- [ ] Configure structured logging with Serilog
- [ ] Set up alerting (email/Slack)

### Phase 7: Deployment
- [ ] Create Docker Compose configuration
- [ ] Configure graceful shutdown
- [ ] Test multi-instance deployment with advisory lock
- [ ] Document operational procedures

---

## Final Notes

This implementation plan represents the synthesis of extensive architectural discussions. The key insights:

1. **Start with the full architecture** — RabbitMQ + MassTransit + Quartz gives you the right foundation
2. **The outbox pattern is non-negotiable** — Without it, you have distributed transaction failures waiting to happen
3. **Advisory lock is elegant** — Simple, PostgreSQL-native, no external dependencies
4. **Idempotency requires thought** — Check before execute, store platform IDs immediately, handle partial failures
5. **Plan for tokens expiring** — Proactive refresh + validation prevents silent failures
6. **Monitor your DLQs** — Failed jobs are invisible problems without active monitoring

Build with confidence. This architecture scales from MVP to millions of users.

---

*Document synthesized from conversations with Claude (Anthropic) and ChatGPT (OpenAI), January 2026*
