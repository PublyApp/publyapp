using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Migrations;

// #2289 regression: removing the account level must never promote a tenant's existing
// profile to full access. Before the fix, step B matched the tenant's custom "Owner"
// profile by name and flagged it, silently granting full access to every member of that
// limited profile.
//
// Each test owns a throwaway database: apply the chain up to
// 20261021060140_AddRenditions, insert the legacy rows through raw SQL, then let the
// migration under test run. The assertion is about that state transition, so the shared
// per-class template cannot be used.
public sealed class RemoveAccountLevelSpec : IAsyncLifetime {
	private const string _PreviousMigrationId = "20261021060140_AddRenditions";

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
	public async Task ItShouldKeepACustomOwnerProfileLimitedAndAssignTheAdminToANewFullAccessProfile() {
		var seed = await this._SeedAndMigrateUpAsync();

		await using var conn = new NpgsqlConnection(this._ConnectionString.Required());
		await conn.OpenAsync();

		(await RemoveAccountLevelSpec._IsFullAccessAsync(conn, seed.CustomOwnerProfileId))
			.Should().BeFalse("a tenant's custom 'Owner' profile must never be promoted");

		var fullAccessProfileId = await RemoveAccountLevelSpec._ProfileIdAsync(
			conn, seed.TenantAId, "Owner (full access)"
		);
		fullAccessProfileId.Should().NotBeNull("the collision forces a distinctly named system profile");
		(await RemoveAccountLevelSpec._IsFullAccessAsync(conn, fullAccessProfileId.Required()))
			.Should().BeTrue();

		(await RemoveAccountLevelSpec._HoldsProfileAsync(conn, seed.AdminAAccountId, fullAccessProfileId.Required()))
			.Should().BeTrue("the former Admin (level 50) must keep full access");
		(await RemoveAccountLevelSpec._HoldsProfileAsync(conn, seed.UserAAccountId, fullAccessProfileId.Required()))
			.Should().BeFalse("the former User (level 10) must not gain full access");
		(await RemoveAccountLevelSpec._HoldsProfileAsync(conn, seed.UserAAccountId, seed.CustomOwnerProfileId))
			.Should().BeTrue("existing profile assignments are never touched");
	}

	[Fact]
	public async Task ItShouldCreateANewOwnerProfileForATenantWithoutOneAndAssignItsAdmin() {
		var seed = await this._SeedAndMigrateUpAsync();

		await using var conn = new NpgsqlConnection(this._ConnectionString.Required());
		await conn.OpenAsync();

		var ownerProfileId = await RemoveAccountLevelSpec._ProfileIdAsync(conn, seed.TenantBId, "Owner");
		ownerProfileId.Should().NotBeNull("a tenant with no 'Owner' gets the seeded name");
		(await RemoveAccountLevelSpec._IsFullAccessAsync(conn, ownerProfileId.Required()))
			.Should().BeTrue();
		(await RemoveAccountLevelSpec._HoldsProfileAsync(conn, seed.AdminBAccountId, ownerProfileId.Required()))
			.Should().BeTrue("the former Admin (level 50) must keep full access");
	}

	[Fact]
	public async Task ItShouldLinkAPendingAdminInvitationToItsTenantsFullAccessProfile() {
		var seed = await this._SeedAndMigrateUpAsync();

		await using var conn = new NpgsqlConnection(this._ConnectionString.Required());
		await conn.OpenAsync();

		var ownerProfileId = await RemoveAccountLevelSpec._ProfileIdAsync(conn, seed.TenantBId, "Owner");
		ownerProfileId.Should().NotBeNull();

		(await RemoveAccountLevelSpec._CountInvitationProfilesAsync(
			conn, seed.PendingInvitationId, ownerProfileId.Required()
		)).Should().Be(1, "accepting the invitation must still yield full access");
	}

