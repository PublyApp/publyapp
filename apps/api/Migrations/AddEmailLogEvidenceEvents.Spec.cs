using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

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
}
