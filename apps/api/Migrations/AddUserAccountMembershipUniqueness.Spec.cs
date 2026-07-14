using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Migrations;

// round-6 API F1: this migration creates unique indexes over columns that the
// OLD index allowed to hold duplicate active rows for (NULL tenant/project
// columns did not collide). Applying it against data that already has such
// duplicates must NOT abort with 23505 — the migration is expected to
// deduplicate first. This spec applies migrations up through the PREVIOUS
// migration only, seeds exactly the duplicate shape the old schema permitted,
// then applies this migration and asserts it both succeeds and repairs the
// data (single survivor, profile assignments preserved on the survivor).
//
// A dedicated throwaway database is required (not the shared per-class
// ApiFixture template) because the assertion is about migration STATE
// transitions, not app behavior after all migrations have already run.
public sealed class AddUserAccountMembershipUniquenessSpec : IAsyncLifetime {
	private const string PreviousMigrationId = "20260712114851_AddTenantOrganizationProfileFields";

	private PostgresContainerFixture _containerFixture = null!;
	private string _dbName = null!;
	private string _connectionString = null!;

	public async Task InitializeAsync() {
		_containerFixture = await PostgresContainerFixture.GetSharedAsync();
		_dbName = $"migtest_{Guid.NewGuid():N}";

		await using var adminConn = new NpgsqlConnection(_containerFixture.AdminConnectionString);
		await adminConn.OpenAsync();
		await using (var createCmd = new NpgsqlCommand($"CREATE DATABASE {_dbName}", adminConn)) {
			await createCmd.ExecuteNonQueryAsync();
		}

		var builder = new NpgsqlConnectionStringBuilder(_containerFixture.AdminConnectionString) {
			Database = _dbName,
			Pooling = false
		};
		_connectionString = builder.ConnectionString;
	}

	public async Task DisposeAsync() {
		NpgsqlConnection.ClearAllPools();
		await using var adminConn = new NpgsqlConnection(_containerFixture.AdminConnectionString);
		await adminConn.OpenAsync();
		await using var dropCmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS {_dbName}", adminConn);
		await dropCmd.ExecuteNonQueryAsync();
	}

	[Fact]
	public async Task
	ItShouldSucceedAndDeduplicateWhenLegacyDataHasDuplicateActiveStaffMemberships() {
		await using var dbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(_connectionString).Options
		);
		var migrator = dbContext.GetService<IMigrator>();

		// 1) Schema as of the migration immediately before this one.
		await migrator.MigrateAsync(PreviousMigrationId);

		var userId = Guid.NewGuid();
		var olderAccountId = Guid.NewGuid();
		var newerAccountId = Guid.NewGuid();
		var profileId = Guid.NewGuid();

