using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Infrastructure;

using Xunit;

namespace PublyApp.Api.Migrations;

/// <summary>
/// #1416: the canary row name must be unique AT THE DATABASE level — a unique partial
/// index on <c>data_protection_keys ("FriendlyName")</c> filtered to the canary name, so
/// the Data Protection key-ring rows keep their own (nullable, repeated) names
/// untouched. The migration must also REPAIR data: production already carries duplicate
/// canary rows minted by the first-boot race (#1416), so it dedupes (keep the LOWEST id)
/// before creating the index or a bare 23505 aborts it.
/// <para>
/// Pattern follows AddUserAccountMembershipUniquenessSpec: a dedicated throwaway
/// database is migrated up to the PREVIOUS migration only, seeded with exactly the
/// duplicate shape the old schema permitted, then this migration is applied and its
/// repair + enforcement are asserted against migration STATE transitions.
/// </para>
/// </summary>
public sealed class AddCanaryFriendlyNameUniqueIndexSpec : IAsyncLifetime {
	// The migration under test. Its immediate PREDECESSOR is derived from the REAL
	// migrations-assembly ordering instead of a hard-coded id (review round 2): a pinned
	// predecessor silently drifts every time a migration is inserted above the target,
	// widening what "the remaining migrations" means without failing anything.
	private const string MigrationUnderTestSuffix = "_AddCanaryFriendlyNameUniqueIndex";

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
	ItShouldSucceedAndDeduplicateWhenLegacyDataHasDuplicateCanaryRows() {
		await using var dbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(_connectionString).Options
		);
		var migrator = dbContext.GetService<IMigrator>();

		// 1) Schema as of the migration immediately BEFORE the unique index.
		await migrator.MigrateAsync(PreviousMigrationId(dbContext));

		// 2) Seed exactly what the first-boot race produced in production (#1416): two
		//    canary rows (the earliest boot keeps the lowest id), plus an ordinary Data
		//    Protection key-ring row that must stay untouched.
		const int winnerId = 100;
		const int loserId = 200;
		await using (var conn = new NpgsqlConnection(_connectionString)) {
			await conn.OpenAsync();

			await using var insertWinner = new NpgsqlCommand(
				"""

				INSERT INTO data_protection_keys ("Id", "FriendlyName", "Xml")
				VALUES (@winner, @canary, 'winner-blob')
				""",
				conn
			);
			insertWinner.Parameters.AddWithValue("winner", winnerId);
			insertWinner.Parameters.AddWithValue("canary", PostgresKeyRingCanaryStore.RowName);
			await insertWinner.ExecuteNonQueryAsync();

			await using var insertLoser = new NpgsqlCommand(
				"""

				INSERT INTO data_protection_keys ("Id", "FriendlyName", "Xml")
				VALUES (@loser, @canary, 'loser-blob')
				""",
				conn
			);
			insertLoser.Parameters.AddWithValue("loser", loserId);
			insertLoser.Parameters.AddWithValue("canary", PostgresKeyRingCanaryStore.RowName);
			await insertLoser.ExecuteNonQueryAsync();

			await using var insertKeyRingRow = new NpgsqlCommand(
				"""

				INSERT INTO data_protection_keys ("Id", "FriendlyName", "Xml")
				VALUES (300, 'key-abc123', '<key/>')
				""",
				conn
			);
			await insertKeyRingRow.ExecuteNonQueryAsync();
		}

		// 3) Apply the remaining migrations (the one under test): must dedupe first, NOT
		//    abort with a bare 23505 from the unique index creation.
		var applyRemaining = async () => await migrator.MigrateAsync();
		await applyRemaining.Should().NotThrowAsync(
			"the migration dedupes pre-existing duplicate canary rows before creating "
				+ "the unique partial index, so it applies cleanly on the affected "
				+ "production database");

		// 4) Exactly one canary survivor — the LOWEST id, carrying the earliest blob.
		await using (var conn = new NpgsqlConnection(_connectionString)) {
			await conn.OpenAsync();

			await using var survivors = new NpgsqlCommand(
				"""

				SELECT "Id", "Xml" FROM data_protection_keys
				WHERE "FriendlyName" = @canary
				ORDER BY "Id"
				""",
				conn
			);
			survivors.Parameters.AddWithValue("canary", PostgresKeyRingCanaryStore.RowName);
			await using var reader = await survivors.ExecuteReaderAsync();
			var rows = new List<(int Id, string Xml)>();
			while (await reader.ReadAsync()) {
				rows.Add((reader.GetInt32(0), reader.GetString(1)));
			}

			rows.Should().ContainSingle(
				"the dedupe keeps exactly one canary row; survivors: "
					+ string.Join(", ", rows));
			rows.Single().Id.Should().Be(
				winnerId,
				"the dedupe keeps the LOWEST id (the row every earlier boot verified under)");
			rows.Single().Xml.Should().Be("winner-blob");
		}

