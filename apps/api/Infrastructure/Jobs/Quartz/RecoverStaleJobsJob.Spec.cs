using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

// Drives RecoverStaleJobsJob.RecoverAsync directly (public-methods-for-determinism).
// The load-bearing regression here is FENCING: recovery must clear lock_token along
// with the lease — resetting only status/locked_until would leave the expired owner's
// token valid, letting a worker that lost its lease still satisfy the
// fencing-conditioned Try*Async transitions and delete/requeue a row it no longer owns.
public sealed class RecoverStaleJobsJobSpec : IClassFixture<ApiFixture> {
	private const string JobType = "recover-spec-job";

	private readonly ApiFixture _fixture;

	public RecoverStaleJobsJobSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldFenceOutTheExpiredOwnerWhenRecoveringAStaleRow() {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM job_queue;");

		// A worker claims the row, then "crashes": the negative lease puts
		// locked_until in the past immediately, with the claim's real fencing token.
		var row = new JobQueueItem { JobType = JobType };
		await dbContext.JobQueue.AddAsync(row);
		await dbContext.SaveChangesAsync();
		var rowId = row.Id.GetValueOrDefault();

		var claimed = await JobQueueProcessor.ClaimBatchAsync(
			dbContext, "dead-worker", leaseSeconds: -10, batchSize: 10, CancellationToken.None
		);
		claimed.Should().ContainSingle(c => c.Id == rowId, "the seeded row must be claimed");
		var expiredOwnerToken = claimed.Single(c => c.Id == rowId).LockToken;

		// Recovery resets the row to Pending AND clears the fencing token.
		var job = new RecoverStaleJobsJob(dbContext, NullLogger<RecoverStaleJobsJob>.Instance);
		var reclaimed = await job.RecoverAsync(CancellationToken.None);
		reclaimed.Should().BeGreaterThan(0, "the expired lease must be recovered");

		await using var verifyContext = await CreateDbContextAsync();
		var recovered = await verifyContext.JobQueue.SingleAsync(j => j.Id == rowId);
		recovered.Status.Should().Be(JobQueueStatus.Pending);
		recovered.LockToken.Should().BeNull(
			"recovery must clear lock_token — a dangling token would let the expired "
			+ "owner still pass the fencing-conditioned transitions"
		);
		recovered.LockedUntil.Should().BeNull();
		recovered.LockedBy.Should().BeNull();

		// The expired owner comes back and tries to complete/requeue with its stale
		// token: every fencing-conditioned transition must affect 0 rows.
		var completedByExpiredOwner = await JobQueueProcessor.TryCompleteAsync(
			dbContext, rowId, expiredOwnerToken, CancellationToken.None
		);
		completedByExpiredOwner.Should().BeFalse(
			"an expired owner must not be able to delete a recovered row"
		);

		var requeuedByExpiredOwner = await JobQueueProcessor.TryRequeueAsync(
			dbContext, rowId, expiredOwnerToken, delaySeconds: 60, lastError: "stale",
			CancellationToken.None
		);
		requeuedByExpiredOwner.Should().BeFalse(
			"an expired owner must not be able to requeue/backoff a recovered row"
		);

		// The row survived the stale owner's attempts, untouched and claimable.
		var survivor = await verifyContext.JobQueue.AsNoTracking().SingleAsync(j => j.Id == rowId);
		survivor.Status.Should().Be(JobQueueStatus.Pending);
		survivor.Attempts.Should().Be(0, "the fenced-out requeue must not bump attempts");
	}

	[Fact]
	public async Task ItShouldNotRecoverARowWhoseLeaseIsStillLive() {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlRawAsync("DELETE FROM job_queue;");

		var row = new JobQueueItem { JobType = JobType };
		await dbContext.JobQueue.AddAsync(row);
		await dbContext.SaveChangesAsync();
		var rowId = row.Id.GetValueOrDefault();

		var claimed = await JobQueueProcessor.ClaimBatchAsync(
			dbContext, "live-worker", leaseSeconds: 300, batchSize: 10, CancellationToken.None
		);
		claimed.Should().ContainSingle(c => c.Id == rowId);
		var liveToken = claimed.Single(c => c.Id == rowId).LockToken;

		var job = new RecoverStaleJobsJob(dbContext, NullLogger<RecoverStaleJobsJob>.Instance);
		await job.RecoverAsync(CancellationToken.None);

		// A live lease is untouched: still Processing, token intact, owner can complete.
		await using var verifyContext = await CreateDbContextAsync();
		var untouched = await verifyContext.JobQueue.SingleAsync(j => j.Id == rowId);
		untouched.Status.Should().Be(JobQueueStatus.Processing);
		untouched.LockToken.Should().Be(liveToken);

		var completed = await JobQueueProcessor.TryCompleteAsync(
			dbContext, rowId, liveToken, CancellationToken.None
		);
		completed.Should().BeTrue("the live owner keeps its fencing rights");
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
