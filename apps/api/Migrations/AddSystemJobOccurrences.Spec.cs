using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Migrations;

public sealed class AddSystemJobOccurrencesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AddSystemJobOccurrencesSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldCreateTheOccurrenceLedgerAndScheduleEpochShape() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tableExists = await dbContext.Database.SqlQuery<bool>(
			$"SELECT to_regclass('public.system_job_occurrences') IS NOT NULL AS \"Value\""
		).SingleAsync();
		tableExists.Should().BeTrue();

		var primaryKeyColumns = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT attribute.attname AS "Value"
			FROM pg_constraint constraint_row
			JOIN unnest(constraint_row.conkey) WITH ORDINALITY key_column(attnum, position)
				ON true
			JOIN pg_attribute attribute
				ON attribute.attrelid = constraint_row.conrelid
				AND attribute.attnum = key_column.attnum
			WHERE constraint_row.conrelid = 'system_job_occurrences'::regclass
				AND constraint_row.contype = 'p'
			ORDER BY key_column.position
			"""
		).ToListAsync();
		primaryKeyColumns.Should().Equal("job_key", "scheduled_fire_at");

		var scheduledFireIndex = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT indexdef AS "Value"
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND indexname = 'ix_system_job_occurrences_scheduled_fire_at'
			"""
		).SingleAsync();
		scheduledFireIndex.Should().Contain("(scheduled_fire_at)");

		var scheduleEpoch = await dbContext.Database.SqlQuery<string>(
			$"""
			SELECT data_type || ':' || is_nullable || ':' || column_default AS "Value"
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'system_job_definitions'
				AND column_name = 'schedule_epoch'
			"""
		).SingleAsync();
		scheduleEpoch.Should().StartWith("uuid:NO:");
		scheduleEpoch.Should().Contain("gen_random_uuid()");
	}
}
