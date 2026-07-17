using System.Diagnostics.Metrics;

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
// ProcessBatchAsync / ProcessOneAsync / DrainAsync / Try*Async), the same
// public-methods-for-determinism discipline the shipped outbox dispatcher used. The
// processor hosted service is NOT wired into the test host (JobsServiceRegistration
// is invoked from nowhere until 2B), so no live loop races these assertions.
//
// Isolation: every test uses UNIQUE job types (Guid-suffixed) and cleans up its own
// rows at the end (targeted deletes, never blanket table wipes), so tests never
// depend on — or destroy — each other's state even though the class shares one
// database.
public sealed class JobQueueProcessorSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public JobQueueProcessorSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	// --- claim contention (F23: ownership + counts, not "something happened") ----

	// Worker A claims inside an OPEN transaction and holds it; worker B must claim a
	// fully disjoint batch and COMPLETE before A commits — SKIP LOCKED contention
	// proven, not simulated. Counts are exact: 40 due rows, batch 20 → A gets 20,
	// B gets the other 20, union is everything seeded.
	[Fact]
	public async Task ItShouldClaimDisjointFullBatchesWhileAnotherClaimTransactionIsStillOpen() {
		var jobType = UniqueType("contention");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 40);

		try {
			await using var dbContextA = await CreateDbContextAsync();
			await using var dbContextB = await CreateDbContextAsync();

			await using var transactionA =
				await dbContextA.Database.BeginTransactionAsync();

			var claimedByA = await JobQueueProcessor.ClaimBatchAsync(
				dbContextA, "worker-a", 300, 20, CancellationToken.None
			);

			// B claims while A's transaction is still open: SKIP LOCKED must skip
			// A's uncommitted rows and complete without blocking.
			var claimedByB = await JobQueueProcessor.ClaimBatchAsync(
				dbContextB, "worker-b", 300, 20, CancellationToken.None
			);

			await transactionA.CommitAsync();

			var idsA = claimedByA.Select(c => c.Id).ToList();
			var idsB = claimedByB.Select(c => c.Id).ToList();

			idsA.Should().HaveCount(20);
			idsB.Should().HaveCount(20);
			idsA.Intersect(idsB).Should().BeEmpty();
			idsA.Concat(idsB).Should().BeEquivalentTo(seededIds);

			// Ownership (F23): each claimed row carries its claimer's token + id,
			// and the claim reports the row's job type for metrics at acquisition.
			claimedByA.Should().OnlyContain(c => c.JobType == jobType);
			var tokenA = claimedByA[0].LockToken;
			var tokenB = claimedByB[0].LockToken;
			tokenA.Should().NotBe(tokenB);

			await using var verifyContext = await CreateDbContextAsync();
			var rows = await verifyContext.JobQueue
				.Where(j => j.JobType == jobType)
				.ToListAsync();

			rows.Where(r => idsA.Contains(r.Id.GetValueOrDefault()))
				.Should().OnlyContain(r => r.LockToken == tokenA && r.LockedBy == "worker-a");
			rows.Where(r => idsB.Contains(r.Id.GetValueOrDefault()))
				.Should().OnlyContain(r => r.LockToken == tokenB && r.LockedBy == "worker-b");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- execution order (F9 regression) ------------------------------------------

	[Fact]
	public async Task ItShouldExecuteAClaimedBatchHighestPriorityFirst() {
		var jobType = UniqueType("exec-order");
		await using var seedContext = await CreateDbContextAsync();
		var ids = new Dictionary<int, Guid>();

		try {
			// Seeded in an order (1, 5, 3) that both ascending-priority and
			// insertion-order execution would get wrong.
			foreach (var priority in new[] { 1, 5, 3 }) {
				var row = NewJob(jobType, priority: priority);
				await seedContext.JobQueue.AddAsync(row);
				await seedContext.SaveChangesAsync();
				ids[priority] = row.Id.GetValueOrDefault();
			}

			var handler = new RecordingJobHandler(jobType);
			var processor = CreateProcessor(handler);

			await processor.ProcessBatchAsync(CancellationToken.None);

			handler.Handled.Should().Equal(ids[5], ids[3], ids[1]);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- lease reset + reclaim with a NEW token (F1) -------------------------------

	[Fact]
	public async Task ItShouldResetAndReclaimAProcessingRowOnlyAfterItsLeaseExpiresWithANewToken() {
		var jobType = UniqueType("reclaim");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "dead-worker");
			var originalToken = claimed.LockToken;

			// Lease still live → the stale reset must not touch it, and the
			// pending-only claim must not see it.
			await JobQueueProcessor.ResetExpiredLeasesAsync(dbContext, CancellationToken.None);
			var beforeExpiry = await JobQueueProcessor.ClaimBatchAsync(
				dbContext, "live-worker", 300, 20, CancellationToken.None
			);
			beforeExpiry.Select(c => c.Id).Should().NotContain(claimed.Id);

			await ExpireLeaseAsync(dbContext, claimed.Id);

			await JobQueueProcessor.ResetExpiredLeasesAsync(dbContext, CancellationToken.None);
			var afterExpiry = await JobQueueProcessor.ClaimBatchAsync(
				dbContext, "live-worker", 300, 20, CancellationToken.None
			);

			var reclaimed = afterExpiry.Single(c => c.Id == claimed.Id);
			reclaimed.LockToken.Should().NotBe(originalToken);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- old owner after reclaim: stale SUCCESS is fenced out (F1/F23) -------------

	[Fact]
	public async Task ItShouldRejectAStaleOwnersSuccessDeleteAfterAReclaim() {
		var jobType = UniqueType("stale-success");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimedByA = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");

			// A's lease expires; B reclaims with a fresh token.
			await ExpireLeaseAsync(dbContext, claimedByA.Id);
			await JobQueueProcessor.ResetExpiredLeasesAsync(dbContext, CancellationToken.None);
			var claimedByB = await JobQueueProcessor.ClaimBatchAsync(
				dbContext, "worker-b", 300, 20, CancellationToken.None
			);
			var tokenB = claimedByB.Single(c => c.Id == claimedByA.Id).LockToken;

			// A finishes late and tries to complete: zero rows affected, B's row
			// stands untouched.
			var staleDelete = await JobQueueProcessor.TryCompleteAsync(
				dbContext, claimedByA.Id, claimedByA.LockToken, CancellationToken.None
			);
			staleDelete.Should().BeFalse();

			await using var verifyContext = await CreateDbContextAsync();
			var row = await verifyContext.JobQueue
				.SingleAsync(j => j.Id == claimedByA.Id);
			row.LockToken.Should().Be(tokenB);
			row.LockedBy.Should().Be("worker-b");

			// B's own outcome stands.
			var currentDelete = await JobQueueProcessor.TryCompleteAsync(
				dbContext, claimedByA.Id, tokenB, CancellationToken.None
			);
			currentDelete.Should().BeTrue();
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- old owner after reclaim: stale FAILURE/requeue is fenced out (F1/F23) -----

	[Fact]
	public async Task ItShouldRejectAStaleOwnersRetryRequeueAfterAReclaim() {
		var jobType = UniqueType("stale-retry");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimedByA = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");

			await ExpireLeaseAsync(dbContext, claimedByA.Id);
			await JobQueueProcessor.ResetExpiredLeasesAsync(dbContext, CancellationToken.None);
			var claimedByB = await JobQueueProcessor.ClaimBatchAsync(
				dbContext, "worker-b", 300, 20, CancellationToken.None
			);
			var tokenB = claimedByB.Single(c => c.Id == claimedByA.Id).LockToken;

			var staleRequeue = await JobQueueProcessor.TryRequeueAsync(
				dbContext, claimedByA.Id, claimedByA.LockToken, 60,
				"stale error", CancellationToken.None
			);
			staleRequeue.Should().BeFalse();

			// B's row is untouched by the stale attempt: still Processing under B's
			// token, no attempt burned, no error written.
			await using var verifyContext = await CreateDbContextAsync();
			var row = await verifyContext.JobQueue
				.SingleAsync(j => j.Id == claimedByA.Id);
			row.Status.Should().Be(JobQueueStatus.Processing);
			row.LockToken.Should().Be(tokenB);
			row.Attempts.Should().Be(0);
			row.LastError.Should().BeNull();
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- full-batch lease survival via re-stamp + renewal (F1/F23) ------------------

	// Three slow jobs on a 2 s lease: without the per-dispatch re-stamp and lease/2
	// renewal, the batch tail would start on a spent lease. With them, every job
	// completes and nothing is reclaimed or lost.
	[Fact]
	public async Task ItShouldKeepASlowSerialBatchLeasedViaRestampAndRenewal() {
		var jobType = UniqueType("slow-batch");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 3);

		try {
			var handler = new RecordingJobHandler(jobType) {
				Delay = TimeSpan.FromSeconds(1.5)
			};
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { LeaseSeconds = 2, BatchSize = 20 },
				handler
			);

			await processor.ProcessBatchAsync(CancellationToken.None);

			handler.Handled.Should().BeEquivalentTo(seededIds);

			await using var verifyContext = await CreateDbContextAsync();
			var remaining = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == jobType);
			remaining.Should().Be(0, "every slow job completed under a renewed lease");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- renewal vs a live reclaim adversary (F1/F23, review finding 4) ------------

	// One job running LONGER than its lease (5 s work, 2 s lease) while an adversary
	// loops the genuine reclaim path (reset expired leases + claim) every 200 ms.
	// Only working lease renewal keeps the row out of the adversary's hands: if
	// renewal breaks, the lease genuinely expires, the adversary steals the row, and
	// the original owner's outcome is fenced to zero rows — failing the assertions.
	[Fact]
	public async Task ItShouldKeepARunningJobsLeaseAliveAgainstAConcurrentReclaimAdversary() {
		var jobType = UniqueType("adversary");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 1);
		var jobId = seededIds.Single();

		try {
			var started = new TaskCompletionSource(
				TaskCreationOptions.RunContinuationsAsynchronously
			);
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = async _ => {
					started.TrySetResult();
					// Runs well past the 2 s lease: only renewal keeps ownership.
					await Task.Delay(TimeSpan.FromSeconds(5));
				}
			};
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { LeaseSeconds = 2 },
				handler
			);

			// Claim first, THEN unleash the adversary: it must only ever be able to
			// take the row through the expired-lease reclaim path, never the
			// ordinary pending claim.
			var processing = processor.ProcessBatchAsync(CancellationToken.None);
			await started.Task.WaitAsync(TimeSpan.FromSeconds(10));

			using var adversaryStop = new CancellationTokenSource();
			var stolen = new List<Guid>();
			var adversary = Task.Run(async () => {
				await using var adversaryContext = await CreateDbContextAsync();

				while (!adversaryStop.IsCancellationRequested) {
					await JobQueueProcessor.ResetExpiredLeasesAsync(
						adversaryContext, CancellationToken.None
					);
					var claims = await JobQueueProcessor.ClaimBatchAsync(
						adversaryContext, "adversary", 300, 20, CancellationToken.None
					);
					stolen.AddRange(claims.Where(c => c.Id == jobId).Select(c => c.Id));

					try {
						await Task.Delay(200, adversaryStop.Token);
					} catch (OperationCanceledException) {
						return;
					}
				}
			});

			await processing;
			await adversaryStop.CancelAsync();
			await adversary;

			stolen.Should().BeEmpty("renewal must keep the running job's lease alive");
			handler.Handled.Should().Equal(jobId);

			await using var verifyContext = await CreateDbContextAsync();
			var remaining = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == jobType);
			remaining.Should().Be(
				0, "the owner's Success outcome was applied, not fenced out"
			);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- fence (not renewal luck) protects reclaimed rows (F1/F23) -----------------

	// Renewal disabled, 1 s lease: the handler is paused mid-run while a second
	// worker resets + reclaims the row and completes it. The original owner's
	// outcome must affect nothing.
	[Fact]
	public async Task ItShouldDiscardTheOriginalOwnersOutcomeWhenItsLeaseExpiredMidRun() {
		var jobType = UniqueType("fence");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 1);
		var jobId = seededIds.Single();

		try {
			var barrier = new TaskCompletionSource(
				TaskCreationOptions.RunContinuationsAsynchronously
			);
			var started = new TaskCompletionSource(
				TaskCreationOptions.RunContinuationsAsynchronously
			);
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = async _ => {
					started.TrySetResult();
					await barrier.Task;
				}
			};

			var processor = CreateProcessor(
				new JobQueueProcessorOptions {
					LeaseSeconds = 1,
					EnableLeaseRenewal = false
				},
				handler
			);

			var processing = processor.ProcessBatchAsync(CancellationToken.None);
			await started.Task.WaitAsync(TimeSpan.FromSeconds(10));

			// While the original owner is paused inside the handler, its lease
			// expires and a second worker reclaims AND completes the job.
			await using var thiefContext = await CreateDbContextAsync();
			await ExpireLeaseAsync(thiefContext, jobId);
			await JobQueueProcessor.ResetExpiredLeasesAsync(
				thiefContext, CancellationToken.None
			);
			var claimedByThief = await JobQueueProcessor.ClaimBatchAsync(
				thiefContext, "thief-worker", 300, 20, CancellationToken.None
			);
			var thiefToken = claimedByThief.Single(c => c.Id == jobId).LockToken;

			var thiefCompleted = await JobQueueProcessor.TryCompleteAsync(
				thiefContext, jobId, thiefToken, CancellationToken.None
			);
			thiefCompleted.Should().BeTrue();

			// Release the original owner; its Success outcome must be discarded by
			// the fence (zero affected rows), not resurrect or double-complete.
			barrier.TrySetResult();
			await processing.WaitAsync(TimeSpan.FromSeconds(10));

			await using var verifyContext = await CreateDbContextAsync();
			var queueCount = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == jobType);
			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == jobType);
			queueCount.Should().Be(0, "the thief completed it");
			dlqCount.Should().Be(0, "a discarded outcome must not dead-letter");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- backoff requeue (#810 class, F11) ------------------------------------------

	[Fact]
	public async Task ItShouldRequeueAsPendingWithSqlComputedBackoffWhenAHandlerFails() {
		var jobType = UniqueType("backoff");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			var handler = new RecordingJobHandler(jobType) {
				Outcome = new JobOutcome.Retry(Error: "simulated transient failure")
			};
			var processor = CreateProcessor(handler);
			var beforeAttempt = DateTime.UtcNow;

			await processor.ProcessOneAsync(item, claimed.LockToken, CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();
			var row = await verifyContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			// The #810-class contract: Pending again, fence + lease cleared, error
			// recorded, backoff in the future. Attempt 1 delay is jittered within
			// [7.5, 15] s (JobBackoff equal jitter).
			row.Status.Should().Be(JobQueueStatus.Pending);
			row.Attempts.Should().Be(1);
			row.LastError.Should().Be("simulated transient failure");
			row.LockToken.Should().BeNull();
			row.LockedUntil.Should().BeNull();
			row.LockedBy.Should().BeNull();
			row.NextAttemptAt.Should().BeAfter(beforeAttempt.AddSeconds(5));
			row.NextAttemptAt.Should().BeBefore(beforeAttempt.AddSeconds(20));

			// Unclaimable while backing off — the same claim predicate that gates
			// first runs gates retries.
			var whileBackingOff = await JobQueueProcessor.ClaimBatchAsync(
				dbContext, "worker-a", 300, 20, CancellationToken.None
			);
			whileBackingOff.Select(c => c.Id).Should().NotContain(claimed.Id);

			// Claimable once next_attempt_at passes — no lease wait involved.
			await MakeDueNowAsync(dbContext, claimed.Id);
			var afterBackoff = await JobQueueProcessor.ClaimBatchAsync(
				dbContext, "worker-a", 300, 20, CancellationToken.None
			);
			afterBackoff.Select(c => c.Id).Should().Contain(claimed.Id);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- cancellation classification (F12/F23) ---------------------------------------

	// A cancellation NOT sourced from the host token (a provider-timeout-style
	// TaskCanceledException) is a job failure: the job requeues with an attempt
	// burned, and its successful batchmate still runs — the batch is not abandoned.
	[Fact]
	public async Task ItShouldRetryAForeignCancellationAndStillProcessItsBatchmate() {
		var jobType = UniqueType("foreign-oce");
		await using var seedContext = await CreateDbContextAsync();

		try {
			// Higher priority → the throwing job runs first, proving the loop
			// survives it and reaches the batchmate.
			var cancellingJob = NewJob(jobType, priority: 10);
			var batchmate = NewJob(jobType, priority: 1);
			await seedContext.JobQueue.AddRangeAsync(cancellingJob, batchmate);
			await seedContext.SaveChangesAsync();
			var cancellingId = cancellingJob.Id.GetValueOrDefault();
			var batchmateId = batchmate.Id.GetValueOrDefault();

			var handler = new RecordingJobHandler(jobType) {
				OnHandle = context => {
					if (context.JobId == cancellingId) {
						// A cancellation from a token the engine does not own.
						throw new TaskCanceledException("provider timeout");
					}
					return Task.CompletedTask;
				}
			};
			var processor = CreateProcessor(handler);

			var result = await processor.ProcessBatchAsync(CancellationToken.None);

			result.Claimed.Should().Be(2);
			result.Dispatched.Should().Be(2);
			result.Completed.Should().Be(2, "a retry IS an applied outcome");
			handler.Handled.Should().Equal(cancellingId, batchmateId);

			await using var verifyContext = await CreateDbContextAsync();
			var requeued = await verifyContext.JobQueue
				.SingleAsync(j => j.Id == cancellingId);
			requeued.Status.Should().Be(JobQueueStatus.Pending);
			requeued.Attempts.Should().Be(1);
			requeued.LastError.Should().StartWith("TaskCanceledException");

			var batchmateGone = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == batchmateId);
			batchmateGone.Should().BeNull("the successful batchmate completed normally");

			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == jobType);
			dlqCount.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// Genuine host cancellation mid-batch — the "immediately after claim" shape: the
	// FIRST handler observes shutdown and throws, so every other claimed row is
	// still undispatched. The in-flight job is released cleanly (no attempt burned,
	// no error, no DLQ) and the undispatched batchmates are released by the batch's
	// ownership cleanup rather than left to wait out their leases (§3.6).
	[Fact]
	public async Task ItShouldReleaseInFlightAndRemainingJobsOnHostCancellationMidBatch() {
		var jobType = UniqueType("host-cancel");
		await using var seedContext = await CreateDbContextAsync();

		try {
			var first = NewJob(jobType, priority: 10);
			var second = NewJob(jobType, priority: 1);
			await seedContext.JobQueue.AddRangeAsync(first, second);
			await seedContext.SaveChangesAsync();
			var firstId = first.Id.GetValueOrDefault();

			using var hostSource = new CancellationTokenSource();
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = async context => {
					if (context.JobId == firstId) {
						// Simulates SIGTERM arriving while the handler runs: the
						// host token fires and the handler honors it.
						await hostSource.CancelAsync();
						hostSource.Token.ThrowIfCancellationRequested();
					}
				}
			};
			var processor = CreateProcessor(handler);

			var result = await processor.ProcessBatchAsync(hostSource.Token);

			result.Claimed.Should().Be(2);
			result.Dispatched.Should().Be(1, "shutdown stops dispatch after the first job");
			result.Completed.Should().Be(0, "an abandoned run applies no outcome");
			handler.Handled.Should().Equal(firstId);

			await using var verifyContext = await CreateDbContextAsync();
			var rows = await verifyContext.JobQueue
				.Where(j => j.JobType == jobType)
				.ToListAsync();

			rows.Should().HaveCount(2, "nothing is deleted or dead-lettered on shutdown");
			rows.Should().OnlyContain(r =>
				r.Status == JobQueueStatus.Pending
				&& r.Attempts == 0
				&& r.LastError == null
				&& r.LockToken == null
			);

			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == jobType);
			dlqCount.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// Host cancellation arriving after a handler has RETURNED must not discard the
	// completed work or leak the lease: the outcome is applied (row deleted) and the
	// undispatched batchmate is released to Pending (§3.6, review finding 2).
	[Fact]
	public async Task ItShouldApplyACompletedHandlersOutcomeWhenTheHostCancelsAfterItReturns() {
		var jobType = UniqueType("cancel-after-return");
		await using var seedContext = await CreateDbContextAsync();

		try {
			var first = NewJob(jobType, priority: 10);
			var second = NewJob(jobType, priority: 1);
			await seedContext.JobQueue.AddRangeAsync(first, second);
			await seedContext.SaveChangesAsync();
			var firstId = first.Id.GetValueOrDefault();
			var secondId = second.Id.GetValueOrDefault();

			using var hostSource = new CancellationTokenSource();
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = async context => {
					if (context.JobId == firstId) {
						// Shutdown fires but the handler finishes normally: its
						// Success must be applied, not thrown away.
						await hostSource.CancelAsync();
					}
				}
			};
			var processor = CreateProcessor(handler);

			var result = await processor.ProcessBatchAsync(hostSource.Token);

			result.Dispatched.Should().Be(1);
			result.Completed.Should().Be(1, "the returned outcome is applied despite shutdown");

			await using var verifyContext = await CreateDbContextAsync();
			var firstRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == firstId);
			firstRow.Should().BeNull("the completed job's Success outcome was applied");

			var secondRow = await verifyContext.JobQueue
				.SingleAsync(j => j.Id == secondId);
			secondRow.Status.Should().Be(JobQueueStatus.Pending);
			secondRow.LockToken.Should().BeNull("the undispatched batchmate was released");
			secondRow.Attempts.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- outcome taxonomy (F12) -------------------------------------------------------

	[Fact]
	public async Task ItShouldDeadLetterImmediatelyOnPermanentFailureRegardlessOfRemainingAttempts() {
		var jobType = UniqueType("permanent");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			var handler = new RecordingJobHandler(jobType) {
				Outcome = new JobOutcome.PermanentFailure("payload references a deleted entity")
			};
			var processor = CreateProcessor(handler);

			await processor.ProcessOneAsync(item, claimed.LockToken, CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == claimed.Id);
			queueRow.Should().BeNull("PermanentFailure skips retries entirely");

			var deadLetter = await verifyContext.JobDeadLetter
				.SingleAsync(d => d.OriginalJobId == claimed.Id);
			deadLetter.LastError.Should().Be("payload references a deleted entity");
			deadLetter.Attempts.Should().Be(1);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// Unknown job_type → PermanentFailure straight to the DLQ, no retries burned on
	// a job nothing can ever execute (design §5.1 dispatch).
	[Fact]
	public async Task ItShouldDeadLetterImmediatelyForAnUnknownJobType() {
		var jobType = UniqueType("unknown");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			// No handler registered at all.
			var processor = CreateProcessor();

			await processor.ProcessOneAsync(item, claimed.LockToken, CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == claimed.Id);
			queueRow.Should().BeNull();

			var deadLetter = await verifyContext.JobDeadLetter
				.SingleAsync(d => d.OriginalJobId == claimed.Id);
			deadLetter.LastError.Should().Contain("No job handler registered");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldDeadLetterImmediatelyWhenThePayloadIsMalformed() {
		var jobType = UniqueType("malformed");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var row = NewJob(jobType);
			row.Payload = """{"unexpected": "shape"}""";
			await dbContext.JobQueue.AddAsync(row);
			await dbContext.SaveChangesAsync();

			var claimed = await ClaimSingleAsync(dbContext, row);
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = context => {
					// Handler reads its payload through the canonical contract; the
					// missing required member throws JsonException.
					context.DeserializePayload<RequiredIdPayload>();
					return Task.CompletedTask;
				}
			};
			var processor = CreateProcessor(handler);

			await processor.ProcessOneAsync(row, claimed.LockToken, CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == row.Id);
			queueRow.Should().BeNull(
				"a payload that can never parse gains nothing from retries"
			);

			var deadLetter = await verifyContext.JobDeadLetter
				.SingleAsync(d => d.OriginalJobId == row.Id);
			deadLetter.LastError.Should().StartWith("JsonException");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldDeleteWithoutDeadLetterWhenAHandlerReportsCancelled() {
		var jobType = UniqueType("cancelled");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			var handler = new RecordingJobHandler(jobType) {
				Outcome = new JobOutcome.Cancelled("invitation revoked before send")
			};
			var processor = CreateProcessor(handler);

			await processor.ProcessOneAsync(item, claimed.LockToken, CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == claimed.Id);
			queueRow.Should().BeNull();

			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == jobType);
			dlqCount.Should().Be(0, "a domain no-op is not a failure");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- terminal path: hook + full envelope + rollback (F5/F16) ----------------------

	[Fact]
	public async Task ItShouldRunTheTerminalHookAndPreserveTheFullEnvelopeInTheDeadLetter() {
		var jobType = UniqueType("terminal");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var tenantId = Guid.NewGuid();
			var actorId = Guid.NewGuid();
			var row = NewJob(jobType, priority: 7);
			row.MaxAttempts = 1;
			row.IdempotencyKey = "envelope-key";
			row.TenantId = tenantId;
			row.ActorUserId = actorId;
			row.CorrelationId = "trace-abc";
			await dbContext.JobQueue.AddAsync(row);
			await dbContext.SaveChangesAsync();
			var enqueuedAt = row.CreatedAt;

			var claimed = await ClaimSingleAsync(dbContext, row);
			var handler = new RecordingJobHandler(jobType) {
				Outcome = new JobOutcome.Retry(Error: "still failing")
			};
			var processor = CreateProcessor(handler);

			await processor.ProcessOneAsync(row, claimed.LockToken, CancellationToken.None);

			handler.TerminalContexts.Should().ContainSingle(
				c => c.JobId == row.Id && c.LastError == "still failing"
			);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == row.Id);
			queueRow.Should().BeNull();

			var deadLetter = await verifyContext.JobDeadLetter
				.SingleAsync(d => d.OriginalJobId == row.Id);
			deadLetter.JobType.Should().Be(jobType);
			deadLetter.Priority.Should().Be(7);
			deadLetter.MaxAttempts.Should().Be(1);
			deadLetter.IdempotencyKey.Should().Be("envelope-key");
			deadLetter.TenantId.Should().Be(tenantId);
			deadLetter.ActorUserId.Should().Be(actorId);
			deadLetter.CorrelationId.Should().Be("trace-abc");
			deadLetter.EnqueuedAt.Should().Be(enqueuedAt);
			deadLetter.Attempts.Should().Be(1);
			deadLetter.LastError.Should().Be("still failing");
			deadLetter.LockedBy.Should().NotBeNullOrWhiteSpace();
			deadLetter.FailedAt.Should().NotBe(default);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	[Fact]
	public async Task ItShouldRollBackTheWholeTerminalStepWhenTheHookThrows() {
		var jobType = UniqueType("hook-throw");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var row = NewJob(jobType);
			row.MaxAttempts = 1;
			await dbContext.JobQueue.AddAsync(row);
			await dbContext.SaveChangesAsync();

			var claimed = await ClaimSingleAsync(dbContext, row);
			var handler = new RecordingJobHandler(jobType) {
				Outcome = new JobOutcome.Retry(Error: "will exhaust"),
				ThrowOnTerminal = true
			};
			var processor = CreateProcessor(handler);

			await processor.ProcessOneAsync(row, claimed.LockToken, CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleAsync(j => j.Id == row.Id);
			queueRow.Status.Should().Be(
				JobQueueStatus.Processing,
				"the terminal step rolled back whole; the still-leased row is "
				+ "retried whole after lease expiry"
			);

			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == jobType);
			dlqCount.Should().Be(0, "the DLQ insert rolled back with the hook");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- delete-on-success --------------------------------------------------------------

	[Fact]
	public async Task ItShouldHardDeleteTheRowWhenTheHandlerSucceeds() {
		var jobType = UniqueType("success");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			var handler = new RecordingJobHandler(jobType);
			var processor = CreateProcessor(handler);

			var result = await processor.ProcessOneAsync(
				item, claimed.LockToken, CancellationToken.None
			);

			result.Should().Be(JobQueueProcessor.JobExecutionResult.Completed);
			handler.Handled.Should().Contain(claimed.Id);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == claimed.Id);
			queueRow.Should().BeNull("success is a hard delete, never a soft delete");

			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.OriginalJobId == claimed.Id);
			dlqCount.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- metrics accounting (F21, review finding 7) -----------------------------------

	// MeterListener guard: jobs.claimed counts ownership acquisition (2 rows), and
	// every STARTED handler records a duration with its terminal outcome tag —
	// here one Success and one Retry.
	[Fact]
	public async Task ItShouldEmitClaimCountsAndPerOutcomeHandlerDurations() {
		var jobType = UniqueType("metrics");
		await using var seedContext = await CreateDbContextAsync();

		try {
			var succeeding = NewJob(jobType, priority: 10);
			var failing = NewJob(jobType, priority: 1);
			await seedContext.JobQueue.AddRangeAsync(succeeding, failing);
			await seedContext.SaveChangesAsync();
			var failingId = failing.Id.GetValueOrDefault();

			var handler = new RecordingJobHandler(jobType) {
				OnHandle = context => {
					if (context.JobId == failingId) {
						throw new InvalidOperationException("simulated failure");
					}
					return Task.CompletedTask;
				}
			};
			var processor = CreateProcessor(handler);

			long claimedCount = 0;
			var durationOutcomes = new List<string>();

			using var listener = new MeterListener();
			listener.InstrumentPublished = (instrument, meterListener) => {
				if (instrument.Meter.Name == JobsMetrics.MeterName) {
					meterListener.EnableMeasurementEvents(instrument);
				}
			};
			listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) => {
				if (instrument.Name == "jobs.claimed" && HasTag(tags, "job_type", jobType)) {
					Interlocked.Add(ref claimedCount, value);
				}
			});
			listener.SetMeasurementEventCallback<double>((instrument, _, tags, _) => {
				if (instrument.Name == "jobs.handler_duration"
					&& HasTag(tags, "job_type", jobType)) {
					var outcome = TagValue(tags, "outcome");
					if (outcome is not null) {
						lock (durationOutcomes) {
							durationOutcomes.Add(outcome);
						}
					}
				}
			});
			listener.Start();

			var result = await processor.ProcessBatchAsync(CancellationToken.None);

			result.Claimed.Should().Be(2);
			result.Dispatched.Should().Be(2);
			Interlocked.Read(ref claimedCount).Should().Be(
				2, "jobs.claimed counts ownership acquisition, not dispatch"
			);
			durationOutcomes.Should().BeEquivalentTo(
				["Success", "Retry"],
				"every started handler records a duration tagged with its outcome"
			);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- drain loop (F10/F23) --------------------------------------------------------

	[Fact]
	public async Task ItShouldDrainABacklogLargerThanOneBatchInASingleWake() {
		var jobType = UniqueType("drain");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 15);

		try {
			var handler = new RecordingJobHandler(jobType);
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { BatchSize = 5 },
				handler
			);

			// One wake: DrainAsync keeps claiming while batches come back full —
			// 3× batch size drains completely with no poll-tick waits between.
			var result = await processor.DrainAsync(CancellationToken.None);

			result.Claimed.Should().Be(15);
			result.Dispatched.Should().Be(15);
			result.Reason.Should().Be(JobQueueProcessor.DrainExitReason.Drained);
			handler.Handled.Should().BeEquivalentTo(seededIds);

			await using var verifyContext = await CreateDbContextAsync();
			var remaining = await verifyContext.JobQueue
				.CountAsync(j => j.JobType == jobType);
			remaining.Should().Be(0);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// A zero-second budget expires after the first full batch: DrainAsync must
	// report BudgetExpired (backlog remains) rather than Drained, and repeated
	// passes — exactly what ExecuteAsync does on BudgetExpired — must finish the
	// backlog without any signal/poll wait in between.
	[Fact]
	public async Task ItShouldReportBudgetExpiryWhileBacklogRemainsAndFinishOnResume() {
		var jobType = UniqueType("budget-plumbing");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 15);

		try {
			var handler = new RecordingJobHandler(jobType);
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { BatchSize = 5, DrainBudgetSeconds = 0 },
				handler
			);

			var first = await processor.DrainAsync(CancellationToken.None);
			first.Dispatched.Should().Be(5, "the zero budget expires after one full batch");
			first.Reason.Should().Be(JobQueueProcessor.DrainExitReason.BudgetExpired);

			var second = await processor.DrainAsync(CancellationToken.None);
			second.Dispatched.Should().Be(5);
			second.Reason.Should().Be(JobQueueProcessor.DrainExitReason.BudgetExpired);

			// The third full batch empties the queue, but a full batch at budget
			// expiry can't KNOW that — it must still report BudgetExpired so the
			// loop comes straight back...
			var third = await processor.DrainAsync(CancellationToken.None);
			third.Dispatched.Should().Be(5);
			third.Reason.Should().Be(JobQueueProcessor.DrainExitReason.BudgetExpired);

			// ...and only the confirming empty claim reports the queue quiet.
			var fourth = await processor.DrainAsync(CancellationToken.None);
			fourth.Dispatched.Should().Be(0);
			fourth.Reason.Should().Be(JobQueueProcessor.DrainExitReason.Drained);

			handler.Handled.Should().BeEquivalentTo(seededIds);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// End-to-end through the hosted loop: with a prohibitively long poll interval
	// (1 h) and a zero drain budget, a 3×-batch backlog can only complete if the
	// loop resumes draining immediately on BudgetExpired instead of waiting out the
	// poll. Under the old behavior this would process exactly one batch and stall.
	[Fact]
	public async Task ItShouldResumeDrainingImmediatelyAfterBudgetExpiryWithoutWaitingForThePoll() {
		var jobType = UniqueType("budget-resume");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 15);

		try {
			var handler = new RecordingJobHandler(jobType);
			var processor = CreateProcessor(
				new JobQueueProcessorOptions {
					BatchSize = 5,
					DrainBudgetSeconds = 0,
					PollSeconds = 3600
				},
				handler
			);

			await processor.StartAsync(CancellationToken.None);
			try {
				var deadline = DateTime.UtcNow.AddSeconds(30);
				while (handler.Handled.Count < 15 && DateTime.UtcNow < deadline) {
					await Task.Delay(100);
				}
			} finally {
				await processor.StopAsync(CancellationToken.None);
			}

			handler.Handled.Should().BeEquivalentTo(
				seededIds,
				"budget expiry must yield and resume, never strand due work on the poll"
			);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private sealed record RequiredIdPayload {
		public required Guid EntityId { get; init; }
	}

	private static bool HasTag(
		ReadOnlySpan<KeyValuePair<string, object?>> tags,
		string key,
		string expected
	) {
		return string.Equals(TagValue(tags, key), expected, StringComparison.Ordinal);
	}

	private static string? TagValue(
		ReadOnlySpan<KeyValuePair<string, object?>> tags,
		string key
	) {
		foreach (var tag in tags) {
			if (tag.Key == key) {
				return tag.Value as string;
			}
		}

		return null;
	}

	private static string UniqueType(string prefix) {
		return $"spec.{prefix}.{Guid.NewGuid():N}";
	}

	private static JobQueueItem NewJob(string jobType, int priority = 0) {
		return new JobQueueItem { JobType = jobType, Priority = priority };
	}

	private static async Task<List<Guid>> SeedDueJobsAsync(
		AppDbContext dbContext,
		string jobType,
		int count
	) {
		var ids = new List<Guid>();

		for (var i = 0; i < count; i++) {
			var row = NewJob(jobType);
			await dbContext.JobQueue.AddAsync(row);
			await dbContext.SaveChangesAsync();
			ids.Add(row.Id.GetValueOrDefault());
		}

		return ids;
	}

	private static async Task<JobQueueProcessor.ClaimedJob> SeedAndClaimOneAsync(
		AppDbContext dbContext,
		string jobType,
		string workerId
	) {
		var row = NewJob(jobType);
		await dbContext.JobQueue.AddAsync(row);
		await dbContext.SaveChangesAsync();

		return await ClaimSingleAsync(dbContext, row, workerId);
	}

	// Claims the given persisted row and reloads the tracked entity so it carries
	// the post-claim column values (locked_by, lock_token, …) exactly as the real
	// batch flow loads entities after claiming.
	private static async Task<JobQueueProcessor.ClaimedJob> ClaimSingleAsync(
		AppDbContext dbContext,
		JobQueueItem row,
		string workerId = "spec-worker"
	) {
		var claimed = await JobQueueProcessor.ClaimBatchAsync(
			dbContext, workerId, 300, 100, CancellationToken.None
		);

		await dbContext.Entry(row).ReloadAsync();

		return claimed.Single(c => c.Id == row.Id);
	}

	private static async Task ExpireLeaseAsync(AppDbContext dbContext, Guid jobId) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_queue SET locked_until = now() - interval '1 second'
			WHERE id = {jobId}
			"""
		);
	}

	private static async Task MakeDueNowAsync(AppDbContext dbContext, Guid jobId) {
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			UPDATE job_queue SET next_attempt_at = now() - interval '1 second'
			WHERE id = {jobId}
			"""
		);
	}

	// Targeted cleanup: only this test's unique job type, both tables.
	private async Task DeleteJobsByTypeAsync(string jobType) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_queue WHERE job_type = {jobType}"
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM job_dead_letter WHERE job_type = {jobType}"
		);
	}

	private JobQueueProcessor CreateProcessor(params IJobHandler[] handlers) {
		return CreateProcessor(new JobQueueProcessorOptions(), handlers);
	}

	private JobQueueProcessor CreateProcessor(
		JobQueueProcessorOptions options,
		params IJobHandler[] handlers
	) {
		var registrations = handlers
			.Select(h => new JobHandlerRegistration(h.JobType, _ => h))
			.ToList();

		return new JobQueueProcessor(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			new JobHandlerRegistry(registrations),
			new JobsMetrics(NullLogger<JobsMetrics>.Instance),
			NullLogger<JobQueueProcessor>.Instance,
			options
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	// A configurable fake handler: records handled job ids in order, optionally
	// delays, runs a custom body, returns a configured outcome, and records/throws
	// on the terminal hook.
	private sealed class RecordingJobHandler : IJobHandler {
		public string JobType { get; }
		public List<Guid> Handled { get; } = [];
		public List<JobContext> TerminalContexts { get; } = [];
		public JobOutcome Outcome { get; init; } = JobOutcome.Succeeded;
		public TimeSpan? Delay { get; init; }
		public Func<JobContext, Task>? OnHandle { get; init; }
		public bool ThrowOnTerminal { get; init; }

		public RecordingJobHandler(string jobType) {
			JobType = jobType;
		}

		public async Task<JobOutcome> HandleAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			Handled.Add(context.JobId);

			if (Delay is { } delay) {
				await Task.Delay(delay, cancellationToken);
			}

			if (OnHandle is { } onHandle) {
				await onHandle(context);
			}

			return Outcome;
		}

		public Task OnTerminalFailureAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			TerminalContexts.Add(context);

			if (ThrowOnTerminal) {
				throw new InvalidOperationException(
					"RecordingJobHandler: simulated terminal-hook failure"
				);
			}

			return Task.CompletedTask;
		}
	}
}