	[Fact]
	public async Task ItShouldGiveTheStaffAdminAccountTheStaffOwnerFullAccessProfile() {
		var seed = await this._SeedAndMigrateUpAsync();

		await using var conn = new NpgsqlConnection(this._ConnectionString.Required());
		await conn.OpenAsync();

		var staffOwnerId = await RemoveAccountLevelSpec._StaffProfileIdAsync(conn, "Staff Owner");
		staffOwnerId.Should().NotBeNull();
		(await RemoveAccountLevelSpec._IsFullAccessAsync(conn, staffOwnerId.Required()))
			.Should().BeTrue();
		(await RemoveAccountLevelSpec._HoldsProfileAsync(conn, seed.StaffAccountId, staffOwnerId.Required()))
			.Should().BeTrue("the former staff Admin (level 50) must keep full access");
	}

	[Fact]
	public async Task ItShouldRoundTripDownAndUpAgainWithoutLosingTheReconstructedLevels() {
		var seed = await this._SeedAndMigrateUpAsync();

		await using (var db = this._CreateDbContext()) {
			var migrator = db.GetService<IMigrator>();
			var down = async () => await migrator.MigrateAsync(RemoveAccountLevelSpec._PreviousMigrationId);
			await down.Should().NotThrowAsync();
		}

		await using (var conn = new NpgsqlConnection(this._ConnectionString.Required())) {
			await conn.OpenAsync();
			(await RemoveAccountLevelSpec._LevelAsync(conn, seed.AdminAAccountId))
				.Should().Be(50, "full-access membership reconstructs the old Admin level");
			(await RemoveAccountLevelSpec._LevelAsync(conn, seed.UserAAccountId))
				.Should().Be(10, "the custom 'Owner' member was never a full-access holder");
		}

		await using (var db = this._CreateDbContext()) {
			var migrator = db.GetService<IMigrator>();
			var up = async () => await migrator.MigrateAsync();
			await up.Should().NotThrowAsync("a rolled-back deployment must be re-appliable");
		}

		await using var verify = new NpgsqlConnection(this._ConnectionString.Required());
		await verify.OpenAsync();
		var recreatedOwnerId = await RemoveAccountLevelSpec._ProfileIdAsync(
			verify, seed.TenantAId, "Owner (full access)"
		);
		recreatedOwnerId.Should().NotBeNull("the second Up recreates the system profile it removed");
		(await RemoveAccountLevelSpec._HoldsProfileAsync(verify, seed.AdminAAccountId, recreatedOwnerId.Required()))
			.Should().BeTrue("the Admin must still hold full access after the round-trip");
	}

	private async Task<SeededRows> _SeedAndMigrateUpAsync() {
		var seed = new SeededRows {
			TenantAId = Guid.CreateVersion7(),
			TenantBId = Guid.CreateVersion7(),
			StaffUserId = Guid.CreateVersion7(),
			AdminAUserId = Guid.CreateVersion7(),
			UserAUserId = Guid.CreateVersion7(),
			AdminBUserId = Guid.CreateVersion7(),
			StaffAccountId = Guid.CreateVersion7(),
			AdminAAccountId = Guid.CreateVersion7(),
			UserAAccountId = Guid.CreateVersion7(),
			AdminBAccountId = Guid.CreateVersion7(),
			CustomOwnerProfileId = Guid.CreateVersion7(),
			PendingInvitationId = Guid.CreateVersion7(),
		};

		await using (var db = this._CreateDbContext()) {
			await db.GetService<IMigrator>().MigrateAsync(RemoveAccountLevelSpec._PreviousMigrationId);
		}

		await using (var conn = new NpgsqlConnection(this._ConnectionString.Required())) {
			await conn.OpenAsync();
			await RemoveAccountLevelSpec._SeedLegacyRowsAsync(conn, seed);
		}

		await using (var db = this._CreateDbContext()) {
			await db.GetService<IMigrator>().MigrateAsync();
		}

		return seed;
	}

