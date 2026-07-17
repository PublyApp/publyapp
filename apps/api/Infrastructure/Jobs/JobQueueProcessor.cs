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
/// - each job runs in a FRESH DI scope: the handler and the engine's transition
///   AppDbContext resolve from the same scope, so a scoped handler's injected context
///   shares the terminal-failure transaction (F5) and DI scope validation holds;
/// - claimed ownership is tracked and settled on EVERY exit path — rows the loop
///   never reaches (shutdown, mid-flight cancellation) are proactively released;
/// - handlers return a typed JobOutcome; thrown exceptions are classified — only the
///   host's own token (or a lease-lost cancellation) means shutdown (F12); once a
///   handler HAS returned, its outcome is applied with CancellationToken.None so a
///   completed run is never discarded by shutdown (§3.6);
/// - retry backoff is applied as a SQL interval on now() with equal jitter (F11);
/// - handler-supplied strings pass through JobErrorSanitizer before any durable
///   write or log template, and NO raw exception is ever handed to the logger: a
///   sink renders ex.Message verbatim, so the engine logs the sanitized
///   Describe(ex) plus safe stack metadata instead (F20/R2-8);
/// - after a full batch the loop claims again immediately, bounded by a drain budget
///   (F10) — budget expiry resumes draining without waiting for signal/poll.
/// Public ClaimBatchAsync / ProcessBatchAsync / ProcessOneAsync / Try*Async keep the
/// shipped dispatcher's public-methods-for-determinism discipline. Registered only
/// inside JobsServiceRegistration, which nothing invokes until 2B — the hosted loop
/// is inert at runtime and specs drive the public methods directly.
/// </summary>
public sealed class JobQueueProcessor : BackgroundService {
	private readonly IServiceScopeFactory _scopeFactory;
	private readonly JobHandlerRegistry _registry;
	private readonly JobsMetrics _metrics;
	private readonly ILogger<JobQueueProcessor> _logger;
	private readonly JobQueueProcessorOptions _options;

	// The replica id this processor writes to job_queue.locked_by. It is INJECTED,
	// not minted here: §7.1 requires the metrics `instance` tag to be the same value
	// as locked_by, and JobWorkerInstance is the single generator that makes that so
	// (see its docs). Correctness never rests on it — that is FOR UPDATE SKIP LOCKED
	// plus the lock_token fence.
	private readonly JobWorkerInstance _instance;

	public JobQueueProcessor(
		IServiceScopeFactory scopeFactory,
		JobHandlerRegistry registry,
		JobsMetrics metrics,
		JobWorkerInstance instance,
		ILogger<JobQueueProcessor> logger,
		JobQueueProcessorOptions? options = null
	) {
		_scopeFactory = scopeFactory;
		_registry = registry;
		_metrics = metrics;
		_instance = instance;
		_logger = logger;
		_options = options ?? new JobQueueProcessorOptions();
	}

	/// <summary>
	/// Spec-only seam (R3-F3), null in production — the hosted loop never sets it.
	/// Reproduces the ONE renewal interleaving wall-clock timing cannot make
	/// deterministic: an Npgsql renewal whose UPDATE commits a later locked_until
	/// server-side while the client observes cancellation, because Npgsql cancellation
	/// is best-effort (F1). When set, the renewal loop invokes it exactly once, AFTER a
	/// real committed stamp is in hand, passing that stamp and an action that forces the
	/// safe-deadline to win; the spec uses it to raise the ambiguous
	/// OperationCanceledException the catch must now route through compensation.
	/// </summary>
	public Func<LeaseStamp, Action, Task>? RenewalCommitProbe { get; set; }

	/// <summary>A claimed row: id, fencing token, and job type (for metrics at claim).</summary>
	public sealed class ClaimedJob {
		public Guid Id { get; set; }
		public Guid LockToken { get; set; }
		public string JobType { get; set; } = string.Empty;
	}

	/// <summary>
	/// A CONFIRMED lease stamp, returned by the renewal UPDATE's RETURNING clause
	/// (design §5.1, R2-4): the deadline the row now actually carries and the database
	/// clock reading from the same statement. Both are database-computed, so the
	/// safety margin is measured in database time — the only clock that decides when
	/// ResetExpiredLeasesAsync may reclaim the row (F11).
	/// </summary>
	public sealed class LeaseStamp {
		public DateTime LockedUntil { get; set; }
		public DateTime DatabaseNow { get; set; }
	}

	/// <summary>How one dispatched job's claimed ownership was settled.</summary>
	public enum JobExecutionResult {
		// An outcome was CONFIRMED applied: the conditioned delete/requeue affected
		// a row, or the terminal transaction committed. Never reported on a fenced
		// zero-row transition or a rolled-back terminal step.
		Completed = 0,
		// Host shutdown: the row was proactively released back to Pending.
		Released = 1,
		// The lease was lost to another claimant; the outcome was discarded.
		LeaseLost = 2,
		// The terminal step rolled back (hook/DLQ write failed); the row is
		// deliberately left leased and retried whole after lease expiry (F5).
		Faulted = 3
	}

	/// <summary>
	/// One batch's accounting (F21): Claimed counts ownership acquisition, Dispatched
	/// counts handlers started, Completed counts outcomes applied.
	/// </summary>
	public sealed record BatchResult(int Claimed, int Dispatched, int Completed, bool WasFull);

	/// <summary>Why a drain pass ended (design §5.1, F10).</summary>
	public enum DrainExitReason {
		// A short/empty batch: the backlog is gone — wait for signal/poll.
		Drained = 0,
		// The drain budget expired with the last batch still FULL: backlog remains —
		// yield one loop iteration (fairness point) and resume immediately, never
		// waiting out the poll interval on known-pending work.
		BudgetExpired = 1
	}

	public sealed record DrainResult(int Claimed, int Dispatched, DrainExitReason Reason);

	/// <summary>
	/// One dispatch attempt's whole result: the outcome to apply, the ONLY handler
	/// whose terminal hook may run for it, and the original exception (if any) for the
	/// engine's logs.
	///
	/// The hook target is a field of this value rather than a local, because §5.1's
	/// terminal-hook rule is a property of HOW the outcome was produced, not of
	/// whether a handler object happens to exist. Those are different questions: an
	/// instance must be CONSTRUCTED before anything can discover that the payload
	/// never parses, so "a handler exists" is true on a path where the spec says no
	/// handler was reached. Asking the object is how the hook ran for a malformed
	/// payload — the hook reloads its recipient from ids the payload never carried,
	/// throws, rolls the terminal step back, and revives the job on every lease
	/// expiry: #810's infinite lease loop.
	///
	/// So no path may stay silent and inherit a hook target it never earned. There is
	/// no public constructor — every path must pick <see cref="HandlerReached"/> or
	/// <see cref="NoHandlerReached"/>, and definite assignment makes forgetting a
	/// compile error rather than a revived job. The nullability of
	/// <see cref="HookTarget"/> then means exactly one thing, and DeadLetterAsync's
	/// guard is correct by construction.
	/// </summary>
	private sealed record JobDispatch {
		private JobDispatch(JobOutcome outcome, IJobHandler? hookTarget, Exception? failure) {
			Outcome = outcome;
			HookTarget = hookTarget;
			Failure = failure;
		}

