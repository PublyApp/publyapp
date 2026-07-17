using System.Diagnostics;
using System.Text.Json;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Jobs.Entities;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Tuning knobs, held as code constants until Phase 2B surfaces the corresponding
/// AppEnvironment vars (JOB_QUEUE_BATCH_SIZE / JOB_QUEUE_POLL_SECONDS /
/// JOB_LEASE_SECONDS / JOB_QUEUE_DRAIN_BUDGET_SECONDS — design §3.1, §10 call-out).
/// Constructor-overridable so specs can run with short leases deterministically.
/// </summary>
public sealed record JobQueueProcessorOptions {
	public int BatchSize { get; init; } = 20;
	public int LeaseSeconds { get; init; } = 300;
	public int PollSeconds { get; init; } = 5;
	public int DrainBudgetSeconds { get; init; } = 60;

	// Spec-only escape hatch: proves the fencing token (not renewal luck) is what
	// protects reclaimed rows when a lease genuinely expires mid-run (§9 F1 spec).
	public bool EnableLeaseRenewal { get; init; } = true;
}

/// <summary>
/// Drains the generic job_queue on its own host-lifetime token (never a per-request
/// token). Hardened per design §5.1/§6 (2A-R):
/// - stale-lease reset and the pending-only hot claim are two statements, both on
///   database now() (F22/F11), the claim served by the partial index in one ordered
///   scan;
/// - every transition (complete, requeue, dead-letter, renewal, shutdown release) is
///   raw SQL conditioned on the claim's lock_token with an affected-row-count check —
///   zero rows means the lease was lost and the outcome is discarded (F1);
/// - each row's lease is re-stamped immediately before dispatch and renewed at
///   lease/2 while its handler runs (F1);
/// - handlers return a typed JobOutcome; thrown exceptions are classified — only the
///   host's own token (or a lease-lost cancellation) means shutdown (F12);
/// - retry backoff is applied as a SQL interval on now() with equal jitter (F11);
/// - after a full batch the loop claims again immediately, bounded by a drain budget
///   (F10).
/// Public ClaimBatchAsync / ProcessBatchAsync / ProcessOneAsync / Try*Async keep the
/// shipped dispatcher's public-methods-for-determinism discipline. Registered only
/// inside JobsServiceRegistration, which nothing invokes until 2B — the hosted loop
/// is inert at runtime and specs drive the public methods directly.
/// </summary>
public sealed class JobQueueProcessor : BackgroundService {
	private const int MaxErrorLength = 2048;

	private readonly IServiceScopeFactory _scopeFactory;
	private readonly JobHandlerRegistry _registry;
	private readonly JobsMetrics _metrics;
	private readonly ILogger<JobQueueProcessor> _logger;
	private readonly JobQueueProcessorOptions _options;

	// Identifies this worker instance in job_queue.locked_by for observability only.
	// Correctness comes from FOR UPDATE SKIP LOCKED + the lock_token fence.
	private readonly string _workerId = $"{Environment.MachineName}:{Guid.NewGuid():N}";

	public JobQueueProcessor(
		IServiceScopeFactory scopeFactory,
		JobHandlerRegistry registry,
		JobsMetrics metrics,
		ILogger<JobQueueProcessor> logger,
		JobQueueProcessorOptions? options = null
	) {
		_scopeFactory = scopeFactory;
		_registry = registry;
		_metrics = metrics;
		_logger = logger;
		_options = options ?? new JobQueueProcessorOptions();
	}

	/// <summary>A claimed row: its id plus the fencing token stamped by the claim.</summary>
	public sealed class ClaimedJob {
		public Guid Id { get; set; }
		public Guid LockToken { get; set; }
	}

	/// <summary>Why a drain pass ended (design §5.1, F10).</summary>
	public enum DrainExitReason {
		// A short/empty batch: the backlog is gone — wait for signal/poll.
		Drained = 0,
		// The drain budget expired with the last batch still FULL: backlog remains —
		// yield one loop iteration (fairness point) and resume immediately, never
		// waiting out the poll interval on known-pending work.
		BudgetExpired = 1
	}

	public sealed record DrainResult(int Processed, DrainExitReason Reason);

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		await LogDeadLetterOrphansAsync(stoppingToken);

