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

// Drives SyncSystemJobsJob.ReconcileAsync directly against a real (never-started) RAM
// scheduler (public-methods-for-determinism). The load-bearing regressions: a
// definition whose cron was valid and becomes invalid must have its OLD trigger
// removed (not left firing the stale schedule forever), and one invalid row must
// never stop the remaining definitions from reconciling.
public sealed class SyncSystemJobsJobSpec : IClassFixture<ApiFixture> {
	private const string ValidCron = "0 0/5 * * * ?";
	private const string InvalidCron = "definitely-not-a-cron";

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
}