		public JobOutcome Outcome { get; }

		/// <summary>
		/// The handler whose OnTerminalFailureAsync runs if this outcome goes
		/// terminal; null when no handler was legitimately reached (§5.1).
		/// </summary>
		public IJobHandler? HookTarget { get; }

		/// <summary>The original exception, for the engine's logs only; never durable.</summary>
		public Exception? Failure { get; }

		/// <summary>
		/// The handler-reached settlement — §5.1's normal case. The registration
		/// resolved, its handler owned this job_type, and the instance ran: whatever
		/// it returned or threw is its own, so its terminal hook is its own to run.
		/// </summary>
		public static JobDispatch HandlerReached(
			IJobHandler handler,
			JobOutcome outcome,
			Exception? failure = null
		) {
			return new JobDispatch(outcome, handler, failure);
		}

		/// <summary>
		/// The invalid-before-handler settlement (§5.1, R6-4/O21): no handler was
		/// legitimately reached — an unknown job_type, a drifted registration, a
		/// handler that could not be constructed, or a payload that can never parse.
		/// There is no JobContext worth handing anyone, so the terminal step is
		/// DLQ-only and step 3 does not fire. That is the rule, not an omission.
		/// </summary>
		public static JobDispatch NoHandlerReached(
			JobOutcome outcome,
			Exception? failure = null
		) {
			return new JobDispatch(outcome, null, failure);
		}
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		await LogDeadLetterOrphansAsync(stoppingToken);

