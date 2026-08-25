using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Migrations;

// Pins the #864/K-2 triage schema: three nullable acknowledgement columns on
// job_dead_letter plus the partial index serving both untriaged-Missing counters
// (the retention sweep's held-row report and the monitor's dlq_untriaged_missing
// alert). Expand-only by design — no NOT NULL, no drops — so it is safe under a
// rolling deploy (ci-migration-expand-contract).
public sealed class AddDeadLetterTriageSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AddDeadLetterTriageSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldAddNullableTriageColumnsAndTheUntriagedMissingIndex() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var columnStates = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT string_agg(column_name || '=' || is_nullable, ', ' ORDER BY column_name) AS "Value"
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'job_dead_letter'
				AND column_name IN ('triaged_at', 'triaged_by', 'triage_note')
			"""
		).SingleAsync();

		columnStates.Should().Be(
			"triage_note=YES, triaged_at=YES, triaged_by=YES",
			"an un-triaged row is the default state — every existing row must start NULL"
		);

		var untriagedIndex = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ix_job_dead_letter_untriaged_missing'
			"""
		).SingleAsync();

		untriagedIndex.Should().Contain("(failed_at)");
		untriagedIndex.Should().Contain(
			"WHERE ((triaged_at IS NULL)",
			"the index covers exactly the rows retention holds back"
		);
	}
}