		while (!stoppingToken.IsCancellationRequested) {
			var exitReason = DrainExitReason.Drained;

			try {
				var result = await DrainAsync(stoppingToken);
				exitReason = result.Reason;
			} catch (Exception ex) when (ex is not OperationCanceledException) {
				_logger.LogError(ex, "Job queue processing loop failed");
			}

			// Budget expiry means the backlog is NOT drained: the yield above (one
			// loop iteration, stoppingToken re-checked) is the whole fairness point —
			// resume draining immediately instead of stranding due work on the poll.
			if (exitReason == DrainExitReason.BudgetExpired) {
				continue;
			}

			try {
				// 2C's JobQueueListener adds a LISTEN/NOTIFY wake ahead of this
				// fallback poll; the interval remains the correctness fallback.
				await Task.Delay(TimeSpan.FromSeconds(_options.PollSeconds), stoppingToken);
			} catch (OperationCanceledException) {
				break;
			}
		}
	}

	// Drain loop (F10): keeps claiming while batches come back full, so one wake
	// empties a backlog instead of one-batch-per-poll-tick. Bounded by the drain
	// budget so a full queue can never starve shutdown or the loop's own heartbeat;
	// the exit reason tells the caller whether backlog remains (BudgetExpired) or the
	// queue is quiet (Drained). Public: lets specs prove both deterministically.
	public async Task<DrainResult> DrainAsync(CancellationToken stoppingToken) {
		var budget = Stopwatch.StartNew();
		var totalProcessed = 0;

		while (!stoppingToken.IsCancellationRequested) {
			var processed = await ProcessBatchAsync(stoppingToken);
			totalProcessed += processed;

			if (processed < _options.BatchSize) {
				return new DrainResult(totalProcessed, DrainExitReason.Drained);
			}

			if (budget.Elapsed.TotalSeconds >= _options.DrainBudgetSeconds) {
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation(
						"Job queue drain budget exhausted after {Processed} jobs; yielding",
						totalProcessed
					);
				}
				return new DrainResult(totalProcessed, DrainExitReason.BudgetExpired);
			}
		}

		return new DrainResult(totalProcessed, DrainExitReason.Drained);
	}

	// Public: lets specs drive a single batch deterministically instead of racing
	// ExecuteAsync's poll loop. Returns the number of rows claimed.
	public async Task<int> ProcessBatchAsync(CancellationToken stoppingToken) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		await ResetExpiredLeasesAsync(dbContext, stoppingToken);

		var claimed = await ClaimBatchAsync(
			dbContext,
			_workerId,
			_options.LeaseSeconds,
			_options.BatchSize,
			stoppingToken
		);
		if (claimed.Count == 0) {
			return 0;
		}

		var tokensById = claimed.ToDictionary(c => c.Id, c => c.LockToken);
		var claimedIds = tokensById.Keys.ToList();

		// Execute in the same order the claim selected: priority DESC with the same
		// deterministic tie-breakers (design §5.1, F9 regression guard).
		var batch = await dbContext.JobQueue
			.Where(j => j.Id != null && claimedIds.Contains(j.Id.Value))
			.OrderByDescending(j => j.Priority)
			.ThenBy(j => j.NextAttemptAt)
			.ThenBy(j => j.CreatedAt)
			.ThenBy(j => j.Id)
			.ToListAsync(stoppingToken);

		foreach (var item in batch) {
			var itemId = item.Id.GetValueOrDefault();

			// Checked between every job (F10/§3.6): on host shutdown, proactively
			// release everything not yet dispatched so a restart resumes immediately
			// instead of waiting out the lease.
			if (stoppingToken.IsCancellationRequested) {
				await TryReleaseAsync(
					dbContext, itemId, tokensById[itemId], CancellationToken.None
				);
				continue;
			}

			_metrics.Claimed(item.JobType);
			await ProcessOneAsync(dbContext, item, tokensById[itemId], stoppingToken);
		}

		return claimed.Count;
	}

	// Statement 1 of the claim cycle (F22): release expired leases separately so the
	// hot claim stays pending-only and the partial claim index serves it as one
	// ordered scan. Also run by 2B's RecoverStaleJobsJob for a fully-crashed fleet.
	public static async Task<int> ResetExpiredLeasesAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken
	) {
		const int pending = (int)JobQueueStatus.Pending;
		const int processing = (int)JobQueueStatus.Processing;

		return await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_queue
			SET status = {pending}, lock_token = NULL, locked_until = NULL,
				locked_by = NULL, updated_at = now()
			WHERE status = {processing} AND locked_until <= now()
			""",
			cancellationToken
		);
	}

	// Statement 2: the hot claim. Atomically claims up to batchSize due PENDING rows
	// in ONE statement — an UPDATE whose WHERE targets a `SELECT ... FOR UPDATE SKIP
	// LOCKED` subquery — so racing workers never both pick up the same row. Stamps a
	// fresh fencing lock_token per claim (F1); all time comparisons run against
	// database now() (F11). Public: lets specs race concurrent claims directly.
	public static async Task<List<ClaimedJob>> ClaimBatchAsync(
		AppDbContext dbContext,
		string workerId,
		int leaseSeconds,
		int batchSize,
		CancellationToken cancellationToken
	) {
		const int pending = (int)JobQueueStatus.Pending;
		const int processing = (int)JobQueueStatus.Processing;
		var freshToken = Guid.NewGuid();

		return await dbContext.Database.SqlQuery<ClaimedJob>(
			$"""
			UPDATE job_queue
			SET status = {processing},
				locked_until = now() + make_interval(secs => {leaseSeconds}),
				locked_by = {workerId},
				lock_token = {freshToken},
				updated_at = now()
			WHERE id IN (
				SELECT id FROM job_queue
				WHERE status = {pending} AND next_attempt_at <= now()
				ORDER BY priority DESC, next_attempt_at, created_at, id
				LIMIT {batchSize}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id AS "Id", lock_token AS "LockToken"
			"""
		).ToListAsync(cancellationToken);
	}

	// Public: lets specs exercise success / retry / dead-letter / classification on a
	// single claimed row directly, without racing a live background loop.
	public async Task ProcessOneAsync(
		AppDbContext dbContext,
		JobQueueItem item,
		Guid lockToken,
		CancellationToken stoppingToken
	) {
		var itemId = RequireId(item);

		// Per-dispatch re-stamp (F1): job #20 of a slow serial batch must not start
		// on an almost-expired lease. Zero rows = someone else owns it now.
		var restamped = await TryRenewLeaseAsync(
			dbContext, itemId, lockToken, _options.LeaseSeconds, stoppingToken
		);
		if (!restamped) {
			_metrics.LeaseLost(item.JobType);
			return;
		}

		using var leaseLostSource = new CancellationTokenSource();
		using var linkedSource = CancellationTokenSource.CreateLinkedTokenSource(
			stoppingToken, leaseLostSource.Token
		);
		using var renewalStop = new CancellationTokenSource();

		var renewalTask = _options.EnableLeaseRenewal
			? RenewLeaseLoopAsync(itemId, lockToken, leaseLostSource, renewalStop.Token)
			: Task.CompletedTask;

		var context = BuildContext(item, lastError: null);
		var stopwatch = Stopwatch.StartNew();
		JobOutcome outcome;

		try {
			if (_registry.TryResolve(item.JobType, out var handler)) {
				outcome = await handler.HandleAsync(context, linkedSource.Token);
			} else {
				outcome = new JobOutcome.PermanentFailure(
					$"No job handler registered for job type '{item.JobType}'."
				);
			}
		} catch (OperationCanceledException) when (leaseLostSource.IsCancellationRequested) {
			// Renewal detected a lost lease: the row belongs to a new claimant. The
			// outcome is discarded; nothing is written (F1).
			_metrics.LeaseLost(item.JobType);
			return;
		} catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) {
			// Host shutdown (F12/§3.6): abandon cleanly — no attempt burned, no DLQ.
			// Proactively release so a restart resumes immediately.
			await TryReleaseAsync(dbContext, itemId, lockToken, CancellationToken.None);
			return;
		} catch (JsonException ex) {
			// A payload that can never parse gains nothing from retries (F2/F12).
			outcome = new JobOutcome.PermanentFailure(BoundError(ex));
		} catch (OperationCanceledException ex) {
			// A cancellation NOT sourced from the host token or the lease fence is a
			// job failure (e.g. a provider HTTP timeout's TaskCanceledException) —
			// it must never look like shutdown or abandon its batchmates (F12).
			outcome = new JobOutcome.Retry(Error: BoundError(ex));
		} catch (Exception ex) {
			outcome = new JobOutcome.Retry(Error: BoundError(ex));
		} finally {
			stopwatch.Stop();
			await renewalStop.CancelAsync();

			try {
				await renewalTask;
			} catch (OperationCanceledException) {
				// Renewal loop exit via cancellation is its normal shutdown.
			}
		}

		// The renewal loop may have detected a lost lease after the handler returned
		// normally; the conditioned transitions below would no-op, but check first so
		// the discard is explicit and counted.
		if (leaseLostSource.IsCancellationRequested) {
			_metrics.LeaseLost(item.JobType);
			return;
		}

		_metrics.HandlerDuration(
			item.JobType, outcome.GetType().Name, stopwatch.Elapsed.TotalSeconds
		);

		await ApplyOutcomeAsync(dbContext, item, lockToken, outcome, stoppingToken);
	}

	// --- fencing-conditioned transitions (F1) ------------------------------------
	// All raw SQL: they bypass UpdateAuditFields and app clocks entirely, and each
	// checks the affected-row count — zero rows = the lease was lost.

	/// <summary>Success/Cancelled path: conditioned hard delete.</summary>
	public static async Task<bool> TryCompleteAsync(
		AppDbContext dbContext,
		Guid jobId,
		Guid lockToken,
		CancellationToken cancellationToken
	) {
		var affected = await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE id = {jobId} AND lock_token = {lockToken}",
			cancellationToken
		);
		return affected > 0;
	}

	/// <summary>
	/// Retry path (#810 fix, F11): back to Pending with the lease cleared, backoff
	/// applied as a SQL interval on database now() — the same claim predicate that
	/// governs first runs governs retries.
	/// </summary>
	public static async Task<bool> TryRequeueAsync(
		AppDbContext dbContext,
		Guid jobId,
		Guid lockToken,
		double delaySeconds,
		string? lastError,
		CancellationToken cancellationToken
	) {
		const int pending = (int)JobQueueStatus.Pending;

		var affected = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_queue
			SET status = {pending}, attempts = attempts + 1, last_error = {lastError},
				next_attempt_at = now() + make_interval(secs => {delaySeconds}),
				lock_token = NULL, locked_until = NULL, locked_by = NULL,
				updated_at = now()
			WHERE id = {jobId} AND lock_token = {lockToken}
			""",
			cancellationToken
		);
		return affected > 0;
	}

	/// <summary>Lease renewal / per-dispatch re-stamp (F1).</summary>
	public static async Task<bool> TryRenewLeaseAsync(
		AppDbContext dbContext,
		Guid jobId,
		Guid lockToken,
		int leaseSeconds,
		CancellationToken cancellationToken
	) {
		var affected = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_queue
			SET locked_until = now() + make_interval(secs => {leaseSeconds}),
				updated_at = now()
			WHERE id = {jobId} AND lock_token = {lockToken}
			""",
			cancellationToken
		);
		return affected > 0;
	}

	/// <summary>
	/// Shutdown release (§3.6): back to Pending, lease cleared, attempts and
	/// next_attempt_at untouched — an abandoned run costs nothing and is immediately
	/// claimable on restart.
	/// </summary>
	public static async Task<bool> TryReleaseAsync(
		AppDbContext dbContext,
		Guid jobId,
		Guid lockToken,
		CancellationToken cancellationToken
	) {
		const int pending = (int)JobQueueStatus.Pending;

		var affected = await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_queue
			SET status = {pending}, lock_token = NULL, locked_until = NULL,
				locked_by = NULL, updated_at = now()
			WHERE id = {jobId} AND lock_token = {lockToken}
			""",
			cancellationToken
		);
		return affected > 0;
	}

	// --- outcome application ------------------------------------------------------

	private async Task ApplyOutcomeAsync(
		AppDbContext dbContext,
		JobQueueItem item,
		Guid lockToken,
		JobOutcome outcome,
		CancellationToken stoppingToken
	) {
		var itemId = RequireId(item);

		if (outcome is JobOutcome.Success) {
			if (await TryCompleteAsync(dbContext, itemId, lockToken, stoppingToken)) {
				_metrics.Succeeded(item.JobType);
				LogCompleted(item);
			} else {
				_metrics.LeaseLost(item.JobType);
			}
			return;
		}

		if (outcome is JobOutcome.Cancelled cancelled) {
			if (await TryCompleteAsync(dbContext, itemId, lockToken, stoppingToken)) {
				_metrics.Cancelled(item.JobType);

				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation(
						"Cancelled job {JobId} of type {JobType}: {Reason}",
						itemId,
						item.JobType,
						cancelled.Reason
					);
				}
			} else {
				_metrics.LeaseLost(item.JobType);
			}
			return;
		}

		if (outcome is JobOutcome.PermanentFailure permanent) {
			await DeadLetterAsync(
				dbContext, item, lockToken,
				item.Attempts + 1, Bound(permanent.Reason), stoppingToken
			);
			return;
		}

		if (outcome is JobOutcome.Retry retry) {
			var failedAttempts = item.Attempts + 1;

			if (failedAttempts >= item.MaxAttempts) {
				await DeadLetterAsync(
					dbContext, item, lockToken,
					failedAttempts, Bound(retry.Error), stoppingToken
				);
				return;
			}

			// Engine-owned backoff (§5.1): jittered exponential, with a handler
			// delay override (e.g. provider Retry-After) winning when longer.
			var delaySeconds = JobBackoff.DelaySeconds(failedAttempts);
			if (retry.DelayOverride is { } overrideDelay
				&& overrideDelay.TotalSeconds > delaySeconds) {
				delaySeconds = overrideDelay.TotalSeconds;
			}

			var requeued = await TryRequeueAsync(
				dbContext, itemId, lockToken, delaySeconds, Bound(retry.Error),
				stoppingToken
			);
			if (requeued) {
				_metrics.Retried(item.JobType);

				if (_logger.IsEnabled(LogLevel.Warning)) {
					_logger.LogWarning(
						"Job {JobId} of type {JobType} failed (attempt "
						+ "{Attempt}/{MaxAttempts}); requeued with {DelaySeconds:F0}s "
						+ "backoff: {Error}",
						itemId,
						item.JobType,
						failedAttempts,
						item.MaxAttempts,
						delaySeconds,
						retry.Error
					);
				}
			} else {
				_metrics.LeaseLost(item.JobType);
			}
			return;
		}

		throw new InvalidOperationException(
			$"Unhandled job outcome type {outcome.GetType().Name}"
		);
	}

	// Terminal path (F5/F16): the handler's OnTerminalFailureAsync hook, the
	// full-envelope DLQ insert, and the fencing-conditioned queue delete run in ONE
	// transaction — a hook throw rolls everything back and the still-leased row is
	// retried whole after lease expiry.
	private async Task DeadLetterAsync(
		AppDbContext dbContext,
		JobQueueItem item,
		Guid lockToken,
		int attempts,
		string? lastError,
		CancellationToken stoppingToken
	) {
		var itemId = RequireId(item);
		var deadLetter = JobDeadLetter.FromJob(item, attempts, lastError);

		await using var transaction =
			await dbContext.Database.BeginTransactionAsync(stoppingToken);

		try {
			if (_registry.TryResolve(item.JobType, out var handler)) {
				var terminalContext = BuildContext(item, lastError);
				await handler.OnTerminalFailureAsync(terminalContext, stoppingToken);
			}

			await dbContext.JobDeadLetter.AddAsync(deadLetter, stoppingToken);
			await dbContext.SaveChangesAsync(stoppingToken);

			var deleted = await TryCompleteAsync(dbContext, itemId, lockToken, stoppingToken);
			if (!deleted) {
				// The lease was lost while going terminal: the new claimant owns the
				// row now. Roll back the DLQ copy — the job is not terminal for us.
				await transaction.RollbackAsync(CancellationToken.None);
				dbContext.Entry(deadLetter).State = EntityState.Detached;
				_metrics.LeaseLost(item.JobType);
				return;
			}

			await transaction.CommitAsync(stoppingToken);
		} catch (Exception ex) when (ex is not OperationCanceledException) {
			await transaction.RollbackAsync(CancellationToken.None);
			dbContext.Entry(deadLetter).State = EntityState.Detached;

			_logger.LogError(
				ex,
				"Terminal-failure step for job {JobId} of type {JobType} rolled back "
				+ "(hook or DLQ write failed); the leased row will be retried whole "
				+ "after lease expiry",
				itemId,
				item.JobType
			);
			return;
		}

		_metrics.DeadLettered(item.JobType);
		_metrics.AttemptsAtTerminal(item.JobType, attempts);

		_logger.LogError(
			"Job {JobId} of type {JobType} dead-lettered after {Attempts} attempts: "
			+ "{Error}",
			itemId,
			item.JobType,
			attempts,
			lastError
		);
	}

	// --- renewal loop (F1) ---------------------------------------------------------

	// Re-stamps the lease at lease/2 cadence while the handler runs, on its OWN scope
	// and connection (the batch DbContext is busy with the handler's work). Renewal
	// failure means the lease was lost: cancel the handler via the linked source.
	private async Task RenewLeaseLoopAsync(
		Guid jobId,
		Guid lockToken,
		CancellationTokenSource leaseLostSource,
		CancellationToken stopRenewal
	) {
		var interval = TimeSpan.FromSeconds(_options.LeaseSeconds / 2.0);

		while (!stopRenewal.IsCancellationRequested) {
			try {
				await Task.Delay(interval, stopRenewal);
			} catch (OperationCanceledException) {
				return;
			}

			try {
				using var scope = _scopeFactory.CreateScope();
				var renewalContext =
					scope.ServiceProvider.GetRequiredService<AppDbContext>();

				var renewed = await TryRenewLeaseAsync(
					renewalContext, jobId, lockToken, _options.LeaseSeconds, stopRenewal
				);
				if (!renewed) {
					await leaseLostSource.CancelAsync();
					return;
				}
			} catch (OperationCanceledException) {
				return;
			} catch (Exception ex) {
				// A transient renewal error is not proof of a lost lease; the next
				// tick retries. The fence still protects every transition.
				_logger.LogWarning(
					ex, "Lease renewal attempt failed for job {JobId}", jobId
				);
			}
		}
	}

	// --- helpers ---------------------------------------------------------------------

	private async Task LogDeadLetterOrphansAsync(CancellationToken stoppingToken) {
		try {
			using var scope = _scopeFactory.CreateScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			await _registry.LogUnregisteredDeadLetterTypesAsync(
				dbContext, _logger, stoppingToken
			);
		} catch (Exception ex) when (ex is not OperationCanceledException) {
			_logger.LogWarning(ex, "Dead-letter orphan check failed at startup");
		}
	}

	private static JobContext BuildContext(JobQueueItem item, string? lastError) {
		return new JobContext {
			JobId = RequireId(item),
			JobType = item.JobType,
			Payload = item.Payload,
			Attempts = item.Attempts,
			MaxAttempts = item.MaxAttempts,
			TenantId = item.TenantId,
			ActorUserId = item.ActorUserId,
			CorrelationId = item.CorrelationId,
			LastError = lastError
		};
	}

	private static Guid RequireId(JobQueueItem item) {
		if (item.Id is null) {
			throw new InvalidOperationException(
				"Cannot process a JobQueueItem that has not been persisted (Id is null)."
			);
		}

		return item.Id.Value;
	}

	// Bounded + sanitized error strings (F20): exception type + message, ≤ 2 KB,
	// never payload JSON or token echo.
	private static string BoundError(Exception ex) {
		var bounded = Bound($"{ex.GetType().Name}: {ex.Message}");
		return bounded ?? string.Empty;
	}

	private static string? Bound(string? error) {
		if (error is null) {
			return null;
		}

		return error.Length <= MaxErrorLength ? error : error[..MaxErrorLength];
	}

	private void LogCompleted(JobQueueItem item) {
		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Completed job {JobId} of type {JobType}",
				item.Id,
				item.JobType
			);
		}
	}
}