		while (!stoppingToken.IsCancellationRequested) {
			var exitReason = DrainExitReason.Drained;

			try {
				var result = await DrainAsync(stoppingToken);
				exitReason = result.Reason;
			} catch (Exception ex) when (ex is not OperationCanceledException) {
				_logger.LogError(
					"Job queue processing loop failed: {FailureDescription} {FailureStack}",
					JobErrorSanitizer.Describe(ex),
					JobErrorSanitizer.DescribeStack(ex)
				);
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
		var totalClaimed = 0;
		var totalDispatched = 0;

		while (!stoppingToken.IsCancellationRequested) {
			var batch = await ProcessBatchAsync(stoppingToken);
			totalClaimed += batch.Claimed;
			totalDispatched += batch.Dispatched;

			if (!batch.WasFull) {
				return new DrainResult(
					totalClaimed, totalDispatched, DrainExitReason.Drained
				);
			}

			if (budget.Elapsed.TotalSeconds >= _options.DrainBudgetSeconds) {
				if (_logger.IsEnabled(LogLevel.Information)) {
					_logger.LogInformation(
						"Job queue drain budget exhausted after {Dispatched} jobs; yielding",
						totalDispatched
					);
				}
				return new DrainResult(
					totalClaimed, totalDispatched, DrainExitReason.BudgetExpired
				);
			}
		}

		return new DrainResult(totalClaimed, totalDispatched, DrainExitReason.Drained);
	}

	// Public: lets specs drive a single batch deterministically instead of racing
	// ExecuteAsync's poll loop. Claimed ownership is settled on every exit path: rows
	// never dispatched (shutdown, mid-flight cancellation, load failure) are released
	// in the finally with CancellationToken.None, so no row is ever left leased for
	// the full window by a cancelled batch.
	public async Task<BatchResult> ProcessBatchAsync(CancellationToken stoppingToken) {
		var unsettled = new Dictionary<Guid, ClaimedJob>();
		var claimedCount = 0;
		var dispatched = 0;
		var completed = 0;

		try {
			List<JobQueueItem> batch;

			using (var scope = _scopeFactory.CreateScope()) {
				var claimContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

				await ResetExpiredLeasesAsync(claimContext, stoppingToken);

				var claimed = await ClaimBatchAsync(
					claimContext,
					_instance.Id,
					_options.LeaseSeconds,
					_options.BatchSize,
					stoppingToken
				);
				claimedCount = claimed.Count;
				if (claimedCount == 0) {
					return new BatchResult(0, 0, 0, false);
				}

				// Ownership acquisition is the claim itself — count it here, not at
				// dispatch (F21 accounting).
				foreach (var claim in claimed) {
					_metrics.Claimed(claim.JobType);
					unsettled[claim.Id] = claim;
				}

				var claimedIds = unsettled.Keys.ToList();

				// Execute in the same order the claim selected: priority DESC with
				// the same deterministic tie-breakers (design §5.1, F9 guard).
				batch = await (
					from job in claimContext.JobQueue
					where job.Id != null && claimedIds.Contains(job.Id.Value)
					orderby job.Priority descending, job.NextAttemptAt, job.CreatedAt, job.Id
					select job
				).ToListAsync(stoppingToken);
			}

			foreach (var item in batch) {
				var itemId = item.Id.GetValueOrDefault();

				// Checked between every job (F10/§3.6): on host shutdown the finally
				// below proactively releases everything not yet dispatched, so a
				// restart resumes immediately instead of waiting out leases.
				if (stoppingToken.IsCancellationRequested) {
					break;
				}

				dispatched++;
				var claim = unsettled[itemId];
				var result = await ProcessOneAsync(item, claim.LockToken, stoppingToken);

				// ProcessOneAsync settles ownership on all of its return paths.
				unsettled.Remove(itemId);

				if (result == JobExecutionResult.Completed) {
					completed++;
				}
			}

			return new BatchResult(
				claimedCount, dispatched, completed, claimedCount == _options.BatchSize
			);
		} finally {
			if (unsettled.Count > 0) {
				await ReleaseUnsettledAsync(unsettled.Values);
			}
		}
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
			RETURNING id AS "Id", lock_token AS "LockToken", job_type AS "JobType"
			"""
		).ToListAsync(cancellationToken);
	}

	// Public: lets specs exercise success / retry / dead-letter / classification on a
	// single claimed row directly, without racing a live background loop. Creates a
	// FRESH DI scope for the job: the handler and the engine's transition
	// AppDbContext resolve from the same scope, so a scoped handler's injected
	// context shares the terminal transaction (F5). Settles ownership on every
	// return path.
	public async Task<JobExecutionResult> ProcessOneAsync(
		JobQueueItem item,
		Guid lockToken,
		CancellationToken stoppingToken
	) {
		var itemId = RequireId(item);

		await using var scope = _scopeFactory.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// Per-dispatch re-stamp (F1): job #20 of a slow serial batch must not start
		// on an almost-expired lease. Zero rows = someone else owns it now. The
		// anchor is taken BEFORE the statement is issued so that elapsed time
		// measured against it can only OVER-count the time since the database's own
		// now() — never under-count it (see ConfirmedLease).
		var restampAnchor = Stopwatch.GetTimestamp();
		var restamped = await TryRenewLeaseAsync(
			dbContext, itemId, lockToken, _options.LeaseSeconds, stoppingToken
		);
		if (restamped is null) {
			_metrics.LeaseLost(item.JobType);
			return JobExecutionResult.LeaseLost;
		}

		using var leaseLostSource = new CancellationTokenSource();
		using var linkedSource = CancellationTokenSource.CreateLinkedTokenSource(
			stoppingToken, leaseLostSource.Token
		);
		using var renewalStop = new CancellationTokenSource();

		// The re-stamp above is the renewal loop's time zero: it is the first
		// confirmed database deadline, and the loop arms its deadline timer from it.
		var renewalTask = _options.EnableLeaseRenewal
			? RenewLeaseLoopAsync(
				itemId,
				lockToken,
				ConfirmedLease.From(restamped, restampAnchor, SafetyMargin()),
				leaseLostSource,
				renewalStop.Token
			)
			: Task.CompletedTask;

		var context = BuildContext(item, lastError: null);
		var stopwatch = Stopwatch.StartNew();
		JobDispatch dispatch;

		try {
			dispatch = await DispatchAsync(
				scope.ServiceProvider,
				context,
				linkedSource.Token,
				leaseLostSource.Token,
				stoppingToken
			);
		} catch (OperationCanceledException) when (leaseLostSource.IsCancellationRequested) {
			// Renewal detected a lost lease: the row belongs to a new claimant. The
			// outcome is discarded; nothing is written (F1).
			stopwatch.Stop();
			_metrics.HandlerDuration(item.JobType, "LeaseLost", stopwatch.Elapsed.TotalSeconds);
			_metrics.LeaseLost(item.JobType);
			return JobExecutionResult.LeaseLost;
		} catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) {
			// Host shutdown (F12/§3.6): abandon cleanly — no attempt burned, no DLQ.
			// Proactively release so a restart resumes immediately.
			stopwatch.Stop();
			_metrics.HandlerDuration(
				item.JobType, "ShutdownAbandoned", stopwatch.Elapsed.TotalSeconds
			);
			var released = await TryReleaseAsync(
				dbContext, itemId, lockToken, CancellationToken.None
			);
			if (!released) {
				LogReleaseLost(itemId, item.JobType);
				return JobExecutionResult.LeaseLost;
			}
			return JobExecutionResult.Released;
		} catch (Exception ex) {
			// Dispatch itself failed around — never inside — a legitimately reached
			// handler: registry resolution or handler construction threw, or a
			// foreign cancellation escaped one of them. Retryable: a transient
			// dependency failure at construction can clear. No handler name is in
			// scope here, so by construction nothing this catch can build carries a
			// hook target (DispatchAsync owns every path where one exists).
			dispatch = JobDispatch.NoHandlerReached(
				new JobOutcome.Retry(Error: JobErrorSanitizer.Describe(ex)), ex
			);
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
			_metrics.HandlerDuration(item.JobType, "LeaseLost", stopwatch.Elapsed.TotalSeconds);
			_metrics.LeaseLost(item.JobType);
			return JobExecutionResult.LeaseLost;
		}

		_metrics.HandlerDuration(
			item.JobType, dispatch.Outcome.GetType().Name, stopwatch.Elapsed.TotalSeconds
		);

		// Once a handler has returned, its outcome is applied with
		// CancellationToken.None: bookkeeping is quick and bounded, and a completed
		// run must never be discarded — or its row leaked as leased — by a shutdown
		// arriving between handler return and the transition SQL (§3.6). The
		// settlement result is CONFIRMED, not assumed: a fenced zero-row transition
		// reports LeaseLost, a rolled-back terminal step reports Faulted.
		return await ApplyOutcomeAsync(dbContext, dispatch, item, lockToken);
	}

	// Resolves the registration and runs the handler, returning the outcome TOGETHER
	// with the only handler whose terminal hook may run for it (§5.1). Every failure a
	// handler can produce is classified HERE — the one place the instance is in scope
	// — so each classification names its own hook target and none can inherit one by
	// omission. Outside this method no handler can be named, which is what makes the
	// hook unreachable on the invalid paths rather than merely unreached.
	//
	// The engine's OWN cancellations (lease lost / host shutdown) are the only things
	// allowed to escape: ProcessOneAsync owns those two outcomes.
	private async Task<JobDispatch> DispatchAsync(
		IServiceProvider scopedProvider,
		JobContext context,
		CancellationToken handlerToken,
		CancellationToken leaseLostToken,
		CancellationToken stoppingToken
	) {
		if (!_registry.TryResolve(context.JobType, out var registration)) {
			// Nothing is registered for this job_type: no instance exists and none
			// can, so there is nothing to hook. Retries gain nothing (F12).
			return JobDispatch.NoHandlerReached(
				new JobOutcome.PermanentFailure(
					$"No job handler registered for job type '{context.JobType}'."
				)
			);
		}

		var handler = registration.Factory(scopedProvider);

		if (!string.Equals(handler.JobType, context.JobType, StringComparison.Ordinal)) {
			// A registration/handler JobType drift is a pure configuration error:
			// burning retries on it gains nothing → straight to the DLQ. Also guarded
			// eagerly at registry build (DI construction resolves and verifies every
			// registration), so this runtime path exists only as defense in depth.
			// The drifted handler's terminal hook must not run for a job that was
			// never legitimately its own — so it is not this dispatch's hook target.
			return JobDispatch.NoHandlerReached(
				new JobOutcome.PermanentFailure(
					$"Handler {handler.GetType().Name} declares JobType "
					+ $"'{handler.JobType}' but was registered for "
					+ $"'{context.JobType}' (configuration drift)."
				)
			);
		}

		try {
			return JobDispatch.HandlerReached(
				handler, await handler.HandleAsync(context, handlerToken)
			);
		} catch (JsonException ex) {
			// §5.1's invalid-before-handler settlement (R6-4/O21). A payload that can
			// never parse gains nothing from retries (F2/F12) — and, decisively, it
			// means no handler was legitimately REACHED, even though an instance had
			// to be built to discover that. So this path names NO hook target: the
			// hook would reload its recipient from the ids the payload just failed to
			// produce, throw, roll the terminal step back, revive the still-leased
			// row, and repeat on every lease expiry — #810's infinite lease loop.
			return JobDispatch.NoHandlerReached(
				new JobOutcome.PermanentFailure(JobErrorSanitizer.Describe(ex)), ex
			);
		} catch (Exception ex) when (IsHandlerFailure(ex, leaseLostToken, stoppingToken)) {
			// The handler was legitimately reached and threw: its job, its retry, and
			// — if this exhausts the attempts — its hook.
			return JobDispatch.HandlerReached(
				handler, new JobOutcome.Retry(Error: JobErrorSanitizer.Describe(ex)), ex
			);
		}
	}

	// A cancellation sourced from the lease fence or the host token is the ENGINE's own
	// signal and belongs to ProcessOneAsync (F1/F12); it must not be reclassified as a
	// job failure here. Everything else a handler throws is that job's failure —
	// including a foreign cancellation such as a provider HTTP timeout's
	// TaskCanceledException, which must never look like shutdown or abandon its
	// batchmates.
	private static bool IsHandlerFailure(
		Exception exception,
		CancellationToken leaseLostToken,
		CancellationToken stoppingToken
	) {
		if (exception is not OperationCanceledException) {
			return true;
		}

		return !leaseLostToken.IsCancellationRequested
			&& !stoppingToken.IsCancellationRequested;
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

	/// <summary>
	/// Lease renewal / per-dispatch re-stamp (F1). Returns the CONFIRMED stamp — the
	/// deadline the row now carries and the database clock that computed it — or null
	/// when the fence matched nothing, which is a definitively lost lease.
	///
	/// The RETURNING clause is not a convenience (§5.1, R2-4): the caller must judge
	/// abandonment against the deadline the DATABASE actually wrote, because that is
	/// the only value ResetExpiredLeasesAsync compares against when deciding the row
	/// is reclaimable. A caller timing its own lease locally would be measuring a
	/// different interval, from a start point that is already later than the
	/// database's (F11).
	/// </summary>
	public static async Task<LeaseStamp?> TryRenewLeaseAsync(
		AppDbContext dbContext,
		Guid jobId,
		Guid lockToken,
		int leaseSeconds,
		CancellationToken cancellationToken
	) {
		var stamps = await dbContext.Database.SqlQuery<LeaseStamp>(
			$"""
			UPDATE job_queue
			SET locked_until = now() + make_interval(secs => {leaseSeconds}),
				updated_at = now()
			WHERE id = {jobId} AND lock_token = {lockToken}
			RETURNING locked_until AS "LockedUntil", now() AS "DatabaseNow"
			"""
		).ToListAsync(cancellationToken);

		return stamps.SingleOrDefault();
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

	// Runs entirely on CancellationToken.None (see ProcessOneAsync): once a handler
	// has produced an outcome, the quick bookkeeping completes even under shutdown.
	// Returns the CONFIRMED settlement: Completed only when the conditioned
	// delete/requeue affected a row or the terminal transaction committed.
	private async Task<JobExecutionResult> ApplyOutcomeAsync(
		AppDbContext dbContext,
		JobDispatch dispatch,
		JobQueueItem item,
		Guid lockToken
	) {
		var itemId = RequireId(item);
		var outcome = dispatch.Outcome;

		if (outcome is JobOutcome.Success) {
			var deleted = await TryCompleteAsync(
				dbContext, itemId, lockToken, CancellationToken.None
			);
			if (!deleted) {
				_metrics.LeaseLost(item.JobType);
				return JobExecutionResult.LeaseLost;
			}

			_metrics.Succeeded(item.JobType);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Completed job {JobId} of type {JobType}",
					itemId,
					item.JobType
				);
			}
			return JobExecutionResult.Completed;
		}

		if (outcome is JobOutcome.Cancelled cancelled) {
			var deleted = await TryCompleteAsync(
				dbContext, itemId, lockToken, CancellationToken.None
			);
			if (!deleted) {
				_metrics.LeaseLost(item.JobType);
				return JobExecutionResult.LeaseLost;
			}

			_metrics.Cancelled(item.JobType);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Cancelled job {JobId} of type {JobType}: {Reason}",
					itemId,
					item.JobType,
					JobErrorSanitizer.Sanitize(cancelled.Reason)
				);
			}
			return JobExecutionResult.Completed;
		}

		if (outcome is JobOutcome.PermanentFailure permanent) {
			return await DeadLetterAsync(
				dbContext, dispatch, item, lockToken,
				item.Attempts + 1, JobErrorSanitizer.Sanitize(permanent.Reason)
			);
		}

		if (outcome is JobOutcome.Retry retry) {
			var failedAttempts = item.Attempts + 1;
			var safeError = JobErrorSanitizer.Sanitize(retry.Error);

			if (failedAttempts >= item.MaxAttempts) {
				return await DeadLetterAsync(
					dbContext, dispatch, item, lockToken, failedAttempts, safeError
				);
			}

			// Engine-owned backoff (§5.1): jittered exponential, with a handler
			// delay override (e.g. provider Retry-After) winning when longer.
			var delaySeconds = JobBackoff.DelaySeconds(failedAttempts);
			if (retry.DelayOverride is { } overrideDelay
				&& overrideDelay.TotalSeconds > delaySeconds) {
				delaySeconds = overrideDelay.TotalSeconds;
			}

			var requeued = await TryRequeueAsync(
				dbContext, itemId, lockToken, delaySeconds, safeError,
				CancellationToken.None
			);
			if (!requeued) {
				_metrics.LeaseLost(item.JobType);
				return JobExecutionResult.LeaseLost;
			}

			_metrics.Retried(item.JobType);

			if (_logger.IsEnabled(LogLevel.Warning)) {
				// No raw exception argument (R2-8): a sink renders ex.Message
				// verbatim. The sanitized description and the safe frame metadata
				// carry the same diagnosis without the payload echo.
				var (description, stack) = JobErrorSanitizer.DescribeForLog(dispatch.Failure);

				_logger.LogWarning(
					"Job {JobId} of type {JobType} failed (attempt "
					+ "{Attempt}/{MaxAttempts}); requeued with {DelaySeconds:F0}s "
					+ "backoff: {Error} [{FailureDescription}] {FailureStack}",
					itemId,
					item.JobType,
					failedAttempts,
					item.MaxAttempts,
					delaySeconds,
					safeError,
					description,
					stack
				);
			}
			return JobExecutionResult.Completed;
		}

		throw new InvalidOperationException(
			$"Unhandled job outcome type {outcome.GetType().Name}"
		);
	}

	// Terminal path (F5/F16): the handler's OnTerminalFailureAsync hook, the
	// full-envelope DLQ insert, and the fencing-conditioned queue delete run in ONE
	// transaction on the per-job scope's AppDbContext — a scoped handler's injected
	// context is the SAME instance, so hook writes commit and roll back with the
	// engine's terminal step. A hook throw rolls everything back and the still-leased
	// row is retried whole after lease expiry.
	private async Task<JobExecutionResult> DeadLetterAsync(
		AppDbContext dbContext,
		JobDispatch dispatch,
		JobQueueItem item,
		Guid lockToken,
		int attempts,
		string? lastError
	) {
		var itemId = RequireId(item);
		var deadLetter = JobDeadLetter.FromJob(item, attempts, lastError);

		await using var transaction =
			await dbContext.Database.BeginTransactionAsync(CancellationToken.None);

		try {
			// Step 3, and ONLY for a handler-reached settlement (§5.1). The guard is
			// correct by construction: HookTarget is non-null only on the path where
			// a handler that owned this job_type actually ran, because JobDispatch
			// has no constructor that lets any other path supply one.
			if (dispatch.HookTarget is { } hookTarget) {
				var terminalContext = BuildContext(item, lastError);
				await hookTarget.OnTerminalFailureAsync(terminalContext, CancellationToken.None);
			}

			await dbContext.JobDeadLetter.AddAsync(deadLetter, CancellationToken.None);
			await dbContext.SaveChangesAsync(CancellationToken.None);

			var deleted = await TryCompleteAsync(
				dbContext, itemId, lockToken, CancellationToken.None
			);
			if (!deleted) {
				// The lease was lost while going terminal: the new claimant owns the
				// row now. Roll back the DLQ copy — the job is not terminal for us.
				await transaction.RollbackAsync(CancellationToken.None);
				dbContext.Entry(deadLetter).State = EntityState.Detached;
				_metrics.LeaseLost(item.JobType);
				return JobExecutionResult.LeaseLost;
			}

			await transaction.CommitAsync(CancellationToken.None);
		} catch (Exception ex) {
			await transaction.RollbackAsync(CancellationToken.None);
			dbContext.Entry(deadLetter).State = EntityState.Detached;

			_logger.LogError(
				"Terminal-failure step for job {JobId} of type {JobType} rolled back "
				+ "(hook or DLQ write failed); the leased row will be retried whole "
				+ "after lease expiry: {FailureDescription} {FailureStack}",
				itemId,
				item.JobType,
				JobErrorSanitizer.Describe(ex),
				JobErrorSanitizer.DescribeStack(ex)
			);
			return JobExecutionResult.Faulted;
		}

		_metrics.DeadLettered(item.JobType);
		_metrics.AttemptsAtTerminal(item.JobType, attempts);

		// The durable last_error was sanitized before this call; the failure metadata
		// is projected rather than handed over as an exception object (R2-8).
		var (description, stack) = JobErrorSanitizer.DescribeForLog(dispatch.Failure);

		_logger.LogError(
			"Job {JobId} of type {JobType} dead-lettered after {Attempts} attempts: "
			+ "{Error} [{FailureDescription}] {FailureStack}",
			itemId,
			item.JobType,
			attempts,
			lastError,
			description,
			stack
		);

		return JobExecutionResult.Completed;
	}

	// --- renewal loop (F1) ---------------------------------------------------------

	/// <summary>
	/// The last CONFIRMED database lease deadline, minus the safety margin, expressed
	/// as an interval measurable from a local monotonic anchor (design §5.1, R2-4).
	///
	/// Both terms of the interval are database-computed and come from the SAME
	/// statement, so the margin is judged in database time — the clock that decides
	/// when ResetExpiredLeasesAsync may reclaim the row (F11). The local anchor only
	/// measures elapsed DURATION since that confirmed instant, which is all an app
	/// can do: it cannot watch the database clock advance. Taking the anchor BEFORE
	/// the statement is issued makes that measurement conservative — it charges the
	/// whole round trip against the margin, so the interval can only run out EARLY,
	/// never late.
	///
	/// This is the fix's whole point. A local stopwatch started AFTER the row was
	/// stamped `now() + lease` measures the wrong interval from a start point already
	/// later than the database's, so it expires strictly AFTER the row became
	/// reclaimable: the "margin" pointed the wrong way and guaranteed the overlap it
	/// was meant to reduce. Note "reduce": fencing is what makes overlap SAFE (§6);
	/// this only makes it rarer.
	/// </summary>
	private readonly record struct ConfirmedLease {
		private ConfirmedLease(TimeSpan safeIntervalAtConfirmation, long anchor) {
			SafeIntervalAtConfirmation = safeIntervalAtConfirmation;
			Anchor = anchor;
		}

		private TimeSpan SafeIntervalAtConfirmation { get; }
		private long Anchor { get; }

		public static ConfirmedLease From(LeaseStamp stamp, long anchor, TimeSpan safetyMargin) {
			return new ConfirmedLease(
				stamp.LockedUntil - stamp.DatabaseNow - safetyMargin, anchor
			);
		}

		/// <summary>
		/// How long is left before the safe deadline. Non-positive means the margin
		/// is spent: ownership must be abandoned rather than assumed.
		/// </summary>
		public TimeSpan RemainingSafeInterval() {
			return SafeIntervalAtConfirmation - Stopwatch.GetElapsedTime(Anchor);
		}
	}

	// §5.1/R2-4: max(2 s, lease/20). The floor is what makes a lease shorter than a
	// few seconds unusable by construction — there is no interval in which such a
	// lease could be renewed with any margin at all, and pretending otherwise is how
	// a renewal loop ends up racing the reclaimer it was written to avoid.
	private TimeSpan SafetyMargin() {
		return TimeSpan.FromSeconds(Math.Max(2.0, _options.LeaseSeconds / 20.0));
	}

	// Re-stamps the lease at lease/2 cadence while the handler runs, on its OWN scope
	// and connection (the job scope's DbContext is busy with the handler's work).
	// A renewal that returns zero rows is a definitively lost lease → cancel the
	// handler at once; that is the only CERTAIN signal. A renewal that FAILS
	// transiently (DB hiccup) leaves ownership UNKNOWN, not lost: it is retried on a
	// fresh scope/connection, but only within the confirmed safe interval, and no
	// sleep or database command is ever deliberately started beyond the safe deadline.
	//
	// Abandonment itself is NOT this task's job. It is armed on the CTS's own timer
	// (see below), because this task is exactly the thing that cannot be trusted to
	// notice: a renewal blocked in a hung database command — no CommandTimeout is set
	// — would otherwise never reach any deadline check at all. The fence still
	// protects every transition either way (§6).
	private async Task RenewLeaseLoopAsync(
		Guid jobId,
		Guid lockToken,
		ConfirmedLease initial,
		CancellationTokenSource leaseLostSource,
		CancellationToken stopRenewal
	) {
		var renewInterval = TimeSpan.FromSeconds(_options.LeaseSeconds / 2.0);
		var retryInterval = TimeSpan.FromSeconds(Math.Max(0.25, _options.LeaseSeconds / 8.0));

		var confirmed = initial;
		var proposedDelay = renewInterval;

		// R3-F2: the safe deadline is arbitrated by an explicit ONE-WINNER state
		// transition rather than a CancelAfter/IsCancellationRequested pair. The pair is
		// not a serialization point — .NET's own Timer.TryReset requires BOTH
		// Timer.Change AND !_everQueued precisely because changing a timer cannot prove
		// that a previous-generation callback, already dequeued, will not still run. Here
		// every confirmed stamp arms a NEW generation; the timer callback and stamp
		// acceptance contend under the arbiter's single lock for one terminal decision,
		// so exactly one acts: if the deadline wins the handler is abandoned (and the
		// caller compensates any late commit); if stamp acceptance wins it rotates the
		// generation, so the prior generation's pending callback loses its generation
		// check and becomes a no-op — it can no longer abandon the freshly stamped lease.
		using var deadline = new LeaseDeadlineArbiter(() => leaseLostSource.Cancel());

		if (!await ArmDeadlineAsync(deadline, leaseLostSource, confirmed, jobId)) {
			return;
		}

		while (!stopRenewal.IsCancellationRequested) {
			var remaining = confirmed.RemainingSafeInterval();
			if (remaining <= TimeSpan.Zero) {
				await AbandonAtDeadlineAsync(deadline, leaseLostSource, jobId);
				return;
			}

			try {
				// The actual delay is min(proposedDelay, remainingSafeInterval): a
				// retry cadence of lease/8 is a PROPOSAL, and sleeping it whole would
				// happily step past the deadline it exists to respect.
				await Task.Delay(proposedDelay < remaining ? proposedDelay : remaining, stopRenewal);
			} catch (OperationCanceledException) {
				return;
			}

			// The sleep was capped to the deadline, so arriving here with nothing left
			// means the margin is spent and no further command may be started.
			if (confirmed.RemainingSafeInterval() <= TimeSpan.Zero) {
				await AbandonAtDeadlineAsync(deadline, leaseLostSource, jobId);
				return;
			}

			try {
				var anchor = Stopwatch.GetTimestamp();

				using var scope = _scopeFactory.CreateScope();
				var renewalContext =
					scope.ServiceProvider.GetRequiredService<AppDbContext>();

				// R2-finding-1: the renewal command is cancelled by the deadline as well
				// as by stopRenewal. Linking leaseLostSource.Token here is what makes a
				// deadline victory terminal for an IN-FLIGHT renewal — a statement blocked
				// past the safe deadline (a contended row, a slow server; §5.1 permits a
				// non-cooperative handler, so the loop cannot wait for the handler to end
				// the command) is aborted at the deadline instead of committing a later
				// locked_until into a lease the engine has already abandoned.
				using var renewalCommandStop = CancellationTokenSource.CreateLinkedTokenSource(
					stopRenewal, leaseLostSource.Token
				);

				var stamp = await TryRenewLeaseAsync(
					renewalContext, jobId, lockToken, _options.LeaseSeconds,
					renewalCommandStop.Token
				);
				if (stamp is null) {
					// Definitively lost (the fence matched nothing): a new claimant holds
					// the row. Route the abandonment through the arbiter so the deadline
					// generation is disarmed and only one path cancels.
					if (deadline.TryClaimAbandon()) {
						await leaseLostSource.CancelAsync();
					}
					return;
				}

				// R3-F3 spec seam (null in production): injects finding F1's ambiguous
				// cancelled-commit deterministically — a real later stamp is now committed,
				// and the probe forces the deadline to win and raises the cancellation the
				// client would observe. It exercises the SAME catch as a real Npgsql
				// best-effort cancellation.
				if (RenewalCommitProbe is { } probe) {
					// The seam's "force the deadline to win" action drives the ARBITER to a
					// real decision, exactly as a timer firing would (TryClaimAbandon sets
					// _decided and disarms the timer, then the CTS is cancelled), not the CTS
					// alone. The renewal-cancellation classifier reads _decided under _gate,
					// so the seam MUST make the arbiter win for the compensating branch to
					// run; the old action cancelled only the CTS and bypassed the arbiter
					// (closes the R4 review gap).
					await probe(stamp, () => {
						if (deadline.TryClaimAbandon()) {
							leaseLostSource.Cancel();
						}
					});
				}

				confirmed = ConfirmedLease.From(stamp, anchor, SafetyMargin());

				// Stamp acceptance contends with the deadline for the generation. A false
				// return is the one-winner transition reporting that the deadline ALREADY
				// won (during the UPDATE or the gap before the re-arm) or that the margin
				// is now spent: either way this stamp extended an ABANDONED lease and must
				// neither re-arm nor be kept. Expire it under the SAME lock_token fence so
				// the row cannot stay Processing on a stamp the engine will never honour.
				if (!await ArmDeadlineAsync(deadline, leaseLostSource, confirmed, jobId)) {
					await ExpireAbandonedLeaseAsync(renewalContext, jobId, lockToken);
					return;
				}

				proposedDelay = renewInterval;
			} catch (OperationCanceledException) {
				// R4-F1: classify the OCE INSIDE the arbiter lock (see
				// ClassifyRenewalCancellation below) so the winning decision and the
				// compensation it triggers are ONE atomic transition, never the two
				// synchronization domains that let a decided-but-not-yet-published deadline
				// be misread as a clean stop. The catch no longer filters on
				// leaseLostSource.IsCancellationRequested: that flag is published only after
				// OnDeadline releases the lock, so it can still be false here even though the
				// deadline has already won.
				//
				// An in-flight renewal cancelled by the deadline is an AMBIGUOUS
				// commit — Npgsql cancellation is best-effort, so the UPDATE may have
				// COMMITTED a later locked_until server-side even though the client
				// observed cancellation while reading the result. The deadline has already
				// abandoned this token's lease, so run the same fenced expiry on a FRESH
				// context with CancellationToken.None. The fenced expiry is correct
				// whatever the statement actually did: if it rolled back while the original
				// lock_token still exists it expires the abandoned lease to now() (safe and
				// desirable, the row becomes reclaimable at once) and is NOT a no-op; it is
				// a genuine no-op only when a new claimant has already rotated or cleared
				// the token.
				//
				// Stopped means stop-renewal (host shutdown or the handler returned) won
				// the race, and the SAME classification retired the arbiter so a
				// still-pending deadline callback can no longer claim abandonment; there is
				// nothing to compensate.
				if (deadline.ClassifyRenewalCancellation()
					== LeaseDeadlineArbiter.LeaseCancellationOutcome.Abandoned) {
					await CompensateAbandonedLeaseAsync(jobId, lockToken);
				}
				return;
			} catch (Exception ex) {
				// Transient: ownership is unknown, not lost. Keep trying until the
				// confirmed deadline says otherwise — the arbiter's timer, not this loop,
				// is what guarantees the handler stops.
				_logger.LogWarning(
					"Lease renewal attempt failed for job {JobId}; retrying within the "
					+ "confirmed lease deadline: {FailureDescription} {FailureStack}",
					jobId,
					JobErrorSanitizer.Describe(ex),
					JobErrorSanitizer.DescribeStack(ex)
				);
				proposedDelay = retryInterval;
			}
		}
	}

	// The dedicated deadline (§5.1, R2-4), now arbitrated so it fires against a
	// generation rather than a bare timer. The arbiter's timer fires independently of
	// the renewal task, so the handler is cancelled at the safe deadline EVEN IF that
	// task is blocked — the case the spec's "even if the retry task is blocked" clause
	// exists for. Each confirmed stamp arms a NEW generation; TryArm returns false only
	// when a deadline has already won, which the caller treats as a late commit to
	// compensate. A spent margin (remaining <= 0) abandons synchronously instead.
	private async Task<bool> ArmDeadlineAsync(
		LeaseDeadlineArbiter deadline,
		CancellationTokenSource leaseLostSource,
		ConfirmedLease confirmed,
		Guid jobId
	) {
		var remaining = confirmed.RemainingSafeInterval();

		if (remaining <= TimeSpan.Zero) {
			await AbandonAtDeadlineAsync(deadline, leaseLostSource, jobId);
			return false;
		}

		return deadline.TryArm(remaining);
	}

	private async Task AbandonAtDeadlineAsync(
		LeaseDeadlineArbiter deadline,
		CancellationTokenSource leaseLostSource,
		Guid jobId
	) {
		// The synchronous abandon paths and the arbiter's own timer both settle through
		// TryClaimAbandon / the timer callback, so the cancellation happens exactly once.
		// If the timer already won, this is a no-op and it owns the cancellation.
		if (!deadline.TryClaimAbandon()) {
			return;
		}

		if (_logger.IsEnabled(LogLevel.Warning)) {
			_logger.LogWarning(
				"Lease renewal for job {JobId} reached its confirmed safe deadline "
				+ "without a fresh stamp; treating ownership as lost and cancelling "
				+ "the handler",
				jobId
			);
		}

		await leaseLostSource.CancelAsync();
	}

	// R2-finding-1 compensation. A renewal that committed a later locked_until AFTER the
	// safe deadline had already won extended a lease the engine has abandoned. Pull it
	// back to now() under the SAME lock_token fence so the row is reclaimable at once
	// rather than stranded Processing for the errant stamp's whole window. The fence makes
	// this a genuine no-op ONLY when a new claimant has already rotated or cleared the
	// lock_token; when the original token still exists — including the case where the
	// ambiguous renewal actually rolled back — it is not a no-op, it expires the abandoned
	// lease to now() (safe and desirable). CancellationToken.None, because the abandonment
	// is exactly why the ambient tokens are cancelled — the compensation must still run.
	private static async Task ExpireAbandonedLeaseAsync(
		AppDbContext dbContext,
		Guid jobId,
		Guid lockToken
	) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_queue
			SET locked_until = now(), updated_at = now()
			WHERE id = {jobId} AND lock_token = {lockToken}
			""",
			CancellationToken.None
		);
	}

