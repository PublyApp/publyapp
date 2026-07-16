using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Exercises JobQueueProcessor's public methods directly (ClaimBatchAsync /
// ProcessBatchAsync / ProcessOneAsync), the same public-methods-for-determinism
// discipline the shipped InvitationEmailOutboxDispatcher uses. In Phase 2A the
// processor hosted service is NOT wired into the test host (JobsServiceRegistration is
// invoked from nowhere yet), so no live background loop races these assertions. Each
// test still truncates job_queue/job_dead_letter first for full isolation, since test
// methods in one class share a database.
public sealed class JobQueueProcessorSpec : IClassFixture<ApiFixture> {
	private const string SucceedType = "test-succeeds";
	private const string FailType = "test-always-fails";

	private readonly ApiFixture _fixture;

	public JobQueueProcessorSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// --- claim contention -------------------------------------------------------

	[Fact]
	public async Task ItShouldNeverClaimTheSameRowFromTwoConcurrentDispatchers() {
		await using var seedContext = await CreateDbContextAsync();
		await ClearJobsAsync(seedContext);

		for (var i = 0; i < 50; i++) {
			var row = JobQueueItem.Create(SucceedType);
			row.NextAttemptAt = DateTime.UtcNow;
			await seedContext.JobQueue.AddAsync(row);
		}
		await seedContext.SaveChangesAsync();

		await using var dbContextA = await CreateDbContextAsync();
		await using var dbContextB = await CreateDbContextAsync();

		var claimA = JobQueueProcessor.ClaimBatchAsync(dbContextA, "worker-a", CancellationToken.None);
		var claimB = JobQueueProcessor.ClaimBatchAsync(dbContextB, "worker-b", CancellationToken.None);
		var results = await Task.WhenAll(claimA, claimB);

		var claimedByA = results[0];
		var claimedByB = results[1];

		// FOR UPDATE SKIP LOCKED guarantees: no id appears in both claim sets.
		claimedByA.Intersect(claimedByB).Should().BeEmpty();

		// Guard against a vacuous pass: between the two claimers, something must have
		// been claimed out of the 50 seeded due rows.
		(claimedByA.Count + claimedByB.Count).Should().BeGreaterThan(0);
	}

	// --- lease-expiry reclaim ---------------------------------------------------

	[Fact]
	public async Task ItShouldReclaimAProcessingRowOnlyAfterItsLeaseHasExpired() {
		await using var dbContext = await CreateDbContextAsync();
		await ClearJobsAsync(dbContext);

		var row = JobQueueItem.Create(SucceedType);
		row.Status = JobQueueStatus.Processing;
		row.LockedBy = "dead-worker";
		row.LockedUntil = DateTime.UtcNow.AddMinutes(5);
		row.NextAttemptAt = DateTime.UtcNow.AddMinutes(-1);
		await dbContext.JobQueue.AddAsync(row);
		await dbContext.SaveChangesAsync();
		var rowId = row.Id.GetValueOrDefault();

		// Lease still valid → not reclaimable.
		var beforeExpiry = await JobQueueProcessor.ClaimBatchAsync(
			dbContext, "live-worker", CancellationToken.None
		);
		beforeExpiry.Should().NotContain(rowId);

		// Expire the lease.
		row.LockedUntil = DateTime.UtcNow.AddMinutes(-1);
		await dbContext.SaveChangesAsync();

		var afterExpiry = await JobQueueProcessor.ClaimBatchAsync(
			dbContext, "live-worker", CancellationToken.None
		);
		afterExpiry.Should().Contain(rowId);
	}

	// --- backoff requeue (#810 class) -------------------------------------------

	[Fact]
	public async Task ItShouldRequeueAsPendingWithFutureNextAttemptWhenHandlerFailsWithAttemptsRemaining() {
		await using var dbContext = await CreateDbContextAsync();
		await ClearJobsAsync(dbContext);

		var row = JobQueueItem.Create(FailType);
		// Future schedule keeps the row invisible to any claim until we drive it.
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.JobQueue.AddAsync(row);
		await dbContext.SaveChangesAsync();
		var rowId = row.Id.GetValueOrDefault();

		var processor = CreateProcessor(new RecordingJobHandler(FailType, shouldThrow: true));
		var beforeAttempt = DateTime.UtcNow;

		await processor.ProcessOneAsync(dbContext, row, CancellationToken.None);

		// The #810-class contract: Pending again, lease cleared, backoff in the future.
		row.Status.Should().Be(JobQueueStatus.Pending);
		row.Attempts.Should().Be(1);
		row.LastError.Should().NotBeNullOrWhiteSpace();
		row.LockedUntil.Should().BeNull();
		row.LockedBy.Should().BeNull();
		// Backoff for attempt 1 is 2^1 = 2 seconds.
		row.NextAttemptAt.Should().BeAfter(beforeAttempt.AddSeconds(1));
		row.NextAttemptAt.Should().BeBefore(beforeAttempt.AddSeconds(10));

		// Unclaimable before next_attempt_at: the same claim predicate that gates
		// first-run now gates the retry.
		var whileBackingOff = await JobQueueProcessor.ClaimBatchAsync(
			dbContext, "live-worker", CancellationToken.None
		);
		whileBackingOff.Should().NotContain(rowId);

		// Once next_attempt_at passes, the row is claimable again — no lease wait.
		row.NextAttemptAt = DateTime.UtcNow.AddSeconds(-1);
		await dbContext.SaveChangesAsync();

		var afterBackoff = await JobQueueProcessor.ClaimBatchAsync(
			dbContext, "live-worker", CancellationToken.None
		);
		afterBackoff.Should().Contain(rowId);
	}

	// --- dead-letter on exhaustion ----------------------------------------------

