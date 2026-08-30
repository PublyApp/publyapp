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

// Direct-invocation specs proving the C1 contract: "orphan" is a LIVE-STATE ANTI-JOIN, not
// age alone. A scratch row is swept only when its job_id is in NEITHER job_queue NOR
// job_dead_letter AND it is older than the EMAIL_PREPARED_SEND_RETENTION_DAYS floor
// (default 7). Every row uses a unique job_id so the global sweep is asserted only against
// this test's rows.
public sealed class EmailPreparedSendsRetentionHandlerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	// Read from the SAME source the handler reads (design §3.1/§7.3 — the floor is an
	// operator-adjustable env var, never a hardcoded value). Mirroring a literal 7 here
	// would let the spec keep passing against a floor the operator has since changed.
	private static readonly int SafetyFloorDays =
		AppEnvironment.Instance.EMAIL_PREPARED_SEND_RETENTION_DAYS;

	public EmailPreparedSendsRetentionHandlerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldDeleteOnlyAgedOrphansWhoseJobIsFullyResolvedKeepingTheFloorBoundary() {
		var marker = $"spec.prepared.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();

		var agedOrphan = Guid.NewGuid();
		var agedWithLiveQueueRow = Guid.NewGuid();
		var agedWithDeadLetterRow = Guid.NewGuid();
		var youngOrphan = Guid.NewGuid();
		// Exact-floor boundary orphans: 2 s younger than the floor is KEPT, 2 s older is
		// swept (strict <). The margin (>> test runtime) keeps the comparison deterministic.
		var boundaryKeptOrphan = Guid.NewGuid();
		var boundaryDeletedOrphan = Guid.NewGuid();

		try {
			await InsertPreparedSendAsync(dbContext, agedOrphan, days: 30);
			await InsertPreparedSendAsync(dbContext, agedWithLiveQueueRow, days: 30);
			await InsertPreparedSendAsync(dbContext, agedWithDeadLetterRow, days: 30);
			await InsertPreparedSendAsync(dbContext, youngOrphan, days: 1);
			await InsertPreparedSendAsync(
				dbContext, boundaryKeptOrphan, days: SafetyFloorDays, secondsOffset: -2
			);
			await InsertPreparedSendAsync(
				dbContext, boundaryDeletedOrphan, days: SafetyFloorDays, secondsOffset: 2
			);

			// A live queue row and a dead-letter row anchor two of the aged scratch rows.
			await InsertQueueRowAsync(dbContext, agedWithLiveQueueRow, marker);
			await InsertDeadLetterAsync(dbContext, agedWithDeadLetterRow, marker);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();

			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == agedOrphan))
				.Should().BeFalse("an aged, fully-resolved orphan is swept");
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == agedWithLiveQueueRow))
				.Should().BeTrue("a live job's frozen envelope is never swept, regardless of age");
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == agedWithDeadLetterRow))
				.Should().BeTrue("a dead-lettered job's envelope is retained while the DLQ row lives");
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == youngOrphan))
				.Should().BeTrue("a young orphan is protected by the retention floor");
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == boundaryKeptOrphan))
				.Should().BeTrue("an orphan at the floor is kept — the floor is strict (<)");
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == boundaryDeletedOrphan))
				.Should().BeFalse("an orphan just past the floor is swept");
		} finally {
			await CleanupAsync(
				marker,
				[
					agedOrphan, agedWithLiveQueueRow, agedWithDeadLetterRow, youngOrphan,
					boundaryKeptOrphan, boundaryDeletedOrphan
				]
			);
		}
	}

	[Fact]
	public async Task ItShouldBeIdempotentWhenRunTwice() {
		var marker = $"spec.prepared-idem.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();

		var agedOrphan = Guid.NewGuid();
		var youngOrphan = Guid.NewGuid();

		try {
			await InsertPreparedSendAsync(dbContext, agedOrphan, days: 30);
			await InsertPreparedSendAsync(dbContext, youngOrphan, days: 1);

			await RunAsync(dbContext);
			var second = await RunAsync(dbContext);
			second.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == agedOrphan))
				.Should().BeFalse();
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == youngOrphan))
				.Should().BeTrue();
		} finally {
			await CleanupAsync(marker, [agedOrphan, youngOrphan]);
		}
	}

	[Fact]
	public async Task ItShouldKeepTheOrphanAtExactlyTheFloorUnderAFrozenNowTransaction() {
		var marker = $"spec.prepared-exact.{Guid.NewGuid():N}";
		var exactCutoff = Guid.NewGuid();
		var justBeyond = Guid.NewGuid();
		await using var dbContext = await CreateDbContextAsync();

		// PostgreSQL now() == transaction_timestamp(): frozen for the whole transaction. The
		// seed and the handler's sweep run in ONE transaction, so the exact-floor orphan's
		// created_at equals the delete predicate's floor EXACTLY — proving strict < KEEPS it
		// (a <= implementation would delete it and fail this assertion). Both rows are orphans
		// (no job_queue/job_dead_letter reference), so only the age floor decides. Rolls back:
		// nothing persists, so no cross-test cleanup is needed.
		await using var transaction = await dbContext.Database.BeginTransactionAsync();
		try {
			await InsertPreparedSendAsync(dbContext, exactCutoff, days: SafetyFloorDays, secondsOffset: 0);
			await InsertPreparedSendAsync(
				dbContext, justBeyond, days: SafetyFloorDays, secondsOffset: 1
			);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			(await dbContext.EmailPreparedSend.AnyAsync(p => p.JobId == exactCutoff))
				.Should().BeTrue("an orphan at exactly the floor is kept — the floor is strict (<)");
			(await dbContext.EmailPreparedSend.AnyAsync(p => p.JobId == justBeyond))
				.Should().BeFalse("an orphan past the floor is swept in the same frozen-now txn");
		} finally {
			await transaction.RollbackAsync();
		}
	}

	// F6: the sweep must FOLLOW the configured floor, not a hardcoded 7. Driving a NON-default
	// floor (2 days) is what proves it: the discriminator is a 3-day-old orphan, which is
	// swept under a 2-day floor but WOULD be kept under the default-7 the previous specs and
	// the handler both read — so a regression that hardcodes 7 back into the handler turns
	// this assertion red. The floor is injected through the handler's test seam because
	// AppEnvironment is a process-global singleton fixed at 7 for the test host.
	[Fact]
	public async Task ItShouldSweepAgainstTheConfiguredFloorNotAHardcodedDefaultSeven() {
		const int configuredFloorDays = 2;
		var marker = $"spec.prepared-floor.{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();

		var justPastConfiguredFloor = Guid.NewGuid();  // 2 days + 2 s → swept at floor 2
		var justUnderConfiguredFloor = Guid.NewGuid(); // 2 days - 2 s → kept at floor 2
		var betweenTwoAndDefaultSeven = Guid.NewGuid(); // 3 days → swept at 2, kept at 7
		var young = Guid.NewGuid();                     // 1 day → kept under any floor >= 2

		try {
			await InsertPreparedSendAsync(
				dbContext, justPastConfiguredFloor, days: configuredFloorDays, secondsOffset: 2
			);
			await InsertPreparedSendAsync(
				dbContext, justUnderConfiguredFloor, days: configuredFloorDays, secondsOffset: -2
			);
			await InsertPreparedSendAsync(dbContext, betweenTwoAndDefaultSeven, days: 3);
			await InsertPreparedSendAsync(dbContext, young, days: 1);

			var result = await RunWithFloorAsync(dbContext, configuredFloorDays);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == justPastConfiguredFloor))
				.Should().BeFalse("an orphan just past the configured 2-day floor is swept");
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == justUnderConfiguredFloor))
				.Should().BeTrue("an orphan just under the configured 2-day floor is kept");
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == betweenTwoAndDefaultSeven))
				.Should().BeFalse(
					"a 3-day orphan is swept under a 2-day floor — it would be KEPT under the "
					+ "default 7, so this pins that the handler follows the configured value"
				);
			(await verify.EmailPreparedSend.AnyAsync(p => p.JobId == young))
				.Should().BeTrue("a 1-day orphan is under any floor of 2 or more");
		} finally {
			await CleanupAsync(
				marker,
				[justPastConfiguredFloor, justUnderConfiguredFloor, betweenTwoAndDefaultSeven, young]
			);
		}
	}

	// F6: the >= 1 startup rejection. AppEnvironment.Initialize() validates with exactly this
	// validator and throws on failure, but its constructor is private and the singleton is
	// already initialized at 7 for the test host — so exercise the same validator against a
	// zero-floor instance directly. An uninitialized object leaves every int at its default
	// (0), which is precisely the invalid 0-day floor a bad env var would produce.
	[Fact]
	public void ItShouldRejectAZeroDayRetentionFloorAtStartupValidation() {
		var zeroFloorEnvironment = (AppEnvironment)System.Runtime.CompilerServices
			.RuntimeHelpers.GetUninitializedObject(typeof(AppEnvironment));

		var result = new AppEnvironmentValidator().Validate(zeroFloorEnvironment);

		result.Errors.Should().Contain(
			failure => failure.PropertyName
					== nameof(AppEnvironment.EMAIL_PREPARED_SEND_RETENTION_DAYS)
				&& failure.ErrorMessage.Contains("between 1 and 3650", StringComparison.Ordinal),
			"a 0-day prepared-send retention floor must fail the >= 1 startup validation — "
			+ "the privacy window on token-bearing bytes cannot silently degrade to zero"
		);
	}

	// --- helpers ------------------------------------------------------------------------

	private static async Task<JobOutcome> RunAsync(AppDbContext dbContext) {
		var handler = new EmailPreparedSendsRetentionHandler(
			dbContext, NullLogger<EmailPreparedSendsRetentionHandler>.Instance
		);
		return await handler.HandleAsync(FakeContext(handler.JobType), CancellationToken.None);
	}

	private static async Task<JobOutcome> RunWithFloorAsync(
		AppDbContext dbContext,
		int floorDays
	) {
		var handler = new EmailPreparedSendsRetentionHandler(
			dbContext, NullLogger<EmailPreparedSendsRetentionHandler>.Instance, floorDays
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

	// prepared_at = now() - (days days + secondsOffset seconds); negative secondsOffset puts
	// the row just INSIDE (younger than) the floor.
	private static async Task InsertPreparedSendAsync(
	AppDbContext dbContext,
	Guid jobId,
	int days,
	int secondsOffset = 0
) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
				INSERT INTO email_prepared_sends
					(job_id, envelope, request_sha256, provider_idempotency_key, prepared_at)
			VALUES (
				{jobId}, {EmptyJson}::jsonb, 'sha', {jobId.ToString("N")},
				now() - make_interval(days => {days}, secs => {secondsOffset})
			)
			"""
		);
	}

	private static async Task InsertQueueRowAsync(
		AppDbContext dbContext,
		Guid jobId,
		string jobType
	) {
		await dbContext.Database.ExecuteSqlAsync(
			$"INSERT INTO job_queue (id, job_type) VALUES ({jobId}, {jobType})"
		);
	}

	private static async Task InsertDeadLetterAsync(
		AppDbContext dbContext,
		Guid originalJobId,
		string jobType
	) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO job_dead_letter
				(original_job_id, job_type, payload, priority, max_attempts, attempts,
				 enqueued_at, failed_at)
			VALUES ({originalJobId}, {jobType}, {EmptyJson}::jsonb, 0, 10, 10, now(), now())
			"""
		);
	}

	private async Task CleanupAsync(string marker, Guid[] jobIds) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM email_prepared_sends WHERE job_id = ANY({jobIds})"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {marker}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type = {marker}"
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
