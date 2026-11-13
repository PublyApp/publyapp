using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Migrations;

// #2282: the migration is expand-only (one nullable column) and backfills it from the
// newest ordinary session still stored. Dedicated throwaway database: the assertion is
// about the state TRANSITION, so the shared per-class template cannot be used.
public sealed class AddUserLastSignInAtSpec : IAsyncLifetime {
	private const string _PreviousMigrationId = "20261112080001_AddPostSegmentMediaAssets";

	private PostgresContainerFixture? _ContainerFixture;
	private string? _DbName;
	private string? _ConnectionString;

	public async Task InitializeAsync() {
		this._ContainerFixture = await PostgresContainerFixture.GetSharedAsync();
		this._DbName = $"migtest_{Guid.NewGuid():N}";
		await using var adminConn = new NpgsqlConnection(this._ContainerFixture.Required().AdminConnectionString);
		await adminConn.OpenAsync();
		await using (var createCmd = new NpgsqlCommand($"CREATE DATABASE {this._DbName}", adminConn)) {
			await createCmd.ExecuteNonQueryAsync();
		}

		this._ConnectionString = new NpgsqlConnectionStringBuilder(
			this._ContainerFixture.Required().AdminConnectionString
		) {
			Database = this._DbName.Required(),
			Pooling = false,
		}.ConnectionString;
	}

	public async Task DisposeAsync() {
		NpgsqlConnection.ClearAllPools();
		await using var adminConn = new NpgsqlConnection(this._ContainerFixture.Required().AdminConnectionString);
		await adminConn.OpenAsync();
		await using var dropCmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS {this._DbName}", adminConn);
		await dropCmd.ExecuteNonQueryAsync();
	}

	[Fact]
	public async Task ItShouldBackfillTheLastSignInFromTheNewestStoredSession() {
		await using var db = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(this._ConnectionString.Required()).Options
		);
		var migrator = db.GetService<IMigrator>();
		await migrator.MigrateAsync(AddUserLastSignInAtSpec._PreviousMigrationId);

		var withSessions = Guid.NewGuid();
		var withoutSessions = Guid.NewGuid();
		var older = DateTime.UtcNow.AddDays(-5);
		var newer = DateTime.UtcNow.AddDays(-2);
		_ = await db.Database.ExecuteSqlAsync($"""
			INSERT INTO users (id, email, password, status, is_verified, created_at, updated_at, is_deleted)
			VALUES
				({withSessions}, {$"a-{withSessions:N}@example.com"}, 'unused', 40, true, now(), now(), false),
				({withoutSessions}, {$"b-{withoutSessions:N}@example.com"}, 'unused', 40, true, now(), now(), false)
			""");
		_ = await db.Database.ExecuteSqlAsync($"""
			INSERT INTO sessions (user_id, token, expires_at, is_impersonation, created_at, updated_at)
			VALUES
				({withSessions}, {$"t1-{withSessions:N}"}, now() + interval '1 day', false, {older}, {older}),
				({withSessions}, {$"t2-{withSessions:N}"}, now() + interval '1 day', false, {newer}, {newer})
			""");

		var applyRemaining = async () => await migrator.MigrateAsync();
		await applyRemaining.Should().NotThrowAsync("the migration only adds a nullable column");

		var lastSignIns = await db.User
			.IgnoreQueryFilters()
			.AsNoTracking()
			.Where(user => user.Id == withSessions || user.Id == withoutSessions)
			.ToDictionaryAsync(user => user.Id ?? Guid.Empty, user => user.LastSignInAt);
		lastSignIns[withSessions].Should().BeCloseTo(newer, TimeSpan.FromSeconds(1));
		lastSignIns[withoutSessions].Should().BeNull("a member with no stored session has no history to backfill");
	}
}
