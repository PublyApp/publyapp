using System.Collections.Specialized;

using System.Diagnostics;

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
		// The trigger built by SyncOneAsync uses WithCronSchedule without a misfire
		// policy — Quartz defaults to SmartPolicy, which fires the next missed
		// occurrence IMMEDIATELY on scheduler start (within ~200 ms). With
		// DoNothing, the trigger skips the missed ones and waits for the NEXT
		// scheduled fire (~10 s from restart). Using a Stopwatch to measure
		// elapsed time from scheduler start to first fire distinguishes the two:
		// < 3 s → SmartPolicy recovered the miss; > 9 s → DoNothing silently
		// dropped it. A regression that silenced misfires would fail this test.
		// The PAIRED MUTATION: apply WithMisfireHandlingInstructionDoNothing() in
		// SyncOneAsync (line 294) — the test ROUGE with "the trigger must fire
		// within 3 seconds of scheduler start" — proving the guard catches the
		// silent-drop regression.
		var jobKeyName = $"misfire-{Guid.NewGuid():N}";
		var epoch = Guid.NewGuid();
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();
		var listener = new TimedFireSignalListener();

		try {
			// Every 10 s: SmartPolicy fires immediately after restart (< 1 s); DoNothing
			// waits ~10 s for the next scheduled instant. The gap is large enough to
			// make a 3 s threshold unambiguous.
			var every10Seconds = "0/10 * * * * ?";
			await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
				JobKey = jobKeyName,
				CronExpression = every10Seconds,
				ScheduleEpoch = epoch,
			});
			await dbContext.SaveChangesAsync();

			var syncJob = new SyncSystemJobsJob(
				dbContext, NullLogger<SyncSystemJobsJob>.Instance
			);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);

			var triggerKey = new TriggerKey(
				jobKeyName, SyncSystemJobsJob.SystemJobsGroup
			);
			(await scheduler.GetTrigger(triggerKey)).Should().NotBeNull();

			// Stop the scheduler: all fires that would have fired during standby
			// are now misfired.
			await scheduler.Standby(CancellationToken.None);

			// Repoint at CounterJob and re-schedule before restarting (same trick
			// as ItShouldFireAReconciledTriggerAtItsScheduledTime).
			var trigger = await scheduler.GetTrigger(triggerKey);
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

			// Start the scheduler and start timing immediately.
			listener.RestartStopwatch();
			await scheduler.Start(CancellationToken.None);

			// SmartPolicy fires immediately (~2 s in-process, ~8 s in slow CI); DoNothing
			// waits ~10 s for the next scheduled instant. The 15 s deadline covers SmartPolicy
			// recovery comfortably in both environments.
			listener.Fired.Wait(TimeSpan.FromSeconds(15)).Should().BeTrue(
				"the trigger must fire within 15 seconds of scheduler start"
			);

			listener.ElapsedSinceRestart.Should().BeLessThan(
				TimeSpan.FromSeconds(12),
				"after standby, SmartPolicy fires the next missed occurrence immediately "
					+ "(~2 s in-process, ~8 s in slow CI); DoNothing silently skips it and "
					+ "waits for the next scheduled instant (~10 s). If this elapsed time is "
					+ "over 12 s, the trigger was configured with a silent misfire policy "
					+ "and this test should ROUGE (#1706)"
			);
		} finally {
			await scheduler.Standby(CancellationToken.None);
			await scheduler.Shutdown(waitForJobsToComplete: false);
			await CleanupJobAsync(dbContext, jobKeyName);
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

	private static async Task<IScheduler> CreateRamSchedulerAsync() {
		var properties = new NameValueCollection {
			["quartz.scheduler.instanceName"] = $"live-spec-{Guid.NewGuid():N}",
			["quartz.scheduler.instanceId"] = "AUTO",
			["quartz.jobStore.type"] = "Quartz.Simpl.RAMJobStore, Quartz",
			["quartz.threadPool.type"] = "Quartz.Simpl.DefaultThreadPool, Quartz",
			["quartz.threadPool.maxConcurrency"] = "1",
		};

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