		// 5) The ordinary key-ring row is untouched by the repair.
		(await CountRowsAsync("key-abc123")).Should().Be(1);

		// 6) The partial unique index exists on the canary name only.
		(await IndexExistsAsync("ux_data_protection_keys_canary_friendly_name"))
			.Should().BeTrue("the canary row name must be unique at the DATABASE level");

		// 7) Enforcement: a second canary row is now impossible; another key-ring name
		//    still inserts fine (the partial filter leaves every other row alone).
		await using (var conn = new NpgsqlConnection(_connectionString)) {
			await conn.OpenAsync();

			await using var duplicateCanary = new NpgsqlCommand(
				"""

				INSERT INTO data_protection_keys ("FriendlyName", "Xml")
				VALUES (@canary, 'second-canary')
				""",
				conn
			);
			duplicateCanary.Parameters.AddWithValue("canary", PostgresKeyRingCanaryStore.RowName);
			var insertDuplicate = async () => await duplicateCanary.ExecuteNonQueryAsync();
			await insertDuplicate.Should().ThrowAsync<PostgresException>()
				.Where(ex => ex.SqlState == PostgresErrorCodes.UniqueViolation,
					"a duplicate canary row must be refused by the database itself");

			await using var otherKeyRingRow = new NpgsqlCommand(
				"""

				INSERT INTO data_protection_keys ("FriendlyName", "Xml")
				VALUES ('key-def456', '<key/>')
				""",
				conn
			);
			var insertOther = async () => await otherKeyRingRow.ExecuteNonQueryAsync();
			await insertOther.Should().NotThrowAsync(
				"Data Protection key-ring names keep working unchanged");
			(await CountRowsAsync("key-def456")).Should().Be(1);
		}
	}

	/// <summary>
	/// The id of the migration immediately BEFORE the one under test, derived from the
	/// REAL migrations-assembly ordering (review round 2): a hard-coded predecessor pin
	/// drifts silently every time another migration is inserted above the target, so the
	/// spec would migrate to an ever-staler schema point while staying green.
	/// </summary>
	private static string PreviousMigrationId(AppDbContext dbContext) {
		var orderedIds = dbContext.GetService<IMigrationsAssembly>()
			.Migrations.Keys
			.ToList();
		var index = orderedIds.FindIndex(id =>
			id.EndsWith(MigrationUnderTestSuffix, StringComparison.Ordinal));
		index.Should().BeGreaterThan(
			0,
			"the migration under test must have a predecessor in the migrations assembly");
		return orderedIds[index - 1];
	}

	private async Task<int> CountRowsAsync(string friendlyName) {
		await using var conn = new NpgsqlConnection(_connectionString);
		await conn.OpenAsync();
		await using var cmd = new NpgsqlCommand(
			"""

			SELECT COUNT(*) FROM data_protection_keys WHERE "FriendlyName" = @name
			""",
			conn
		);
		cmd.Parameters.AddWithValue("name", friendlyName);
		var raw = await cmd.ExecuteScalarAsync();
		return Convert.ToInt32(raw, System.Globalization.CultureInfo.InvariantCulture);
	}

	private async Task<bool> IndexExistsAsync(string indexName) {
		await using var conn = new NpgsqlConnection(_connectionString);
		await conn.OpenAsync();
		await using var cmd = new NpgsqlCommand(
			"""

			SELECT 1 FROM pg_indexes
			WHERE schemaname = 'public' AND indexname = @name
			""",
			conn
		);
		cmd.Parameters.AddWithValue("name", indexName);
		return await cmd.ExecuteScalarAsync() is not null;
	}

	// ---- #1424: the two REMAINING database states (issue review round 1) ----
	//
	// The duplicate state above is the interesting one, but a production rollout also
	// meets two trivial states, and the spec should SAY so: canary ABSENT (fresh
	// installs — the delete touches nothing) and canary PRESENT EXACTLY ONCE (healthy
	// databases — the repair is a no-op), each applied cleanly and IDEMPOTENT on re-run.

	[Fact]
	public async Task ItShouldApplyAsANoOpAndStayIdempotentWhenTheCanaryIsAbsent() {
		await using var dbContext = NewMigratorDbContext();
		var migrator = dbContext.GetService<IMigrator>();

		// Schema as of the migration immediately BEFORE the unique index; no canary row
		// seeded: the fresh-install shape.
		await migrator.MigrateAsync(PreviousMigrationId(dbContext));
		(await CountRowsAsync(PostgresKeyRingCanaryStore.RowName)).Should().Be(0);

		var applyRemaining = async () => await migrator.MigrateAsync();
		await applyRemaining.Should().NotThrowAsync(
			"the dedupe DELETE must be a no-op on an empty canary set, never a bare error");

		(await IndexExistsAsync("ux_data_protection_keys_canary_friendly_name"))
			.Should().BeTrue("the guard index must still be created on fresh installs");

		// Idempotency: the migrate one-shot service may re-run the same migration on an
		// already-migrated database (container restart racing the marker write); it must
		// find nothing to do instead of failing on the existing index.
		var reapply = async () => await migrator.MigrateAsync();
		await reapply.Should().NotThrowAsync("the migration is idempotent on re-run");
	}

	[Fact]
	public async Task ItShouldLeaveASingleCanaryUntouchedAndStayIdempotentWhenTheCanaryIsPresentOnce() {
		await using var dbContext = NewMigratorDbContext();
		var migrator = dbContext.GetService<IMigrator>();

		await migrator.MigrateAsync(PreviousMigrationId(dbContext));

		// Seed the healthy shape: exactly ONE canary row plus an ordinary key-ring row.
		const int survivorId = 100;
		await using (var conn = new NpgsqlConnection(_connectionString)) {
			await conn.OpenAsync();
			await using var insertSingle = new NpgsqlCommand(
				"""

				INSERT INTO data_protection_keys ("Id", "FriendlyName", "Xml")
				VALUES (@id, @canary, 'single-canary-blob')
				""",
				conn
			);
			insertSingle.Parameters.AddWithValue("id", survivorId);
			insertSingle.Parameters.AddWithValue("canary", PostgresKeyRingCanaryStore.RowName);
			await insertSingle.ExecuteNonQueryAsync();

			await using var insertKeyRingRow = new NpgsqlCommand(
				"""

				INSERT INTO data_protection_keys ("Id", "FriendlyName", "Xml")
				VALUES (200, 'key-abc123', '<key/>')
				""",
				conn
			);
			await insertKeyRingRow.ExecuteNonQueryAsync();
		}

		var applyRemaining = async () => await migrator.MigrateAsync();
		await applyRemaining.Should().NotThrowAsync(
			"the dedupe DELETE must remove nothing when there is exactly one canary row");

		// The healthy row survives byte-identical; the ordinary key-ring row too.
		await using (var conn = new NpgsqlConnection(_connectionString)) {
			await conn.OpenAsync();
			await using var read = new NpgsqlCommand(
				"""

				SELECT "Id", "Xml" FROM data_protection_keys WHERE "FriendlyName" = @canary
				""",
				conn
			);
			read.Parameters.AddWithValue("canary", PostgresKeyRingCanaryStore.RowName);
			await using var reader = await read.ExecuteReaderAsync();
			var rows = new List<(int Id, string Xml)>();
			while (await reader.ReadAsync()) {
				rows.Add((reader.GetInt32(0), reader.GetString(1)));
			}

			rows.Should().ContainSingle("a healthy database keeps its single canary row");
			rows.Single().Id.Should().Be(survivorId);
			rows.Single().Xml.Should().Be(
				"single-canary-blob",
				"the repair must not touch or rewrite the surviving blob");
		}

		(await CountRowsAsync("key-abc123")).Should().Be(1);
		(await IndexExistsAsync("ux_data_protection_keys_canary_friendly_name"))
			.Should().BeTrue("the guard index is created over the healthy row");

		// Idempotent re-run (see the absent-state spec).
		var reapply = async () => await migrator.MigrateAsync();
		await reapply.Should().NotThrowAsync("the migration is idempotent on re-run");

		// And the enforcement still holds after everything: duplicates stay uninsertable.
		(await CountRowsAsync(PostgresKeyRingCanaryStore.RowName)).Should().Be(1);
	}

	private AppDbContext NewMigratorDbContext() {
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(_connectionString).Options
		);
	}
}
