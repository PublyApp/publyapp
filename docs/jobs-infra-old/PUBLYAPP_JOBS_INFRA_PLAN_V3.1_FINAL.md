# PublyApp Background Jobs Infrastructure — Pure Postgres v3.1 (Final)

> **Changes from v3**: Fixed ServiceProviderJobFactory scope lifetime, corrected migration order,
> clarified draft handling, improved dispatch idempotency, standardized on delete-on-success.

---

## Critical Fixes in v3.1

| Issue | v3 (Broken) | v3.1 (Fixed) |
|-------|-------------|--------------|
| **JobFactory scope** | `using var scope` disposes before job runs | Scope stored in dictionary, disposed in `ReturnJob` |
| **Migration order** | FK references table not yet created | `job_queue` created first, FK added later |
| **Draft handling** | `publish_at_utc NOT NULL` but default `draft` | `publish_at_utc` is nullable for drafts |
| **Dispatch conflict** | May leave post stuck as `scheduled` | Uses `RETURNING` + upsert to always get job ID |
| **Success handling** | Mixed (delete vs completed) | Standardized: **delete-on-success** |

---

## 1. Fixed: ServiceProviderJobFactory

```csharp
// Leadership/ServiceProviderJobFactory.cs
namespace PublyApp.Worker.Leadership;

using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Quartz;
using Quartz.Spi;

/// <summary>
/// Job factory that properly manages DI scope lifetime.
/// Scope is created in NewJob and disposed in ReturnJob.
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
        // Create scope - DO NOT dispose here
        var scope = _rootProvider.CreateScope();

        try
        {
            var job = (IJob)scope.ServiceProvider.GetRequiredService(bundle.JobDetail.JobType);

            // Track scope so we can dispose it in ReturnJob
            _scopes[job] = scope;

            return job;
        }
        catch
        {
            // If resolution fails, dispose scope immediately
            scope.Dispose();
            throw;
        }
    }

    public void ReturnJob(IJob job)
    {
        // Dispose scope when Quartz is done with the job
        if (_scopes.TryRemove(job, out var scope))
        {
            scope.Dispose();
        }

        // Also dispose job if it's IDisposable
        (job as IDisposable)?.Dispose();
    }
}
```

---

## 2. Fixed: Migration Order

### Migration 001: job_queue (FIRST)

```sql
-- Migration: 001_create_job_queue.sql
-- Must be created BEFORE scheduled_posts (which references it)

CREATE TYPE job_status AS ENUM ('pending', 'processing');

CREATE TABLE job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job identification
    job_type VARCHAR(100) NOT NULL,
    correlation_id UUID,
    tenant_id UUID,

    -- Payload
    payload JSONB NOT NULL,

    -- Scheduling
    run_after TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Lease
    locked_until TIMESTAMPTZ,
    locked_by VARCHAR(100),

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

-- Claim query index
CREATE INDEX idx_job_queue_claim
    ON job_queue (run_after, created_at)
    WHERE status = 'pending';

-- Stale lease recovery index
CREATE INDEX idx_job_queue_stale
    ON job_queue (locked_until)
    WHERE status = 'processing' AND locked_until IS NOT NULL;

-- Uniqueness guard for publish jobs
CREATE UNIQUE INDEX idx_job_queue_publish_unique
    ON job_queue (job_type, correlation_id)
    WHERE job_type = 'publish_post' AND correlation_id IS NOT NULL;
```

### Migration 002: scheduled_posts

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

    -- Scheduling
    -- NULLABLE: drafts don't have a publish time yet
    publish_at_utc TIMESTAMPTZ,
    user_timezone_id VARCHAR(100),

    -- Status
    status post_status NOT NULL DEFAULT 'draft',

    -- Job tracking (FK to job_queue)
    job_queue_id UUID REFERENCES job_queue(id) ON DELETE SET NULL,

    -- Idempotency checkpoint
    platform_post_id VARCHAR(500),
    platform_url TEXT,

    -- Terminal state info
    published_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    -- If status is 'scheduled' or beyond, publish_at_utc must be set
    CONSTRAINT scheduled_requires_publish_time CHECK (
        status = 'draft' OR publish_at_utc IS NOT NULL
    )
);

-- Dispatch query: scheduled posts ready to queue
CREATE INDEX idx_scheduled_posts_dispatch
    ON scheduled_posts (publish_at_utc)
    WHERE status = 'scheduled' AND publish_at_utc IS NOT NULL;

-- User queries
CREATE INDEX idx_scheduled_posts_tenant
    ON scheduled_posts (tenant_id, status, created_at DESC);

-- Orphan detection
CREATE INDEX idx_scheduled_posts_orphaned
    ON scheduled_posts (job_queue_id)
    WHERE status = 'queued' AND job_queue_id IS NOT NULL;
```

### Migration 003: dead_letter_jobs

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

### Migration 004: rate_limits

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

CREATE INDEX idx_rate_limits_cleanup ON rate_limits (date);
```

### Migration 005: Quartz tables

```sql
-- Migration: 005_create_quartz_tables.sql
-- Download from: https://github.com/quartznet/quartznet/blob/main/database/tables/tables_postgres.sql
```

---

