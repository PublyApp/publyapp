using System.Collections.Specialized;

using Npgsql;

using PublyApp.Api.Infrastructure.Jobs.Quartz;

using Quartz;
using Quartz.Impl;
using Quartz.Spi;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Owns the Quartz scheduler lifecycle via a session-level Postgres advisory lock so
/// exactly one worker replica runs the cron triggers (design §5.2/D3). It holds a
/// dedicated, non-pooled Npgsql connection and calls
/// <c>pg_try_advisory_lock(SchedulerLeaderLockKey)</c>: on acquire it starts Quartz and
/// registers the fixed infra triggers; on failure it stays a follower and retries.
/// Leadership renewal is implicit (the lock lives for the connection's life); a periodic
/// <c>SELECT 1</c> detects a dropped connection, on which it stops Quartz and re-enters
/// the acquire loop so leadership migrates to a surviving replica.
///
/// Only the leader runs triggers; ALL workers run <see cref="JobQueueProcessor"/>, so a
/// trigger merely enqueues/reconciles and leader failover never strands in-flight jobs.
/// The public TryBecomeLeaderAsync / ReleaseLeadershipAsync / IsLeader surface lets specs
/// drive leadership deterministically, mirroring the processor's public-method discipline.
/// </summary>
public sealed class SchedulerLeaderService : BackgroundService {
	// Single fixed bigint namespace for the leader lock (design §5.2). The bytes spell
	// "PUBLYSCH"; a repo grep found no other pg_advisory_lock usage, so this constant is
	// the whole namespace and there is no collision to design around.
	public const long SchedulerLeaderLockKey = 0x5055424C59534348L;

	// Quartz group for the two fixed infrastructure triggers (separate from the dynamic
	// system-jobs group SyncSystemJobsJob manages).
	private const string InfraGroup = "infra";
	private const int SyncIntervalSeconds = 60;
	private const int RecoverIntervalSeconds = 300;

	private static readonly TimeSpan AcquireRetryInterval = TimeSpan.FromSeconds(15);
	private static readonly TimeSpan RenewCheckInterval = TimeSpan.FromSeconds(15);

	private readonly string _lockConnectionString;
	private readonly IJobFactory _jobFactory;
	private readonly ILogger<SchedulerLeaderService> _logger;

	// Spec seam (public-methods-for-determinism family): lets a spec substitute a
	// scheduler whose stop cannot be confirmed, to prove the release ordering below.
	// DI never provides it (optional, like JobQueueProcessor's options param).
	private readonly Func<CancellationToken, Task<IScheduler>>? _schedulerFactoryOverride;

	private NpgsqlConnection? _lockConnection;
	private IScheduler? _scheduler;

	public SchedulerLeaderService(
		SchedulerLeaderOptions options,
		IServiceScopeFactory scopeFactory,
		ILogger<SchedulerLeaderService> logger,
		Func<CancellationToken, Task<IScheduler>>? schedulerFactory = null
	) {
		_schedulerFactoryOverride = schedulerFactory;
		// Pooling disabled on the dedicated lock connection so it is never reset and
		// returned to the pool underneath us — which would drop the session advisory
		// lock. It stays open for the life of leadership (design §5.2 pooling resolution).
		var connectionBuilder = new NpgsqlConnectionStringBuilder(options.ConnectionString) {
			Pooling = false,
		};
		_lockConnectionString = connectionBuilder.ConnectionString;
		_jobFactory = new ScopedJobFactory(scopeFactory);
		_logger = logger;
	}

	public bool IsLeader {
		get { return _lockConnection is not null; }
	}

	// True only when this instance holds leadership AND its scheduler is actively
	// running (started and not in standby). Followers never start a scheduler.
	public bool IsSchedulerRunning {
		get { return _scheduler is { IsStarted: true, InStandbyMode: false }; }
	}

	protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
		try {
			while (!stoppingToken.IsCancellationRequested) {
				await RunLeadershipTickAsync(stoppingToken);

				try {
					await Task.Delay(
						IsLeader ? RenewCheckInterval : AcquireRetryInterval,
						stoppingToken
					);
				} catch (OperationCanceledException) {
					break;
				}
			}
		} finally {
			// Graceful shutdown (design §3.6): Quartz drains within the host's bounded
			// ShutdownTimeout, then the advisory lock releases on connection close.
			try {
				await ReleaseLeadershipAsync(CancellationToken.None);
			} catch (Exception ex) {
				// Unconfirmed scheduler stop during host teardown: log as loudly as
				// possible. The process is exiting, so the dedicated connection dies
				// with it and the advisory lock releases server-side regardless.
				_logger.LogCritical(
					ex,
					"Unconfirmed Quartz stop during host shutdown; the advisory lock "
					+ "releases when this process's dedicated connection dies"
				);
			}
		}
	}

	// One iteration of the acquire/renew loop, public so specs drive renewal and loss
	// deterministically (the repo's public-methods-for-determinism discipline): as a
	// follower it contends for the lock; as the leader it probes the dedicated lock
	// connection (SELECT 1 — the §5.2 implicit-renewal check) and stands down (stops
	// Quartz, releases the lock) when the connection is dead, so leadership migrates.
	public async Task RunLeadershipTickAsync(CancellationToken cancellationToken) {
		try {
			if (!IsLeader) {
				await TryBecomeLeaderAsync(cancellationToken);
			} else if (!await IsLockConnectionAliveAsync(cancellationToken)) {
				_logger.LogWarning(
					"Lost scheduler-leader lock connection; standing down to re-contend"
				);
				await ReleaseLeadershipAsync(cancellationToken);
			}
		} catch (Exception ex) when (ex is not OperationCanceledException) {
			_logger.LogError(ex, "Scheduler-leader loop iteration failed; standing down");
			await ReleaseLeadershipAsync(cancellationToken);
		}
	}

	// Public: attempts to acquire the advisory lock; on success starts Quartz and
	// registers the fixed triggers. Returns whether this instance is now the leader.
	public async Task<bool> TryBecomeLeaderAsync(CancellationToken cancellationToken) {
		if (IsLeader) {
			return true;
		}

		var connection = new NpgsqlConnection(_lockConnectionString);

		bool acquired;
		try {
			await connection.OpenAsync(cancellationToken);

			await using var command = new NpgsqlCommand(
				$"SELECT pg_try_advisory_lock({SchedulerLeaderLockKey})",
				connection
			);
			var result = await command.ExecuteScalarAsync(cancellationToken);
			acquired = result is true;
		} catch {
			// Provisional connection: ownership was never transferred to
			// _lockConnection, so it must be disposed here or it leaks.
			await connection.DisposeAsync();
			throw;
		}

		if (!acquired) {
			await connection.DisposeAsync();
			return false;
		}

		_lockConnection = connection;

		try {
			await StartSchedulerAsync(cancellationToken);
		} catch {
			// Startup failure routes through the SAME standby-confirmed release path
			// as a normal stand-down (StartSchedulerAsync transferred ownership to
			// _scheduler before starting): if the stop confirms, the lock is released
			// and the startup failure propagates — no phantom leader; if the stop
			// CANNOT be confirmed, ReleaseLeadershipAsync itself throws with the lock
			// still held — fail-closed, no second scheduler can start.
			await ReleaseLeadershipAsync(cancellationToken);
			throw;
		}

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Acquired scheduler leadership; Quartz scheduler started");
		}

		return true;
	}

	// Public: relinquishes leadership. The ORDERING is load-bearing: the scheduler is
	// confirmed stopped (Standby — no further trigger firing) BEFORE the advisory lock
	// is released, so another replica can never start a second scheduler while this
	// one may still be firing. An unconfirmed stop (Standby throws) aborts the release
	// entirely — the scheduler reference AND the lock are retained — and the exception
	// propagates so the caller retries or crashes loudly; this service never continues
	// as a follower while its scheduler might still be live. Idempotent on success.
	public async Task ReleaseLeadershipAsync(CancellationToken cancellationToken) {
		if (_scheduler is not null) {
			// Throws => nothing below runs: still leader, lock held, reference intact.
			await _scheduler.Standby(cancellationToken);

			try {
				await _scheduler.Shutdown(waitForJobsToComplete: true, cancellationToken);
			} catch (Exception ex) {
				// Standby above already confirmed no further firing, so a failed full
				// Shutdown is a resource-teardown problem (thread-pool leak), not a
				// dual-scheduler risk — safe to log and continue the stand-down.
				_logger.LogError(
					ex,
					"Quartz shutdown failed after a confirmed standby; continuing stand-down"
				);
			}

			_scheduler = null;
		}

		if (_lockConnection is not null) {
			try {
				await using var command = new NpgsqlCommand(
					$"SELECT pg_advisory_unlock({SchedulerLeaderLockKey})",
					_lockConnection
				);
				_ = await command.ExecuteScalarAsync(cancellationToken);
			} catch (Exception ex) {
				// Closing the connection releases the session lock anyway.
				_logger.LogWarning(ex, "Error releasing advisory lock; closing connection instead");
			}

			await _lockConnection.DisposeAsync();
			_lockConnection = null;
		}
	}

	private async Task StartSchedulerAsync(CancellationToken cancellationToken) {
		IScheduler scheduler;
		if (_schedulerFactoryOverride is not null) {
			scheduler = await _schedulerFactoryOverride(cancellationToken);
		} else {
			// Manual lifecycle, RAM job store (no qrtz_* tables) — durability lives in
			// job_queue and leadership in the advisory lock (design §5.3). A unique
			// instance name keeps two leaders-in-a-test out of Quartz's shared
			// scheduler repository.
			var properties = new NameValueCollection {
				["quartz.scheduler.instanceName"] = $"publyapp-scheduler-{Guid.NewGuid():N}",
				["quartz.scheduler.instanceId"] = "AUTO",
				["quartz.jobStore.type"] = "Quartz.Simpl.RAMJobStore, Quartz",
				["quartz.threadPool.type"] = "Quartz.Simpl.DefaultThreadPool, Quartz",
				["quartz.threadPool.maxConcurrency"] = "5",
			};

			scheduler = await new StdSchedulerFactory(properties).GetScheduler(cancellationToken);
		}

		// Ownership transfers BEFORE registration/start (fail-closed): Quartz can begin
		// firing before Start() even returns, so a startup failure must flow through
		// the SAME standby-confirmed release path as a normal stand-down (the caller's
		// catch calls ReleaseLeadershipAsync, which sees this reference) — never a
		// best-effort local teardown that swallows an unconfirmed stop and then lets
		// the advisory lock be released while triggers may still be live.
		_scheduler = scheduler;

		scheduler.JobFactory = _jobFactory;
		await RegisterFixedTriggersAsync(scheduler, cancellationToken);
		await scheduler.Start(cancellationToken);
	}

	private static async Task RegisterFixedTriggersAsync(
		IScheduler scheduler,
		CancellationToken cancellationToken
	) {
		var syncJob = JobBuilder.Create<SyncSystemJobsJob>()
			.WithIdentity("sync-system-jobs", InfraGroup)
			.Build();
		var syncTrigger = TriggerBuilder.Create()
			.WithIdentity("sync-system-jobs", InfraGroup)
			.StartAt(DateBuilder.FutureDate(SyncIntervalSeconds, IntervalUnit.Second))
			.WithSimpleSchedule(x => x.WithIntervalInSeconds(SyncIntervalSeconds).RepeatForever())
			.Build();
		await scheduler.ScheduleJob(syncJob, syncTrigger, cancellationToken);

		var recoverJob = JobBuilder.Create<RecoverStaleJobsJob>()
			.WithIdentity("recover-stale-jobs", InfraGroup)
			.Build();
		var recoverTrigger = TriggerBuilder.Create()
			.WithIdentity("recover-stale-jobs", InfraGroup)
			.StartAt(DateBuilder.FutureDate(RecoverIntervalSeconds, IntervalUnit.Second))
			.WithSimpleSchedule(x => x.WithIntervalInSeconds(RecoverIntervalSeconds).RepeatForever())
			.Build();
		await scheduler.ScheduleJob(recoverJob, recoverTrigger, cancellationToken);
	}

	private async Task<bool> IsLockConnectionAliveAsync(CancellationToken cancellationToken) {
		if (_lockConnection is null) {
			return false;
		}

		try {
			await using var command = new NpgsqlCommand("SELECT 1", _lockConnection);
			_ = await command.ExecuteScalarAsync(cancellationToken);
			return true;
		} catch (Exception ex) when (ex is not OperationCanceledException) {
			return false;
		}
	}
}
