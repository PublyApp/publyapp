using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Entities;

using Xunit;

namespace PublyApp.Api.Migrations;

public sealed class AddSystemJobSweepIndexesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AddSystemJobSweepIndexesSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldApplyEverySweepAndMonitorIndex() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var indexNames = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexname AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
			"""
		).ToListAsync();

		indexNames.Should().Contain([
			"ix_sessions_expires_at_id",
			"ix_email_log_occurred_at_id",
			"ix_job_dead_letter_failed_at_id",
			"ix_job_dead_letter_original_job_id",
			"ix_email_prepared_sends_prepared_at_job_id",
			"ix_email_log_permanently_failed_occurred_at",
		]);

		var originalJobIdIndex = dbContext.Model
			.FindEntityType(typeof(JobDeadLetter))
			?.GetIndexes()
			.SingleOrDefault(index =>
				index.GetDatabaseName() == "ix_job_dead_letter_original_job_id"
			);
		originalJobIdIndex.Should().NotBeNull();
		if (originalJobIdIndex is null) {
			throw new InvalidOperationException("Original-job index metadata was missing.");
		}

		originalJobIdIndex.Properties.Select(property => property.Name)
			.Should().Equal(nameof(JobDeadLetter.OriginalJobId));

		var originalJobIdDefinition = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ix_job_dead_letter_original_job_id'
			"""
		).SingleAsync();

		originalJobIdDefinition.Should().Contain("(original_job_id)");

		var partialDefinition = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ix_email_log_permanently_failed_occurred_at'
			"""
		).SingleAsync();

		partialDefinition.Should().Contain(
			$"WHERE (outcome = {(int)EmailLogOutcome.PermanentlyFailed})"
		);
	}
}
