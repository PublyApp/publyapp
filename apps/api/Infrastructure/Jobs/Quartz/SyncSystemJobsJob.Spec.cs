using System.Collections.Specialized;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Jobs;

using Quartz;
using Quartz.Impl;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

// Drives SyncSystemJobsJob.ReconcileAsync directly against a real (never-started) RAM
// scheduler (public-methods-for-determinism). The load-bearing regressions: a
// definition whose cron was valid and becomes invalid must have its OLD trigger
// removed (not left firing the stale schedule forever), and one invalid row must
// never stop the remaining definitions from reconciling.
public sealed class SyncSystemJobsJobSpec : IClassFixture<ApiFixture> {
	private const string ValidCron = "0 0/5 * * * ?";
	private const string InvalidCron = "definitely-not-a-cron";

	// The template-seeded cadence of email-prepared-sends-retention (design §7.3):
	// every 10 minutes, materially under EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES.
	private const string PreparedSweepSeededCron = "0 0/10 * * * ?";

	private readonly ApiFixture _fixture;

	public SyncSystemJobsJobSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRemoveTheScheduledTriggerWhenAValidCronBecomesInvalid() {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM system_job_definitions;");
		var scheduler = await CreateRamSchedulerAsync();

		var definition = new SystemJobDefinition {
			JobKey = "flips-to-invalid",
			CronExpression = ValidCron,
		};
		await dbContext.SystemJobDefinition.AddAsync(definition);
		await dbContext.SaveChangesAsync();

		var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
		var jobKey = new JobKey("flips-to-invalid", SyncSystemJobsJob.SystemJobsGroup);

		// While valid, the definition is scheduled.
		await job.ReconcileAsync(scheduler, CancellationToken.None);
		(await scheduler.CheckExists(jobKey)).Should().BeTrue("a valid cron schedules a trigger");

		// The dashboard edit makes the cron invalid: the NEXT reconcile must remove
		// the previously-scheduled trigger, not keep firing the old schedule.
		definition.CronExpression = InvalidCron;
		await dbContext.SaveChangesAsync();

		await job.ReconcileAsync(scheduler, CancellationToken.None);
		(await scheduler.CheckExists(jobKey)).Should().BeFalse(
			"a definition whose cron became invalid must lose its old trigger"
		);
	}

