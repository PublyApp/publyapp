using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Jobs.Jobs;

public sealed class SystemJobOccurrenceRetentionHandlerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public SystemJobOccurrenceRetentionHandlerSpec(ApiFixture fixture) {
		_Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldDeleteOccurrencesOlderThanTheRetentionWindowAndKeepRecentOnes() {
		var retentionDays = AppEnvironment.Instance.SYSTEM_JOB_OCCURRENCE_RETENTION_DAYS;
		var marker = $"spec.occurrence-retention.{Guid.NewGuid():N}";
		var oldKey = $"{marker}.old";
		var exactKey = $"{marker}.exact";
		var recentKey = $"{marker}.recent";
		await using var dbContext = await _CreateDbContextAsync();
		await using var transaction = await dbContext.Database.BeginTransactionAsync();

		try {
			await _InsertOccurrenceAsync(dbContext, oldKey, retentionDays, secondsOffset: 1);
			await _InsertOccurrenceAsync(dbContext, exactKey, retentionDays);
			await _InsertOccurrenceAsync(dbContext, recentKey, days: 1);

			var handler = new SystemJobOccurrenceRetentionHandler(
				dbContext, NullLogger<SystemJobOccurrenceRetentionHandler>.Instance
			);
			var first = await handler.HandleAsync(_FakeContext(handler.JobType), CancellationToken.None);
			var second = await handler.HandleAsync(_FakeContext(handler.JobType), CancellationToken.None);

			first.Should().BeOfType<JobOutcome.Success>();
			second.Should().BeOfType<JobOutcome.Success>();
			(await _ExistsAsync(dbContext, oldKey)).Should().BeFalse();
			(await _ExistsAsync(dbContext, exactKey)).Should().BeTrue(
				"the strict less-than predicate keeps the exact horizon"
			);
			(await _ExistsAsync(dbContext, recentKey)).Should().BeTrue();
		} finally {
			await transaction.RollbackAsync();
		}
	}

	private static async Task _InsertOccurrenceAsync(
		AppDbContext dbContext,
		string jobKey,
		int days,
		int secondsOffset = 0
	) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO system_job_occurrences (job_key, scheduled_fire_at)
			VALUES (
				{jobKey},
				now() - make_interval(days => {days}, secs => {secondsOffset})
			)
			"""
		);
	}

	private static async Task<bool> _ExistsAsync(AppDbContext dbContext, string jobKey) {
		return await dbContext.Database.SqlQuery<bool>(
			$"""
			SELECT EXISTS (
				SELECT 1 FROM system_job_occurrences WHERE job_key = {jobKey}
			) AS "Value"
			"""
		).SingleAsync();
	}

	private static JobContext _FakeContext(string jobType) {
		return new JobContext {
			JobId = Guid.NewGuid(),
			JobType = jobType,
			Payload = "{}",
			Attempts = 0,
			MaxAttempts = 10,
		};
	}

	private async Task<AppDbContext> _CreateDbContextAsync() {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options
		);
	}
}
