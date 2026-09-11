using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;
using NpgsqlTypes;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Migrations;

// This migration-state spec starts immediately before the membership dedup migration,
// seeds the legacy duplicate shape that migration was written to repair, and then applies
// the remaining migration chain. The old account owns the only profile link in every scope,
// so the dedup migration copies that link to the winner and leaves two rows until the repair
// migration hard-deletes the loser's row. The assertions are therefore revert-sensitive:
// without the repair, loserHasProfile is true and the profile-link count is two.
public sealed class RepairOrphanedUserAccountProfileLinksSpec : IAsyncLifetime {
	private const string _PreviousMigrationId =
		"20260712114851_AddTenantOrganizationProfileFields";
	private const string _RepairMigrationId =
		"20260723175718_RepairOrphanedUserAccountProfileLinks";

	private PostgresContainerFixture _ContainerFixture = null!;
	private string _DbName = null!;
	private string _ConnectionString = null!;

	public async Task InitializeAsync() {
		_ContainerFixture = await PostgresContainerFixture.GetSharedAsync();
		_DbName = $"migtest_{Guid.NewGuid():N}";

		await using var adminConn = new NpgsqlConnection(
			_ContainerFixture.AdminConnectionString
		);
		await adminConn.OpenAsync();
		await using (var createCmd = new NpgsqlCommand(
			$"CREATE DATABASE {_DbName}",
			adminConn
		)) {
			await createCmd.ExecuteNonQueryAsync();
		}

		var builder = new NpgsqlConnectionStringBuilder(
			_ContainerFixture.AdminConnectionString
		) {
			Database = _DbName,
			Pooling = false
		};
		_ConnectionString = builder.ConnectionString;
	}

	public async Task DisposeAsync() {
		NpgsqlConnection.ClearAllPools();
		await using var adminConn = new NpgsqlConnection(
			_ContainerFixture.AdminConnectionString
		);
		await adminConn.OpenAsync();
		await using var dropCmd = new NpgsqlCommand(
			$"DROP DATABASE IF EXISTS {_DbName}",
			adminConn
		);
		await dropCmd.ExecuteNonQueryAsync();
	}

	[Fact]
	public async Task
	ItShouldPreserveAssignmentsAndRemoveLoserLinksAcrossAllMembershipScopes() {
		await using var dbContext = _CreateDbContext();
		var migrator = dbContext.GetService<IMigrator>();
		await migrator.MigrateAsync(_PreviousMigrationId);

		var tenantId = Guid.NewGuid();
		var legacyProjectTenantId = Guid.NewGuid();
		var projectId = Guid.NewGuid();
		var partitions = new[] {
			MembershipPartition.Create("staff", 0, null, null, null),
			MembershipPartition.Create("tenant", 1, tenantId, tenantId, null),
			// The old composite index included tenant_id, while the replacement project
			// uniqueness scope is user_id + project_id. A mismatched historical tenant_id
			// therefore permits the legacy project duplicate without altering the old schema.
			MembershipPartition.Create(
				"project",
				2,
				legacyProjectTenantId,
				tenantId,
				projectId
			)
		};

		await using (var connection = new NpgsqlConnection(_ConnectionString)) {
			await connection.OpenAsync();
			await _SeedTenantAndProjectAsync(
				connection,
				tenantId,
				legacyProjectTenantId,
				projectId
			);

			foreach (var partition in partitions) {
				await _SeedDuplicateMembershipAsync(connection, partition);
			}
		}

		await migrator.MigrateAsync(_RepairMigrationId);

		await using var verifyConnection = new NpgsqlConnection(_ConnectionString);
		await verifyConnection.OpenAsync();

		foreach (var partition in partitions) {
			var loserIsDeleted = await _IsAccountDeletedAsync(
				verifyConnection,
				partition.OlderAccountId
			);
			loserIsDeleted.Should().BeTrue(
				$"the older {partition.Name} duplicate must be the dedup loser"
			);

			var winnerIsDeleted = await _IsAccountDeletedAsync(
				verifyConnection,
				partition.NewerAccountId
			);
			winnerIsDeleted.Should().BeFalse(
				$"the newer {partition.Name} membership must remain active"
			);

			var winnerHasProfile = await _HasProfileLinkAsync(
				verifyConnection,
				partition.NewerAccountId,
				partition.ProfileId
			);
			winnerHasProfile.Should().BeTrue(
				$"the {partition.Name} assignment must be preserved on the winner"
			);

			var loserHasProfile = await _HasProfileLinkAsync(
				verifyConnection,
				partition.OlderAccountId,
				partition.ProfileId
			);
			loserHasProfile.Should().BeFalse(
				$"the soft-deleted {partition.Name} loser cannot retain a live junction row"
			);

			var linkCount = await _CountProfileLinksAsync(
				verifyConnection,
				partition.ProfileId
			);
			linkCount.Should().Be(
				1,
				$"the {partition.Name} profile must count exactly one assigned membership"
			);
		}
	}

