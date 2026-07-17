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

	// Three slow jobs (3.5 s each) on a 6 s lease: the batch tail starts at t≈7 s,
	// past the lease the claim took at t=0, so without the per-dispatch re-stamp and
	// the lease/2 renewal it would run on a spent lease. With them, every job
	// completes and nothing is reclaimed or lost.
	//
	// The lease is 6 s rather than 2 s because the spec's own safety margin —
	// max(2 s, lease/20), §5.1/R2-4 — makes any lease at or below 2 s unusable by
	// construction: there is no interval left in which to renew with a margin. The
	// handler delay is raised to keep the tail past the lease, so the test still
	// proves what its name claims.
	[Fact]
	public async Task ItShouldKeepASlowSerialBatchLeasedViaRestampAndRenewal() {
		var jobType = UniqueType("slow-batch");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 3);

		try {
			var handler = new RecordingJobHandler(jobType) {
				Delay = TimeSpan.FromSeconds(3.5)
			};
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { LeaseSeconds = 6, BatchSize = 20 },
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

	// One job running LONGER than its lease (8 s work, 6 s lease) while an adversary
	// loops the genuine reclaim path (reset expired leases + claim) every 200 ms.
	// Only working lease renewal keeps the row out of the adversary's hands: if
	// renewal breaks, the lease genuinely expires at t≈6 s, the adversary steals the
	// row within 200 ms, and the original owner's outcome is fenced to zero rows —
	// failing the assertions. (Lease 6 s, not 2 s: see the slow-batch spec above —
	// §5.1's max(2 s, lease/20) margin leaves a 2 s lease no room to renew at all.)
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
					// Runs well past the 6 s lease: only renewal keeps ownership.
					await Task.Delay(TimeSpan.FromSeconds(8));
				}
			};
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { LeaseSeconds = 6 },
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

			// Settlement honesty (review): the fenced zero-row transition must be
			// visible both in the batch accounting (Completed stays 0) and as a
			// jobs.lease_lost measurement.
			long leaseLostCount = 0;
			using var listener = new MeterListener();
			listener.InstrumentPublished = (instrument, meterListener) => {
				if (instrument.Meter.Name == JobsMetrics.MeterName) {
					meterListener.EnableMeasurementEvents(instrument);
				}
			};
			listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) => {
				if (instrument.Name == "jobs.lease_lost" && HasTag(tags, "job_type", jobType)) {
					Interlocked.Add(ref leaseLostCount, value);
				}
			});
			listener.Start();

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
			var batchResult = await processing.WaitAsync(TimeSpan.FromSeconds(10));

			// The fenced transition is NOT a completion: the batch reports the
			// dispatch but no confirmed settlement, and lease loss is measured.
			batchResult.Dispatched.Should().Be(1);
			batchResult.Completed.Should().Be(
				0, "a fenced zero-row transition must never count as Completed"
			);
			Interlocked.Read(ref leaseLostCount).Should().BeGreaterThan(0);

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

	// A registration whose handler declares a DIFFERENT JobType is a pure config
	// error: it must dead-letter immediately (never burn retries) — and the same
	// drift is also caught eagerly at registry build when DI constructs it (see
	// JobHandlerRegistrySpec); this covers the runtime defense-in-depth path.
	[Fact]
	public async Task ItShouldDeadLetterImmediatelyOnRegistrationJobTypeDrift() {
		var jobType = UniqueType("drift");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			// Handler declares a different type than it was registered under; built
			// without a scope factory so the eager guard is bypassed on purpose.
			var driftedHandler = new RecordingJobHandler(UniqueType("other"));
			var registry = new JobHandlerRegistry([
				new JobHandlerRegistration(jobType, _ => driftedHandler)
			]);
			var instance = new JobWorkerInstance();
			var processor = new JobQueueProcessor(
				_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
				registry,
				new JobsMetrics(instance, NullLogger<JobsMetrics>.Instance),
				instance,
				NullLogger<JobQueueProcessor>.Instance
			);

			var result = await processor.ProcessOneAsync(
				item, claimed.LockToken, CancellationToken.None
			);

			result.Should().Be(JobQueueProcessor.JobExecutionResult.Completed);
			driftedHandler.Handled.Should().BeEmpty("a drifted handler must never run the job");
			driftedHandler.TerminalContexts.Should().BeEmpty(
				"nor should its terminal hook run for a job that was never its own"
			);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == claimed.Id);
			queueRow.Should().BeNull("configuration drift skips retries entirely");

			var deadLetter = await verifyContext.JobDeadLetter
				.SingleAsync(d => d.OriginalJobId == claimed.Id);
			deadLetter.LastError.Should().Contain("configuration drift");
			deadLetter.Attempts.Should().Be(1);
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

	// §5.1's invalid-before-handler settlement (R6-4/O21) — the #810 regression guard.
	// A payload that can never parse means no handler was legitimately REACHED, even
	// though an instance had to be constructed to discover that, so the terminal hook
	// must not run. This hook throws exactly as 2C's email hook will: that hook
	// reloads its recipient from the payload's ids, and email_log.recipient is NOT
	// NULL, so a malformed payload reaching it throws.
	//
	// Before the JobDispatch restructure the guard asked "is there a handler object"
	// rather than "was a handler reached", so the hook ran here: it threw, the whole
	// terminal step rolled back, the still-leased row revived, and it dead-lettered
	// and rolled back again on every lease expiry — an infinite lease loop. The job
	// must instead go straight to the DLQ, hook untouched.
	[Fact]
	public async Task ItShouldSkipTheTerminalHookAndDeadLetterWhenThePayloadCannotParse() {
		var jobType = UniqueType("invalid-payload-hook");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var row = NewJob(jobType);
			row.Payload = """{"unexpected": "shape"}""";
			await dbContext.JobQueue.AddAsync(row);
			await dbContext.SaveChangesAsync();

			var claimed = await ClaimSingleAsync(dbContext, row);
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = context => {
					// The missing required member throws JsonException from inside a
					// live handler — the case the old guard could not see.
					context.DeserializePayload<RequiredIdPayload>();
					return Task.CompletedTask;
				},
				ThrowOnTerminal = true
			};
			var processor = CreateProcessor(handler);

			var result = await processor.ProcessOneAsync(
				row, claimed.LockToken, CancellationToken.None
			);

			result.Should().Be(
				JobQueueProcessor.JobExecutionResult.Completed,
				"the dead-letter committed; a Faulted result would mean the hook ran "
				+ "and rolled the terminal step back"
			);
			handler.TerminalContexts.Should().BeEmpty(
				"no handler was legitimately reached, so step 3 never fires"
			);

			await using var verifyContext = await CreateDbContextAsync();
			var queueRow = await verifyContext.JobQueue
				.SingleOrDefaultAsync(j => j.Id == row.Id);
			queueRow.Should().BeNull(
				"the job dead-letters once instead of reviving on every lease expiry"
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

			var result = await processor.ProcessOneAsync(
				row, claimed.LockToken, CancellationToken.None
			);

			// Settlement honesty (re-review): a rolled-back terminal step is
			// Faulted, never Completed.
			result.Should().Be(JobQueueProcessor.JobExecutionResult.Faulted);

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

			// Batch-level accounting of the same path: a second row through
			// ProcessBatchAsync (the first is still leased, so unclaimable)
			// dispatches but confirms nothing.
			var secondRow = NewJob(jobType);
			secondRow.MaxAttempts = 1;
			await dbContext.JobQueue.AddAsync(secondRow);
			await dbContext.SaveChangesAsync();

			var batchResult = await processor.ProcessBatchAsync(CancellationToken.None);
			batchResult.Dispatched.Should().Be(1);
			batchResult.Completed.Should().Be(
				0, "a Faulted terminal step must never count as Completed"
			);
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

	// --- renewal: the DB-confirmed deadline + its safety margin (§5.1, R2-4) ---------

	// The renewal statement must hand back the deadline the DATABASE wrote and the
	// database clock that computed it, because that deadline — not any app-side timer
	// — is what ResetExpiredLeasesAsync compares against when it decides the row is
	// reclaimable (F11). A bool return forces the caller to guess it.
	[Fact]
	public async Task ItShouldReturnTheDatabaseComputedDeadlineAndClockFromALeaseRenewal() {
		var jobType = UniqueType("renew-stamp");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");

			var stamp = await JobQueueProcessor.TryRenewLeaseAsync(
				dbContext, claimed.Id, claimed.LockToken, 120, CancellationToken.None
			);

			Assert.NotNull(stamp);
			(stamp.LockedUntil - stamp.DatabaseNow).Should().BeCloseTo(
				TimeSpan.FromSeconds(120),
				TimeSpan.FromMilliseconds(1),
				"both terms come from the same statement's now(), so the confirmed "
				+ "window is exactly the lease — measured entirely in database time"
			);

			await using var verifyContext = await CreateDbContextAsync();
			var row = await verifyContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);
			row.LockedUntil.Should().Be(
				stamp.LockedUntil, "the returned deadline is the one the row carries"
			);

			// A stale fence renews nothing and says so — the confirmed-loss signal.
			var fenced = await JobQueueProcessor.TryRenewLeaseAsync(
				dbContext, claimed.Id, Guid.NewGuid(), 120, CancellationToken.None
			);
			fenced.Should().BeNull();
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// The margin must point the RIGHT way: cancellation lands BEFORE the row becomes
	// reclaimable, never after. A 2 s lease has a 2 s margin — max(2 s, lease/20) —
	// so its safe interval is zero and ownership must be abandoned at once, while the
	// row is still leased.
	//
	// Under the old local-stopwatch loop this test hangs instead: the stopwatch was
	// started AFTER the database had already stamped now() + lease, it was compared
	// against a FULL lease window with no margin at all, and that comparison only ran
	// inside the renewal's catch — so a renewal that kept succeeding (as it does here)
	// meant the deadline was never evaluated and the handler ran on forever.
	[Fact]
	public async Task ItShouldCancelTheHandlerBeforeTheRowIsReclaimableWhenTheLeaseLeavesNoSafetyMargin() {
		var jobType = UniqueType("no-margin");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			// Would outlive any lease; only the deadline timer stops it.
			var handler = new RecordingJobHandler(jobType) {
				Delay = TimeSpan.FromSeconds(30)
			};
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { LeaseSeconds = 2 },
				handler
			);

			var result = await processor
				.ProcessOneAsync(item, claimed.LockToken, CancellationToken.None)
				.WaitAsync(TimeSpan.FromSeconds(20));

			result.Should().Be(
				JobQueueProcessor.JobExecutionResult.LeaseLost,
				"a lease with no safe interval left is abandoned, not assumed"
			);

			await using var verifyContext = await CreateDbContextAsync();
			(await IsStillLeasedAsync(verifyContext, claimed.Id)).Should().BeTrue(
				"the handler must be cancelled while the row is still ours — a margin "
				+ "that expires after the row is reclaimable is not a margin"
			);

			var dlqCount = await verifyContext.JobDeadLetter
				.CountAsync(d => d.JobType == jobType);
			dlqCount.Should().Be(0, "a discarded outcome must not dead-letter");
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- late renewal must not re-extend an abandoned lease (review R2, finding 1) ----

	// The exact interleaving the review named. A renewal UPDATE is IN FLIGHT and blocked
	// on the job row when the safe deadline fires. On the old code the renewal held only
	// stopRenewal — never leaseLostSource.Token — so it kept running past the deadline,
	// committed a later locked_until after the engine had already abandoned ownership,
	// and left the row Processing for roughly another whole lease window of postponed
	// reclaim. The blocking transaction stands in for any slow/contended renewal
	// statement; §5.1 permits a non-cooperative handler, so the loop cannot rely on the
	// handler stopping to end the command.
	//
	// Deterministic, not timing-luck: the handler is deliberately non-cooperative (it
	// ignores its token and waits on a barrier), a second connection row-locks the job
	// so the renewal statement blocks ACROSS the deadline, the ~4 s deadline (6 s lease,
	// 2 s margin) fires while it is blocked, and only THEN is the lock released. The
	// lease the row carries when the deadline wins must never be advanced afterwards.
	//
	// Red control: on the pre-fix loop finalLease jumps ~a full lease window past
	// deadlineLease ("Expected finalLease to be on or before <deadlineLease>, but it was
	// <deadlineLease + ~6s>"); the fix cancels the in-flight command at the deadline (or
	// compensates a late commit under the lock_token fence), so locked_until never
	// advances.
	[Fact]
	public async Task ItShouldNotReExtendAnAbandonedLeaseWhenARenewalCompletesAfterTheDeadline() {
		var jobType = UniqueType("late-renewal");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var claimed = await SeedAndClaimOneAsync(dbContext, jobType, "worker-a");
			var item = await dbContext.JobQueue.SingleAsync(j => j.Id == claimed.Id);

			var started = new TaskCompletionSource(
				TaskCreationOptions.RunContinuationsAsynchronously
			);
			var release = new TaskCompletionSource(
				TaskCreationOptions.RunContinuationsAsynchronously
			);
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = async _ => {
					started.TrySetResult();
					// Non-cooperative: does NOT observe the cancellation token, so the
					// renewal command is the only thing the deadline can act on.
					await release.Task;
				}
			};
			var processor = CreateProcessor(
				new JobQueueProcessorOptions { LeaseSeconds = 6 },
				handler
			);

			var processing = processor.ProcessOneAsync(
				item, claimed.LockToken, CancellationToken.None
			);
			await started.Task.WaitAsync(TimeSpan.FromSeconds(10));

			// Row-lock the job on a second connection so the renewal UPDATE (fired at
			// lease/2 ≈ 3 s) blocks and is still in flight when the deadline fires (≈4 s).
			await using var lockContext = await CreateDbContextAsync();
			await using var lockTx = await lockContext.Database.BeginTransactionAsync();
			await lockContext.Database.SqlQuery<Guid>(
				$"""SELECT id AS "Value" FROM job_queue WHERE id = {claimed.Id} FOR UPDATE"""
			).ToListAsync();

			// Past both the renewal attempt (≈3 s) and the safe deadline (≈4 s): the
			// renewal is now blocked on the row lock with the deadline already fired.
			await Task.Delay(TimeSpan.FromSeconds(5));

			// The lease the row carries at the moment the deadline has won — read on a
			// third connection (a plain SELECT does not block on FOR UPDATE). Nothing may
			// push locked_until beyond this after the deadline.
			var deadlineLease = await ReadLockedUntilAsync(claimed.Id);

			// Release the row lock: on the old code the still-running renewal now commits
			// a full fresh window; on the fixed code the command was cancelled at the
			// deadline, so nothing is left to commit.
			await lockTx.RollbackAsync();

			// Give the old code's unblocked renewal time to commit before the handler
			// returns and stopRenewal tears the loop down; a harmless no-op on the fix.
			await Task.Delay(TimeSpan.FromSeconds(1));

			release.TrySetResult();
			var result = await processing.WaitAsync(TimeSpan.FromSeconds(15));

			result.Should().Be(
				JobQueueProcessor.JobExecutionResult.LeaseLost,
				"the deadline won, so the abandoned run's outcome is discarded"
			);

			var finalLease = await ReadLockedUntilAsync(claimed.Id);
			finalLease.Should().BeOnOrBefore(
				deadlineLease,
				"a renewal that completes after the safe deadline must neither re-arm nor "
				+ "extend the abandoned lease — locked_until cannot advance once the "
				+ "deadline has won, or the row is stranded Processing for another window"
			);
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// --- requeue lineage columns (F16/C9, §4.1/§4.2) ---------------------------------

	// The columns and the FromJob copy land with the engine so Phase 4's
	// RequeueDeadLetterAsync is a pure code change. The chain is what is being
	// proven: a job that was requeued from an earlier DLQ row and dead-letters AGAIN
	// must still point back at that row, or the lineage silently ends at whichever
	// failure happened to be last.
	[Fact]
	public async Task ItShouldCarryRequeueLineageForwardWhenARequeuedJobDeadLettersAgain() {
		var jobType = UniqueType("lineage");
		await using var dbContext = await CreateDbContextAsync();

		try {
			var ancestorDeadLetterId = Guid.NewGuid();
			var row = NewJob(jobType);
			row.MaxAttempts = 1;
			row.RequeuedFromDeadLetterId = ancestorDeadLetterId;
			await dbContext.JobQueue.AddAsync(row);
			await dbContext.SaveChangesAsync();

			var claimed = await ClaimSingleAsync(dbContext, row);
			var handler = new RecordingJobHandler(jobType) {
				Outcome = new JobOutcome.Retry(Error: "still failing")
			};
			var processor = CreateProcessor(handler);

			await processor.ProcessOneAsync(row, claimed.LockToken, CancellationToken.None);

			await using var verifyContext = await CreateDbContextAsync();
			var deadLetter = await verifyContext.JobDeadLetter
				.SingleAsync(d => d.OriginalJobId == row.Id);

			deadLetter.RequeuedFromDeadLetterId.Should().Be(
				ancestorDeadLetterId, "FromJob copies the chain forward (§4.2)"
			);
			deadLetter.RequeuedAsJobId.Should().BeNull("the requeue OUT pair is Phase 4's");
			deadLetter.RequeuedAt.Should().BeNull();
		} finally {
			await DeleteJobsByTypeAsync(jobType);
		}
	}

	// §7.1: every engine instrument carries `instance` + `job_type`, and `instance`
	// is "the worker's stable runtime replica id — the SAME value used for
	// locked_by". That last clause is the assertion that matters: two independently
	// generated ids would tag every instrument, satisfy every signature, and
	// correlate nothing. So the tag is compared against the string the claim actually
	// wrote to job_queue.locked_by, read mid-run while the row is still leased.
	//
	// jobs.last_success_at is checked here too — it is the gauge that makes a stalled
	// job type detectable as an ageing timestamp rather than as silence.
	[Fact]
	public async Task ItShouldTagEveryInstrumentWithTheSameInstanceIdItWritesToLockedBy() {
		var jobType = UniqueType("instance-tag");
		await using var seedContext = await CreateDbContextAsync();
		var seededIds = await SeedDueJobsAsync(seedContext, jobType, count: 1);
		var jobId = seededIds.Single();

		try {
			string? lockedByDuringRun = null;
			var handler = new RecordingJobHandler(jobType) {
				OnHandle = async context => {
					// Read the claim's own locked_by while the lease is still held —
					// success hard-deletes the row moments later.
					await using var probe = await CreateDbContextAsync();
					lockedByDuringRun = await probe.JobQueue
						.Where(j => j.Id == context.JobId)
						.Select(j => j.LockedBy)
						.SingleAsync();
				}
			};

			var instance = new JobWorkerInstance();
			var processor = CreateProcessor(instance, new JobQueueProcessorOptions(), handler);

			var instanceTags = new List<string>();
			long lastSuccessAt = 0;

			using var listener = new MeterListener();
			listener.InstrumentPublished = (instrument, meterListener) => {
				if (instrument.Meter.Name == JobsMetrics.MeterName) {
					meterListener.EnableMeasurementEvents(instrument);
				}
			};
			listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) => {
				if (!HasTag(tags, "job_type", jobType)) {
					return;
				}

				var instanceTag = TagValue(tags, "instance");
				if (instanceTag is not null) {
					lock (instanceTags) {
						instanceTags.Add(instanceTag);
					}
				}

				if (instrument.Name == "jobs.last_success_at") {
					Interlocked.Exchange(ref lastSuccessAt, value);
				}
			});
			listener.SetMeasurementEventCallback<double>((_, _, tags, _) => {
				if (!HasTag(tags, "job_type", jobType)) {
					return;
				}

				var instanceTag = TagValue(tags, "instance");
				if (instanceTag is not null) {
					lock (instanceTags) {
						instanceTags.Add(instanceTag);
					}
				}
			});
			listener.Start();

			var result = await processor.ProcessBatchAsync(CancellationToken.None);
			result.Completed.Should().Be(1);

			lockedByDuringRun.Should().Be(
				instance.Id,
				"the claim writes the injected instance id to locked_by — §7.1's "
				+ "`instance` and locked_by are one generated value, not two"
			);

			// jobs.claimed, jobs.succeeded, jobs.last_success_at and
			// jobs.handler_duration all fire for this job type in this batch.
			instanceTags.Should().HaveCountGreaterThan(
				2, "every engine instrument carries the instance tag"
			);
			instanceTags.Should().AllBe(instance.Id);

			Interlocked.Read(ref lastSuccessAt).Should().BeCloseTo(
				DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
				60,
				"jobs.last_success_at is a unix-timestamp gauge recorded on success"
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

	// Asked of the database, not of an app clock: "still leased" means exactly what
	// ResetExpiredLeasesAsync means by it (F11).
	private static async Task<bool> IsStillLeasedAsync(AppDbContext dbContext, Guid jobId) {
		var leased = await dbContext.Database.SqlQuery<bool>(
			$"""
			SELECT (locked_until > now()) AS "Value" FROM job_queue WHERE id = {jobId}
			"""
		).ToListAsync();

		return leased.Single();
	}

	// The row's locked_until as the database holds it, read on its own fresh connection
	// so it never blocks on a concurrent FOR UPDATE (F11): a plain SELECT is an MVCC
	// reader and sees the last committed value.
	private async Task<DateTime> ReadLockedUntilAsync(Guid jobId) {
		await using var dbContext = await CreateDbContextAsync();
		var values = await dbContext.Database.SqlQuery<DateTime>(
			$"""SELECT locked_until AS "Value" FROM job_queue WHERE id = {jobId}"""
		).ToListAsync();

		return values.Single();
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
		return CreateProcessor(new JobWorkerInstance(), options, handlers);
	}

	// The instance id is threaded in rather than minted inside, so a spec can assert
	// the value the engine tags its instruments with IS the value it claims rows under
	// (§7.1).
	private JobQueueProcessor CreateProcessor(
		JobWorkerInstance instance,
		JobQueueProcessorOptions options,
		params IJobHandler[] handlers
	) {
		var registrations = handlers
			.Select(h => new JobHandlerRegistration(h.JobType, _ => h))
			.ToList();

		return new JobQueueProcessor(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			new JobHandlerRegistry(registrations),
			new JobsMetrics(instance, NullLogger<JobsMetrics>.Instance),
			instance,
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