	[Fact]
	public async Task ItShouldStillReconcileValidDefinitionsWhenAnotherRowHasAnInvalidCron() {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM system_job_definitions;");
		var scheduler = await CreateRamSchedulerAsync();

		// Seed the invalid row FIRST so a fail-fast regression (returning on the bad
		// row instead of skipping it) would starve the valid one behind it.
		await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
			JobKey = "broken-job",
			CronExpression = InvalidCron,
		});
		await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
			JobKey = "healthy-job",
			CronExpression = ValidCron,
		});
		await dbContext.SaveChangesAsync();

		var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
		await job.ReconcileAsync(scheduler, CancellationToken.None);

		var brokenKey = new JobKey("broken-job", SyncSystemJobsJob.SystemJobsGroup);
		var healthyKey = new JobKey("healthy-job", SyncSystemJobsJob.SystemJobsGroup);

		(await scheduler.CheckExists(brokenKey)).Should().BeFalse(
			"an invalid cron must never be scheduled"
		);
		(await scheduler.CheckExists(healthyKey)).Should().BeTrue(
			"one bad row must not stop the rest of the sync"
		);
	}

	[Fact]
	public async Task ItShouldNotDoubleEnqueueWhenAReplacedTriggerRefiresTheSameScheduledInstant() {
		var jobKeyName = $"same-cron-{Guid.NewGuid():N}";
		var epoch = Guid.NewGuid();
		var scheduledFireAt = DateTime.UtcNow.AddMinutes(1);
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
				JobKey = jobKeyName,
				CronExpression = ValidCron,
				ScheduleEpoch = epoch,
			});
			await dbContext.SaveChangesAsync();

			var syncJob = new SyncSystemJobsJob(
				dbContext, NullLogger<SyncSystemJobsJob>.Instance
			);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);
			var enqueueJob = new EnqueueSystemJobJob(
				dbContext, NullLogger<EnqueueSystemJobJob>.Instance
			);
			await enqueueJob.EnqueueOccurrenceAsync(
				jobKeyName, scheduledFireAt, epoch, CancellationToken.None
			);

			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);
			var jobDetail = await scheduler.GetJobDetail(
				new JobKey(jobKeyName, SyncSystemJobsJob.SystemJobsGroup)
			);
			jobDetail.Should().NotBeNull();
			jobDetail?.JobDataMap.GetString(EnqueueSystemJobJob.ScheduleEpochDataKey)
				.Should().Be(epoch.ToString());
			await enqueueJob.EnqueueOccurrenceAsync(
				jobKeyName, scheduledFireAt, epoch, CancellationToken.None
			);

			(await dbContext.JobQueue.CountAsync(row => row.JobType == jobKeyName))
				.Should().Be(1);
		} finally {
			await CleanupJobAsync(dbContext, jobKeyName);
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	[Fact]
	public async Task ItShouldRotateScheduleEpochWhenTheCronChangesAndStampTheReplacement() {
		var jobKeyName = $"epoch-change-{Guid.NewGuid():N}";
		var originalEpoch = Guid.NewGuid();
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			var definition = new SystemJobDefinition {
				JobKey = jobKeyName,
				CronExpression = ValidCron,
				ScheduleEpoch = originalEpoch,
			};
			await dbContext.SystemJobDefinition.AddAsync(definition);
			await dbContext.SaveChangesAsync();

			var syncJob = new SyncSystemJobsJob(
				dbContext, NullLogger<SyncSystemJobsJob>.Instance
			);
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);
			definition.CronExpression = "0 0/10 * * * ?";
			await dbContext.SaveChangesAsync();
			await syncJob.ReconcileAsync(scheduler, CancellationToken.None);

			definition.ScheduleEpoch.Should().NotBe(originalEpoch);
			var jobDetail = await scheduler.GetJobDetail(
				new JobKey(jobKeyName, SyncSystemJobsJob.SystemJobsGroup)
			);
			jobDetail.Should().NotBeNull();
			jobDetail?.JobDataMap.GetString(EnqueueSystemJobJob.ScheduleEpochDataKey)
				.Should().Be(definition.ScheduleEpoch.ToString());
		} finally {
			await CleanupJobAsync(dbContext, jobKeyName);
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// --- #865: the privacy-load-bearing sweep's schedule cannot be silently disabled ----

	// The K-3 bound, definition level: email-prepared-sends-retention deletes token-bearing
	// bytes and is the only sweep whose cadence IS the privacy control (§7.3). An operator
	// (or a bad dashboard write) flipping is_enabled=false must NOT remove its trigger:
	// the next reconcile must re-enable the row (transparent cause in a WARNING), keep it
	// scheduled, and leave every OTHER definition free to disable.
	[Fact]
	public async Task ItShouldRefuseToDisableThePrivacyLoadBearingPreparedSweepAndReEnableIt() {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			var protectedKey = EmailPreparedSendsRetentionHandler.JobKey;
			var jobKey = new JobKey(protectedKey, SyncSystemJobsJob.SystemJobsGroup);

			// Earlier tests in this class wipe system_job_definitions wholesale; restore
			// (or create) the seeded row rather than assuming anything about test order.
			await EnsureDefinitionPresentAsync(dbContext, protectedKey, PreparedSweepSeededCron);
			var definition = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.SingleAsync(d => d.JobKey == protectedKey && !d.IsDeleted);
			var originalCron = definition.CronExpression;

			var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
			await job.ReconcileAsync(scheduler, CancellationToken.None);
			(await scheduler.CheckExists(jobKey)).Should().BeTrue("the enabled sweep is scheduled");

			// The operator disables the privacy-load-bearing sweep...
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == protectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, false));

			// ...and the NEXT reconcile must refuse the silent drop: the row is re-enabled,
			// persisted, and its trigger stays live.
			await job.ReconcileAsync(scheduler, CancellationToken.None);

			(await scheduler.CheckExists(jobKey)).Should().BeTrue(
				"disabling the prepared-state retention sweep must not remove its trigger — "
				+ "the cadence is a privacy control (K-3), so residency stays bounded"
			);
			var after = await dbContext.SystemJobDefinition
				.AsNoTracking()
				.FirstAsync(d => d.JobKey == protectedKey && !d.IsDeleted);
			after.IsEnabled.Should().BeTrue(
				"the refused disable is reverted with its cause logged, not dropped silently"
			);
			after.CronExpression.Should().Be(originalCron, "only the enable flag is touched");
		} finally {
			// Restore the seeded state for other spec classes sharing this database.
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == EmailPreparedSendsRetentionHandler.JobKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, true));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// Non-vacuity twin: the guard must be keyed to the privacy-load-bearing sweep ONLY.
	// A housekeeping sweep (session cleanup carries no sensitive bytes) must remain freely
	// operator-disableable — a guard that blocks everything would break legitimate ops.
	[Fact]
	public async Task ItShouldStillHonorDisablingAHousekeepingSweep() {
		await using var dbContext = await CreateDbContextAsync();
		var scheduler = await CreateRamSchedulerAsync();

		try {
			var unprotectedKey = CleanupExpiredSessionsHandler.JobKey;
			var jobKey = new JobKey(unprotectedKey, SyncSystemJobsJob.SystemJobsGroup);

			// Same order-independence discipline as the protected-sweep spec above.
			await EnsureDefinitionPresentAsync(dbContext, unprotectedKey, ValidCron);
			var job = new SyncSystemJobsJob(dbContext, NullLogger<SyncSystemJobsJob>.Instance);
			await job.ReconcileAsync(scheduler, CancellationToken.None);
			(await scheduler.CheckExists(jobKey)).Should().BeTrue(
				"the enabled housekeeping sweep is scheduled"
			);

			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == unprotectedKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, false));
			await job.ReconcileAsync(scheduler, CancellationToken.None);

			(await scheduler.CheckExists(jobKey)).Should().BeFalse(
				"a non-privacy sweep stays operator-disableable — the guard is scoped to the "
				+ "prepared-state retention schedule only"
			);
		} finally {
			await dbContext.SystemJobDefinition
				.Where(d => d.JobKey == CleanupExpiredSessionsHandler.JobKey)
				.ExecuteUpdateAsync(s => s.SetProperty(d => d.IsEnabled, true));
			await scheduler.Shutdown(waitForJobsToComplete: false);
		}
	}

	// Earlier tests in THIS class wipe system_job_definitions wholesale and every test
	// class shares one cloned database, so the template's seeded rows cannot be assumed
	// here. Restore (or create) the exact row a test needs instead of ordering tests.
	private static async Task EnsureDefinitionPresentAsync(
		AppDbContext dbContext,
		string jobKey,
		string cron
	) {
		var definition = await dbContext.SystemJobDefinition
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(d => d.JobKey == jobKey);
		if (definition is null) {
			await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
				JobKey = jobKey,
				CronExpression = cron,
			});
		} else {
			definition.IsDeleted = false;
			definition.IsEnabled = true;
			definition.CronExpression = cron;
		}

		await dbContext.SaveChangesAsync();
	}

	// A real RAM-store scheduler; never started, since ScheduleJob/CheckExists/
	// GetJobKeys all work on a non-started scheduler and no trigger should fire here.
	private static async Task<IScheduler> CreateRamSchedulerAsync() {
		var properties = new NameValueCollection {
			["quartz.scheduler.instanceName"] = $"sync-spec-{Guid.NewGuid():N}",
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
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
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
