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

// Direct-invocation retention specs for job_dead_letter. Rows carry a Guid-suffixed
// job_type marker so the global age-based sweep is asserted only against this test's rows.
public sealed class DeadLetterRetentionHandlerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public DeadLetterRetentionHandlerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldDeleteOnlyRowsBeyondTheRetentionHorizonKeepingTheBoundaryRow() {
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var marker = $"spec.dlq-retain.{Guid.NewGuid():N}";
		var beyond = $"{marker}.beyond";
		var inside = $"{marker}.inside";
		var boundaryKept = $"{marker}.boundary-keep";
		var boundaryDeleted = $"{marker}.boundary-del";
		await using var dbContext = await CreateDbContextAsync();

		try {
			await InsertDeadLetterAsync(dbContext, beyond, days: retentionDays + 20);
			await InsertDeadLetterAsync(dbContext, inside, days: 5);
			// Exact-horizon boundary (strict <): 2 s inside the horizon is KEPT, 2 s beyond
			// is DELETED. The margin (>> test runtime) makes the strict comparison
			// deterministic against database-time advance.
			await InsertDeadLetterAsync(dbContext, boundaryKept, days: retentionDays, secondsOffset: -2);
			await InsertDeadLetterAsync(dbContext, boundaryDeleted, days: retentionDays, secondsOffset: 2);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == beyond))
				.Should().BeFalse("a row well beyond the horizon is swept");
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == inside))
				.Should().BeTrue("a row well within the window is kept");
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == boundaryKept))
				.Should().BeTrue("a row at the horizon is kept — the boundary is strict (<)");
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == boundaryDeleted))
				.Should().BeFalse("a row just past the horizon is swept");
			(await verify.JobDeadLetter.CountAsync(d => d.JobType.StartsWith(marker)))
				.Should().Be(2, "exactly the two beyond-horizon rows are deleted");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldBeIdempotentWhenRunTwice() {
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var marker = $"spec.dlq-idem.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();

		try {
			await InsertDeadLetterAsync(dbContext, marker, days: retentionDays + 20);
			await InsertDeadLetterAsync(dbContext, marker, days: 1);

			await RunAsync(dbContext);
			var second = await RunAsync(dbContext);
			second.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			var remaining = await verify.JobDeadLetter.CountAsync(d => d.JobType == marker);
			remaining.Should().Be(1, "only the fresh row remains after either run");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldKeepTheRowAtExactlyTheHorizonUnderAFrozenNowTransaction() {
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var marker = $"spec.dlq-exact.{Guid.NewGuid():N}";
		var exactCutoff = $"{marker}.exact";
		var justBeyond = $"{marker}.beyond";
		await using var dbContext = await CreateDbContextAsync();

		// PostgreSQL now() == transaction_timestamp(): frozen for the whole transaction. The
		// seed and the handler's sweep run in ONE transaction, so the exact-cutoff row's
		// failed_at equals the delete predicate's horizon EXACTLY — proving strict < KEEPS it
		// (a <= implementation would delete it and fail this assertion). Rolls back: nothing
		// persists, so no cross-test cleanup is needed.
		await using var transaction = await dbContext.Database.BeginTransactionAsync();
		try {
			await InsertDeadLetterAsync(dbContext, exactCutoff, days: retentionDays, secondsOffset: 0);
			await InsertDeadLetterAsync(dbContext, justBeyond, days: retentionDays, secondsOffset: 1);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			(await dbContext.JobDeadLetter.AnyAsync(d => d.JobType == exactCutoff))
				.Should().BeTrue("a row at exactly the horizon is kept — the boundary is strict (<)");
			(await dbContext.JobDeadLetter.AnyAsync(d => d.JobType == justBeyond))
				.Should().BeFalse("a row past the horizon is swept in the same frozen-now txn");
		} finally {
			await transaction.RollbackAsync();
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private static async Task<JobOutcome> RunAsync(AppDbContext dbContext) {
		var handler = new DeadLetterRetentionHandler(
			dbContext, NullLogger<DeadLetterRetentionHandler>.Instance
		);
		return await handler.HandleAsync(FakeContext(handler.JobType), CancellationToken.None);
	}

	private static JobContext FakeContext(string jobType) {
		return new JobContext {
			JobId = Guid.NewGuid(),
			JobType = jobType,
			Payload = "{}",
			Attempts = 0,
			MaxAttempts = 10,
		};
	}

	private const string EmptyJson = "{}";

	// failed_at = now() - (days days + secondsOffset seconds); a negative secondsOffset
	// puts the row just INSIDE the horizon, a positive one just beyond it.
	private static async Task InsertDeadLetterAsync(
		AppDbContext dbContext,
		string jobType,
		int days,
		int secondsOffset = 0
	) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_dead_letter
				(original_job_id, job_type, payload, priority, max_attempts, attempts,
				 enqueued_at, failed_at)
			VALUES (
				uuidv7(), {jobType}, {EmptyJson}::jsonb, 0, 10, 10,
				now() - make_interval(days => {days + 1}),
				now() - make_interval(days => {days}, secs => {secondsOffset})
			)
			"""
		);
	}

	private async Task CleanupAsync(string marker) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type LIKE {marker + "%"}"
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
