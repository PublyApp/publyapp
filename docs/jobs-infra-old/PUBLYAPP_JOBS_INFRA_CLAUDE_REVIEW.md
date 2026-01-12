# PublyApp Background Jobs Infrastructure — Claude's Review & Additions

> **Context:** This document is a review of an architectural discussion between Radan and ChatGPT (GPT-5.2) regarding background job infrastructure for PublyApp, a social media scheduling application. The agreed-upon architecture is **RabbitMQ + MassTransit + Quartz.NET** with PostgreSQL as the source of truth.
>
> **Purpose:** To provide additional considerations, critiques, edge cases, and implementation details that complement ChatGPT's solid foundational advice.

---

## Table of Contents

1. [What ChatGPT Got Right](#1-what-chatgpt-got-right)
2. [The Outbox Pattern is NOT Optional](#2-the-outbox-pattern-is-not-optional)
3. [MassTransit Complexity Warning](#3-masstransit-complexity-warning)
4. [RabbitMQ Operational Burden](#4-rabbitmq-operational-burden)
5. [Idempotency is Harder Than It Sounds](#5-idempotency-is-harder-than-it-sounds)
6. [OAuth Token Expiry — The Silent Killer](#6-oauth-token-expiry--the-silent-killer)
7. [Timezone Handling — Bug Factory](#7-timezone-handling--bug-factory)
8. [Rate Limiting Per Platform](#8-rate-limiting-per-platform)
9. [Dead Letter Queue Monitoring & Alerting](#9-dead-letter-queue-monitoring--alerting)
10. [Graceful Shutdown](#10-graceful-shutdown)
11. [Consider Starting Simpler (YAGNI)](#11-consider-starting-simpler-yagni)
12. [Additional Patterns & Edge Cases](#12-additional-patterns--edge-cases)
13. [Pre-Build Checklist](#13-pre-build-checklist)
14. [Alternative Architectures Considered](#14-alternative-architectures-considered)

---

## 1. What ChatGPT Got Right

ChatGPT provided excellent foundational advice. These points are solid and should be followed:

### 1.1 The Three-Category Job Taxonomy

Separating jobs into three categories keeps the mental model clean and the implementation focused:

| Category | Description | Examples |
|----------|-------------|----------|
| **Request-driven async work** | Triggered by API calls, needs retries + DLQ | Generate thumbnails, send emails, process webhooks |
| **Scheduled/recurring jobs** | Time-triggered, no user request | Delete expired sessions, rebuild indexes, daily digests |
| **Scheduled user jobs** | Must fire at a specific time, potentially huge volume | Publish post at 2026-01-13 09:00 |

**Why this matters:** Each category has different reliability, timing, and scaling requirements. Treating them uniformly leads to either over-engineering simple jobs or under-engineering critical ones.

### 1.2 Database as Source of Truth

Never trust the message broker for scheduling state. The database should always be authoritative about:

- What posts are scheduled
- When they should publish
- What their current status is

The broker is for *delivery*, not *state management*.

### 1.3 The `FOR UPDATE SKIP LOCKED` Pattern

This is the gold standard for distributed job claiming in PostgreSQL:

```sql
UPDATE scheduled_posts
SET status = 'processing', claimed_at = now()
WHERE id IN (
    SELECT id FROM scheduled_posts
    WHERE status = 'scheduled' AND publish_at <= now()
    FOR UPDATE SKIP LOCKED
    LIMIT 20
)
RETURNING *;
```

**How it works:**

- `FOR UPDATE` locks the selected rows
- `SKIP LOCKED` causes concurrent queries to skip already-locked rows instead of waiting
- Multiple workers can safely run this query simultaneously without duplicates
- No application-level coordination required

**Critical insight from ChatGPT:** Postgres enforces correctness, Quartz enforces timing, you enforce how many schedulers you want.

### 1.4 Advisory Lock for Scheduler Leadership

Simple, effective, no extra dependencies:

```csharp
// At startup, try to acquire the lock
var isLeader = await connection.ExecuteScalarAsync<bool>(
    "SELECT pg_try_advisory_lock(@lockId)", 
    new { lockId = 123456789 });

if (isLeader)
{
    // This instance runs Quartz scheduling jobs
    EnableQuartzScheduler();
}
else
{
    // This instance only runs workers
    DisableQuartzScheduler();
}
```

**Key properties:**

- Lock is held for the duration of the database connection
- If the process dies, the connection closes, and the lock is automatically released
- Another instance can then acquire leadership
- No external coordination service needed

### 1.5 Single Binary, Two Roles

Deploy one container/service (`publyapp-worker`) that contains both:

- Quartz scheduler (dispatcher)
- Job workers (executors)

Use advisory lock to ensure only one instance runs the scheduler. All instances run workers.

**Benefits:**

- One artifact to build, test, deploy
- Scales cleanly (just increase replicas)
- No accidental "2 schedulers" issues
- Can split later if needed without code changes

### 1.6 VPS → GCP Migration Path

Planning for future cloud migration from day one is smart. The chosen architecture (containerized services + RabbitMQ + PostgreSQL) maps cleanly to:

- **GKE:** Direct container deployment, RabbitMQ as StatefulSet
- **Cloud Run:** Possible but less ideal for long-lived workers
- **Cloud SQL + Pub/Sub:** If you want to go fully managed later

---

## 2. The Outbox Pattern is NOT Optional

**This is the most critical addition to ChatGPT's advice.**

ChatGPT described the outbox as "optional but recommended." This is incorrect for production systems. **The outbox pattern is mandatory** for reliable message publishing.

### 2.1 The Problem: Distributed Transactions

Consider this code:

```csharp
// DANGEROUS: What happens if the process crashes between line 1 and 2?
post.Status = PostStatus.Processing;
await _db.SaveChangesAsync();              // 1. DB committed ✓
await _bus.Publish(new PostClaimed());     // 2. Message sent (maybe?)
```

**Failure scenarios:**

| Scenario | DB State | Message State | Result |
|----------|----------|---------------|--------|
| Both succeed | ✓ Updated | ✓ Sent | Happy path |
| Crash after line 1 | ✓ Updated | ✗ Never sent | **Post stuck forever** |
| Message broker down | ✓ Updated | ✗ Failed | **Post stuck forever** |
| DB fails | ✗ Not updated | ✗ Not sent | Safe (retry whole operation) |

The problematic scenarios leave your system in an inconsistent state that requires manual intervention.

### 2.2 The Solution: Transactional Outbox

Write the message to the database in the same transaction as your business data:

```csharp
await using var transaction = await _db.Database.BeginTransactionAsync();

try
{
    // Business logic
    post.Status = PostStatus.Processing;
    post.ClaimedAt = DateTime.UtcNow;
    
    // Write message to outbox table (same transaction)
    _db.OutboxMessages.Add(new OutboxMessage
    {
        Id = Guid.NewGuid(),
        CreatedAt = DateTime.UtcNow,
        MessageType = nameof(PublishPost),
        Payload = JsonSerializer.Serialize(new PublishPost(post.Id, post.TenantId)),
        Status = OutboxMessageStatus.Pending
    });
    
    await _db.SaveChangesAsync();
    await transaction.CommitAsync();
}
catch
{
    await transaction.RollbackAsync();
    throw;
}
```

A separate background process (or MassTransit's built-in outbox) reads pending messages and publishes them:

```csharp
public class OutboxPublisher : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var pendingMessages = await _db.OutboxMessages
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
                }
                
                await _db.SaveChangesAsync(ct);
            }

            await Task.Delay(TimeSpan.FromSeconds(5), ct);
        }
    }
}
```

### 2.3 MassTransit's Built-in Outbox

MassTransit provides this out of the box. **Enable it:**

```csharp
services.AddMassTransit(x =>
{
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
        cfg.Host("localhost");
        cfg.ConfigureEndpoints(context);
    });
});
```

**Usage in handlers:**

```csharp
public class ClaimScheduledPostsConsumer : IConsumer<ClaimScheduledPosts>
{
    private readonly AppDbContext _db;

    public async Task Consume(ConsumeContext<ClaimScheduledPosts> context)
    {
        var duePosts = await ClaimDuePostsAsync();

        foreach (var post in duePosts)
        {
            // This is written to outbox, not directly to RabbitMQ
            await context.Publish(new PublishPost(post.Id, post.TenantId));
        }

        // When SaveChanges is called, outbox messages are committed atomically
        await _db.SaveChangesAsync();
    }
}
```

### 2.4 Outbox Table Schema

```sql
CREATE TABLE outbox_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    message_type VARCHAR(500) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    published_at TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    
    -- For deduplication
    correlation_id UUID,
    
    -- Index for efficient polling
    INDEX idx_outbox_pending (status, created_at) WHERE status = 'pending'
);
```

---

## 3. MassTransit Complexity Warning

MassTransit is powerful but has a steep learning curve. For a solo developer, feature creep is a real risk.

### 3.1 Feature Complexity Matrix

| Feature | Complexity | Learning Curve | Need for MVP? |
|---------|------------|----------------|---------------|
| Basic publish/consume | Low | Hours | ✅ Yes |
| Retry policies | Low | Hours | ✅ Yes |
| Dead letter queues | Low | Day | ✅ Yes |
| Request/response | Medium | Days | ❌ No |
| Sagas/state machines | High | Weeks | ❌ No |
| Routing slips | High | Weeks | ❌ No |
| Courier | High | Weeks | ❌ No |
| Multi-bus | High | Days | ❌ No |

### 3.2 MVP-Appropriate Configuration

Start with this minimal setup:

```csharp
services.AddMassTransit(x =>
{
    // Auto-discover consumers in this assembly
    x.AddConsumers(typeof(Program).Assembly);

    // Configure Entity Framework outbox
    x.AddEntityFrameworkOutbox<AppDbContext>(o =>
    {
        o.UsePostgres();
        o.UseBusOutbox();
    });

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host(configuration.GetConnectionString("RabbitMQ"));

        // Simple retry policy
        cfg.UseMessageRetry(r => r.Intervals(
            TimeSpan.FromSeconds(5),
            TimeSpan.FromSeconds(30),
            TimeSpan.FromMinutes(2),
            TimeSpan.FromMinutes(10)
        ));

        // Auto-configure endpoints based on consumer names
        cfg.ConfigureEndpoints(context);
    });
});
```

### 3.3 Simple Consumer Example

```csharp
public class PublishPostConsumer : IConsumer<PublishPost>
{
    private readonly AppDbContext _db;
    private readonly ILinkedInClient _linkedin;
    private readonly ILogger<PublishPostConsumer> _logger;

    public PublishPostConsumer(
        AppDbContext db, 
        ILinkedInClient linkedin,
        ILogger<PublishPostConsumer> logger)
    {
        _db = db;
        _linkedin = linkedin;
        _logger = logger;
    }

    public async Task Consume(ConsumeContext<PublishPost> context)
    {
        var postId = context.Message.PostId;
        
        _logger.LogInformation("Publishing post {PostId}", postId);
        
        var post = await _db.ScheduledPosts
            .Include(p => p.SocialAccount)
            .FirstOrDefaultAsync(p => p.Id == postId);

        if (post == null)
        {
            _logger.LogWarning("Post {PostId} not found", postId);
            return; // Don't throw - message will be acked
        }

        // Your publishing logic here
        await _linkedin.PublishAsync(post);
        
        post.Status = PostStatus.Published;
        post.PublishedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
    }
}
```

### 3.4 What to Avoid Early On

**Don't use sagas for simple workflows.** If your workflow is:

1. Claim post
2. Publish to LinkedIn
3. Update status

That's not a saga. That's a consumer with error handling. Sagas are for multi-step, long-running processes with compensation logic.

**Don't use request/response when fire-and-forget works.** If you don't need an immediate response, use `Publish()`, not `GetResponse<>()`.

**Don't create custom middleware until you hit real problems.** MassTransit's defaults are good.

---

## 4. RabbitMQ Operational Burden

ChatGPT recommended RabbitMQ but didn't emphasize the operational responsibilities. This section covers what you need to know.

### 4.1 Resource Management

RabbitMQ is memory-hungry and needs proper configuration:

```ini
# /etc/rabbitmq/rabbitmq.conf

# Memory threshold - RabbitMQ will block publishers when memory exceeds this
# Default is 0.4 (40% of system RAM). For a VPS, be conservative.
vm_memory_high_watermark.relative = 0.6

# Alternatively, set an absolute limit
# vm_memory_high_watermark.absolute = 1GB

# Disk space threshold - RabbitMQ needs free disk for persistence
disk_free_limit.absolute = 2GB

# Consumer timeout - how long before unacknowledged messages are requeued
# Set high for long-running jobs
consumer_timeout = 1800000  # 30 minutes in milliseconds

# Message TTL default (prevent infinite queue growth)
# Better to set per-queue, but this is a safety net
# message_ttl = 86400000  # 24 hours
```

### 4.2 Queue Configuration

Configure queues for durability and safety:

```csharp
cfg.ReceiveEndpoint("publish-post", e =>
{
    // Survive RabbitMQ restarts
    e.Durable = true;
    
    // How many messages to prefetch
    e.PrefetchCount = 16;
    
    // Limit concurrent consumers on this endpoint
    e.ConcurrentMessageLimit = 10;
    
    // Dead letter exchange for failed messages
    e.ConfigureConsumeTopology = true;
    
    e.ConfigureConsumer<PublishPostConsumer>(context);
});
```

### 4.3 Dead Letter Queue Setup

MassTransit creates `_error` and `_skipped` queues automatically, but you should understand them:

| Queue Suffix | Purpose | When Messages Go Here |
|--------------|---------|----------------------|
| `_error` | Failed after all retries | Unhandled exceptions exhausted retry policy |
| `_skipped` | Undeliverable | No consumer registered, deserialization failed |

**Important:** Messages in these queues need manual attention. Set up monitoring (see Section 9).

### 4.4 Monitoring Essentials

At minimum, monitor these metrics:

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| Queue depth | > 1000 messages | > 10000 messages |
| Consumer count | < expected | 0 |
| Memory usage | > 60% | > 80% |
| Unacked messages | > 100 | > 1000 |
| Message publish rate | - | Sudden drop to 0 |

**RabbitMQ Management UI:** Enabled by default on port 15672. **Secure it:**

```yaml
# docker-compose.yml
rabbitmq:
  image: rabbitmq:3-management
  environment:
    RABBITMQ_DEFAULT_USER: publyapp
    RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
  ports:
    - "5672:5672"      # AMQP
    # - "15672:15672"  # Don't expose management publicly
```

Access management UI via SSH tunnel or VPN, not public internet.

### 4.5 Backup and Recovery

Export RabbitMQ definitions (exchanges, queues, bindings, users):

```bash
# Export
rabbitmqctl export_definitions /backup/rabbitmq-definitions.json

# Import (on new instance)
rabbitmqctl import_definitions /backup/rabbitmq-definitions.json
```

**Automate this:** Add a cron job or backup script that runs daily.

Messages themselves are not easily backed up. The outbox pattern (Section 2) protects you from message loss.

### 4.6 Docker Compose Example

```yaml
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

volumes:
  rabbitmq_data:
```

---

## 5. Idempotency is Harder Than It Sounds

ChatGPT correctly emphasized that "every job should be safe to run twice." But implementing this for external API calls (like social media publishing) requires specific patterns.

### 5.1 The Problem: Partial Failures

```
1. Consumer receives PublishPost message
2. Consumer calls LinkedIn API
3. LinkedIn API succeeds, post is live ✓
4. Consumer tries to update database
5. Database connection fails ✗
6. Consumer throws exception
7. MassTransit retries the message
8. Consumer calls LinkedIn API again
9. DUPLICATE POST PUBLISHED 💥
```

### 5.2 Solution: Check-Before-Execute Pattern

```csharp
public class PublishPostConsumer : IConsumer<PublishPost>
{
    public async Task Consume(ConsumeContext<PublishPost> context)
    {
        var post = await _db.ScheduledPosts
            .Include(p => p.SocialAccount)
            .FirstOrDefaultAsync(p => p.Id == context.Message.PostId);

        if (post == null)
        {
            _logger.LogWarning("Post {PostId} not found, skipping", context.Message.PostId);
            return; // Ack the message, don't retry
        }

        // IDEMPOTENCY CHECK 1: Already published?
        if (post.Status == PostStatus.Published)
        {
            _logger.LogInformation("Post {PostId} already published, skipping", post.Id);
            return;
        }

        // IDEMPOTENCY CHECK 2: Partial success? (API succeeded, DB failed)
        if (!string.IsNullOrEmpty(post.PlatformPostId))
        {
            _logger.LogWarning(
                "Post {PostId} has platform ID but not marked published. Fixing state.",
                post.Id);
            
            post.Status = PostStatus.Published;
            post.PublishedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return;
        }

        // IDEMPOTENCY CHECK 3: Currently being processed?
        if (post.Status == PostStatus.Processing && 
            post.ClaimedAt > DateTime.UtcNow.AddMinutes(-5))
        {
            _logger.LogWarning(
                "Post {PostId} is being processed by another consumer, skipping",
                post.Id);
            return;
        }

        // Claim the post
        post.Status = PostStatus.Processing;
        post.ClaimedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        try
        {
            // Call external API
            var result = await _linkedin.PublishAsync(
                post.SocialAccount.AccessToken,
                post.Content,
                post.MediaUrls
            );

            // Store platform ID IMMEDIATELY (before any other DB operations)
            post.PlatformPostId = result.PostId;
            await _db.SaveChangesAsync(); // Checkpoint

            // Now update full status
            post.Status = PostStatus.Published;
            post.PublishedAt = DateTime.UtcNow;
            post.PlatformUrl = result.PostUrl;
            await _db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            post.Status = PostStatus.Failed;
            post.FailureReason = ex.Message;
            post.RetryCount++;
            await _db.SaveChangesAsync();
            
            throw; // Let MassTransit handle retry
        }
    }
}
```

### 5.3 Idempotency Keys for External APIs

Some APIs support idempotency keys. Use them when available:

```csharp
public class LinkedInClient : ILinkedInClient
{
    public async Task<PublishResult> PublishAsync(
        string accessToken,
        string content,
        string? idempotencyKey = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/v2/ugcPosts");
        
        // If the API supports idempotency keys
        if (!string.IsNullOrEmpty(idempotencyKey))
        {
            request.Headers.Add("X-Idempotency-Key", idempotencyKey);
        }
        
        // ... rest of implementation
    }
}

// Usage
var idempotencyKey = $"publyapp-{post.Id}-{post.Version}";
await _linkedin.PublishAsync(token, content, idempotencyKey);
```

### 5.4 Database State Machine

Model your post status as a state machine to prevent invalid transitions:

```csharp
public enum PostStatus
{
    Draft,
    Scheduled,
    Processing,
    Published,
    Failed,
    Cancelled
}

public static class PostStatusTransitions
{
    private static readonly Dictionary<PostStatus, PostStatus[]> ValidTransitions = new()
    {
        [PostStatus.Draft] = [PostStatus.Scheduled, PostStatus.Cancelled],
        [PostStatus.Scheduled] = [PostStatus.Processing, PostStatus.Cancelled, PostStatus.Draft],
        [PostStatus.Processing] = [PostStatus.Published, PostStatus.Failed, PostStatus.Scheduled],
        [PostStatus.Failed] = [PostStatus.Scheduled, PostStatus.Cancelled],
        [PostStatus.Published] = [], // Terminal state
        [PostStatus.Cancelled] = [PostStatus.Draft], // Can be restored to draft
    };

    public static bool CanTransition(PostStatus from, PostStatus to)
    {
        return ValidTransitions.TryGetValue(from, out var valid) && valid.Contains(to);
    }

    public static void Transition(ScheduledPost post, PostStatus newStatus)
    {
        if (!CanTransition(post.Status, newStatus))
        {
            throw new InvalidOperationException(
                $"Cannot transition post from {post.Status} to {newStatus}");
        }
        
        post.Status = newStatus;
        post.StatusChangedAt = DateTime.UtcNow;
    }
}
```

---

## 6. OAuth Token Expiry — The Silent Killer

This is a critical concern for social media scheduling that ChatGPT didn't address. If a user schedules a post for next week but their OAuth token expires in 3 days, the post will fail silently.

### 6.1 The Problem

| Platform | Token Lifetime | Refresh Token Lifetime |
|----------|---------------|------------------------|
| LinkedIn | 60 days | 365 days |
| Twitter/X | 2 hours | 6 months |
| Facebook | 60 days | Never expires (but can be invalidated) |
| Instagram | 60 days | Never expires |

If a token expires before a scheduled post is due, the post will fail.

### 6.2 Solution: Proactive Token Refresh

Create a recurring job that refreshes tokens before they expire:

```csharp
public class RefreshExpiringTokensJob : IJob
{
    private readonly AppDbContext _db;
    private readonly IOAuthService _oauthService;
    private readonly INotificationService _notifications;
    private readonly ILogger<RefreshExpiringTokensJob> _logger;

    public async Task Execute(IJobExecutionContext context)
    {
        // Find tokens expiring in the next 48 hours
        var warningThreshold = DateTime.UtcNow.AddHours(48);
        var criticalThreshold = DateTime.UtcNow.AddHours(24);

        var expiringAccounts = await _db.SocialAccounts
            .Include(a => a.Tenant)
            .Where(a => a.TokenExpiresAt < warningThreshold)
            .Where(a => a.TokenExpiresAt > DateTime.UtcNow)
            .Where(a => !a.IsRefreshFailed) // Don't keep retrying failed refreshes
            .ToListAsync();

        _logger.LogInformation("Found {Count} tokens to refresh", expiringAccounts.Count);

        foreach (var account in expiringAccounts)
        {
            try
            {
                await _oauthService.RefreshTokenAsync(account);
                
                account.LastRefreshedAt = DateTime.UtcNow;
                account.RefreshFailCount = 0;
                account.IsRefreshFailed = false;
                
                _logger.LogInformation(
                    "Refreshed token for account {AccountId} ({Platform})",
                    account.Id, account.Platform);
            }
            catch (OAuthRefreshException ex) when (ex.IsRecoverable)
            {
                // Temporary failure, will retry next run
                account.RefreshFailCount++;
                _logger.LogWarning(
                    ex,
                    "Temporary failure refreshing token for account {AccountId}",
                    account.Id);
            }
            catch (OAuthRefreshException ex)
            {
                // Permanent failure (e.g., user revoked access)
                account.IsRefreshFailed = true;
                account.RefreshFailReason = ex.Message;
                
                _logger.LogError(
                    ex,
                    "Permanent failure refreshing token for account {AccountId}",
                    account.Id);
                
                // Notify the user
                await _notifications.SendAsync(
                    account.Tenant.UserId,
                    new TokenRefreshFailedNotification
                    {
                        AccountId = account.Id,
                        Platform = account.Platform,
                        Reason = ex.Message,
                        ReconnectUrl = $"/settings/accounts/{account.Id}/reconnect"
                    });
            }
        }

        await _db.SaveChangesAsync();
    }
}
```

### 6.3 Pre-Publish Token Validation

Before publishing, validate the token is still good:

```csharp
public class PublishPostConsumer : IConsumer<PublishPost>
{
    public async Task Consume(ConsumeContext<PublishPost> context)
    {
        var post = await _db.ScheduledPosts
            .Include(p => p.SocialAccount)
            .FirstOrDefaultAsync(p => p.Id == context.Message.PostId);

        var account = post.SocialAccount;

        // Check token expiry
        if (account.TokenExpiresAt < DateTime.UtcNow.AddMinutes(5))
        {
            _logger.LogInformation(
                "Token expiring soon for account {AccountId}, attempting refresh",
                account.Id);

            try
            {
                await _oauthService.RefreshTokenAsync(account);
                await _db.SaveChangesAsync();
            }
            catch (OAuthRefreshException ex)
            {
                post.Status = PostStatus.Failed;
                post.FailureReason = $"Token expired and could not be refreshed: {ex.Message}";
                await _db.SaveChangesAsync();
                
                // Notify user
                await _notifications.NotifyPostFailedDueToTokenAsync(post);
                
                // Don't retry - this won't fix itself
                return;
            }
        }

        // Proceed with publishing...
    }
}
```

### 6.4 Scheduled Posts Validation Job

Run a daily job that checks if any scheduled posts have expiring tokens:

```csharp
public class ValidateScheduledPostsJob : IJob
{
    public async Task Execute(IJobExecutionContext context)
    {
        // Find posts scheduled in the next 7 days
        var horizon = DateTime.UtcNow.AddDays(7);
        
        var postsWithExpiringTokens = await _db.ScheduledPosts
            .Include(p => p.SocialAccount)
            .ThenInclude(a => a.Tenant)
            .Where(p => p.Status == PostStatus.Scheduled)
            .Where(p => p.PublishAtUtc < horizon)
            .Where(p => p.SocialAccount.TokenExpiresAt < p.PublishAtUtc)
            .ToListAsync();

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
                    PostTitle = post.Content.Truncate(50),
                    ScheduledFor = post.PublishAtUtc,
                    TokenExpiresAt = post.SocialAccount.TokenExpiresAt,
                    Platform = post.SocialAccount.Platform,
                    ReconnectUrl = $"/settings/accounts/{post.SocialAccountId}/reconnect"
                });
        }
    }
}
```

### 6.5 Quartz Schedule

```csharp
// In your Quartz configuration
public static void ConfigureTokenJobs(IServiceCollectionQuartzConfigurator q)
{
    // Refresh expiring tokens every 6 hours
    q.AddJob<RefreshExpiringTokensJob>(opts => opts
        .WithIdentity("refresh-expiring-tokens", "oauth")
        .StoreDurably());
    
    q.AddTrigger(opts => opts
        .ForJob("refresh-expiring-tokens", "oauth")
        .WithIdentity("refresh-expiring-tokens-trigger")
        .WithCronSchedule("0 0 */6 * * ?")); // Every 6 hours

    // Validate scheduled posts daily
    q.AddJob<ValidateScheduledPostsJob>(opts => opts
        .WithIdentity("validate-scheduled-posts", "posts")
        .StoreDurably());
    
    q.AddTrigger(opts => opts
        .ForJob("validate-scheduled-posts", "posts")
        .WithIdentity("validate-scheduled-posts-trigger")
        .WithCronSchedule("0 0 9 * * ?")); // Daily at 9 AM
}
```

---

## 7. Timezone Handling — Bug Factory

Timezones are a notorious source of bugs in scheduling applications. Get this wrong, and users will see posts published at unexpected times.

### 7.1 The Golden Rules

1. **Store everything in UTC in the database**
2. **User input arrives with timezone info**
3. **Convert to UTC immediately upon save**
4. **Convert back to user timezone only for display**
5. **Never use local server time**

### 7.2 Database Schema

```sql
CREATE TABLE scheduled_posts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    content TEXT NOT NULL,
    
    -- Always store in UTC
    publish_at_utc TIMESTAMPTZ NOT NULL,
    
    -- Store the user's timezone for display purposes
    user_timezone VARCHAR(100) NOT NULL,
    
    -- For audit/debugging
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- ...
);
```

**Important:** Use `TIMESTAMPTZ` (timestamp with time zone) in PostgreSQL, not `TIMESTAMP`.

### 7.3 API Contract

```csharp
public class CreateScheduledPostRequest
{
    /// <summary>
    /// The local datetime when the post should be published.
    /// This should be in the user's timezone, not UTC.
    /// </summary>
    /// <example>2026-01-15T09:00:00</example>
    public DateTime PublishAt { get; set; }
    
    /// <summary>
    /// IANA timezone identifier.
    /// </summary>
    /// <example>America/New_York</example>
    public string TimeZoneId { get; set; } = null!;
}

public class ScheduledPostResponse
{
    public Guid Id { get; set; }
    public string Content { get; set; } = null!;
    
    /// <summary>
    /// The publish time in the user's original timezone.
    /// </summary>
    public DateTime PublishAt { get; set; }
    
    /// <summary>
    /// The user's timezone.
    /// </summary>
    public string TimeZoneId { get; set; } = null!;
    
    /// <summary>
    /// The publish time in UTC (for debugging/API consumers).
    /// </summary>
    public DateTime PublishAtUtc { get; set; }
}
```

### 7.4 Conversion Logic

Use **NodaTime** for reliable timezone handling (the BCL's `TimeZoneInfo` has edge cases):

```bash
dotnet add package NodaTime
```

```csharp
public class ScheduledPostService
{
    private readonly IDateTimeZoneProvider _tzProvider;

    public ScheduledPostService()
    {
        _tzProvider = DateTimeZoneProviders.Tzdb;
    }

    public async Task<ScheduledPost> CreateAsync(
        CreateScheduledPostRequest request,
        Guid tenantId)
    {
        // Parse the timezone
        var tz = _tzProvider.GetZoneOrNull(request.TimeZoneId)
            ?? throw new ValidationException($"Invalid timezone: {request.TimeZoneId}");

        // Convert local time to UTC
        var localDateTime = LocalDateTime.FromDateTime(request.PublishAt);
        var zonedDateTime = localDateTime.InZoneLeniently(tz);
        var utcInstant = zonedDateTime.ToInstant();
        var publishAtUtc = utcInstant.ToDateTimeUtc();

        var post = new ScheduledPost
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Content = request.Content,
            PublishAtUtc = publishAtUtc,
            UserTimeZoneId = request.TimeZoneId,
            Status = PostStatus.Scheduled,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.ScheduledPosts.Add(post);
        await _db.SaveChangesAsync();

        return post;
    }

    public ScheduledPostResponse ToResponse(ScheduledPost post)
    {
        // Convert UTC back to user's timezone for display
        var tz = _tzProvider.GetZoneOrNull(post.UserTimeZoneId)
            ?? DateTimeZone.Utc;

        var utcInstant = Instant.FromDateTimeUtc(
            DateTime.SpecifyKind(post.PublishAtUtc, DateTimeKind.Utc));
        var zonedDateTime = utcInstant.InZone(tz);
        var localDateTime = zonedDateTime.LocalDateTime.ToDateTimeUnspecified();

        return new ScheduledPostResponse
        {
            Id = post.Id,
            Content = post.Content,
            PublishAt = localDateTime,
            TimeZoneId = post.UserTimeZoneId,
            PublishAtUtc = post.PublishAtUtc
        };
    }
}
```

### 7.5 Testing Timezone Edge Cases

Write tests for these scenarios:

```csharp
[Fact]
public void Schedule_DuringDSTTransition_HandlesCorrectly()
{
    // March 10, 2024 at 2:30 AM doesn't exist in America/New_York
    // (clocks skip from 2:00 to 3:00)
    var request = new CreateScheduledPostRequest
    {
        PublishAt = new DateTime(2024, 3, 10, 2, 30, 0),
        TimeZoneId = "America/New_York"
    };

    // Should handle gracefully (InZoneLeniently picks a reasonable time)
    var post = _service.Create(request, tenantId);
    
    Assert.NotNull(post);
}

[Fact]
public void Schedule_AmbiguousDSTTime_UsesLaterTime()
{
    // November 3, 2024 at 1:30 AM exists twice in America/New_York
    // (clocks fall back from 2:00 to 1:00)
    var request = new CreateScheduledPostRequest
    {
        PublishAt = new DateTime(2024, 11, 3, 1, 30, 0),
        TimeZoneId = "America/New_York"
    };

    // Should consistently pick one (InZoneLeniently uses the later occurrence)
    var post = _service.Create(request, tenantId);
    
    Assert.NotNull(post);
}
```

### 7.6 Frontend Considerations

The frontend should:

1. Detect user's timezone automatically (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
2. Send the IANA timezone ID with every schedule request
3. Allow users to override if scheduling for a different timezone
4. Display all times in the user's timezone (converted from UTC)

---

## 8. Rate Limiting Per Platform

Social media APIs have strict rate limits. Your worker must respect them to avoid getting blocked.

### 8.1 Platform Rate Limits

| Platform | Rate Limit | Window | Notes |
|----------|------------|--------|-------|
| LinkedIn | 100 posts/day per user | 24 hours | Rolling window |
| Twitter/X | 200 tweets/day per user | 24 hours | Varies by account type |
| Facebook | 200 posts/day per page | 24 hours | Higher for verified pages |
| Instagram | 25 posts/day | 24 hours | Very strict |

### 8.2 Application-Level Rate Limiting

Implement a rate limiter that respects per-user, per-platform limits:

```csharp
public class SocialMediaRateLimiter
{
    private readonly IDistributedCache _cache;
    
    public async Task<bool> CanPublishAsync(Guid accountId, string platform)
    {
        var key = $"rate-limit:{platform}:{accountId}:{DateTime.UtcNow:yyyy-MM-dd}";
        var countStr = await _cache.GetStringAsync(key);
        var count = int.TryParse(countStr, out var c) ? c : 0;
        
        var limit = GetDailyLimit(platform);
        
        return count < limit;
    }

    public async Task RecordPublishAsync(Guid accountId, string platform)
    {
        var key = $"rate-limit:{platform}:{accountId}:{DateTime.UtcNow:yyyy-MM-dd}";
        var countStr = await _cache.GetStringAsync(key);
        var count = int.TryParse(countStr, out var c) ? c : 0;
        
        await _cache.SetStringAsync(
            key,
            (count + 1).ToString(),
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(25)
            });
    }

    public async Task<RateLimitStatus> GetStatusAsync(Guid accountId, string platform)
    {
        var key = $"rate-limit:{platform}:{accountId}:{DateTime.UtcNow:yyyy-MM-dd}";
        var countStr = await _cache.GetStringAsync(key);
        var count = int.TryParse(countStr, out var c) ? c : 0;
        var limit = GetDailyLimit(platform);
        
        return new RateLimitStatus
        {
            Used = count,
            Limit = limit,
            Remaining = Math.Max(0, limit - count),
            ResetsAt = DateTime.UtcNow.Date.AddDays(1)
        };
    }

    private int GetDailyLimit(string platform) => platform.ToLower() switch
    {
        "linkedin" => 100,
        "twitter" => 200,
        "facebook" => 200,
        "instagram" => 25,
        _ => 50
    };
}
```

### 8.3 Using in Consumer

```csharp
public class PublishPostConsumer : IConsumer<PublishPost>
{
    private readonly SocialMediaRateLimiter _rateLimiter;

    public async Task Consume(ConsumeContext<PublishPost> context)
    {
        var post = await _db.ScheduledPosts
            .Include(p => p.SocialAccount)
            .FirstOrDefaultAsync(p => p.Id == context.Message.PostId);

        var account = post.SocialAccount;

        // Check rate limit
        if (!await _rateLimiter.CanPublishAsync(account.Id, account.Platform))
        {
            _logger.LogWarning(
                "Rate limit reached for account {AccountId} on {Platform}",
                account.Id, account.Platform);

            // Reschedule for tomorrow
            post.PublishAtUtc = DateTime.UtcNow.Date.AddDays(1).AddHours(9);
            post.Status = PostStatus.Scheduled;
            await _db.SaveChangesAsync();

            // Notify user
            await _notifications.NotifyRateLimitHitAsync(post);
            
            return;
        }

        // Publish...
        await _linkedin.PublishAsync(post);
        
        // Record the publish
        await _rateLimiter.RecordPublishAsync(account.Id, account.Platform);
        
        // Update status...
    }
}
```

### 8.4 API 429 Handling

Handle `429 Too Many Requests` responses with exponential backoff:

```csharp
public class LinkedInClient : ILinkedInClient
{
    private readonly HttpClient _http;
    private readonly ILogger _logger;

    public async Task<PublishResult> PublishAsync(string token, string content)
    {
        var retryCount = 0;
        var maxRetries = 3;

        while (true)
        {
            var response = await _http.PostAsync("/v2/ugcPosts", ...);

            if (response.StatusCode == HttpStatusCode.TooManyRequests)
            {
                if (retryCount >= maxRetries)
                {
                    throw new RateLimitException("LinkedIn rate limit exceeded after retries");
                }

                // Check Retry-After header
                var retryAfter = response.Headers.RetryAfter?.Delta
                    ?? TimeSpan.FromMinutes(Math.Pow(2, retryCount));

                _logger.LogWarning(
                    "LinkedIn rate limit hit, waiting {Delay} before retry {Attempt}/{Max}",
                    retryAfter, retryCount + 1, maxRetries);

                await Task.Delay(retryAfter);
                retryCount++;
                continue;
            }

            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<PublishResult>();
        }
    }
}
```

### 8.5 Concurrency Limiting

Don't overwhelm APIs with parallel requests:

```csharp
public class PublishPostConsumer : IConsumer<PublishPost>
{
    // Limit concurrent API calls per platform
    private static readonly Dictionary<string, SemaphoreSlim> PlatformSemaphores = new()
    {
        ["linkedin"] = new SemaphoreSlim(5),  // Max 5 concurrent LinkedIn API calls
        ["twitter"] = new SemaphoreSlim(10),
        ["facebook"] = new SemaphoreSlim(10),
        ["instagram"] = new SemaphoreSlim(3), // Instagram is very strict
    };

    public async Task Consume(ConsumeContext<PublishPost> context)
    {
        var platform = post.SocialAccount.Platform.ToLower();
        var semaphore = PlatformSemaphores.GetValueOrDefault(platform)
            ?? new SemaphoreSlim(5);

        await semaphore.WaitAsync(context.CancellationToken);
        try
        {
            // Your publish logic
        }
        finally
        {
            semaphore.Release();
        }
    }
}
```

---

## 9. Dead Letter Queue Monitoring & Alerting

ChatGPT mentioned DLQ but didn't emphasize monitoring. Failed jobs sitting in the DLQ are invisible problems unless you actively look.

### 9.1 The Problem

MassTransit automatically creates `_error` queues for failed messages. But:

- No one looks at them by default
- Failed posts = angry users
- Problems compound silently

### 9.2 DLQ Monitoring Job

```csharp
public class DlqMonitorJob : IJob
{
    private readonly IConnection _rabbitConnection;
    private readonly IAlertService _alerts;
    private readonly ILogger<DlqMonitorJob> _logger;

    private readonly string[] _queuesToMonitor = 
    {
        "publish-post_error",
        "process-webhook_error",
        "send-notification_error"
    };

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
                    queueDetails.Add(new QueueErrorCount
                    {
                        QueueName = queueName,
                        Count = (int)messageCount
                    });
                    
                    _logger.LogWarning(
                        "Dead letter queue {Queue} has {Count} messages",
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

public record QueueErrorCount
{
    public string QueueName { get; init; } = null!;
    public int Count { get; init; }
}
```

### 9.3 Scheduled Check

```csharp
// Every 15 minutes
q.AddJob<DlqMonitorJob>(opts => opts
    .WithIdentity("dlq-monitor", "monitoring")
    .StoreDurably());

q.AddTrigger(opts => opts
    .ForJob("dlq-monitor", "monitoring")
    .WithIdentity("dlq-monitor-trigger")
    .WithCronSchedule("0 */15 * * * ?"));
```

### 9.4 Alerting Options

Depending on your setup:

```csharp
public interface IAlertService
{
    Task SendAsync<T>(T notification) where T : INotification;
}

// Simple implementation for MVP
public class EmailAlertService : IAlertService
{
    private readonly IEmailSender _email;
    private readonly string _adminEmail;

    public async Task SendAsync<T>(T notification) where T : INotification
    {
        if (notification is DlqAlertNotification dlq)
        {
            await _email.SendAsync(new EmailMessage
            {
                To = _adminEmail,
                Subject = $"⚠️ PublyApp: {dlq.TotalFailedMessages} messages in dead letter queues",
                Body = FormatDlqAlert(dlq)
            });
        }
    }
}

// Slack integration
public class SlackAlertService : IAlertService
{
    private readonly HttpClient _http;
    private readonly string _webhookUrl;

    public async Task SendAsync<T>(T notification) where T : INotification
    {
        if (notification is DlqAlertNotification dlq)
        {
            await _http.PostAsJsonAsync(_webhookUrl, new
            {
                text = $"⚠️ *Dead Letter Queue Alert*",
                attachments = new[]
                {
                    new
                    {
                        color = "danger",
                        fields = dlq.Queues.Select(q => new
                        {
                            title = q.QueueName,
                            value = $"{q.Count} messages",
                            @short = true
                        })
                    }
                }
            });
        }
    }
}
```

### 9.5 Manual DLQ Inspection Endpoint

Add an admin endpoint to inspect DLQ messages:

```csharp
app.MapGet("/api/admin/dlq/{queueName}", async (
    string queueName,
    IConnection rabbitConnection,
    int take = 10) =>
{
    using var channel = rabbitConnection.CreateModel();
    var messages = new List<object>();

    for (var i = 0; i < take; i++)
    {
        var result = channel.BasicGet($"{queueName}_error", autoAck: false);
        if (result == null) break;

        var body = Encoding.UTF8.GetString(result.Body.ToArray());
        messages.Add(new
        {
            MessageId = result.BasicProperties.MessageId,
            Headers = result.BasicProperties.Headers,
            Body = body,
            RedeliveryCount = result.Redelivered ? 1 : 0
        });

        // Requeue (we're just peeking)
        channel.BasicNack(result.DeliveryTag, false, true);
    }

    return messages;
})
.RequireAuthorization("Admin");
```

### 9.6 DLQ Reprocessing

Allow admins to retry failed messages:

```csharp
app.MapPost("/api/admin/dlq/{queueName}/reprocess", async (
    string queueName,
    int count,
    IConnection rabbitConnection) =>
{
    using var channel = rabbitConnection.CreateModel();
    var reprocessed = 0;
    var targetQueue = queueName.Replace("_error", "");

    for (var i = 0; i < count; i++)
    {
        var result = channel.BasicGet($"{queueName}_error", autoAck: false);
        if (result == null) break;

        // Republish to original queue
        channel.BasicPublish(
            exchange: "",
            routingKey: targetQueue,
            basicProperties: result.BasicProperties,
            body: result.Body);

        // Remove from error queue
        channel.BasicAck(result.DeliveryTag, false);
        reprocessed++;
    }

    return new { Reprocessed = reprocessed };
})
.RequireAuthorization("Admin");
```

---

## 10. Graceful Shutdown

When deploying updates, workers should finish their current job before stopping. Abrupt termination leads to:

- Partially processed jobs
- Duplicate processing on restart
- Inconsistent state

### 10.1 Understanding the Shutdown Sequence

```
1. Kubernetes/Docker sends SIGTERM
2. Application has X seconds to shut down gracefully
3. If not done, SIGKILL is sent (hard kill)
```

The default grace period varies:

- Docker Compose: 10 seconds
- Kubernetes: 30 seconds

### 10.2 ASP.NET Core / Worker Service Configuration

```csharp
var builder = Host.CreateDefaultBuilder(args)
    .ConfigureServices((context, services) =>
    {
        services.AddMassTransit(x =>
        {
            // ... configuration
        });
    })
    .ConfigureHostOptions(options =>
    {
        // Wait up to 60 seconds for graceful shutdown
        options.ShutdownTimeout = TimeSpan.FromSeconds(60);
    });
```

### 10.3 MassTransit Graceful Shutdown

MassTransit handles this well by default, but you can configure it:

```csharp
services.AddMassTransit(x =>
{
    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host("localhost");

        // Stop receiving new messages, but finish current ones
        cfg.ConfigureEndpoints(context);
    });

    // Configure hosted service behavior
    x.SetBusStopTimeout(TimeSpan.FromSeconds(30));
});
```

### 10.4 Quartz Graceful Shutdown

```csharp
services.AddQuartzHostedService(options =>
{
    // Wait for running jobs to complete
    options.WaitForJobsToComplete = true;
});
```

### 10.5 Custom Background Service Pattern

If you have custom `BackgroundService` implementations:

```csharp
public class ScheduledPostClaimerService : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var duePosts = await ClaimDuePostsAsync();

                foreach (var post in duePosts)
                {
                    // Check cancellation between items
                    if (stoppingToken.IsCancellationRequested)
                    {
                        _logger.LogInformation("Shutdown requested, stopping claim loop");
                        break;
                    }

                    await EnqueueForPublishingAsync(post);
                }

                // Use a combined token: stop on cancellation OR after delay
                await Task.Delay(
                    TimeSpan.FromSeconds(15),
                    stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Expected during shutdown
                _logger.LogInformation("Claimer service shutting down gracefully");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in claimer service");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }
}
```

### 10.6 Long-Running Job Considerations

For jobs that might take longer than the shutdown timeout:

```csharp
public class LongRunningJobConsumer : IConsumer<ProcessLargeFile>
{
    public async Task Consume(ConsumeContext<ProcessLargeFile> context)
    {
        var file = context.Message.FileId;
        var progress = await LoadProgressAsync(file);

        // Process in chunks, checking cancellation between chunks
        foreach (var chunk in GetChunks(file, progress.LastChunk))
        {
            if (context.CancellationToken.IsCancellationRequested)
            {
                // Save progress so we can resume
                await SaveProgressAsync(file, chunk.Index);
                throw new OperationCanceledException("Shutdown during processing");
            }

            await ProcessChunkAsync(chunk);
            await SaveProgressAsync(file, chunk.Index);
        }
    }
}
```

### 10.7 Docker Compose Stop Timeout

```yaml
services:
  worker:
    image: publyapp-worker
    stop_grace_period: 60s  # Give workers time to finish
```

### 10.8 Kubernetes Termination Grace Period

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: publyapp-worker
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: worker
          lifecycle:
            preStop:
              exec:
                # Optional: custom pre-stop hook
                command: ["/bin/sh", "-c", "sleep 5"]
```

---

## 11. Consider Starting Simpler (YAGNI)

This is a controversial take, but worth considering: **You might not need RabbitMQ yet.**

### 11.1 The Simpler Alternative

For MVP, consider this pattern:

1. Quartz claims due posts from DB
2. Quartz job directly calls social media APIs
3. Retries handled via DB status changes
4. No message broker at all

```csharp
public class PublishDuePostsJob : IJob
{
    public async Task Execute(IJobExecutionContext context)
    {
        // Claim due posts (with FOR UPDATE SKIP LOCKED)
        var duePosts = await ClaimDuePostsAsync();

        foreach (var post in duePosts)
        {
            try
            {
                // Directly publish (no queue)
                var result = await _socialMediaClient.PublishAsync(post);
                
                post.Status = PostStatus.Published;
                post.PlatformPostId = result.PostId;
                post.PublishedAt = DateTime.UtcNow;
            }
            catch (RateLimitException)
            {
                // Reschedule for later
                post.Status = PostStatus.Scheduled;
                post.PublishAtUtc = DateTime.UtcNow.AddHours(1);
            }
            catch (Exception ex)
            {
                post.RetryCount++;
                post.LastError = ex.Message;
                
                if (post.RetryCount >= 3)
                {
                    post.Status = PostStatus.Failed;
                }
                else
                {
                    // Exponential backoff via DB
                    post.Status = PostStatus.Scheduled;
                    post.PublishAtUtc = DateTime.UtcNow.AddMinutes(
                        Math.Pow(2, post.RetryCount) * 5);
                }
            }
            
            await _db.SaveChangesAsync();
        }
    }
}
```

### 11.2 When This Approach Works

- Low to moderate volume (< 1000 posts/day)
- Solo developer
- MVP stage
- Simple retry requirements

### 11.3 When to Add RabbitMQ

| Trigger | Why RabbitMQ Helps |
|---------|-------------------|
| Need parallel processing across multiple workers | Workers compete for queue messages |
| Job execution is slow (> 30 seconds) | Decouples claim from execute |
| Adding many job types | Clean separation via routing |
| Need complex retry/DLQ logic | MassTransit handles this |
| Moving to microservices | Message bus is natural fit |

### 11.4 Migration Path

The good news: moving from direct execution to queued execution is straightforward:

```csharp
// Before (direct)
await _socialMediaClient.PublishAsync(post);

// After (queued)
await _bus.Publish(new PublishPost(post.Id, post.TenantId));
```

The claiming logic stays the same. You're just changing what happens after claiming.

### 11.5 My Recommendation

If you're a solo developer and want to ship faster:

1. Start with Quartz + direct execution
2. Add RabbitMQ when you hit one of the triggers above
3. The architecture ChatGPT outlined is the right *target*, but maybe not the *starting point*

This isn't wrong — it's YAGNI (You Aren't Gonna Need It) applied practically.

---

## 12. Additional Patterns & Edge Cases

### 12.1 Duplicate Detection / Deduplication

Even with idempotency, you may want explicit deduplication:

```csharp
public class DeduplicationFilter<T> : IFilter<ConsumeContext<T>> where T : class
{
    private readonly IDistributedCache _cache;

    public async Task Send(ConsumeContext<T> context, IPipe<ConsumeContext<T>> next)
    {
        var messageId = context.MessageId?.ToString() ?? Guid.NewGuid().ToString();
        var cacheKey = $"msg-seen:{typeof(T).Name}:{messageId}";

        // Check if we've seen this message
        var existing = await _cache.GetStringAsync(cacheKey);
        if (existing != null)
        {
            // Already processed, skip
            return;
        }

        // Process
        await next.Send(context);

        // Mark as seen (TTL = 24 hours)
        await _cache.SetStringAsync(
            cacheKey,
            DateTime.UtcNow.ToString("O"),
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(24)
            });
    }

    public void Probe(ProbeContext context) { }
}
```

### 12.2 Job Priority

Some posts may be more important (e.g., paid users vs free):

```csharp
// Add priority to your scheduled_posts table
public enum PostPriority
{
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3
}

// Claim query respects priority
var duePosts = await _db.ScheduledPosts
    .FromSqlRaw("""
        SELECT * FROM scheduled_posts
        WHERE status = 'scheduled' AND publish_at_utc <= now()
        ORDER BY priority DESC, publish_at_utc ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 20
        """)
    .ToListAsync();
```

Or use separate queues in RabbitMQ with different consumers.

### 12.3 Tenant Isolation

Prevent one tenant's high volume from starving others:

```csharp
public class FairShareClaimingStrategy
{
    public async Task<List<ScheduledPost>> ClaimDuePostsAsync()
    {
        // Get count of due posts per tenant
        var tenantCounts = await _db.ScheduledPosts
            .Where(p => p.Status == PostStatus.Scheduled)
            .Where(p => p.PublishAtUtc <= DateTime.UtcNow)
            .GroupBy(p => p.TenantId)
            .Select(g => new { TenantId = g.Key, Count = g.Count() })
            .ToListAsync();

        var result = new List<ScheduledPost>();
        var maxPerTenant = 5; // Fair share per tenant per batch

        foreach (var tenant in tenantCounts.OrderBy(t => t.Count))
        {
            var posts = await _db.ScheduledPosts
                .FromSqlRaw("""
                    SELECT * FROM scheduled_posts
                    WHERE tenant_id = @tenantId
                      AND status = 'scheduled'
                      AND publish_at_utc <= now()
                    ORDER BY publish_at_utc ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT @limit
                    """,
                    new NpgsqlParameter("tenantId", tenant.TenantId),
                    new NpgsqlParameter("limit", maxPerTenant))
                .ToListAsync();

            result.AddRange(posts);
        }

        return result;
    }
}
```

### 12.4 Circuit Breaker for External APIs

When a platform is having issues, stop hammering it:

```csharp
services.AddHttpClient<ILinkedInClient, LinkedInClient>()
    .AddPolicyHandler(Policy<HttpResponseMessage>
        .Handle<HttpRequestException>()
        .OrResult(r => r.StatusCode == HttpStatusCode.ServiceUnavailable)
        .CircuitBreakerAsync(
            handledEventsAllowedBeforeBreaking: 5,
            durationOfBreak: TimeSpan.FromMinutes(1),
            onBreak: (result, duration) =>
            {
                Log.Warning("LinkedIn circuit breaker opened for {Duration}", duration);
            },
            onReset: () =>
            {
                Log.Information("LinkedIn circuit breaker reset");
            }));
```

### 12.5 Correlation IDs for Tracing

Pass correlation IDs through the entire flow:

```csharp
// In API controller
var correlationId = HttpContext.Request.Headers["X-Correlation-ID"].FirstOrDefault()
    ?? Guid.NewGuid().ToString();

await _bus.Publish(new PublishPost(postId, tenantId), context =>
{
    context.CorrelationId = Guid.Parse(correlationId);
});

// In consumer
public async Task Consume(ConsumeContext<PublishPost> context)
{
    using var _ = _logger.BeginScope(new Dictionary<string, object>
    {
        ["CorrelationId"] = context.CorrelationId,
        ["PostId"] = context.Message.PostId,
        ["TenantId"] = context.Message.TenantId
    });

    // All logs in this scope include correlation info
    _logger.LogInformation("Processing post");
}
```

### 12.6 Handling Platform Outages

When a platform is down, don't keep failing:

```csharp
public class PlatformHealthService
{
    private readonly ConcurrentDictionary<string, PlatformHealth> _health = new();

    public void RecordSuccess(string platform)
    {
        _health.AddOrUpdate(platform,
            _ => new PlatformHealth { LastSuccess = DateTime.UtcNow },
            (_, h) => { h.LastSuccess = DateTime.UtcNow; h.ConsecutiveFailures = 0; return h; });
    }

    public void RecordFailure(string platform, Exception ex)
    {
        _health.AddOrUpdate(platform,
            _ => new PlatformHealth { LastFailure = DateTime.UtcNow, ConsecutiveFailures = 1 },
            (_, h) => { h.LastFailure = DateTime.UtcNow; h.ConsecutiveFailures++; return h; });
    }

    public bool IsHealthy(string platform)
    {
        if (!_health.TryGetValue(platform, out var health))
            return true; // Unknown = assume healthy

        // Unhealthy if 5+ consecutive failures in last 10 minutes
        return health.ConsecutiveFailures < 5 ||
               health.LastFailure < DateTime.UtcNow.AddMinutes(-10);
    }
}
```

---

## 13. Pre-Build Checklist

Before writing code, ensure you have a plan for each item:

### 13.1 Core Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| PostgreSQL database provisioned | ☐ | |
| RabbitMQ instance running | ☐ | |
| Outbox table created | ☐ | |
| Scheduled posts table created | ☐ | |
| Worker service project created | ☐ | |

### 13.2 MassTransit Configuration

| Item | Status | Notes |
|------|--------|-------|
| Outbox pattern enabled | ☐ | **Mandatory** |
| Retry policy configured | ☐ | |
| Dead letter queues configured | ☐ | |
| Graceful shutdown configured | ☐ | |
| Consumer(s) registered | ☐ | |

### 13.3 Quartz Configuration

| Item | Status | Notes |
|------|--------|-------|
| Advisory lock implemented | ☐ | Single scheduler |
| `FOR UPDATE SKIP LOCKED` query ready | ☐ | |
| Recurring jobs scheduled | ☐ | |
| Wait for jobs on shutdown enabled | ☐ | |

### 13.4 Reliability

| Item | Status | Notes |
|------|--------|-------|
| Idempotency implemented in consumers | ☐ | |
| Token refresh job scheduled | ☐ | |
| DLQ monitoring implemented | ☐ | |
| Alerting configured | ☐ | |

### 13.5 Correctness

| Item | Status | Notes |
|------|--------|-------|
| All times stored in UTC | ☐ | |
| Timezone conversion tested | ☐ | |
| DST edge cases tested | ☐ | |
| Rate limiting implemented | ☐ | |

### 13.6 Observability

| Item | Status | Notes |
|------|--------|-------|
| Structured logging configured | ☐ | |
| Correlation IDs propagated | ☐ | |
| Health check endpoints added | ☐ | |
| Metrics exported (optional) | ☐ | |

---

## 14. Alternative Architectures Considered

For reference, here are the alternatives that were evaluated:

### 14.1 Hangfire + PostgreSQL

**Verdict:** Viable, but Redis paywall concern for future scaling.

| Pros | Cons |
|------|------|
| Excellent dashboard | Pro features require license |
| Simple API | Redis plugin is paid |
| Automatic retries | Less flexibility than message bus |

### 14.2 Wolverine + PostgreSQL

**Verdict:** Modern and clean, but less battle-tested.

| Pros | Cons |
|------|------|
| Modern, clean API | Newer (less mature) |
| Message-bus architecture | Smaller community |
| Built-in outbox | No built-in dashboard |
| PostgreSQL-only option | |

### 14.3 BullMQ (Node.js)

**Verdict:** Good, but splits the backend between C# and Node.

| Pros | Cons |
|------|------|
| Excellent for Node.js | Requires Node.js runtime |
| Redis-native | Splits backend languages |
| Good dashboard options | Separate from .NET solution |

### 14.4 Custom Implementation

**Verdict:** Maximum control, but reinventing the wheel.

| Pros | Cons |
|------|------|
| Full control | You build everything |
| No dependencies | No dashboard |
| Exactly what you need | Bugs are your problem |

---

## Conclusion

ChatGPT's recommended architecture (**RabbitMQ + MassTransit + Quartz.NET**) is solid and production-ready. The additions in this document address:

1. **Critical requirements** that were understated (outbox pattern)
2. **Operational concerns** that need attention (RabbitMQ management, DLQ monitoring)
3. **Domain-specific challenges** (OAuth tokens, timezones, rate limits)
4. **Reliability patterns** (idempotency, graceful shutdown)
5. **Pragmatic alternatives** (starting simpler if needed)

The architecture will serve PublyApp well from MVP through scale. Build it with confidence.

---

*Document prepared by Claude (Anthropic) as a review of ChatGPT's architectural recommendations.*

*Last updated: January 2026*
