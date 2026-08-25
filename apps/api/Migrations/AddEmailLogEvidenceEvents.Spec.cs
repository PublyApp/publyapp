using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Messaging.Entities;

using Xunit;

namespace PublyApp.Api.Migrations;

// Pins the #866/K-6 evidence schema: email_log_evidence_events is the actor-less-but-
// actor-NAMING append-only evidence table for §4.4's provider-evidence transitions —
// the job_dead_letter_events (R10-3/O30) shape applied to email_log. Expand-only:
// no changes to existing tables. The two structural facts that close #866 are pinned
// here at the database level:
//   - the author columns (actor_kind, actor_id) are NOT NULL text — an author is
//     always named, and there is NO users FK anywhere on the table;
//   - evidence dies with its subject: FK CASCADE to email_log.
public sealed class AddEmailLogEvidenceEventsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AddEmailLogEvidenceEventsSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldCreateTheEvidenceTableWithRequiredActorColumnsAndCascadeToEmailLog() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var columnStates = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT string_agg(column_name || '=' || is_nullable || ':' || data_type, ', ' ORDER BY column_name) AS "Value"
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'email_log_evidence_events'
				AND column_name IN (
					'event', 'actor_kind', 'actor_id',
					'prior_outcome', 'new_outcome', 'details'
				)
			"""
		).SingleAsync();

		columnStates.Should().Be(
			"actor_id=NO:text, actor_kind=NO:text, details=NO:jsonb, "
			+ "event=NO:text, new_outcome=NO:integer, prior_outcome=NO:integer",
			"every evidence row names its author — actor_kind/actor_id are NOT NULL "
			+ "('NO' in information_schema.is_nullable) text, and no column carries a "
			+ "user id (#866/K-6)"
		);
	}

	[Fact]
	public async Task ItShouldCarryNoForeignKeyToUsersAndCascadeToItsEmailLogSubject() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var foreignKeys = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT string_agg(confrelid::regclass::text || ':' || confdeltype::text, ', ' ORDER BY confrelid::regclass::text) AS "Value"
			FROM pg_constraint
			WHERE contype = 'f'
				AND conrelid = 'email_log_evidence_events'::regclass
			"""
		).SingleAsync();

		foreignKeys.Should().Be(
			"email_log:c",
			"exactly one FK exists — CASCADE (c) to the email_log row the evidence "
			+ "describes; there is deliberately NO FK to users (#866/K-6)"
		);
	}

	[Fact]
	public async Task ItShouldIndexTheEvidenceHistoryByItsSubjectAndTime() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var indexDef = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ix_email_log_evidence_events_email_log_id'
			"""
		).SingleAsync();

		indexDef.Should().Contain("(email_log_id, occurred_at)",
			"the covering index serves the per-subject history reconstruction "
			+ "(dashboard rebuilds the timeline from evidence)");
	}

	// --- #866 round-1: the actor invariants hold even against raw-SQL writers ------

	[Fact]
	public async Task ItShouldEnforceTheActorInvariantsWithDatabaseCheckConstraints() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var checkConstraints = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT string_agg(conname, ', ' ORDER BY conname) AS "Value"
			FROM pg_constraint
			WHERE contype = 'c'
				AND conrelid = 'email_log_evidence_events'::regclass
				AND conname LIKE 'ck_email_log_evidence_events_%'
			"""
		).SingleAsync();

		checkConstraints.Should().Be(
			"ck_email_log_evidence_events_actor_id, ck_email_log_evidence_events_actor_kind",
			"the author columns are bounded at the DATABASE level: actor_kind is the "
			+ "EmailLogActorKinds vocabulary and actor_id is non-empty and <= 512 — "
			+ "mirroring the EmailLogActor constructor invariants (#866 round-1)"
		);
	}

	[Fact]
	public async Task ItShouldRejectARawInsertWithAnEmptyActorIdNamingTheCheckConstraint() {
		var jobId = await SeedEmailLogAsync();
		try {
			var emailLogId = await GetEmailLogIdAsync(jobId);

			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var connection = dbContext.Database.GetDbConnection();
			await connection.OpenAsync();

			await using var command = connection.CreateCommand();
			command.CommandText = """
				INSERT INTO email_log_evidence_events
					(email_log_id, event, actor_kind, actor_id, prior_outcome, new_outcome, details)
				VALUES (@email_log_id, 'provider_acceptance_confirmed', 'provider_webhook', '', 0, 0, '{}')
				""";
			var emailLogIdParam = command.CreateParameter();
			emailLogIdParam.ParameterName = "email_log_id";
			emailLogIdParam.Value = emailLogId;
			command.Parameters.Add(emailLogIdParam);

			var insert = async () => await command.ExecuteNonQueryAsync();

			var violation = await insert.Should().ThrowAsync<System.Data.Common.DbException>(
				"even a raw-SQL writer must not persist an unnamed author — the empty "
				+ "actor_id violates ck_email_log_evidence_events_actor_id (#866 round-1)"
			);
			violation.And.Message.Should().Contain(
				"ck_email_log_evidence_events_actor_id",
				"the failure shows its cause in plain words: which invariant refused the row"
			);
		} finally {
			await CleanupAsync(jobId);
		}
	}

	// --- #866 round-1 finding 3: the EXPLICIT replay index on the evidence table ----

	[Fact]
	public async Task ItShouldUniquelyIndexTheProviderEventIdOnTheEvidenceRows() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var indexDef = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ux_email_log_evidence_events_provider_event_id'
			"""
		).SingleAsync();

		indexDef.Should().Contain("UNIQUE", "the replay guard is a UNIQUE index");
		indexDef.Should().Contain("(provider_event_id)",
			"the same provider event can justify at most ONE evidence row");
		indexDef.Should().Contain("WHERE (provider_event_id IS NOT NULL)",
			"partial: non-provider events carry no correlation id — same shape as "
			+ "ux_email_log_provider_event_id on email_log (#866 round-1 finding 3)");
	}

	[Fact]
	public async Task ItShouldRejectARawDuplicateProviderEventIdOnTheEvidenceTable() {
		var jobId = await SeedEmailLogAsync();
		try {
			var emailLogId = await GetEmailLogIdAsync(jobId);

			await using var scope = _fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var connection = dbContext.Database.GetDbConnection();
			await connection.OpenAsync();

			async Task InsertAsync(string evidenceEvent) {
				await using var command = connection.CreateCommand();
				command.CommandText = """
					INSERT INTO email_log_evidence_events
						(email_log_id, event, actor_kind, actor_id, prior_outcome,
						 new_outcome, details, provider_event_id)
					VALUES (@email_log_id, @event, 'provider_webhook', 'evt-dup', 0, 0, '{}',
						'evt-replayed-id')
					""";
				var emailLogIdParam = command.CreateParameter();
				emailLogIdParam.ParameterName = "email_log_id";
				emailLogIdParam.Value = emailLogId;
				command.Parameters.Add(emailLogIdParam);
				var eventParam = command.CreateParameter();
				eventParam.ParameterName = "event";
				eventParam.Value = evidenceEvent;
				command.Parameters.Add(eventParam);
				await command.ExecuteNonQueryAsync();
			}

			await InsertAsync("first");

			var duplicate = async () => await InsertAsync("second");

			var violation = await duplicate.Should().ThrowAsync<System.Data.Common.DbException>(
				"a second evidence row for the SAME provider event id is exactly the "
				+ "replay ux_email_log_evidence_events_provider_event_id exists to "
				+ "refuse — even for raw-SQL writers (#866 round-1 finding 3)"
			);
			violation.And.Message.Should().Contain(
				"ux_email_log_evidence_events_provider_event_id",
				"the failure names the index that refused the duplicate"
			);
		} finally {
			await CleanupAsync(jobId);
		}
	}

	// --- helpers -------------------------------------------------------------------

	private async Task<Guid> SeedEmailLogAsync() {
		var jobId = Guid.NewGuid();
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		dbContext.EmailLog.Add(new EmailLog {
			JobId = jobId,
			Kind = EmailKind.TenantInvitation,
			Recipient = $"evidence-check-{jobId:N}@example.com",
			Outcome = EmailLogOutcome.LegacySubmissionUnverified,
			Attempts = 1,
		});
		await dbContext.SaveChangesAsync();

		return jobId;
	}

	private async Task<Guid> GetEmailLogIdAsync(Guid jobId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var id = await dbContext.EmailLog
			.Where(entry => entry.JobId == jobId)
			.Select(entry => entry.Id)
			.SingleAsync();
		return id.Value;
	}

	private async Task CleanupAsync(Guid jobId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		await dbContext.EmailLog
			.Where(entry => entry.JobId == jobId)
			.ExecuteDeleteAsync();
	}
}
