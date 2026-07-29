using System.Data;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Migrations;

// Fold migration spec (design §4.6/§9, F2/F4). Two concerns:
//  1. the byte-exact migration-produced JSON deserializes through each handler payload
//     type via the canonical JobJson contract (F2);
//  2. the R1 data fold maps every outbox row-class correctly, leaves Processing rows
//     untouched, and is rerun-safe (the fold:<id> source-row marker).
// The spec executes the migration's shared immutable SQL constants against seeded rows;
// the migration itself ran against an empty outbox during fixture setup.
public sealed class AddEmailLogAndFoldEmailOutboxSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AddEmailLogAndFoldEmailOutboxSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public void ItShouldDeserializeMigrationPayloadJsonThroughEachHandlerPayloadType() {
		var invitationId = Guid.CreateVersion7();
		var userId = Guid.CreateVersion7();

		// Exactly what the migration's jsonb_build_object emits (camelCase wire form).
		var tenant = JobJson.Deserialize<TenantInvitationEmailPayload>(
			$"{{\"invitationId\": \"{invitationId}\"}}"
		);
		tenant.InvitationId.Should().Be(invitationId);

		var staff = JobJson.Deserialize<StaffInvitationEmailPayload>(
			$"{{\"invitationId\": \"{invitationId}\"}}"
		);
		staff.InvitationId.Should().Be(invitationId);

