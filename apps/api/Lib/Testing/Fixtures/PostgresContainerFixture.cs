
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using Testcontainers.PostgreSql;

namespace MainApi.Lib.Testing.Fixtures;
/// <summary>
/// Manages a shared Postgres container for the entire test
/// run. Uses static lazy initialization so test classes can
/// run in parallel without a serializing xUnit collection.
///
/// Container cleanup is handled by Testcontainers Ryuk
/// (sidecar container that stops/removes containers when the
/// parent process exits).
///
/// Usage: await PostgresContainerFixture.GetSharedAsync()
/// from ApiFixture.InitializeAsync().
/// </summary>
public sealed class PostgresContainerFixture {
	private static readonly SemaphoreSlim _initLock =
		new(1, 1);
	private static PostgresContainerFixture? _sharedInstance;

	// Keep container reference alive for process lifetime
	private PostgreSqlContainer? _container;

	public string AdminConnectionString { get; private set; }
		= string.Empty;
	public string TemplateDbName { get; } = "mainapi_template";

	private PostgresContainerFixture() { }

	private PostgreSqlContainer Container {
		get {
			if (_container is null) {
				throw new InvalidOperationException("Postgres container has not been initialized.");
			}

			return _container;
		}
	}

	/// <summary>
	/// Returns the shared fixture instance, initializing
	/// the container + template DB on first call.
	/// Thread-safe: concurrent callers block until init
	/// completes, then all get the same instance.
	/// </summary>
	public static async Task<PostgresContainerFixture>
	GetSharedAsync() {
		var instance = Volatile.Read(ref _sharedInstance);
		if (instance is not null) {
			return instance;
		}

		await _initLock.WaitAsync();
		try {
			instance = Volatile.Read(ref _sharedInstance);
			if (instance is not null) {
				return instance;
			}

			var fixture = new PostgresContainerFixture();
			await fixture.InitializeAsync();
			Volatile.Write(ref _sharedInstance, fixture);
			return fixture;
		} finally {
			_initLock.Release();
		}
	}

	private async Task InitializeAsync() {
		// Use Testcontainers default wait strategy (more
		// robust than UntilPortIsAvailable — waits for
		// pg_isready or equivalent health check)
		var containerBuilder = new PostgreSqlBuilder()
			.WithImage("postgres:18-alpine")
			.WithDatabase("postgres")
			.WithUsername("postgres")
			.WithPassword("postgres");

		if (!AppEnvironment.IsTestVerboseLoggingEnabled) {
			containerBuilder = containerBuilder
				.WithLogger(NullLogger.Instance);
		}

		_container = containerBuilder.Build();
		var container = Container;

		try {
			await container.StartAsync();
		} catch (Exception ex) {
			throw new InvalidOperationException(
				"Failed to start Postgres container. "
				+ "Is Docker running? "
				+ "Try: docker info",
				ex
			);
		}

		// Pooling=false on admin connection to avoid pool
		// issues during CREATE/DROP DATABASE
		var adminConnBuilder = new NpgsqlConnectionStringBuilder(
			container.GetConnectionString()
		) {
			Pooling = false
		};
		AdminConnectionString =
			adminConnBuilder.ConnectionString;

		try {
			TestEnvironment.InitializeOnce(AdminConnectionString);

			var manager = new DatabaseTemplateManager(
				AdminConnectionString,
				TemplateDbName
			);
			await manager.EnsureTemplateDatabaseAsync();
		} catch {
			// Dispose container immediately on init failure
			// rather than relying on Ryuk — keeps repeated
			// local runs clean and avoids stale containers
			// when Ryuk is disabled.
			try {
				await container.DisposeAsync();
			} catch {
				// best-effort
			}
			throw;
		}
	}
}