	// R3-F1 compensation entry point for the ambiguous cancelled-commit. The renewal
	// scope/context is already unwound by the time its OperationCanceledException reaches
	// the catch, so the fenced expiry runs on a FRESH scope and context — the abandonment
	// is exactly why the ambient tokens are cancelled, so this must not be governed by
	// them (CancellationToken.None inside ExpireAbandonedLeaseAsync).
	private async Task CompensateAbandonedLeaseAsync(Guid jobId, Guid lockToken) {
		using var scope = _scopeFactory.CreateScope();
		var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await ExpireAbandonedLeaseAsync(context, jobId, lockToken);
	}

	// R3-F2: the one-winner arbiter for the lease deadline. It replaces the
	// CancelAfter + IsCancellationRequested pair, which cannot serialize a re-arm
	// against a previous-generation timer callback that has already been dequeued. Every
	// armed deadline carries a generation captured by its timer callback; the callback
	// and stamp acceptance contend under one lock for a single terminal decision, so
	// EXACTLY ONE of them acts on any given generation:
	//   - the deadline wins  -> _decided is set once, and leaseLostSource is cancelled;
	//   - stamp acceptance wins -> the generation is rotated by TryArm, so the prior
	//                              generation's pending callback fails its generation
	//                              check and no-ops — it cannot abandon the new stamp.
	// Cancellation of leaseLostSource happens outside the lock (as CancelAfter already
	// did from a timer thread) and tolerates a disposed source: the lease is torn down.
	public sealed class LeaseDeadlineArbiter : IDisposable {
		// The scheduler seam (R4-F2): production arms a real System.Threading.Timer; a
		// spec substitutes a manual scheduler that RETAINS each generation's callback so
		// an arbiter unit test can drive the deadline / stamp / stop orderings directly —
		// including firing a dequeued stale-generation callback — instead of racing
		// wall-clock timers. This is what turns the point-in-time interleaving proof into
		// a durable, deterministic control.
		public interface ILeaseDeadlineScheduler {
			IDisposable Schedule(TimeSpan delay, Action callback);
		}

