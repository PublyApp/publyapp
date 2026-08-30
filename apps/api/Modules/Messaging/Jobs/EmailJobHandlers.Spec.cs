using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Messaging.Services;
using PublyApp.Api.Modules.Profiles.Jobs;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Messaging.Jobs;

// Handler-level specs use direct invocation with a controllable sender for deterministic
// barriers and failures. The processor-dispatch specs that need the production registry
// and per-job DI scope to prove enqueue -> claim -> handler -> terminal persistence end to
// end live in the sibling EmailJobHandlersDispatchSpec: they observe the DI-registered
// FakeEmailSender, so each needs its own exclusive ApiFixture rather than the one shared
// across this class's methods.
public sealed class EmailJobHandlersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public EmailJobHandlersSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldSubmitAndLogWhenStaffInvitationIsEligible() {
		var (invitationId, _) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using var db = CreateDbContext();
		var handler = StaffHandler(db, sender);
		var outcome = await handler.HandleAsync(
			StaffContext(jobId, invitationId),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		sender.Sends.Should().HaveCount(1);
		sender.Sends[0].IdempotencyKey.Should().Be(jobId.ToString("N"));

		await using var assertDb = CreateDbContext();
		var log = await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.Submitted);
		log.Kind.Should().Be(EmailKind.StaffInvitation);
		log.InvitationId.Should().Be(invitationId);
		log.ProviderMessageId.Should().NotBeNullOrEmpty();
		log.RequestSha256.Should().NotBeNullOrEmpty();

		// The send-once scratch is cleaned up at the terminal outcome.
		(await assertDb.EmailPreparedSend.AsNoTracking().AnyAsync(p => p.JobId == jobId))
			.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldCancelWhenInvitationRevokedBeforeTheLockedRead() {
		// #811 order 1: revoke commits BEFORE the handler's locked read → no send.
		var (invitationId, _) = await SeedStaffInvitationAsync();
		await SetInvitationStatusAsync(invitationId, InvitationStatus.Revoked);

		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using var db = CreateDbContext();
		var handler = StaffHandler(db, sender);
		var outcome = await handler.HandleAsync(
			StaffContext(jobId, invitationId),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Cancelled>();
		sender.Sends.Should().BeEmpty();

		await using var assertDb = CreateDbContext();
		var log = await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.CancelledIneligible);
	}

	[Fact]
	public async Task ItShouldResendTheFrozenEnvelopeWhenRetryingAfterDomainMutation() {
		// F7: the envelope is frozen on the first attempt; a retry resends the STORED
		// bytes even after the domain row mutates (token rotated), so the provider sees a
		// byte-identical payload under the stable idempotency key.
		var (invitationId, originalToken) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();

		var failing = new ControllableSender {
			FailWith = _ => new EmailProviderTransientException("provider_rejected:transient")
		};
		await using (var db1 = CreateDbContext()) {
			var outcome = await StaffHandler(db1, failing)
				.HandleAsync(StaffContext(jobId, invitationId), CancellationToken.None);
			outcome.Should().BeOfType<JobOutcome.Retry>();
		}

		// The frozen envelope persists across the failed attempt.
		await using (var check = CreateDbContext()) {
			(await check.EmailPreparedSend.AsNoTracking().AnyAsync(p => p.JobId == jobId))
				.Should().BeTrue();
		}

		// Mutate the domain row — a re-render would now differ.
		await RotateInvitationTokenAsync(invitationId);

		var succeeding = new ControllableSender();
		await using (var db2 = CreateDbContext()) {
			var outcome = await StaffHandler(db2, succeeding)
				.HandleAsync(StaffContext(jobId, invitationId, attempts: 1), CancellationToken.None);
			outcome.Should().BeOfType<JobOutcome.Success>();
		}

		// The second (successful) send carried the ORIGINAL token, not the rotated one.
		succeeding.Sends.Should().HaveCount(1);
		succeeding.Sends[0].Request.HtmlBody.Should().Contain(originalToken);
	}

