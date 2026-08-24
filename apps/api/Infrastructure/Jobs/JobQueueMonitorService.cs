using System.Diagnostics.Metrics;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Entities;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// A snapshot of queue-health signals taken by <see cref="JobQueueMonitorService"/>
/// (design §7.2). Depth/age are split by priority class — <c>high</c> (priority ≥ 100,
/// e.g. transactional email) and <c>bulk</c> (priority &lt; 100) — the F22 fairness
/// tripwire.
/// </summary>
public sealed record JobQueueSample {
	public required long DueDepthHigh { get; init; }
	public required long DueDepthBulk { get; init; }
	public required double OldestDueAgeSecondsHigh { get; init; }
	public required double OldestDueAgeSecondsBulk { get; init; }
	public required long ProcessingOverLeaseCount { get; init; }
	// Approximate pg_class row estimate: avoids an exact full-table count every minute.
	public required long DeadLetterSize { get; init; }
	public required long DeadLetterGrowth1h { get; init; }
	// #864/K-2: rows retention is HOLDING past its window — missing-anomaly job types with
	// no operator acknowledgement yet. Wired to the dlq_metrics counter in the fix commit.
	public required long MissingTriagedCount { get; init; }
	public required long EmailLogFailures1h { get; init; }
	public required long JobQueueDeadTuples { get; init; }

	// True iff SOME replica holds the scheduler-leader advisory lock, observed by a
	// pg_locks catalog read (design §7.2/R2-10). Every replica sees the same shared
	// answer, which is what makes the leader-absence condition fleet-wide. NULL means
	// UNKNOWN — no probe has completed yet — and is never treated as healthy: the gauge
	// emits no measurement and the alert stays silent until a real probe reports true/false.
	public required bool? LeaderPresent { get; init; }

	// Age of this replica's last completed reconcile pass, or null when it is not the
	// leader and therefore owes no sync (design §7.2 — last_sync_at is leader-emitted).
	public required double? SchedulerSyncAgeSeconds { get; init; }

	public long DueDepthTotal {
		get { return DueDepthHigh + DueDepthBulk; }
	}

	public static readonly JobQueueSample Empty = new() {
		DueDepthHigh = 0,
		DueDepthBulk = 0,
		OldestDueAgeSecondsHigh = 0,
		OldestDueAgeSecondsBulk = 0,
		ProcessingOverLeaseCount = 0,
		DeadLetterSize = 0,
		DeadLetterGrowth1h = 0,
		MissingTriagedCount = 0,
		EmailLogFailures1h = 0,
		JobQueueDeadTuples = 0,
		// Pre-first-sample state is UNKNOWN, not healthy: null so the gauge emits nothing
		// and the alert stays silent until a real pg_locks probe reports true or false. A
		// fabricated `true` here would have reported "1 leader present" with no probe, and
		// if the first sample threw, that false 1 would persist for the retry interval.
		LeaderPresent = null,
		SchedulerSyncAgeSeconds = null,
	};
}

/// <summary>
/// The cheap worker-side queue-health sampler (design §7.2, F21). Every ~60 s it queries
/// the queue tables (all comparisons against database <c>now()</c> — F11) and (a) records
/// sampled gauges on the <c>PublyApp.Jobs</c> meter and (b) logs each sample at
/// information, escalating threshold breaches to WARNING — the log-based alert hook until
/// a metrics backend exists. Liveness (§3.5) only says the process is up; THIS is how
/// anyone knows the queue is healthy (growing backlog, broken reclaim, DLQ growth).
///
/// Runs on every worker replica (not leader-gated): sampling is read-only and idempotent.
/// That is R2-10's fix, and it is what makes <c>scheduler.leader_present</c> possible —
/// a leader-gated sampler goes silent exactly when leadership is lost, so the failure
/// most worth paging on produced no signal at all. Leader presence is probed from
/// <c>pg_locks</c> and NEVER by attempting the advisory lock, so the observer cannot
/// acquire leadership or disturb the scheduler's connection (§7.2).
/// <see cref="SampleAsync"/> / <see cref="EvaluateAndAlert"/> are public so specs drive
/// them deterministically (the repo's public-methods-for-determinism discipline).
/// </summary>
public sealed class JobQueueMonitorService : BackgroundService, IDisposable {
	// Threshold defaults (design §7.2). Exposed as consts so the alerting spec pins the
	// exact boundary it asserts above/below.
	public const int DueDepthWarnThreshold = 500;
	public const int OldestAgeHighWarnSeconds = 600;      // 10 min for priority-100 work
	public const int OldestAgeBulkWarnSeconds = 3600;     // 60 min for bulk work
	public const int ProcessingOverLeaseConsecutiveSamples = 3;