		// How a renewal-loop OperationCanceledException is classified UNDER the arbiter
		// lock (R4-F1). Collapsing the winning decision and the compensation it triggers
		// into ONE atomic transition is the whole point: the decision (_decided under
		// _gate) and the CTS flag OnDeadline later publishes are different
		// synchronization domains, so the caller must not classify the OCE by reading
		// that flag outside the lock.
		public enum LeaseCancellationOutcome {
			// The arbiter had already decided (the deadline won) — even if that decision
			// is not yet published to the CTS. Any renewal that committed a later
			// locked_until extended an abandoned lease and must be compensated.
			Abandoned = 0,
			// Stop-renewal (host shutdown or the handler returned) won the race. This
			// classification retires the arbiter so a still-pending deadline callback can
			// no longer claim abandonment; there is nothing to compensate.
			Stopped = 1
		}

		// Production default: one non-repeating System.Threading.Timer per armed
		// generation. Timer.Dispose is non-joining, which is exactly why the arbiter
		// serializes decisions by generation rather than trusting a timer to be silenced.
		private sealed class TimerDeadlineScheduler : ILeaseDeadlineScheduler {
			public IDisposable Schedule(TimeSpan delay, Action callback) {
				return new Timer(_ => callback(), null, delay, Timeout.InfiniteTimeSpan);
			}
		}