	private AppDbContext _CreateDbContext() {
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(this._ConnectionString.Required())
				.Options
		);
	}

	private static async Task _SeedLegacyRowsAsync(NpgsqlConnection connection, SeededRows seed) {
		// Tenant A already owns a custom, limited profile called "Owner" — the exact shape
		// that used to be promoted. Tenant B has none. The staff Admin has no profile at all.
		await using var command = new NpgsqlCommand(
			"""
			INSERT INTO tenants (id, code, name, status, max_users, created_at, updated_at, is_deleted)
			VALUES
				(@tenantA, @codeA, @nameA, 20, 10, now(), now(), false),
				(@tenantB, @codeB, @nameB, 20, 10, now(), now(), false);

			INSERT INTO users (id, email, password, status, is_verified, created_at, updated_at, is_deleted)
			VALUES
				(@staffUser, @staffEmail, 'unused', 40, true, now(), now(), false),
				(@adminAUser, @adminAEmail, 'unused', 40, true, now(), now(), false),
				(@userAUser, @userAEmail, 'unused', 40, true, now(), now(), false),
				(@adminBUser, @adminBEmail, 'unused', 40, true, now(), now(), false);

			INSERT INTO user_accounts
				(id, user_id, tenant_id, project_id, scope, level, status,
				 created_at, updated_at, is_deleted)
			VALUES
				(@staffAccount, @staffUser, NULL, NULL, 0, 50, 0, now(), now(), false),
				(@adminAAccount, @adminAUser, @tenantA, NULL, 1, 50, 0, now(), now(), false),
				(@userAAccount, @userAUser, @tenantA, NULL, 1, 10, 0, now(), now(), false),
				(@adminBAccount, @adminBUser, @tenantB, NULL, 1, 50, 0, now(), now(), false);

			INSERT INTO profiles
				(id, tenant_id, project_id, name, description, scope, is_default,
				 created_at, updated_at, is_deleted)
			VALUES
				(@customOwner, @tenantA, NULL, 'Owner', 'Custom limited profile', 1, false,
				 now(), now(), false);

			INSERT INTO user_account_profiles (user_account_id, profile_id, created_at, updated_at)
			VALUES (@userAAccount, @customOwner, now(), now());

			INSERT INTO invitations
				(id, email, scope, tenant_id, project_id, token, expires_at, status,
				 invited_by_user_id, account_level, created_at, updated_at, is_deleted)
			VALUES
				(@invitation, @invitationEmail, 1, @tenantB, NULL, @invitationToken,
				 now() + interval '7 days', 0, @staffUser, 50, now(), now(), false);
			""",
			connection
		);
		command.Parameters.AddWithValue("tenantA", seed.TenantAId);
		command.Parameters.AddWithValue("tenantB", seed.TenantBId);
		command.Parameters.AddWithValue("codeA", $"mig-a-{seed.TenantAId:N}"[..20]);
		command.Parameters.AddWithValue("codeB", $"mig-b-{seed.TenantBId:N}"[..20]);
		command.Parameters.AddWithValue("nameA", $"Migration Tenant A {seed.TenantAId:N}");
		command.Parameters.AddWithValue("nameB", $"Migration Tenant B {seed.TenantBId:N}");
		command.Parameters.AddWithValue("staffUser", seed.StaffUserId);
		command.Parameters.AddWithValue("adminAUser", seed.AdminAUserId);
		command.Parameters.AddWithValue("userAUser", seed.UserAUserId);
		command.Parameters.AddWithValue("adminBUser", seed.AdminBUserId);
		command.Parameters.AddWithValue("staffEmail", $"staff-{seed.StaffUserId:N}@example.com");
		command.Parameters.AddWithValue("adminAEmail", $"admin-a-{seed.AdminAUserId:N}@example.com");
		command.Parameters.AddWithValue("userAEmail", $"user-a-{seed.UserAUserId:N}@example.com");
		command.Parameters.AddWithValue("adminBEmail", $"admin-b-{seed.AdminBUserId:N}@example.com");
		command.Parameters.AddWithValue("staffAccount", seed.StaffAccountId);
		command.Parameters.AddWithValue("adminAAccount", seed.AdminAAccountId);
		command.Parameters.AddWithValue("userAAccount", seed.UserAAccountId);
		command.Parameters.AddWithValue("adminBAccount", seed.AdminBAccountId);
		command.Parameters.AddWithValue("customOwner", seed.CustomOwnerProfileId);
		command.Parameters.AddWithValue("invitation", seed.PendingInvitationId);
		command.Parameters.AddWithValue("invitationEmail", $"invitee-{seed.PendingInvitationId:N}@example.com");
		command.Parameters.AddWithValue("invitationToken", $"tok-{seed.PendingInvitationId:N}");
		await command.ExecuteNonQueryAsync();
	}

	private static async Task<bool> _IsFullAccessAsync(NpgsqlConnection connection, Guid profileId) {
		await using var command = new NpgsqlCommand(
			"SELECT is_full_access FROM profiles WHERE id = @profileId",
			connection
		);
		command.Parameters.AddWithValue("profileId", profileId);
		return (bool)(await command.ExecuteScalarAsync() ?? false);
	}

	private static async Task<Guid?> _ProfileIdAsync(
		NpgsqlConnection connection,
		Guid tenantId,
		string name
	) {
		await using var command = new NpgsqlCommand(
			"""
			SELECT id
			FROM profiles
			WHERE tenant_id = @tenantId
			  AND scope = 1
			  AND name = @name
			  AND is_deleted = false
			""",
			connection
		);
		command.Parameters.AddWithValue("tenantId", tenantId);
		command.Parameters.AddWithValue("name", name);
		return await command.ExecuteScalarAsync() as Guid?;
	}

	private static async Task<Guid?> _StaffProfileIdAsync(NpgsqlConnection connection, string name) {
		await using var command = new NpgsqlCommand(
			"""
			SELECT id
			FROM profiles
			WHERE scope = 0
			  AND tenant_id IS NULL
			  AND name = @name
			  AND is_deleted = false
			""",
			connection
		);
		command.Parameters.AddWithValue("name", name);
		return await command.ExecuteScalarAsync() as Guid?;
	}

	private static async Task<bool> _HoldsProfileAsync(
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

	private static async Task<int> _CountInvitationProfilesAsync(
		NpgsqlConnection connection,
		Guid invitationId,
		Guid profileId
	) {
		await using var command = new NpgsqlCommand(
			"""
			SELECT COUNT(*)
			FROM invitation_profiles
			WHERE invitation_id = @invitationId
			  AND profile_id = @profileId
			""",
			connection
		);
		command.Parameters.AddWithValue("invitationId", invitationId);
		command.Parameters.AddWithValue("profileId", profileId);
		return (int)(long)(await command.ExecuteScalarAsync() ?? 0L);
	}

	private static async Task<int> _LevelAsync(NpgsqlConnection connection, Guid accountId) {
		await using var command = new NpgsqlCommand(
			"SELECT level FROM user_accounts WHERE id = @accountId",
			connection
		);
		command.Parameters.AddWithValue("accountId", accountId);
		return (int)(await command.ExecuteScalarAsync() ?? 0);
	}

	private sealed class SeededRows {
		public Guid TenantAId { get; init; }
		public Guid TenantBId { get; init; }
		public Guid StaffUserId { get; init; }
		public Guid AdminAUserId { get; init; }
		public Guid UserAUserId { get; init; }
		public Guid AdminBUserId { get; init; }
		public Guid StaffAccountId { get; init; }
		public Guid AdminAAccountId { get; init; }
		public Guid UserAAccountId { get; init; }
		public Guid AdminBAccountId { get; init; }
		public Guid CustomOwnerProfileId { get; init; }
		public Guid PendingInvitationId { get; init; }
	}
}
