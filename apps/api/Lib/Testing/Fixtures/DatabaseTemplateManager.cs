
using System.Diagnostics;
using System.Text.RegularExpressions;

using Microsoft.EntityFrameworkCore;

using Npgsql;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Lib.Testing.Fixtures;
/// <summary>
/// Manages PostgreSQL template database creation and
/// cloning for test isolation.
///
/// The template name embeds a fingerprint of the inputs that shape it
/// (<see cref="TestDatabaseCacheKey"/>). A template whose fingerprint matches
/// is reused as-is, so a warm local run skips migrations and seeding; a
/// missing, stale or half-built template is rebuilt from scratch.
///
/// Builds take an exclusive Postgres advisory lock and clones a shared one,
/// so concurrent test processes sharing a reused container cannot race on the
/// template. The lock is keyed by the template name, so different code states
/// never block each other.
/// </summary>
internal sealed partial class DatabaseTemplateManager {
	private const string _StateTableName = "publyapp_test_template_state";
	private readonly string _AdminConnectionString;
	private readonly string _TemplateDbName;
	private readonly string _CacheKey;
	private static readonly Regex _SafeDbNameRegex = new(
		"^[a-z0-9_]+$",
		RegexOptions.Compiled | RegexOptions.CultureInvariant,
		TimeSpan.FromMilliseconds(100)
	);