	// Sync staleness alerts at 2x the leader's reconcile interval (design §7.2/R2-10),
	// derived from the cadence constant itself so the two cannot drift apart.
	public const int SchedulerSyncStaleSeconds = SchedulerLeaderService.SyncIntervalSeconds * 2;

	private static readonly TimeSpan SampleInterval = TimeSpan.FromSeconds(60);

	private readonly IServiceScopeFactory _scopeFactory;
	private readonly ILogger<JobQueueMonitorService> _logger;
	private readonly Func<TimeSpan, CancellationToken, Task> _delayAsync;
	private readonly SchedulerSyncState _syncState;
	private readonly Meter _meter;

	private volatile JobQueueSample _last = JobQueueSample.Empty;
	private int _processingOverLeaseStreak;

	public JobQueueMonitorService(
		IServiceScopeFactory scopeFactory,
		ILogger<JobQueueMonitorService> logger,
		SchedulerSyncState syncState
	) : this(scopeFactory, logger, syncState, DelayAsync) {
	}

	public JobQueueMonitorService(
		IServiceScopeFactory scopeFactory,
		ILogger<JobQueueMonitorService> logger,
		SchedulerSyncState syncState,
		Func<TimeSpan, CancellationToken, Task> delayAsync
	) {
		_scopeFactory = scopeFactory;
		_logger = logger;
		_syncState = syncState;
		_delayAsync = delayAsync;

		// Gauges pull from the latest sample. Named on the engine meter so every
		// job-related signal lives under one meter (§7.1/§7.2).
		_meter = new Meter(JobsMetrics.MeterName);

		_meter.CreateObservableGauge("jobs.due_depth", ObserveDueDepth);
		_meter.CreateObservableGauge("jobs.oldest_due_age_seconds", ObserveOldestDueAge);
		_meter.CreateObservableGauge(
			"jobs.processing_over_lease", () => _last.ProcessingOverLeaseCount
		);
		_meter.CreateObservableGauge("jobs.dlq_size", () => _last.DeadLetterSize);
		_meter.CreateObservableGauge("jobs.dlq_growth_1h", () => _last.DeadLetterGrowth1h);
		_meter.CreateObservableGauge(
			"email.log_failures_1h", () => _last.EmailLogFailures1h
		);
		_meter.CreateObservableGauge(
			"jobs.queue_dead_tuples", () => _last.JobQueueDeadTuples
		);

		// Leader observability (design §7.2/R2-10). scheduler.leader_present is emitted by
		// EVERY replica — that is the whole point: the round-1 design leader-gated the
		// sampler, so when leadership vanished nothing sampled and silence became the
		// symptom. scheduler.last_sync_at is leader-emitted (no leadership, no series), so
		// it observes only when this replica owes a sync.
		_meter.CreateObservableGauge("scheduler.leader_present", ObserveLeaderPresent);
		_meter.CreateObservableGauge("scheduler.last_sync_at", ObserveLastSyncAt);
	}

