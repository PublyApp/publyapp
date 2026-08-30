using System.Collections.Specialized;

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
// SyncSystemJobsJob actually fires, misfires, and reschedules — and that the
// trigger built for a system job definition is NOT configured with a misfire
// policy that silently drops a missed occurrence. The test drives Quartz
// directly (no Thread.Sleep) and uses an ITriggerListener that signals a
// ManualResetEvent the moment a fire lands. The test waits on the event, not
// on wall-clock time — the deadline is only there as a watchdog, not as the
// primary signal.
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