	[Fact]
	public async Task ItShouldLeaveLegitimateLinksIntactWhenNoOrphanedResidueExists() {
		await using var dbContext = _CreateDbContext();
		var migrator = dbContext.GetService<IMigrator>();
		await migrator.MigrateAsync(_PreviousMigrationId);

		var accountId = Guid.NewGuid();
		var profileId = Guid.NewGuid();

		await using (var connection = new NpgsqlConnection(_ConnectionString)) {
			await connection.OpenAsync();
			await _SeedLegitimateStaffMembershipAsync(connection, accountId, profileId);
		}

		await migrator.MigrateAsync(_RepairMigrationId);

		await using var verifyConnection = new NpgsqlConnection(_ConnectionString);
		await verifyConnection.OpenAsync();

		var accountIsDeleted = await _IsAccountDeletedAsync(
			verifyConnection,
			accountId
		);
		accountIsDeleted.Should().BeFalse(
			"a non-duplicate membership must remain active"
		);

		var hasProfile = await _HasProfileLinkAsync(
			verifyConnection,
			accountId,
			profileId
		);
		hasProfile.Should().BeTrue(
			"the repair must not remove a legitimate active-account link"
		);

		var linkCount = await _CountProfileLinksAsync(verifyConnection, profileId);
		linkCount.Should().Be(
			1,
			"a no-residue database must retain every legitimate assignment"
		);
	}

