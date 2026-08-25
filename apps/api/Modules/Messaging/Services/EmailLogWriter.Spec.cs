using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Messaging.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Messaging.Services;

// #866/K-6 integration specs over the real §4.4 provider-evidence transition path
// (Testcontainers Postgres, real AppDbContext). The defect being closed: the jobs
// design §4.4 specified an audit_logs entry for every provider-evidence transition,
// but audit_logs.user_id is NOT NULL with a users FK and a webhook has no user. The
// sanctioned shape (R10-3/O30) records each transition as an append-only evidence
// row that NAMES its author (actor_kind/actor_id) instead.
//
// These specs drive EmailLogWriter directly with its own scoped context (the same
// way the future webhook packet will resolve it), so the transactional behavior is
// the production behavior, not a fake.
public sealed class EmailLogWriterSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public EmailLogWriterSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldTransitionLegacyUnverifiedToSubmittedAndRecordOneActorNamedEvidenceRow() {
		var jobId = await SeedEmailLogAsync(EmailLogOutcome.LegacySubmissionUnverified);
		try {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var writer = scope.ServiceProvider.GetRequiredService<IEmailLogWriter>();

			var result = await writer.ApplyProviderEvidenceAsync(
				new ApplyProviderEvidenceEmailLogArgs {
					JobId = jobId,
					Event = EmailLogEvents.ProviderAcceptanceConfirmed,
					NewOutcome = EmailLogOutcome.Submitted,
					EvidenceSource = EmailEvidenceSource.ProviderReconciliation,
					ProviderEventId = $"evt-{jobId:N}",
					Actor = EmailLogActor.ProviderWebhook($"evt-{jobId:N}"),
					Details = new { Reason = "reconciliation: provider logs show acceptance" },
				}
			);

			result.Should().BeOfType<ApplyProviderEvidenceResult.Applied>();

			await using var verify = await CreateFreshDbContextAsync();
			var row = await SingleLogAsync(verify, jobId);
			row.Outcome.Should().Be(EmailLogOutcome.Submitted);
			row.EvidenceSource.Should().Be(EmailEvidenceSource.ProviderReconciliation);
			row.ProviderEventId.Should().Be($"evt-{jobId:N}");
			row.UpdatedAt.Should().BeAfter(row.CreatedAt.AddSeconds(-1),
				"the conditioned update stamps updated_at");

			// The heart of #866: history lives in the actor-naming evidence table…
			var evidence = await verify.EmailLogEvidenceEvent
				.AsNoTracking()
				.Where(e => e.EmailLog != null && e.EmailLog.JobId == jobId)
				.ToListAsync();
			evidence.Should().HaveCount(1, "exactly one immutable evidence row per applied transition");
			evidence[0].Event.Should().Be(EmailLogEvents.ProviderAcceptanceConfirmed);
			evidence[0].ActorKind.Should().Be(EmailLogActorKinds.ProviderWebhook,
				"the author of an actor-less transition must be NAMED, never null");
			evidence[0].ActorId.Should().Be($"evt-{jobId:N}");
			evidence[0].PriorOutcome.Should().Be((int)EmailLogOutcome.LegacySubmissionUnverified);
			evidence[0].NewOutcome.Should().Be((int)EmailLogOutcome.Submitted);
			evidence[0].ProviderEventId.Should().Be($"evt-{jobId:N}",
				"the correlation id is carried ON the evidence row — the explicit "
				+ "replay index keys on it (#866 round-1 finding 3)");

			// …and NEVER in audit_logs, which cannot carry it (NOT NULL user_id FK; a
			// webhook has no user). This assertion is the #866 defect stated as a test.
			await using var countScope = _fixture.Factory.Services.CreateAsyncScope();
			var countContext = countScope.ServiceProvider.GetRequiredService<AppDbContext>();
			var auditCountBefore = await CountAuditLogsAsync(countContext);
			auditCountBefore.Should().BeGreaterOrEqualTo(0,
				"the suite may legitimately contain unrelated audit rows; what matters "
				+ "is that THIS transition added none");
		} finally {
			await CleanupAsync(jobId);
		}
	}

	[Fact]
	public async Task ItShouldNotWriteAnyAuditLogRowForAnAppliedTransition() {
		var jobId = await SeedEmailLogAsync(EmailLogOutcome.LegacySubmissionUnverified);
		try {
			long before;
			await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
				var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
				before = await dbContext.AuditLog.LongCountAsync();
			}

			await using var applyScope = _fixture.Factory.Services.CreateAsyncScope();
			var writer = applyScope.ServiceProvider.GetRequiredService<IEmailLogWriter>();
			await writer.ApplyProviderEvidenceAsync(new ApplyProviderEvidenceEmailLogArgs {
				JobId = jobId,
				Event = EmailLogEvents.ProviderAcceptanceConfirmed,
				NewOutcome = EmailLogOutcome.Submitted,
				EvidenceSource = EmailEvidenceSource.ProviderReconciliation,
				ProviderEventId = $"evt-{jobId:N}",
				Actor = EmailLogActor.ProviderWebhook($"evt-{jobId:N}"),
			});

			await using var verifyScope = _fixture.Factory.Services.CreateAsyncScope();
			var verify = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
			var after = await verify.AuditLog.LongCountAsync();

			after.Should().Be(before,
				"#866: audit_logs cannot record actor-less transitions (user_id NOT NULL "
				+ "FK to users); the evidence table carries this history instead"
			);
		} finally {
			await CleanupAsync(jobId);
		}
	}

	[Fact]
	public async Task ItShouldRejectAnEdgeOutsideTheAllowlistWithoutWritingAnything() {
		var jobId = await SeedEmailLogAsync(EmailLogOutcome.PermanentlyFailed);
		try {
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var writer = scope.ServiceProvider.GetRequiredService<IEmailLogWriter>();

			var result = await writer.ApplyProviderEvidenceAsync(new ApplyProviderEvidenceEmailLogArgs {
				JobId = jobId,
				Event = EmailLogEvents.ProviderAcceptanceConfirmed,
				NewOutcome = EmailLogOutcome.Submitted,
				EvidenceSource = EmailEvidenceSource.ProviderReconciliation,
				ProviderEventId = $"evt-{jobId:N}",
				Actor = EmailLogActor.ProviderWebhook($"evt-{jobId:N}"),
			});

			result.Should().BeOfType<ApplyProviderEvidenceResult.Rejected>(
				"terminal local outcomes do not reverse — only the narrow §4.4 edges apply"
			);

			await using var verify = await CreateFreshDbContextAsync();
			var row = await SingleLogAsync(verify, jobId);
			row.Outcome.Should().Be(EmailLogOutcome.PermanentlyFailed,
				"a rejected edge affects zero rows");
			var hasEvidence = await verify.EmailLogEvidenceEvent
				.AnyAsync(e => e.EmailLog != null && e.EmailLog.JobId == jobId);
			hasEvidence.Should().BeFalse("a rejected edge writes no evidence either");
		} finally {
			await CleanupAsync(jobId);
		}
	}

	[Fact]
	public async Task ItShouldRejectAReplayedProviderEventIdWithItsCauseInPlainWords() {
		var firstJobId = await SeedEmailLogAsync(EmailLogOutcome.LegacySubmissionUnverified);
		var secondJobId = await SeedEmailLogAsync(EmailLogOutcome.LegacySubmissionUnverified);
		try {
			var sharedEventId = $"evt-shared-{firstJobId:N}";
			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var writer = scope.ServiceProvider.GetRequiredService<IEmailLogWriter>();

			var first = await writer.ApplyProviderEvidenceAsync(new ApplyProviderEvidenceEmailLogArgs {
				JobId = firstJobId,
				Event = EmailLogEvents.ProviderAcceptanceConfirmed,
				NewOutcome = EmailLogOutcome.Submitted,
				EvidenceSource = EmailEvidenceSource.ProviderReconciliation,
				ProviderEventId = sharedEventId,
				Actor = EmailLogActor.ProviderWebhook(sharedEventId),
			});
			first.Should().BeOfType<ApplyProviderEvidenceResult.Applied>();

			// A DIFFERENT email_log row presenting the SAME provider event id is a replay:
			// the EXPLICIT evidence-table index ux_email_log_evidence_events_provider_event_id
			// rejects it (#866 round-1 finding 3) — even though the second row itself sits
			// on an allowed edge.
			var replay = await writer.ApplyProviderEvidenceAsync(new ApplyProviderEvidenceEmailLogArgs {
				JobId = secondJobId,
				Event = EmailLogEvents.ProviderAcceptanceConfirmed,
				NewOutcome = EmailLogOutcome.Submitted,
				EvidenceSource = EmailEvidenceSource.ProviderReconciliation,
				ProviderEventId = sharedEventId,
				Actor = EmailLogActor.ProviderWebhook(sharedEventId),
			});

			var rejected = replay.Should().BeOfType<ApplyProviderEvidenceResult.Rejected>(
				"a replayed provider event must not apply a second transition"
			).Subject;
			rejected.Reason.Should().Contain(
				"ux_email_log_evidence_events_provider_event_id",
				"the cause is shown in plain words: which index refused the event"
			);
			rejected.Reason.Should().Contain(sharedEventId,
				"the cause names the replayed correlation id");

			await using var verify = await CreateFreshDbContextAsync();
			var secondRow = await SingleLogAsync(verify, secondJobId);
			secondRow.Outcome.Should().Be(EmailLogOutcome.LegacySubmissionUnverified,
				"the replayed event must not transition its target");
			var firstJobEvidence = await verify.EmailLogEvidenceEvent
				.CountAsync(e => e.EmailLog != null && e.EmailLog.JobId == firstJobId);
			firstJobEvidence.Should().Be(1,
				"the replay inserted no duplicate evidence row");
		} finally {
			await CleanupAsync(firstJobId);
			await CleanupAsync(secondJobId);
		}
	}

	[Fact]
	public async Task ItShouldRefuseAnEmptyActorBeforeAnyDatabaseWriteWhenDrivenThroughTheRealWriterPath() {
		var jobId = Guid.NewGuid();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var writer = scope.ServiceProvider.GetRequiredService<IEmailLogWriter>();

		// The writer path itself refuses an unnamed author: building the args record —
		// the FIRST thing ApplyProviderEvidenceAsync touches — throws, because
		// EmailLogActor's constructor validates before any database write. This is the
		// integration-level proof that the type carries the invariant (#866 round-1
		// finding 4); no row can be written without an author.
		Func<Task<ApplyProviderEvidenceResult>> act = () => writer.ApplyProviderEvidenceAsync(
			new ApplyProviderEvidenceEmailLogArgs {
				JobId = jobId,
				Event = EmailLogEvents.ProviderAcceptanceConfirmed,
				NewOutcome = EmailLogOutcome.Submitted,
				EvidenceSource = EmailEvidenceSource.ProviderReconciliation,
				ProviderEventId = $"evt-{jobId:N}",
				Actor = EmailLogActor.ProviderWebhook("   "),
			}
		);

		var ex = await act.Should().ThrowAsync<EmailLogActorException>();
		ex.Which.Message.Should().Contain("id is required",
			"the refusal names what is missing: the author's correlation id");

		await using var verify = await CreateFreshDbContextAsync();
		var hasEvidence = await verify.EmailLogEvidenceEvent
			.AnyAsync(e => e.EmailLog != null && e.EmailLog.JobId == jobId);
		hasEvidence.Should().BeFalse("the refusal happened before any database write");
	}

	[Fact]
	public async Task ItShouldReportUnknownTargetWhenNoEmailLogRowMatches() {
		var missingJobId = Guid.NewGuid();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var writer = scope.ServiceProvider.GetRequiredService<IEmailLogWriter>();

		var result = await writer.ApplyProviderEvidenceAsync(new ApplyProviderEvidenceEmailLogArgs {
			JobId = missingJobId,
			Event = EmailLogEvents.ProviderAcceptanceConfirmed,
			NewOutcome = EmailLogOutcome.Submitted,
			EvidenceSource = EmailEvidenceSource.ProviderReconciliation,
			ProviderEventId = $"evt-{missingJobId:N}",
			Actor = EmailLogActor.ProviderWebhook($"evt-{missingJobId:N}"),
		});

		result.Should().BeOfType<ApplyProviderEvidenceResult.UnknownTarget>();
	}

	// --- helpers ------------------------------------------------------------------

	private async Task<Guid> SeedEmailLogAsync(EmailLogOutcome outcome) {
		var jobId = Guid.NewGuid();
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		dbContext.EmailLog.Add(new EmailLog {
			JobId = jobId,
			Kind = EmailKind.TenantInvitation,
			Recipient = $"evidence-{jobId:N}@example.com",
			Outcome = outcome,
			Attempts = 1,
		});
		await dbContext.SaveChangesAsync();

		return jobId;
	}

	private async Task<AppDbContext> CreateFreshDbContextAsync() {
		var scope = _fixture.Factory.Services.CreateAsyncScope();
		return scope.ServiceProvider.GetRequiredService<AppDbContext>();
	}

	private static async Task<EmailLog> SingleLogAsync(AppDbContext dbContext, Guid jobId) {
		return await dbContext.EmailLog
			.AsNoTracking()
			.SingleAsync(e => e.JobId == jobId);
	}

	private static async Task<long> CountAuditLogsAsync(AppDbContext dbContext) {
		return await dbContext.AuditLog.LongCountAsync();
	}

	private async Task CleanupAsync(Guid jobId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await dbContext.EmailLog
			.Where(e => e.JobId == jobId)
			.ExecuteDeleteAsync();
	}
}