		var reset = JobJson.Deserialize<PasswordResetEmailPayload>(
			$"{{\"userId\": \"{userId}\"}}"
		);
		reset.UserId.Should().Be(userId);
	}

	[Fact]
	public async Task ItShouldFoldPendingRowsAndBackCopyTerminalHistoryLeavingProcessingUntouched() {
		// invitation_email_outbox.invitation_id is a real FK → invitations, so a row that
		// carries an id needs a real invitation; terminal/processing rows use NULL.
		var pendingInvitationId = await SeedInvitationAsync();

		var pending = await SeedOutboxAsync(o => {
			o.Kind = InvitationEmailKind.StaffInvitation;
			o.Status = InvitationEmailOutboxStatus.Pending;
			o.InvitationId = pendingInvitationId;
			o.AttemptCount = 3;
			o.NextAttemptAt = DateTime.UtcNow.AddMinutes(42);
		});
		var sent = await SeedOutboxAsync(o => {
			o.Kind = InvitationEmailKind.TenantInvitation;
			o.Status = InvitationEmailOutboxStatus.Sent;
			o.SentAt = DateTime.UtcNow.AddHours(-2);
		});
		var failed = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Failed;
			o.AttemptCount = 8;
			o.LastError = "boom";
		});
		var cancelled = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Cancelled;
		});
		var processing = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Processing;
		});
		var nullInvitationPending = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Pending;
			o.InvitationId = null;
		});

		await using (var db = CreateDbContext()) {
			await RunFoldSqlAsync(db);
		}

		await using var assert = CreateDbContext();

		// Pending → folded into job_queue with the canonical payload + preserved attempts.
		var foldedJob = await assert.JobQueue.AsNoTracking()
			.SingleAsync(j => j.IdempotencyKey == $"fold:{pending}");
		foldedJob.JobType.Should().Be("email.staff-invitation.v1");
		PayloadGuid(foldedJob.Payload, "invitationId").Should().Be(pendingInvitationId);
		foldedJob.Attempts.Should().Be(3);
		foldedJob.Priority.Should().Be(100);

		// next_attempt_at is preserved EXACTLY from the source outbox row (the folded job
		// stays on the schedule the old dispatcher had — never reset to now()).
		var pendingSource = await assert.InvitationEmailOutbox.AsNoTracking()
			.SingleAsync(o => o.Id == pending);
		foldedJob.NextAttemptAt.Should().Be(pendingSource.NextAttemptAt);

		// Folded source row is Cancelled so the old dispatcher can never resend it.
		(await OutboxStatusAsync(assert, pending)).Should().Be(InvitationEmailOutboxStatus.Cancelled);

		// Processing row is UNTOUCHED — no job, still Processing.
		(await assert.JobQueue.AsNoTracking().AnyAsync(j => j.IdempotencyKey == $"fold:{processing}"))
			.Should().BeFalse();
		(await OutboxStatusAsync(assert, processing)).Should().Be(InvitationEmailOutboxStatus.Processing);

		// Terminal history back-copied with lineage + correct outcome mapping.
		//
		// Legacy `Sent` → LegacySubmissionUnverified, NEVER Submitted (§4.4/§4.6, R2-3).
		// The old dispatcher marked rows Sent regardless of provider rejection (F3:
		// ResendEmailAdapter returned Success = false, EmailService discarded it), so a
		// legacy Sent row may in fact be a REJECTED send. Mapping it to Submitted would
		// manufacture authoritative provider-acceptance history from rows known not to
		// support it.
		var sentLog = await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == sent);
		sentLog.Outcome.Should().Be(EmailLogOutcome.LegacySubmissionUnverified);
		sentLog.Outcome.Should().NotBe(
			EmailLogOutcome.Submitted,
			"a folded legacy Sent row is not evidence the provider accepted the send"
		);
		var failedLog = await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == failed);
		failedLog.Outcome.Should().Be(EmailLogOutcome.PermanentlyFailed);
		failedLog.Attempts.Should().Be(8);
		// The stable migration code, not the legacy text ("boom") — §4.6/R2-8.
		failedLog.LastError.Should().Be("legacy-import:failed");
		(await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == cancelled))
			.Outcome.Should().Be(EmailLogOutcome.CancelledIneligible);

		// Null-invitation Pending → CancelledIneligible in email_log, source Cancelled.
		(await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == nullInvitationPending))
			.Outcome.Should().Be(EmailLogOutcome.CancelledIneligible);
	}

	[Fact]
	public async Task ItShouldBeRerunSafeProducingNoDuplicateJobsOrBackCopies() {
		var invitationId = await SeedInvitationAsync();
		var outboxId = await SeedOutboxAsync(o => {
			o.Kind = InvitationEmailKind.StaffInvitation;
			o.Status = InvitationEmailOutboxStatus.Pending;
			o.InvitationId = invitationId;
		});
		var sentId = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Sent;
			o.SentAt = DateTime.UtcNow.AddHours(-1);
		});

		await using (var db = CreateDbContext()) {
			await RunFoldSqlAsync(db);
			await RunFoldSqlAsync(db);
		}

		await using var assert = CreateDbContext();
		(await assert.JobQueue.AsNoTracking().CountAsync(j => j.IdempotencyKey == $"fold:{outboxId}"))
			.Should().Be(1);
		(await assert.EmailLog.AsNoTracking().CountAsync(e => e.LegacyOutboxId == sentId))
			.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRollBackEveryFoldWriteWhenAFailureOccursMidFold() {
		var invitationId = await SeedInvitationAsync();
		var pendingId = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Pending;
			o.InvitationId = invitationId;
		});
		var sentId = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Sent;
			o.SentAt = DateTime.UtcNow.AddMinutes(-5);
		});

		await using (var db = CreateDbContext()) {
			// Step 3 is FoldPendingRows (step 1 is the LOCK, step 2 the back-copy): fail
			// right after the job insert so both the back-copy row AND the fold job have
			// been written, and assert the rollback undoes both.
			var act = async () => await RunFoldSqlAsync(db, failAfterStep: 3);
			await act.Should().ThrowAsync<InvalidOperationException>()
				.WithMessage("forced mid-fold failure");
		}

		await using var assert = CreateDbContext();
		(await assert.JobQueue.AsNoTracking()
			.AnyAsync(j => j.IdempotencyKey == $"fold:{pendingId}"))
			.Should().BeFalse();
		(await assert.EmailLog.AsNoTracking().AnyAsync(e => e.LegacyOutboxId == sentId))
			.Should().BeFalse();
		(await OutboxStatusAsync(assert, pendingId))
			.Should().Be(InvitationEmailOutboxStatus.Pending);
	}

	[Fact]
	public async Task ItShouldWriteAStableMigrationCodeInsteadOfTheLegacyLastError() {
		// §4.6/R2-8 + F20: the fold records a stable code and NEVER copies the legacy text
		// — not even redacted. A row carrying a recipient email, a token-shaped blob and
		// >2 KB of chatter must land in email_log carrying none of it. This is the
		// categorical form of the "bounded + sanitized" contract: a regex redaction is
		// best-effort by construction (it cannot be proven to catch every PII shape),
		// whereas not copying is total.
		var email = "victim@example.com";
		var token = "abcdefghijklmnopqrstuvwxyz0123456789";
		var chatter = string.Join(" ", Enumerable.Repeat("err", 2000));
		var raw = $"send failed for {email} token={token} {chatter}";

		var failed = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Failed;
			o.AttemptCount = 4;
			o.LastError = raw;
		});
		var sent = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Sent;
			o.SentAt = DateTime.UtcNow.AddMinutes(-5);
			o.LastError = raw;
		});

		await using (var db = CreateDbContext()) {
			await RunFoldSqlAsync(db);
		}

		await using var assert = CreateDbContext();

		// Failed → the fixed literal, exactly. No fragment of the legacy text survives.
		var failedLog = await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == failed);
		failedLog.LastError.Should().Be("legacy-import:failed");
		failedLog.LastError.Should().NotContain(email);
		failedLog.LastError.Should().NotContain(token);
		failedLog.LastError.Should().NotContain("send failed for");

		// Every other status → NULL, even when the source row carried error text.
		var sentLog = await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == sent);
		sentLog.LastError.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldNotBackCopyAFoldedRowEvenAfterItsFoldJobHasBeenDeleted() {
		// §4.6, R2: a row the fold moved into job_queue carries folded_job_id — the durable,
		// migration-only provenance marker. Its outcome is the NEW JOB, not a cancellation,
		// so it must never become email_log history: not on the initial fold, not on a
		// re-run, and not on R2's straggler back-copy — which runs LATER, with the fold
		// committed AND, critically, after the fold job has SUCCEEDED and been deleted (the
		// queue is delete-on-success). Because the marker lives on the SOURCE row it
		// outlives the job; a live `job_queue EXISTS` check would re-admit the row the
		// instant its job was deleted.
		var invitationId = await SeedInvitationAsync();
		var pending = await SeedOutboxAsync(o => {
			o.Kind = InvitationEmailKind.StaffInvitation;
			o.Status = InvitationEmailOutboxStatus.Pending;
			o.InvitationId = invitationId;
		});

		// Two full passes: the second sees the marker the first committed.
		await using (var db = CreateDbContext()) {
			await RunFoldSqlAsync(db);
			await RunFoldSqlAsync(db);
		}

		await using var assert = CreateDbContext();

		// The source row is the fold's, and the fold's only: one job, zero history rows.
		(await assert.JobQueue.AsNoTracking().CountAsync(j => j.IdempotencyKey == $"fold:{pending}"))
			.Should().Be(1);
		(await assert.EmailLog.AsNoTracking().CountAsync(e => e.LegacyOutboxId == pending))
			.Should().Be(0, "the folded row's outcome is its job_queue job, not a cancellation");

		// The durable marker is set on the source row — THIS, not the free-text last_error,
		// is what the back-copy excludes on. last_error is only a human-facing note now.
		var source = await assert.InvitationEmailOutbox.AsNoTracking().SingleAsync(o => o.Id == pending);
		source.Status.Should().Be(InvitationEmailOutboxStatus.Cancelled);
		source.FoldedJobId.Should().NotBeNull("the fold records which job the row became");
		source.LastError.Should().Be("folded to job_queue");

		// Simulate the fold job SUCCEEDING: delete-on-success removes the job row, so it is
		// gone before R2's straggler back-copy runs.
		var foldKey = $"fold:{pending}";
		await using (var deleteJob = CreateDbContext()) {
			await deleteJob.Database.ExecuteSqlAsync(
				$"DELETE FROM job_queue WHERE idempotency_key = {foldKey}"
			);
		}
		await using (var afterDelete = CreateDbContext()) {
			(await afterDelete.JobQueue.AsNoTracking().AnyAsync(j => j.IdempotencyKey == foldKey))
				.Should().BeFalse("precondition: the successful fold job has been deleted");
		}

		// R2-shaped straggler back-copy, run with the job already deleted: still adds
		// nothing for this row, because folded_job_id persists on the source row.
		await using (var straggler = CreateDbContext()) {
			await ExecRawAsync(straggler, AddEmailLogAndFoldEmailOutboxSql.BackCopyTerminalHistory);
		}

		await using var afterStraggler = CreateDbContext();
		(await afterStraggler.EmailLog.AsNoTracking().CountAsync(e => e.LegacyOutboxId == pending))
			.Should().Be(0, "the durable fold marker outlives the deleted job");
	}

	[Fact]
	public async Task ItShouldTakeUpdatedAtForFailedAndCancelledRowsThatAlsoCarryASentAt() {
		// §4.6 explicit legacy timestamp mapping: Sent -> sent_at; Failed/Cancelled ->
		// updated_at. A COALESCE(sent_at, updated_at, now()) chain agrees with that mapping
		// only while non-Sent rows carry a NULL sent_at. This is the exact case where they
		// disagree — a row the old dispatcher marked Sent and later re-marked, so it holds
		// BOTH timestamps — and the COALESCE takes sent_at, making the history claim the
		// outcome occurred when the send did rather than when the row actually reached its
		// terminal state.
		var failed = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Failed;
			o.LastError = "boom";
		});
		var cancelled = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Cancelled;
		});
		var sent = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Sent;
		});

		// SaveChanges stamps updated_at itself, so force the columns apart in SQL: every
		// row carries a sent_at STRICTLY EARLIER than its updated_at, making "which column
		// did the copy read" observable rather than a coincidence of equal clocks.
		foreach (var id in new[] { failed, cancelled, sent }) {
			await using var seed = CreateDbContext();
			await seed.Database.ExecuteSqlAsync(
				$"""
				UPDATE invitation_email_outbox
				SET sent_at = now() - interval '10 days',
				    updated_at = now() - interval '1 day'
				WHERE id = {id}
				"""
			);
		}

		await using (var db = CreateDbContext()) {
			await RunFoldSqlAsync(db);
		}

		await using var assert = CreateDbContext();

		// Compare against the source rows' OWN stored values — no precision assumptions
		// about how the timestamps round-trip.
		var sources = (await assert.InvitationEmailOutbox.AsNoTracking()
			.Where(o => o.Id == failed || o.Id == cancelled || o.Id == sent)
			.ToListAsync()).ToDictionary(o => o.GetRequiredId());

		foreach (var id in new[] { failed, cancelled }) {
			var source = sources[id];
			source.SentAt.Should().NotBeNull("the spec's premise is a non-NULL sent_at");
			var log = await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == id);
			log.OccurredAt.Should().Be(
				source.UpdatedAt, "Failed/Cancelled map to updated_at (§4.6)"
			);
			log.OccurredAt.Should().NotBe(
				source.SentAt!.Value,
				"sent_at records when the send happened, not when the row reached this outcome"
			);
		}

		// The Sent row still maps to sent_at: the fix is a per-status mapping, not a
		// blanket swap to updated_at.
		var sentLog = await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == sent);
		sentLog.OccurredAt.Should().Be(sources[sent].SentAt!.Value, "Sent maps to sent_at (§4.6)");
	}

	[Fact]
	public async Task ItShouldFallBackToUpdatedAtForASentRowMissingItsSentAt() {
		// TOTALITY / INVARIANT test — NOT a red-before control (R3). It does not fail on the
		// pre-change COALESCE(sent_at, updated_at, now()): with sent_at NULL and an aged
		// non-NULL updated_at, BOTH the old COALESCE and the new CASE return that same
		// updated_at, so every assertion below already passed before the now() fallback was
		// removed. A genuine red-before is unreachable by construction — it would need
		// updated_at NULL too, which the real schema forbids (updated_at is NOT NULL), which
		// is exactly why removing now() is safe. What this test DOES guarantee is that the
		// mapping stays TOTAL for the one anomalous shape (Sent with no sent_at) and yields
		// the row's own aged updated_at, never the migration's fold-time now(). The genuine
		// red-before for the per-status mapping lives in
		// ItShouldTakeUpdatedAtForFailedAndCancelledRowsThatAlsoCarryASentAt, which DOES
		// fail on the old COALESCE.
		var sent = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Sent;
			o.SentAt = null;
		});

		// SaveChanges stamps updated_at to ~now, which would make "not stamped with the
		// migration's runtime" unfalsifiable. Age the row so the two are distinguishable.
		await using (var age = CreateDbContext()) {
			await age.Database.ExecuteSqlAsync(
				$"""
				UPDATE invitation_email_outbox
				SET sent_at = NULL, updated_at = now() - interval '30 days'
				WHERE id = {sent}
				"""
			);
		}

		await using (var db = CreateDbContext()) {
			await RunFoldSqlAsync(db);
		}

		await using var assert = CreateDbContext();
		var source = await assert.InvitationEmailOutbox.AsNoTracking().SingleAsync(o => o.Id == sent);
		source.SentAt.Should().BeNull();

		var log = await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == sent);
		log.Outcome.Should().Be(EmailLogOutcome.LegacySubmissionUnverified);
		log.OccurredAt.Should().Be(source.UpdatedAt, "the fallback is the row's own updated_at");
		log.OccurredAt.Should().NotBeCloseTo(
			DateTime.UtcNow,
			TimeSpan.FromMinutes(1),
			"occurred_at must never be stamped with the migration's runtime"
		);
	}

	[Fact]
	public async Task ItShouldBackCopyAGenuineCancellationCarryingTheFoldSentinelTextButNoFoldMarker() {
		// R2 (major). Fold provenance is read from folded_job_id, NEVER from last_error free
		// text. The legacy dispatcher writes ex.Message into last_error and both cancellation
		// paths PRESERVE it, so a genuinely-Cancelled row can carry ANY string — including
		// the old 'folded to job_queue' sentinel — with NO fold job behind it. Such a row is
		// a real cancellation and MUST be back-copied. The previous compound exclusion
		// (status = 4 AND last_error = sentinel) would have silently erased it from history.
		// folded_job_id is left NULL on every row here: none was folded.
		var genuineCancelledNullError = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Cancelled;
			o.LastError = null;
		});
		// The exact state R2 flagged: Cancelled, carrying the sentinel TEXT, no fold marker.
		var genuineCancelledWithSentinelText = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Cancelled;
			o.LastError = "folded to job_queue";
		});
		var lookalikeFailedWithSentinelText = await SeedOutboxAsync(o => {
			o.Status = InvitationEmailOutboxStatus.Failed;
			o.LastError = "folded to job_queue";
		});

		await using (var db = CreateDbContext()) {
			await RunFoldSqlAsync(db);
		}

		await using var assert = CreateDbContext();
		(await assert.EmailLog.AsNoTracking().SingleAsync(e => e.LegacyOutboxId == genuineCancelledNullError))
			.Outcome.Should().Be(EmailLogOutcome.CancelledIneligible);
		(await assert.EmailLog.AsNoTracking()
			.SingleAsync(e => e.LegacyOutboxId == genuineCancelledWithSentinelText))
			.Outcome.Should().Be(
				EmailLogOutcome.CancelledIneligible,
				"a real cancellation carrying the sentinel text but no fold marker is still history"
			);
		(await assert.EmailLog.AsNoTracking()
			.SingleAsync(e => e.LegacyOutboxId == lookalikeFailedWithSentinelText))
			.Outcome.Should().Be(EmailLogOutcome.PermanentlyFailed);
	}

	[Fact]
	public async Task ItShouldNeverLeaveAFoldJobAndItsSourceRowBothLiveWhenTheDispatcherRacesTheFold() {
		// R1 (merge-blocker). The fold and the still-running legacy dispatcher both act on
		// Pending outbox rows. The dispatcher claims with the REAL
		// InvitationEmailOutboxDispatcher.ClaimBatchAsync — an
		// `UPDATE ... FOR UPDATE SKIP LOCKED` (ROW EXCLUSIVE). The fold reads Pending rows
		// WITHOUT row-locking them and Cancels them in a LATER statement, so interleaved a
		// row can be claimed -> Processing -> sent by the dispatcher AND enqueued as a fold
		// job: the same invitation twice. LockOutboxForFold (SHARE ROW EXCLUSIVE, taken
		// before the first read and held to commit) forbids that final state — SHARE ROW
		// EXCLUSIVE conflicts with the claim's ROW EXCLUSIVE, so the claim blocks until the
		// row is Cancelled and then matches nothing. This drives the REAL ClaimBatchAsync on
		// a second connection, not an imitation.
		var invitationId = await SeedInvitationAsync();

		await using var foldDb = CreateDbContext();
		await using var dispatcherDb = CreateDbContext();

		// Precondition (NOT the assertion): a committed, DUE, Pending row. The integration
		// host registers no live InvitationEmailOutboxDispatcher for any spec
		// (ApiFactory.RemoveWorkerHostedServices), so nothing but this test's own explicit
		// dispatcherDb.ClaimBatchAsync call below can ever claim it — the row is guaranteed
		// Pending under the fold lock on the first and only attempt, which keeps the
		// interleave deterministic without a retry loop.
		var foldTx = await foldDb.Database.BeginTransactionAsync();
		var outboxId = await SeedOutboxAsync(o => {
			o.Kind = InvitationEmailKind.StaffInvitation;
			o.Status = InvitationEmailOutboxStatus.Pending;
			o.InvitationId = invitationId;
			// Due, so the claim predicate (next_attempt_at <= now) matches.
			o.NextAttemptAt = DateTime.UtcNow.AddMinutes(-1);
		});

		await ExecRawAsync(foldDb, AddEmailLogAndFoldEmailOutboxSql.LockOutboxForFold);

		var statusUnderLock = await foldDb.InvitationEmailOutbox.AsNoTracking()
			.Where(o => o.Id == outboxId)
			.Select(o => o.Status)
			.SingleAsync();
		statusUnderLock.Should().Be(
			InvitationEmailOutboxStatus.Pending,
			"nothing else in the integration host can have claimed this row before the fold lock"
		);

		List<Guid> claimed;
		try {
			// Fold up to just before the Cancel: back-copy (a no-op for a Pending row) +
			// enqueue the fold job. The row is committed-Pending and not row-locked here.
			await ExecRawAsync(foldDb, AddEmailLogAndFoldEmailOutboxSql.BackCopyTerminalHistory);
			await ExecRawAsync(foldDb, AddEmailLogAndFoldEmailOutboxSql.FoldPendingRows);

			// The dispatcher's real claim on its own connection, concurrent with the open
			// fold transaction. With the lock held it BLOCKS; without it (red control) it
			// claims the row at once.
			var claimTask = Task.Run(async () =>
				await InvitationEmailOutboxDispatcher.ClaimBatchAsync(dispatcherDb, default));

			// An UNBLOCKED claim (unlocked code) completes here and wins the row before the
			// fold Cancels it. A BLOCKED claim (locked code) cannot complete until the commit
			// below, so this delay simply elapses.
			await Task.WhenAny(claimTask, Task.Delay(TimeSpan.FromSeconds(3)));

			await ExecRawAsync(foldDb, AddEmailLogAndFoldEmailOutboxSql.CancelFoldedPendingRows);
			await foldTx.CommitAsync();

			claimed = await claimTask;
		} finally {
			await foldTx.DisposeAsync();
		}

		await using var assert = CreateDbContext();
		(await assert.JobQueue.AsNoTracking().AnyAsync(j => j.IdempotencyKey == $"fold:{outboxId}"))
			.Should().BeTrue("the Pending row is folded into a job");

		var sourceStatus = await OutboxStatusAsync(assert, outboxId);

		// THE INVARIANT: with a fold job live for this row, the source row must not also be
		// owned by the legacy path (Processing = claimed and about to send; Sent = sent).
		sourceStatus.Should().NotBe(
			InvitationEmailOutboxStatus.Processing,
			"a fold job exists for this row; the dispatcher must not also have claimed it"
		);
		sourceStatus.Should().NotBe(
			InvitationEmailOutboxStatus.Sent,
			"a fold job exists for this row; the legacy path must not also send it"
		);
		sourceStatus.Should().Be(InvitationEmailOutboxStatus.Cancelled);
		claimed.Should().NotContain(
			outboxId,
			"the dispatcher's claim must have been serialized behind the fold and found the row Cancelled"
		);
	}

	[Fact]
	public void ItShouldThrowOnDownBecauseTheEmailFoldIsAOneWayDataMigration() {
		// F1 (major) regression. The old Down() dropped folded_job_id while leaving the
		// one-way fold in place (source rows Cancelled, jobs created). A downgrade then a
		// re-Up() re-added the column NULL, and BackCopyTerminalHistory (which excludes on
		// `folded_job_id IS NULL`) then manufactured false CancelledIneligible history for a
		// row whose real outcome is its fold job. The fix makes the migration explicitly
		// irreversible: Down() throws BEFORE emitting any operation, so that downgrade/re-Up
		// provenance-corruption path is unreachable. This test is the enforcing artefact —
		// it proves Down() aborts rather than performing the destructive structural rollback.
		var migration = new IrreversibleDownProbe();

		var act = () => migration.InvokeDown();

		act.Should().Throw<NotSupportedException>()
			.WithMessage("*one-way data migration*")
			.WithMessage("*cannot be rolled back*");
	}

	// Exposes the migration's protected Down() so the F1-irreversibility invariant is
	// testable. Lives in the test assembly and carries no [Migration] attribute, so EF's
	// migrations assembly (the API assembly) never discovers it.
	private sealed class IrreversibleDownProbe : AddEmailLogAndFoldEmailOutbox {
		public void InvokeDown() {
			Down(new MigrationBuilder(activeProvider: null));
		}
	}

	private static async Task RunFoldSqlAsync(AppDbContext db, int? failAfterStep = null) {
		string[] steps = [
			AddEmailLogAndFoldEmailOutboxSql.LockOutboxForFold,
			AddEmailLogAndFoldEmailOutboxSql.BackCopyTerminalHistory,
			AddEmailLogAndFoldEmailOutboxSql.FoldPendingRows,
			AddEmailLogAndFoldEmailOutboxSql.CancelFoldedPendingRows,
			AddEmailLogAndFoldEmailOutboxSql.CancelPendingRowsWithoutInvitation
		];

		await using var transaction = await db.Database.BeginTransactionAsync();
		try {
			for (var index = 0; index < steps.Length; index++) {
				await ExecRawAsync(db, steps[index]);
				if (failAfterStep == index + 1) {
					throw new InvalidOperationException("forced mid-fold failure");
				}
			}

			await transaction.CommitAsync();
		} catch {
			await transaction.RollbackAsync();
			throw;
		}
	}

	// ADO avoids composite-format parsing of regex braces and explicitly enlists every
	// shared migration statement in the test transaction.
	private static async Task ExecRawAsync(AppDbContext db, string sql) {
		var connection = db.Database.GetDbConnection();
		if (connection.State != ConnectionState.Open) {
			await connection.OpenAsync();
		}

		await using var command = connection.CreateCommand();
		command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
		command.CommandText = sql;
		await command.ExecuteNonQueryAsync();
	}

	private static Guid? PayloadGuid(string payload, string property) {
		using var document = JsonDocument.Parse(payload);
		return document.RootElement.TryGetProperty(property, out var value)
			&& value.TryGetGuid(out var guid)
			? guid
			: null;
	}

	private static async Task<InvitationEmailOutboxStatus> OutboxStatusAsync(
		AppDbContext db,
		Guid id
	) {
		var row = await db.InvitationEmailOutbox.AsNoTracking().SingleAsync(o => o.Id == id);
		return row.Status;
	}

	private async Task<Guid> SeedInvitationAsync() {
		await using var db = CreateDbContext();
		var inviter = new User {
			Email = $"inviter-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true
		};
		db.User.Add(inviter);
		await db.SaveChangesAsync();

		var invitation = Invitation.CreateStaffInvitationWithProfiles(
			$"invitee-{Guid.NewGuid():N}@example.com",
			new List<Guid>(),
			inviter.GetRequiredId(),
			DateTime.UtcNow.AddDays(7),
			$"tok-{Guid.NewGuid():N}"
		);
		invitation.ValidateInvitationType();
		db.Invitation.Add(invitation);
		await db.SaveChangesAsync();
		return invitation.GetRequiredId();
	}

	private async Task<Guid> SeedOutboxAsync(Action<InvitationEmailOutbox> configure) {
		await using var db = CreateDbContext();
		var row = new InvitationEmailOutbox {
			Email = $"folded-{Guid.NewGuid():N}@example.com",
			Kind = InvitationEmailKind.StaffInvitation,
			Token = $"tok-{Guid.NewGuid():N}",
			NextAttemptAt = DateTime.UtcNow
		};
		configure(row);
		db.InvitationEmailOutbox.Add(row);
		await db.SaveChangesAsync();
		return row.GetRequiredId();
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
}