	[Fact]
	public async Task ItShouldRetryWhenProviderFailsTransiently() {
		var (invitationId, _) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender {
			FailWith = _ => new EmailProviderTransientException("provider_rejected:429")
		};

		await using var db = CreateDbContext();
		var outcome = await StaffHandler(db, sender)
			.HandleAsync(StaffContext(jobId, invitationId), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Retry>();

		await using var assertDb = CreateDbContext();
		// A failed submit NEVER produces a Submitted row.
		(await assertDb.EmailLog.AsNoTracking().AnyAsync(e => e.JobId == jobId)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldScheduleRetryInTheFutureAndGateClaimUntilItElapses() {
		// #810 end-to-end: the handler's Retry is applied by the engine's real transition
		// (TryRequeueAsync), which pushes next_attempt_at into the future. The row must not
		// be claimable before it elapses and must be claimable after — the clock is moved
		// via SQL now() comparison (set next_attempt_at), never by sleeping.
		var (invitationId, _) = await SeedStaffInvitationAsync();

		// A real, immediately-due job_queue row for this email job.
		Guid jobId;
		await using (var seed = CreateDbContext()) {
			var item = new JobQueueItem {
				JobType = InvitationEmailJobs.StaffInvitationV1.JobType,
				Payload = $"{{\"invitationId\":\"{invitationId}\"}}",
				Priority = 100,
				MaxAttempts = 10
			};
			seed.JobQueue.Add(item);
			await seed.SaveChangesAsync();
			if (item.Id is null) {
				throw new InvalidOperationException("job_queue insert did not populate the id.");
			}

			jobId = item.Id.Value;
		}

		// Claim it (engine transition): Pending -> Processing + a fencing lock_token.
		Guid lockToken;
		await using (var claimDb = CreateDbContext()) {
			var claimed = await JobQueueProcessor.ClaimBatchAsync(
				claimDb, "spec-worker", leaseSeconds: 60, batchSize: 50, CancellationToken.None
			);
			lockToken = claimed.Single(c => c.Id == jobId).LockToken;
		}

		// The handler classifies the provider failure as Retry.
		await using (var handlerDb = CreateDbContext()) {
			var sender = new ControllableSender {
				FailWith = _ => new EmailProviderTransientException("provider_rejected:429")
			};
			var outcome = await StaffHandler(handlerDb, sender)
				.HandleAsync(StaffContext(jobId, invitationId), CancellationToken.None);
			outcome.Should().BeOfType<JobOutcome.Retry>();
		}

		// Apply the engine's retry transition — the same call the processor makes.
		await using (var requeueDb = CreateDbContext()) {
			var requeued = await JobQueueProcessor.TryRequeueAsync(
				requeueDb, jobId, lockToken, delaySeconds: 300,
				lastError: "provider_rejected:429", CancellationToken.None
			);
			requeued.Should().BeTrue();
		}

		// next_attempt_at is in the future and the attempt counter advanced.
		await using (var assertDb = CreateDbContext()) {
			var row = await assertDb.JobQueue.AsNoTracking().SingleAsync(j => j.Id == jobId);
			row.NextAttemptAt.Should().BeAfter(DateTime.UtcNow);
			row.Attempts.Should().Be(1);
		}

		// NOT claimable before next_attempt_at elapses.
		await using (var beforeDb = CreateDbContext()) {
			var claimed = await JobQueueProcessor.ClaimBatchAsync(
				beforeDb, "spec-worker", leaseSeconds: 60, batchSize: 50, CancellationToken.None
			);
			claimed.Should().NotContain(c => c.Id == jobId);
		}

		// Move the schedule into the past via SQL (never sleeping) — now claimable.
		await using (var advanceDb = CreateDbContext()) {
			await advanceDb.Database.ExecuteSqlAsync(
				$"UPDATE job_queue SET next_attempt_at = now() - make_interval(secs => 1) WHERE id = {jobId}"
			);
		}

		await using (var afterDb = CreateDbContext()) {
			var claimed = await JobQueueProcessor.ClaimBatchAsync(
				afterDb, "spec-worker", leaseSeconds: 60, batchSize: 50, CancellationToken.None
			);
			claimed.Should().Contain(c => c.Id == jobId);
		}
	}

	[Fact]
	public async Task ItShouldPermanentlyFailWhenProviderFailsPermanently() {
		var (invitationId, _) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender {
			FailWith = _ => new EmailProviderPermanentException("provider_rejected:422")
		};

		await using var db = CreateDbContext();
		var outcome = await StaffHandler(db, sender)
			.HandleAsync(StaffContext(jobId, invitationId), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.PermanentFailure>();
		(await CreateDbContext().EmailLog.AsNoTracking().AnyAsync(e => e.JobId == jobId
			&& e.Outcome == EmailLogOutcome.Submitted)).Should().BeFalse();
	}

	// Processor-dispatch coverage that observes the DI-registered FakeEmailSender (rather
	// than a locally constructed ControllableSender) lives in the sibling
	// EmailJobHandlersDispatchSpec, which owns an exclusive ApiFixture per test method —
	// see that file's header comment for why.

	[Fact]
	public async Task ItShouldNotResendWhenASubmittedRowAlreadyExists() {
		// Crash-after-send idempotency: a committed Submitted row for this job means the
		// provider already accepted it — a reclaimed run must send nothing.
		var (invitationId, _) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();

		await using (var seed = CreateDbContext()) {
			seed.EmailLog.Add(new EmailLog {
				JobId = jobId,
				Kind = EmailKind.StaffInvitation,
				Recipient = "prior@example.com",
				Outcome = EmailLogOutcome.Submitted
			});
			await seed.SaveChangesAsync();
		}

		var sender = new ControllableSender();
		await using var db = CreateDbContext();
		var outcome = await StaffHandler(db, sender)
			.HandleAsync(StaffContext(jobId, invitationId), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Success>();
		sender.Sends.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldNotResendWhenACancelledIneligibleRowAlreadyExists() {
		// Step 0 (§5.4) must match EVERY outcome, not just Submitted. Reproduces the
		// lease-loss-after-CancelledIneligible reclaim: an ineligible job commits its
		// email_log(CancelledIneligible) row in its OWN transaction, BEFORE the engine's
		// fenced queue delete. A lease lost in that window lets another worker reclaim the
		// row with the Cancelled row already committed.
		//
		// Under a Submitted-only step 0 the re-run does not match that row, takes the
		// ineligible path again, and WriteCancelledIneligible violates the ux_email_log_job_id
		// unique index (unique on ALL outcomes) — every attempt Retries to MaxAttempts, then
		// the DLQ transaction hits the SAME violation writing PermanentlyFailed for this
		// job_id, rolls back, Faults, and the row stays leased forever with no DLQ row (#810).
		var (invitationId, _) = await SeedStaffInvitationAsync();
		await SetInvitationStatusAsync(invitationId, InvitationStatus.Revoked);
		var jobId = Guid.CreateVersion7();

		// First run: ineligible → commits email_log(CancelledIneligible) for this job_id.
		await using (var first = CreateDbContext()) {
			var outcome = await StaffHandler(first, new ControllableSender())
				.HandleAsync(StaffContext(jobId, invitationId), CancellationToken.None);
			outcome.Should().BeOfType<JobOutcome.Cancelled>();
		}

		await using (var seeded = CreateDbContext()) {
			var row = await seeded.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
			row.Outcome.Should().Be(EmailLogOutcome.CancelledIneligible);
		}

		// The lease is lost and the job is reclaimed: the SAME job_id runs again against the
		// committed Cancelled row. It must short-circuit — not throw, not resend.
		var sender = new ControllableSender();
		await using var reclaimed = CreateDbContext();
		var reRun = async () => await StaffHandler(reclaimed, sender)
			.HandleAsync(StaffContext(jobId, invitationId, attempts: 1), CancellationToken.None);

		(await reRun.Should().NotThrowAsync()).Which.Should().BeOfType<JobOutcome.Success>();
		sender.Sends.Should().BeEmpty();

		// Still exactly one row — no second insert was ever attempted.
		await using var assertDb = CreateDbContext();
		(await assertDb.EmailLog.AsNoTracking().CountAsync(e => e.JobId == jobId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldNotSendWhenASubmittedRowAppearsBeforeTheProviderCall() {
		// Step 3a (§5.4, R2-2): two workers can both pass step 0 before either takes the
		// SEND lock, and the fencing token settles the QUEUE row, not an external double
		// send. The domain lock serializes the two SEND transactions, so the second must
		// observe the first's committed Submitted row on the local recheck — the LAST thing
		// before network I/O — and skip the provider. The race is injected inside the
		// locked PrepareAsync, which is exactly the window between step 0's read and the
		// send: without the recheck this handler calls the provider a second time.
		var (invitationId, _) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using var db = CreateDbContext();
		var handler = new SubmittedRaceHandler(
			db,
			sender,
			new EmailLogWriter(db),
			Metrics(),
			() => CommitConcurrentSubmittedAsync(jobId, invitationId)
		);

		var outcome = await handler.HandleAsync(
			StaffContext(jobId, invitationId),
			CancellationToken.None
		);

		outcome.Should().BeOfType<JobOutcome.Success>();
		sender.Sends.Should().BeEmpty();

		await using var assertDb = CreateDbContext();
		// The winner's row is the only one — the loser neither sent nor logged.
		var log = await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.Submitted);
		log.Recipient.Should().Be("race-winner@example.com");

		// The loser still cleans up its scratch before returning Success.
		(await assertDb.EmailPreparedSend.AsNoTracking().AnyAsync(p => p.JobId == jobId))
			.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldWritePermanentlyFailedOnTerminalFailure() {
		// The engine invokes OnTerminalFailureAsync inside the DLQ transaction on the
		// shared context; here we simulate that by calling it and committing.
		var (invitationId, _) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();

		await using var db = CreateDbContext();
		await using var transaction = await db.Database.BeginTransactionAsync();
		var context = StaffContext(jobId, invitationId, lastError: "provider_rejected:422");
		await StaffHandler(db, new ControllableSender()).OnTerminalFailureAsync(
			context,
			CancellationToken.None
		);
		await db.SaveChangesAsync();
		await transaction.CommitAsync();

		await using var assertDb = CreateDbContext();
		var log = await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.PermanentlyFailed);
		log.LastError.Should().Be("provider_rejected:422");
	}

	[Fact]
	public async Task ItShouldDeadLetterMalformedPayloadWithPlaceholderEmailLogIdentity() {
		var job = new JobQueueItem {
			JobType = InvitationEmailJobs.StaffInvitationV1.JobType,
			Payload = "{\"invitationId\":\"not-a-guid\"}",
			Priority = 100,
			MaxAttempts = 10
		};

		await using var db = CreateDbContext();
		db.JobQueue.Add(job);
		await db.SaveChangesAsync();

		if (job.Id is null) {
			throw new InvalidOperationException("job_queue insert did not populate the id.");
		}

		var jobId = job.Id.Value;
		var claimed = await JobQueueProcessor.ClaimBatchAsync(
			db,
			"malformed-email-spec",
			leaseSeconds: 60,
			batchSize: 1,
			CancellationToken.None
		);
		var lockToken = claimed.Single(c => c.Id == jobId).LockToken;
		var instance = new JobWorkerInstance();
		var processorMetrics = new JobsMetrics(instance, NullLogger<JobsMetrics>.Instance);
		var processor = new JobQueueProcessor(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			new JobHandlerRegistry([
				new JobHandlerRegistration(
					InvitationEmailJobs.StaffInvitationV1.JobType,
					serviceProvider => serviceProvider
						.GetRequiredService<StaffInvitationEmailJobHandler>()
				)
			]),
			processorMetrics,
			instance,
			NullLogger<JobQueueProcessor>.Instance
		);

		await processor.ProcessOneAsync(job, lockToken, CancellationToken.None);

		await using var assertDb = CreateDbContext();
		(await assertDb.JobQueue.AsNoTracking().AnyAsync(j => j.Id == jobId))
			.Should().BeFalse();
		var deadLetter = await assertDb.JobDeadLetter.AsNoTracking()
			.SingleOrDefaultAsync(d => d.OriginalJobId == jobId);

		deadLetter.Should().NotBeNull();
		deadLetter!.Payload.Should().Contain("not-a-guid");

		var log = await assertDb.EmailLog.AsNoTracking().SingleOrDefaultAsync(e => e.JobId == jobId);
		log.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldSerializeConcurrentRevokeBehindTheInFlightSend() {
		// #811 order 2 (F8): the handler holds the invitation row lock across the send
		// (paused at the barrier); a concurrent revoke BLOCKS on that lock and cannot
		// preempt the send. The send proceeds (Submitted), then the revoke commits after.
		var (invitationId, _) = await SeedStaffInvitationAsync();
		var jobId = Guid.CreateVersion7();

		var sender = new ControllableSender {
			Barrier = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously),
			ReachedBarrier = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)
		};

		await using var handlerDb = CreateDbContext();
		var handlerTask = StaffHandler(handlerDb, sender)
			.HandleAsync(StaffContext(jobId, invitationId), CancellationToken.None);

		try {
			// Wait until the handler is inside the send, holding the FOR UPDATE lock.
			await sender.ReachedBarrier.Task.WaitAsync(TimeSpan.FromSeconds(10));

			// A concurrent revoke must hit PostgreSQL's lock timeout while the send owns the
			// row lock. This proves the database wait directly instead of relying on elapsed
			// wall-clock timing that can false-green on a slow CI host.
			await using var revokeDb = CreateDbContext();
			await using var revokeTransaction = await revokeDb.Database.BeginTransactionAsync();
			await revokeDb.Database.ExecuteSqlRawAsync("SET LOCAL lock_timeout = '250ms'");

			var act = async () => await revokeDb.Database.ExecuteSqlAsync(
				$"""
				UPDATE invitations
				SET status = {(int)InvitationStatus.Revoked}, updated_at = now()
				WHERE id = {invitationId}
				"""
			);
			await act.Should().ThrowAsync<PostgresException>()
				.Where(exception => exception.SqlState == PostgresErrorCodes.LockNotAvailable);
			await revokeTransaction.RollbackAsync();
		} finally {
			sender.Barrier.TrySetResult();
			try {
				await handlerTask;
			} catch {
				// Preserve any earlier setup/assertion failure; the normal path re-awaits below.
			}
		}

		(await handlerTask).Should().BeOfType<JobOutcome.Success>();
		await SetInvitationStatusAsync(invitationId, InvitationStatus.Revoked);

		await using var assertDb = CreateDbContext();
		(await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId))
			.Outcome.Should().Be(EmailLogOutcome.Submitted);
	}

	[Fact]
	public async Task ItShouldCancelPasswordResetWhenTokenInvalidAtLockedRead() {
		// The password-reset handler shares the base flow; token validity is the auth
		// eligibility gate. A user without a live token yields CancelledIneligible.
		var userId = await SeedUserAsync(withLiveToken: false);
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using var db = CreateDbContext();
		var handler = new PasswordResetEmailJobHandler(
			db, sender, new EmailLogWriter(db), Metrics()
		);
		var context = new JobContext {
			JobId = jobId,
			JobType = AuthEmailJobs.PasswordResetV1.JobType,
			Payload = $"{{\"userId\":\"{userId}\"}}",
			Attempts = 0,
			MaxAttempts = 10
		};

		var outcome = await handler.HandleAsync(context, CancellationToken.None);
		outcome.Should().BeOfType<JobOutcome.Cancelled>();
		sender.Sends.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldSubmitAndLogWhenAJoinedStaffUserIsEligible() {
		// #291: the joined-staff notification handler shares the base flow; an existing,
		// non-suspended user yields one submitted send keyed to the user id.
		var userId = await SeedExistingUserAsync(UserStatus.Active);
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using var db = CreateDbContext();
		var outcome = await JoinedStaffHandler(db, sender)
			.HandleAsync(JoinedStaffContext(jobId, userId), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Success>();
		sender.Sends.Should().HaveCount(1);
		sender.Sends[0].IdempotencyKey.Should().Be(jobId.ToString("N"));

		await using var assertDb = CreateDbContext();
		var log = await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.Submitted);
		log.Kind.Should().Be(EmailKind.StaffJoinedNotification);
		log.UserId.Should().Be(userId);
	}

	[Fact]
	public async Task ItShouldSendExactlyOnceWhenTheSameJobIsInvokedTwice() {
		// #1557: the base step-0 short-circuit must hold FOR THIS HANDLER — a
		// handler that composes its idempotency key from something job-specific, or
		// that does work before the short-circuit, sends twice. Two invocations with
		// the SAME jobId + payload yield exactly one send and one EmailLog row.
		var userId = await SeedExistingUserAsync(UserStatus.Active);
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using var db = CreateDbContext();
		var handler = JoinedStaffHandler(db, sender);
		var context = JoinedStaffContext(jobId, userId);

		var outcome1 = await handler.HandleAsync(context, CancellationToken.None);
		outcome1.Should().BeOfType<JobOutcome.Success>();
		sender.Sends.Should().HaveCount(
			1,
			"[#1557] the first invocation of a fresh job must send exactly once"
		);

		// Second invocation: the committed Submitted row makes step 0 short-circuit.
		var outcome2 = await handler.HandleAsync(context, CancellationToken.None);
		outcome2.Should().BeOfType<JobOutcome.Success>();
		sender.Sends.Should().HaveCount(
			1,
			"[#1557] step-0 short-circuit must prevent a second send: the same "
				+ "jobId + payload invoked twice must yield exactly one email, or the "
				+ "person is told twice they were added"
		);

		await using var assertDb = CreateDbContext();
		(await assertDb.EmailLog.AsNoTracking().CountAsync(e => e.JobId == jobId))
			.Should().Be(1, "exactly one email_log row must exist");
		var log = await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.Submitted);
		log.Kind.Should().Be(EmailKind.StaffJoinedNotification);
	}

	[Fact]
	public async Task ItShouldReturnCancelledWithUserNotFoundWhenTheUserIsSoftDeletedBeforeTheLockedRead() {
		// #1557: eligibility is rechecked at execution time under the lock. A user
		// soft-deleted between enqueue and the locked read yields user_not_found — no
		// email into the void, and no email_log row (the recipient is empty).
		var userId = await SeedExistingUserAsync(UserStatus.Active);
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using (var del = CreateDbContext()) {
			var user = await del.User.SingleAsync(u => u.Id == userId);
			user.IsDeleted = true;
			user.DeletedAt = DateTime.UtcNow;
			await del.SaveChangesAsync();
		}

		await using var db = CreateDbContext();
		var outcome = await JoinedStaffHandler(db, sender)
			.HandleAsync(JoinedStaffContext(jobId, userId), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Cancelled>(
			"[#1557] a user soft-deleted between enqueue and the locked read must "
			+ "yield user_not_found (Cancelled), not a Success send to a recipient "
			+ "that no longer exists"
		);
		sender.Sends.Should().BeEmpty(
			"[#1557] no email may reach a user already deleted at execution time"
		);

		await using var assertDb = CreateDbContext();
		(await assertDb.EmailLog.AsNoTracking().AnyAsync(e => e.JobId == jobId))
			.Should().BeFalse("user_not_found has no recipient — nothing to log");
	}

	[Fact]
	public async Task ItShouldCancelJoinedStaffNotificationWhenTheUserIsSuspendedAtLockedRead() {
		// #291: a user suspended between enqueue and the locked read is ineligible —
		// no send, CancelledIneligible terminal row (same contract as the password-reset
		// token gate above).
		var userId = await SeedExistingUserAsync(UserStatus.Suspended);
		var jobId = Guid.CreateVersion7();
		var sender = new ControllableSender();

		await using var db = CreateDbContext();
		var outcome = await JoinedStaffHandler(db, sender)
			.HandleAsync(JoinedStaffContext(jobId, userId), CancellationToken.None);

		outcome.Should().BeOfType<JobOutcome.Cancelled>();
		sender.Sends.Should().BeEmpty();

		await using var assertDb = CreateDbContext();
		var log = await assertDb.EmailLog.AsNoTracking().SingleAsync(e => e.JobId == jobId);
		log.Outcome.Should().Be(EmailLogOutcome.CancelledIneligible);
	}

	// --- construction helpers -----------------------------------------------------

	private static StaffInvitationEmailJobHandler StaffHandler(AppDbContext db, IEmailSender sender) {
		return new StaffInvitationEmailJobHandler(db, sender, new EmailLogWriter(db), Metrics());
	}

	private static StaffJoinedNotificationEmailJobHandler JoinedStaffHandler(
		AppDbContext db,
		IEmailSender sender
	) {
		return new StaffJoinedNotificationEmailJobHandler(db, sender, new EmailLogWriter(db), Metrics());
	}

	private static JobsMetrics Metrics() {
		return new JobsMetrics(new JobWorkerInstance(), NullLogger<JobsMetrics>.Instance);
	}

	private static JobContext StaffContext(
		Guid jobId,
		Guid invitationId,
		int attempts = 0,
		string? lastError = null
	) {
		return new JobContext {
			JobId = jobId,
			JobType = InvitationEmailJobs.StaffInvitationV1.JobType,
			Payload = $"{{\"invitationId\":\"{invitationId}\"}}",
			Attempts = attempts,
			MaxAttempts = 10,
			LastError = lastError
		};
	}

	private static JobContext JoinedStaffContext(Guid jobId, Guid userId) {
		return new JobContext {
			JobId = jobId,
			JobType = StaffProfileEmailJobs.StaffJoinedNotificationV1.JobType,
			Payload = $"{{\"userId\":\"{userId}\"}}",
			Attempts = 0,
			MaxAttempts = 10
		};
	}

	// --- seeding ------------------------------------------------------------------

	private async Task<Guid> SeedExistingUserAsync(UserStatus status) {
		await using var db = CreateDbContext();
		var user = new User {
			Email = $"joined-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
			Status = status
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private async Task<(Guid InvitationId, string Token)> SeedStaffInvitationAsync() {
		var token = $"tok-{Guid.NewGuid():N}";
		await using var db = CreateDbContext();
		var invitedBy = await SeedUserInAsync(db);
		var invitation = Invitation.CreateStaffInvitationWithProfiles(
			$"invitee-{Guid.NewGuid():N}@example.com",
			new List<Guid>(),
			invitedBy,
			DateTime.UtcNow.AddDays(7),
			token
		);
		invitation.ValidateInvitationType();
		db.Invitation.Add(invitation);
		await db.SaveChangesAsync();
		return (invitation.GetRequiredId(), token);
	}

	// The concurrent worker that won the race: commits an email_log(Submitted) row for the
	// same job on its OWN connection, exactly as the first SEND transaction would.
	private async Task CommitConcurrentSubmittedAsync(Guid jobId, Guid invitationId) {
		await using var db = CreateDbContext();
		db.EmailLog.Add(new EmailLog {
			JobId = jobId,
			Kind = EmailKind.StaffInvitation,
			Recipient = "race-winner@example.com",
			Outcome = EmailLogOutcome.Submitted,
			InvitationId = invitationId
		});
		await db.SaveChangesAsync();
	}

	private async Task SetInvitationStatusAsync(Guid invitationId, InvitationStatus status) {
		await using var db = CreateDbContext();
		await db.Database.ExecuteSqlAsync(
			$"UPDATE invitations SET status = {(int)status}, updated_at = now() WHERE id = {invitationId}"
		);
	}

	private async Task RotateInvitationTokenAsync(Guid invitationId) {
		await using var db = CreateDbContext();
		var token = "rotated-" + Guid.NewGuid().ToString("N");
		await db.Database.ExecuteSqlAsync(
			$"""
			UPDATE invitations
			SET token = {token}, updated_at = now()
			WHERE id = {invitationId}
			"""
		);
	}

	private async Task<Guid> SeedUserAsync(bool withLiveToken) {
		await using var db = CreateDbContext();
		var user = new User {
			Email = $"user-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
			PasswordResetToken = withLiveToken ? $"rt-{Guid.NewGuid():N}" : null,
			PasswordResetTokenExpiresAt = withLiveToken ? DateTime.UtcNow.AddHours(1) : null
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private static async Task<Guid> SeedUserInAsync(AppDbContext db) {
		var user = new User {
			Email = $"inviter-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private AppDbContext CreateDbContext() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	// The step-3a probe: a real EmailJobHandlerBase whose locked prepare also runs an
	// injection hook. PrepareAsync is the seam the spec's race needs — it runs after step
	// 0's email_log read and before the provider call, so a Submitted row committed there
	// is invisible to step 0 and visible only to step 3a's recheck.
	private sealed class SubmittedRaceHandler : EmailJobHandlerBase<StaffInvitationEmailPayload> {
		private readonly Func<Task> _injectConcurrentSubmittedAsync;

		public SubmittedRaceHandler(
			AppDbContext db,
			IEmailSender sender,
			IEmailLogWriter logWriter,
			JobsMetrics metrics,
			Func<Task> injectConcurrentSubmittedAsync
		) : base(db, sender, logWriter, metrics) {
			_injectConcurrentSubmittedAsync = injectConcurrentSubmittedAsync;
		}

		public override string JobType {
			get { return InvitationEmailJobs.StaffInvitationV1.JobType; }
		}

		protected override EmailKind Kind {
			get { return EmailKind.StaffInvitation; }
		}

		protected override async Task<EmailJobPreparation> PrepareAsync(
			StaffInvitationEmailPayload payload,
			CancellationToken cancellationToken
		) {
			await LockRowAsync("invitations", payload.InvitationId, cancellationToken);

			var invitationQuery =
				from candidate in Db.Invitation
				where candidate.Id == payload.InvitationId
				select candidate;
			var invitation = await invitationQuery.FirstAsync(cancellationToken);

			// email_log has no lock conflict with the invitations row this transaction
			// holds, so the winner commits without blocking on us.
			await _injectConcurrentSubmittedAsync();

			return new EmailJobPreparation.Ready(
				EmailTemplates.StaffInvitation(invitation.Email, invitation.Token),
				invitation.Email,
				payload.InvitationId,
				null
			);
		}

		protected override Task<EmailTerminalIdentity> ResolveTerminalIdentityAsync(
			StaffInvitationEmailPayload payload,
			CancellationToken cancellationToken
		) {
			return Task.FromResult(
				new EmailTerminalIdentity("race-loser@example.com", payload.InvitationId, null)
			);
		}
	}

	// A deterministic IEmailSender: optional classified failure, optional barrier to
	// pause the send while the handler holds the row lock (the #811 order-2 test).
	private sealed class ControllableSender : IEmailSender {
		public List<(EmailRequest Request, string? IdempotencyKey)> Sends { get; } = new();
		public Func<EmailRequest, EmailProviderException?>? FailWith { get; set; }
		public TaskCompletionSource? Barrier { get; set; }
		public TaskCompletionSource? ReachedBarrier { get; set; }

		public async Task<EmailSendReceipt> SendAsync(
			EmailRequest request,
			string? idempotencyKey = null,
			CancellationToken cancellationToken = default
		) {
			if (Barrier is not null) {
				ReachedBarrier?.TrySetResult();
				await Barrier.Task;
			}

			if (FailWith?.Invoke(request) is { } failure) {
				throw failure;
			}

			Sends.Add((request, idempotencyKey));
			return new EmailSendReceipt(Guid.NewGuid().ToString());
		}
	}
}
