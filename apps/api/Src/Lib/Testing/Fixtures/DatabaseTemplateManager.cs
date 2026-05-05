namespace MainApi.Src.Lib.Testing.Fixtures;

using System.Text.RegularExpressions;

using MainApi.Src.Data.DbContext;

using Microsoft.EntityFrameworkCore;

using Npgsql;

/// <summary>
/// Manages PostgreSQL template database creation and
/// cloning for test isolation.
/// </summary>
internal sealed partial class DatabaseTemplateManager {
	private readonly string _adminConnectionString;
	private readonly string _templateDbName;
	private static readonly Regex SafeDbNameRegex = new(
		"^[a-z0-9_]+$",
		RegexOptions.Compiled | RegexOptions.CultureInvariant,
		TimeSpan.FromMilliseconds(100)
	);

	// Only allow safe DB names:
	// lowercase alphanumeric + underscores
	private static string ValidateDbName(string name) {
		if (!SafeDbNameRegex.IsMatch(name)) {
			throw new ArgumentException(
				$"Invalid database name: '{name}'. "
				+ "Only lowercase alphanumeric and "
				+ "underscores allowed."
			);
		}
		return name;
	}

	public DatabaseTemplateManager(
		string adminConnectionString,
		string templateDbName
	) {
		_adminConnectionString = adminConnectionString;
		_templateDbName = ValidateDbName(templateDbName);
	}

	/// <summary>
	/// Creates the template database and runs
	/// EF migrations + seeding.
	/// Should be called once per test run.
	/// </summary>
	public async Task EnsureTemplateDatabaseAsync(
		CancellationToken ct = default
	) {
		try {
			await using var conn =
				new NpgsqlConnection(_adminConnectionString);
			await conn.OpenAsync(ct);

			// Parameterized query for existence check
			var checkCmd = new NpgsqlCommand(
				"SELECT 1 FROM pg_database "
				+ "WHERE datname = @name",
				conn
			);
			checkCmd.Parameters.AddWithValue(
				"name", _templateDbName
			);
			var exists =
				await checkCmd.ExecuteScalarAsync(ct) is not null;

			if (!exists) {
				// CREATE DATABASE does not support parameters
				// for identifiers — validated via regex above
				var createCmd = new NpgsqlCommand(
					$"CREATE DATABASE {_templateDbName}",
					conn
				);
				await createCmd.ExecuteNonQueryAsync(ct);
			}

			var templateConnString =
				new NpgsqlConnectionStringBuilder(
					_adminConnectionString
				) {
					Database = _templateDbName
				}.ConnectionString;

			var options =
				new DbContextOptionsBuilder<MainApiDbContext>()
					.UseNpgsql(templateConnString)
					.Options;

			await using var dbContext =
				new MainApiDbContext(options);

			// 1) Apply migrations (schema changes).
			//    MigrateAsync does NOT trigger UseSeeding hooks.
			await dbContext.Database.MigrateAsync(ct);

			// 2) Trigger UseSeeding / UseAsyncSeeding hooks.
			//    EF Core 9+: EnsureCreatedAsync runs seeding
			//    even when DB already exists. This is the ONLY
			//    way to invoke UseSeeding after MigrateAsync.
			//    Both calls are required:
			//    - MigrateAsync: schema via migrations
			//    - EnsureCreatedAsync: seeder hooks
			//    Removing either breaks the template.
			await dbContext.Database.EnsureCreatedAsync(ct);

			// 3) Fail fast if seeding didn't run.
			//    Without this check, missing seed data
			//    surfaces as confusing 400/401 test failures.
			var hasSeededUser = await dbContext.User
				.IgnoreQueryFilters()
				.AnyAsync(
					u => u.Email == TestConstants.StaffAdminEmail,
					ct
				);

			if (!hasSeededUser) {
				throw new InvalidOperationException(
					"Template database seeding did not run "
					+ "(or seed/test data drifted). Expected "
					+ $"seeded user '{TestConstants.StaffAdminEmail}'"
					+ " was not found. If seeders changed, "
					+ "update SeedConstants."
				);
			}
		} catch (Exception ex) when (
			ex is not InvalidOperationException
		) {
			throw new InvalidOperationException(
				"Failed to create/migrate template database "
				+ $"'{_templateDbName}'. Check that Docker is "
				+ "running and migrations are up to date.",
				ex
			);
		}
	}

	/// <summary>
	/// Creates a new database by cloning the template.
	/// Returns the connection string for the new database.
	/// </summary>
	public async Task<string>
	CreateDatabaseFromTemplateAsync(
		string dbName,
		CancellationToken ct = default
	) {
		ValidateDbName(dbName);

		try {
			await using var conn =
				new NpgsqlConnection(_adminConnectionString);
			await conn.OpenAsync(ct);

			// CREATE DATABASE does not support parameters for
			// identifiers — validated via regex above
			var createCmd = new NpgsqlCommand(
				$"CREATE DATABASE {dbName} "
				+ $"TEMPLATE {_templateDbName}",
				conn
			);
			await createCmd.ExecuteNonQueryAsync(ct);
		} catch (Exception ex) {
			throw new InvalidOperationException(
				$"Failed to clone template '{_templateDbName}' "
				+ $"to '{dbName}'.",
				ex
			);
		}

		// Pooling=false to avoid pool issues when dropping
		var builder = new NpgsqlConnectionStringBuilder(
			_adminConnectionString
		) {
			Database = dbName,
			Pooling = false
		};

		return builder.ConnectionString;
	}

	/// <summary>
	/// Drops a test database.
	/// Terminates active connections first to avoid
	/// "database is being accessed" errors.
	/// </summary>
	public async Task DropDatabaseAsync(
		string dbName,
		CancellationToken ct = default
	) {
		ValidateDbName(dbName);

		// Clear all connection pools to release connections.
		// Process-wide but acceptable in test context since
		// all test DB connections use Pooling=false anyway.
		NpgsqlConnection.ClearAllPools();

		try {
			await using var conn =
				new NpgsqlConnection(_adminConnectionString);
			await conn.OpenAsync(ct);

			// Terminate connections — parameterized where
			// clause for the data comparison
			var terminateCmd = new NpgsqlCommand(
				"SELECT pg_terminate_backend("
				+ "pg_stat_activity.pid) "
				+ "FROM pg_stat_activity "
				+ "WHERE pg_stat_activity.datname = @name "
				+ "AND pid <> pg_backend_pid()",
				conn
			);
			terminateCmd.Parameters.AddWithValue("name", dbName);
			await terminateCmd.ExecuteNonQueryAsync(ct);

			// DROP DATABASE does not support parameters for
			// identifiers — validated via regex above
			var dropCmd = new NpgsqlCommand(
				$"DROP DATABASE IF EXISTS {dbName}",
				conn
			);
			await dropCmd.ExecuteNonQueryAsync(ct);
		} catch (Exception ex) {
			throw new InvalidOperationException(
				$"Failed to drop test database '{dbName}'.",
				ex
			);
		}
	}
}