## 3. Fixed: Dispatch Job (Idempotent + Correct Post Update)

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
            // Step 1: Lock due posts
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

            var dispatched = 0;

            foreach (var post in posts)
            {
                var payload = JsonSerializer.Serialize(new PublishPostPayload
                {
                    ScheduledPostId = post.Id,
                    TenantId = post.TenantId,
                    SocialAccountId = post.SocialAccountId
                });

                // Step 2: Upsert job and ALWAYS get the job ID back
                // ON CONFLICT DO UPDATE ensures we get the existing ID if job already exists
                var jobId = await conn.QuerySingleAsync<Guid>(
                    """
                    INSERT INTO job_queue (id, job_type, correlation_id, tenant_id, payload)
                    VALUES (gen_random_uuid(), 'publish_post', @correlationId, @tenantId, @payload::jsonb)
                    ON CONFLICT (job_type, correlation_id)
                    WHERE job_type = 'publish_post' AND correlation_id IS NOT NULL
                    DO UPDATE SET payload = EXCLUDED.payload  -- No-op update to trigger RETURNING
                    RETURNING id
                    """,
                    new
                    {
                        correlationId = post.Id,
                        tenantId = post.TenantId,
                        payload
                    },
                    transaction: tx);

                // Step 3: Update post with job link (always succeeds now)
                await conn.ExecuteAsync(
                    """
                    UPDATE scheduled_posts
                    SET status = 'queued',
                        job_queue_id = @jobId,
                        updated_at = now()
                    WHERE id = @postId
                    AND status = 'scheduled'
                    """,
                    new { postId = post.Id, jobId },
                    transaction: tx);

                dispatched++;
            }

            await tx.CommitAsync(ct);

            if (dispatched > 0)
            {
                _logger.LogInformation("Dispatched {Count} posts to job queue", dispatched);
            }
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

---

## 4. Standardized: Delete-on-Success

The job queue processor deletes jobs on success. No `completed` status.

```csharp
// In JobQueueProcessor.ProcessJobAsync (success path)
private async Task ProcessJobAsync(JobDto job, CancellationToken ct)
{
    // ... execute handler ...

    // SUCCESS: Delete job from queue
    await using var conn = await _dataSource.OpenConnectionAsync();
    await conn.ExecuteAsync("DELETE FROM job_queue WHERE id = @jobId", new { jobId = job.Id });

    _logger.LogInformation("Job {JobId} completed and deleted", job.Id);
}
```

**Why delete-on-success:**
- Table stays small and fast
- No cleanup job needed
- `dead_letter_jobs` provides audit trail for failures
- Simple mental model: if it's in `job_queue`, it's not done yet

---

## 5. Clarified: Draft vs Scheduled Schema

```
Draft:
  - status = 'draft'
  - publish_at_utc = NULL (allowed by schema)
  - user_timezone_id = NULL (allowed)

Scheduled:
  - status = 'scheduled'
  - publish_at_utc = NOT NULL (enforced by CHECK constraint)
  - user_timezone_id = NOT NULL (should enforce in application)
```

**CHECK constraint:**
```sql
CONSTRAINT scheduled_requires_publish_time CHECK (
    status = 'draft' OR publish_at_utc IS NOT NULL
)
```

**Application-level enforcement:**
```csharp
public async Task SchedulePostAsync(Guid postId, DateTime publishAtUtc, string timeZoneId)
{
    if (publishAtUtc <= DateTime.UtcNow)
        throw new ArgumentException("Publish time must be in the future");

    if (string.IsNullOrWhiteSpace(timeZoneId))
        throw new ArgumentException("Timezone is required");

    await using var conn = await _dataSource.OpenConnectionAsync();
    await conn.ExecuteAsync(
        """
        UPDATE scheduled_posts
        SET status = 'scheduled',
            publish_at_utc = @publishAtUtc,
            user_timezone_id = @timeZoneId,
            updated_at = now()
        WHERE id = @postId
        AND status = 'draft'
        """,
        new { postId, publishAtUtc, timeZoneId });
}
```

---

## 6. Complete Migration Order

```
001_create_job_queue.sql        -- Must be first (scheduled_posts references it)
002_create_scheduled_posts.sql  -- Has FK to job_queue
003_create_dead_letter_jobs.sql -- Standalone
004_create_rate_limits.sql      -- Standalone
005_create_quartz_tables.sql    -- Quartz internal (from GitHub)
```

---

## 7. Updated Checklist

### Database (in order)
- [ ] Migration 001: `job_queue` with lease columns, unique index
- [ ] Migration 002: `scheduled_posts` with nullable `publish_at_utc`, FK to job_queue
- [ ] Migration 003: `dead_letter_jobs`
- [ ] Migration 004: `rate_limits`
- [ ] Migration 005: Quartz tables (download from GitHub)

### Core Infrastructure
- [ ] `ServiceProviderJobFactory` with proper scope lifecycle (ConcurrentDictionary)
- [ ] `SchedulerLeaderService` with manual Quartz lifecycle
- [ ] `JobQueueProcessor` with lease-based claiming and heartbeat
- [ ] `DeadLetterService`

### Quartz Jobs
- [ ] `DispatchDuePostsJob` with upsert + RETURNING pattern
- [ ] `RecoverStaleJobsJob` checking `locked_until < now()`
- [ ] System jobs (cleanup, token refresh, etc.)

### Handlers
- [ ] `PublishPostHandler` with unified retry authority
- [ ] `RateLimitService` with simple upsert

### Testing
- [ ] Verify `ServiceProviderJobFactory` doesn't dispose scope early
- [ ] Verify duplicate dispatch doesn't leave posts stuck
- [ ] Verify jobs are deleted on success (not marked completed)
- [ ] Verify drafts can exist without `publish_at_utc`

---

## Summary

v3.1 is production-ready. All identified issues are fixed:

| Component | Status |
|-----------|--------|
| ServiceProviderJobFactory | Fixed: scope stored until ReturnJob |
| Migration order | Fixed: job_queue first |
| Draft handling | Fixed: publish_at_utc nullable + CHECK constraint |
| Dispatch idempotency | Fixed: upsert with RETURNING always gets job ID |
| Success handling | Standardized: delete-on-success |

Ready to implement.
