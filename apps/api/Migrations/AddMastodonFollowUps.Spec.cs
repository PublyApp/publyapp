using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Migrations;

// #2186: the migration is additive (defaulted or nullable columns, one index, one CHECK that
// is added NOT VALID and then validated so it never blocks writes). It must apply on a
// database that already holds an account, leave that account public, and roll back cleanly.
// Dedicated throwaway database: the assertions are about the state TRANSITION.
public sealed class AddMastodonFollowUpsSpec : IAsyncLifetime {
	private const string _PreviousMigrationId = "20261109154250_AddTenantStatusHistory";
	private const string _MigrationId = "20261112051420_AddMastodonFollowUps";

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

	private async Task<T> _ScalarAsync<T>(string sql) {
		await using var conn = new NpgsqlConnection(this._ConnectionString.Required());
		await conn.OpenAsync();
		await using var cmd = new NpgsqlCommand(sql, conn);
		return (T)(await cmd.ExecuteScalarAsync()).Required();
	}

	private Task<long> _ColumnCountAsync() {
		return this._ScalarAsync<long>("""
			SELECT count(*) FROM information_schema.columns
			WHERE (table_name = 'social_accounts' AND column_name = 'default_visibility')
				OR (table_name = 'oauth_states' AND column_name IN ('protected_code_verifier', 'reconnect_social_account_id'))
				OR (table_name = 'oauth_app_registrations' AND column_name IN ('registered_at', 'registered_by_tenant_id'))
			""");
	}

	[Fact]
	public async Task ItShouldApplyOnAPopulatedDatabaseKeepAccountsPublicAndRollBackCleanly() {
		await using var db = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(this._ConnectionString.Required()).Options
		);
		var migrator = db.GetService<IMigrator>();
		await migrator.MigrateAsync(AddMastodonFollowUpsSpec._PreviousMigrationId);
		var tenant = new Tenant {
			Name = $"mig-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		db.Tenant.Add(tenant);
		await db.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();
		_ = await db.Database.ExecuteSqlAsync($"""
			INSERT INTO social_accounts (id, tenant_id, provider, external_account_id, display_handle,
				credential_type, protected_credentials, status, created_at, updated_at, is_deleted)
			VALUES ({Guid.NewGuid()}, {tenantId}, 1, '1@legacy.example', 'old@legacy.example',
				2, 'enc', 10, now(), now(), false)
			""");
		(await this._ColumnCountAsync()).Should().Be(0);

		await migrator.MigrateAsync(AddMastodonFollowUpsSpec._MigrationId);

		(await this._ColumnCountAsync()).Should().Be(5);
		(await this._ScalarAsync<int>("SELECT default_visibility FROM social_accounts WHERE external_account_id = '1@legacy.example'"))
			.Should().Be(0, "an existing account stays public");
		(await this._ScalarAsync<bool>("SELECT convalidated FROM pg_constraint WHERE conname = 'CK_SocialAccount_DefaultVisibility'"))
			.Should().BeTrue("the NOT VALID constraint was validated");
		var invalid = async () => await db.Database.ExecuteSqlAsync(
			$"UPDATE social_accounts SET default_visibility = 7 WHERE external_account_id = '1@legacy.example'"
		);
		await invalid.Should().ThrowAsync<Exception>("only 0, 1 and 2 are visibilities");

		await migrator.MigrateAsync(AddMastodonFollowUpsSpec._PreviousMigrationId);

		(await this._ColumnCountAsync()).Should().Be(0, "Down removes every column it added");
		(await this._ScalarAsync<long>("SELECT count(*) FROM pg_constraint WHERE conname = 'CK_SocialAccount_DefaultVisibility'"))
			.Should().Be(0);
		(await this._ScalarAsync<long>("SELECT count(*) FROM social_accounts WHERE external_account_id = '1@legacy.example'"))
			.Should().Be(1, "rolling back keeps the accounts");
	}
}
