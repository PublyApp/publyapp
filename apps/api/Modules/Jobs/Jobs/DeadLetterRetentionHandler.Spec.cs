using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

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

	[Fact]
	public async Task ItShouldHoldAnUntriagedMissingRowBeyondTheHorizonAndReportIt() {
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var marker = $"spec.dlq-hold.{Guid.NewGuid():N}";
		var untriagedMissing = $"{JobDeadLetter.MissingJobTypePrefix}{marker}";
		await using var dbContext = await CreateDbContextAsync();

		try {
			// Far beyond the horizon: age alone must NEVER delete an untriaged
			// missing-anomaly row (#864/K-2) — the integrity anomaly may not age out of
			// existence and silently clear its own alert.
			await InsertDeadLetterAsync(dbContext, untriagedMissing, days: retentionDays + 20);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == untriagedMissing))
				.Should().BeTrue("an untriaged missing-anomaly row is held however old it is");

			// The skip report: the pass counts what it held back (the same predicate the
			// monitor samples for jobs.dlq.untriaged_missing).
			(await CountUntriagedMissingAsync(dbContext))
				.Should().Be(1, "the pass reports exactly the row it skipped");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldDeleteATriagedMissingRowBeyondTheHorizonLikeAnyOtherRow() {
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var marker = $"spec.dlq-triaged.{Guid.NewGuid():N}";
		var triagedMissing = $"{JobDeadLetter.MissingJobTypePrefix}{marker}";
		await using var dbContext = await CreateDbContextAsync();

		try {
			await InsertDeadLetterAsync(dbContext, triagedMissing, days: retentionDays + 20);

			// The operator acknowledgement (the #636 staff surface will produce it): once
			// someone has LOOKED at the row, retention applies again like any other row.
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE job_dead_letter
				SET triaged_at = now(), triaged_by = 'spec', triage_note = 'acknowledged'
				WHERE job_type = {triagedMissing}
				"""
			);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == triagedMissing))
				.Should().BeFalse("a triaged missing-anomaly row past the horizon is swept");
			(await CountUntriagedMissingAsync(dbContext))
				.Should().Be(0, "triage releases the row from the held set");
		} finally {
			await CleanupAsync(marker);
		}
	}

	// --- K-1 (#863): external-state exemptions ----------------------------------

	[Fact]
	public async Task ItShouldExemptPresentAndUnclassifiedRowsFromAgeRetention() {
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var marker = $"spec.dlq-k1.{Guid.NewGuid():N}";
		// All three are far beyond the horizon: only their external_state_status
		// differs. 6 Unclassified MUST be kept (issue #863's core demand), 1 Present
		// MUST be kept (effects may still exist), 0 None still sweeps.
		await using var dbContext = await CreateDbContextAsync();

		try {
			await InsertDeadLetterAsync(dbContext, $"{marker}.none", days: retentionDays + 20);
			await InsertDeadLetterAsync(
				dbContext, $"{marker}.present", days: retentionDays + 20,
				externalStateStatus: (int)ExternalStateStatus.Present
			);
			await InsertDeadLetterAsync(
				dbContext, $"{marker}.unclassified", days: retentionDays + 20,
				externalStateStatus: (int)ExternalStateStatus.Unclassified
			);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == $"{marker}.none"))
				.Should().BeFalse("status 0 None stays plain age-retention eligible and is swept");
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == $"{marker}.present"))
				.Should().BeTrue("status 1 Present is exempt from age retention");
			(await verify.JobDeadLetter.AnyAsync(d => d.JobType == $"{marker}.unclassified"))
				.Should().BeTrue("status 6 Unclassified has a resolution path and is exempt");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldReportSkippedExemptRowCountWhenSweepEncountersExemptRows() {
		var retentionDays = AppEnvironment.Instance.JOB_DEAD_LETTER_RETENTION_DAYS;
		var marker = $"spec.dlq-skip.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();

		try {
			// Two exempt rows beyond the horizon + one non-exempt row beyond it.
			await InsertDeadLetterAsync(
				dbContext, $"{marker}.a", days: retentionDays + 20,
				externalStateStatus: (int)ExternalStateStatus.Unclassified
			);
			await InsertDeadLetterAsync(
				dbContext, $"{marker}.b", days: retentionDays + 20,
				externalStateStatus: (int)ExternalStateStatus.Present
			);
			await InsertDeadLetterAsync(dbContext, $"{marker}.c", days: retentionDays + 20);

			var logger = new CapturingLogger();
			var handler = new DeadLetterRetentionHandler(dbContext, logger);
			var result = await handler.HandleAsync(FakeContext(handler.JobType), CancellationToken.None);
			result.Should().BeOfType<JobOutcome.Success>();

			var skipRecord = logger.Records.FirstOrDefault(r =>
				r.Structured.ContainsKey("SkippedCount"));
			skipRecord.Should().NotBeNull(
				"the sweep must report skipped exempt counts so starvation stays visible");
			Assert.NotNull(skipRecord);
			skipRecord.Structured["SkippedCount"]
				.Should().Be(2, "two exempt rows sit beyond the horizon");
		} finally {
			await CleanupAsync(marker);
		}
	}

	// --- helpers ------------------------------------------------------------------------

	/// <summary>
	/// Minimal capturing ILogger for structured-state assertions; keeps the test
	/// project free of an extra logging-test package dependency.
	/// </summary>
	public sealed class CapturingLogger : ILogger<DeadLetterRetentionHandler> {
		public sealed record LogRecord(LogLevel Level, string Formatted, Dictionary<string, object?> Structured);

		public List<LogRecord> Records { get; } = new();

		public IDisposable? BeginScope<TState>(TState state) where TState : notnull {
			return null;
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
			var structured = state is IEnumerable<KeyValuePair<string, object?>> pairs
				? new Dictionary<string, object?>(pairs)
				: new Dictionary<string, object?>();
			Records.Add(new LogRecord(logLevel, formatter(state, exception), structured));
		}
	}

	private static async Task<JobOutcome> RunAsync(AppDbContext dbContext) {
		var handler = new DeadLetterRetentionHandler(
			dbContext, NullLogger<DeadLetterRetentionHandler>.Instance
		);
		return await handler.HandleAsync(FakeContext(handler.JobType), CancellationToken.None);
	}

	// The skip-report seam (#864): how many missing-anomaly rows the sweep is holding.
	private static async Task<long> CountUntriagedMissingAsync(AppDbContext dbContext) {
		var handler = new DeadLetterRetentionHandler(
			dbContext, NullLogger<DeadLetterRetentionHandler>.Instance
		);
		return await handler.CountUntriagedMissingRowsAsync(CancellationToken.None);
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
		int secondsOffset = 0,
		int externalStateStatus = 0
	) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_dead_letter
				(original_job_id, job_type, payload, priority, max_attempts, attempts,
				 enqueued_at, failed_at, external_state_status,
				 external_state_prepared_at, external_state_expires_at)
			VALUES (
				uuidv7(), {jobType}, {EmptyJson}::jsonb, 0, 10, 10,
				now() - make_interval(days => {days + 1}),
				now() - make_interval(days => {days}, secs => {secondsOffset}),
				{externalStateStatus},
				CASE WHEN {externalStateStatus} IN (1, 2, 4, 5, 6)
					THEN now() - make_interval(days => {days}, secs => {secondsOffset})
					ELSE NULL END,
				CASE WHEN {externalStateStatus} IN (1, 2, 4, 5, 6)
					THEN now() - make_interval(days => {days - 1}, secs => {secondsOffset})
					ELSE NULL END
			)
			"""
		);
	}

	private async Task CleanupAsync(string marker) {
		await using var dbContext = await CreateDbContextAsync();

		// Wildcards on BOTH sides: missing-anomaly rows embed the marker AFTER the
		// reserved "jobs.missing." prefix, which a suffix-only pattern would miss.
		var pattern = $"%{marker}%";
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type LIKE {pattern}"
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