		await using (var conn = new NpgsqlConnection(_connectionString)) {
			await conn.OpenAsync();

			await using (var cmd = new NpgsqlCommand(
				"""
				INSERT INTO users (id, email, password, status, is_verified, created_at, updated_at, is_deleted)
				VALUES (@userId, @email, 'hash', 40, true, now(), now(), false)
				""",
				conn
			)) {
				cmd.Parameters.AddWithValue("userId", userId);
				cmd.Parameters.AddWithValue("email", $"dedup-{userId:N}@example.com");
				await cmd.ExecuteNonQueryAsync();
			}

			// Two active staff memberships for the same user — permitted by the
			// OLD index (tenant_id/project_id are both NULL for staff scope, and
			// NULL columns never collide in a plain unique index).
			await using (var cmd = new NpgsqlCommand(
				"""
				INSERT INTO user_accounts
					(id, user_id, tenant_id, project_id, scope, level, status, created_at, updated_at, is_deleted)
				VALUES
					(@olderId, @userId, NULL, NULL, 0, 0, 0, now() - interval '1 day', now() - interval '1 day', false),
					(@newerId, @userId, NULL, NULL, 0, 0, 0, now(), now(), false)
				""",
				conn
			)) {
				cmd.Parameters.AddWithValue("olderId", olderAccountId);
				cmd.Parameters.AddWithValue("newerId", newerAccountId);
				cmd.Parameters.AddWithValue("userId", userId);
				await cmd.ExecuteNonQueryAsync();
			}

			await using (var cmd = new NpgsqlCommand(
				"""
				INSERT INTO profiles (id, tenant_id, project_id, name, scope, is_default, created_at, updated_at, is_deleted)
				VALUES (@profileId, NULL, NULL, @name, 0, false, now(), now(), false)
				""",
				conn
			)) {
				cmd.Parameters.AddWithValue("profileId", profileId);
				cmd.Parameters.AddWithValue("name", $"Dedup Profile {profileId:N}");
				await cmd.ExecuteNonQueryAsync();
			}

			// Profile assignment on the OLDER (losing) row only — proves the
			// migration moves it onto the survivor instead of stranding it on a
			// row that is about to be soft-deleted.
			await using (var cmd = new NpgsqlCommand(
				"""
				INSERT INTO user_account_profiles (user_account_id, profile_id, created_at, updated_at)
				VALUES (@olderId, @profileId, now(), now())
				""",
				conn
			)) {
				cmd.Parameters.AddWithValue("olderId", olderAccountId);
				cmd.Parameters.AddWithValue("profileId", profileId);
				await cmd.ExecuteNonQueryAsync();
			}
		}

		// 2) Apply the migration under test (and anything after it). Must not throw.
		var applyRemaining = async () => await migrator.MigrateAsync();
		await applyRemaining.Should().NotThrowAsync(
			"the migration must deduplicate legacy data before creating the unique index, "
			+ "not abort with a 23505 unique violation"
		);

		await using var verifyConn = new NpgsqlConnection(_connectionString);
		await verifyConn.OpenAsync();

		int activeCount;
		await using (var cmd = new NpgsqlCommand(
			"SELECT COUNT(*) FROM user_accounts WHERE user_id = @userId AND scope = 0 AND is_deleted = false",
			verifyConn
		)) {
			cmd.Parameters.AddWithValue("userId", userId);
			activeCount = (int)(long)(await cmd.ExecuteScalarAsync() ?? 0L);
		}
		activeCount.Should().Be(1, "exactly one active staff membership must survive the dedup");

		Guid? survivorId;
		await using (var cmd = new NpgsqlCommand(
			"SELECT id FROM user_accounts WHERE user_id = @userId AND scope = 0 AND is_deleted = false",
			verifyConn
		)) {
			cmd.Parameters.AddWithValue("userId", userId);
			survivorId = (Guid?)await cmd.ExecuteScalarAsync();
		}
		survivorId.Should().Be(newerAccountId, "the newest row is kept, matching the app layer's own tie-break");

		bool olderIsSoftDeleted;
		await using (var cmd = new NpgsqlCommand(
			"SELECT is_deleted FROM user_accounts WHERE id = @olderId",
			verifyConn
		)) {
			cmd.Parameters.AddWithValue("olderId", olderAccountId);
			var scalar = await cmd.ExecuteScalarAsync();
			olderIsSoftDeleted = scalar is bool value && value;
		}
		olderIsSoftDeleted.Should().BeTrue("the losing row is soft-deleted, not hard-deleted or left active");

		bool survivorHasProfile;
		await using (var cmd = new NpgsqlCommand(
			"SELECT EXISTS(SELECT 1 FROM user_account_profiles WHERE user_account_id = @newerId AND profile_id = @profileId)",
			verifyConn
		)) {
			cmd.Parameters.AddWithValue("newerId", newerAccountId);
			cmd.Parameters.AddWithValue("profileId", profileId);
			var scalar = await cmd.ExecuteScalarAsync();
			survivorHasProfile = scalar is bool value && value;
		}
		survivorHasProfile.Should().BeTrue(
			"the losing row's profile assignment must be preserved on the surviving row"
		);
	}
}
