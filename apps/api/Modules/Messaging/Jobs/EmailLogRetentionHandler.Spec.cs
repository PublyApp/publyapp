using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Messaging.Jobs;

// Direct-invocation retention specs. Rows carry a Guid-suffixed recipient marker so the
// global age-based sweep is asserted only against this test's rows. Uses the default
// EMAIL_LOG_RETENTION_DAYS (180) and brackets the horizon with clearly-beyond / just-inside
// plus an exact-boundary pair so time passing during the test can never flip the assertion.
public sealed class EmailLogRetentionHandlerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public EmailLogRetentionHandlerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldDeleteOnlyRowsBeyondTheRetentionHorizonKeepingTheBoundaryRow() {
		var retentionDays = AppEnvironment.Instance.EMAIL_LOG_RETENTION_DAYS;
		var marker = $"retain-{Guid.NewGuid():N}@example.com";
		await using var dbContext = await CreateDbContextAsync();

		try {
			var beyond = $"beyond-{marker}";
			var justInside = $"inside-{marker}";
			var fresh = $"fresh-{marker}";
			var boundaryKept = $"bkeep-{marker}";
			var boundaryDeleted = $"bdel-{marker}";

			await InsertLogAsync(dbContext, beyond, days: retentionDays + 20);
			await InsertLogAsync(dbContext, justInside, days: retentionDays - 1);
			await InsertLogAsync(dbContext, fresh, days: 10);
			// Exact-horizon boundary (strict <): 2 s inside is KEPT, 2 s beyond is DELETED.
			await InsertLogAsync(dbContext, boundaryKept, days: retentionDays, secondsOffset: -2);
			await InsertLogAsync(dbContext, boundaryDeleted, days: retentionDays, secondsOffset: 2);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.EmailLog.AnyAsync(e => e.Recipient == beyond))
				.Should().BeFalse("a row well beyond the horizon is swept");
			(await verify.EmailLog.AnyAsync(e => e.Recipient == justInside))
				.Should().BeTrue("a row well within the window is kept");
			(await verify.EmailLog.AnyAsync(e => e.Recipient == fresh))
				.Should().BeTrue("a fresh row is kept");
			(await verify.EmailLog.AnyAsync(e => e.Recipient == boundaryKept))
				.Should().BeTrue("a row at the horizon is kept — the boundary is strict (<)");
			(await verify.EmailLog.AnyAsync(e => e.Recipient == boundaryDeleted))
				.Should().BeFalse("a row just past the horizon is swept");
			(await verify.EmailLog.CountAsync(e => e.Recipient.EndsWith(marker)))
				.Should().Be(3, "exactly the two beyond-horizon rows are deleted");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldBeIdempotentWhenRunTwice() {
		var retentionDays = AppEnvironment.Instance.EMAIL_LOG_RETENTION_DAYS;
		var marker = $"retain-idem-{Guid.NewGuid():N}@example.com";
		await using var dbContext = await CreateDbContextAsync();

		try {
			await InsertLogAsync(dbContext, $"old-{marker}", days: retentionDays + 20);
			await InsertLogAsync(dbContext, $"new-{marker}", days: 1);

			await RunAsync(dbContext);
			var second = await RunAsync(dbContext);
			second.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			var remaining = await verify.EmailLog.CountAsync(e => e.Recipient.EndsWith(marker));
			remaining.Should().Be(1, "only the fresh row remains after either run");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldKeepTheRowAtExactlyTheHorizonUnderAFrozenNowTransaction() {
		var retentionDays = AppEnvironment.Instance.EMAIL_LOG_RETENTION_DAYS;
		var marker = $"exact-{Guid.NewGuid():N}@example.com";
		var exactCutoff = $"exact-{marker}";
		var justBeyond = $"beyond-{marker}";
		await using var dbContext = await CreateDbContextAsync();

		// PostgreSQL now() == transaction_timestamp(): frozen for the whole transaction. The
		// seed and the handler's sweep run in ONE transaction, so the exact-cutoff row's
		// occurred_at equals the delete predicate's horizon EXACTLY — proving strict < KEEPS
		// it (a <= implementation would delete it and fail this assertion). Rolls back:
		// nothing persists, so no cross-test cleanup is needed.
		await using var transaction = await dbContext.Database.BeginTransactionAsync();
		try {
			await InsertLogAsync(dbContext, exactCutoff, days: retentionDays, secondsOffset: 0);
			await InsertLogAsync(dbContext, justBeyond, days: retentionDays, secondsOffset: 1);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			(await dbContext.EmailLog.AnyAsync(e => e.Recipient == exactCutoff))
				.Should().BeTrue("a row at exactly the horizon is kept — the boundary is strict (<)");
			(await dbContext.EmailLog.AnyAsync(e => e.Recipient == justBeyond))
				.Should().BeFalse("a row past the horizon is swept in the same frozen-now txn");
		} finally {
			await transaction.RollbackAsync();
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private static async Task<JobOutcome> RunAsync(AppDbContext dbContext) {
		var handler = new EmailLogRetentionHandler(
			dbContext, NullLogger<EmailLogRetentionHandler>.Instance
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

	// occurred_at = now() - (days days + secondsOffset seconds), set in SQL against database
	// time so the age is exact; a negative secondsOffset puts the row just INSIDE the horizon.
	private static async Task InsertLogAsync(
		AppDbContext dbContext,
		string recipient,
		int days,
		int secondsOffset = 0
	) {
		// kind=0 (TenantInvitation), outcome=0 (Submitted).
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO email_log (kind, recipient, outcome, occurred_at)
			VALUES (0, {recipient}, 0, now() - make_interval(days => {days}, secs => {secondsOffset}))
			"""
		);
	}

	private async Task CleanupAsync(string marker) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM email_log WHERE recipient LIKE {"%" + marker}"
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
