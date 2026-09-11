using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs.Quartz;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Specs for the staff trigger-now seam (#636). The boundary pre-reads the
// definition (unlocked), short-circuits disabled/unknown keys BEFORE the
// engine's transaction, and delegates the real enqueue to the SAME
// EnqueueOccurrenceAsync call the cron trigger uses — so every engine fence
// (epoch match, occurrence uniqueness) still applies.
public sealed class EnqueueSystemJobBoundarySpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public EnqueueSystemJobBoundarySpec(ApiFixture fixture) {
		_Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldEnqueueOneQueueRowAndOneLedgerRowForAnEnabledKey() {
		var jobKey = _NewJobKey("enabled");
		var epoch = Guid.NewGuid();

		try {
			await _SeedDefinitionAsync(jobKey, epoch, isEnabled: true);
			await using var dbContext = await _CreateDbContextAsync();
			var boundary = _NewBoundary(dbContext);

			var result = await boundary.EnqueueNowAsync(
				jobKey, CancellationToken.None
			);

			var enqueued = result.Should().BeOfType<BoundaryResult.Enqueued>()
				.Subject;
			enqueued.ScheduleEpoch.Should().Be(epoch);
			await using var verify = await _CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey))
				.Should().Be(1);
			var occurrence = await verify.SystemJobOccurrence
				.SingleAsync(row => row.JobKey == jobKey);
			occurrence.EnqueuedJobId.Should().Be(enqueued.JobId);
			occurrence.ScheduledFireAt.Should().Be(enqueued.ScheduledFireAt);
		} finally {
			await _CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnNoOpForADisabledKeyWithoutEnqueuing() {
		var jobKey = _NewJobKey("disabled");
		var epoch = Guid.NewGuid();

		try {
			await _SeedDefinitionAsync(jobKey, epoch, isEnabled: false);
			await using var dbContext = await _CreateDbContextAsync();
			var boundary = _NewBoundary(dbContext);

			var result = await boundary.EnqueueNowAsync(
				jobKey, CancellationToken.None
			);

			result.Should().BeOfType<BoundaryResult.NoOp>();
			// Verdict-r1 fix: the disabled short-circuit fires BEFORE the engine
			// transaction, so neither the ledger nor the queue is touched.
			await using var verify = await _CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey))
				.Should().Be(0);
			(await verify.SystemJobOccurrence.CountAsync(row => row.JobKey == jobKey))
				.Should().Be(0);
		} finally {
			await _CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAnUnknownKey() {
		var jobKey = _NewJobKey("unknown");

		await using var dbContext = await _CreateDbContextAsync();
		var boundary = _NewBoundary(dbContext);

		var result = await boundary.EnqueueNowAsync(
			jobKey, CancellationToken.None
		);

		result.Should().BeOfType<BoundaryResult.NotFound>();
	}

	[Fact]
	public async Task ItShouldReadTheCurrentScheduleEpoch() {
		var jobKey = _NewJobKey("epoch");
		var epoch = Guid.NewGuid();

		try {
			await _SeedDefinitionAsync(jobKey, epoch, isEnabled: true);
			await using var dbContext = await _CreateDbContextAsync();
			var boundary = _NewBoundary(dbContext);

			var result = await boundary.EnqueueNowAsync(
				jobKey, CancellationToken.None
			);

			// A default or rotated epoch would be fenced by the engine's locked
			// re-check and the result would degrade to NoOp — Enqueued proves the
			// boundary passed the CURRENT stored epoch.
			result.Should().BeOfType<BoundaryResult.Enqueued>().Which
				.ScheduleEpoch.Should().Be(epoch);
		} finally {
			await _CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldNotRotateTheScheduleEpoch() {
		var jobKey = _NewJobKey("no-rotate");
		var epoch = Guid.NewGuid();

		try {
			await _SeedDefinitionAsync(jobKey, epoch, isEnabled: true);
			var before = await _ReadScheduleEpochAsync(jobKey);
			before.Should().Be(epoch);

			await using var dbContext = await _CreateDbContextAsync();
			var boundary = _NewBoundary(dbContext);
			await boundary.EnqueueNowAsync(jobKey, CancellationToken.None);

			var after = await _ReadScheduleEpochAsync(jobKey);
			after.Should().Be(before,
				"rotation only happens on cron_updated, never on trigger-now");
		} finally {
			await _CleanupAsync(jobKey);
		}
	}

	private static EnqueueSystemJobBoundary _NewBoundary(AppDbContext dbContext) {
		return new EnqueueSystemJobBoundary(
			dbContext,
			new EnqueueSystemJobJob(
				dbContext,
				NullLogger<EnqueueSystemJobJob>.Instance
			)
		);
	}

	private async Task<Guid> _ReadScheduleEpochAsync(string jobKey) {
		await using var dbContext = await _CreateDbContextAsync();
		return await dbContext.SystemJobDefinition
			.Where(row => row.JobKey == jobKey)
			.Select(row => row.ScheduleEpoch)
			.SingleAsync();
	}

	private async Task _SeedDefinitionAsync(
		string jobKey,
		Guid scheduleEpoch,
		bool isEnabled
	) {
		await using var dbContext = await _CreateDbContextAsync();
		await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0/5 * * * ?",
			ScheduleEpoch = scheduleEpoch,
			IsEnabled = isEnabled,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task _CleanupAsync(string jobKey) {
		await using var dbContext = await _CreateDbContextAsync();
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

	private static string _NewJobKey(string suffix) {
		return $"spec.trigger-now.{suffix}.{Guid.NewGuid():N}";
	}

	private async Task<AppDbContext> _CreateDbContextAsync(
		SaveChangesInterceptor? interceptor = null
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString);
		if (interceptor is not null) {
			options.AddInterceptors(interceptor);
		}

		return new AppDbContext(options.Options);
	}
}