		private readonly Action _cancelLeaseLost;
		private readonly ILeaseDeadlineScheduler _scheduler;
		private readonly object _gate = new();
		private IDisposable? _scheduled;
		private long _generation;
		private bool _decided;
		private bool _disposed;

		public LeaseDeadlineArbiter(
			Action cancelLeaseLost,
			ILeaseDeadlineScheduler? scheduler = null
		) {
			_cancelLeaseLost = cancelLeaseLost;
			_scheduler = scheduler ?? new TimerDeadlineScheduler();
		}

		// Arm/re-arm for a freshly confirmed stamp. Rotates the generation FIRST (so any
		// pending previous-generation callback is disarmed by construction — its captured
		// generation is now stale), then schedules a fresh timer for it. Returns false if
		// a deadline has already won: the stamp is late and the caller must compensate.
		public bool TryArm(TimeSpan remaining) {
			lock (_gate) {
				if (_decided || _disposed) {
					return false;
				}

				var generation = ++_generation;
				_scheduled?.Dispose();
				_scheduled = _scheduler.Schedule(remaining, () => OnDeadline(generation));
				return true;
			}
		}

		// Synchronous abandon (the margin is spent, or the lease was definitively lost).
		// Ungated by generation because the caller decided it for the CURRENT confirmed
		// lease on the single loop thread. Returns whether THIS call is the one that
		// transitioned the lease to abandoned; the caller performs the cancellation.
		public bool TryClaimAbandon() {
			return Claim(requiredGeneration: null);
		}

