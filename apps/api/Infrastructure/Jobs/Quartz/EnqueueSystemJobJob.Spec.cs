using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

public sealed class EnqueueSystemJobJobSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public EnqueueSystemJobJobSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldEnqueueExactlyOnceWhenFiredTwiceForTheSameScheduledInstant() {
		var jobKey = NewJobKey("same-tick");
		var epoch = Guid.NewGuid();
		var scheduledFireAt = DateTime.UtcNow.AddMinutes(1);

		try {
			await SeedDefinitionAsync(jobKey, epoch);
			await using var dbContext = await CreateDbContextAsync();
			var job = NewJob(dbContext);

			await job.EnqueueOccurrenceAsync(
				jobKey, scheduledFireAt, epoch, CancellationToken.None
			);
			await job.EnqueueOccurrenceAsync(
				jobKey, scheduledFireAt, epoch, CancellationToken.None
			);

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey)).Should().Be(1);
			(await verify.SystemJobOccurrence.CountAsync(row => row.JobKey == jobKey))
				.Should().Be(1);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldEnqueueAgainForADistinctScheduledInstant() {
		var jobKey = NewJobKey("distinct-tick");
		var epoch = Guid.NewGuid();
		var firstFireAt = DateTime.UtcNow.AddMinutes(1);
		var secondFireAt = firstFireAt.AddMinutes(5);

		try {
			await SeedDefinitionAsync(jobKey, epoch);
			await using var dbContext = await CreateDbContextAsync();
			var job = NewJob(dbContext);

			await job.EnqueueOccurrenceAsync(jobKey, firstFireAt, epoch, CancellationToken.None);
			await job.EnqueueOccurrenceAsync(jobKey, secondFireAt, epoch, CancellationToken.None);

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey)).Should().Be(2);
			(await verify.SystemJobOccurrence.CountAsync(row => row.JobKey == jobKey))
				.Should().Be(2);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldNotResurrectAnOccurrenceAfterItsQueueRowIsDeleted() {
		var jobKey = NewJobKey("durable");
		var epoch = Guid.NewGuid();
		var scheduledFireAt = DateTime.UtcNow.AddMinutes(1);

		try {
			await SeedDefinitionAsync(jobKey, epoch);
			await using var dbContext = await CreateDbContextAsync();
			var job = NewJob(dbContext);

			await job.EnqueueOccurrenceAsync(
				jobKey, scheduledFireAt, epoch, CancellationToken.None
			);
			await dbContext.Database.ExecuteSqlAsync(
				$"DELETE FROM job_queue WHERE job_type = {jobKey}"
			);
			await job.EnqueueOccurrenceAsync(
				jobKey, scheduledFireAt, epoch, CancellationToken.None
			);

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey)).Should().Be(0);
			(await verify.SystemJobOccurrence.CountAsync(row => row.JobKey == jobKey))
				.Should().Be(1, "the durable ledger outlives successful queue-row deletion");
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldEnqueueOnlyOnceAcrossConcurrentLeadersFiringTheSameTick() {
		var jobKey = NewJobKey("concurrent");
		var epoch = Guid.NewGuid();
		var scheduledFireAt = DateTime.UtcNow.AddMinutes(1);

		try {
			await SeedDefinitionAsync(jobKey, epoch);
			await using var firstContext = await CreateDbContextAsync();
			await using var secondContext = await CreateDbContextAsync();
			var firstJob = NewJob(firstContext);
			var secondJob = NewJob(secondContext);

			await Task.WhenAll(
				firstJob.EnqueueOccurrenceAsync(
					jobKey, scheduledFireAt, epoch, CancellationToken.None
				),
				secondJob.EnqueueOccurrenceAsync(
					jobKey, scheduledFireAt, epoch, CancellationToken.None
				)
			);

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey)).Should().Be(1);
			(await verify.SystemJobOccurrence.CountAsync(row => row.JobKey == jobKey))
				.Should().Be(1);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldRecordEnqueuedJobIdOnTheOccurrenceRow() {
		var jobKey = NewJobKey("link");
		var epoch = Guid.NewGuid();
		var scheduledFireAt = DateTime.UtcNow.AddMinutes(1);

		try {
			await SeedDefinitionAsync(jobKey, epoch);
			await using var dbContext = await CreateDbContextAsync();
			await NewJob(dbContext).EnqueueOccurrenceAsync(
				jobKey, scheduledFireAt, epoch, CancellationToken.None
			);

			await using var verify = await CreateDbContextAsync();
			var queueRow = await verify.JobQueue.SingleAsync(row => row.JobType == jobKey);
			var occurrence = await verify.SystemJobOccurrence
				.SingleAsync(row => row.JobKey == jobKey);
			occurrence.EnqueuedJobId.Should().Be(queueRow.Id);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldLeaveNoLedgerRowWhenTheEnqueueTransactionRollsBack() {
		var jobKey = NewJobKey("rollback");
		var epoch = Guid.NewGuid();
		var scheduledFireAt = DateTime.UtcNow.AddMinutes(1);

		try {
			await SeedDefinitionAsync(jobKey, epoch);
			await using var dbContext = await CreateDbContextAsync(
				new ThrowBeforeSaveChangesInterceptor()
			);
			var act = async () => await NewJob(dbContext).EnqueueOccurrenceAsync(
				jobKey, scheduledFireAt, epoch, CancellationToken.None
			);

			await act.Should().ThrowAsync<InvalidOperationException>()
				.WithMessage("forced enqueue failure");

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey)).Should().Be(0);
			(await verify.SystemJobOccurrence.CountAsync(row => row.JobKey == jobKey))
				.Should().Be(0, "the occurrence insert rolls back with the queue insert");
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	[Fact]
	public async Task ItShouldRejectARetiredEpochAndEnqueueTheCurrentEpoch() {
		var jobKey = NewJobKey("epoch");
		var retiredEpoch = Guid.NewGuid();
		var currentEpoch = Guid.NewGuid();
		var logger = new CaptureLogger<EnqueueSystemJobJob>();

		try {
			await SeedDefinitionAsync(jobKey, currentEpoch);
			await using var dbContext = await CreateDbContextAsync();
			var job = new EnqueueSystemJobJob(dbContext, logger);

			await job.EnqueueOccurrenceAsync(
				jobKey, DateTime.UtcNow.AddMinutes(1), retiredEpoch, CancellationToken.None
			);
			await job.EnqueueOccurrenceAsync(
				jobKey, DateTime.UtcNow.AddMinutes(2), currentEpoch, CancellationToken.None
			);

			await using var verify = await CreateDbContextAsync();
			(await verify.JobQueue.CountAsync(row => row.JobType == jobKey)).Should().Be(1);
			(await verify.SystemJobOccurrence.CountAsync(row => row.JobKey == jobKey))
				.Should().Be(1, "a rejected stale fire must not claim an occurrence");
			logger.Messages.Should().Contain(message =>
				message.Contains("system_job.fire_rejected", StringComparison.Ordinal)
			);
		} finally {
			await CleanupAsync(jobKey);
		}
	}

	private static EnqueueSystemJobJob NewJob(AppDbContext dbContext) {
		return new EnqueueSystemJobJob(
			dbContext, NullLogger<EnqueueSystemJobJob>.Instance
		);
	}

	private async Task SeedDefinitionAsync(string jobKey, Guid scheduleEpoch) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.SystemJobDefinition.AddAsync(new SystemJobDefinition {
			JobKey = jobKey,
			CronExpression = "0 0/5 * * * ?",
			ScheduleEpoch = scheduleEpoch,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task CleanupAsync(string jobKey) {
		await using var dbContext = await CreateDbContextAsync();
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

	private static string NewJobKey(string suffix) {
		return $"spec.system-job.{suffix}.{Guid.NewGuid():N}";
	}

	private async Task<AppDbContext> CreateDbContextAsync(
		SaveChangesInterceptor? interceptor = null
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

	private sealed class ThrowBeforeSaveChangesInterceptor : SaveChangesInterceptor {
		public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
			DbContextEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			throw new InvalidOperationException("forced enqueue failure");
		}
	}

	private sealed class CaptureLogger<T> : ILogger<T> {
		public List<string> Messages { get; } = [];

		public IDisposable BeginScope<TState>(TState state) where TState : notnull {
			return EmptyScope.Instance;
		}

		public bool IsEnabled(LogLevel logLevel) {
			return true;
		}

		public void Log<TState>(
			LogLevel logLevel,
			EventId eventId,
			TState state,
			Exception? exception,
			Func<TState, Exception?, string> formatter
		) {
			Messages.Add(formatter(state, exception));
		}
	}

	private sealed class EmptyScope : IDisposable {
		public static EmptyScope Instance { get; } = new();

		public void Dispose() { }
	}
}