	// Only allow safe DB names:
	// lowercase alphanumeric + underscores
	private static string _ValidateDbName(string name) {
		if (!DatabaseTemplateManager._SafeDbNameRegex.IsMatch(name)) {
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
		this._AdminConnectionString = adminConnectionString;
		this._CacheKey = TestDatabaseCacheKey.Key;
		this._TemplateDbName = DatabaseTemplateManager._ValidateDbName(
			$"{templateDbName}_{this._CacheKey[..12]}"
		);
	}

	/// <summary>
	/// Reuses the migrated + seeded template for the current cache key, or
	/// rebuilds it from scratch. Safe to call once per test process and
	/// concurrently from several processes.
	/// </summary>
	public async Task EnsureTemplateDatabaseAsync(
		CancellationToken ct = default
	) {
		await using var conn =
			new NpgsqlConnection(this._AdminConnectionString);
		await conn.OpenAsync(ct);
		await this.AcquireLockAsync(conn, exclusive: true, ct);
		try {
			await DatabaseTemplateManager._EnsureStateTableAsync(conn, ct);
			if (await this._IsTemplateReadyAsync(conn, ct)) {
				DatabaseTemplateManager._Log(
					$"template cache HIT key={this._CacheKey[..12]} "
					+ $"db={this._TemplateDbName}"
				);
				return;
			}

			DatabaseTemplateManager._Log(
				$"template cache MISS key={this._CacheKey[..12]} "
				+ $"— rebuilding {this._TemplateDbName}"
			);
			await this._DropTemplateAsync(conn, ct);
			await this._CreateTemplateDatabaseAsync(conn, ct);
			await this._MigrateAndSeedTemplateAsync(ct);
			await this._RecordTemplateAsync(conn, ct);
		} finally {
			await this.ReleaseLockAsync(conn, exclusive: true, ct);
		}
	}

	private async Task<bool> _IsTemplateReadyAsync(
		NpgsqlConnection conn,
		CancellationToken ct
	) {
		await using var cmd = new NpgsqlCommand(
			"SELECT EXISTS (SELECT 1 FROM pg_database "
			+ "WHERE datname = @name) "
			+ "AND EXISTS (SELECT 1 FROM "
			+ DatabaseTemplateManager._StateTableName
			+ " WHERE template_db = @name AND cache_key = @key)",
			conn
		);
		cmd.Parameters.AddWithValue("name", this._TemplateDbName);
		cmd.Parameters.AddWithValue("key", this._CacheKey);
		return await cmd.ExecuteScalarAsync(ct) is true;
	}

	private static async Task _EnsureStateTableAsync(
		NpgsqlConnection conn,
		CancellationToken ct
	) {
		await using var cmd = new NpgsqlCommand(
			$"CREATE TABLE IF NOT EXISTS "
			+ DatabaseTemplateManager._StateTableName
			+ " (template_db text PRIMARY KEY, "
			+ "cache_key text NOT NULL, "
			+ "created_at timestamptz NOT NULL DEFAULT now())",
			conn
		);
		await cmd.ExecuteNonQueryAsync(ct);
	}

	private async Task _RecordTemplateAsync(
		NpgsqlConnection conn,
		CancellationToken ct
	) {
		await using var cmd = new NpgsqlCommand(
			$"INSERT INTO {DatabaseTemplateManager._StateTableName} "
			+ "(template_db, cache_key) VALUES (@name, @key) "
			+ "ON CONFLICT (template_db) DO UPDATE "
			+ "SET cache_key = EXCLUDED.cache_key, created_at = now()",
			conn
		);
		cmd.Parameters.AddWithValue("name", this._TemplateDbName);
		cmd.Parameters.AddWithValue("key", this._CacheKey);
		await cmd.ExecuteNonQueryAsync(ct);
	}

	private async Task _DropTemplateAsync(
		NpgsqlConnection conn,
		CancellationToken ct
	) {
		// A half-built template from an interrupted run must not survive.
		await using var terminate = new NpgsqlCommand(
			"SELECT pg_terminate_backend(pg_stat_activity.pid) "
			+ "FROM pg_stat_activity "
			+ "WHERE pg_stat_activity.datname = @name "
			+ "AND pid <> pg_backend_pid()",
			conn
		);
		terminate.Parameters.AddWithValue("name", this._TemplateDbName);
		await terminate.ExecuteNonQueryAsync(ct);

		await using var drop = new NpgsqlCommand(
			$"DROP DATABASE IF EXISTS {this._TemplateDbName}",
			conn
		);
		await drop.ExecuteNonQueryAsync(ct);

		await using var forget = new NpgsqlCommand(
			$"DELETE FROM {DatabaseTemplateManager._StateTableName} "
			+ "WHERE template_db = @name",
			conn
		);
		forget.Parameters.AddWithValue("name", this._TemplateDbName);
		await forget.ExecuteNonQueryAsync(ct);
	}

	private async Task _CreateTemplateDatabaseAsync(
		NpgsqlConnection conn,
		CancellationToken ct
	) {
		// CREATE DATABASE does not support parameters for
		// identifiers — validated via regex above
		await using var cmd = new NpgsqlCommand(
			$"CREATE DATABASE {this._TemplateDbName}",
			conn
		);
		await cmd.ExecuteNonQueryAsync(ct);
	}

	private async Task _MigrateAndSeedTemplateAsync(
		CancellationToken ct
	) {
		try {
			var templateConnString =
				new NpgsqlConnectionStringBuilder(
					this._AdminConnectionString
				) {
					Database = this._TemplateDbName
				}.ConnectionString;

			var options =
				new DbContextOptionsBuilder<AppDbContext>()
					.UseNpgsql(templateConnString)
					.Options;

			await using var dbContext =
				new AppDbContext(options);

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
				+ $"'{this._TemplateDbName}'. Check that Docker is "
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
		DatabaseTemplateManager._ValidateDbName(dbName);

		await using (var conn =
			new NpgsqlConnection(this._AdminConnectionString)) {
			await conn.OpenAsync(ct);
			await this.AcquireLockAsync(conn, exclusive: false, ct);
			try {
				// CREATE DATABASE does not support parameters for
				// identifiers — validated via regex above
				await using var createCmd = new NpgsqlCommand(
					$"CREATE DATABASE {dbName} "
					+ $"TEMPLATE {this._TemplateDbName}",
					conn
				);
				var startedAt = Stopwatch.GetTimestamp();
				await createCmd.ExecuteNonQueryAsync(ct);
				TestDbTimings.RecordClone(startedAt);
			} catch (Exception ex) {
				throw new InvalidOperationException(
					$"Failed to clone template "
					+ $"'{this._TemplateDbName}' to '{dbName}'.",
					ex
				);
			} finally {
				await this.ReleaseLockAsync(conn, exclusive: false, ct);
			}
		}

		// Pooling=false to avoid pool issues when dropping
		var builder = new NpgsqlConnectionStringBuilder(
			this._AdminConnectionString
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
		DatabaseTemplateManager._ValidateDbName(dbName);
		var startedAt = Stopwatch.GetTimestamp();

		// Clear all connection pools to release connections.
		// Process-wide but acceptable in test context since
		// all test DB connections use Pooling=false anyway.
		NpgsqlConnection.ClearAllPools();

		try {
			await using var conn =
				new NpgsqlConnection(this._AdminConnectionString);
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
			TestDbTimings.RecordDrop(startedAt);
		} catch (Exception ex) {
			throw new InvalidOperationException(
				$"Failed to drop test database '{dbName}'.",
				ex
			);
		}
	}

	internal async Task AcquireLockAsync(
		NpgsqlConnection conn,
		bool exclusive,
		CancellationToken ct
	) {
		var function = exclusive
			? "pg_advisory_lock"
			: "pg_advisory_lock_shared";
		await using var cmd = new NpgsqlCommand(
			$"SELECT {function}(hashtextextended(@name, 0))",
			conn
		);
		// The wait is bounded by the lock holder's build, not by Npgsql's
		// default 30 s command timeout: a cold template build can take
		// minutes, and killing the waiter turns a slow build into a red run.
		cmd.CommandTimeout = 0;
		cmd.Parameters.AddWithValue("name", this._TemplateDbName);
		await cmd.ExecuteNonQueryAsync(ct);
	}

	internal async Task ReleaseLockAsync(
		NpgsqlConnection conn,
		bool exclusive,
		CancellationToken ct
	) {
		var function = exclusive
			? "pg_advisory_unlock"
			: "pg_advisory_unlock_shared";
		try {
			await using var cmd = new NpgsqlCommand(
				$"SELECT {function}(hashtextextended(@name, 0))",
				conn
			);
			cmd.Parameters.AddWithValue("name", this._TemplateDbName);
			await cmd.ExecuteNonQueryAsync(ct);
		} catch (NpgsqlException) {
			// Closing the connection releases the session lock anyway.
		}
	}

	private static void _Log(string message) {
		var line = $"{DateTime.UtcNow:O} [test-db] {message}";
		Console.Error.WriteLine(line);
		try {
			var directory = Path.Combine(
				TestDatabaseReuse.RepoRoot,
				"apps",
				"api",
				".artifacts",
				"logs"
			);
			Directory.CreateDirectory(directory);
			File.AppendAllText(
				Path.Combine(directory, "test-db.log"),
				line + Environment.NewLine
			);
		} catch (Exception ex) when (
			ex is IOException or UnauthorizedAccessException
		) {
			// Logging must never break a test run.
		}
	}
}