		// R4-F1: classify a renewal-loop OperationCanceledException UNDER the same lock
		// that serializes the deadline decision, so classification and the winning
		// decision are ONE atomic transition rather than two synchronization domains. If
		// the deadline has already decided (_decided) the OCE is a deadline-won
		// abandonment EVEN WHEN the CTS cancellation is not yet visible — the caller
		// compensates any ambiguous late commit. Otherwise stop-renewal won: retire the
		// arbiter (mark it decided-done and disarm the timer) so a still-pending deadline
		// callback fails its guard and can never subsequently claim abandonment, and
		// report Stopped so the caller does not compensate a lease it still owns.
		public LeaseCancellationOutcome ClassifyRenewalCancellation() {
			lock (_gate) {
				if (_decided) {
					return LeaseCancellationOutcome.Abandoned;
				}

				_disposed = true;
				_scheduled?.Dispose();
				_scheduled = null;
				return LeaseCancellationOutcome.Stopped;
			}
		}

		private void OnDeadline(long generation) {
			if (!Claim(generation)) {
				return;
			}

			try {
				_cancelLeaseLost();
			} catch (ObjectDisposedException) {
				// The lease is already being torn down; nothing left to abandon.
			}
		}

		private bool Claim(long? requiredGeneration) {
			lock (_gate) {
				if (_decided || _disposed) {
					return false;
				}

				if (requiredGeneration is { } generation && generation != _generation) {
					// Superseded by a newer accepted stamp — this stale callback no-ops.
					return false;
				}

				_decided = true;
				_scheduled?.Dispose();
				_scheduled = null;
				return true;
			}
		}

