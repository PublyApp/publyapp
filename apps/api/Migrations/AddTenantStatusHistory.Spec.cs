using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Migrations;

/// <summary>
/// #2349: the migration writes the BASELINE of the active-organisations curve for
/// the organisations that already exist — one row per tenant, dated at migration
/// time with the status it holds then. It must never date a row at the tenant's
/// creation: the past is not invented (owner decision, 09/11).
/// <para>
/// A fresh test database migrates before any seeder runs, so the baseline insert
/// always meets an empty <c>tenants</c> table and is untested by the normal suite.
/// This spec follows <c>AddCanaryFriendlyNameUniqueIndexSpec</c>: a throwaway
/// database is migrated up to the PREVIOUS migration only, seeded with the
/// pre-migration shape, then this migration is applied and its rows asserted.
/// </para>
/// </summary>
public sealed class AddTenantStatusHistorySpec : IAsyncLifetime {
	// The immediate predecessor is derived from the real migrations-assembly
	// ordering, never pinned: a hard-coded id drifts every time a migration is
	// inserted above the target.
	private const string _MigrationUnderTestSuffix = "_AddTenantStatusHistory";

	private PostgresContainerFixture? _ContainerFixture;
	private string? _DbName;
	private string? _ConnectionString;

	public async Task InitializeAsync() {
		this._ContainerFixture = await PostgresContainerFixture.GetSharedAsync();
		this._DbName = $"migtest_{Guid.NewGuid():N}";

		await using var adminConn = new NpgsqlConnection(
			this._ContainerFixture.Required().AdminConnectionString
		);
		await adminConn.OpenAsync();
		await using (var createCmd = new NpgsqlCommand($"CREATE DATABASE {this._DbName}", adminConn)) {
			await createCmd.ExecuteNonQueryAsync();
		}

		var builder = new NpgsqlConnectionStringBuilder(
			this._ContainerFixture.Required().AdminConnectionString
		) {
			Database = this._DbName.Required(),
			Pooling = false
		};
		this._ConnectionString = builder.ConnectionString;
	}

	public async Task DisposeAsync() {
		NpgsqlConnection.ClearAllPools();
		await using var adminConn = new NpgsqlConnection(
			this._ContainerFixture.Required().AdminConnectionString
		);
		await adminConn.OpenAsync();
		await using var dropCmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS {this._DbName}", adminConn);
		await dropCmd.ExecuteNonQueryAsync();
	}

	[Fact]
	public async Task ItShouldWriteOneBaselineRowPerTenantAtMigrationTime() {
		await using var dbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(this._ConnectionString.Required())
				.Options
		);
		var migrator = dbContext.GetService<IMigrator>();

		await migrator.MigrateAsync(
			AddTenantStatusHistorySpec._PreviousMigrationId(dbContext)
		);

		// The pre-migration shape: an active, a suspended and a soft-deleted
		// organisation, all created long before the migration.
		var activeId = Guid.NewGuid();
		var suspendedId = Guid.NewGuid();
		var deletedId = Guid.NewGuid();
		var createdAt = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
		await using (var conn = new NpgsqlConnection(this._ConnectionString.Required())) {
			await conn.OpenAsync();
			await AddTenantStatusHistorySpec._InsertTenantAsync(
				conn,
				activeId,
				(int)TenantStatus.Active,
				createdAt,
				isDeleted: false
			);
			await AddTenantStatusHistorySpec._InsertTenantAsync(
				conn,
				suspendedId,
				(int)TenantStatus.Suspended,
				createdAt,
				isDeleted: false
			);
			await AddTenantStatusHistorySpec._InsertTenantAsync(
				conn,
				deletedId,
				(int)TenantStatus.Suspended,
				createdAt,
				isDeleted: true
			);
		}

		var before = DateTime.UtcNow.AddMinutes(-1);
		await migrator.MigrateAsync();
		var after = DateTime.UtcNow.AddMinutes(1);

		await using var readConn = new NpgsqlConnection(this._ConnectionString.Required());
		await readConn.OpenAsync();
		await using var read = new NpgsqlCommand(
			"""
			SELECT tenant_id, status, occurred_at
			FROM tenant_status_history
			ORDER BY tenant_id
			""",
			readConn
		);
		await using var reader = await read.ExecuteReaderAsync();
		var rows = new List<(Guid TenantId, int Status, DateTime OccurredAt)>();
		while (await reader.ReadAsync()) {
			rows.Add((
				reader.GetGuid(0),
				reader.GetInt32(1),
				reader.GetFieldValue<DateTime>(2)
			));
		}

		// EF Core also runs the app's seeding hooks after the migration, so the
		// database ends up with the seeded tenants too. Scope to the tenants that
		// existed BEFORE the migration: those are the baseline's input.
		var baseline = rows
			.Where(row =>
				row.TenantId == activeId
				|| row.TenantId == suspendedId
				|| row.TenantId == deletedId)
			.ToList();

		baseline.Should().HaveCount(
			3,
			"exactly one baseline row per existing organisation, no invented past"
		);
		baseline.Should().OnlyHaveUniqueItems(
			row => row.TenantId,
			"one row per tenant, never one per historical day"
		);
		baseline.Should().ContainSingle(row => row.TenantId == activeId)
			.Which.Status.Should().Be((int)TenantLifecycleStatus.Active);
		baseline.Should().ContainSingle(row => row.TenantId == suspendedId)
			.Which.Status.Should().Be((int)TenantLifecycleStatus.Suspended);
		baseline.Should().ContainSingle(row => row.TenantId == deletedId)
			.Which.Status.Should().Be(
				(int)TenantLifecycleStatus.Deleted,
				"a soft-deleted organisation is off the active curve from deploy on"
			);

		foreach (var row in baseline) {
			row.OccurredAt.Should().BeOnOrAfter(before);
			row.OccurredAt.Should().BeOnOrBefore(after);
			row.OccurredAt.Should().NotBe(
				createdAt,
				"the baseline is dated at migration time, never at the tenant's creation"
			);
		}
	}

	/// <summary>
	/// The id of the migration immediately BEFORE the one under test, derived from
	/// the REAL migrations-assembly ordering.
	/// </summary>
	private static string _PreviousMigrationId(AppDbContext dbContext) {
		var orderedIds = dbContext.GetService<IMigrationsAssembly>()
			.Migrations.Keys
			.ToList();
		var index = orderedIds.FindIndex(id =>
			id.EndsWith(
				AddTenantStatusHistorySpec._MigrationUnderTestSuffix,
				StringComparison.Ordinal
			));
		index.Should().BeGreaterThan(
			0,
			"the migration under test must have a predecessor in the migrations assembly"
		);
		return orderedIds[index - 1];
	}

	private static async Task _InsertTenantAsync(
		NpgsqlConnection conn,
		Guid id,
		int status,
		DateTime createdAt,
		bool isDeleted
	) {
		await using var cmd = new NpgsqlCommand(
			"""
			INSERT INTO tenants
				(id, code, name, status, max_users, created_at,
				 updated_at, is_deleted)
			VALUES
				(@id, @code, @code, @status, 5, @createdAt,
				 @createdAt, @isDeleted)
			""",
			conn
		);
		cmd.Parameters.AddWithValue("id", id);
		cmd.Parameters.AddWithValue("code", id.ToString());
		cmd.Parameters.AddWithValue("status", status);
		cmd.Parameters.AddWithValue("createdAt", createdAt);
		cmd.Parameters.AddWithValue("isDeleted", isDeleted);
		await cmd.ExecuteNonQueryAsync();
	}
}
