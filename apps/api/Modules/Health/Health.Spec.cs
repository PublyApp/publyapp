
using System.Net;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Modules.Health;
/// <summary>
/// Integration tests for the health endpoint.
/// </summary>
public sealed class HealthSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;

	public HealthSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
	}

	[Fact]
	public async Task ItShouldReturnReadyOnBothReadinessRoutesWhenAllMigrationsAreApplied() {
		var readyResponse = await _Http.GetAsync("/health/ready");
		var aliasResponse = await _Http.GetAsync("/health");

		readyResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);
		aliasResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task ItShouldReturnLiveAndNotReadyWhenAMigrationIsPending() {
		using var scope = _Fixture.Factory.Services.CreateScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var migrations = dbContext.Database.GetMigrations().ToList();
		migrations.Should().HaveCountGreaterThan(1);

		var migrator = dbContext.Database.GetService<IMigrator>();
		var previousMigration = migrations[^2];
		var latestMigration = migrations[^1];

		await migrator.MigrateAsync(previousMigration);
		try {
			var liveResponse = await _Http.GetAsync("/health/live");
			var readyResponse = await _Http.GetAsync("/health/ready");

			liveResponse.StatusCode.Should()
				.Be(HttpStatusCode.OK);
			readyResponse.StatusCode.Should()
				.Be(HttpStatusCode.ServiceUnavailable);
		} finally {
			await migrator.MigrateAsync(latestMigration);
		}
	}
}