		public void Dispose() {
			lock (_gate) {
				_disposed = true;
				_scheduled?.Dispose();
				_scheduled = null;
			}
		}
	}

	// --- helpers ---------------------------------------------------------------------

	// Releases claims the batch loop never settled (shutdown, mid-flight
	// cancellation, load failure) so no row is left leased for the full window.
	private async Task ReleaseUnsettledAsync(IEnumerable<ClaimedJob> claims) {
		try {
			using var scope = _scopeFactory.CreateScope();
			var releaseContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

			foreach (var claim in claims) {
				var released = await TryReleaseAsync(
					releaseContext, claim.Id, claim.LockToken, CancellationToken.None
				);
				if (!released) {
					LogReleaseLost(claim.Id, claim.JobType);
				}
			}
		} catch (Exception ex) {
			// Release is best-effort: the lease + fence still guarantee safe reclaim
			// after expiry even if this cleanup itself fails (§6).
			_logger.LogWarning(
				"Releasing unsettled claimed jobs failed: {FailureDescription} {FailureStack}",
				JobErrorSanitizer.Describe(ex),
				JobErrorSanitizer.DescribeStack(ex)
			);
		}
	}

	private void LogReleaseLost(Guid jobId, string jobType) {
		if (_logger.IsEnabled(LogLevel.Warning)) {
			_logger.LogWarning(
				"Release of job {JobId} of type {JobType} affected no rows — lease "
				+ "lost to another claimant (or already transitioned)",
				jobId,
				jobType
			);
		}
	}

	private async Task LogDeadLetterOrphansAsync(CancellationToken stoppingToken) {
		try {
			using var scope = _scopeFactory.CreateScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			await _registry.LogUnregisteredDeadLetterTypesAsync(
				dbContext, _logger, stoppingToken
			);
		} catch (Exception ex) when (ex is not OperationCanceledException) {
			_logger.LogWarning(
				"Dead-letter orphan check failed at startup: {FailureDescription} "
				+ "{FailureStack}",
				JobErrorSanitizer.Describe(ex),
				JobErrorSanitizer.DescribeStack(ex)
			);
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
}
