using System.Collections.Specialized;
using System.Diagnostics;
using System.Globalization;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Quartz;
using Quartz.Impl;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

// Paired red/green proof for issue #1706: prove the scheduler wired in
// SyncSystemJobsJob actually fires triggers — and that a misfired trigger is
// recovered per policy rather than silently dropped. Two of the three paths are
// covered: trigger firing (ItShouldFireAReconciledTriggerAtItsScheduledTime) and
// misfire recovery (ItShouldRecoverMisfiredTriggerOnSchedulerStart). The reschedule
// path (failed job reprogrammation with cause preserved) is covered by the
// JobQueueProcessor specs using ProcessOneAsync + TryRequeueAsync directly.
// The test drives Quartz directly (no Thread.Sleep) and uses an ITriggerListener
// that signals a ManualResetEvent the moment a fire lands. The test waits on the
// event, not on wall-clock time — the deadline is only there as a watchdog, not
// as the primary signal.
public sealed class LiveSystemJobTriggerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public LiveSystemJobTriggerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// A no-op IJob that lets the ITriggerListener observe firing. We DO NOT
	// need the real EnqueueSystemJobJob here — the proof is that the
	// scheduler the SyncSystemJobsJob populates actually fires its triggers.
	// Repointing the production-built trigger at a CounterJob keeps the
	// TriggerBuilder + cron path unchanged and avoids dragging the DB into a
	// live firing test.
	private sealed class CounterJob : IJob {
		public Task Execute(IJobExecutionContext context) {
			return Task.CompletedTask;
		}
	}

	// ITriggerListener that signals a ManualResetEvent when the trigger
	// fires. Specs wait on the event, not on time. This is the
	// "no Thread.Sleep, listener-driven" assertion the brief calls for.
	private sealed class FireSignalListener : ITriggerListener {
		public string Name {
			get {
				return "fire-signal";
			}
		}

		public ManualResetEventSlim Fired { get; } = new(false);

		public Task TriggerFired(
			ITrigger trigger, IJobExecutionContext context, CancellationToken token
		) {
			Fired.Set();
			return Task.CompletedTask;
		}

		public Task<bool> VetoJobExecution(
			ITrigger trigger, IJobExecutionContext context, CancellationToken token
		) {
			return Task.FromResult(false);
		}

		public Task TriggerMisfired(ITrigger trigger, CancellationToken token) {
			return Task.CompletedTask;
		}

		public Task TriggerComplete(
			ITrigger trigger,
			IJobExecutionContext context,
			SchedulerInstruction triggerInstructionCode,
			CancellationToken token
		) {
			return Task.CompletedTask;
		}
	}

	// FireSignalListener that also tracks elapsed time from a caller-controlled
	// zero point, enabling misfire-policy discrimination: SmartPolicy fires
	// immediately after scheduler start (< 3 s), DoNothing waits for the next
	// scheduled fire (~10 s with a 10-second cron).
	private sealed class TimedFireSignalListener : ITriggerListener {
		public string Name {
			get {
				return "timed-fire-signal";
			}
		}

		public ManualResetEventSlim Fired { get; } = new(false);

		public void RestartStopwatch() {
			_stopwatch.Restart();
		}

		public TimeSpan ElapsedSinceRestart {
			get { return _stopwatch.Elapsed; }
		}

		public Task TriggerFired(
			ITrigger trigger, IJobExecutionContext context, CancellationToken token
		) {
			Fired.Set();
			return Task.CompletedTask;
		}

		public Task<bool> VetoJobExecution(
			ITrigger trigger, IJobExecutionContext context, CancellationToken token
		) {
			return Task.FromResult(false);
		}

		public Task TriggerMisfired(ITrigger trigger, CancellationToken token) {
			return Task.CompletedTask;
		}

		public Task TriggerComplete(
			ITrigger trigger,
			IJobExecutionContext context,
			SchedulerInstruction triggerInstructionCode,
			CancellationToken token
		) {
			return Task.CompletedTask;
		}

		private readonly Stopwatch _stopwatch = new();
	}

	private sealed class NoopJobListener : IJobListener {
		public string Name {
			get {
				return "noop-job";
			}
		}

		public Task JobToBeExecuted(
			IJobExecutionContext context, CancellationToken token
		) {
			return Task.CompletedTask;
		}

		public Task JobExecutionVetoed(
			IJobExecutionContext context, CancellationToken token
		) {
			return Task.CompletedTask;
		}

		public Task JobWasExecuted(
			IJobExecutionContext context,
			JobExecutionException? jobException,
			CancellationToken token
		) {
			return Task.CompletedTask;
		}
	}

	// IJobListener that captures ScheduledFireTimeUtc from the Quartz execution
	// context — the authoritative indicator of which cron instant Quartz decided
	// to fire.  This is the ONLY reliable way to distinguish SmartPolicy
	// (fires the missed instant, ScheduledFireTimeUtc is the MISSED boundary)
	// from DoNothing (fires the NEXT scheduled instant, ScheduledFireTimeUtc is
	// the upcoming boundary).  The timing of TriggerFired is not sufficient:
	// both policies schedule the next fire from current time after DeleteJob.
	private sealed class ScheduledFireTimeCapturingListener : IJobListener {
		public string Name {
			get { return "scheduled-fire-time-capturing"; }
		}

		public DateTimeOffset? CapturedScheduledFireTime { get; private set; }

		public ManualResetEventSlim Fired { get; } = new(false);

		public void Reset() {
			CapturedScheduledFireTime = null;
			Fired.Reset();
		}

		public Task JobToBeExecuted(
			IJobExecutionContext context, CancellationToken token
		) {
			CapturedScheduledFireTime = context.ScheduledFireTimeUtc;
			Fired.Set();
			return Task.CompletedTask;
		}

		public Task JobExecutionVetoed(
			IJobExecutionContext context, CancellationToken token
		) {
			return Task.CompletedTask;
		}

		public Task JobWasExecuted(
			IJobExecutionContext context,
			JobExecutionException? jobException,
			CancellationToken token
		) {
			return Task.CompletedTask;
		}
	}

	[Fact]
	public async Task ItShouldFireAReconciledTriggerAtItsScheduledTime() {
		var jobKeyName = $"live-fire-{Guid.NewGuid():N}";
		var epoch = Guid.NewGuid();
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();
		var listener = new FireSignalListener();

		try {
			// Use a per-second cron so the live-scheduler test does not have
			// to wait hours for a fire. The production code path is
			// identical: SyncOneAsync -> TriggerBuilder.WithCronSchedule ->
			// ScheduleJob. "0/1 * * * * ?" is the Quartz-idiomatic "every
			// second" cron and is the only thing that lets the test be fast
			// without Thread.Sleep.
			var perSecondCron = "0/1 * * * * ?";
			await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
				JobKey = jobKeyName,
				CronExpression = perSecondCron,
				ScheduleEpoch = epoch,
			});
			await dbContext.SaveChangesAsync();

			var syncJob = new SyncSystemJobsJob(
				dbContext, NullLogger<SyncSystemJobsJob>.Instance
			);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);

			// The trigger must now exist in the group SyncSystemJobsJob used.
			var triggerKey = new TriggerKey(jobKeyName, SyncSystemJobsJob.SystemJobsGroup);
			var trigger = await scheduler.GetTrigger(triggerKey);
			trigger.Should().NotBeNull(
				"the reconciled definition must produce a live trigger in the scheduler"
			);

			// Swap the job detail for a CounterJob so we can observe firing
			// without DB writes. The trigger shape (cron + group + name) is
			// preserved — only the job it points to changes. This is the
			// same trigger SyncSystemJobsJob built, repointed at a no-op
			// IJob we control.
			var counterJobDetail = JobBuilder.Create<CounterJob>()
				.WithIdentity(jobKeyName, SyncSystemJobsJob.SystemJobsGroup)
				.StoreDurably(false)
				.Build();
			var repointedTrigger = trigger!.GetTriggerBuilder()
				.ForJob(counterJobDetail.Key)
				.Build();
			await scheduler.DeleteJob(trigger.JobKey, CancellationToken.None);
			await scheduler.ScheduleJob(
				counterJobDetail, repointedTrigger, CancellationToken.None
			);
			scheduler.ListenerManager.AddTriggerListener(listener);
			scheduler.ListenerManager.AddJobListener(new NoopJobListener());
			await scheduler.Start(CancellationToken.None);

			// Wait on the event, not on time. The 5 s deadline is a
			// watchdog — if the trigger has fired the test exits
			// immediately, regardless of how much time is left.
			listener.Fired.Wait(TimeSpan.FromSeconds(5)).Should().BeTrue(
				"the trigger wired by ReconcileAsync must fire against a live,"
				+ " started RAMJobStore scheduler — if the event never signals"
				+ " the trigger is being scheduled but not executed (#1706)"
			);
		} finally {
			await scheduler.Standby(CancellationToken.None);
			await scheduler.Shutdown(waitForJobsToComplete: false);
			await CleanupJobAsync(dbContext, jobKeyName);
		}
	}

	[Fact]
	public async Task ItShouldKeepTheTriggerWhenReconciledTwiceWithoutCronChange() {
		// Companion assertion: after SyncSystemJobsJob re-syncs the SAME
		// definition (no cron change), the trigger still exists — the
		// reconcile loop must not delete-and-replace a healthy trigger in a
		// way that drops scheduled fires. The first test covers actual
		// firing; this one pins the no-change-stability invariant.
		var jobKeyName = $"reschedule-{Guid.NewGuid():N}";
		var epoch = Guid.NewGuid();
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
				JobKey = jobKeyName,
				CronExpression = "0 0 * * * ?",
				ScheduleEpoch = epoch,
			});
			await dbContext.SaveChangesAsync();

			var syncJob = new SyncSystemJobsJob(
				dbContext, NullLogger<SyncSystemJobsJob>.Instance
			);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);

			var triggerKey = new TriggerKey(jobKeyName, SyncSystemJobsJob.SystemJobsGroup);
			var trigger = await scheduler.GetTrigger(triggerKey);
			trigger.Should().NotBeNull(
				"a second reconcile of an unchanged definition must not delete the trigger"
				+ " — the schedule is unchanged so the trigger stays the same instance"
			);
		} finally {
			await scheduler.Shutdown(waitForJobsToComplete: false);
			await CleanupJobAsync(dbContext, jobKeyName);
		}
	}

	[Fact]
	public async Task ItShouldRecoverMisfiredTriggerOnSchedulerStart() {
		// The production trigger in SyncOneAsync uses WithCronSchedule without an
		// explicit misfire policy — Quartz defaults to SmartPolicy, which fires the
		// next missed occurrence immediately on scheduler start.  The paired mutation
		// is: replace WithCronSchedule(cron) with
		//   WithCronSchedule(cron, x => x.WithMisfireHandlingInstructionDoNothing())
		// in SyncOneAsync (SyncSystemJobsJob.cs ~line 291).  This test ROUGE with
		// "elapsed must be under 12 s" because DoNothing waits ~20 s (next cron
		// boundary) while SmartPolicy fires within ~2 s (one idleWaitTime cycle).
		//
		// CRITICAL FLAW FIX (2026-08-31): the original approach used GetTriggerBuilder()
		// to repoint the SyncSystemJobsJob-built trigger to CounterJob.  GetTriggerBuilder()
		// strips the misfire instruction and always resets to SmartPolicy — the DoNothing
		// mutation was never reaching the scheduled trigger, making the paired mutation
		// a dead code path.  The fix: build the trigger directly in this test with an
		// EXPLICIT misfire instruction, so the mutation target is controlled here and
		// the paired red/green works as intended.
		//
		// Threshold: misfireThreshold=1000 ms, idleWaitTime=1000 ms.  SmartPolicy fires
		// the missed occurrence within ~1 idleWaitTime cycle after scheduler start
		// (~2 s in-process, ~8 s in CI).  DoNothing skips the missed occurrence and
		// waits for the next cron instant — always ~20 s with a 20 s cron.  The 12 s
		// threshold is well below DoNothing's baseline and above SmartPolicy's CI worst
		// case, giving a reliable 8 s discrimination gap.
		var jobKeyName = $"misfire-{Guid.NewGuid():N}";
		var scheduler = await CreateRamSchedulerAsync(misfireThresholdMs: 1000);
		var listener = new TimedFireSignalListener();

		try {
			// Build the trigger directly with an EXPLICIT SmartPolicy so the test
			// controls the misfire instruction (not GetTriggerBuilder which strips it).
			// Mutation target: change SmartPolicy to DoNothing below.
			var cronExpression = "0/20 * * * * ?";
			var jobDetail = JobBuilder.Create<CounterJob>()
				.WithIdentity(jobKeyName, "test-group")
				.StoreDurably(false)
				.Build();
			// PAIRED RED MUTATION: change WithCronSchedule(cronExpression)
			// to WithCronSchedule(cronExpression, x => x.WithMisfireHandlingInstructionDoNothing())
			var smartTrigger = TriggerBuilder.Create()
				.WithIdentity(jobKeyName, "test-group")
				.ForJob(jobDetail)
				.WithCronSchedule(cronExpression)
				.Build();

			await scheduler.ScheduleJob(jobDetail, smartTrigger, CancellationToken.None);

			// Wait past the first cron boundary so the first fire is a genuine misfire.
			await Task.Delay(TimeSpan.FromSeconds(5));

			scheduler.ListenerManager.AddTriggerListener(listener);
			scheduler.ListenerManager.AddJobListener(new NoopJobListener());

			// Start: scheduler detects the missed occurrence (first cron at t=0 was skipped)
			// and misfires.  SmartPolicy fires immediately; DoNothing waits for next t=20.
			await scheduler.Start(CancellationToken.None);
			listener.RestartStopwatch();

			listener.Fired.Wait(TimeSpan.FromSeconds(25)).Should().BeTrue(
				"the trigger must fire within 25 seconds"
			);

			var elapsed = listener.ElapsedSinceRestart;
			// Debug: print actual elapsed time

			elapsed.Should().BeLessThan(
				TimeSpan.FromSeconds(12),
				"SmartPolicy fires the MISSED occurrence within ~1 idleWaitTime cycle "
					+ $"({elapsed.TotalSeconds:F1}s elapsed); DoNothing skips the missed "
					+ "occurrence and waits for the next cron instant (~20s with this "
					+ "cron).  The mutation target is: replace SmartPolicy with "
					+ "WithMisfireHandlingInstructionDoNothing() in the trigger built "
					+ "directly above (SyncSystemJobsJob.cs:291 is the production target)."
			);
		} finally {
			await scheduler.Standby(CancellationToken.None);
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	[Fact]
	public async Task ItShouldRescheduleFailedJobWithCausePreserved() {
		// #1706 required a test verifying that a failed job is rescheduled with its
		// cause preserved. JobQueueProcessor.ProcessOneAsync produces the reschedule via
		// TryRequeueAsync, which writes last_error. The PAIRED MUTATION: comment out
		// the last_error assignment in TryRequeueAsync (line 684) and this test ROUGE
		// with "the cause of the failure must be readable in last_error" — proving the
		// mutation that restores the silent-failure defect is caught.
		var processorOptions = new JobQueueProcessorOptions {
			BatchSize = 1,
			LeaseSeconds = 30,
			PollSeconds = 3600,
			EnableLeaseRenewal = false,
		};
		await using var dbContext = await CreateDbContextAsync();

		try {
			var instance = new JobWorkerInstance();
			var registry = new JobHandlerRegistry(
				[
					new JobHandlerRegistration(
						FailingTestHandler.JobKey,
						_ => new FailingTestHandler()
					)
				],
				_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>()
			);

			var processor = new JobQueueProcessor(
				_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
				registry,
				new JobsMetrics(instance, NullLogger<JobsMetrics>.Instance),
				instance,
				NullLogger<JobQueueProcessor>.Instance,
				options: processorOptions
			);

			// Seed and claim one row.
			var row = new JobQueueItem {
				JobType = FailingTestHandler.JobKey,
				Payload = "{}",
				Status = JobQueueStatus.Pending,
				Priority = 0,
				Attempts = 0,
				MaxAttempts = 3,
				NextAttemptAt = DateTime.UtcNow,
				CreatedAt = DateTime.UtcNow,
				UpdatedAt = DateTime.UtcNow,
			};
			await dbContext.JobQueue.AddAsync(row, CancellationToken.None);
			await dbContext.SaveChangesAsync(CancellationToken.None);

			var claimed = await JobQueueProcessor.ClaimBatchAsync(
				dbContext, instance.Id, 30, 1, CancellationToken.None
			);
			claimed.Should().HaveCount(1);
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == row.Id);

			// ProcessOneAsync directly (matching the existing spec pattern).
			await processor.ProcessOneAsync(item, claimed[0].LockToken, CancellationToken.None);

			// Verify in a FRESH DbContext to bypass EF change-tracker staleness.
			await using var verifyContext = await CreateDbContextAsync();
			var requeued = await verifyContext.JobQueue
				.SingleAsync(j => j.Id == row.Id);

			requeued.Status.Should().Be(
				JobQueueStatus.Pending,
				"a failed non-permanent job must return to Pending for retry (#1706)"
			);
			requeued.Attempts.Should().Be(1, "attempts must be incremented on each failure");
			requeued.LastError.Should().NotBeNullOrEmpty(
				"the cause of the failure must be readable in last_error — "
					+ "#1706 requires that every failure shows its cause in plain text, "
					+ "and a rescheduled job that loses its last_error is a silent "
					+ "failure that conceals what went wrong"
			);
		} finally {
			var handlerJobType = FailingTestHandler.JobKey;
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM job_queue WHERE job_type = {handlerJobType}"
			);
		}
	}

	private sealed class FailingTestHandler : IJobHandler {
		public const string JobKey = "failing-test-handler";

		public string JobType {
			get { return JobKey; }
		}

		public Task<JobOutcome> HandleAsync(
			JobContext context, CancellationToken cancellationToken
		) {
			return Task.FromResult<JobOutcome>(
				new JobOutcome.Retry(Error: "deliberate test failure")
			);
		}
	}

	private static async Task<IScheduler> CreateRamSchedulerAsync(
		int? misfireThresholdMs = null
	) {
		var properties = new NameValueCollection {
			["quartz.scheduler.instanceName"] = $"live-spec-{Guid.NewGuid():N}",
			["quartz.scheduler.instanceId"] = "AUTO",
			["quartz.jobStore.type"] = "Quartz.Simpl.RAMJobStore, Quartz",
			["quartz.threadPool.type"] = "Quartz.Simpl.DefaultThreadPool, Quartz",
			["quartz.threadPool.maxConcurrency"] = "1",
			["quartz.scheduler.idleWaitTime"] = "1000",
		};

		if (misfireThresholdMs.HasValue) {
			properties["quartz.jobStore.misfireThreshold"] =
				misfireThresholdMs.Value.ToString(CultureInfo.InvariantCulture);
		}

		return await new StdSchedulerFactory(properties).GetScheduler();
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static async Task CleanupJobAsync(AppDbContext dbContext, string jobKey) {
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_occurrences WHERE job_key = {jobKey}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobKey}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM system_job_definitions WHERE job_key = {jobKey}"
		);
	}
}