	[Fact]
	public async Task ItShouldDeadLetterAndDeleteTheRowWhenAttemptsAreExhausted() {
		await using var dbContext = await CreateDbContextAsync();
		await ClearJobsAsync(dbContext);

		var row = JobQueueItem.Create(FailType);
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		row.Attempts = JobBackoff.MaxAttempts - 1;
		await dbContext.JobQueue.AddAsync(row);
		await dbContext.SaveChangesAsync();
		var rowId = row.Id.GetValueOrDefault();

		var processor = CreateProcessor(new RecordingJobHandler(FailType, shouldThrow: true));

		await processor.ProcessOneAsync(dbContext, row, CancellationToken.None);

		await using var verifyContext = await CreateDbContextAsync();

		var queueRow = await verifyContext.JobQueue
			.SingleOrDefaultAsync(j => j.Id == rowId);
		queueRow.Should().BeNull("the exhausted job is hard-deleted from job_queue");

		var deadLetter = await verifyContext.JobDeadLetter
			.SingleAsync(d => d.OriginalJobId == rowId);
		deadLetter.JobType.Should().Be(FailType);
		deadLetter.Attempts.Should().Be(JobBackoff.MaxAttempts);
		deadLetter.LastError.Should().NotBeNullOrWhiteSpace();
	}

	// --- delete-on-success ------------------------------------------------------

	[Fact]
	public async Task ItShouldDeleteTheRowWhenTheHandlerSucceeds() {
		await using var dbContext = await CreateDbContextAsync();
		await ClearJobsAsync(dbContext);

		var row = JobQueueItem.Create(SucceedType);
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.JobQueue.AddAsync(row);
		await dbContext.SaveChangesAsync();
		var rowId = row.Id.GetValueOrDefault();

		var handler = new RecordingJobHandler(SucceedType, shouldThrow: false);
		var processor = CreateProcessor(handler);

		await processor.ProcessOneAsync(dbContext, row, CancellationToken.None);

		handler.Handled.Should().Contain(rowId);

		await using var verifyContext = await CreateDbContextAsync();
		var queueRow = await verifyContext.JobQueue.SingleOrDefaultAsync(j => j.Id == rowId);
		queueRow.Should().BeNull("a successful job is hard-deleted, never soft-deleted");

		var deadLetterCount = await verifyContext.JobDeadLetter
			.CountAsync(d => d.OriginalJobId == rowId);
		deadLetterCount.Should().Be(0);
	}

	// --- end-to-end batch: claim + dispatch + complete --------------------------

	[Fact]
	public async Task ItShouldClaimDispatchAndDeleteADueJobThroughProcessBatch() {
		await using var seedContext = await CreateDbContextAsync();
		await ClearJobsAsync(seedContext);

		var row = JobQueueItem.Create(SucceedType);
		row.NextAttemptAt = DateTime.UtcNow;
		await seedContext.JobQueue.AddAsync(row);
		await seedContext.SaveChangesAsync();
		var rowId = row.Id.GetValueOrDefault();

		var handler = new RecordingJobHandler(SucceedType, shouldThrow: false);
		var processor = CreateProcessor(handler);

		await processor.ProcessBatchAsync(CancellationToken.None);

		handler.Handled.Should().Contain(rowId);

		await using var verifyContext = await CreateDbContextAsync();
		var queueRow = await verifyContext.JobQueue.SingleOrDefaultAsync(j => j.Id == rowId);
		queueRow.Should().BeNull();
	}

	// --- batch execution order ---------------------------------------------------

	// Design §4.1/§5.1: priority DESC, then next_attempt_at, then created_at is the
	// EXECUTION order within a claimed batch, not just the claim-selection order.
	// Seeds priorities in an order (1, 5, 3) that both ascending-priority and
	// insertion-order execution would get wrong, so a regression fails loudly.
	[Fact]
	public async Task ItShouldExecuteAClaimedBatchHighestPriorityFirst() {
		await using var seedContext = await CreateDbContextAsync();
		await ClearJobsAsync(seedContext);

		var due = DateTime.UtcNow.AddSeconds(-1);
		var ids = new Dictionary<int, Guid>();

		foreach (var priority in new[] { 1, 5, 3 }) {
			var row = JobQueueItem.Create(SucceedType, priority: priority);
			row.NextAttemptAt = due;
			await seedContext.JobQueue.AddAsync(row);
			await seedContext.SaveChangesAsync();
			ids[priority] = row.Id.GetValueOrDefault();
		}

		var handler = new RecordingJobHandler(SucceedType, shouldThrow: false);
		var processor = CreateProcessor(handler);

		await processor.ProcessBatchAsync(CancellationToken.None);

		handler.Handled.Should().Equal(ids[5], ids[3], ids[1]);
	}

	// --- helpers ----------------------------------------------------------------

	private JobQueueProcessor CreateProcessor(params IJobHandler[] handlers) {
		return new JobQueueProcessor(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			new JobHandlerRegistry(handlers),
			NullLogger<JobQueueProcessor>.Instance
		);
	}

	private static async Task ClearJobsAsync(AppDbContext dbContext) {
		await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM job_queue; DELETE FROM job_dead_letter;");
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

	private sealed class RecordingJobHandler : IJobHandler {
		private readonly bool _shouldThrow;

		public string JobType { get; }
		public List<Guid> Handled { get; } = [];

		public RecordingJobHandler(string jobType, bool shouldThrow) {
			JobType = jobType;
			_shouldThrow = shouldThrow;
		}

		public Task HandleAsync(JobContext context, CancellationToken cancellationToken) {
			Handled.Add(context.JobId);

			if (_shouldThrow) {
				throw new InvalidOperationException("RecordingJobHandler: simulated handler failure");
			}

			return Task.CompletedTask;
		}
	}
}