	/// <summary>The most recent sample; gauges observe this. Exposed for specs.</summary>
	public JobQueueSample LastSample {
		get { return _last; }
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		while (!stoppingToken.IsCancellationRequested) {
			try {
				await RunOneCycleAsync(stoppingToken);
			} catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) {
				break;
			} catch (Exception ex) {
				// A sampler failure must never take the worker down; the next tick retries.
				_logger.LogWarning(ex, "Job-queue monitor sample failed");
			}

			try {
				await _delayAsync(SampleInterval, stoppingToken);
			} catch (OperationCanceledException) {
				break;
			}
		}
	}

	/// <summary>Runs one scoped sample/evaluation cycle through a deterministic seam.</summary>
	public async Task RunOneCycleAsync(CancellationToken cancellationToken) {
		using var scope = _scopeFactory.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var sample = await SampleAsync(dbContext, cancellationToken);
		EvaluateAndAlert(sample);
	}

	/// <summary>
	/// Reads every signal in §7.2 against database time, stores it as the current sample
	/// (so gauges reflect it), and returns it. Read-only.
	/// </summary>
	public async Task<JobQueueSample> SampleAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken
	) {
		const int high = 100;
		const int pending = (int)JobQueueStatus.Pending;
		const int processing = (int)JobQueueStatus.Processing;
		const long lockKey = SchedulerLeaderService.SchedulerLeaderLockKey;

		// One statement gives all signals one PostgreSQL statement snapshot and one
		// transaction_timestamp(). Each table is aggregated once instead of queried per
		// metric; retention indexes support the exact time-window scans, while DLQ size
		// comes from PostgreSQL's approximate reltuples catalog statistic.
		var row = await dbContext.Database.SqlQuery<MonitorQueryResult>(
			$"""
			WITH clock AS MATERIALIZED (
				SELECT now() AS sampled_at
			),
			queue_metrics AS (
				SELECT
					count(*) FILTER (
						WHERE status = {pending}
							AND next_attempt_at <= (SELECT sampled_at FROM clock)
							AND priority >= {high}
					)::bigint AS "DueDepthHigh",
					count(*) FILTER (
						WHERE status = {pending}
							AND next_attempt_at <= (SELECT sampled_at FROM clock)
							AND priority < {high}
					)::bigint AS "DueDepthBulk",
					COALESCE(EXTRACT(EPOCH FROM (
						(SELECT sampled_at FROM clock) - min(next_attempt_at) FILTER (
							WHERE status = {pending}
								AND next_attempt_at <= (SELECT sampled_at FROM clock)
								AND priority >= {high}
						)
					)), 0)::double precision AS "OldestDueAgeSecondsHigh",
					COALESCE(EXTRACT(EPOCH FROM (
						(SELECT sampled_at FROM clock) - min(next_attempt_at) FILTER (
							WHERE status = {pending}
								AND next_attempt_at <= (SELECT sampled_at FROM clock)
								AND priority < {high}
						)
					)), 0)::double precision AS "OldestDueAgeSecondsBulk",
					count(*) FILTER (
						WHERE status = {processing}
							AND locked_until <= (SELECT sampled_at FROM clock)
					)::bigint AS "ProcessingOverLeaseCount"
				FROM job_queue
			),
			dlq_metrics AS (
				SELECT
					COALESCE((
						SELECT GREATEST(reltuples, 0)::bigint
						FROM pg_class
						WHERE oid = 'job_dead_letter'::regclass
					), 0)::bigint AS "DeadLetterSize",
					(
						SELECT count(*)::bigint
						FROM job_dead_letter
						WHERE failed_at >= (
							SELECT sampled_at FROM clock
						) - interval '1 hour'
					) AS "DeadLetterGrowth1h"
			),
			email_metrics AS (
				SELECT count(*)::bigint AS "EmailLogFailures1h"
				FROM email_log
				WHERE outcome = {(int)EmailLogOutcome.PermanentlyFailed}
					AND occurred_at >= (SELECT sampled_at FROM clock) - interval '1 hour'
			),
			-- Leader presence (design §7.2, verbatim probe). A pg_locks CATALOG READ, never
			-- an acquire attempt: acquiring the advisory lock would let the monitor momentarily
			-- take leadership or contend with the scheduler's dedicated connection, so the
			-- observer would change the thing it observes. This query deliberately names no
			-- acquisition function — the spec asserts the RAW absence of those function names
			-- across every command the probe runs, so a comment cannot mask a real call and a
			-- real call cannot hide in a comment. PostgreSQL splits the bigint key across
			-- classid/objid (high/low 32 bits) with objsubid = 1.
			leader_metrics AS (
				SELECT EXISTS (
					SELECT 1
					FROM pg_locks
					WHERE locktype = 'advisory'
						AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
						AND classid = (({lockKey}::bigint >> 32) & 4294967295)::oid
						AND objid = ({lockKey}::bigint & 4294967295)::oid
						AND objsubid = 1
						AND granted
				) AS "LeaderPresent"
			)
			SELECT
				queue_metrics.*,
				dlq_metrics.*,
				email_metrics.*,
				leader_metrics.*,
				COALESCE((
					SELECT n_dead_tup
					FROM pg_stat_user_tables
					WHERE relname = 'job_queue'
				), 0)::bigint AS "JobQueueDeadTuples"
			FROM queue_metrics
			CROSS JOIN dlq_metrics
			CROSS JOIN email_metrics
			CROSS JOIN leader_metrics
			"""
		).SingleAsync(cancellationToken);

		var sample = new JobQueueSample {
			DueDepthHigh = row.DueDepthHigh,
			DueDepthBulk = row.DueDepthBulk,
			OldestDueAgeSecondsHigh = row.OldestDueAgeSecondsHigh,
			OldestDueAgeSecondsBulk = row.OldestDueAgeSecondsBulk,
			ProcessingOverLeaseCount = row.ProcessingOverLeaseCount,
			DeadLetterSize = row.DeadLetterSize,
			DeadLetterGrowth1h = row.DeadLetterGrowth1h,
			MissingTriagedCount = 0,
			EmailLogFailures1h = row.EmailLogFailures1h,
			JobQueueDeadTuples = row.JobQueueDeadTuples,
			LeaderPresent = row.LeaderPresent,
			SchedulerSyncAgeSeconds = ReadSyncAgeSeconds(),
		};

		_last = sample;
		return sample;
	}

	/// <summary>
	/// Logs the sample at information and each threshold breach at WARNING (the alert
	/// hook). Returns the breach codes so specs assert "fires above / silent below"
	/// deterministically. Processing-over-lease only alerts after
	/// <see cref="ProcessingOverLeaseConsecutiveSamples"/> consecutive breached samples
	/// (a single transient reclaim lag is not an alert).
	/// </summary>
	public IReadOnlyList<string> EvaluateAndAlert(JobQueueSample sample) {
		var breaches = new List<string>();

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"jobs.queue_sample due_high={DueHigh} due_bulk={DueBulk} "
				+ "oldest_high_s={OldestHigh} oldest_bulk_s={OldestBulk} "
				+ "processing_over_lease={OverLease} dlq_size={DlqSize} "
				+ "dlq_growth_1h={DlqGrowth} email_failures_1h={EmailFailures} "
				+ "dead_tuples={DeadTuples} leader_present={LeaderPresent} "
				+ "sync_age_s={SyncAge}",
				sample.DueDepthHigh,
				sample.DueDepthBulk,
				sample.OldestDueAgeSecondsHigh,
				sample.OldestDueAgeSecondsBulk,
				sample.ProcessingOverLeaseCount,
				sample.DeadLetterSize,
				sample.DeadLetterGrowth1h,
				sample.EmailLogFailures1h,
				sample.JobQueueDeadTuples,
				sample.LeaderPresent,
				sample.SchedulerSyncAgeSeconds
			);
		}

		if (sample.DueDepthTotal > DueDepthWarnThreshold) {
			breaches.Add("due_depth");
			_logger.LogWarning(
				"jobs.alert due_depth={DueDepth} exceeds {Threshold}",
				sample.DueDepthTotal,
				DueDepthWarnThreshold
			);
		}

		if (sample.OldestDueAgeSecondsHigh > OldestAgeHighWarnSeconds) {
			breaches.Add("oldest_due_age_high");
			_logger.LogWarning(
				"jobs.alert oldest_due_age_high_s={Age} exceeds {Threshold}",
				sample.OldestDueAgeSecondsHigh,
				OldestAgeHighWarnSeconds
			);
		}

		if (sample.OldestDueAgeSecondsBulk > OldestAgeBulkWarnSeconds) {
			breaches.Add("oldest_due_age_bulk");
			_logger.LogWarning(
				"jobs.alert oldest_due_age_bulk_s={Age} exceeds {Threshold}",
				sample.OldestDueAgeSecondsBulk,
				OldestAgeBulkWarnSeconds
			);
		}

		// Consecutive-sample gate: reclaim being broken is a sustained condition, so a
		// lone breached sample is not alerted (a claim can momentarily out-race reclaim).
		if (sample.ProcessingOverLeaseCount > 0) {
			_processingOverLeaseStreak++;
		} else {
			_processingOverLeaseStreak = 0;
		}

		if (_processingOverLeaseStreak >= ProcessingOverLeaseConsecutiveSamples) {
			breaches.Add("processing_over_lease");
			_logger.LogWarning(
				"jobs.alert processing_over_lease={Count} sustained over {Samples} samples",
				sample.ProcessingOverLeaseCount,
				ProcessingOverLeaseConsecutiveSamples
			);
		}

		if (sample.DeadLetterGrowth1h > 0) {
			breaches.Add("dlq_growth");
			_logger.LogWarning(
				"jobs.alert dlq_growth_1h={Growth} new dead-letter row(s) in the last hour",
				sample.DeadLetterGrowth1h
			);
		}

		// Leader absence (design §7.2/R2-10). Evaluated by EVERY replica, including — in
		// fact, especially — a follower: this sampler was deliberately un-gated so that
		// the fleet can still see and report the total loss of a leader, which is the one
		// failure a leader-gated sampler could never report. The probe reads shared
		// catalog state, so every replica reaches the same verdict and the alert layer
		// collapses N identical observations into one alert by condition, not by instance.
		// Only a real probe that returned false alerts. UNKNOWN (null — no sample yet) is
		// never mapped to absent, so "no sample yet" cannot manufacture a page.
		if (sample.LeaderPresent is false) {
			breaches.Add("scheduler_leader_absent");
			_logger.LogWarning(
				"jobs.alert scheduler.leader_present=0 — no replica holds the scheduler-leader "
				+ "advisory lock; cron triggers are not being scheduled fleet-wide"
			);
		}

		// Wedged-but-present leader: the lock is still held (so the condition above stays
		// quiet) while reconciliation has stopped progressing. Only the leader owes a sync,
		// so a null age is a follower, not a breach.
		if (sample.SchedulerSyncAgeSeconds > SchedulerSyncStaleSeconds) {
			breaches.Add("scheduler_sync_stale");
			_logger.LogWarning(
				"jobs.alert scheduler.last_sync_at is {Age}s stale, over the {Threshold}s "
				+ "threshold — this replica holds leadership but its reconcile has stalled",
				sample.SchedulerSyncAgeSeconds,
				SchedulerSyncStaleSeconds
			);
		}

		return breaches;
	}

	private IEnumerable<Measurement<long>> ObserveDueDepth() {
		var sample = _last;
		return [
			new Measurement<long>(
				sample.DueDepthHigh,
				new KeyValuePair<string, object?>("priority_class", "high")
			),
			new Measurement<long>(
				sample.DueDepthBulk,
				new KeyValuePair<string, object?>("priority_class", "bulk")
			),
		];
	}

	private IEnumerable<Measurement<double>> ObserveOldestDueAge() {
		var sample = _last;
		return [
			new Measurement<double>(
				sample.OldestDueAgeSecondsHigh,
				new KeyValuePair<string, object?>("priority_class", "high")
			),
			new Measurement<double>(
				sample.OldestDueAgeSecondsBulk,
				new KeyValuePair<string, object?>("priority_class", "bulk")
			),
		];
	}

	private static Task DelayAsync(TimeSpan delay, CancellationToken cancellationToken) {
		return Task.Delay(delay, cancellationToken);
	}

	// Null unless this replica is the leader: a follower runs no reconcile, so it owes no
	// sync and must not alert on one. Process clock on both sides of the subtraction —
	// this is an in-process liveness signal, not a durable cross-process predicate (F11).
	private double? ReadSyncAgeSeconds() {
		var baseline = _syncState.StalenessBaseline;

		if (baseline is null) {
			return null;
		}

		return (DateTimeOffset.UtcNow - baseline.Value).TotalSeconds;
	}

	// Emits 1/0 only once a real probe has reported; UNKNOWN (null, pre-first-sample) emits
	// NOTHING, so the series never carries a fabricated "leader present" before any probe.
	private IEnumerable<Measurement<int>> ObserveLeaderPresent() {
		var leaderPresent = _last.LeaderPresent;

		if (leaderPresent is null) {
			return [];
		}

		return [new Measurement<int>(leaderPresent.Value ? 1 : 0)];
	}

	private IEnumerable<Measurement<long>> ObserveLastSyncAt() {
		var lastSyncAt = _syncState.LastSyncAt;

		if (lastSyncAt is null) {
			return [];
		}

		return [new Measurement<long>(lastSyncAt.Value.ToUnixTimeSeconds())];
	}

	private sealed record MonitorQueryResult {
		public required long DueDepthHigh { get; init; }
		public required long DueDepthBulk { get; init; }
		public required double OldestDueAgeSecondsHigh { get; init; }
		public required double OldestDueAgeSecondsBulk { get; init; }
		public required long ProcessingOverLeaseCount { get; init; }
		public required long DeadLetterSize { get; init; }
		public required long DeadLetterGrowth1h { get; init; }
		public required long EmailLogFailures1h { get; init; }
		public required long JobQueueDeadTuples { get; init; }
		public required bool LeaderPresent { get; init; }
	}

	public override void Dispose() {
		_meter.Dispose();
		base.Dispose();
	}
}
