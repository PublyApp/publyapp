using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Drains the generic job_queue on its own host-lifetime token (never a per-request
/// token), so a client disconnect cannot lose execution — only a graceful host
/// shutdown pauses it, and any claimed-but-unfinished row is durably persisted and
/// reclaimed after its lease expires. Structure mirrors the shipped
/// InvitationEmailOutboxDispatcher, including its public-methods-for-determinism
/// discipline: ClaimBatchAsync / ProcessBatchAsync / ProcessOneAsync are public so
/// specs drive a single deterministic batch instead of racing the poll loop.
///
/// Phase 2A wires no role gating and no cross-process wake yet (2B/2C). This service
/// is registered only inside JobsServiceRegistration, which nothing invokes yet — so
/// at runtime the loop is inert; the specs exercise the public methods directly.
/// </summary>
public sealed class JobQueueProcessor : BackgroundService {
	private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

	// Rows claimed per tick and the claim lease. Held as constants for Phase 2A
	// (matching the shipped outbox's hardcoded BatchSize); Phase 2B surfaces
	// JOB_QUEUE_BATCH_SIZE / JOB_LEASE_SECONDS via AppEnvironment, which this phase
	// must not touch.
	public const int BatchSize = 20;
	public const int LeaseSeconds = 300;

	private readonly IServiceScopeFactory _scopeFactory;
	private readonly JobHandlerRegistry _registry;
	private readonly ILogger<JobQueueProcessor> _logger;

	// Identifies this worker instance in job_queue.locked_by for observability. Never
	// used for correctness: claim exclusivity comes from FOR UPDATE SKIP LOCKED.
	private readonly string _workerId = $"{Environment.MachineName}:{Guid.NewGuid():N}";

	public JobQueueProcessor(
		IServiceScopeFactory scopeFactory,
		JobHandlerRegistry registry,
		ILogger<JobQueueProcessor> logger
	) {
		_scopeFactory = scopeFactory;
		_registry = registry;
		_logger = logger;
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		while (!stoppingToken.IsCancellationRequested) {
			try {
				await ProcessBatchAsync(stoppingToken);
			} catch (Exception ex) when (ex is not OperationCanceledException) {
				_logger.LogError(ex, "Job queue processing loop failed");
			}

			try {
				// Phase 2C adds a LISTEN/NOTIFY wake in front of this fallback poll.
				await Task.Delay(PollInterval, stoppingToken);
			} catch (OperationCanceledException) {
				break;
			}
		}
	}

	// Public: lets specs drive a single batch deterministically instead of racing
	// ExecuteAsync's poll loop.
	public async Task ProcessBatchAsync(CancellationToken stoppingToken) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var claimedIds = await ClaimBatchAsync(dbContext, _workerId, stoppingToken);
		if (claimedIds.Count == 0) {
			return;
		}

		// Execute in the same order the claim selected: priority DESC, then schedule,
		// then insertion (design §4.1/§5.1) — higher-priority jobs run first within
		// the batch, not just get claimed first.
		var batch = await dbContext.JobQueue
			.Where(j => j.Id != null && claimedIds.Contains(j.Id.Value))
			.OrderByDescending(j => j.Priority)
			.ThenBy(j => j.NextAttemptAt)
			.ThenBy(j => j.CreatedAt)
			.ToListAsync(stoppingToken);

		foreach (var item in batch) {
			await ProcessOneAsync(dbContext, item, stoppingToken);
		}
	}

	// Atomically claims up to BatchSize due rows in ONE statement — an UPDATE whose
	// WHERE targets a `SELECT ... FOR UPDATE SKIP LOCKED` subquery — so two racing
	// workers (a rolling deployment's old and new replicas, or two poll ticks) never
	// both pick up the same row. The predicate also reclaims rows whose lease
	// (locked_until) has expired, covering a worker that crashed mid-execution. All
	// time comparisons run against database now() so multi-replica workers agree
	// regardless of container clock skew (design §6). Public: lets specs race
	// concurrent claims directly.
	public static async Task<List<Guid>> ClaimBatchAsync(
		AppDbContext dbContext,
		string workerId,
		CancellationToken cancellationToken
	) {
		const int pending = (int)JobQueueStatus.Pending;
		const int processing = (int)JobQueueStatus.Processing;

		return await dbContext.Database.SqlQuery<Guid>(
			$"""
			UPDATE job_queue
			SET status = {processing},
				locked_until = now() + make_interval(secs => {LeaseSeconds}),
				locked_by = {workerId},
				updated_at = now()
			WHERE id IN (
				SELECT id FROM job_queue
				WHERE (status = {pending} AND next_attempt_at <= now())
					OR (status = {processing} AND locked_until <= now())
				ORDER BY priority DESC, next_attempt_at, created_at
				LIMIT {BatchSize}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id AS "Value"
			"""
		).ToListAsync(cancellationToken);
	}

	// Public: lets specs exercise the success / retry-backoff / dead-letter branches
	// on a single row directly, without racing a live background poll loop.
	public async Task ProcessOneAsync(
		AppDbContext dbContext,
		JobQueueItem item,
		CancellationToken cancellationToken
	) {
		if (item.Id is null) {
			throw new InvalidOperationException(
				"Cannot process a JobQueueItem that has not been persisted (Id is null)."
			);
		}

		try {
			if (!_registry.TryResolve(item.JobType, out var handler)) {
				throw new InvalidOperationException(
					$"No job handler registered for job type '{item.JobType}'."
				);
			}

			var context = new JobContext {
				JobId = item.Id.Value,
				JobType = item.JobType,
				Payload = item.Payload,
				Attempts = item.Attempts
			};

			await handler.HandleAsync(context, cancellationToken);

			// Success is a HARD delete (design §4.0): JobQueueItem is not a
			// BaseAttributesNoKey entity, so Remove bypasses the soft-delete
			// conversion in AppDbContext.UpdateAuditFields.
			dbContext.JobQueue.Remove(item);
			await dbContext.SaveChangesAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Completed job {JobId} of type {JobType}",
					item.Id.Value,
					item.JobType
				);
			}
		} catch (Exception ex) when (ex is not OperationCanceledException) {
			await HandleFailureAsync(dbContext, item, ex, cancellationToken);
		}
	}

	private async Task HandleFailureAsync(
		AppDbContext dbContext,
		JobQueueItem item,
		Exception ex,
		CancellationToken cancellationToken
	) {
		item.Attempts++;
		item.LastError = ex.Message;
		item.UpdatedAt = DateTime.UtcNow;

		if (item.Attempts >= item.MaxAttempts) {
			// Terminal: copy to job_dead_letter and hard-delete from job_queue in one
			// transaction (design §6). No Failed status is ever persisted.
			var deadLetter = JobDeadLetter.FromJob(item);
			await dbContext.JobDeadLetter.AddAsync(deadLetter, cancellationToken);
			dbContext.JobQueue.Remove(item);

			_logger.LogError(
				ex,
				"Job {JobId} of type {JobType} dead-lettered after {Attempts} attempts",
				item.Id,
				item.JobType,
				item.Attempts
			);
		} else {
			// Retryable — the #810-class fix: reset to Pending and CLEAR the lease so
			// the SAME claim predicate (status = Pending AND next_attempt_at <= now)
			// that governs first-run also governs retries. No row is ever left
			// Processing merely to wait out its lease for backoff.
			item.Status = JobQueueStatus.Pending;
			item.NextAttemptAt = JobBackoff.NextAttempt(item.Attempts);
			item.LockedUntil = null;
			item.LockedBy = null;

			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					ex,
					"Job {JobId} of type {JobType} failed (attempt {Attempt}/{MaxAttempts}), "
					+ "retrying at {NextAttemptAt}",
					item.Id,
					item.JobType,
					item.Attempts,
					item.MaxAttempts,
					item.NextAttemptAt
				);
			}
		}

		await dbContext.SaveChangesAsync(cancellationToken);
	}
}