	private AppDbContext _CreateDbContext() {
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(_ConnectionString)
				.Options
		);
	}

	private static async Task _SeedTenantAndProjectAsync(
		NpgsqlConnection connection,
		Guid tenantId,
		Guid legacyProjectTenantId,
		Guid projectId
	) {
		await using var command = new NpgsqlCommand(
			"""
			INSERT INTO tenants
				(id, code, name, status, max_users, created_at, updated_at, is_deleted)
			VALUES
				(@tenantId, @tenantCode, @tenantName, 10, 5, now(), now(), false),
				(@legacyProjectTenantId, @legacyTenantCode, @legacyTenantName,
				 10, 5, now(), now(), false);

			INSERT INTO projects
				(id, tenant_id, name, status, created_at, updated_at, is_deleted)
			VALUES
				(@projectId, @tenantId, @projectName, 10, now(), now(), false);
			""",
			connection
		);
		command.Parameters.AddWithValue("tenantId", tenantId);
		command.Parameters.AddWithValue("tenantCode", $"repair-{tenantId:N}");
		command.Parameters.AddWithValue("tenantName", $"Repair Tenant {tenantId:N}");
		command.Parameters.AddWithValue(
			"legacyProjectTenantId",
			legacyProjectTenantId
		);
		command.Parameters.AddWithValue(
			"legacyTenantCode",
			$"repair-{legacyProjectTenantId:N}"
		);
		command.Parameters.AddWithValue(
			"legacyTenantName",
			$"Repair Legacy Tenant {legacyProjectTenantId:N}"
		);
		command.Parameters.AddWithValue("projectId", projectId);
		command.Parameters.AddWithValue("projectName", $"Repair Project {projectId:N}");
		await command.ExecuteNonQueryAsync();
	}

	private static async Task _SeedDuplicateMembershipAsync(
		NpgsqlConnection connection,
		MembershipPartition partition
	) {
		await using var command = new NpgsqlCommand(
			"""
			INSERT INTO users
				(id, email, password, status, is_verified, created_at, updated_at, is_deleted)
			VALUES
				(@userId, @email, 'hash', 40, true, now(), now(), false);

			INSERT INTO user_accounts
				(id, user_id, tenant_id, project_id, scope, level, status,
				 created_at, updated_at, is_deleted)
			VALUES
				(@olderId, @userId, @olderTenantId, @projectId, @scope, 0, 0,
				 now() - interval '1 day', now() - interval '1 day', false),
				(@newerId, @userId, @newerTenantId, @projectId, @scope, 0, 0,
				 now(), now(), false);

			INSERT INTO profiles
				(id, tenant_id, project_id, name, scope, is_default,
				 created_at, updated_at, is_deleted)
			VALUES
				(@profileId, @newerTenantId, @projectId, @profileName, @scope, false,
				 now(), now(), false);

			INSERT INTO user_account_profiles
				(user_account_id, profile_id, created_at, updated_at)
			VALUES
				(@olderId, @profileId, now(), now());
			""",
			connection
		);
		command.Parameters.AddWithValue("userId", partition.UserId);
		command.Parameters.AddWithValue(
			"email",
			$"repair-{partition.Name}-{partition.UserId:N}@example.com"
		);
		command.Parameters.AddWithValue("olderId", partition.OlderAccountId);
		command.Parameters.AddWithValue("newerId", partition.NewerAccountId);
		command.Parameters.Add(
			_CreateNullableUuidParameter("olderTenantId", partition.OlderTenantId)
		);
		command.Parameters.Add(
			_CreateNullableUuidParameter("newerTenantId", partition.NewerTenantId)
		);
		command.Parameters.Add(_CreateNullableUuidParameter("projectId", partition.ProjectId));
		command.Parameters.AddWithValue("scope", partition.Scope);
		command.Parameters.AddWithValue("profileId", partition.ProfileId);
		command.Parameters.AddWithValue(
			"profileName",
			$"Repair {partition.Name} Profile {partition.ProfileId:N}"
		);
		await command.ExecuteNonQueryAsync();
	}

	private static async Task _SeedLegitimateStaffMembershipAsync(
		NpgsqlConnection connection,
		Guid accountId,
		Guid profileId
	) {
		var userId = Guid.NewGuid();
		await using var command = new NpgsqlCommand(
			"""
			INSERT INTO users
				(id, email, password, status, is_verified, created_at, updated_at, is_deleted)
			VALUES
				(@userId, @email, 'hash', 40, true, now(), now(), false);

			INSERT INTO user_accounts
				(id, user_id, tenant_id, project_id, scope, level, status,
				 created_at, updated_at, is_deleted)
			VALUES
				(@accountId, @userId, NULL, NULL, 0, 0, 0, now(), now(), false);

			INSERT INTO profiles
				(id, tenant_id, project_id, name, scope, is_default,
				 created_at, updated_at, is_deleted)
			VALUES
				(@profileId, NULL, NULL, @profileName, 0, false, now(), now(), false);

			INSERT INTO user_account_profiles
				(user_account_id, profile_id, created_at, updated_at)
			VALUES
				(@accountId, @profileId, now(), now());
			""",
			connection
		);
		command.Parameters.AddWithValue("userId", userId);
		command.Parameters.AddWithValue("email", $"repair-clean-{userId:N}@example.com");
		command.Parameters.AddWithValue("accountId", accountId);
		command.Parameters.AddWithValue("profileId", profileId);
		command.Parameters.AddWithValue(
			"profileName",
			$"Repair Clean Profile {profileId:N}"
		);
		await command.ExecuteNonQueryAsync();
	}

	private static NpgsqlParameter _CreateNullableUuidParameter(
		string name,
		Guid? value
	) {
		return new NpgsqlParameter(name, NpgsqlDbType.Uuid) {
			Value = value.HasValue ? value.Value : DBNull.Value
		};
	}

	private static async Task<bool> _IsAccountDeletedAsync(
		NpgsqlConnection connection,
		Guid accountId
	) {
		await using var command = new NpgsqlCommand(
			"SELECT is_deleted FROM user_accounts WHERE id = @accountId",
			connection
		);
		command.Parameters.AddWithValue("accountId", accountId);
		return (bool)(await command.ExecuteScalarAsync() ?? false);
	}

	private static async Task<bool> _HasProfileLinkAsync(
		NpgsqlConnection connection,
		Guid accountId,
		Guid profileId
	) {
		await using var command = new NpgsqlCommand(
			"""
			SELECT EXISTS(
				SELECT 1
				FROM user_account_profiles
				WHERE user_account_id = @accountId
					AND profile_id = @profileId
			)
			""",
			connection
		);
		command.Parameters.AddWithValue("accountId", accountId);
		command.Parameters.AddWithValue("profileId", profileId);
		return (bool)(await command.ExecuteScalarAsync() ?? false);
	}

	private static async Task<int> _CountProfileLinksAsync(
		NpgsqlConnection connection,
		Guid profileId
	) {
		await using var command = new NpgsqlCommand(
			"""
			SELECT COUNT(*)
			FROM user_account_profiles
			WHERE profile_id = @profileId
			""",
			connection
		);
		command.Parameters.AddWithValue("profileId", profileId);
		return (int)(long)(await command.ExecuteScalarAsync() ?? 0L);
	}

	private sealed record MembershipPartition(
		string Name,
		int Scope,
		Guid UserId,
		Guid? OlderTenantId,
		Guid? NewerTenantId,
		Guid? ProjectId,
		Guid OlderAccountId,
		Guid NewerAccountId,
		Guid ProfileId
	) {
		internal static MembershipPartition Create(
			string name,
			int scope,
			Guid? olderTenantId,
			Guid? newerTenantId,
			Guid? projectId
		) {
			return new MembershipPartition(
				name,
				scope,
				Guid.NewGuid(),
				olderTenantId,
				newerTenantId,
				projectId,
				Guid.NewGuid(),
				Guid.NewGuid(),
				Guid.NewGuid()
			);
		}
	}
}
